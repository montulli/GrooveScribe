import { coachState } from '../state/State.js';

/**
 * SettingsDialog - Manages the settings UI
 */
export class SettingsDialog {
  constructor() {
    this.container = null;
  }

  inject() {
    if (document.getElementById('coachSettingsDialog')) return;

    const dialog = document.createElement('div');
    dialog.id = 'coachSettingsDialog';
    dialog.innerHTML = `
      <h2>Drum Coach Settings</h2>
      
      <div class="coach-setting-row">
        <label>Coach Mode</label>
        <select id="coach-mode-select">
          <option value="practice">Practice (Infinite)</option>
          <option value="performance">Performance (Scored)</option>
        </select>
      </div>
      
      <div id="performance-options" style="display: none;">
        <div class="coach-setting-row">
          <label>Repetitions</label>
          <input type="number" id="coach-reps-input" min="2" max="16" value="4">
        </div>
      </div>
      
      <div class="coach-setting-row">
        <label>Count-in</label>
        <input type="checkbox" id="coach-countin-check" checked>
      </div>
      
      <div class="coach-setting-row">
        <label>Tolerance</label>
        <select id="coach-tolerance-select">
          <option value="strict">Strict (±15ms)</option>
          <option value="normal" selected>Normal (±30ms)</option>
          <option value="relaxed">Relaxed (±50ms)</option>
        </select>
      </div>

      <div class="coach-setting-row">
        <label>Drum Mapping</label>
        <button class="coach-btn coach-btn-calibrate" id="coach-drummap-btn">General MIDI</button>
      </div>
      <div id="coach-drummap-hint" class="coach-calib-hint" style="display:none;">Not configured</div>

      <div class="coach-setting-row">
        <label>Latency Offset</label>
        <span class="coach-latency-group">
          <input type="number" id="coach-latency-input" step="1" value="0"> ms
          <button class="coach-btn coach-btn-calibrate" id="coach-calibrate-btn">Calibrate</button>
        </span>
      </div>
      <div id="coach-calib-hint" class="coach-calib-hint" style="display:none;">Not calibrated</div>

      <div class="coach-setting-row">
        <label>Debug Grid</label>
        <input type="checkbox" id="coach-debug-grid-check" checked>
      </div>

      <div class="coach-dialog-buttons">
        <button class="coach-btn coach-btn-secondary" id="coach-cancel-btn">Cancel</button>
        <button class="coach-btn coach-btn-primary" id="coach-start-btn">Start Session</button>
      </div>
    `;

    document.body.appendChild(dialog);
    this.container = dialog;
    this._setupEventListeners();
  }

  _setupEventListeners() {
    const modeSelect = this.container.querySelector('#coach-mode-select');
    const perfOptions = this.container.querySelector('#performance-options');
    const startBtn = this.container.querySelector('#coach-start-btn');
    const cancelBtn = this.container.querySelector('#coach-cancel-btn');

    modeSelect.addEventListener('change', () => {
      perfOptions.style.display = modeSelect.value === 'performance' ? 'block' : 'none';
    });

    this.container.querySelector('#coach-calibrate-btn').addEventListener('click', () => {
      this.save();
      this.hide();
      window.dispatchEvent(new CustomEvent('coach-calibrate-requested'));
    });

    this.container.querySelector('#coach-drummap-btn').addEventListener('click', () => {
      this.save();
      this.hide();
      window.dispatchEvent(new CustomEvent('coach-drummap-requested'));
    });

    startBtn.addEventListener('click', () => {
      this.save();
      this.hide();
      // Trigger session start event...
      window.dispatchEvent(new CustomEvent('coach-start-requested'));
    });

    cancelBtn.addEventListener('click', () => {
      this.hide();
    });
  }

  show() {
    // Load current state into fields
    this.container.querySelector('#coach-mode-select').value = coachState.mode;
    this.container.querySelector('#coach-reps-input').value = coachState.reps;
    this.container.querySelector('#coach-countin-check').checked = coachState.countIn;
    this.container.querySelector('#coach-tolerance-select').value = coachState.tolerance;
    this.container.querySelector('#coach-latency-input').value = coachState.calibrationOffset;
    this.container.querySelector('#coach-debug-grid-check').checked = coachState.showDebugGrid;

    this.container.querySelector('#performance-options').style.display = coachState.mode === 'performance' ? 'block' : 'none';

    this.container.querySelector('#coach-calib-hint').style.display = coachState.calibrated ? 'none' : 'block';

    // Update drum mapping button label
    const drumMapBtn = this.container.querySelector('#coach-drummap-btn');
    if (coachState.drumMapPreset === 'custom') {
      drumMapBtn.textContent = 'Custom';
    } else {
      drumMapBtn.textContent = coachState.drumMapPreset === '_gm' ? 'General MIDI' : coachState.drumMapPreset;
    }
    this.container.querySelector('#coach-drummap-hint').style.display = coachState.drumMapConfigured ? 'none' : 'block';

    this.container.style.display = 'block';
  }

  hide() {
    this.container.style.display = 'none';
  }

  save() {
    coachState.mode = this.container.querySelector('#coach-mode-select').value;
    coachState.reps = parseInt(this.container.querySelector('#coach-reps-input').value);
    coachState.countIn = this.container.querySelector('#coach-countin-check').checked;
    coachState.tolerance = this.container.querySelector('#coach-tolerance-select').value;
    coachState.calibrationOffset = parseInt(this.container.querySelector('#coach-latency-input').value) || 0;
    coachState.showDebugGrid = this.container.querySelector('#coach-debug-grid-check').checked;
    coachState.save();
  }
}
