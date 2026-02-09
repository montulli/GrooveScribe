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

        // Debug play line state
        this._playLine = null;       // SVG line element
        this._playLineRafId = null;  // requestAnimationFrame ID
        this._playLineGetTime = null; // Callback returning current playback time in ms
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
     * Clear everything: remove overlay layers, stop play line, cancel timers.
     * Used when leaving coach mode entirely.
     */
    clearAll() {
        this.stopPlayLine();
        this.cancelScheduledClearing();
        for (const { layer } of this.svgLayers) {
            layer.remove();
        }
        this.svgLayers = [];
    }

    /**
     * Set context and build coordinate timeline from sniffed data
     */
    setGrooveContext(context, timeline, sniffedData = null) {
        this.grooveContext = context;
        this.sniffedData = sniffedData;
        this.systems = [];
        this._waypointData = null; // Clear interpolation cache

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

        // Calibrate msPerAbcTick empirically from the first matched note pair.
        // abc2svg assigns each symbol an absolute tick time (s.time, stored as abcTime).
        // Rather than assuming a fixed tick-to-ms ratio (which varies by time signature
        // and beat unit), we derive it from a note where both the engine time and abcTime
        // are known. The engine's time and abcTime are both proportional to musical position,
        // so the ratio is constant across all notes.
        let msPerAbcTick = null;
        if (sniffedData?.systems && timeline?.length > 0) {
            for (const system of sniffedData.systems) {
                for (const chord of (system.chords || [])) {
                    if (chord.isGrace || chord.abcTime <= 0) continue;
                    const engineNote = timeline.find(n => n.abcIndex === chord.abcIndex && !n.isGrace);
                    if (engineNote && engineNote.time > 0) {
                        msPerAbcTick = engineNote.time / chord.abcTime;
                        console.log(`[FeedbackRenderer] Calibrated msPerAbcTick=${msPerAbcTick.toFixed(6)} ` +
                            `from abcIndex=${chord.abcIndex} (engineTime=${engineNote.time.toFixed(2)}ms, abcTime=${chord.abcTime})`);
                        break;
                    }
                }
                if (msPerAbcTick !== null) break;
            }
        }
        if (msPerAbcTick === null) {
            console.warn('[FeedbackRenderer] Could not calibrate msPerAbcTick — no matched notes with abcTime > 0. Rests will have no time.');
        }

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
                    measureBoundaries: [],
                    rests: system.rests || []
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
                            const abcTimeMs = sniffed.abcTime * msPerAbcTick;

                            // Consistency check: abcTime-derived ms should match engine-derived ms
                            const drift = Math.abs(abcTimeMs - note.time);
                            if (drift > 0.1) {
                                console.warn(`[FeedbackRenderer] Time source mismatch for abcIndex=${sniffed.abcIndex}: ` +
                                    `engine=${note.time.toFixed(2)}ms, abcTime=${abcTimeMs.toFixed(2)}ms (drift=${drift.toFixed(2)}ms)`);
                            }
                            systemData.timeline.push({
                                timeMs: abcTimeMs,
                                tickIndex: note.tickIndex,
                                type: noteType,
                                abcIndex: sniffed.abcIndex,
                                x: sniffed.x,
                                y: noteY,
                                isGrace: !!note.isGrace
                            });
                        }
                    }
                }

                // 3. Add rests to timeline (same time source as notes)
                if (msPerAbcTick !== null) {
                    for (const rest of (system.rests || [])) {
                        systemData.timeline.push({
                            timeMs: rest.abcTime * msPerAbcTick,
                            type: 'rest',
                            x: rest.x
                        });
                    }
                }

                systemData.timeline.sort((a, b) => a.timeMs - b.timeMs);

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
     * Interpolate X position using modular arithmetic over a continuous
     * strip of all staff systems.
     *
     * ## Concept
     *
     * The score is rendered across multiple staff systems (lines), each
     * with its own X coordinate space. Time increases monotonically, but
     * X wraps back to the left edge at each system boundary. This creates
     * a discontinuity that makes naive interpolation impossible.
     *
     * The solution: treat all systems as one continuous horizontal strip.
     * Each note/rest gets an "absolute offset" — its distance from the
     * very start of the strip:
     *
     *   absOffset = Σ(widths of systems before it) + (note.x - system.leftEdge)
     *
     * In this space, X is monotonically increasing (no wrapping), so linear
     * interpolation works. After interpolating, we use modular arithmetic
     * to map back to the correct system and local X.
     *
     * ## Handling wraparound
     *
     * When two adjacent waypoints are in different systems, the right one
     * has a higher absOffset (it's further along the strip). If the right
     * one wraps around (e.g. loop repeat: last system → first system),
     * its absOffset will be LESS than the left's. We detect this and add
     * totalWidth to "unwrap" it before interpolating:
     *
     *   if (rightOffset < leftOffset) rightOffset += totalWidth;
     *
     * After interpolating, we take `result % totalWidth` to fold it back
     * into the strip. This single modulo operation handles ALL wraparound
     * cases identically: within-system, cross-system, and loop repeat.
     *
     * ## Mapping back to a system
     *
     * Given a modular offset, we walk through the system segments to find
     * which one contains it, then convert back to local X:
     *
     *   localX = system.leftEdge + (modularOffset - segmentStart)
     *
     * ## Waypoints
     *
     * Only notes and rests serve as waypoints — no measure boundaries.
     * Boundaries are used solely to compute each system's width and edges.
     *
     * A sentinel waypoint is added at `grooveEndMs` with the same absolute
     * offset as the first note. This creates continuity at the loop point:
     * the play line smoothly moves to the right edge of the last system,
     * wraps via modulo to the first system, and enters from the left.
     *
     * @returns {{ x: number, sys: Object } | null}
     */
    _interpolateXWithSystem(hitTimeMs) {
        if (!this.grooveContext || this.systems.length === 0) return null;
        if (!this._waypointData) this._buildWaypointData();

        const { waypoints, totalWidth } = this._waypointData;
        if (waypoints.length === 0 || totalWidth === 0) return null;

        // Find neighboring waypoints
        let left = null, right = null;
        for (const w of waypoints) {
            if (w.timeMs <= hitTimeMs) left = w;
            else { right = w; break; }
        }
        if (!left || !right) return null;

        // Unwrap: if right wraps around, add totalWidth so interpolation
        // proceeds forward instead of backward.
        let rightOffset = right.absOffset;
        if (rightOffset < left.absOffset) rightOffset += totalWidth;

        // Interpolate, then fold back into [0, totalWidth) via modulo
        const ratio = (hitTimeMs - left.timeMs) / (right.timeMs - left.timeMs);
        const interpOffset = left.absOffset + ratio * (rightOffset - left.absOffset);
        const modOffset = ((interpOffset % totalWidth) + totalWidth) % totalWidth;

        return this._offsetToSystem(modOffset);
    }

    /**
     * Build the cached waypoint data: system segments and a flat,
     * time-sorted list of waypoints with absolute offsets.
     * Called lazily by _interpolateXWithSystem; cleared in setGrooveContext.
     */
    _buildWaypointData() {
        // System segments: left/right edges from measure boundaries,
        // cumulative offset within the continuous strip.
        const segments = [];
        let cumulativeOffset = 0;
        for (const sys of this.systems) {
            const boundaries = sys.measureBoundaries
                .filter(b => b.x !== null)
                .sort((a, b) => a.x - b.x);
            const leftEdge = boundaries.length > 0 ? boundaries[0].x : 0;
            const rightEdge = boundaries.length > 0 ? boundaries.at(-1).x : 0;
            const width = rightEdge - leftEdge;
            segments.push({ sys, leftEdge, rightEdge, width, offset: cumulativeOffset });
            cumulativeOffset += width;
        }
        const totalWidth = cumulativeOffset;

        // Flat waypoints from notes/rests, each mapped to its absolute
        // offset in the strip: seg.offset + (note.x - seg.leftEdge).
        const waypoints = [];
        for (const seg of segments) {
            for (const t of seg.sys.timeline) {
                if (t.x !== undefined) {
                    waypoints.push({
                        timeMs: t.timeMs,
                        absOffset: seg.offset + (t.x - seg.leftEdge),
                    });
                }
            }
        }
        waypoints.sort((a, b) => a.timeMs - b.timeMs);

        // Sentinel for loop wraparound: a copy of the first waypoint at
        // grooveEndMs so the play line continues past the last note and
        // wraps smoothly via modulo.
        if (waypoints.length > 0) {
            const grooveEndMs = Math.max(
                ...this.systems.flatMap(s =>
                    s.measureBoundaries.map(b => b.timeMs)
                )
            );
            waypoints.push({ timeMs: grooveEndMs, absOffset: waypoints[0].absOffset });
        }

        this._waypointData = { segments, waypoints, totalWidth };
    }

    /**
     * Map an absolute offset (modulo totalWidth) back to a system and
     * local X coordinate.
     * @param {number} offset - Position in the continuous strip, [0, totalWidth).
     * @returns {{ x: number, sys: Object }}
     */
    _offsetToSystem(offset) {
        const { segments } = this._waypointData;
        for (const seg of segments) {
            if (offset >= seg.offset && offset < seg.offset + seg.width) {
                return { x: seg.leftEdge + (offset - seg.offset), sys: seg.sys };
            }
        }
        // Rounding edge case: offset exactly at the strip's end
        const last = segments.at(-1);
        return { x: last.rightEdge, sys: last.sys };
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
                if (n.x === null || n.type === 'rest') return;
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

            // Rests (Yellow) - clamped
            sys.rests.forEach((r) => {
                const line = this._createDebugLine(r.x, '#DAA520', '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);
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

    // --- Debug play line ---

    /**
     * Start the debug play line animation.
     * @param {Function} getTimeMs - Callback returning current playback time in ms
     */
    startPlayLine(getTimeMs) {
        this.stopPlayLine();
        this._playLineGetTime = getTimeMs;

        // Create a group with white outline + orange line (reused across ticks)
        this._playLine = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this._playLine.setAttribute('style', 'pointer-events: none;');
        this._playLine.classList.add('coach-debug-line');

        this._playLineOutline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this._playLineOutline.setAttribute('stroke', 'white');
        this._playLineOutline.setAttribute('stroke-width', '4');

        this._playLineInner = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this._playLineInner.setAttribute('stroke', 'orange');
        this._playLineInner.setAttribute('stroke-width', '2');

        this._playLine.appendChild(this._playLineOutline);
        this._playLine.appendChild(this._playLineInner);

        this._playLineRafId = requestAnimationFrame(() => this._tickPlayLine());
    }

    /**
     * Stop the debug play line animation and remove the element.
     */
    stopPlayLine() {
        if (this._playLineRafId !== null) {
            cancelAnimationFrame(this._playLineRafId);
            this._playLineRafId = null;
        }
        if (this._playLine) {
            this._playLine.remove();
            this._playLine = null;
            this._playLineOutline = null;
            this._playLineInner = null;
        }
        this._playLineGetTime = null;
    }

    /**
     * rAF tick: move the play line to the current interpolated X position.
     */
    _tickPlayLine() {
        const timeMs = this._playLineGetTime();
        const interp = this._interpolateXWithSystem(timeMs);

        if (interp) {
            const layer = this.svgLayers[interp.sys.layerIndex]?.layer;
            if (layer) {
                // Move to the correct layer if needed
                if (this._playLine.parentNode !== layer) {
                    this._playLine.remove();
                    layer.appendChild(this._playLine);
                }

                const step = this.verticalStep;
                const staffY = interp.sys.topY;
                const y1 = staffY + (-6 * step);
                const y2 = staffY + (5 * step);

                // Update both lines in the group
                for (const ln of [this._playLineOutline, this._playLineInner]) {
                    ln.setAttribute('x1', interp.x);
                    ln.setAttribute('y1', y1);
                    ln.setAttribute('x2', interp.x);
                    ln.setAttribute('y2', y2);
                }
            }
        }

        this._playLineRafId = requestAnimationFrame(() => this._tickPlayLine());
    }
}
