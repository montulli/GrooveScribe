/**
 * Comprehensive CoachEngine Tests
 * Target: 40+ tests for engine logic
 */
import { jest } from '@jest/globals';
import { CoachEngine } from '../../../coach/engine/CoachEngine.js';
import { PerformanceGenerator, GROOVES } from '../lib/PerformanceGenerator.js';

describe('CoachEngine', () => {
    let engine;
    let generator;

    beforeEach(() => {
        engine = new CoachEngine({ windows: { perfect: 15, good: 30, close: 50 } });
        generator = new PerformanceGenerator({ seed: 12345 });
    });

    describe('Initialization', () => {
        test('engine starts with default state', () => {
            expect(engine.isPlaying).toBe(false);
            expect(engine.noteTimeline).toEqual([]);
            expect(engine.results).toEqual([]);
        });

        test('engine accepts custom windows', () => {
            const customEngine = new CoachEngine({
                windows: { perfect: 10, good: 20, close: 30 }
            });
            expect(customEngine.windows.perfect).toBe(10);
        });

        test('engine accepts audio latency', () => {
            const customEngine = new CoachEngine({ audioLatency: 75 });
            expect(customEngine.audioLatency).toBe(75);
        });

        test('default audio latency is reasonable', () => {
            expect(engine.audioLatency).toBeGreaterThanOrEqual(0);
            expect(engine.audioLatency).toBeLessThanOrEqual(200);
        });
    });

    describe('Groove Loading', () => {
        test('loadGroove creates note timeline', () => {
            const groove = {
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            };
            engine.loadGroove(groove);
            expect(engine.noteTimeline.length).toBe(2);
        });

        test('loadGroove sets matched flag to false', () => {
            const groove = {
                target: [{ time: 0, type: 'kick' }]
            };
            engine.loadGroove(groove);
            expect(engine.noteTimeline[0].matched).toBe(false);
        });

        test('loadGroove preserves original index', () => {
            const groove = {
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            };
            engine.loadGroove(groove);
            expect(engine.noteTimeline[0].originalIndex).toBe(0);
            expect(engine.noteTimeline[1].originalIndex).toBe(1);
        });

        test('loadGroove clears previous results', () => {
            engine.results = [{ tier: 'perfect' }];
            engine.loadGroove({ target: [] });
            expect(engine.results).toEqual([]);
        });

        test('loadGroove handles empty groove', () => {
            engine.loadGroove({ target: [] });
            expect(engine.noteTimeline.length).toBe(0);
        });

        test('loadGroove handles large groove', () => {
            const target = Array.from({ length: 100 }, (_, i) => ({
                time: i * 100,
                type: i % 2 === 0 ? 'kick' : 'snare'
            }));
            engine.loadGroove({ target });
            expect(engine.noteTimeline.length).toBe(100);
        });
    });

    describe('Start/Stop', () => {
        test('start sets isPlaying to true', () => {
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            engine.start(1000);
            expect(engine.isPlaying).toBe(true);
        });

        test('start records start time', () => {
            engine.start(12345);
            expect(engine.startTime).toBe(12345);
        });

        test('start clears previous results', () => {
            engine.results = [{ tier: 'perfect' }];
            engine.start(1000);
            expect(engine.results).toEqual([]);
        });

        test('start resets matched flags', () => {
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            engine.noteTimeline[0].matched = true;
            engine.start(1000);
            expect(engine.noteTimeline[0].matched).toBe(false);
        });

        test('stop sets isPlaying to false', () => {
            engine.start(1000);
            engine.stop();
            expect(engine.isPlaying).toBe(false);
        });
    });

    describe('Hit Handling - Perfect Timing', () => {
        beforeEach(() => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            });
            engine.audioLatency = 0;
            engine.start(1000);
        });

        test('perfect hit on kick returns perfect tier', () => {
            const result = engine.handleMidiHit('kick', 1000);
            expect(result.tier).toBe('perfect');
        });

        test('perfect hit on snare returns perfect tier', () => {
            const result = engine.handleMidiHit('snare', 1500);
            expect(result.tier).toBe('perfect');
        });

        test('perfect hit marks note as matched', () => {
            engine.handleMidiHit('kick', 1000);
            expect(engine.noteTimeline[0].matched).toBe(true);
        });

        test('perfect hit returns correct noteIndex', () => {
            const result = engine.handleMidiHit('snare', 1500);
            expect(result.noteIndex).toBe(1);
        });
    });

    describe('Hit Handling - Various Tiers', () => {
        beforeEach(() => {
            engine.loadGroove({
                target: [{ time: 0, type: 'kick' }]
            });
            engine.audioLatency = 0;
            engine.start(1000);
        });

        test('slightly late hit is still perfect', () => {
            const result = engine.handleMidiHit('kick', 1010);
            expect(result.tier).toBe('perfect');
        });

        test('slightly early hit is still perfect', () => {
            const result = engine.handleMidiHit('kick', 990);
            expect(result.tier).toBe('perfect');
        });

        test('20ms late hit is good', () => {
            const result = engine.handleMidiHit('kick', 1020);
            expect(result.tier).toBe('good');
        });

        test('40ms late hit is close', () => {
            const result = engine.handleMidiHit('kick', 1040);
            expect(result.tier).toBe('close');
        });
    });

    describe('Hit Handling - Wrong Drum', () => {
        beforeEach(() => {
            engine.loadGroove({
                target: [{ time: 0, type: 'kick' }]
            });
            engine.audioLatency = 0;
            engine.start(1000);
        });

        test('hitting wrong drum type returns extra', () => {
            const result = engine.handleMidiHit('snare', 1000);
            expect(result.tier).toBe('extra');
            expect(result.isMatch).toBe(false);
        });

        test('extra hit does not match any note', () => {
            engine.handleMidiHit('snare', 1000);
            expect(engine.noteTimeline[0].matched).toBe(false);
        });
    });

    describe('Hit Handling - State Checks', () => {
        test('hits before start return null', () => {
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            const result = engine.handleMidiHit('kick', 1000);
            expect(result).toBeNull();
        });

        test('hits after stop return null', () => {
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            engine.start(1000);
            engine.stop();
            const result = engine.handleMidiHit('kick', 1000);
            expect(result).toBeNull();
        });
    });

    describe('Results Aggregation', () => {
        test('getResults returns correct counts for perfect hits', () => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            });
            engine.audioLatency = 0;
            engine.start(1000);
            engine.handleMidiHit('kick', 1000);
            engine.handleMidiHit('snare', 1500);

            const stats = engine.getResults();
            expect(stats.perfect).toBe(2);
            expect(stats.miss).toBe(0);
            expect(stats.totalNotes).toBe(2);
        });

        test('getResults counts missed notes', () => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' }
                ]
            });
            engine.audioLatency = 0;
            engine.start(1000);
            engine.handleMidiHit('kick', 1000);
            // Snare is not hit

            const stats = engine.getResults();
            expect(stats.perfect).toBe(1);
            expect(stats.miss).toBe(1);
        });

        test('getResults counts extra hits', () => {
            engine.loadGroove({
                target: [{ time: 0, type: 'kick' }]
            });
            engine.start(1000);
            engine.handleMidiHit('kick', 1000);
            engine.handleMidiHit('snare', 1200); // Extra

            const stats = engine.getResults();
            expect(stats.extra).toBe(1);
        });

        test('getResults returns totalNotes correctly', () => {
            engine.loadGroove({
                target: Array.from({ length: 10 }, (_, i) => ({
                    time: i * 100,
                    type: 'kick'
                }))
            });
            const stats = engine.getResults();
            expect(stats.totalNotes).toBe(10);
        });
    });

    describe('Fixture-Based Testing - Perfect Performance', () => {
        test('perfect performance on basic rock beat', () => {
            const groove = GROOVES.basicRock;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'perfect',
                jitterMs: 0
            });

            // Convert groove to timeline format
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map((note, i) => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            // Simulate all hits
            for (const hit of performance.hits) {
                const hitTime = (hit.beatOffset) * beatDurationMs + hit.timingErrorMs;
                engine.handleMidiHit(hit.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(groove.notes.length);
            expect(stats.miss).toBe(0);
        });

        test('perfect performance on single note', () => {
            const groove = GROOVES.singleNote;
            const beatDurationMs = 60000 / groove.bpm;
            const target = [{ time: 0, type: 'kick' }];

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);
            engine.handleMidiHit('kick', 0);

            const stats = engine.getResults();
            expect(stats.perfect).toBe(1);
            expect(stats.totalNotes).toBe(1);
        });
    });

    describe('Fixture-Based Testing - Mixed Performance', () => {
        test('good performance has mix of tiers', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'good',
                jitterMs: 5
            });

            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            for (const hit of performance.hits) {
                const hitTime = hit.beatOffset * beatDurationMs + hit.timingErrorMs;
                engine.handleMidiHit(hit.drum, hitTime);
            }

            const stats = engine.getResults();
            // Should have mostly good/perfect with this profile
            expect(stats.perfect + stats.good + stats.close).toBeGreaterThan(0);
        });

        test('rushing performance shows early tendency', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'rushing'
            });

            // All hits should be early (negative timing error)
            for (const hit of performance.hits) {
                expect(hit.timingErrorMs).toBeLessThan(0);
            }
        });

        test('dragging performance shows late tendency', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'dragging'
            });

            // All hits should be late (positive timing error)
            for (const hit of performance.hits) {
                expect(hit.timingErrorMs).toBeGreaterThan(0);
            }
        });
    });

    describe('Fixture-Based Testing - Miss Scenarios', () => {
        test('performance with 50% miss rate has misses', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                timingProfile: 'perfect',
                missRate: 0.5
            });

            expect(performance.hits.length).toBeLessThan(groove.notes.length);
        });

        test('performance with 100% miss rate has no hits', () => {
            generator.reset();
            const groove = GROOVES.simpleKickSnare;
            const performance = generator.generatePerformance(groove, {
                missRate: 1.0
            });

            expect(performance.hits.length).toBe(0);
        });

        test('missed notes count in results', () => {
            engine.loadGroove({
                target: [
                    { time: 0, type: 'kick' },
                    { time: 500, type: 'snare' },
                    { time: 1000, type: 'kick' }
                ]
            });
            engine.start(0);
            engine.handleMidiHit('kick', 0); // Hit first
            // Miss second and third

            const stats = engine.getResults();
            expect(stats.miss).toBe(2);
        });
    });

    describe('Callback System', () => {
        test('onHitEvaluated callback is called', () => {
            const mockCallback = jest.fn();
            engine = new CoachEngine({ onHitEvaluated: mockCallback });
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            engine.start(0);
            engine.handleMidiHit('kick', 0);

            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        test('onHitEvaluated receives evaluation object', () => {
            let receivedEval = null;
            engine = new CoachEngine({
                onHitEvaluated: (ev) => { receivedEval = ev; }
            });
            engine.loadGroove({ target: [{ time: 0, type: 'kick' }] });
            engine.start(0);
            engine.handleMidiHit('kick', 0);

            expect(receivedEval).not.toBeNull();
            expect(receivedEval.tier).toBeDefined();
        });
    });

    describe('Dense Pattern Handling', () => {
        test('handles 16th notes at 120bpm', () => {
            const groove = GROOVES.denseSixteenths;
            const beatDurationMs = 60000 / groove.bpm;
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            // Hit all notes perfectly
            for (let i = 0; i < 16; i++) {
                const hitTime = i * (beatDurationMs / 4);
                engine.handleMidiHit('hh_closed', hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(16);
        });
    });

    describe('Tempo Variations', () => {
        test('handles fast tempo (200bpm)', () => {
            const groove = GROOVES.fastTempo;
            const beatDurationMs = 60000 / groove.bpm; // 300ms per beat
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            // Hit all notes
            for (const note of groove.notes) {
                const hitTime = (note.beat - 1) * beatDurationMs;
                engine.handleMidiHit(note.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(groove.notes.length);
        });

        test('handles slow tempo (60bpm)', () => {
            const groove = GROOVES.slowTempo;
            const beatDurationMs = 60000 / groove.bpm; // 1000ms per beat
            const target = groove.notes.map(note => ({
                time: (note.beat - 1) * beatDurationMs,
                type: note.drum
            }));

            engine.loadGroove({ target });
            engine.audioLatency = 0;
            engine.start(0);

            for (const note of groove.notes) {
                const hitTime = (note.beat - 1) * beatDurationMs;
                engine.handleMidiHit(note.drum, hitTime);
            }

            const stats = engine.getResults();
            expect(stats.perfect).toBe(groove.notes.length);
        });
    });
});
