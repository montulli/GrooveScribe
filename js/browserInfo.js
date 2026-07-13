// Browser / platform / touch detection (Step 2 extraction). Pure env probes
// (read navigator/window only). GrooveUtils delegates its methods here.

export function getBrowserInfo() {
  var browser = navigator.appName;
  var b_version = navigator.appVersion;
  var version = parseFloat(b_version);
  var useragent = navigator.userAgent;
  switch (browser) {
    case 'Microsoft Internet Explorer':
      browser = 'MSIE';
      version = useragent.substr(useragent.lastIndexOf('MSIE') + 5, 3);
      break;
    case 'Netscape':
      if (useragent.lastIndexOf('Edge/') > 0) {
        browser = 'Edge';
        version = useragent.substr(useragent.lastIndexOf('Edge/') + 5, 4);
      } else if (useragent.lastIndexOf('Chrome/') > 0) {
        browser = 'Chrome';
        version = useragent.substr(useragent.lastIndexOf('Chrome/') + 7, 4);
      } else if (useragent.lastIndexOf('Firefox/') > 0) {
        browser = 'Firefox';
        version = useragent.substr(useragent.lastIndexOf('Firefox/') + 8, 5);
      } else if (useragent.lastIndexOf('Safari/') > 0) {
        browser = 'Safari';
        version = useragent.substr(useragent.lastIndexOf('Safari/') + 7, 6);
      } else if (useragent.lastIndexOf('Trident/') > 0) {
        browser = 'MSIE';
        version = useragent.substr(useragent.lastIndexOf('rv:') + 3, 4);
      } else {
        console.log('undefined browser');
      }
      break;
    case 'Opera':
      version = useragent.substr(useragent.lastIndexOf('Version/') + 8, 5);
      break;
  }
  var platform = 'windows';
  if (useragent.lastIndexOf('iPhone') > 0) {
    platform = 'iOS';
  } else if (useragent.lastIndexOf('iPad') > 0) {
    platform = 'iOS';
  } else if (useragent.lastIndexOf('Android') > 0) {
    platform = 'android';
  } else if (useragent.lastIndexOf('Macintosh') > 0) {
    platform = 'mac';
  }

  return {
    browser: browser,
    version: version,
    platform: platform,
    uastring: useragent,
  };
}

export function is_touch_device() {
  return 'ontouchstart' in window || navigator.MaxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}
