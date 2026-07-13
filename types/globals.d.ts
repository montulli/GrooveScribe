// Ambient declarations for vendored third-party globals. These libraries are
// loaded via <script> tags (not ES imports), so tsc's checkJs otherwise flags
// every use as "Cannot find name". Their real definitions live in the vendored
// sources: MIDI.js (MIDI), jsmidgen (Midi), abc2svg (Abc), pablo (Pablo), and
// share-button (Share / ShareButton). Typed as `any` — we only need tsc to know
// they exist, not to type-check third-party APIs.

declare var MIDI: any;
declare var Midi: any;
declare var Abc: any;
declare var Pablo: any;
declare var Share: any;
declare var ShareButton: any;
