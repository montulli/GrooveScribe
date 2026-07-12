import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadGrooveDisplay } from '../helpers/loadDisplay.js';
import { installMockGrooveUtils, uninstallMockGrooveUtils } from '../helpers/mockGrooveUtils.js';

// Coverage for the script/stylesheet loader plumbing in groove_display.js:
// getLocalScriptRoot, loadjscssfile, checkloadjscssfile, and the load-time
// dependency injection.
describe('GrooveDisplay asset loading', () => {
  let GD;

  beforeEach(async () => {
    installMockGrooveUtils();
    GD = await loadGrooveDisplay();
  });

  afterEach(() => {
    uninstallMockGrooveUtils();
    vi.restoreAllMocks();
  });

  describe('getLocalScriptRoot', () => {
    it('returns the directory of the seed <script> element', () => {
      expect(GD.getLocalScriptRoot()).toBe('http://localhost/js/');
    });
  });

  describe('loadjscssfile', () => {
    it('appends a <script> tag with the correct type and src for a js file', () => {
      GD.loadjscssfile('http://cdn.example.com/lib.js', 'js');
      const script = document.querySelector('script[src="http://cdn.example.com/lib.js"]');
      expect(script).toBeTruthy();
      expect(script.getAttribute('type')).toBe('text/javascript');
    });

    it('appends a <link> tag with the correct rel/type/href for a css file', () => {
      GD.loadjscssfile('http://cdn.example.com/style.css', 'css');
      const link = document.querySelector('link[href="http://cdn.example.com/style.css"]');
      expect(link).toBeTruthy();
      expect(link.getAttribute('rel')).toBe('stylesheet');
      expect(link.getAttribute('type')).toBe('text/css');
    });

    it('resolves a relative "./" path against the local script root', () => {
      GD.loadjscssfile('./relative.js', 'js');
      // The root is prepended verbatim, so the "./" segment is preserved.
      const script = Array.from(document.getElementsByTagName('script')).find((s) =>
        s.getAttribute('src') && s.getAttribute('src').endsWith('relative.js')
      );
      expect(script).toBeTruthy();
      expect(script.getAttribute('src')).toBe('http://localhost/js/./relative.js');
    });

    it('does not append anything for an unknown filetype', () => {
      const before = document.getElementsByTagName('script').length;
      GD.loadjscssfile('http://cdn.example.com/thing.txt', 'txt');
      const after = document.getElementsByTagName('script').length;
      expect(after).toBe(before);
    });

    it('skips a file already recorded in filesadded', () => {
      // checkloadjscssfile is what records into filesadded; once recorded,
      // loadjscssfile must not append a second tag.
      GD.checkloadjscssfile('http://cdn.example.com/once.js', 'js');
      const countAfterFirst = document.querySelectorAll(
        'script[src="http://cdn.example.com/once.js"]'
      ).length;
      GD.loadjscssfile('http://cdn.example.com/once.js', 'js');
      const countAfterSecond = document.querySelectorAll(
        'script[src="http://cdn.example.com/once.js"]'
      ).length;
      expect(countAfterFirst).toBe(1);
      expect(countAfterSecond).toBe(1);
    });
  });

  describe('checkloadjscssfile', () => {
    it('loads a new file and records it in filesadded', () => {
      expect(GD.filesadded).not.toContain('[http://cdn.example.com/new.js]');
      GD.checkloadjscssfile('http://cdn.example.com/new.js', 'js');
      expect(GD.filesadded).toContain('[http://cdn.example.com/new.js]');
      expect(
        document.querySelector('script[src="http://cdn.example.com/new.js"]')
      ).toBeTruthy();
    });

    it('does not re-add a file that is already present, and logs instead', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      GD.checkloadjscssfile('http://cdn.example.com/dup.js', 'js');
      GD.checkloadjscssfile('http://cdn.example.com/dup.js', 'js');
      const count = document.querySelectorAll(
        'script[src="http://cdn.example.com/dup.js"]'
      ).length;
      expect(count).toBe(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('file already added!http://cdn.example.com/dup.js')
      );
    });
  });

  describe('load-time dependency injection', () => {
    it('injects the MIDI, abc2svg and GrooveUtils scripts into the head', () => {
      const srcs = Array.from(document.getElementsByTagName('script')).map((s) => s.src);
      const joined = srcs.join('\n');
      expect(joined).toContain('MIDI.js/js/MIDI/Player.js');
      expect(joined).toContain('abc2svg-1.js');
      expect(joined).toContain('groove_utils.js');
      expect(joined).toContain('jsmidgen.js');
    });

    it('injects the stylesheet <link> tags into the head', () => {
      const hrefs = Array.from(document.getElementsByTagName('link')).map((l) => l.href);
      const joined = hrefs.join('\n');
      expect(joined).toContain('groove_display.css');
      expect(joined).toContain('font-awesome');
    });
  });
});
