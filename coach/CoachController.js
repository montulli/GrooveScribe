import { CoachEngine } from './engine/CoachEngine.js';
import { MidiInputHandler } from './engine/MidiInputHandler.js';
import { LatencyManager } from './engine/LatencyManager.js';
import { FeedbackRenderer } from './ui/FeedbackRenderer.js';
import { CoachSettingsDialog } from './ui/CoachSettingsDialog.js';
import { ResultsDialog } from './ui/ResultsDialog.js';
import { coachState } from './state/CoachState.js';
import { DrumType, EditorDrumTypes } from './engine/DrumConstants.js';

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
                36: DrumType.KICK, 35: DrumType.KICK,
                38: DrumType.SNARE, 40: DrumType.SNARE, 37: DrumType.SNARE_XSTICK,
                42: DrumType.HH_CLOSED, 44: DrumType.HH_FOOT, 46: DrumType.HH_OPEN,
                48: DrumType.TOM_HIGH, 50: DrumType.TOM_HIGH, 47: DrumType.TOM_HIGH,
                45: DrumType.TOM_LOW, 43: DrumType.TOM_LOW, 41: DrumType.TOM_LOW,
                49: DrumType.CRASH, 57: DrumType.CRASH,
                51: DrumType.RIDE, 53: DrumType.RIDE_BELL,
                39: DrumType.SNARE // Remap ghost snare hits to regular snare
            }
        });
        this.latencyManager = new LatencyManager();
        this.renderer = new FeedbackRenderer('#svgTarget');
        this.dialog = new CoachSettingsDialog();
        this.resultsDialog = new ResultsDialog();
        this.state = coachState;

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

        // Update debug grid immediately when toggled
        coachState._manager.addEventListener('change', ({ property, value }) => {
            if (property === 'showDebug') {
                if (value) {
                    this.renderer.refreshNoteRects(); // This calls renderDebugGrid
                } else {
                    // Just clear the grid if turned off
                    const existingDebug = this.renderer.feedbackLayer?.querySelectorAll('.coach-debug-line');
                    existingDebug?.forEach(el => el.remove());
                }
            }
        });

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

        // Normalize tom names for simulators/fixtures that might still use legacy names
        let normalizedDrum = drum;
        if (drum === 'tom1' || drum === 'tom2') normalizedDrum = DrumType.TOM_HIGH;
        else if (drum === 'tom3' || drum === 'tom4') normalizedDrum = DrumType.TOM_LOW;

        const evaluation = this.engine.handleMidiHit(normalizedDrum, timestamp);
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
                const effectiveDrum = evaluation.isGraceNote ? 'snare_flam' : normalizedDrum;
                const abcNoteIndex = this.getAbcIndexForHit(matchedNote.tickIndex, effectiveDrum);
                if (abcNoteIndex >= 0) {
                    this.renderer.drawHitFeedback(
                        abcNoteIndex,
                        evaluation.tier,
                        evaluation.timingError,
                        evaluation.isGraceNote ? DrumType.FLAM_GRACE : normalizedDrum
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
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE_ACCENT}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE_GHOST}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE_XSTICK}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE_FLAM}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.SNARE_BUZZ}`, currentIndex);
                }
                if (hhVal && hhVal !== "") {
                    this.abcNoteMap.set(`${i}:${DrumType.HH_CLOSED}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.HH_OPEN}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.HH_ACCENT}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.CRASH}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.RIDE}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.RIDE_BELL}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.COWBELL}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.STACKER}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.METRONOME_NORMAL}`, currentIndex);
                    this.abcNoteMap.set(`${i}:${DrumType.METRONOME_ACCENT}`, currentIndex);
                }
                if (hasToms) {
                    data.toms_array.forEach((arr, tomIdx) => {
                        let drumKey = `tom${tomIdx + 1}`;
                        // Remap Toms 1 & 2 -> TOM_HIGH, Toms 3 & 4 -> TOM_LOW
                        if (drumKey === 'tom1' || drumKey === 'tom2') drumKey = DrumType.TOM_HIGH;
                        if (drumKey === 'tom3' || drumKey === 'tom4') drumKey = DrumType.TOM_LOW;

                        if (EditorDrumTypes.includes(drumKey) && arr[i] && arr[i] !== "") {
                            this.abcNoteMap.set(`${i}:${drumKey}`, currentIndex);
                        }
                    });
                }
                if (isKick) this.abcNoteMap.set(`${i}:${DrumType.KICK}`, currentIndex);
                if (isSplash) this.abcNoteMap.set(`${i}:${DrumType.HH_FOOT}`, currentIndex);

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
            const tickNotes = [];
            // HH
            if (data.hh_array[i] && data.hh_array[i] !== "") {
                const val = data.hh_array[i];
                let type = DrumType.HH_CLOSED;
                // Check for all articulations/variants
                if (val === 'o' || val === 'O' || val.includes('!open!')) type = DrumType.HH_OPEN;
                else if (val === 'X' || val.includes('!accent!')) type = DrumType.HH_ACCENT;
                else if (val === 'c' || val === 'C' || val.includes("^c'")) type = DrumType.CRASH;
                else if (val === 'r' || val === 'R' || val.includes("^A'")) type = DrumType.RIDE;
                else if (val === 'b' || val === 'B' || val.includes("^B'")) type = DrumType.RIDE_BELL;
                else if (val === 'm' || val === 'M' || val.includes("^D'")) type = DrumType.COWBELL;
                else if (val === 's' || val === 'S' || val.includes("^d'")) type = DrumType.STACKER;
                else if (val === 'n' || val.includes("^e'")) type = DrumType.METRONOME_NORMAL;
                else if (val === 'N' || val.includes("^f'")) type = DrumType.METRONOME_ACCENT;

                if (EditorDrumTypes.includes(type)) {
                    tickNotes.push({ time: i * msPerTick, type, tickIndex: i });
                }
            }
            // Snare
            if (data.snare_array[i] && data.snare_array[i] !== "") {
                const val = data.snare_array[i];
                let type = DrumType.SNARE;
                if (val === 'g' || val === 'G' || val.includes('!(')) type = DrumType.SNARE_GHOST;
                else if (val === 'x' || val.includes('^c')) type = DrumType.SNARE_XSTICK;
                else if (val === 'f' || val === 'F' || val.includes('{/')) type = DrumType.SNARE_FLAM;
                else if (val === 'b' || val === 'B' || val.includes('!///!')) type = DrumType.SNARE_BUZZ;
                else if (val === 'O' || val.includes('!accent!')) type = DrumType.SNARE_ACCENT;

                if (EditorDrumTypes.includes(type)) {
                    tickNotes.push({ time: i * msPerTick, type, tickIndex: i });
                }
            }
            // Kick / HH Foot
            if (data.kick_array[i] && data.kick_array[i] !== "") {
                const val = data.kick_array[i];
                const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true || val === 'b' || val === 'X' || (typeof val === 'string' && (val.includes('F') || val.includes('[F')));
                const isHHFoot = val === 'x' || val === 'h' || val === 'H' || (typeof val === 'string' && val.includes('^d,'));

                if (isKick) tickNotes.push({ time: i * msPerTick, type: DrumType.KICK, tickIndex: i });
                if (isHHFoot) tickNotes.push({ time: i * msPerTick, type: DrumType.HH_FOOT, tickIndex: i });
            }
            // Toms
            if (data.toms_array) {
                data.toms_array.forEach((row, idx) => {
                    let drumKey = `tom${idx + 1}`;
                    // Remap Toms 1 & 2 -> TOM_HIGH, Toms 3 & 4 -> TOM_LOW
                    if (drumKey === 'tom1' || drumKey === 'tom2') drumKey = DrumType.TOM_HIGH;
                    if (drumKey === 'tom3' || drumKey === 'tom4') drumKey = DrumType.TOM_LOW;

                    if (EditorDrumTypes.includes(drumKey) && row && row[i] && row[i] !== "") {
                        tickNotes.push({ time: i * msPerTick, type: drumKey, tickIndex: i });
                    }
                });
            }

            if (tickNotes.length > 0) {
                timeline.push(...tickNotes);
            }
        }

        console.log(`[CoachController] Generated timeline with ${timeline.length} notes`);
        return timeline.sort((a, b) => a.time - b.time);
    }

    // Simplified mapping is now handled by _refreshAbcMapping and getAbcIndexForHit
}
