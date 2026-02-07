/**
 * ScoreLayout - Hooks into abc2svg to extract precise coordinates
 * for notes, measure boundaries, and staff positions.
 * (Refactored from NotationSniffer for abc2svg v1.22.1)
 *
 * Multi-system aware: dynamically detects visual systems (line breaks)
 * using abc.ay() to convert staff_tb coordinates to SVG space during
 * the anno_stop callback. Each visual system gets its own topY, notes,
 * and boundaries.
 */
// 6pt matches standard abc2svg line spacing (with scale=1.0)
const BASE_STAFF_STEP = 6;

export class ScoreLayout {
    constructor() {
        console.log('[ScoreLayout] Instance created');
        this._initData();
        this.abcIndexCount = 0;
        this.lastNoteX = -100;
        this.abc = null; // Reference to abc2svg engine
    }

    _initData() {
        this.data = {
            systems: [],   // Per-system: { topY, notes: [], bars: [], meterLeftX, clefRightX, keyRightX }
            engineWidth: 0
        };
    }

    /**
     * Returns or creates the current system entry based on the current staff's
     * absolute SVG Y position (detected via abc.ay())
     */
    _getOrCreateSystem(ayTopY) {
        // Round to integer to avoid float drift between notes in the same system
        const key = Math.round(ayTopY);

        // Check if we already have a system at this Y position
        let system = this.data.systems.find(sys => Math.abs(Math.round(sys.topY) - key) < 2);
        if (!system) {
            system = {
                topY: ayTopY,
                notes: [],
                bars: [],
                meterLeftX: null,
                clefRightX: null,
                keyRightX: null
            };
            this.data.systems.push(system);
            console.log(`[ScoreLayout] New system #${this.data.systems.length} detected at topY=${ayTopY.toFixed(1)}`);
        }
        return system;
    }

    /**
     * Computes the absolute SVG Y for the top staff line of the given staff index.
     * Uses abc.ay() which accounts for the current posy offset during rendering.
     */
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

    /**
     * Hooks an abc2svg instance to capture coordinates during render
     */
    hook(abc) {
        if (!abc) {
            console.warn('[ScoreLayout] hook(abc) called with null abc object');
            return;
        }
        // Use a property on the target object to survive HMR/module reloads
        if (abc.__scoreLayoutHooked) return;
        abc.__scoreLayoutHooked = true;
        this.abc = abc;

        console.log('[ScoreLayout] Hooking into abc2svg engine instance');

        const self = this;

        const targets = [abc];
        if (abc.user) targets.push(abc.user);

        targets.forEach(target => {
            const original_anno_start = target.anno_start;
            target.anno_start = function (type, start, stop, x, y, w, h, s) {
                if (original_anno_start) {
                    return original_anno_start.call(this, type, start, stop, x, y, w, h, s);
                }
            };

            const original_anno_stop = target.anno_stop;
            target.anno_stop = function (type, start, stop, x, y, w, h, s) {
                // Detect the current system using abc.ay()
                const ayTopY = self._computeTopY(s);
                const system = (ayTopY !== null) ? self._getOrCreateSystem(ayTopY) : null;

                if (type === "bar") {
                    const barX = s ? s.x : (x + w / 2);
                    if (system) {
                        if (!system.bars.some(b => Math.abs(b.x - barX) < 5)) {
                            system.bars.push({ x: barX, time: 0 });
                        }
                    }
                }

                // Capture header elements for M0 alignment (assigned to current system)
                if (type === "clef" && system) {
                    system.clefRightX = x + w;
                }
                if (type === "key" && system) {
                    system.keyRightX = x + w;
                }
                if (type === "meter" && system) {
                    system.meterLeftX = x;
                }

                if (type === "note" || type === "grace") {
                    const preciseX = s ? s.x : (x + w / 2);
                    const noteYCenter = y + h / 2;

                    // Chord Grouping Logic
                    if (type !== "grace") {
                        if (Math.abs(preciseX - self.lastNoteX) > 2) {
                            if (self.lastNoteX !== -100) self.abcIndexCount++;
                            self.lastNoteX = preciseX;
                        }
                    }

                    const noteData = {
                        type: type,
                        x: preciseX,
                        y: noteYCenter,
                        w: w,
                        h: h,
                        abcIndex: self.abcIndexCount,
                        isGrace: type === "grace"
                    };

                    if (system) {
                        system.notes.push(noteData);
                    }
                }

                if (original_anno_stop) {
                    return original_anno_stop.call(this, type, start, stop, x, y, w, h, s);
                }
            };
        });
    }

    /**
     * Resets the data
     */
    reset(startIndex = 0) {
        console.log(`[ScoreLayout] Resetting data. Previous systems: ${this.data.systems.length}. New startIndex: ${startIndex}`);
        this._initData();

        // Parse pagewidth from source if available
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

    getSniffedData() {
        const step = BASE_STAFF_STEP;

        // Preserve insertion order — it matches SVG DOM order (one SVG per system).
        // Do NOT sort by topY: each topY is relative to its own SVG's coordinate space.
        let globalMeasureOffset = 0;

        const staffs = this.data.systems.map(system => {
            // Pre-calculate M0 boundary for this system
            let m0X = null;
            if (typeof system.meterLeftX === 'number') m0X = system.meterLeftX;
            else if (typeof system.clefRightX === 'number') m0X = system.clefRightX;
            else if (typeof system.keyRightX === 'number') m0X = system.keyRightX;

            // Build boundaries
            const sortedBars = [...system.bars].sort((a, b) => a.x - b.x);
            const boundaries = [];
            if (m0X !== null) boundaries.push({ x: m0X });
            for (const b of sortedBars) boundaries.push({ x: b.x });

            const result = {
                topY: system.topY,
                measureOffset: globalMeasureOffset,
                notes: system.notes.map(n => ({
                    x: n.x, y: n.y,
                    abcIndex: n.abcIndex,
                    isGrace: n.isGrace
                })),
                boundaries: boundaries
            };

            // Each system's boundaries represent measures; advance global offset
            globalMeasureOffset += boundaries.length;

            return result;
        });

        const result = { verticalStep: step, staffs };

        const totalNotes = staffs.reduce((sum, s) => sum + s.notes.length, 0);
        const totalBoundaries = staffs.reduce((sum, s) => sum + s.boundaries.length, 0);

        // Verification logging
        for (let i = 0; i < staffs.length; i++) {
            const s = staffs[i];
            const ys = s.notes.map(n => n.y);
            const minY = ys.length ? Math.min(...ys).toFixed(1) : 'n/a';
            const maxY = ys.length ? Math.max(...ys).toFixed(1) : 'n/a';
            console.log(`[ScoreLayout] System #${i + 1}: topY=${s.topY.toFixed(1)}, ${s.notes.length} notes (Y: ${minY}-${maxY}), ${s.boundaries.length} boundaries`);
        }
        console.log(`[ScoreLayout] Total: ${staffs.length} systems, ${totalNotes} notes, ${totalBoundaries} boundaries`);

        return result;
    }
}

export const scoreLayout = new ScoreLayout();
window.scoreLayout = scoreLayout;
console.log('[ScoreLayout] Module loaded and instance exposed to window');
