// ABC-notation generation (Step 2 extraction from groove_utils.js).
// The public functions take a GrooveUtils instance (gu) for the note-scaling /
// triplet / sticking-count helpers that remain in GrooveUtils; the internal
// helpers below are pure. GrooveUtils delegates its ABC methods here.

import { constant_NUMBER_OF_TOMS } from './constants.js';
import {
  isTripletDivisionFromNotesPerMeasure,
  notesPerMeasureInFullSizeArray,
  scaleNoteArrayToFullSize,
} from './musicMath.js';
import {
  create_note_mapping_array_for_highlighting,
  convert_sticking_counts_to_actual_counts,
} from './noteArrays.js';

function moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, modifier_to_look_for) {
  var found_modifier = false;
  var rindex = abcNoteStrings.notes1.lastIndexOf(modifier_to_look_for);
  if (rindex > -1) {
    found_modifier = true;
    abcNoteStrings.notes1 = abcNoteStrings.notes1.replace(modifier_to_look_for, '');
  }
  rindex = abcNoteStrings.notes2.lastIndexOf(modifier_to_look_for);
  if (rindex > -1) {
    found_modifier = true;
    abcNoteStrings.notes2 = abcNoteStrings.notes2.replace(modifier_to_look_for, '');
  }
  rindex = abcNoteStrings.notes3.lastIndexOf(modifier_to_look_for);
  if (rindex > -1) {
    found_modifier = true;
    abcNoteStrings.notes3 = abcNoteStrings.notes3.replace(modifier_to_look_for, '');
  }
  if (found_modifier) return modifier_to_look_for;

  return ''; // didn't find it so return nothing
}

function testArrayOfArraysForEquality(array_of_arrays, test_index, test_value) {
  for (var i = 0; i < array_of_arrays.length; i++) {
    if (
      array_of_arrays[i][test_index] !== undefined &&
      array_of_arrays[i][test_index] !== test_value
    )
      return false;
  }

  return true;
}

function getABCforNote(note_array_of_arrays, start_index, end_of_group, scaler) {
  var ABC_String = '';
  var abcNoteStrings = {
    notes1: '',
    notes2: '',
    notes3: '',
  };
  var num_notes_on = 0;
  var nextCount;

  for (var which_array = 0; which_array < note_array_of_arrays.length; which_array++) {
    if (
      note_array_of_arrays[which_array][start_index] !== undefined &&
      note_array_of_arrays[which_array][start_index] !== false
    ) {
      // look ahead and see when the next note is
      // the length of this note is dependant on when the next note lands
      // for every empty space we increment nextCount, and then make the note that long
      nextCount = 1;
      for (var indexA = start_index + 1; indexA < start_index + end_of_group; indexA++) {
        if (!testArrayOfArraysForEquality(note_array_of_arrays, indexA, false)) {
          break;
        } else {
          nextCount++;
        }
      }

      abcNoteStrings.notes1 += note_array_of_arrays[which_array][start_index] + scaler * nextCount;
      num_notes_on++;
    }
  }

  if (num_notes_on > 1) {
    // if multiple are on, we need to combine them with []
    // horrible hack.  Turns out ABC will render the accents wrong unless the are outside the brackets []
    // look for any accents that are delimited by "!"  (eg !accent!  or !plus!)
    // move the accents to the front
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '!accent!');
    // in case there are two accents (on both snare and hi-hat) we remove the second one
    moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '!accent!');
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '!plus!');
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '!open!');
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '!///!');

    // Look for '[' and ']'.   They are added on to the the kick and splash and could be added to other notes
    // in the future.   They imply that the notes are on the same beat.   Since we are already putting multiple
    // notes on the same beat (see code below this line that adds '[' & ']'), we need to remove them or the
    // resulting ABC will be invalid
    moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '[');
    moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, ']');

    // this is the flam notation, it can't be in a sub grouping
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '{/c}');
    // this is the drag notation, it can't be in a sub grouping
    ABC_String += moveAccentsOrOtherModifiersOutsideOfGroup(abcNoteStrings, '{/cc}');

    ABC_String += '[' + abcNoteStrings.notes1 + abcNoteStrings.notes2 + abcNoteStrings.notes3 + ']'; // [^gc]
  } else {
    ABC_String += abcNoteStrings.notes1 + abcNoteStrings.notes2 + abcNoteStrings.notes3; // note this could be a noOp if all strings are blank
  }

  return ABC_String;
}

function getABCforRest(note_array_of_arrays, start_index, end_of_group, scaler, use_hidden_rest) {
  var ABC_String = '';

  // count the # of rest
  if (testArrayOfArraysForEquality(note_array_of_arrays, start_index, false)) {
    var restCount = 1;
    for (var indexB = start_index + 1; indexB < start_index + end_of_group; indexB++) {
      if (!testArrayOfArraysForEquality(note_array_of_arrays, indexB, false)) break;
      else restCount++;
    }

    // now output a rest for the duration of the rest count
    if (use_hidden_rest) ABC_String += 'x' + scaler * restCount;
    else ABC_String += 'z' + scaler * restCount;
  }

  return ABC_String;
}

function abc_gen_note_grouping_size(usingTriplets, timeSigTop, timeSigBottom) {
  var note_grouping;

  if (usingTriplets) {
    note_grouping = 12;
  } else if (timeSigTop == 3) {
    // 3/4, 3/8, 3/16
    note_grouping = 8 * (4 / timeSigBottom);
  } else if (timeSigTop % 6 == 0 && timeSigBottom % 8 == 0) {
    // 3/4, 6/8, 9/8, 12/8
    note_grouping = 12 * (8 / timeSigBottom);
  } else {
    //note_grouping = 8 * (4/timeSigBottom);
    note_grouping = 8;
  }

  return note_grouping;
}

function count_active_notes_in_arrays(array_of_arrays, start_index, how_far_to_measure) {
  var num_active_notes = 0;

  for (var i = start_index; i < start_index + how_far_to_measure; i++) {
    for (var which_array = 0; which_array < array_of_arrays.length; which_array++) {
      if (array_of_arrays[which_array][i] !== false) {
        num_active_notes++;
        which_array = array_of_arrays.length; // exit this inner for loop immediately
      }
    }
  }

  return num_active_notes;
}

function snare_HH_kick_ABC_for_triplets(
  sticking_array,
  HH_array,
  snare_array,
  kick_array,
  toms_array,
  post_voice_abc,
  num_notes,
  sub_division,
  notes_per_measure,
  kick_stems_up,
  timeSigTop,
  timeSigBottom,
  numberOfMeasuresPerLine
) {
  var scaler = 1; // we are always in 48 notes here, and the ABC needs to think we are in 48 since the specified division is 1/32
  var ABC_String = '';
  var stickings_voice_string = 'V:Stickings\n';
  var hh_snare_voice_string = 'V:Hands stem=up\n%%voicemap drum\n';
  var kick_voice_string = 'V:Feet stem=down\n%%voicemap drum\n';
  var all_drum_array_of_array;

  // console.log(HH_array);
  // console.log(kick_array);
  // console.log(notes_per_measure);
  // console.log(sub_division);

  if (kick_stems_up) {
    all_drum_array_of_array = [snare_array, HH_array, kick_array];
  } else {
    all_drum_array_of_array = [snare_array, HH_array]; // exclude the kick
  }
  if (toms_array) all_drum_array_of_array = all_drum_array_of_array.concat(toms_array);

  // occationally we will change the sub_division output to 1/8th or 1/16th notes when we detect a beat that is better displayed that way
  // By default we use the base sub_division but this can be set different below
  var faker_sub_division = sub_division;

  for (var i = 0; i < num_notes; i++) {
    // triplets are special.  We want to output a note or a rest for every space of time
    // 8th note triplets should always use rests
    // end_of_group should be
    //  "4" for 1/8th note triplets
    //  "2" for 1/16th note triplets
    //  "1" for 1/32nd note triplets.
    var end_of_group = 48 / faker_sub_division;
    var grouping_size_for_rests = end_of_group;
    var skip_adding_more_notes = false;

    if ((i % notes_per_measure) + end_of_group > notes_per_measure) {
      // if we are in an odd time signature then the last few notes will have a different grouping to reach the end of the measure
      end_of_group = notes_per_measure - (i % num_notes);
    }

    if (i % abc_gen_note_grouping_size(true, timeSigTop, timeSigBottom) === 0) {
      // Look for some special cases that will format beats as non triplet groups.   Quarter notes, 1/8th and 1/16th notes only.

      // look for a whole beat of rests
      if (0 == count_active_notes_in_arrays(all_drum_array_of_array, i, 12)) {
        // there are no notes in the next beat.   Let's output a special string for a quarter note rest
        skip_adding_more_notes = true;
        stickings_voice_string += 'x8';
        hh_snare_voice_string += 'z8'; // quarter note rest
        i += 11; // skip past all the rests

        // look for 1/4 note with no triplets  "x--"
      } else if (0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 1, 11)) {
        // code duplicated from below
        // clear any invalid stickings since they will mess up the formatting greatly
        for (var si = i + 1; si < i + 12; si++) sticking_array[si] = false;
        stickings_voice_string += getABCforRest([sticking_array], i, 8, scaler, true);
        stickings_voice_string += getABCforNote([sticking_array], i, 8, scaler);

        if (kick_stems_up) {
          hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, 8, scaler);
          kick_voice_string = '';
        } else {
          hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, 8, scaler);
          kick_voice_string += getABCforNote([kick_array], i, 8, scaler);
        }

        skip_adding_more_notes = true;
        i += 11; // skip past to the next beat

        // look for two 1/8 notes with no triplets in 1/16th & 1/32nd note triplets.   "x--x--", "x-----x-----"
      } else if (
        sub_division > 12 &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 1, 5) &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 7, 5)
      ) {
        // think of the 1/8 notes as two groups of 3 notes
        for (var eighth_index = i; eighth_index <= i + 6; eighth_index += 6) {
          // code duplicated from below
          // clear any invalid stickings since they will mess up the formatting greatly
          for (si = eighth_index + 1; si < eighth_index + 6; si++) sticking_array[si] = false;
          stickings_voice_string += getABCforRest([sticking_array], eighth_index, 4, scaler, true);
          stickings_voice_string += getABCforNote([sticking_array], eighth_index, 4, scaler);

          if (kick_stems_up) {
            hh_snare_voice_string += getABCforRest(
              all_drum_array_of_array,
              eighth_index,
              4,
              scaler,
              false
            );
            hh_snare_voice_string += getABCforNote(
              all_drum_array_of_array,
              eighth_index,
              4,
              scaler
            );
            kick_voice_string = '';
          } else {
            hh_snare_voice_string += getABCforRest(
              all_drum_array_of_array,
              eighth_index,
              4,
              scaler,
              false
            );
            hh_snare_voice_string += getABCforNote(
              all_drum_array_of_array,
              eighth_index,
              4,
              scaler
            );
            kick_voice_string += getABCforNote([kick_array], eighth_index, 4, scaler);
          }
        }

        skip_adding_more_notes = true;
        i += 11; // skip past to the next beat

        // look for 1/16th notes with no triplets in 1/32nd note triplets.   "x--x--"
      } else if (
        sub_division == 48 &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 1, 2) &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 4, 2) &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 7, 2) &&
        0 == count_active_notes_in_arrays(all_drum_array_of_array, i + 10, 2)
      ) {
        // think of the 1/8 notes as two groups of 3 notes
        for (eighth_index = i; eighth_index <= i + 9; eighth_index += 3) {
          // code duplicated from below
          // clear any invalid stickings since they will mess up the formatting greatly
          for (si = eighth_index + 1; si < eighth_index + 3; si++) sticking_array[si] = false;
          stickings_voice_string += getABCforRest([sticking_array], eighth_index, 2, scaler, true);
          stickings_voice_string += getABCforNote([sticking_array], eighth_index, 2, scaler);

          if (kick_stems_up) {
            hh_snare_voice_string += getABCforRest(
              all_drum_array_of_array,
              eighth_index,
              2,
              scaler,
              false
            );
            hh_snare_voice_string += getABCforNote(
              all_drum_array_of_array,
              eighth_index,
              2,
              scaler
            );
            kick_voice_string = '';
          } else {
            hh_snare_voice_string += getABCforRest(
              all_drum_array_of_array,
              eighth_index,
              2,
              scaler,
              false
            );
            hh_snare_voice_string += getABCforNote(
              all_drum_array_of_array,
              eighth_index,
              2,
              scaler
            );
            kick_voice_string += getABCforNote([kick_array], eighth_index, 2, scaler);
          }
        }

        skip_adding_more_notes = true;
        i += 11; // skip past to the next beat
      } else {
        // the normal case.   We tell ABC that we are using a triplet
        var notes_in_triplet_group = sub_division / 4; // 4 beats

        // look through the notes and see if we should "fake" 1/8 or 1/6th note triplets
        // If the groove can be expressed in "3" or "6" groups it is way easier to read than in a higher "12" group with rests
        // "3" looks like "x---x---x---"   one note and three rests
        // "6" looks like "x-x-x-x-x-x-"   one note and one rest
        if (sub_division == 48) {
          var can_fake_threes = true;
          var can_fake_sixes = true;
          for (var j = i; j < i + 12; j += 4) {
            if (0 < count_active_notes_in_arrays(all_drum_array_of_array, j + 1, 3)) {
              can_fake_threes = false;
            }
            if (
              0 < count_active_notes_in_arrays(all_drum_array_of_array, j + 1, 1) ||
              0 < count_active_notes_in_arrays(all_drum_array_of_array, j + 3, 1)
            ) {
              can_fake_sixes = false;
            }
            if (can_fake_threes == false && can_fake_sixes == false) break; // skip the rest, since we have an answer already
          }

          // reset

          if (can_fake_threes) faker_sub_division = 12;
          else if (can_fake_sixes) faker_sub_division = 24;
          else faker_sub_division = sub_division; // reset

          end_of_group = 48 / faker_sub_division;
          grouping_size_for_rests = end_of_group;
          notes_in_triplet_group = faker_sub_division / 4; // 4 beats
        }

        // creates the 3, 6 or 12 over the note grouping
        // looks like (3:3:3 or (6:6:6 or (12:12:12
        hh_snare_voice_string +=
          '(' +
          notes_in_triplet_group +
          ':' +
          notes_in_triplet_group +
          ':' +
          notes_in_triplet_group;
      }
    }

    // skip the code to add notes
    // Happens for special_rest when there are no notes for the next whole beat.
    // Happens when we found only a 1/4 or 1/8 note instead of triplets
    if (!skip_adding_more_notes) {
      if (i % grouping_size_for_rests === 0) {
        // we will output a rest for each place there could be a note
        stickings_voice_string += getABCforRest(
          [sticking_array],
          i,
          grouping_size_for_rests,
          scaler,
          true
        );

        if (kick_stems_up) {
          hh_snare_voice_string += getABCforRest(
            all_drum_array_of_array,
            i,
            grouping_size_for_rests,
            scaler,
            false
          );
          kick_voice_string = '';
        } else {
          hh_snare_voice_string += getABCforRest(
            all_drum_array_of_array,
            i,
            grouping_size_for_rests,
            scaler,
            false
          );
          kick_voice_string += getABCforRest(
            [kick_array],
            i,
            grouping_size_for_rests,
            scaler,
            true
          );
        }
      }

      stickings_voice_string += getABCforNote([sticking_array], i, end_of_group, scaler);

      if (kick_stems_up) {
        hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, end_of_group, scaler);
        kick_voice_string = '';
      } else {
        hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, end_of_group, scaler);
        kick_voice_string += getABCforNote([kick_array], i, end_of_group, scaler);
      }
    }

    if (
      i % abc_gen_note_grouping_size(true, timeSigTop, timeSigBottom) ==
      abc_gen_note_grouping_size(true, timeSigTop, timeSigBottom) - 1
    ) {
      stickings_voice_string += ' ';
      hh_snare_voice_string += ' '; // Add a space to break the bar line every group notes
      kick_voice_string += ' ';
    }

    // add a bar line every measure
    if ((i + 1) % (12 * timeSigTop * (4 / timeSigBottom)) === 0) {
      stickings_voice_string += '|';
      hh_snare_voice_string += '|';
      kick_voice_string += '|';

      // add a line break every numberOfMeasuresPerLine measures
      if (
        i < num_notes - 1 &&
        (i + 1) % (12 * timeSigTop * (4 / timeSigBottom) * numberOfMeasuresPerLine) === 0
      ) {
        stickings_voice_string += '\n';
        hh_snare_voice_string += '\n';
        kick_voice_string += '\n';
      }
    }
  }

  if (kick_stems_up)
    ABC_String += stickings_voice_string + post_voice_abc + hh_snare_voice_string + post_voice_abc;
  else
    ABC_String +=
      stickings_voice_string +
      post_voice_abc +
      hh_snare_voice_string +
      post_voice_abc +
      kick_voice_string +
      post_voice_abc;

  return ABC_String;
}

function snare_HH_kick_ABC_for_quads(
  sticking_array,
  HH_array,
  snare_array,
  kick_array,
  toms_array,
  post_voice_abc,
  num_notes,
  sub_division,
  notes_per_measure,
  kick_stems_up,
  timeSigTop,
  timeSigBottom,
  numberOfMeasuresPerLine
) {
  var scaler = 1; // we are always in 32ths notes here
  var ABC_String = '';
  var stickings_voice_string = 'V:Stickings\n'; // for stickings.  they are all rests with text comments added
  var hh_snare_voice_string = 'V:Hands stem=up\n%%voicemap drum\n'; // for hh and snare
  var kick_voice_string = 'V:Feet stem=down\n%%voicemap drum\n'; // for kick drum
  var all_drum_array_of_array;

  all_drum_array_of_array = [snare_array, HH_array]; // exclude the kick
  if (toms_array) all_drum_array_of_array = all_drum_array_of_array.concat(toms_array);
  // Add the kick array last to solve a subtle bug with the kick foot splash combo note
  // If the combo note comes last in a multi note event it will space correctly.  If it
  // comes first it will create a wrong sized note
  if (kick_stems_up) all_drum_array_of_array = all_drum_array_of_array.concat([kick_array]);

  for (var i = 0; i < num_notes; i++) {
    var grouping_size_for_rests = abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom);
    // make sure the group end doesn't go beyond the measure.   Happens in odd time sigs
    if ((i % notes_per_measure) + grouping_size_for_rests > notes_per_measure) {
      // if we are in an odd time signature then the last few notes will have a different grouping to reach the end of the measure
      grouping_size_for_rests = notes_per_measure - (i % notes_per_measure);
    }

    var end_of_group;
    if (i % abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom) === 0)
      end_of_group = abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom);
    else
      end_of_group =
        abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom) -
        (i % abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom));

    // make sure the group end doesn't go beyond the measure.   Happens in odd time sigs
    if ((i % notes_per_measure) + end_of_group > notes_per_measure) {
      // if we are in an odd time signature then the last few notes will have a different grouping to reach the end of the measure
      end_of_group = notes_per_measure - (i % notes_per_measure);
    }

    if (i % abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom) === 0) {
      // we will only output a rest at the beginning of a beat phrase
      stickings_voice_string += getABCforRest(
        [sticking_array],
        i,
        grouping_size_for_rests,
        scaler,
        true
      );

      if (kick_stems_up) {
        hh_snare_voice_string += getABCforRest(
          all_drum_array_of_array,
          i,
          grouping_size_for_rests,
          scaler,
          false
        );
        kick_voice_string = '';
      } else {
        hh_snare_voice_string += getABCforRest(
          all_drum_array_of_array,
          i,
          grouping_size_for_rests,
          scaler,
          false
        );
        kick_voice_string += getABCforRest([kick_array], i, grouping_size_for_rests, scaler, false);
      }
    }

    stickings_voice_string += getABCforNote([sticking_array], i, end_of_group, scaler);

    if (kick_stems_up) {
      hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, end_of_group, scaler);
      kick_voice_string = '';
    } else {
      hh_snare_voice_string += getABCforNote(all_drum_array_of_array, i, end_of_group, scaler);
      kick_voice_string += getABCforNote([kick_array], i, end_of_group, scaler);
    }

    if (
      i % abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom) ==
      abc_gen_note_grouping_size(false, timeSigTop, timeSigBottom) - 1
    ) {
      stickings_voice_string += ' ';
      hh_snare_voice_string += ' '; // Add a space to break the bar line every group notes
      kick_voice_string += ' ';
    }

    // add a bar line every measure.   32 notes in 4/4 time.   (32/timeSigBottom * timeSigTop)
    if ((i + 1) % ((32 / timeSigBottom) * timeSigTop) === 0) {
      stickings_voice_string += '|';
      hh_snare_voice_string += '|';
      kick_voice_string += '|';
    }
    // add a line break every numberOfMeasuresPerLine measures, except the last
    if (
      i < num_notes - 1 &&
      (i + 1) % ((32 / timeSigBottom) * timeSigTop * numberOfMeasuresPerLine) === 0
    ) {
      stickings_voice_string += '\n';
      hh_snare_voice_string += '\n';
      kick_voice_string += '\n';
    }
  }

  if (kick_stems_up)
    ABC_String += stickings_voice_string + post_voice_abc + hh_snare_voice_string + post_voice_abc;
  else
    ABC_String +=
      stickings_voice_string +
      post_voice_abc +
      hh_snare_voice_string +
      post_voice_abc +
      kick_voice_string +
      post_voice_abc;

  return ABC_String;
}

export function get_top_ABC_BoilerPlate(
  gu,
  isPermutation,
  tuneTitle,
  tuneAuthor,
  tuneComments,
  showLegend,
  isTriplets,
  kick_stems_up,
  timeSigTop,
  timeSigBottom,
  renderWidth
) {
  // boiler plate
  var fullABC = '%abc\n%%fullsvg _' + gu.grooveUtilsUniqueIndex + '\nX:6\n';

  fullABC += 'M:' + timeSigTop + '/' + timeSigBottom + '\n';

  // always add a Title even if it's blank
  fullABC += 'T: ' + tuneTitle + '\n';

  if (tuneAuthor !== '') {
    fullABC += 'C: ' + tuneAuthor + '\n';
    fullABC += '%%musicspace 20px\n'; // add some more space
  }

  if (renderWidth < 400) renderWidth = 400; // min-width
  if (renderWidth > 3000) renderWidth = 3000; // max-width
  // the width of the music is always 25% bigger than what we pass in.   Go figure.
  renderWidth = Math.floor(renderWidth * 0.75);

  fullABC += 'L:1/' + 32 + '\n'; // 4/4 = 32,  6/8 = 64

  if (isPermutation) fullABC += '%%stretchlast 0\n';
  else fullABC += '%%stretchlast 1\n';

  fullABC +=
    '%%flatbeams 1\n' +
    '%%ornament up\n' +
    '%%pagewidth ' +
    renderWidth +
    'px\n' +
    '%%leftmargin 0cm\n' +
    '%%rightmargin 0cm\n' +
    '%%topspace 10px\n' +
    '%%titlefont calibri 20\n' +
    '%%partsfont calibri 16\n' +
    '%%gchordfont calibri 16\n' +
    '%%annotationfont calibri 16\n' +
    '%%infofont calibri 16\n' +
    '%%textfont calibri 16\n' +
    '%%deco (. 0 a 5 1 1 "@-8,-3("\n' +
    '%%deco ). 0 a 5 1 1 "@4,-3)"\n' +
    '%%beginsvg\n' +
    ' <defs>\n' +
    ' <path id="Xhead" d="m-3,-3 l6,6 m0,-6 l-6,6" class="stroke" style="stroke-width:1.2"/>\n' +
    ' <path id="Trihead" d="m-3,2 l 6,0 l-3,-6 l-3,6 l6,0" class="stroke" style="stroke-width:1.2"/>\n' +
    ' </defs>\n' +
    '%%endsvg\n' +
    '%%map drum ^g heads=Xhead print=g       % Hi-Hat\n' +
    "%%map drum ^c' heads=Xhead print=c'   % Crash\n" +
    "%%map drum ^d' heads=Xhead print=d'   % Stacker\n" +
    "%%map drum ^e' heads=Xhead print=e'   % Metronome click\n" +
    "%%map drum ^f' heads=Xhead print=f'   % Metronome beep\n" +
    "%%map drum ^A' heads=Xhead print=A'   % Ride\n" +
    "%%map drum ^B' heads=Trihead print=A' % Ride Bell\n" +
    "%%map drum ^D' heads=Trihead print=g   % Cow Bell\n" +
    '%%map drum ^c heads=Xhead print=c  % Cross Stick\n' +
    '%%map drum ^d, heads=Xhead print=d,  % Foot Splash\n';

  //if(kick_stems_up)
  //fullABC += "%%staves (Stickings Hands)\n";
  //else
  fullABC += '%%staves (Stickings Hands Feet)\n';

  // print comments below the legend if there is one, otherwise in the header section
  if (tuneComments !== '') {
    fullABC += 'P: ' + tuneComments + '\n';
    fullABC += '%%musicspace 20px\n'; // add some more space
  }

  // the K ends the header;
  fullABC += 'K:C clef=perc\n';

  if (showLegend) {
    fullABC +=
      'V:Stickings\n' +
      'x8 x8 x8 x8 x8 x8 x8 x8 ||\n' +
      'V:Hands stem=up \n' +
      '%%voicemap drum\n' +
      '"^Hi-Hat"^g4 "^Open"!open!^g4 ' +
      '"^Crash"^c\'4 "^Stacker"^d\'4 "^Ride"^A\'4 "^Ride Bell"^B\'4 x2 "^Tom"e4 "^Tom"A4 "^Snare"c4 "^Buzz"!///!c4 "^Cross"^c4 "^Ghost  "!(.!!).!c4 "^Flam"{/c}c4  x10 ||\n' +
      'V:Feet stem=down \n' +
      '%%voicemap drum\n' +
      'x52 "^Kick"F4 "^HH foot"^d,4 x4 ||\n' +
      'T:\n';
  }

  // tempo setting
  //fullABC += "Q: 1/4=" + getTempo() + "\n";

  return fullABC;
}

export function create_ABC_from_snare_HH_kick_arrays(
  gu,
  sticking_array,
  HH_array,
  snare_array,
  kick_array,
  toms_array,
  post_voice_abc,
  num_notes,
  time_division,
  notes_per_measure,
  kick_stems_up,
  timeSigTop,
  timeSigBottom
) {
  // convert sticking count symbol to the actual count
  // do this right before ABC output so it can't every get encoded into something that gets saved.
  convert_sticking_counts_to_actual_counts(
    sticking_array,
    time_division,
    timeSigTop,
    timeSigBottom
  );

  var numberOfMeasuresPerLine = 2; // Default

  if (notes_per_measure >= 32) {
    // Only put one measure per line for 32nd notes and above because of width issues
    numberOfMeasuresPerLine = 1;
  }

  if (isTripletDivisionFromNotesPerMeasure(notes_per_measure, timeSigTop, timeSigBottom)) {
    return snare_HH_kick_ABC_for_triplets(
      sticking_array,
      HH_array,
      snare_array,
      kick_array,
      toms_array,
      post_voice_abc,
      num_notes,
      time_division,
      notes_per_measure,
      kick_stems_up,
      timeSigTop,
      timeSigBottom,
      numberOfMeasuresPerLine
    );
  } else {
    return snare_HH_kick_ABC_for_quads(
      sticking_array,
      HH_array,
      snare_array,
      kick_array,
      toms_array,
      post_voice_abc,
      num_notes,
      time_division,
      notes_per_measure,
      kick_stems_up,
      timeSigTop,
      timeSigBottom,
      numberOfMeasuresPerLine
    );
  }
}

export function createABCFromGrooveData(gu, myGrooveData, renderWidth) {
  var FullNoteStickingArray = scaleNoteArrayToFullSize(
    myGrooveData.sticking_array,
    myGrooveData.numberOfMeasures,
    myGrooveData.notesPerMeasure,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );
  var FullNoteHHArray = scaleNoteArrayToFullSize(
    myGrooveData.hh_array,
    myGrooveData.numberOfMeasures,
    myGrooveData.notesPerMeasure,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );
  var FullNoteSnareArray = scaleNoteArrayToFullSize(
    myGrooveData.snare_array,
    myGrooveData.numberOfMeasures,
    myGrooveData.notesPerMeasure,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );
  var FullNoteKickArray = scaleNoteArrayToFullSize(
    myGrooveData.kick_array,
    myGrooveData.numberOfMeasures,
    myGrooveData.notesPerMeasure,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );
  var FullNoteTomsArray = [];

  for (var i = 0; i < constant_NUMBER_OF_TOMS; i++) {
    FullNoteTomsArray[i] = scaleNoteArrayToFullSize(
      myGrooveData.toms_array[i],
      myGrooveData.numberOfMeasures,
      myGrooveData.notesPerMeasure,
      myGrooveData.numBeats,
      myGrooveData.noteValue
    );
  }

  var is_triplet_division = isTripletDivisionFromNotesPerMeasure(
    myGrooveData.notesPerMeasure,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );

  var fullABC = gu.get_top_ABC_BoilerPlate(
    false,
    myGrooveData.title,
    myGrooveData.author,
    myGrooveData.comments,
    myGrooveData.showLegend,
    is_triplet_division,
    myGrooveData.kickStemsUp,
    myGrooveData.numBeats,
    myGrooveData.noteValue,
    renderWidth
  );

  fullABC += gu.create_ABC_from_snare_HH_kick_arrays(
    FullNoteStickingArray,
    FullNoteHHArray,
    FullNoteSnareArray,
    FullNoteKickArray,
    FullNoteTomsArray,
    '|\n',
    FullNoteHHArray.length,
    myGrooveData.timeDivision,
    notesPerMeasureInFullSizeArray(
      is_triplet_division,
      myGrooveData.numBeats,
      myGrooveData.noteValue
    ), // notes_per_measure, We scaled up to 48/32 above
    myGrooveData.kickStemsUp,
    myGrooveData.numBeats,
    myGrooveData.noteValue
  );

  gu.note_mapping_array = create_note_mapping_array_for_highlighting(
    FullNoteHHArray,
    FullNoteSnareArray,
    FullNoteKickArray,
    FullNoteTomsArray,
    FullNoteHHArray.length
  );

  // console.log(fullABC);
  return fullABC;
}
