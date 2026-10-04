import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// css/theme.css is the one place colours are defined (see the comment at its top). These tests keep
// it that way: no colour literals creep back into the stylesheets, every variable they use exists, and
// every page that loads a stylesheet also loads the theme.

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The stylesheets we maintain. (Not: the vendored share-button / Font Awesome CSS.)
const STYLESHEETS = ['editor.css', 'player.css', 'nav.css', 'info.css'].map(
  (name) => `css/${name}`
);

const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b(?=\s*[;,)}\n])|\brgba?\(|\bhsla?\(|(?<![\w#-])(?:white|black|red|blue|green|yellow|orange|gray|grey|purple|pink|brown|cyan|magenta|silver|navy|teal)(?![\w-])/;

describe('colours live in css/theme.css', () => {
  const theme = stripComments(read('css/theme.css'));
  const defined = new Set([...theme.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

  it('defines a good number of variables', () => {
    expect(defined.size).toBeGreaterThan(40);
    expect(defined.has('--blue')).toBe(true);
  });

  for (const file of STYLESHEETS) {
    it(`${file} contains no colour values of its own`, () => {
      const css = stripComments(read(file));
      const found = css.split('\n').filter((line) => COLOUR_LITERAL.test(line));
      expect(found, `use a variable from css/theme.css instead of:\n${found.join('\n')}`).toEqual(
        []
      );
    });

    it(`${file} only uses variables that theme.css defines`, () => {
      const used = new Set([...read(file).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
      const undefinedVars = [...used].filter((name) => !defined.has(name));
      expect(undefinedVars).toEqual([]);
    });
  }

  it('palette variables hold real colours (or numbers), and roles point at palette entries', () => {
    const lines = theme.split('\n').filter((l) => /^\s*--[\w-]+\s*:/.test(l));
    for (const line of lines) {
      const value = line.split(':').slice(1).join(':').replace(/;.*$/, '').trim();
      const isColour = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/.test(value);
      const isRole = /^var\(--[\w-]+\)$/.test(value);
      const isNumber = /^[\d.]+$/.test(value); // e.g. an opacity
      expect(isColour || isRole || isNumber, `unexpected value in theme.css: ${line.trim()}`).toBe(
        true
      );
      if (isRole) {
        const target = value.match(/var\((--[\w-]+)\)/)[1];
        expect(defined.has(target), `${line.trim()} points at an undefined variable`).toBe(true);
      }
    }
  });
});

describe('every page that loads our stylesheets also loads the theme', () => {
  const pages = [
    'index.html',
    'gscribe_about.html',
    'gscribe_help.html',
    ...readdirSync(join(root, 'html_examples_and_tests'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => `html_examples_and_tests/${f}`),
  ];
  const OURS = /css\/(editor|player|nav|info)\.css/;

  for (const page of pages) {
    const html = read(page);
    if (!OURS.test(html)) continue;
    it(`${page} links css/theme.css`, () => {
      expect(html).toMatch(/css\/theme\.css/);
    });
  }

  it('the embed pages get it from groove_display.js, before the stylesheet that needs it', () => {
    const js = read('js/groove_display.js');
    const theme = js.indexOf("css/theme.css'");
    const display = js.indexOf("css/player.css'");
    expect(theme).toBeGreaterThan(-1);
    expect(theme).toBeLessThan(display);
  });
});

describe('no unused stylesheets', () => {
  // every file in css/ is loaded by a page or by a script (so dead stylesheets cannot pile up again)
  const sources = [
    'index.html',
    'gscribe_about.html',
    'gscribe_help.html',
    'js/groove_display.js',
    'js/main.js',
    ...readdirSync(join(root, 'html_examples_and_tests'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => `html_examples_and_tests/${f}`),
  ]
    .map(read)
    .join('\n');

  for (const file of readdirSync(join(root, 'css')).filter((f) => f.endsWith('.css'))) {
    it(`css/${file} is used`, () => {
      expect(sources).toContain(file);
    });
  }
});
