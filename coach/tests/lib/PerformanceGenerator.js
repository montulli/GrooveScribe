/**
 * PerformanceGenerator - Generates simulated drum performances for testing.
 * INDEPENDENT of the Coach implementation.
 */
export class PerformanceGenerator {
    constructor(options = {}) {
        this.defaultJitter = options.defaultJitter || 0;
        this.seed = options.seed || 12345;
        this.rng = this.createRng(this.seed);
        // Sync with CoachEngine default 'normal' windows
        this.windows = options.windows || { perfect: 20, good: 35, close: 50 };
    }

    /**
     * Create a seeded random number generator for reproducibility
     */
    createRng(seed) {
        let s = seed;
        return () => {
            s = (s * 1664525 + 1013904223) % 4294967296;
            return s / 4294967296;
        };
    }

    /**
     * Reset the RNG to initial state
     */
    reset() {
        this.rng = this.createRng(this.seed);
    }

    /**
     * Generate a performance from a groove definition
     */
    generatePerformance(groove, options = {}) {
        const {
            bpm = 120,
            audioLatencyMs = 50,
            calibrationOffsetMs = 0,
            timingProfile = 'perfect',   // 'perfect', 'good', 'rushing', 'dragging', 'random', 'mixed'
            missRate = 0,                // 0-1, probability of missing a note
            extraHitRate = 0,            // 0-1, probability of extra hits
            jitterMs = 0                 // random timing variation
        } = options;

        const beatDurationMs = 60000 / bpm;
        const hits = [];

        for (const note of groove.notes) {
            // Chance to miss this note
            if (this.rng() < missRate) continue;

            // Calculate base timing error based on profile
            let timingError = this.getTimingError(timingProfile, jitterMs);

            // Special handling for flams: generate grace note + primary hit
            if (note.drum === 'snare_flam') {
                // Flam grace note timing: 20-40ms before the primary (varies by tempo)
                // At 80 BPM we use around 30ms, tighter at faster tempos
                const flamGap = 25 + (this.rng() * 15); // 25-40ms

                // Grace note (hits slightly before the beat)
                hits.push({
                    drum: 'snare', // Grace note is a regular snare hit
                    beat: note.beat,
                    beatOffset: note.beat - 1,
                    timingErrorMs: Math.round(timingError - flamGap),
                    isGraceNote: true
                });

                // Primary hit (on the beat)
                hits.push({
                    drum: 'snare_flam', // The main articulation
                    beat: note.beat,
                    beatOffset: note.beat - 1,
                    timingErrorMs: Math.round(timingError)
                });
            } else {
                let hitDrum = note.drum;

                // Use base types for realistic MIDI simulation
                if (hitDrum === 'snare_ghost' || hitDrum === 'snare_accent' ||
                    hitDrum === 'snare_drag' || hitDrum === 'snare_buzz') {
                    hitDrum = 'snare';
                } else if (hitDrum === 'hh_accent' || hitDrum === 'hh_close') {
                    hitDrum = 'hh_normal';
                }

                // Remap toms to supported layout
                if (hitDrum === 'tom2') hitDrum = 'tom1';
                else if (hitDrum === 'tom3') hitDrum = 'tom4';

                hits.push({
                    drum: hitDrum,
                    beat: note.beat,
                    beatOffset: note.beat - 1, // 0-indexed
                    timingErrorMs: Math.round(timingError)
                });
            }
        }

        // Add extra/wrong hits
        if (extraHitRate > 0) {
            const extraHits = this.generateExtraHits(groove, extraHitRate, beatDurationMs);
            hits.push(...extraHits);
        }

        // Sort by timing
        hits.sort((a, b) => a.beatOffset - b.beatOffset);

        return {
            bpm,
            audioLatencyMs,
            calibrationOffsetMs,
            hits
        };
    }

    getTimingError(profile, jitterMs, windows) {
        if (!windows) windows = this.windows;
        const jitter = (this.rng() - 0.5) * 2 * jitterMs;

        switch (profile) {
            case 'perfect':
                return jitter; // Just jitter, centered on 0
            case 'good':
                return (this.rng() - 0.5) * 40 + jitter; // ±20ms + jitter
            case 'rushing':
                return -15 - this.rng() * 20 + jitter; // -15 to -35ms (early)
            case 'dragging':
                return 15 + this.rng() * 20 + jitter; // +15 to +35ms (late)
            case 'random':
                return (this.rng() - 0.5) * 100 + jitter; // ±50ms + jitter
            case 'mixed':
                // Mix of perfect, good, and some misses
                const r = this.rng();
                if (r < 0.5) return jitter; // 50% perfect
                if (r < 0.8) return (this.rng() - 0.5) * 50 + jitter; // 30% good
                return (this.rng() - 0.5) * 120 + jitter; // 20% close/miss

            // New profiles for comprehensive testing
            case 'allHitTypes':
                // Distribute across all timing tiers
                const tier = this.rng();
                if (tier < 0.25) {
                    // Perfect: within ±15ms
                    return (this.rng() - 0.5) * (windows.perfect * 2);
                } else if (tier < 0.5) {
                    // Good: 16-30ms
                    const sign = this.rng() > 0.5 ? 1 : -1;
                    return sign * (windows.perfect + 1 + this.rng() * (windows.good - windows.perfect - 1));
                } else if (tier < 0.75) {
                    // Close: 31-50ms
                    const sign = this.rng() > 0.5 ? 1 : -1;
                    return sign * (windows.good + 1 + this.rng() * (windows.close - windows.good - 1));
                } else {
                    // Miss: >50ms
                    const sign = this.rng() > 0.5 ? 1 : -1;
                    return sign * (windows.close + 5 + this.rng() * 50);
                }

            case 'onlyPerfect':
                // Strictly within perfect window
                return (this.rng() - 0.5) * (windows.perfect * 1.8);

            case 'onlyGood':
                // Just outside perfect, within good
                const goodSign = this.rng() > 0.5 ? 1 : -1;
                return goodSign * (windows.perfect + 2 + this.rng() * (windows.good - windows.perfect - 4));

            case 'onlyClose':
                // Just outside good, within close
                const closeSign = this.rng() > 0.5 ? 1 : -1;
                return closeSign * (windows.good + 2 + this.rng() * (windows.close - windows.good - 4));

            case 'onlyMiss':
                // Outside close window but not too far to be unmatched
                const missSign = this.rng() > 0.5 ? 1 : -1;
                return missSign * (windows.close + 5 + this.rng() * 80);

            default:
                return jitter;
        }
    }

    /**
     * Generate extra/wrong hits
     */
    generateExtraHits(groove, rate, beatDurationMs) {
        const extraHits = [];
        const wrongDrums = ['tom1', 'tom4', 'crash', 'ride', 'ride_bell'];
        const measures = groove.measures || 1;

        for (let beat = 1; beat <= measures * 4; beat += 0.5) {
            if (this.rng() < rate) {
                extraHits.push({
                    drum: wrongDrums[Math.floor(this.rng() * wrongDrums.length)],
                    beat: beat,
                    beatOffset: beat - 1,
                    timingErrorMs: Math.round((this.rng() - 0.5) * 30),
                    isExtra: true
                });
            }
        }

        return extraHits;
    }

    /**
     * Generate a performance with specific wrong-pad hits (hitting wrong drum for expected note)
     */
    generateWrongPadPerformance(groove, options = {}) {
        const {
            bpm = 120,
            audioLatencyMs = 50,
            wrongPadRate = 0.2  // 20% of hits are on wrong pad
        } = options;

        const beatDurationMs = 60000 / bpm;
        const hits = [];

        // Map of what wrong drums to hit instead
        const wrongDrumMap = {
            'kick': ['snare', 'tom1', 'tom4'],
            'snare': ['kick', 'tom1', 'hh_normal'],
            'hh_normal': ['ride', 'hh_open', 'crash'],
            'hh_open': ['hh_normal', 'ride', 'crash'],
            'tom1': ['tom4', 'snare', 'kick'],
            'tom4': ['tom1', 'snare', 'kick'],
            'ride': ['crash', 'hh_normal', 'ride_bell']
        };

        for (const note of groove.notes) {
            let hitDrum = note.drum;
            let isWrongPad = false;

            if (this.rng() < wrongPadRate) {
                const alternatives = wrongDrumMap[note.drum] || ['snare', 'kick', 'tom1'];
                hitDrum = alternatives[Math.floor(this.rng() * alternatives.length)];
                isWrongPad = true;
            }

            hits.push({
                drum: hitDrum,
                expectedDrum: note.drum,
                beat: note.beat,
                beatOffset: note.beat - 1,
                timingErrorMs: Math.round((this.rng() - 0.5) * 20), // Generally on time
                isWrongPad
            });
        }

        return {
            audioLatencyMs,
            hits
        };
    }

    /**
     * Generate a performance that exercises all possible MIDI hit mappings
     */
    generateAllHitsPerformance(bpm = 120) {
        const beatDurationMs = 60000 / bpm;
        const allDrums = [
            'kick', 'hh_foot',
            'snare', 'snare_ghost', 'snare_xstick', 'snare_flam',
            'hh_normal', 'hh_open', 'hh_accent',
            'tom1', 'tom4',
            'ride', 'ride_bell',
            'crash'
        ];

        const hits = allDrums.map((drum, idx) => ({
            drum,
            beat: 1 + idx * 0.25,
            beatOffset: idx * 0.25,
            timingErrorMs: 0
        }));

        return {
            bpm,
            audioLatencyMs: 50, // Match default engine latency
            hits,
            allDrums
        };
    }

    /**
     * Calculate expected results for a performance
     */
    calculateExpectedResults(groove, performance, windows = { perfect: 15, good: 30, close: 50 }) {
        const results = { perfect: 0, good: 0, close: 0, miss: 0, extra: 0 };

        for (const hit of performance.hits) {
            if (hit.isExtra) {
                results.extra++;
                continue;
            }

            const absError = Math.abs(hit.timingErrorMs);

            if (absError <= windows.perfect) results.perfect++;
            else if (absError <= windows.good) results.good++;
            else if (absError <= windows.close) results.close++;
            else results.miss++;
        }

        // Notes not hit are misses
        const hitsWithoutExtra = performance.hits.filter(h => !h.isExtra);
        results.miss += groove.notes.length - hitsWithoutExtra.length;

        return results;
    }

    /**
     * Convert performance to timeline format (milliseconds from start)
     */
    toTimeline(performance, bpm) {
        const beatDurationMs = 60000 / bpm;
        return performance.hits.map(hit => ({
            time: hit.beatOffset * beatDurationMs + hit.timingErrorMs,
            drum: hit.drum,
            isExtra: hit.isExtra || false
        }));
    }
}

// Standard groove definitions for testing
export const GROOVES = {
    basicRock: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 120,
        notes: [
            { drum: 'kick', beat: 1.0 },
            { drum: 'hh_normal', beat: 1.0 },
            { drum: 'hh_normal', beat: 1.5 },
            { drum: 'snare', beat: 2.0 },
            { drum: 'hh_normal', beat: 2.0 },
            { drum: 'hh_normal', beat: 2.5 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'hh_normal', beat: 3.0 },
            { drum: 'hh_normal', beat: 3.5 },
            { drum: 'snare', beat: 4.0 },
            { drum: 'hh_normal', beat: 4.0 },
            { drum: 'hh_normal', beat: 4.5 }
        ]
    },

    simpleKickSnare: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 100,
        notes: [
            { drum: 'kick', beat: 1.0 },
            { drum: 'snare', beat: 2.0 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'snare', beat: 4.0 }
        ]
    },

    singleNote: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 120,
        notes: [
            { drum: 'kick', beat: 1.0 }
        ]
    },

    denseSixteenths: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 120,
        notes: Array.from({ length: 16 }, (_, i) => ({
            drum: 'hh_normal',
            beat: 1 + i * 0.25
        }))
    },

    fastTempo: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 200,
        notes: [
            { drum: 'kick', beat: 1.0 },
            { drum: 'snare', beat: 2.0 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'snare', beat: 4.0 }
        ]
    },

    slowTempo: {
        timeSignature: '4/4',
        measures: 1,
        bpm: 60,
        notes: [
            { drum: 'kick', beat: 1.0 },
            { drum: 'snare', beat: 2.0 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'snare', beat: 4.0 }
        ]
    }
};
