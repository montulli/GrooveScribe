import { describe, it, vi } from 'vitest';
import * as perm from '../../js/permutations.js';
import { expectGolden } from '../helpers/golden.js';

// Characterization of js/permutations.js: every generator, for every section (and some out of range),
// triplets and straight. Pins the exact output so the pattern tables can be rewritten safely.

const SECTIONS = Array.from({ length: 24 }, (_, i) => i - 3); // -3 .. 20
const outcome = (fn) => {
  try {
    return fn();
  } catch (e) {
    return { threw: String(e.message).slice(0, 60) };
  }
};

describe('permutations (golden)', () => {
  it('note-array generators', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = {};
    for (const name of [
      'get_kick16th_permutation_array',
      'get_kick16th_permutation_array_minus_some',
      'get_snare_permutation_array',
      'get_snare_accent_permutation_array',
      'get_snare_accent_with_diddle_permutation_array',
    ]) {
      out[name] = {};
      for (const triplets of [false, true]) {
        for (const section of SECTIONS) {
          out[name][`${triplets ? 'trip' : 'straight'}:${section}`] = outcome(() =>
            perm[name](section, triplets)
          );
        }
      }
    }
    expectGolden('permutations-arrays.json', out);
  });

  it('ABC boilerplate for every section / flag combination', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = {};
    for (const section of SECTIONS) {
      for (const showTitle of [undefined, false, true]) {
        out[`pre:${section}:${showTitle}`] = outcome(() =>
          perm.get_permutation_pre_ABC(section, showTitle)
        );
      }
      for (const triplets of [false, true]) {
        for (const isLast of [undefined, false, true]) {
          out[`post:${section}:${triplets}:${isLast}`] = outcome(() =>
            perm.get_permutation_post_ABC(section, triplets, isLast)
          );
        }
      }
    }
    out.numSections = perm.get_numSectionsFor_permutation_array();
    expectGolden('permutations-abc.json', out);
  });

  it('display flags for every on/off combination of the sections', () => {
    // 2^16 masks x 16 sections is too much to store, so store a digest per section and a few samples
    const { createHash } = require('node:crypto');
    const hashes = {};
    const samples = {};
    for (let section = 0; section < 16; section++) {
      const hash = createHash('sha256');
      for (let mask = 0; mask < 1 << 16; mask += 1) {
        const flags = perm.get_permutation_display_flags(section, (i) => (mask >> i) & 1);
        hash.update(`${flags.showTitle ? 1 : 0}${flags.isLast ? 1 : 0},`);
      }
      hashes[section] = hash.digest('hex');
      samples[section] = [0xffff, 0x0000, 0x5555, 0xaaaa].map((mask) =>
        perm.get_permutation_display_flags(section, (i) => (mask >> i) & 1)
      );
    }
    expectGolden('permutations-flags.json', { hashes, samples });
  });

  it('kick array merge / filter over every pair of states', () => {
    const states = [false, 'F', '[F^d,]', '^d,'];
    const out = {};
    for (const a of states) {
      for (const b of states) {
        out[`merge:${a}|${b}`] = perm.merge_kick_arrays([a], [b]);
      }
      out[`filter:${a}`] = perm.filter_kick_array_for_permutation([a]);
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
    out.merge_unknown = perm.merge_kick_arrays(['zzz'], ['F']);
    expectGolden('permutations-kick-merge.json', out);
  });
});
