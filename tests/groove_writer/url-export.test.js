import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGrooveWriter, buildGridDOM, buildFullPageDOM } from '../helpers/loadGrooveWriter.js';
import { installMidiGlobal } from '../helpers/legacyLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// abc2svg-1.js is a single self-contained global `function Abc(user){...}`
// (no CommonJS/ESM exports). Loading it with `new Function` and installing the
// result as `globalThis.Abc` is the same trick used in
// tests/groove_utils/dom-and-highlight.test.js to exercise the real abc2svg
// render path -- it's pure string/geometry computation with no DOM/canvas
// dependency, so it works fine under jsdom.
function installAbcGlobal() {
  const src = fs.readFileSync(path.resolve(here, '../../js/abc2svg-1.js'), 'utf8');
  const factory = new Function(`${src}\n;return (typeof Abc !== 'undefined') ? Abc : undefined;`);
  const AbcCtor = factory();
  if (AbcCtor) globalThis.Abc = AbcCtor;
  return AbcCtor;
}

// Builds the popup fixture used by fillInFullURLInFullURLPopup / show_.. /
// close_.. / shortenerCheckboxChanged / embedCodeCheckboxChanged, matching the
// ids in index.html (~line 441-453): #fullURLPopup, #shortenerCheckbox,
// #embedCodeCheckbox, #fullURLPopupTextField.
function buildURLPopupDOM() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div id="fullURLPopup" style="display:none">
      <input type="checkbox" id="shortenerCheckbox">
      <input type="checkbox" id="embedCodeCheckbox">
      <input type="text" id="fullURLPopupTextField">
    </div>`;
  document.body.appendChild(div);
}

// A fake `XMLHttpRequest` that records open()/send() calls and lets tests
// manually drive `onload`, so we can exercise shortenerCheckboxChanged /
// embedCodeCheckboxChanged's URL-shortening branch without making a real
// network call to the (real, third-party) firebasedynamiclinks endpoint.
function installFakeXHR() {
  const instances = [];
  class FakeXHR {
    open(method, url) {
      this.method = method;
      this.url = url;
      instances.push(this);
    }
    setRequestHeader() {}
    send(body) {
      this.sentBody = body;
    }
  }
  globalThis.XMLHttpRequest = FakeXHR;
  return instances;
}

describe('GrooveWriter url-export (js/groove_writer.js)', () => {
  describe('updateCurrentURL', () => {
    it('writes the groove + metadata as a query string into document.title and window.history', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      document.getElementById('tuneTitle').value = 'My Tune';
      document.getElementById('tuneAuthor').value = 'Lou';

      gw.updateCurrentURL();

      // Observed: title + " by " + author when both are set.
      expect(document.title).toBe('My Tune by Lou');
      // window.history.replaceState(null, title, newURL) -- jsdom actually
      // updates window.location for a same-origin relative URL, so we can
      // read the resulting query string straight off window.location.
      expect(window.location.search).toContain('TimeSig=4/4');
      expect(window.location.search).toContain('Div=16');
      expect(window.location.search).toContain('Title=My%20Tune');
      expect(window.location.search).toContain('Author=Lou');
      expect(window.location.search).toContain('Tempo=80');
      expect(window.location.search).toContain('Measures=1');
      // Note/HH/Snare/Kick tab data is always present.
      expect(window.location.search).toMatch(/&H=\|/);
      expect(window.location.search).toMatch(/&S=\|/);
      expect(window.location.search).toMatch(/&K=\|/);
    });

    it('falls back to "Groove by <author>" when only the author is set', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      document.getElementById('tuneAuthor').value = 'Neil';

      gw.updateCurrentURL();

      expect(document.title).toBe('Groove by Neil');
    });

    it('falls back to the app title ("Groove Scribe") when title and author are both empty', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      gw.updateCurrentURL();

      expect(document.title).toBe('Groove Scribe');
    });
  });

  describe('fillInFullURLInFullURLPopup / show_FullURLPopup / close_FullURLPopup', () => {
    it('fills the URL text field, shows the popup, and unchecks the short/embed checkboxes', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      // Pre-check both boxes to prove fillInFullURLInFullURLPopup resets them.
      document.getElementById('shortenerCheckbox').checked = true;
      document.getElementById('embedCodeCheckbox').checked = true;

      gw.fillInFullURLInFullURLPopup();

      expect(document.getElementById('fullURLPopup').style.display).toBe('block');
      expect(document.getElementById('fullURLPopupTextField').value).toContain('TimeSig=4/4');
      expect(document.getElementById('shortenerCheckbox').checked).toBe(false);
      expect(document.getElementById('embedCodeCheckbox').checked).toBe(false);
    });

    it('throws if the popup checkboxes are missing from the DOM (unguarded document.getElementById lookups)', async () => {
      // Observed quirk: unlike the `popup` variable itself (which IS guarded
      // with `if (popup)`), the two checkbox lookups at the top of the
      // function are not null-checked, so building only #fullURLPopup
      // without its checkboxes throws instead of silently no-op'ing.
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      expect(() => gw.fillInFullURLInFullURLPopup()).toThrow(TypeError);
    });

    it('close_FullURLPopup hides the popup', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('fullURLPopup').style.display = 'block';

      gw.close_FullURLPopup();

      expect(document.getElementById('fullURLPopup').style.display).toBe('none');
    });

    it('close_FullURLPopup does not throw when the popup element is absent', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      expect(() => gw.close_FullURLPopup()).not.toThrow();
    });

    it('show_FullURLPopup throws because it constructs `new ShareButton(...)`, a vendored global (js/share-button.min.js) never loaded by this module-based test harness', async () => {
      // show_FullURLPopup is a classic-script function that assumes
      // share-button.min.js has already run as a <script> tag (as it does in
      // index.html) to define the global `ShareButton`. Our test harness only
      // loads groove_writer.js/groove_utils.js through the ES-module
      // transform, so `ShareButton` is undefined here -- this is a test
      // environment gap, not a groove_writer.js bug.
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();

      expect(() => gw.show_FullURLPopup()).toThrow(/ShareButton is not defined/);
    });
  });

  describe('copyShareURLToClipboard', () => {
    // Observed: the real implementation does NOT use navigator.clipboard --
    // it selects the text field and calls the legacy `document.execCommand
    // ("copy")`. jsdom does not implement execCommand at all (calling it
    // without stubbing throws "document.execCommand is not a function"), so
    // we stub it the same way a real browser would provide it.
    it('selects the URL field and calls document.execCommand("copy")', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'fullURLPopupTextField';
      input.value = 'http://example.com/?Foo=1';
      document.body.appendChild(input);
      document.execCommand = vi.fn(() => true);
      const selectSpy = vi.spyOn(input, 'select');

      gw.copyShareURLToClipboard();

      expect(selectSpy).toHaveBeenCalledTimes(1);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('throws in an environment (like plain jsdom) that has no document.execCommand at all', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'fullURLPopupTextField';
      document.body.appendChild(input);
      // Explicitly ensure it's absent for this test (jsdom doesn't define it
      // by default, but guard in case another test file stubbed it globally).
      delete document.execCommand;

      expect(() => gw.copyShareURLToClipboard()).toThrow(TypeError);
    });
  });

  describe('shortenerCheckboxChanged / embedCodeCheckboxChanged', () => {
    it('shortenerCheckboxChanged, when unchecked, fills the plain full URL synchronously (no network call)', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('shortenerCheckbox').checked = false;

      gw.shortenerCheckboxChanged();

      expect(instances.length).toBe(0);
      expect(document.getElementById('fullURLPopupTextField').value).toContain('TimeSig=4/4');
      expect(document.getElementById('fullURLPopup').style.display).toBe('block');
    });

    it('shortenerCheckboxChanged, when checked, POSTs to the firebasedynamiclinks shortener with the full URL', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('shortenerCheckbox').checked = true;

      gw.shortenerCheckboxChanged();

      expect(instances.length).toBe(1);
      expect(instances[0].method).toBe('POST');
      expect(instances[0].url).toContain('firebasedynamiclinks.googleapis.com/v1/shortLinks');
      const body = JSON.parse(instances[0].sentBody);
      expect(body.dynamicLinkInfo.link).toContain('TimeSig=4/4');
    });

    it('shortenerCheckboxChanged fills the field and re-checks the box when the shortener XHR succeeds', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('shortenerCheckbox').checked = true;

      gw.shortenerCheckboxChanged();
      Object.defineProperty(instances[0], 'status', { value: 200, configurable: true });
      instances[0].responseText = JSON.stringify({ shortLink: 'https://gscribe.com/share/xyz' });
      instances[0].onload();

      expect(document.getElementById('fullURLPopupTextField').value).toBe(
        'https://gscribe.com/share/xyz'
      );
      expect(document.getElementById('shortenerCheckbox').checked).toBe(true);
    });

    it('shortenerCheckboxChanged unchecks the box when the shortener XHR fails', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('shortenerCheckbox').checked = true;

      gw.shortenerCheckboxChanged();
      Object.defineProperty(instances[0], 'status', { value: 500, configurable: true });
      instances[0].onload();

      expect(document.getElementById('shortenerCheckbox').checked).toBe(false);
    });

    it('embedCodeCheckboxChanged, when checked, fills an <iframe> embed snippet synchronously (no network call)', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('embedCodeCheckbox').checked = true;

      gw.embedCodeCheckboxChanged();

      expect(instances.length).toBe(0);
      const value = document.getElementById('fullURLPopupTextField').value;
      expect(value).toMatch(/^<iframe width="100%" height="240" src="/);
      // "display" destination swaps index.html for GrooveEmbed.html.
      expect(value).toContain('GrooveEmbed.html?');
      expect(document.getElementById('shortenerCheckbox').checked).toBe(false);
    });

    it('embedCodeCheckboxChanged, when unchecked, falls back to the shortener XHR path', async () => {
      const instances = installFakeXHR();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      buildURLPopupDOM();
      document.getElementById('embedCodeCheckbox').checked = false;

      gw.embedCodeCheckboxChanged();

      expect(instances.length).toBe(1);
      expect(instances[0].url).toContain('firebasedynamiclinks.googleapis.com/v1/shortLinks');
    });
  });

  describe('updateGrooveDBSource', () => {
    it('writes a {{GrooveTab ...}} wikitext block into #GrooveDB_source', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const ta = document.createElement('textarea');
      ta.id = 'GrooveDB_source';
      document.body.appendChild(ta);

      gw.updateGrooveDBSource();

      expect(ta.value).toContain('{{GrooveTab');
      expect(ta.value).toContain('|HasTempo=80');
      expect(ta.value).toContain('|HasSwingPercent=0');
      expect(ta.value).toContain('|HasDivision=16');
      expect(ta.value).toContain('|HasMeasures=1');
      expect(ta.value).toContain('|HasTimeSignature=4/4');
      expect(ta.value).toContain('|HasHiHatTab=');
      expect(ta.value).toContain('|HasKickTab=');
      expect(ta.value.trim().endsWith('}}')).toBe(true);
    });

    it('does nothing when #GrooveDB_source is absent from the DOM', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      expect(() => gw.updateGrooveDBSource()).not.toThrow();
    });

    it('does nothing when #GrooveDB_source is present but display:none', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const ta = document.createElement('textarea');
      ta.id = 'GrooveDB_source';
      ta.style.display = 'none';
      ta.value = 'UNCHANGED';
      document.body.appendChild(ta);

      gw.updateGrooveDBSource();

      expect(ta.value).toBe('UNCHANGED');
    });
  });

  describe('updateRangeLabel', () => {
    // Used by index.html's metronome auto-speedup range sliders (~line
    // 471-473): oninput="myGrooveWriter.updateRangeLabel(event, '<id>Output')".
    it('writes the input event value into the target element by id', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const output = document.createElement('span');
      output.id = 'metronomeAutoSpeedupTempoIncreaseAmountOutput';
      output.innerHTML = '5';
      document.body.appendChild(output);
      const fakeEvent = { currentTarget: { value: '42' } };

      gw.updateRangeLabel(fakeEvent, 'metronomeAutoSpeedupTempoIncreaseAmountOutput');

      expect(output.innerHTML).toBe('42');
    });

    it('does nothing when the target id does not exist', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const fakeEvent = { currentTarget: { value: '7' } };

      expect(() => gw.updateRangeLabel(fakeEvent, 'doesNotExist')).not.toThrow();
    });
  });

  describe('MIDISaveAs', () => {
    // Same fundamental limitation documented in
    // tests/groove_utils/midi-playback.test.js: MIDISaveAs assigns
    // `document.location = midi_url` to trigger a browser download of the
    // data: URL. jsdom logs a virtual-console "Not implemented: navigation"
    // error rather than throwing, and does not actually navigate. It also
    // requires the vendored jsmidgen `Midi` global, installed here the same
    // way tests/helpers/legacyLoader.js's installMidiGlobal() does for
    // groove_utils tests.
    it('does not throw building the MIDI data: URL and assigning document.location', async () => {
      await installMidiGlobal();
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      expect(() => gw.MIDISaveAs()).not.toThrow();
    });
  });

  describe('PNGSaveAs / SVGSaveAs', () => {
    // Both call an internal downloadImages(imageType) which renders real ABC
    // (via the vendored abc2svg `Abc` global -- installed below) and then
    // hands the SVG off to the vendored Pablo library to resize/relabel and
    // trigger a real file download. Pablo itself does DOM tricks (a real
    // click-simulated <a download> and, for PNG, an offscreen <canvas>) that
    // jsdom cannot support, and Pablo is intentionally excluded from coverage
    // in vitest.config.js. So instead of loading real Pablo, we install a
    // minimal chainable stub that mimics the handful of Pablo methods
    // groove_writer.js calls (attr/children/download) -- this lets us pin the
    // groove_writer.js-owned logic (the imageType passed, the filename
    // derived from the tune title, and that download() is invoked) without
    // depending on Pablo/jsdom DOM-simulation quirks.
    function makeChainMock() {
      const chain = {
        attr: vi.fn((name, val) => {
          if (val === undefined) {
            if (name === 'width') return '400';
            if (name === 'height') return '100';
            return undefined;
          }
          return chain;
        }),
        children: vi.fn(() => chain),
        download: vi.fn((type, filename, cb) => {
          chain._downloadArgs = [type, filename];
          if (cb) cb({ error: false });
        }),
      };
      return chain;
    }

    function installPabloStub(pngAcceptable) {
      const fn = vi.fn((svgStr) => {
        fn.lastArg = svgStr;
        fn.lastChain = makeChainMock();
        return fn.lastChain;
      });
      fn.support = { image: { png: vi.fn((cb) => cb(pngAcceptable)) } };
      globalThis.Pablo = fn;
      return fn;
    }

    it('SVGSaveAs renders real ABC to SVG and calls Pablo(...).download("svg", "<title>svg", ...)', async () => {
      installAbcGlobal();
      const PabloFn = installPabloStub(true);
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      document.getElementById('tuneTitle').value = 'MyTune';

      gw.SVGSaveAs();

      expect(PabloFn).toHaveBeenCalledTimes(1);
      expect(PabloFn.lastArg).toContain('<svg');
      // Quirk (observed): the filename is `tune_title + imageType` with NO
      // separator when a title is set (so "MyTune" + "svg" = "MyTunesvg"),
      // unlike the untitled-case default "notation." (which already has a
      // trailing dot baked in).
      expect(PabloFn.lastChain.download).toHaveBeenCalledWith(
        'svg',
        'MyTunesvg',
        expect.any(Function)
      );
    });

    it('SVGSaveAs falls back to "notation.svg" as the filename when no title is set', async () => {
      installAbcGlobal();
      const PabloFn = installPabloStub(true);
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      gw.SVGSaveAs();

      expect(PabloFn.lastChain.download).toHaveBeenCalledWith(
        'svg',
        'notation.svg',
        expect.any(Function)
      );
    });

    it('PNGSaveAs calls Pablo.support.image.png(...) and, when acceptable, downloads as "png"', async () => {
      installAbcGlobal();
      const PabloFn = installPabloStub(true);
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      document.getElementById('tuneTitle').value = 'MyTune';

      gw.PNGSaveAs();

      expect(PabloFn.support.image.png).toHaveBeenCalledTimes(1);
      expect(PabloFn.lastChain.download).toHaveBeenCalledWith(
        'png',
        'MyTunepng',
        expect.any(Function)
      );
    });

    it('PNGSaveAs alerts and skips the download when the browser cannot export PNG', async () => {
      installAbcGlobal();
      const PabloFn = installPabloStub(false);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);

      gw.PNGSaveAs();

      expect(alertSpy).toHaveBeenCalledWith("Sorry, this browser can't export PNG images");
      // Pablo(...) (the SVG-wrapping call) is never reached in this branch.
      expect(PabloFn).not.toHaveBeenCalled();
    });
  });

  describe('printMusic', () => {
    // printMusic branches on `root.browserInfo`, which is only populated by
    // runsOnPageLoad() (not exercised here); we set it directly as a fixture.
    it('calls window.print() directly for any browser/platform other than Chrome+windows', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      gw.browserInfo = { browser: 'Firefox', platform: 'linux' };
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      gw.printMusic();

      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('for Chrome on windows, opens a dedicated print window, injects the sheet-music SVG, and calls win.print()', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      gw.browserInfo = { browser: 'Chrome', platform: 'windows' };
      const svgTarget = document.createElement('div');
      svgTarget.id = 'svgTarget';
      svgTarget.innerHTML = '<svg>MYSVG</svg>';
      document.body.appendChild(svgTarget);
      const fakeWin = { document: { body: {} }, print: vi.fn() };
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeWin);

      gw.printMusic();

      expect(openSpy).toHaveBeenCalledWith('', 'Groove Scribe Print');
      expect(fakeWin.document.body.innerHTML).toContain('<title>Groove Scribe</title>');
      expect(fakeWin.document.body.innerHTML).toContain('<svg>MYSVG</svg>');
      expect(fakeWin.print).toHaveBeenCalledTimes(1);
    });

    it('throws if window.open returns null/is blocked by a popup blocker (no null-guard in the source)', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      gw.browserInfo = { browser: 'Chrome', platform: 'windows' };
      const svgTarget = document.createElement('div');
      svgTarget.id = 'svgTarget';
      svgTarget.innerHTML = '<svg>MYSVG</svg>';
      document.body.appendChild(svgTarget);
      vi.spyOn(window, 'open').mockImplementation(() => null);

      expect(() => gw.printMusic()).toThrow(TypeError);
    });
  });

  describe('saveABCtoFile', () => {
    it('base64-encodes the ABC source (with CRLF line endings) as a data: URL and passes it to window.open', async () => {
      const gw = await newGrooveWriter();
      buildGridDOM(gw, 1);
      const ta = document.createElement('textarea');
      ta.id = 'ABCsource';
      ta.value = 'X:1\nK:C\n';
      document.body.appendChild(ta);
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      gw.saveABCtoFile();

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url] = openSpy.mock.calls[0];
      expect(url).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
      const base64 = url.split(',')[1];
      expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('X:1\r\nK:C\r\n');
    });
  });

  describe('loadNewGroove', () => {
    // loadNewGroove -> set_Default_notes -> setNotesFromABCArray decodes the URL
    // groove and writes it into the clickable grid + metadata fields. This
    // exercises the note-setting engine (setNotesFromURLData/setNotesFromABCArray)
    // and the metadata/tempo wiring. The shared helper reproduces the browser's
    // shared classic-script scope so groove_utils.js's constants resolve.
    it('loads a groove from URL data into the grid and metadata fields', async () => {
      const gw = await newGrooveWriter();
      buildFullPageDOM(gw, 1);

      gw.loadNewGroove(
        '?TimeSig=4/4&Div=16&Title=Foo&Author=Bar&Tempo=100&Measures=1' +
          '&H=|x-x-x-x-x-x-x-x-|&S=|----O-------O---|&K=|o-------o-------|'
      );

      // Metadata fields populated from the URL.
      expect(document.getElementById('tuneTitle').value).toBe('Foo');
      expect(document.getElementById('tuneAuthor').value).toBe('Bar');

      // The decoded notes are now readable back off the grid.
      const gd = gw.grooveDataFromClickableUI();
      expect(gd.hh_array.filter(Boolean).length).toBe(8); // x-x-... => 8 hits
      expect(gd.snare_array[4]).toBeTruthy();
      expect(gd.kick_array[0]).toBeTruthy();
      expect(gw.myGrooveUtils.getTempo()).toBe(100);
    });
  });
});
