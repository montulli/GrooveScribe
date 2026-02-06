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
    showDebug: true,
    midiDevice: null,
    audioLatency: 50,
    calibrationOffset: 0
};

export class CoachStateManager {
    constructor() {
        this._data = { ...DEFAULTS };
        this._listeners = [];

        // Runtime state (not persisted)
        this.isEnabled = false;
        this.isActive = false;
        this.currentRep = 0;
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

    // Alias for compatibility
    get countInEnabled() { return this.countIn; }
    set countInEnabled(v) { this.countIn = v; }

    // ShowDebug property
    get showDebug() {
        return this._data?.showDebug ?? DEFAULTS.showDebug;
    }

    set showDebug(value) {
        const old = this._data.showDebug;
        this._data.showDebug = Boolean(value);
        if (old !== this._data.showDebug) this._dispatch('showDebug', this._data.showDebug);
    }

    // MIDI Device property
    get midiDevice() { return this._data?.midiDevice ?? DEFAULTS.midiDevice; }
    set midiDevice(value) {
        const old = this._data.midiDevice;
        this._data.midiDevice = value;
        if (old !== value) this._dispatch('midiDevice', value);
    }

    // Audio Latency property
    get audioLatency() { return this._data?.audioLatency ?? DEFAULTS.audioLatency; }
    set audioLatency(value) {
        const old = this._data.audioLatency;
        this._data.audioLatency = Number(value);
        if (old !== value) this._dispatch('audioLatency', value);
    }

    // Calibration Offset property
    get calibrationOffset() { return this._data?.calibrationOffset ?? DEFAULTS.calibrationOffset; }
    set calibrationOffset(value) {
        const old = this._data.calibrationOffset;
        this._data.calibrationOffset = Number(value);
        if (old !== value) this._dispatch('calibrationOffset', value);
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
            showDebug: this.showDebug,
            midiDevice: this.midiDevice,
            audioLatency: this.audioLatency,
            calibrationOffset: this.calibrationOffset
        };
    }

    // Restore from plain object
    fromObject(obj) {
        if (obj.mode !== undefined) this.mode = obj.mode;
        if (obj.tolerance !== undefined) this.tolerance = obj.tolerance;
        if (obj.reps !== undefined) this.reps = obj.reps;
        if (obj.countIn !== undefined) this.countIn = obj.countIn;
        if (obj.showDebug !== undefined) this.showDebug = obj.showDebug;
        if (obj.midiDevice !== undefined) this.midiDevice = obj.midiDevice;
        if (obj.audioLatency !== undefined) this.audioLatency = obj.audioLatency;
        if (obj.calibrationOffset !== undefined) this.calibrationOffset = obj.calibrationOffset;
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

    // Alias for compatibility
    loadFromStorage() { this.load(); }
    saveToStorage() { this.save(); }

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

// Global instance
export const coachState = new CoachStateManager();

// Only load if localStorage is available (not in Node.js tests)
if (typeof localStorage !== 'undefined') {
    coachState.load();
}
