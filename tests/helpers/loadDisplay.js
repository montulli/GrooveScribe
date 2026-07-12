import { vi } from 'vitest';

// Loads a fresh copy of js/groove_display.js for a test.
//
// groove_display.js is a module-scope singleton (`GrooveDisplay`) whose IIFE
// runs load-time code: `getLocalScriptRoot()` reads the last <script> element's
// src, and ~13 loadjscssfile() calls append <script>/<link> tags. To get clean,
// deterministic module state (fresh GrooveDisplayUniqueCounter, empty
// filesadded) per test, we clear the DOM, seed a single <script> so
// getLocalScriptRoot resolves, then vi.resetModules() + re-import so the IIFE
// runs again.
//
// Seed the <script> with a stable src ("http://localhost/js/...") so the
// computed script root is predictable: "http://localhost/js/".
export async function loadGrooveDisplay({ scriptSrc = 'http://localhost/js/groove_display.js' } = {}) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const seed = document.createElement('script');
  seed.src = scriptSrc;
  document.head.appendChild(seed);

  vi.resetModules();
  const mod = await import('../../js/groove_display.js');
  return mod.GrooveDisplay;
}
