/**
 * PlayerBar - Transforms the player bar into a coaching bar and back.
 *
 * During coaching:
 * - Play/pause icon → stop icon
 * - BPM/Swing sliders → static labels
 * - Solo toggle + "Coach Mode On" badge added
 * - Top nav Coach button, permutations, and grooves menus hidden
 *
 * On restore: reverses all of the above.
 */
export class PlayerBar {
    /**
     * @param {Object} options
     * @param {Object} options.grooveWriter - The GrooveWriter instance
     * @param {Function} options.onStopSession - Callback when stop button is clicked during playback
     * @param {Function} options.isCoachingActive - Returns whether coaching is currently active
     */
    constructor({ grooveWriter, onStopSession, isCoachingActive }) {
        this.grooveWriter = grooveWriter;
        this.onStopSession = onStopSession;
        this.isCoachingActive = isCoachingActive;

        // Saved original callbacks for restoration
        this._originalPlayBtnOnclick = null;
        this._origPlayEvent = null;
        this._origPauseEvent = null;
        this._origStopEvent = null;
        this._origMidiInitialized = null;
    }

    /**
     * Transform the player bar into coaching mode.
     */
    setup() {
        const utils = this.grooveWriter.myGrooveUtils;
        const idx = utils.grooveUtilsUniqueIndex;

        // 1. Play button → stop icon + patch MIDI callbacks to preserve coaching class
        const playBtn = document.getElementById('midiPlayImage' + idx);
        if (playBtn) {
            this._originalPlayBtnOnclick = playBtn.onclick;
            playBtn.classList.add('coaching');
            playBtn.onclick = () => {
                if (utils.isPlaying()) {
                    this.onStopSession();
                } else {
                    utils.startOrPauseMIDI_playback();
                }
            };
        }

        // Patch MIDI event callbacks so they don't remove the 'coaching' class
        const callbacks = utils.midiEventCallbacks;
        this._origPlayEvent = callbacks.playEvent;
        this._origPauseEvent = callbacks.pauseEvent;
        this._origStopEvent = callbacks.stopEvent;
        this._origMidiInitialized = callbacks.midiInitialized;
        callbacks.playEvent = (root) => {
            this._origPlayEvent(root);
            if (this.isCoachingActive()) {
                const btn = document.getElementById('midiPlayImage' + idx);
                if (btn) btn.classList.add('coaching');
            }
        };
        callbacks.pauseEvent = (root) => {
            this._origPauseEvent(root);
            if (this.isCoachingActive()) {
                const btn = document.getElementById('midiPlayImage' + idx);
                if (btn) btn.classList.add('coaching');
            }
        };
        callbacks.stopEvent = (root) => {
            this._origStopEvent(root);
            if (this.isCoachingActive()) {
                const btn = document.getElementById('midiPlayImage' + idx);
                if (btn) btn.classList.add('coaching');
            }
        };
        // Prevent midiInitialized from overwriting our onclick during coaching
        callbacks.midiInitialized = (root) => {
            this._origMidiInitialized(root);
            if (this.isCoachingActive()) {
                const btn = document.getElementById('midiPlayImage' + idx);
                if (btn) {
                    btn.classList.add('coaching');
                    btn.onclick = () => {
                        if (utils.isPlaying()) {
                            this.onStopSession();
                        } else {
                            utils.startOrPauseMIDI_playback();
                        }
                    };
                }
            }
        };

        // 2. Hide BPM/Swing sliders, replace with static labels
        const tempoAndProgress = document.getElementById('tempoAndProgress' + idx);
        if (tempoAndProgress) {
            tempoAndProgress.style.display = 'none';
        }

        const labels = document.createElement('span');
        labels.id = 'coachStaticLabels';
        labels.className = 'coach-static-labels';
        const bpm = utils.getTempo();
        const swing = utils.getSwing();
        labels.innerHTML = `BPM <strong>${bpm}</strong> &nbsp;|&nbsp; Swing <strong>${swing}%</strong>`;

        const playTime = document.getElementById('MIDIPlayTime' + idx);
        if (playTime && playTime.parentNode) {
            playTime.style.width = 'auto';
            playTime.parentNode.insertBefore(labels, playTime.nextSibling);
        }

        // 2b. Add Solo toggle button after timestamp
        const soloBtn = document.createElement('span');
        soloBtn.id = 'coachSoloBtn';
        soloBtn.className = 'coach-solo-btn' + (utils.getMetronomeSolo() ? ' active' : '');
        soloBtn.innerHTML = '<i class="fa fa-headphones"></i> Solo';
        soloBtn.onclick = () => {
            this.grooveWriter.metronomeOptionsMenuPopupClick('Solo');
            soloBtn.classList.toggle('active', utils.getMetronomeSolo());
        };
        if (playTime && playTime.parentNode) {
            playTime.parentNode.insertBefore(soloBtn, playTime.nextSibling);
        }

        // 3. Hide metronome menu, GS logo, expand button
        const metronome = document.getElementById('midiMetronomeMenu' + idx);
        if (metronome) metronome.style.display = 'none';
        const gsLogo = document.getElementById('midiGSLogo' + idx);
        if (gsLogo) gsLogo.style.display = 'none';
        const expandBtn = document.getElementById('midiExpandImage' + idx);
        if (expandBtn) expandBtn.style.display = 'none';

        // 4. Add coach badge on the right
        const badge = document.createElement('span');
        badge.id = 'coachPlayerBadge';
        badge.className = 'coach-player-badge';
        badge.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach Mode On &mdash; Play along!';
        const playerRow = document.getElementById('playerControlsRow' + idx);
        if (playerRow) {
            playerRow.appendChild(badge);
        }

        // 5. Hide top nav coach button, permutations, and grooves menus
        const topNavBtn = document.getElementById('coachToggleBtn');
        if (topNavBtn) topNavBtn.style.display = 'none';
        const permBtn = document.getElementById('permutationAnchor');
        if (permBtn) permBtn.style.display = 'none';
        const groovesBtn = document.getElementById('groovesAnchor');
        if (groovesBtn) groovesBtn.style.display = 'none';
    }

    /**
     * Restore the player bar to its original state.
     */
    restore() {
        const utils = this.grooveWriter.myGrooveUtils;
        const idx = utils.grooveUtilsUniqueIndex;

        // 1. Restore play button and MIDI callbacks
        const playBtn = document.getElementById('midiPlayImage' + idx);
        if (playBtn) {
            playBtn.classList.remove('coaching');
            if (this._originalPlayBtnOnclick) {
                playBtn.onclick = this._originalPlayBtnOnclick;
            }
        }
        // Restore original MIDI event callbacks
        const callbacks = utils.midiEventCallbacks;
        if (this._origPlayEvent) callbacks.playEvent = this._origPlayEvent;
        if (this._origPauseEvent) callbacks.pauseEvent = this._origPauseEvent;
        if (this._origStopEvent) callbacks.stopEvent = this._origStopEvent;
        if (this._origMidiInitialized) callbacks.midiInitialized = this._origMidiInitialized;

        // 2. Remove static labels, restore sliders
        const labels = document.getElementById('coachStaticLabels');
        if (labels) labels.remove();
        const tempoAndProgress = document.getElementById('tempoAndProgress' + idx);
        if (tempoAndProgress) tempoAndProgress.style.display = '';
        const playTime = document.getElementById('MIDIPlayTime' + idx);
        if (playTime) {
            playTime.style.width = '';
        }

        // 3. Restore metronome menu, GS logo, expand button
        const metronome = document.getElementById('midiMetronomeMenu' + idx);
        if (metronome) metronome.style.display = '';
        const gsLogo = document.getElementById('midiGSLogo' + idx);
        if (gsLogo) gsLogo.style.display = '';
        const expandBtn = document.getElementById('midiExpandImage' + idx);
        if (expandBtn) expandBtn.style.display = '';

        // 4. Remove coach badge, solo button, and restore player row display
        const badge = document.getElementById('coachPlayerBadge');
        if (badge) badge.remove();
        const soloBtn = document.getElementById('coachSoloBtn');
        if (soloBtn) soloBtn.remove();
        const playerRow = document.getElementById('playerControlsRow' + idx);
        if (playerRow) {
            playerRow.style.display = '';
        }

        // 5. Show top nav coach button, permutations, and grooves menus
        const topNavBtn = document.getElementById('coachToggleBtn');
        if (topNavBtn) topNavBtn.style.display = '';
        const permBtn = document.getElementById('permutationAnchor');
        if (permBtn) permBtn.style.display = '';
        const groovesBtn = document.getElementById('groovesAnchor');
        if (groovesBtn) groovesBtn.style.display = '';
    }
}
