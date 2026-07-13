// Clickable-grid note state (Step 4 extraction from groove_writer.js).
//
// Read side of the note grid: given a cell id, report whether a voice is on and
// what articulation it holds (returned either as an ABC token or a CSS color),
// and read a whole measure of the grid into per-voice arrays. These read the
// DOM via the ambient global `document` (browser / jsdom / Playwright), exactly
// like the app's other DOM probes — no GrooveWriter state is touched, so
// GrooveWriter delegates its own is_*_on / get_*_state / *ArrayFromClickableUI
// helpers here. Per-call state (layout numbers, row visibility, mute lookup) is
// passed in. The write side (set_*_state, which also plays sounds and refreshes)
// stays in GrooveWriter.

import { getNoteScaler } from './musicMath.js';
import {
  constant_ABC_HH_Accent,
  constant_ABC_HH_Close,
  constant_ABC_HH_Cow_Bell,
  constant_ABC_HH_Crash,
  constant_ABC_HH_Metronome_Accent,
  constant_ABC_HH_Metronome_Normal,
  constant_ABC_HH_Normal,
  constant_ABC_HH_Open,
  constant_ABC_HH_Ride,
  constant_ABC_HH_Ride_Bell,
  constant_ABC_HH_Stacker,
  constant_ABC_KI_Normal,
  constant_ABC_KI_SandK,
  constant_ABC_KI_Splash,
  constant_ABC_SN_Accent,
  constant_ABC_SN_Buzz,
  constant_ABC_SN_Drag,
  constant_ABC_SN_Flam,
  constant_ABC_SN_Ghost,
  constant_ABC_SN_Normal,
  constant_ABC_SN_XStick,
  constant_ABC_STICK_BOTH,
  constant_ABC_STICK_COUNT,
  constant_ABC_STICK_L,
  constant_ABC_STICK_OFF,
  constant_ABC_STICK_R,
  constant_ABC_T1_Normal,
  constant_ABC_T4_Normal,
  constant_note_on_color_rgb,
  constant_snare_accent_on_color_rgb,
  constant_sticking_both_on_color_rgb,
  constant_sticking_count_on_color_rgb,
  constant_sticking_left_on_color_rgb,
  constant_sticking_right_on_color_rgb,
} from './constants.js';

export function is_snare_on(id) {
  var state = get_snare_state(id, 'ABC');

  if (state !== false) return true;

  return false;
}

export function get_snare_state(id, returnType) {
  if (returnType != 'ABC' && returnType != 'URL') {
    console.log('bad returnType in get_snare_state()');
    returnType = 'ABC';
  }

  if (document.getElementById('snare_flam' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Flam; // snare flam
    else if (returnType == 'URL') return 'f'; // snare flam
  }
  if (document.getElementById('snare_drag' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Drag; // snare drag
    else if (returnType == 'URL') return 'd'; // snare drag
  }
  if (document.getElementById('snare_ghost' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Ghost; // ghost note
    else if (returnType == 'URL') return 'g'; // ghost note
  }
  if (
    document.getElementById('snare_accent' + id).style.color == constant_snare_accent_on_color_rgb
  ) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Accent; // snare accent
    else if (returnType == 'URL') return 'O'; // snare accent
  }
  if (
    document.getElementById('snare_circle' + id).style.backgroundColor == constant_note_on_color_rgb
  ) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Normal; // snare normal
    else if (returnType == 'URL') return 'o'; // snare normal
  }
  if (document.getElementById('snare_xstick' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_SN_XStick; // snare Xstick
    else if (returnType == 'URL') return 'x'; // snare xstick
  }
  if (document.getElementById('snare_buzz' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_SN_Buzz; // snare Buzz
    else if (returnType == 'URL') return 'b'; // snare Buzz
  }

  if (returnType == 'ABC')
    return false; // off (rest)
  else if (returnType == 'URL') return '-'; // off (rest)
}

export function is_tom_on(id, tom_num) {
  var state = get_tom_state(id, tom_num, 'ABC');

  if (state !== false) return true;

  return false;
}

export function get_tom_state(id, tom_num, returnType) {
  var tomOn =
    document.getElementById('tom_circle' + tom_num + '-' + id).style.backgroundColor ==
    constant_note_on_color_rgb;

  if (returnType != 'ABC' && returnType != 'URL') {
    console.log('bad returnType in get_kick_state()');
    returnType = 'ABC';
  }

  if (tomOn) {
    if (returnType == 'ABC')
      switch (tom_num) {
        case 1:
          return constant_ABC_T1_Normal; // normal
        case 4:
          return constant_ABC_T4_Normal; // normal
        default:
          console.log('bad switch in get_tom_state. bad tom num:' + tom_num);
          break;
      }
    else if (returnType == 'URL') return 'x'; // normal
  }

  if (returnType == 'ABC')
    return false; // off (rest)
  else if (returnType == 'URL') return '-'; // off (rest)
}

export function is_kick_on(id) {
  var state = get_kick_state(id, 'ABC');

  if (state !== false) return true;

  return false;
}

export function get_kick_state(id, returnType) {
  var splashOn =
    document.getElementById('kick_splash' + id).style.color == constant_note_on_color_rgb;
  var kickOn =
    document.getElementById('kick_circle' + id).style.backgroundColor == constant_note_on_color_rgb;

  if (returnType != 'ABC' && returnType != 'URL') {
    console.log('bad returnType in get_kick_state()');
    returnType = 'ABC';
  }

  if (splashOn && kickOn) {
    if (returnType == 'ABC')
      return constant_ABC_KI_SandK; // kick & splash
    else if (returnType == 'URL') return 'X'; // kick & splash
  } else if (splashOn) {
    if (returnType == 'ABC')
      return constant_ABC_KI_Splash; // splash only
    else if (returnType == 'URL') return 'x'; // splash only
  } else if (kickOn) {
    if (returnType == 'ABC')
      return constant_ABC_KI_Normal; // kick normal
    else if (returnType == 'URL') return 'o'; // kick normal
  }

  if (returnType == 'ABC')
    return false; // off (rest)
  else if (returnType == 'URL') return '-'; // off (rest)
}

export function is_hh_on(id) {
  var state = get_hh_state(id, 'ABC');

  if (state !== false) return true;

  return false;
}

export function get_hh_state(id, returnType) {
  if (returnType != 'ABC' && returnType != 'URL') {
    console.log('bad returnType in get_hh_state()');
    returnType = 'ABC';
  }

  if (document.getElementById('hh_ride' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Ride; // ride
    else if (returnType == 'URL') return 'r'; // ride
  }
  if (document.getElementById('hh_ride_bell' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Ride_Bell; // ride bell
    else if (returnType == 'URL') return 'b'; // ride bell
  }
  if (document.getElementById('hh_cow_bell' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Cow_Bell; // cow bell
    else if (returnType == 'URL') return 'm'; // (more) cow bell
  }
  if (document.getElementById('hh_crash' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Crash; // crash
    else if (returnType == 'URL') return 'c'; // crash
  }
  if (document.getElementById('hh_stacker' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Stacker; // stacker
    else if (returnType == 'URL') return 's'; // stacker
  }
  if (
    document.getElementById('hh_metronome_normal' + id).style.color == constant_note_on_color_rgb
  ) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Metronome_Normal; // beep
    else if (returnType == 'URL') return 'n'; // beep
  }
  if (
    document.getElementById('hh_metronome_accent' + id).style.color == constant_note_on_color_rgb
  ) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Metronome_Accent; // beep
    else if (returnType == 'URL') return 'N'; // beep
  }
  if (document.getElementById('hh_open' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Open; // hh Open
    else if (returnType == 'URL') return 'o'; // hh Open
  }
  if (document.getElementById('hh_close' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Close; // hh close
    else if (returnType == 'URL') return '+'; // hh close
  }
  if (document.getElementById('hh_accent' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Accent; // hh accent
    else if (returnType == 'URL') return 'X'; // hh accent
  }
  if (document.getElementById('hh_cross' + id).style.color == constant_note_on_color_rgb) {
    if (returnType == 'ABC')
      return constant_ABC_HH_Normal; // hh normal
    else if (returnType == 'URL') return 'x'; // hh normal
  }

  if (returnType == 'ABC')
    return false; // off (rest)
  else if (returnType == 'URL') return '-'; // off (rest)
}

export function get_sticking_state(id, returnType) {
  if (returnType != 'ABC' && returnType != 'URL') {
    console.log('bad returnType in get_kick_state()');
    returnType = 'ABC';
  }

  var right_ele = document.getElementById('sticking_right' + id);
  var left_ele = document.getElementById('sticking_left' + id);
  var both_ele = document.getElementById('sticking_both' + id);
  var count_ele = document.getElementById('sticking_count' + id);

  if (both_ele.style.color == constant_sticking_both_on_color_rgb) {
    // both is on
    if (returnType == 'ABC') return constant_ABC_STICK_BOTH;
    else if (returnType == 'URL') return 'B';
  } else if (right_ele.style.color == constant_sticking_right_on_color_rgb) {
    if (returnType == 'ABC') return constant_ABC_STICK_R;
    else if (returnType == 'URL') return 'R';
  } else if (left_ele.style.color == constant_sticking_left_on_color_rgb) {
    if (returnType == 'ABC') return constant_ABC_STICK_L;
    else if (returnType == 'URL') return 'L';
  } else if (count_ele.style.color == constant_sticking_count_on_color_rgb) {
    if (returnType == 'ABC') return constant_ABC_STICK_COUNT;
    else if (returnType == 'URL') return 'c';
  } else {
    // none selected.  Call it off
    if (returnType == 'ABC')
      return constant_ABC_STICK_OFF; // off (rest)
    else if (returnType == 'URL') return '-'; // off (rest)
  }

  return false; // should never get here
}

function fill_array_with_value_false(array_of_notes, number_of_notes) {
  for (var i = 0; i < number_of_notes; i++) {
    array_of_notes[i] = false;
  }
}

// create a new instance of an array with all the values prefilled with false
export function get_empty_note_array(number_of_notes) {
  var newArray = [number_of_notes];
  fill_array_with_value_false(newArray, number_of_notes);
  return newArray;
}

// Read one measure of the clickable UI into the passed-in per-voice arrays,
// scaling the UI's notes proportionally into the full-size (32nd/48th) arrays.
// `ctx` carries the layout numbers and row-visibility flags GrooveWriter owns.
// Returns the number of notes.
export function get32NoteArrayFromClickableUI(
  Sticking_Array,
  HH_Array,
  Snare_Array,
  Kick_Array,
  Toms_Array,
  startIndexForClickableUI,
  ctx
) {
  var scaler = getNoteScaler(ctx.notesPerMeasure, ctx.numBeatsPerMeasure, ctx.noteValuePerMeasure); // fill proportionally

  // fill in the arrays from the clickable UI
  for (var i = 0; i < ctx.notesPerMeasure; i++) {
    var array_index = i * scaler;

    // only grab the stickings if they are visible
    if (ctx.stickingsVisible)
      Sticking_Array[array_index] = get_sticking_state(i + startIndexForClickableUI, 'ABC');

    HH_Array[array_index] = get_hh_state(i + startIndexForClickableUI, 'ABC');

    if (ctx.tomsVisible) {
      Toms_Array[0][array_index] = get_tom_state(i + startIndexForClickableUI, 1, 'ABC');
      Toms_Array[3][array_index] = get_tom_state(i + startIndexForClickableUI, 4, 'ABC');
    }

    Snare_Array[array_index] = get_snare_state(i + startIndexForClickableUI, 'ABC');

    Kick_Array[array_index] = get_kick_state(i + startIndexForClickableUI, 'ABC');
  }

  var num_notes = Snare_Array.length;
  return num_notes;
}

// Zero out any voice arrays whose instrument is muted for this measure.
// `isInstrumentMuted(instrument, measureNumber)` is injected by GrooveWriter.
export function muteArrayFromClickableUI(
  Sticking_Array,
  HH_Array,
  Snare_Array,
  Kick_Array,
  Toms_Array,
  measureIndex,
  isInstrumentMuted
) {
  if (isInstrumentMuted('hh', measureIndex + 1))
    fill_array_with_value_false(HH_Array, HH_Array.length);
  if (isInstrumentMuted('snare', measureIndex + 1))
    fill_array_with_value_false(Snare_Array, Snare_Array.length);
  if (isInstrumentMuted('kick', measureIndex + 1))
    fill_array_with_value_false(Kick_Array, Kick_Array.length);

  for (var i = 0; i < Toms_Array.length; i++) {
    if (isInstrumentMuted('tom' + (i + 1), measureIndex + 1))
      fill_array_with_value_false(Toms_Array[i], Toms_Array[i].length);
  }
}
