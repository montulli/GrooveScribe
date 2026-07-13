import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for the "default groove" generators (used when a new
// instrument line is enabled in the UI and needs a sensible starting pattern),
// plus the note-array scaling / highlighting-mapping helpers that the ABC and
// grid renderers depend on.
describe('GrooveUtils default grooves & note-array scaling', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('GetDefaultStickingsGroove', () => {
    // Signature: (notes_per_measure, timeSigTop, timeSigBottom, numMeasures)
    // Just delegates to GetEmptyGroove - always all rests.
    it('returns an all-rest tab line for a single measure', () => {
      expect(gu.GetDefaultStickingsGroove(16, 4, 4, 1)).toBe('|----------------|');
    });

    it('repeats the empty measure for multiple measures', () => {
      expect(gu.GetDefaultStickingsGroove(16, 4, 4, 2)).toBe('|----------------|----------------|');
    });
  });

  describe('GetDefaultHHGroove', () => {
    // Every position is a normal hi-hat hit ('x'), except the special case
    // of notes_per_measure === 48 (32nd-note triplet grid), which is left
    // entirely empty ('-') rather than filled with hits.
    it('fills every position with x for a normal division', () => {
      expect(gu.GetDefaultHHGroove(16, 4, 4, 1)).toBe('|xxxxxxxxxxxxxxxx|');
    });

    it('repeats the x pattern across multiple measures', () => {
      expect(gu.GetDefaultHHGroove(8, 4, 4, 2)).toBe('|xxxxxxxx|xxxxxxxx|');
    });

    it('special-cases 48 (32nd-note-triplet) divisions to all rests', () => {
      expect(gu.GetDefaultHHGroove(48, 4, 4, 1)).toBe(
        '|------------------------------------------------|'
      );
    });
  });

  describe('GetDefaultTom1Groove / GetDefaultTom4Groove / GetDefaultTomGroove', () => {
    // All three simply delegate to GetEmptyGroove - toms default to silent.
    it('GetDefaultTom1Groove is all rests', () => {
      expect(gu.GetDefaultTom1Groove(16, 4, 4, 1)).toBe('|----------------|');
    });

    it('GetDefaultTom4Groove is all rests', () => {
      expect(gu.GetDefaultTom4Groove(16, 4, 4, 1)).toBe('|----------------|');
    });

    it('GetDefaultTomGroove is all rests', () => {
      expect(gu.GetDefaultTomGroove(16, 4, 4, 1)).toBe('|----------------|');
    });
  });

  describe('GetDefaultSnareGroove', () => {
    // notes_per_grouping = notes_per_measure / timeSigTop. An accented 'O'
    // is placed at the start of each ODD-numbered grouping (i.e. the
    // classic backbeat on beats 2 and 4 in straight time).
    it('places the backbeat (2 & 4) in 4/4 at 32 notes per measure', () => {
      expect(gu.GetDefaultSnareGroove(32, 4, 4, 1)).toBe('|--------O---------------O-------|');
    });

    it('places the backbeat (2 & 4) in 4/4 at 16 notes per measure', () => {
      expect(gu.GetDefaultSnareGroove(16, 4, 4, 1)).toBe('|----O-------O---|');
    });

    it('places the backbeat (2 & 4) in 4/4 at 8 notes per measure', () => {
      expect(gu.GetDefaultSnareGroove(8, 4, 4, 1)).toBe('|--O---O-|');
    });

    it('places accents on odd beat groups in 6/8 (beats 2, 4, 6)', () => {
      expect(gu.GetDefaultSnareGroove(6, 6, 8, 1)).toBe('|-O-O-O|');
      expect(gu.GetDefaultSnareGroove(12, 6, 8, 1)).toBe('|--O---O---O-|');
    });

    it('repeats the same pattern across multiple measures', () => {
      expect(gu.GetDefaultSnareGroove(16, 4, 4, 2)).toBe('|----O-------O---|----O-------O---|');
    });
  });

  describe('GetDefaultKickGroove', () => {
    // Mirror image of the snare default: a normal 'o' hit at the start of
    // each EVEN-numbered grouping (beats 1 and 3 in straight time).
    it('places kicks on 1 & 3 in 4/4 at 32 notes per measure', () => {
      expect(gu.GetDefaultKickGroove(32, 4, 4, 1)).toBe('|o---------------o---------------|');
    });

    it('places kicks on 1 & 3 in 4/4 at 16 notes per measure', () => {
      expect(gu.GetDefaultKickGroove(16, 4, 4, 1)).toBe('|o-------o-------|');
    });

    it('places kicks on 1 & 3 in 4/4 at 8 notes per measure', () => {
      expect(gu.GetDefaultKickGroove(8, 4, 4, 1)).toBe('|o---o---|');
    });

    it('places kicks on even beat groups (1, 3, 5) in 6/8', () => {
      expect(gu.GetDefaultKickGroove(6, 6, 8, 1)).toBe('|o-o-o-|');
      expect(gu.GetDefaultKickGroove(12, 6, 8, 1)).toBe('|o---o---o---|');
    });

    it('repeats the same pattern across multiple measures', () => {
      expect(gu.GetDefaultKickGroove(16, 4, 4, 2)).toBe('|o-------o-------|o-------o-------|');
    });
  });

  describe('scaleNoteArrayToFullSize', () => {
    // Expands a note array to the canonical "full size" resolution:
    //  - 32 notes/measure for straight (non-triplet) divisions
    //  - 48 notes/measure for triplet divisions (division % 12 === 0,
    //    where division is derived from notes_per_measure & the time sig)
    // Values are spread out with `false` (rest) padding in between; if the
    // array is already full size (scaler === 1) the ORIGINAL array
    // reference is returned unchanged, even when num_measures > 1.

    it('expands 16 notes/measure (4/4) to 32 by doubling spacing', () => {
      const arr = new Array(16).fill(false);
      arr[0] = 'F';
      arr[4] = '!accent!c';
      arr[15] = '^g';

      const res = gu.scaleNoteArrayToFullSize(arr, 1, 16, 4, 4);

      expect(res).toHaveLength(32);
      expect(res[0]).toBe('F');
      expect(res[8]).toBe('!accent!c');
      expect(res[30]).toBe('^g');
      // everything else is padded with false
      expect(res.filter((v) => v === false)).toHaveLength(29);
    });

    it('expands 8 notes/measure (4/4) to 32 (scaler = 4) across 2 measures', () => {
      const arr = new Array(16).fill(false); // 2 measures * 8 notes/measure
      arr[0] = 'F'; // measure 1, position 0
      arr[8] = 'F'; // measure 2, position 0

      const res = gu.scaleNoteArrayToFullSize(arr, 2, 8, 4, 4);

      expect(res).toHaveLength(64); // 2 measures * 32
      expect(res[0]).toBe('F');
      expect(res[32]).toBe('F'); // second measure starts at index 32
    });

    it('returns the SAME array unchanged when already full size (32, 4/4), ignoring numMeasures', () => {
      const arr = new Array(64).fill(false);
      arr[0] = 'F';

      const res = gu.scaleNoteArrayToFullSize(arr, 2, 32, 4, 4);

      expect(res).toBe(arr); // scaler === 1 short-circuits to the original reference
      expect(res).toHaveLength(64);
    });

    it('expands 12 (8th-note-triplet division in 4/4) to 48 by scaler 4', () => {
      const arr = new Array(12).fill(false);
      arr[0] = 'F';
      arr[6] = 'F';

      const res = gu.scaleNoteArrayToFullSize(arr, 1, 12, 4, 4);

      expect(res).toHaveLength(48);
      expect(res[0]).toBe('F');
      expect(res[24]).toBe('F');
    });

    it('expands 24 (16th-note-triplet division in 4/4) to 48 by scaler 2', () => {
      const arr = new Array(24).fill(false);
      arr[0] = 'F';

      const res = gu.scaleNoteArrayToFullSize(arr, 1, 24, 4, 4);

      expect(res).toHaveLength(48);
      expect(res[0]).toBe('F');
    });

    it('expands 6 notes/measure in 6/8 (straight 8th notes) to 24 by scaler 4', () => {
      const arr = new Array(6).fill(false);
      arr[0] = 'F';
      arr[3] = 'F';

      const res = gu.scaleNoteArrayToFullSize(arr, 1, 6, 6, 8);

      expect(res).toHaveLength(24); // notesPerMeasureInFullSizeArray(false,6,8) = 32*(6/8) = 24
      expect(res[0]).toBe('F');
      expect(res[12]).toBe('F');
    });

    it('expands 12 notes/measure in 6/8 (still a straight division, NOT triplet) to 24 by scaler 2', () => {
      // NOTE: notes_per_measure=12 would imply triplets in 4/4, but in 6/8
      // the implied division is (12/6)*8 = 16, which is not a multiple of
      // 12, so this is treated as a straight (non-triplet) division.
      const arr = new Array(12).fill(false);
      arr[0] = 'F';
      arr[6] = 'F';

      expect(gu.getNoteScaler(12, 6, 8)).toBe(2);

      const res = gu.scaleNoteArrayToFullSize(arr, 1, 12, 6, 8);

      expect(res).toHaveLength(24);
      expect(res[0]).toBe('F');
      expect(res[12]).toBe('F');
    });
  });

  describe('create_note_mapping_array_for_highlighting', () => {
    // Returns a boolean array the same length as num_notes: true wherever
    // ANY of the passed-in arrays (HH, snare, kick, or any of the 4 toms)
    // has a non-false value at that index.
    it('marks true at indices where hh, snare, or kick has a hit', () => {
      const hh = [false, 'x', false, false];
      const snare = [false, false, 'O', false];
      const kick = [false, false, false, false];
      const toms = [
        [false, false, false, false],
        [false, false, false, 'T'],
        [false, false, false, false],
        [false, false, false, false],
      ];

      const res = gu.create_note_mapping_array_for_highlighting(hh, snare, kick, toms, 4);

      expect(res).toEqual([false, true, true, true]);
    });

    it('marks true purely from a toms hit even when hh/snare/kick are silent there', () => {
      const hh = [false, false];
      const snare = [false, false];
      const kick = [false, false];
      const toms = [
        [false, 'T'],
        [false, false],
        [false, false],
        [false, false],
      ];

      const res = gu.create_note_mapping_array_for_highlighting(hh, snare, kick, toms, 2);

      expect(res).toEqual([false, true]);
    });

    it('treats null hh/snare/kick/toms arrays as no hits (all false)', () => {
      const res = gu.create_note_mapping_array_for_highlighting(null, null, null, null, 4);

      expect(res).toEqual([false, false, false, false]);
    });
  });
});
