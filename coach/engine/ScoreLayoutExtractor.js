/**
 * ScoreLayoutExtractor - Hooks into abc2svg to extract precise coordinates
 * for chord positions, measure boundaries, and system layout.
 *
 * Multi-system aware: detects system (line) breaks by monitoring when
 * annotation X positions reset from right edge back to the left margin.
 * abc2svg fires all anno_stop callbacks synchronously before emitting
 * SVG output, so SVG-boundary detection via img_out is not possible.
 *
 * All annotations (notes, bars, headers) are collected into a single
 * ordered stream and split into systems during getSniffedData().
 */
import { DrumType } from './DrumConstants.js';

const BASE_STAFF_STEP = 6;

/**
 * Y offset in half-gaps from topY for each drum type.
 * One half-gap = scaledStep / 2 (half the distance between two staff lines).
 * Derived from abc2svg's %%map print positions in groove_utils.js.
 *
 *   0 = top staff line (f)
 *   positive = downward, negative = upward
 *   2 half-gaps = one full staff-line gap
 *   8 = bottom staff line (E)
 */
const NOTE_Y_OFFSETS = {
    // Cymbals / above staff
    [DrumType.CRASH]: -4,         // ^c' → print=c'
    [DrumType.STACKER]: -5,       // ^d' → print=d'
    [DrumType.RIDE]: -2,          // ^A' → print=A'
    [DrumType.RIDE_BELL]: -2,     // ^B' → print=A'
    [DrumType.HH_CLOSED]: -1,     // ^g  → print=g
    [DrumType.HH_OPEN]: -1,
    [DrumType.HH_ACCENT]: -1,
    [DrumType.COWBELL]: -1,        // ^D' → print=g

    // Metronome (above staff)
    [DrumType.METRONOME_NORMAL]: -6,   // ^e' → print=e'
    [DrumType.METRONOME_ACCENT]: -7,   // ^f' → print=f'

    // Toms
    [DrumType.TOM_HIGH]: 1,       // e  (1st space below top line)
    [DrumType.TOM_LOW]: 5,        // A  (3rd space)

    // Snare (all articulations print at 'c' = 2nd space)
    [DrumType.SNARE]: 3,
    [DrumType.SNARE_GHOST]: 3,
    [DrumType.SNARE_XSTICK]: 3,    // ^c → print=c
    [DrumType.SNARE_FLAM]: 3,
    [DrumType.SNARE_BUZZ]: 3,
    [DrumType.SNARE_ACCENT]: 3,
    [DrumType.FLAM_GRACE]: 3,      // same Y as its main snare note

    // Feet
    [DrumType.KICK]: 7,           // F  (4th space)
    [DrumType.HH_FOOT]: 9,        // ^d, → print=d,
};

export class ScoreLayoutExtractor {
    constructor() {
        console.log('[ScoreLayoutExtractor] Instance created');
        this._initData();
        this.abcIndexCount = 0;
        this.lastNoteX = -100;
        this.abc = null;
        this._originals = null;
    }

    _initData() {
        this.data = {
            // Ordered stream of all annotation events
            events: [],    // { kind, ... } — kind: 'note'|'bar'|'clef'|'key'|'meter'
            engineWidth: 0,
            scaledStep: 0  // Scaled vertical step (one staff-line gap in SVG pixels), captured during annotation
        };
    }

    _computeTopY(s) {
        if (!this.abc) return null;
        try {
            const stb = this.abc.get_staff_tb();
            const st = (s && s.st !== undefined) ? s.st : 0;
            if (!stb || !stb[st]) return null;
            return this.abc.ay(stb[st].y + stb[st].topbar);
        } catch (e) {
            return null;
        }
    }


    hook(abc) {
        if (!abc) {
            console.warn('[ScoreLayoutExtractor] hook(abc) called with null abc object');
            return;
        }

        this.abc = abc;
        const target = abc.user || abc;
        const self = this;

        if (!this._originals) {
            this._originals = {
                anno_start: typeof target.anno_start === 'function' ? target.anno_start : null,
                anno_stop: typeof target.anno_stop === 'function' ? target.anno_stop : null
            };
            console.log('[ScoreLayoutExtractor] Captured original callback functions');
        }

        const orig_anno_start = this._originals.anno_start;
        target.anno_start = function (type, start, stop, x, y, w, h, s) {
            if (orig_anno_start) {
                return orig_anno_start.call(this, type, start, stop, x, y, w, h, s);
            }
        };

        const orig_anno_stop = this._originals.anno_stop;
        target.anno_stop = function (type, start, stop, x, y, w, h, s) {
            const ayTopY = self._computeTopY(s);

            if (type === "bar") {
                const barX = s ? s.x : (x + w / 2);
                self.data.events.push({ kind: 'bar', x: barX, topY: ayTopY });
            }

            if (type === "clef" || type === "key" || type === "meter") {
                self.data.events.push({ kind: type, x, w, topY: ayTopY });
            }

            if (type === "note" || type === "grace") {
                // For grace notes, s.x gives the parent note's position;
                // s.extra.x gives the actual grace note head position.
                const preciseX = (type === "grace" && s && s.extra)
                    ? s.extra.x
                    : (s ? s.x : (x + w / 2));

                // Raw bounding-box center (internal coords); not used in output.
                // Y for each drum type is computed from NOTE_Y_OFFSETS in _buildNoteYs().
                const noteYCenter = y + h / 2;

                // Capture the scaled vertical step (one staff-line gap in SVG pixels)
                const scaledStep = self.abc.ah(BASE_STAFF_STEP);
                if (scaledStep > 0) {
                    self.data.scaledStep = scaledStep;
                }

                if (type !== "grace") {
                    if (Math.abs(preciseX - self.lastNoteX) > 2) {
                        if (self.lastNoteX !== -100) self.abcIndexCount++;
                        self.lastNoteX = preciseX;
                    }
                }

                self.data.events.push({
                    kind: 'note',
                    type: type,
                    x: preciseX,
                    y: noteYCenter,
                    w: w,
                    h: h,
                    abcIndex: self.abcIndexCount,
                    isGrace: type === "grace",
                    topY: ayTopY
                });
            }

            if (orig_anno_stop) {
                return orig_anno_stop.call(this, type, start, stop, x, y, w, h, s);
            }
        };
    }

    reset(startIndex = 0) {
        console.log(`[ScoreLayoutExtractor] Resetting data. Previous events: ${this.data.events.length}. New startIndex: ${startIndex}`);
        this._initData();

        try {
            const abcElement = document.getElementById("ABCsource");
            if (abcElement && abcElement.value) {
                const widthMatch = abcElement.value.match(/%%pagewidth\s+(\d+)/);
                if (widthMatch && widthMatch[1]) {
                    this.data.engineWidth = parseFloat(widthMatch[1]);
                }
            }
        } catch (e) {
            console.error('[ScoreLayoutExtractor] Error parsing ABC source:', e);
        }

        this.abcIndexCount = startIndex;
        this.lastNoteX = -100;
    }

    incrementAbcIndex() {
        this.abcIndexCount++;
    }

    /**
     * Splits the event stream into systems based on X-position resets.
     * When any annotation's X drops significantly (right edge → left margin),
     * a new system begins. Notes, bars, and headers are all split together.
     */
    _splitIntoSystems() {
        const events = this.data.events;
        if (events.length === 0) return [];

        const systems = [];
        let current = { chords: [], bars: [], clefRightX: null, keyRightX: null, meterLeftX: null, topY: null };
        let maxNoteX = -Infinity;
        // Pending buffer: holds non-note events that arrive after the last note
        // of the current system but before the first note of the next system.
        // When a system break is detected, these are moved to the new system.
        let pending = { bars: [], clefRightX: null, keyRightX: null, meterLeftX: null };

        const threshold = (this.data.engineWidth > 100)
            ? this.data.engineWidth * 0.3
            : 200;

        const applyPending = (target) => {
            for (const b of pending.bars) {
                if (!target.bars.some(tb => Math.abs(tb.x - b.x) < 5)) {
                    target.bars.push(b);
                }
            }
            if (pending.clefRightX !== null) target.clefRightX = pending.clefRightX;
            if (pending.keyRightX !== null) target.keyRightX = pending.keyRightX;
            if (pending.meterLeftX !== null) target.meterLeftX = pending.meterLeftX;
            pending = { bars: [], clefRightX: null, keyRightX: null, meterLeftX: null };
        };

        for (const evt of events) {
            const evtX = evt.x;

            if (evt.kind === 'note') {
                // Detect system break: note X dropped significantly
                if (evtX < maxNoteX - threshold && current.chords.length > 0) {
                    systems.push(current);
                    current = { chords: [], bars: [], clefRightX: null, keyRightX: null, meterLeftX: null, topY: null };
                    maxNoteX = -Infinity;
                }
                // Flush pending into current (possibly the new system)
                applyPending(current);

                current.chords.push(evt);
                if (evt.topY !== null && current.topY === null) {
                    current.topY = evt.topY;
                }
                if (evtX > maxNoteX) maxNoteX = evtX;
            } else {
                // All non-note events (bar, clef, key, meter) go to pending.
                // abc2svg emits bars BEFORE notes for each system, so pending
                // naturally groups with the next note's system.
                if (evt.kind === 'bar') {
                    pending.bars.push({ x: evtX, time: 0 });
                } else if (evt.kind === 'clef') {
                    pending.clefRightX = evt.x + evt.w;
                } else if (evt.kind === 'key') {
                    pending.keyRightX = evt.x + evt.w;
                } else if (evt.kind === 'meter') {
                    pending.meterLeftX = evt.x;
                }
            }
        }

        // Flush any remaining pending events (e.g. final barline of the score)
        applyPending(current);
        if (current.chords.length > 0 || current.bars.length > 0) {
            systems.push(current);
        }

        return systems;
    }

    /**
     * Returns the parsed layout data for the current score.
     *
     * Returned structure:
     * {
     *   verticalStep: number,           // One staff-line gap in SVG pixels (scaled)
     *   systems: [                      // One entry per visual system (line of music)
     *     {
     *       svgIndex: number,           // Which DOM SVG element this system lives in; needed to
     *                                    // draw feedback layers on top of the correct system.
     *       topY: number,               // SVG Y of the top staff line
     *       measureOffset: number,      // Global measure index of this system's first measure
     *       chords: [                   // A chord groups all simultaneous (unison) notes (e.g. hi-hat + snare)
     *         {
     *           x: number,              // SVG X coordinate of this chord position. Use this for horizontal positioning.
     *           abcIndex: number,       // Sequential index, used to match with engine timeline
     *           isGrace: boolean        // true for grace notes (flam ornaments)
     *         }
     *       ],
     *       measureBoundaries: [        // Measure boundary X positions, sorted left-to-right
     *         { x: number }
     *       ],
     *       noteYs: {                   // SVG Y coordinate for each DrumType, precomputed from staff topY
     *         [DrumType]: number        // and NOTE_Y_OFFSETS. Use this for vertical positioning.
     *       }
     *     }
     *   ]
     * }
     */
    getSniffedData() {
        // Use the scaled step captured during annotation callbacks,
        // falling back to the raw BASE_STAFF_STEP if not yet captured.
        const step = this.data.scaledStep || BASE_STAFF_STEP;
        const systems = this._splitIntoSystems();

        console.log(`[ScoreLayoutExtractor] Split into ${systems.length} systems from ${this.data.events.length} events`);

        let globalMeasureOffset = 0;
        let legendCount = 0;

        const systems2 = systems.map((system, idx) => {
            // Filter out legend systems: all chords have negative abcIndex
            if (system.chords.length > 0 && system.chords.every(n => n.abcIndex < 0)) {
                console.log(`[ScoreLayoutExtractor] Filtering legend system #${idx} (${system.chords.length} chords with negative abcIndex)`);
                legendCount++;
                return null;
            }
            if (system.chords.length === 0 && system.bars.length === 0) {
                console.log(`[ScoreLayoutExtractor] Filtering empty system #${idx}`);
                legendCount++;
                return null;
            }

            let m0X = null;
            if (typeof system.meterLeftX === 'number') m0X = system.meterLeftX;
            else if (typeof system.clefRightX === 'number') m0X = system.clefRightX;
            else if (typeof system.keyRightX === 'number') m0X = system.keyRightX;

            const sortedBars = [...system.bars].sort((a, b) => a.x - b.x);
            const boundaries = [];
            if (m0X !== null) boundaries.push({ x: m0X });
            for (const b of sortedBars) boundaries.push({ x: b.x });

            const result = {
                svgIndex: legendCount + (idx - legendCount),
                topY: system.topY,
                measureOffset: globalMeasureOffset,
                chords: system.chords.map(n => ({
                    x: n.x,
                    abcIndex: n.abcIndex,
                    isGrace: n.isGrace
                })),
                measureBoundaries: boundaries,
                // Precomputed SVG Y for each DrumType on this staff
                noteYs: this._buildNoteYs(system.topY, step)
            };

            globalMeasureOffset += boundaries.length;
            return result;
        }).filter(s => s !== null);

        // Assign svgIndex by position after filtering
        for (let i = 0; i < systems2.length; i++) {
            systems2[i].svgIndex = legendCount + i;
        }

        const result = { verticalStep: step, systems: systems2 };

        const totalChords = systems2.reduce((sum, s) => sum + s.chords.length, 0);
        const totalBoundaries = systems2.reduce((sum, s) => sum + s.measureBoundaries.length, 0);

        for (let i = 0; i < systems2.length; i++) {
            const s = systems2[i];
            console.log(`[ScoreLayoutExtractor] System #${i + 1}: svgIndex=${s.svgIndex}, topY=${s.topY !== null ? s.topY.toFixed(1) : 'null'}, ${s.chords.length} chords, ${s.measureBoundaries.length} boundaries`);
        }
        console.log(`[ScoreLayoutExtractor] Total: ${systems2.length} systems, ${totalChords} chords, ${totalBoundaries} boundaries`);

        return result;
    }

    /**
     * Build a map of DrumType → SVG Y for a given system.
     * @param {number} topY - SVG Y of the top staff line
     * @param {number} step - Vertical step (one staff-line gap in SVG pixels)
     * @returns {Object} { [DrumType]: number }
     */
    _buildNoteYs(topY, step) {
        const halfStep = step / 2;
        const ys = {};
        for (const [drumType, offset] of Object.entries(NOTE_Y_OFFSETS)) {
            ys[drumType] = topY + offset * halfStep;
        }
        return ys;
    }
}

export const scoreLayoutExtractor = new ScoreLayoutExtractor();
window.scoreLayout = scoreLayoutExtractor;
console.log('[ScoreLayoutExtractor] Module loaded and instance exposed to window');
