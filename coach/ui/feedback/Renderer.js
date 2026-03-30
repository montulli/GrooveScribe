import { DrumType } from '../../engine/DrumConstants.js';
import { PlaylineInterpolator } from './PlaylineInterpolator.js';
import { MeasureClearer } from './MeasureClearer.js';

import { coachState } from '../../state/State.js';

// Timing threshold (ms) for matching a MIDI hit to a timeline note position
const HIT_TIME_MATCH_TOLERANCE_MS = 15;



// Per-tier visual offset clamp limits (px) — constrains how far a feedback
// circle shifts horizontally from the target note to reflect timing error
const TIER_CLAMP_LIMITS = { perfect: 3, good: 8, close: 12, extra: 50 };

// Horizontal offset per ms of timing error (px/ms).
// Controls how visually pronounced early/late hits appear.
const TIMING_ERROR_PX_PER_MS = 0.15;

// If a 'perfect' hit's timing error is below this threshold (ms),
// snap the circle exactly to the note position (no visual offset).
const PERFECT_SNAP_THRESHOLD_MS = 8;

// Drift threshold (ms) for warning about time source mismatch
// between abc2svg tick-derived time and engine-derived time.
const ABC_TIME_DRIFT_WARN_MS = 0.1;

// Tier colors for hit feedback circles
const TIER_COLORS = { perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888' };

// Debug label layout: how far above clampTop to extend barlines for label clearance
const DEBUG_LABEL_EXTEND_PX = 0;
// Horizontal gap between barline and label text
const DEBUG_LABEL_NUDGE_PX = 2;




/**
 * FeedbackRenderer — visual feedback layer for the drum coach.
 *
 * ## Architecture
 *
 * The score is rendered across multiple staff systems (lines), each in its
 * own SVG element. FeedbackRenderer creates a transparent overlay layer in
 * each SVG for drawing feedback circles and the playline.
 *
 * ### Continuous-strip model
 *
 * To handle multi-system interpolation, all systems are concatenated into
 * a single virtual horizontal strip. Each note/rest gets an "absolute offset"
 * — its distance from the strip's left edge. Time increases monotonically
 * so linear interpolation works directly on offsets. After interpolating,
 * _offsetToSystem maps back to the correct SVG and local X coordinate.
 *
 * A sentinel waypoint at grooveEndMs wraps the strip back to the first
 * note's offset, enabling smooth loop-around during count-in.
 *
 * ### Lifecycle
 *
 *   setGrooveContext → interpolator.build() (eager):
 *     Precomputes segments, waypoints, sentinel, and measure thresholds.
 *     All O(notes) work happens here, once per groove load.
 *
 * ### Clearing model
 *
 * Feedback circles are cleared per-measure just before the playline
 * crosses each barline, using precomputed geometric thresholds. Clearing
 * is spatial: all circles whose cx falls within the measure's X range
 * are removed from the DOM.
 */
export class Renderer {
    constructor(svgContainerSelector) {
        this.svgContainerSelector = svgContainerSelector;
        this.svgLayers = [];     // [{svg, layer}, ...] one per SVG element

        this.grooveContext = null;
        this.verticalStep = 4.5; // Default step (6pt * 0.75 scale)
        this.systems = [];       // Per-system rendering data
        this.sniffedData = null;
        this.measureDurationMs = 0;
        this.totalMeasures = 0;
        this.clearedMeasures = new Set();

        // Playline interpolation (pure geometry, no DOM)
        this._interpolator = new PlaylineInterpolator();

        // Measure clearing (threshold-based circle removal)
        this._clearer = new MeasureClearer();

        this._renderingEnabled = false;

        // Debug play line state
        this._playLine = null;
        this._playLineRafId = null;
        this._playLineGetTime = null;
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
            let layer = svg.querySelector('.coach-feedback-layer');
            if (!layer) {
                layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                layer.classList.add('coach-feedback-layer');
                svg.appendChild(layer);
            }
            this.svgLayers.push({ svg, layer });
        });

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
        this._interpolator = new PlaylineInterpolator();

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

        // abc2svg uses C.BLEN = 1536 ticks per whole note, so one quarter
        // note = 384 ticks. BPM is always quarter notes per minute.
        const BLEN = 1536;
        const msPerAbcTick = (60000 / bpm) / (BLEN / 4);

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

                // 1. Build measure bar lines for this system.
                // N measures have N+1 bar lines (left edge of each measure
                // + right edge of the last one). Each entry's measureIndex
                // is the measure that STARTS at that bar line; the last
                // entry's measureIndex is one past the system's final
                // measure (it only serves as the right-edge boundary).
                const sortedBounds = [...(system.measureBoundaries || [])].sort((a, b) => a.x - b.x);
                systemData.numMeasures = sortedBounds.length - 1;
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
                            if (drift > ABC_TIME_DRIFT_WARN_MS) {
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

        // Build interpolation data eagerly so thresholds are
        // available before scheduleMeasureClearing is called.
        this._interpolator.build(this.systems);
        this._clearer.init(this.systems, this.svgLayers, this._interpolator.thresholds, this.measureDurationMs);

        if (coachState.showDebugGrid) {
            this.renderDebugGrid();
        }
    }



    /**
     * Draw feedback for a matched hit (correct drum, timed within tolerance).
     * Positions the circle at the target note's sniffed coordinate, with a
     * small horizontal offset reflecting the timing error.
     */
    drawHitFeedbackByTime(hitTimeMs, tier, timingError, drumType, abcNoteIndex = null) {
        if (!this._renderingEnabled || this.systems.length === 0) return;

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
        const clampLimit = TIER_CLAMP_LIMITS[tier];
        let xOffset = timingError * TIMING_ERROR_PX_PER_MS;
        xOffset = Math.max(-clampLimit, Math.min(clampLimit, xOffset));
        if (tier === 'perfect' && Math.abs(timingError) < PERFECT_SNAP_THRESHOLD_MS) xOffset = 0;

        const measureIndex = this._getMeasureIndex(hitTimeMs);
        this._drawCircle(note.x + xOffset, note.y, tier, targetLayerIndex, measureIndex);
    }

    /**
     * Draw feedback for an unmatched (extra) hit.
     * Uses interpolated X from measure boundaries and the Y for the drum
     * that was actually hit — never snaps to a target note position.
     */
    drawExtraHit(hitTimeMs, drumType) {
        if (!this._renderingEnabled || this.systems.length === 0) return;

        // Find the system and interpolated X for this hit time
        const interp = this._interpolator.interpolate(hitTimeMs);
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
     * Compute the modular measure index for a given time, delegating
     * to the PlaylineInterpolator.
     */
    _getMeasureIndex(timeMs) {
        return this._interpolator.getMeasureIndex(
            timeMs,
            this.grooveContext?.totalDurationMs,
            this.measureDurationMs,
            this.totalMeasures
        );
    }

    /**
     * Reset clearing state for a new pass.
     * Called by Controller at playback start and at each _onRepeat.
     * @param {number} startTimeMs - current playback time at pass start
     */
    scheduleMeasureClearing(startTimeMs = 0) {
        this.clearedMeasures.clear();
        this._interpolator.cursor = 0;
        this._clearer.schedule(startTimeMs);
    }

    /**
     * Enable rendering of the playline and feedback circles.
     * Called by Controller when the groove starts (after count-in).
     */
    enableRendering() {
        this._renderingEnabled = true;
        if (this._playLine) {
            this._playLine.style.display = '';
        }
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
            // Barlines extend upward into the label area so labels sit
            // beside the line instead of using a "|" text separator.
            const labelY = clampTop - DEBUG_LABEL_EXTEND_PX;
            sys.measureBoundaries.forEach((b, idx) => {
                if (b.x === null) return;
                const line = this._createDebugLine(b.x, 'blue', '1.0', labelY, clampBottom);
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Labels: position on left/right side of barline
                if (idx === 0) {
                    // First barline: label to the right
                    this._addDebugText(b.x + DEBUG_LABEL_NUDGE_PX, labelY, `M${b.measureIndex}`, 'blue', '6px', layer, 'start');
                } else if (idx < sys.numMeasures) {
                    // Interior barline: ending measure on the left, starting on the right
                    this._addDebugText(b.x - DEBUG_LABEL_NUDGE_PX, labelY, `M${b.measureIndex - 1}`, 'blue', '6px', layer, 'end');
                    this._addDebugText(b.x + DEBUG_LABEL_NUDGE_PX, labelY, `M${b.measureIndex}`, 'blue', '6px', layer, 'start');
                } else {
                    // Last barline: label to the left
                    this._addDebugText(b.x - DEBUG_LABEL_NUDGE_PX, labelY, `M${b.measureIndex - 1}`, 'blue', '6px', layer, 'end');
                }
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

    _addDebugText(x, y, str, color, fontSize = '5px', layer = null, anchor = 'middle') {
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
        text.style.textAnchor = anchor;
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
        // Hidden until rendering is enabled (e.g. after count-in)
        if (!this._renderingEnabled) {
            this._playLine.style.display = 'none';
        }

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
        this._renderingEnabled = false;
        this._lastGeoMeasure = -1;
    }

    /**
     * rAF tick: clearing + playline positioning.
     *
     * Clearing uses precomputed measurePlaylineThresholds: each threshold
     * is the interpolated time at which the playline crosses a barline.
     * We clear the measure CLEAR_AHEAD_MS before that crossing.
     *
     * Playline uses a cursor-based approach: _waypointCursor tracks the
     * current position in the sorted waypoint array and only advances
     * forward, giving O(1) amortized interpolation per frame.
     */
    _tickPlayLine() {
        if (!this._playLineGetTime) return; // guard against rAF/stop race
        const timeMs = this._playLineGetTime();

        // --- Threshold-based clearing ---
        this._clearer.tick(timeMs, (t) => this._getMeasureIndex(t));

        // Enable rendering (playline + circles) at the actual M0 barline
        // time — NOT at the CLEAR_AHEAD early trigger which is only for
        // clearing old circles.
        if (!this._renderingEnabled) {
            const thresholds = this._interpolator.thresholds;
            const m0 = thresholds.find(t => t.measureIndex === 0);
            if (m0 && timeMs >= m0.timeMs) {
                this.enableRendering();
            }
        }

        // --- Playline positioning via interpolator cursor (O(1) amortized) ---
        if (this._renderingEnabled) {
            const interp = this._interpolator.interpolateWithCursor(timeMs);
            if (interp) {
                const layer = this.svgLayers[interp.sys.layerIndex]?.layer;
                if (layer) {
                    if (this._playLine.parentNode !== layer) {
                        this._playLine.remove();
                        layer.appendChild(this._playLine);
                    }

                    const step = this.verticalStep;
                    const staffY = interp.sys.topY;
                    const y1 = staffY + (-6 * step);
                    const y2 = staffY + (5 * step);

                    for (const ln of [this._playLineOutline, this._playLineInner]) {
                        ln.setAttribute('x1', interp.x);
                        ln.setAttribute('y1', y1);
                        ln.setAttribute('x2', interp.x);
                        ln.setAttribute('y2', y2);
                    }
                }
            }
        }

        this._playLineRafId = requestAnimationFrame(() => this._tickPlayLine());
    }
}
