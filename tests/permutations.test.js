import { describe, it, expect } from 'vitest';
import {
  get_permutation_display_flags,
  get_permutation_pre_ABC,
  get_permutation_post_ABC,
} from '../js/permutations.js';

const only =
  (...on) =>
  (s) =>
    on.includes(s);

describe('permutation section layout (issue #12)', () => {
  it('all sections on: heading on the first, close on the last (unchanged defaults)', () => {
    const all = () => true;
    expect(get_permutation_display_flags(1, all)).toEqual({ showTitle: true, isLast: false });
    expect(get_permutation_display_flags(4, all)).toEqual({ showTitle: false, isLast: true });
    expect(get_permutation_pre_ABC(1, true)).toBe(get_permutation_pre_ABC(1));
    expect(get_permutation_post_ABC(4, false, true)).toBe(
      get_permutation_post_ABC(4, false, false)
    );
  });

  it('unticking the "1" moves the heading to the next displayed section', () => {
    const isActive = only(2, 3, 4);
    expect(get_permutation_display_flags(2, isActive).showTitle).toBe(true);
    expect(get_permutation_display_flags(3, isActive).showTitle).toBe(false);
    expect(get_permutation_pre_ABC(2, true)).toMatch(
      /^T: \nP: Singles\n%\n%\n% singles on the "e"/
    );
    expect(get_permutation_pre_ABC(2, false)).not.toMatch(/P: Singles/);
  });

  it('unticking the "a" closes the measure on the last displayed section', () => {
    const isActive = only(1, 2, 3);
    expect(get_permutation_display_flags(3, isActive).isLast).toBe(true);
    expect(get_permutation_post_ABC(3, false, true)).toBe('|\n');
    expect(get_permutation_post_ABC(3, false, false)).toBe('\\\n');
  });

  it('groups are independent, and ostinato/quads are untouched', () => {
    const isActive = only(6, 7);
    expect(get_permutation_display_flags(6, isActive)).toEqual({ showTitle: true, isLast: false });
    expect(get_permutation_display_flags(7, isActive)).toEqual({ showTitle: false, isLast: true });
    expect(get_permutation_display_flags(0, isActive)).toEqual({ showTitle: false, isLast: false });
    expect(get_permutation_pre_ABC(15, true)).toBe(get_permutation_pre_ABC(15));
  });
});
