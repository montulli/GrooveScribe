import { coachState } from '../state/CoachState.js';
import { DrumType } from '../engine/DrumConstants.js';

/**
 * FeedbackRenderer - Draws feedback circles on notation staff
 */
export class FeedbackRenderer {
    constructor(svgSelector) {
        this.svgSelector = svgSelector;
        this.svgElement = null;
        this.feedbackLayer = null;
        this.noteRects = new Map(); // Map abcIndex -> rect info
    }

    init() {
        const container = document.querySelector(this.svgSelector);
        if (!container) {
            console.warn(`[FeedbackRenderer] Container "${this.svgSelector}" not found`);
            return;
        }

        const svg = container.querySelector('svg');
        if (!svg) {
            console.warn('[FeedbackRenderer] SVG element not found in', this.svgSelector);
            return;
        }

        this.svgElement = svg;

        // Ensure SVG allows elements to go "full screen" outside its normal bounds
        this.svgElement.style.overflow = 'visible';

        // Create or find overlay layer
        let layer = this.svgElement.querySelector('#coach-feedback-layer');
        if (!layer) {
            layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            layer.setAttribute('id', 'coach-feedback-layer');
            this.svgElement.appendChild(layer);
        } else {
            // Ensure the layer is always at the end (front-most)
            this.svgElement.appendChild(layer);
        }
        this.feedbackLayer = layer;

        this.refreshNoteRects();
    }

    /**
     * Scan the SVG for the invisible rects and map them by their ABC index
     */
    refreshNoteRects() {
        if (!this.svgElement) {
            console.warn('[FeedbackRenderer] Cannot refresh: no svgElement');
            return;
        }

        this.noteRects.clear();

        // The IDs look like abcNoteNum_1_0, abcNoteNum_1_1, etc.
        const rects = this.svgElement.querySelectorAll('rect.abcr');

        rects.forEach(rect => {
            const id = rect.getAttribute('id');
            if (!id) return;

            const parts = id.split('_');
            const abcIndex = parseInt(parts[parts.length - 1]);

            if (isNaN(abcIndex)) return;

            this.noteRects.set(abcIndex, {
                element: rect
            });
        });

        if (coachState.showDebug) {
            this.renderDebugGrid();
        }
    }

    /**
     * Draw debug grid lines (red vertical for notes, green horizontal for staff)
     */
    renderDebugGrid() {
        if (!this.feedbackLayer || !this.svgElement) return;

        // Clear existing debug elements
        const existingDebug = this.feedbackLayer.querySelectorAll('.coach-debug-line');
        existingDebug.forEach(el => el.remove());

        const svg = this.svgElement;
        const layerCTM = this.feedbackLayer.getScreenCTM().inverse();

        // Much smaller text style with white halo
        const getTextStyle = (color, size = '6px') => `
            font-family: Arial, sans-serif; 
            font-size: ${size}; 
            font-weight: normal; 
            fill: ${color}; 
            stroke: white; 
            stroke-width: 1px; 
            paint-order: stroke;
            pointer-events: none;
        `;

        // 1. Draw Red Vertical Lines (Full Height)
        this.noteRects.forEach((info, index) => {
            const rect = info.element;
            const bbox = rect.getBBox();
            const rectCTM = rect.getScreenCTM();

            const ptMid = svg.createSVGPoint();
            ptMid.x = bbox.x + (bbox.width / 2);
            ptMid.y = bbox.y;

            const finalMid = ptMid.matrixTransform(rectCTM).matrixTransform(layerCTM);

            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('x1', finalMid.x);
            vLine.setAttribute('y1', -10000);
            vLine.setAttribute('x2', finalMid.x);
            vLine.setAttribute('y2', 10000);
            vLine.setAttribute('stroke', 'red');
            vLine.setAttribute('stroke-width', '0.5');
            vLine.setAttribute('class', 'coach-debug-line');
            vLine.setAttribute('pointer-events', 'none');
            vLine.setAttribute('opacity', '0.35');
            this.feedbackLayer.appendChild(vLine);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', finalMid.x);
            label.setAttribute('y', finalMid.y - 20); // Move much higher
            label.setAttribute('style', getTextStyle('red'));
            label.setAttribute('class', 'coach-debug-line');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = index;
            this.feedbackLayer.appendChild(label);
        });

        // 2. Draw Green Horizontal Lines (Full Width)
        const systems = [];
        this.noteRects.forEach((info) => {
            const rect = info.element;
            const bbox = rect.getBBox();
            const rectCTM = rect.getScreenCTM();
            const pt = svg.createSVGPoint();
            pt.x = bbox.x;
            pt.y = bbox.y;
            const finalY = pt.matrixTransform(rectCTM).matrixTransform(layerCTM).y;

            let found = false;
            for (const s of systems) {
                if (Math.abs(s.y - finalY) < 50) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                systems.push({ y: finalY, rect: rect, ctm: rectCTM });
            }
        });

        const staffPositions = [
            { name: 'HH', ratio: 0.11 },     // Above top line
            { name: 'Crash', ratio: -0.03 }, // Ledger above
            { name: DrumType.TOM1, ratio: 0.25 },   // Space 4
            { name: DrumType.SNARE, ratio: 0.428 }, // Space 3
            { name: DrumType.TOM4, ratio: 0.70 },   // Space 1 / Floor Tom
            { name: DrumType.KICK, ratio: 0.714 },  // Space 1
            { name: 'HH Foot', ratio: 0.95 } // Below staff
        ];

        systems.forEach(system => {
            const bbox = system.rect.getBBox();
            staffPositions.forEach(pos => {
                const pt = svg.createSVGPoint();
                pt.x = 0;
                pt.y = bbox.y + (bbox.height * pos.ratio);

                const finalPos = pt.matrixTransform(system.ctm).matrixTransform(layerCTM);

                const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hLine.setAttribute('x1', -10000);
                hLine.setAttribute('y1', finalPos.y);
                hLine.setAttribute('x2', 20000);
                hLine.setAttribute('y2', finalPos.y);
                hLine.setAttribute('stroke', 'green');
                hLine.setAttribute('stroke-width', '0.5');
                hLine.setAttribute('class', 'coach-debug-line');
                hLine.setAttribute('pointer-events', 'none');
                hLine.setAttribute('opacity', '0.3');
                this.feedbackLayer.appendChild(hLine);

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', -10); // Move a bit more to the right (closer to the staff)
                label.setAttribute('y', finalPos.y + 3);
                label.setAttribute('style', getTextStyle('green', '4px')); // Even smaller green labels (4px)
                label.setAttribute('class', 'coach-debug-line');
                label.setAttribute('text-anchor', 'end'); // Anchor at end so they align cleanly
                label.textContent = pos.name;
                this.feedbackLayer.appendChild(label);
            });
        });
    }

    /**
     * Draw hit feedback circle
     */
    drawHitFeedback(abcNoteIndex, tier, timingError, drumType) {
        if (!this.feedbackLayer || !this.svgElement || !this.svgElement.isConnected) {
            this.init();
        }

        if (!this.feedbackLayer) return;

        let targetInfo = this.noteRects.get(abcNoteIndex);
        if (!targetInfo || !targetInfo.element || !targetInfo.element.isConnected) {
            this.refreshNoteRects();
            targetInfo = this.noteRects.get(abcNoteIndex);
        }

        if (!targetInfo || !targetInfo.element) return;

        const rect = targetInfo.element;

        const verticalOffsets = {
            [DrumType.HH_NORMAL]: 0.11, [DrumType.HH_OPEN]: 0.11, [DrumType.HH_ACCENT]: 0.11, [DrumType.HH_FOOT]: 0.95,
            [DrumType.HH_CLOSE]: 0.11,
            [DrumType.CRASH]: -0.03, [DrumType.RIDE]: 0.05, [DrumType.RIDE_BELL]: 0.05, [DrumType.COWBELL]: 0.05, [DrumType.STACKER]: 0.05,
            [DrumType.SNARE]: 0.428, [DrumType.SNARE_GHOST]: 0.428, [DrumType.SNARE_XSTICK]: 0.428, [DrumType.SNARE_FLAM]: 0.428,
            [DrumType.SNARE_DRAG]: 0.428, [DrumType.SNARE_BUZZ]: 0.428, [DrumType.SNARE_ACCENT]: 0.428,
            [DrumType.FLAM_GRACE]: 0.428, [DrumType.KICK]: 0.714,
            [DrumType.TOM1]: 0.25, [DrumType.TOM4]: 0.70
        };
        const vOffsetFactor = verticalOffsets[drumType] !== undefined ? verticalOffsets[drumType] : 0.5;

        try {
            const bbox = rect.getBBox();
            const svg = this.svgElement;
            const pt = svg.createSVGPoint();

            const smartY = this._findSmartVerticalCenter(rect, drumType, vOffsetFactor);
            const isGraceNote = (drumType === DrumType.FLAM_GRACE);
            const noteHeadX = this._findNoteHeadX(rect, smartY, isGraceNote);

            let centerX = noteHeadX !== null ? noteHeadX : (bbox.x + (bbox.width / 2));

            pt.x = centerX;
            pt.y = smartY;

            const rectCTM = rect.getScreenCTM();
            const layerCTM = this.feedbackLayer.getScreenCTM().inverse();
            const finalPt = pt.matrixTransform(rectCTM).matrixTransform(layerCTM);

            const colors = {
                perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#95a5a6', miss: '#FF4500'
            };

            const color = colors[tier] || colors.extra;
            const pixelsPerMs = 0.15;
            const maxOffset = 15;

            let xOffset = timingError * pixelsPerMs;
            if (tier === 'perfect' && Math.abs(timingError) <= 8) xOffset = 0;
            xOffset = Math.max(-maxOffset, Math.min(maxOffset, xOffset));

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', finalPt.x + xOffset);
            circle.setAttribute('cy', finalPt.y);
            circle.setAttribute('r', 4.5);
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', 'white');
            circle.setAttribute('stroke-width', '1.5');
            circle.setAttribute('opacity', '0.7');
            circle.setAttribute('style', 'pointer-events: none;');
            circle.setAttribute('class', 'coach-hit-marker');
            circle.setAttribute('data-abc-index', abcNoteIndex);
            circle.setAttribute('data-instrument', drumType);

            const existing = this.feedbackLayer.querySelector(
                `.coach-hit-marker[data-abc-index="${abcNoteIndex}"][data-instrument="${drumType}"]`
            );
            if (existing) this.feedbackLayer.removeChild(existing);

            this.feedbackLayer.appendChild(circle);

            circle.animate([
                { transform: 'scale(0.3)', opacity: 0 },
                { transform: 'scale(1.2)', opacity: 0.8 },
                { transform: 'scale(1)', opacity: 0.6 }
            ], { duration: 200, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
        } catch (e) {
            console.warn('[FeedbackRenderer] Coordinate transform failed', e);
        }
    }

    _findSmartVerticalCenter(rect, drumType, fallbackRatio) {
        const rectBbox = rect.getBBox();
        const targetY = rectBbox.y + (rectBbox.height * fallbackRatio);
        const elements = this.svgElement.querySelectorAll('path, use');
        let bestCandidate = null;
        let minOffset = Infinity;

        for (const el of elements) {
            if (el.classList.contains('abcr') || el.classList.contains('coach-hit-marker') || el.classList.contains('coach-debug-line')) continue;
            const bbox = el.getBBox();
            const centerX = bbox.x + (bbox.width / 2);
            if (centerX >= rectBbox.x && centerX <= rectBbox.x + rectBbox.width) {
                if (bbox.height > 15 || bbox.width > 20 || bbox.height < 4) continue;
                const centerY = bbox.y + (bbox.height / 2);
                const offset = Math.abs(centerY - targetY);
                if (offset < minOffset) {
                    minOffset = offset;
                    bestCandidate = centerY;
                }
            }
        }
        return (bestCandidate !== null && minOffset < 20) ? bestCandidate : targetY;
    }

    _findNoteHeadX(rect, targetY, isGraceNote = false) {
        const rectBbox = rect.getBBox();
        const elements = this.svgElement.querySelectorAll('path, use');
        let leftmostX = null;
        let leftmostCenterX = null;
        let closestToTargetX = null;
        let minYOffset = Infinity;
        let candidates = [];

        for (const el of elements) {
            if (el.classList.contains('abcr') || el.classList.contains('coach-hit-marker') || el.classList.contains('coach-debug-line')) continue;
            const bbox = el.getBBox();
            const centerX = bbox.x + (bbox.width / 2);
            const centerY = bbox.y + (bbox.height / 2);
            if (centerX >= rectBbox.x && centerX <= rectBbox.x + rectBbox.width) {
                if (bbox.height > 15 || bbox.width > 20 || bbox.height < 4) continue;
                if (centerY < rectBbox.y || centerY > rectBbox.y + rectBbox.height) continue;
                candidates.push({ x: bbox.x, centerX, centerY, width: bbox.width, height: bbox.height });
                const yOffset = Math.abs(centerY - targetY);
                if (yOffset < 10 && (leftmostX === null || bbox.x < leftmostX)) {
                    leftmostX = bbox.x;
                    leftmostCenterX = { x: bbox.x, width: bbox.width };
                }
                if (yOffset < minYOffset) {
                    minYOffset = yOffset;
                    closestToTargetX = centerX;
                }
            }
        }
        if (isGraceNote && leftmostCenterX !== null) {
            const offset = candidates.length === 1 ? 3 : -5;
            return leftmostCenterX.x + offset;
        }
        return closestToTargetX;
    }

    clearFeedback() {
        if (this.feedbackLayer) {
            const markers = this.feedbackLayer.querySelectorAll('.coach-hit-marker');
            markers.forEach(m => m.remove());
        }
    }
}
