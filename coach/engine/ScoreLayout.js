/**
 * ScoreLayout - Hooks into abc2svg to extract precise coordinates
 * for notes, measure boundaries, and staff positions.
 * (Refactored from NotationSniffer for abc2svg v1.22.1)
 */
// 6pt matches standard abc2svg line spacing (with scale=1.0)
const BASE_STAFF_STEP = 6;

const PRECOOKED_STAFF_Y = 55;

export class ScoreLayout {
    constructor() {
        console.log('[ScoreLayout] Instance created');
        this.data = {
            notes: [],    // { x, p, time, abcIndex, type }
            bars: [],     // { x, time }
            staffY: PRECOOKED_STAFF_Y,
            yLevels: [],
            engineWidth: 0
        };
        this.abcIndexCount = 0;
        this.lastNoteX = -100;
        this.staffY_candidates = [];
        this.abc = null; // Reference to abc2svg engine
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

        // Hook only the printer (abc.user) or engine as needed. 
        // abc2svg v1.22.1 usually calls callbacks on the instance itself.
        const targets = [abc];
        if (abc.user) targets.push(abc.user);

        targets.forEach(target => {
            // console.log('[ScoreLayout] Hooking target:', target === abc ? 'engine' : 'user');
            const original_anno_start = target.anno_start;
            target.anno_start = function (type, start, stop, x, y, w, h, s) {
                if (original_anno_start) {
                    return original_anno_start.call(this, type, start, stop, x, y, w, h, s);
                }
            };

            const original_anno_stop = target.anno_stop;
            target.anno_stop = function (type, start, stop, x, y, w, h, s) {
                // console.log('[ScoreLayout] anno_stop:', type, 'x:', x, 'y:', y, 'w:', w, 'h:', h, 's:', s ? 'obj' : 'null');

                // s is the symbol object (8th arg in v1.22.1)
                // s.x, s.y are internal coordinates (same as pixels with scale=1.0)

                if (type === "bar") {
                    // Use symbol x directly
                    const barX = s ? s.x : (x + w / 2); // Fallback if s missing (shouldn't happen)
                    if (!self.data.bars.some(b => Math.abs(b.x - barX) < 5)) {
                        self.data.bars.push({ x: barX, time: 0 });
                    }
                }

                // Capture header elements for M0 alignment
                if (type === "clef") {
                    self.data.clefRightX = x + w;
                }
                if (type === "key") {
                    self.data.keyRightX = x + w;
                }
                if (type === "meter") {
                    self.data.meterLeftX = x;
                }

                if (type === "note" || type === "grace") {
                    // Precise X from symbol
                    const preciseX = s ? s.x : (x + w / 2);

                    // Track note Y center for deriving staffY later
                    const noteYCenter = y + h / 2;
                    self.staffY_candidates.push(noteYCenter);

                    // Chord Grouping Logic
                    if (type !== "grace") {
                        if (Math.abs(preciseX - self.lastNoteX) > 2) {
                            if (self.lastNoteX !== -100) self.abcIndexCount++;
                            self.lastNoteX = preciseX;
                        }
                    }

                    // console.log(`[ScoreLayout] ${type.toUpperCase()}: x=${preciseX.toFixed(2)}, idx=${self.abcIndexCount}`);

                    self.data.notes.push({
                        type: type,
                        x: preciseX,
                        y: y + h / 2, // Approximate center Y from bbox, or use s.y? 
                        // s.y in abc2svg is pitch-relative usually? 
                        // The old code used (y + h/2) * scale. 
                        // Let's stick to bbox center for Y to be safe, 
                        // or trust `s.y + staffY`? 
                        // The baseline had `y` values like 16.01, 7.01. 
                        // Let's keep using bbox center `y + h/2` (passed x,y,w,h are SVG viewbox coords).
                        w: w,
                        h: h,
                        abcIndex: self.abcIndexCount,
                        isGrace: type === "grace"
                    });
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
        console.log(`[ScoreLayout] Resetting data. Current bar count was: ${this.data.bars.length}. New startIndex: ${startIndex}`);
        this.data = {
            notes: [],
            bars: [],
            staffY: PRECOOKED_STAFF_Y,
            yLevels: [],
            engineWidth: 0
        };

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
        this.staffY_candidates = [];
    }

    incrementAbcIndex() {
        this.abcIndexCount++;
    }

    getSniffedData() {
        const step = BASE_STAFF_STEP;

        // Using precooked staffY for now as requested. Auto-detection was placing the grid too high.
        this.data.staffY = PRECOOKED_STAFF_Y;
        console.log('[ScoreLayout] Using precooked staffY:', this.data.staffY);


        // Pre-calculate M0 boundary
        let m0X = null;
        if (typeof this.data.meterLeftX === 'number') m0X = this.data.meterLeftX;
        else if (typeof this.data.clefRightX === 'number') m0X = this.data.clefRightX;
        else if (typeof this.data.keyRightX === 'number') m0X = this.data.keyRightX;

        // Build boundaries
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

        // Verification logging
        console.log('[ScoreLayout] staffY:', this.data.staffY, 'noteY range:',
            Math.min(...this.data.notes.map(n => n.y)).toFixed(1), '-',
            Math.max(...this.data.notes.map(n => n.y)).toFixed(1));
        console.log(`[ScoreLayout] Providing data: ${totalNotes} notes, ${totalBars} boundaries`);
        return result;
    }
}

export const scoreLayout = new ScoreLayout();
window.scoreLayout = scoreLayout;
console.log('[ScoreLayout] Module loaded and instance exposed to window');
