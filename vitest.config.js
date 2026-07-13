import { defineConfig } from 'vitest/config';

// All Groove Scribe source files (groove_utils, groove_writer, grooves,
// groove_display) are now real ES modules with native exports, so tests import
// them directly — no build-time export shim is needed anymore.

export default defineConfig({
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
