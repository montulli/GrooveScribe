# Source Code README #

Readme for Groove Scribe Source Code

### Structure ###

* Groove Scribe runs entirely in the browser with no back end calls
* The main application is referred to as "Groove Writer" in the source code and includes the authoring view.
* A secondary application is referred to as "Groove Display" in the source code and includes the sheet music generator and the midi player.

### Groove Writer ###

* Includes all the authoring code with the ability to click on a grid of html icons that will in turn generate music
* Calls Groove Display functions to generate sheet music and midi play back
* Puts an HTML grid on the screen that represents all the possible notes for a given division
* Uses the grid to generate an array of notes that can be turned into music via the Groove Display functions
* Javascript files
    * groove_display.js
	* groove_utils.js

### Groove Display ###

* Just the playback portion of the code, can run separate from the authoring view for embeding in other applications.
* Turns an array of notes into ABC notation code
* SVG sheet music generation utilizing the abc2svg library
* Midi file generation
* Midi playback control
* HTML
    * index.html
* Javascript files
    * groove_writer.js
