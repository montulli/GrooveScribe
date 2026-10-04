// Permutation engine (Step 4 extraction from groove_writer.js).
//
// Pure combinatorial generators for the "permutation" practice modes: they build
// note arrays (and the ABC section boilerplate) for each permutation section.
// These functions carry no state — callers that vary by time division pass the
// current `usingTriplets` flag in. The stateful/DOM parts of the permutation
// UI (shouldDisplayPermutationForSection, get_numberOfActivePermutationSections)
// stay in GrooveWriter, which delegates its own methods here.

import {
  constant_ABC_SN_Normal,
  constant_ABC_SN_Accent,
  constant_ABC_SN_Ghost,
  constant_ABC_SN_Buzz,
  constant_ABC_KI_Normal,
  constant_ABC_KI_SandK,
  constant_ABC_KI_Splash,
} from './constants.js';

// Sections that print together under one heading (e.g. "Singles" = sections 1-4).
// Section 0 (ostinato) and 15 (quads) stand alone and already carry their own heading/closing bar.
const PERMUTATION_GROUPS = [
  { title: 'Singles', first: 1, last: 4 },
  { title: 'Doubles', first: 5, last: 8 },
  { title: 'Down/Up Beats', first: 9, last: 10 },
  { title: 'Triples', first: 11, last: 14 },
];

// For a displayed section, decide whether it is the first / last *displayed* section of its
// group. isActive(section) says whether a section is currently displayed. When the user
// unticks the first sub-option the heading must move to the next displayed section, and when
// they untick the last one the group must still be closed with a bar line.
export function get_permutation_display_flags(section, isActive) {
  const group = PERMUTATION_GROUPS.find((g) => section >= g.first && section <= g.last);
  if (!group) return { showTitle: false, isLast: false };

  let showTitle = true;
  let isLast = true;
  for (let i = group.first; i < section; i++) if (isActive(i)) showTitle = false;
  for (let i = section + 1; i <= group.last; i++) if (isActive(i)) isLast = false;
  return { showTitle, isLast };
}

export function get_permutation_pre_ABC(section, showTitle) {
  const abc = pre_ABC_for_section(section);
  if (!showTitle || abc.startsWith('T: ')) return abc;

  const group = PERMUTATION_GROUPS.find((g) => section >= g.first && section <= g.last);
  return group ? 'T: \nP: ' + group.title + '\n' + abc : abc;
}

function pre_ABC_for_section(section) {
  var abc = '';

  switch (section) {
    case 0:
      abc += 'P:Ostinato\n%\n%\n%Just the Ositnato\n';
      break;
    case 1:
      abc += 'T: \nP: Singles\n%\n%\n% singles on the "1"\n%\n';
      break;
    case 2:
      abc += '%\n%\n% singles on the "e"\n%\n';
      break;
    case 3:
      abc += '%\n%\n% singles on the "&"\n%\n';
      break;
    case 4:
      abc += '%\n%\n% singles on the "a"\n%\n';
      break;
    case 5:
      abc += 'T: \nP: Doubles\n%\n%\n% doubles on the "1"\n%\n';
      break;
    case 6:
      abc += '%\n%\n% doubles on the "e"\n%\n';
      break;
    case 7:
      abc += '%\n%\n% doubles on the "&"\n%\n';
      break;
    case 8:
      abc += '%\n%\n% doubles on the "a"\n%\n';
      break;
    case 9:
      abc += 'T: \nP: Down/Up Beats\n%\n%\n% upbeats on the "1"\n%\n';
      break;
    case 10:
      abc += '%\n%\n% downbeats on the "e"\n%\n';
      break;
    case 11:
      abc += 'T: \nP: Triples\n%\n%\n% triples on the "1"\n%\n';
      break;
    case 12:
      abc += '%\n%\n% triples on the "e"\n%\n';
      break;
    case 13:
      abc += '%\n%\n% triples on the "&"\n%\n';
      break;
    case 14:
      abc += '%\n%\n% triples on the "a"\n%\n';
      break;
    case 15:
      abc += 'T: \nP: Quads\n%\n%\n% quads\n%\n';
      break;
    default:
      abc += '\nT: Error: No index passed\n';
      break;
  }

  return abc;
}

// What ends each permutation section in the ABC: a bar line, a line continuation (the
// next section shares the staff line) or a plain newline. The sections that end a
// beat group of four (3, 7, 11) take a bar line only for triplets.
const BAR = '|\n';
const CONTINUE = '\\\n';
const NEWLINE = '\n';
const POST_ABC_BY_SECTION = [
  BAR, // 0
  CONTINUE, // 1
  NEWLINE, // 2
  null, // 3: triplet dependent
  BAR, // 4
  CONTINUE, // 5
  NEWLINE, // 6
  null, // 7: triplet dependent
  BAR, // 8
  CONTINUE, // 9
  BAR, // 10
  null, // 11: triplet dependent
  NEWLINE, // 12
  CONTINUE, // 13
  BAR, // 14
  BAR, // 15
];

export function get_permutation_post_ABC(section, usingTriplets, isLast) {
  if (isLast) return BAR;

  const abc = POST_ABC_BY_SECTION[section];
  if (abc === undefined) return '\nT: Error: No index passed\n';
  if (abc === null) return usingTriplets ? BAR : CONTINUE;
  return abc;
}

// Kick patterns for the strait (non-triplet) permutation sections, one 32nd-note
// pattern per section: 'F' is a hi-hat-foot kick, '.' is a rest. Section 15 is also
// the fallback for any other section number.
const MINUS_SOME_STRAIT_PATTERNS = [
  '................................', // 0
  'F.......F.......F.......F.......', // 1
  '..F.......F.......F.......F.....', // 2
  '....F.......F.......F.......F...', // 3
  '......F.......F.......F.......F.', // 4
  'F.F.....F.F.....F.F.....F.F.....', // 5
  '..F.F.....F.F.....F.F.....F.F...', // 6
  '....F.F.....F.F.....F.F.....F.F.', // 7
  '......F.F.....F.F.....F.F.....F.', // 8
  'F...F...F...F...F...F...F...F...', // 9
  '..F...F...F...F...F...F...F...F.', // 10
  'F.F.F...F.F.F...F.F.F...F.F.F...', // 11
  '..F.F.F...F.F.F...F.F.F...F.F.F.', // 12
  '....F.F.F...F.F.F...F.F.F...F.F.', // 13
  '......F.F.F...F.F.F...F.F.F...F.', // 14
  'F.F.F.F.F.F.F.F.F.F.F.F.F.F.F.F.', // 15
];

// Module-private generators — reached only via the two get_kick16th_* dispatchers.
function kickArrayFromPattern(pattern) {
  return [...pattern].map((c) => (c === 'F' ? 'F' : false));
}

function get_kick16th_minus_some_strait_permutation_array(section) {
  return kickArrayFromPattern(
    MINUS_SOME_STRAIT_PATTERNS[section] ?? MINUS_SOME_STRAIT_PATTERNS[15]
  );
}

function get_kick16th_strait_permutation_array(section) {
  var kick_array = [];
  for (var index = 0; index < 32; index++) {
    switch (section) {
      case 0:
        // no notes on
        kick_array.push(false);
        break;
      case 1:
        // every 0th note of 8
        kick_array.push(index % 8 ? false : 'F');
        break;
      case 2:
        // every 2nd note of 8
        kick_array.push((index - 2) % 8 ? false : 'F');
        break;
      case 3:
        // every 4nd note of 8
        kick_array.push((index - 4) % 8 ? false : 'F');
        break;
      case 4:
        // every 6nd note of 8
        kick_array.push((index - 6) % 8 ? false : 'F');
        break;
      case 5:
        // every 0th and 2nd
        if (index % 8 == 0) kick_array.push('F');
        else if ((index - 2) % 8 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 6:
        // every 2nd & 4th
        if ((index - 2) % 8 == 0) kick_array.push('F');
        else if ((index - 4) % 8 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 7:
        // every 4th & 6th
        if ((index - 4) % 8 == 0) kick_array.push('F');
        else if ((index - 6) % 8 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 8:
        // every 0th & 6th
        if ((index - 0) % 8 == 0) kick_array.push('F');
        else if ((index - 6) % 8 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 9: // downbeats
        // every 0th note of 4
        kick_array.push(index % 4 ? false : 'F');
        break;
      case 10: // upbeats
        // every 2nd note of 4
        kick_array.push((index - 2) % 4 ? false : 'F');
        break;
      case 11:
        return kickArrayFromPattern('F.F.F...F.F.F...F.F.F...F.F.F...');
      case 12:
        return kickArrayFromPattern('..F.F.F...F.F.F...F.F.F...F.F.F.');
      case 13:
        return kickArrayFromPattern('F...F.F.F...F.F.F...F.F.F...F.F.');
      case 14:
        return kickArrayFromPattern('F.F...F.F.F...F.F.F...F.F.F...F.');
      case 15:
      /* falls through */
      default:
        // every 0th note of 2  (quads)
        kick_array.push(index % 2 ? false : 'F');
        break;
    }
  }

  console.log(kick_array);
  return kick_array;
}

function get_kick16th_triplets_permutation_array(section) {
  var kick_array = [];
  for (var index = 0; index < 48; index++) {
    switch (section) {
      case 0:
        // no notes on
        kick_array.push(false);
        break;
      case 1:
        // every 0th note of 12
        kick_array.push(index % 12 ? false : 'F');
        break;
      case 2:
        // every 4th note of 12
        kick_array.push((index - 4) % 12 ? false : 'F');
        break;
      case 3:
        // every 8th note of 12
        kick_array.push((index - 8) % 12 ? false : 'F');
        break;

      case 5:
        // every 0th and 4th
        if (index % 12 == 0) kick_array.push('F');
        else if ((index - 4) % 12 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 6:
        // every 4th && 8th
        if ((index - 4) % 12 == 0) kick_array.push('F');
        else if ((index - 8) % 12 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
      case 7:
        // every 0th and 8th
        if (index % 12 == 0) kick_array.push('F');
        else if ((index - 8) % 12 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;

      // these cases should not be called
      case 4: // 4th single
      case 8: // 4th double
      case 9: // 1st up/down
      case 10: // 2nd up/down
      case 12: // 2nd triplet
      case 13: // 3nd triplet
      case 14: // 4nd triplet
      case 15: // 1st Quad
        console.log('bad case in get_kick16th_triplets_permutation_array_for_16ths()');
        break;

      case 11: // first triplet
      /* falls through */
      default:
        // use default
        // every 4th note
        if (index % 4 == 0) kick_array.push('F');
        else kick_array.push(false);
        break;
    }
  }
  return kick_array;
}

export function get_kick16th_permutation_array(section, usingTriplets) {
  if (usingTriplets) {
    return get_kick16th_triplets_permutation_array(section);
  }

  return get_kick16th_strait_permutation_array(section);
}

export function get_kick16th_permutation_array_minus_some(section, usingTriplets) {
  if (usingTriplets) {
    // triplets never skip any: delegate
    return get_kick16th_permutation_array(section, usingTriplets);
  }

  return get_kick16th_minus_some_strait_permutation_array(section);
}

export function get_snare_permutation_array(section, usingTriplets) {
  // its the same as the 16th kick permutation, but with different notes
  var snare_array = get_kick16th_permutation_array(section, usingTriplets);

  // turn the kicks into snares
  for (var i = 0; i < snare_array.length; i++) {
    if (snare_array[i] !== false) snare_array[i] = constant_ABC_SN_Normal;
  }

  return snare_array;
}

export function get_snare_accent_permutation_array(section, usingTriplets) {
  // its the same as the 16th kick permutation, but with different notes
  var snare_array = get_kick16th_permutation_array(section, usingTriplets);

  if (section > 0) {
    // Don't convert notes for the first measure since it is the ostinado
    for (var i = 0; i < snare_array.length; i++) {
      if (snare_array[i] !== false) snare_array[i] = constant_ABC_SN_Accent;
      else if (i % 2 === 0)
        // all other even notes are ghosted snares
        snare_array[i] = constant_ABC_SN_Ghost;
    }
  }

  return snare_array;
}

export function get_snare_accent_with_diddle_permutation_array(section, usingTriplets) {
  // its the same as the 16th kick permutation, but with different notes
  var snare_array = get_kick16th_permutation_array(section, usingTriplets);

  if (section > 0) {
    // Don't convert notes for the first measure since it is the ostinado
    for (var i = 0; i < snare_array.length; i++) {
      if (snare_array[i] !== false) {
        snare_array[i] = constant_ABC_SN_Buzz;
        i++; // the next one is not diddled  (leave it false)
      } else {
        // all other even notes are diddled, which means 32nd notes
        snare_array[i] = constant_ABC_SN_Ghost;
      }
    }
  }

  return snare_array;
}

export function get_numSectionsFor_permutation_array() {
  var numSections = 16;

  /*)
		if(usingTriplets()) {
		numSections = 8;
		} else {
		numSections = 16;
		}
		 */

  return numSections;
}

// Reduce a kick array to just its splash notes (used when merging a permutation
// kick line on top of the ostinato). Pure.
export function filter_kick_array_for_permutation(old_kick_array) {
  var new_kick_array = [];

  for (var i in old_kick_array) {
    if (old_kick_array[i] == constant_ABC_KI_Splash || old_kick_array[i] == constant_ABC_KI_SandK)
      new_kick_array.push(constant_ABC_KI_Splash);
    else new_kick_array.push(false);
  }

  return new_kick_array;
}

// merge 2 kick arrays
//  4 possible states
//  false   (off)
//  constant_ABC_KI_Normal
//  constant_ABC_KI_SandK
//  constant_ABC_KI_Splash
export function merge_kick_arrays(primary_kick_array, secondary_kick_array) {
  var new_kick_array = [];

  for (var i in primary_kick_array) {
    switch (primary_kick_array[i]) {
      case false:
        new_kick_array.push(secondary_kick_array[i]);
        break;

      case constant_ABC_KI_SandK:
        new_kick_array.push(constant_ABC_KI_SandK);
        break;

      case constant_ABC_KI_Normal:
        if (
          secondary_kick_array[i] == constant_ABC_KI_SandK ||
          secondary_kick_array[i] == constant_ABC_KI_Splash
        )
          new_kick_array.push(constant_ABC_KI_SandK);
        else new_kick_array.push(constant_ABC_KI_Normal);
        break;

      case constant_ABC_KI_Splash:
        if (
          secondary_kick_array[i] == constant_ABC_KI_Normal ||
          secondary_kick_array[i] == constant_ABC_KI_SandK
        )
          new_kick_array.push(constant_ABC_KI_SandK);
        else new_kick_array.push(constant_ABC_KI_Splash);
        break;

      default:
        console.log('bad case in merge_kick_arrays()');
        new_kick_array.push(primary_kick_array[i]);
        break;
    }
  }

  return new_kick_array;
}
