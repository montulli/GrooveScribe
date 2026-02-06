/**
 * NotationSniffer - Hooks into abc2svg to extract precise coordinates
 * for notes, measure boundaries, and staff positions.
 */
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
        if (this.__hookedObjects.has(abc)) return;
        this.__hookedObjects.add(abc);

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
                if (type === "bar") {
                    if (!self.data.bars.some(b => Math.abs(b.x - x) < 5)) {
                        console.log(`[NotationSniffer] BAR caught in anno_stop: x=${x.toFixed(2)}`);
                        self.data.bars.push({ x: x, time: 0 });
                    }
                }

                if (type === "note" || type === "grace") {
                    const preciseX = (activeNoteSym && Math.abs(activeNoteSym.x - x) < w * 2) ? activeNoteSym.x : (x + w / 2);

                    // Anchor staffY immediately on first valid note
                    // Logging Y to see why horizontal lines are missing
                    console.log(`[NotationSniffer] Raw Y for staffY_candidates: ${y.toFixed(2)}`);
                    self.staffY_candidates.push(y);
                    const sorted = [...self.staffY_candidates].sort((a, b) => a - b);
                    const newStaffY = sorted[Math.floor(sorted.length / 2)];

                    if (newStaffY !== self.data.staffY) {
                        // Hack: magic number
                        self.data.staffY = newStaffY + 47;
                        self.data.yLevels = [];
                        for (let i = -4; i <= 14; i++) {
                            // Hack: magic number
                            self.data.yLevels.push(self.data.staffY + (i * 4.5));
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
                        x: preciseX,
                        y: y + h / 2,
                        w: w,
                        h: h,
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
                    console.log(`[NotationSniffer] Internal cf: pw=${abc.cf.pagewidth} lm=${abc.cf.leftmargin} rm=${abc.cf.rightmargin}`);
                }

                self.data.staffY = abc.y || (abc.user && abc.user.y) || 0;
                self.data.yLevels = [];
                const baseY = self.data.staffY;
                for (let i = -4; i <= 14; i++) {
                    self.data.yLevels.push(baseY + (i * 4.8));
                }

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
            engineWidth: 0
        };

        // 2. SOURCE OF TRUTH: Parse the ABC Source directly
        // We do this at reset() because ABCsource is already populated before render starts.
        try {
            const abcElement = document.getElementById("ABCsource");
            if (abcElement && abcElement.value) {
                const match = abcElement.value.match(/%%pagewidth\s+(\d+)/);
                if (match && match[1]) {
                    const parsedWidth = parseFloat(match[1]);
                    this.data.engineWidth = parsedWidth;
                    console.log(`[NotationSniffer] Parsed %%pagewidth from source (during reset): ${parsedWidth}`);
                } else {
                    console.warn('[NotationSniffer] Could not find %%pagewidth in ABC source (during reset). Content:', abcElement.value.substring(0, 500));
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
     * Returns the sniffer data to be consumed by the controller/renderer
     */
    getSniffedData() {
        console.log(`[NotationSniffer] Providing sniffed data: ${this.data.notes.length} notes, ${this.data.bars.length} bars`);
        return this.data;
    }
}

export const notationSniffer = new NotationSniffer();
window.notationSniffer = notationSniffer;
console.log('[NotationSniffer] Module loaded and instance exposed to window');
