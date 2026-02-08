import { DrumType } from './DrumConstants.js';
import { evaluateHit } from './TimingEvaluator.js';

// Timing thresholds (ms) for matching incoming MIDI hits to expected notes
const GRACE_NOTE_EARLY_LIMIT_MS = 20;   // A grace hit can be up to this many ms late
const GRACE_NOTE_MATCH_WINDOW_MS = 100;  // Total window around expected time for grace matching
const NORMAL_HIT_MATCH_WINDOW_MS = 150;  // Max distance from expected note before counting as extra

// Scoring weights (out of 100 per note)
const SCORE_WEIGHTS = { perfect: 100, good: 75, close: 50 };

/**
 * Engine - Manages the coaching session
 */
export class Engine {
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
        this.noteTimeline = groove.target.map((note, index) => {
            return {
                ...note,
                type: note.type, // Expect normalized types from editor
                editorType: note.type,
                originalIndex: index,
                matched: false
            };
        });
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
     * Helper to check if a MIDI drum type matches a timeline note type
     * Handles articulations (e.g., SNARE matching SNARE_ACCENT)
     */
    _isTypeMatch(drum, noteType) {
        // Since loadGroove already normalized noteType using EditorDrumToModuleDrum,
        // and incoming MIDI drum hits should be in ModuleDrumTypes,
        // a simple equality check is sufficient for most drums.
        if (drum === noteType) return true;

        // Special case: snare can match snare_flam as the grace note
        // but snare_flam itself (the primary hit) would have been normalized to 'snare'
        // in loadGroove. The grace note logic is handled separately in handleMidiHit.

        return false;
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

        console.log(`[Engine] searching for ${drum} hit at relTime ${relativeHitTime.toFixed(2)}ms (lat: ${this.audioLatency})`);

        for (const note of this.noteTimeline) {
            const isMatch = this._isTypeMatch(drum, note.type);
            // Special case: snare can match snare_flam as the grace note
            // Note: note.type is normalized, so we check the original editorType for flam
            const isFlameGraceMatch = (drum === DrumType.SNARE && note.editorType === DrumType.SNARE_FLAM);

            if (!isMatch && !isFlameGraceMatch) continue;
            if (note.matched) continue;

            const targetTime = note.time + this.audioLatency;
            const diff = relativeHitTime - targetTime; // Signed diff (negative = early)
            const absDiff = Math.abs(diff);

            // For flam grace notes: allow early or slightly late hits within a generous window
            if (isFlameGraceMatch && diff < GRACE_NOTE_EARLY_LIMIT_MS && absDiff <= GRACE_NOTE_MATCH_WINDOW_MS && !note.graceMatched) {
                if (absDiff < minDiff) {
                    minDiff = absDiff;
                    bestMatch = { ...note, isGraceNote: true };
                }
            } else if (isMatch) {
                // For normal hits or primary flam hits
                if (absDiff < minDiff && absDiff <= NORMAL_HIT_MATCH_WINDOW_MS) {
                    minDiff = absDiff;
                    bestMatch = note;
                }
            }
        }

        if (!bestMatch) {
            console.log(`[Engine] No match found for ${drum} (Timeline size: ${this.noteTimeline.length})`);
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

        console.log(`[Engine] Matched ${drum} with note at ${bestMatch.time}ms (diff: ${minDiff.toFixed(2)}ms)${bestMatch.isGraceNote ? ' [GRACE NOTE]' : ''}`);

        let evaluation;
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
            // Mark grace slot as matched so subsequent hits (even if very early) match the primary slot
            const originalNote = this.noteTimeline.find(n => n.originalIndex === bestMatch.originalIndex);
            if (originalNote) originalNote.graceMatched = true;
        } else {
            // Normal hit evaluation
            evaluation = evaluateHit(timestamp, this.startTime + bestMatch.time, this.audioLatency, this.windows);
            evaluation.noteIndex = bestMatch.originalIndex;
            // Find the original note and mark it matched
            const originalNote = this.noteTimeline.find(n => n.originalIndex === bestMatch.originalIndex);
            if (originalNote) originalNote.matched = true;
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
            if (res.isGraceNote) return; // Grace notes don't count toward score
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
            const weighted = (stats.perfect * SCORE_WEIGHTS.perfect) + (stats.good * SCORE_WEIGHTS.good) + (stats.close * SCORE_WEIGHTS.close);
            stats.score = Math.round(weighted / stats.totalNotes);
        } else {
            stats.score = 0;
        }

        return stats;
    }
}
