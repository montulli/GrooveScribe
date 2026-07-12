import js from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-config-prettier';

// ESLint flat config for Groove Scribe.
//
// The app source in js/ is classic browser <script> code (sloppy mode, shared
// window globals) — hence `sourceType: "script"`. Cross-file app globals
// (GrooveUtils, the constant_* values, …) are declared via the existing
// `/* global … */ ` comments at the top of each source file, which ESLint reads
// natively, so they don't need to be repeated here. The tests/ tree is modern
// ESM run under Vitest.
//
// eslint-config-prettier is applied last so ESLint doesn't fight Prettier over
// formatting.

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'MIDI.js/**',
      'soundfont/**',
      'cordova/**',
      'font-awesome/**',
      // Vendored third-party libraries — not ours to lint.
      'js/abc2svg-1.js',
      'js/pablo.js',
      'js/pablo.min.js',
      'js/jsmidgen.js',
      'js/share-button.min.js',
      'js/*.min.js',
    ],
  },

  js.configs.recommended,
  sonarjs.configs.recommended,

  // Application source: classic browser scripts sharing one global scope.
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Vendored third-party globals. App globals defined within js/ (GrooveUtils,
        // GrooveWriter, GrooveDisplay, grooves) are declared where they're consumed
        // via each file's own `/* global */` comment, so they are NOT redeclared
        // here (doing so would trip no-redeclare in the file that defines them).
        Midi: 'readonly',
        MIDI: 'readonly',
        Abc: 'readonly',
        Share: 'readonly',
        ShareButton: 'readonly',
        Pablo: 'readonly',
      },
    },
  },

  // Test suite + build config: modern ESM, Node + Vitest environment.
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // Tests run under jsdom, so browser globals (document, window, atob, …)
        // are present at runtime.
        ...globals.browser,
        // Vitest globals (test config uses `globals: true`).
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      // The test harness deliberately evaluates legacy source at global scope to
      // reproduce the browser's shared-script environment (see loadGrooveWriter.js
      // / legacyLoader.js), and fixtures use http:// URLs as inert test data.
      'sonarjs/code-eval': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },

  prettier,
];
