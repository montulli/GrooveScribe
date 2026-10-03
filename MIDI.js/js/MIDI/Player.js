/*
	-------------------------------------
	MIDI.Player : 0.3
	-------------------------------------
	https://github.com/mudcube/MIDI.js
	-------------------------------------
	#jasmid
	-------------------------------------
*/

if (typeof (MIDI) === "undefined") var MIDI = {};
if (typeof (MIDI.Player) === "undefined") MIDI.Player = {};

(function() { "use strict";

var root = MIDI.Player;
root.callback = undefined; // your custom callback goes here!
root.currentTime = 0;
root.endTime = 0; 
root.restart = 0; 
root.playing = false;
root.timeWarp = 1;
root.shouldLoop = 0;

//
root.start =
root.resume = function () {
	if (root.currentTime < -1) root.currentTime = -1;
	startAudio(root.currentTime);
};

root.pause = function () {
	var tmp = root.restart;
	stopAudio();
	root.restart = tmp;
};

root.loop = function (doOrDont) {
	root.shouldLoop = doOrDont;
}

root.stop = function () {
	stopAudio();
	root.restart = 0;
	root.currentTime = 0;
};

root.addListener = function(callback) {
	onMidiEvent = callback;
};

root.removeListener = function() {
	onMidiEvent = undefined;
};

root.clearAnimation = function() {
	if (root.interval)  {
		window.clearInterval(root.interval);
	}
};

root.setAnimation = function(config) {
	var callback = (typeof(config) === "function") ? config : config.callback;
	var interval = config.interval || 30;
	var currentTime = 0;
	var tOurTime = 0;
	var tTheirTime = 0;
	//
	root.clearAnimation();
	root.interval = window.setInterval(function () {
		if (root.endTime === 0) return;
		if (root.playing) {
			currentTime = (tTheirTime === root.currentTime) ? tOurTime - (new Date).getTime() : 0;
			if (root.currentTime === 0) {
				currentTime = 0;
			} else {
				currentTime = root.currentTime - currentTime;
			}
			if (tTheirTime !== root.currentTime) {
				tOurTime = (new Date).getTime();
				tTheirTime = root.currentTime;
			}
		} else { // paused
			currentTime = root.currentTime;
		}
		var endTime = root.endTime;
		var percent = currentTime / endTime;
		var total = currentTime / 1000;
		var minutes = total / 60;
		var seconds = total - (minutes * 60);
		var t1 = minutes * 60 + seconds;
		var t2 = (endTime / 1000);
		if (t2 - t1 < -1) return;
		callback({
			now: t1,
			end: t2,
			events: noteRegistrar
		});
	}, interval);
};

// helpers

root.loadMidiFile = function() { // reads midi into javascript array of events
	root.replayer = new Replayer(MidiFile(root.currentData), root.timeWarp);
	root.data = root.replayer.getData();
	root.endTime = getLength();
};

root.loadFile = function (file, callback) {
	root.stop();
	if (file.indexOf("base64,") !== -1) {
		var data = window.atob(file.split(",")[1]);
		root.currentData = data;
		root.loadMidiFile();
		if (callback) callback(data);
		return;
	}
	///
	var fetch = new XMLHttpRequest();
	fetch.open('GET', file);
	fetch.overrideMimeType("text/plain; charset=x-user-defined");
	fetch.onreadystatechange = function () {
		if (this.readyState === 4 && this.status === 200) {
			var t = this.responseText || "";
			var ff = [];
			var mx = t.length;
			var scc = String.fromCharCode;
			for (var z = 0; z < mx; z++) {
				ff[z] = scc(t.charCodeAt(z) & 255);
			}
			var data = ff.join("");
			root.currentData = data;
			root.loadMidiFile();
			if (callback) callback(data);
		}
	};
	fetch.send();
};

// Playing the audio

var eventQueue = []; // hold events to be triggered
var queuedTime; // 
var startTime = 0; // to measure time elapse
var noteRegistrar = {}; // get event for requested note
// GrooveScribe patch: when looping, the next pass is scheduled on the audio clock a little BEFORE the
// current one ends, instead of from the timer of the last note. A setTimeout that fires late (a busy
// phone) used to start the next loop late too, so every repeat could stutter or shift. The audio clock
// does not slip, so scheduling ahead keeps the loop exactly on the beat.
var loopTimer; // pending "schedule the next loop" timer
var LOOP_LOOKAHEAD = 250; // ms before the end of a pass at which the next one is scheduled
root.canScheduleLoopAhead = function () { return true; }; // the app can veto (e.g. while the notes are being re-read)
var onMidiEvent = undefined; // listener callback
var scheduleTracking = function (channel, note, currentTime, offset, message, velocity) {
	var interval = window.setTimeout(function () {
		var data = {
			channel: channel,
			note: note,
			now: currentTime,
			end: root.endTime,
			message: message,
			velocity: velocity
		};
		//
		if (message === 128) {
			delete noteRegistrar[note];
		} else {
			noteRegistrar[note] = data;
		}
		if (onMidiEvent) {
			onMidiEvent(data);
		}
		root.currentTime = currentTime;
		
		// remove THIS event from the queue. (Was eventQueue.shift(), which removes whatever is first: if the
		// listener above restarted playback -- the notes were edited, so the loop reloads the MIDI --
		// that threw away the first event of the NEW pass instead, and every later event removed
		// its neighbour, leaving one note per pass that stop() could neither cancel nor silence.)
		var queued = -1;
		for (var q = 0; q < eventQueue.length; q++) {
			if (eventQueue[q].interval === interval) { queued = q; break; }
		}
		if (queued > -1) eventQueue.splice(queued, 1);
		
		
		if(root.shouldLoop && (root.currentTime == root.endTime)  && eventQueue.length == 0 ) {
			// at the end of the current tune.   If we are repeating we need to requeue
			// we check to make sure the eventQueue is empty since we may have reloaded the tune
			// in the callback and have essentially already caused the loop
			startAudio(0, true);
		} else if (root.currentTime === queuedTime && queuedTime < root.endTime && eventQueue.length == 0) {
			// grab next sequence of a long midi
			startAudio(queuedTime + .001, true);
		} 
		
	}, currentTime - offset);
	return interval;
};

var getContext = function() {
	if (MIDI.lang === 'WebAudioAPI') {
		return MIDI.Player.ctx;
	} else if (!root.ctx) {
		root.ctx = { currentTime: 0 };
	}
	return root.ctx;
};

var getLength = function() {
	var data =  root.data;
	var length = data.length;
	var totalTime = 0.5;
	for (var n = 0; n < length; n++) {
		totalTime += data[n][1];
	}
	return totalTime;
};

var startAudio = function (currentTime, fromCache, baseTime) {
	if (!root.replayer) return;
	if (!fromCache) {
		if (typeof (currentTime) === "undefined") currentTime = root.restart;
		if (root.playing) stopAudio();
		root.playing = true;
		root.data = root.replayer.getData();
		root.endTime = getLength();
	}
	var note;
	var offset = 0;
	var messages = 0;
	var data = root.data;	
	var ctx = getContext();
	var length = data.length;
	//
	queuedTime = 0.5;
	// baseTime (audio-clock seconds) is when this pass should start; normally right now
	var base = (typeof baseTime === "number" && baseTime > ctx.currentTime) ? baseTime : ctx.currentTime;
	var lead = (base - ctx.currentTime) * 1000; // how far in the future that is, for the UI timers
	startTime = base;
	var scheduledAll = true; // false when the 100-note limit below cut this pass short
	window.clearTimeout(loopTimer);
	//
	for (var n = 0; n < length; n++) {
		
		// stop at a maximum number of queued messages
		// if there are multiple notes at 0 delay
		// queue them all together, regardless of queue size
		if(data[n][1] != 0 && messages >= 100) {
			scheduledAll = false;
			break;
		}
		
		queuedTime += data[n][1];
		if (queuedTime < currentTime) {
			offset = queuedTime;
			continue;
		}	    
		
		currentTime = queuedTime - offset;
		var event = data[n][0].event;
		if (event.type !== "channel") continue;
		var channel = event.channel;
		switch (event.subtype) {
			case 'noteOn':
				if (MIDI.channels[channel].mute) break;
				note = event.noteNumber - (root.MIDIOffset || 0);
				eventQueue.push({
					event: event,
					source: MIDI.noteOn(channel, event.noteNumber, event.velocity, currentTime / 1000 + base),
					interval: scheduleTracking(channel, note, queuedTime, offset - lead, 144, event.velocity)
				});
				messages ++;
				break;
			case 'noteOff':
				if (MIDI.channels[channel].mute) break;
				note = event.noteNumber - (root.MIDIOffset || 0);
				eventQueue.push({
					event: event,
					source: MIDI.noteOff(channel, event.noteNumber, currentTime / 1000 + base),
					interval: scheduleTracking(channel, note, queuedTime, offset - lead, 128)
				});
				break;
			default:
				break;
		}
	}

	// Looping and the whole pass is queued: schedule the next pass shortly before this one ends.
	if (scheduledAll && root.shouldLoop && root.playing && queuedTime >= root.endTime) {
		var passMs = queuedTime - offset; // length of this pass, from `base`
		var nextBase = base + passMs / 1000; // audio-clock time at which the next pass starts
		loopTimer = window.setTimeout(function () {
			if (!root.playing || !root.shouldLoop || !root.canScheduleLoopAhead()) return; // the old restart path handles it
			startAudio(0, true, nextBase);
		}, Math.max(0, (nextBase - ctx.currentTime) * 1000 - LOOP_LOOKAHEAD));
	}
};

var stopAudio = function () {
	var ctx = getContext();
	root.playing = false;
	window.clearTimeout(loopTimer);
	root.restart += Math.max(0, (ctx.currentTime - startTime) * 1000);
	// stop the audio, and intervals
	while (eventQueue.length) {
		var o = eventQueue.pop();
		window.clearInterval(o.interval);
		if (!o.source) continue; // is not webaudio
		if (typeof(o.source) === "number") {
			window.clearTimeout(o.source);
		} else { // webaudio
			o.source.disconnect(0);
		}
	}
	// run callback to cancel any notes still playing
	for (var key in noteRegistrar) {
		var o = noteRegistrar[key]
		if (noteRegistrar[key].message === 144 && onMidiEvent) {
			onMidiEvent({
				channel: o.channel,
				note: o.note,
				now: o.now,
				end: o.end,
				message: 128,
				velocity: o.velocity
			});
		}
	}
	// reset noteRegistrar
	noteRegistrar = {};
};

})();