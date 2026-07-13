# Source Code README

Readme for Groove Scribe Source Code.

## Structure

- Groove Scribe runs entirely in the browser with no back-end calls.
- The main application is referred to as **Groove Writer** in the source code and includes the authoring view.
- A secondary application is referred to as **Groove Display** in the source code and includes the sheet-music generator and the MIDI player.
- Shared logic used by both lives in **Groove Utils**.

Since the 2026 refactor, the source in `js/` is loaded as **native ES modules** (`<script type="module">`) — there is **no build/bundler step**. Serve the project over HTTP (`npm run serve`) rather than opening the HTML via `file://`, or the sound library will fail to load. See `README.md` for the developer tooling (Vitest, Playwright, ESLint, Prettier, TypeScript `checkJs`, Knip) and `CLAUDE.md` for a fuller architecture tour.

## Data flow

Everything centers on one data object, **`grooveData`** — the notation-independent description of a groove (time signature, subdivision, tempo, the per-instrument note lanes, display flags). The pipeline is:

```
URL query string  ──parse──►  grooveData  ──►  ABC notation ──► SVG  (abc2svg)
                                   │
                                   └──────────►  MIDI file   (jsmidgen) ──► playback
```

## Groove Writer

- All the authoring code: the clickable grid of HTML note cells that, in turn, generates music.
- Puts an HTML grid on the screen representing every possible note for a given division, reads it back into note arrays, and calls Groove Utils / Groove Display to render sheet music and MIDI.
- HTML
  - `index.html` — main authoring view. Add `?GDB_Author=1` for the GrooveDB authoring view.
- JavaScript
  - `groove_writer.js` — the editor controller (grid clicks, menus/popups, undo/redo, permutation practice modes, hotkeys).
  - `main.js` — the ES-module entry point for `index.html`: constructs the app, exposes the API on `window` for the inline `onclick` handlers, and builds the dynamic DOM into placeholder containers after parse (this replaced the old parse-time `document.write`).

## Groove Display

- Just the rendering/playback portion; runs independently of the authoring view for embedding in other pages.
- Turns note arrays into ABC notation, renders SVG sheet music (abc2svg), generates MIDI files, and controls MIDI playback.
- HTML
  - `GrooveEmbed.html` — production single-groove embed target (share/embed URLs point here).
  - Example/test embed pages live in `html_examples_and_tests/` (see below).
- JavaScript
  - `groove_display.js` — embeds a read-only groove display into an HTML page.
  - `groove_utils.js` — see below.

## Groove Utils and the extracted core modules

`groove_utils.js` is the shared engine used by both Writer and Display: URL ↔ grooveData, ABC + MIDI generation, MIDI playback, tempo/swing, and note-array math. During the refactor its pure logic (and much of Groove Writer's) was extracted into small, focused modules that it delegates to:

- `constants.js` — all `constant_*` values (ABC tokens, MIDI note numbers, grid colors).
- `grooveData.js` — the `GrooveData` type definition (JSDoc `@typedef`) and the pure `createGrooveData()` factory. The central contract described above.
- `musicMath.js` — pure time-signature / note-scaling math.
- `noteArrays.js` — note-array ↔ tab/ABC conversions, default-groove generators.
- `urlSerialization.js` — URL ↔ grooveData serialization (pure).
- `abcNotation.js` — grooveData → ABC notation.
- `midiFile.js` — grooveData → MIDI file (via jsmidgen).
- `browserInfo.js` — user-agent / touch-device probes.
- `permutations.js` — pure generators for the permutation practice modes.
- `viewHtml.js` — pure HTML builders (the clickable staff container and the permutation-options menu).
- `gridState.js` — the clickable-grid **read** layer: per-cell note state and whole-measure array readers (reads the DOM). The note **setters** remain in `groove_writer.js`.
- `grooves.js` — the built-in groove library.

Third-party libraries are vendored under `js/` (abc2svg, jsmidgen, pablo, share-button) and `MIDI.js/` (MIDI playback + soundfonts); these are not linted or edited.

## Repository layout (HTML)

- **Root** — the app and app-wired pages: `index.html`, `GrooveEmbed.html`, `gscribe_help.html`, `gscribe_about.html`.
- **`html_examples_and_tests/`** — standalone example, demo, and test pages (multi-display, image-only, time-signature tests, GrooveDB tools, etc.), with an `index.html` listing them.
- **`tests/`** — Vitest unit tests. **`tests-e2e/`** — Playwright browser tests (golden-master SVG/MIDI snapshots + smoke checks).
