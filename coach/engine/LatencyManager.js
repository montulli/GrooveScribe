/**
 * LatencyManager - Handles audio latency measurement and calibration
 */
export class LatencyManager {
    constructor() {
        this.audioContext = null;
        this.audioLatency = 0; // No default guess — use init() for browser auto-detection
        this.midiLatency = 1;   // Default 1ms (USB MIDI is very fast)
        this.calibrationOffset = 0;
        this.calibrationSamples = [];
    }

    init(audioContext) {
        this.audioContext = audioContext;
        // Try to get browser-reported latency
        if (audioContext) {
            const browserLatency = this.getAutoLatency();
            if (browserLatency > 0) {
                this.audioLatency = browserLatency;
            }
            console.log(`[LatencyManager] Auto-detected audio latency: ${this.audioLatency.toFixed(1)}ms ` +
                `(outputLatency=${((audioContext.outputLatency || 0) * 1000).toFixed(1)}ms, ` +
                `baseLatency=${((audioContext.baseLatency || 0) * 1000).toFixed(1)}ms)`);
        }
    }

    /**
     * Get the auto-detected audio latency from the browser
     */
    getAutoLatency() {
        if (!this.audioContext) return this.audioLatency;

        // outputLatency is time from browser to speakers
        // baseLatency is internal processing time
        const latency = (this.audioContext.outputLatency || 0) +
            (this.audioContext.baseLatency || 0);

        return latency * 1000; // Convert to ms
    }

    // Audio Latency getters/setters
    getAudioLatency() {
        return this.audioLatency;
    }

    setAudioLatency(value) {
        if (value < 0) return; // Reject negative
        // Clamp to reasonable max (500ms)
        this.audioLatency = Math.min(value, 500);
    }

    // MIDI Latency getters/setters
    getMidiLatency() {
        return this.midiLatency;
    }

    setMidiLatency(value) {
        if (value < 0) return;
        this.midiLatency = value;
    }

    // Calibration Offset getters/setters
    getCalibrationOffset() {
        return this.calibrationOffset;
    }

    setCalibrationOffset(value) {
        // Clamp to reasonable range (±200ms)
        this.calibrationOffset = Math.max(-200, Math.min(200, value));
    }

    /**
     * Calculate total offset for timing compensation
     * @returns {number} Total offset in milliseconds
     */
    getTotalOffset() {
        return this.audioLatency + this.midiLatency + this.calibrationOffset;
    }

    // Calibration sample recording
    recordCalibrationSample(offset) {
        this.calibrationSamples.push(offset);
    }

    clearCalibration() {
        this.calibrationSamples = [];
    }

    /**
     * Finalize calibration using median of samples
     */
    finalizeCalibration() {
        if (this.calibrationSamples.length < 3) return; // Need minimum samples

        // Sort and get median (more robust to outliers)
        const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        this.setCalibrationOffset(median);
        this.calibrationSamples = [];
    }

    // Presets
    applyPreset(preset) {
        switch (preset) {
            case 'low-latency':
                this.audioLatency = 20;
                this.midiLatency = 1;
                break;
            case 'standard':
                this.audioLatency = 50;
                this.midiLatency = 1;
                break;
            case 'high-latency':
                this.audioLatency = 100;
                this.midiLatency = 2;
                break;
            default:
                // Unknown preset - do nothing
                break;
        }
    }

    // Persistence
    save() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('coachLatency', JSON.stringify({
                audioLatency: this.audioLatency,
                midiLatency: this.midiLatency,
                calibrationOffset: this.calibrationOffset
            }));
        } catch (e) {
            console.warn('[LatencyManager] Failed to save:', e);
        }
    }

    load() {
        if (typeof localStorage === 'undefined') return;
        try {
            const data = localStorage.getItem('coachLatency');
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.audioLatency !== undefined) this.audioLatency = parsed.audioLatency;
                if (parsed.midiLatency !== undefined) this.midiLatency = parsed.midiLatency;
                if (parsed.calibrationOffset !== undefined) this.calibrationOffset = parsed.calibrationOffset;
            }
        } catch (e) {
            console.warn('[LatencyManager] Failed to load:', e);
        }
    }

    // Display helpers
    getDisplayString() {
        return `Audio: ${this.audioLatency}ms, MIDI: ${this.midiLatency}ms, Calibration: ${this.calibrationOffset}ms`;
    }

    getStatus() {
        return {
            audioLatency: this.audioLatency,
            midiLatency: this.midiLatency,
            calibrationOffset: this.calibrationOffset,
            totalOffset: this.getTotalOffset()
        };
    }
}
