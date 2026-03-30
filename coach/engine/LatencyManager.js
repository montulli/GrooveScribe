import { coachState } from '../state/State.js';

/**
 * LatencyManager - Handles audio and MIDI latency measurement.
 *
 * Owns all latency-related state. The calibrationOffset is persisted
 * in coachState (localStorage) and set via the CalibrationDialog.
 */
export class LatencyManager {
    constructor() {
        this.audioContext = null;
        this.audioLatency = 0; // No default guess — use init() for browser auto-detection
        this.midiLatency = 1;   // Default 1ms (USB MIDI is very fast)
        this.calibrationOffset = coachState.calibrationOffset;
    }

    init(audioContext) {
        this.audioContext = audioContext;
        // Try to get browser-reported latency
        if (audioContext) {
            const browserLatency = this._getAutoLatency();
            if (browserLatency > 0) {
                this.audioLatency = browserLatency;
            }
        }
    }

    /**
     * Get the auto-detected audio latency from the browser's AudioContext.
     * @returns {number} latency in milliseconds
     */
    _getAutoLatency() {
        if (!this.audioContext) return this.audioLatency;

        // outputLatency is time from browser to speakers
        // baseLatency is internal processing time
        const latency = (this.audioContext.outputLatency || 0) +
            (this.audioContext.baseLatency || 0);

        return latency * 1000; // Convert to ms
    }

    /**
     * Calculate total offset for timing compensation
     * @returns {number} Total offset in milliseconds
     */
    getTotalOffset() {
        return this.audioLatency + this.midiLatency + this.calibrationOffset;
    }
}
