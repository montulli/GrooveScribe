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
        // Working copy of hihatCC config
        this._editingHihatCC = { enabled: false, cc: 4, threshold: 64 };
        // The preset id that matches the current editing map (or 'custom')
        this._activePresetId = null;
        // MIDI learn state
        this._listeningDrumType = null;
        this._savedOnHit = null;
        // Last CC value seen during passive listening (for hi-hat feedback)
        this._lastPassiveCC = 0;
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

            <div class="drummap-cc-section">
                <label class="drummap-cc-toggle">
                    <input type="checkbox" id="drummap-cc-enabled">
                    Pedal CC
                </label>
                <span class="drummap-cc-fields" id="drummap-cc-fields">
                    CC <input type="number" id="drummap-cc-num" min="0" max="127" value="4">
                    Close &ge; <input type="number" id="drummap-cc-threshold" min="0" max="127" value="64">
                </span>
                <span class="drummap-cc-live" id="drummap-cc-live">
                    <span class="drummap-cc-bar-track">
                        <span class="drummap-cc-bar-fill" id="drummap-cc-bar-fill"></span>
                        <span class="drummap-cc-bar-threshold" id="drummap-cc-bar-threshold"></span>
                    </span>
                    <span class="drummap-cc-value" id="drummap-cc-value">0</span>
                </span>
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
            this._editingHihatCC = { ...preset.hihatCC };
            this._activePresetId = presetId;
            this._renderChips();
            this._renderCCConfig();
        });

        // CC config inputs
        const ccEnabled = this.container.querySelector('#drummap-cc-enabled');
        const ccFields = this.container.querySelector('#drummap-cc-fields');
        const ccNum = this.container.querySelector('#drummap-cc-num');
        const ccThreshold = this.container.querySelector('#drummap-cc-threshold');

        ccEnabled.addEventListener('change', () => {
            this._editingHihatCC.enabled = ccEnabled.checked;
            ccFields.classList.toggle('drummap-cc-disabled', !ccEnabled.checked);
            this._markCustomIfChanged();
        });
        ccNum.addEventListener('change', () => {
            this._editingHihatCC.cc = parseInt(ccNum.value) || 4;
            this._markCustomIfChanged();
        });
        ccThreshold.addEventListener('change', () => {
            this._editingHihatCC.threshold = parseInt(ccThreshold.value) || 64;
            this._updateThresholdMarker();
            this._markCustomIfChanged();
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
            this._editingHihatCC = coachState.drumMapCustomHihatCC
                ? { ...coachState.drumMapCustomHihatCC }
                : { enabled: false, cc: 4, threshold: 64 };
            this._activePresetId = 'custom';
        } else {
            const preset = this.presets.find(p => p.id === coachState.drumMapPreset);
            if (preset) {
                this._editingMap = cloneDrumMap(preset.map);
                this._editingHihatCC = { ...preset.hihatCC };
                this._activePresetId = preset.id;
            } else {
                // Fallback to GM
                const gm = this.presetsById.get('_gm');
                this._editingMap = cloneDrumMap(gm.resolvedMap);
                this._editingHihatCC = { enabled: false, cc: 4, threshold: 64 };
                this._activePresetId = '_gm';
            }
        }

        this.container.querySelector('#drummap-preset-select').value = this._activePresetId;
        this._renderChips();
        this._renderCCConfig();
        this._clearConflictNotice();
        this._lastPassiveCC = 0;
        this.container.style.display = 'block';
        this._startPassiveListening();
    }

    hide() {
        this._stopListening();
        this._stopPassiveListening();
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

    _renderCCConfig() {
        const ccEnabled = this.container.querySelector('#drummap-cc-enabled');
        const ccFields = this.container.querySelector('#drummap-cc-fields');
        const ccNum = this.container.querySelector('#drummap-cc-num');
        const ccThreshold = this.container.querySelector('#drummap-cc-threshold');
        const ccLive = this.container.querySelector('#drummap-cc-live');

        ccEnabled.checked = this._editingHihatCC.enabled;
        ccNum.value = this._editingHihatCC.cc;
        ccThreshold.value = this._editingHihatCC.threshold;
        ccFields.classList.toggle('drummap-cc-disabled', !this._editingHihatCC.enabled);
        ccLive.classList.toggle('drummap-cc-disabled', !this._editingHihatCC.enabled);

        // Position threshold marker
        this._updateThresholdMarker();
        this._updateCCDisplay(0);
    }

    _updateThresholdMarker() {
        const marker = this.container.querySelector('#drummap-cc-bar-threshold');
        if (marker) {
            const pct = (this._editingHihatCC.threshold / 127) * 100;
            marker.style.left = pct + '%';
        }
    }

    _updateCCDisplay(value) {
        const fill = this.container.querySelector('#drummap-cc-bar-fill');
        const valueEl = this.container.querySelector('#drummap-cc-value');
        if (!fill || !valueEl) return;

        const pct = (value / 127) * 100;
        fill.style.width = pct + '%';
        valueEl.textContent = value;

        // Color: green when below threshold (open), orange when at/above (closed)
        const isClosed = value >= this._editingHihatCC.threshold;
        fill.classList.toggle('drummap-cc-closed', isClosed);
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
        // Pause passive listening during MIDI-learn
        this._stopPassiveListening();

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

        // Resume passive listening if dialog is still open
        if (this.container.style.display === 'block') {
            this._startPassiveListening();
        }
    }

    /**
     * Passive MIDI listening: while the dialog is open (but not in MIDI-learn mode),
     * flash the row when a mapped pad is hit, or show "Unmapped: XX" for unknown notes.
     */
    _startPassiveListening() {
        this._stopPassiveListening();
        if (!this.midiHandler.midiAccess) return;

        this._passiveMidiHandler = (event) => {
            const [status, data1, data2] = event.data;

            // Track CC for hi-hat pedal feedback
            const isCC = (status & 0xF0) === 0xB0;
            if (isCC && this._editingHihatCC.enabled && data1 === this._editingHihatCC.cc) {
                this._lastPassiveCC = data2;
                this._updateCCDisplay(data2);
                return;
            }

            const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
            if (!isNoteOn) return;
            // Don't interfere with MIDI-learn mode
            if (this._listeningDrumType) return;

            // Find which instrument this note is mapped to
            let mappedType = this._findMappedType(data1);

            // CC-based hi-hat resolution for passive feedback
            let ccResolved = false;
            if (this._editingHihatCC.enabled && mappedType === 'hh_open' && this._lastPassiveCC >= this._editingHihatCC.threshold) {
                mappedType = 'hh_closed';
                ccResolved = true;
            }

            if (mappedType) {
                this._flashRow(mappedType, data1, ccResolved);
            } else {
                this._showConflictNotice(`Unmapped note: ${data1}`);
            }
        };

        for (const input of this.midiHandler.midiAccess.inputs.values()) {
            input.onmidimessage = this._passiveMidiHandler;
        }
    }

    _stopPassiveListening() {
        if (!this._passiveMidiHandler) return;
        // Restore original MIDI message handler
        if (this.midiHandler.midiAccess) {
            for (const input of this.midiHandler.midiAccess.inputs.values()) {
                input.onmidimessage = this.midiHandler._handleMidiMessage.bind(this.midiHandler);
            }
        }
        this._passiveMidiHandler = null;
    }

    /**
     * Find which drum type a MIDI note is mapped to in the current editing map.
     */
    _findMappedType(noteNum) {
        for (const type of ModuleDrumTypes) {
            if (this._editingMap[type] && this._editingMap[type].includes(noteNum)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Flash a row and highlight the specific chip that was triggered.
     * @param {boolean} ccResolved - true if this hit was resolved via CC (not a fixed note match)
     */
    _flashRow(drumType, noteNum, ccResolved = false) {
        const row = this.container.querySelector(`.drummap-row[data-drum-type="${drumType}"]`);
        if (!row) return;

        // Flash the row — use a different class for CC-resolved hits
        row.classList.remove('drummap-hit', 'drummap-hit-cc');
        void row.offsetWidth;
        row.classList.add(ccResolved ? 'drummap-hit-cc' : 'drummap-hit');

        // For CC-resolved hits, the chip lives on the hh_open row, not hh_closed
        // So highlight it on the original row
        const chipRow = ccResolved ? 'hh_open' : drumType;
        const chip = this.container.querySelector(`.drummap-chip[data-note="${noteNum}"][data-drum-type="${chipRow}"]`);
        if (chip) {
            chip.classList.remove('drummap-chip-hit');
            void chip.offsetWidth;
            chip.classList.add('drummap-chip-hit');
        }
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
            coachState.drumMapCustomHihatCC = { ...this._editingHihatCC };
        } else {
            coachState.drumMapPreset = this._activePresetId;
            coachState.drumMapCustom = null;
            coachState.drumMapCustomHihatCC = null;
        }
        coachState.drumMapConfigured = true;
        coachState.save();

        this.hide();
        window.dispatchEvent(new CustomEvent('drummap-applied'));
    }
}
