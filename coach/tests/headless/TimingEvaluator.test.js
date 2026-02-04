/**
 * Comprehensive TimingEvaluator Tests
 * Target: 30+ tests for timing evaluation logic
 */
import { evaluateHit } from '../../../coach/engine/TimingEvaluator.js';

describe('TimingEvaluator', () => {
    const defaultWindows = { perfect: 15, good: 30, close: 50 };

    describe('Basic Tier Assignment', () => {
        test('exact timing (0ms error) is perfect', () => {
            const result = evaluateHit(1000, 1000, 0, defaultWindows);
            expect(result.tier).toBe('perfect');
            expect(result.timingError).toBe(0);
        });

        test('1ms early is perfect', () => {
            const result = evaluateHit(999, 1000, 0, defaultWindows);
            expect(result.tier).toBe('perfect');
            expect(result.timingError).toBe(-1);
        });

        test('1ms late is perfect', () => {
            const result = evaluateHit(1001, 1000, 0, defaultWindows);
            expect(result.tier).toBe('perfect');
            expect(result.timingError).toBe(1);
        });

        test('5ms error is perfect', () => {
            expect(evaluateHit(1005, 1000, 0, defaultWindows).tier).toBe('perfect');
        });

        test('10ms error is perfect', () => {
            expect(evaluateHit(1010, 1000, 0, defaultWindows).tier).toBe('perfect');
        });

        test('20ms error is good', () => {
            expect(evaluateHit(1020, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('25ms error is good', () => {
            expect(evaluateHit(1025, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('35ms error is close', () => {
            expect(evaluateHit(1035, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('45ms error is close', () => {
            expect(evaluateHit(1045, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('60ms error is miss', () => {
            expect(evaluateHit(1060, 1000, 0, defaultWindows).tier).toBe('miss');
        });

        test('100ms error is miss', () => {
            expect(evaluateHit(1100, 1000, 0, defaultWindows).tier).toBe('miss');
        });
    });

    describe('Boundary Conditions (exact boundaries)', () => {
        test('exactly 15ms is perfect (upper bound)', () => {
            expect(evaluateHit(1015, 1000, 0, defaultWindows).tier).toBe('perfect');
        });

        test('exactly 16ms is good (lower bound)', () => {
            expect(evaluateHit(1016, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('exactly 30ms is good (upper bound)', () => {
            expect(evaluateHit(1030, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('exactly 31ms is close (lower bound)', () => {
            expect(evaluateHit(1031, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('exactly 50ms is close (upper bound)', () => {
            expect(evaluateHit(1050, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('exactly 51ms is miss (lower bound)', () => {
            expect(evaluateHit(1051, 1000, 0, defaultWindows).tier).toBe('miss');
        });

        // Negative (early) boundaries
        test('exactly -15ms is perfect', () => {
            expect(evaluateHit(985, 1000, 0, defaultWindows).tier).toBe('perfect');
        });

        test('exactly -16ms is good', () => {
            expect(evaluateHit(984, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('exactly -30ms is good', () => {
            expect(evaluateHit(970, 1000, 0, defaultWindows).tier).toBe('good');
        });

        test('exactly -31ms is close', () => {
            expect(evaluateHit(969, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('exactly -50ms is close', () => {
            expect(evaluateHit(950, 1000, 0, defaultWindows).tier).toBe('close');
        });

        test('exactly -51ms is miss', () => {
            expect(evaluateHit(949, 1000, 0, defaultWindows).tier).toBe('miss');
        });
    });

    describe('Audio Latency Compensation', () => {
        const latency = 50; // 50ms audio latency

        test('hit with latency compensation is adjusted correctly', () => {
            // Player hits 50ms after target because audio is delayed 50ms
            const result = evaluateHit(1050, 1000, latency, defaultWindows);
            expect(result.timingError).toBe(0); // After latency compensation
            expect(result.tier).toBe('perfect');
        });

        test('early hit with latency is still early', () => {
            const result = evaluateHit(1040, 1000, latency, defaultWindows);
            expect(result.timingError).toBe(-10); // 40 - 50 = -10
            expect(result.tier).toBe('perfect');
        });

        test('late hit with latency is late', () => {
            const result = evaluateHit(1070, 1000, latency, defaultWindows);
            expect(result.timingError).toBe(20); // 70 - 50 = 20
            expect(result.tier).toBe('good');
        });

        test('large latency value (100ms)', () => {
            const result = evaluateHit(1100, 1000, 100, defaultWindows);
            expect(result.timingError).toBe(0);
            expect(result.tier).toBe('perfect');
        });

        test('zero latency has no effect', () => {
            const result = evaluateHit(1020, 1000, 0, defaultWindows);
            expect(result.timingError).toBe(20);
            expect(result.tier).toBe('good');
        });

        test('negative latency (theoretical calibration offset)', () => {
            const result = evaluateHit(980, 1000, -20, defaultWindows);
            expect(result.timingError).toBe(0); // -20 - (-20) = 0
            expect(result.tier).toBe('perfect');
        });
    });

    describe('isMatch property', () => {
        test('perfect is a match', () => {
            expect(evaluateHit(1000, 1000, 0, defaultWindows).isMatch).toBe(true);
        });

        test('good is a match', () => {
            expect(evaluateHit(1020, 1000, 0, defaultWindows).isMatch).toBe(true);
        });

        test('close is a match', () => {
            expect(evaluateHit(1040, 1000, 0, defaultWindows).isMatch).toBe(true);
        });

        test('miss is not a match', () => {
            expect(evaluateHit(1060, 1000, 0, defaultWindows).isMatch).toBe(false);
        });
    });

    describe('Timing Error Direction', () => {
        test('early hit has negative timing error', () => {
            const result = evaluateHit(990, 1000, 0, defaultWindows);
            expect(result.timingError).toBeLessThan(0);
        });

        test('late hit has positive timing error', () => {
            const result = evaluateHit(1010, 1000, 0, defaultWindows);
            expect(result.timingError).toBeGreaterThan(0);
        });

        test('exact hit has zero timing error', () => {
            const result = evaluateHit(1000, 1000, 0, defaultWindows);
            expect(result.timingError).toBe(0);
        });
    });

    describe('Custom Window Configurations', () => {
        test('strict windows (Clone Hero style)', () => {
            const strictWindows = { perfect: 10, good: 20, close: 35 };
            expect(evaluateHit(1010, 1000, 0, strictWindows).tier).toBe('perfect');
            expect(evaluateHit(1011, 1000, 0, strictWindows).tier).toBe('good');
            expect(evaluateHit(1025, 1000, 0, strictWindows).tier).toBe('close');
            expect(evaluateHit(1040, 1000, 0, strictWindows).tier).toBe('miss');
        });

        test('relaxed windows (beginner mode)', () => {
            const relaxedWindows = { perfect: 30, good: 50, close: 80 };
            expect(evaluateHit(1030, 1000, 0, relaxedWindows).tier).toBe('perfect');
            expect(evaluateHit(1050, 1000, 0, relaxedWindows).tier).toBe('good');
            expect(evaluateHit(1080, 1000, 0, relaxedWindows).tier).toBe('close');
            expect(evaluateHit(1100, 1000, 0, relaxedWindows).tier).toBe('miss');
        });

        test('very tight windows (expert mode)', () => {
            const tightWindows = { perfect: 5, good: 10, close: 20 };
            expect(evaluateHit(1005, 1000, 0, tightWindows).tier).toBe('perfect');
            expect(evaluateHit(1006, 1000, 0, tightWindows).tier).toBe('good');
            expect(evaluateHit(1015, 1000, 0, tightWindows).tier).toBe('close');
            expect(evaluateHit(1025, 1000, 0, tightWindows).tier).toBe('miss');
        });
    });

    describe('Edge Cases', () => {
        test('very large timestamps', () => {
            const result = evaluateHit(1000000000, 1000000000, 0, defaultWindows);
            expect(result.tier).toBe('perfect');
        });

        test('very small timestamps', () => {
            const result = evaluateHit(100, 100, 0, defaultWindows);
            expect(result.tier).toBe('perfect');
        });

        test('fractional milliseconds round correctly', () => {
            // Implementation should handle floats gracefully
            const result = evaluateHit(1000.5, 1000, 0, defaultWindows);
            expect(['perfect', 'good']).toContain(result.tier);
        });

        test('extreme latency values', () => {
            const result = evaluateHit(1500, 1000, 500, defaultWindows);
            expect(result.timingError).toBe(0);
            expect(result.tier).toBe('perfect');
        });
    });

    describe('Mathematical Properties', () => {
        test('timing error is symmetric (early vs late)', () => {
            const early = evaluateHit(990, 1000, 0, defaultWindows);
            const late = evaluateHit(1010, 1000, 0, defaultWindows);
            expect(early.tier).toBe(late.tier);
            expect(Math.abs(early.timingError)).toBe(Math.abs(late.timingError));
        });

        test('tier assignment is deterministic', () => {
            const results = [];
            for (let i = 0; i < 100; i++) {
                results.push(evaluateHit(1015, 1000, 0, defaultWindows).tier);
            }
            expect(new Set(results).size).toBe(1); // All same result
        });

        test('tier degrades monotonically with error', () => {
            const tiers = ['perfect', 'good', 'close', 'miss'];
            let prevTierIndex = -1;

            for (let error = 0; error <= 60; error += 5) {
                const result = evaluateHit(1000 + error, 1000, 0, defaultWindows);
                const tierIndex = tiers.indexOf(result.tier);
                expect(tierIndex).toBeGreaterThanOrEqual(prevTierIndex);
                prevTierIndex = tierIndex;
            }
        });
    });
});
