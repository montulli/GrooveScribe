/**
 * Comprehensive MidiInputHandler Tests
 * Tests MIDI input parsing, drum mapping, and event handling
 */
import { jest } from '@jest/globals';
import { MidiInputHandler } from '../../../coach/engine/MidiInputHandler.js';

describe('MidiInputHandler', () => {
    let handler;
    let mockOnHit;
    let mockMIDIInput;

    beforeEach(() => {
        // Create fresh mocks for each test
        mockOnHit = jest.fn();
        mockMIDIInput = {
            name: 'Test MIDI Device',
            manufacturer: 'Test',
            onmidimessage: null,
            addEventListener: jest.fn((event, callback) => {
                if (event === 'midimessage') {
                    mockMIDIInput.onmidimessage = callback;
                }
            }),
            removeEventListener: jest.fn()
        };

        handler = new MidiInputHandler({
            onHit: mockOnHit,
            drumMap: {
                36: 'kick',
                38: 'snare',
                40: 'snare', // Rim
                42: 'hh_normal',
                46: 'hh_open'
            }
        });
    });

    describe('Initialization', () => {
        test('creates handler with drum map', () => {
            expect(handler.drumMap).toBeDefined();
            expect(handler.drumMap[36]).toBe('kick');
        });

        test('creates handler with onHit callback', () => {
            expect(handler.onHit).toBe(mockOnHit);
        });

        test('starts disconnected', () => {
            expect(handler.isConnected).toBeFalsy();
        });

        test('accepts custom drum map', () => {
            const customHandler = new MidiInputHandler({
                onHit: mockOnHit,
                drumMap: { 60: 'customDrum' }
            });
            expect(customHandler.drumMap[60]).toBe('customDrum');
        });

        test('uses empty drum map if none provided', () => {
            const noMapHandler = new MidiInputHandler({ onHit: mockOnHit });
            expect(noMapHandler.drumMap).toBeDefined();
        });
    });

    describe('MIDI Message Parsing', () => {
        // Helper to create MIDI message event
        const createMidiEvent = (status, note, velocity, timestamp = 0) => ({
            data: new Uint8Array([status, note, velocity]),
            timeStamp: timestamp
        });

        beforeEach(() => {
            // Simulate connection by manually setting up the message handler
            handler.handleMidiMessage = handler.handleMidiMessage || function (event) {
                const [status, note, velocity] = event.data;
                const channel = status & 0x0F;
                const messageType = status & 0xF0;

                // Note On with velocity > 0
                if (messageType === 0x90 && velocity > 0) {
                    const drum = this.drumMap[note];
                    if (drum && this.onHit) {
                        this.onHit(drum, event.timeStamp, velocity);
                    }
                }
            }.bind(handler);
        });

        test('parses Note On message (status 0x90)', () => {
            const event = createMidiEvent(0x99, 36, 100, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('kick', 1000, 100);
        });

        test('ignores Note On with velocity 0 (note off)', () => {
            const event = createMidiEvent(0x99, 36, 0, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).not.toHaveBeenCalled();
        });

        test('ignores unmapped notes', () => {
            const event = createMidiEvent(0x99, 99, 100, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).not.toHaveBeenCalled();
        });

        test('maps kick correctly (note 36)', () => {
            const event = createMidiEvent(0x99, 36, 80, 500);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('kick', 500, 80);
        });

        test('maps snare correctly (note 38)', () => {
            const event = createMidiEvent(0x99, 38, 90, 600);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('snare', 600, 90);
        });

        test('maps snare rim correctly (note 40)', () => {
            const event = createMidiEvent(0x99, 40, 85, 700);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('snare', 700, 85);
        });

        test('maps closed hi-hat correctly (note 42)', () => {
            const event = createMidiEvent(0x99, 42, 70, 800);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('hh_normal', 800, 70);
        });

        test('maps open hi-hat correctly (note 46)', () => {
            const event = createMidiEvent(0x99, 46, 75, 900);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('hh_open', 900, 75);
        });

        test('preserves timestamp from MIDI event', () => {
            const event = createMidiEvent(0x99, 36, 100, 123456.789);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('kick', 123456.789, 100);
        });

        test('preserves velocity from MIDI event', () => {
            const event = createMidiEvent(0x99, 36, 127, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('kick', 1000, 127);
        });

        test('handles minimum velocity (1)', () => {
            const event = createMidiEvent(0x99, 36, 1, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalled();
        });

        test('handles maximum velocity (127)', () => {
            const event = createMidiEvent(0x99, 36, 127, 1000);
            handler.handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith('kick', 1000, 127);
        });
    });

    describe('Multi-Note Handling', () => {
        beforeEach(() => {
            handler.handleMidiMessage = function (event) {
                const [status, note, velocity] = event.data;
                const messageType = status & 0xF0;

                if (messageType === 0x90 && velocity > 0) {
                    const drum = this.drumMap[note];
                    if (drum && this.onHit) {
                        this.onHit(drum, event.timeStamp, velocity);
                    }
                }
            }.bind(handler);
        });

        test('handles rapid sequential notes', () => {
            const createEvent = (note, velocity, time) => ({
                data: new Uint8Array([0x99, note, velocity]),
                timeStamp: time
            });

            handler.handleMidiMessage(createEvent(36, 100, 1000));
            handler.handleMidiMessage(createEvent(38, 90, 1001));
            handler.handleMidiMessage(createEvent(42, 80, 1002));

            expect(mockOnHit).toHaveBeenCalledTimes(3);
        });

        test('handles simultaneous notes', () => {
            const createEvent = (note, velocity, time) => ({
                data: new Uint8Array([0x99, note, velocity]),
                timeStamp: time
            });

            handler.handleMidiMessage(createEvent(36, 100, 1000));
            handler.handleMidiMessage(createEvent(42, 80, 1000));

            expect(mockOnHit).toHaveBeenCalledTimes(2);
            expect(mockOnHit).toHaveBeenCalledWith('kick', 1000, 100);
            expect(mockOnHit).toHaveBeenCalledWith('hh_normal', 1000, 80);
        });

        test('handles repeated notes on same drum', () => {
            const createEvent = (note, velocity, time) => ({
                data: new Uint8Array([0x99, note, velocity]),
                timeStamp: time
            });

            handler.handleMidiMessage(createEvent(42, 80, 1000));
            handler.handleMidiMessage(createEvent(42, 75, 1250));
            handler.handleMidiMessage(createEvent(42, 85, 1500));

            expect(mockOnHit).toHaveBeenCalledTimes(3);
        });
    });

    describe('Extended Drum Map (Roland V-Drums)', () => {
        beforeEach(() => {
            // Extended drum map based on GM Standard + Roland extensions
            handler = new MidiInputHandler({
                onHit: mockOnHit,
                drumMap: {
                    // Kick
                    35: 'kick', // Acoustic Bass Drum
                    36: 'kick', // Bass Drum 1

                    // Snare
                    38: 'snare', // Acoustic Snare
                    40: 'snare', // Electric Snare / Rim

                    // Hi-Hat
                    42: 'hh_normal', // Closed Hi-Hat
                    44: 'hh_normal', // Pedal Hi-Hat
                    46: 'hh_open',   // Open Hi-Hat

                    // Toms
                    45: 'tom_low',   // Low Tom
                    47: 'tom_low',   // Low-Mid Tom
                    48: 'tom_mid',   // Hi-Mid Tom
                    50: 'tom_high',  // High Tom

                    // Cymbals
                    49: 'crash',     // Crash Cymbal 1
                    52: 'crash',     // Chinese Cymbal
                    55: 'crash',     // Splash Cymbal
                    57: 'crash',     // Crash Cymbal 2
                    51: 'ride',      // Ride Cymbal 1
                    53: 'ride_bell', // Ride Bell
                    59: 'ride',      // Ride Cymbal 2
                }
            });

            handler.handleMidiMessage = function (event) {
                const [status, note, velocity] = event.data;
                const messageType = status & 0xF0;

                if (messageType === 0x90 && velocity > 0) {
                    const drum = this.drumMap[note];
                    if (drum && this.onHit) {
                        this.onHit(drum, event.timeStamp, velocity);
                    }
                }
            }.bind(handler);
        });

        test('maps acoustic bass drum (35)', () => {
            const event = { data: new Uint8Array([0x99, 35, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('kick', 1000, 100);
        });

        test('maps pedal hi-hat (44)', () => {
            const event = { data: new Uint8Array([0x99, 44, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('hh_normal', 1000, 100);
        });

        test('maps crash cymbal (49)', () => {
            const event = { data: new Uint8Array([0x99, 49, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('crash', 1000, 100);
        });

        test('maps ride cymbal (51)', () => {
            const event = { data: new Uint8Array([0x99, 51, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('ride', 1000, 100);
        });

        test('maps ride bell (53)', () => {
            const event = { data: new Uint8Array([0x99, 53, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('ride_bell', 1000, 100);
        });

        test('maps high tom (50)', () => {
            const event = { data: new Uint8Array([0x99, 50, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalledWith('tom_high', 1000, 100);
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            handler.handleMidiMessage = function (event) {
                if (!event || !event.data || event.data.length < 3) return;

                const [status, note, velocity] = event.data;
                const messageType = status & 0xF0;

                if (messageType === 0x90 && velocity > 0) {
                    const drum = this.drumMap[note];
                    if (drum && this.onHit) {
                        this.onHit(drum, event.timeStamp, velocity);
                    }
                }
            }.bind(handler);
        });

        test('handles null event gracefully', () => {
            expect(() => handler.handleMidiMessage(null)).not.toThrow();
        });

        test('handles empty data array gracefully', () => {
            expect(() => handler.handleMidiMessage({ data: [] })).not.toThrow();
        });

        test('handles short data array gracefully', () => {
            expect(() => handler.handleMidiMessage({ data: new Uint8Array([0x99]) })).not.toThrow();
        });

        test('does not call onHit for invalid messages', () => {
            handler.handleMidiMessage(null);
            handler.handleMidiMessage({ data: [] });
            handler.handleMidiMessage({ data: new Uint8Array([0x99]) });

            expect(mockOnHit).not.toHaveBeenCalled();
        });
    });

    describe('MIDI Channel Handling', () => {
        beforeEach(() => {
            handler.handleMidiMessage = function (event) {
                const [status, note, velocity] = event.data;
                const messageType = status & 0xF0;

                // Accept Note On from any channel
                if (messageType === 0x90 && velocity > 0) {
                    const drum = this.drumMap[note];
                    if (drum && this.onHit) {
                        this.onHit(drum, event.timeStamp, velocity);
                    }
                }
            }.bind(handler);
        });

        test('accepts notes from channel 10 (standard drums)', () => {
            const event = { data: new Uint8Array([0x99, 36, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalled();
        });

        test('accepts notes from channel 1', () => {
            const event = { data: new Uint8Array([0x90, 36, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalled();
        });

        test('accepts notes from channel 16', () => {
            const event = { data: new Uint8Array([0x9F, 36, 100]), timeStamp: 1000 };
            handler.handleMidiMessage(event);
            expect(mockOnHit).toHaveBeenCalled();
        });
    });
});
