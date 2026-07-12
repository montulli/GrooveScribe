import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for the ABC-notation generation functions in groove_utils.js:
//   - get_top_ABC_BoilerPlate            (header/boilerplate string)
//   - create_ABC_from_snare_HH_kick_arrays (note-body string from raw arrays)
//   - createABCFromGrooveData             (main entry point, header + body)
//
// All expectations below were captured by actually running the code (see the
// probe session used to build this file) rather than assumed, per project policy.
//
// Note on `%%fullsvg _N`: the trailing integer comes from a *module-level*
// counter (`global_num_GrooveUtilsCreated`) that increments every time `new
// GrooveUtils()` is constructed, so it is not stable across test run order.
// Wherever we need an exact-string comparison of the full boilerplate/pipeline
// output we normalize that one integer to a placeholder before comparing.

describe('GrooveUtils ABC notation generation', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('get_top_ABC_BoilerPlate', () => {
    it('emits title/author/comments/legend/meter for a fully-populated call', () => {
      const abc = gu.get_top_ABC_BoilerPlate(
        false,        // isPermutation
        'My Title',   // tuneTitle
        'My Author',  // tuneAuthor
        'My Comment', // tuneComments
        true,         // showLegend
        false,        // isTriplets
        true,         // kick_stems_up
        4, 4,         // timeSigTop/Bottom
        900           // renderWidth
      );

      // header basics
      expect(abc.startsWith('%abc\n%%fullsvg _')).toBe(true);
      expect(abc).toContain('X:6\n');
      expect(abc).toContain('M:4/4\n');
      expect(abc).toContain('T: My Title\n');
      // author present -> C: line plus extra musicspace
      expect(abc).toContain('C: My Author\n%%musicspace 20px\n');
      // comments present -> P: line plus extra musicspace
      expect(abc).toContain('P: My Comment\n%%musicspace 20px\n');
      // note length is always fixed at 1/32 regardless of time signature
      expect(abc).toContain('L:1/32\n');
      // isPermutation === false -> stretchlast 1
      expect(abc).toContain('%%stretchlast 1\n');
      // renderWidth 900 clamped to <=3000, then scaled by 0.75 -> 675px
      expect(abc).toContain('%%pagewidth 675px\n');
      // the staves line is hard-coded to include Feet regardless of kick_stems_up
      // (the kick_stems_up branch that would omit "Feet" is dead/commented-out code)
      expect(abc).toContain('%%staves (Stickings Hands Feet)\n');
      expect(abc).toContain('K:C clef=perc\n');

      // showLegend === true -> full 3-voice legend block, ending in a blank tune title
      expect(abc).toContain('V:Stickings\nx8 x8 x8 x8 x8 x8 x8 x8 ||\n');
      expect(abc).toContain('V:Hands stem=up \n%%voicemap drum\n');
      expect(abc).toContain('"^Hi-Hat"^g4');
      expect(abc).toContain('V:Feet stem=down \n%%voicemap drum\n');
      expect(abc.endsWith('T:\n')).toBe(true);
    });

    it('omits C:/P: lines, uses stretchlast 0, clamps small renderWidth, and skips the legend when disabled', () => {
      const abc = gu.get_top_ABC_BoilerPlate(
        true,   // isPermutation
        '',     // tuneTitle
        '',     // tuneAuthor
        '',     // tuneComments
        false,  // showLegend
        true,   // isTriplets (unused by this function - see below)
        false,  // kick_stems_up (unused by this function - see below)
        6, 8,   // timeSigTop/Bottom
        100     // renderWidth (below the 400 minimum)
      );

      expect(abc).toContain('M:6/8\n');
      // title line is always emitted, even when blank
      expect(abc).toContain('T: \n');
      // empty author/comments -> no C:/P: lines at all
      expect(abc).not.toContain('C:');
      expect(abc).not.toContain('P:');
      // isPermutation === true -> stretchlast 0
      expect(abc).toContain('%%stretchlast 0\n');
      // renderWidth clamped up to the 400 minimum, then *0.75 = 300
      expect(abc).toContain('%%pagewidth 300px\n');
      // showLegend === false -> the string ends right after the K: header line,
      // with no V:Stickings/V:Hands/V:Feet legend block
      expect(abc.endsWith('K:C clef=perc\n')).toBe(true);
      expect(abc).not.toContain('V:Stickings');

      // Exact full string check (normalizing the volatile unique-instance index),
      // this pins down the entire boilerplate for a minimal/edge-case call.
      const normalized = abc.replace(/%%fullsvg _\d+\n/, '%%fullsvg _X\n');
      expect(normalized).toBe(
        '%abc\n%%fullsvg _X\nX:6\n' +
        'M:6/8\n' +
        'T: \n' +
        'L:1/32\n' +
        '%%stretchlast 0\n' +
        '%%flatbeams 1\n' +
        '%%ornament up\n' +
        '%%pagewidth 300px\n' +
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
        '%%map drum ^c\' heads=Xhead print=c\'   % Crash\n' +
        '%%map drum ^d\' heads=Xhead print=d\'   % Stacker\n' +
        '%%map drum ^e\' heads=Xhead print=e\'   % Metronome click\n' +
        '%%map drum ^f\' heads=Xhead print=f\'   % Metronome beep\n' +
        '%%map drum ^A\' heads=Xhead print=A\'   % Ride\n' +
        '%%map drum ^B\' heads=Trihead print=A\' % Ride Bell\n' +
        '%%map drum ^D\' heads=Trihead print=g   % Cow Bell\n' +
        '%%map drum ^c heads=Xhead print=c  % Cross Stick\n' +
        '%%map drum ^d, heads=Xhead print=d,  % Foot Splash\n' +
        '%%staves (Stickings Hands Feet)\n' +
        'K:C clef=perc\n'
      );
    });

    it('the isTriplets and kick_stems_up parameters have no effect on the output (dead parameters)', () => {
      // Every argument identical except isTriplets/kick_stems_up flipped -> identical string.
      const a = gu.get_top_ABC_BoilerPlate(false, 'T', 'A', 'C', false, false, false, 4, 4, 900);
      const b = gu.get_top_ABC_BoilerPlate(false, 'T', 'A', 'C', false, true, true, 4, 4, 900);
      expect(a).toBe(b);
    });

    it('clamps renderWidth at the 3000 maximum', () => {
      const abc = gu.get_top_ABC_BoilerPlate(false, '', '', '', false, false, true, 4, 4, 100000);
      // 3000 * 0.75 = 2250
      expect(abc).toContain('%%pagewidth 2250px\n');
    });
  });

  describe('create_ABC_from_snare_HH_kick_arrays (direct call on full-size arrays)', () => {
    // This function requires arrays already scaled to full-size (32 notes for
    // straight divisions, 48 for triplet divisions), exactly like
    // createABCFromGrooveData produces internally via scaleNoteArrayToFullSize.
    function buildFullSizeArrays(gd) {
      const sticking = gu.scaleNoteArrayToFullSize(gd.sticking_array, gd.numberOfMeasures, gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      const hh = gu.scaleNoteArrayToFullSize(gd.hh_array, gd.numberOfMeasures, gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      const snare = gu.scaleNoteArrayToFullSize(gd.snare_array, gd.numberOfMeasures, gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      const kick = gu.scaleNoteArrayToFullSize(gd.kick_array, gd.numberOfMeasures, gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      const toms = [];
      for (let i = 0; i < 4; i++) {
        toms[i] = gu.scaleNoteArrayToFullSize(gd.toms_array[i], gd.numberOfMeasures, gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      }
      return { sticking, hh, snare, kick, toms };
    }

    it('produces the exact note-body ABC for a simple straight 4/4 16th-note groove', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
      );
      const { sticking, hh, snare, kick, toms } = buildFullSizeArrays(gd);
      const is_triplet_division = gu.isTripletDivisionFromNotesPerMeasure(gd.notesPerMeasure, gd.numBeats, gd.noteValue);

      const out = gu.create_ABC_from_snare_HH_kick_arrays(
        sticking, hh, snare, kick, toms,
        '|\n',
        hh.length,
        gd.timeDivision,
        gu.notesPerMeasureInFullSizeArray(is_triplet_division, gd.numBeats, gd.noteValue),
        gd.kickStemsUp,
        gd.numBeats, gd.noteValue
      );

      // Fully deterministic (no volatile unique-index) -> exact string check.
      // Note the kick on beat 1 and beat 3 is folded into a chord with the
      // hi-hat token, e.g. "[^g2F2]", because kickStemsUp defaults to true.
      expect(out).toBe(
        'V:Stickings\n' +
        'x8 x8 x8 x8 ||\n' +
        'V:Hands stem=up\n' +
        '%%voicemap drum\n' +
        '[^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 [^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 ||\n'
      );
    });

    it('emits a separate "V:Feet" voice for the kick when kickStemsUp is false', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
      );
      gd.kickStemsUp = false;
      const { sticking, hh, snare, kick, toms } = buildFullSizeArrays(gd);
      const is_triplet_division = gu.isTripletDivisionFromNotesPerMeasure(gd.notesPerMeasure, gd.numBeats, gd.noteValue);

      const out = gu.create_ABC_from_snare_HH_kick_arrays(
        sticking, hh, snare, kick, toms,
        '|\n',
        hh.length,
        gd.timeDivision,
        gu.notesPerMeasureInFullSizeArray(is_triplet_division, gd.numBeats, gd.noteValue),
        gd.kickStemsUp,
        gd.numBeats, gd.noteValue
      );

      expect(out).toContain('V:Feet stem=down\n%%voicemap drum\nF8 z8 F8 z8 ||\n');
      // hi-hat notes are no longer chorded with the kick in the Hands voice
      expect(out).toContain('^g2^g2^g2^g2 [c2^g2]^g2^g2^g2 ^g2^g2^g2^g2 [c2^g2]^g2^g2^g2');
    });

    it('routes triplet divisions through the "(3:3:3" tuplet marker path', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|xxxxxxxxxxxx|&S=|----o-------|&K=|o-----------|'
      );
      const { sticking, hh, snare, kick, toms } = buildFullSizeArrays(gd);
      const is_triplet_division = gu.isTripletDivisionFromNotesPerMeasure(gd.notesPerMeasure, gd.numBeats, gd.noteValue);
      expect(is_triplet_division).toBe(true);

      const out = gu.create_ABC_from_snare_HH_kick_arrays(
        sticking, hh, snare, kick, toms,
        '|\n',
        hh.length,
        gd.timeDivision,
        gu.notesPerMeasureInFullSizeArray(is_triplet_division, gd.numBeats, gd.noteValue),
        gd.kickStemsUp,
        gd.numBeats, gd.noteValue
      );

      expect(out).toContain('(3:3:3');
      expect(out).toContain('V:Hands stem=up\n%%voicemap drum\n');
    });
  });

  describe('createABCFromGrooveData (full pipeline: boilerplate + note body)', () => {
    it('produces an exact snapshot for a canonical straight 4/4 16th-note groove', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      const normalized = abc.replace(/%%fullsvg _\d+\n/, '%%fullsvg _X\n');

      expect(normalized).toBe(
        '%abc\n%%fullsvg _X\nX:6\n' +
        'M:4/4\n' +
        'T: \n' +
        'L:1/32\n' +
        '%%stretchlast 1\n' +
        '%%flatbeams 1\n' +
        '%%ornament up\n' +
        '%%pagewidth 675px\n' +
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
        '%%map drum ^c\' heads=Xhead print=c\'   % Crash\n' +
        '%%map drum ^d\' heads=Xhead print=d\'   % Stacker\n' +
        '%%map drum ^e\' heads=Xhead print=e\'   % Metronome click\n' +
        '%%map drum ^f\' heads=Xhead print=f\'   % Metronome beep\n' +
        '%%map drum ^A\' heads=Xhead print=A\'   % Ride\n' +
        '%%map drum ^B\' heads=Trihead print=A\' % Ride Bell\n' +
        '%%map drum ^D\' heads=Trihead print=g   % Cow Bell\n' +
        '%%map drum ^c heads=Xhead print=c  % Cross Stick\n' +
        '%%map drum ^d, heads=Xhead print=d,  % Foot Splash\n' +
        '%%staves (Stickings Hands Feet)\n' +
        'K:C clef=perc\n' +
        'V:Stickings\n' +
        'x8 x8 x8 x8 ||\n' +
        'V:Hands stem=up\n' +
        '%%voicemap drum\n' +
        '[^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 [^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 ||\n'
      );
    });

    it('carries the title/author through to the header', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&title=Some+Groove&author=Some+Author&H=|xxxxxxxxxxxxxxxx|&S=|----------------|&K=|----------------|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      expect(abc).toContain('T: Some Groove\n');
      expect(abc).toContain('C: Some Author\n');
    });

    it('generates a 6/8 groove with 8th-note division (quads path, non-triplet)', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=6/8&Div=8&Tempo=90&Measures=1&H=|xxxxxx|&S=|--o---|&K=|o-----|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      expect(abc).toContain('M:6/8\n');
      expect(abc).toContain('V:Stickings\nx12 x12 ||\n');
      expect(abc).toContain('V:Hands stem=up\n%%voicemap drum\n[^g4F4]^g4[c4^g4] ^g4^g4^g4 ||\n');
      expect(abc).not.toContain('(3:3:3');
    });

    it('generates a 4/4 groove at Div=12 (8th-note triplets) using the "(3:3:3" grouping', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|xxxxxxxxxxxx|&S=|----o-------|&K=|o-----------|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      expect(abc).toContain('(3:3:3[^g4F4]^g4^g4');
      // sticking legend line (auto-generated, no explicit Stickings= given) groups by 4-4-4
      expect(abc).toContain('V:Stickings\nx4x4x4 x4x4x4 x4x4x4 x4x4x4 ||\n');
    });

    it('generates a 4/4 groove at Div=24 (16th-note triplets) using the "(6:6:6" grouping', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=24&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxxxxxxxxxx|&S=|--------o---------------|&K=|o-----------------------|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      expect(abc).toContain('(6:6:6[^g2F2]^g2^g2^g2^g2^g2');
    });

    it('joins multiple measures with a single bar "|" and ends the voice with "||"', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=2' +
        '&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|' +
        '&S=|----o-------o---|----o-------o---|' +
        '&K=|o-------o-------|o-------o-------|'
      );
      const abc = gu.createABCFromGrooveData(gd, 900);
      const handsVoice = abc.split('V:Hands stem=up\n%%voicemap drum\n')[1];
      // exactly one mid-line bar "|" (not "||") separating the two measures, then "||" at the end
      expect(handsVoice).toBe(
        '[^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 [^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 |\n' +
        '[^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 [^g2F2]^g2^g2^g2 [c2^g2]^g2^g2^g2 ||\n'
      );
    });

    it('adds a tom voice-chord token when showToms is enabled via a T1-T4 URL param', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1' +
        '&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|' +
        '&T1=|----------------|&T2=|----------o-----|'
      );
      expect(gd.showToms).toBe(true);
      const abc = gu.createABCFromGrooveData(gd, 900);
      // the tom hit is chorded into the Hands voice as an extra note, e.g. "[^g2d2]"
      expect(abc).toContain('[^g2F2]^g2[^g2d2]^g2');
    });

    it('renders per-note sticking annotations in the Stickings voice when showStickings is enabled', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1' +
        '&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|' +
        '&Stickings=|RLRLRLRLRLRLRLRL|'
      );
      expect(gd.showStickings).toBe(true);
      const abc = gu.createABCFromGrooveData(gd, 900);
      expect(abc).toContain('V:Stickings\n"R"x2"L"x2"R"x2"L"x2 "R"x2"L"x2"R"x2"L"x2 "R"x2"L"x2"R"x2"L"x2 "R"x2"L"x2"R"x2"L"x2 ||\n');
    });

    it('is unaffected by swingPercent (swing only affects MIDI playback, not ABC notation)', () => {
      const gdNoSwing = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
      );
      const gdSwing = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&Swing=62&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
      );
      expect(gdSwing.swingPercent).toBe(62);
      expect(gdNoSwing.swingPercent).toBe(0);

      const abcNoSwing = gu.createABCFromGrooveData(gdNoSwing, 900);
      const abcSwing = gu.createABCFromGrooveData(gdSwing, 900);
      expect(abcSwing).toBe(abcNoSwing);
    });

    it('returns a non-empty ABC string with the expected structural markers for every groove built above', () => {
      const urls = [
        '?TimeSig=4/4&Div=16&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|',
        '?TimeSig=6/8&Div=8&Measures=1&H=|xxxxxx|&S=|--o---|&K=|o-----|',
        '?TimeSig=3/4&Div=8&Measures=1&H=|xxxxxx|&S=|--o---|&K=|o-----|',
        '?TimeSig=4/4&Div=12&Measures=1&H=|xxxxxxxxxxxx|&S=|----o-------|&K=|o-----------|',
      ];
      for (const url of urls) {
        const gd = gu.getGrooveDataFromUrlString(url);
        const abc = gu.createABCFromGrooveData(gd, 900);
        expect(abc.length).toBeGreaterThan(0);
        expect(abc).toMatch(/^%abc\n/);
        expect(abc).toMatch(/M:\d+\/\d+\n/);
        expect(abc).toContain('K:C clef=perc\n');
        expect(abc).toContain('V:Hands stem=up\n');
        expect(abc.trim().endsWith('||')).toBe(true);
      }
    });
  });
});
