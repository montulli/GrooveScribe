// Helpers for loading Groove Scribe's classic (global-scoped) browser sources
// into tests.
//
// The production JS files have no module exports. vitest.config.js installs a
// transform plugin that appends named exports for the globals each file defines
// (see LEGACY_EXPORTS there), so here we can simply `import` them. Routing
// through the module pipeline is what lets V8 coverage attribute execution to
// the real source lines.
//
// We use dynamic import() with static specifiers so bundlers can resolve them,
// and construct a fresh instance per call where relevant.

/**
 * Construct a fresh GrooveUtils instance from the unmodified production source.
 * GrooveUtils is a constructor whose instance carries the ~90 utility methods
 * the suite exercises.
 *
 * @returns {Promise<object>} a `new GrooveUtils()` instance.
 */
export async function newGrooveUtils() {
  const { GrooveUtils } = await import('../../js/groove_utils.js');
  return new GrooveUtils();
}

/**
 * Load the built-in groove library object from grooves.js.
 *
 * @returns {Promise<object>} the `grooves` global.
 */
export async function loadGrooves() {
  const { grooves } = await import('../../js/grooves.js');
  return grooves;
}

/**
 * Make the `Midi` global (jsmidgen) available for tests that exercise the MIDI
 * generation paths in groove_utils.js.
 *
 * jsmidgen.js uses CommonJS-style export guards (`typeof exports`, `this.Midi`)
 * that break if the file is flipped to an ES module. It is also excluded from
 * coverage, so instead of routing it through the module pipeline we evaluate it
 * from source with `new Function` (which runs non-strict, so its `this.Midi = ...`
 * fallback lands on globalThis) and also return the object.
 *
 * @returns {Promise<object>} the `Midi` library object (also set on globalThis).
 */
export async function installMidiGlobal() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.resolve(here, '../../js/jsmidgen.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${src}\n;return (typeof Midi !== 'undefined') ? Midi : this.Midi;`);
  const Midi = factory();
  globalThis.Midi = Midi;
  return Midi;
}
