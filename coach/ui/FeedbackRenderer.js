import { DrumType } from '../engine/DrumConstants.js';

// Set to true to render debug grid overlay (measure boundaries, note positions, staff lines)
export const SHOW_DEBUG = true;

// Timing threshold (ms) for matching a MIDI hit to a timeline note position
const HIT_TIME_MATCH_TOLERANCE_MS = 15;

// How far ahead (ms) of a measure boundary to clear the next measure.
// Derived dynamically as a fraction of measure duration, clamped to a sane range.
const CLEAR_AHEAD_FRACTION = 0.1;  // 10% of measure duration
const MIN_CLEAR_AHEAD_MS = 100;    // floor: never closer than 100ms
const MAX_CLEAR_AHEAD_MS = 400;    // ceiling: never earlier than 400ms

// Per-tier visual offset clamp limits (px) — constrains how far a feedback
// circle shifts horizontally from the target note to reflect timing error
const TIER_CLAMP_LIMITS = { perfect: 3, good: 8, close: 12, extra: 50 };

// Horizontal offset per ms of timing error (px/ms).
// Controls how visually pronounced early/late hits appear.
const TIMING_ERROR_PX_PER_MS = 0.15;

// If a 'perfect' hit's timing error is below this threshold (ms),
// snap the circle exactly to the note position (no visual offset).
const PERFECT_SNAP_THRESHOLD_MS = 8;

// Tier colors for hit feedback circles
const TIER_COLORS = { perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888' };




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
 *   setGrooveContext → _buildWaypointData (eager):
 *     Precomputes segments, waypoints, sentinel, and measure thresholds.
 *     All O(notes) work happens here, once per groove load.
 *
 *   startPlayLine → _tickPlayLine (rAF loop):
 *     Advances a waypoint cursor (O(1) amortized) and a threshold cursor
 *     for measure clearing. Both cursors only move forward.
 *
 *   drawHitFeedbackByTime / drawExtraHit:
 *     Per-hit rendering. Uses precomputed per-system timeline lookups.
 *
 * ### Clearing model
 *
 * Feedback circles are cleared per-measure just before the playline
 * crosses each barline, using precomputed geometric thresholds. Clearing
 * is spatial: all circles whose cx falls within the measure's X range
 * are removed from the DOM.
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
        this.clearedMeasures = new Set();  // Measures cleared in the current pass

        // Precomputed clearing schedule
        this._nextClearTimeMs = Infinity;   // Time at which to clear the next measure
        this._nextBoundaryTimeMs = Infinity; // Time of the next measure boundary
        this._nextMeasureToClear = 0;        // Which measure to clear next
        this._renderingEnabled = false;      // Controls playline/circle visibility

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

        // Build waypoint data eagerly so measurePlaylineThresholds are
        // available before scheduleMeasureClearing is called.
        this._buildWaypointData();

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
     * Interpolate X position over a continuous strip of all staff systems.
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
     * Offsets are monotonically increasing (no wrapping), so linear
     * interpolation works directly. After interpolating, _offsetToSystem
     * maps the offset back to the correct system and local X.
     *
     * ## Sentinel and loop boundary
     *
     * A sentinel waypoint at grooveEndMs with absOffset = firstNoteOffset
     * creates a conceptual wrap-around: from the last note the strip
     * extends past totalWidth and wraps back to the first note's offset.
     * When interpolating between the last note and the sentinel, the
     * right offset is unwrapped (+ totalWidth) so interpolation proceeds
     * forward. The result is then folded back into [0, totalWidth) via
     * modulo, producing a smooth visual wrap to the beginning of the
     * score during the count-in tail.
     *
     * During normal playback, _onRepeat resets sessionStartTime before
     * times reach this range, so the modular wrap never triggers.
     *
     * ## Waypoints
     *
     * Notes, rests, and interior barlines serve as waypoints. Interior
     * barlines are inverse-interpolated and added so the playline passes
     * through each barline at the geometrically correct time.
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

        // Unwrap: if right wraps around (sentinel), add totalWidth so
        // interpolation proceeds forward instead of backward.
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
        // grooveEndMs so the playline continues past the last note and
        // wraps smoothly via modulo. Created before threshold computation
        // so it's available for the measure 0 wraparound threshold.
        const grooveEndMs = (waypoints.length > 0)
            ? Math.max(...this.systems.flatMap(s => s.measureBoundaries.map(b => b.timeMs)))
            : 0;
        const firstNoteOffset = waypoints.length > 0 ? waypoints[0].absOffset : 0;
        // Save the count of real note waypoints BEFORE pushing the sentinel.
        // The threshold loop below must iterate only over real notes, not the
        // sentinel or any barline waypoints pushed during threshold computation.
        const noteWaypointCount = waypoints.length;
        if (waypoints.length > 0) {
            waypoints.push({ timeMs: grooveEndMs, absOffset: firstNoteOffset });
        }

        const { thresholds: uniqueThresholds, augmentedWaypoints } =
            this._computeThresholds(segments, waypoints, noteWaypointCount, totalWidth, grooveEndMs, firstNoteOffset);

        this._waypointData = { segments, waypoints: augmentedWaypoints, totalWidth };
        this._waypointCursor = 0;
        this._measurePlaylineThresholds = uniqueThresholds;

        console.log(`[FeedbackRenderer] Built ${uniqueThresholds.length} measure playline thresholds:`,
            uniqueThresholds.map(t => `M${t.measureIndex}@${t.timeMs.toFixed(1)}ms`).join(', '));
    }

    /**
     * Compute measure-crossing thresholds by inverse-interpolating barline
     * positions through the waypoint strip.
     *
     * For each interior barline, finds the two note waypoints that bracket
     * the barline's absolute offset and interpolates the crossing time.
     * System-boundary barlines are recorded as thresholds for clearing but
     * NOT added as waypoints (their offsets would break monotonicity).
     *
     * Also computes the measure-0 loop-point threshold by extrapolating
     * past the last note toward the strip's right edge.
     *
     * @returns {{ thresholds: Array, augmentedWaypoints: Array }}
     */
    _computeThresholds(segments, waypoints, noteWaypointCount, totalWidth, grooveEndMs, firstNoteOffset) {
        const thresholds = [];
        const segmentBoundaryOffsets = new Set(
            segments.map(s => s.offset).concat(segments.map(s => s.offset + s.width))
        );
        for (const seg of segments) {
            for (const b of seg.sys.measureBoundaries) {
                if (b.x === null) continue;
                const barlineOffset = seg.offset + (b.x - seg.leftEdge);

                // Skip barlines at the very edges — measure 0 is handled
                // separately via the loop-point wraparound below.
                if (barlineOffset <= 0) continue;
                if (barlineOffset >= totalWidth) continue;

                // Find the two note waypoints that bracket this barline offset.
                // Walk the time-sorted waypoints (excluding sentinel):
                // left = last waypoint with absOffset <= barlineOffset
                // right = first waypoint with absOffset > barlineOffset
                let left = null, right = null;
                for (let i = 0; i < noteWaypointCount; i++) {
                    const w = waypoints[i];
                    if (w.absOffset <= barlineOffset) left = w;
                    else if (!right) right = w;
                }
                if (!left || !right || left.absOffset === right.absOffset) continue;

                // Inverse interpolation: solve for time at the barline offset
                const ratio = (barlineOffset - left.absOffset) / (right.absOffset - left.absOffset);
                const thresholdTimeMs = left.timeMs + ratio * (right.timeMs - left.timeMs);

                thresholds.push({
                    timeMs: thresholdTimeMs,
                    measureIndex: b.measureIndex,
                });

                // Add the barline as a waypoint ONLY for interior barlines
                // (within a single system). System-boundary barlines span
                // across systems and would create non-monotonic offsets.
                if (!segmentBoundaryOffsets.has(barlineOffset)) {
                    waypoints.push({ timeMs: thresholdTimeMs, absOffset: barlineOffset });
                }
            }
        }

        // --- Measure 0 threshold (loop-point wraparound) ---
        // Inverse-interpolate to find when the playline reaches the right
        // edge (offset=totalWidth). This fires during count-in to enable
        // rendering before the first beat. No waypoint is added — the
        // sentinel already anchors the right edge.
        if (waypoints.length >= 2) {
            let lastReal = null;
            for (const w of waypoints) {
                if (w.timeMs >= grooveEndMs) continue;
                if (!lastReal || w.absOffset > lastReal.absOffset) lastReal = w;
            }
            if (lastReal && lastReal.absOffset < totalWidth) {
                const unwrappedSentinelOffset = firstNoteOffset + totalWidth;
                const ratio = (totalWidth - lastReal.absOffset) / (unwrappedSentinelOffset - lastReal.absOffset);
                const thresholdTimeMs = lastReal.timeMs + ratio * (grooveEndMs - lastReal.timeMs);
                thresholds.push({
                    timeMs: thresholdTimeMs,
                    measureIndex: 0,
                });
            }
        }

        // Re-sort after adding barline waypoints
        waypoints.sort((a, b) => a.timeMs - b.timeMs);
        thresholds.sort((a, b) => a.timeMs - b.timeMs);

        // Deduplicate thresholds by measureIndex: adjacent systems share
        // barlines, producing two thresholds for the same measure boundary.
        // Keep only the first (earliest) occurrence of each measureIndex.
        const seen = new Set();
        const deduped = thresholds.filter(t => {
            if (seen.has(t.measureIndex)) return false;
            seen.add(t.measureIndex);
            return true;
        });

        return { thresholds: deduped, augmentedWaypoints: waypoints };
    }

    /**
     * Map an absolute offset back to a system and local X coordinate.
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
    //
    // Clears the CURRENT measure's old circles when the playline enters
    // it. Clearing is spatial: all circles whose cx falls between the
    // measure's boundary X coordinates are removed.
    //
    // The measure index rotates modularly (last measure → first),
    // so loop wrapping is seamless.

    /**
     * Compute the modular measure index for a given time.
     * Uses the geometric barline thresholds (inverse-interpolated from
     * the continuous waypoint strip) so the result matches the visual
     * position of the playline, not an arbitrary equal-time slice.
     */
    _getMeasureIndex(timeMs) {
        if (this.measureDurationMs <= 0 || !this.grooveContext?.totalDurationMs) return 0;
        const totalDuration = this.grooveContext.totalDurationMs;
        const modularTime = ((timeMs % totalDuration) + totalDuration) % totalDuration;

        const thresholds = this._measurePlaylineThresholds;
        if (!thresholds || thresholds.length === 0) {
            // Fallback: equal-time division (only before thresholds are built)
            return Math.floor(modularTime / this.measureDurationMs) % this.totalMeasures;
        }

        // Find which measure contains modularTime by scanning thresholds.
        // Each threshold marks the geometric moment we enter that measure.
        // Default to M0 (covers the range before the first threshold).
        let measureIndex = 0;
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (modularTime >= thresholds[i].timeMs) {
                measureIndex = thresholds[i].measureIndex;
                break;
            }
        }
        return measureIndex;
    }

    /**
     * Remove all feedback circles whose cx falls within the X boundaries
     * of the given measure. Finds the measure in the correct system and
     * layer automatically.
     */
    _clearMeasureRegion(measureIndex) {
        for (const sys of this.systems) {
            const bounds = sys.measureBoundaries;
            const localIdx = measureIndex - (sys.measureOffset || 0);
            if (localIdx < 0 || localIdx >= sys.numMeasures) continue;

            const leftX = bounds[localIdx].x;
            const rightX = (localIdx + 1 < bounds.length)
                ? bounds[localIdx + 1].x
                : Infinity;  // last measure extends to right edge

            const layer = this.svgLayers[sys.layerIndex]?.layer;
            if (!layer) continue;

            let removed = 0;
            layer.querySelectorAll('.coach-hit-marker').forEach(el => {
                const cx = parseFloat(el.getAttribute('cx'));
                if (cx >= leftX && cx < rightX) {
                    el.remove();
                    removed++;
                }
            });
            if (removed > 0) {
                console.log(`[FeedbackRenderer] Removed ${removed} circles from M${measureIndex} (X: ${leftX.toFixed(1)}–${rightX === Infinity ? '∞' : rightX.toFixed(1)}, sys ${sys.layerIndex})`);
            }
        }
    }



    /**
     * Reset clearing state and initialize the threshold cursor for a
     * new pass. The startTimeMs tells us where in the groove the playline
     * is (e.g. at (N-1)*measureDurationMs during count-in, or 0 at
     * groove start). The cursor advances to the first threshold after
     * startTimeMs so clearing fires at the right time.
     *
     * Called by Controller at playback start and at each _onRepeat.
     * @param {number} startTimeMs - current playback time at pass start
     */
    scheduleMeasureClearing(startTimeMs = 0) {
        this.clearedMeasures.clear();
        this._waypointCursor = 0;

        // Compute clear-ahead from measure duration: 10% clamped to [100, 400]ms
        this._clearAheadMs = Math.max(
            MIN_CLEAR_AHEAD_MS,
            Math.min(MAX_CLEAR_AHEAD_MS, this.measureDurationMs * CLEAR_AHEAD_FRACTION)
        );
        console.log(`[FeedbackRenderer] clearAheadMs=${this._clearAheadMs.toFixed(0)}ms (measureDuration=${this.measureDurationMs.toFixed(0)}ms)`);

        // Find first threshold whose clear time (threshold - clearAheadMs)
        // is still in the future relative to startTimeMs
        const thresholds = this._measurePlaylineThresholds || [];
        const idx = thresholds.findIndex(t => t.timeMs - this._clearAheadMs > startTimeMs);
        this._thresholdCursor = idx >= 0 ? idx : thresholds.length;

        if (thresholds.length > 0 && this._thresholdCursor < thresholds.length) {
            const next = thresholds[this._thresholdCursor];
            console.log(`[FeedbackRenderer] Clear schedule: cursor at threshold ${this._thresholdCursor} — M${next.measureIndex} clears at t≥${(next.timeMs - this._clearAheadMs).toFixed(0)}ms (threshold ${next.timeMs.toFixed(0)}ms)`);
        } else {
            console.log(`[FeedbackRenderer] Clear schedule: no thresholds ahead of startTime=${startTimeMs.toFixed(0)}ms`);
        }
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
        console.log('[FeedbackRenderer] Rendering enabled');
    }


    // --- Circle drawing ---

    _drawCircle(x, y, tier, layerIndex = 0, measureIndex = 0) {
        const layer = this.svgLayers[layerIndex]?.layer;
        if (!layer) return;

        console.log(`[FeedbackRenderer] Drawing ${tier} circle at x=${x.toFixed(1)} in M${measureIndex} (layer ${layerIndex})`);

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
            sys.measureBoundaries.forEach((b, idx) => {
                if (b.x === null) return;
                const line = this._createDebugLine(b.x, 'blue', '1.0', clampTop, clampBottom);
                line.setAttribute('stroke-dasharray', '4,4');
                line.setAttribute('stroke-width', '0.25');
                layer.appendChild(line);

                // Label: show adjacent measures — |M0, M0|M1, M1|
                let label;
                if (idx === 0) {
                    label = `|M${b.measureIndex}`;
                } else if (idx < sys.numMeasures) {
                    label = `M${b.measureIndex - 1}|M${b.measureIndex}`;
                } else {
                    label = `M${b.measureIndex - 1}|`;
                }
                this._addDebugText(b.x, clampTop, label, 'blue', '6px', layer);
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
        const timeMs = this._playLineGetTime();

        // --- Threshold-based clearing ---
        // Advance cursor through precomputed thresholds. When timeMs
        // approaches a threshold (within CLEAR_AHEAD_MS), clear that measure.
        const thresholds = this._measurePlaylineThresholds || [];
        while (this._thresholdCursor < thresholds.length) {
            const t = thresholds[this._thresholdCursor];
            // When the destination measure is the same as the current measure
            // (self-loop, e.g. single-measure grooves), don't clear ahead —
            // we'd wipe circles we're still actively drawing.
            const currentMeasure = this._getMeasureIndex(timeMs);
            const ahead = (t.measureIndex === currentMeasure) ? 0 : this._clearAheadMs;
            if (timeMs >= t.timeMs - ahead) {
                console.log(`[FeedbackRenderer] Clearing M${t.measureIndex} (t=${timeMs.toFixed(0)}ms, threshold=${t.timeMs.toFixed(0)}ms, ahead=${ahead.toFixed(0)}ms)`);
                this._clearMeasureRegion(t.measureIndex);
                this._thresholdCursor++;
            } else {
                break; // remaining thresholds are in the future
            }
        }

        // Enable rendering (playline + circles) at the actual M0 barline
        // time — NOT at the CLEAR_AHEAD early trigger which is only for
        // clearing old circles.
        if (!this._renderingEnabled) {
            const m0 = thresholds.find(t => t.measureIndex === 0);
            if (m0 && timeMs >= m0.timeMs) {
                this.enableRendering();
            }
        }

        // --- Playline positioning via waypoint cursor (O(1) amortized) ---
        if (this._renderingEnabled && this._waypointData) {
            const { waypoints, totalWidth } = this._waypointData;

            // Advance cursor to the last waypoint at or before timeMs
            while (this._waypointCursor < waypoints.length - 1 &&
                waypoints[this._waypointCursor + 1].timeMs <= timeMs) {
                this._waypointCursor++;
            }

            const left = waypoints[this._waypointCursor];
            const right = waypoints[this._waypointCursor + 1];

            if (left && right && right.timeMs > left.timeMs) {
                // Unwrap: if right wraps around (sentinel), add totalWidth
                let rightOffset = right.absOffset;
                if (rightOffset < left.absOffset) rightOffset += totalWidth;

                const ratio = (timeMs - left.timeMs) / (right.timeMs - left.timeMs);
                const interpOffset = left.absOffset + ratio * (rightOffset - left.absOffset);
                const modOffset = ((interpOffset % totalWidth) + totalWidth) % totalWidth;

                const interp = this._offsetToSystem(modOffset);
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
        }

        this._playLineRafId = requestAnimationFrame(() => this._tickPlayLine());
    }
}
