import { CoachEngine } from './engine/CoachEngine.js';
import { MidiInputHandler } from './engine/MidiInputHandler.js';
import { LatencyManager } from './engine/LatencyManager.js';
import { FeedbackRenderer, SHOW_DEBUG } from './ui/FeedbackRenderer.js';
import { CoachSettingsDialog } from './ui/CoachSettingsDialog.js';
import { ResultsDialog } from './ui/ResultsDialog.js';
import { coachState } from './state/CoachState.js';
import { DrumType, EditorDrumTypes } from './engine/DrumConstants.js';
import { notationSniffer } from './engine/NotationSniffer.js';

// Ensure global availability for legacy scripts (groove_utils.js)
window.notationSniffer = notationSniffer;

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
                39: DrumType.SNARE
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

    /**
     * Initialize the controller, inject UI components, and hook events
     */
    async init() {
        if (this.isInitialized) return;

        this.dialog.inject();
        this.resultsDialog.inject();
        this.renderer.init();

        // Listen for start requests from dialog
        window.addEventListener('coach-start-requested', () => this.startSession());

        // Debug grid is controlled by SHOW_DEBUG constant in FeedbackRenderer.js
        // No dynamic toggle needed

        // Hook into GrooveWriter's playback system
        this._hookPlaybackEvents();

        // Listen for resize and notation changes to re-render feedback layer
        // We debounce or just hook into the existing refresh_ABC logic if possible
        window.addEventListener('resize', () => {
            if (this.isCoachingActive) {
                console.log('[CoachController] Resize detected, updating feedback UI');
                this._refreshAndSyncUI();
            }
        });

        // Intercept displayNewSVG to know when the SVG is replaced
        const originalDisplaySVG = this.grooveWriter.displayNewSVG;
        this.grooveWriter.displayNewSVG = (...args) => {
            originalDisplaySVG.apply(this.grooveWriter, args);
            if (this.isCoachingActive) {
                console.log('[CoachController] Notation re-rendered, refreshing feedback UI');
                this._refreshAndSyncUI();
            }
        };

        this.isInitialized = true;
    }

    /**
     * Hook into GrooveWriter's MIDI playback callbacks for synchronization
     */
    _hookPlaybackEvents() {
        const utils = this.grooveWriter.myGrooveUtils;

        // Store original callbacks to maintain existing functionality
        const originalPlayEvent = utils.midiEventCallbacks.playEvent;
        const originalStopEvent = utils.midiEventCallbacks.stopEvent;
        const originalRepeatCallback = utils.repeatCallback;

        // Intercept play event
        utils.midiEventCallbacks.playEvent = (root) => {
            if (originalPlayEvent) originalPlayEvent(root);
            if (this.isCoachingActive) this._onPlaybackStart();
        };

        // Intercept stop event
        utils.midiEventCallbacks.stopEvent = (root) => {
            if (originalStopEvent) originalStopEvent(root);
            if (this.isCoachingActive) this._onPlaybackStop();
        };

        // Intercept repeat callback for multi-repetition sessions
        utils.repeatCallback = () => {
            if (originalRepeatCallback) originalRepeatCallback();
            if (this.isCoachingActive) this._onRepeat();
        };
    }

    /**
     * Called when MIDI playback starts - synchronizes timing and prepares renderer
     */
    _onPlaybackStart() {
        console.log('[CoachController] Playback started, syncing engine');
        // Record the playback start time for timing calculations
        this.sessionStartTime = performance.now();
        this._refreshAbcMapping(); // Map instruments to staff indices

        // Ensure sniffer is hooked to the engine and has processed the current ABC
        const abc = this.grooveWriter.myGrooveUtils.abc_obj;
        if (abc && window.notationSniffer) {
            // Re-hook and process if the ABC object might have changed or sniffer needs re-running
            window.notationSniffer.hook(abc);
            const sniffedData = window.notationSniffer.getSniffedData();
            console.log('[CoachController] NotationSniffer re-hooked. Sniffed data:', sniffedData?.staffs?.[0]?.notes.length || 0, 'notes');
        }

        this.engine.start(this.sessionStartTime);

        // Ensure visual feedback is ready
        this.renderer.init();
        this.renderer.clearFeedback();

        // Set groove context for time-based rendering
        this._setRendererGrooveContext();
    }

    /**
     * Called when MIDI playback stops - handles performance results
     */
    _onPlaybackStop() {
        console.log('[CoachController] Playback stopped');
        if (coachState.mode === 'performance' && this.isCoachingActive) {
            this._showResults();
        }
        this.engine.stop();
        this._restoreEditorGrid();
    }

    /**
     * Called at the end of each repetition in multi-repetition mode
     */
    _onRepeat() {
        this.currentRepetition++;
        console.log(`[CoachController] Repeat ${this.currentRepetition}`);

        if (coachState.mode === 'performance' && this.currentRepetition >= coachState.reps) {
            // Stop playback after reaching target repetitions in performance mode
            this.grooveWriter.myGrooveUtils.stopMIDI_playback();
            return;
        }

        // Reset engine timing for new repetition
        this.sessionStartTime = performance.now();
        this.engine.start(this.sessionStartTime);
        this.renderer.clearFeedback();

        // Re-render grid if debug is enabled
        if (SHOW_DEBUG) {
            this.renderer.renderDebugGrid();
        }
    }

    /**
     * Display the performance results dialog
     */
    _showResults() {
        const stats = this.engine.getResults();
        console.log('[CoachController] Session Results:', stats);
        this.isCoachingActive = false;
        this._updateButtonState(false);
        this._restoreEditorGrid();
        this.resultsDialog.show(stats);
    }

    /**
     * Start a coaching session - prepares metadata and triggers playback
     */
    async startSession() {
        try {
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

            // 2. Setup engine with tolerance windows based on settings
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

            // 4a. Hide the editor grid during coaching
            const editorGrid = document.getElementById('musicalInput');
            if (editorGrid) editorGrid.style.display = 'none';

            // 5. Initialize visual feedback context immediately (shows debug grid if enabled)
            // Re-render the notation to capture coordinates via NotationSniffer
            // The displayNewSVG call internally hooks the sniffer and triggers renderABCtoSVG
            this.grooveWriter.displayNewSVG();

            this._refreshAbcMapping();
            this._setRendererGrooveContext();

            // 6. Trigger playback if not already playing
            if (!this.grooveWriter.myGrooveUtils.isPlaying()) {
                this.grooveWriter.myGrooveUtils.startOrPauseMIDI_playback();
            }

            console.log('[CoachController] Session Started');
        } catch (error) {
            console.error('[CoachController] CRITICAL ERROR IN startSession:', error);
            throw error;
        }
    }

    /**
     * Stop the current coaching session
     */
    stopSession() {
        this.isCoachingActive = false;
        this.engine.stop();
        this._updateButtonState(false);
        this._restoreEditorGrid();
        console.log('[CoachController] Session Stopped');
    }

    /**
     * Restore the editor grid visibility after coaching ends
     */
    _restoreEditorGrid() {
        const editorGrid = document.getElementById('musicalInput');
        if (editorGrid) {
            editorGrid.style.display = 'block';
            console.log('[CoachController] Restored editor grid visibility (display: block)');
        } else {
            console.warn('[CoachController] Failed to restore editor grid - element #musicalInput not found');
        }
    }

    /**
     * Update the UI toggle button state
     */
    _updateButtonState(isActive) {
        const btn = document.getElementById('coachToggleBtn');
        if (!btn) return;

        btn.classList.toggle('coaching-active', isActive);
        if (isActive) {
            btn.innerHTML = '<i class="fa fa-stop"></i> Stop';
        } else {
            btn.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach';
        }
    }

    /**
     * Route incoming MIDI drum hits to the engine and renderer
     */
    handleMidiHit(drum, timestamp, velocity) {
        if (!this.engine.isPlaying) return;

        // Create evaluation
        const evaluation = this.engine.handleMidiHit(drum, timestamp);
        if (!evaluation) return;

        console.log(`[CoachController] Hit ${drum} evaluation: ${evaluation.tier} (match: ${evaluation.isMatch})`);

        // Calculate hit time relative to groove start (subtract audio latency)
        const audioLatency = this.engine.audioLatency || 0;
        const hitTimeMs = timestamp - this.sessionStartTime - audioLatency;
        const effectiveDrum = evaluation.isGraceNote ? DrumType.FLAM_GRACE : drum;

        if (evaluation.isMatch) {
            // Find target note for precise ABC indexing metadata
            const matchedNote = this.engine.noteTimeline.find(n => n.originalIndex === evaluation.noteIndex);
            const abcIndex = matchedNote ? this.getAbcIndexForHit(matchedNote.tickIndex, evaluation.isGraceNote ? 'snare_flam' : drum) : null;

            // Draw feedback at pre-calculated sniffed coordinate
            this.renderer.drawHitFeedbackByTime(
                hitTimeMs,
                evaluation.tier,
                evaluation.timingError,
                effectiveDrum,
                abcIndex >= 0 ? abcIndex : null
            );
        } else {
            // Extra hits (gray circles) - direct time position
            this.renderer.drawHitFeedbackByTime(
                hitTimeMs,
                'extra',
                0,
                drum,
                null
            );
        }
    }

    /**
     * Prepare context for coordinate-based rendering using the NotationSniffer payload
     */
    _setRendererGrooveContext() {
        const writer = this.grooveWriter;
        if (!writer) return;

        const data = writer.grooveDataFromClickableUI();
        if (!data) return;

        const context = {
            bpm: data.tempo || 80,
            numBeats: data.numBeats || 4,
            measures: data.numberOfMeasures || 1,
            notesPerMeasure: data.notesPerMeasure || 16
        };

        // Capture high-precision sniffer data
        const sniffedData = window.notationSniffer ? window.notationSniffer.getSniffedData() : null;
        console.log('[CoachController] Captured Sniffed Data:', sniffedData ? (sniffedData.staffs?.[0]?.notes?.length + ' notes, ' + sniffedData.staffs?.[0]?.boundaries?.length + ' boundaries') : 'None');

        const timeline = [];

        // Augment engine timeline with ABC synchronization metadata
        for (const note of this.engine.noteTimeline) {
            const isGrace = (note.editorType === DrumType.SNARE_FLAM && note.graceMatched !== undefined);
            const abcIndex = this.getAbcIndexForHit(note.tickIndex, note.editorType || note.type);

            timeline.push({
                time: note.time,
                tickIndex: note.tickIndex,
                type: note.type,
                abcIndex: abcIndex >= 0 ? abcIndex : null,
                isGrace: isGrace
            });
        }

        this.renderer.setGrooveContext(context, timeline, sniffedData);
        console.log(`[CoachController] Set renderer groove context: ${timeline.length} notes`);
    }

    /**
     * Build a mapping of (tickIndex, instrument) -> abcNoteIndex
     * This simulates abc2svg's rendering order to accurately target rectangles.
     */
    _refreshAbcMapping() {
        this.abcNoteMap = new Map();
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return;

        let currentIndex = 0;
        const totalTicks = (data.notesPerMeasure || 16) * (data.numberOfMeasures || 1);

        // 1. Stickings Voice (Rendered first in abc2svg)
        for (let i = 0; i < totalTicks; i++) {
            if (data.sticking_array && data.sticking_array[i]) currentIndex++;
        }

        const kickStemsUp = !!data.kickStemsUp;

        // 2. Main Voice (Hands, and Feet if stems are unified)
        for (let i = 0; i < totalTicks; i++) {
            const hasSnare = data.snare_array[i] && data.snare_array[i] !== "";
            const hasHH = data.hh_array[i] && data.hh_array[i] !== "";
            const hasToms = data.toms_array && data.toms_array.some(arr => arr[i] && arr[i] !== "");
            const kickVal = data.kick_array[i];
            const isKick = kickStemsUp && kickVal && (kickVal === 'o' || kickVal === 'O' || kickVal === 'k' || kickVal === 'F' || kickVal === true);
            const isSplash = kickStemsUp && kickVal && (kickVal === 'x' || kickVal === 'X' || kickVal === 's' || kickVal === 'd,');

            if (hasSnare || hasHH || hasToms || isKick || isSplash) {
                if (hasSnare) {
                    [DrumType.SNARE, DrumType.SNARE_ACCENT, DrumType.SNARE_GHOST, DrumType.SNARE_XSTICK, DrumType.SNARE_FLAM, DrumType.SNARE_BUZZ].forEach(t => this.abcNoteMap.set(`${i}:${t} `, currentIndex));
                }
                if (hasHH) {
                    [DrumType.HH_CLOSED, DrumType.HH_OPEN, DrumType.HH_ACCENT, DrumType.CRASH, DrumType.RIDE, DrumType.RIDE_BELL, DrumType.COWBELL, DrumType.STACKER, DrumType.METRONOME_NORMAL, DrumType.METRONOME_ACCENT].forEach(t => this.abcNoteMap.set(`${i}:${t} `, currentIndex));
                }
                if (hasToms) {
                    data.toms_array.forEach((arr, tomIdx) => {
                        if (arr[i]) {
                            const key = (tomIdx < 2) ? DrumType.TOM_HIGH : DrumType.TOM_LOW;
                            this.abcNoteMap.set(`${i}:${key} `, currentIndex);
                        }
                    });
                }
                if (isKick) this.abcNoteMap.set(`${i}:${DrumType.KICK} `, currentIndex);
                if (isSplash) this.abcNoteMap.set(`${i}:${DrumType.HH_FOOT} `, currentIndex);
                currentIndex++;
            }
        }

        // 3. Lower Voice (Feet only if rendered on separate stems)
        if (!kickStemsUp) {
            for (let i = 0; i < totalTicks; i++) {
                const val = data.kick_array[i];
                if (val) {
                    const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true;
                    if (isKick) this.abcNoteMap.set(`${i}: kick`, currentIndex);
                    else this.abcNoteMap.set(`${i}: hh_foot`, currentIndex);
                    currentIndex++;
                }
            }
        }
        console.log(`[CoachController] Mapped ${this.abcNoteMap.size} keys to ${currentIndex} indices`);
    }

    /**
     * Resolve the target ABC index for a specific tick and instrument
     */
    getAbcIndexForHit(tickIndex, instrument) {
        if (!this.abcNoteMap) this._refreshAbcMapping();
        const index = this.abcNoteMap.get(`${tickIndex}:${instrument} `);
        return index !== undefined ? index : -1;
    }

    /**
     * Convert GrooveWriter's current pattern into a ms-based timeline for the Engine
     */
    getGrooveAsTimeline() {
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return [];

        const timeline = [];
        const bpm = data.tempo || 80;
        const numBeats = data.numBeats || 4;
        const msPerTick = ((60000 / bpm) * numBeats) / (data.notesPerMeasure || 16);
        const totalTicks = (data.notesPerMeasure || 16) * (data.numberOfMeasures || 1);

        console.log(`[CoachController] Generating timeline: ${totalTicks} ticks, ${bpm} BPM, ${msPerTick.toFixed(2)} ms / tick`);

        for (let i = 0; i < totalTicks; i++) {
            // Hi-Hats & Cymbals
            if (data.hh_array[i]) {
                const val = data.hh_array[i];
                let type = DrumType.HH_CLOSED;
                if (val === 'o' || val === 'O' || val.includes('!open!')) type = DrumType.HH_OPEN;
                else if (val === 'X' || val.includes('!accent!')) type = DrumType.HH_ACCENT;
                else if (val === 'c' || val === 'C') type = DrumType.CRASH;
                else if (val === 'r' || val === 'R') type = DrumType.RIDE;
                else if (val === 'b' || val === 'B') type = DrumType.RIDE_BELL;
                timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Snare variants
            if (data.snare_array[i]) {
                const val = data.snare_array[i];
                let type = DrumType.SNARE;
                if (val === 'g' || val === 'G' || val.includes('!(')) type = DrumType.SNARE_GHOST;
                else if (val === 'x' || val.includes('^c')) type = DrumType.SNARE_XSTICK;
                else if (val === 'f' || val === 'F' || val.includes('{/')) type = DrumType.SNARE_FLAM;
                else if (val === 'O' || val.includes('!accent!')) type = DrumType.SNARE_ACCENT;
                timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Kick and Foot HH
            if (data.kick_array[i]) {
                const val = data.kick_array[i];
                const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true;
                timeline.push({ time: i * msPerTick, type: isKick ? DrumType.KICK : DrumType.HH_FOOT, tickIndex: i });
            }
            // Toms (Unified 4-tom array)
            if (data.toms_array) {
                data.toms_array.forEach((row, idx) => {
                    if (row[i]) {
                        // Map 4 rows to High/Low staff positions
                        timeline.push({ time: i * msPerTick, type: (idx < 2) ? DrumType.TOM_HIGH : DrumType.TOM_LOW, tickIndex: i });
                    }
                });
            }
        }
        return timeline.sort((a, b) => a.time - b.time);
    }

    /**
     * Refresh sniffer data and re-sync the renderer's context
     * Called on resize or notation re-rendering
     */
    _refreshAndSyncUI() {
        if (!this.grooveWriter || !this.isCoachingActive) return;

        // Ensure sniffer processes the new SVG (it hooks automatically via abc2svg hooks, 
        // but we want to make sure we have the latest data before updating renderer)
        const sniffedData = window.notationSniffer ? window.notationSniffer.getSniffedData() : null;

        // Re-map drum indices as they might have shifted
        this._refreshAbcMapping();

        // Update renderer with new coordinates and scale
        this._setRendererGrooveContext();
    }
}
