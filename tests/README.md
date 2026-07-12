# Groove Scribe Test Suite

Automated tests built with [Vitest](https://vitest.dev/). The suite exists as a
**regression net**: it locks in the _current_ behavior of the production code so
that the planned refactoring and ESLint cleanup can proceed without silently
changing what the app does.

## Running the tests

```bash
npm test            # run the suite once
npm run test:watch  # re-run on change (TDD loop)
npm run coverage    # run once and print a coverage report (coverage/)
```

## How the legacy code is loaded

Groove Scribe ships as classic browser `<script>` files. Each declares its API
as a top-level global (`function GrooveUtils() {}`, `var grooves = {}`, …) with
**no module exports**, so the files cannot be `import`ed directly.

To test them _without modifying the production source_, `vitest.config.js`
installs a small transform plugin (`legacyGlobalExportsPlugin`) that appends a
named `export` for each file's global **in memory as the file passes through
Vitest's module pipeline**. Nothing on disk is changed. Because the code now
flows through the normal transform path, two things work that otherwise would
not:

1. Tests can `import { GrooveUtils } from '.../js/groove_utils.js'`.
2. V8 line coverage attributes execution to the real source lines.

`tests/helpers/legacyLoader.js` wraps this behind convenience helpers
(`newGrooveUtils()`, `loadGrooves()`).

Tests run in a **jsdom** environment (see `vitest.config.js`) because the source
touches `window`, `document`, and `window.location`. `tests/setup.js` polyfills
the few browser APIs jsdom lacks (`matchMedia`, `scrollTo`).

## Layout

```
tests/
├── README.md
├── setup.js                       # global test setup (jsdom polyfills)
├── helpers/
│   ├── legacyLoader.js            # loads unmodified js/ sources for testing
│   ├── legacyLoader.test.js       # smoke tests for the loader + environment
│   ├── mockGrooveUtils.js         # spy stand-in for the GrooveUtils global
│   └── loadDisplay.js             # fresh-module loader for groove_display.js
├── groove_utils/                  # tests for js/groove_utils.js (the core engine)
│   ├── time-signatures.test.js    # division / time-signature math
│   ├── note-arrays.test.js        # tab-string <-> note-array conversions
│   ├── url-serialization.test.js  # groove <-> shareable-URL round trips (basics)
│   ├── url-serialization-extended.test.js # every URL param + round-trip stability
│   ├── metronome-and-state.test.js  # grooveDataNew defaults, metronome/sticking state
│   ├── default-grooves.test.js    # GetDefault*Groove generators + array scaling
│   ├── abc-generation.test.js     # ABC-notation string generation pipeline
│   ├── midi-generation.test.js    # MIDI-file (data URL) generation
│   ├── midi-playback.test.js      # playback controls (mocked MIDI.js runtime)
│   ├── dom-and-highlight.test.js  # SVG highlight, context menu, player-widget DOM
│   ├── articulation-coverage.test.js # data-driven sweep over fixtures/coverage-grooves.js
│   └── rendering-branches.test.js # kick-stems-down, browser detect, metronome offset, hot-keys
├── groove_writer/                 # tests for js/groove_writer.js (authoring UI)
│   ├── core-state.test.js         # measures, division, metronome freq, undo/redo, tempo
│   ├── grid-notes.test.js         # note clicks, context menu, grid read, clear/mute
│   ├── measures-toms-stickings.test.js # add/remove measure, toms & stickings, refresh
│   ├── html-generation.test.js    # HTMLforStaffContainer, permutation-options HTML
│   ├── menus-popups.test.js       # anchor/menu/popup handlers
│   ├── url-export.test.js         # share-URL, clipboard, MIDI/PNG/SVG/ABC export, loadNewGroove
│   ├── view-and-lifecycle.test.js # view toggle, hot-keys, displayNewSVG, runsOnPageLoad
│   └── note-engine-and-permutations.test.js # loadNewGroove sweep, permutations, playback highlight
├── fixtures/
│   └── coverage-grooves.js        # groove library (URL scheme) exercising every articulation
├── groove_display/                # tests for js/groove_display.js (embed layer)
│   ├── loading.test.js            # script/css injection + script-root resolution
│   ├── groovedb-format.test.js    # GrooveDB tab -> rendered groove + player
│   └── add-display.test.js        # AddGrooveDisplayToElementId / ...ToPage
└── grooves/
    └── grooves-library.test.js    # every built-in groove parses correctly
```

Test files mirror the source module they cover and live outside `js/` so they
are never part of the deployed/minified app.

### Testing orchestration layers (`groove_display.js`)

`groove_display.js` is thin wiring over `GrooveUtils`, the MIDI player, and
abc2svg. Its own logic is _which_ GrooveUtils methods it calls, with what
arguments, and what HTML it emits -- not the rendering itself. So those suites
replace the `GrooveUtils` global with a spy constructor
(`helpers/mockGrooveUtils.js`) and assert the wiring, keeping the audio/SVG
stack out of the tests. `GrooveUtils` has its own black-box suite under
`groove_utils/`, so nothing is left untested by this split.

Because `groove_display.js` is a module-scope singleton that runs load-time code
(reads `<script>` tags, injects dependencies), `helpers/loadDisplay.js` resets
the module and re-imports it per test for clean, deterministic state.

### Testing the MIDI and playback layers (`groove_utils.js`)

- **MIDI-file generation** (`midi-generation.test.js`) needs the `Midi` global
  from jsmidgen. `helpers/legacyLoader.js` `installMidiGlobal()` loads it via
  `new Function` (jsmidgen's CommonJS guards break under ESM) and it is excluded
  from coverage, so it only has to exist as a global.
- **Playback controls** (`midi-playback.test.js`) call into the MIDI.js `MIDI`
  global (`MIDI.Player.start/stop/...`), which does not exist under jsdom. That
  suite installs a spy `globalThis.MIDI` and asserts the control flow, using
  `vi.useFakeTimers()` for the play-time math.
- Several `groove_utils.js` functions read module-level `var`s (e.g.
  `global_midiInitialized`) that persist across `new GrooveUtils()` within one
  cached module, so those suites call `vi.resetModules()` per test for isolation.

### Articulation coverage via a groove library

The per-articulation ABC/MIDI mapping ladders are covered data-driven: a library
of grooves in Groove Scribe's own URL scheme (`fixtures/coverage-grooves.js`)
uses every drum symbol across straight and triplet divisions, multiple time
signatures, swing, metronome frequencies and multi-measure grooves.
`articulation-coverage.test.js` runs each groove through
parse -> ABC -> MIDI -> re-encode. To grow coverage or reproduce a rendering
bug, add a groove URL to that fixture -- no new test code required. Branches that
groove content alone can't reach (kick-stems-down layout, browser/platform
detection, metronome click-offset, spacebar hot-keys) live in
`rendering-branches.test.js`.

### Testing the authoring UI (`groove_writer.js`)

GrooveWriter is a global-scoped constructor that does `new GrooveUtils()` and is
driven almost entirely through the DOM. Two things make it testable:

- **Shared globals.** groove_writer.js references ~60 of groove_utils.js's
  top-level `const`ants as ambient globals (they share one `window` in the real
  app via classic `<script>` tags). Under the per-file ESM transform those are
  module-scoped, so `helpers/loadGrooveWriter.js` `installGrooveUtilsGlobals()`
  evaluates groove_utils.js at global scope (indirect eval) to reproduce the
  browser's shared scope with the real values.
- **DOM fixtures.** `buildGridDOM()` injects the writer's own generated note
  grid; `buildFullPageDOM()` adds the render target, metadata inputs, tempo/swing
  inputs, metronome buttons, subdivision buttons and permutation container that
  the load/render/lifecycle pipeline reads. `runsOnPageLoad()` runs to completion
  against `buildFullPageDOM` + a mock `MIDI` global.

### What is intentionally _not_ covered

- `groove_utils.js` ~96% statement / ~98% function. Remainder: deep 32nd-triplet
  notation sub-branches, MIDI note-load callbacks needing the real MIDI.js
  runtime, and defensive `console.log`-only fall-throughs.
- `groove_writer.js` ~88% statement / ~92% function. The permutation-generation
  engine and `createMidiUrlFromClickableUI` are now covered (activate the
  permutation sub-option checkboxes, then `refresh_ABC()` for ABC or fire
  `loadMidiDataEvent` for MIDI -- see note-engine-and-permutations.test.js). The
  remainder is **dead code** worth deleting during the refactor rather than
  testing: `hilight_individual_note` (its only caller at ~line 850 is commented
  out) and `debugPrintUndoRedoStack` (debug-only); plus browser-only paths (real
  file download / navigation / print) asserted as "does not throw".

Several real product bugs were found while writing these tests and are pinned as
documented regression expectations (e.g. `metronomeOptionsMenuPopupClick("CountIn")`
calls an undefined `setMetronomeCountIn`; `closeMeasureButtonClick` has no
lower-bound guard; the undo-stack dedup checks the wrong array). Search the test
files for "bug" / "quirk".

## Conventions

- One `describe` per source function or closely related group; one behavior per
  `it`.
- **Assert observed behavior, not assumed behavior.** Every expected value in
  this suite was captured by actually running the current production code. When
  a refactor legitimately changes behavior, update the expectation deliberately
  — a failing test here means "something changed," which is exactly the point.
- Keep tests black-box: exercise the public methods on a `GrooveUtils` instance
  rather than reaching into internals.
