// A library of grooves expressed in Groove Scribe's URL scheme, chosen to
// exercise EVERY drum articulation and rendering path in groove_utils.js.
//
// Groove Scribe encodes a whole groove into a query string. Each voice is a
// tablature line between pipes, one character per note position:
//
//   Hi-hat (H):     x=normal X=accent o=open +=close r/R=ride b/B=ride-bell
//                   c=crash m=cow-bell s=stacker n=metronome N=metronome-accent -=rest
//   Snare (S):      o=normal O=accent g=ghost x=cross-stick f=flam d=drag b/B=buzz -=rest
//   Kick (K/B):     o=normal x=splash X=kick+splash -=rest
//   Toms (T1..T4):  o=normal x=normal(T1/T4) -=rest
//   Stickings:      R/r=right L/l=left B/b=both c=count -=off
//
// Driving these through createABCFromGrooveData + create_MIDIURLFromGrooveData
// sweeps the per-articulation ABC and MIDI mapping ladders (the bulk of the
// previously-uncovered lines). See articulation-coverage.test.js.
//
// Each entry: { name, url }. Musicality is irrelevant here -- these are code-
// path fixtures, deliberately dense with every symbol.

export const coverageGrooves = [
  // ---- Straight 16ths (quads path): every articulation in one measure -------
  {
    name: 'HH all articulations (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|bBcmnNorRsxX+-o-|&S=|----O-------O---|&K=|o-------o-------|',
  },
  {
    name: 'Snare all articulations (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|bBdfgOox--------|&K=|o-------o-------|',
  },
  {
    name: 'Kick all articulations (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|oxX-------------|',
  },
  {
    name: 'Stickings all articulations (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&Stickings=|RLBrlbc---------|&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },
  {
    name: 'Toms all four voices (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|&T1=|xo--------------|&T2=|--o-------------|&T3=|----o-----------|&T4=|------ox--------|',
  },
  {
    name: 'Everything at once (straight 16)',
    url: '?TimeSig=4/4&Div=16&Tempo=100&Measures=1&Stickings=|RLBrlbc---------|&H=|bBcmnNorRsxX+-o-|&S=|bBdfgOox--------|&K=|oxX--o--x--X--o-|&T1=|x---o-----------|&T4=|--------ox------|',
  },

  // ---- Triplets (triplet path): every articulation in one measure -----------
  {
    name: 'HH all articulations (triplet 12)',
    url: '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|bcmnNorsxX+-|&S=|---O----O---|&K=|o---o---o---|',
  },
  {
    name: 'Snare all articulations (triplet 12)',
    url: '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|xxxxxxxxxxxx|&S=|bdfgOox-----|&K=|o---o---o---|',
  },
  {
    name: 'Everything at once (triplet 12)',
    url: '?TimeSig=4/4&Div=12&Tempo=100&Measures=1&Stickings=|RLBc--------|&H=|bcmnNorsxX+-|&S=|bdfgOox-----|&K=|oxX--o--X---|&T1=|x--o--------|&T4=|------ox----|',
  },
  {
    name: 'Sextuplets (triplet 24)',
    url: '?TimeSig=4/4&Div=24&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxxxxxxxxxx|&S=|-----O-----------O------|&K=|o-----------o-----------|',
  },

  // ---- Metronome frequencies (metronome note insertion, MIDI + ABC) ---------
  {
    name: 'Metronome freq 4',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&MetronomeFreq=4&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },
  {
    name: 'Metronome freq 8',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&MetronomeFreq=8&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },
  {
    name: 'Metronome freq 16',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&MetronomeFreq=16&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },
  {
    name: 'Metronome freq 12 (triplet)',
    url: '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&MetronomeFreq=12&H=|rrrrrrrrrrrr|&S=|---O----O---|&K=|o---o---o---|',
  },

  // ---- Swing (MIDI swing timing branch) -------------------------------------
  {
    name: 'Swing 62 straight 8ths',
    url: '?TimeSig=4/4&Div=8&Tempo=90&Swing=62&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---o---|',
  },
  {
    name: 'Swing 50 straight 16ths',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Swing=50&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },

  // ---- Multiple measures ----------------------------------------------------
  {
    name: 'Two measures straight 16',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=2&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|&S=|----O-------O---|----O-------O---|&K=|o-------o-------|o-------o-------|',
  },
  {
    name: 'Three measures triplet',
    url: '?TimeSig=4/4&Div=12&Tempo=90&Measures=3&H=|rrrrrrrrrrrr|rrrrrrrrrrrr|rrrrrrrrrrrr|&S=|---O----O---|---O----O---|---O----O---|&K=|o---o---o---|o---o---o---|o---o---o---|',
  },

  // ---- Alternate time signatures --------------------------------------------
  {
    name: '6/8 compound',
    url: '?TimeSig=6/8&Div=8&Tempo=90&Measures=1&H=|xxxxxx|&S=|--O--O|&K=|o--o--|',
  },
  {
    name: '3/4',
    url: '?TimeSig=3/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxx|&S=|----O-------|&K=|o-------o---|',
  },
  {
    name: '5/4',
    url: '?TimeSig=5/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxxxxxx|&S=|----O-------O-------|&K=|o-------o-------o---|',
  },
  {
    name: '7/8',
    url: '?TimeSig=7/8&Div=8&Tempo=90&Measures=1&H=|xxxxxxx|&S=|--O--O-|&K=|o--o---|',
  },

  // ---- Title / author / comments (metadata paths) ---------------------------
  {
    name: 'Full metadata',
    url: '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&Title=Test%20Groove&Author=QA&Comments=A%20comment&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  },

  // ---- Sparse triplet grooves: exercise the "simplify the notation" branches
  // in the triplet ABC generator (whole-beat rests, isolated quarter notes, and
  // the 32nd-triplet "fake threes / fake sixes" collapsing). -------------------
  {
    // 32nd-note triplets (Div=48). One note every 4 slots -> "fake threes"
    // (collapse to 1/8-note-triplet display).
    name: '32nd triplets, note every 4 (fake threes)',
    url: '?TimeSig=4/4&Div=48&Tempo=80&Measures=1&H=|x---x---x---x---x---x---x---x---x---x---x---x---|&S=|------------O-----------------------O-----------|&K=|o-----------------------o-----------------------|',
  },
  {
    // One note every 2 slots -> "fake sixes" (collapse to 1/16-note-triplet).
    name: '32nd triplets, note every 2 (fake sixes)',
    url: '?TimeSig=4/4&Div=48&Tempo=80&Measures=1&H=|x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-|&S=|------------O-----------------------O-----------|&K=|o-----------------------o-----------------------|',
  },
  {
    // Notes only on the eighth-note pulse (0 and 6 within each 12-group) ->
    // the "two 1/8 notes with no triplets" branch.
    name: '32nd triplets, eighth-note pulse',
    url: '?TimeSig=4/4&Div=48&Tempo=80&Measures=1&H=|x-----x-----x-----x-----x-----x-----x-----x-----|&S=|------------O-----------------------O-----------|&K=|o-----------------------o-----------------------|',
  },
  {
    // Sparse 16th triplets (Div=24) with isolated notes.
    name: '16th triplets, sparse (Div 24)',
    url: '?TimeSig=4/4&Div=24&Tempo=80&Measures=1&H=|x-----x-----x-----x-----|&S=|------O-----------O-----|&K=|o-----------o-----------|',
  },
  {
    // 8th-note triplets with a whole empty beat (beats 2 & 4 rest) and an
    // isolated downbeat -> whole-beat-rest + "x--" quarter-note branches.
    name: '8th triplets, empty beats',
    url: '?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|x--------x--|&S=|------O-----|&K=|o-----------|',
  },
  {
    // Odd time signature in triplets -> the "odd meter last grouping" branch.
    name: '5/4 triplets',
    url: '?TimeSig=5/4&Div=12&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxx|&S=|------O------O--|&K=|o------o-------|',
  },
  {
    // Accented notes inside triplet groups -> the accent-modifier hoisting path.
    name: 'Triplet accents (HH accent + snare accent)',
    url: '?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|X-XX-XX-XX-X|&S=|--O--O--O--O|&K=|o--o--o--o--|',
  },

  // ---- Voice/articulation mismatches: each character is valid for SOME voice
  // but placed in a voice where it is not, exercising every "this symbol isn't
  // valid for this drum" fall-through in tablatureToABCNotationPerNote. Such
  // notes decode to rests (with a console warning) -- the groove still renders.
  // 'z' is invalid for every voice (the final default). This is parsed by
  // getGrooveDataFromUrlString, so merely loading it covers the branches.
  {
    name: 'Invalid articulations per voice (fall-through coverage)',
    url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&Stickings=|oz--------------|&H=|dfglLO----------|&S=|cmnNrRs+Xz------|&K=|bBz-------------|',
  },
];

export default coverageGrooves;
