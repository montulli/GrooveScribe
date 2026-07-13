# README

Readme for Groove Scribe

### What is this repository for?

- Groove Scribe is an HTML application for drummers. Groove Scribe is a point and click authoring system to create drum sheet music as well as a practice tool for learning and practicing grooves and exercises.

### How do I use it

- Hosted here: http://www.mikeslessons.com/gscribe/
- Also here: http://montulli.github.io/GrooveScribe/
- Examples and html tests: http://montulli.github.io/GrooveScribe/html_examples_and_tests/index.html

### How do I get set up?

- Summary of set up: Just host all the files on a web server. The application runs entirely in the browser with Javascript, HTML & CSS.

- Configuration: None

- Dependencies
  - Google's Leto font
  - Google's url shortening api

- Deployment instructions
  Deploy the files to an HTTP server.

### Running and testing locally

Serve the app over HTTP — do **not** open `index.html` directly with a
`file://` URL. The MIDI sound library fetches its soundfont with
`XMLHttpRequest`, and browsers block that for `file://` pages (a CORS / null-origin
restriction), so the sound will not load.

Start a local server (requires Python 3, which ships with most systems):

```bash
npm run serve
```

Then open [http://localhost:8000/index.html](http://localhost:8000/index.html) in
your browser (append any `?TimeSig=...` groove query string as usual). Stop the
server with `Ctrl+C`.

Any static file server works — `npx serve`, VS Code's "Live Server", etc. — the
only requirement is HTTP rather than `file://`.

### Development

The app itself needs no build step, but the repo ships tooling for tests and
code quality. It requires [Node.js](https://nodejs.org/) (v18+); install the dev
dependencies once with:

```bash
npm install
```

Available commands:

| Command                   | Tool             | What it does                                                                    |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `npm test`                | Vitest           | Run the automated test suite once                                               |
| `npm run test:watch`      | Vitest           | Re-run tests on change (TDD loop)                                               |
| `npm run coverage`        | Vitest + v8      | Run tests and print a coverage report (written to `coverage/`)                  |
| `npm run test:e2e`        | Playwright       | Browser end-to-end tests: real rendered SVG + MIDI golden master, UI flows      |
| `npm run test:e2e:update` | Playwright       | Re-baseline the E2E snapshots (SVG / MIDI / screenshots) on purpose             |
| `npm run lint`            | ESLint           | Lint `js/` and `tests/` (flat config + SonarJS rules)                           |
| `npm run lint:fix`        | ESLint           | Lint and auto-fix what it safely can                                            |
| `npm run format`          | Prettier         | Rewrite files to the project code style                                         |
| `npm run format:check`    | Prettier         | Check formatting without writing (CI-friendly)                                  |
| `npm run typecheck`       | TypeScript       | Type-check the plain JS via JSDoc in `checkJs` mode (no TS conversion, no emit) |
| `npm run knip`            | Knip             | Report unused files, exports, and dependencies                                  |
| `npm run check`           | all of the above | `lint` + `typecheck` + `format:check` + `test` — the full gate                  |

Configuration lives in `eslint.config.js`, `.prettierrc.json` / `.prettierignore`,
`tsconfig.json`, and `knip.json`. Vendored third-party libraries (abc2svg, pablo,
jsmidgen, share-button, MIDI.js) and the hand-authored HTML are excluded from
these tools. See [tests/README.md](tests/README.md) for how the test harness
loads the classic global-scoped source.

**End-to-end tests** (`tests-e2e/`, Playwright) run the real app in Chromium and
serve as a pre-refactor **golden master**: they snapshot the rendered sheet-music
SVG and generated MIDI for a corpus of grooves, exercise UI flows (editing,
menus, playback, export), and guard against console errors. They start the local
server automatically. First-time setup needs the browser binary:

```bash
npx playwright install chromium
npm run test:e2e
```

Committed `*-snapshots/` files are the baselines; regenerate them deliberately
with `npm run test:e2e:update` when a change is _meant_ to alter output.

### Contribution guidelines

- Run `npm run check` before opening a PR
- Add or update tests for behavior changes (see [tests/README.md](tests/README.md))
- Code review

### Who do I talk to?

- File issues in github please: https://github.com/montulli/GrooveScribe/issues
- lou at montulli dot org is the admin and author. He cannot answer every email, so please use good judgement before emailing.

To edit this Readme:

- [Learn Markdown](https://bitbucket.org/tutorials/markdowndemo)

### See also

- [SOURCE_CODE_README.md](SOURCE_CODE_README.md)
- [tests/README.md](tests/README.md) — automated test suite (Vitest)
