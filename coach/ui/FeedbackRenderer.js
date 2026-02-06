import { coachState } from '../state/CoachState.js';
import { DrumType } from '../engine/DrumConstants.js';



/**
 * FeedbackRenderer - Draws feedback circles on notation staff 
 * using coordinates extracted by NotationSniffer.
 */
export class FeedbackRenderer {
    constructor(svgSelector) {
        this.svgSelector = svgSelector;
        this.svgElement = null;
        this.feedbackLayer = null;

        this.grooveContext = null;
        this.timeline = []; // Complete rendering timeline { timeMs, x, y, type, isGrace, abcIndex }
        this.measureBoundaries = []; // { timeMs, x, measureIndex }
        this.sniffedData = null;
    }

    init() {
        this.ensureLayer();
    }

    /**
     * Ensures the feedback layer exists and is attached to the current SVG.
     * Must be called before any drawing operation as the SVG may have been re-rendered.
     */
    ensureLayer() {
        const container = document.querySelector(this.svgSelector);
        if (!container) return false;

        const svg = container.querySelector('svg');
        if (!svg) return false;

        this.svgElement = svg;
        this.svgElement.style.overflow = 'visible';

        let layer = this.svgElement.querySelector('#coach-feedback-layer');
        if (!layer) {
            layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            layer.setAttribute('id', 'coach-feedback-layer');
            this.svgElement.appendChild(layer);
            console.log('[FeedbackRenderer] Created new coach-feedback-layer in SVG');
        }
        this.feedbackLayer = layer;
        return true;
    }

    /**
     * Clear all feedback markers
     */
    clearFeedback() {
        if (this.feedbackLayer) {
            this.feedbackLayer.querySelectorAll('.coach-hit-marker').forEach(el => el.remove());
        }
    }

    /**
     * Set context and build coordinate timeline from sniffed data
     */
    setGrooveContext(context, timeline, sniffedData = null) {
        this.grooveContext = context;
        this.sniffedData = sniffedData;
        this.timeline = [];

        if (!this.ensureLayer()) return;

        // 0. Auto-Calibration for X Scaling (True Scale)
        // Calculate factor based on the ratio between ViewBox and the actual sniffer space
        if (this.sniffedData && this.sniffedData.scale) {
            this.scaleFactor = this.sniffedData.scale;
            console.log(`[FeedbackRenderer] Using Sniffed Scale Factor: ${this.scaleFactor}`);
        }

        const bpm = context.bpm || 80;
        const numBeats = context.numBeats || 4;
        const measures = context.measures || 1;

        const measureDurationMs = (60000 / bpm) * numBeats;
        this.grooveContext.totalDurationMs = measureDurationMs * measures;

        // 1. Build Measure Boundaries from Sniffer Bars
        this.measureBoundaries = [];
        for (let m = 0; m <= measures; m++) {
            this.measureBoundaries.push({
                timeMs: m * measureDurationMs,
                measureIndex: m,
                x: null
            });
        }
        this._calculateMeasureBoundaryPositions(sniffedData);

        // 2. Build High-Precision Timeline from Sniffer Notes
        if (sniffedData && sniffedData.notes && timeline && timeline.length > 0) {
            for (const note of timeline) {
                const sniffed = sniffedData.notes.find(n =>
                    n.abcIndex === note.abcIndex &&
                    n.isGrace === !!note.isGrace
                );

                if (sniffed) {
                    this.timeline.push({
                        timeMs: note.time,
                        tickIndex: note.tickIndex,
                        type: note.isGrace ? DrumType.FLAM_GRACE : note.type,
                        abcIndex: note.abcIndex,
                        x: sniffed.x,
                        y: sniffed.y, // Final Y from sniffer
                        isGrace: !!note.isGrace
                    });
                }
            }
            this.timeline.sort((a, b) => a.timeMs - b.timeMs);
        } else if (timeline && timeline.length > 0) {
            console.warn('[FeedbackRenderer] Missing sniffedData. Hit feedback disabled.');
        }

        if (coachState.showDebug) {
            this.renderDebugGrid();
        }
    }

    /**
     * Calculate boundary X positions strictly from sniffed data
     */
    _calculateMeasureBoundaryPositions(sniffedData) {
        if (!sniffedData || !sniffedData.bars) return;

        const sniffedBars = [...sniffedData.bars].sort((a, b) => a.x - b.x);
        const firstNoteX = this.timeline.length > 0 ? this.timeline[0].x : 50;

        for (const boundary of this.measureBoundaries) {
            if (boundary.measureIndex === 0) {
                boundary.x = firstNoteX - 25;
            } else {
                const bar = sniffedBars[boundary.measureIndex - 1];
                if (bar) {
                    boundary.x = bar.x;
                }
            }
        }
    }

    /**
     * Draw feedback for a hit
     */
    drawHitFeedbackByTime(hitTimeMs, tier, timingError, drumType, abcNoteIndex = null) {
        if (!this.feedbackLayer || !this.timeline) return;

        const isGrace = (drumType === DrumType.FLAM_GRACE);
        const note = this.timeline.find(n =>
            Math.abs(n.timeMs - hitTimeMs) < 15 &&
            n.isGrace === isGrace &&
            (abcNoteIndex === null || n.abcIndex === abcNoteIndex)
        );

        if (!note) {
            if (tier === 'extra') {
                this._drawExtraHit(hitTimeMs, drumType);
            }
            return;
        }

        // Timing-based visual offset
        const pixelsPerMs = 0.15;
        const clampLimit = { perfect: 3, good: 8, close: 12, extra: 50 }[tier] || 0;
        let xOffset = timingError * pixelsPerMs;
        if (tier !== 'extra') {
            xOffset = Math.max(-clampLimit, Math.min(clampLimit, xOffset));
            if (tier === 'perfect' && Math.abs(timingError) < 8) xOffset = 0;
        }

        this._drawCircle(note.x + xOffset, note.y, tier);
    }

    _drawExtraHit(hitTimeMs, drumType) {
        const x = this._interpolateX(hitTimeMs);
        if (x === null) return;
        const y = this._guessYForDrum(drumType);
        this._drawCircle(x, y, 'extra');
    }

    _interpolateX(hitTimeMs) {
        if (!this.grooveContext) return null;
        let left = null, right = null;
        for (const b of this.measureBoundaries) {
            if (b.x === null) continue;
            if (b.timeMs <= hitTimeMs) left = b;
            else if (b.timeMs > hitTimeMs && !right) { right = b; break; }
        }
        if (!left || !right) return null;
        const ratio = (hitTimeMs - left.timeMs) / (right.timeMs - left.timeMs);
        return left.x + ratio * (right.x - left.x);
    }

    _guessYForDrum(drumType) {
        if (!this.sniffedData || this.sniffedData.staffY === undefined) return 100;
        const staffY = this.sniffedData.staffY;
        const step = this.sniffedData.step || 4.5; // Fallback to standard 6pt * 0.75 scale

        // Map legacy loop indices (start -4) to relative steps from Top Line (0)
        // Old Index 4 = Staff Top = 0. Relative = Index - 4.
        const legacyOffsets = {
            [DrumType.KICK]: 12, [DrumType.SNARE]: 8, [DrumType.SNARE_FLAM]: 8, [DrumType.FLAM_GRACE]: 8,
            [DrumType.HH_CLOSED]: 4, [DrumType.HH_OPEN]: 4, [DrumType.HH_FOOT]: 14,
            [DrumType.TOM_HIGH]: 6, [DrumType.TOM_LOW]: 10, [DrumType.CRASH]: 2, [DrumType.RIDE]: 3
        };
        const levelIdx = legacyOffsets[drumType] !== undefined ? legacyOffsets[drumType] : 8;
        const relativeStep = levelIdx - 4;

        return staffY + (relativeStep * step);
    }

    _drawCircle(x, y, tier) {
        const colors = { perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888' };
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', tier === 'extra' ? '4' : '6');
        circle.setAttribute('fill', colors[tier] || colors.extra);
        circle.setAttribute('fill-opacity', '0.7');
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('style', 'pointer-events: none;');
        circle.classList.add('coach-hit-marker');

        if (this.feedbackLayer) this.feedbackLayer.appendChild(circle);

        circle.animate([{ scale: 0.5, opacity: 0 }, { scale: 1, opacity: 0.7 }], { duration: 150 });
        setTimeout(() => {
            circle.style.transition = 'opacity 0.6s ease-out';
            circle.style.opacity = '0';
            setTimeout(() => circle.remove(), 600);
        }, 2000);
    }

    renderDebugGrid() {
        if (!this.feedbackLayer) return;

        this.feedbackLayer.querySelectorAll('.coach-debug-line').forEach(el => el.remove());

        // Measure boundaries (Blue)
        this.measureBoundaries.forEach((b) => {
            if (b.x === null) return;
            const line = this._createDebugLine(b.x, 'blue', '1.0');
            line.setAttribute('stroke-dasharray', '4,4');
            line.setAttribute('stroke-width', '0.25');
            this.feedbackLayer.appendChild(line);

            // Measure Label
            this._addDebugText(b.x, 10, `M${b.measureIndex}`, 'blue', '10px');
        });

        // Notes from timeline (Red dots/lines)
        this.timeline.forEach((n) => {
            if (n.x === null) return;
            // Brighter colors: Magenta for grace, Red (no transparency) for notes
            const color = n.isGrace ? '#FF00FF' : '#FF0000';
            const line = this._createDebugLine(n.x, color, '1.0');
            line.setAttribute('stroke-width', '0.25');
            this.feedbackLayer.appendChild(line);

            // Note Index Label (Higher up, removed prefix)
            this._addDebugText(n.x, 10, `${n.abcIndex}`, n.isGrace ? 'purple' : 'red', '10px');
        });

        // Horizontal lines (Green)
        if (this.sniffedData) {
            const staffY = this.sniffedData.staffY || 0;
            const step = this.sniffedData.step || 4.5; // Fallback default
            // Draw 4 lines above (-4 to -1) and 4 below (5 to 8) plus staff (0 to 4)
            for (let i = -4; i <= 8; i++) {
                const y = staffY + (i * step);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', 0); line.setAttribute('y1', y);
                line.setAttribute('x2', 2000); line.setAttribute('y2', y);

                // Staff Top (0) and Bottom (4) are Orange
                const isStaffEdge = (i === 0 || i === 4);
                line.setAttribute('stroke', isStaffEdge ? 'orange' : 'green');
                line.setAttribute('stroke-width', '0.25');
                line.setAttribute('opacity', '1.0');
                line.classList.add('coach-debug-line');
                this.feedbackLayer.appendChild(line);

                // Staff Line Label (Only for staff lines)
                if (i >= 0 && i <= 4) {
                    this._addDebugText(-5, y + 2, `${i}`, isStaffEdge ? 'orange' : 'green', '6px');
                }
            }
        }
    }

    _addDebugText(x, y, str, color, fontSize = '10px') {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('fill', color);
        text.setAttribute('font-size', fontSize);
        text.style.fontFamily = 'monospace';
        text.style.fontWeight = 'bold';
        text.style.textAnchor = 'middle';
        text.textContent = str;
        text.classList.add('coach-debug-line');
        this.feedbackLayer.appendChild(text);
    }

    _createDebugLine(x, color, opacity) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('y1', -1000);
        line.setAttribute('x2', x); line.setAttribute('y2', 1000);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', '0.5');
        line.setAttribute('opacity', opacity);
        line.classList.add('coach-debug-line');
        return line;
    }
}
