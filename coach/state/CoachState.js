/**
 * CoachState - Manages the global state of the Drum Coach
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
    showDebug: false
};

export class CoachStateManager {
    constructor() {
        this._data = { ...DEFAULTS };
        this._listeners = [];
    }

    // Mode property
    get mode() {
        return this._data?.mode || DEFAULTS.mode;
    }

    set mode(value) {
        if (!VALID_MODES.includes(value)) {
            value = DEFAULTS.mode;
        }
        const old = this._data.mode;
        this._data.mode = value;
        if (old !== value) this._dispatch('mode', value);
    }

    // Tolerance property
    get tolerance() {
        return this._data?.tolerance || DEFAULTS.tolerance;
    }

    set tolerance(value) {
        if (!VALID_TOLERANCES.includes(value)) {
            value = DEFAULTS.tolerance;
        }
        const old = this._data.tolerance;
        this._data.tolerance = value;
        if (old !== value) this._dispatch('tolerance', value);
    }

    // Reps property
    get reps() {
        return this._data?.reps || DEFAULTS.reps;
    }

    set reps(value) {
        value = Math.floor(value);
        value = Math.max(1, Math.min(16, value));
        const old = this._data.reps;
        this._data.reps = value;
        if (old !== value) this._dispatch('reps', value);
    }

    // CountIn property
    get countIn() {
        return this._data?.countIn ?? DEFAULTS.countIn;
    }

    set countIn(value) {
        const old = this._data.countIn;
        this._data.countIn = Boolean(value);
        if (old !== this._data.countIn) this._dispatch('countIn', this._data.countIn);
    }

    // ShowDebug property
    get showDebug() {
        return this._data?.showDebug ?? DEFAULTS.showDebug;
    }

    set showDebug(value) {
        const old = this._data.showDebug;
        this._data.showDebug = Boolean(value);
        if (old !== this._data.showDebug) this._dispatch('showDebug', this._data.showDebug);
    }

    // Get tolerance windows for current setting
    getToleranceWindows() {
        return TOLERANCE_WINDOWS[this.tolerance] || TOLERANCE_WINDOWS.normal;
    }

    // Convert to plain object
    toObject() {
        return {
            mode: this.mode,
            tolerance: this.tolerance,
            reps: this.reps,
            countIn: this.countIn,
            showDebug: this.showDebug
        };
    }

    // Restore from plain object
    fromObject(obj) {
        if (obj.mode !== undefined) this.mode = obj.mode;
        if (obj.tolerance !== undefined) this.tolerance = obj.tolerance;
        if (obj.reps !== undefined) this.reps = obj.reps;
        if (obj.countIn !== undefined) this.countIn = obj.countIn;
        if (obj.showDebug !== undefined) this.showDebug = obj.showDebug;
    }

    // Reset to defaults
    reset() {
        this._data = { ...DEFAULTS };
    }

    // Persistence
    save() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('coachState', JSON.stringify(this.toObject()));
        } catch (e) {
            console.warn('[CoachState] Failed to save:', e);
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
            console.warn('[CoachState] Failed to load:', e);
        }
    }

    // Validation
    isValid() {
        return this._data !== null && typeof this._data === 'object';
    }

    // Event handling
    addEventListener(event, callback) {
        if (event === 'change' && typeof callback === 'function') {
            this._listeners.push(callback);
        }
    }

    removeEventListener(event, callback) {
        if (event === 'change') {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        }
    }

    _dispatch(property, value) {
        for (const listener of this._listeners) {
            try {
                listener({ property, value });
            } catch (e) {
                console.error('[CoachState] Event listener error:', e);
            }
        }
    }
}

// Backwards-compatible wrapper that exposes same properties
class LegacyCoachState {
    constructor() {
        this._manager = new CoachStateManager();
        this.isEnabled = false;
        this.isActive = false;
        this.currentRep = 0;
        this.midiDevice = null;
        this.audioLatency = 50;
        this.calibrationOffset = 0;
    }

    get mode() { return this._manager.mode; }
    set mode(v) { this._manager.mode = v; }

    get tolerance() { return this._manager.tolerance; }
    set tolerance(v) { this._manager.tolerance = v; }

    get reps() { return this._manager.reps; }
    set reps(v) { this._manager.reps = v; }

    get countIn() { return this._manager.countIn; }
    set countIn(v) { this._manager.countIn = v; }

    get showDebug() { return this._manager.showDebug; }
    set showDebug(v) { this._manager.showDebug = v; }

    // Legacy compatibility: countInEnabled maps to countIn
    get countInEnabled() { return this._manager.countIn; }
    set countInEnabled(v) { this._manager.countIn = v; }

    loadFromStorage() {
        this._manager.load();
        // Also load legacy properties
        try {
            const saved = localStorage.getItem('coach_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.isEnabled !== undefined) this.isEnabled = settings.isEnabled;
                if (settings.midiDevice !== undefined) this.midiDevice = settings.midiDevice;
                if (settings.calibrationOffset !== undefined) this.calibrationOffset = settings.calibrationOffset;
                if (settings.showDebug !== undefined) this.showDebug = settings.showDebug;
            }
        } catch (e) {
            console.warn('[CoachState] Failed to load legacy settings:', e);
        }
    }

    saveToStorage() {
        this._manager.save();
        // Also save legacy properties
        try {
            const settings = {
                isEnabled: this.isEnabled,
                mode: this.mode,
                reps: this.reps,
                countInEnabled: this.countIn,
                tolerance: this.tolerance,
                midiDevice: this.midiDevice,
                calibrationOffset: this.calibrationOffset,
                showDebug: this.showDebug
            };
            localStorage.setItem('coach_settings', JSON.stringify(settings));
        } catch (e) {
            console.warn('[CoachState] Failed to save legacy settings:', e);
        }
    }
}

// Global instance (using legacy wrapper for compatibility)
export const coachState = new LegacyCoachState();

// Only load if localStorage is available (not in Node.js tests)
if (typeof localStorage !== 'undefined') {
    coachState.loadFromStorage();
}
