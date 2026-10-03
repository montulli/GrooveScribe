import { describe, it, expect, afterEach, vi } from 'vitest';
import { is_mobile_phone } from '../js/browserInfo.js';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const ANDROID_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// jsdom's window already claims touch support, so swap in a bare window and navigator carrying
// only what the probes read
function setEnvironment({ ua, touch, screen }) {
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: touch ? 5 : 0 });
  vi.stubGlobal('window', {
    screen: { width: screen[0], height: screen[1] },
    ...(touch ? { ontouchstart: null } : {}),
  });
}

describe('is_mobile_phone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true for an iPhone and for an Android phone', () => {
    setEnvironment({ ua: IPHONE_UA, touch: true, screen: [390, 844] });
    expect(is_mobile_phone()).toBe(true);
    setEnvironment({ ua: ANDROID_PHONE_UA, touch: true, screen: [412, 915] });
    expect(is_mobile_phone()).toBe(true);
  });

  it('is false for an iPad, an Android tablet and a desktop', () => {
    setEnvironment({ ua: IPAD_UA, touch: true, screen: [820, 1180] });
    expect(is_mobile_phone()).toBe(false);
    setEnvironment({ ua: ANDROID_TABLET_UA, touch: true, screen: [800, 1280] });
    expect(is_mobile_phone()).toBe(false);
    setEnvironment({ ua: DESKTOP_UA, touch: false, screen: [1920, 1080] });
    expect(is_mobile_phone()).toBe(false);
  });

  it('is false without touch, even for a phone-sized window', () => {
    setEnvironment({ ua: DESKTOP_UA, touch: false, screen: [400, 800] });
    expect(is_mobile_phone()).toBe(false);
  });

  it('falls back to screen size for a phone asking for the desktop site', () => {
    setEnvironment({ ua: DESKTOP_UA, touch: true, screen: [390, 844] });
    expect(is_mobile_phone()).toBe(true);
    setEnvironment({ ua: DESKTOP_UA, touch: true, screen: [844, 390] }); // rotated
    expect(is_mobile_phone()).toBe(true);
  });
});
