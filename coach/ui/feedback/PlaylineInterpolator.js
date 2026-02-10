/**
 * PlaylineInterpolator — pure geometry for the continuous-strip model.
 *
 * Treats all staff systems as one continuous horizontal strip so that
 * time → X interpolation works across system boundaries. No DOM
 * dependencies — takes system data in, returns coordinates out.
 *
 * ## Concepts
 *
 * - **Segments**: Each system becomes a segment in the strip, with a
 *   cumulative offset from the strip's left edge.
 *
 * - **Waypoints**: Notes, rests, and interior barlines mapped to
 *   absolute offsets. Time-sorted for linear/cursor interpolation.
 *
 * - **Sentinel**: A waypoint at grooveEndMs with absOffset equal to
 *   the first note's offset. Creates a conceptual wrap-around so
 *   interpolation past the last note proceeds forward and wraps
 *   smoothly via modulo.
 *
 * - **Thresholds**: Inverse-interpolated times at which the playline
 *   crosses each barline position. Used for measure clearing and
 *   getMeasureIndex.
 *
 * ## Usage
 *
 *   const interp = new PlaylineInterpolator();
 *   interp.build(systems);
 *   const { x, sys } = interp.interpolate(timeMs);
 *   const measureIdx = interp.getMeasureIndex(timeMs, totalDurationMs);
 */
export class PlaylineInterpolator {
    constructor() {
        this._segments = [];
        this._waypoints = [];
        this._totalWidth = 0;
        this._thresholds = [];
        this.cursor = 0;
    }

    /** @returns {Array} The precomputed thresholds array */
    get thresholds() {
        return this._thresholds;
    }

    /** @returns {Object} Waypoint data for direct access */
    get waypointData() {
        return {
            segments: this._segments,
            waypoints: this._waypoints,
            totalWidth: this._totalWidth,
        };
    }

    /**
     * Build segments, waypoints, sentinel, and thresholds from system data.
     * Call once per groove load.
     * @param {Array} systems - Per-system data with timeline and measureBoundaries
     */
    build(systems) {
        // --- Segments ---
        const segments = [];
        let cumulativeOffset = 0;
        for (const sys of systems) {
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

        // --- Flat waypoints ---
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

        // --- Sentinel for loop wraparound ---
        const grooveEndMs = (waypoints.length > 0)
            ? Math.max(...systems.flatMap(s => s.measureBoundaries.map(b => b.timeMs)))
            : 0;
        const firstNoteOffset = waypoints.length > 0 ? waypoints[0].absOffset : 0;
        const noteWaypointCount = waypoints.length;
        if (waypoints.length > 0) {
            waypoints.push({ timeMs: grooveEndMs, absOffset: firstNoteOffset });
        }

        // --- Thresholds ---
        const { thresholds, augmentedWaypoints } =
            this._computeThresholds(segments, waypoints, noteWaypointCount, totalWidth, grooveEndMs, firstNoteOffset);

        this._segments = segments;
        this._waypoints = augmentedWaypoints;
        this._totalWidth = totalWidth;
        this._thresholds = thresholds;
        this.cursor = 0;

        console.log(`[PlaylineInterpolator] Built ${thresholds.length} thresholds:`,
            thresholds.map(t => `M${t.measureIndex}@${t.timeMs.toFixed(1)}ms`).join(', '));
    }

    /**
     * Interpolate X position for an arbitrary time (linear scan).
     * Used by drawExtraHit for arbitrary-time lookups.
     * @returns {{ x: number, sys: Object } | null}
     */
    interpolate(timeMs) {
        const waypoints = this._waypoints;
        const totalWidth = this._totalWidth;
        if (waypoints.length === 0 || totalWidth === 0) return null;

        let left = null, right = null;
        for (const w of waypoints) {
            if (w.timeMs <= timeMs) left = w;
            else { right = w; break; }
        }
        if (!left || !right) return null;

        let rightOffset = right.absOffset;
        if (rightOffset < left.absOffset) rightOffset += totalWidth;

        const ratio = (timeMs - left.timeMs) / (right.timeMs - left.timeMs);
        const interpOffset = left.absOffset + ratio * (rightOffset - left.absOffset);
        const modOffset = ((interpOffset % totalWidth) + totalWidth) % totalWidth;

        return this._offsetToSystem(modOffset);
    }

    /**
     * Advance the cursor and interpolate (O(1) amortized).
     * Used by _tickPlayLine on the hot path.
     * @returns {{ x: number, sys: Object } | null}
     */
    interpolateWithCursor(timeMs) {
        const waypoints = this._waypoints;
        const totalWidth = this._totalWidth;
        if (waypoints.length === 0 || totalWidth === 0) return null;

        // Advance cursor to the last waypoint at or before timeMs
        while (this.cursor < waypoints.length - 1 &&
            waypoints[this.cursor + 1].timeMs <= timeMs) {
            this.cursor++;
        }

        const left = waypoints[this.cursor];
        const right = waypoints[this.cursor + 1];

        if (!left || !right || right.timeMs <= left.timeMs) return null;

        let rightOffset = right.absOffset;
        if (rightOffset < left.absOffset) rightOffset += totalWidth;

        const ratio = (timeMs - left.timeMs) / (right.timeMs - left.timeMs);
        const interpOffset = left.absOffset + ratio * (rightOffset - left.absOffset);
        const modOffset = ((interpOffset % totalWidth) + totalWidth) % totalWidth;

        return this._offsetToSystem(modOffset);
    }

    /**
     * Compute the modular measure index for a given time.
     * Uses the geometric barline thresholds so the result matches the
     * visual position of the playline.
     */
    getMeasureIndex(timeMs, totalDurationMs, measureDurationMs, totalMeasures) {
        if (measureDurationMs <= 0 || !totalDurationMs) return 0;
        const modularTime = ((timeMs % totalDurationMs) + totalDurationMs) % totalDurationMs;

        if (this._thresholds.length === 0) {
            return Math.floor(modularTime / measureDurationMs) % totalMeasures;
        }

        let measureIndex = 0;
        for (let i = this._thresholds.length - 1; i >= 0; i--) {
            if (modularTime >= this._thresholds[i].timeMs) {
                measureIndex = this._thresholds[i].measureIndex;
                break;
            }
        }
        return measureIndex;
    }

    /**
     * Map an absolute offset back to a system and local X coordinate.
     */
    _offsetToSystem(offset) {
        for (const seg of this._segments) {
            if (offset >= seg.offset && offset < seg.offset + seg.width) {
                return { x: seg.leftEdge + (offset - seg.offset), sys: seg.sys };
            }
        }
        const last = this._segments.at(-1);
        return { x: last.rightEdge, sys: last.sys };
    }

    /**
     * Compute measure-crossing thresholds by inverse-interpolating barline
     * positions through the waypoint strip.
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

                if (barlineOffset <= 0) continue;
                if (barlineOffset >= totalWidth) continue;

                let left = null, right = null;
                for (let i = 0; i < noteWaypointCount; i++) {
                    const w = waypoints[i];
                    if (w.absOffset <= barlineOffset) left = w;
                    else if (!right) right = w;
                }
                if (!left || !right || left.absOffset === right.absOffset) continue;

                const ratio = (barlineOffset - left.absOffset) / (right.absOffset - left.absOffset);
                const thresholdTimeMs = left.timeMs + ratio * (right.timeMs - left.timeMs);

                thresholds.push({
                    timeMs: thresholdTimeMs,
                    measureIndex: b.measureIndex,
                });

                if (!segmentBoundaryOffsets.has(barlineOffset)) {
                    waypoints.push({ timeMs: thresholdTimeMs, absOffset: barlineOffset });
                }
            }
        }

        // Measure 0 threshold (loop-point wraparound)
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

        waypoints.sort((a, b) => a.timeMs - b.timeMs);
        thresholds.sort((a, b) => a.timeMs - b.timeMs);

        const seen = new Set();
        const deduped = thresholds.filter(t => {
            if (seen.has(t.measureIndex)) return false;
            seen.add(t.measureIndex);
            return true;
        });

        return { thresholds: deduped, augmentedWaypoints: waypoints };
    }
}
