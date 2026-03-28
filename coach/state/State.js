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
    calibrationOffset: 0,
    calibrated: false,
    drumMapPreset: '_gm',
    drumMapCustom: null,
    drumMapCustomHihatCC: null,
    drumMapConfigured: false,
    showDebugGrid: true,
    metronomeVolume: 100,
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
        return this._data.countIn;
    }

    set countIn(value) {
        this._data.countIn = Boolean(value);
    }

    // CalibrationOffset property (ms, can be negative)
    get calibrationOffset() {
        return this._data.calibrationOffset;
    }

    set calibrationOffset(value) {
        value = Number(value);
        if (Number.isNaN(value)) {
            console.warn(`[State] Invalid calibrationOffset '${value}', keeping '${this._data.calibrationOffset}'`);
            return;
        }
        this._data.calibrationOffset = Math.round(value);
    }

    // Calibrated property — tracks whether calibration has been run
    get calibrated() {
        return this._data.calibrated;
    }

    set calibrated(value) {
        this._data.calibrated = Boolean(value);
    }

    // ShowDebugGrid property
    get showDebugGrid() {
        return this._data.showDebugGrid;
    }

    set showDebugGrid(value) {
        this._data.showDebugGrid = Boolean(value);
    }

    // MetronomeVolume property (0-100 percentage, maps to MIDI velocity 0-127)
    get metronomeVolume() {
        return this._data.metronomeVolume;
    }

    set metronomeVolume(value) {
        value = Number(value);
        if (Number.isNaN(value)) return;
        this._data.metronomeVolume = Math.max(0, Math.min(100, Math.round(value)));
    }

    // DrumMapPreset property — file path relative to modulemappings/ or 'custom'
    get drumMapPreset() {
        return this._data.drumMapPreset;
    }

    set drumMapPreset(value) {
        if (typeof value !== 'string' || value.length === 0) {
            console.warn(`[State] Invalid drumMapPreset '${value}', keeping '${this._data.drumMapPreset}'`);
            return;
        }
        this._data.drumMapPreset = value;
    }

    // DrumMapCustom property — editing-shape map object, or null
    get drumMapCustom() {
        return this._data.drumMapCustom;
    }

    set drumMapCustom(value) {
        if (value !== null && typeof value !== 'object') {
            console.warn(`[State] Invalid drumMapCustom, keeping current value`);
            return;
        }
        this._data.drumMapCustom = value;
    }

    // DrumMapCustomHihatCC property — hi-hat CC config object, or null
    get drumMapCustomHihatCC() {
        return this._data.drumMapCustomHihatCC;
    }

    set drumMapCustomHihatCC(value) {
        if (value !== null && typeof value !== 'object') {
            console.warn(`[State] Invalid drumMapCustomHihatCC, keeping current value`);
            return;
        }
        this._data.drumMapCustomHihatCC = value;
    }

    // DrumMapConfigured property — tracks whether user has explicitly chosen a mapping
    get drumMapConfigured() {
        return this._data.drumMapConfigured;
    }

    set drumMapConfigured(value) {
        this._data.drumMapConfigured = Boolean(value);
    }

    // Get tolerance windows for current setting
    getToleranceWindows() {
        return TOLERANCE_WINDOWS[this.tolerance];
    }

    // Convert to plain object
    toObject() {
        return {
            mode: this.mode,
            tolerance: this.tolerance,
            reps: this.reps,
            countIn: this.countIn,
            calibrationOffset: this.calibrationOffset,
            calibrated: this.calibrated,
            showDebugGrid: this.showDebugGrid,
            metronomeVolume: this.metronomeVolume,
            drumMapPreset: this.drumMapPreset,
            drumMapCustom: this.drumMapCustom,
            drumMapCustomHihatCC: this.drumMapCustomHihatCC,
            drumMapConfigured: this.drumMapConfigured,
        };
    }

    // Restore from plain object
    fromObject(obj) {
        if (obj.mode !== undefined) this.mode = obj.mode;
        if (obj.tolerance !== undefined) this.tolerance = obj.tolerance;
        if (obj.reps !== undefined) this.reps = obj.reps;
        if (obj.countIn !== undefined) this.countIn = obj.countIn;
        if (obj.calibrationOffset !== undefined) this.calibrationOffset = obj.calibrationOffset;
        if (obj.calibrated !== undefined) this.calibrated = obj.calibrated;
        if (obj.showDebugGrid !== undefined) this.showDebugGrid = obj.showDebugGrid;
        if (obj.metronomeVolume !== undefined) this.metronomeVolume = obj.metronomeVolume;
        if (obj.drumMapPreset !== undefined) this.drumMapPreset = obj.drumMapPreset;
        if (obj.drumMapCustom !== undefined) this.drumMapCustom = obj.drumMapCustom;
        if (obj.drumMapCustomHihatCC !== undefined) this.drumMapCustomHihatCC = obj.drumMapCustomHihatCC;
        if (obj.drumMapConfigured !== undefined) this.drumMapConfigured = obj.drumMapConfigured;
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
