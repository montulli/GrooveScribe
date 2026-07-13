# GrooveScribe — project guide for Claude

Browser-based drum-notation editor. Runs entirely client-side (no server, no
build step). A groove is encoded in the URL, rendered to sheet music as SVG
(via the vendored `abc2svg`) and played back as MIDI (via `jsmidgen` +
`MIDI.js` soundfonts).

## Running & developing

- **Serve locally:** `npm run serve` (→ http://localhost:8000). You MUST serve
  over HTTP — opening `index.html` via `file://` breaks soundfont loading
  (CORS on the `*-ogg.js` files).
- No compile/bundle: source in `js/` is loaded directly as native ES modules
  (`<script type="module">`). Editing a file = refresh the page.

### Verify loop (run after every change; all must stay green)

| Command                | Expectation                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | Vitest unit suite — **697 pass**                                                                                                                                            |
| `npm run test:e2e`     | Playwright golden-master — **71 pass**. Byte-identical SVG+MIDI snapshots; this is the real proof that a refactor changed nothing functional. Finishes in <5 min by design. |
| `npm run lint`         | ESLint — **0 errors** (~82 SonarJS _warnings_ are an accepted refactor backlog, not failures)                                                                               |
| `npm run typecheck`    | `tsc --noEmit` checkJs via JSDoc — ~296 known errors baseline; changes should be typecheck-**neutral**                                                                      |
| `npm run knip`         | no unused exports/files                                                                                                                                                     |
| `npm run format:check` | Prettier clean (`npm run format` to fix)                                                                                                                                    |
| `npm run check`        | lint + typecheck + format:check + test in one shot                                                                                                                          |

Standing rule for all refactoring here: **nothing functional may change** —
prove it with the golden-master E2E, not by eyeballing.

## Architecture

### Render pipeline (the mental model)

```
URL query string  ──parse──►  grooveData  ──►  ABC notation ──► SVG  (abc2svg)
   (urlSerialization)         (the contract)   (abcNotation)
                                   │
                                   └──────────►  MIDI file   (midiFile + jsmidgen)
```

`grooveData` is the central data contract (js/grooveData.js: `GrooveData`
@typedef + pure `createGrooveData()` factory). Everything flows through it.

### The three top-level objects

- **GrooveUtils** (`js/groove_utils.js`) — shared core engine. Owns URL↔grooveData,
  ABC + MIDI generation (delegates to the pure modules below), MIDI playback,
  tempo/swing, note-array math. Used by both the editor and the embed viewer.
- **GrooveWriter** (`js/groove_writer.js`) — the interactive **editor** controller:
  the clickable note grid, menus/popups, undo/redo, permutation practice modes,
  hotkeys. Instantiated in `js/main.js` for `index.html`.
- **GrooveDisplay** (`js/groove_display.js`) — read-only **embed** renderer
  (used by the `GrooveEmbed*.html` / `grooveDBTest*.html` pages).

### Module map (`js/`, ours — everything else in `js/` is vendored, don't lint/edit)

Pure / low-coupling core (extracted from the two big files, imported back):

- `constants.js` — all `constant_*` values (ABC tokens, MIDI numbers, grid colors).
- `musicMath.js` — pure time-signature / note-scaling math.
- `noteArrays.js` — note-array ↔ tab/ABC conversions.
- `grooveData.js` — `GrooveData` typedef + factory (see above).
- `urlSerialization.js` — URL ↔ grooveData (fully pure; instance flags passed via a `config` arg).
- `midiFile.js` — grooveData → MIDI (takes a GrooveUtils `gu`).
- `abcNotation.js` — grooveData → ABC (takes `gu`).
- `browserInfo.js` — user-agent / touch probes.
- `permutations.js` — pure permutation-mode note-array generators (+ kick-array merge/filter).
- `viewHtml.js` — pure HTML string builders (staff container, permutation-options menu).
- `gridState.js` — the DOM grid **read** layer: per-cell state (`is_*_on`/`get_*_state`)
  and whole-measure array readers (`get32NoteArrayFromClickableUI`, `muteArrayFromClickableUI`).
  Reads the ambient global `document`; caller state injected via ctx/callbacks.

Entry/support: `main.js` (index.html bootstrap, wires `window.myGrooveWriter` etc.),
`grooves.js` (built-in groove library).

### Tests

- `tests/` — Vitest (jsdom). Subdirs per subject (`groove_utils/`, `groove_writer/`,
  `groove_display/`). Legacy source is loaded via `tests/helpers/` shims. See `tests/README.md`.
- `tests-e2e/` — Playwright (Chromium). `golden-master.spec.js` snapshots SVG+MIDI for a
  groove corpus; `fixtures.js` blocks non-localhost requests for hermetic runs.

## Conventions & gotchas

- **Adding a new `js/*.js` ES module:** add it to the module-files list in
  `eslint.config.js` (else "import/export only allowed with sourceType: module").
  App source is otherwise treated as classic scripts. `tsconfig.json` `include` lists
  only the big files; small modules are checked transitively.
- **Native modules run deferred**, so parse-time `document.write` is gone — DOM is built
  in `main.js` / inline module scripts. Use `import.meta.url` (not `document.currentScript`,
  which is null in modules) for locating the script's own path.
- Extraction pattern used throughout: move code to a new module, leave a **same-name
  delegating wrapper** in the original file so call sites stay untouched; verify byte-identical
  output via the golden master.
- Grid state is read back from **rendered CSS color** — the note setters (still in GrooveWriter)
  paint a cell, the `gridState` readers compare its color against the shared
  `constant_*_on_color_rgb` values in `constants.js` (setters paint the hex form; the browser
  normalizes it to rgb on readback).
- Vendored globals (don't redefine): `Midi`, `MIDI`, `Abc`, `Share`, `ShareButton`, `Pablo`.

## Refactor status (strangler-fig, ES-module migration)

Steps 1–3 complete: native ESM (no build); pure core extracted; `grooveData` contract
formalized. **Step 4 (decomposing GrooveWriter) is paused** with the high-value cuts done —
`permutations.js`, `viewHtml.js`, and the full `gridState.js` read layer are extracted, taking
`groove_writer.js` from ~5,800 → ~3,870 lines. The remainder is mostly irreducible
controller/event-handler/DOM-write glue. If resumed, candidate cuts: the UI→grooveData
**bridge** (`grooveDataFromClickableUI` / `createMidiUrlFromClickableUI` — top-of-graph, needs a
ctx-bag) or the note **setters** (`set_*_state`, the DOM-**write** counterpart to `gridState`).
