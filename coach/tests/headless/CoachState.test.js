/**
 * Comprehensive CoachState Tests
 * Tests state management and persistence
 */
import { coachState, CoachStateManager } from '../../../coach/state/CoachState.js';

describe('CoachState', () => {
    let state;

    beforeEach(() => {
        // Create fresh state for each test
        state = new CoachStateManager();
    });

    describe('Default Values', () => {
        test('default mode is practice', () => {
            expect(state.mode).toBe('practice');
        });

        test('default tolerance is normal', () => {
            expect(state.tolerance).toBe('normal');
        });

        test('default reps is 4', () => {
            expect(state.reps).toBe(4);
        });

        test('default countIn is true', () => {
            expect(state.countIn).toBe(true);
        });

        test('default showDebug is false', () => {
            expect(state.showDebug).toBe(false);
        });
    });

    describe('Mode Setting', () => {
        test('can set mode to practice', () => {
            state.mode = 'practice';
            expect(state.mode).toBe('practice');
        });

        test('can set mode to performance', () => {
            state.mode = 'performance';
            expect(state.mode).toBe('performance');
        });

        test('invalid mode falls back to practice', () => {
            state.mode = 'invalid';
            expect(state.mode).toBe('practice');
        });
    });

    describe('Tolerance Setting', () => {
        test('can set tolerance to strict', () => {
            state.tolerance = 'strict';
            expect(state.tolerance).toBe('strict');
        });

        test('can set tolerance to normal', () => {
            state.tolerance = 'normal';
            expect(state.tolerance).toBe('normal');
        });

        test('can set tolerance to relaxed', () => {
            state.tolerance = 'relaxed';
            expect(state.tolerance).toBe('relaxed');
        });

        test('invalid tolerance falls back to normal', () => {
            state.tolerance = 'invalid';
            expect(state.tolerance).toBe('normal');
        });
    });

    describe('Reps Setting', () => {
        test('can set reps to 1', () => {
            state.reps = 1;
            expect(state.reps).toBe(1);
        });

        test('can set reps to 8', () => {
            state.reps = 8;
            expect(state.reps).toBe(8);
        });

        test('reps below 1 clamps to 1', () => {
            state.reps = 0;
            expect(state.reps).toBeGreaterThanOrEqual(1);
        });

        test('reps above max clamps', () => {
            state.reps = 100;
            expect(state.reps).toBeLessThanOrEqual(16);
        });

        test('non-integer reps are floored', () => {
            state.reps = 4.7;
            expect(state.reps).toBe(4);
        });
    });

    describe('CountIn Setting', () => {
        test('can set countIn to true', () => {
            state.countIn = true;
            expect(state.countIn).toBe(true);
        });

        test('can set countIn to false', () => {
            state.countIn = false;
            expect(state.countIn).toBe(false);
        });

        test('truthy value becomes true', () => {
            state.countIn = 1;
            expect(state.countIn).toBe(true);
        });

        test('falsy value becomes false', () => {
            state.countIn = 0;
            expect(state.countIn).toBe(false);
        });
    });

    describe('Debug Setting', () => {
        test('can set showDebug to true', () => {
            state.showDebug = true;
            expect(state.showDebug).toBe(true);
        });

        test('can set showDebug to false', () => {
            state.showDebug = false;
            expect(state.showDebug).toBe(false);
        });
    });

    describe('State Snapshot', () => {
        test('toObject returns all properties', () => {
            const obj = state.toObject();
            expect(obj).toHaveProperty('mode');
            expect(obj).toHaveProperty('tolerance');
            expect(obj).toHaveProperty('reps');
            expect(obj).toHaveProperty('countIn');
        });

        test('toObject returns current values', () => {
            state.mode = 'performance';
            state.tolerance = 'strict';
            state.reps = 8;

            const obj = state.toObject();
            expect(obj.mode).toBe('performance');
            expect(obj.tolerance).toBe('strict');
            expect(obj.reps).toBe(8);
        });

        test('fromObject restores state', () => {
            const saved = {
                mode: 'performance',
                tolerance: 'relaxed',
                reps: 6,
                countIn: false
            };

            state.fromObject(saved);

            expect(state.mode).toBe('performance');
            expect(state.tolerance).toBe('relaxed');
            expect(state.reps).toBe(6);
            expect(state.countIn).toBe(false);
        });

        test('fromObject handles partial data', () => {
            const partial = { mode: 'performance' };
            state.fromObject(partial);

            expect(state.mode).toBe('performance');
            expect(state.tolerance).toBe('normal'); // Default
        });
    });

    describe('Persistence Interface', () => {
        test('has save method', () => {
            expect(typeof state.save).toBe('function');
        });

        test('has load method', () => {
            expect(typeof state.load).toBe('function');
        });

        test('save returns without error', () => {
            expect(() => state.save()).not.toThrow();
        });

        test('load returns without error', () => {
            expect(() => state.load()).not.toThrow();
        });
    });

    describe('Reset Functionality', () => {
        test('reset restores defaults', () => {
            state.mode = 'performance';
            state.tolerance = 'strict';
            state.reps = 10;
            state.countIn = false;

            state.reset();

            expect(state.mode).toBe('practice');
            expect(state.tolerance).toBe('normal');
            expect(state.reps).toBe(4);
            expect(state.countIn).toBe(true);
        });
    });

    describe('Tolerance Windows Lookup', () => {
        test('getToleranceWindows returns windows for strict', () => {
            state.tolerance = 'strict';
            const windows = state.getToleranceWindows();

            expect(windows.perfect).toBeLessThan(20);
            expect(windows.good).toBeDefined();
            expect(windows.close).toBeDefined();
        });

        test('getToleranceWindows returns windows for normal', () => {
            state.tolerance = 'normal';
            const windows = state.getToleranceWindows();

            expect(windows.perfect).toBeGreaterThanOrEqual(15);
            expect(windows.perfect).toBeLessThanOrEqual(25);
        });

        test('getToleranceWindows returns windows for relaxed', () => {
            state.tolerance = 'relaxed';
            const windows = state.getToleranceWindows();

            expect(windows.perfect).toBeGreaterThan(20);
        });

        test('tolerance windows have correct hierarchy', () => {
            const windows = state.getToleranceWindows();

            expect(windows.perfect).toBeLessThan(windows.good);
            expect(windows.good).toBeLessThan(windows.close);
        });
    });

    describe('Event Dispatch', () => {
        test('changing mode dispatches event', () => {
            let eventFired = false;
            state.addEventListener('change', () => { eventFired = true; });

            state.mode = 'performance';

            expect(eventFired).toBe(true);
        });

        test('event contains changed property', () => {
            let changedProp = null;
            state.addEventListener('change', (e) => { changedProp = e.property; });

            state.tolerance = 'strict';

            expect(changedProp).toBe('tolerance');
        });

        test('event contains new value', () => {
            let newValue = null;
            state.addEventListener('change', (e) => { newValue = e.value; });

            state.reps = 6;

            expect(newValue).toBe(6);
        });
    });

    describe('Global Instance', () => {
        test('coachState is defined', () => {
            expect(coachState).toBeDefined();
        });

        test('coachState has expected properties', () => {
            expect(coachState.mode).toBeDefined();
            expect(coachState.tolerance).toBeDefined();
        });

        test('coachState is a singleton', () => {
            const original = coachState.mode;
            coachState.mode = 'performance';

            expect(coachState.mode).toBe('performance');

            // Restore
            coachState.mode = original;
        });
    });

    describe('Validation', () => {
        test('isValid returns true for valid state', () => {
            expect(state.isValid()).toBe(true);
        });

        test('handles corrupted state gracefully', () => {
            // Force corrupted state
            state._data = null;
            expect(() => state.mode).not.toThrow();
        });
    });
});
