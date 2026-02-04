import { evaluateHit } from './TimingEvaluator.js';

/**
 * CoachEngine - Manages the coaching session
 */
export class CoachEngine {
    constructor(options = {}) {
        this.groove = null;           // Current groove/pattern
        this.noteTimeline = [];       // Flattened note schedule [{time, type, ...}]
        this.results = [];            // Hit results for scoring
        this.audioLatency = options.audioLatency !== undefined ? options.audioLatency : 50;
        this.calibrationOffset = options.calibrationOffset !== undefined ? options.calibrationOffset : 0;
        this.windows = options.windows || { perfect: 20, good: 35, close: 50 };
        this.onHitEvaluated = options.onHitEvaluated || (() => { });

        this.startTime = 0;
        this.isPlaying = false;
    }

    /**
     * Load a groove and prepare the note timeline
     * @param {Object} groove - The groove object containing targets
     * @param {number} bpm - Beats per minute (optional if already in groove)
     */
    loadGroove(groove, bpm) {
        this.groove = groove;
        // For now, assume groove.target is already in ms relative to start
        // If it's in beats, we would convert here using bpm
        this.noteTimeline = (groove.target || []).map((note, index) => ({
            ...note,
            originalIndex: index,
            matched: false
        }));
        this.results = [];
    }

    /**
     * Start the coaching session
     * @param {number} startTime - performance.now() when playback started
     */
    start(startTime) {
        this.startTime = startTime;
        this.isPlaying = true;
        this.results = [];
        // Reset matched flag for all notes
        this.noteTimeline.forEach(note => note.matched = false);
    }

    /**
     * Stop the coaching session
     */
    stop() {
        this.isPlaying = false;
    }

    /**
     * Handle an incoming MIDI hit
     * @param {string} drum - Normalized drum name (e.g., 'kick', 'snare')
     * @param {number} timestamp - The hardware timestamp from the MIDI event
     */
    handleMidiHit(drum, timestamp) {
        if (!this.isPlaying) return null;

        // Relative hit time from session start
        const relativeHitTime = timestamp - this.startTime;

        // Find the best match in the timeline
        let bestMatch = null;
        let minDiff = Infinity;

        console.log(`[CoachEngine] searching for ${drum} hit at relTime ${relativeHitTime.toFixed(2)}ms (lat: ${this.audioLatency})`);

        for (const note of this.noteTimeline) {
            // Match instrument and ensure not already matched
            // Special case: snare can match snare_flam as the grace note
            const isFlameGraceMatch = (drum === 'snare' && note.type === 'snare_flam');
            if (note.type !== drum && !isFlameGraceMatch) continue;
            if (note.matched) continue;

            const targetTime = note.time + (this.audioLatency || 0);
            const diff = relativeHitTime - targetTime; // Signed diff (negative = early)
            const absDiff = Math.abs(diff);

            // For flam grace notes: allow early hits within 15-60ms before the flam
            if (isFlameGraceMatch) {
                // Grace note should be early (negative diff) between 15-60ms
                if (diff < 0 && absDiff >= 15 && absDiff <= 60) {
                    if (absDiff < minDiff) {
                        minDiff = absDiff;
                        bestMatch = { ...note, isGraceNote: true };
                    }
                }
            } else {
                if (absDiff < minDiff && absDiff <= 150) { // More generous window for matching
                    minDiff = absDiff;
                    bestMatch = note;
                }
            }
        }

        if (!bestMatch) {
            console.log(`[CoachEngine] No match found for ${drum} (Timeline size: ${this.noteTimeline.length})`);
            // Return an extra hit result
            const evaluation = {
                timingError: 0,
                tier: 'extra',
                isMatch: false,
                drum: drum
            };
            this.results.push(evaluation);
            this.onHitEvaluated(evaluation);
            return evaluation;
        }

        console.log(`[CoachEngine] Matched ${drum} with note at ${bestMatch.time}ms (diff: ${minDiff.toFixed(2)}ms)${bestMatch.isGraceNote ? ' [GRACE NOTE]' : ''}`);

        let evaluation;
        if (bestMatch) {
            if (bestMatch.isGraceNote) {
                // Grace note for flam: grade as 'perfect' since being early is expected behavior
                // Flams have inherently flexible timing - the grace note SHOULD be early
                // Don't mark the main note as matched - the primary hit still needs to come
                evaluation = {
                    timingError: -minDiff, // Negative = early
                    tier: 'perfect', // Grace notes are graded as perfect when in the expected window
                    isMatch: true,
                    isGraceNote: true,
                    noteIndex: bestMatch.originalIndex
                };
            } else {
                // Normal hit evaluation
                evaluation = evaluateHit(timestamp, this.startTime + bestMatch.time, this.audioLatency, this.windows);
                evaluation.noteIndex = bestMatch.originalIndex;
                // Find the original note and mark it matched
                const originalNote = this.noteTimeline.find(n => n.originalIndex === bestMatch.originalIndex);
                if (originalNote) originalNote.matched = true;
            }
        } else {
            // It's an extra hit or a miss
            evaluation = {
                timingError: 0,
                tier: 'extra',
                isMatch: false
            };
        }

        this.results.push(evaluation);
        this.onHitEvaluated(evaluation);

        return evaluation;
    }

    /**
     * Get the aggregated results
     */
    getResults() {
        const stats = {
            perfect: 0,
            good: 0,
            close: 0,
            miss: 0,
            extra: 0,
            totalNotes: this.noteTimeline.length,
            score: 0
        };

        this.results.forEach(res => {
            if (stats[res.tier] !== undefined) {
                stats[res.tier]++;
            }
        });

        // Calculate misses (notes in timeline that were never matched)
        const matchedCount = this.noteTimeline.filter(n => n.matched).length;
        stats.miss = stats.totalNotes - matchedCount;

        // Calculate score (weighted percentage)
        // Perfect: 100%, Good: 75%, Close: 50%, Miss: 0%
        if (stats.totalNotes > 0) {
            const weighted = (stats.perfect * 100) + (stats.good * 75) + (stats.close * 50);
            stats.score = Math.round(weighted / stats.totalNotes);
        } else {
            stats.score = 0;
        }

        return stats;
    }
}
