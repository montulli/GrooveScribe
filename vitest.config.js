import { defineConfig } from 'vitest/config';

// --- Legacy-global export shim -------------------------------------------------
//
// Groove Scribe ships as classic browser <script> files: each declares things
// like `function GrooveUtils() {}` or `var grooves = {}` at the top level, which
// in a browser attach to `window`. They have no module exports, so tests can't
// `import` them directly.
//
// This plugin transforms those specific files *as they pass through Vitest's
// module pipeline* (nothing is written to disk) by appending a named `export`
// for the globals each file defines. Because the code now flows through the
// normal transform/instrumentation path, `import` works AND V8 coverage
// attributes execution to the real source lines -- neither of which is possible
// when the source is eval'd from a raw string.
//
// The production files are never modified; the export is injected in-memory only.
const LEGACY_EXPORTS = {
  'groove_utils.js': ['GrooveUtils'],
  'grooves.js': ['grooves'],
  'groove_writer.js': ['GrooveWriter'],
  'groove_display.js': ['GrooveDisplay'],
};

function legacyGlobalExportsPlugin() {
  return {
    name: 'groovescribe-legacy-global-exports',
    enforce: 'pre',
    transform(code, id) {
      const match = Object.keys(LEGACY_EXPORTS).find((file) =>
        id.replace(/\\/g, '/').endsWith(`/js/${file}`)
      );
      if (!match) return null;
      const names = LEGACY_EXPORTS[match];
      // Guard each name with `typeof` so a file that conditionally defines its
      // global (e.g. grooves.js / groove_display.js) still exports cleanly.
      const decls = names
        .map((n) => `const __export_${n} = (typeof ${n} !== 'undefined') ? ${n} : undefined;`)
        .join('\n');
      const exportList = names.map((n) => `__export_${n} as ${n}`).join(', ');
      return {
        code: `${code}\n;${decls}\nexport { ${exportList} };\n`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [legacyGlobalExportsPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.{test,spec}.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      // Measure coverage of our own source only; the vendored third-party
      // libraries (abc2svg, pablo, jsmidgen, share-button) are out of scope.
      include: ['js/**/*.js'],
      exclude: [
        'js/abc2svg-1.js',
        'js/pablo.js',
        'js/pablo.min.js',
        'js/jsmidgen.js',
        'js/share-button.min.js',
        'js/*.min.js',
      ],
    },
  },
});
