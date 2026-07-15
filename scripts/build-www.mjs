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

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const item of ITEMS) {
  const src = join(repoRoot, item);
  if (!existsSync(src)) {
    console.warn(`  ! skipping missing item: ${item}`);
    continue;
  }
  cpSync(src, join(OUT, item), { recursive: true });
  copied++;
}

console.log(`Assembled www/ with ${copied}/${ITEMS.length} runtime items.`);
