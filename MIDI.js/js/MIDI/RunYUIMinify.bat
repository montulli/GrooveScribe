copy /b audioDetect.js+LoadPlugin.js+player.js+Plugin.js MIDI.JS_combined.js
@"E:\Program Files (x86)\Java\jre7\bin\java.exe" -jar ../../../jstools/yuicompressor-2.4.8.jar MIDI.JS_combined.js > MIDI.JS.min.js
del /f MIDI.JS_combined.js
pause