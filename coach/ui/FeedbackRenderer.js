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

        console.log('[FeedbackRenderer] SVG element found, initializing layer');
        this.svgElement = svg;

        // Create or find overlay layer
        let layer = this.svgElement.querySelector('#coach-feedback-layer');
        if (!layer) {
            layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            layer.setAttribute('id', 'coach-feedback-layer');
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
        // console.log(`[FeedbackRenderer] Found ${rects.length} "rect.abcr" elements in SVG`);

        rects.forEach(rect => {
            const id = rect.getAttribute('id');
            if (!id) return;

            // Extract the note index from ID: abcNoteNum_UNIQUE_INDEX_NOTEINDEX
            const parts = id.split('_');
            const abcIndex = parseInt(parts[parts.length - 1]);

            if (isNaN(abcIndex)) return;

            // Store the rect element for real-time coordinate calculation
            this.noteRects.set(abcIndex, {
                element: rect
            });
        });
    }

    /**
     * Draw hit feedback circle
     */
    drawHitFeedback(abcNoteIndex, tier, timingError, drumType) {
        console.log(`[FeedbackRenderer] drawHitFeedback called for drum: ${drumType}, index: ${abcNoteIndex}, tier: ${tier}`);
        // Automatically try to init if we lost the layer or element
        if (!this.feedbackLayer || !this.svgElement || !this.svgElement.isConnected) {
            console.log('[FeedbackRenderer] feedbackLayer or svgElement is missing or disconnected, re-initializing...');
            this.init();
        }

        if (!this.feedbackLayer) {
            console.warn('[FeedbackRenderer] No feedbackLayer after init!');
            return;
        }

        // CHECK FOR STALE ELEMENT: If the SVG re-renders, our stored rect will be detached.
        let targetInfo = this.noteRects.get(abcNoteIndex);
        if (!targetInfo || !targetInfo.element || !targetInfo.element.isConnected) {
            console.log(`[FeedbackRenderer] No target rect for index ${abcNoteIndex} (or disconnected), refreshing...`);
            this.refreshNoteRects();
            targetInfo = this.noteRects.get(abcNoteIndex);
        }

        if (!targetInfo) {
            console.warn(`[FeedbackRenderer] targetInfo is still missing for index ${abcNoteIndex} after refresh. Count of rects: ${this.noteRects.size}`);
            return;
        }
        if (!targetInfo.element || !targetInfo.element.isConnected) {
            console.warn(`[FeedbackRenderer] rect element is still missing or disconnected for index ${abcNoteIndex}`);
            return;
        }
        const rect = targetInfo.element;
        console.log(`[FeedbackRenderer] Found rect for index ${abcNoteIndex}: ${rect.getAttribute('id')}`);


        // Vertical Offset Mapping (Percentage of staff height)
        // Adjusting for abc2svg rect offset: RectY = StaffY + 5, RectH = StaffH + 10
        // Calculated for a 5-line staff with 10px spacing (h=40, total rect height = 50)
        const verticalOffsets = {
            'hh_normal': -0.12, // Lowered slightly from -0.18
            'hh_open': -0.12,   // Same as hh_normal - appear at note head, not articulation
            'hh_accent': -0.12, // Same as hh_normal
            'hh_foot': 0.95,    // Below kick - more separation for visibility in unisons
            'crash': -0.08,     // On the top staff line with note head
            'ride': -0.05,
            'ride_bell': -0.05,
            'splash': -0.35,
            'china': -0.35,
            'snare': 0.428,     // Space 3 centered
            'snare_ghost': 0.428,
            'snare_side': 0.428,
            'snare_flam': 0.428, // Main flam hit - same as snare
            'snare_xstick': 0.428,
            'flam_grace': 0.428, // Grace note - same Y as snare, but will be shifted left horizontally
            'kick': 0.714,      // Space 1 centered
            'kick_splash': 0.714, // Same as kick
            'tom1': 0.22,       // High tom - space 4 area
            'tom2': 0.35,       // Mid tom - line 3/space 3 area  
            'tom3': 0.55,       // Low tom - line 2/space 2 area
            'tom4': 0.70        // Floor tom - near kick level
        };
        const vOffsetFactor = verticalOffsets[drumType] !== undefined ? verticalOffsets[drumType] : 0.5;

        // Coordinate conversion using Screen CTM (Matrix Transform)
        try {
            const bbox = rect.getBBox();
            const svg = this.svgElement;
            const pt = svg.createSVGPoint();

            // First get the target Y position for this drum type
            const smartY = this._findSmartVerticalCenter(rect, drumType, vOffsetFactor);

            // Find the actual note head X position for this drum
            // For grace notes, find leftmost note head; for others, find the one at target Y
            const isGraceNote = (drumType === 'flam_grace');
            const noteHeadX = this._findNoteHeadX(rect, smartY, isGraceNote);

            // Use found note head position, or fall back to bbox center
            let centerX = noteHeadX !== null ? noteHeadX : (bbox.x + (bbox.width / 2));

            pt.x = centerX;
            pt.y = smartY;

            // Transform point: Rect Space -> Screen Space -> FeedbackLayer Space
            const rectCTM = rect.getScreenCTM();
            const layerCTM = this.feedbackLayer.getScreenCTM().inverse();
            const finalPt = pt.matrixTransform(rectCTM).matrixTransform(layerCTM);

            const colors = {
                perfect: '#00BFFF', // DeepSkyBlue
                good: '#32CD32',    // LimeGreen
                close: '#FFD700',   // Gold
                extra: '#95a5a6',   // Gray
                miss: '#FF4500'     // OrangeRed
            };

            const color = colors[tier] || colors.extra;
            const pixelsPerMs = 0.15; // Realistic sensitivity
            const maxOffset = 15;

            // Calculate horizontal offset with a "dead zone" for near-perfect hits
            let xOffset = timingError * pixelsPerMs;
            if (tier === 'perfect' && Math.abs(timingError) <= 8) {
                xOffset = 0; // Snap to absolute center
            }
            xOffset = Math.max(-maxOffset, Math.min(maxOffset, xOffset));

            // Note: Flam positioning is now handled by _findNoteHeadX which finds actual note heads

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', finalPt.x + xOffset);
            circle.setAttribute('cy', finalPt.y);
            circle.setAttribute('r', 6.0); // Reduced size to prevent overlap
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', 'white'); // White outline for better contrast
            circle.setAttribute('stroke-width', '1.5');
            circle.setAttribute('opacity', '0.7');
            circle.setAttribute('style', 'pointer-events: none;'); // Ensure markers don't block clicks
            circle.setAttribute('class', 'coach-hit-marker');
            circle.setAttribute('data-abc-index', abcNoteIndex);
            circle.setAttribute('data-instrument', drumType);

            // Replace existing marker for this EXACT note and instrument
            const existing = this.feedbackLayer.querySelector(
                `.coach-hit-marker[data-abc-index="${abcNoteIndex}"][data-instrument="${drumType}"]`
            );
            if (existing) {
                this.feedbackLayer.removeChild(existing);
            }

            this.feedbackLayer.appendChild(circle);

            // Elastic pop animation
            circle.animate([
                { transform: 'scale(0.3)', opacity: 0 },
                { transform: 'scale(1.2)', opacity: 0.8 },
                { transform: 'scale(1)', opacity: 0.6 }
            ], {
                duration: 200,
                easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            });
        } catch (e) {
            console.warn('[FeedbackRenderer] Coordinate transform failed', e);
        }
    }

    /**
     * Finds the actual note head Y coordinate by scanning the SVG slice
     */
    _findSmartVerticalCenter(rect, drumType, fallbackRatio) {
        const rectBbox = rect.getBBox();
        const targetY = rectBbox.y + (rectBbox.height * fallbackRatio);

        // Find all paths/use elements that overlap horizontally with this slice
        // Note: we look for elements that are reasonably sized to be note heads
        const elements = this.svgElement.querySelectorAll('path, use');
        let bestCandidate = null;
        let minOffset = Infinity;

        for (const el of elements) {
            // Skip the hit-area rects and our own feedback markers
            if (el.classList.contains('abcr') || el.classList.contains('coach-hit-marker')) continue;

            const bbox = el.getBBox();
            const centerX = bbox.x + (bbox.width / 2);

            // Horizontal slice check
            if (centerX >= rectBbox.x && centerX <= rectBbox.x + rectBbox.width) {
                // Filter for note-head-like dimensions (approx 6-12px)
                // Stems are tall (>20px), flags are specific shapes
                if (bbox.height > 15 || bbox.width > 20 || bbox.height < 4) continue;

                const centerY = bbox.y + (bbox.height / 2);
                const offset = Math.abs(centerY - targetY);

                if (offset < minOffset) {
                    minOffset = offset;
                    bestCandidate = centerY;
                }
            }
        }

        // Only snap if we found a candidate within a reasonable distance (e.g., 12px / 1 staff space)
        if (bestCandidate !== null && minOffset < 12) {
            // console.log(`[FeedbackRenderer] Snapped ${drumType} to note head at Y: ${bestCandidate.toFixed(1)} (Offset: ${minOffset.toFixed(1)})`);
            return bestCandidate;
        }

        return targetY;
    }

    /**
     * Finds the horizontal center of a note head at a given Y position within a rect slice
     * For grace notes, finds the leftmost note head. For other drums, finds the one closest to targetY.
     */
    _findNoteHeadX(rect, targetY, isGraceNote = false) {
        const rectBbox = rect.getBBox();
        const elements = this.svgElement.querySelectorAll('path, use');

        let leftmostX = null;
        let leftmostCenterX = null;
        let closestToTargetX = null;
        let minYOffset = Infinity;
        let candidates = []; // For debugging

        for (const el of elements) {
            if (el.classList.contains('abcr') || el.classList.contains('coach-hit-marker')) continue;

            const bbox = el.getBBox();
            const centerX = bbox.x + (bbox.width / 2);
            const centerY = bbox.y + (bbox.height / 2);

            // Horizontal slice check - element must overlap with rect
            if (centerX >= rectBbox.x && centerX <= rectBbox.x + rectBbox.width) {
                // Filter for note-head-like dimensions
                if (bbox.height > 15 || bbox.width > 20 || bbox.height < 4) continue;
                // Also check vertical range - must be within the rect's height
                if (centerY < rectBbox.y || centerY > rectBbox.y + rectBbox.height) continue;

                candidates.push({ x: bbox.x, centerX, centerY, width: bbox.width, height: bbox.height });

                // For grace notes: track leftmost element at target Y level
                // For other drums: track element closest to target Y
                const yOffset = Math.abs(centerY - targetY);

                // Is this element at the target Y level? (within 10px)
                const atTargetY = yOffset < 10;

                if (atTargetY && (leftmostX === null || bbox.x < leftmostX)) {
                    leftmostX = bbox.x;
                    // Store the element width for later offset calculation
                    leftmostCenterX = { x: bbox.x, width: bbox.width };
                }

                if (yOffset < minYOffset) {
                    minYOffset = yOffset;
                    closestToTargetX = centerX;
                }
            }
        }

        // For grace notes, return the leftmost note head
        // For other drums, return the one closest to the target Y position
        if (isGraceNote && leftmostCenterX !== null) {
            // 1 candidate = isolated grace note (allArticulations), use +3
            // 2+ candidates = flam with hi-hat above (snareFlam), use -5
            const offset = candidates.length === 1 ? 3 : -5;
            return leftmostCenterX.x + offset;
        }
        return closestToTargetX;
    }

    clearFeedback() {
        if (this.feedbackLayer) {
            this.feedbackLayer.innerHTML = '';
        }
    }
}
