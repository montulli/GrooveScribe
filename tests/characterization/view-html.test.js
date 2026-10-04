import { describe, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildStaffContainerHTML, buildPermutationOptionsHTML } from '../../js/viewHtml.js';
import { expectGolden } from '../helpers/golden.js';

// Characterization of js/viewHtml.js: the exact markup for the note grid and the permutation options,
// so the row builders can be restructured without changing a character of the output.

const CONFIGS = [
  // [label, baseindex, indexStartForNotes, ctx]
  ['4/4 16ths, 1 measure', 1, 0, { notesPerMeasure: 16, noteGrouping: 4, numberOfMeasures: 1 }],
  [
    '4/4 16ths, measure 2 of 2',
    2,
    16,
    { notesPerMeasure: 16, noteGrouping: 4, numberOfMeasures: 2 },
  ],
  ['4/4 32nds, 3 measures', 1, 0, { notesPerMeasure: 32, noteGrouping: 8, numberOfMeasures: 3 }],
  ['4/4 8th triplets', 1, 0, { notesPerMeasure: 12, noteGrouping: 3, numberOfMeasures: 1 }],
  ['6/8 8ths', 1, 0, { notesPerMeasure: 6, noteGrouping: 3, numberOfMeasures: 1 }],
  ['5/4 16ths, last of 4', 4, 60, { notesPerMeasure: 20, noteGrouping: 4, numberOfMeasures: 4 }],
  ['odd grouping', 1, 0, { notesPerMeasure: 7, noteGrouping: 2, numberOfMeasures: 1 }],
];

describe('viewHtml (golden)', () => {
  it('staff container markup', () => {
    // Digests keep the fixture small; two configurations are stored in full so a failure can be diffed.
    const FULL = ['4/4 16ths, 1 measure', '6/8 8ths'];
    const out = {};
    for (const [label, base, start, ctx] of CONFIGS) {
      const html = buildStaffContainerHTML(base, start, ctx);
      out[label] = {
        length: html.length,
        sha256: createHash('sha256').update(html).digest('hex'),
        full: FULL.includes(label) ? html : undefined,
      };
    }
    expectGolden('view-staff-containers.json', out);
  });

  it('permutation options markup', () => {
    const out = {};
    for (const type of ['none', 'kick_16ths', 'snare_16ths']) {
      for (const triplets of [false, true]) {
        out[`${type}:${triplets}`] = buildPermutationOptionsHTML(type, triplets);
      }
    }
    expectGolden('view-permutation-options.json', out);
  });
});
