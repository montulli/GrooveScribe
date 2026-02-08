import { DrumType, ABC_PITCH_TO_DRUM_TYPE } from './DrumConstants.js';

/**
 * ABCIndexMapper - Maps ABC notation tick positions to rendered note indices
 * by simulating abc2svg's rendering order.
 *
 * abc2svg renders voices in a fixed order (stickings → hands → feet), and 
 * within each voice, notes are rendered left-to-right. This class walks the
 * groove data in that same order to assign each (tickIndex, DrumType) pair
 * to its rendered ABC note index, enabling accurate hit-to-SVG matching.
 *
 * Also handles:
 * - Converting groove editor arrays into a ms-based note timeline for the Engine
 * - Resolving raw ABC pitch strings (with decorations) to DrumType values
 * - Extracting and validating groove timing metrics from editor data
 */
export class ABCIndexMapper {
    constructor() {
        this.noteMap = new Map();
    }

    /**
     * Build the (tickIndex, instrument) → abcNoteIndex mapping.
     * Must be called whenever the groove notation changes.
     *
     * @param {Object} data - Result from grooveDataFromClickableUI()
     * @param {Object} metrics - Result from getGrooveMetrics(data)
     */
    buildMap(data, metrics) {
        this.noteMap = new Map();
        if (!data || !metrics) return;

        let currentIndex = 0;
        const { totalTicks } = metrics;

        // 1. Stickings Voice (Rendered first in abc2svg)
        for (let i = 0; i < totalTicks; i++) {
            if (data.sticking_array && data.sticking_array[i]) currentIndex++;
        }

        const kickStemsUp = !!data.kickStemsUp;

        // 2. Main Voice (Hands, and Feet if stems are unified)
        for (let i = 0; i < totalTicks; i++) {
            const hasSnare = data.snare_array[i] && data.snare_array[i] !== "";
            const hasHH = data.hh_array[i] && data.hh_array[i] !== "";
            const hasToms = data.toms_array && data.toms_array.some(arr => arr[i] && arr[i] !== "");
            const kickVal = data.kick_array[i];
            const isKick = kickStemsUp && kickVal && (kickVal === 'o' || kickVal === 'O' || kickVal === 'k' || kickVal === 'F' || kickVal === true);
            const isFoot = kickStemsUp && !!kickVal && !isKick;

            if (hasSnare || hasHH || hasToms || isKick || isFoot) {
                if (hasSnare) {
                    [DrumType.SNARE, DrumType.SNARE_ACCENT, DrumType.SNARE_GHOST, DrumType.SNARE_XSTICK, DrumType.SNARE_FLAM, DrumType.SNARE_BUZZ].forEach(t => this.noteMap.set(`${i}:${t}`, currentIndex));
                }
                if (hasHH) {
                    [DrumType.HH_CLOSED, DrumType.HH_OPEN, DrumType.HH_ACCENT, DrumType.CRASH, DrumType.RIDE, DrumType.RIDE_BELL, DrumType.COWBELL, DrumType.STACKER, DrumType.METRONOME_NORMAL, DrumType.METRONOME_ACCENT].forEach(t => this.noteMap.set(`${i}:${t}`, currentIndex));
                }
                if (hasToms) {
                    data.toms_array.forEach((arr, tomIdx) => {
                        if (arr[i]) {
                            const key = (tomIdx < 2) ? DrumType.TOM_HIGH : DrumType.TOM_LOW;
                            this.noteMap.set(`${i}:${key}`, currentIndex);
                        }
                    });
                }
                if (isKick) this.noteMap.set(`${i}:${DrumType.KICK}`, currentIndex);
                if (isFoot) this.noteMap.set(`${i}:${DrumType.HH_FOOT}`, currentIndex);
                currentIndex++;
            }
        }

        // 3. Lower Voice (Feet only if rendered on separate stems)
        if (!kickStemsUp) {
            for (let i = 0; i < totalTicks; i++) {
                const val = data.kick_array[i];
                if (val) {
                    const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true;
                    if (isKick) this.noteMap.set(`${i}:${DrumType.KICK}`, currentIndex);
                    else this.noteMap.set(`${i}:${DrumType.HH_FOOT}`, currentIndex);
                    currentIndex++;
                }
            }
        }
        console.log(`[ABCIndexMapper] Mapped ${this.noteMap.size} keys to ${currentIndex} indices`);
    }

    /**
     * Resolve the ABC note index for a specific tick and instrument.
     * @returns {number} The ABC note index, or -1 if not found
     */
    getIndex(tickIndex, instrument) {
        const index = this.noteMap.get(`${tickIndex}:${instrument}`);
        return index !== undefined ? index : -1;
    }

    /**
     * Convert groove editor arrays into a ms-based note timeline for the Engine.
     *
     * @param {Object} data - Result from grooveDataFromClickableUI()
     * @param {Object} metrics - Result from getGrooveMetrics(data)
     * @returns {Array} Sorted array of {time, type, tickIndex} objects
     */
    buildTimeline(data, metrics) {
        if (!data || !metrics) return [];

        const { bpm, msPerTick, totalTicks } = metrics;
        const timeline = [];

        console.log(`[ABCIndexMapper] Generating timeline: ${totalTicks} ticks, ${bpm} BPM, ${msPerTick.toFixed(2)} ms / tick`);

        for (let i = 0; i < totalTicks; i++) {
            // Hi-Hats & Cymbals
            if (data.hh_array[i]) {
                const type = this.resolveAbcDrumType(data.hh_array[i], 'hh', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Snare variants
            if (data.snare_array[i]) {
                const type = this.resolveAbcDrumType(data.snare_array[i], 'snare', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Kick and Foot HH
            if (data.kick_array[i]) {
                const type = this.resolveAbcDrumType(data.kick_array[i], 'kick', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Toms (Unified 4-tom array)
            if (data.toms_array) {
                data.toms_array.forEach((row, idx) => {
                    if (row[i]) {
                        const type = this.resolveAbcDrumType(row[i], `tom${idx}`, i);
                        if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
                    }
                });
            }
        }
        return timeline.sort((a, b) => a.time - b.time);
    }

    /**
     * Resolve a raw ABC notation value (from grooveDataFromClickableUI) to a DrumType.
     *
     * Values may include decorations (e.g. "!open!^g", "!accent!c", "!(c!)", "{/c").
     * The pitch is extracted by stripping decorations, then looked up in ABC_PITCH_TO_DRUM_TYPE.
     * Decorations then override the base type (e.g. !open! on ^g → HH_OPEN instead of HH_CLOSED).
     *
     * @returns {string|null} DrumType value, or null if unknown (with console warning)
     */
    resolveAbcDrumType(val, arrayName, tickIndex) {
        // Strip ABC decorations: !xxx! patterns (e.g. !accent!, !open!, !(.!, !///!)
        let stripped = val.replace(/![^!]*!/g, '');
        // Strip grace note prefix: {/X} block (flam notation, e.g. {/c} before the main note)
        stripped = stripped.replace(/\{\/[^}]*\}/g, '');
        const pitch = stripped;
        const baseType = ABC_PITCH_TO_DRUM_TYPE[pitch];

        if (!baseType) {
            console.warn(`[ABCIndexMapper] Unknown ABC value in ${arrayName}[${tickIndex}]: ${JSON.stringify(val)} (pitch: ${JSON.stringify(pitch)})`);
            return null;
        }

        // Decoration overrides for articulation variants
        if (val.includes('!open!')) return DrumType.HH_OPEN;
        if (val.includes('!accent!')) {
            // Flam with accent: the {/ grace block takes priority over accent
            if (val.includes('{/')) return DrumType.SNARE_FLAM;
            if (baseType === DrumType.SNARE) return DrumType.SNARE_ACCENT;
            if (baseType === DrumType.HH_CLOSED) return DrumType.HH_ACCENT;
        }
        if (val.includes('!(')) return DrumType.SNARE_GHOST;
        if (val.includes('{/')) return DrumType.SNARE_FLAM;
        if (val.includes('!///!')) return DrumType.SNARE_BUZZ;

        return baseType;
    }

    /**
     * Extract and validate groove timing metrics from editor data.
     * @param {Object} data - Result from grooveDataFromClickableUI()
     * @returns {Object|null} Metrics object or null if data is invalid
     */
    getGrooveMetrics(data) {
        const bpm = data.tempo;
        const numBeats = data.numBeats;
        const measures = data.numberOfMeasures;
        const notesPerMeasure = data.notesPerMeasure;

        if (!bpm || !numBeats || !measures || !notesPerMeasure) {
            console.error('[ABCIndexMapper] Groove data has missing/zero fields:',
                { tempo: bpm, numBeats, numberOfMeasures: measures, notesPerMeasure });
            return null;
        }

        const totalTicks = notesPerMeasure * measures;
        const msPerTick = ((60000 / bpm) * numBeats) / notesPerMeasure;

        return { bpm, numBeats, measures, notesPerMeasure, totalTicks, msPerTick };
    }
}
