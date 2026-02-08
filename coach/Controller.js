import { Engine } from './engine/Engine.js';
import { MidiInputHandler } from './engine/MidiInputHandler.js';
import { LatencyManager } from './engine/LatencyManager.js';
import { FeedbackRenderer, SHOW_DEBUG } from './ui/FeedbackRenderer.js';
import { PlayerBar } from './ui/PlayerBar.js';
import { SettingsDialog } from './ui/SettingsDialog.js';
import { ResultsDialog } from './ui/ResultsDialog.js';
import { coachState } from './state/State.js';
import { DrumType, EditorDrumTypes, ABC_PITCH_TO_DRUM_TYPE } from './engine/DrumConstants.js';
import { scoreLayoutExtractor } from './engine/ScoreLayoutExtractor.js';

// Ensure global availability for legacy scripts (groove_utils.js)
window.scoreLayout = scoreLayoutExtractor;

/**
 * Controller - Orchestrates the entire Drum Coach feature
 */
export class Controller {
    constructor(grooveWriter) {
        this.grooveWriter = grooveWriter;
        this.engine = new Engine();
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
        this.playerBar = new PlayerBar({
            grooveWriter,
            onStopSession: () => this.stopSession(),
            isCoachingActive: () => this.isCoachingActive
        });
        this.dialog = new SettingsDialog();
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
                console.log('[Controller] Resize detected, updating feedback UI');
                this._refreshAndSyncUI();
            }
        });

        // Intercept displayNewSVG to know when the SVG is replaced
        const originalDisplaySVG = this.grooveWriter.displayNewSVG;
        this.grooveWriter.displayNewSVG = (...args) => {
            originalDisplaySVG.apply(this.grooveWriter, args);
            if (this.isCoachingActive) {
                console.log('[Controller] Notation re-rendered, refreshing feedback UI');
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
        console.log('[Controller] Playback started, syncing engine');
        // Record the playback start time for timing calculations
        this.sessionStartTime = performance.now();
        this._refreshAbcMapping(); // Map instruments to staff indices

        // Ensure sniffer is hooked to the engine and has processed the current ABC
        const abc = this.grooveWriter.myGrooveUtils.abc_obj;
        if (abc && window.scoreLayout) {
            // New signature for hook (just passing the engine instance)
            window.scoreLayout.hook(abc);
            const sniffedData = window.scoreLayout.getSniffedData();
            console.log('[Controller] ScoreLayoutExtractor re-hooked. Sniffed data:', sniffedData?.systems?.[0]?.chords.length || 0, 'chords');
        }

        this.engine.start(this.sessionStartTime);

        // Ensure visual feedback is ready
        this.renderer.init();
        this.renderer.clearFeedback();

        // Set groove context for time-based rendering
        this.setRendererGrooveContext();
    }

    /**
     * Called when MIDI playback stops - handles performance results
     */
    _onPlaybackStop() {
        console.log('[Controller] Playback stopped');
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
        console.log(`[Controller] Repeat ${this.currentRepetition}`);

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
        console.log('[Controller] Session Results:', stats);
        this.isCoachingActive = false;
        this._restoreEditorGrid();
        this.resultsDialog.show(stats);
    }

    /**
     * Start a coaching session - prepares metadata and triggers playback
     */
    async startSession({ autoPlay = true } = {}) {
        try {
            // 0. Connect MIDI on first session (lazy initialization)
            if (!this.midiConnected) {
                try {
                    await this.midiHandler.connect();
                    this.midiConnected = true;
                    console.log('[Controller] MIDI Connected');
                } catch (e) {
                    console.warn('[Controller] MIDI failed to connect', e);
                    // Continue anyway - user can still practice without MIDI input
                }
            }

            // 1. Get current groove data from writer
            const grooveData = this.getGrooveAsTimeline();

            // 2. Setup engine with tolerance windows based on settings
            this.engine.windows = coachState.getToleranceWindows();
            this.engine.audioLatency = this.latencyManager.getTotalOffset();
            this.engine.loadGroove({ target: grooveData });

            // 3. Activate coaching mode
            this.isCoachingActive = true;
            this.currentRepetition = 0;

            // 4. Save pre-coaching state for later restoration
            this._savedState = {
                viewMode: this.grooveWriter.myGrooveUtils.viewMode,
                countInEnabled: !!document.getElementById('metronomeOptionsContextMenuCountIn')?.classList.contains('menuChecked'),
                metronomeFrequency: this.grooveWriter.getMetronomeFrequency(),
                url: window.location.href,
            };

            // 5. Set up coaching UI
            this.renderer.init();
            this.renderer.clearFeedback();

            // 5a. Enter view mode to hide editor UI during coaching
            if (!this._savedState.viewMode) {
                this.grooveWriter.swapViewEditMode(true);
            }
            const viewEditBtn = document.getElementById('view-edit-switch');
            if (viewEditBtn && viewEditBtn.closest('.left-button')) {
                viewEditBtn.closest('.left-button').style.display = 'none';
            }

            // 5b. Transform player bar into coaching bar
            this.playerBar.setup();

            // 5c. Force-enable metronome if off
            if (this._savedState.metronomeFrequency === 0) {
                this.grooveWriter.setMetronomeFrequency(4); // quarter notes
            }

            // 5d. Force-enable count-in (hide menu item since it's implicit)
            if (!this._savedState.countInEnabled) {
                try { this.grooveWriter.metronomeOptionsMenuPopupClick('CountIn'); } catch (e) { console.warn('[Controller] count-in toggle:', e); }
            }
            const countInMenuItem = document.getElementById('metronomeOptionsContextMenuCountIn');
            if (countInMenuItem) countInMenuItem.style.display = 'none';

            // 6. Initialize visual feedback context
            this.grooveWriter.displayNewSVG();
            this._refreshAbcMapping();
            this.setRendererGrooveContext();

            // 7. Set coach mode URL flag and update URL immediately
            this.grooveWriter.myGrooveUtils.coachMode = true;
            this.grooveWriter.updateCurrentURL();

            // 8. Start playback if requested
            if (autoPlay) {
                if (this.grooveWriter.myGrooveUtils.isPlaying()) {
                    this.grooveWriter.myGrooveUtils.stopMIDI_playback();
                }
                this.grooveWriter.myGrooveUtils.startOrPauseMIDI_playback();
            }

            console.log('[Controller] Session Started (autoPlay=' + autoPlay + ')');
        } catch (error) {
            console.error('[Controller] CRITICAL ERROR IN startSession:', error);
            throw error;
        }
    }

    /**
     * Stop the current coaching session
     */
    stopSession() {
        this.isCoachingActive = false;
        this.engine.stop();

        // Stop playback
        const utils = this.grooveWriter.myGrooveUtils;

        // Temporarily disable updateMidiPlayTime so late MIDI callbacks can't overwrite the reset
        const origUpdateMidiPlayTime = utils.updateMidiPlayTime;
        utils.updateMidiPlayTime = function () { };

        try { utils.stopMIDI_playback(); } catch (e) { console.warn('[Controller] stopMIDI_playback:', e); }
        // Fire stop event to reset button state even if player was already stopped
        try { utils.midiEventCallbacks.stopEvent(utils.midiEventCallbacks.classRoot); } catch (e) { console.warn('[Controller] stopEvent:', e); }

        this._restoreEditorGrid();

        // Reset timestamp display
        const playTimeEl = document.getElementById('MIDIPlayTime' + utils.grooveUtilsUniqueIndex);
        if (playTimeEl) playTimeEl.innerHTML = '0:00';

        // Restore updateMidiPlayTime after all pending callbacks have flushed
        setTimeout(() => { utils.updateMidiPlayTime = origUpdateMidiPlayTime; }, 500);

        console.log('[Controller] Session Stopped');
    }

    /**
     * Restore all pre-coaching state
     */
    _restoreEditorGrid() {
        const saved = this._savedState || {};

        // 1. Restore player bar (stop icon, labels, badge, callbacks)
        try { this.playerBar.restore(); } catch (e) { console.warn('[Controller] restore player bar:', e); }

        // 2. Restore view/edit mode FIRST (before metronome/count-in which may trigger updateCurrentURL)
        const viewEditBtn = document.getElementById('view-edit-switch');
        if (viewEditBtn && viewEditBtn.closest('.left-button')) {
            viewEditBtn.closest('.left-button').style.display = '';
        }
        if (!saved.viewMode && this.grooveWriter.myGrooveUtils.viewMode) {
            this.grooveWriter.swapViewEditMode(true);
        }

        // 3. Restore metronome frequency
        try {
            if (saved.metronomeFrequency !== undefined) {
                this.grooveWriter.setMetronomeFrequency(saved.metronomeFrequency);
            }
        } catch (e) { console.warn('[Controller] restore metronome:', e); }

        // 4. Restore count-in setting and menu visibility
        try {
            if (!saved.countInEnabled) {
                this.grooveWriter.metronomeOptionsMenuPopupClick('CountIn');
            }
        } catch (e) { console.warn('[Controller] restore count-in:', e); }
        const countInMenuItem = document.getElementById('metronomeOptionsContextMenuCountIn');
        if (countInMenuItem) countInMenuItem.style.display = '';

        console.log('[Controller] Restored editor state', saved);

        // 5. Clear coach mode flag and force clean URL update
        this.grooveWriter.myGrooveUtils.coachMode = false;
        try {
            this.grooveWriter.updateCurrentURL();
        } catch (e) { console.warn('[Controller] URL update:', e); }
    }

    /**
     * Route incoming MIDI drum hits to the engine and renderer
     */
    handleMidiHit(drum, timestamp, velocity) {
        if (!this.engine.isPlaying) return;

        // Create evaluation
        const evaluation = this.engine.handleMidiHit(drum, timestamp);
        if (!evaluation) return;

        console.log(`[Controller] Hit ${drum} evaluation: ${evaluation.tier} (match: ${evaluation.isMatch})`);

        // Calculate hit time relative to groove start (subtract audio latency)
        const audioLatency = this.engine.audioLatency;
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
     * Prepare context for coordinate-based rendering using the ScoreLayoutExtractor payload
     * @param {Object} scoreData - Optional explicit data (for testing), otherwise sniffs window
     */
    setRendererGrooveContext(scoreData = null) {
        const writer = this.grooveWriter;
        if (!writer) return;

        const data = writer.grooveDataFromClickableUI();
        if (!data) return;

        const metrics = this._getGrooveMetrics(data);
        if (!metrics) return;

        const context = {
            bpm: metrics.bpm,
            numBeats: metrics.numBeats,
            measures: metrics.measures,
            notesPerMeasure: metrics.notesPerMeasure
        };

        // Capture high-precision sniffer data
        // Use imported instance directly to avoid window property issues
        const layoutInstance = scoreLayoutExtractor || window.scoreLayout;
        const sniffedData = layoutInstance ? layoutInstance.getSniffedData() : null;
        console.log('[Controller] Captured Sniffed Data:', sniffedData ? (sniffedData.systems?.[0]?.chords?.length + ' chords') : 'None', 'Instance:', !!layoutInstance);

        const timeline = [];

        // Augment engine timeline with ABC synchronization metadata
        for (const note of this.engine.noteTimeline) {
            const abcIndex = this.getAbcIndexForHit(note.tickIndex, note.editorType || note.type);

            // Primary note entry (always emitted)
            timeline.push({
                time: note.time,
                tickIndex: note.tickIndex,
                type: note.type,
                abcIndex: abcIndex >= 0 ? abcIndex : null,
                isGrace: false
            });

            // For flams, emit a grace note timeline entry so the renderer
            // can pair it with the sniffed grace note (matched positionally,
            // not by abcIndex, since abc2svg uses a different index for graces).
            if (note.editorType === DrumType.SNARE_FLAM) {
                timeline.push({
                    time: note.time,
                    tickIndex: note.tickIndex,
                    type: DrumType.FLAM_GRACE,
                    abcIndex: abcIndex >= 0 ? abcIndex : null,
                    isGrace: true
                });
            }
        }

        this.renderer.setGrooveContext(context, timeline, sniffedData);
        const graceCount = timeline.filter(n => n.isGrace).length;
        console.log(`[Controller] Set renderer groove context: ${timeline.length} notes (${graceCount} grace notes)`);
    }

    /**
     * Build a mapping of (tickIndex, instrument) -> abcNoteIndex
     * This simulates abc2svg's rendering order to accurately target rectangles.
     */
    _refreshAbcMapping() {
        this.abcNoteMap = new Map();
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return;

        const metrics = this._getGrooveMetrics(data);
        if (!metrics) return;

        let currentIndex = 0;
        const { totalTicks } = metrics;

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
            const isFoot = kickStemsUp && !!kickVal && !isKick;

            if (hasSnare || hasHH || hasToms || isKick || isFoot) {
                if (hasSnare) {
                    [DrumType.SNARE, DrumType.SNARE_ACCENT, DrumType.SNARE_GHOST, DrumType.SNARE_XSTICK, DrumType.SNARE_FLAM, DrumType.SNARE_BUZZ].forEach(t => this.abcNoteMap.set(`${i}:${t}`, currentIndex));
                }
                if (hasHH) {
                    [DrumType.HH_CLOSED, DrumType.HH_OPEN, DrumType.HH_ACCENT, DrumType.CRASH, DrumType.RIDE, DrumType.RIDE_BELL, DrumType.COWBELL, DrumType.STACKER, DrumType.METRONOME_NORMAL, DrumType.METRONOME_ACCENT].forEach(t => this.abcNoteMap.set(`${i}:${t}`, currentIndex));
                }
                if (hasToms) {
                    data.toms_array.forEach((arr, tomIdx) => {
                        if (arr[i]) {
                            const key = (tomIdx < 2) ? DrumType.TOM_HIGH : DrumType.TOM_LOW;
                            this.abcNoteMap.set(`${i}:${key}`, currentIndex);
                        }
                    });
                }
                if (isKick) this.abcNoteMap.set(`${i}:${DrumType.KICK}`, currentIndex);
                if (isFoot) this.abcNoteMap.set(`${i}:${DrumType.HH_FOOT}`, currentIndex);
                currentIndex++;
            }
        }

        // 3. Lower Voice (Feet only if rendered on separate stems)
        if (!kickStemsUp) {
            for (let i = 0; i < totalTicks; i++) {
                const val = data.kick_array[i];
                if (val) {
                    const isKick = val === 'o' || val === 'O' || val === 'k' || val === 'F' || val === true;
                    if (isKick) this.abcNoteMap.set(`${i}:${DrumType.KICK}`, currentIndex);
                    else this.abcNoteMap.set(`${i}:${DrumType.HH_FOOT}`, currentIndex);
                    currentIndex++;
                }
            }
        }
        console.log(`[Controller] Mapped ${this.abcNoteMap.size} keys to ${currentIndex} indices`);
    }

    /**
     * Resolve the target ABC index for a specific tick and instrument
     */
    getAbcIndexForHit(tickIndex, instrument) {
        if (!this.abcNoteMap) this._refreshAbcMapping();
        const index = this.abcNoteMap.get(`${tickIndex}:${instrument}`);
        return index !== undefined ? index : -1;
    }

    /**
     * Convert GrooveWriter's current pattern into a ms-based timeline for the Engine
     */
    getGrooveAsTimeline() {
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return [];

        const metrics = this._getGrooveMetrics(data);
        if (!metrics) return [];

        const { bpm, msPerTick, totalTicks } = metrics;
        const timeline = [];

        console.log(`[Controller] Generating timeline: ${totalTicks} ticks, ${bpm} BPM, ${msPerTick.toFixed(2)} ms / tick`);

        for (let i = 0; i < totalTicks; i++) {
            // Hi-Hats & Cymbals
            if (data.hh_array[i]) {
                const type = this._resolveAbcDrumType(data.hh_array[i], 'hh', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Snare variants
            if (data.snare_array[i]) {
                const type = this._resolveAbcDrumType(data.snare_array[i], 'snare', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Kick and Foot HH
            if (data.kick_array[i]) {
                const type = this._resolveAbcDrumType(data.kick_array[i], 'kick', i);
                if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
            }
            // Toms (Unified 4-tom array)
            if (data.toms_array) {
                data.toms_array.forEach((row, idx) => {
                    if (row[i]) {
                        const type = this._resolveAbcDrumType(row[i], `tom${idx}`, i);
                        if (type) timeline.push({ time: i * msPerTick, type, tickIndex: i });
                    }
                });
            }
        }
        return timeline.sort((a, b) => a.time - b.time);
    }

    /**
     * Resolve a raw ABC notation value (from grooveDataFromClickableUI) to a DrumType.
     *
     * Values may include decorations (e.g. "!open!^g", "!accent!c", "!(c!)", "{/c").
     * The pitch is extracted by stripping decorations, then looked up in ABC_PITCH_TO_DRUM_TYPE.
     * Decorations then override the base type (e.g. !open! on ^g → HH_OPEN instead of HH_CLOSED).
     *
     * @returns {string|null} DrumType value, or null if unknown (with console warning)
     */
    _resolveAbcDrumType(val, arrayName, tickIndex) {
        // Strip ABC decorations: !xxx! patterns (e.g. !accent!, !open!, !(.!, !///!)
        let stripped = val.replace(/![^!]*!/g, '');
        // Strip grace note prefix: {/X} block (flam notation, e.g. {/c} before the main note)
        stripped = stripped.replace(/\{\/[^}]*\}/g, '');
        const pitch = stripped;
        const baseType = ABC_PITCH_TO_DRUM_TYPE[pitch];

        if (!baseType) {
            console.warn(`[Controller] Unknown ABC value in ${arrayName}[${tickIndex}]: ${JSON.stringify(val)} (pitch: ${JSON.stringify(pitch)})`);
            return null;
        }

        // Decoration overrides for articulation variants
        if (val.includes('!open!')) return DrumType.HH_OPEN;
        if (val.includes('!accent!')) {
            // Flam with accent: the {/ grace block takes priority over accent
            if (val.includes('{/')) return DrumType.SNARE_FLAM;
            if (baseType === DrumType.SNARE) return DrumType.SNARE_ACCENT;
            if (baseType === DrumType.HH_CLOSED) return DrumType.HH_ACCENT;
        }
        if (val.includes('!(')) return DrumType.SNARE_GHOST;
        if (val.includes('{/')) return DrumType.SNARE_FLAM;
        if (val.includes('!///!')) return DrumType.SNARE_BUZZ;

        return baseType;
    }

    /**
     * Extract and validate groove timing metrics from editor data.
     * @param {Object} data - Result from grooveDataFromClickableUI()
     * @returns {Object|null} Metrics object or null if data is invalid
     */
    _getGrooveMetrics(data) {
        const bpm = data.tempo;
        const numBeats = data.numBeats;
        const measures = data.numberOfMeasures;
        const notesPerMeasure = data.notesPerMeasure;

        if (!bpm || !numBeats || !measures || !notesPerMeasure) {
            console.error('[Controller] Groove data has missing/zero fields:',
                { tempo: bpm, numBeats, numberOfMeasures: measures, notesPerMeasure });
            return null;
        }

        const totalTicks = notesPerMeasure * measures;
        const msPerTick = ((60000 / bpm) * numBeats) / notesPerMeasure;

        return { bpm, numBeats, measures, notesPerMeasure, totalTicks, msPerTick };
    }

    /**
     * Refresh sniffer data and re-sync the renderer's context
     * Called on resize or notation re-rendering
     */
    _refreshAndSyncUI() {
        if (!this.grooveWriter || !this.isCoachingActive) return;

        // Ensure sniffer processes the new SVG (it hooks automatically via abc2svg hooks, 
        // but we want to make sure we have the latest data before updating renderer)
        const sniffedData = window.scoreLayout ? window.scoreLayout.getSniffedData() : null;

        // Re-map drum indices as they might have shifted
        this._refreshAbcMapping();

        // Update renderer with new coordinates and scale
        this.setRendererGrooveContext();
    }
}
