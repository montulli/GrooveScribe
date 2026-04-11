import { DrumType, EditorDrumToModuleDrum } from './DrumConstants.js';
import { evaluateHit } from './TimingEvaluator.js';

// Timing thresholds (ms) for matching incoming MIDI hits to expected notes
const GRACE_NOTE_EARLY_LIMIT_MS = 20;   // A grace hit can be up to this many ms late
const GRACE_NOTE_MATCH_WINDOW_MS = 100;  // Total window around expected time for grace matching
const NORMAL_HIT_MATCH_WINDOW_MS = 150;  // Max distance from expected note before counting as extra

// The furthest (in ms) a note can be from the hit time and still be matchable.
// Used for cursor advancement (skipping old notes) and scan termination.
// Must be >= all individual match windows to avoid skipping matchable notes.
const SCAN_RADIUS_MS = Math.max(NORMAL_HIT_MATCH_WINDOW_MS, GRACE_NOTE_MATCH_WINDOW_MS);

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
        this.noteTimeline = groove.target.map((note, index) => {
            const moduleType = EditorDrumToModuleDrum[note.type];
            if (moduleType === undefined) {
                throw new Error(`[Engine] No EditorDrumToModuleDrum mapping for '${note.type}'`);
            }
            return {
                ...note,
                type: moduleType ?? note.type,
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
        // Reset matched/graceMatched flags for all notes
        this.noteTimeline.forEach(note => {
            note.matched = false;
            note.graceMatched = false;
        });
        // Search cursor: index of the earliest note that could still be matched.
        // Advances monotonically during playback; each note is skipped at most once.
        this._searchCursor = 0;
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
     * Evaluate a single timeline note as a candidate match for the incoming hit.
     *
     * Checks type compatibility (including flam grace notes), matched status,
     * and whether the hit falls within the appropriate timing window.
     *
     * @param {Object} note - Timeline note to evaluate
     * @param {string} drum - Incoming MIDI drum type
     * @param {number} relativeHitTime - Hit timestamp relative to session start (ms)
     * @returns {{ absDiff: number, isGraceNote: boolean } | null} Match info, or null if not a candidate
     */
    _evaluateCandidate(note, drum, relativeHitTime) {
        const isMatch = this._isTypeMatch(drum, note.type);
        // Special case: snare can match snare_flam as the grace note.
        // note.type is normalized to 'snare', so we check editorType for flam.
        const isFlamGraceMatch = (drum === DrumType.SNARE && note.editorType === DrumType.SNARE_FLAM);

        if (!isMatch && !isFlamGraceMatch) return null;
        if (note.matched) return null;

        const targetTime = note.time + this.audioLatency;
        const diff = relativeHitTime - targetTime; // Signed: negative = early
        const absDiff = Math.abs(diff);

        // Flam grace notes: allow early or slightly late hits within a generous window
        if (isFlamGraceMatch && diff < GRACE_NOTE_EARLY_LIMIT_MS && absDiff <= GRACE_NOTE_MATCH_WINDOW_MS && !note.graceMatched) {
            return { absDiff, isGraceNote: true };
        }
        if (isMatch && absDiff <= NORMAL_HIT_MATCH_WINDOW_MS) {
            return { absDiff, isGraceNote: false };
        }
        return null;
    }

    /**
     * Handle an incoming MIDI hit.
     *
     * Uses a cursor-based forward scan for efficient note matching:
     *
     *   1. Advance _searchCursor past notes that are definitively unmatchable
     *      (their expected-heard-time is > SCAN_RADIUS_MS before playbackTime).
     *      The cursor uses playbackTime (performance.now() - startTime) because
     *      it represents "where playback is right now" and is always >= any
     *      relativeHitTime we could receive.
     *
     *   2. Scan forward from _searchCursor, evaluating each note against
     *      relativeHitTime (the actual hit timestamp). Stop when remaining
     *      notes are too far in the future (> SCAN_RADIUS_MS ahead of the hit).
     *
     *   No backward scan is needed: the cursor guarantees everything before it
     *   is beyond SCAN_RADIUS_MS in the past. Since relativeHitTime <= playbackTime
     *   (the hit happened before or at now), a note skipped by the cursor is also
     *   beyond the match window relative to the hit.
     *
     * @param {string} drum - Normalized drum name (e.g., 'kick', 'snare')
     * @param {number} timestamp - The hardware timestamp from the MIDI event
     */
    handleMidiHit(drum, timestamp) {
        if (!this.isPlaying) return null;
        const tl = this.noteTimeline;

        // relativeHitTime: from the hit's actual timestamp. Used for all matching.
        const relativeHitTime = timestamp - this.startTime;

        // playbackTime: current wall-clock elapsed time. Used only for cursor advancement.
        // Always >= relativeHitTime (the hit happened before or at performance.now()).
        const playbackTime = performance.now() - this.startTime;


        // Step 1: Advance cursor past notes that are definitively unmatchable.
        // A note is unmatchable when its expected-heard-time (note.time + audioLatency)
        // is more than SCAN_RADIUS_MS behind playbackTime.
        while (this._searchCursor < tl.length &&
            playbackTime - (tl[this._searchCursor].time + this.audioLatency) > SCAN_RADIUS_MS) {
            this._searchCursor++;
        }

        // Step 2: Forward scan from cursor, matching against relativeHitTime.
        let bestMatch = null;   // direct reference to the timeline note
        let bestIsGrace = false;
        let minDiff = Infinity;

        for (let i = this._searchCursor; i < tl.length; i++) {
            const note = tl[i];
            // Stop when remaining notes are too far in the future to match this hit
            if (note.time + this.audioLatency - relativeHitTime > SCAN_RADIUS_MS) break;

            const result = this._evaluateCandidate(note, drum, relativeHitTime);
            if (result && result.absDiff < minDiff) {
                minDiff = result.absDiff;
                bestMatch = note;
                bestIsGrace = result.isGraceNote;
            }
        }

        if (!bestMatch) {
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


        let evaluation;
        if (bestIsGrace) {
            // Grace note for flam: grade as 'perfect' since being early is expected behavior
            // Flams have inherently flexible timing — the grace note SHOULD be early
            // Don't mark the main note as matched — the primary hit still needs to come
            evaluation = {
                timingError: -minDiff, // Negative = early
                tier: 'perfect',
                isMatch: true,
                isGraceNote: true,
                noteIndex: bestMatch.originalIndex
            };
            // Mark grace slot as matched so subsequent hits match the primary slot
            bestMatch.graceMatched = true;
        } else {
            // Normal hit evaluation
            evaluation = evaluateHit(timestamp, this.startTime + bestMatch.time, this.audioLatency, this.windows);
            evaluation.noteIndex = bestMatch.originalIndex;
            bestMatch.matched = true;
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
