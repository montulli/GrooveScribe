// Regression tests for the pure HTML-string generators in js/groove_writer.js:
//   - GrooveWriter.HTMLforStaffContainer(baseindex, indexStartForNotes)
//   - GrooveWriter.HTMLforPermutationOptions()  (declared with zero params -- see below)
//
// Every assertion here was checked against real, observed output (console.log
// probes run through `npx vitest run`) before being written -- nothing is
// asserted from reading the source alone.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newGrooveWriter, buildGridDOM } from '../helpers/loadGrooveWriter.js';

// class_time_division is seeded from window.location.search ("Div" query
// param) at construction time (see GrooveWriter's `class_time_division` init
// and getQueryVariableFromURL). window.location persists across tests within
// a file, so any test that pushes a non-default "Div" onto the URL (to build
// a triplet-division writer) must not leak into later tests. Reset before
// every test.
beforeEach(() => {
  window.history.pushState({}, '', '/');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Extracts, in document order, the sticking-note ids and the group-divider
// markers that appear *inside* the stickings-container div (i.e. before the
// first "end_note_space" div that closes the note loop). This lets us assert
// exactly which notes get a "space_between_note_groups" divider after them,
// which is how HTMLforStaffContainer visually groups notes by beat -- and
// which differs between straight and triplet divisions.
function permutationGroupIds(html) {
  return [...html.matchAll(/PermutationOptionGroup" id="(\w+)Group"/g)].map((m) => m[1]);
}

function stickingGroupTokens(html) {
  const start = html.indexOf('<div class="stickings-container">');
  const end = html.indexOf('<div class="end_note_space">', start);
  const section = html.slice(start, end);
  const re = /id="sticking(\d+)"|class="space_between_note_groups"/g;
  const tokens = [];
  let m;
  while ((m = re.exec(section))) {
    tokens.push(m[1] !== undefined ? Number(m[1]) : 'GAP');
  }
  return tokens;
}

// permutationPopupClick() and addMeasureButtonClick() both do the state
// mutation we care about (class_permutation_type / class_number_of_measures)
// synchronously and *first*, then fall through to updateSheetMusic() to
// regenerate the ABC/SVG preview. That tail throws in this test harness: the
// production files are classic <script> tags sharing one global scope, so a
// bare `var constant_ABC_SN_Normal = ...` declared at the top of
// groove_utils.js becomes `window.constant_ABC_SN_Normal`, visible to
// groove_writer.js. Vitest's legacy-export transform (vitest.config.js) turns
// each file into its own ES module instead, so those top-level `var`s no
// longer leak globally and groove_writer.js sees a ReferenceError partway
// through ABC generation. This is a harness/module-scoping artifact, not a
// product bug -- confirmed by probing: the error only fires deep inside
// generate_ABC(), well after the state field we're testing was already
// assigned. We swallow it here so we can observe the real, intended state
// change without dragging in the whole ABC/MIDI/SVG rendering stack (which is
// out of scope for these pure-HTML-generator tests).
function swallowingKnownHarnessGap(fn) {
  try {
    fn();
  } catch {
    /* see comment above: expected ReferenceError from ABC-generation tail */
  }
}

// Minimal DOM + stub so permutationPopupClick()/addMeasureButtonClick() can
// run far enough to perform their state mutation before hitting the harness
// gap described above.
function scaffoldForStateMutatingCalls(gw) {
  buildGridDOM(gw, 1); // note grid + tuneTitle/tuneAuthor/tuneComments/showLegend inputs
  const permDiv = document.createElement('div');
  permDiv.id = 'PermutationOptions';
  document.body.appendChild(permDiv);
  const abcSource = document.createElement('textarea');
  abcSource.id = 'ABCsource';
  document.body.appendChild(abcSource);
  const diverr = document.createElement('div');
  diverr.id = 'diverr';
  document.body.appendChild(diverr);
  const svgTarget = document.createElement('div');
  svgTarget.id = 'svgTarget';
  document.body.appendChild(svgTarget);
  // Real abc2svg rendering isn't loaded here (out of scope); stub it so the
  // *reachable* part of updateSheetMusic doesn't do real rendering work.
  vi.spyOn(gw.myGrooveUtils, 'renderABCtoSVG').mockReturnValue({ svg: '', error_html: '' });
}

let gw;

// ---------------------------------------------------------------------------
// HTMLforStaffContainer
// ---------------------------------------------------------------------------
describe('HTMLforStaffContainer', () => {
  describe('canonical default grid (4/4, 16th notes, 1 measure, baseindex 1, indexStart 0)', () => {
    it('pins the exact generated markup', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const html = gw.HTMLforStaffContainer(1, 0);
      expect(html).toMatchSnapshot();
    });

    it('contains one row-container per instrument plus the sticking labels row', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const html = gw.HTMLforStaffContainer(1, 0);

      expect(html).toContain('class="staff-container" id="staff-container1"');
      expect(html).toContain('class="stickings-row-container"');
      expect(html).toContain('class="stickings-container"');
      expect(html).toContain('class="hi-hat-container"');
      expect(html).toContain('id="tom1-container"');
      expect(html).toContain('class="snare-container"');
      expect(html).toContain('id="tom4-container"');
      expect(html).toContain('class="kick-container"');

      // Row labels, each wired to noteLabelClick with this baseindex.
      expect(html).toContain('>STICKINGS</div>');
      expect(html).toContain('>Hi-hat</div>');
      expect(html).toContain('id="tom1-label"');
      expect(html).toContain('>Snare</div>');
      expect(html).toContain('id="tom4-label"');
      expect(html).toContain('>Kick</div>');
    });

    it('emits exactly notesPerMeasure() note cells for every instrument row', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const html = gw.HTMLforStaffContainer(1, 0);
      const n = gw.notesPerMeasure();
      expect(n).toBe(16); // default: 4/4 time, 16th-note division

      expect(html.match(/id="sticking\d+"/g) || []).toHaveLength(n);
      expect(html.match(/id="hi-hat\d+"/g) || []).toHaveLength(n);
      expect(html.match(/id="snare\d+"/g) || []).toHaveLength(n);
      expect(html.match(/id="kick\d+"/g) || []).toHaveLength(n);
      expect(html.match(/id="tom1-\d+"/g) || []).toHaveLength(n);
      expect(html.match(/id="tom4-\d+"/g) || []).toHaveLength(n);
      // Background-highlight cells (used for playback/hover highlighting) also
      // scale with notesPerMeasure.
      expect(html.match(/id="bg-highlight\d+"/g) || []).toHaveLength(n);
    });

    it('note ids run from indexStartForNotes .. indexStartForNotes+notesPerMeasure-1', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const html = gw.HTMLforStaffContainer(1, 0);
      expect(html).toContain('id="sticking0"');
      expect(html).toContain('id="sticking15"');
      expect(html).not.toContain('id="sticking16"');
      expect(html).toContain('id="hi-hat0"');
      expect(html).toContain('id="hi-hat15"');
    });

    it('single-measure default: shows the add-measure button, and a blank close-measure placeholder (no id)', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const html = gw.HTMLforStaffContainer(1, 0);
      // baseindex(1) === class_number_of_measures(1) -> add-measure button rendered
      expect(html).toContain('id="addMeasureButton"');
      // class_number_of_measures(1) is not > 1 -> close-measure button is the
      // inert "&nbsp;&nbsp;&nbsp;" placeholder, not a clickable id'd button.
      expect(html).not.toMatch(/id="closeMeasureButton\d+"/);
      expect(html).toContain('class="closeMeasureButton"><i class="fa">&nbsp;&nbsp;&nbsp;</i>');
    });
  });

  describe('indexStartForNotes / baseindex offsets (still a single measure, so class_number_of_measures stays 1)', () => {
    it('baseindex 2 with an offset indexStartForNotes shifts every id, and no longer matches the add-measure condition', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const notesPerMeasure = gw.notesPerMeasure(); // 16
      const html = gw.HTMLforStaffContainer(2, notesPerMeasure);

      expect(html).toContain('id="staff-container2"');
      expect(html).toContain(`id="hi-hat${notesPerMeasure}"`); // hi-hat16
      expect(html).toContain(`id="sticking${notesPerMeasure}"`);
      expect(html).not.toContain('id="hi-hat0"'); // no notes below the offset

      // baseindex(2) !== class_number_of_measures(1): no add-measure button on
      // this container, even though it's the "second" container rendered.
      expect(html).not.toContain('id="addMeasureButton"');
    });
  });

  describe('measure count affects the close/add-measure buttons (class_number_of_measures > 1)', () => {
    it('after a real addMeasureButtonClick(), measure 1 gets a clickable close button and measure 2 gets the add button', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      scaffoldForStateMutatingCalls(gw);

      expect(gw.numberOfMeasures()).toBe(1);
      swallowingKnownHarnessGap(() => gw.addMeasureButtonClick());
      expect(gw.numberOfMeasures()).toBe(2); // the state mutation we care about did happen

      const html1 = gw.HTMLforStaffContainer(1, 0);
      const html2 = gw.HTMLforStaffContainer(2, gw.notesPerMeasure());

      // Measure 1: class_number_of_measures(2) > 1 -> real, clickable close button.
      expect(html1).toContain('id="closeMeasureButton1"');
      // baseindex(1) !== class_number_of_measures(2) -> no add-measure button here.
      expect(html1).not.toContain('id="addMeasureButton"');

      // Measure 2: also gets a close button, AND is the add-measure slot.
      expect(html2).toContain('id="closeMeasureButton2"');
      expect(html2).toContain('id="addMeasureButton"');
    });
  });

  describe('note grouping differs between straight and triplet divisions', () => {
    // class_time_division is read once, at construction, from the "Div" URL
    // query parameter (default "16"); there is no other supported way to seed
    // a triplet division without going through changeDivision(), which (like
    // permutationPopupClick/addMeasureButtonClick) ends in the same
    // ABC-generation harness gap. Seeding via the URL avoids that entirely.
    it('16th notes (straight, /?Div=16): groups of 4, divider after every 4th note', async () => {
      window.history.pushState({}, '', '/?Div=16');
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      expect(gw.notesPerMeasure()).toBe(16);
      const html = gw.HTMLforStaffContainer(1, 0);
      expect(stickingGroupTokens(html)).toEqual([
        0,
        1,
        2,
        3,
        'GAP',
        4,
        5,
        6,
        7,
        'GAP',
        8,
        9,
        10,
        11,
        'GAP',
        12,
        13,
        14,
        15,
      ]);
    });

    it('8th-note triplets (/?Div=24): 24 notes/measure, groups of 6, divider after every 6th note', async () => {
      window.history.pushState({}, '', '/?Div=24');
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      expect(gw.notesPerMeasure()).toBe(24); // (24/4)*4 beats -- see calc_notes_per_measure
      const html = gw.HTMLforStaffContainer(1, 0);
      expect(html.match(/id="hi-hat\d+"/g) || []).toHaveLength(24);
      expect(stickingGroupTokens(html)).toEqual([
        0,
        1,
        2,
        3,
        4,
        5,
        'GAP',
        6,
        7,
        8,
        9,
        10,
        11,
        'GAP',
        12,
        13,
        14,
        15,
        16,
        17,
        'GAP',
        18,
        19,
        20,
        21,
        22,
        23,
      ]);
    });
  });

  describe('stickings/toms shown-vs-hidden UI state does not change the generated markup', () => {
    // toggleAdvancedEdit() and the "hide row" context-menu actions only flip
    // a CSS class / inline `visibility` style on DOM nodes that already exist
    // (see showHideCSS_ClassVisibility / toggleAdvancedEdit in
    // js/groove_writer.js); they never touch HTMLforStaffContainer's output.
    // The sticking-row and tom-row divs are unconditionally present in every
    // build, so this generator has no "hidden" variant to test -- confirmed
    // by reading the function body (no reference to class_advancedEditIsOn or
    // any show/hide flag) and by the identical-output check below.
    it('toggleAdvancedEdit() does not alter a freshly generated container', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      const before = gw.HTMLforStaffContainer(1, 0);
      gw.toggleAdvancedEdit(); // only touches document.getElementById("advancedEditAnchor"), which doesn't exist here -- handled gracefully, no throw
      const after = gw.HTMLforStaffContainer(1, 0);
      expect(after).toBe(before);
      // Both builds still contain the sticking and tom rows regardless.
      expect(after).toContain('class="stickings-row-container"');
      expect(after).toContain('id="tom1-container"');
      expect(after).toContain('id="tom4-container"');
    });
  });
});

// ---------------------------------------------------------------------------
// HTMLforPermutationOptions
// ---------------------------------------------------------------------------
describe('HTMLforPermutationOptions', () => {
  // NB: the function is declared as `root.HTMLforPermutationOptions = function () {...}`
  // -- it takes *no* parameters. Whatever gets passed in is ignored; the menu
  // is driven entirely by the private class_permutation_type field, which is
  // only mutated by permutationPopupClick(perm_type). Confirmed by probing:
  // calling with two different bogus arguments back-to-back (same internal
  // state) returns identical strings.
  it('ignores any argument passed to it', async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    const a = gw.HTMLforPermutationOptions();
    const b = gw.HTMLforPermutationOptions('kick_16ths'); // bogus: state is still "none"
    const c = gw.HTMLforPermutationOptions('totally_bogus_value_xyz');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('returns an empty string for the default "none" permutation state', async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    expect(gw.HTMLforPermutationOptions()).toBe('');
  });

  describe('"kick_16ths" permutation type (straight 4/4, default 16th division)', () => {
    it('renders the Skip-first-notes, Ostinato, Singles, Doubles, Downbeats/Upbeats, Triples and Quads groups', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      scaffoldForStateMutatingCalls(gw);
      swallowingKnownHarnessGap(() => gw.permutationPopupClick('kick_16ths'));

      const html = gw.HTMLforPermutationOptions();
      expect(html).toMatchSnapshot();

      const groupIds = permutationGroupIds(html);
      expect(groupIds).toEqual([
        'PermuationOptionsSkipSomeFirstNotes',
        'PermuationOptionsOstinato',
        'PermuationOptionsSingles',
        'PermuationOptionsDoubles',
        'PermuationOptionsUpsDowns',
        'PermuationOptionsTriples',
        'PermuationOptionsQuads',
      ]);

      expect(html).toContain('>Simplify multiple kicks</label>');
      expect(html).toContain('>Downbeats/Upbeats</label>');
      expect(html).toContain('>Quads</label>');
      // Kick permutation does NOT add the snare-only "Use Accent Grid" option.
      expect(html).not.toContain('Use Accent Grid');
      // Singles/Doubles/Triples default on (checked), Ostinato/UpsDowns/Quads/
      // SkipSomeFirstNotes default off.
      expect(html).toMatch(/checked type="checkbox"[^>]*id="PermuationOptionsSingles"/);
      expect(html).toMatch(/checked type="checkbox"[^>]*id="PermuationOptionsDoubles"/);
      expect(html).toMatch(/checked type="checkbox"[^>]*id="PermuationOptionsTriples"/);
      expect(html).not.toMatch(/checked type="checkbox"[^>]*id="PermuationOptionsOstinato"/);
      expect(html).not.toMatch(/checked type="checkbox"[^>]*id="PermuationOptionsQuads"/);
    });

    it('drops SkipSomeFirstNotes/Downbeats-Upbeats/Quads and uses 3-way (not 4-way) sub-options when the division is triplet-based', async () => {
      window.history.pushState({}, '', '/?Div=24');
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      scaffoldForStateMutatingCalls(gw);
      swallowingKnownHarnessGap(() => gw.permutationPopupClick('kick_16ths'));

      const html = gw.HTMLforPermutationOptions();
      const groupIds = permutationGroupIds(html);
      // Triplets only support 4/4 (2/4), so noteGroupingSize's "e"/upbeat
      // subdivisions and the odd-count-specific groups don't apply.
      expect(groupIds).toEqual([
        'PermuationOptionsOstinato',
        'PermuationOptionsSingles',
        'PermuationOptionsDoubles',
        'PermuationOptionsTriples',
      ]);
      // Sub-options fall back to the 3-item ["1","&","a"] set (no "e") for triplets.
      expect(html).toContain('>1</label>');
      expect(html).toContain('>&</label>');
      expect(html).toContain('>a</label>');
      expect(html).not.toMatch(/PermuationOptionsSingles_sub\d">e</);
    });
  });

  describe('"snare_16ths" permutation type', () => {
    it('adds the "Use Accent Grid" option instead of Skip-first-notes/Downbeats-Upbeats', async () => {
      document.body.innerHTML = '';
      gw = await newGrooveWriter();
      scaffoldForStateMutatingCalls(gw);
      swallowingKnownHarnessGap(() => gw.permutationPopupClick('snare_16ths'));

      const html = gw.HTMLforPermutationOptions();
      const groupIds = permutationGroupIds(html);
      expect(groupIds).toEqual([
        'PermuationOptionsAccentGrid',
        'PermuationOptionsOstinato',
        'PermuationOptionsSingles',
        'PermuationOptionsDoubles',
        'PermuationOptionsUpsDowns',
        'PermuationOptionsTriples',
        'PermuationOptionsQuads',
      ]);
      expect(html).toContain('>Use Accent Grid</label>');
      expect(html).not.toContain('Simplify multiple kicks');
    });
  });

  it('toggling back to "none" after a non-none type returns to an empty string', async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    scaffoldForStateMutatingCalls(gw);
    swallowingKnownHarnessGap(() => gw.permutationPopupClick('kick_16ths'));
    expect(gw.HTMLforPermutationOptions()).not.toBe('');
    swallowingKnownHarnessGap(() => gw.permutationPopupClick('none'));
    expect(gw.HTMLforPermutationOptions()).toBe('');
  });

  // permutationPopupClick's switch statement only recognizes "kick_16ths" and
  // "snare_16ths"; any other perm_type (including values referenced in
  // html_examples_and_tests/GrooveDBCreateGroove.html like "snare_accent_16ths" and
  // "snare_accented_and_diddled_16ths") falls through to `default`, which
  // unconditionally resets class_permutation_type to "none". So those two
  // menu entries are dead: clicking them cannot produce a non-none permutation
  // state. Confirmed here directly.
  it('DEAD BRANCH: an unrecognized perm_type (e.g. a menu value with no matching case) is silently coerced to "none"', async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    scaffoldForStateMutatingCalls(gw);
    swallowingKnownHarnessGap(() => gw.permutationPopupClick('snare_accent_16ths'));
    expect(gw.HTMLforPermutationOptions()).toBe('');
  });
});
