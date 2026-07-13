import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for the tempo & swing controls and the MIDI-player
// HTML/location helpers in groove_utils.js.
//
// These functions read/write DOM elements whose ids are suffixed with the
// per-instance `gu.grooveUtilsUniqueIndex`. Where a function writes to an
// element we create it first; where a function only guards with `if
// (element)` and falls back to internal state, we assert the fallback
// directly (see getTempo/getSwing below).
//
// Note: several functions (tempoUpdate, setSwingSlider, swingUpdateEvent)
// call an internal `updateRangeSlider()` helper that calls
// `document.defaultView.getComputedStyle(el, ":before")`. jsdom does not
// implement computed styles for pseudo-elements and logs a harmless
// "Not implemented" error to stderr for each call; it does not throw and
// does not fail these tests.
describe('GrooveUtils tempo & swing controls', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('getTempo', () => {
    it('returns the default tempo (80) when the tempoInput element does not exist', () => {
      // document.body is empty (reset in tests/setup.js beforeEach), so
      // getElementById("tempoInput"+uid) is null and getTempo() falls back
      // to constant_DEFAULT_TEMPO.
      expect(gu.getTempo()).toBe(80);
    });

    it('parses the tempoInput element value when present', () => {
      document.body.innerHTML =
        '<input id="tempoInput' + gu.grooveUtilsUniqueIndex + '" value="120">';
      expect(gu.getTempo()).toBe(120);
    });

    // The source guards with `if (tempo < 19 && tempo > 281)` which can never
    // be true (a number cannot be simultaneously < 19 and > 281), so the
    // "clamp to default" branch is dead code: out-of-range values pass
    // through unmodified. This locks in that actual (buggy) behavior.
    it('does not clamp values below 19 or above 281 (the clamp condition is unreachable)', () => {
      document.body.innerHTML =
        '<input id="tempoInput' + gu.grooveUtilsUniqueIndex + '" value="5">';
      expect(gu.getTempo()).toBe(5);

      document.getElementById('tempoInput' + gu.grooveUtilsUniqueIndex).value = '500';
      expect(gu.getTempo()).toBe(500);
    });
  });

  describe('setTempo / getTempo round trip', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<input id="tempoInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<input id="tempoTextField' +
        gu.grooveUtilsUniqueIndex +
        '">';
    });

    it('writes the new tempo to both the slider and the text field', () => {
      gu.setTempo(150);
      expect(document.getElementById('tempoInput' + gu.grooveUtilsUniqueIndex).value).toBe('150');
      expect(document.getElementById('tempoTextField' + gu.grooveUtilsUniqueIndex).value).toBe(
        '150'
      );
      expect(gu.getTempo()).toBe(150);
    });

    // Same unreachable-clamp story as getTempo: `if (newTempo < 19 &&
    // newTempo > 281) return;` never triggers, so setTempo never rejects a
    // value on those grounds.
    it('does not reject values below 19 or above 281', () => {
      gu.setTempo(5);
      expect(gu.getTempo()).toBe(5);

      gu.setTempo(500);
      expect(gu.getTempo()).toBe(500);
    });
  });

  describe('upTempo / downTempo', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<input id="tempoInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<input id="tempoTextField' +
        gu.grooveUtilsUniqueIndex +
        '">';
    });

    it('upTempo nudges the tempo up by exactly 1', () => {
      gu.setTempo(100);
      gu.upTempo();
      expect(gu.getTempo()).toBe(101);
    });

    it('downTempo nudges the tempo down by exactly 1', () => {
      gu.setTempo(100);
      gu.downTempo();
      gu.downTempo();
      expect(gu.getTempo()).toBe(98);
    });
  });

  describe('tempoUpdate / tempoUpdateFromTextField / tempoUpdateFromSlider', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<input id="tempoInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<input id="tempoTextField' +
        gu.grooveUtilsUniqueIndex +
        '">';
    });

    it('tempoUpdate writes the tempo string into the text field and fires tempoChangeCallback', () => {
      let callbackValue = null;
      gu.tempoChangeCallback = (t) => {
        callbackValue = t;
      };

      gu.tempoUpdate(133);

      expect(document.getElementById('tempoTextField' + gu.grooveUtilsUniqueIndex).value).toBe(
        '133'
      );
      expect(callbackValue).toBe(133);
    });

    it('tempoUpdateFromTextField copies the field value into the slider and calls tempoUpdate', () => {
      let callbackValue = null;
      gu.tempoChangeCallback = (t) => {
        callbackValue = t;
      };

      // event.target.value is a string, as it would be for a real <input>.
      gu.tempoUpdateFromTextField({ target: { value: '133' } });

      expect(document.getElementById('tempoInput' + gu.grooveUtilsUniqueIndex).value).toBe('133');
      expect(document.getElementById('tempoTextField' + gu.grooveUtilsUniqueIndex).value).toBe(
        '133'
      );
      // the value is forwarded as-is (string), not coerced to a number.
      expect(callbackValue).toBe('133');
    });

    it('tempoUpdateFromSlider forwards the slider value straight to tempoUpdate', () => {
      let callbackValue = null;
      gu.tempoChangeCallback = (t) => {
        callbackValue = t;
      };

      gu.tempoUpdateFromSlider({ target: { value: '144' } });

      expect(document.getElementById('tempoTextField' + gu.grooveUtilsUniqueIndex).value).toBe(
        '144'
      );
      expect(callbackValue).toBe('144');
    });
  });

  describe('doesDivisionSupportSwing', () => {
    it('is false for quarter notes and all triplet divisions', () => {
      expect(gu.doesDivisionSupportSwing(4)).toBe(false);
      expect(gu.doesDivisionSupportSwing(12)).toBe(false); // triplet
      expect(gu.doesDivisionSupportSwing(24)).toBe(false); // triplet
      expect(gu.doesDivisionSupportSwing(48)).toBe(false); // triplet
    });

    it('is true for straight 8th/16th-note divisions', () => {
      expect(gu.doesDivisionSupportSwing(8)).toBe(true);
      expect(gu.doesDivisionSupportSwing(16)).toBe(true);
    });
  });

  describe('setSwingSlider', () => {
    it('writes the value directly onto the swing slider element', () => {
      document.body.innerHTML = '<input id="swingInput' + gu.grooveUtilsUniqueIndex + '">';
      gu.setSwingSlider(45);
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('45');
    });
  });

  describe('getSwing', () => {
    it('returns 0 when swing is not enabled, regardless of the slider element', () => {
      // swingIsEnabled defaults to falsy on a fresh instance.
      expect(gu.getSwing()).toBe(0);
    });

    it('reads the swingInput value once swing is enabled', () => {
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '" value="30">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
      gu.swingIsEnabled = true;
      expect(gu.getSwing()).toBe(30);
    });

    it('clamps out-of-range slider values back to 0 (only on read, not on write)', () => {
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '" value="999">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
      gu.swingIsEnabled = true;
      expect(gu.getSwing()).toBe(0);
      // the slider element itself is left untouched at the invalid value -
      // getSwing() only clamps its own return value.
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('999');
    });
  });

  describe('setSwing', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
    });

    it('writes the slider value and the % text when swing is enabled', () => {
      gu.swingIsEnabled = true;
      gu.setSwing(30);
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('30');
      expect(document.getElementById('swingOutput' + gu.grooveUtilsUniqueIndex).innerHTML).toBe(
        '30%'
      );
      expect(gu.getSwing()).toBe(30);
      expect(gu.swingPercent).toBe(30);
    });

    it('forces the amount to 0 when swing is disabled, and shows N/A regardless of the amount passed', () => {
      gu.swingIsEnabled = false;
      gu.setSwing(30);
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('0');
      // swingUpdateText ignores its argument entirely when disabled.
      expect(document.getElementById('swingOutput' + gu.grooveUtilsUniqueIndex).innerHTML).toBe(
        'N/A'
      );
    });
  });

  describe('swingEnabled', () => {
    it('enabling swing with no prior slider value produces "NaN%" (parseInt("") is NaN, and NaN is neither < 0 nor > 60)', () => {
      // This documents an existing quirk: swingEnabled(true) calls
      // swingUpdateText(root.getSwing()), and getSwing() parses whatever is
      // currently in the (empty) swingInput element.
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
      gu.swingEnabled(true);
      expect(gu.swingIsEnabled).toBe(true);
      expect(document.getElementById('swingOutput' + gu.grooveUtilsUniqueIndex).innerHTML).toBe(
        'NaN%'
      );
    });

    it('disabling swing sets the amount to 0 and shows N/A', () => {
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '" value="30">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
      gu.swingIsEnabled = true;
      gu.swingEnabled(false);
      expect(gu.swingIsEnabled).toBe(false);
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('0');
      expect(document.getElementById('swingOutput' + gu.grooveUtilsUniqueIndex).innerHTML).toBe(
        'N/A'
      );
      expect(gu.getSwing()).toBe(0);
    });
  });

  describe('swingUpdateEvent', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<input id="swingInput' +
        gu.grooveUtilsUniqueIndex +
        '">' +
        '<span id="swingOutput' +
        gu.grooveUtilsUniqueIndex +
        '"></span>';
    });

    it('updates the % text from the event value when swing is enabled', () => {
      gu.swingIsEnabled = true;
      gu.swingUpdateEvent({ target: { value: '25' } });
      expect(document.getElementById('swingOutput' + gu.grooveUtilsUniqueIndex).innerHTML).toBe(
        '25%'
      );
    });

    it('resets the slider to 0 (ignoring the event value) when swing is disabled', () => {
      gu.swingIsEnabled = false;
      document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value = '99';
      gu.swingUpdateEvent({ target: { value: '25' } });
      expect(document.getElementById('swingInput' + gu.grooveUtilsUniqueIndex).value).toBe('0');
    });
  });
});

describe('GrooveUtils MIDI player HTML & base locations', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('HTMLForMidiPlayer', () => {
    it('returns a non-empty HTML string containing the tempo/swing control ids', () => {
      const html = gu.HTMLForMidiPlayer(false);
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('tempoInput' + gu.grooveUtilsUniqueIndex);
      expect(html).toContain('tempoTextField' + gu.grooveUtilsUniqueIndex);
      expect(html).toContain('swingInput' + gu.grooveUtilsUniqueIndex);
      expect(html).toContain('swingOutput' + gu.grooveUtilsUniqueIndex);
    });

    it('omits the expand/metronome/logo controls when expandable is false', () => {
      const html = gu.HTMLForMidiPlayer(false);
      expect(html).not.toContain('midiMetronomeMenu');
      expect(html).not.toContain('midiExpandImage');
      expect(html).not.toContain('midiGSLogo');
    });

    it('includes the expand/metronome/logo controls when expandable is true', () => {
      const html = gu.HTMLForMidiPlayer(true);
      expect(html).toContain('midiMetronomeMenu' + gu.grooveUtilsUniqueIndex);
      expect(html).toContain('midiExpandImage' + gu.grooveUtilsUniqueIndex);
      expect(html).toContain('midiGSLogo' + gu.grooveUtilsUniqueIndex);
    });
  });

  describe('getGrooveUtilsBaseLocation / getMidiSoundFontLocation / getMidiImageLocation', () => {
    // groove_utils.js self-locates via import.meta.url (the module-safe
    // replacement for document.currentScript.src) and goes up two directories
    // from js/groove_utils.js to the app root. Under the test loader that URL is
    // a file:// path ending in the repo directory.
    it('getGrooveUtilsBaseLocation derives the app root from the module URL', () => {
      const base = gu.getGrooveUtilsBaseLocation();
      expect(base.endsWith('/')).toBe(true);
      expect(base.endsWith('GrooveScribe/')).toBe(true);
      // No longer the dead hardcoded Google Drive fallback.
      expect(base).not.toContain('googledrive.com');
    });

    it('getMidiSoundFontLocation appends "soundfont/" to the base location', () => {
      expect(gu.getMidiSoundFontLocation()).toBe(gu.getGrooveUtilsBaseLocation() + 'soundfont/');
    });

    it('getMidiImageLocation appends "images/" to the base location', () => {
      expect(gu.getMidiImageLocation()).toBe(gu.getGrooveUtilsBaseLocation() + 'images/');
    });
  });
});
