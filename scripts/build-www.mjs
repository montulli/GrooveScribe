// Assemble the Capacitor web-dir (www/) from the app's runtime files.
//
// Capacitor copies `webDir` into the native iOS/Android projects, so www/ must
// contain exactly what the app needs at runtime — and NOT node_modules, the
// test suites, dev config, or the example/test HTML pages. We deliberately list
// the runtime assets rather than copying the repo root.
//
// Run via `npm run build:www` (invoked by the CI workflow before `cap sync`).

import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(repoRoot, 'www');

// The app entry + app-wired pages, plus every asset dir they load.
const ITEMS = [
  'index.html',
  'GrooveEmbed.html',
  'gscribe_help.html',
  'gscribe_about.html',
  'js',
  'css',
  'MIDI.js',
  'soundfont',
  'images',
  'font-awesome',
];

// Every listed item is a required runtime asset. Fail loudly if any is missing
// rather than shipping a silently incomplete www/ (which would build a broken
// mobile app that still "succeeds" in CI). Validate before touching www/.
const missing = ITEMS.filter((item) => !existsSync(join(repoRoot, item)));
if (missing.length > 0) {
  console.error(`build-www: missing required runtime asset(s): ${missing.join(', ')}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const item of ITEMS) {
  cpSync(join(repoRoot, item), join(OUT, item), { recursive: true });
}

console.log(`Assembled www/ with ${ITEMS.length} runtime items.`);
