import { CoachEngine } from './engine/CoachEngine.js';
import { MidiInputHandler } from './engine/MidiInputHandler.js';
import { LatencyManager } from './engine/LatencyManager.js';
import { FeedbackRenderer } from './ui/FeedbackRenderer.js';
import { CoachSettingsDialog } from './ui/CoachSettingsDialog.js';
import { ResultsDialog } from './ui/ResultsDialog.js';
import { coachState } from './state/CoachState.js';

/**
 * CoachController - Orchestrates the entire Drum Coach feature
 */
export class CoachController {
    constructor(grooveWriter) {
        this.grooveWriter = grooveWriter;
        this.engine = new CoachEngine();
        this.midiHandler = new MidiInputHandler({
            onHit: (drum, timestamp, velocity) => this.handleMidiHit(drum, timestamp, velocity),
            drumMap: {
                36: 'kick', 35: 'kick',
                38: 'snare', 40: 'snare', 37: 'snare_side',
                42: 'hh_normal', 44: 'hh_foot', 46: 'hh_open',
                48: 'tom1', 47: 'tom2', 45: 'tom3', 43: 'tom4',
                49: 'crash', 57: 'crash',
                51: 'ride', 53: 'ride_bell',
                39: 'snare_ghost' // Custom mapping for ghosts if needed
            }
        });
        this.latencyManager = new LatencyManager();
        this.renderer = new FeedbackRenderer('#svgTarget');
        this.dialog = new CoachSettingsDialog();
        this.resultsDialog = new ResultsDialog();

        this.isInitialized = false;
        this.isCoachingActive = false;
        this.midiConnected = false;
        this.sessionStartTime = 0;
        this.currentRepetition = 0;
    }

    async init() {
        if (this.isInitialized) return;

        this.dialog.inject();
        this.resultsDialog.inject();
        this.renderer.init();

        // Listen for start requests from dialog
        window.addEventListener('coach-start-requested', () => this.startSession());

        // Hook into GrooveWriter's playback system
        this._hookPlaybackEvents();

        this.isInitialized = true;
        console.log('[Drum Coach] Initialized (MIDI will connect on first session)');
    }

    /**
     * Hook into GrooveWriter's MIDI playback callbacks
     */
    _hookPlaybackEvents() {
        const utils = this.grooveWriter.myGrooveUtils;

        // Store original callbacks
        const originalPlayEvent = utils.midiEventCallbacks.playEvent;
        const originalStopEvent = utils.midiEventCallbacks.stopEvent;
        const originalRepeatCallback = utils.repeatCallback;

        // Intercept play event
        utils.midiEventCallbacks.playEvent = (root) => {
            if (originalPlayEvent) originalPlayEvent(root);
            if (this.isCoachingActive) {
                this._onPlaybackStart();
            }
        };

        // Intercept stop event
        utils.midiEventCallbacks.stopEvent = (root) => {
            if (originalStopEvent) originalStopEvent(root);
            if (this.isCoachingActive) {
                this._onPlaybackStop();
            }
        };

        // Intercept repeat callback for multi-rep performance mode
        utils.repeatCallback = () => {
            if (originalRepeatCallback) originalRepeatCallback();
            if (this.isCoachingActive) {
                this._onRepeat();
            }
        };
    }

    _onPlaybackStart() {
        console.log('[CoachController] Playback started, syncing engine');
        // Record the playback start time for timing calculations
        this.sessionStartTime = performance.now();
        this._refreshAbcMapping(); // Map instruments to staff indices
        this.engine.start(this.sessionStartTime);
        this.isSynced = true; // Flag for tests

        // Ensure visual feedback is ready
        this.renderer.init();
        this.renderer.clearFeedback();
    }

    _onPlaybackStop() {
        console.log('[CoachController] Playback stopped');
        if (coachState.mode === 'performance' && this.isCoachingActive) {
            this._showResults();
        }
        this.engine.stop();
    }

    _onRepeat() {
        this.currentRepetition++;
        console.log(`[CoachController] Repeat ${this.currentRepetition}`);

        if (coachState.mode === 'performance' && this.currentRepetition >= coachState.reps) {
            // Stop playback after reaching target reps
            this.grooveWriter.myGrooveUtils.stopMIDI_playback();
            return;
        }

        // Reset engine timing for new repetition
        this.sessionStartTime = performance.now();
        this.engine.start(this.sessionStartTime);
        this.isSynced = true; // Flag for tests
        this.renderer.clearFeedback();
    }

    _showResults() {
        const stats = this.engine.getResults();
        console.log('[CoachController] Session Results:', stats);
        this.isCoachingActive = false;
        this._updateButtonState(false);
        this.resultsDialog.show(stats);
    }

    /**
     * Called when user clicks "Start Session" in the dialog
     */
    async startSession() {
        try {
            this.isSynced = false; // Reset sync flag
            // 0. Connect MIDI on first session (lazy initialization)
            if (!this.midiConnected) {
                try {
                    await this.midiHandler.connect();
                    this.midiConnected = true;
                    console.log('[CoachController] MIDI Connected');
                } catch (e) {
                    console.warn('[CoachController] MIDI failed to connect', e);
                    // Continue anyway - user can still practice without MIDI input
                }
            }

            // 1. Get current groove data from writer
            const grooveData = this.getGrooveAsTimeline();

            // 2. Setup engine with tolerance based on coachState
            const toleranceWindows = {
                strict: { perfect: 15, good: 25, close: 40 },
                normal: { perfect: 20, good: 35, close: 50 },
                relaxed: { perfect: 30, good: 45, close: 65 }
            };
            this.engine.windows = toleranceWindows[coachState.tolerance] || toleranceWindows.normal;
            this.engine.audioLatency = this.latencyManager.getTotalOffset();
            this.engine.loadGroove({ target: grooveData });

            // 3. Activate coaching mode
            this.isCoachingActive = true;
            this.currentRepetition = 0;
            this._updateButtonState(true);

            // 4. Clear UI
            this.renderer.init();
            this.renderer.clearFeedback();

            // 5. Trigger playback if not already playing
            if (!this.grooveWriter.myGrooveUtils.isPlaying()) {
                this.grooveWriter.myGrooveUtils.startOrPauseMIDI_playback();
            }

            console.log('[CoachController] Session Started');
        } catch (error) {
            console.error('[CoachController] CRITICAL ERROR IN startSession:', error);
            throw error;
        }
    }

    stopSession() {
        this.isCoachingActive = false;
        this.engine.stop();
        this._updateButtonState(false);
        console.log('[CoachController] Session Stopped');
    }

    _updateButtonState(isActive) {
        const btn = document.getElementById('coachToggleBtn');
        if (!btn) return;

        if (isActive) {
            btn.classList.add('coaching-active');
            btn.innerHTML = '<i class="fa fa-stop"></i> Stop';
        } else {
            btn.classList.remove('coaching-active');
            btn.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach';
        }
    }

    handleMidiHit(drum, timestamp, velocity) {
        if (!this.engine.isPlaying) return;

        const evaluation = this.engine.handleMidiHit(drum, timestamp);
        if (!evaluation) return;

        console.log(`[CoachController] Hit ${drum} evaluation: ${evaluation.tier} (match: ${evaluation.isMatch})`);

        if (evaluation.isMatch || evaluation.tier === 'miss') {
            // Find the matched note to get its tickIndex
            const matchedNote = this.engine.noteTimeline.find(
                n => n.originalIndex === evaluation.noteIndex
            );

            if (matchedNote && matchedNote.tickIndex !== undefined) {
                // Use the new instrument-aware mapping
                // For flam grace notes, we draw at the flam position but with grace note offset
                const effectiveDrum = evaluation.isGraceNote ? 'snare_flam' : drum;
                const abcNoteIndex = this.getAbcIndexForHit(matchedNote.tickIndex, effectiveDrum);
                if (abcNoteIndex >= 0) {
                    this.renderer.drawHitFeedback(
                        abcNoteIndex,
                        evaluation.tier,
                        evaluation.timingError,
                        evaluation.isGraceNote ? 'flam_grace' : drum
                    );
                } else {
                    console.warn(`[CoachController] No ABC index found for ${drum} at tick ${matchedNote.tickIndex}`);
                }
            }
        } else if (evaluation.tier === 'extra') {
            // Visualize extra hits by finding the closest time-slice
            const relTime = timestamp - this.sessionStartTime;
            let closestNote = null;
            let minDiff = Infinity;

            for (const n of this.engine.noteTimeline) {
                const diff = Math.abs(relTime - n.time);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestNote = n;
                }
            }

            if (closestNote && minDiff < 200) {
                // Find ANY abc index at this tick to at least show the extra hit vertically near something
                const abcNoteIndex = this.getAbcIndexForHit(closestNote.tickIndex, closestNote.type);
                if (abcNoteIndex >= 0) {
                    this.renderer.drawHitFeedback(abcNoteIndex, 'extra', 0, drum);
                }
            }
        }
    }

    /**
     * Build a mapping of (tickIndex, instrument) -> abcNoteIndex
     * This simulates abc2svg's rendering order to accurately target rectangles.
     */
    _refreshAbcMapping() {
        console.log('[CoachController] Refreshing ABC mapping...');
        this.abcNoteMap = new Map();
        const writer = this.grooveWriter;
        if (!writer) return;

        // Best data source is the UI-derived object that contains everything
        const data = writer.grooveDataFromClickableUI();
        if (!data) return;

        let currentIndex = 0;
        const numberOfMeasures = data.numberOfMeasures || 1;

        const notesPerMeasure = data.notesPerMeasure || 16;
        const totalTicks = notesPerMeasure * numberOfMeasures;

        // 1. Stickings Voice
        for (let i = 0; i < totalTicks; i++) {
            if (data.sticking_array && data.sticking_array[i] && data.sticking_array[i] !== "") currentIndex++;
        }

        const kickStemsUp = !!data.kickStemsUp;

        // 2. Hands Voice (and Feet if stems up)
        for (let i = 0; i < totalTicks; i++) {
            const snareVal = data.snare_array[i];
            const hhVal = data.hh_array[i];
            const hasToms = data.toms_array && data.toms_array.some(arr => arr[i] && arr[i] !== "");
            const kickVal = data.kick_array[i];
            const isKick = kickStemsUp && kickVal && (kickVal === 'o' || kickVal === 'O' || kickVal === 'k' || kickVal === 'F' || kickVal === true || kickVal === 'b' || kickVal === 'X' || (typeof kickVal === 'string' && (kickVal.includes('F') || kickVal.includes('[F'))));
            const isSplash = kickStemsUp && kickVal && (kickVal === 'x' || kickVal === 'X' || kickVal === 's' || kickVal === 'S' || kickVal === 'd,' || kickVal === 'b' || (typeof kickVal === 'string' && (kickVal.includes('d,') || kickVal.includes('^d,'))));

            if ((snareVal && snareVal !== "") || (hhVal && hhVal !== "") || hasToms || isKick || isSplash) {
                if (snareVal && snareVal !== "") {
                    this.abcNoteMap.set(`${i}:snare`, currentIndex);
                    this.abcNoteMap.set(`${i}:snare_side`, currentIndex);
                    this.abcNoteMap.set(`${i}:snare_ghost`, currentIndex);
                    this.abcNoteMap.set(`${i}:snare_xstick`, currentIndex);
                    this.abcNoteMap.set(`${i}:snare_flam`, currentIndex);
                }
                if (hhVal && hhVal !== "") {
                    this.abcNoteMap.set(`${i}:hh_normal`, currentIndex);
                    this.abcNoteMap.set(`${i}:hh_open`, currentIndex);
                    this.abcNoteMap.set(`${i}:hh_accent`, currentIndex);
                    this.abcNoteMap.set(`${i}:crash`, currentIndex);
                    this.abcNoteMap.set(`${i}:ride`, currentIndex);
                    this.abcNoteMap.set(`${i}:ride_bell`, currentIndex);
                    this.abcNoteMap.set(`${i}:splash`, currentIndex);
                    this.abcNoteMap.set(`${i}:china`, currentIndex);
                }
                if (hasToms) {
                    data.toms_array.forEach((arr, tomIdx) => {
                        if (arr[i] && arr[i] !== "") this.abcNoteMap.set(`${i}:tom${tomIdx + 1}`, currentIndex);
                    });
                }
                if (isKick) this.abcNoteMap.set(`${i}:kick`, currentIndex);
                if (isSplash) this.abcNoteMap.set(`${i}:hh_foot`, currentIndex);

                currentIndex++; // One index for the whole chord/slice
            }
        }

        // 3. Feet Voice (only if NOT stems up)
        if (!kickStemsUp) {
            for (let i = 0; i < totalTicks; i++) {
                const kickVal = data.kick_array[i];
                if (kickVal && kickVal !== "") {
                    const isKick = kickVal === 'o' || kickVal === 'O' || kickVal === 'k' || kickVal === 'F' || kickVal === true || kickVal === 'b' || kickVal === 'X' || (typeof kickVal === 'string' && (kickVal.includes('F') || kickVal.includes('[F')));
                    const isSplash = kickVal === 'x' || kickVal === 'X' || kickVal === 's' || kickVal === 'S' || kickVal === 'd,' || kickVal === 'b' || (typeof kickVal === 'string' && (kickVal.includes('d,') || kickVal.includes('^d,')));

                    if (isKick) this.abcNoteMap.set(`${i}:kick`, currentIndex);
                    if (isSplash) this.abcNoteMap.set(`${i}:hh_foot`, currentIndex);

                    currentIndex++; // Shared index for [Kick Splash] chord
                }
            }
        }
        console.log(`[CoachController] Mapped ${this.abcNoteMap.size} keys to ${currentIndex} indices across ${numberOfMeasures} measures`);
    }

    getAbcIndexForHit(tickIndex, instrument) {
        if (!this.abcNoteMap) this._refreshAbcMapping();
        const index = this.abcNoteMap.get(`${tickIndex}:${instrument}`);
        return index !== undefined ? index : -1;
    }

    /**
     * Convert GrooveWriter's current pattern into a timeline of ms offsets
     */
    getGrooveAsTimeline() {
        const writer = this.grooveWriter;
        if (!writer) return [];

        const data = writer.grooveDataFromClickableUI();
        if (!data) return [];

        const timeline = [];
        const bpm = data.tempo || 80;
        const numBeats = data.numBeats || 4;
        const noteValue = data.noteValue || 4;
        const numberOfMeasures = data.numberOfMeasures || 1;
        const notesPerMeasure = data.notesPerMeasure || 16;
        const totalTicks = notesPerMeasure * numberOfMeasures;
        const msPerTick = ((60000 / bpm) * numBeats) / notesPerMeasure;

        console.log(`[CoachController] Generating timeline: ${totalTicks} ticks (${notesPerMeasure} n/m), ${bpm} BPM, ${msPerTick.toFixed(2)}ms/tick`);

        for (let i = 0; i < totalTicks; i++) {
            // HH
            if (data.hh_array[i] && data.hh_array[i] !== "") {
                const val = data.hh_array[i];
                let type = 'hh_normal';
                // Check for all articulations/variants
                if (val === 'o' || val === 'O' || val.includes('!open!')) type = 'hh_open';
                else if (val === 'X' || val.includes('!accent!')) type = 'hh_accent';
                else if (val === 'c' || val === 'C' || val.includes("^c'")) type = 'crash';
                else if (val === 'r' || val === 'R' || val.includes("^A'")) type = 'ride';
                else if (val === 'b' || val === 'B' || val.includes("^B'")) type = 'ride_bell';
                else if (val === 's' || val === 'S') type = 'splash';
                else if (val === 'k' || val === 'K') type = 'china';
                timeline.push({ time: i * msPerTick, type, tickIndex: i });
                console.log(`[TimelineLog] Tick ${i}: added ${type} (val: ${val}) at ${(i * msPerTick).toFixed(2)}ms`);
            }
            // Snare
            if (data.snare_array[i] && data.snare_array[i] !== "") {
                const val = data.snare_array[i];
                let type = 'snare';
                if (val === 'g' || val === 'G' || val.includes('!(')) type = 'snare_ghost';
                else if (val === 'x' || val.includes('^c')) type = 'snare_xstick';
                else if (val === 'f' || val === 'F' || val.includes('{/')) type = 'snare_flam';
                timeline.push({ time: i * msPerTick, type, tickIndex: i });
                console.log(`[TimelineLog] Tick ${i}: added ${type} (val: ${val}) at ${(i * msPerTick).toFixed(2)}ms`);
            }
            // Kick / HH Foot
            if (data.kick_array[i] && data.kick_array[i] !== "") {
                const val = data.kick_array[i];
                // Kick drum: 'o', 'O', 'F', or ABC notation with 'F'
                const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true || val === 'b' || val === 'X' || (typeof val === 'string' && (val.includes('F') || val.includes('[F')));
                // Foot hi-hat: 'x', 'h', or ABC notation '^d,' (splash) or '[F^d,]' (kick+splash)
                const isHHFoot = val === 'x' || val === 'h' || val === 'H' || (typeof val === 'string' && val.includes('^d,'));

                if (isKick) {
                    timeline.push({ time: i * msPerTick, type: 'kick', tickIndex: i });
                    console.log(`[TimelineLog] Tick ${i}: added kick (val: ${val}) at ${(i * msPerTick).toFixed(2)}ms`);
                }
                if (isHHFoot) {
                    timeline.push({ time: i * msPerTick, type: 'hh_foot', tickIndex: i });
                    console.log(`[TimelineLog] Tick ${i}: added hh_foot (val: ${val}) at ${(i * msPerTick).toFixed(2)}ms`);
                }
            }
            // Toms
            if (data.toms_array) {
                data.toms_array.forEach((row, idx) => {
                    if (row && row[i] && row[i] !== "") {
                        timeline.push({ time: i * msPerTick, type: `tom${idx + 1}`, tickIndex: i });
                        console.log(`[TimelineLog] Tick ${i}: added tom${idx + 1} (val: ${row[i]}) at ${(i * msPerTick).toFixed(2)}ms`);
                    }
                });
            }
        }

        console.log(`[CoachController] Generated timeline with ${timeline.length} notes`);
        return timeline.sort((a, b) => a.time - b.time);
    }

    // Simplified mapping is now handled by _refreshAbcMapping and getAbcIndexForHit
}
