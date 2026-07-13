import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';

// Targeted coverage for rendering branches that the groove-URL sweep cannot
// reach on its own because they depend on runtime state or environment rather
// than groove content: kick-stems-down layout, browser/platform detection,
// metronome click-offset shifting, and the spacebar hot-key wiring.
describe('groove_utils rendering & environment branches', () => {
  let gu;
  beforeEach(async () => {
    await installMidiGlobal();
    gu = await newGrooveUtils();
  });

  // ---- kick stems down: the alternate ABC/MIDI voice layout ------------------
  describe('kickStemsUp = false layout', () => {
    const STRAIGHT =
      '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-x-o-X-o-x-o---|';
    const TRIPLET =
      '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|rrrrrrrrrrrr|&S=|---O----O---|&K=|o--o--o--o--|';

    it('renders straight grooves with a separate Feet voice', () => {
      const gd = gu.getGrooveDataFromUrlString(STRAIGHT);
      gd.kickStemsUp = false;
      const abc = gu.createABCFromGrooveData(gd, 600);
      expect(abc).toContain('V:Feet');
      // MIDI still generates from the same data.
      expect(gu.create_MIDIURLFromGrooveData(gd).startsWith('data:audio/midi;base64,')).toBe(true);
    });

    it('renders triplet grooves with kick stems down', () => {
      const gd = gu.getGrooveDataFromUrlString(TRIPLET);
      gd.kickStemsUp = false;
      const abc = gu.createABCFromGrooveData(gd, 600);
      expect(abc).toContain('V:Feet');
    });
  });

  // ---- getBrowserInfo: appName / userAgent / platform detection --------------
  describe('getBrowserInfo', () => {
    let originalUA;
    let originalAppName;

    beforeEach(() => {
      originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
      originalAppName = Object.getOwnPropertyDescriptor(navigator, 'appName');
    });
    afterEach(() => {
      if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA);
      if (originalAppName) Object.defineProperty(navigator, 'appName', originalAppName);
    });

    const setNav = (appName, userAgent) => {
      Object.defineProperty(navigator, 'appName', { value: appName, configurable: true });
      Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
    };

    it.each([
      ['Chrome', 'Netscape', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36'],
      ['Edge', 'Netscape', 'Mozilla/5.0 (Windows NT 10.0) Chrome/44 Edge/12.0'],
      [
        'Firefox',
        'Netscape',
        'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0',
      ],
      ['Safari', 'Netscape', 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17.0 Safari/605.1'],
      ['MSIE', 'Netscape', 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'],
      ['MSIE', 'Microsoft Internet Explorer', 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)'],
    ])('detects %s', (expectedBrowser, appName, ua) => {
      setNav(appName, ua);
      expect(gu.getBrowserInfo().browser).toBe(expectedBrowser);
    });

    it.each([
      ['iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'],
      ['iOS', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'],
      ['android', 'Mozilla/5.0 (Linux; Android 13; Pixel)'],
      ['mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
    ])('detects platform %s', (expectedPlatform, ua) => {
      setNav('Netscape', ua);
      expect(gu.getBrowserInfo().platform).toBe(expectedPlatform);
    });
  });

  // ---- metronome click-offset shifting inside MIDI generation ----------------
  describe('metronome offset click-start in MIDI', () => {
    const STRAIGHT_METRO =
      '?TimeSig=4/4&Div=16&Tempo=90&MetronomeFreq=4&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|';
    const TRIPLET_METRO =
      '?TimeSig=4/4&Div=12&Tempo=90&MetronomeFreq=12&Measures=1&H=|rrrrrrrrrrrr|&S=|---O----O---|&K=|o---o---o---|';

    it.each(['1', 'E', 'AND', 'A'])('generates MIDI with straight offset "%s"', (offset) => {
      gu.setMetronomeOffsetClickStart(offset);
      const gd = gu.getGrooveDataFromUrlString(STRAIGHT_METRO);
      expect(gu.create_MIDIURLFromGrooveData(gd).startsWith('data:audio/midi;base64,')).toBe(true);
    });

    it.each(['TI', 'TA'])('generates MIDI with triplet offset "%s"', (offset) => {
      gu.setMetronomeOffsetClickStart(offset);
      const gd = gu.getGrooveDataFromUrlString(TRIPLET_METRO);
      expect(gu.create_MIDIURLFromGrooveData(gd).startsWith('data:audio/midi;base64,')).toBe(true);
    });
  });

  // ---- spacebar hot-key wiring (setupHotKeys via midiInitialized) ------------
  describe('setupHotKeys', () => {
    it('wires and dispatches the document key handlers', () => {
      // midiInitialized touches the play-image element and then calls
      // setupHotKeys(), which installs document.onkeydown / onkeyup.
      const img = document.createElement('div');
      img.id = 'midiPlayImage' + gu.grooveUtilsUniqueIndex;
      document.body.appendChild(img);

      // Stub the playback methods the handlers call so firing keys is a no-op
      // here (they are exercised for real in midi-playback.test.js).
      gu.startOrStopMIDI_playback = vi.fn();
      gu.startOrPauseMIDI_playback = vi.fn();
      gu.stopMIDI_playback = vi.fn();

      expect(() => gu.midiEventCallbacks.midiInitialized(gu)).not.toThrow();
      expect(typeof document.onkeydown).toBe('function');
      expect(typeof document.onkeyup).toBe('function');

      // Fire each recognized key: ctrl up/down, spacebar in the document body
      // (plays), spacebar inside a text input (ignored), and the media keys.
      document.onkeyup({ which: 17 });
      document.onkeydown({ which: 17 });
      document.onkeydown({ which: 32, target: { type: '', tagName: 'BODY' } });
      document.onkeydown({ which: 32, target: { type: 'text', tagName: 'INPUT' } });
      document.onkeydown({ which: 179 });
      document.onkeydown({ which: 178 });

      expect(gu.startOrStopMIDI_playback).toHaveBeenCalledTimes(1); // spacebar in body only
      expect(gu.startOrPauseMIDI_playback).toHaveBeenCalledTimes(1); // key 179
      expect(gu.stopMIDI_playback).toHaveBeenCalledTimes(1); // key 178
    });
  });
});
