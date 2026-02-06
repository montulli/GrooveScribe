/**
 * Comprehensive MIDI Simulation Tests
 * Tests for simulating and replaying performances
 */
import { PerformanceGenerator, GROOVES } from '../lib/PerformanceGenerator.js';
import { CoachEngine } from '../../../coach/engine/CoachEngine.js';

describe('MIDI Simulation', () => {
    let engine;
    let generator;

    beforeEach(() => {
        engine = new CoachEngine({
            windows: { perfect: 15, good: 30, close: 50 }
        });
        generator = new PerformanceGenerator({ seed: 12345 });
    });

    describe('Performance Replay', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for replay tests
        });

        test('can replay perfect performance', () => {
            const groove = GROOVES.simpleKickSnare;
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            // Perfect hits at exact times
            for (const note of groove.notes) {
                const hitTime = (note.beat - 1) * beatDurationMs;
                engine.handleMidiHit(note.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(4);
            expect(stats.totalNotes).toBe(4);
        });

        test('can replay generated performance', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'perfect',
                jitterMs: 0
            });

            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            for (const hit of performance.hits) {
                const hitTime = hit.beatOffset * beatDurationMs + hit.timingErrorMs;
                engine.handleMidiHit(hit.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(groove.notes.length);
        });
    });

    describe('Timing Accuracy Verification', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for timing accuracy tests
        });

        test('15ms early hit is perfect', () => {
            engine.loadGroove({
                target: [{ time: 1000, type: 'kick' }]
            });
            engine.start(0);

            const result = engine.handleMidiHit('kick', 985);
            expect(result.tier).toBe('perfect');
        });

        test('16ms early hit is good', () => {
            engine.loadGroove({
                target: [{ time: 1000, type: 'kick' }]
            });
            engine.start(0);

            const result = engine.handleMidiHit('kick', 984);
            expect(result.tier).toBe('good');
        });

        test('15ms late hit is perfect', () => {
            engine.loadGroove({
                target: [{ time: 1000, type: 'kick' }]
            });
            engine.start(0);

            const result = engine.handleMidiHit('kick', 1015);
            expect(result.tier).toBe('perfect');
        });

        test('16ms late hit is good', () => {
            engine.loadGroove({
                target: [{ time: 1000, type: 'kick' }]
            });
            engine.start(0);

            const result = engine.handleMidiHit('kick', 1016);
            expect(result.tier).toBe('good');
        });
    });

    describe('Multi-Drum Pattern Simulation', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for pattern tests
        });

        test('basic rock beat simulation', () => {
            const groove = GROOVES.basicRock;
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            // Simulate perfect performance
            let perfectCount = 0;
            for (const note of groove.notes) {
                const hitTime = (note.beat - 1) * beatDurationMs;
                const result = engine.handleMidiHit(note.drum, hitTime);
                if (result && result.tier === 'perfect') perfectCount++;
            }

            expect(perfectCount).toBe(12); // All 12 notes perfect
        });

        test('handles simultaneous hits correctly', () => {
            // Kick and hi-hat on beat 1
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 0, type: 'hh_closed' }
                ]
            });
            engine.start(0);

            const result1 = engine.handleMidiHit('kick', 5);
            const result2 = engine.handleMidiHit('hh_closed', 5);

            expect(result1.tier).toBe('perfect');
            expect(result2.tier).toBe('perfect');
        });

        test('distinguishes different drum types', () => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            });
            engine.start(0);

            // Hit snare when kick is expected
            const result = engine.handleMidiHit('snare', 0);
            expect(result.tier).toBe('extra');
        });
    });

    describe('Timing Profile Simulations', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for profile tests
        });

        test('rushing tendency produces early hits', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'rushing'
            });

            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            let totalError = 0;
            let hitCount = 0;

            for (const hit of performance.hits) {
                const hitTime = hit.beatOffset * beatDurationMs + hit.timingErrorMs;
                const result = engine.handleMidiHit(hit.drum, hitTime);
                if (result && result.timingError !== undefined) {
                    totalError += result.timingError;
                    hitCount++;
                }
            }

            // Average should be negative (early)
            expect(totalError / hitCount).toBeLessThan(0);
        });

        test('dragging tendency produces late hits', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'dragging'
            });

            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            let totalError = 0;
            let hitCount = 0;

            for (const hit of performance.hits) {
                const hitTime = hit.beatOffset * beatDurationMs + hit.timingErrorMs;
                const result = engine.handleMidiHit(hit.drum, hitTime);
                if (result && result.timingError !== undefined) {
                    totalError += result.timingError;
                    hitCount++;
                }
            }

            // Average should be positive (late)
            expect(totalError / hitCount).toBeGreaterThan(0);
        });
    });

    describe('Score Calculation', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for score tests
        });

        test('perfect score for perfect performance', () => {
            const groove = GROOVES.simpleKickSnare;
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            for (const note of groove.notes) {
                const hitTime = (note.beat - 1) * beatDurationMs;
                engine.handleMidiHit(note.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.score).toBe(100);
        });

        test('zero score for all misses', () => {
            const groove = GROOVES.simpleKickSnare;
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);
            // No hits

            const stats = engine.getResults();
            expect(stats.score).toBe(0);
        });

        test('partial score for mixed performance', () => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            });
            engine.start(0);

            // Hit only first note
            engine.handleMidiHit('kick', 0);

            const stats = engine.getResults();
            expect(stats.score).toBe(50); // 1 of 2 notes
        });
    });

    describe('Dense Pattern Handling', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for pattern tests
        });

        test('handles 16th notes at 120bpm', () => {
            const groove = GROOVES.denseSixteenths;
            const beatDurationMs = 60000 / groove.bpm;
            const sixteenthDuration = beatDurationMs / 4;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            // Perfect 16th notes
            for (let i = 0; i < 16; i++) {
                engine.handleMidiHit('hh_closed', i * sixteenthDuration);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(16);
        });

        test('handles 32nd notes at 60bpm', () => {
            const bpm = 60;
            const beatDurationMs = 60000 / bpm;
            const thirtySecondDuration = beatDurationMs / 8;
            const notes = Array.from({ length: 32 }, (_, i) => ({
                drum: 'hh_closed',
                beat: 1 + i * 0.125
            }));

            const target = notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.start(0);

            for (let i = 0; i < 32; i++) {
                engine.handleMidiHit('hh_closed', i * thirtySecondDuration);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(32);
        });
    });

    describe('Tempo Variations', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for tempo tests
        });

        test('handles BPM = 40 (very slow)', () => {
            const bpm = 40;
            const beatDurationMs = 60000 / bpm; // 1500ms per beat

            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: beatDurationMs, type: 'snare' }
                ]
            });
            engine.start(0);

            engine.handleMidiHit('kick', 0);
            engine.handleMidiHit('snare', beatDurationMs);

            const stats = engine.getResults();
            expect(stats.perfect).toBe(2);
        });

        test('handles BPM = 240 (very fast)', () => {
            const bpm = 240;
            const beatDurationMs = 60000 / bpm; // 250ms per beat

            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: beatDurationMs, type: 'snare' }
                ]
            });
            engine.start(0);

            engine.handleMidiHit('kick', 0);
            engine.handleMidiHit('snare', beatDurationMs);

            const stats = engine.getResults();
            expect(stats.perfect).toBe(2);
        });
    });

    describe('Latency Compensation in Simulation', () => {
        test('simulated hits with latency score correctly', () => {
            const audioLatency = 50;
            engine.audioLatency = audioLatency;

            engine.loadGroove({
                target: [{ time: 0, type: 'kick' }]
            });
            engine.start(0);

            // Player hears audio 50ms late, so hits 50ms late
            const result = engine.handleMidiHit('kick', audioLatency);
            expect(result.tier).toBe('perfect');
        });

        test('early hit relative to latency is penalized', () => {
            const audioLatency = 50;
            engine.audioLatency = audioLatency;

            engine.loadGroove({
                target: [{ time: 0, type: 'kick' }]
            });
            engine.start(0);

            // Player hits early (before audio delay)
            const result = engine.handleMidiHit('kick', 20);
            expect(result.tier).not.toBe('perfect'); // 20 - 50 = -30ms error
        });
    });

    describe('Stress Testing', () => {
        beforeEach(() => {
            engine.audioLatency = 0; // No latency for stress tests
        });

        test('handles 100 note pattern', () => {
            const notes = Array.from({ length: 100 }, (_, i) => ({
                time: i * 100,
                type: i % 3 === 0 ? 'kick' : i % 3 === 1 ? 'snare' : 'hh_closed'
            }));

            engine.loadGroove({ target: notes });
            engine.start(0);

            for (const note of notes) {
                engine.handleMidiHit(note.type, note.time);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(100);
        });

        test('handles rapid repeated hits on same drum', () => {
            const notes = Array.from({ length: 50 }, (_, i) => ({
                time: i * 50,
                type: 'hh_closed'
            }));

            engine.loadGroove({ target: notes });
            engine.start(0);

            for (let i = 0; i < 50; i++) {
                engine.handleMidiHit('hh_closed', i * 50);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(50);
        });
    });

    describe('Statistical Validation', () => {
        test('multiple perfect runs produce identical results', () => {
            const runTest = () => {
                const groove = GROOVES.basicRock;
                const beatDurationMs = 60000 / groove.bpm;
                const target = groove.notes.map(note => ({
                    time: (note.beat - 1) * beatDurationMs,
                    type: note.drum
                }));

                const testEngine = new CoachEngine({
                    windows: { perfect: 15, good: 30, close: 50 }
                });
                testEngine.loadGroove({ target });
                testEngine.start(0);

                for (const note of groove.notes) {
                    const hitTime = (note.beat - 1) * beatDurationMs;
                    testEngine.handleMidiHit(note.drum, hitTime);
                }

                return testEngine.getResults();
            };

            const results = Array.from({ length: 10 }, runTest);

            // All runs should produce identical results
            for (let i = 1; i < results.length; i++) {
                expect(results[i].perfect).toBe(results[0].perfect);
                expect(results[i].score).toBe(results[0].score);
            }
        });

        test('seeded generator produces reproducible results', () => {
            const runWithSeed = (seed) => {
                const gen = new PerformanceGenerator({ seed });
                return gen.generatePerformance(GROOVES.basicRock, {
                    timingProfile: 'good',
                    jitterMs: 5
                });
            };

            const perf1 = runWithSeed(12345);
            const perf2 = runWithSeed(12345);

            expect(perf1.hits.length).toBe(perf2.hits.length);
            for (let i = 0; i < perf1.hits.length; i++) {
                expect(perf1.hits[i].timingErrorMs).toBe(perf2.hits[i].timingErrorMs);
            }
        });
    });
});
