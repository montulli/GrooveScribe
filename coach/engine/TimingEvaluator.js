/**
 * TimingEvaluator - Pure function for timing evaluation
 * 
 * @param {number} hitTimestamp - When user hit (ms, performance.now domain)
 * @param {number} targetTime - When note should be played (ms)
 * @param {number} audioLatency - Measured audio output latency (ms)
 * @param {Object} windows - Timing windows {perfect, good, close}
 * @returns {Object} {timingError, tier, isMatch}
 */
export function evaluateHit(hitTimestamp, targetTime, audioLatency, windows) {
    // The user hears the note 'audioLatency' ms after it's scheduled
    const whenUserHeard = targetTime + audioLatency;

    // Error = hit time - what they heard
    // Negative = early (rushing), Positive = late (dragging)
    const timingError = hitTimestamp - whenUserHeard;
    const absError = Math.abs(timingError);

    let tier;
    if (absError <= windows.perfect) {
        tier = 'perfect';
    } else if (absError <= windows.good) {
        tier = 'good';
    } else if (absError <= windows.close) {
        tier = 'close';
    } else {
        tier = 'miss';
    }

    return {
        timingError,
        tier,
        isMatch: tier !== 'miss'
    };
}
