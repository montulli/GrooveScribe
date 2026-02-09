import { Engine } from './engine/Engine.js';
import { MidiInputHandler } from './engine/MidiInputHandler.js';
import { LatencyManager } from './engine/LatencyManager.js';
import { ABCIndexMapper } from './engine/ABCIndexMapper.js';
import { FeedbackRenderer, SHOW_DEBUG } from './ui/FeedbackRenderer.js';
import { PlayerBar } from './ui/PlayerBar.js';
import { SettingsDialog } from './ui/SettingsDialog.js';
import { ResultsDialog } from './ui/ResultsDialog.js';
import { coachState } from './state/State.js';
import { DrumType } from './engine/DrumConstants.js';
import { scoreLayoutExtractor } from './engine/ScoreLayoutExtractor.js';

/**
 * Controller - Orchestrates the entire Drum Coach feature
 */
export class Controller {
    constructor(grooveWriter) {
        this.grooveWriter = grooveWriter;
        this.engine = new Engine();
        this.abcMapper = new ABCIndexMapper();
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

        // Inject debug grooves into the Grooves menu when debug is enabled
        if (SHOW_DEBUG) {
            this._injectDebugGrooves();
            this._initDebugHotkeys();
        }

        // Debug grid is controlled by SHOW_DEBUG constant in FeedbackRenderer.js

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
        this._refreshAbcMapping(); // Map instruments to staff indices

        // Ensure sniffer is hooked to the engine and has processed the current ABC
        const abc = this.grooveWriter.myGrooveUtils.abc_obj;
        if (abc && window.scoreLayout) {
            window.scoreLayout.hook(abc);
            const sniffedData = window.scoreLayout.getSniffedData();
            console.log('[Controller] ScoreLayoutExtractor re-hooked. Sniffed data:', sniffedData?.systems?.[0]?.chords.length || 0, 'chords');
        }

        // Ensure visual feedback is ready
        this.renderer.init();
        this.renderer.clearFeedback();

        // Set groove context for time-based rendering
        this.setRendererGrooveContext();

        // Simulate count-in as the last measure of the groove.
        // Back-date sessionStartTime so the clearing loop sees timeMs
        // starting at (N-1)*measureDuration — the last measure.
        // The clearing thresholds will fire for measure 0 during count-in,
        // ensuring it's cleared before any rushing hits arrive.
        const totalMeasures = this.renderer.totalMeasures;
        const measureDurationMs = this.renderer.measureDurationMs;
        this.sessionStartTime = performance.now() - (totalMeasures - 1) * measureDurationMs;

        // Start engine AFTER back-dating so engine relTime matches
        // controller hitTimeMs (both use the same sessionStartTime).
        // Circle drawing is gated by _renderingEnabled (set at M0 barline).
        this.engine.start(this.sessionStartTime);

        // Start clearing loop with rendering disabled (no playline or
        // circles visible during count-in).
        this.renderer._renderingEnabled = false;
        const countInStartTimeMs = (totalMeasures - 1) * measureDurationMs;
        this.renderer.scheduleMeasureClearing(countInStartTimeMs);

        this.renderer.startPlayLine(
            () => performance.now() - this.sessionStartTime - this.engine.audioLatency
        );

        if (SHOW_DEBUG) {
            this.renderer.renderDebugGrid();
        }
    }

    /**
     * Called when MIDI playback stops - handles performance results
     */
    _onPlaybackStop() {
        console.log('[Controller] Playback stopped');
        this.renderer.stopPlayLine();
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
        this.renderer.scheduleMeasureClearing(0);

        // Rendering was enabled at M0 barline during count-in.
        // Re-enable here for subsequent repeats (idempotent).
        this.renderer.enableRendering();

        // Playline was already started during count-in.
        // The closure captures `this` so it reads the updated sessionStartTime.
        // Start if not running yet (safety fallback).
        if (!this.renderer._playLineGetTime) {
            this.renderer.startPlayLine(
                () => performance.now() - this.sessionStartTime - this.engine.audioLatency
            );
        }

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
        this.renderer.clearAll();
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
            // Initialize latency from browser's AudioContext (auto-detects output + base latency)
            if (typeof MIDI !== 'undefined' && MIDI.Player?.ctx) {
                this.latencyManager.init(MIDI.Player.ctx);
            }
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
        this.renderer.clearAll();

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

        // Calculate hit time relative to groove start (subtract audio latency)
        const audioLatency = this.engine.audioLatency;
        const hitTimeMs = timestamp - this.sessionStartTime - audioLatency;
        const effectiveDrum = evaluation.isGraceNote ? DrumType.FLAM_GRACE : drum;

        if (evaluation.isMatch) {
            // Find target note for precise ABC indexing metadata
            const matchedNote = this.engine.noteTimeline.find(n => n.originalIndex === evaluation.noteIndex);
            const abcIndex = matchedNote ? this.abcMapper.getIndex(matchedNote.tickIndex, evaluation.isGraceNote ? 'snare_flam' : drum) : null;

            // Draw feedback at pre-calculated sniffed coordinate.
            // Use the note's expected time (not hitTimeMs) for coordinate lookup,
            // since the renderer's timeline tolerance is tight and good/close
            // hits can be 20-50ms away from the expected time.
            this.renderer.drawHitFeedbackByTime(
                matchedNote.time,
                evaluation.tier,
                evaluation.timingError,
                effectiveDrum,
                abcIndex >= 0 ? abcIndex : null
            );
        } else {
            // Extra hits (gray circles) - interpolated position based on hit drum
            this.renderer.drawExtraHit(
                hitTimeMs,
                drum
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

        const metrics = this.abcMapper.getGrooveMetrics(data);
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
            const abcIndex = this.abcMapper.getIndex(note.tickIndex, note.editorType || note.type);

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
     * Build the ABC index mapping from the current groove data.
     */
    _refreshAbcMapping() {
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return;
        const metrics = this.abcMapper.getGrooveMetrics(data);
        if (!metrics) return;
        this.abcMapper.buildMap(data, metrics);
    }

    /**
     * Convert GrooveWriter's current pattern into a ms-based timeline for the Engine.
     */
    getGrooveAsTimeline() {
        const data = this.grooveWriter.grooveDataFromClickableUI();
        if (!data) return [];
        const metrics = this.abcMapper.getGrooveMetrics(data);
        if (!metrics) return [];
        return this.abcMapper.buildTimeline(data, metrics);
    }

    /**
     * Refresh sniffer data and re-sync the renderer's context.
     * Called on resize or notation re-rendering.
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

    /**
     * Register keyboard shortcuts for simulating drum hits (debug only).
     * k = kick, s = snare, h = closed hi-hat.
     * Calls the same handleMidiHit pipeline as real MIDI input.
     */
    _initDebugHotkeys() {
        const KEY_TO_DRUM = {
            'k': DrumType.KICK,
            's': DrumType.SNARE,
            'h': DrumType.HH_CLOSED,
        };

        window.addEventListener('keydown', (e) => {
            // Don't intercept when typing in text fields
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            const drum = KEY_TO_DRUM[e.key];
            if (!drum) return;
            if (!this.isCoachingActive || !this.engine.isPlaying) return;
            this.handleMidiHit(drum, performance.now(), 100);
        });
    }

    /**
     * Inject debug test grooves into the Grooves menu.
     * Prepends a "Coach Debug" section at the top of the groove list.
     */
    _injectDebugGrooves() {
        const wrapper = document.getElementById('grooveListWrapper');
        if (!wrapper) return;

        const debugGrooves = {
            'All Notes': '?TimeSig=4/4&Div=8&Tempo=80&Measures=3&MetronomeFreq=4&H=|xoXrbcsm|nN------|--------&S=|--------|----oOgx|fb------&K=|--------|--------|--ox----&T1=|--------|--o-----|--------&T4=|--------|---o----|--------',
            'All Notes (Unisons)': '?TimeSig=4/4&Div=8&Tempo=80&Measures=3&MetronomeFreq=4&H=|xoXrbcsm|nN------|----x---&S=|--------|----oOgx|fb--O---&K=|oooooooo|oooooooo|oooxo---&T1=|--------|--o-----|----o---&T4=|--------|---o----|--ooo---',
            'Five empty systems': '?TimeSig=4/4&Div=16&Tempo=80&Measures=10&MetronomeFreq=4&H=|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|&S=|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|&K=|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|&T1=|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|&T4=|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|----------------|'
        };

        let html = '<ul class="grooveListUL">\n';
        html += '<li class="grooveListHeaderLI">Coach Debug</li>\n';
        html += '<ul class="grooveListUL">\n';
        for (const [name, url] of Object.entries(debugGrooves)) {
            const escaped = url.replace(/'/g, "\\'");
            html += `<li class="grooveListLI" onClick="myGrooveWriter.loadNewGroove('${escaped}'); window.coachController.startSession({autoPlay: false})">${name}</li>\n`;
        }
        html += '</ul>\n</ul>\n';

        wrapper.insertAdjacentHTML('afterbegin', html);
    }

}
