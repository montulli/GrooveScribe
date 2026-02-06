import { coachState } from '../state/CoachState.js';
import { DrumType } from '../engine/DrumConstants.js';

/**
 * FeedbackRenderer - Draws feedback circles on notation staff
 * 
 * New X-coordinate algorithm:
 * 1. Find surrounding notes (left and right) for the hit time
 *    - Grace notes are ignored; for flams, only the main note counts
 *    - If no left note, use the previous measure boundary (or score start)
 *    - If no right note, use the next measure boundary (or score end)
 * 2. Interpolate X based on where hit time falls between these boundaries
 * 
 * Y-coordinate only depends on drum type, not on closest target note.
 * 
 * Tiers: perfect (blue), good (green), close (yellow), extra (gray)
 * Clamping: blue/green/yellow have clamping limits; gray has no clamping
 */
export class FeedbackRenderer {
    constructor(svgSelector) {
        this.svgSelector = svgSelector;
        this.svgElement = null;
        this.feedbackLayer = null;
        this.noteRects = new Map(); // Map abcIndex -> rect info

        // Groove context for time-based interpolation
        this.grooveContext = null; // { bpm, measures, notesPerMeasure, totalDurationMs, msPerTick }
        this.timeline = []; // Timeline of notes with times and X positions
        this.measureBoundaries = []; // Array of { timeMs, x } for measure boundaries
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
     * Set the groove context for time-based X interpolation
     * @param {Object} context - { bpm, measures, notesPerMeasure, numBeats }
     * @param {Array} timeline - Array of { time, tickIndex, type, abcIndex, isGrace }
     */
    setGrooveContext(context, timeline) {
        this.grooveContext = context;

        // Filter timeline to only include main notes (not grace notes)
        // and augment with X positions from noteRects
        this.timeline = [];

        const bpm = context.bpm || 80;
        const numBeats = context.numBeats || 4;
        const measures = context.measures || 1;
        const notesPerMeasure = context.notesPerMeasure || 16;
        const totalDurationMs = (60000 / bpm) * numBeats * measures;
        const msPerTick = totalDurationMs / (notesPerMeasure * measures);

        this.grooveContext.totalDurationMs = totalDurationMs;
        this.grooveContext.msPerTick = msPerTick;

        // Build measure boundaries (X positions calculated after timeline is built)
        this.measureBoundaries = [];
        const measureDurationMs = (60000 / bpm) * numBeats;

        for (let m = 0; m <= measures; m++) {
            this.measureBoundaries.push({
                timeMs: m * measureDurationMs,
                measureIndex: m
            });
        }

        // Build timeline with X positions (including grace notes with corrected positions)
        if (timeline && timeline.length > 0) {
            // First pass: build main notes and find flam main note positions
            const flamMainPositions = new Map(); // tickIndex -> x position of main note

            for (const note of timeline) {
                if (note.isGrace) continue; // Skip grace notes in first pass

                const rectInfo = this.noteRects.get(note.abcIndex);
                if (rectInfo && rectInfo.element) {
                    let x;

                    // For flam main notes, find the actual note head position (not rect center)
                    if (note.type === 'snare_flam') {
                        const vOffsetFactor = 0.428; // snare vertical offset
                        const smartY = this._findSmartVerticalCenter(rectInfo.element, DrumType.SNARE_FLAM, vOffsetFactor);
                        const noteHeadX = this._findNoteHeadX(rectInfo.element, smartY, false);
                        if (noteHeadX !== null) {
                            // Transform to layer coordinates
                            const svg = this.svgElement;
                            const pt = svg.createSVGPoint();
                            pt.x = noteHeadX;
                            pt.y = 0;
                            const rectCTM = rectInfo.element.getScreenCTM();
                            const layerCTM = this.feedbackLayer.getScreenCTM().inverse();
                            x = pt.matrixTransform(rectCTM).matrixTransform(layerCTM).x;
                        } else {
                            x = this._getRectCenterX(rectInfo.element);
                        }
                        // Store for grace note offset calculation
                        flamMainPositions.set(note.tickIndex, x);
                    } else {
                        x = this._getRectCenterX(rectInfo.element);
                    }

                    this.timeline.push({
                        timeMs: note.time,
                        tickIndex: note.tickIndex,
                        type: note.type,
                        abcIndex: note.abcIndex,
                        x: x,
                        isGrace: false
                    });
                }
            }

            // Second pass: add grace notes with offset from their main note
            for (const note of timeline) {
                if (!note.isGrace) continue;

                // Find the main note's position (grace note has same tick as main note)
                const mainX = flamMainPositions.get(note.tickIndex);
                if (mainX !== undefined) {
                    // Grace note is offset to the left of main note
                    const graceX = mainX - 8; // 8px offset for grace note

                    this.timeline.push({
                        timeMs: note.time,
                        tickIndex: note.tickIndex,
                        type: 'flam_grace',
                        abcIndex: note.abcIndex,
                        x: graceX,
                        isGrace: true
                    });
                }
            }

            // Sort by time
            this.timeline.sort((a, b) => a.timeMs - b.timeMs);
        }

        // Calculate X positions for measure boundaries using timeline note positions
        this._calculateMeasureBoundaryPositions();

        console.log(`[FeedbackRenderer] Groove context set: ${measures} measures, ${this.timeline.length} notes, ${this.measureBoundaries.length} boundaries`);

        // Re-render debug grid to show measure boundaries
        if (coachState.showDebug) {
            this.renderDebugGrid();
        }
    }

    /**
     * Calculate X positions for measure boundaries based on SVG barlines
     */
    _calculateMeasureBoundaryPositions() {
        if (!this.svgElement || !this.grooveContext) return;

        // First try to find barlines in the SVG
        // abc2svg uses class 'bW' for barlines, or we can look for vertical lines
        const barlinePositions = this._findBarlinePositions();

        // Find leftmost and rightmost note X positions from timeline
        let minX = Infinity;
        let maxX = -Infinity;

        // Use timeline note positions if available (excluding grace notes for bounds)
        if (this.timeline && this.timeline.length > 0) {
            for (const note of this.timeline) {
                if (note.isGrace) continue;
                minX = Math.min(minX, note.x);
                maxX = Math.max(maxX, note.x);
            }
        } else {
            this.noteRects.forEach((info) => {
                if (info.element) {
                    const x = this._getRectCenterX(info.element);
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                }
            });
        }

        if (minX === Infinity || maxX === -Infinity) {
            const svgBbox = this.svgElement.getBBox();
            minX = svgBbox.x + svgBbox.width * 0.1;
            maxX = svgBbox.x + svgBbox.width * 0.9;
        }

        const padding = (maxX - minX) * 0.05;
        const scoreStartX = minX - padding;
        const scoreEndX = maxX + padding;
        const totalDuration = this.grooveContext.totalDurationMs;

        for (const boundary of this.measureBoundaries) {
            if (boundary.measureIndex === 0) {
                boundary.x = scoreStartX;
            } else if (boundary.timeMs >= totalDuration) {
                boundary.x = scoreEndX;
            } else {
                // Try to use actual barline position from SVG
                if (barlinePositions.length > 0 && boundary.measureIndex <= barlinePositions.length) {
                    boundary.x = barlinePositions[boundary.measureIndex - 1];
                } else {
                    // Fallback to linear interpolation
                    const ratio = boundary.timeMs / totalDuration;
                    boundary.x = scoreStartX + ratio * (scoreEndX - scoreStartX);
                }
            }
        }
    }

    /**
     * Find barline X positions in the SVG
     */
    _findBarlinePositions() {
        if (!this.svgElement || !this.feedbackLayer) return [];

        const positions = [];
        const svg = this.svgElement;
        const layerCTM = this.feedbackLayer.getScreenCTM().inverse();

        // Look for barline paths in abc2svg output
        // abc2svg marks barlines with class="stroke"
        const paths = svg.querySelectorAll('path.stroke');
        for (const path of paths) {
            const d = path.getAttribute('d');
            if (!d) continue;

            // Parse the path to get X coordinate: "M x y v height"
            const match = d.match(/^M\s*([\d.]+)\s+([\d.]+)/);
            if (match) {
                const pathCTM = path.getScreenCTM();
                if (pathCTM) {
                    const pt = svg.createSVGPoint();
                    pt.x = parseFloat(match[1]);
                    pt.y = parseFloat(match[2]);
                    const transformed = pt.matrixTransform(pathCTM).matrixTransform(layerCTM);
                    positions.push(transformed.x);
                }
            }
        }

        // Sort and deduplicate
        positions.sort((a, b) => a - b);
        const unique = [];
        for (const pos of positions) {
            if (unique.length === 0 || Math.abs(pos - unique[unique.length - 1]) > 5) {
                unique.push(pos);
            }
        }

        console.log(`[FeedbackRenderer] Found ${unique.length} barlines (class=stroke) at positions:`, unique);

        // abc2svg strokes are: [intermediate barlines..., end barline]
        // No start barline in the strokes. For 2 measures: [M1, end]
        // Return all except the last one (end barline) - those are the intermediate measure boundaries
        if (unique.length >= 2) {
            return unique.slice(0, -1);
        }
        return [];
    }

    /**
     * Get the center X of a rect element in layer coordinates
     */
    _getRectCenterX(rect) {
        const bbox = rect.getBBox();
        const svg = this.svgElement;
        const pt = svg.createSVGPoint();
        pt.x = bbox.x + (bbox.width / 2);
        pt.y = bbox.y;

        const rectCTM = rect.getScreenCTM();
        const layerCTM = this.feedbackLayer.getScreenCTM().inverse();
        return pt.matrixTransform(rectCTM).matrixTransform(layerCTM).x;
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
            { name: DrumType.TOM_HIGH, ratio: 0.25 },   // Space 4
            { name: DrumType.SNARE, ratio: 0.428 }, // Space 3
            { name: DrumType.TOM_LOW, ratio: 0.70 },   // Space 1 / Floor Tom
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

        // 3. Draw Blue Vertical Lines for Measure Boundaries
        if (this.measureBoundaries && this.measureBoundaries.length > 0) {
            this.measureBoundaries.forEach((boundary, idx) => {
                const x = boundary.x;
                if (x === undefined || x === null) return;

                const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                vLine.setAttribute('x1', x);
                vLine.setAttribute('y1', -10000);
                vLine.setAttribute('x2', x);
                vLine.setAttribute('y2', 10000);
                vLine.setAttribute('stroke', 'blue');
                vLine.setAttribute('stroke-width', '1');
                vLine.setAttribute('class', 'coach-debug-line');
                vLine.setAttribute('pointer-events', 'none');
                vLine.setAttribute('opacity', '0.5');
                vLine.setAttribute('stroke-dasharray', '4,4');
                this.feedbackLayer.appendChild(vLine);

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', x + 2);
                label.setAttribute('y', 20);
                label.setAttribute('style', getTextStyle('blue', '6px'));
                label.setAttribute('class', 'coach-debug-line');
                label.textContent = `M${idx}`;
                this.feedbackLayer.appendChild(label);
            });
        }

        // 4. Draw Timeline Note Positions (including grace notes and flam main notes)
        if (this.timeline && this.timeline.length > 0) {
            this.timeline.forEach((note) => {
                const x = note.x;
                if (x === undefined || x === null) return;

                // Different colors for different note types
                let color = '#888'; // default gray
                let label = '';
                if (note.isGrace) {
                    color = 'purple';
                    label = 'G';
                } else if (note.type === 'snare_flam') {
                    color = 'orange';
                    label = 'F';
                }

                // Only draw markers for special notes (flam/grace)
                if (!note.isGrace && note.type !== 'snare_flam') return;

                // Draw a small vertical tick mark
                const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                vLine.setAttribute('x1', x);
                vLine.setAttribute('y1', 25);
                vLine.setAttribute('x2', x);
                vLine.setAttribute('y2', 35);
                vLine.setAttribute('stroke', color);
                vLine.setAttribute('stroke-width', '2');
                vLine.setAttribute('class', 'coach-debug-line');
                vLine.setAttribute('pointer-events', 'none');
                this.feedbackLayer.appendChild(vLine);

                // Label
                const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                textLabel.setAttribute('x', x);
                textLabel.setAttribute('y', 42);
                textLabel.setAttribute('style', getTextStyle(color, '5px'));
                textLabel.setAttribute('class', 'coach-debug-line');
                textLabel.setAttribute('text-anchor', 'middle');
                textLabel.textContent = label;
                this.feedbackLayer.appendChild(textLabel);
            });
        }
    }

    /**
     * Calculate X position for a hit based on time interpolation
     * Uses surrounding notes or measure boundaries
     * @param {number} hitTimeMs - Time of the hit in ms from session start
     * @returns {number} X coordinate in layer space
     */
    _calculateXForHitTime(hitTimeMs) {
        if (!this.grooveContext) {
            console.warn('[FeedbackRenderer] No groove context for X calculation');
            return null;
        }

        // Find left and right elements (notes or boundaries)
        let leftElement = null;  // { timeMs, x }
        let rightElement = null; // { timeMs, x }

        // Search notes first
        for (const note of this.timeline) {
            if (note.timeMs <= hitTimeMs) {
                leftElement = { timeMs: note.timeMs, x: note.x };
            } else if (note.timeMs > hitTimeMs && !rightElement) {
                rightElement = { timeMs: note.timeMs, x: note.x };
                break;
            }
        }

        // If no left note, use previous measure boundary
        if (!leftElement) {
            for (let i = this.measureBoundaries.length - 1; i >= 0; i--) {
                if (this.measureBoundaries[i].timeMs <= hitTimeMs) {
                    leftElement = {
                        timeMs: this.measureBoundaries[i].timeMs,
                        x: this.measureBoundaries[i].x
                    };
                    break;
                }
            }
        }

        // If no right note, use next measure boundary
        if (!rightElement) {
            for (const boundary of this.measureBoundaries) {
                if (boundary.timeMs > hitTimeMs) {
                    rightElement = {
                        timeMs: boundary.timeMs,
                        x: boundary.x
                    };
                    break;
                }
            }
        }

        // Fallback to first/last boundary if still not found
        if (!leftElement && this.measureBoundaries.length > 0) {
            leftElement = {
                timeMs: this.measureBoundaries[0].timeMs,
                x: this.measureBoundaries[0].x
            };
        }
        if (!rightElement && this.measureBoundaries.length > 0) {
            const last = this.measureBoundaries[this.measureBoundaries.length - 1];
            rightElement = {
                timeMs: last.timeMs,
                x: last.x
            };
        }

        if (!leftElement || !rightElement) {
            console.warn('[FeedbackRenderer] Could not determine boundaries for X calculation');
            return null;
        }

        // If left and right are the same, return that position
        if (leftElement.timeMs === rightElement.timeMs) {
            return leftElement.x;
        }

        // Interpolate X based on time
        const timeDiff = rightElement.timeMs - leftElement.timeMs;
        const hitOffset = hitTimeMs - leftElement.timeMs;
        const ratio = hitOffset / timeDiff;
        const x = leftElement.x + ratio * (rightElement.x - leftElement.x);

        return x;
    }

    /**
     * Get Y position for a drum type
     */
    _getYForDrum(drumType, referenceRect) {
        const verticalOffsets = {
            [DrumType.HH_CLOSED]: 0.11, [DrumType.HH_OPEN]: 0.11, [DrumType.HH_ACCENT]: 0.11, [DrumType.HH_FOOT]: 0.95,
            [DrumType.CRASH]: -0.03, [DrumType.RIDE]: 0.05, [DrumType.RIDE_BELL]: 0.05, [DrumType.COWBELL]: 0.05, [DrumType.STACKER]: 0.05,
            [DrumType.SNARE]: 0.428, [DrumType.SNARE_GHOST]: 0.428, [DrumType.SNARE_XSTICK]: 0.428, [DrumType.SNARE_FLAM]: 0.428,
            [DrumType.SNARE_BUZZ]: 0.428, [DrumType.SNARE_ACCENT]: 0.428,
            [DrumType.FLAM_GRACE]: 0.428, [DrumType.KICK]: 0.714,
            [DrumType.TOM_HIGH]: 0.25, [DrumType.TOM_LOW]: 0.70
        };
        const vOffsetFactor = verticalOffsets[drumType] !== undefined ? verticalOffsets[drumType] : 0.5;

        if (!referenceRect) return null;

        const bbox = referenceRect.getBBox();
        const targetY = bbox.y + (bbox.height * vOffsetFactor);

        return this._findSmartVerticalCenter(referenceRect, drumType, vOffsetFactor);
    }

    /**
     * Draw hit feedback circle using time-based X interpolation
     * @param {number} hitTimeMs - Time of the hit from session start
     * @param {string} tier - 'perfect', 'good', 'close', or 'extra'
     * @param {number} timingError - Timing error in ms (positive = late, negative = early)
     * @param {string} drumType - The type of drum hit
     * @param {number} abcNoteIndex - Optional: ABC index of target note (for Y reference)
     */
    drawHitFeedbackByTime(hitTimeMs, tier, timingError, drumType, abcNoteIndex = null) {
        if (!this.feedbackLayer || !this.svgElement || !this.svgElement.isConnected) {
            this.init();
        }

        if (!this.feedbackLayer) return;

        let finalX;
        const isGraceNote = (drumType === DrumType.FLAM_GRACE);
        const isFlamMain = (drumType === DrumType.SNARE_FLAM);

        // First, check if we have a precalculated position in the timeline
        // This is especially important for flam main notes and grace notes
        if (this.timeline && this.timeline.length > 0) {
            // Find a matching note in the timeline by time (within 5ms tolerance)
            for (const note of this.timeline) {
                if (Math.abs(note.timeMs - hitTimeMs) < 5) {
                    // Match type as well
                    if ((isGraceNote && note.isGrace) ||
                        (isFlamMain && note.type === 'snare_flam') ||
                        (!isGraceNote && !isFlamMain && !note.isGrace)) {
                        finalX = note.x;
                        break;
                    }
                }
            }
        }

        // Fallback to time-based interpolation
        if (finalX === undefined || finalX === null) {
            finalX = this._calculateXForHitTime(hitTimeMs);
            if (finalX === null) {
                console.warn('[FeedbackRenderer] Could not calculate X for hit time', hitTimeMs);
                return;
            }

            // Apply grace note offset if using fallback
            if (isGraceNote) {
                finalX -= 8; // Offset grace note to the left
            }
        }

        // Find a reference rect for Y calculation (any note will do for staff geometry)
        let referenceRect = null;
        if (abcNoteIndex !== null) {
            const targetInfo = this.noteRects.get(abcNoteIndex);
            if (targetInfo && targetInfo.element) {
                referenceRect = targetInfo.element;
            }
        }
        // Fallback to first available rect
        if (!referenceRect && this.noteRects.size > 0) {
            referenceRect = this.noteRects.values().next().value.element;
        }

        if (!referenceRect) {
            console.warn('[FeedbackRenderer] No reference rect for Y calculation');
            return;
        }

        // Calculate Y based on drum type
        const smartY = this._getYForDrum(drumType, referenceRect);
        if (smartY === null) return;

        // Transform Y to layer coordinates
        const svg = this.svgElement;
        const rectCTM = referenceRect.getScreenCTM();
        const layerCTM = this.feedbackLayer.getScreenCTM().inverse();
        const pt = svg.createSVGPoint();
        pt.x = 0;
        pt.y = smartY;
        const finalY = pt.matrixTransform(rectCTM).matrixTransform(layerCTM).y;

        // Apply clamping based on tier
        // For perfect/good/close: clamp the visual offset so circles stay near target
        // For extra (gray): no clamping, show exact position
        const clampLimits = {
            perfect: 3,  // Blue circles: max 3px offset (essentially centered)
            good: 8,     // Green circles: max 8px offset
            close: 12,   // Yellow circles: max 12px offset
            extra: Infinity // Gray circles: no clamping
        };

        // Calculate timing-based offset (pixels per ms)
        const pixelsPerMs = 0.15;
        let timingOffset = timingError * pixelsPerMs;

        // Apply clamping
        const clampLimit = clampLimits[tier] || clampLimits.extra;
        if (tier !== 'extra') {
            // For matched notes, clamp the offset
            timingOffset = Math.max(-clampLimit, Math.min(clampLimit, timingOffset));

            // For perfect tier with very small errors, center exactly
            if (tier === 'perfect' && Math.abs(timingError) <= 8) {
                timingOffset = 0;
            }
        }

        const displayX = finalX + timingOffset;

        // Colors - no more 'miss' tier
        const colors = {
            perfect: '#00BFFF', // DeepSkyBlue
            good: '#32CD32',    // LimeGreen
            close: '#FFD700',   // Gold
            extra: '#888888'    // Gray
        };

        const color = colors[tier] || colors.extra;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', displayX);
        circle.setAttribute('cy', finalY);
        circle.setAttribute('r', 4.5);
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('opacity', '0.7');
        circle.setAttribute('style', 'pointer-events: none;');
        circle.setAttribute('class', 'coach-hit-marker');
        circle.setAttribute('data-time-ms', hitTimeMs);
        circle.setAttribute('data-instrument', drumType);

        this.feedbackLayer.appendChild(circle);

        circle.animate([
            { transform: 'scale(0.3)', opacity: 0 },
            { transform: 'scale(1.2)', opacity: 0.8 },
            { transform: 'scale(1)', opacity: 0.6 }
        ], { duration: 200, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
    }

    /**
     * Draw hit feedback circle (legacy API - delegates to new time-based method when context available)
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
            [DrumType.HH_CLOSED]: 0.11, [DrumType.HH_OPEN]: 0.11, [DrumType.HH_ACCENT]: 0.11, [DrumType.HH_FOOT]: 0.95,
            [DrumType.CRASH]: -0.03, [DrumType.RIDE]: 0.05, [DrumType.RIDE_BELL]: 0.05, [DrumType.COWBELL]: 0.05, [DrumType.STACKER]: 0.05,
            [DrumType.SNARE]: 0.428, [DrumType.SNARE_GHOST]: 0.428, [DrumType.SNARE_XSTICK]: 0.428, [DrumType.SNARE_FLAM]: 0.428,
            [DrumType.SNARE_BUZZ]: 0.428, [DrumType.SNARE_ACCENT]: 0.428,
            [DrumType.FLAM_GRACE]: 0.428, [DrumType.KICK]: 0.714,
            [DrumType.TOM_HIGH]: 0.25, [DrumType.TOM_LOW]: 0.70
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

            // Colors - no more 'miss' tier
            const colors = {
                perfect: '#00BFFF', good: '#32CD32', close: '#FFD700', extra: '#888888'
            };

            const color = colors[tier] || colors.extra;

            // Apply clamping based on tier
            const clampLimits = {
                perfect: 3,
                good: 8,
                close: 12,
                extra: Infinity
            };

            const pixelsPerMs = 0.15;
            const maxOffset = clampLimits[tier] || 15;

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
