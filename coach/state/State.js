/**
 * State - Manages the global state of the Drum Coach
 */

const VALID_MODES = ['practice', 'performance'];
const VALID_TOLERANCES = ['strict', 'normal', 'relaxed'];

const TOLERANCE_WINDOWS = {
    strict: { perfect: 15, good: 25, close: 40 },
    normal: { perfect: 20, good: 35, close: 50 },
    relaxed: { perfect: 30, good: 45, close: 65 }
};

const DEFAULTS = {
    mode: 'practice',
    tolerance: 'normal',
    reps: 4,
    countIn: true,
};

export class StateManager {
    constructor() {
        this._data = { ...DEFAULTS };
    }

    // Mode property
    get mode() {
        return this._data.mode;
    }

    set mode(value) {
        if (!VALID_MODES.includes(value)) {
            console.warn(`[State] Invalid mode '${value}', keeping '${this._data.mode}'`);
            return;
        }
        this._data.mode = value;
    }

    // Tolerance property
    get tolerance() {
        return this._data.tolerance;
    }

    set tolerance(value) {
        if (!VALID_TOLERANCES.includes(value)) {
            console.warn(`[State] Invalid tolerance '${value}', keeping '${this._data.tolerance}'`);
            return;
        }
        this._data.tolerance = value;
    }

    // Reps property
    get reps() {
        return this._data.reps;
    }

    set reps(value) {
        value = Math.floor(value);
        value = Math.max(1, Math.min(16, value));
        this._data.reps = value;
    }

    // CountIn property
    get countIn() {
        return this._data.countIn ?? DEFAULTS.countIn;
    }

    set countIn(value) {
        this._data.countIn = Boolean(value);
    }

    // Get tolerance windows for current setting
    getToleranceWindows() {
        const windows = TOLERANCE_WINDOWS[this.tolerance];
        if (!windows) {
            console.error(`[State] Unknown tolerance '${this.tolerance}', falling back to 'normal'`);
            return TOLERANCE_WINDOWS.normal;
        }
        return windows;
    }

    // Convert to plain object
    toObject() {
        return {
            mode: this.mode,
            tolerance: this.tolerance,
            reps: this.reps,
            countIn: this.countIn,
        };
    }

    // Restore from plain object
    fromObject(obj) {
        if (obj.mode !== undefined) this.mode = obj.mode;
        if (obj.tolerance !== undefined) this.tolerance = obj.tolerance;
        if (obj.reps !== undefined) this.reps = obj.reps;
        if (obj.countIn !== undefined) this.countIn = obj.countIn;
    }

    // Persistence
    save() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('coachState', JSON.stringify(this.toObject()));
        } catch (e) {
            console.warn('[State] Failed to save:', e);
        }
    }

    load() {
        if (typeof localStorage === 'undefined') return;
        try {
            const data = localStorage.getItem('coachState');
            if (data) {
                this.fromObject(JSON.parse(data));
            }
        } catch (e) {
            console.warn('[State] Failed to load:', e);
        }
    }
}

// Global instance
export const coachState = new StateManager();

// Only load if localStorage is available (not in Node.js tests)
if (typeof localStorage !== 'undefined') {
    coachState.load();
}
