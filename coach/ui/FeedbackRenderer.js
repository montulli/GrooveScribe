import { DrumType } from '../engine/DrumConstants.js';

// Set to true to render debug grid overlay (measure boundaries, note positions, staff lines)
export const SHOW_DEBUG = true;


/**
 * FeedbackRenderer - Draws feedback circles on notation staff 
 * using coordinates extracted by ScoreLayout.
 *
 * Multi-system aware: each visual system (line of music) may live in its
 * own SVG element. The renderer creates a feedback layer in each SVG and
 * maps staffs to their SVG by index order.
 *
 * Expects sniffedData in the multi-staff format:
 * { verticalStep, staffs: [{ topY, notes: [{x, y, abcIndex, isGrace}], boundaries: [{x}] }] }
 */
export class FeedbackRenderer {
    constructor(svgContainerSelector) {
        this.svgContainerSelector = svgContainerSelector;
        this.svgLayers = [];     // [{svg, layer}, ...] one per SVG element

        this.grooveContext = null;
        this.verticalStep = 4.5; // Default step (6pt * 0.75 scale)
        this.staffs = [];        // Per-staff rendering data: [{ topY, timeline, measureBoundaries, layerIndex }]
        this.sniffedData = null;
    }

    init() {
        this.ensureLayers();
    }

    /**
     * Ensures feedback layers exist in all SVGs within the container.
     * Must be called before any drawing operation as the SVGs may have been re-rendered.
     */
    ensureLayers() {
        const container = document.querySelector(this.svgContainerSelector);
        if (!container) return false;

        const svgs = container.querySelectorAll('svg');
        if (svgs.length === 0) return false;

        this.svgLayers = [];

        svgs.forEach((svg) => {
            svg.style.overflow = 'visible';
            let layer = svg.querySelector('#coach-feedback-layer');
            if (!layer) {
                layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                layer.setAttribute('id', 'coach-feedback-layer');
                svg.appendChild(layer);
            }
            this.svgLayers.push({ svg, layer });
        });

        console.log(`[FeedbackRenderer] Ensured ${this.svgLayers.length} feedback layer(s)`);
        return true;
    }

    /**
     * Clear all feedback markers in all layers
     */
    clearFeedback() {
        for (const { layer } of this.svgLayers) {
            layer.querySelectorAll('.coach-hit-marker').forEach(el => el.remove());
        }
    }

    /**
     * Set context and build coordinate timeline from sniffed data
     */
    setGrooveContext(context, timeline, sniffedData = null) {
        this.grooveContext = context;
        this.sniffedData = sniffedData;
        this.staffs = [];

        if (!this.ensureLayers()) return;

        // Extract verticalStep from sniffed data
        if (sniffedData && sniffedData.verticalStep) {
            this.verticalStep = sniffedData.verticalStep;
        }

        const bpm = context.bpm || 80;
        const numBeats = context.numBeats || 4;
        const measures = context.measures || 1;

        const measureDurationMs = (60000 / bpm) * numBeats;
        this.grooveContext.totalDurationMs = measureDurationMs * measures;

        // Build per-staff rendering data
        if (sniffedData && sniffedData.staffs) {
            for (let staffIdx = 0; staffIdx < sniffedData.staffs.length; staffIdx++) {
                const staff = sniffedData.staffs[staffIdx];

                // Map staff to SVG layer by its svgIndex (from ScoreLayout)
                // svgIndex tells us which DOM SVG element this staff lives in
                const layerIndex = (staff.svgIndex !== undefined)
                    ? Math.min(staff.svgIndex, this.svgLayers.length - 1)
                    : Math.min(staffIdx, this.svgLayers.length - 1);

                const staffData = {
                    topY: staff.topY,
                    layerIndex: layerIndex,
                    measureOffset: staff.measureOffset || 0,
                    timeline: [],
                    measureBoundaries: []
                };

                // 1. Build Measure Boundaries
                for (let m = 0; m <= measures; m++) {
                    staffData.measureBoundaries.push({
                        timeMs: m * measureDurationMs,
                        measureIndex: m,
                        x: null
                    });
                }
                this._assignBoundaryPositions(staffData.measureBoundaries, staff.boundaries);

                // 2. Build timeline by matching sniffed notes to engine timeline
                if (staff.notes && timeline && timeline.length > 0) {
                    // Grace notes match positionally (abc2svg assigns them
                    // a different abcIndex than _refreshAbcMapping does).
                    const sniffedGraces = staff.notes.filter(n => n.isGrace);
                    let graceIdx = 0;

                    for (const note of timeline) {
                        let sniffed;
                        if (note.isGrace) {
                            // Match Nth timeline grace → Nth sniffed grace
                            sniffed = sniffedGraces[graceIdx++];
                        } else {
                            sniffed = staff.notes.find(n =>
                                n.abcIndex === note.abcIndex && !n.isGrace
                            );
                        }

                        if (sniffed) {
                            staffData.timeline.push({
                                timeMs: note.time,
                                tickIndex: note.tickIndex,
                                type: note.isGrace ? DrumType.FLAM_GRACE : note.type,
                                abcIndex: sniffed.abcIndex,
                                x: sniffed.x,
                                y: sniffed.y,
                                isGrace: !!note.isGrace
                            });
                        }
                    }
                    staffData.timeline.sort((a, b) => a.timeMs - b.timeMs);
                }

                this.staffs.push(staffData);
            }
        }

        if (timeline && timeline.length > 0 && this.staffs.length === 0) {
            console.warn('[FeedbackRenderer] Missing sniffedData. Hit feedback disabled.');
        }

        if (SHOW_DEBUG) {
            this.renderDebugGrid();
        }
    }

    /**
     * Assign X positions to measure boundaries from sniffed boundary data.
     * The sniffed boundaries arrive sorted by X: [M0 (from header), bar1, bar2, ...].
     * We assign them to measure boundaries by index.
     */
    _assignBoundaryPositions(measureBoundaries, sniffedBoundaries) {
        if (!sniffedBoundaries || sniffedBoundaries.length === 0) return;

        const sorted = [...sniffedBoundaries].sort((a, b) => a.x - b.x);

        for (let i = 0; i < measureBoundaries.length; i++) {
            if (i < sorted.length) {
                measureBoundaries[i].x = sorted[i].x;
            }
        }
    }

    /**
     * Draw feedback for a hit
     */
    drawHitFeedbackByTime(hitTimeMs, tier, timingError, drumType, abcNoteIndex = null) {
        if (this.staffs.length === 0) return;

        const isGrace = (drumType === DrumType.FLAM_GRACE);

        // Search across all staffs for matching note
        let note = null;
        let targetLayerIndex = 0;
        for (const staff of this.staffs) {
            note = staff.timeline.find(n =>
                Math.abs(n.timeMs - hitTimeMs) < 15 &&
                n.isGrace === isGrace &&
                (abcNoteIndex === null || n.abcIndex === abcNoteIndex)
            );
            if (note) {
                targetLayerIndex = staff.layerIndex;
                break;
            }
        }

        if (!note) {
            if (tier === 'extra') {
                this._drawExtraHit(hitTimeMs, drumType);
            }
            return;
        }

        // Timing-based visual offset
        const pixelsPerMs = 0.15;
        const clampLimit = { perfect: 3, good: 8, close: 12, extra: 50 }[tier] || 0;
        let xOffset = timingError * pixelsPerMs;
        if (tier !== 'extra') {
            xOffset = Math.max(-clampLimit, Math.min(clampLimit, xOffset));
            if (tier === 'perfect' && Math.abs(timingError) < 8) xOffset = 0;
        }

        this._drawCircle(note.x + xOffset, note.y, tier, targetLayerIndex);
    }

    _drawExtraHit(hitTimeMs, drumType) {
        const x = this._interpolateX(hitTimeMs);
        if (x === null) return;
        const { y, layerIndex } = this._guessYForDrum(drumType);
        this._drawCircle(x, y, 'extra', layerIndex);
    }

    _interpolateX(hitTimeMs) {
        if (!this.grooveContext || this.staffs.length === 0) return null;

        // Search across all staffs' boundaries
        for (const staff of this.staffs) {
            let left = null, right = null;
            for (const b of staff.measureBoundaries) {
                if (b.x === null) continue;
                if (b.timeMs <= hitTimeMs) left = b;
                else if (b.timeMs > hitTimeMs && !right) { right = b; break; }
            }
            if (left && right) {
                const ratio = (hitTimeMs - left.timeMs) / (right.timeMs - left.timeMs);
                return left.x + ratio * (right.x - left.x);
            }
        }
        return null;
    }

    _guessYForDrum(drumType) {
        if (this.staffs.length === 0) return { y: 100, layerIndex: 0 };
        const staffY = this.staffs[0].topY;
        const step = this.verticalStep;

        // Map drum types to relative grid steps from Top Line (0)
        const drumOffsets = {
            [DrumType.KICK]: 12, [DrumType.SNARE]: 8, [DrumType.SNARE_FLAM]: 8, [DrumType.FLAM_GRACE]: 8,
            [DrumType.HH_CLOSED]: 4, [DrumType.HH_OPEN]: 4, [DrumType.HH_FOOT]: 14,
            [DrumType.TOM_HIGH]: 6, [DrumType.TOM_LOW]: 10, [DrumType.CRASH]: 2, [DrumType.RIDE]: 3
        };
        const levelIdx = drumOffsets[drumType] !== undefined ? drumOffsets[drumType] : 8;
        const relativeStep = levelIdx - 4;

        return { y: staffY + (relativeStep * step), layerIndex: 0 };
    }

    _drawCircle(x, y, tier, layerIndex = 0) {
        const layer = this.svgLayers[layerIndex]?.layer;
        if (!layer) return;

        const colors = { perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888' };
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', tier === 'extra' ? '4' : '6');
        circle.setAttribute('fill', colors[tier] || colors.extra);
        circle.setAttribute('fill-opacity', '0.7');
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('style', 'pointer-events: none;');
        circle.classList.add('coach-hit-marker');

        layer.appendChild(circle);

        circle.animate([{ scale: 0.5, opacity: 0 }, { scale: 1, opacity: 0.7 }], { duration: 150 });
        setTimeout(() => {
            circle.style.transition = 'opacity 0.6s ease-out';
            circle.style.opacity = '0';
            setTimeout(() => circle.remove(), 600);
        }, 2000);
    }

    renderDebugGrid() {
        // Clear all debug elements from all layers
        for (const { layer } of this.svgLayers) {
            layer.querySelectorAll('.coach-debug-line').forEach(el => el.remove());
        }

        const step = this.verticalStep;

        // Render debug grid for each staff in its correct SVG layer
        for (const staff of this.staffs) {
            const layer = this.svgLayers[staff.layerIndex]?.layer;
            if (!layer) continue;

            const staffY = staff.topY;

            // Clamp range: 3 lines above staff (-3) to 2 lines below staff (6)
            const clampTop = staffY + (-3 * step);
            const clampBottom = staffY + (6 * step);

            // Measure boundaries (Blue) - clamped
            staff.measureBoundaries.forEach((b) => {
                if (b.x === null) return;
                const line = this._createDebugLine(b.x, 'blue', '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Measure label at top of clamped area (continuous across systems)
                this._addDebugText(b.x, clampTop - 1, `M${staff.measureOffset + b.measureIndex}`, 'blue', '6px', layer);
            });

            // Notes from timeline (Red dots/lines) - clamped
            staff.timeline.forEach((n) => {
                if (n.x === null) return;
                const color = n.isGrace ? '#FF00FF' : '#FF0000';
                const line = this._createDebugLine(n.x, color, '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Note index label (skip for grace notes — they use abc2svg's own index)
                if (!n.isGrace) {
                    this._addDebugText(n.x, clampTop - 1, `${n.abcIndex}`, 'red', '6px', layer);
                }
            });

            // Horizontal lines: 3 above (-3 to -1), staff (0 to 4), 2 below (5 to 6)
            for (let i = -3; i <= 6; i++) {
                const y = staffY + (i * step);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', 0); line.setAttribute('y1', y);
                line.setAttribute('x2', 2000); line.setAttribute('y2', y);

                const isStaffEdge = (i === 0 || i === 4);
                line.setAttribute('stroke', isStaffEdge ? 'orange' : 'green');
                line.setAttribute('stroke-width', '0.25');
                line.setAttribute('opacity', '1.0');
                line.classList.add('coach-debug-line');
                layer.appendChild(line);

                if (i >= 0 && i <= 4) {
                    this._addDebugText(-5, y + 1.5, `${i}`, isStaffEdge ? 'orange' : 'green', '4px', layer);
                }
            }
        }
    }

    _addDebugText(x, y, str, color, fontSize = '5px', layer = null) {
        if (!layer && this.svgLayers.length > 0) layer = this.svgLayers[0].layer;
        if (!layer) return;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('fill', color);
        text.setAttribute('font-size', fontSize);

        // Add white outline for contrast using paint-order
        text.setAttribute('stroke', 'white');
        text.setAttribute('stroke-width', '1.5px');
        text.style.paintOrder = 'stroke';
        text.style.strokeLinecap = 'round';
        text.style.strokeLinejoin = 'round';

        text.style.fontFamily = 'monospace';
        text.style.fontWeight = 'bold';
        text.style.textAnchor = 'middle';
        text.textContent = str;
        text.classList.add('coach-debug-line');
        layer.appendChild(text);
    }

    _createDebugLine(x, color, opacity, y1 = -1000, y2 = 1000) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('y1', y1);
        line.setAttribute('x2', x); line.setAttribute('y2', y2);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', '0.5');
        line.setAttribute('opacity', opacity);
        line.classList.add('coach-debug-line');
        return line;
    }
}
