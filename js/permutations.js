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
} from './constants.js';

export function get_permutation_pre_ABC(section) {
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

export function get_permutation_post_ABC(section, usingTriplets) {
  var abc = '';

  switch (section) {
    case 0:
      abc += '|\n';
      break;
    case 1:
      abc += '\\\n';
      break;
    case 2:
      abc += '\n';
      break;
    case 3:
      if (usingTriplets) abc += '|\n';
      else abc += '\\\n';
      break;
    case 4:
      abc += '|\n';
      break;
    case 5:
      abc += '\\\n';
      break;
    case 6:
      abc += '\n';
      break;
    case 7:
      if (usingTriplets) abc += '|\n';
      else abc += '\\\n';
      break;
    case 8:
      abc += '|\n';
      break;
    case 9:
      abc += '\\\n';
      break;
    case 10:
      abc += '|\n';
      break;
    case 11:
      if (usingTriplets) abc += '|\n';
      else abc += '\\\n';
      break;
    case 12:
      abc += '\n';
      break;
    case 13:
      abc += '\\\n';
      break;
    case 14:
      abc += '|\n';
      break;
    case 15:
      abc += '|\n';
      break;
    default:
      abc += '\nT: Error: No index passed\n';
      break;
  }

  return abc;
}

// Module-private generators — reached only via the two get_kick16th_* dispatchers.
function get_kick16th_minus_some_strait_permutation_array(section) {
  var kick_array;

  switch (section) {
    case 0:
      kick_array = [
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
      break;
    case 1:
      kick_array = [
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ];
      break;
    case 2:
      kick_array = [
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
      ];
      break;
    case 3:
      kick_array = [
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
      ];
      break;
    case 4:
      kick_array = [
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
      ];
      break;
    case 5:
      kick_array = [
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
      ];
      break;
    case 6:
      kick_array = [
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
      ];
      break;
    case 7:
      kick_array = [
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
      ];
      break;
    case 8:
      kick_array = [
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
      ];
      break;
    case 9: // downbeats
      kick_array = [
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
      ];
      break;
    case 10: // upbeats
      kick_array = [
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
      ];
      break;
    case 11:
      kick_array = [
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
      ];
      break;
    case 12:
      kick_array = [
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
      ];
      break;
    case 13:
      kick_array = [
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
      ];
      break;
    case 14:
      kick_array = [
        false,
        false,
        false,
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        false,
        false,
        'F',
        false,
      ];
      break;
    case 15:
    /* falls through */
    default:
      kick_array = [
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
        'F',
        false,
      ];
      break;
  }

  return kick_array;
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
        return (kick_array = [
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
        ]);
      case 12:
        return (kick_array = [
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
        ]);
      case 13:
        return (kick_array = [
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
        ]);
      case 14:
        return (kick_array = [
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
          'F',
          false,
          'F',
          false,
          false,
          false,
          'F',
          false,
        ]);
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
