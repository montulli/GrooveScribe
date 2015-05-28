// groove_display.js
// utility functions to support displaying a groove on a page


var filesadded="" //list of files already added
 
	var getLocalScriptRoot = (function() {
		var scripts = document.getElementsByTagName('script');
		var index = scripts.length - 1;
		var myScript = scripts[index];
		var lastSlash = myScript.src.lastIndexOf("/");
		myScript.rootSrc = myScript.src.slice(0, lastSlash + 1);
		return function() { return myScript.rootSrc; };
	})();
 
	function checkloadjscssfile(filename, filetype){
		if (filesadded.indexOf("["+filename+"]")==-1){
			loadjscssfile(filename, filetype)
			filesadded+="["+filename+"]" //List of files added in the form "[filename1],[filename2],etc"
		}
		else
			alert("file already added!")
	}

	function loadjscssfile(filename, filetype) {
		if(filename[0] == ".") {   // relative pathname 
			filename = getLocalScriptRoot() + filename;
		}
		
		if (filesadded.indexOf("["+filename+"]")!=-1)
			return;   // file already added
		
		if (filetype=="js"){ //if filename is a external JavaScript file
			var fileref=document.createElement('script')
			fileref.setAttribute("type","text/javascript")
			fileref.setAttribute("src", filename)
		}
		else if (filetype=="css"){ //if filename is an external CSS file
			var fileref=document.createElement("link")
			fileref.setAttribute("rel", "stylesheet")
			fileref.setAttribute("type", "text/css")
			fileref.setAttribute("href", filename)
		}
		if (typeof fileref!="undefined")
			document.getElementsByTagName("head")[0].appendChild(fileref)
	}

		//	<!--   midi.js package for sound   -->
	loadjscssfile("./MIDI/AudioDetect.js", "js");
	loadjscssfile("./MIDI/LoadPlugin.js", "js");
	loadjscssfile("./MIDI/Plugin.js", "js");
	loadjscssfile("./MIDI/Player.js", "js");
	loadjscssfile("./Window/DOMLoader.XMLHttp.js", "js");
		//	<!-- jasmid package midi package required by midi.js above -->
	loadjscssfile("../inc/jasmid/stream.js", "js");
	loadjscssfile("../inc/jasmid/midifile.js", "js");
	loadjscssfile("../inc/jasmid/replayer.js", "js");
		//	<!-- jsmidgen -->
	loadjscssfile("./jsmidgen.js", "js");
		//	<!-- extras -->
	loadjscssfile("../inc/Base64.js", "js");
	loadjscssfile("../inc/base64binary.js", "js");
		//	<!-- script to render ABC to an SVG image -->
	loadjscssfile("./abc2svg-1.js", "js");
			
		//	<!--   our custom JS  -->
	loadjscssfile("./groove_utils.js", "js");
			
		// stylesheet	
	loadjscssfile("../css/groove_display.css", "css");
   
    var GrooveDisplayUniqueCounter = 1;
	
	// GrooveDisplay class.   The only one in this file.
	// singleton
	if (typeof (GrooveDisplay) === "undefined") var GrooveDisplay = {};

	(function() { "use strict";

		var root = GrooveDisplay;

		root.displayGrooveInHTMLElementId = function (HtmlTagId, GrooveDefinition, showPlayer, linkToEditor) {
				var myGrooveUtils = new GrooveUtils();
				GrooveDisplayUniqueCounter++;
				
				var svgTargetId = "svgTarget" + GrooveDisplayUniqueCounter;
				var midiPlayerTargetId = "midiPlayerTarget" + GrooveDisplayUniqueCounter;
			
				document.getElementById(HtmlTagId).innerHTML = '' +
						'<div id="' + svgTargetId + '" class="svgTarget" style="display:inline-block"></div>\n' +
						'<div id="' + midiPlayerTargetId + '" style="width: 260px; display:inline-block; vertical-align: bottom"></div>\n';
						
				// load the groove from the URL data if it was passed in.
				var GrooveData = myGrooveUtils.getGrooveDataFromUrlString(GrooveDefinition);
				console.log(GrooveData);
				var abcNotation = myGrooveUtils.createABCFromGrooveData(GrooveData);
				var svgReturn = myGrooveUtils.renderABCtoSVG(abcNotation);
				
				if(linkToEditor)
					document.getElementById(svgTargetId).innerHTML = '<a style="text-decoration: none" href="' + linkToEditor + GrooveDefinition + '">' + svgReturn.svg + '</a>';
				else
					document.getElementById(svgTargetId).innerHTML = svgReturn.svg;
				
				if(showPlayer) {
					myGrooveUtils.setGrooveData(GrooveData);
				
					myGrooveUtils.AddMidiPlayerToPage(midiPlayerTargetId, GrooveData.notesPerMeasure, true);
					myGrooveUtils.expandOrRetractMIDI_playback(true, false);  // make it small
					myGrooveUtils.oneTimeInitializeMidi();
				}
		}
		
		// Add a groove to a page
		root.AddGrooveDisplayToPage = function (URLEncodedGrooveData, showPlayer, linkToEditor) {
			GrooveDisplayUniqueCounter++;
			
			// add an html Element to hold the grooveDisplay
			var HTMLElementID = 'GrooveDisplay' + GrooveDisplayUniqueCounter;
			document.write('<div id="' + HTMLElementID + '"></div>');
			
			window.addEventListener("load", function() { root.displayGrooveInHTMLElementId(HTMLElementID, URLEncodedGrooveData, showPlayer, linkToEditor);}, false);
		}
	})();  // end of class GrooveDisplay		
						
			