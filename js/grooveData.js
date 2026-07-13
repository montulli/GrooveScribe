// grooveData — the central data contract for Groove Scribe.
//
// A GrooveData describes a single groove: its time signature, subdivision and
// tempo, the per-instrument note lanes (hi-hat / snare / kick / toms / sticking)
// and the display flags. It is *produced* by URL parsing (urlSerialization) and
// *consumed* by the notation and audio generators (abcNotation / midiFile), so
// this module is the single place its shape is defined and constructed.

import { constant_DEFAULT_TEMPO } from './constants.js';

// A fresh 32-slot note lane, every slot a rest. Each note array in a GrooveData
// is a copy of this (never a shared reference), so mutating one lane or measure
// never bleeds into another.
const EMPTY_NOTE_ARRAY = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
];

/**
 * One groove: notation-independent state that fully describes what to render
 * and play.
 *
 * @typedef {Object} GrooveData
 * @property {number} notesPerMeasure  Slots per measure at the current subdivision.
 * @property {number} timeDivision     Subdivision (4, 8, 16, 32, or triplet forms 6/12/24/48).
 * @property {number} numberOfMeasures  Measure count.
 * @property {number} numBeats         Time-signature numerator (top).
 * @property {number} noteValue        Time-signature denominator (bottom).
 * @property {boolean[]} sticking_array  Sticking lane (R/L annotations), one slot per note.
 * @property {boolean[]} hh_array      Hi-hat / cymbal lane.
 * @property {boolean[]} snare_array   Snare lane.
 * @property {boolean[]} kick_array    Kick lane.
 * @property {boolean[][]} toms_array  Four tom lanes (T1–T4), index 0-based.
 * @property {boolean} showToms        Whether the tom lanes are displayed.
 * @property {boolean} showStickings   Whether the sticking lane is displayed.
 * @property {string} title            Groove title.
 * @property {string} author           Groove author.
 * @property {string} comments         Free-text comments.
 * @property {boolean} showLegend      Whether the notation legend is displayed.
 * @property {number} swingPercent     Swing amount, 0–100.
 * @property {number} tempo            Tempo in BPM.
 * @property {boolean} kickStemsUp     Kick note stem direction.
 * @property {number} metronomeFrequency  Metronome click subdivision (0, 4, 8, 16).
 * @property {(boolean|number)} debugMode  Debug flag inherited from the owning GrooveUtils.
 * @property {boolean} grooveDBAuthoring   GrooveDB authoring mode flag.
 * @property {boolean} viewMode        View (vs. edit) mode flag.
 */

/**
 * Create a fresh {@link GrooveData} populated with default values.
 *
 * @param {{debugMode?: (boolean|number), grooveDBAuthoring?: boolean, viewMode?: boolean}} [config]
 *   Instance-level flags inherited from the owning GrooveUtils. Each defaults to
 *   the same value the legacy `grooveDataNew` used for a freshly-constructed
 *   GrooveUtils (debugMode/grooveDBAuthoring off, viewMode on).
 * @returns {GrooveData}
 */
export function createGrooveData(config = {}) {
  return {
    notesPerMeasure: 16,
    timeDivision: 16,
    numberOfMeasures: 1,
    numBeats: 4, // TimeSigTop: Top part of Time Signture 3/4, 4/4, 5/4, 6/8, etc...
    noteValue: 4, // TimeSigBottom: Bottom part of Time Sig   4 = quarter notes, 8 = 8th notes, 16ths, etc..
    sticking_array: EMPTY_NOTE_ARRAY.slice(0), // copy by value
    hh_array: EMPTY_NOTE_ARRAY.slice(0), // copy by value
    snare_array: EMPTY_NOTE_ARRAY.slice(0), // copy by value
    kick_array: EMPTY_NOTE_ARRAY.slice(0), // copy by value
    // toms_array contains 4 toms  T1, T2, T3, T4 index starting at zero
    toms_array: [
      EMPTY_NOTE_ARRAY.slice(0),
      EMPTY_NOTE_ARRAY.slice(0),
      EMPTY_NOTE_ARRAY.slice(0),
      EMPTY_NOTE_ARRAY.slice(0),
    ],
    showToms: false,
    showStickings: false,
    title: '',
    author: '',
    comments: '',
    showLegend: false,
    swingPercent: 0,
    tempo: constant_DEFAULT_TEMPO,
    kickStemsUp: true,
    metronomeFrequency: 0, // 0, 4, 8, 16
    debugMode: config.debugMode ?? false,
    grooveDBAuthoring: config.grooveDBAuthoring ?? false,
    viewMode: config.viewMode ?? true,
  };
}
