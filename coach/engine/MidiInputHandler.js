import { ModuleDrumTypes } from './DrumConstants.js';

/**
 * MidiInputHandler - Wraps Web MIDI API
 */
export class MidiInputHandler {
    constructor(options = {}) {
        this.midiAccess = null;
        this.onHit = options.onHit || (() => { });
        this.drumMap = options.drumMap || {};
        // Hi-hat CC config: { enabled, cc, threshold }
        this.hihatCC = options.hihatCC || { enabled: false, cc: 4, threshold: 64 };
        this._lastHiHatCC = 0; // 0 = fully open, 127 = fully closed
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
        const [status, data1, data2] = event.data;

        // Track CC messages for hi-hat pedal
        const isCC = (status & 0xF0) === 0xB0;
        if (isCC && this.hihatCC.enabled && data1 === this.hihatCC.cc) {
            this._lastHiHatCC = data2;
            return;
        }

        const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
        if (isNoteOn) {
            let drum = this.drumMap[data1];
            if (drum && ModuleDrumTypes.includes(drum)) {
                // CC-based hi-hat resolution: if a note maps to hh_open but
                // the pedal CC says closed, report as hh_closed instead
                if (this.hihatCC.enabled && drum === 'hh_open' && this._lastHiHatCC >= this.hihatCC.threshold) {
                    drum = 'hh_closed';
                }
                this.onHit(drum, event.timeStamp, data2);
            } else {
                console.log(`[MidiInputHandler] Unmapped MIDI note ${data1} (vel=${data2}, drum=${drum || 'none'})`);
            }
        }
    }
}
