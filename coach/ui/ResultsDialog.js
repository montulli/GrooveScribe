/**
 * ResultsDialog - Shows session results after performance mode
 */
export class ResultsDialog {
    constructor() {
        this.container = null;
    }

    inject() {
        if (document.getElementById('coachResultsDialog')) return;

        const dialog = document.createElement('div');
        dialog.id = 'coachResultsDialog';
        dialog.innerHTML = `
      <h2>Session Complete!</h2>
      
      <div class="coach-results-grid">
        <div class="coach-result-tile perfect">
          <div class="coach-result-value" id="result-perfect">0</div>
          <div class="coach-result-label">Perfect</div>
        </div>
        <div class="coach-result-tile good">
          <div class="coach-result-value" id="result-good">0</div>
          <div class="coach-result-label">Good</div>
        </div>
        <div class="coach-result-tile close">
          <div class="coach-result-value" id="result-close">0</div>
          <div class="coach-result-label">Close</div>
        </div>
        <div class="coach-result-tile miss">
          <div class="coach-result-value" id="result-miss">0</div>
          <div class="coach-result-label">Miss</div>
        </div>
      </div>
      
      <div class="coach-results-summary">
        <div class="coach-score-row">
          <span>Total Notes:</span>
          <span id="result-total">0</span>
        </div>
        <div class="coach-score-row">
          <span>Accuracy:</span>
          <span id="result-accuracy">0%</span>
        </div>
        <div class="coach-score-row coach-score-final">
          <span>Score:</span>
          <span id="result-score">0</span>
        </div>
      </div>
      
      <div class="coach-dialog-buttons">
        <button class="coach-btn coach-btn-secondary" id="results-close-btn">Close</button>
        <button class="coach-btn coach-btn-primary" id="results-retry-btn">Play Again</button>
      </div>
    `;

        document.body.appendChild(dialog);
        this.container = dialog;
        this._setupEventListeners();
    }

    _setupEventListeners() {
        const closeBtn = this.container.querySelector('#results-close-btn');
        const retryBtn = this.container.querySelector('#results-retry-btn');

        closeBtn.addEventListener('click', () => this.hide());
        retryBtn.addEventListener('click', () => {
            this.hide();
            window.dispatchEvent(new CustomEvent('coach-start-requested'));
        });
    }

    /**
     * Show the results dialog with stats
     * @param {Object} stats - { perfect, good, close, miss, extra, totalNotes }
     */
    show(stats) {
        // Update values
        this.container.querySelector('#result-perfect').textContent = stats.perfect;
        this.container.querySelector('#result-good').textContent = stats.good;
        this.container.querySelector('#result-close').textContent = stats.close;
        this.container.querySelector('#result-miss').textContent = stats.miss;
        this.container.querySelector('#result-total').textContent = stats.totalNotes;

        // Calculate accuracy (perfect + good + close) / totalNotes
        const hitCount = stats.perfect + stats.good + stats.close;
        const accuracy = stats.totalNotes > 0 ? Math.round((hitCount / stats.totalNotes) * 100) : 0;
        this.container.querySelector('#result-accuracy').textContent = `${accuracy}%`;

        // Calculate score (weighted)
        // Perfect = 100pts, Good = 75pts, Close = 50pts, Miss = 0pts
        const score = (stats.perfect * 100) + (stats.good * 75) + (stats.close * 50);
        this.container.querySelector('#result-score').textContent = score;

        this.container.style.display = 'block';
    }

    hide() {
        this.container.style.display = 'none';
    }
}
