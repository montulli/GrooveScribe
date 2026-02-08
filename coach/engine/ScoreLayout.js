/**
 * ScoreLayout - Hooks into abc2svg to extract precise coordinates
 * for notes, measure boundaries, and staff positions.
 * (Refactored from NotationSniffer for abc2svg v1.22.1)
 *
 * Multi-system aware: detects system (line) breaks by monitoring when
 * annotation X positions reset from right edge back to the left margin.
 * abc2svg fires all anno_stop callbacks synchronously before emitting
 * SVG output, so SVG-boundary detection via img_out is not possible.
 *
 * All annotations (notes, bars, headers) are collected into a single
 * ordered stream and split into systems during getSniffedData().
 */
const BASE_STAFF_STEP = 6;

export class ScoreLayout {
    constructor() {
        console.log('[ScoreLayout] Instance created');
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
            engineWidth: 0
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
            console.warn('[ScoreLayout] hook(abc) called with null abc object');
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
            console.log('[ScoreLayout] Captured original callback functions');
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
                const noteYCenter = y + h / 2;

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
        console.log(`[ScoreLayout] Resetting data. Previous events: ${this.data.events.length}. New startIndex: ${startIndex}`);
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
            console.error('[ScoreLayout] Error parsing ABC source:', e);
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
        let current = { notes: [], bars: [], clefRightX: null, keyRightX: null, meterLeftX: null, topY: null };
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
                if (evtX < maxNoteX - threshold && current.notes.length > 0) {
                    systems.push(current);
                    current = { notes: [], bars: [], clefRightX: null, keyRightX: null, meterLeftX: null, topY: null };
                    maxNoteX = -Infinity;
                }
                // Flush pending into current (possibly the new system)
                applyPending(current);

                current.notes.push(evt);
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
        if (current.notes.length > 0 || current.bars.length > 0) {
            systems.push(current);
        }

        return systems;
    }

    getSniffedData() {
        const step = BASE_STAFF_STEP;
        const systems = this._splitIntoSystems();

        console.log(`[ScoreLayout] Split into ${systems.length} systems from ${this.data.events.length} events`);

        let globalMeasureOffset = 0;
        let legendCount = 0;

        const staffs = systems.map((system, idx) => {
            // Filter out legend systems: all notes have negative abcIndex
            if (system.notes.length > 0 && system.notes.every(n => n.abcIndex < 0)) {
                console.log(`[ScoreLayout] Filtering legend system #${idx} (${system.notes.length} notes with negative abcIndex)`);
                legendCount++;
                return null;
            }
            if (system.notes.length === 0 && system.bars.length === 0) {
                console.log(`[ScoreLayout] Filtering empty system #${idx}`);
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
                notes: system.notes.map(n => ({
                    x: n.x, y: n.y,
                    abcIndex: n.abcIndex,
                    isGrace: n.isGrace
                })),
                boundaries: boundaries
            };

            globalMeasureOffset += boundaries.length;
            return result;
        }).filter(s => s !== null);

        // Assign svgIndex by position after filtering
        for (let i = 0; i < staffs.length; i++) {
            staffs[i].svgIndex = legendCount + i;
        }

        const result = { verticalStep: step, staffs };

        const totalNotes = staffs.reduce((sum, s) => sum + s.notes.length, 0);
        const totalBoundaries = staffs.reduce((sum, s) => sum + s.boundaries.length, 0);

        for (let i = 0; i < staffs.length; i++) {
            const s = staffs[i];
            const ys = s.notes.map(n => n.y);
            const minY = ys.length ? Math.min(...ys).toFixed(1) : 'n/a';
            const maxY = ys.length ? Math.max(...ys).toFixed(1) : 'n/a';
            console.log(`[ScoreLayout] System #${i + 1}: svgIndex=${s.svgIndex}, topY=${s.topY !== null ? s.topY.toFixed(1) : 'null'}, ${s.notes.length} notes (Y: ${minY}-${maxY}), ${s.boundaries.length} boundaries`);
        }
        console.log(`[ScoreLayout] Total: ${staffs.length} systems, ${totalNotes} notes, ${totalBoundaries} boundaries`);

        return result;
    }
}

export const scoreLayout = new ScoreLayout();
window.scoreLayout = scoreLayout;
console.log('[ScoreLayout] Module loaded and instance exposed to window');
