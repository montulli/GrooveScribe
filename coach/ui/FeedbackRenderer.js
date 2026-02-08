import { DrumType } from '../engine/DrumConstants.js';

// Set to true to render debug grid overlay (measure boundaries, note positions, staff lines)
export const SHOW_DEBUG = true;

// Timing threshold (ms) for matching a MIDI hit to a timeline note position
const HIT_TIME_MATCH_TOLERANCE_MS = 15;

// Per-tier visual offset clamp limits (px) — constrains how far a feedback
// circle shifts horizontally from the target note to reflect timing error
const TIER_CLAMP_LIMITS = { perfect: 3, good: 8, close: 12, extra: 50 };

// Tier colors for hit feedback circles
const TIER_COLORS = { perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888' };


/**
 * FeedbackRenderer - Draws feedback circles on notation staff 
 * using coordinates extracted by ScoreLayout.
 *
 * Multi-system aware: each visual system (line of music) may live in its
 * own SVG element. The renderer creates a feedback layer in each SVG and
 * maps systems to their SVG by index order.
 *
 * Expects sniffedData in the multi-system format:
 * { verticalStep, systems: [{ topY, chords: [{x, abcIndex, isGrace}], measureBoundaries: [{x}], noteYs: {} }] }
 */
export class FeedbackRenderer {
    constructor(svgContainerSelector) {
        this.svgContainerSelector = svgContainerSelector;
        this.svgLayers = [];     // [{svg, layer}, ...] one per SVG element

        this.grooveContext = null;
        this.verticalStep = 4.5; // Default step (6pt * 0.75 scale)
        this.systems = [];       // Per-system rendering data: [{ topY, timeline, measureBoundaries, layerIndex }]
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
        this.systems = [];

        if (!this.ensureLayers()) return;

        // Extract verticalStep from sniffed data
        if (sniffedData && sniffedData.verticalStep) {
            this.verticalStep = sniffedData.verticalStep;
        }

        if (!context.bpm || !context.numBeats || !context.measures) {
            console.error('[FeedbackRenderer] Invalid groove context:', context);
            return;
        }

        const bpm = context.bpm;
        const numBeats = context.numBeats;
        const measures = context.measures;

        const measureDurationMs = (60000 / bpm) * numBeats;
        this.grooveContext.totalDurationMs = measureDurationMs * measures;
        const step = this.verticalStep;

        // Build per-system rendering data
        if (sniffedData && sniffedData.systems) {
            for (let sysIdx = 0; sysIdx < sniffedData.systems.length; sysIdx++) {
                const system = sniffedData.systems[sysIdx];

                // Map system to SVG layer by its svgIndex (from ScoreLayout)
                // svgIndex tells us which DOM SVG element this system lives in
                const layerIndex = (system.svgIndex !== undefined)
                    ? Math.min(system.svgIndex, this.svgLayers.length - 1)
                    : Math.min(sysIdx, this.svgLayers.length - 1);

                const systemData = {
                    topY: system.topY,
                    layerIndex: layerIndex,
                    measureOffset: system.measureOffset,
                    noteYs: system.noteYs,  // DrumType → SVG Y (from ScoreLayout)
                    timeline: [],
                    measureBoundaries: []
                };

                // 1. Build Measure Boundaries
                for (let m = 0; m <= measures; m++) {
                    systemData.measureBoundaries.push({
                        timeMs: m * measureDurationMs,
                        measureIndex: m,
                        x: null
                    });
                }
                this._assignBoundaryPositions(systemData.measureBoundaries, system.measureBoundaries);

                // 2. Build timeline by matching sniffed chords to engine timeline
                if (system.chords && timeline && timeline.length > 0) {
                    // Grace notes match positionally (abc2svg assigns them
                    // a different abcIndex than _refreshAbcMapping does).
                    const sniffedGraces = system.chords.filter(n => n.isGrace);
                    let graceIdx = 0;

                    for (const note of timeline) {
                        let sniffed;
                        if (note.isGrace) {
                            // Match Nth timeline grace → Nth sniffed grace
                            sniffed = sniffedGraces[graceIdx++];
                        } else {
                            sniffed = system.chords.find(n =>
                                n.abcIndex === note.abcIndex && !n.isGrace
                            );
                        }

                        if (sniffed) {
                            const noteType = note.isGrace ? DrumType.FLAM_GRACE : note.type;
                            const noteY = systemData.noteYs[noteType];
                            if (noteY === undefined) continue; // skip unknown drum types
                            systemData.timeline.push({
                                timeMs: note.time,
                                tickIndex: note.tickIndex,
                                type: noteType,
                                abcIndex: sniffed.abcIndex,
                                x: sniffed.x,
                                y: noteY,
                                isGrace: !!note.isGrace
                            });
                        }
                    }
                    systemData.timeline.sort((a, b) => a.timeMs - b.timeMs);
                }

                this.systems.push(systemData);
            }
        }

        if (timeline && timeline.length > 0 && this.systems.length === 0) {
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
        if (this.systems.length === 0) return;

        const isGrace = (drumType === DrumType.FLAM_GRACE);

        // Search across all systems for matching note
        let note = null;
        let targetLayerIndex = 0;
        for (const sys of this.systems) {
            note = sys.timeline.find(n =>
                Math.abs(n.timeMs - hitTimeMs) < HIT_TIME_MATCH_TOLERANCE_MS &&
                n.isGrace === isGrace &&
                (abcNoteIndex === null || n.abcIndex === abcNoteIndex)
            );
            if (note) {
                targetLayerIndex = sys.layerIndex;
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
        const clampLimit = TIER_CLAMP_LIMITS[tier];
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
        const pos = this._guessYForDrum(drumType);
        if (!pos) return;
        this._drawCircle(x, pos.y, 'extra', pos.layerIndex);
    }

    _interpolateX(hitTimeMs) {
        if (!this.grooveContext || this.systems.length === 0) return null;

        // Search across all systems' boundaries
        for (const sys of this.systems) {
            let left = null, right = null;
            for (const b of sys.measureBoundaries) {
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
        if (this.systems.length === 0) return null;
        const sys = this.systems[0];
        const y = sys.noteYs[drumType];
        if (y === undefined) {
            console.warn(`[FeedbackRenderer] Unknown drumType for Y lookup: ${drumType}`);
            return null;
        }
        return { y, layerIndex: 0 };
    }

    _drawCircle(x, y, tier, layerIndex = 0) {
        const layer = this.svgLayers[layerIndex]?.layer;
        if (!layer) return;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', tier === 'extra' ? '4' : '6');
        circle.setAttribute('fill', TIER_COLORS[tier]);
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

        // Render debug grid for each system in its correct SVG layer
        for (const sys of this.systems) {
            const layer = this.svgLayers[sys.layerIndex]?.layer;
            if (!layer) continue;

            const staffY = sys.topY;

            // Clamp range: 4 lines above staff (-4) to 1 line below staff (5)
            const clampTop = staffY + (-4 * step);
            const clampBottom = staffY + (5 * step);

            // Measure boundaries (Blue) - clamped
            sys.measureBoundaries.forEach((b) => {
                if (b.x === null) return;
                const line = this._createDebugLine(b.x, 'blue', '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Measure label at top of clamped area (continuous across systems)
                this._addDebugText(b.x, clampTop - 1, `M${sys.measureOffset + b.measureIndex}`, 'blue', '6px', layer);
            });

            // Notes from timeline (Red dots/lines) - clamped
            sys.timeline.forEach((n) => {
                if (n.x === null) return;
                const color = n.isGrace ? '#FF00FF' : '#FF0000';
                const line = this._createDebugLine(n.x, color, '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Small circle at note center
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', n.x);
                circle.setAttribute('cy', n.y);
                circle.setAttribute('r', '1.5');
                circle.setAttribute('fill', color);
                circle.setAttribute('stroke', 'white');
                circle.setAttribute('stroke-width', '0.5');
                circle.setAttribute('style', 'pointer-events: none; paint-order: stroke;');
                circle.classList.add('coach-debug-line');
                layer.appendChild(circle);

                // Note index label (skip for grace notes — they use abc2svg's own index)
                if (!n.isGrace) {
                    this._addDebugText(n.x, clampTop - 1, `${n.abcIndex}`, 'red', '6px', layer);
                }
            });

            // Horizontal lines: 4 above (-4 to -1), staff (0 to 4), 1 below (5)
            for (let i = -4; i <= 5; i++) {
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
