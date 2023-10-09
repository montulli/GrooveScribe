var version = '1.0.0';
var timeStamp = Date.now();

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open('montulli.github.io').then(function(cache) {
      return cache.addAll([
        '/GrooveScribe/?timestamp=' + timeStamp,
        '/GrooveScribe/index.html?timestamp=' + timeStamp,
        '/GrooveScribe/css/groove_display_orange.css?timestamp=' + timeStamp,
        '/GrooveScribe/css/groove_writer_orange.css?timestamp=' + timeStamp,
        '/GrooveScribe/css/share-button.min.css?timestamp=' + timeStamp,
        '/GrooveScribe/font-awesome/4.7.0/css/font-awesome.min.css?timestamp=' + timeStamp,
        '/GrooveScribe/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2?v=4.7.0?timestamp=' + timeStamp,
        '/GrooveScribe/images/GScribe_Logo_lone_g.svg?timestamp=' + timeStamp,
        '/GrooveScribe/images/GScribe_Logo_word_stack.svg?timestamp=' + timeStamp,
        '/GrooveScribe/images/gscribe-icon-96.png?timestamp=' + timeStamp,
        '/GrooveScribe/js/abc2svg-1.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/groove_utils.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/groove_writer.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/grooves.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/jsmidgen.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/pablo.min.js?timestamp=' + timeStamp,
        '/GrooveScribe/js/share-button.min.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/Base64.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/base64binary.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/DOMLoader.XMLHttp.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/jasmid/midifile.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/jasmid/replayer.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/inc/jasmid/stream.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/js/MIDI/AudioDetect.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/js/MIDI/LoadPlugin.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/js/MIDI/Player.js?timestamp=' + timeStamp,
        '/GrooveScribe/MIDI.js/js/MIDI/Plugin.js?timestamp=' + timeStamp,
        '/GrooveScribe/soundfont/gunshot-ogg.js?timestamp=' + timeStamp,
      ])
      .then(function() {
        return self.skipWaiting();
      });
    })
  )
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(function(response) {
      return response || fetch(event.request);
    })
  );
});