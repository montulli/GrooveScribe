import { coachState } from '../state/State.js';

const CALIBRATION_BPM = 80;
const BEAT_INTERVAL_MS = 60000 / CALIBRATION_BPM; // 750ms
const TOTAL_TAPS = 20;
const WARMUP_TAPS = 4;
const COUNTDOWN_BEATS = 4;
const CLICK_FREQ_HZ = 1000;
const CLICK_DURATION_S = 0.03;
const TIMING_STRIP_RANGE_MS = 80; // strip shows +/- this many ms

/**
 * CalibrationDialog - Tap-along latency calibration.
 *
 * Plays a metronome at 80 BPM, collects MIDI taps, and computes
 * the median timing offset to store as calibrationOffset.
 */
export class CalibrationDialog {
    constructor({ midiHandler, latencyManager }) {
        this.midiHandler = midiHandler;
        this.latencyManager = latencyManager;
        this.container = null;
        this._audioCtx = null;
        this._active = false;
        this._tapErrors = [];     // raw signed errors for all taps (including warmup)
        this._tapCount = 0;
        this._beatTimes = [];     // scheduled beat times in performance.now() domain
        this._nextBeatIndex = 0;
        this._schedulerTimer = null;
        this._countdownLeft = 0;
        this._originalMidiOnHit = null;
        this._onKeyDown = (e) => this._handleKeyTap(e);
    }

    inject() {
        if (document.getElementById('coachCalibrationDialog')) return;

        const dialog = document.createElement('div');
        dialog.id = 'coachCalibrationDialog';
        dialog.innerHTML = `
            <h2>Latency Calibration</h2>

            <div id="calib-instructions">
                <p>Hit any drum pad or press any key in time with the metronome click.</p>
                <p class="calib-subtle">The first ${WARMUP_TAPS} taps are warm-up and won't count.</p>
            </div>

            <div id="calib-countdown" style="display:none;">
                <div id="calib-countdown-number"></div>
            </div>

            <div id="calib-progress" style="display:none;">
                <div id="calib-beat-counter"></div>
                <div id="calib-beat-indicator"></div>
                <div id="calib-timing-strip">
                    <div class="calib-strip-center-line"></div>
                    <div class="calib-strip-label calib-strip-label-early">early</div>
                    <div class="calib-strip-label calib-strip-label-late">late</div>
                </div>
                <div id="calib-running-offset"></div>
            </div>

            <div id="calib-result" style="display:none;">
                <div id="calib-result-value"></div>
                <div id="calib-result-explanation"></div>
            </div>

            <div class="coach-dialog-buttons">
                <button class="coach-btn coach-btn-secondary" id="calib-cancel-btn">Cancel</button>
                <button class="coach-btn coach-btn-primary" id="calib-start-btn">Start</button>
                <button class="coach-btn coach-btn-primary" id="calib-accept-btn" style="display:none;">Accept</button>
                <button class="coach-btn coach-btn-secondary" id="calib-retry-btn" style="display:none;">Retry</button>
            </div>
        `;

        document.body.appendChild(dialog);
        this.container = dialog;

        this.container.querySelector('#calib-cancel-btn').addEventListener('click', () => this._cancel());
        this.container.querySelector('#calib-start-btn').addEventListener('click', () => this._startCountdown());
        this.container.querySelector('#calib-accept-btn').addEventListener('click', () => this._accept());
        this.container.querySelector('#calib-retry-btn').addEventListener('click', () => this._retry());
    }

    show() {
        this._reset();
        this.container.style.display = 'block';
        this._showPhase('instructions');
    }

    hide() {
        this._stop();
        this.container.style.display = 'none';
    }

    // -- Phase management --

    _showPhase(phase) {
        const ids = {
            instructions: 'calib-instructions',
            countdown: 'calib-countdown',
            tapping: 'calib-progress',
            result: 'calib-result',
        };
        for (const [key, id] of Object.entries(ids)) {
            this.container.querySelector(`#${id}`).style.display = key === phase ? 'block' : 'none';
        }

        const startBtn = this.container.querySelector('#calib-start-btn');
        const acceptBtn = this.container.querySelector('#calib-accept-btn');
        const retryBtn = this.container.querySelector('#calib-retry-btn');
        const cancelBtn = this.container.querySelector('#calib-cancel-btn');

        startBtn.style.display = phase === 'instructions' ? '' : 'none';
        acceptBtn.style.display = phase === 'result' ? '' : 'none';
        retryBtn.style.display = phase === 'result' ? '' : 'none';
        cancelBtn.style.display = phase === 'result' ? 'none' : '';
    }

    // -- Countdown --

    _startCountdown() {
        this._ensureAudioContext();
        this._showPhase('countdown');
        this._countdownLeft = COUNTDOWN_BEATS;
        this._tickCountdown();
    }

    _tickCountdown() {
        if (this._countdownLeft <= 0) {
            this._startTapping();
            return;
        }
        const el = this.container.querySelector('#calib-countdown-number');
        el.textContent = this._countdownLeft;
        el.classList.remove('calib-countdown-pulse');
        // Force reflow to restart animation
        void el.offsetWidth;
        el.classList.add('calib-countdown-pulse');

        this._playClick();
        this._countdownLeft--;
        this._schedulerTimer = setTimeout(() => this._tickCountdown(), BEAT_INTERVAL_MS);
    }

    // -- Tapping phase --

    _startTapping() {
        this._showPhase('tapping');
        this._tapErrors = [];
        this._tapCount = 0;
        this._beatTimes = [];
        this._nextBeatIndex = 0;

        // Clear any existing dots from a previous run
        const strip = this.container.querySelector('#calib-timing-strip');
        strip.querySelectorAll('.calib-strip-dot').forEach(d => d.remove());

        this._updateDisplay();

        // Hook MIDI input — save original handler, replace with ours
        this._originalMidiOnHit = this.midiHandler.onHit;
        this.midiHandler.onHit = (drum, timestamp, velocity) => this._onTap(timestamp);

        // Hook keyboard input — any key counts as a tap
        document.addEventListener('keydown', this._onKeyDown);

        // Schedule all beats up front in audio time for precise timing
        this._scheduleBeatClicks();
        this._active = true;
    }

    _scheduleBeatClicks() {
        const audioCtx = this._audioCtx;
        // Bridge time domains: snapshot both clocks now
        const perfNow = performance.now();
        const audioNow = audioCtx.currentTime;

        const totalBeats = TOTAL_TAPS + 2; // schedule a couple extra for safety
        for (let i = 0; i < totalBeats; i++) {
            const audioTime = audioNow + (i * BEAT_INTERVAL_MS) / 1000;
            this._scheduleClickAt(audioTime);

            // Record expected heard time in performance.now() domain
            const audioLatencySec = (audioCtx.outputLatency || 0) + (audioCtx.baseLatency || 0);
            const heardPerfTime = perfNow + (i * BEAT_INTERVAL_MS) + (audioLatencySec * 1000);
            this._beatTimes.push(heardPerfTime);
        }
    }

    _handleKeyTap(e) {
        if (!this._active) return;
        // Ignore modifier keys and repeats
        if (e.repeat || e.key === 'Escape') return;
        e.preventDefault();
        this._onTap(performance.now());
    }

    _onTap(timestamp) {
        if (!this._active) return;

        // Find the nearest beat
        let bestError = Infinity;
        for (const beatTime of this._beatTimes) {
            const error = timestamp - beatTime;
            if (Math.abs(error) < Math.abs(bestError)) {
                bestError = error;
            }
        }

        this._tapCount++;
        this._tapErrors.push(bestError);
        this._updateDisplay();

        // Flash the beat indicator
        const indicator = this.container.querySelector('#calib-beat-indicator');
        indicator.classList.remove('calib-flash');
        void indicator.offsetWidth;
        indicator.classList.add('calib-flash');

        if (this._tapCount >= TOTAL_TAPS) {
            this._finishTapping();
        }
    }

    _updateDisplay() {
        const counter = this.container.querySelector('#calib-beat-counter');
        counter.textContent = `${this._tapCount} / ${TOTAL_TAPS}`;

        // Add dot to timing strip for this tap
        if (this._tapCount > 0) {
            const error = this._tapErrors[this._tapErrors.length - 1];
            const strip = this.container.querySelector('#calib-timing-strip');
            const dot = document.createElement('div');
            dot.className = 'calib-strip-dot';
            if (this._tapCount <= WARMUP_TAPS) {
                dot.classList.add('calib-strip-dot-warmup');
            }
            // Position: 50% = center (0 error), map error to percentage
            const clampedError = Math.max(-TIMING_STRIP_RANGE_MS, Math.min(TIMING_STRIP_RANGE_MS, error));
            const pct = 50 + (clampedError / TIMING_STRIP_RANGE_MS) * 50;
            dot.style.left = `${pct}%`;
            strip.appendChild(dot);
        }

        // Running offset (median of non-warmup taps)
        const offsetEl = this.container.querySelector('#calib-running-offset');
        const usableTaps = this._tapErrors.slice(WARMUP_TAPS);
        if (usableTaps.length > 0) {
            const median = this._computeMedian(usableTaps);
            const sign = median >= 0 ? '+' : '';
            offsetEl.textContent = `${sign}${median.toFixed(1)} ms`;
        } else if (this._tapCount > 0) {
            offsetEl.textContent = `warming up... (${WARMUP_TAPS - this._tapCount} left)`;
        } else {
            offsetEl.textContent = '';
        }
    }

    // -- Finish & results --

    _finishTapping() {
        this._active = false;
        this._restoreMidiHandler();

        const usableTaps = this._tapErrors.slice(WARMUP_TAPS);
        const median = this._computeMedian(usableTaps);
        const rounded = Math.round(median);

        this._showPhase('result');

        const valueEl = this.container.querySelector('#calib-result-value');
        const sign = rounded >= 0 ? '+' : '';
        valueEl.textContent = `${sign}${rounded} ms`;

        const explEl = this.container.querySelector('#calib-result-explanation');
        if (Math.abs(rounded) <= 5) {
            explEl.textContent = 'Your timing is very well aligned — minimal compensation needed.';
        } else if (rounded < 0) {
            explEl.textContent = `You tend to hit ${Math.abs(rounded)} ms early. This will be compensated automatically.`;
        } else {
            explEl.textContent = `You tend to hit ${rounded} ms late. This will be compensated automatically.`;
        }
    }

    _accept() {
        const usableTaps = this._tapErrors.slice(WARMUP_TAPS);
        const median = this._computeMedian(usableTaps);
        const rounded = Math.round(median);

        coachState.calibrationOffset = rounded;
        coachState.calibrated = true;
        coachState.save();
        this.latencyManager.calibrationOffset = rounded;

        this.hide();
        window.dispatchEvent(new CustomEvent('calibration-accepted'));
    }

    _retry() {
        this._reset();
        this._showPhase('instructions');
    }

    _cancel() {
        this.hide();
        window.dispatchEvent(new CustomEvent('calibration-cancelled'));
    }

    // -- Audio --

    _ensureAudioContext() {
        if (!this._audioCtx) {
            // Reuse the MIDI player's context if available, otherwise create one
            if (typeof MIDI !== 'undefined' && MIDI.Player?.ctx) {
                this._audioCtx = MIDI.Player.ctx;
            } else {
                this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
        }
        // Resume if suspended (autoplay policy)
        if (this._audioCtx.state === 'suspended') {
            this._audioCtx.resume();
        }
    }

    _playClick() {
        this._ensureAudioContext();
        this._scheduleClickAt(this._audioCtx.currentTime);
    }

    _scheduleClickAt(audioTime) {
        const ctx = this._audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = CLICK_FREQ_HZ;
        osc.type = 'sine';
        const clickGain = 0.5 * (coachState.metronomeVolume / 100);
        gain.gain.setValueAtTime(clickGain, audioTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioTime + CLICK_DURATION_S);
        osc.start(audioTime);
        osc.stop(audioTime + CLICK_DURATION_S);
    }

    // -- Helpers --

    _computeMedian(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    }

    _reset() {
        this._stop();
        this._tapErrors = [];
        this._tapCount = 0;
        this._beatTimes = [];
        this._nextBeatIndex = 0;

        // Clear timing strip dots
        if (this.container) {
            const strip = this.container.querySelector('#calib-timing-strip');
            if (strip) strip.querySelectorAll('.calib-strip-dot').forEach(d => d.remove());
        }
    }

    _stop() {
        this._active = false;
        if (this._schedulerTimer) {
            clearTimeout(this._schedulerTimer);
            this._schedulerTimer = null;
        }
        this._restoreMidiHandler();
        document.removeEventListener('keydown', this._onKeyDown);
    }

    _restoreMidiHandler() {
        if (this._originalMidiOnHit) {
            this.midiHandler.onHit = this._originalMidiOnHit;
            this._originalMidiOnHit = null;
        }
    }
}
