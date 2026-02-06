/**
 * Comprehensive MidiInputHandler Tests
 * Tests MIDI input parsing, drum mapping, and event handling
 */
import { jest } from '@jest/globals';
import { MidiInputHandler } from '../../../coach/engine/MidiInputHandler.js';
import { DrumType, ModuleDrumTypes } from '../../../coach/engine/DrumConstants.js';

describe('MidiInputHandler', () => {
    let handler;
    let mockOnHit;

    beforeEach(() => {
        mockOnHit = jest.fn();
        handler = new MidiInputHandler({
            onHit: mockOnHit,
            drumMap: {
                36: DrumType.KICK,
                38: DrumType.SNARE,
                40: DrumType.SNARE,
                42: DrumType.HH_CLOSED,
                46: DrumType.HH_OPEN
            }
        });
    });

    describe('MIDI Message Parsing', () => {
        const createMidiEvent = (status, note, velocity, timestamp = 0) => ({
            data: new Uint8Array([status, note, velocity]),
            timeStamp: timestamp
        });

        test('parses Note On message (status 0x90)', () => {
            const event = createMidiEvent(0x99, 36, 100, 1000);
            handler._handleMidiMessage(event);

            expect(mockOnHit).toHaveBeenCalledWith(DrumType.KICK, 1000, 100);
        });

        test('ignores Note On with velocity 0 (note off)', () => {
            const event = createMidiEvent(0x99, 36, 0, 1000);
            handler._handleMidiMessage(event);

            expect(mockOnHit).not.toHaveBeenCalled();
        });

        test('ignores unmapped notes', () => {
            const event = createMidiEvent(0x99, 99, 100, 1000);
            handler._handleMidiMessage(event);

            expect(mockOnHit).not.toHaveBeenCalled();
        });

        test('ignores notes mapped to non-module types', () => {
            // Suppose someone mistakenly maps a note to an articulation (EditorDrumType) 
            // instead of a ModuleDrumType in the config.
            handler.drumMap[99] = DrumType.SNARE_GHOST; // Not in ModuleDrumTypes

            const event = createMidiEvent(0x99, 99, 100, 1000);
            handler._handleMidiMessage(event);

            expect(mockOnHit).not.toHaveBeenCalled();
        });

        test('maps notes correctly based on drumMap', () => {
            const hits = [
                { note: 36, type: DrumType.KICK },
                { note: 38, type: DrumType.SNARE },
                { note: 42, type: DrumType.HH_CLOSED },
                { note: 46, type: DrumType.HH_OPEN }
            ];

            hits.forEach((hit, i) => {
                const event = createMidiEvent(0x99, hit.note, 80, 1000 + i);
                handler._handleMidiMessage(event);
                expect(mockOnHit).toHaveBeenLastCalledWith(hit.type, 1000 + i, 80);
            });
        });
    });

    describe('Multi-Note Handling', () => {
        const createEvent = (note, velocity, time) => ({
            data: new Uint8Array([0x99, note, velocity]),
            timeStamp: time
        });

        test('handles simultaneous notes', () => {
            handler._handleMidiMessage(createEvent(36, 100, 1000));
            handler._handleMidiMessage(createEvent(42, 80, 1000));

            expect(mockOnHit).toHaveBeenCalledTimes(2);
            expect(mockOnHit).toHaveBeenCalledWith(DrumType.KICK, 1000, 100);
            expect(mockOnHit).toHaveBeenCalledWith(DrumType.HH_CLOSED, 1000, 80);
        });
    });
});
