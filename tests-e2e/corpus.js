import { coverageGrooves } from '../tests/fixtures/coverage-grooves.js';
import { grooves } from '../js/grooves.js';

// The corpus of grooves the golden-master suite renders. It combines two sources:
//   - the built-in groove library shipped in js/grooves.js (real musical content
//     shown in the app's menu), now imported directly (grooves.js is an ES module),
//   - the coverage-grooves fixture (every articulation / division / time signature
//     / swing / metronome / multi-measure combination) reused from the unit suite.
// Every entry becomes an index.html?<query> URL that renders one groove.

const CATEGORIES = ['Rock_Grooves', 'Triplet_Grooves', 'World_Grooves', 'Foot_Ostinatos'];

const builtIn = CATEGORIES.flatMap((cat) =>
  Object.entries(grooves[cat]).map(([name, url]) => ({ name: `builtin/${cat}/${name}`, url }))
);

const coverage = coverageGrooves.map((g) => ({ name: `coverage/${g.name}`, url: g.url }));

export const allGrooves = [...builtIn, ...coverage];

// A filesystem-safe slug for snapshot filenames.
export function slug(name) {
  // The first replace collapses each run of non-alphanumerics to a single "_",
  // so trimming a single leading/trailing "_" is enough (no "+" needed).
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Build a navigable app URL from a groove query string. Only spaces are encoded
// (some built-in groove titles contain raw spaces); characters like `|`, `&`, `=`
// are left intact because the app reads them verbatim from location.search and
// Chromium accepts them in navigation.
export function grooveUrl(query) {
  const q = query.startsWith('?') ? query : `?${query}`;
  return '/index.html' + q.replace(/ /g, '%20');
}
