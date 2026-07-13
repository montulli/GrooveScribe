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
//
// Severity policy: the core ESLint "recommended" rules are correctness/hygiene
// and stay as errors (and are fixed). The SonarJS rules are code *smells* whose
// only real fix is refactoring (cognitive complexity, nested conditionals,
// duplicated branches, TODO tags, …); forcing those now would mean behavioral
// changes, so they are downgraded to warnings — a visible backlog for the
// planned refactor rather than a blocking gate.

// SonarJS recommended, with every enabled rule dropped from error -> warn.
const sonarjsAsWarnings = {
  ...sonarjs.configs.recommended,
  rules: Object.fromEntries(
    Object.entries(sonarjs.configs.recommended.rules || {}).map(([rule, level]) => {
      if (level === 'error' || level === 2) return [rule, 'warn'];
      if (Array.isArray(level) && (level[0] === 'error' || level[0] === 2))
        return [rule, ['warn', ...level.slice(1)]];
      return [rule, level];
    })
  ),
};

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
  sonarjsAsWarnings,

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
    rules: {
      // Don't flag unused function arguments: removing them would change
      // signatures/arity of this legacy code. Only genuinely unused local
      // variables are reported (and fixed).
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // Application source files are now ES modules (import/export), so override
  // sourceType to 'module'.
  {
    files: [
      'js/constants.js',
      'js/urlSerialization.js',
      'js/midiFile.js',
      'js/abcNotation.js',
      'js/groove_utils.js',
      'js/groove_writer.js',
      'js/grooves.js',
      'js/groove_display.js',
      'js/main.js',
    ],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Test suite + build config: modern ESM, Node + Vitest environment. Covers the
  // Vitest suite (tests/), the Playwright suite (tests-e2e/), and *.config.js.
  {
    files: ['tests/**/*.js', 'tests-e2e/**/*.js', '*.config.js'],
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
