import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initScreenOrientation } from '../js/screenOrientation.js';

// Stand-in for the native plugin Capacitor's bridge would hand out.
function fakePlugin() {
  return { lock: vi.fn(() => Promise.resolve()), unlock: vi.fn(() => Promise.resolve()) };
}

function setNative(plugin) {
  window.Capacitor = {
    isNativePlatform: () => true,
    registerPlugin: vi.fn(() => plugin),
  };
}

describe('native screen orientation', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML =
      '<li class="nativeOnly" id="screenRotationButton"><span class="stateShowLabel">Allow rotation</span><span class="stateHideLabel">Lock to landscape</span></li>';
    window.localStorage.clear();
  });
  afterEach(() => {
    delete window.Capacitor;
    vi.restoreAllMocks();
  });

  it('does nothing on the web: no plugin call, row stays hidden', () => {
    initScreenOrientation(); // no window.Capacitor at all
    expect(document.documentElement.classList.contains('capacitor-native')).toBe(false);

    window.Capacitor = { isNativePlatform: () => false, registerPlugin: vi.fn() };
    initScreenOrientation();
    expect(window.Capacitor.registerPlugin).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('capacitor-native')).toBe(false);
  });

  it('starts locked to landscape and shows the row', () => {
    const plugin = fakePlugin();
    setNative(plugin);
    initScreenOrientation();

    expect(window.Capacitor.registerPlugin).toHaveBeenCalledWith('ScreenOrientation');
    expect(plugin.lock).toHaveBeenCalledWith({ orientation: 'landscape' });
    expect(plugin.unlock).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('capacitor-native')).toBe(true);
    // locked: the row offers to allow rotation
    expect(document.getElementById('screenRotationButton').classList.contains('ClickToHide')).toBe(
      false
    );
  });

  it('the row toggles between allowing rotation and locking again', () => {
    const plugin = fakePlugin();
    setNative(plugin);
    initScreenOrientation();
    const row = document.getElementById('screenRotationButton');

    row.click(); // "Allow rotation"
    expect(plugin.unlock).toHaveBeenCalledTimes(1);
    expect(row.classList.contains('ClickToHide')).toBe(true); // now offers "Lock to landscape"

    row.click(); // "Lock to landscape"
    expect(plugin.lock).toHaveBeenCalledTimes(2); // at start, and again now
    expect(row.classList.contains('ClickToHide')).toBe(false);
  });

  it('remembers the choice: after allowing rotation, the next launch starts unlocked', () => {
    const first = fakePlugin();
    setNative(first);
    initScreenOrientation();
    document.getElementById('screenRotationButton').click();

    // a new launch
    const second = fakePlugin();
    setNative(second);
    document.body.innerHTML =
      '<li id="screenRotationButton"><span class="stateShowLabel"></span></li>';
    initScreenOrientation();
    expect(second.unlock).toHaveBeenCalledTimes(1);
    expect(second.lock).not.toHaveBeenCalled();
    expect(document.getElementById('screenRotationButton').classList.contains('ClickToHide')).toBe(
      true
    );
  });

  it('a refused lock does not throw', async () => {
    const plugin = {
      lock: vi.fn(() => Promise.reject(new Error('not allowed'))),
      unlock: vi.fn(() => Promise.reject(new Error('not allowed'))),
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    setNative(plugin);
    expect(() => initScreenOrientation()).not.toThrow();
    document.getElementById('screenRotationButton').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toHaveBeenCalled(); // reported, not thrown
  });

  it('still works when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const plugin = fakePlugin();
    setNative(plugin);
    expect(() => initScreenOrientation()).not.toThrow();
    expect(plugin.lock).toHaveBeenCalledWith({ orientation: 'landscape' });
    expect(() => document.getElementById('screenRotationButton').click()).not.toThrow();
    expect(plugin.unlock).toHaveBeenCalledTimes(1);
  });

  it('does nothing if the page has no rotation row', () => {
    const plugin = fakePlugin();
    setNative(plugin);
    document.body.innerHTML = '';
    initScreenOrientation();
    expect(plugin.lock).not.toHaveBeenCalled();
  });
});
