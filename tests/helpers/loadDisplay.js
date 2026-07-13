import { vi } from 'vitest';

// Loads a fresh copy of js/groove_display.js for a test.
//
// groove_display.js is a module-scope singleton (`GrooveDisplay`) whose IIFE
// runs load-time code: getLocalScriptRoot() derives its root from
// import.meta.url (its own module location), and ~13 loadjscssfile() calls
// append <script>/<link> tags. To get clean, deterministic module state (fresh
// GrooveDisplayUniqueCounter, empty filesadded) per test, we clear the DOM,
// then vi.resetModules() + re-import so the IIFE runs again.
export async function loadGrooveDisplay() {
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  vi.resetModules();
  const mod = await import('../../js/groove_display.js');
  return mod.GrooveDisplay;
}
