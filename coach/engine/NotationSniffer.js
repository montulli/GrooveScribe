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
            yLevels: []
        };
        this.abcIndexCount = 0;
        this.lastNoteX = -100;
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

                    // Anchor staffY from first note if stop_page hasn't happened
                    if (self.data.yLevels.length === 0) {
                        self.data.staffY = y + h / 2; // Rough estimate of staff center
                        console.log('[NotationSniffer] Tentative staffY anchored from note:', self.data.staffY);
                        for (let i = -4; i <= 14; i++) {
                            self.data.yLevels.push(self.data.staffY + (i * 5));
                        }
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
                console.log('[NotationSniffer] stop_page called! abc.y:', abc.y);
                self.data.staffY = abc.y || (abc.user && abc.user.y) || 0;
                self.data.yLevels = [];
                const baseY = self.data.staffY;
                for (let i = -4; i <= 14; i++) {
                    self.data.yLevels.push(baseY + (i * 5));
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
            yLevels: []
        };
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
