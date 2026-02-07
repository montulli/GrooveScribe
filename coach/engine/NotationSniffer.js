/**
 * NotationSniffer - Hooks into abc2svg to extract precise coordinates
 * for notes, measure boundaries, and staff positions.
 */
// 72pt / 96px - matches 'scale: .75' default in abc2svg-1.js cfmt configuration
// which converts internal points (1/72") to screen pixels (1/96")
const DEFAULT_SCALE = 0.75;
// 6pt matches standard abc2svg line spacing
const BASE_STAFF_STEP = 6;

// 61pt = 12pt (Half-staff) + 46pt (staffsep) + 3pt (margin)
const BASE_STAFF_Y_OFFSET = 12 + 46 + 3;

export class NotationSniffer {
    constructor() {
        console.log('[NotationSniffer] Instance created');
        this.data = {
            notes: [],    // { x, p, time, abcIndex, type }
            bars: [],     // { x, time }
            staffY: 0,
            yLevels: [],
            engineWidth: 0
        };
        this.abcIndexCount = 0;
        this.lastNoteX = -100;
        this.staffY_candidates = [];
        this.__hookedObjects = new WeakSet();
    }

    /**
     * Hooks an abc2svg instance to capture coordinates during render
     */
    hook(abc) {
        if (!abc) {
            console.warn('[NotationSniffer] hook(abc) called with null abc object');
            return;
        }
        // Use a property on the target object to survive HMR/module reloads
        if (abc.__notationSnifferHooked) return;
        abc.__notationSnifferHooked = true;

        console.log('[NotationSniffer] Hooking into abc2svg engine instance');

        const self = this;
        let activeNoteSym = null;

        // Hook all methods on both the engine AND the printer (abc.user)
        const targets = [abc];
        if (abc.user) targets.push(abc.user);

        targets.forEach(target => {
            // 1. Hook draw_sym to capture raw symbol coordinates
            const original_draw_sym = target.draw_sym;
            target.draw_sym = function (sym) {
                if (sym.type === "bar") {
                    // Deduplicate bars
                    if (!self.data.bars.some(b => Math.abs(b.x - sym.x) < 5)) {
                        console.log(`[NotationSniffer] BAR detected: x=${sym.x.toFixed(2)}`);
                        self.data.bars.push({
                            x: sym.x,
                            time: sym.time
                        });
                    }
                } else if (sym.type === "note" || sym.grace) {
                    activeNoteSym = { x: sym.x, y: sym.y, type: sym.type, isGrace: !!sym.grace };
                    // Log to see if coordinates differ between engine and printer
                    if (target === abc.user) {
                        console.log(`[NotationSniffer] PRINTER draw_sym ${sym.type || 'grace'}: x=${sym.x.toFixed(2)}`);
                    }
                }

                if (original_draw_sym) {
                    return original_draw_sym.call(this, sym);
                }
            };

            const original_anno_start = target.anno_start;
            target.anno_start = function (type, start, stop, x, y, w, h) {
                if (type === "note" || type === "grace") {
                    activeNoteSym = null;
                }
                if (original_anno_start) {
                    return original_anno_start.call(this, type, start, stop, x, y, w, h);
                }
            };

            const original_anno_stop = target.anno_stop;
            target.anno_stop = function (type, start, stop, x, y, w, h) {
                const scale = self.data.scale || DEFAULT_SCALE;

                if (type === "bar") {
                    // anno_stop x = s.x - s.wl - 2 (left edge), w = s.wl + s.wr + 4
                    // Adjust for asymmetric padding (wr > wl) causing rightward shift.
                    // Compensate by shifting left (User observed 1-2pt bias).
                    const barCenterX = (x + w / 2 - 1.5) * scale;
                    if (!self.data.bars.some(b => Math.abs(b.x - barCenterX) < (5 * scale))) {
                        self.data.bars.push({ x: barCenterX, time: 0 });
                    }
                }

                // Capture header elements for M0 alignment
                if (type === "clef") {
                    self.data.clefRightX = (x + w) * scale;
                }
                if (type === "key") {
                    self.data.keyRightX = (x + w) * scale;
                }
                if (type === "meter") {
                    self.data.meterLeftX = x * scale;
                }

                if (type === "note" || type === "grace") {
                    const preciseX = (activeNoteSym && Math.abs(activeNoteSym.x - x) < w * 2) ? activeNoteSym.x : (x + w / 2);

                    // Anchor staffY immediately on first valid note
                    self.staffY_candidates.push(y);
                    const sorted = [...self.staffY_candidates].sort((a, b) => a - b);
                    const newStaffY = sorted[Math.floor(sorted.length / 2)];

                    if (newStaffY !== self.data.staffY) {
                        // Use constants derived from scale
                        const offset = BASE_STAFF_Y_OFFSET * scale;
                        const step = BASE_STAFF_STEP * scale;

                        self.data.staffY = (newStaffY * scale) + offset;
                        self.data.yLevels = [];
                        for (let i = -4; i <= 14; i++) {
                            self.data.yLevels.push(self.data.staffY + (i * step));
                        }
                        console.log('[NotationSniffer] staffY anchored/updated at:', self.data.staffY.toFixed(2));
                    }

                    // Chord Grouping Logic:
                    // If this note is at the same X (within 2px) as the previous one,
                    // it belongs to the same abcIndex (same beat/chord).
                    if (type !== "grace") {
                        if (Math.abs(preciseX - self.lastNoteX) > 2) {
                            if (self.lastNoteX !== -100) self.abcIndexCount++;
                            self.lastNoteX = preciseX;
                        }
                    }

                    console.log(`[NotationSniffer] ${type.toUpperCase()} caught: x=${preciseX.toFixed(2)}, abcIndex=${self.abcIndexCount}`);

                    self.data.notes.push({
                        type: type,
                        x: preciseX * scale,
                        y: (y + h / 2) * scale,
                        w: w * scale,
                        h: h * scale,
                        abcIndex: self.abcIndexCount,
                        isGrace: type === "grace"
                    });
                }

                if (original_anno_stop) {
                    return original_anno_stop.call(this, type, start, stop, x, y, w, h);
                }
            };
        });

        const original_stop_page = abc.stop_page || (abc.user && abc.user.stop_page);
        const stop_page_target = abc.stop_page ? abc : abc.user;

        if (stop_page_target) {
            stop_page_target.stop_page = function () {
                console.log('[NotationSniffer] stop_page called. Capturing layout dimensions.');

                // 1. Try internal properties (best effort debug)
                if (abc.cf) {
                    // console.log(`[NotationSniffer] Internal cf: pw=${abc.cf.pagewidth} lm=${abc.cf.leftmargin} rm=${abc.cf.rightmargin}`);
                }

                const scale = self.data.scale || DEFAULT_SCALE;
                const rawY = abc.y || (abc.user && abc.user.y) || 0;
                self.data.staffY = rawY * scale;
                self.data.step = BASE_STAFF_STEP * scale;

                if (original_stop_page) {
                    return original_stop_page.call(this);
                }
            };
        }
    }

    /**
     * Resets the sniffer data
     */
    reset(startIndex = 0) {
        console.log(`[NotationSniffer] Resetting data. Current bar count was: ${this.data.bars.length}. New startIndex: ${startIndex}`);
        this.data = {
            notes: [],
            bars: [],
            staffY: 0,
            yLevels: [],
            engineWidth: 0,
            scale: DEFAULT_SCALE
        };

        // 2. SOURCE OF TRUTH: Parse the ABC Source directly
        // We do this at reset() because ABCsource is already populated before render starts.
        try {
            const abcElement = document.getElementById("ABCsource");
            if (abcElement && abcElement.value) {
                // Parse pagewidth
                const widthMatch = abcElement.value.match(/%%pagewidth\s+(\d+)/);
                if (widthMatch && widthMatch[1]) {
                    const parsedWidth = parseFloat(widthMatch[1]);
                    this.data.engineWidth = parsedWidth;
                    console.log(`[NotationSniffer] Parsed %%pagewidth from source (during reset): ${parsedWidth}`);
                }

                // Parse scale
                const scaleMatch = abcElement.value.match(/%%scale\s+([0-9.]+)/);
                if (scaleMatch && scaleMatch[1]) {
                    const parsedScale = parseFloat(scaleMatch[1]);
                    this.data.scale = parsedScale;
                    console.log(`[NotationSniffer] Parsed %%scale from source (during reset): ${parsedScale}`);
                }
            } else {
                console.warn('[NotationSniffer] ABCsource element not found (during reset)');
            }
        } catch (e) {
            console.error('[NotationSniffer] Error parsing ABC source:', e);
        }

        this.abcIndexCount = startIndex;
        this.lastNoteX = -100;
    }

    /**
     * Increment the abcIndex counter
     * This should be called when an annotation is processed for a note
     */
    incrementAbcIndex() {
        this.abcIndexCount++;
    }

    /**
     * The sniffer extracts a structure designed for the FeedbackRenderer.
     * Coordinates are in screen pixels.
     *
     * {
     *   verticalStep: number, // Distance in pixels for one pitch step (half a staff line spacing)
     *   staffs: [
     *     {
     *       topY: number,     // Y position of the top line of this staff
     *       notes: [          // Notes belonging to this staff
     *         {
     *           x: number,
     *           y: number,
     *           abcIndex: number,
     *           isGrace: boolean
     *         }
     *       ],
     *       boundaries: [     // Measure boundaries (bar lines) on this staff
     *         {
     *           x: number,
     *           measureIndex: number // (Assigned by Renderer)
     *         }
     *       ]
     *     },
     *     ... // Additional staffs for system breaks
     *   ]
     * }
     */
    getSniffedData() {
        const scale = this.data.scale || DEFAULT_SCALE;
        const step = BASE_STAFF_STEP * scale;

        // Pre-calculate M0 boundary (first measure start) from header elements
        let m0X = null;
        if (typeof this.data.meterLeftX === 'number') m0X = this.data.meterLeftX;
        else if (typeof this.data.clefRightX === 'number') m0X = this.data.clefRightX;
        else if (typeof this.data.keyRightX === 'number') m0X = this.data.keyRightX;

        // Build boundaries: M0 + sniffed bars (sorted by X)
        const sortedBars = [...this.data.bars].sort((a, b) => a.x - b.x);
        const boundaries = [];
        if (m0X !== null) boundaries.push({ x: m0X });
        for (const b of sortedBars) boundaries.push({ x: b.x });

        const result = {
            verticalStep: step,
            staffs: [{
                topY: this.data.staffY,
                notes: this.data.notes.map(n => ({
                    x: n.x, y: n.y,
                    abcIndex: n.abcIndex,
                    isGrace: n.isGrace
                })),
                boundaries: boundaries
            }]
        };

        const totalNotes = result.staffs.reduce((sum, s) => sum + s.notes.length, 0);
        const totalBars = result.staffs.reduce((sum, s) => sum + s.boundaries.length, 0);
        console.log(`[NotationSniffer] Providing sniffed data: ${totalNotes} notes, ${totalBars} boundaries, ${result.staffs.length} staff(s)`);
        return result;
    }
}

export const notationSniffer = new NotationSniffer();
window.notationSniffer = notationSniffer;
console.log('[NotationSniffer] Module loaded and instance exposed to window');
