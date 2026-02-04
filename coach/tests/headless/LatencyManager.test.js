/**
 * Comprehensive LatencyManager Tests
 * Tests audio latency management and calibration
 */
import { LatencyManager } from '../../../coach/engine/LatencyManager.js';

describe('LatencyManager', () => {
    let manager;

    beforeEach(() => {
        manager = new LatencyManager();
    });

    describe('Initialization', () => {
        test('creates manager with default values', () => {
            expect(manager).toBeDefined();
        });

        test('default audio latency is reasonable', () => {
            const latency = manager.getAudioLatency();
            expect(latency).toBeGreaterThanOrEqual(0);
            expect(latency).toBeLessThanOrEqual(200);
        });

        test('default MIDI latency is reasonable', () => {
            const latency = manager.getMidiLatency();
            expect(latency).toBeGreaterThanOrEqual(0);
            expect(latency).toBeLessThan(50);
        });

        test('default calibration offset is zero', () => {
            const offset = manager.getCalibrationOffset();
            expect(offset).toBe(0);
        });
    });

    describe('Audio Latency', () => {
        test('can set audio latency', () => {
            manager.setAudioLatency(75);
            expect(manager.getAudioLatency()).toBe(75);
        });

        test('rejects negative audio latency', () => {
            const original = manager.getAudioLatency();
            manager.setAudioLatency(-10);
            expect(manager.getAudioLatency()).toBe(original);
        });

        test('accepts zero audio latency', () => {
            manager.setAudioLatency(0);
            expect(manager.getAudioLatency()).toBe(0);
        });

        test('accepts typical audio latency values', () => {
            const typicalValues = [10, 25, 50, 75, 100, 150];
            for (const value of typicalValues) {
                manager.setAudioLatency(value);
                expect(manager.getAudioLatency()).toBe(value);
            }
        });

        test('clamps extremely high audio latency', () => {
            manager.setAudioLatency(1000);
            expect(manager.getAudioLatency()).toBeLessThanOrEqual(500);
        });
    });

    describe('MIDI Latency', () => {
        test('can set MIDI latency', () => {
            manager.setMidiLatency(5);
            expect(manager.getMidiLatency()).toBe(5);
        });

        test('rejects negative MIDI latency', () => {
            const original = manager.getMidiLatency();
            manager.setMidiLatency(-5);
            expect(manager.getMidiLatency()).toBe(original);
        });

        test('accepts zero MIDI latency', () => {
            manager.setMidiLatency(0);
            expect(manager.getMidiLatency()).toBe(0);
        });

        test('MIDI latency typically very low', () => {
            // USB MIDI is typically < 1ms, but we allow some buffer
            expect(manager.getMidiLatency()).toBeLessThanOrEqual(20);
        });
    });

    describe('Calibration Offset', () => {
        test('can set positive calibration offset', () => {
            manager.setCalibrationOffset(10);
            expect(manager.getCalibrationOffset()).toBe(10);
        });

        test('can set negative calibration offset', () => {
            manager.setCalibrationOffset(-10);
            expect(manager.getCalibrationOffset()).toBe(-10);
        });

        test('can set zero calibration offset', () => {
            manager.setCalibrationOffset(0);
            expect(manager.getCalibrationOffset()).toBe(0);
        });

        test('clamps extreme calibration offset', () => {
            manager.setCalibrationOffset(500);
            expect(Math.abs(manager.getCalibrationOffset())).toBeLessThanOrEqual(200);
        });
    });

    describe('Total Offset Calculation', () => {
        test('total offset is audio + midi + calibration', () => {
            manager.setAudioLatency(50);
            manager.setMidiLatency(5);
            manager.setCalibrationOffset(10);

            const total = manager.getTotalOffset();
            expect(total).toBe(65); // 50 + 5 + 10
        });

        test('total offset with negative calibration', () => {
            manager.setAudioLatency(50);
            manager.setMidiLatency(5);
            manager.setCalibrationOffset(-20);

            const total = manager.getTotalOffset();
            expect(total).toBe(35); // 50 + 5 - 20
        });

        test('total offset with zero audio latency', () => {
            manager.setAudioLatency(0);
            manager.setMidiLatency(5);
            manager.setCalibrationOffset(0);

            const total = manager.getTotalOffset();
            expect(total).toBe(5);
        });

        test('total offset can be negative', () => {
            manager.setAudioLatency(10);
            manager.setMidiLatency(5);
            manager.setCalibrationOffset(-30);

            const total = manager.getTotalOffset();
            expect(total).toBe(-15);
        });
    });

    describe('Persistence', () => {
        // These tests verify the interface for persistence
        // Actual localStorage tests would require a browser environment

        test('has save method', () => {
            expect(typeof manager.save).toBe('function');
        });

        test('has load method', () => {
            expect(typeof manager.load).toBe('function');
        });

        test('save returns without error', () => {
            expect(() => manager.save()).not.toThrow();
        });

        test('load returns without error', () => {
            expect(() => manager.load()).not.toThrow();
        });
    });

    describe('Calibration Data Recording', () => {
        test('can record calibration sample', () => {
            expect(() => manager.recordCalibrationSample(10)).not.toThrow();
        });

        test('can record multiple calibration samples', () => {
            manager.recordCalibrationSample(10);
            manager.recordCalibrationSample(12);
            manager.recordCalibrationSample(8);
            manager.recordCalibrationSample(11);

            // After recording samples, we should be able to finalize
            expect(() => manager.finalizeCalibration()).not.toThrow();
        });

        test('can clear calibration samples', () => {
            manager.recordCalibrationSample(10);
            manager.clearCalibration();
            // Should be able to start fresh
            expect(() => manager.recordCalibrationSample(5)).not.toThrow();
        });
    });

    describe('Statistical Calibration', () => {
        test('calibration uses median approach', () => {
            // Record samples with an outlier
            manager.recordCalibrationSample(10);
            manager.recordCalibrationSample(12);
            manager.recordCalibrationSample(11);
            manager.recordCalibrationSample(50); // outlier
            manager.recordCalibrationSample(10);

            manager.finalizeCalibration();
            const offset = manager.getCalibrationOffset();

            // Median should be around 11, not influenced by outlier 50
            expect(Math.abs(offset - 11)).toBeLessThan(5);
        });

        test('insufficient samples do not update calibration', () => {
            const original = manager.getCalibrationOffset();
            manager.recordCalibrationSample(10);
            manager.finalizeCalibration();

            // With only 1 sample, calibration should not change
            // (or throw, depending on implementation)
            expect(manager.getCalibrationOffset()).toBe(original);
        });
    });

    describe('Preset Configurations', () => {
        test('can apply low-latency preset', () => {
            manager.applyPreset('low-latency');
            expect(manager.getAudioLatency()).toBeLessThanOrEqual(30);
        });

        test('can apply standard preset', () => {
            manager.applyPreset('standard');
            const latency = manager.getAudioLatency();
            expect(latency).toBeGreaterThanOrEqual(30);
            expect(latency).toBeLessThanOrEqual(80);
        });

        test('can apply high-latency preset', () => {
            manager.applyPreset('high-latency');
            expect(manager.getAudioLatency()).toBeGreaterThanOrEqual(80);
        });

        test('unknown preset does not throw', () => {
            expect(() => manager.applyPreset('unknown')).not.toThrow();
        });
    });

    describe('Edge Cases', () => {
        test('handles floating point latencies', () => {
            manager.setAudioLatency(50.5);
            const latency = manager.getAudioLatency();
            expect(typeof latency).toBe('number');
        });

        test('handles very small latencies', () => {
            manager.setAudioLatency(0.5);
            manager.setMidiLatency(0.1);
            const total = manager.getTotalOffset();
            expect(typeof total).toBe('number');
        });

        test('multiple set operations are independent', () => {
            manager.setAudioLatency(50);
            manager.setMidiLatency(5);
            manager.setCalibrationOffset(10);

            manager.setAudioLatency(75);

            expect(manager.getAudioLatency()).toBe(75);
            expect(manager.getMidiLatency()).toBe(5);
            expect(manager.getCalibrationOffset()).toBe(10);
        });
    });

    describe('Display Values', () => {
        test('provides human readable latency string', () => {
            manager.setAudioLatency(50);
            const display = manager.getDisplayString();
            expect(typeof display).toBe('string');
            expect(display).toContain('50');
        });

        test('provides status object', () => {
            const status = manager.getStatus();
            expect(status).toHaveProperty('audioLatency');
            expect(status).toHaveProperty('midiLatency');
            expect(status).toHaveProperty('calibrationOffset');
            expect(status).toHaveProperty('totalOffset');
        });
    });
});
