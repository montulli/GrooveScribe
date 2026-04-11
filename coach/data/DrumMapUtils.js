import { ModuleDrumTypes } from '../engine/DrumConstants.js';

/**
 * Converts an editing-shape map (drumType → [noteNumbers]) to the runtime shape
 * consumed by MidiInputHandler (noteNumber → drumType).
 *
 * @param {Object} editingMap - e.g. { kick: [36, 35], snare: [38, 40], ... }
 * @returns {Object} - e.g. { 36: 'kick', 35: 'kick', 38: 'snare', ... }
 */
export function drumMapToRuntime(editingMap) {
    const runtime = {};
    for (const [drumType, notes] of Object.entries(editingMap)) {
        if (!ModuleDrumTypes.includes(drumType)) continue;
        for (const note of notes) {
            runtime[note] = drumType;
        }
    }
    return runtime;
}

/**
 * Converts a runtime-shape map back to the editing shape.
 *
 * @param {Object} runtimeMap - e.g. { 36: 'kick', 35: 'kick', ... }
 * @returns {Object} - e.g. { kick: [36, 35], snare: [], ... }
 */
export function runtimeToDrumMap(runtimeMap) {
    const editing = {};
    for (const type of ModuleDrumTypes) {
        editing[type] = [];
    }
    for (const [noteStr, drumType] of Object.entries(runtimeMap)) {
        if (editing[drumType]) {
            editing[drumType].push(Number(noteStr));
        }
    }
    return editing;
}

/**
 * Encodes an editing-shape map to a compact URL parameter string.
 * Instruments in fixed ModuleDrumTypes order, notes joined by '.', instruments by '-'.
 *
 * @param {Object} editingMap
 * @returns {string} - e.g. "36.35-38.40-37-42-44-46-48.50.47-45.43.41-49.57-51-53-56-"
 */
export function encodeDrumMap(editingMap) {
    return ModuleDrumTypes.map(type => {
        const notes = editingMap[type] || [];
        return notes.join('.');
    }).join('-');
}

/**
 * Decodes a compact URL parameter string back to an editing-shape map.
 *
 * @param {string} encoded - e.g. "36.35-38.40-37-42-44-46-..."
 * @returns {Object} - editing-shape map
 */
export function decodeDrumMap(encoded) {
    const parts = encoded.split('-');
    const map = {};
    for (let i = 0; i < ModuleDrumTypes.length; i++) {
        const type = ModuleDrumTypes[i];
        const part = parts[i] || '';
        map[type] = part === '' ? [] : part.split('.').map(Number).filter(n => !Number.isNaN(n));
    }
    return map;
}

/**
 * Creates a deep copy of an editing-shape map.
 */
export function cloneDrumMap(editingMap) {
    const clone = {};
    for (const [key, value] of Object.entries(editingMap)) {
        clone[key] = [...value];
    }
    return clone;
}

/**
 * Checks if two editing-shape maps are identical.
 */
export function drumMapsEqual(a, b) {
    for (const type of ModuleDrumTypes) {
        const aNotes = a[type] || [];
        const bNotes = b[type] || [];
        if (aNotes.length !== bNotes.length) return false;
        for (let i = 0; i < aNotes.length; i++) {
            if (aNotes[i] !== bNotes[i]) return false;
        }
    }
    return true;
}
