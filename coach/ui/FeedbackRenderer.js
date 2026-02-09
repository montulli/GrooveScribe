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
 * using coordinates extracted by ScoreLayoutExtractor.
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
        this.measureDurationMs = 0;  // Duration of one measure in ms
        this.totalMeasures = 0;      // Total number of measures in the groove
        this._scheduledTimers = [];  // Timeout IDs for scheduled measure clearing
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
        this.measureDurationMs = measureDurationMs;
        this.totalMeasures = measures;
        this.grooveContext.totalDurationMs = measureDurationMs * measures;
        this.clearedMeasures = new Set();
        const step = this.verticalStep;

        // Build per-system rendering data
        if (sniffedData && sniffedData.systems) {
            for (let sysIdx = 0; sysIdx < sniffedData.systems.length; sysIdx++) {
                const system = sniffedData.systems[sysIdx];

                // Map system to SVG layer by its svgIndex (from ScoreLayoutExtractor)
                // svgIndex tells us which DOM SVG element this system lives in
                const layerIndex = (system.svgIndex !== undefined)
                    ? Math.min(system.svgIndex, this.svgLayers.length - 1)
                    : Math.min(sysIdx, this.svgLayers.length - 1);

                const systemData = {
                    topY: system.topY,
                    layerIndex: layerIndex,
                    measureOffset: system.measureOffset,
                    noteYs: system.noteYs,  // DrumType → SVG Y (from ScoreLayoutExtractor)
                    timeline: [],
                    measureBoundaries: []
                };

                // 1. Build Measure Boundaries for this system's measures only.
                // Each sniffed boundary corresponds to a measure edge in this system,
                // offset by measureOffset to get the correct absolute time.
                const sortedBounds = [...(system.measureBoundaries || [])].sort((a, b) => a.x - b.x);
                for (let i = 0; i < sortedBounds.length; i++) {
                    systemData.measureBoundaries.push({
                        timeMs: (system.measureOffset + i) * measureDurationMs,
                        measureIndex: system.measureOffset + i,
                        x: sortedBounds[i].x
                    });
                }

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
     * Draw feedback for a matched hit (correct drum, timed within tolerance).
     * Positions the circle at the target note's sniffed coordinate, with a
     * small horizontal offset reflecting the timing error.
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
                n.type === drumType &&
                n.isGrace === isGrace &&
                (abcNoteIndex === null || n.abcIndex === abcNoteIndex)
            );
            if (note) {
                targetLayerIndex = sys.layerIndex;
                break;
            }
        }

        if (!note) return;

        // Timing-based visual offset
        const pixelsPerMs = 0.15;
        const clampLimit = TIER_CLAMP_LIMITS[tier];
        let xOffset = timingError * pixelsPerMs;
        xOffset = Math.max(-clampLimit, Math.min(clampLimit, xOffset));
        if (tier === 'perfect' && Math.abs(timingError) < 8) xOffset = 0;

        const measureIndex = this._getMeasureIndex(hitTimeMs);
        this._drawCircle(note.x + xOffset, note.y, tier, targetLayerIndex, measureIndex);
    }

    /**
     * Draw feedback for an unmatched (extra) hit.
     * Uses interpolated X from measure boundaries and the Y for the drum
     * that was actually hit — never snaps to a target note position.
     */
    drawExtraHit(hitTimeMs, drumType) {
        if (this.systems.length === 0) return;

        // Find the system and interpolated X for this hit time
        const interp = this._interpolateXWithSystem(hitTimeMs);
        if (!interp) return;

        const y = interp.sys.noteYs[drumType];
        if (y === undefined) {
            console.warn(`[FeedbackRenderer] Unknown drumType for Y lookup: ${drumType}`);
            return;
        }

        const measureIndex = this._getMeasureIndex(hitTimeMs);
        this._drawCircle(interp.x, y, 'extra', interp.sys.layerIndex, measureIndex);
    }

    /**
     * Interpolate X position from measure boundaries and return the
     * matched system. This ensures extra hits are drawn in the correct
     * SVG layer for multi-system grooves.
     * @returns {{ x: number, sys: Object } | null}
     */
    _interpolateXWithSystem(hitTimeMs) {
        if (!this.grooveContext || this.systems.length === 0) return null;

        for (const sys of this.systems) {
            let left = null, right = null;
            for (const b of sys.measureBoundaries) {
                if (b.x === null) continue;
                if (b.timeMs <= hitTimeMs) left = b;
                else if (b.timeMs > hitTimeMs && !right) { right = b; break; }
            }
            if (left && right) {
                const ratio = (hitTimeMs - left.timeMs) / (right.timeMs - left.timeMs);
                const x = left.x + ratio * (right.x - left.x);
                return { x, sys };
            }
        }
        return null;
    }

    // --- Per-measure clearing ---

    /**
     * Compute the measure index for a given hit time.
     */
    _getMeasureIndex(hitTimeMs) {
        if (this.measureDurationMs <= 0) return 0;
        return Math.floor(hitTimeMs / this.measureDurationMs);
    }

    /**
     * Remove all circles tagged with the given measure index.
     */
    _clearMeasure(measureIndex) {
        for (const { layer } of this.svgLayers) {
            const els = layer.querySelectorAll(`.coach-hit-marker[data-measure="${measureIndex}"]`);
            els.forEach(el => el.remove());
        }
    }

    /**
     * Schedule per-measure clearing for a new loop pass.
     * Sets a timeout for each measure so its old circles are removed
     * when the playhead reaches that measure — regardless of hits.
     */
    scheduleMeasureClearing() {
        this.cancelScheduledClearing();
        for (let m = 0; m < this.totalMeasures; m++) {
            const id = setTimeout(() => this._clearMeasure(m), m * this.measureDurationMs);
            this._scheduledTimers.push(id);
        }
    }

    /**
     * Cancel any pending scheduled measure clearing timers.
     */
    cancelScheduledClearing() {
        for (const id of this._scheduledTimers) clearTimeout(id);
        this._scheduledTimers = [];
    }

    // --- Circle drawing ---

    _drawCircle(x, y, tier, layerIndex = 0, measureIndex = 0) {
        const layer = this.svgLayers[layerIndex]?.layer;
        if (!layer) return;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', TIER_COLORS[tier]);
        circle.setAttribute('fill-opacity', '0.7');
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('style', 'pointer-events: none;');
        circle.setAttribute('data-measure', measureIndex);
        circle.classList.add('coach-hit-marker');

        layer.appendChild(circle);
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

            // Clamp range: 5 lines above staff (-5) to 1 line below staff (5)
            const clampTop = staffY + (-6 * step);
            const clampBottom = staffY + (5 * step);

            // Measure boundaries (Blue) - clamped
            sys.measureBoundaries.forEach((b) => {
                if (b.x === null) return;
                const line = this._createDebugLine(b.x, 'blue', '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Measure label at top of clamped area (continuous across systems)
                this._addDebugText(b.x, clampTop, `M${b.measureIndex}`, 'blue', '6px', layer);
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
                    this._addDebugText(n.x, clampTop, `${n.abcIndex}`, 'red', '6px', layer);
                }
            });

            // Horizontal lines: 4 above (-4 to -1), staff (0 to 4), 1 below (5)
            const xBounds = sys.measureBoundaries.filter(b => b.x !== null);
            const xLeft = xBounds.length > 0 ? xBounds[0].x : 0;
            const xRight = xBounds.length > 0 ? xBounds[xBounds.length - 1].x : 2000;
            for (let i = -4; i <= 5; i++) {
                const y = staffY + (i * step);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', xLeft); line.setAttribute('y1', y);
                line.setAttribute('x2', xRight); line.setAttribute('y2', y);

                const isStaffEdge = (i === 0 || i === 4);
                line.setAttribute('stroke', isStaffEdge ? 'orange' : 'green');
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                line.setAttribute('opacity', '1.0');
                line.classList.add('coach-debug-line');
                layer.appendChild(line);

                if (i >= 0 && i <= 4) {
                    this._addDebugText(xLeft - 5, y + 1.5, `${i}`, isStaffEdge ? 'orange' : 'green', '4px', layer);
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
