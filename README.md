# README

Readme for Groove Scribe

### What is this repository for?

- Groove Scribe is an HTML application for drummers. Groove Scribe is a point and click authoring system to create drum sheet music as well as a practice tool for learning and practicing grooves and exercises.

### How do I use it

- Hosted here: http://www.mikeslessons.com/gscribe/
- Also here: http://montulli.github.io/GrooveScribe/

### How do I get set up?

- Summary of set up: Just host all the files on a web server. The application runs entirely in the browser with Javascript, HTML & CSS.

- Configuration: None

- Dependencies
  - Google's Leto font
  - Google's url shortening api

- Deployment instructions
  Deploy the files to an HTTP server.

### Development

The app itself needs no build step, but the repo ships tooling for tests and
code quality. It requires [Node.js](https://nodejs.org/) (v18+); install the dev
dependencies once with:

```bash
npm install
```

Available commands:

| Command                | Tool             | What it does                                                                    |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `npm test`             | Vitest           | Run the automated test suite once                                               |
| `npm run test:watch`   | Vitest           | Re-run tests on change (TDD loop)                                               |
| `npm run coverage`     | Vitest + v8      | Run tests and print a coverage report (written to `coverage/`)                  |
| `npm run lint`         | ESLint           | Lint `js/` and `tests/` (flat config + SonarJS rules)                           |
| `npm run lint:fix`     | ESLint           | Lint and auto-fix what it safely can                                            |
| `npm run format`       | Prettier         | Rewrite files to the project code style                                         |
| `npm run format:check` | Prettier         | Check formatting without writing (CI-friendly)                                  |
| `npm run typecheck`    | TypeScript       | Type-check the plain JS via JSDoc in `checkJs` mode (no TS conversion, no emit) |
| `npm run knip`         | Knip             | Report unused files, exports, and dependencies                                  |
| `npm run check`        | all of the above | `lint` + `typecheck` + `format:check` + `test` — the full gate                  |

Configuration lives in `eslint.config.js`, `.prettierrc.json` / `.prettierignore`,
`tsconfig.json`, and `knip.json`. Vendored third-party libraries (abc2svg, pablo,
jsmidgen, share-button, MIDI.js) and the hand-authored HTML are excluded from
these tools. See [tests/README.md](tests/README.md) for how the test harness
loads the classic global-scoped source.

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
