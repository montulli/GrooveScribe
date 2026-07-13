import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for the tab-string <-> note-array conversions. This is the
// core data model: the grid UI, the ABC/sheet-music generator, and the MIDI
// player all consume the arrays these functions produce.
describe('GrooveUtils note-array conversions', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('GetEmptyGroove', () => {
    it('produces a fully rest tab line of the requested width', () => {
      expect(gu.GetEmptyGroove(16, 1)).toBe('|----------------|');
      expect(gu.GetEmptyGroove(8, 1)).toBe('|--------|');
    });
  });

  describe('noteArraysFromURLData', () => {
    it('decodes a hi-hat tab line into ABC note tokens with rests as false', () => {
      expect(gu.noteArraysFromURLData('H', '|x-x-|', 4, 1)).toEqual(['^g', false, '^g', false]);
    });

    it('decodes accents and rests on the snare line', () => {
      const snare = gu.noteArraysFromURLData('S', '|----O-------O---|', 16, 1);
      expect(snare[4]).toBe('!accent!c');
      expect(snare[12]).toBe('!accent!c');
      expect(snare[0]).toBe(false);
    });

    it('decodes kick hits', () => {
      const kick = gu.noteArraysFromURLData('K', '|o-------o-------|', 16, 1);
      expect(kick[0]).toBe('F');
      expect(kick[8]).toBe('F');
      expect(kick[1]).toBe(false);
    });
  });

  describe('mergeDrumTabLines', () => {
    it('overlays a subordinate line onto the dominant one', () => {
      expect(gu.mergeDrumTabLines('x---', '--o-')).toBe('x-o-');
    });

    it('keeps the dominant note where both lines have a hit', () => {
      expect(gu.mergeDrumTabLines('x---', 'o---')).toBe('x---');
    });
  });

  describe('tabLine <-> array round trip', () => {
    // getAccents + getOthers = true renders every voiced note (not just accents),
    // which is what reconstructs the full tab line.
    it('reconstructs the original hi-hat tab from its note array', () => {
      const arr = gu.noteArraysFromURLData('H', '|x-x-|', 4, 1);
      const back = gu.tabLineFromAbcNoteArray('H', arr, true, true, 4, 0);
      expect(back).toBe('x-x-');
      // decoding the reconstruction yields the same note array
      expect(gu.noteArraysFromURLData('H', `|${back}|`, 4, 1)).toEqual(arr);
    });

    it('reconstructs a snare tab preserving accented vs normal hits', () => {
      const arr = gu.noteArraysFromURLData('S', '|--O--o--|', 8, 1);
      const back = gu.tabLineFromAbcNoteArray('S', arr, true, true, 8, 0);
      expect(back).toBe('--O--o--');
    });
  });
});
