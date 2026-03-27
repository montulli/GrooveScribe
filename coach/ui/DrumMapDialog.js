import { ModuleDrumTypes } from '../engine/DrumConstants.js';
import { coachState } from '../state/State.js';
import { cloneDrumMap, drumMapsEqual } from '../data/DrumMapUtils.js';

const DRUM_TYPE_LABELS = {
    kick: 'Kick',
    snare: 'Snare',
    snare_xstick: 'Cross Stick',
    hh_closed: 'HH Closed',
    hh_foot: 'HH Foot',
    hh_open: 'HH Open',
    tom_high: 'Tom High',
    tom_low: 'Tom Low',
    crash: 'Crash',
    ride: 'Ride',
    ride_bell: 'Ride Bell',
    cow_bell: 'Cowbell',
    stacker: 'Stacker',
};

/**
 * DrumMapDialog - MIDI drum mapping configuration UI.
 *
 * Shows a list of drum instruments with their mapped MIDI note numbers.
 * Users can select a module preset or manually map notes via MIDI learn.
 */
export class DrumMapDialog {
    /**
     * @param {Object} options
     * @param {Object} options.midiHandler - MidiInputHandler instance (for MIDI learn)
     * @param {Array} options.presets - Loaded preset list from DrumMapLoader
     * @param {Map} options.presetsById - All presets indexed by id (including bases)
     */
    constructor({ midiHandler, presets, presetsById }) {
        this.midiHandler = midiHandler;
        this.presets = presets;
        this.presetsById = presetsById;
        this.container = null;

        // Working copy of the current map being edited
        this._editingMap = null;
        // The preset id that matches the current editing map (or 'custom')
        this._activePresetId = null;
        // MIDI learn state
        this._listeningDrumType = null;
        this._savedOnHit = null;
    }

    inject() {
        if (document.getElementById('coachDrumMapDialog')) return;

        const dialog = document.createElement('div');
        dialog.id = 'coachDrumMapDialog';
        dialog.innerHTML = this._buildHTML();
        document.body.appendChild(dialog);
        this.container = dialog;
        this._setupEventListeners();
    }

    _buildHTML() {
        const presetOptions = this.presets
            .map(p => `<option value="${p.id}">${p.label}</option>`)
            .join('\n');

        const instrumentRows = ModuleDrumTypes.map(type => `
            <div class="drummap-row" data-drum-type="${type}">
                <label class="drummap-label">${DRUM_TYPE_LABELS[type] || type}</label>
                <div class="drummap-chips" data-drum-type="${type}"></div>
                <button class="drummap-learn-btn" data-drum-type="${type}" title="MIDI Learn">+</button>
            </div>
        `).join('');

        return `
            <h2>Drum Mapping</h2>

            <div class="coach-setting-row">
                <label>Module</label>
                <select id="drummap-preset-select">
                    ${presetOptions}
                    <option value="custom">Custom</option>
                </select>
            </div>

            <div id="drummap-instrument-list">
                ${instrumentRows}
            </div>

            <div id="drummap-conflict-notice" class="drummap-conflict-notice"></div>

            <div class="coach-dialog-buttons">
                <button class="coach-btn coach-btn-secondary" id="drummap-cancel-btn">Cancel</button>
                <button class="coach-btn coach-btn-primary" id="drummap-apply-btn">Apply</button>
            </div>
        `;
    }

    _setupEventListeners() {
        // Preset dropdown
        this.container.querySelector('#drummap-preset-select').addEventListener('change', (e) => {
            const presetId = e.target.value;
            if (presetId === 'custom') return;
            const preset = this.presets.find(p => p.id === presetId);
            if (!preset) return;
            this._editingMap = cloneDrumMap(preset.map);
            this._activePresetId = presetId;
            this._renderChips();
        });

        // MIDI learn buttons
        this.container.querySelectorAll('.drummap-learn-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const drumType = btn.dataset.drumType;
                this._startListening(drumType);
            });
        });

        // Apply
        this.container.querySelector('#drummap-apply-btn').addEventListener('click', () => {
            this._stopListening();
            this._apply();
        });

        // Cancel
        this.container.querySelector('#drummap-cancel-btn').addEventListener('click', () => {
            this._stopListening();
            this.hide();
            window.dispatchEvent(new CustomEvent('drummap-cancelled'));
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.style.display === 'block') {
                if (this._listeningDrumType) {
                    this._stopListening();
                } else {
                    this._stopListening();
                    this.hide();
                    window.dispatchEvent(new CustomEvent('drummap-cancelled'));
                }
            }
        });
    }

    show() {
        // Load current state into working copy
        if (coachState.drumMapPreset === 'custom' && coachState.drumMapCustom) {
            this._editingMap = cloneDrumMap(coachState.drumMapCustom);
            this._activePresetId = 'custom';
        } else {
            const preset = this.presets.find(p => p.id === coachState.drumMapPreset);
            if (preset) {
                this._editingMap = cloneDrumMap(preset.map);
                this._activePresetId = preset.id;
            } else {
                // Fallback to GM
                const gm = this.presetsById.get('_gm');
                this._editingMap = cloneDrumMap(gm.resolvedMap);
                this._activePresetId = '_gm';
            }
        }

        this.container.querySelector('#drummap-preset-select').value = this._activePresetId;
        this._renderChips();
        this._clearConflictNotice();
        this.container.style.display = 'block';
    }

    hide() {
        this._stopListening();
        this.container.style.display = 'none';
    }

    _renderChips() {
        for (const type of ModuleDrumTypes) {
            const chipsContainer = this.container.querySelector(`.drummap-chips[data-drum-type="${type}"]`);
            const notes = this._editingMap[type] || [];

            if (notes.length === 0) {
                chipsContainer.innerHTML = '<span class="drummap-empty">--</span>';
                continue;
            }

            chipsContainer.innerHTML = notes.map(note =>
                `<span class="drummap-chip" data-note="${note}" data-drum-type="${type}">${note}<span class="drummap-chip-remove" data-note="${note}" data-drum-type="${type}">&times;</span></span>`
            ).join('');

            // Attach remove handlers
            chipsContainer.querySelectorAll('.drummap-chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const noteNum = Number(btn.dataset.note);
                    const drumType = btn.dataset.drumType;
                    this._removeNote(drumType, noteNum);
                });
            });
        }
    }

    _removeNote(drumType, noteNum) {
        const notes = this._editingMap[drumType];
        const idx = notes.indexOf(noteNum);
        if (idx >= 0) {
            notes.splice(idx, 1);
            this._markCustomIfChanged();
            this._renderChips();
        }
    }

    _addNote(drumType, noteNum) {
        // Conflict detection: remove from any other instrument
        for (const type of ModuleDrumTypes) {
            if (type === drumType) continue;
            const notes = this._editingMap[type];
            const idx = notes.indexOf(noteNum);
            if (idx >= 0) {
                notes.splice(idx, 1);
                const fromLabel = DRUM_TYPE_LABELS[type] || type;
                const toLabel = DRUM_TYPE_LABELS[drumType] || drumType;
                this._showConflictNotice(`Note ${noteNum} moved from ${fromLabel} to ${toLabel}`);
            }
        }

        // Add if not already present
        if (!this._editingMap[drumType].includes(noteNum)) {
            this._editingMap[drumType].push(noteNum);
        }

        this._markCustomIfChanged();
        this._renderChips();
    }

    _markCustomIfChanged() {
        // Check if current editing map still matches the selected preset
        if (this._activePresetId === 'custom') return;
        const preset = this.presets.find(p => p.id === this._activePresetId);
        if (preset && drumMapsEqual(this._editingMap, preset.map)) return;

        this._activePresetId = 'custom';
        this.container.querySelector('#drummap-preset-select').value = 'custom';
    }

    _startListening(drumType) {
        // Stop any previous listening
        this._stopListening();

        this._listeningDrumType = drumType;

        // Highlight the row
        const row = this.container.querySelector(`.drummap-row[data-drum-type="${drumType}"]`);
        if (row) row.classList.add('drummap-listening');

        // Show instruction in the chips area
        const chipsContainer = this.container.querySelector(`.drummap-chips[data-drum-type="${drumType}"]`);
        const existingChips = chipsContainer.innerHTML;
        chipsContainer.dataset.savedChips = existingChips;
        chipsContainer.innerHTML = '<span class="drummap-listen-prompt">Hit a pad...</span>';

        // Hijack MIDI handler
        this._savedOnHit = this.midiHandler.onHit;
        this.midiHandler.onHit = (_drum, _timestamp, _velocity, rawNote) => {
            // MidiInputHandler passes the mapped drum type, but we need the raw MIDI note.
            // We hook at a lower level — see _startRawListening.
        };

        // We need the raw MIDI note number, not the mapped drum type.
        // Temporarily replace the MIDI message handler to get raw notes.
        this._startRawListening(drumType);
    }

    _startRawListening(drumType) {
        if (!this.midiHandler.midiAccess) return;

        this._rawMidiHandler = (event) => {
            const [status, note, velocity] = event.data;
            const isNoteOn = (status & 0xF0) === 0x90 && velocity > 0;
            if (!isNoteOn) return;

            this._addNote(drumType, note);
            this._stopListening();
        };

        for (const input of this.midiHandler.midiAccess.inputs.values()) {
            input.onmidimessage = this._rawMidiHandler;
        }
    }

    _stopListening() {
        if (!this._listeningDrumType) return;

        const drumType = this._listeningDrumType;

        // Restore row highlight
        const row = this.container.querySelector(`.drummap-row[data-drum-type="${drumType}"]`);
        if (row) row.classList.remove('drummap-listening');

        // Restore MIDI handler
        if (this._savedOnHit) {
            this.midiHandler.onHit = this._savedOnHit;
            this._savedOnHit = null;
        }

        // Restore original MIDI message handler
        if (this.midiHandler.midiAccess) {
            for (const input of this.midiHandler.midiAccess.inputs.values()) {
                input.onmidimessage = this.midiHandler._handleMidiMessage.bind(this.midiHandler);
            }
        }

        this._listeningDrumType = null;
        this._rawMidiHandler = null;

        // Re-render chips (replaces the "Hit a pad..." prompt)
        this._renderChips();
    }

    _showConflictNotice(message) {
        const notice = this.container.querySelector('#drummap-conflict-notice');
        notice.textContent = message;
        notice.style.display = 'block';
        clearTimeout(this._conflictTimeout);
        this._conflictTimeout = setTimeout(() => this._clearConflictNotice(), 3000);
    }

    _clearConflictNotice() {
        const notice = this.container.querySelector('#drummap-conflict-notice');
        if (notice) {
            notice.style.display = 'none';
            notice.textContent = '';
        }
    }

    _apply() {
        if (this._activePresetId === 'custom') {
            coachState.drumMapPreset = 'custom';
            coachState.drumMapCustom = cloneDrumMap(this._editingMap);
        } else {
            coachState.drumMapPreset = this._activePresetId;
            coachState.drumMapCustom = null;
        }
        coachState.drumMapConfigured = true;
        coachState.save();

        this.hide();
        window.dispatchEvent(new CustomEvent('drummap-applied'));
    }
}
