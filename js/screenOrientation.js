// Native apps (Capacitor Android / iOS): start in landscape, and let the user allow rotation.
//
// The app is far easier to use in landscape on a phone, so on launch the screen is locked to
// landscape. Display > "Allow rotation" releases the lock so the screen follows the device again;
// "Lock to landscape" puts it back. The choice is remembered. On the web (and anywhere the native
// plugin is missing) none of this runs and the menu row stays hidden.
//
// The native side is @capacitor/screen-orientation. There is no bundler here, so instead of importing
// it we ask Capacitor's bridge (injected into the WebView) for the plugin by name.

const STORAGE_KEY = 'groovescribe.rotationAllowed';

function nativePlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return null;
  if (typeof capacitor.registerPlugin !== 'function') return null;
  return capacitor.registerPlugin('ScreenOrientation');
}

// remembered across launches; localStorage can be unavailable or throw
function readRotationAllowed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    console.debug('screen rotation preference not readable', e);
    return false;
  }
}
function saveRotationAllowed(allowed) {
  try {
    window.localStorage.setItem(STORAGE_KEY, allowed ? '1' : '0');
  } catch (e) {
    // not remembered: the next launch just starts locked to landscape again
    console.debug('screen rotation preference not saved', e);
  }
}

export function initScreenOrientation() {
  const plugin = nativePlugin();
  const row = document.getElementById('screenRotationButton');
  if (!plugin || !row) return;

  document.documentElement.classList.add('capacitor-native'); // shows the .nativeOnly menu rows

  let rotationAllowed = readRotationAllowed();

  // a failure (a device that refuses the lock) must never break the app
  const apply = () => {
    const done = rotationAllowed ? plugin.unlock() : plugin.lock({ orientation: 'landscape' });
    if (done && done.catch) done.catch((e) => console.log('screen orientation:', e));
    // the row names what choosing it will do
    row.classList.toggle('ClickToHide', rotationAllowed);
  };

  row.addEventListener('click', () => {
    rotationAllowed = !rotationAllowed;
    saveRotationAllowed(rotationAllowed);
    apply();
  });

  apply();
}
