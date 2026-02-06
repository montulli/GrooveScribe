import { ModuleDrumTypes } from './DrumConstants.js';

/**
 * MidiInputHandler - Wraps Web MIDI API
 */
export class MidiInputHandler {
    constructor(options = {}) {
        this.midiAccess = null;
        this.onHit = options.onHit || (() => { });
        this.drumMap = options.drumMap || {};
    }

    async connect() {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API not supported in this browser');
        }

        this.midiAccess = await navigator.requestMIDIAccess();
        for (const input of this.midiAccess.inputs.values()) {
            input.onmidimessage = this._handleMidiMessage.bind(this);
        }
    }

    disconnect() {
        if (this.midiAccess) {
            for (const input of this.midiAccess.inputs.values()) {
                input.onmidimessage = null;
            }
        }
    }

    _handleMidiMessage(event) {
        const [status, note, velocity] = event.data;
        const isNoteOn = (status & 0xF0) === 0x90 && velocity > 0;

        if (isNoteOn) {
            const drum = this.drumMap[note];
            if (drum && ModuleDrumTypes.includes(drum)) {
                this.onHit(drum, event.timeStamp, velocity);
            }
        }
    }
}
