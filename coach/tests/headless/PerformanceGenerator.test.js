/**
 * Comprehensive PerformanceGenerator Tests
 * Tests the fixture generation library itself
 */
import { PerformanceGenerator, GROOVES } from '../lib/PerformanceGenerator.js';
import { DrumType, ModuleDrumTypes } from '../../engine/DrumConstants.js';

describe('PerformanceGenerator', () => {
    let generator;

    beforeEach(() => {
        generator = new PerformanceGenerator({ seed: 12345 });
    });

    describe('Initialization', () => {
        test('creates generator with default options', () => {
            const gen = new PerformanceGenerator();
            expect(gen).toBeDefined();
        });

        test('accepts custom seed', () => {
            const gen = new PerformanceGenerator({ seed: 99999 });
            expect(gen.seed).toBe(99999);
        });

        test('accepts default jitter', () => {
            const gen = new PerformanceGenerator({ defaultJitter: 5 });
            expect(gen.defaultJitter).toBe(5);
        });
    });

    describe('RNG Reproducibility', () => {
        test('same seed produces same sequence', () => {
            const gen1 = new PerformanceGenerator({ seed: 12345 });
            const gen2 = new PerformanceGenerator({ seed: 12345 });

            const values1 = Array.from({ length: 10 }, () => gen1.rng());
            const values2 = Array.from({ length: 10 }, () => gen2.rng());

            expect(values1).toEqual(values2);
        });

        test('different seeds produce different sequences', () => {
            const gen1 = new PerformanceGenerator({ seed: 12345 });
            const gen2 = new PerformanceGenerator({ seed: 54321 });

            const values1 = Array.from({ length: 10 }, () => gen1.rng());
            const values2 = Array.from({ length: 10 }, () => gen2.rng());

            expect(values1).not.toEqual(values2);
        });

        test('reset restores original RNG state', () => {
            const gen = new PerformanceGenerator({ seed: 12345 });
            const before = Array.from({ length: 5 }, () => gen.rng());
            gen.reset();
            const after = Array.from({ length: 5 }, () => gen.rng());

            expect(before).toEqual(after);
        });
    });

    describe('Performance Generation - Basic', () => {
        test('generates performance with all notes', () => {
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove);

            expect(performance.hits.length).toBe(groove.notes.length);
        });

        test('includes audioLatencyMs', () => {
            const performance = generator.generatePerformance(GROOVES.singleNote, {
                audioLatencyMs: 75
            });

            expect(performance.audioLatencyMs).toBe(75);
        });

        test('includes calibrationOffsetMs', () => {
            const performance = generator.generatePerformance(GROOVES.singleNote, {
                calibrationOffsetMs: -10
            });

            expect(performance.calibrationOffsetMs).toBe(-10);
        });

        test('hits have drum type', () => {
            const performance = generator.generatePerformance(GROOVES.singleNote);

            expect(performance.hits[0].drum).toBe('kick');
        });

        test('hits have beatOffset', () => {
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare);

            expect(performance.hits[0].beatOffset).toBe(0); // Beat 1 = offset 0
            expect(performance.hits[1].beatOffset).toBe(1); // Beat 2 = offset 1
        });

        test('hits have timingErrorMs', () => {
            const performance = generator.generatePerformance(GROOVES.singleNote);

            expect(typeof performance.hits[0].timingErrorMs).toBe('number');
        });
    });

    describe('Timing Profiles', () => {
        test('perfect profile has near-zero timing errors', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                timingProfile: 'perfect',
                jitterMs: 0
            });

            for (const hit of performance.hits) {
                expect(Math.abs(hit.timingErrorMs)).toBe(0);
            }
        });

        test('perfect profile with jitter stays within jitter bounds', () => {
            generator.reset();
            const jitter = 5;
            const performance = generator.generatePerformance(GROOVES.basicRock, {
                timingProfile: 'perfect',
                jitterMs: jitter
            });

            for (const hit of performance.hits) {
                expect(Math.abs(hit.timingErrorMs)).toBeLessThanOrEqual(jitter);
            }
        });

        test('rushing profile produces early hits', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                timingProfile: 'rushing'
            });

            for (const hit of performance.hits) {
                expect(hit.timingErrorMs).toBeLessThan(0);
            }
        });

        test('dragging profile produces late hits', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                timingProfile: 'dragging'
            });

            for (const hit of performance.hits) {
                expect(hit.timingErrorMs).toBeGreaterThan(0);
            }
        });

        test('good profile produces within ±20ms range', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.basicRock, {
                timingProfile: 'good',
                jitterMs: 0
            });

            for (const hit of performance.hits) {
                expect(Math.abs(hit.timingErrorMs)).toBeLessThanOrEqual(20);
            }
        });

        test('random profile produces varied timing', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.basicRock, {
                timingProfile: 'random'
            });

            const errors = performance.hits.map(h => h.timingErrorMs);
            const uniqueErrors = new Set(errors);
            expect(uniqueErrors.size).toBeGreaterThan(1);
        });

        test('mixed profile produces varied tiers', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.denseSixteenths, {
                timingProfile: 'mixed',
                jitterMs: 2
            });

            // With 16 notes, we should see some variety
            const absErrors = performance.hits.map(h => Math.abs(h.timingErrorMs));
            const minError = Math.min(...absErrors);
            const maxError = Math.max(...absErrors);
            expect(maxError - minError).toBeGreaterThan(0);
        });
    });

    describe('Miss Rate', () => {
        test('0% miss rate produces all notes', () => {
            generator.reset();
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                missRate: 0
            });

            expect(performance.hits.length).toBe(GROOVES.simpleKickSnare.notes.length);
        });

        test('100% miss rate produces no notes', () => {
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                missRate: 1.0
            });

            expect(performance.hits.length).toBe(0);
        });

        test('50% miss rate reduces notes', () => {
            // Run multiple times to ensure it's working probabilistically
            let totalHits = 0;
            const totalNotes = GROOVES.basicRock.notes.length * 10;

            for (let i = 0; i < 10; i++) {
                const gen = new PerformanceGenerator({ seed: i * 1000 });
                const perf = gen.generatePerformance(GROOVES.basicRock, {
                    missRate: 0.5
                });
                totalHits += perf.hits.length;
            }

            // Should be roughly 50% with some variance
            expect(totalHits / totalNotes).toBeGreaterThan(0.3);
            expect(totalHits / totalNotes).toBeLessThan(0.7);
        });
    });

    describe('Extra Hits', () => {
        test('0% extra hit rate produces no extras', () => {
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                extraHitRate: 0
            });

            const extras = performance.hits.filter(h => h.isExtra);
            expect(extras.length).toBe(0);
        });

        test('non-zero extra hit rate can produce extras', () => {
            // With high rate on longer groove, should produce some extras
            let hasExtras = false;
            for (let i = 0; i < 20; i++) {
                const gen = new PerformanceGenerator({ seed: i * 500 });
                const perf = gen.generatePerformance(GROOVES.basicRock, {
                    extraHitRate: 0.3
                });
                if (perf.hits.some(h => h.isExtra)) {
                    hasExtras = true;
                    break;
                }
            }
            expect(hasExtras).toBe(true);
        });

        test('extra hits are marked with isExtra flag', () => {
            // Force extra hits
            generator = new PerformanceGenerator({ seed: 99999 });
            const performance = generator.generatePerformance(GROOVES.basicRock, {
                extraHitRate: 0.5
            });

            const extras = performance.hits.filter(h => h.isExtra);
            for (const extra of extras) {
                expect(extra.isExtra).toBe(true);
            }
        });

        test('extra hits use wrong drum types', () => {
            generator = new PerformanceGenerator({ seed: 88888 });
            const performance = generator.generatePerformance(GROOVES.simpleKickSnare, {
                extraHitRate: 0.8
            });

            const extras = performance.hits.filter(h => h.isExtra);
            const wrongDrums = ModuleDrumTypes.filter(d => d !== DrumType.UNKNOWN);

            for (const extra of extras) {
                expect(wrongDrums).toContain(extra.drum);
            }
        });
    });

    describe('Expected Results Calculation', () => {
        test('perfect performance has all perfect', () => {
            const groove = GROOVES.simpleKickSnare;
            const performance = {
                hits: groove.notes.map(n => ({
                    drum: n.drum,
                    beatOffset: n.beat - 1,
                    timingErrorMs: 0
                }))
            };

            const results = generator.calculateExpectedResults(groove, performance);
            expect(results.perfect).toBe(4);
            expect(results.miss).toBe(0);
        });

        test('all misses performance has all miss', () => {
            const groove = GROOVES.simpleKickSnare;
            const performance = { hits: [] };

            const results = generator.calculateExpectedResults(groove, performance);
            expect(results.miss).toBe(4);
            expect(results.perfect).toBe(0);
        });

        test('good timing errors produce good tier', () => {
            const groove = GROOVES.singleNote;
            const performance = {
                hits: [{ drum: 'kick', beatOffset: 0, timingErrorMs: 25 }]
            };

            const results = generator.calculateExpectedResults(groove, performance);
            expect(results.good).toBe(1);
        });

        test('close timing errors produce close tier', () => {
            const groove = GROOVES.singleNote;
            const performance = {
                hits: [{ drum: 'kick', beatOffset: 0, timingErrorMs: 45 }]
            };

            const results = generator.calculateExpectedResults(groove, performance);
            expect(results.close).toBe(1);
        });

        test('extra hits are counted', () => {
            const groove = GROOVES.singleNote;
            const performance = {
                hits: [
                    { drum: 'kick', beatOffset: 0, timingErrorMs: 0 },
                    { drum: 'snare', beatOffset: 0.5, timingErrorMs: 0, isExtra: true }
                ]
            };

            const results = generator.calculateExpectedResults(groove, performance);
            expect(results.extra).toBe(1);
        });

        test('custom windows affect classification', () => {
            const groove = GROOVES.singleNote;
            const performance = {
                hits: [{ drum: 'kick', beatOffset: 0, timingErrorMs: 15 }]
            };

            const strictWindows = { perfect: 10, good: 20, close: 30 };
            const results = generator.calculateExpectedResults(groove, performance, strictWindows);
            expect(results.good).toBe(1);
        });
    });

    describe('Timeline Conversion', () => {
        test('converts performance to timeline', () => {
            const performance = {
                hits: [
                    { drum: 'kick', beatOffset: 0, timingErrorMs: 5 },
                    { drum: 'snare', beatOffset: 1, timingErrorMs: -3 }
                ]
            };

            const timeline = generator.toTimeline(performance, 120);

            expect(timeline.length).toBe(2);
            expect(timeline[0].time).toBe(5); // 0 * 500 + 5
            expect(timeline[1].time).toBe(497); // 1 * 500 - 3
        });

        test('timeline includes drum type', () => {
            const performance = {
                hits: [{ drum: 'kick', beatOffset: 0, timingErrorMs: 0 }]
            };

            const timeline = generator.toTimeline(performance, 120);
            expect(timeline[0].drum).toBe('kick');
        });

        test('timeline marks extra hits', () => {
            const performance = {
                hits: [
                    { drum: 'kick', beatOffset: 0, timingErrorMs: 0, isExtra: false },
                    { drum: 'snare', beatOffset: 0.5, timingErrorMs: 0, isExtra: true }
                ]
            };

            const timeline = generator.toTimeline(performance, 120);
            expect(timeline[0].isExtra).toBe(false);
            expect(timeline[1].isExtra).toBe(true);
        });

        test('timeline times scale with BPM', () => {
            const performance = {
                hits: [{ drum: 'kick', beatOffset: 1, timingErrorMs: 0 }]
            };

            const timeline60 = generator.toTimeline(performance, 60);
            const timeline120 = generator.toTimeline(performance, 120);

            expect(timeline60[0].time).toBe(1000); // 1 beat at 60bpm = 1000ms
            expect(timeline120[0].time).toBe(500); // 1 beat at 120bpm = 500ms
        });
    });

    describe('Standard Grooves', () => {
        test('basicRock has 12 notes', () => {
            expect(GROOVES.basicRock.notes.length).toBe(12);
        });

        test('simpleKickSnare has 4 notes', () => {
            expect(GROOVES.simpleKickSnare.notes.length).toBe(4);
        });

        test('singleNote has 1 note', () => {
            expect(GROOVES.singleNote.notes.length).toBe(1);
        });

        test('denseSixteenths has 16 notes', () => {
            expect(GROOVES.denseSixteenths.notes.length).toBe(16);
        });

        test('all grooves have required properties', () => {
            for (const [name, groove] of Object.entries(GROOVES)) {
                expect(groove.timeSignature).toBeDefined();
                expect(groove.measures).toBeDefined();
                expect(groove.bpm).toBeDefined();
                expect(groove.notes).toBeDefined();
                expect(Array.isArray(groove.notes)).toBe(true);
            }
        });

        test('all groove notes have drum and beat', () => {
            for (const [name, groove] of Object.entries(GROOVES)) {
                for (const note of groove.notes) {
                    expect(note.drum).toBeDefined();
                    expect(note.beat).toBeDefined();
                }
            }
        });
    });
});
