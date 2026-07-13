// Javascript for the Groove Scribe HTML application
// Groove Scribe is for drummers and helps create sheet music with an easy to use WYSIWYG groove editor.
//
// Author: Lou Montulli
// Original Creation date: Feb 2015.
//
//  Copyright 2015-2020 Lou Montulli, Mike Johnston
//
//  This file is part of Project Groove Scribe.
//
//  Groove Scribe is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 2 of the License, or
//  (at your option) any later version.
//
//  Groove Scribe is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with Groove Scribe.  If not, see <http://www.gnu.org/licenses/>.

// GrooveWriter class.   The only one in this file.

// Abc, MIDI, and Midi are vendored third-party globals declared in
// eslint.config.js (they're shared across multiple js/ files there, unlike
// this file's own GrooveUtils global below).

// Shared constants (moved to their own module in Step 2).
import {
  constant_DEFAULT_TEMPO,
  constant_OUR_MIDI_METRONOME_1,
  constant_OUR_MIDI_METRONOME_NORMAL,
  constant_OUR_MIDI_HIHAT_NORMAL,
  constant_OUR_MIDI_HIHAT_OPEN,
  constant_OUR_MIDI_HIHAT_ACCENT,
  constant_OUR_MIDI_HIHAT_CRASH,
  constant_OUR_MIDI_HIHAT_STACKER,
  constant_OUR_MIDI_HIHAT_METRONOME_NORMAL,
  constant_OUR_MIDI_HIHAT_RIDE,
  constant_OUR_MIDI_HIHAT_RIDE_BELL,
  constant_OUR_MIDI_HIHAT_COW_BELL,
  constant_OUR_MIDI_HIHAT_FOOT,
  constant_OUR_MIDI_SNARE_NORMAL,
  constant_OUR_MIDI_SNARE_ACCENT,
  constant_OUR_MIDI_SNARE_GHOST,
  constant_OUR_MIDI_SNARE_XSTICK,
  constant_OUR_MIDI_SNARE_BUZZ,
  constant_OUR_MIDI_SNARE_FLAM,
  constant_OUR_MIDI_SNARE_DRAG,
  constant_OUR_MIDI_KICK_NORMAL,
  constant_OUR_MIDI_TOM1_NORMAL,
  constant_OUR_MIDI_TOM2_NORMAL,
  constant_OUR_MIDI_TOM3_NORMAL,
  constant_OUR_MIDI_TOM4_NORMAL,
} from './constants.js';
import {
  getBrowserInfo as _getBrowserInfo,
  is_touch_device as _is_touch_device,
} from './browserInfo.js';
import { createGrooveData } from './grooveData.js';
import {
  getQueryVariableFromString as _getQueryVariableFromString,
  getGrooveDataFromUrlString as _urlParse,
  getUrlStringFromGrooveData as _urlBuild,
} from './urlSerialization.js';
import {
  MIDI_build_midi_url_count_in_track as _MIDI_build_midi_url_count_in_track,
  MIDI_from_HH_Snare_Kick_Arrays as _MIDI_from_HH_Snare_Kick_Arrays,
  create_MIDIURLFromGrooveData as _create_MIDIURLFromGrooveData,
} from './midiFile.js';
import {
  get_top_ABC_BoilerPlate as _get_top_ABC_BoilerPlate,
  create_ABC_from_snare_HH_kick_arrays as _create_ABC_from_snare_HH_kick_arrays,
  createABCFromGrooveData as _createABCFromGrooveData,
} from './abcNotation.js';
import {
  parseTimeSigString as _parseTimeSigString,
  calc_notes_per_measure as _calc_notes_per_measure,
  isTripletDivision as _isTripletDivision,
  isTripletDivisionFromNotesPerMeasure as _isTripletDivisionFromNotesPerMeasure,
  noteGroupingSize as _noteGroupingSize,
  notesPerMeasureInFullSizeArray as _notesPerMeasureInFullSizeArray,
  getNoteScaler as _getNoteScaler,
  scaleNoteArrayToFullSize as _scaleNoteArrayToFullSize,
} from './musicMath.js';
import {
  noteArraysFromURLData as _noteArraysFromURLData,
  tabLineFromAbcNoteArray as _tabLineFromAbcNoteArray,
  mergeDrumTabLines as _mergeDrumTabLines,
  GetEmptyGroove as _GetEmptyGroove,
  GetDefaultStickingsGroove as _GetDefaultStickingsGroove,
  GetDefaultHHGroove as _GetDefaultHHGroove,
  GetDefaultTom1Groove as _GetDefaultTom1Groove,
  GetDefaultTom4Groove as _GetDefaultTom4Groove,
  GetDefaultSnareGroove as _GetDefaultSnareGroove,
  GetDefaultKickGroove as _GetDefaultKickGroove,
  GetDefaultTomGroove as _GetDefaultTomGroove,
  create_note_mapping_array_for_highlighting as _create_note_mapping_array_for_highlighting,
  figure_out_sticking_count_for_index as _figure_out_sticking_count_for_index,
  convert_sticking_counts_to_actual_counts as _convert_sticking_counts_to_actual_counts,
} from './noteArrays.js';

var global_num_GrooveUtilsCreated = 0;
// This module's own URL, used by getGrooveUtilsBaseLocation() to locate sibling
// assets (soundfont/, images/). As an ES module, document.currentScript is null,
// so import.meta.url is the module-safe equivalent of the old currentScript.src.
var global_grooveUtilsScriptSrc = import.meta.url;
var global_midiInitialized = false;

// global constants

// make these global so that they are shared among all the GrooveUtils classes invoked
var global_current_midi_start_time = 0;
var global_last_midi_update_time = 0;
var global_total_midi_play_time_msecs = 0;
var global_total_midi_notes = 0;
var global_total_midi_repeats = 0;

// GrooveUtils class.   The only one in this file.
// Consumed cross-file as a global by groove_display.js and groove_writer.js
// (each declares it via its own `/* global GrooveUtils */` comment), so it
// looks unused from this file's perspective alone.

function GrooveUtils() {
  'use strict';

  global_num_GrooveUtilsCreated++; // should increment on every new

  var root = this;

  root.abc_obj = null;

  // local constants
  var CONSTANT_Midi_play_time_zero = '0:00';

  // array that can be used to map notes to the SVG generated by abc2svg
  root.note_mapping_array = null;

  // debug & special view
  root.debugMode = false;
  root.viewMode = true; // by default to prevent screen flicker
  root.grooveDBAuthoring = false;

  // midi state variables
  root.isMIDIPaused = false;
  root.shouldMIDIRepeat = true;
  root.swingIsEnabled = false;
  root.grooveUtilsUniqueIndex = global_num_GrooveUtilsCreated;

  // metronome options
  root.metronomeSolo = false;
  root.metronomeOffsetClickStart = '1';
  // start with last in the rotation so the next rotation brings it to '1'
  root.metronomeOffsetClickStartRotation = 0;

  root.isLegendVisable = false;

  // integration with third party components
  root.noteCallback = null; //function triggered when a note is played
  root.playEventCallback = null; //triggered when the play button is pressed
  root.repeatCallback = null; //triggered when a groove is going to be repeated
  root.tempoChangeCallback = null; //triggered when the tempo changes.  ARG1 is the new Tempo integer (needs to be very fast, it can get called a lot of times from the slider)

  root.visible_context_menu = false; // a single context menu can be visible at a time.

  // grooveDataNew builds a fresh GrooveData. The canonical shape and defaults
  // now live in grooveData.js (createGrooveData); this wrapper just threads
  // through the instance-level flags. It is implemented as a constructor
  // (assigning onto `this`) to preserve the exact historical behavior of both
  // call styles: `new gu.grooveDataNew()` yields a populated GrooveData, while
  // the legacy no-`new` call during construction assigns onto `root` and
  // returns undefined (so root.myGrooveData stays empty until a groove loads).
  root.grooveDataNew = function () {
    Object.assign(
      this,
      createGrooveData({
        debugMode: root.debugMode,
        grooveDBAuthoring: root.grooveDBAuthoring,
        viewMode: root.viewMode,
      })
    );
  };

  root.myGrooveData = root.grooveDataNew();

  root.getQueryVariableFromString = function (variable, def_value, my_string) {
    return _getQueryVariableFromString(variable, def_value, my_string);
  };

  // Get the "?query" values from the page URL
  root.getQueryVariableFromURL = function (variable, def_value) {
    return root.getQueryVariableFromString(variable, def_value, window.location.search);
  };

  root.getBrowserInfo = function () {
    return _getBrowserInfo();
  };

  // is the browser a touch device.   Usually this means no right click
  root.is_touch_device = function () {
    return _is_touch_device();
  };

  // the notes per measure is calculated from the note division and the time signature
  // in 4/4 time the division is the division (as well as any time signature x/x)
  // in 4/8 the num notes is half as many, etc
  root.calc_notes_per_measure = function (division, time_sig_top, time_sig_bottom) {
    return _calc_notes_per_measure(division, time_sig_top, time_sig_bottom);
  };

  // every document click passes through here.
  // close a popup if one is up and we click off of it.
  root.documentOnClickHanderCloseContextMenu = function (event) {
    if (root.visible_context_menu) {
      root.hideContextMenu(root.visible_context_menu);
    }
  };

  root.showContextMenu = function (contextMenu) {
    // if there is another context menu open, close it
    if (root.visible_context_menu) {
      root.hideContextMenu(root.visible_context_menu);
    }

    contextMenu.style.display = 'block';
    root.visible_context_menu = contextMenu;

    // Check for screen visibility of the bottom of the menu
    if (contextMenu.offsetTop + contextMenu.clientHeight > document.documentElement.clientHeight) {
      // the menu has gone off the bottom of the screen
      contextMenu.style.top =
        document.documentElement.clientHeight - contextMenu.clientHeight + 'px';
    }

    // use a timeout to setup the onClick handler.
    // otherwise the click that opened the menu will close it
    // right away.  :(
    setTimeout(function () {
      document.onclick = root.documentOnClickHanderCloseContextMenu;
      document.body.style.cursor = 'pointer'; // make document.onclick work on iPad
    }, 100);
  };

  root.hideContextMenu = function (contextMenu) {
    document.onclick = false;
    document.body.style.cursor = 'auto'; // make document.onclick work on iPad

    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
    root.visible_context_menu = false;
  };

  // figure it out from the division  Division is number of notes per measure 4, 6, 8, 12, 16, 24, 32, etc...
  // Triplets only support 4/4 and 2/4 time signatures for now
  root.isTripletDivision = function (division) {
    return _isTripletDivision(division);
  };

  // figure out if it is triplets from the number of notes (implied division)
  root.isTripletDivisionFromNotesPerMeasure = function (
    notesPerMeasure,
    timeSigTop,
    timeSigBottom
  ) {
    return _isTripletDivisionFromNotesPerMeasure(notesPerMeasure, timeSigTop, timeSigBottom);
  };

  root.getMetronomeSolo = function () {
    return root.metronomeSolo;
  };

  root.setMetronomeSolo = function (trueElseFalse) {
    root.metronomeSolo = trueElseFalse;
  };

  root.getMetronomeOffsetClickStart = function () {
    return root.metronomeOffsetClickStart;
  };

  root.getMetronomeOffsetClickStartIsRotating = function () {
    return root.metronomeOffsetClickStart == 'ROTATE';
  };

  root.setMetronomeOffsetClickStart = function (value) {
    root.metronomeOffsetClickStart = value;
  };

  // if the Metronome offset click start is set to rotate this
  // will advance the position of the rotation and return TRUE
  // returns FALSE if rotation is OFF
  root.advanceMetronomeOptionsOffsetClickStartRotation = function (isTriplets) {
    if (root.getMetronomeOffsetClickStartIsRotating()) {
      root.metronomeOffsetClickStartRotation++;
      return true;
    } else {
      return false;
    }
  };

  root.getMetronomeOptionsOffsetClickStartRotation = function (isTriplets) {
    if (root.getMetronomeOffsetClickStartIsRotating()) {
      // constrain the rotation
      if (isTriplets && root.metronomeOffsetClickStartRotation > 2)
        root.metronomeOffsetClickStartRotation = 0;
      else if (root.metronomeOffsetClickStartRotation > 3)
        root.metronomeOffsetClickStartRotation = 0;

      switch (root.metronomeOffsetClickStartRotation) {
        case 0:
          return '1';
        case 1:
          if (isTriplets) return 'TI';
          else return 'E';
        case 2:
          if (isTriplets) return 'TA';
          else return 'AND';
        case 3:
          return 'A';
      }
    } else {
      return root.metronomeOffsetClickStart;
    }
  };

  root.resetMetronomeOptionsOffsetClickStartRotation = function (value) {
    // start with last in the rotation so the next rotation brings it to '1'
    return (root.metronomeOffsetClickStartRotation = 0);
  };

  // build a string that looks like this
  //  |----------------|----------------|
  root.GetEmptyGroove = function (notes_per_measure, numMeasures) {
    return _GetEmptyGroove(notes_per_measure, numMeasures);
  };

  root.GetDefaultStickingsGroove = function (
    notes_per_measure,
    timeSigTop,
    timeSigBottom,
    numMeasures
  ) {
    return _GetDefaultStickingsGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  // build a string that looks like this
  // "|x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-|";
  root.GetDefaultHHGroove = function (notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
    return _GetDefaultHHGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  root.GetDefaultTom1Groove = function (notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
    return _GetDefaultTom1Groove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  root.GetDefaultTom4Groove = function (notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
    return _GetDefaultTom4Groove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  // build a string that looks like this
  // |--------O---------------O-------|
  root.GetDefaultSnareGroove = function (
    notes_per_measure,
    timeSigTop,
    timeSigBottom,
    numMeasures
  ) {
    return _GetDefaultSnareGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  // build a string that looks like this
  // |o---------------o---------------|
  root.GetDefaultKickGroove = function (notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
    return _GetDefaultKickGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  root.GetDefaultTomGroove = function (notes_per_measure, timeSigTop, timeSigBottom, numMeasures) {
    return _GetDefaultTomGroove(notes_per_measure, timeSigTop, timeSigBottom, numMeasures);
  };

  // takes a character from tablature form and converts it to our ABC Notation form.
  // uses drum tab format adapted from wikipedia: http://en.wikipedia.org/wiki/Drum_tablature
  //
  //  Sticking support:
  //		R: right
  //    L: left
  //
  //  HiHat support:
  //		x: normal
  //		X: accent
  //		o: open
  //		+: close
  //		c: crash
  //		r: ride
  //		b: ride bell
  //		m: (more) cow bell
  //    s: stacker
  //    n: metroNome normal
  //    N: metroNome accent
  //		-: off
  //
  //   Snare support:
  //		o: normal
  //		O: accent
  //		g: ghost
  //		x: cross stick
  //		f: flam
  //		-: off
  //
  //   Kick support:
  //		o: normal
  //		x: hi hat splash with foot
  //		X: kick & hi hat splash with foot simultaneously
  //
  //  Kick can be notated either with a "K" or a "B"
  //
  //  Note that "|" and " " will be skipped so that standard drum tabs can be applied
  //  Example:
  //     H=|x---x---x---x---|x---x---x---x---|x---x---x---x---|
  // or  H=x-x-x-x-x-x-x-x-x-x-x-x-
  //     S=|----o-------o---|----o-------o---|----o-------o---|
  // or  S=--o---o---o---o---o---o-
  //     B=|o-------o-------|o-------o-o-----|o-----o-o-------|
  // or  K=o---o---o----oo-o--oo---|
  // or  T1=|o---o---o---o|
  // or  T2=|o---o---o---o|
  // or  T3=|o---o---o---o|
  // or  T4=|o---o---o---o|

  // same as above, but reversed

  // takes two drum tab lines and merges them.    "-" are blanks so they will get overwritten in a merge.
  // if there are two non "-" positions to merge, the dominateLine takes priority.
  //
  //  Example    |----o-------o---|   (dominate)
  //           + |x-------x---x---|   (subordinate)
  //             |x---o---x---o---|   (result)
  //
  // this is useful to take an accent tab and an "others" tab and creating one tab out of it.
  root.mergeDrumTabLines = function (dominateLine, subordinateLine) {
    return _mergeDrumTabLines(dominateLine, subordinateLine);
  };

  // takes a string of notes encoded in a serialized string and convert it to an array that represents the notes
  // uses drum tab format adapted from wikipedia: http://en.wikipedia.org/wiki/Drum_tablature
  //
  //  Note that "|" and " " will be skipped so that standard drum tabs can be applied
  //  Example:
  //     H=|x---x---x---x---|x---x---x---x---|x---x---x---x---|
  // or  H=x-x-x-x-x-x-x-x-x-x-x-x-
  //     S=|----o-------o---|----o-------o---|----o-------o---|
  // or  S=--o---o---o---o---o---o-
  //     B=|o-------o-------|o-------o-o-----|o-----o-o-------|
  // or  B=o---o---o----oo-o--oo---|
  //
  // Returns array that contains notesPerMeasure * numberOfMeasures entries.
  root.noteArraysFromURLData = function (drumType, noteString, notesPerMeasure, numberOfMeasures) {
    return _noteArraysFromURLData(drumType, noteString, notesPerMeasure, numberOfMeasures);
  };

  // take an array of notes in ABC format and convert it into a drum tab String
  // drumType - H, S, K, or Stickings
  // noteArray - pass in an ABC array of notes
  // getAccents - true to get accent notes.  (false to ignore accents)
  // getOthers - true to get non-accent notes.  (false to ignore non-accents)
  // maxLength - set smaller than noteArray length to get fewer notes
  // separatorDistance - set to greater than zero integer to add "|" between measures
  root.tabLineFromAbcNoteArray = function (
    drumType,
    noteArray,
    getAccents,
    getOthers,
    maxLength,
    separatorDistance
  ) {
    return _tabLineFromAbcNoteArray(
      drumType,
      noteArray,
      getAccents,
      getOthers,
      maxLength,
      separatorDistance
    );
  };

  // parse a string like "4/4", "5/4" or "2/4"
  root.parseTimeSigString = function (timeSigString) {
    return _parseTimeSigString(timeSigString);
  };

  root.getGrooveDataFromUrlString = function (encodedURLData) {
    return _urlParse(encodedURLData, {
      debugMode: root.debugMode,
      grooveDBAuthoring: root.grooveDBAuthoring,
      viewMode: root.viewMode,
    });
  };

  // get a really long URL that encodes all of the notes and the rest of the state of the page.
  // this will allow us to bookmark or reference a groove and handle undo/redo.
  //

  root.getUrlStringFromGrooveData = function (myGrooveData, url_destination) {
    return _urlBuild(myGrooveData, url_destination);
  };

  function setupHotKeys() {
    // isCtrl is reassigned by the onkeyup/onkeydown handlers below (used to be
    // read by now-commented-out CTRL-S code); removing the declaration would
    // make those handler assignments implicit globals, which throw under
    // 'use strict'.
    // eslint-disable-next-line no-unused-vars
    var isCtrl = false;
    document.onkeyup = function (e) {
      if (e.which == 17) isCtrl = false;
    };

    document.onkeydown = function (e) {
      if (e.which == 17) isCtrl = true;
      /*
			if(e.which == 83 && isCtrl == true) {
			alert('CTRL-S pressed');
			return false;
			}
			 */
      // only accept the event if it not going to an INPUT field
      // otherwise we can't use spacebar in text fields :(
      if (
        e.which == 32 &&
        (e.target.type == 'range' ||
          (e.target.tagName.toUpperCase() != 'INPUT' &&
            e.target.tagName.toUpperCase() != 'TEXTAREA'))
      ) {
        // spacebar
        root.startOrStopMIDI_playback();
        return false;
      }
      if (e.which == 179) {
        // Play button
        root.startOrPauseMIDI_playback();
      }
      if (e.which == 178) {
        // Stop button
        root.stopMIDI_playback();
      }

      return true;
    };
  }

  // the top stuff in the ABC that doesn't depend on the notes
  root.get_top_ABC_BoilerPlate = function (
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
    return _get_top_ABC_BoilerPlate(
      root,
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
    );
  };

  // looks for modifiers like !accent! or !plus! and moves them outside of the group abc array.
  // Most modifiers (but not all) will not render correctly if they are inside the abc group.
  // returns a string that should be added to the abc_notation if found.

  // take an array of arrays and use a for loop to test to see
  // if all of the arrays are equal to the "test_value" for a given "test_index"
  // returns "true" if they are all equal.
  // returns "false" if any one of them fails

  // note1_array:   an array containing "false" or a note character in ABC to designate that is is on
  // note2_array:   an array containing "false" or a note character in ABC to designate that is is on
  // end_of_group:  when to stop looking ahead in the array.  (since we group notes in to beats)

  // calculate the rest ABC string

  // the note grouping size is how groups of notes within a measure group
  // for 8ths and 16th we group with 4
  // for triplets we group with 3
  // This function is for laying out the HTML
  // see abc_gen_note_grouping_size for the sheet music layout grouping size
  root.noteGroupingSize = function (notes_per_measure, timeSigTop, timeSigBottom) {
    return _noteGroupingSize(notes_per_measure, timeSigTop, timeSigBottom);
  };

  // when we generate ABC we use a default larger note array and transpose it
  // For 8th note triplets that means we need to use a larger grouping to make it
  // scale correctly
  // The base array is now 32 notes long to support 32nd notes
  // since we would normally group by 4 we need to group by 8 since we are scaling it

  root.notesPerMeasureInFullSizeArray = function (is_triplet_division, timeSigTop, timeSigBottom) {
    return _notesPerMeasureInFullSizeArray(is_triplet_division, timeSigTop, timeSigBottom);
  };

  // since note values are 16ths or 12ths this corrects for that by multiplying note values
  // timeSigTop is the top number in a time signature (4/4, 5/4, 6/8, 7/4, etc)
  root.getNoteScaler = function (notes_per_measure, timeSigTop, timeSigBottom) {
    return _getNoteScaler(notes_per_measure, timeSigTop, timeSigBottom);
  };

  // take any size array and make it larger by padding it with rests in the spaces between
  // For triplets, expands to 48 notes per measure
  // For non Triplets, expands to 32 notes per measure
  root.scaleNoteArrayToFullSize = function (
    note_array,
    num_measures,
    notes_per_measure,
    timeSigTop,
    timeSigBottom
  ) {
    return _scaleNoteArrayToFullSize(
      note_array,
      num_measures,
      notes_per_measure,
      timeSigTop,
      timeSigBottom
    );
  };

  // count the number of note positions that are not rests in all the arrays
  // FFFxFFFxF  would be 2

  // takes 4 arrays 48 elements long that represent the stickings, snare, HH & kick.
  // each element contains either the note value in ABC "F","^g" or false to represent off
  // translates them to an ABC string (in 2 voices if !kick_stems_up)
  // post_voice_abc is a string added to the end of each voice line that can end the line
  //
  // We output 48 notes in the ABC rather than the traditional 16 or 32 for 4/4 time.
  // This is because of the stickings above the bar are a separate voice and should not have the "3" above them
  // This could be changed to using the normal number and moving all the stickings down to be comments on each note in one voice (But is a pretty big change)

  // takes 4 arrays 32 elements long that represent the sticking, snare, HH & kick.
  // each element contains either the note value in ABC "F","^g" or false to represent off
  // translates them to an ABC string in 3 voices
  // post_voice_abc is a string added to the end of each voice line that can end the line
  //

  // create an array that can be used for note mapping
  // it is just an array of true/false that specifies weather a note can appear at that index
  root.create_note_mapping_array_for_highlighting = function (
    HH_array,
    snare_array,
    kick_array,
    toms_array,
    num_notes
  ) {
    return _create_note_mapping_array_for_highlighting(
      HH_array,
      snare_array,
      kick_array,
      toms_array,
      num_notes
    );
  };

  // function to return 1,e,&,a or 2,3,4,5,6, etc...
  root.figure_out_sticking_count_for_index = function (
    index,
    notes_per_measure,
    sub_division,
    time_sig_bottom
  ) {
    return _figure_out_sticking_count_for_index(
      index,
      notes_per_measure,
      sub_division,
      time_sig_bottom
    );
  };

  // converts the symbol for a sticking count to an actual count based on the time signature
  root.convert_sticking_counts_to_actual_counts = function (
    sticking_array,
    time_division,
    timeSigTop,
    timeSigBottom
  ) {
    return _convert_sticking_counts_to_actual_counts(
      sticking_array,
      time_division,
      timeSigTop,
      timeSigBottom
    );
  };

  // create ABC from note arrays
  // The Arrays passed in must be 32 or 48 notes long
  // notes_per_measure denotes the number of notes that _should_ be in the measure even though the arrays are always scaled up and large (48 or 32)
  root.create_ABC_from_snare_HH_kick_arrays = function (
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
    return _create_ABC_from_snare_HH_kick_arrays(
      root,
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
    );
  };

  // create ABC notation from a GrooveData class
  // returns a string of ABC Notation data

  root.createABCFromGrooveData = function (myGrooveData, renderWidth) {
    return _createABCFromGrooveData(root, myGrooveData, renderWidth);
  };

  // callback class for abc generator library
  function SVGLibCallback() {
    // -- required methods
    this.abc_svg_output = '';
    this.abc_error_output = '';

    // include a file (%%abc-include)
    this.read_file = function (fn) {
      return '';
    };
    // insert the errors
    this.errmsg = function (msg, l, c) {
      this.abc_error_output += msg + '<br/>\n';
    };

    // for possible playback or linkage
    this.get_abcmodel = function (tsfirst, voice_tb, music_types) {
      /*
			console.log(tsfirst);
			var next = tsfirst.next;

			while(next) {
			console.log(next);
			next = next.next;
			}
			 */
    };

    // annotations
    this.anno_start = function (type, start, stop, x, y, w, h) {};
    this.svg_highlight_y = 0;
    this.svg_highlight_h = 44;
    this.anno_stop = function (type, start, stop, x, y, w, h) {
      // create a rectangle
      if (type == 'bar') {
        // use the bar as the default y & hack
        this.svg_highlight_y = y + 5;
        this.svg_highlight_h = h + 10;
      }
      if (type == 'note' || type == 'grace') {
        y = this.svg_highlight_y;
        h = this.svg_highlight_h;
        root.abc_obj.out_svg(
          '<rect style="fill: transparent;" class="abcr" id="abcNoteNum_' +
            root.grooveUtilsUniqueIndex +
            '_' +
            root.abcNoteNumIndex +
            '" x="'
        );
        root.abc_obj.out_sxsy(x, '" y="', y);
        root.abc_obj.out_svg('" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '"/>\n');

        //console.log("Type:"+type+ "\t abcNoteNumIndex:"+root.abcNoteNumIndex+ "\t X:"+x+ "\t Y:"+y+ "\t W:"+w+ "\t H:"+h);

        // don't increment on the grace note, since it is attached to the real note
        if (type != 'grace') root.abcNoteNumIndex++;
      }
    };

    // image output
    this.img_out = function (str) {
      this.abc_svg_output += str; // + '\n'
    };

    // -- optional attributes
    this.page_format = true; // define the non-page-breakable blocks
  }
  var abcToSVGCallback = new SVGLibCallback(); // singleton

  // converts incoming ABC notation source into an svg image.
  // returns an object with two items.   "svg" and "error_html"
  root.renderABCtoSVG = function (abc_source) {
    root.abc_obj = new Abc(abcToSVGCallback);
    if ((root.myGrooveData && root.myGrooveData.showLegend) || root.isLegendVisable)
      root.abcNoteNumIndex = -15; // subtract out the legend notes for a proper index.
    else root.abcNoteNumIndex = 0;
    abcToSVGCallback.abc_svg_output = ''; // clear
    abcToSVGCallback.abc_error_output = ''; // clear

    root.abc_obj.tosvg('SOURCE', abc_source);
    return {
      svg: abcToSVGCallback.abc_svg_output,
      error_html: abcToSVGCallback.abc_error_output,
    };
  };

  root.isElementOnScreen = function (element) {
    var rect = element.getBoundingClientRect();

    return (
      rect.top >= 80 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) /*or $(window).height() */ &&
      rect.right <=
        (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
    );
  };

  root.abcNoteNumCurrentlyHighlighted = -1;
  root.clearHighlightNoteInABCSVG = function () {
    if (root.abcNoteNumCurrentlyHighlighted > -1) {
      var myElements = document.querySelectorAll(
        '#abcNoteNum_' + root.grooveUtilsUniqueIndex + '_' + root.abcNoteNumCurrentlyHighlighted
      );
      for (var i = 0; i < myElements.length; i++) {
        //note.className = note.className.replace(new RegExp(' highlighted', 'g'), "");
        var class_name = myElements[i].getAttribute('class');
        myElements[i].setAttribute(
          'class',
          class_name.replace(new RegExp(' highlighted', 'g'), '')
        );
        if (root.debugMode && i === 0) {
          if (!root.isElementOnScreen(myElements[i])) {
            if (root.abcNoteNumCurrentlyHighlighted === 0)
              myElements[i].scrollIntoView({ block: 'start', behavior: 'smooth' }); // autoscroll if necessary
            else myElements[i].scrollIntoView({ block: 'end', behavior: 'smooth' }); // autoscroll if necessary
          }
        }
      }
      root.abcNoteNumCurrentlyHighlighted = -1;
    }
  };

  // set note to -1 to unhighlight all notes
  root.highlightNoteInABCSVGByIndex = function (noteToHighlight) {
    root.clearHighlightNoteInABCSVG();

    var myElements = document.querySelectorAll(
      '#abcNoteNum_' + root.grooveUtilsUniqueIndex + '_' + noteToHighlight
    );
    for (var i = 0; i < myElements.length; i++) {
      myElements[i].setAttribute('class', myElements[i].getAttribute('class') + ' highlighted');
      root.abcNoteNumCurrentlyHighlighted = noteToHighlight;
    }
  };

  // cross index the percent complete with the myGrooveData note arrays to find the nth note
  // Then highlight the note
  root.highlightNoteInABCSVGFromPercentComplete = function (percentComplete) {
    if (root.note_mapping_array !== null) {
      // convert percentComplete to an index
      var curNoteIndex = percentComplete * root.note_mapping_array.length;

      // now count through the array with the possible notes to find the note number as
      // it correlates to the ABC
      var real_note_index = -1;
      for (var i = 0; i < curNoteIndex && i < root.note_mapping_array.length; i++) {
        if (root.note_mapping_array[i]) real_note_index++;
      }

      // now the real_note_index should map to the correct abc note, highlight italics
      root.highlightNoteInABCSVGByIndex(real_note_index);
    }
  };

  // ******************************************************************************************************************
  // ******************************************************************************************************************
  //
  // MIDI functions
  //
  // ******************************************************************************************************************
  // ******************************************************************************************************************
  var baseLocation = ''; // global
  root.getGrooveUtilsBaseLocation = function () {
    if (baseLocation.length > 0) return baseLocation;

    if (global_grooveUtilsScriptSrc !== '') {
      var lastSlash = global_grooveUtilsScriptSrc.lastIndexOf('/');
      // lets find the slash before it since we need to go up a directory
      lastSlash = global_grooveUtilsScriptSrc.lastIndexOf('/', lastSlash - 1);
      baseLocation = global_grooveUtilsScriptSrc.slice(0, lastSlash + 1);
    }

    if (baseLocation.length < 1) {
      baseLocation =
        'https://b125c4f8bf7d89726feec9ab8202d31e0c8d14d8.googledrive.com/host/0B2wxVWzVoWGYfnB5b3VTekxyYUowVjZ5YVE3UllLaVk5dVd4TzF4Q2ZaUXVsazhNSTdRM1E/';
    }

    return baseLocation;
  };

  root.getMidiSoundFontLocation = function () {
    return root.getGrooveUtilsBaseLocation() + 'soundfont/';
  };
  root.getMidiImageLocation = function () {
    return root.getGrooveUtilsBaseLocation() + 'images/';
  };

  root.midiEventCallbackClass = function (classRoot) {
    this.classRoot = classRoot;
    this.noteHasChangedSinceLastDataLoad = false;

    this.playEvent = function (root) {
      var icon = document.getElementById('midiPlayImage' + root.grooveUtilsUniqueIndex);
      if (icon) icon.className = 'midiPlayImage Playing';
      if (root.playEventCallback) {
        root.playEventCallback();
      }
    };
    // default loadMIDIDataEvent.  You probably want to override this
    // it will only make changes to the tempo and swing
    // playStarting: boolean that is true on the first time through the midi playback
    this.loadMidiDataEvent = function (root, playStarting) {
      if (root.myGrooveData) {
        root.myGrooveData.tempo = root.getTempo();
        root.myGrooveData.swingPercent = root.getSwing();
        var midiURL = root.create_MIDIURLFromGrooveData(root.myGrooveData);
        root.loadMIDIFromURL(midiURL);
        root.midiEventCallbacks.noteHasChangedSinceLastDataLoad = false;
      } else {
        console.log("can't load midi song.   myGrooveData is empty");
      }
    };
    this.doesMidiDataNeedRefresh = function (root) {
      return root.midiEventCallbacks.noteHasChangedSinceLastDataLoad;
    };
    this.pauseEvent = function (root) {
      var icon = document.getElementById('midiPlayImage' + root.grooveUtilsUniqueIndex);
      if (icon) icon.className = 'midiPlayImage Paused';
    };

    this.resumeEvent = function (root) {};
    this.stopEvent = function (root) {
      var icon = document.getElementById('midiPlayImage' + root.grooveUtilsUniqueIndex);
      if (icon) icon.className = 'midiPlayImage Stopped';
    };
    this.repeatChangeEvent = function (root, newValue) {
      if (newValue)
        document.getElementById('midiRepeatImage' + root.grooveUtilsUniqueIndex).src =
          root.getMidiImageLocation() + 'repeat.png';
      else
        document.getElementById('midiRepeatImage' + root.grooveUtilsUniqueIndex).src =
          root.getMidiImageLocation() + 'grey_repeat.png';
    };
    this.percentProgress = function (root, percent) {};
    this.notePlaying = function (root, note_type, note_position) {};

    this.midiInitialized = function (root) {
      var icon = document.getElementById('midiPlayImage' + root.grooveUtilsUniqueIndex);
      if (icon) icon.className = 'midiPlayImage Stopped';
      document.getElementById('midiPlayImage' + root.grooveUtilsUniqueIndex).onclick = function (
        event
      ) {
        root.startOrStopMIDI_playback();
      }; // enable play button
      setupHotKeys(); // spacebar to play
    };
  };
  root.midiEventCallbacks = new root.midiEventCallbackClass(root);

  // set a URL for midi playback.
  // useful for static content, so you don't have to override the loadMidiDataEvent callback
  root.setGrooveData = function (grooveData) {
    root.myGrooveData = grooveData;
  };

  // This is called so that the MIDI player will reload the groove
  // at repeat time.   If not set then the midi player just repeats what is already loaded.
  root.midiNoteHasChanged = function () {
    root.midiEventCallbacks.noteHasChangedSinceLastDataLoad = true;
  };
  root.midiResetNoteHasChanged = function () {
    root.midiEventCallbacks.noteHasChangedSinceLastDataLoad = false;
  };

  root.MIDI_build_midi_url_count_in_track = function (timeSigTop, timeSigBottom) {
    return _MIDI_build_midi_url_count_in_track(root, timeSigTop, timeSigBottom);
  };

  /*
   * midi_output_type:  "general_MIDI" or "Custom"
   * num_notes: number of notes in the arrays  (currently expecting 32 notes per measure)
   * metronome_frequency: 0, 4, 8, 16   None, quarter notes, 8th notes, 16ths
   * num_notes_for_swing: how many notes are we using.   Since we need to know where the upstrokes are we need to know
   *                      what the proper division is.   It can change when we are doing permutations, otherwise it is what is the
   *                      class_notes_per_measure
   *
   * The arrays passed in contain the ABC notation for a given note value or false for a rest.
   */
  root.MIDI_from_HH_Snare_Kick_Arrays = function (
    midiTrack,
    HH_Array,
    Snare_Array,
    Kick_Array,
    Toms_Array,
    midi_output_type,
    metronome_frequency,
    num_notes,
    num_notes_for_swing,
    swing_percentage,
    timeSigTop,
    timeSigBottom
  ) {
    return _MIDI_from_HH_Snare_Kick_Arrays(
      root,
      midiTrack,
      HH_Array,
      Snare_Array,
      Kick_Array,
      Toms_Array,
      midi_output_type,
      metronome_frequency,
      num_notes,
      num_notes_for_swing,
      swing_percentage,
      timeSigTop,
      timeSigBottom
    );
  };

  // returns a URL that is a MIDI track
  root.create_MIDIURLFromGrooveData = function (myGrooveData, MIDI_type) {
    return _create_MIDIURLFromGrooveData(root, myGrooveData, MIDI_type);
  };

  root.loadMIDIFromURL = function (midiURL) {
    MIDI.Player.timeWarp = 1; // speed the song is played back
    MIDI.Player.BPM = root.getTempo();
    MIDI.Player.loadFile(midiURL, midiLoaderCallback());
  };

  root.MIDISaveAs = function (midiURL) {
    // save as
    document.location = midiURL;
  };

  root.pauseMIDI_playback = function () {
    if (root.isMIDIPaused === false) {
      root.isMIDIPaused = true;
      root.midiEventCallbacks.pauseEvent(root.midiEventCallbacks.classRoot);
      MIDI.Player.pause();
      root.midiEventCallbacks.notePlaying(root.midiEventCallbacks.classRoot, 'clear', -1);
      root.clearHighlightNoteInABCSVG();
    }
  };

  // play button or keypress
  root.startMIDI_playback = function () {
    if (MIDI.Player.playing) {
      return;
    } else if (
      root.isMIDIPaused &&
      false === root.midiEventCallbacks.doesMidiDataNeedRefresh(root.midiEventCallbacks.classRoot)
    ) {
      global_current_midi_start_time = new Date();
      global_last_midi_update_time = 0;
      MIDI.Player.resume();
    } else {
      MIDI.Player.ctx.resume();
      global_current_midi_start_time = new Date();
      global_last_midi_update_time = 0;
      root.midiEventCallbacks.loadMidiDataEvent(root.midiEventCallbacks.classRoot, true);
      MIDI.Player.stop();
      MIDI.Player.loop(root.shouldMIDIRepeat); // set the loop parameter
      MIDI.Player.start();
    }
    root.midiEventCallbacks.playEvent(root.midiEventCallbacks.classRoot);
    root.isMIDIPaused = false;
  };

  // stop button or keypress
  root.stopMIDI_playback = function () {
    if (MIDI.Player.playing || root.isMIDIPaused) {
      root.isMIDIPaused = false;
      MIDI.Player.stop();
      root.midiEventCallbacks.stopEvent(root.midiEventCallbacks.classRoot);
      root.midiEventCallbacks.notePlaying(root.midiEventCallbacks.classRoot, 'clear', -1);
      root.clearHighlightNoteInABCSVG();
      root.resetMetronomeOptionsOffsetClickStartRotation();
    }
  };

  // modal play/stop button
  root.startOrStopMIDI_playback = function () {
    if (MIDI.Player.playing) {
      root.stopMIDI_playback();
    } else {
      root.startMIDI_playback();
    }
  };

  // modal play/pause button
  root.startOrPauseMIDI_playback = function () {
    if (MIDI.Player.playing) {
      root.pauseMIDI_playback();
    } else {
      root.startMIDI_playback();
    }
  };

  root.isPlaying = function () {
    return MIDI.Player.playing;
  };

  root.repeatMIDI_playback = function () {
    if (root.shouldMIDIRepeat === false) {
      root.shouldMIDIRepeat = true;
      MIDI.Player.loop(true);
    } else {
      root.shouldMIDIRepeat = false;
      MIDI.Player.loop(false);
    }
    root.midiEventCallbacks.repeatChangeEvent(
      root.midiEventCallbacks.classRoot,
      root.shouldMIDIRepeat
    );
  };

  root.oneTimeInitializeMidi = function () {
    if (global_midiInitialized) {
      root.midiEventCallbacks.midiInitialized(root.midiEventCallbacks.classRoot);
      return;
    }

    global_midiInitialized = true;
    MIDI.loadPlugin({
      soundfontUrl: root.getMidiSoundFontLocation(),
      instruments: ['gunshot'],
      callback: function () {
        MIDI.programChange(9, 127); // use "Gunshot" instrument because I don't know how to create new ones
        root.midiEventCallbacks.midiInitialized(root.midiEventCallbacks.classRoot);
      },
    });
  };

  root.getMidiStartTime = function () {
    return global_current_midi_start_time;
  };

  // calculate how long the midi has been playing total (since the last play/pause press
  // this is computationally expensive
  root.getMidiPlayTime = function () {
    var time_now = new Date();
    var play_time_diff = new Date(time_now.getTime() - global_current_midi_start_time.getTime());

    var TotalPlayTime = document.getElementById('totalPlayTime');
    if (TotalPlayTime) {
      if (global_last_midi_update_time === 0)
        global_last_midi_update_time = global_current_midi_start_time;
      var delta_time_diff = new Date(time_now - global_last_midi_update_time);
      global_total_midi_play_time_msecs += delta_time_diff.getTime();
      var totalTime = new Date(global_total_midi_play_time_msecs);
      var time_string = '';
      if (totalTime.getUTCHours() > 0)
        time_string = totalTime.getUTCHours() + ':' + (totalTime.getUTCMinutes() < 10 ? '0' : '');
      time_string +=
        totalTime.getUTCMinutes() +
        ':' +
        (totalTime.getSeconds() < 10 ? '0' : '') +
        totalTime.getSeconds();
      TotalPlayTime.innerHTML =
        'Total Play Time: <span class="totalTimeNum">' +
        time_string +
        '</span> notes: <span class="totalTimeNum">' +
        global_total_midi_notes +
        '</span> repetitions: <span class="totalTimeNum">' +
        global_total_midi_repeats +
        '</span>';
    }

    global_last_midi_update_time = time_now;

    return play_time_diff; // a time struct that represents the total time played so far since the last play button push
  };

  // update the midi play timer on the player.
  // Keeps track of how long we have been playing.
  root.updateMidiPlayTime = function () {
    var totalTime = root.getMidiPlayTime();
    var time_string =
      totalTime.getUTCMinutes() +
      ':' +
      (totalTime.getSeconds() < 10 ? '0' : '') +
      totalTime.getSeconds();

    var MidiPlayTime = document.getElementById('MIDIPlayTime' + root.grooveUtilsUniqueIndex);
    if (MidiPlayTime) MidiPlayTime.innerHTML = time_string;
  };

  //var class_midi_note_num = 0;  // global, but only used in this function
  // This is the function that the 3rd party midi library calls to give us events.
  // This is different from the callbacks that we use for the midi code in this library to
  // do events.   (Double chaining)
  function ourMIDICallback(data) {
    var percentComplete = data.now / data.end;
    root.midiEventCallbacks.percentProgress(
      root.midiEventCallbacks.classRoot,
      percentComplete * 100
    );

    if (root.lastMidiTimeUpdate && root.lastMidiTimeUpdate < data.now + 800) {
      root.updateMidiPlayTime();
      root.lastMidiTimeUpdate = data.now;
    }

    if (data.now < 16) {
      // this is considered the start.   It doesn't come in at zero for some reason
      // The second note should always be at least 16 ms behind the first
      //class_midi_note_num = 0;
      root.lastMidiTimeUpdate = -1;
    }
    if (data.now == data.end) {
      // at the end of a song
      root.midiEventCallbacks.notePlaying(root.midiEventCallbacks.classRoot, 'complete', 1);

      if (root.shouldMIDIRepeat) {
        global_total_midi_repeats++;

        // regenerate the MIDI if the data needs refreshing or the OffsetClick is rotating every time
        // advanceMetronomeOptionsOffsetClickStartRotation will return false if not rotating
        if (
          root.advanceMetronomeOptionsOffsetClickStartRotation() ||
          root.midiEventCallbacks.doesMidiDataNeedRefresh(root.midiEventCallbacks.classRoot)
        ) {
          MIDI.Player.stop();
          root.midiEventCallbacks.loadMidiDataEvent(root.midiEventCallbacks.classRoot, false);
          MIDI.Player.start();
          //  } else {
          // let midi.loop handle the repeat for us
          //MIDI.Player.stop();
          //MIDI.Player.start();
        }
        if (root.repeatCallback) {
          root.repeatCallback();
        }
      } else {
        // not repeating, so stopping
        MIDI.Player.stop();
        root.midiEventCallbacks.percentProgress(root.midiEventCallbacks.classRoot, 100);
        root.midiEventCallbacks.stopEvent(root.midiEventCallbacks.classRoot);
      }
    }

    // note on
    var note_type = false;
    if (data.message == 144) {
      if (
        data.note == constant_OUR_MIDI_METRONOME_1 ||
        data.note == constant_OUR_MIDI_METRONOME_NORMAL
      ) {
        note_type = 'metronome';
      } else if (
        data.note == constant_OUR_MIDI_HIHAT_NORMAL ||
        data.note == constant_OUR_MIDI_HIHAT_OPEN ||
        data.note == constant_OUR_MIDI_HIHAT_ACCENT ||
        data.note == constant_OUR_MIDI_HIHAT_CRASH ||
        data.note == constant_OUR_MIDI_HIHAT_RIDE ||
        data.note == constant_OUR_MIDI_HIHAT_STACKER ||
        data.note == constant_OUR_MIDI_HIHAT_RIDE_BELL ||
        data.note == constant_OUR_MIDI_HIHAT_COW_BELL ||
        data.note == constant_OUR_MIDI_HIHAT_METRONOME_NORMAL ||
        data.note == constant_OUR_MIDI_HIHAT_METRONOME_NORMAL
      ) {
        note_type = 'hi-hat';
      } else if (
        data.note == constant_OUR_MIDI_SNARE_NORMAL ||
        data.note == constant_OUR_MIDI_SNARE_ACCENT ||
        data.note == constant_OUR_MIDI_SNARE_GHOST ||
        data.note == constant_OUR_MIDI_SNARE_XSTICK ||
        data.note == constant_OUR_MIDI_SNARE_FLAM ||
        data.note == constant_OUR_MIDI_SNARE_DRAG ||
        data.note == constant_OUR_MIDI_SNARE_BUZZ
      ) {
        note_type = 'snare';
      } else if (
        data.note == constant_OUR_MIDI_KICK_NORMAL ||
        data.note == constant_OUR_MIDI_HIHAT_FOOT
      ) {
        note_type = 'kick';
      } else if (
        data.note == constant_OUR_MIDI_TOM1_NORMAL ||
        data.note == constant_OUR_MIDI_TOM2_NORMAL ||
        data.note == constant_OUR_MIDI_TOM3_NORMAL ||
        data.note == constant_OUR_MIDI_TOM4_NORMAL
      ) {
        note_type = 'tom';
      }
      if (note_type) {
        global_total_midi_notes++;
        root.midiEventCallbacks.notePlaying(
          root.midiEventCallbacks.classRoot,
          note_type,
          percentComplete
        );
        root.highlightNoteInABCSVGFromPercentComplete(percentComplete);
        if (root.noteCallback) {
          root.noteCallback(note_type);
        }
      }
    }

    // this used to work when we used note 60 as a spacer between chords
    //if(data.note == 60)
    //	class_midi_note_num++;
    /*
		if (0 && data.message == 144) {
		debug_note_count++;
		// my debugging code for midi
		var newHTML = "";
		if (data.note != 60)
		newHTML += "<b>";

		newHTML += note_type + " total notes: " + debug_note_count + " - count#: " + class_midi_note_num +
		" now: " + data.now +
		" note: " + data.note +
		" message: " + data.message +
		" channel: " + data.channel +
		" velocity: " + data.velocity +
		"<br>";

		if (data.note != 60)
		newHTML += "</b>";

		document.getElementById("midiTextOutput").innerHTML += newHTML;
		}
		 */
  }

  function midiLoaderCallback() {
    MIDI.Player.addListener(ourMIDICallback);
  }

  root.getTempo = function () {
    var tempoInput = document.getElementById('tempoInput' + root.grooveUtilsUniqueIndex);
    var tempo = constant_DEFAULT_TEMPO;

    if (tempoInput) {
      tempo = parseInt(tempoInput.value, 10);
      if (tempo < 19 && tempo > 281) tempo = constant_DEFAULT_TEMPO;
    }

    return tempo;
  };

  // we need code to make the range slider colors update properly
  function updateRangeSlider(sliderID) {
    var slider = document.getElementById(sliderID);
    var programaticCSSRules = document.getElementById(sliderID + 'CSSRules');
    if (!programaticCSSRules) {
      // create a new one.
      programaticCSSRules = document.createElement('style');
      programaticCSSRules.id = sliderID + 'CSSRules';
      document.body.appendChild(programaticCSSRules);
    }

    var style_before = document.defaultView.getComputedStyle(slider, ':before');
    var style_after = document.defaultView.getComputedStyle(slider, ':after');
    var before_color = style_before.getPropertyValue('color');
    var after_color = style_after.getPropertyValue('color');

    // change the before and after colors of the slider using a gradiant
    var percent = Math.ceil(((slider.value - slider.min) / (slider.max - slider.min)) * 100);

    var new_style_str =
      '#' +
      sliderID +
      '::-moz-range-track' +
      '{ background: -moz-linear-gradient(left, ' +
      before_color +
      ' ' +
      percent +
      '%, ' +
      after_color +
      ' ' +
      percent +
      '%)}\n';
    new_style_str +=
      '#' +
      sliderID +
      '::-webkit-slider-runnable-track' +
      '{ background: -webkit-linear-gradient(left, ' +
      before_color +
      ' ' +
      '0%, ' +
      before_color +
      ' ' +
      percent +
      '%, ' +
      after_color +
      ' ' +
      percent +
      '%)}\n';
    programaticCSSRules.textContent = new_style_str;
  }

  // update the tempo string display
  // called by the oninput handler everytime the range slider changes
  root.tempoUpdate = function (tempo) {
    document.getElementById('tempoTextField' + root.grooveUtilsUniqueIndex).value = '' + tempo;

    updateRangeSlider('tempoInput' + root.grooveUtilsUniqueIndex);
    root.midiNoteHasChanged();

    if (root.tempoChangeCallback) root.tempoChangeCallback(tempo);
  };

  root.tempoUpdateFromTextField = function (event) {
    var newTempo = event.target.value;

    document.getElementById('tempoInput' + root.grooveUtilsUniqueIndex).value = newTempo;
    root.tempoUpdate(newTempo);
  };

  // update the tempo string display
  root.tempoUpdateFromSlider = function (event) {
    root.tempoUpdate(event.target.value);
  };

  // I love the pun here.  :)
  // nudge the tempo up by 1
  root.upTempo = function () {
    var tempo = root.getTempo();

    tempo++;

    root.setTempo(tempo);
  };

  // nudge the tempo down by 1
  root.downTempo = function () {
    var tempo = root.getTempo();

    tempo--;

    root.setTempo(tempo);
  };

  root.setTempo = function (newTempo) {
    if (newTempo < 19 && newTempo > 281) return;

    document.getElementById('tempoInput' + root.grooveUtilsUniqueIndex).value = newTempo;
    root.tempoUpdate(newTempo);
  };

  root.doesDivisionSupportSwing = function (division) {
    if (root.isTripletDivision(division) || division == 4) return false;

    return true;
  };

  root.setSwingSlider = function (newSetting) {
    document.getElementById('swingInput' + root.grooveUtilsUniqueIndex).value = newSetting;
    updateRangeSlider('swingInput' + root.grooveUtilsUniqueIndex);
  };

  root.swingEnabled = function (trueElseFalse) {
    root.swingIsEnabled = trueElseFalse;

    if (root.swingIsEnabled === false) {
      root.setSwing(0);
    } else {
      root.swingUpdateText(root.getSwing()); // remove N/A label
    }
  };

  root.getSwing = function () {
    var swing = 0;

    if (root.swingIsEnabled) {
      var swingInput = document.getElementById('swingInput' + root.grooveUtilsUniqueIndex);

      if (swingInput) {
        swing = parseInt(swingInput.value, 10);
        if (swing < 0 || swing > 60) swing = 0;
      }
    }

    return swing;
  };

  // used to update the on screen swing display
  // also the onClick handler for the swing slider
  root.swingUpdateText = function (swingAmount) {
    if (root.swingIsEnabled === false) {
      document.getElementById('swingOutput' + root.grooveUtilsUniqueIndex).innerHTML = 'N/A';
    } else {
      document.getElementById('swingOutput' + root.grooveUtilsUniqueIndex).innerHTML =
        '' + swingAmount + '%';
      root.swingPercent = swingAmount;
      root.midiNoteHasChanged();
    }
  };

  root.setSwing = function (swingAmount) {
    if (root.swingIsEnabled === false) swingAmount = 0;

    root.setSwingSlider(swingAmount);

    root.swingUpdateText(swingAmount); // update the output
  };

  root.swingUpdateEvent = function (event) {
    if (root.swingIsEnabled === false) {
      root.setSwingSlider(0);
    } else {
      root.swingUpdateText(event.target.value);
      updateRangeSlider('swingInput' + root.grooveUtilsUniqueIndex);
    }
  };

  root.setMetronomeFrequencyDisplay = function (newFrequency) {
    var mm = document.getElementById('midiMetronomeMenu' + root.grooveUtilsUniqueIndex);

    if (mm) {
      mm.className = mm.className.replace(' selected', '');

      if (newFrequency > 0) {
        mm.className += ' selected';
      }
    }
  };

  // open a new tab with GrooveScribe with the current groove
  root.loadFullScreenGrooveScribe = function () {
    var fullURL = root.getUrlStringFromGrooveData(root.myGrooveData, 'fullGrooveScribe');

    var win = window.open(fullURL, '_blank');
    win.focus();
  };

  // turn the metronome on and off
  root.metronomeMiniMenuClick = function () {
    if (root.myGrooveData.metronomeFrequency > 0) root.myGrooveData.metronomeFrequency = 0;
    else root.myGrooveData.metronomeFrequency = 4;

    root.setMetronomeFrequencyDisplay(root.myGrooveData.metronomeFrequency);
    root.midiNoteHasChanged();
  };

  root.expandOrRetractMIDI_playback = function (force, expandElseContract) {
    var playerControlElement = document.getElementById(
      'playerControl' + root.grooveUtilsUniqueIndex
    );
    var playerControlRowElement = document.getElementById(
      'playerControlsRow' + root.grooveUtilsUniqueIndex
    );
    var tempoAndProgressElement = document.getElementById(
      'tempoAndProgress' + root.grooveUtilsUniqueIndex
    );
    var midiMetronomeMenuElement = document.getElementById(
      'midiMetronomeMenu' + root.grooveUtilsUniqueIndex
    );
    var gsLogoLoadFullGSElement = document.getElementById(
      'midiGSLogo' + root.grooveUtilsUniqueIndex
    );
    var midiExpandImageElement = document.getElementById(
      'midiExpandImage' + root.grooveUtilsUniqueIndex
    );
    var midiPlayTime = document.getElementById('MIDIPlayTime' + root.grooveUtilsUniqueIndex);

    if (playerControlElement.className.indexOf('small') > -1 || (force && expandElseContract)) {
      // make large
      playerControlElement.className =
        playerControlElement.className.replace(' small', '') + ' large';
      playerControlRowElement.className =
        playerControlRowElement.className.replace(' small', '') + ' large';
      tempoAndProgressElement.className =
        tempoAndProgressElement.className.replace(' small', '') + ' large';
      midiMetronomeMenuElement.className =
        midiMetronomeMenuElement.className.replace(' small', '') + ' large';
      gsLogoLoadFullGSElement.className =
        gsLogoLoadFullGSElement.className.replace(' small', '') + ' large';
      midiExpandImageElement.className =
        midiExpandImageElement.className.replace(' small', '') + ' large';
      midiPlayTime.className = midiPlayTime.className.replace(' small', '') + ' large';
    } else {
      // make small
      playerControlElement.className =
        playerControlElement.className.replace(' large', '') + ' small';
      playerControlRowElement.className =
        playerControlRowElement.className.replace(' large', '') + ' small';
      midiMetronomeMenuElement.className =
        midiMetronomeMenuElement.className.replace(' large', '') + ' small';
      tempoAndProgressElement.className =
        tempoAndProgressElement.className.replace(' large', '') + ' small';
      gsLogoLoadFullGSElement.className =
        gsLogoLoadFullGSElement.className.replace(' large', '') + ' small';
      midiExpandImageElement.className =
        midiExpandImageElement.className.replace(' large', '') + ' small';
      midiPlayTime.className = midiPlayTime.className.replace(' large', '') + ' small';
    }
  };

  function addInlineMetronomeSVG() {
    return (
      '<svg class="midiMetronomeImage" version="1.1" width="30" height="30"' +
      'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" ' +
      'xml:space="preserve"><path d="M86.945,10.635c-0.863-0.494-1.964-0.19-2.455,0.673l-8.31,14.591l-2.891-1.745l-1.769,9.447l0.205,0.123' +
      'l-1.303,2.286L63.111,6.819c-0.25-1-1.299-1.819-2.33-1.819H37.608c-1.031,0-2.082,0.818-2.334,1.818L13.454,93.182' +
      'c-0.253,1,0.385,1.818,1.416,1.818h68.459c1.031,0,1.67-0.818,1.42-1.818L71.69,41.061l3.117-5.475l0.152,0.092l7.559-5.951' +
      'l-3.257-1.966l8.355-14.67C88.11,12.226,87.81,11.127,86.945,10.635z M71.58,70.625H54.855l12.946-22.737l5.197,20.789' +
      'C73.25,69.678,72.61,70.625,71.58,70.625z M50.714,70.625H26.57c-1.031,0-1.669-0.994-1.416-1.994L39.59,11.5' +
      'c0.253-1,1.303-1.812,2.334-1.812h14.431c1.032,0,2.081,0.725,2.331,1.725l7.854,31.421L50.714,70.625z"></path></svg>'
    );
  }

  function addInLineGScribeLogoLoneGSVG() {
    return (
      '<?xml version="1.0"?><svg width="20" heigth="30" viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">' +
      ' <g>' +
      '  <title>Layer 1</title>' +
      '  <g id="svg_15">' +
      '   <path fill="#000000" d="m27.467991,47.742001c-12.28299,0 -22.276001,-9.997009 -22.276001,-22.284c0,-12.27402 9.99402,-22.272 ' +
      '22.276001,-22.272c12.278019,0 22.269009,9.99799 22.269009,22.272c-0.001011,12.286991 -9.992001,22.284 -22.269009,22.284zm0,-37.078001c-8.159,0 ' +
      '-14.794981,6.644011 -14.794981,14.79801c0,8.162979 6.63599,14.791981 14.794981,14.791981c8.157009,0 14.803009,-6.629002 14.803009,-14.791981c0,-8.153999 ' +
      '-6.646,-14.79801 -14.803009,-14.79801z" id="svg_16"/>' +
      '   <path fill="#F7941E" d="m27.467991,33.90799c-4.665991,0 -8.445011,-3.786989 -8.445011,-8.446009c0,-4.653992 3.77902,-8.440981 8.445011,-8.440981c4.64999,0 ' +
      '8.444,3.786989 8.444,8.440981c0.001007,4.659029 -3.792999,8.446009 -8.444,8.446009z" id="svg_17"/>' +
      '   <g id="svg_18">' +
      '	<path fill="#000000" d="m28.13699,85.571991c-5.79599,0 -24.746,-1.138 -24.746,-15.771004c0,-0.921997 0.125,-1.834976 0.39099,-2.791977l0.09399,-0.292999l9.21902,0l-0.151,0.517967c-0.198,0.701019 ' +
      '-0.311,1.417999 -0.311,2.137024c0,6.332001 7.898991,8.583977 15.29199,8.583977c3.610991,0 15.394989,-0.626007 15.394989,-8.687988c0,-4.349014 -3.515987,-6.41901 -11.064968,-6.52301c-6.87302,0 ' +
      '-11.539001,-0.159 -15.027012,-0.983002c-3.431,-0.807007 -4.132019,-1.12698 -6.926999,-2.752987c-3.63602,-2.385014 -5.39401,-5.328003 -5.39401,-8.99802c0,-3.687992 1.854,-6.860981 ' +
      '5.668,-9.716003c0.72501,-0.502987 1.51801,-0.750977 2.37802,-0.750977c1.92099,0 3.824981,1.311977 4.16199,2.865997c0.22501,1.028992 0.48801,0.685001 -0.84,1.881992c-0.85501,0.766968 -3.64001,2.702 ' +
      '-3.64001,5.167988c0,5.662041 10.78802,5.662041 17.235021,5.662041c16.113977,0 22.693998,4.063999 22.693998,14.03598c-0.00198,14.282013 -15.29599,16.415009 ' +
      '-24.427,16.415009l-0.00001,0.000031l0,-0.000031l0,0l0,-0.000008z" id="svg_19"/>' +
      '   </g>' +
      '   <g id="svg_20">' +
      '	<path fill="#000000" d="m46.504002,15.08499c-0.225983,0 -0.423,-0.101009 -4.70599,-2.934999c-2.208023,-1.46399 -4.708023,-3.121 -5.758003,-3.72501l-1.31601,-0.75101l20.405003,0l0,5.715l-8.224003,1.370999c-0.006989,0.01501 ' +
      '-0.006989,0.03802 -0.01498,0.05801l-0.104,0.263l-0.282009,0.004l-0.000019,0.00001l0.000011,0z" id="svg_21"/>' +
      '   </g>' +
      '  </g>' +
      ' </g>' +
      '</svg>'
    );
  }

  root.HTMLForMidiPlayer = function (expandable) {
    var newHTML =
      '' +
      '<div id="playerControl' +
      root.grooveUtilsUniqueIndex +
      '" class="playerControl">' +
      '	<div class="playerControlsRow" id="playerControlsRow' +
      root.grooveUtilsUniqueIndex +
      '">' +
      '		<span title="Play/Pause" class="midiPlayImage" id="midiPlayImage' +
      root.grooveUtilsUniqueIndex +
      '"></span>' +
      '       <span class="MIDIPlayTime" id="MIDIPlayTime' +
      root.grooveUtilsUniqueIndex +
      '">' +
      CONSTANT_Midi_play_time_zero +
      '</span>';

    if (expandable)
      newHTML +=
        '' +
        '       <span title="Metronome controls" class="midiMetronomeMenu" id="midiMetronomeMenu' +
        root.grooveUtilsUniqueIndex +
        '">' +
        addInlineMetronomeSVG() +
        '       </span>';

    newHTML +=
      '<span class="tempoAndProgress" id="tempoAndProgress' +
      root.grooveUtilsUniqueIndex +
      '">' +
      '			<div class="tempoRow">' +
      '				<span class="tempoLabel">BPM</span>' +
      '				<input type="text" for="tempo" class="tempoTextField" pattern="\\d+" id="tempoTextField' +
      root.grooveUtilsUniqueIndex +
      '" value="80"></input>' +
      '				<input type=range min=30 max=300 value=90 class="tempoInput' +
      (root.is_touch_device() ? ' touch' : '') +
      '" id="tempoInput' +
      root.grooveUtilsUniqueIndex +
      '" list="tempoSettings">' +
      '			</div>' +
      '			<div class="swingRow">' +
      '				<span class="swingLabel">SWING</span>' +
      '				<span for="swingAmount" class="swingOutput" id="swingOutput' +
      root.grooveUtilsUniqueIndex +
      '">0% swing</span>' +
      '				<input type=range min=0 max=50 value=0 class="swingInput' +
      (root.is_touch_device() ? ' touch' : '') +
      '" id="swingInput' +
      root.grooveUtilsUniqueIndex +
      '" list="swingSettings" step=5 >' +
      '			</div>' +
      '       </span>';

    if (expandable)
      newHTML +=
        '       <span title="Expand full screen in GrooveScribe" class="midiGSLogo" id="midiGSLogo' +
        root.grooveUtilsUniqueIndex +
        '">' +
        addInLineGScribeLogoLoneGSVG() +
        '       </span>' +
        '		<span title="Expand/Retract player" class="midiExpandImage" id="midiExpandImage' +
        root.grooveUtilsUniqueIndex +
        '"></span>';

    newHTML += '</div>';

    return newHTML;
  };

  // pass in a tag ID.  (not a class)
  // HTML will be put within the tag replacing whatever else was there
  root.AddMidiPlayerToPage = function (HTML_Id_to_attach_to, division, expandable) {
    var html_element = document.getElementById(HTML_Id_to_attach_to);
    if (html_element) html_element.innerHTML = root.HTMLForMidiPlayer(expandable);

    var browserInfo = root.getBrowserInfo();
    var isIE10 = false;
    if (browserInfo.browser == 'MSIE' && browserInfo.version < 12) isIE10 = true;

    // now attach the onclicks
    html_element = document.getElementById('tempoInput' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      if (isIE10) html_element.addEventListener('click', root.tempoUpdateFromSlider, false);
      else html_element.addEventListener('input', root.tempoUpdateFromSlider, false);
    }

    html_element = document.getElementById('tempoTextField' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      html_element.addEventListener('change', root.tempoUpdateFromTextField, false);
    }

    html_element = document.getElementById('swingInput' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      if (isIE10) html_element.addEventListener('click', root.swingUpdateEvent, false);
      else html_element.addEventListener('input', root.swingUpdateEvent, false);
    }

    html_element = document.getElementById('midiRepeatImage' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      html_element.addEventListener('click', root.repeatMIDI_playback, false);
    }

    html_element = document.getElementById('midiExpandImage' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      html_element.addEventListener('click', root.expandOrRetractMIDI_playback, false);
    }

    html_element = document.getElementById('midiGSLogo' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      html_element.addEventListener('click', root.loadFullScreenGrooveScribe, false);
    }

    html_element = document.getElementById('midiMetronomeMenu' + root.grooveUtilsUniqueIndex);
    if (html_element) {
      html_element.addEventListener('click', root.metronomeMiniMenuClick, false);
    }

    // enable or disable swing
    root.swingEnabled(root.doesDivisionSupportSwing(division));
  };
} // end of class

// ES module exports: the GrooveUtils constructor plus the constants that other
// modules (groove_writer) consume. Vendored globals (Abc, MIDI, Midi) remain
// window globals provided by the classic <script> libraries.
export { GrooveUtils };
