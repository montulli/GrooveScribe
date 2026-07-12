import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for the time-signature / division math in groove_utils.js.
// These are pure functions and form the backbone of every layout calculation,
// so they are the safest and highest-value place to lock behavior before any
// refactor.
describe('GrooveUtils time signature & division math', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('parseTimeSigString', () => {
    it('parses a standard signature into [top, bottom]', () => {
      expect(gu.parseTimeSigString('4/4')).toEqual([4, 4]);
      expect(gu.parseTimeSigString('6/8')).toEqual([6, 8]);
      expect(gu.parseTimeSigString('7/16')).toEqual([7, 16]);
    });

    it('falls back to 4/4 for malformed input', () => {
      expect(gu.parseTimeSigString('garbage')).toEqual([4, 4]);
      expect(gu.parseTimeSigString('4')).toEqual([4, 4]);
    });
  });

  describe('calc_notes_per_measure', () => {
    it('returns the division directly for 4/4', () => {
      expect(gu.calc_notes_per_measure(8, 4, 4)).toBe(8);
      expect(gu.calc_notes_per_measure(16, 4, 4)).toBe(16);
      expect(gu.calc_notes_per_measure(12, 4, 4)).toBe(12);
    });

    it('scales the division by the time signature for compound meters', () => {
      expect(gu.calc_notes_per_measure(16, 6, 8)).toBe(12);
      expect(gu.calc_notes_per_measure(12, 6, 8)).toBe(9);
    });
  });

  describe('isTripletDivision', () => {
    it('is true for triplet-based divisions', () => {
      expect(gu.isTripletDivision(12)).toBe(true);
      expect(gu.isTripletDivision(24)).toBe(true);
      expect(gu.isTripletDivision(48)).toBe(true);
    });

    it('is false for straight divisions', () => {
      expect(gu.isTripletDivision(8)).toBe(false);
      expect(gu.isTripletDivision(16)).toBe(false);
    });
  });

  describe('noteGroupingSize', () => {
    it('groups straight 16ths into fours', () => {
      expect(gu.noteGroupingSize(16, 4, 4)).toBe(4);
    });

    it('groups triplets into threes', () => {
      expect(gu.noteGroupingSize(12, 4, 4)).toBe(3);
    });
  });

  describe('full-size array sizing & scaling', () => {
    it('reports the full-size array width per measure', () => {
      expect(gu.notesPerMeasureInFullSizeArray(false, 4, 4)).toBe(32);
      expect(gu.notesPerMeasureInFullSizeArray(true, 4, 4)).toBe(48);
    });

    it('computes the note scaler from division to full-size', () => {
      expect(gu.getNoteScaler(16, 4, 4)).toBe(2);
      expect(gu.getNoteScaler(8, 4, 4)).toBe(4);
    });
  });
});
