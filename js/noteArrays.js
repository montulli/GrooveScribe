// Note-array / drum-tab conversions and default grooves (Step 2 extraction).
// Pure module: converts between tab strings and ABC note arrays, builds default
// grooves, and note-mapping/sticking-count helpers. GrooveUtils delegates here.

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
  constant_ABC_OFF,
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
  constant_ABC_T2_Normal,
  constant_ABC_T3_Normal,
  constant_ABC_T4_Normal,
  constant_NUMBER_OF_TOMS,
} from './constants.js';
import { calc_notes_per_measure, isTripletDivision } from './musicMath.js';

function tablatureToABCNotationPerNote(drumType, tablatureChar) {
  switch (tablatureChar) {
    case 'b':
    case 'B':
      if (drumType == 'Stickings') return constant_ABC_STICK_BOTH;
      else if (drumType == 'H') return constant_ABC_HH_Ride_Bell;
      else if (drumType == 'S') return constant_ABC_SN_Buzz;
      break;
    case 'c':
      if (drumType == 'Stickings') return constant_ABC_STICK_COUNT;
      else if (drumType == 'H') return constant_ABC_HH_Crash;
      break;
    case 'd':
      if (drumType == 'S') return constant_ABC_SN_Drag;
      break;
    case 'f':
      if (drumType == 'S') return constant_ABC_SN_Flam;
      break;
    case 'g':
      if (drumType == 'S') return constant_ABC_SN_Ghost;
      break;
    case 'l':
    case 'L':
      if (drumType == 'Stickings') return constant_ABC_STICK_L;
      break;
    case 'm': // (more) cow bell
      if (drumType == 'H') return constant_ABC_HH_Cow_Bell;
      break;
    case 'n': // (more) cow bell
      if (drumType == 'H') return constant_ABC_HH_Metronome_Normal;
      break;
    case 'N': // (more) cow bell
      if (drumType == 'H') return constant_ABC_HH_Metronome_Accent;
      break;
    case 'O':
      if (drumType == 'S') return constant_ABC_SN_Accent;
      break;
    case 'o':
      switch (drumType) {
        case 'H':
          return constant_ABC_HH_Open;
        //break;
        case 'S':
          return constant_ABC_SN_Normal;
        //break;
        case 'K':
        case 'B':
          return constant_ABC_KI_Normal;
        //break;
        case 'T1':
          return constant_ABC_T1_Normal;
        //break;
        case 'T2':
          return constant_ABC_T2_Normal;
        //break;
        case 'T3':
          return constant_ABC_T3_Normal;
        //break;
        case 'T4':
          return constant_ABC_T4_Normal;
        //break;
        default:
          break;
      }
      break;
    case 'r':
    case 'R':
      switch (drumType) {
        case 'H':
          return constant_ABC_HH_Ride;
        //break;
        case 'Stickings':
          return constant_ABC_STICK_R;
        //break;
        default:
          break;
      }
      break;
    case 's':
      if (drumType == 'H') return constant_ABC_HH_Stacker;
      break;
    case 'x':
      switch (drumType) {
        case 'S':
          return constant_ABC_SN_XStick;
        //break;
        case 'K':
        case 'B':
          return constant_ABC_KI_Splash;
        //break;
        case 'H':
          return constant_ABC_HH_Normal;
        //break;
        case 'T1':
          return constant_ABC_T1_Normal;
        //break;
        case 'T4':
          return constant_ABC_T4_Normal;
        //break;
        default:
          break;
      }
      break;
    case 'X':
      switch (drumType) {
        case 'K':
          return constant_ABC_KI_SandK;
        //break;
        case 'H':
          return constant_ABC_HH_Accent;
        //break;
        default:
          break;
      }
      break;
    case '+':
      if (drumType == 'H') {
        return constant_ABC_HH_Close;
      }
      break;
    case '-':
      return false;
    //break;
    default:
      break;
  }

  console.log(
    'Bad tablature note found in tablatureToABCNotationPerNote.  Tab: ' +
      tablatureChar +
      ' for drum type: ' +
      drumType
  );
  return false;
}

function abcNotationToTablaturePerNote(drumType, abcChar) {
  var tabChar = '-';

  switch (abcChar) {
    case constant_ABC_STICK_R:
      tabChar = 'R';
      break;
    case constant_ABC_STICK_L:
      tabChar = 'L';
      break;
    case constant_ABC_STICK_BOTH:
      tabChar = 'B';
      break;
    case constant_ABC_STICK_OFF:
      tabChar = '-';
      break;
    case constant_ABC_STICK_COUNT:
      tabChar = 'c';
      break;
    case constant_ABC_HH_Ride:
      tabChar = 'r';
      break;
    case constant_ABC_HH_Ride_Bell:
      tabChar = 'b';
      break;
    case constant_ABC_HH_Cow_Bell:
      tabChar = 'm';
      break;
    case constant_ABC_HH_Crash:
      tabChar = 'c';
      break;
    case constant_ABC_HH_Stacker:
      tabChar = 's';
      break;
    case constant_ABC_HH_Metronome_Normal:
      tabChar = 'n';
      break;
    case constant_ABC_HH_Metronome_Accent:
      tabChar = 'N';
      break;
    case constant_ABC_HH_Open:
      tabChar = 'o';
      break;
    case constant_ABC_HH_Close:
      tabChar = '+';
      break;
    case constant_ABC_SN_Accent:
      tabChar = 'O';
      break;
    case constant_ABC_SN_Buzz:
      tabChar = 'b';
      break;
    case constant_ABC_HH_Normal:
    case constant_ABC_SN_XStick:
      tabChar = 'x';
      break;
    case constant_ABC_SN_Ghost:
      tabChar = 'g';
      break;
    case constant_ABC_SN_Normal:
    case constant_ABC_KI_Normal:
    case constant_ABC_T1_Normal:
    case constant_ABC_T2_Normal:
    case constant_ABC_T3_Normal:
    case constant_ABC_T4_Normal:
      tabChar = 'o';
      break;
    case constant_ABC_SN_Flam:
      tabChar = 'f';
      break;
    case constant_ABC_SN_Drag:
      tabChar = 'd';
      break;
    case constant_ABC_HH_Accent:
    case constant_ABC_KI_SandK:
      tabChar = 'X';
      break;
    case constant_ABC_KI_Splash:
      tabChar = 'x';
      break;
    case constant_ABC_OFF:
      tabChar = '-';
      break;
    default:
      console.log('bad case in abcNotationToTablaturePerNote: ' + abcChar);
      break;
  }

  return tabChar;
}

export function noteArraysFromURLData(drumType, noteString, notesPerMeasure, numberOfMeasures) {
  var retArray = [];

  // decode the %7C url encoding types
  noteString = decodeURIComponent(noteString);

  var retArraySize = notesPerMeasure * numberOfMeasures;

  // ignore "|" by removing them
  //var notes = noteString.replace(/\|/g, '');
  // ignore "|" & ")" & "(" & "[" & "]" & "!" & ":" by removing them
  var notes = noteString.replace(/:|!|\)|\(|\[|\]|\|/g, '');

  var noteStringScaler = 1;
  var displayScaler = 1;
  if (notes.length > retArraySize && notes.length / retArraySize >= 2) {
    // if we encounter a 16th note groove for an 8th note board, let's scale it	down
    noteStringScaler = Math.ceil(notes.length / retArraySize);
  } else if (notes.length < retArraySize && retArraySize / notes.length >= 2) {
    // if we encounter a 8th note groove for an 16th note board, let's scale it up
    displayScaler = Math.ceil(retArraySize / notes.length);
  }

  // initialize an array that can carry all the measures in one array
  for (var i = 0; i < retArraySize; i++) {
    retArray[i] = false;
  }

  var retArrayIndex = 0;
  for (
    var j = 0;
    j < notes.length && retArrayIndex < retArraySize;
    j += noteStringScaler, retArrayIndex += displayScaler
  ) {
    retArray[retArrayIndex] = tablatureToABCNotationPerNote(drumType, notes[j]);
  }

  return retArray;
}

export function tabLineFromAbcNoteArray(
  drumType,
  noteArray,
  getAccents,
  getOthers,
  maxLength,
  separatorDistance
) {
  var returnTabLine = '';

  if (maxLength > noteArray.length) maxLength = noteArray.length;

  for (var i = 0; i < maxLength; i++) {
    var newTabChar = abcNotationToTablaturePerNote(drumType, noteArray[i]);

    if (drumType == 'H' && newTabChar == 'X') {
      if (getAccents) returnTabLine += newTabChar;
      else returnTabLine += '-';
    } else if ((drumType == 'K' || drumType == 'S') && (newTabChar == 'o' || newTabChar == 'O')) {
      if (getAccents) returnTabLine += newTabChar;
      else returnTabLine += '-';
    } else if (drumType == 'K' && newTabChar == 'X') {
      if (getAccents && getOthers)
        returnTabLine += 'X'; // kick & splash
      else if (getAccents)
        returnTabLine += 'o'; // just kick
      else returnTabLine += 'x'; // just splash
    } else {
      // all the "others"
      if (getOthers) returnTabLine += newTabChar;
      else returnTabLine += '-';
    }

    if (separatorDistance > 0 && (i + 1) % separatorDistance === 0) returnTabLine += '|';
  }

  return returnTabLine;
}

export function mergeDrumTabLines(dominateLine, subordinateLine) {
  var maxLength =
    dominateLine.length > subordinateLine.length ? dominateLine.length : subordinateLine.length;
  var newLine = '';

  for (var i = 0; i < maxLength; i++) {
    var newChar = '-';
    if (dominateLine.charAt(i) !== '') newChar = dominateLine.charAt(i);

    if (newChar == '-' && subordinateLine.charAt(i) !== '') newChar = subordinateLine.charAt(i);

    newLine += newChar;
  }

  return newLine;
}

export function GetEmptyGroove(notes_per_measure, numMeasures) {
  var retString = '';
  var oneMeasureString = '|';
  var i;

  for (i = 0; i < notes_per_measure; i++) {
    oneMeasureString += '-';
  }
  for (i = 0; i < numMeasures; i++) retString += oneMeasureString;
  retString += '|';

  return retString;
}

export function GetDefaultStickingsGroove(
  notes_per_measure,
  timeSigTop,
  timeSigBottom,
  numMeasures
) {
  return GetEmptyGroove(notes_per_measure, numMeasures);
}

export function GetDefaultHHGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  var retString = '';
  var oneMeasureString = '|';
  var i;

  for (i = 0; i < notes_per_measure; i++) {
    if (notes_per_measure == 48) oneMeasureString += '-';
    else oneMeasureString += 'x';
  }
  for (i = 0; i < numMeasures; i++) retString += oneMeasureString;
  retString += '|';

  return retString;
}

export function GetDefaultTom1Groove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  return GetEmptyGroove(notes_per_measure, numMeasures);
}

export function GetDefaultTom4Groove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  return GetEmptyGroove(notes_per_measure, numMeasures);
}

export function GetDefaultSnareGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  var retString = '';
  var oneMeasureString = '|';
  var i;
  var notes_per_grouping = notes_per_measure / timeSigTop;

  for (i = 0; i < notes_per_measure; i++) {
    // if the note falls on the beginning of a group
    // and the group is odd
    if (i % notes_per_grouping === 0 && (i / notes_per_grouping) % 2 !== 0) oneMeasureString += 'O';
    else oneMeasureString += '-';
  }
  for (i = 0; i < numMeasures; i++) retString += oneMeasureString;
  retString += '|';

  return retString;
}

export function GetDefaultKickGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  var retString = '';
  var oneMeasureString = '|';
  var i;
  var notes_per_grouping = notes_per_measure / timeSigTop;

  for (i = 0; i < notes_per_measure; i++) {
    // if the note falls on the beginning of a group
    // and the group is even
    if (i % notes_per_grouping === 0 && (i / notes_per_grouping) % 2 === 0) oneMeasureString += 'o';
    else oneMeasureString += '-';
  }
  for (i = 0; i < numMeasures; i++) retString += oneMeasureString;
  retString += '|';

  return retString;
}

export function GetDefaultTomGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
  return GetEmptyGroove(notes_per_measure, numMeasures);
}

export function create_note_mapping_array_for_highlighting(
  HH_array,
  snare_array,
  kick_array,
  toms_array,
  num_notes
) {
  var mapping_array = new Array(num_notes); // create large empty array

  for (var i = 0; i < num_notes; i++) {
    if (
      (HH_array && HH_array[i] !== false) ||
      (snare_array && snare_array[i] !== false) ||
      (kick_array && kick_array[i] !== false)
    ) {
      mapping_array[i] = true;
    } else {
      mapping_array[i] = false;

      // check toms as well with for loop
      if (toms_array) {
        for (var j = 0; j < constant_NUMBER_OF_TOMS; j++) {
          if (toms_array[j][i] !== undefined && toms_array[j][i] !== false) mapping_array[i] = true;
        }
      }
    }
  }

  return mapping_array;
}

export function figure_out_sticking_count_for_index(
  index,
  notes_per_measure,
  sub_division,
  time_sig_bottom
) {
  // figure out the count state by looking at the id and the subdivision
  var note_index = index % notes_per_measure;
  var new_state = 0;
  // 4/2 time changes the implied time from 4 up to 8, etc
  // 6/8 time changes the implied time from 8 down to 4
  var implied_sub_division = sub_division * (4 / time_sig_bottom);
  switch (implied_sub_division) {
    case 4:
      new_state = note_index + 1; // 1,2,3,4,5, etc.
      break;
    case 8:
      if (note_index % 2 === 0)
        new_state = Math.floor(note_index / 2) + 1; // 1,2,3,4,5, etc.
      else new_state = '&';
      break;
    case 12: // 8th triplets
      if (note_index % 3 === 0)
        new_state = Math.floor(note_index / 3) + 1; // 1,2,3,4,5, etc.
      else if (note_index % 3 == 1) new_state = '&';
      else new_state = 'a';
      break;
    case 24: // 16th triplets
      if (note_index % 3 === 0)
        new_state = Math.floor(note_index / 6) + 1; // 1,2,3,4,5, etc.
      else if (note_index % 3 == 1) new_state = '&';
      else new_state = 'a';
      break;
    case 48: // 32nd triplets
      if (note_index % 3 === 0)
        new_state = Math.floor(note_index / 12) + 1; // 1,2,3,4,5, etc.
      else if (note_index % 3 == 1) new_state = '&';
      else new_state = 'a';
      break;
    case 16:
    case 32: // fall through
    default:
      var whole_note_interval = implied_sub_division / 4;
      if (note_index % 4 === 0)
        new_state = Math.floor(note_index / whole_note_interval) + 1; // 1,1,2,2,3,3,4,4,5,5, etc.
      else if (note_index % 4 === 1) new_state = 'e';
      else if (note_index % 4 === 2) new_state = '&';
      else new_state = 'a';
      break;
  }

  return new_state;
}

export function convert_sticking_counts_to_actual_counts(
  sticking_array,
  time_division,
  timeSigTop,
  timeSigBottom
) {
  var cur_div_of_array = 32;
  if (isTripletDivision(time_division)) cur_div_of_array = 48;

  var actual_notes_per_measure_in_this_array = calc_notes_per_measure(
    cur_div_of_array,
    timeSigTop,
    timeSigBottom
  );

  // Time division is 4, 8, 16, 32, 12, 24, or 48
  var notes_per_measure_in_time_division = (time_division / 4) * timeSigTop * (4 / timeSigBottom);

  for (var i in sticking_array) {
    if (sticking_array[i] == constant_ABC_STICK_COUNT) {
      // convert the COUNT into an actual letter or number
      // convert the index into what it would have been if the array was "notes_per_measure" sized
      var adjusted_index = Math.floor(
        i / (actual_notes_per_measure_in_this_array / notes_per_measure_in_time_division)
      );
      var new_count = figure_out_sticking_count_for_index(
        adjusted_index,
        notes_per_measure_in_time_division,
        time_division,
        timeSigBottom
      );
      var new_count_string = '"' + new_count + '"x';
      sticking_array[i] = new_count_string;
    }
  }
}
