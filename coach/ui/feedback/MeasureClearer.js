/**
 * MeasureClearer — per-measure feedback circle removal.
 *
 * Clears old feedback circles before the playline crosses each barline.
 * Uses precomputed geometric thresholds from PlaylineInterpolator to
 * determine when to clear. Clearing is spatial: all circles whose cx
 * falls within the measure's X boundaries are removed from the DOM.
 *
 * ## Usage
 *
 *   const clearer = new MeasureClearer();
 *   clearer.init(systems, svgLayers, interpolator, measureDurationMs);
 *   clearer.schedule(startTimeMs);
 *   // In rAF loop:
 *   clearer.tick(timeMs, getMeasureIndex);
 */

// How far ahead (ms) of a measure boundary to clear the next measure.
// Derived dynamically as a fraction of measure duration, clamped to a sane range.
const CLEAR_AHEAD_FRACTION = 0.1;  // 10% of measure duration
const MIN_CLEAR_AHEAD_MS = 100;    // floor: never closer than 100ms
const MAX_CLEAR_AHEAD_MS = 400;    // ceiling: never earlier than 400ms

export class MeasureClearer {
    constructor() {
        this._systems = [];
        this._svgLayers = [];
        this._thresholds = [];
        this._thresholdCursor = 0;
        this._clearAheadMs = 0;
        this._measureDurationMs = 0;
    }

    /**
     * Bind to renderer state. Called once per groove load.
     * @param {Array} systems - Per-system rendering data (with measureBoundaries, layerIndex, etc.)
     * @param {Array} svgLayers - SVG layer elements [{svg, layer}, ...]
     * @param {Array} thresholds - Precomputed barline-crossing thresholds from PlaylineInterpolator
     * @param {number} measureDurationMs - Duration of one measure in ms
     */
    init(systems, svgLayers, thresholds, measureDurationMs) {
        this._systems = systems;
        this._svgLayers = svgLayers;
        this._thresholds = thresholds;
        this._measureDurationMs = measureDurationMs;
        this._thresholdCursor = 0;
        this._clearAheadMs = 0;
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
    schedule(startTimeMs = 0) {
        // Compute clear-ahead from measure duration: 10% clamped to [100, 400]ms
        this._clearAheadMs = Math.max(
            MIN_CLEAR_AHEAD_MS,
            Math.min(MAX_CLEAR_AHEAD_MS, this._measureDurationMs * CLEAR_AHEAD_FRACTION)
        );

        // Find first threshold whose clear time (threshold - clearAheadMs)
        // is still in the future relative to startTimeMs
        const idx = this._thresholds.findIndex(t => t.timeMs - this._clearAheadMs > startTimeMs);
        this._thresholdCursor = idx >= 0 ? idx : this._thresholds.length;


    }

    /**
     * Advance through thresholds and clear measures as needed.
     * Called once per rAF tick from Renderer._tickPlayLine.
     *
     * @param {number} timeMs - Current playback time
     * @param {function} getMeasureIndex - Callback to get current measure index for self-loop detection
     */
    tick(timeMs, getMeasureIndex) {
        while (this._thresholdCursor < this._thresholds.length) {
            const t = this._thresholds[this._thresholdCursor];
            // When the destination measure is the same as the current measure
            // (self-loop, e.g. single-measure grooves), don't clear ahead —
            // we'd wipe circles we're still actively drawing.
            const currentMeasure = getMeasureIndex(timeMs);
            const ahead = (t.measureIndex === currentMeasure) ? 0 : this._clearAheadMs;
            if (timeMs >= t.timeMs - ahead) {
                this._clearRegion(t.measureIndex);
                this._thresholdCursor++;
            } else {
                break; // remaining thresholds are in the future
            }
        }
    }

    /**
     * Remove all feedback circles whose cx falls within the X boundaries
     * of the given measure. Finds the measure in the correct system and
     * layer automatically.
     */
    _clearRegion(measureIndex) {
        for (const sys of this._systems) {
            const bounds = sys.measureBoundaries;
            const localIdx = measureIndex - (sys.measureOffset || 0);
            if (localIdx < 0 || localIdx >= sys.numMeasures) continue;

            const leftX = bounds[localIdx].x;
            const rightX = (localIdx + 1 < bounds.length)
                ? bounds[localIdx + 1].x
                : Infinity;  // last measure extends to right edge

            const layer = this._svgLayers[sys.layerIndex]?.layer;
            if (!layer) continue;

            let removed = 0;
            layer.querySelectorAll('.coach-hit-marker').forEach(el => {
                const cx = parseFloat(el.getAttribute('cx'));
                if (cx >= leftX && cx < rightX) {
                    el.remove();
                    removed++;
                }
            });

        }
    }
}
