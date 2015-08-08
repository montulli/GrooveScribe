	// Javascript for the Groove Scribe HTML application
	// Groove Scribe is for drummers and helps create sheet music with an easy to use WYSIWYG groove editor.
	//
	// Author: Lou Montulli   
	// Original Creation date: Feb 2015.

// GrooveWriter class.   The only one in this file. 
function GrooveWriter() { "use strict";

	var root = this;

	root.myGrooveUtils = new GrooveUtils();
	
	var class_undo_stack = [];
	var class_redo_stack = [];
	var constant_undo_stack_max_size = 40;
	
	// public class vars
	var class_number_of_measures = 1;  
	var class_notes_per_measure = parseInt(root.myGrooveUtils.getQueryVariableFromURL("Div", "8"), 10);	// default to 8ths
	var class_metronome_interval = 0;
	var class_metronome_auto_speed_up_active = false;
	
	// set debugMode immediately so we can use it in index.html
	root.myGrooveUtils.debugMode = parseInt(root.myGrooveUtils.getQueryVariableFromURL("Debug", "0"), 10);

	// private vars in the scope of the class
	var class_app_title = "Groove Scribe";
	var class_empty_note_array = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];
	var class_permutation_type = "none";
	var class_advancedEditIsOn = false;
	var class_measure_for_note_label_click = 0;
	var class_which_index_last_clicked = 0;    // which note was last clicked for the context menu
	
	// constants
	var constant_default_tempo = 80;
	var constant_note_stem_off_color = "transparent";
	var constant_note_on_color_hex  = "#000000";  // black
	var constant_note_on_color_rgb  = 'rgb(0, 0, 0)';  // black
	var constant_note_off_color_hex = "#FFF"; 
	var constant_note_off_color_rgb = 'rgb(255, 255, 255)';  // white
	var constant_note_border_color_hex = "#999"; 
	var constant_hihat_note_off_color_hex = "#CCC"; 
	var constant_hihat_note_off_color_rgb = 'rgb(204, 204, 204)';  // grey
	var constant_note_hidden_color_rgb = "transparent";
	var constant_sticking_right_off_color_rgb = "rgb(204, 204, 204)";
	var constant_sticking_left_off_color_rgb = "rgb(204, 204, 204)";
	var constant_ABC_STICK_R=  '"R"x';
	var constant_ABC_STICK_L=  '"L"x';
	var constant_ABC_STICK_OFF=  '""x';
	var constant_ABC_HH_Ride=  "^f";       
	var constant_ABC_HH_Crash=  "^A'";       
	var constant_ABC_HH_Open=   "!open!^g";  
	var constant_ABC_HH_Close=  "!plus!^g";  
	var constant_ABC_HH_Accent= "!accent!^g";  
	var constant_ABC_HH_Normal= "^g"; 
	var constant_ABC_SN_Ghost=  "!(.!!).!c";  
	var constant_ABC_SN_Accent= "!accent!c";   
	var constant_ABC_SN_Normal= "c";   
	var constant_ABC_SN_Flam=   "{/c}c"; 
	var constant_ABC_SN_XStick= "^c"; 
	var constant_ABC_KI_SandK=  "[F^d,]";  // kick & splash
	var constant_ABC_KI_Splash= "^d,";     // splash only
	var constant_ABC_KI_Normal= "F";   
				
	// functions


	root.numberOfMeasures = function () {
		return class_number_of_measures;
	};
	
	root.notesPerMeasure = function () {
		return class_notes_per_measure;
	};
	
	// check for firefox browser
	function isFirefox() {
		var val = navigator.userAgent.toLowerCase(); 
		if(val.indexOf("firefox") > -1)
			return true;
			
		return false;
	}
		
	// is the division a triplet groove?   6, 12, or 24 notes
	function usingTriplets() {
		if(root.myGrooveUtils.isTripletDivision(class_notes_per_measure, 4, 4))
			return true;
			
		return false;
	}
	
		
	// public function
	// is the browser a touch device.   Usually this means no right click
	root.is_touch_device = function() {
		 return (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
	};

	function selectButton(element) {
		// highlight the new div by adding selected css class
		if(element) 
			element.className += " buttonSelected";
	}
	
	function unselectButton(element) {
		// remove selected class if it exists
		if(element)
			element.className = element.className.replace(" buttonSelected","");
	}
	
	function is_snare_on(id) {
		var state = get_snare_state(id, "ABC");
		
		if(state != false)
			return true;
			
		return false;
	}
	
	// returns the ABC notation for the snare state
	// false = off
	// 
	//  c == Snare Normal</li>
	//  !accent!c == Snare Accent</li>
	//  _c == Ghost Note    shows an x with a circle around it.   Needs improvement
	//  ^c == xstick   shows an x
	function get_snare_state(id, returnType) {
		
		if(returnType != "ABC" && returnType != "URL")
		{
			alert("bad returnType in get_snare_state()");
			returnType = "ABC";
		}	
		
		if(document.getElementById("snare_flam" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_SN_Flam;   // snare flam
			else if(returnType == "URL")
				return "f";   // snare flam
		}		
		if(document.getElementById("snare_ghost" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_SN_Ghost;   // ghost note
			else if(returnType == "URL")
				return "g";   // ghost note
		}
		if(document.getElementById("snare_accent" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_SN_Accent;   // snare accent
			else if(returnType == "URL")
				return "O";   // snare accent
		}
		if(document.getElementById("snare_circle" + id).style.backgroundColor == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_SN_Normal;   // snare normal
			else if(returnType == "URL")
				return "o";   // snare normal
		}
		if(document.getElementById("snare_xstick" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_SN_XStick;   // snare Xstick
			else if(returnType == "URL")
				return "x";   // snare xstick
		}
				
		if(returnType == "ABC")
				return false;  // off (rest)
			else if(returnType == "URL")
				return "-";  // off (rest)
	}
	
	// is the any kick note on for this note in the measure?
	function is_kick_on(id) {
		var state = get_kick_state(id, "ABC");
		
		if(state != false)
			return true;
			
		return false;
	}

	// returns the ABC notation for the kick state
	// false = off
	// "F" = normal kick
	// "^d," = splash
	// "F^d,"  = kick & splash
	function get_kick_state(id, returnType) {
	
		var splashOn = (document.getElementById("kick_splash" + id).style.color == constant_note_on_color_rgb);
		var kickOn = (document.getElementById("kick_circle" + id).style.backgroundColor == constant_note_on_color_rgb);
	
		if(returnType != "ABC" && returnType != "URL")
		{
			alert("bad returnType in get_kick_state()");
			returnType = "ABC";
		}	
					
		if(splashOn && kickOn) {
			if(returnType == "ABC")
				return constant_ABC_KI_SandK;  // kick & splash
			else if(returnType == "URL")
				return "X";   // kick & splash
		} else if(splashOn) {
			if(returnType == "ABC")
				return constant_ABC_KI_Splash;   // splash only
			else if(returnType == "URL")
				return "x";   // splash only
		} else if(kickOn) {
			if(returnType == "ABC")
				return constant_ABC_KI_Normal;   // kick normal
			else if(returnType == "URL")
				return "o";   // kick normal
		}
			
		if(returnType == "ABC")
				return false;  // off (rest)
			else if(returnType == "URL")
				return "-";  // off (rest)
	}
	
	// set the kick note on with type
	function set_kick_state(id, mode) {

		// hide everything optional
		document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_hidden_color_rgb;
		document.getElementById("kick_splash" + id).style.color = constant_note_hidden_color_rgb;
		
								
		// turn stuff on conditionally
		switch(mode) {
		case "off":
			document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_off_color_hex;
			document.getElementById("kick_circle" + id).style.borderColor = constant_note_border_color_hex;
			break;
		case "normal":
			document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("kick_circle" + id).style.borderColor = constant_note_border_color_hex;
			break;
		case "splash":
			document.getElementById("kick_splash" + id).style.color = constant_note_on_color_hex;
			document.getElementById("kick_circle" + id).style.borderColor = constant_note_hidden_color_rgb;
			
			break;
		case "kick_and_splash":
			document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("kick_splash" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("bad switch in set_kick_state");
			break;
		}
	}
	
	
	function set_snare_state(id, mode) {
						
		// hide everything optional
		document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_hidden_color_rgb;
		document.getElementById("snare_circle" + id).style.borderColor = constant_note_hidden_color_rgb;
		document.getElementById("snare_ghost" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("snare_accent" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("snare_xstick" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("snare_flam" + id).style.color = constant_note_hidden_color_rgb;
						
		// turn stuff on conditionally
		switch(mode) {
		case "off":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_off_color_hex;
			document.getElementById("snare_circle" + id).style.borderColor = constant_note_border_color_hex;
			break;
		case "normal":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("snare_circle" + id).style.borderColor = constant_note_border_color_hex;
			break;
		case "flam":
			//document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			//document.getElementById("snare_circle" + id).style.borderColor = constant_note_border_color_hex;
			document.getElementById("snare_flam" + id).style.color = constant_note_on_color_hex;
			break;
		case "ghost":
			document.getElementById("snare_ghost" + id).style.color = constant_note_on_color_hex;
			break;
		case "accent":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("snare_accent" + id).style.color = constant_note_on_color_hex;
			document.getElementById("snare_circle" + id).style.borderColor = constant_note_border_color_hex;
			break;
		case "xstick":
			document.getElementById("snare_xstick" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("bad switch in set_snare_state");
			break;
		}
	}
	
	function is_hh_on(id) {
		var state = get_hh_state(id, "ABC");
		
		if(state != false)
			return true;
			
		return false;
	}

	// returns the ABC notation for the HH state
	// false = off
	// see the top constants for mappings
	function get_hh_state(id, returnType) {
			
		if(returnType != "ABC" && returnType != "URL")
		{
			alert("bad returnType in get_hh_state()");
			returnType = "ABC";
		}	
		
		if(document.getElementById("hh_ride" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Ride;   // ride
			else if(returnType == "URL")
				return "r";   // ride
		}
		if(document.getElementById("hh_crash" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Crash;   // crash
			else if(returnType == "URL")
				return "c";   // crash
		}
		if(document.getElementById("hh_open" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Open;   // hh Open
			else if(returnType == "URL")
				return "o";   // hh Open
				
		}
		if(document.getElementById("hh_close" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Close;   // hh close
			else if(returnType == "URL")
				return "+";   // hh close
		}
		if(document.getElementById("hh_accent" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Accent;   // hh accent
			else if(returnType == "URL")
				return "X";   // hh accent
		}
		if(document.getElementById("hh_cross" + id).style.color == constant_note_on_color_rgb) {
			if(returnType == "ABC")
				return constant_ABC_HH_Normal;   // hh normal
			else if(returnType == "URL")
				return "x";   // hh normal
		}
		
		if(returnType == "ABC")
				return false;  // off (rest)
		else if(returnType == "URL")
				return "-";  // off (rest)
	}
	
	function set_hh_state(id, mode) {
		
		// hide everything optional
		document.getElementById("hh_cross" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("hh_ride" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("hh_crash" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("hh_open" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("hh_close" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("hh_accent" + id).style.color = constant_note_hidden_color_rgb;
		
		// turn stuff on conditionally
		switch(mode) {
		case "off":
			document.getElementById("hh_cross" + id).style.color = constant_hihat_note_off_color_hex;
			break;
		case "normal":
			document.getElementById("hh_cross" + id).style.color = constant_note_on_color_hex;
			break;
		case "ride":
			document.getElementById("hh_ride" + id).style.color = constant_note_on_color_hex;
			break;
		case "crash":
			document.getElementById("hh_crash" + id).style.color = constant_note_on_color_hex;
			break;
		case "open":
			document.getElementById("hh_cross" + id).style.color = constant_note_on_color_hex;
			document.getElementById("hh_open" + id).style.color = constant_note_on_color_hex;
			break;
		case "close":
			document.getElementById("hh_cross" + id).style.color = constant_note_on_color_hex;
			document.getElementById("hh_close" + id).style.color = constant_note_on_color_hex;
			break;
		case "accent":
			document.getElementById("hh_cross" + id).style.color = constant_note_on_color_hex;
			document.getElementById("hh_accent" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("bad switch in set_hh_state");
			break;
		}
	}
	
	function set_sticking_state(id, new_state) {
		
		// turn both off
		document.getElementById("sticking_right" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("sticking_left" + id).style.color = constant_note_hidden_color_rgb;
			
		switch(new_state) {
		case "off":
			// show them both greyed out.
			document.getElementById("sticking_right" + id).style.color = constant_sticking_right_off_color_rgb;
			document.getElementById("sticking_left" + id).style.color = constant_sticking_left_off_color_rgb;
			break;
		case "right":
			document.getElementById("sticking_right" + id).style.color = constant_note_on_color_hex;
			break;
		case "left":
			document.getElementById("sticking_left" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("Bad state in set_sticking_on");
			break;
		}
	}
	
	function get_sticking_state(id, returnType) {
		var sticking_state = false;
		if(returnType != "ABC" && returnType != "URL")
		{
			alert("bad returnType in get_kick_state()");
			returnType = "ABC";
		}	
			
		var element = document.getElementById("sticking_right" + id);
	
		// since colors are inherited, if we have not set a color it will be blank in the ID'd element
		// we set all colors to off in the stylesheet, so it must be off.
		if( (document.getElementById("sticking_right" + id).style.color == "" && document.getElementById("sticking_left" + id).style.color == "") 
			|| (document.getElementById("sticking_right" + id).style.color == constant_sticking_right_off_color_rgb && document.getElementById("sticking_left" + id).style.color == constant_sticking_left_off_color_rgb)) {
			
			// both are off.   Call it off
			if(returnType == "ABC")
				return constant_ABC_STICK_OFF;  // off (rest)
			else if(returnType == "URL")
				return "-";  // off (rest)
		
		} else if(document.getElementById("sticking_right" + id).style.color == constant_note_on_color_rgb) {
			
			if(returnType == "ABC")
				return constant_ABC_STICK_R;  
			else if(returnType == "URL")
				return "R";  
			
		} else {  // assume left is on, because it's a logic error if it isn't
			
			if(returnType == "ABC")
				return constant_ABC_STICK_L;  
			else if(returnType == "URL")
				return "L";  
		} 
		
		return false;  // should never get here
	}
	
	
	function sticking_rotate_state(id) {
		var new_state = false;
		var sticking_state = get_sticking_state(id, "ABC");
		
		// figure out the next state
		// we could get fancy here and default down strokes to R and upstrokes to L
		// for now we will rotate through (Off, R, L) in order
		if(sticking_state == constant_ABC_STICK_OFF) {
			new_state = "right";
		} else if(sticking_state == constant_ABC_STICK_R) {
			new_state = "left";
		} else if(sticking_state == constant_ABC_STICK_L) {
			new_state = "off";
		}
	
		set_sticking_state(id, new_state);
	}
	
	// highlight the note, this is used to play along with the midi track
	// only one note for each instrument can be highlighted at a time
	// Also unhighlight other instruments if their index is not equal to the passed in index
	// this means that only notes falling on the current beat will be highlighted.
	var class_cur_hh_highlight_id = false;
	var class_cur_snare_highlight_id = false;
	var class_cur_kick_highlight_id = false;
	function hilight_individual_note(instrument, id) {
		var hilight_all_notes = true;   // on by default
		
		id = Math.floor(id);
		if(id < 0 || id >= class_notes_per_measure*class_number_of_measures)
			return;
		
		// turn this one on;
		document.getElementById(instrument + id).style.borderColor = "orange";
		
		// turn off all the previously highlighted notes that are not on the same beat
		if(class_cur_hh_highlight_id !== false && class_cur_hh_highlight_id != id) {
				if(class_cur_hh_highlight_id < class_notes_per_measure*class_number_of_measures)
					document.getElementById("hi-hat" + class_cur_hh_highlight_id).style.borderColor = "transparent";
				class_cur_hh_highlight_id = false;
		}
		if(class_cur_snare_highlight_id !== false && class_cur_snare_highlight_id != id) {
				if(class_cur_snare_highlight_id < class_notes_per_measure*class_number_of_measures)
					document.getElementById("snare" + class_cur_snare_highlight_id).style.borderColor = "transparent";
				class_cur_snare_highlight_id = false;
		}
		if(class_cur_kick_highlight_id !== false && class_cur_kick_highlight_id != id) {
				if(class_cur_kick_highlight_id < class_notes_per_measure*class_number_of_measures)
					document.getElementById("kick" + class_cur_kick_highlight_id).style.borderColor = "transparent";
				class_cur_kick_highlight_id = false;
		}
		
		switch(instrument) {
			case "hi-hat":
				class_cur_hh_highlight_id = id;
				break;
			case "snare":
				class_cur_snare_highlight_id = id;
				break;
			case "kick":
				class_cur_kick_highlight_id = id;
				break;
			default: 
				alert("bad case in hilight_note");
				break;
		}

	}
	
	var class_cur_all_notes_highlight_id = false;
	function hilight_all_notes_on_same_beat(instrument, id) {
	
		id = Math.floor(id);
		if(id < 0 || id >= class_notes_per_measure*class_number_of_measures)
			return;
		
		if(class_cur_all_notes_highlight_id == id)
			return; // already highligted
		
		if(class_cur_all_notes_highlight_id !== false) {
			// turn off old highlighting
			if(document.getElementById("sticking" + class_cur_all_notes_highlight_id)) {
				document.getElementById("sticking" + class_cur_all_notes_highlight_id).style.background = "transparent";
				document.getElementById("hi-hat" + class_cur_all_notes_highlight_id).style.background = "transparent";
				document.getElementById("snare" + class_cur_all_notes_highlight_id).style.background = "transparent";
				document.getElementById("kick" + class_cur_all_notes_highlight_id).style.background = "transparent";			
			}
		}
		
		// turn this one on;
		class_cur_all_notes_highlight_id = id;
		document.getElementById("sticking" + class_cur_all_notes_highlight_id).style.background = "rgba(255,0,0,0.2)";
		document.getElementById("hi-hat" + class_cur_all_notes_highlight_id).style.background = "rgba(255,0,0,0.2)";
		document.getElementById("snare" + class_cur_all_notes_highlight_id).style.background = "rgba(255,0,0,0.2)";
		document.getElementById("kick" + class_cur_all_notes_highlight_id).style.background = "rgba(255,0,0,0.2)";
		
	}
	
	
	function hilight_note(instrument, percent_complete) {
		
		if(percent_complete < 0) {
			clear_all_highlights("clear")
			return;
		}
		
		// if we are in a permutation, hightlight each measure as it goes
		if(class_permutation_type != "none")
			percent_complete = (percent_complete * get_numberOfActivePermutationSections()) % 1.0;
		
		var note_id_in_32 = Math.floor(percent_complete * (usingTriplets() ? 24 : 32) * class_number_of_measures);
		var real_note_id = (note_id_in_32/root.myGrooveUtils.getNoteScaler(class_notes_per_measure, 4, 4));
			
		//hilight_individual_note(instrument, id);
		hilight_all_notes_on_same_beat(instrument, real_note_id);
	}
	
	function clear_all_highlights(instrument) {
		
		// now turn off  notes if necessary;
		if(class_cur_hh_highlight_id !== false) {
				document.getElementById("hi-hat" + class_cur_hh_highlight_id).style.borderColor = "transparent";
				class_cur_hh_highlight_id = false;
		}
		if(class_cur_snare_highlight_id !== false) {
				document.getElementById("snare" + class_cur_snare_highlight_id).style.borderColor = "transparent";
				class_cur_snare_highlight_id = false;
		}
		if(class_cur_kick_highlight_id !== false) {
				document.getElementById("kick" + class_cur_kick_highlight_id).style.borderColor = "transparent";
				class_cur_kick_highlight_id = false;
		}
		
		if(class_cur_all_notes_highlight_id !== false) {
			// turn off old highlighting
			document.getElementById("sticking" + class_cur_all_notes_highlight_id).style.background = "transparent";
			document.getElementById("hi-hat" + class_cur_all_notes_highlight_id).style.background = "transparent";
			document.getElementById("snare" + class_cur_all_notes_highlight_id).style.background = "transparent";
			document.getElementById("kick" + class_cur_all_notes_highlight_id).style.background = "transparent";
			class_cur_all_notes_highlight_id = false;			
		}
		
	}
	
	function getTagPosition(tag) {
		var xVal = 0, yVal = 0;
	  
		while(tag) {
			xVal += (tag.offsetLeft - tag.scrollLeft + tag.clientLeft);
			yVal += (tag.offsetTop - tag.scrollTop + tag.clientTop);
			tag = tag.offsetParent;
		}
    return { x: xVal, y: yVal };
}
	
	root.setMetronomeButton = function(metronomeInterval) {
		
		class_metronome_interval = metronomeInterval;
		var id="";
		switch(metronomeInterval) {
				case 4:
					id = "metronome4ths";
					break;
				case 8:
					id = "metronome8ths";
					break;
				case 16:
					id = "metronome16ths";
					break;
				case 0:
				default:
					id = "metronomeOff";
					if(root.myGrooveUtils.getMetronomeSolo())
					{
						// turn off solo if we are turning off the metronome
						root.metronomeOptionsMenuPopupClick("Solo");
					}
					break;
		}
		
		// clear other buttons
		var myElements = document.querySelectorAll(".metronomeButton");
		for (var i = 0; i < myElements.length; i++) {
			var thisButton = myElements[i];
			// remove active status
			unselectButton(thisButton);
		}
		
		selectButton(document.getElementById(id));
						
		root.myGrooveUtils.midiNoteHasChanged(); // pretty likely the case
	};
	
	// the user has clicked on the metronome options button
	root.metronomeOptionsAnchorClick = function(event) {
		
		var contextMenu = document.getElementById("metronomeOptionsContextMenu");
		if(contextMenu) {
			var anchorPoint = document.getElementById("metronomeOptionsAnchor");
			var anchorPos = getTagPosition(anchorPoint);
			
			if (anchorPoint)
			{
				contextMenu.style.top = anchorPoint.offsetTop + anchorPoint.offsetHeight + "px";
				contextMenu.style.left = anchorPos.x + anchorPoint.offsetWidth - 150 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
	};
	
	// the user has clicked on the permutation menu
	root.permutationAnchorClick = function(event) {
		
		var contextMenu = document.getElementById("permutationContextMenu");
		if(contextMenu) {
			var anchorPoint = document.getElementById("permutationAnchor");
			var anchorPos = getTagPosition(anchorPoint);
			
			if (anchorPoint)
			{
				contextMenu.style.top = anchorPoint.offsetTop + anchorPoint.offsetHeight + "px";
				contextMenu.style.left = anchorPos.x + anchorPoint.offsetWidth - 150 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
	};
	
	// the user has clicked on the grooves menu
	root.groovesAnchorClick = function(event) {
		
		var contextMenu = document.getElementById("grooveListWrapper");
		if(contextMenu) {
			var anchorPoint = document.getElementById("groovesAnchor");
			var anchorPos = getTagPosition(anchorPoint);
			
			if (!event) 
				event = window.event;
			if (anchorPoint)
			{
				contextMenu.style.top = anchorPoint.offsetTop + anchorPoint.offsetHeight + "px";
				contextMenu.style.left = anchorPos.x + anchorPoint.offsetWidth - 283 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
	};
	
	// the user has clicked on the help menu
	root.helpAnchorClick = function(event) {
		
		var contextMenu = document.getElementById("helpContextMenu");
		if(contextMenu) {
			var anchorPoint = document.getElementById("helpAnchor");
			var anchorPos = getTagPosition(anchorPoint);
			
			if (!event) 
				event = window.event;
			if (anchorPoint)
			{
				contextMenu.style.top = anchorPoint.offsetTop + anchorPoint.offsetHeight + "px";
				contextMenu.style.left = anchorPos.x + anchorPoint.offsetWidth - 150 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
	};
	
	// figure out if the metronome options menu should be selected and change the UI
	root.metronomeOptionsMenuSetSelectedState = function() {
		var anchor = document.getElementById("metronomeOptionsAnchor");
		
		if(anchor) {
			if(root.myGrooveUtils.getMetronomeSolo() || 
				class_metronome_auto_speed_up_active ||
				root.myGrooveUtils.getMetronomeClickStart() != "1" ) {
					// make menu look active
				anchor.className += " selected";
			} else {
				// inactive
				anchor.className = anchor.className.replace(new RegExp(' selected', 'g'), "");
			}
		}
	}
	
	root.metronomeOptionsMenuPopupClick = function(option_type) {
		
		switch (option_type) {
		case "Solo":
			var current = root.myGrooveUtils.getMetronomeSolo();
			if(!current) {
				root.myGrooveUtils.setMetronomeSolo(true);
				document.getElementById("metronomeOptionsContextMenuSolo").className += " menuChecked";
				if(class_metronome_interval == 0)
					root.setMetronomeButton(4);
			} else {
				root.myGrooveUtils.setMetronomeSolo(false);
				document.getElementById("metronomeOptionsContextMenuSolo").className = document.getElementById("metronomeOptionsContextMenuSolo").className.replace(new RegExp(' menuChecked', 'g'), "");
			}
			root.myGrooveUtils.midiNoteHasChanged(); // if playing need to refresh
			break;
			
		case "SpeedUp":
			if(class_metronome_auto_speed_up_active) {
				// just turn it off if it is on, don't show the configurator
				class_metronome_auto_speed_up_active = false;
				document.getElementById("metronomeOptionsContextMenuSpeedUp").className = document.getElementById("metronomeOptionsContextMenuSpeedUp").className.replace(new RegExp(' menuChecked', 'g'), "");
			} else {
				class_metronome_auto_speed_up_active = true;
				document.getElementById("metronomeOptionsContextMenuSpeedUp").className += " menuChecked";
				root.show_MetronomeAutoSpeedupConfiguration();
			}
			break;

		case "OffTheOne":
			// bring up the next menu to be clicked
			var contextMenu;
			
			if(usingTriplets())
				contextMenu = document.getElementById("metronomeOptionsOffsetClickForTripletsContextMenu");
			else
				contextMenu = document.getElementById("metronomeOptionsOffsetClickContextMenu");
			if(contextMenu) {
				var anchorPoint = document.getElementById("metronomeOptionsContextMenuOffTheOne");
				var anchorPos = getTagPosition(anchorPoint);
				
				if (anchorPoint)
				{
					contextMenu.style.top = anchorPoint.offsetTop + anchorPoint.offsetHeight + "px";
					contextMenu.style.left = anchorPos.x + anchorPoint.offsetWidth - 150 + "px";
				}
				root.myGrooveUtils.showContextMenu(contextMenu);
			}
			break;
			
		case "Dropper":
			
			break;
			
		default:
			alert("bad case in metronomeOptionsMenuPopupClick()");
			break;
		}
		
		root.metronomeOptionsMenuSetSelectedState();
	};
	
	
	root.metronomeOptionsMenuOffsetClickPopupClick = function(option_type) {	
		
		root.myGrooveUtils.setMetronomeClickStart(option_type);
		
		// clear other and select 
		var myElements = document.querySelectorAll(".metronomeOptionsOffsetClickContextMenuItem");
		for (var i = 0; i < myElements.length; i++) {
			var thisItem = myElements[i];
			// remove active status
			thisItem.className = thisItem.className.replace(new RegExp(' menuChecked', 'g'), "");
		}	
		var selectedItem = document.getElementById("metronomeOptionsOffsetClickContextMenuOnThe" + option_type);
		if(selectedItem)
			selectedItem.className += " menuChecked";
			
		if(option_type != "1") { // 1 is the default state
			// add a check to the menu
			document.getElementById("metronomeOptionsContextMenuOffTheOne").className += " menuChecked";
		} else {
			document.getElementById("metronomeOptionsContextMenuOffTheOne").className = document.getElementById("metronomeOptionsContextMenuOffTheOne").className.replace(new RegExp(' menuChecked', 'g'), "");
		}
		
		root.myGrooveUtils.midiNoteHasChanged();
		root.metronomeOptionsMenuSetSelectedState();
	};
	
	root.resetMetronomeOptionsMenuOffsetClick = function() {
		// call with the default option
		root.metronomeOptionsMenuOffsetClickPopupClick("1");
	};
	
	function setupPermutationMenu() {
		// do nothing for now
	}
	
	root.permutationPopupClick = function(perm_type) {
		class_permutation_type = perm_type;
		
		switch (perm_type) {
		case "kick_16ths":
			showHideCSS_ClassVisibility(".kick-container", true, false);  // hide it
			showHideCSS_ClassVisibility(".snare-container", true, true);  // show it
			while(class_number_of_measures > 1) {
				root.closeMeasureButtonClick(2);
			}
			selectButton(document.getElementById("permutationAnchor"));
			document.getElementById("PermutationOptions").innerHTML = root.HTMLforPermutationOptions();
			document.getElementById("PermutationOptions").className += " displayed";
			break;
			
		case "snare_16ths":
			showHideCSS_ClassVisibility(".kick-container", true, true);  // show it
			showHideCSS_ClassVisibility(".snare-container", true, false);  // hide it
			if(class_number_of_measures > 1)
				alert("Permutation patterns only use the first measure, the other measures will be ignored.")
			selectButton(document.getElementById("permutationAnchor"));
			document.getElementById("PermutationOptions").innerHTML = root.HTMLforPermutationOptions();
			document.getElementById("PermutationOptions").className += " displayed";
			break;

		case "none":
		default:
			showHideCSS_ClassVisibility(".kick-container", true, true);  // show it
			showHideCSS_ClassVisibility(".snare-container", true, true);  // show it
			class_permutation_type = "none";
			
			unselectButton(document.getElementById("permutationAnchor"));
			document.getElementById("PermutationOptions").innerHTML = root.HTMLforPermutationOptions();
			document.getElementById("PermutationOptions").className = document.getElementById("PermutationOptions").className.replace(new RegExp(' displayed', 'g'), "");
			break;
		}
		
		create_ABC();
	};
	
	root.helpMenuPopupClick = function(help_type) {
		
		switch (help_type) {
		case "help":
			var win = window.open("help.html",'_blank');
			win.focus();
			break;
			
		case "about":
			var win = window.open("about.html",'_blank');
			win.focus();
			break;

		case "undo":
			root.undoCommand();
			break;
			
		case "redo":
			root.redoCommand();
			break;
			
		default:
			alert("bad case in helpMenuPopupClick()");
			break;
		}
		
	}
	
	// user has clicked on the advanced edit button
	this.toggleAdvancedEdit = function() {
		if(class_advancedEditIsOn) {
			// turn it off
			class_advancedEditIsOn = false;
			unselectButton(document.getElementById("advancedEditAnchor"));
		} else {
			class_advancedEditIsOn = true;
			selectButton(document.getElementById("advancedEditAnchor"));
		}
	};
	
	
	// context menu for labels
	root.noteLabelClick = function(event, instrument, measure) {
		var contextMenu = false;
		
		// store this in a global, there can only ever be one context menu open at a time.
		// Yes, I agree this sucks
		class_measure_for_note_label_click = measure;
		
		switch(instrument) {
		case "stickings":
			contextMenu = document.getElementById("stickingsLabelContextMenu");
			break;
		case "hh":
			contextMenu = document.getElementById("hhLabelContextMenu");
			break;
		case "snare":
			contextMenu = document.getElementById("snareLabelContextMenu");
			break;
		case "kick":
			contextMenu = document.getElementById("kickLabelContextMenu");
			break;
		default:
			alert("bad case in noteLabelClick");
			break;
		}
		
		if(contextMenu) {
			if (!event) 
				event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-35 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
		
		return false;
	};
	
	
	root.noteLabelPopupClick = function(instrument, action) {
		var setFunction = false;
		var contextMenu = false;
		
		switch(instrument) {
		case "stickings":
			contextMenu = document.getElementById("stickingsLabelContextMenu");
			setFunction = set_sticking_state;
			break;
		case "hh":
			contextMenu = document.getElementById("hhLabelContextMenu");
			setFunction = set_hh_state;
			break;
		case "snare":
			contextMenu = document.getElementById("snareLabelContextMenu");
			setFunction = set_snare_state;
			break;
		case "kick":
			contextMenu = document.getElementById("kickLabelContextMenu");
			setFunction = set_kick_state;
			break;
		default:
			alert("bad case in noteLabelPopupClick");
			return false;
		}
		
		// start at the first note of the measure we want to effect.   Only fill in the 
		// notes for that measure
		var startIndex = class_notes_per_measure * (class_measure_for_note_label_click-1);
		for(var i=startIndex; i-startIndex < class_notes_per_measure; i++) {
			if(action == "all_off")
				setFunction(i, "off");
			else if(instrument == "stickings" && action == "all_right")
				setFunction(i, "right");
			else if(instrument == "stickings" && action == "all_left")
				setFunction(i, "left");
			else if(instrument == "stickings" && action == "alternate")
				setFunction(i, (i % 2 == 0 ? "right" :"left") );
			else if(instrument == "hh" && action == "downbeats")
				setFunction(i, (i % 2 == 0 ? "normal" :"off") );
			else if(instrument == "hh" && action == "upbeats")
				setFunction(i, (i % 2 == 0 ? "off" :"normal") );
			else if(instrument == "snare" && action == "all_on")
				setFunction(i, "accent");
			else if(instrument == "snare" && action == "all_on_normal")
				setFunction(i, "normal");
			else if(action == "all_on")
				setFunction(i, "normal");
			else if(action == "cancel")
				continue;  // do nothing.
			else 
				alert("Bad IF case in noteLabelPopupClick");
		}
		
		class_measure_for_note_label_click = 0;  // reset
		
		create_ABC();
		
		return false;
	};
	
	// returns true on error!
	// returns false if working.  (this is because of the onContextMenu handler 
	root.noteRightClick = function(event, type, id) {
		class_which_index_last_clicked = id;
		var contextMenu;
		
		switch(type) {
			case "sticking":
				contextMenu = document.getElementById("stickingContextMenu");
				break;
			case "hh":
				contextMenu = document.getElementById("hhContextMenu");
				break;
			case "snare":
				contextMenu = document.getElementById("snareContextMenu");
				break;
			case "kick":
				contextMenu = document.getElementById("kickContextMenu");
				break;
			default:
				alert("Bad case in handleNotePopup");
				break;
		}
		
		if(contextMenu) {
			if (!event) 
				event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-75 + "px";
			}
			root.myGrooveUtils.showContextMenu(contextMenu);
		}
		else {
			return true;  //error
		}
		
		return false;
	};
	
	root.noteLeftClick = function(event, type, id) {
		
		// use a popup if advanced edit is on
		if(class_advancedEditIsOn == true) {
			root.noteRightClick(event, type, id);
		
		} else {	
		
			// this is a non advanced edit left click
			switch(type) {
			case "hh":
				set_hh_state(id, is_hh_on(id) ? "off" : "normal");
				break;
			case "snare":
				set_snare_state(id, is_snare_on(id) ? "off" : "accent");
				break;
			case "kick":
				set_kick_state(id, is_kick_on(id) ? "off" : "normal");
				break;
			case "sticking":
				sticking_rotate_state(id);
				break;
			default:
				alert("Bad case in noteLeftClick");
				break;
			}
		
			create_ABC();
		}
		
	};

	root.notePopupClick = function(type, new_setting) {
		var id = class_which_index_last_clicked;
		
		switch(type) {
			case "sticking":
				set_sticking_state(id, new_setting);
				break;
			case "hh":
				set_hh_state(id, new_setting);
				break;
			case "snare":
				set_snare_state(id, new_setting);
				break;
			case "kick":
				set_kick_state(id, new_setting);
				break;
			default:
				alert("Bad case in contextMenuClick");
				break;
		}
		
		create_ABC();
	};
	
	// called when we initially mouseOver a note.   
	// We can use it to sense left or right mouse or ctrl events
	root.noteOnMouseEnter = function(event, instrument, id) {
	
		var action = false;
		
		if(event.ctrlKey)
			action = "on";
		if(event.altKey)
			action = "off";
			
		if(action) {
			switch(instrument) {
				case "hh":
					set_hh_state(id, action == "off" ? "off" : "normal");
					break;
				case "snare":
					set_snare_state(id, action == "off" ? "off" : "accent");
					break;
				case "kick":
					set_kick_state(id, action == "off" ? "off" : "normal");
					break;
				default:
					alert("Bad case in noteOnMouseEnter");
					break;
			}
			create_ABC();  // update music
		}
		
		return false;
	};
				
	function is_hh_or_snare_on(id) {
		if( is_hh_on(id) ) return true;
		if( is_snare_on(id) ) return true;
		
		return false;
	}
	
	
	

	function get_permutation_pre_ABC(section) {
		var abc = "";
		
		switch(section) {
		case 0:
			abc += "P:Ostinato\n%\n%\n%Just the Ositnato\n";
			break;
		case 1:
			abc += "T: \nP: Singles\n%\n%\n% singles on the \"1\"\n%\n";
			break;
		case 2:
			abc += "%\n%\n% singles on the \"e\"\n%\n";
			break;
		case 3:
			abc += "%\n%\n% singles on the \"&\"\n%\n";
			break;
		case 4:
			abc += "%\n%\n% singles on the \"a\"\n%\n";		
			break;
		case 5:
			abc += "T: \nP: Doubles\n%\n%\n% doubles on the \"1\"\n%\n";
			break;
		case 6:
			abc += "%\n%\n% doubles on the \"e\"\n%\n";
			break;
		case 7:
			abc += "%\n%\n% doubles on the \"&\"\n%\n";
			break;
		case 8:
			abc += "%\n%\n% doubles on the \"a\"\n%\n";		
			break;
		case 9:
			abc += "T: \nP: Down/Up Beats\n%\n%\n% upbeats on the \"1\"\n%\n";
			break;
		case 10:
			abc += "%\n%\n% downbeats on the \"e\"\n%\n";
			break;
		case 11:
			abc += "T: \nP: Triples\n%\n%\n% triples on the \"1\"\n%\n";
			break;
		case 12:
			abc += "%\n%\n% triples on the \"e\"\n%\n";
			break;
		case 13:
			abc += "%\n%\n% triples on the \"&\"\n%\n";
			break;
		case 14:
			abc += "%\n%\n% triples on the \"a\"\n%\n";		
			break;
		case 15:
			abc += "T: \nP: Quads\n%\n%\n% quads\n%\n";		
			break;
		default:
			abc += "\nT: Error: No index passed\n";
			break;
		}
		
		return abc;
	}
	
	function get_permutation_post_ABC(section) {
		var abc = "";
		
		
		switch(section) {
		case 0:
			abc += "|\n";
			break;
		case 1:
			abc += "\\\n";
			break;
		case 2:
			abc += "\n";
			break;
		case 3:
			if(usingTriplets())
				abc += "|\n";
			else
				abc += "\\\n";
			break;
		case 4:
			abc += "|\n";	
			break;
		case 5:
			abc += "\\\n";
			break;
		case 6:
			abc += "\n";
			break;
		case 7:
			if(usingTriplets())
				abc += "|\n";
			else
				abc += "\\\n";
			break;
		case 8:
			abc += "|\n";		
			break;
		case 9:
			abc += "\\\n";
			break;
		case 10:
			abc += "|\n";
			break;
		case 11:
			if(usingTriplets())
				abc += "|\n";
			else
				abc += "\\\n";
			break;
			break;
		case 12:
			abc += "\n";		
			break;
		case 13:
			abc += "\\\n";
			break;
		case 14:
			abc += "|\n";		
			break;
		case 15:
			abc += "|\n";		
			break;
		default:
			abc += "\nT: Error: No index passed\n";
			break;
		}
		
		return abc;
	}
	
	// 16th note permutation array expressed in 32nd notes
	// some kicks are excluded at the beginning of the measure to make the groupings
	// easier to play through continuously
	function get_kick16th_minus_some_strait_permutation_array(section) {
		var kick_array;
		
		switch(section) {
		case 0:
			kick_array = [false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false];
			break;
		case 1:
			kick_array = ["F", false, false, false, false, false, false, false,
						  "F", false, false, false, false, false, false, false,
						  "F", false, false, false, false, false, false, false, 
						  "F", false, false, false, false, false, false, false];
			break;
		case 2:
			kick_array = [false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false];
			break;
		case 3:
			kick_array = [false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false];
			break;
		case 4:
			kick_array = [false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false];
			break;
		case 5:
			kick_array = ["F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false];
			break;
		case 6:
			kick_array = [false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false];
			break;
		case 7:
			kick_array = [false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false];
			break;
		case 8:
			kick_array = [false, false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false];
			break;
		case 9:   // downbeats
			kick_array = ["F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false];
			break;
		case 10:  // upbeats
			kick_array = [false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false];
			break;
		case 11:
			kick_array = ["F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false];
			break;
		case 12:
			kick_array = [false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false];
			break;
		case 13:
			kick_array = [false, false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false];
			break;
		case 14:
			kick_array = [false, false, false, false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false];
			break;
		case 15:
		default:
			kick_array = ["F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false];
			break;
		}
		
		return kick_array;
	}
	
	// 16th note permutation array expressed in 32nd notes
	// all kicks are included, including the ones that start the measure
	function get_kick16th_strait_permutation_array(section) {
		var kick_array;
		
		
		switch(section) {
		case 0:
			kick_array = [false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false, 
						  false, false, false, false, false, false, false, false];
			break;
		case 1:
			kick_array = ["F", false, false, false, false, false, false, false,
						  "F", false, false, false, false, false, false, false,
						  "F", false, false, false, false, false, false, false, 
						  "F", false, false, false, false, false, false, false];
			break;
		case 2:
			kick_array = [false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false, 
						  false, false, "F", false, false, false, false, false];
			break;
		case 3:
			kick_array = [false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false, 
						  false, false, false, false, "F", false, false, false];
			break;
		case 4:
			kick_array = [false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false, 
						  false, false, false, false, false, false, "F", false];
			break;
		case 5:
			kick_array = ["F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false, 
						  "F", false, "F", false, false, false, false, false];
			break;
		case 6:
			kick_array = [false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false, 
						  false, false, "F", false, "F", false, false, false];
			break;
		case 7:
			kick_array = [false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false, 
						  false, false, false, false, "F", false, "F", false];
			break;
		case 8:
			kick_array = ["F", false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false, 
						  "F", false, false, false, false, false, "F", false];
			break;
		case 9:   // downbeats
			kick_array = ["F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, false, false];
			break;
		case 10:  // upbeats
			kick_array = [false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, "F", false];
			break;
		case 11:
			kick_array = ["F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false];
			break;
		case 12:
			kick_array = [false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false];
			break;
		case 13:
			kick_array = ["F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false];
			break;
		case 14:
			kick_array = ["F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false];
			break;
		case 15:
		default:
			kick_array = ["F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false];
			break;
		}
		
		return kick_array;
	}
	
	// 24 note triplet kick permutation expressed in 16th notes
	function get_kick16th_triplets_permutation_array_for_16ths(section) {
		var kick_array;
		
		
		switch(section) {
		case 0:
			kick_array = [false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false];
			break;
		case 1:
			kick_array = ["F", false, false, false, false, false, 
						  "F", false, false, false, false, false, 
						  "F", false, false, false, false, false, 
						  "F", false, false, false, false, false];
			break;
		case 2:
			kick_array = [false, false, "F", false, false, false, 
						  false, false, "F", false, false, false,
						  false, false, "F", false, false, false,
						  false, false, "F", false, false, false];
			break;
		case 3:
			kick_array = [false, false, false, false, "F", false, 
						  false, false, false, false, "F", false, 
						  false, false, false, false, "F", false, 
						  false, false, false, false, "F", false];
			break;
		case 5:
			kick_array = ["F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false];
			break;
		case 6:
			kick_array = [false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false];
			break;
		case 7:
			kick_array = ["F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false];
			break;
		
		// these cases should not be called
		case 4:   // 4th single
		case 8:   // 4th double
		case 9:   // 1st up/down
		case 10:  // 2nd up/down
		case 12:  // 2nd triplet
		case 13:  // 3nd triplet
		case 14:  // 4nd triplet
		case 15:  // 1st Quad
			alert("bad case in get_kick16th_triplets_permutation_array_for_16ths()");
			break;
			
		case 11:  // first triplet
		default:
			// use default
			break;
		}
		// default;
		if(!kick_array)
			kick_array = ["F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false];
		
		return kick_array;
	}
	
	// 12th note triplet kick permutation expressed in 8th notes
	function get_kick16th_triplets_permutation_array_for_8ths(section) {
		var kick_array;
		
		switch(section) {
		case 0:
			kick_array = [false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false];
			break;
		case 1:
			kick_array = ["F", false, false, false, false, false, 
						  "F", false, false, false, false, false, 
						  "F", false, false, false, false, false, 
						  "F", false, false, false, false, false];
			break;
		case 2:
			kick_array = [false, false, "F", false, false, false, 
						  false, false, "F", false, false, false,
						  false, false, "F", false, false, false,
						  false, false, "F", false, false, false];
			break;
		case 3:
			kick_array = [false, false, false, false, "F", false, 
						  false, false, false, false, "F", false, 
						  false, false, false, false, "F", false, 
						  false, false, false, false, "F", false];
			break;
		case 5:
			kick_array = ["F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false];
			break;
		case 6:
			kick_array = [false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false];
			break;
		case 7:
			kick_array = ["F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false];
			break;
		
		// these cases should not be called
		case 4:   // 4th single
		case 8:   // 4th double
		case 9:   // 1st up/down
		case 10:  // 2nd up/down
		case 12:  // 2nd triplet
		case 13:  // 3nd triplet
		case 14:  // 4nd triplet
		case 15:  // 1st Quad
			alert("bad case in get_kick16th_triplets_permutation_array_for_16ths()");
			break;
			
		case 11:   // first triplet
		default:
			// use default
			break;
		}
		
		// default;
		if(!kick_array)
			kick_array = ["F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false];
		return kick_array;
	}
	
	// 6 note triplet kick permutation expressed in 4th notes
	function get_kick16th_triplets_permutation_array_for_4ths(section) {
		var kick_array;
			
		switch(section) {
		case 0:
			kick_array = [false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, false, false, false, false];
			break;
		case 1:
			kick_array = ["F", false, false, false, false, false, 
						  false, false, false, false, false, false, 
						  "F", false, false, false, false, false, 
						  false, false, false, false, false, false];
			break;
		case 2:
			kick_array = [false, false, false, false, "F", false, 
						  false, false, false, false, false, false,
						  false, false, false, false, "F", false,
						  false, false, false, false, false, false];
			break;
		case 3:
			kick_array = [false, false, false, false, false, false, 
						  false, false, "F", false, false, false, 
						  false, false, false, false, false, false, 
						  false, false, "F", false, false, false];
			break;
		case 5:
			kick_array = ["F", false, false, false, "F", false, 
						  false, false, false, false, false, false, 
						  "F", false, false, false, "F", false, 
						  false, false, false, false, false, false];
			break;
		case 6:
			kick_array = [false, false, false, false, "F", false, 
						  false, false, "F", false, false, false,
						  false, false, false, false, "F", false,
						  false, false, "F", false, false, false];
			break;
		case 7:
			kick_array = ["F", false, false, false, false, false, 
						  false, false, "F", false, false, false, 
						  "F", false, false, false, false, false, 
						  false, false, "F", false, false, false];
			break;
		
		// these cases should not be called
		case 4:   // 4th single
		case 8:   // 4th double
		case 9:   // 1st up/down
		case 10:  // 2nd up/down
		case 12:  // 2nd triplet
		case 13:  // 3nd triplet
		case 14:  // 4nd triplet
		case 15:  // 1st Quad
			alert("bad case in get_kick16th_triplets_permutation_array_for_16ths()");
			break;
			
		case 11:   // first triplet
		default:
			// use default
			break;
		}
		
		if(!kick_array)
			kick_array = ["F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false];
			
		return kick_array;
	}
	
	function get_kick16th_permutation_array(section) {
		if(usingTriplets()) {
			if(class_notes_per_measure == 6)
				return get_kick16th_triplets_permutation_array_for_4ths(section);
			else if(class_notes_per_measure == 12)
				return get_kick16th_triplets_permutation_array_for_8ths(section);
			else if(class_notes_per_measure == 24)
				return get_kick16th_triplets_permutation_array_for_16ths(section);
			else
				return class_empty_note_array.slice(0);  // copy by value;
		} 
		
		return get_kick16th_strait_permutation_array(section);
	}
	
	function get_kick16th_permutation_array_minus_some(section) {
		if(usingTriplets()) {
			// triplets never skip any: delegate 
			return get_kick16th_permutation_array(section);
		}
		
		return get_kick16th_minus_some_strait_permutation_array(section);
	}
	
	
	// snare permutation 
	function get_snare_permutation_array(section) {

		// its the same as the 16th kick permutation, but with different notes
		var snare_array = get_kick16th_permutation_array(section);
		
		// turn the kicks into snares
		for(var i=0; i < snare_array.length; i++)
		{
			if(snare_array[i] != false)
				snare_array[i] = constant_ABC_SN_Normal;
		}
		
		return snare_array;
	}
	
	// Snare permutation, with Accented permutation.   Snare hits every 16th note, accent moves
	function get_snare_accent_permutation_array(section) {

		// its the same as the 16th kick permutation, but with different notes
		var snare_array = get_kick16th_permutation_array(section);
		
		if(section > 0) {   // Don't convert notes for the first measure since it is the ostinado
			for(var i=0; i < snare_array.length; i++)
			{
				if(snare_array[i] != false)
					snare_array[i] = constant_ABC_SN_Accent;
				else if((i%2) == 0)  // all other even notes are ghosted snares  
					snare_array[i] = constant_ABC_SN_Normal;
			}
		}
		
		return snare_array;
	}
	
	// Snare permutation, with Accented and diddled permutation.   Accented notes are singles, non accents are diddled
	function get_snare_accent_with_diddle_permutation_array(section) {

		// its the same as the 16th kick permutation, but with different notes
		var snare_array = get_kick16th_permutation_array(section);
		
		if(section > 0) {   // Don't convert notes for the first measure since it is the ostinado
			for(var i=0; i < snare_array.length; i++)
			{
				if(snare_array[i] != false) {  
					snare_array[i] = constant_ABC_SN_Accent;
					i++;   // the next one is not diddled  (leave it false)
				} else { // all other even notes are diddled, which means 32nd notes  
					snare_array[i] = constant_ABC_SN_Normal;
				}
			}
		}
		
		return snare_array;
	}
	
	function get_numSectionsFor_permutation_array() {
		var numSections = 16;
		
		/*)
		if(usingTriplets()) {
			numSections = 8;
		} else {
			numSections = 16;
		}
		*/
		
		return numSections;
	}
		
	
	function get_kick_on_1_and_3_array(section) {
		
		var kick_array;
		
		if(usingTriplets())
			kick_array = ["F", false, false, false, false, false, 
						  "F", false, false, false, false, false,
						  "F", false, false, false, false, false, 
						  "F", false, false, false, false, false];
		else
			kick_array = ["F", false, false, false, false, false, false, false, 
						  "F", false, false, false, false, false, false, false, 
						  "F", false, false, false, false, false, false, false, 
						  "F", false, false, false, false, false, false, false];

		return kick_array;
	}
	
	function get_samba_kick_array(section) {
		
		var kick_array = ["F", false, false, false, "^D", false, "F", false,
						  "F", false, false, false, "^D", false, "F", false,
						  "F", false, false, false, "^D", false, "F", false,
						  "F", false, false, false, "^D", false, "F", false];
		return kick_array;
	}
	
	function get_tumbao_kick_array(section) {
		
		var kick_array = ["^D", false, false, false, false, false, "F", false,  
						  "^D", false, false, false, "F", false, false, false, 
						  "^D", false, false, false, false, false, "F", false,  
						  "^D", false, false, false, "F", false, false, false];
		return kick_array;
	}
	
	function get_baiao_kick_array(section) {
		
		var kick_array = ["F", false, false, false, "^D", false, "F", false,  
						  false, false, false, false, "[F^D]", false, false, false, 
						  "F", false, false, false, "^D", false, "F", false,  
						  false, false, false, false, "[F^D]", false, false, false];
		return kick_array;
	}
	
	// use the Permutation options to figure out if we should display a particular section
	function shouldDisplayPermutationForSection(sectionNum) {
		var ret_val = false;
		
		switch(sectionNum) {
			case 0:
				if(document.getElementById("PermuationOptionsOstinato").checked
					&& (!document.getElementById("PermuationOptionsOstinato_sub1")
						|| document.getElementById("PermuationOptionsOstinato_sub1").checked) )
					ret_val = true;
				break;
			case 1:
				if(document.getElementById("PermuationOptionsSingles").checked
					&& document.getElementById("PermuationOptionsSingles_sub1").checked)
					ret_val = true;
				break;
			case 2:
				if(document.getElementById("PermuationOptionsSingles").checked
					&& document.getElementById("PermuationOptionsSingles_sub2").checked)
					ret_val = true;
				break;
			case 3:
				if(document.getElementById("PermuationOptionsSingles").checked
					&& document.getElementById("PermuationOptionsSingles_sub3").checked)
					ret_val = true;
				break;
			case 4:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsSingles").checked
					&& document.getElementById("PermuationOptionsSingles_sub4").checked)
					ret_val = true;
				break;
			case 5:
				if(document.getElementById("PermuationOptionsDoubles").checked
					&& document.getElementById("PermuationOptionsDoubles_sub1").checked)
					ret_val = true;
				break;
			case 6:
				if(document.getElementById("PermuationOptionsDoubles").checked
					&& document.getElementById("PermuationOptionsDoubles_sub2").checked)
					ret_val = true;
				break;
			case 7:
				if(document.getElementById("PermuationOptionsDoubles").checked
					&& document.getElementById("PermuationOptionsDoubles_sub3").checked)
					ret_val = true;
				break;
			case 8:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsDoubles").checked
					&& document.getElementById("PermuationOptionsDoubles_sub4").checked)
					ret_val = true;
				break;
			case 9:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsUpsDowns").checked
					&& document.getElementById("PermuationOptionsUpsDowns_sub1").checked)
					ret_val = true;
				break;
			case 10:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsUpsDowns").checked
					&& document.getElementById("PermuationOptionsUpsDowns_sub2").checked)
					ret_val = true;
				break;
			case 11:
				if(document.getElementById("PermuationOptionsTriples").checked
					&& (!document.getElementById("PermuationSubOptionsTriples1")
						|| document.getElementById("PermuationOptionsTriples_sub1").checked) )
					ret_val = true;
				break;
			case 12:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsTriples").checked
					&& document.getElementById("PermuationOptionsTriples_sub2").checked)
					ret_val = true;
				break;
			case 13:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsTriples").checked
					&& document.getElementById("PermuationOptionsTriples_sub3").checked)
					ret_val = true;
				break;
			case 14:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsTriples").checked
					&& document.getElementById("PermuationOptionsTriples_sub4").checked)
					ret_val = true;
				break;
			case 15:
				if(!usingTriplets()
					&& document.getElementById("PermuationOptionsQuads").checked
					&& (!document.getElementById("PermuationOptionsQuads_sub1")
						|| document.getElementById("PermuationOptionsQuads_sub1").checked) )
					ret_val = true;
				break;
			default:
				alert("bad case in groove_writer.js:shouldDisplayPermutationForSection()");
				return false;
				break;
		}
		
			return ret_val;
	}
	
	// use the permutation options to count the number of active permutation sections
	function get_numberOfActivePermutationSections() {
		var max_num = get_numSectionsFor_permutation_array();
		var total_on = 0;
		
		for(var i=0; i < max_num; i++) {
			if(shouldDisplayPermutationForSection(i))
				total_on++;
		}
		
		return total_on;
	}
	
	// query the clickable UI and generate a 32 element array representing the notes of one measure
	// note: the ui may have fewer notes, but we scale them to fit into the 32 elements proportionally
	// If using triplets returns 24 notes.   Otherwise always 32.
	//
	// (note: Only one measure, not all the notes on the page if multiple measures are present)
	// Return value is the number of notes.
	function getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, startIndexForClickableUI) {
		
		var scaler = root.myGrooveUtils.getNoteScaler(class_notes_per_measure, 4, 4);  // fill proportionally
		
		// fill in the arrays from the clickable UI
		for(var i=0; i < class_notes_per_measure+0; i++) {
			var array_index = (i)*scaler;
			
			// only grab the stickings if they are visible
			if(isStickingsVisible())
				Sticking_Array[array_index] = get_sticking_state(i+startIndexForClickableUI, "ABC");
			
			HH_Array[array_index] = get_hh_state(i+startIndexForClickableUI, "ABC");
		
			Snare_Array[array_index] = get_snare_state(i+startIndexForClickableUI, "ABC");
		
			Kick_Array[array_index] = get_kick_state(i+startIndexForClickableUI, "ABC");
		}
		
		var num_notes = (usingTriplets() ? 24 : 32);
		return num_notes;
	}
	
	
	function filter_kick_array_for_permutation(old_kick_array) {
		var new_kick_array = [];
		
		for(var i in old_kick_array) {
			if(old_kick_array[i] == constant_ABC_KI_Splash ||
				old_kick_array[i] == constant_ABC_KI_SandK)
				new_kick_array.push(constant_ABC_KI_Splash);
			else
				new_kick_array.push(false);
		}
		
		return new_kick_array;
	}
	
	// merge 2 kick arrays
	//  4 possible states
	//  false   (off)
	//  constant_ABC_KI_Normal
	//  constant_ABC_KI_SandK
	//  constant_ABC_KI_Splash
	function merge_kick_arrays(primary_kick_array, secondary_kick_array) {
		var new_kick_array = [];
		
		for(var i in primary_kick_array) {
		
			switch(primary_kick_array[i]) {
				case false:
					new_kick_array.push(secondary_kick_array[i]);
					break;
				
				case constant_ABC_KI_SandK:
					new_kick_array.push(constant_ABC_KI_SandK);
					break;
				
				case constant_ABC_KI_Normal:
					if(secondary_kick_array[i] == constant_ABC_KI_SandK ||
						secondary_kick_array[i] == constant_ABC_KI_Splash)
						new_kick_array.push(constant_ABC_KI_SandK);
					else
						new_kick_array.push(constant_ABC_KI_Normal);
					break;
					
				case constant_ABC_KI_Splash:
					if(secondary_kick_array[i] == constant_ABC_KI_Normal ||
						secondary_kick_array[i] == constant_ABC_KI_SandK)
						new_kick_array.push(constant_ABC_KI_SandK);
					else
						new_kick_array.push(constant_ABC_KI_Splash);
					break;
						
				default:
					alert("bad case in merge_kick_arrays()");
					new_kick_array.push(primary_kick_array[i]);
					break;
			}
		}
		
		return new_kick_array;
	}

	
	function createMidiUrlFromClickableUI(MIDI_type) {
		var Sticking_Array = class_empty_note_array.slice(0);  // copy by value
		var HH_Array = class_empty_note_array.slice(0);  // copy by value
		var Snare_Array = class_empty_note_array.slice(0);  // copy by value
		var Kick_Array = class_empty_note_array.slice(0);  // copy by value
		var i, new_snare_array, num_notes_for_swing;
		
		// comes locally from this class
		//var metronomeFrequency = root.myGrooveUtils.getMetronomeFrequency(); 
		var metronomeFrequency = class_metronome_interval;
		
		// just the first measure
		var num_notes = getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, 0);
		
		var midiFile = new Midi.File();
		var midiTrack = new Midi.Track();
		midiFile.addTrack(midiTrack);

		midiTrack.setTempo(root.myGrooveUtils.getTempo());
		midiTrack.setInstrument(0, 0x13);
		
		var swing_percentage = root.myGrooveUtils.getSwing()/100;
		
		// all of the permutations use just the first measure
		switch (class_permutation_type) {
		case "kick_16ths":
			var numSections = get_numSectionsFor_permutation_array();
			
			// compute sections with different kick patterns
			for(i=0; i < numSections; i++) {
				
				if(shouldDisplayPermutationForSection(i)) {
					var new_kick_array;
					
					if(document.getElementById("PermuationOptionsSkipSomeFirstNotes") && document.getElementById("PermuationOptionsSkipSomeFirstNotes").checked)
						new_kick_array = get_kick16th_permutation_array_minus_some(i);
					else
						new_kick_array = get_kick16th_permutation_array(i);
					
					// grab hi-hat foots from existing kick array and merge it in.
					Kick_Array = filter_kick_array_for_permutation(Kick_Array);
					new_kick_array = merge_kick_arrays(new_kick_array, Kick_Array);

					num_notes_for_swing = 16;
					if(class_notes_per_measure > 16)
						num_notes_for_swing = class_notes_per_measure;
				
					root.myGrooveUtils.MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, new_kick_array, MIDI_type, metronomeFrequency, num_notes, num_notes_for_swing, swing_percentage, 4, 4);
				}
			}
			break;
			
		
		case "snare_16ths":  // use the hh & snare from the user
			numSections = get_numSectionsFor_permutation_array();
			
			//compute sections with different snare patterns		
			for(i=0; i < numSections; i++) {
				if(shouldDisplayPermutationForSection(i)) {
				
					if(document.getElementById("PermuationOptionsAccentGridDiddled") && document.getElementById("PermuationOptionsAccentGridDiddled").checked)
						new_snare_array = get_snare_accent_with_diddle_permutation_array(i);
					else if(document.getElementById("PermuationOptionsAccentGrid") && document.getElementById("PermuationOptionsAccentGrid").checked)
						new_snare_array = get_snare_accent_permutation_array(i);
					else
						new_snare_array = get_snare_permutation_array(i);
					
					num_notes_for_swing = 16;
					if(class_notes_per_measure > 16)
						num_notes_for_swing = class_notes_per_measure;
				
					root.myGrooveUtils.MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, new_snare_array, Kick_Array, MIDI_type, metronomeFrequency, num_notes, num_notes_for_swing, swing_percentage, 4, 4);
				}
			}
			break;
			
		case "none":
		default:
			root.myGrooveUtils.MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, Kick_Array, MIDI_type, metronomeFrequency, num_notes, class_notes_per_measure, swing_percentage, 4, 4);
			
			for(var i=1; i < class_number_of_measures; i++) {
				// reset arrays
				Sticking_Array = class_empty_note_array.slice(0);  // copy by value
				HH_Array = class_empty_note_array.slice(0);  // copy by value
				Snare_Array = class_empty_note_array.slice(0);  // copy by value
				Kick_Array = class_empty_note_array.slice(0);  // copy by value
		
				// get another measure
				getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, class_notes_per_measure*i);
				
				root.myGrooveUtils.MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, Kick_Array, MIDI_type, metronomeFrequency, num_notes, class_notes_per_measure, swing_percentage, 4, 4);
			}
			break;
		}
		
		var midi_url = "data:audio/midi;base64," + btoa(midiFile.toBytes());
		
		
		return midi_url;
	}
	
	root.MIDI_save_as = function() {
		var midi_url = createMidiUrlFromClickableUI("general_MIDI");
		
		// save as 
		document.location = midi_url;
	};

	// creates a grooveData class from the clickable UI elements of the page
	//
	root.grooveDataFromClickableUI = function() {
		var myGrooveData = new root.myGrooveUtils.grooveData();
		
		myGrooveData.notesPerMeasure   = class_notes_per_measure;
		myGrooveData.numberOfMeasures  = class_number_of_measures;
		myGrooveData.showStickings     = isStickingsVisible();
		myGrooveData.title             = document.getElementById("tuneTitle").value;
		myGrooveData.author            = document.getElementById("tuneAuthor").value;
		myGrooveData.comments          = document.getElementById("tuneComments").value;
		myGrooveData.showLegend        = document.getElementById("showLegend").checked;
		myGrooveData.swingPercent      = root.myGrooveUtils.getSwing();
		myGrooveData.tempo             = root.myGrooveUtils.getTempo();
		myGrooveData.kickStemsUp       = true;
		
		for(var i=0; i < class_number_of_measures; i++) {
			var Sticking_Array = class_empty_note_array.slice(0);  // copy by value
			var HH_Array = class_empty_note_array.slice(0);  // copy by value
			var Snare_Array = class_empty_note_array.slice(0);  // copy by value
			var Kick_Array = class_empty_note_array.slice(0);  // copy by value
			
			var num_notes = getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, i*class_notes_per_measure);
			
			if(i == 0) {  // assign
				myGrooveData.sticking_array    =  Sticking_Array;
				myGrooveData.hh_array          =  HH_Array;
				myGrooveData.snare_array       =  Snare_Array;
				myGrooveData.kick_array        =  Kick_Array;
			} else {  // add on toGMTString
				myGrooveData.sticking_array = myGrooveData.sticking_array.concat(Sticking_Array);
				myGrooveData.hh_array = myGrooveData.hh_array.concat(HH_Array);
				myGrooveData.snare_array = myGrooveData.snare_array.concat(Snare_Array);
				myGrooveData.kick_array = myGrooveData.kick_array.concat(Kick_Array);
			}
		}
		
		return myGrooveData;
	};
	
	// called by the HTML when changes happen to forms that require the ABC to update
	root.refresh_ABC = function() {
		create_ABC();
	};
	
		
	// Want to create something like this:
	//
	// {{GrooveTab
	// |HasTempo=90
	// |HasDivision=16
	// |HasMeasures=2
	// |HasNotesPerMeasure=32
	// |HasTimeSignature=4/4
	// |HasHiHatTab=x---o---+---x---x---o---+---x---x---o---+---x---x---o---+---x---
	// |HasSnareAccentTab=--------O-------------------O-----------O---------------O-------
	// |HasSnareOtherTab=--------------g-------------------g-----------g-----------------
	// |HasKickTab=o---------------o---o---------------o-----------o---o---------o-
	// |HasFootOtherTab=----------------------------------------------------------------
	// }}
    //
	root.updateGrooveDBSource = function() {
		if(!document.getElementById("GrooveDB_source"))
			return;   // nothing to update
			
		var myGrooveData = root.grooveDataFromClickableUI();	
		
		var notesPerMeasureInTab = (root.myGrooveUtils.isTripletDivision(myGrooveData.notesPerMeasure, 4, 4) ? 24 : 32);
		var maxNotesInTab = myGrooveData.numberOfMeasures * notesPerMeasureInTab;
		
		var DBString = "{{GrooveTab";
		
		DBString += "\n|HasTempo=" + myGrooveData.tempo;
		DBString += "\n|HasDivision=" + myGrooveData.notesPerMeasure;
		DBString += "\n|HasMeasures=" + myGrooveData.numberOfMeasures;
		DBString += "\n|HasNotesPerMeasure=" + notesPerMeasureInTab;
		DBString += "\n|HasTimeSignature=4/4";
		DBString += "\n|HasHiHatTab=" + root.myGrooveUtils.tabLineFromAbcNoteArray("H", myGrooveData.hh_array, true, true, maxNotesInTab, 0);
		DBString += "\n|HasSnareAccentTab=" + root.myGrooveUtils.tabLineFromAbcNoteArray("S", myGrooveData.snare_array, true, false, maxNotesInTab, 0);
		DBString += "\n|HasSnareOtherTab=" + root.myGrooveUtils.tabLineFromAbcNoteArray("S", myGrooveData.snare_array, false, true, maxNotesInTab, 0);
		DBString += "\n|HasKickTab=" + root.myGrooveUtils.tabLineFromAbcNoteArray("K", myGrooveData.kick_array, true, false, maxNotesInTab, 0);
		DBString += "\n|HasFootOtherTab="  + root.myGrooveUtils.tabLineFromAbcNoteArray("K", myGrooveData.kick_array, false, true, maxNotesInTab, 0);
		
		DBString += "\n}}";
		
		document.getElementById("GrooveDB_source").value = DBString;
	};
	
	root.undoCommand = function() {
		if(class_undo_stack.length > 1) {
			var undoURL = class_undo_stack.pop();
			root.AddItemToUndoOrRedoStack(undoURL, class_redo_stack);  // add to redo stack
			// the one we want to load is behind the head, since all changes go on the undo stack immediately
			// no need to pop, since it would just get added right back on anyways
			undoURL = class_undo_stack[class_undo_stack.length-1];
			set_Default_notes(undoURL);
		}
	};
	
	root.redoCommand = function() {
		if(class_redo_stack.length > 0) {
			var redoURL = class_redo_stack.pop();
			root.AddItemToUndoOrRedoStack(redoURL, class_undo_stack);  // add to undo stack
			set_Default_notes(redoURL);
		}
	};
	
	// debug print the stack
	function debugPrintUndoRedoStack() {
		
		var newHTML = "<h3>Undo Stack</h3><ol>";
		for(var i in class_undo_stack) {
			newHTML += "<li>" + class_undo_stack[i];
		}
		newHTML += "</ol><br>";
		document.getElementById("undoStack").innerHTML = newHTML;
		
		newHTML = "<h3>Redo Stack</h3><ol>";
		for(var i in class_redo_stack) {
			newHTML += "<li>" + class_redo_stack[i];
		}
		newHTML += "</ol><br>";
		document.getElementById("redoStack").innerHTML = newHTML;
	}
	
	// push the new URL on the undo or redo stack
	// keep the stacks at a managable size
	root.AddItemToUndoOrRedoStack = function(newURL, ourStack, noClear) {
		
		if(!ourStack)
			return;
		
		if(newURL == class_undo_stack[class_undo_stack.length-1]) {
			//debugPrintUndoRedoStack();
			return false;   // no change, so don't push
		}
		
		ourStack.push(newURL);
		
		while(ourStack.length > constant_undo_stack_max_size)
			ourStack.shift();
		
		//debugPrintUndoRedoStack();
		
		return true;
	};
	
	root.AddFullURLToUndoStack = function(fullURL) {
		var urlFragment;
		
		var searchData = fullURL.indexOf("?");

		urlFragment = fullURL.slice(searchData);

		// clear redo array whenever we add a new valid element to the stack
		// when we undo, we end up with a null push that returns false here
		if(root.AddItemToUndoOrRedoStack(urlFragment, class_undo_stack)) {
			class_redo_stack = [];   
		}
	}
	
	
	// update the current URL so that reloads and history traversal and link shares and bookmarks work correctly
	root.updateCurrentURL = function() {
		var newURL = get_FullURLForPage();
		var newTitle = false;
		
		root.AddFullURLToUndoStack(newURL);
		
		var title = document.getElementById("tuneTitle").value.trim();
		if(title != "")
			newTitle = title;
			
		var author = document.getElementById("tuneAuthor").value.trim();
		if(author != "") {
			if(title)
				newTitle += " by " + author;
			else	
				newTitle = "Groove by " + author;
		}
		
		if(!newTitle) 
			newTitle = class_app_title;
		
		document.title = newTitle;
		window.history.replaceState(null, newTitle, newURL);
	
	};
	
	// this is called by a bunch of places anytime we modify the musical notes on the page
	// this will recreate the ABC code and will then use the ABC to rerender the sheet music
	// on the page.
	function create_ABC() {
	
		var Sticking_Array = class_empty_note_array.slice(0);  // copy by value
		var HH_Array = class_empty_note_array.slice(0);  // copy by value
		var Snare_Array = class_empty_note_array.slice(0);  // copy by value
		var Kick_Array = class_empty_note_array.slice(0);  // copy by value
		var numSections = get_numSectionsFor_permutation_array();
		var i, new_snare_array, post_abc, num_sections;
		var num_notes = getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, 0);
		
		// abc header boilerplate
		var tuneTitle = document.getElementById("tuneTitle").value;
		var tuneAuthor = document.getElementById("tuneAuthor").value;
		var tuneComments = document.getElementById("tuneComments").value;
		var showLegend = document.getElementById("showLegend").checked;
		var fullABC = "";
		
		switch (class_permutation_type) {
		case "kick_16ths":  // use the hh & snare from the user
			numSections = get_numSectionsFor_permutation_array();
		
			fullABC = root.myGrooveUtils.get_top_ABC_BoilerPlate(class_permutation_type != "none", tuneTitle, tuneAuthor, tuneComments, showLegend, usingTriplets(), false, 4, 4);
			root.myGrooveUtils.note_mapping_array = [];
			
			// compute sections with different kick patterns
			for(i=0; i < numSections; i++) {
				if(shouldDisplayPermutationForSection(i)) {
					var new_kick_array;
					
					if(document.getElementById("PermuationOptionsSkipSomeFirstNotes") && document.getElementById("PermuationOptionsSkipSomeFirstNotes").checked)
						new_kick_array = get_kick16th_permutation_array_minus_some(i);
					else
						new_kick_array = get_kick16th_permutation_array(i);
						
					// grab hi-hat foots from existing kick array and merge it in.
					Kick_Array = filter_kick_array_for_permutation(Kick_Array);
					new_kick_array = merge_kick_arrays(new_kick_array, Kick_Array);

					
					post_abc = get_permutation_post_ABC(i);
									
					fullABC += get_permutation_pre_ABC(i);
					fullABC += root.myGrooveUtils.create_ABC_from_snare_HH_kick_arrays(Sticking_Array, HH_Array, Snare_Array, new_kick_array, post_abc, num_notes, class_notes_per_measure, true, 4, 4);
					root.myGrooveUtils.note_mapping_array = root.myGrooveUtils.note_mapping_array.concat(root.myGrooveUtils.create_note_mapping_array_for_highlighting(HH_Array, Snare_Array, new_kick_array, num_notes));											
				}
			}
			break;
			
		case "snare_16ths":  // use the hh & kick from the user
			numSections = get_numSectionsFor_permutation_array();
		
			fullABC = root.myGrooveUtils.get_top_ABC_BoilerPlate(class_permutation_type != "none", tuneTitle, tuneAuthor, tuneComments, showLegend, usingTriplets(), false, 4, 4);
			root.myGrooveUtils.note_mapping_array = [];

			//compute 16 sections with different snare patterns		
			for(i=0; i < numSections; i++) {
				if(shouldDisplayPermutationForSection(i)) {

					if(document.getElementById("PermuationOptionsAccentGridDiddled") && document.getElementById("PermuationOptionsAccentGridDiddled").checked)
						new_snare_array = get_snare_accent_with_diddle_permutation_array(i);
					else if(document.getElementById("PermuationOptionsAccentGrid") && document.getElementById("PermuationOptionsAccentGrid").checked)
						new_snare_array = get_snare_accent_permutation_array(i);
					else
						new_snare_array = get_snare_permutation_array(i);
					
					post_abc = get_permutation_post_ABC(i);
					
					fullABC += get_permutation_pre_ABC(i);
					fullABC += root.myGrooveUtils.create_ABC_from_snare_HH_kick_arrays(Sticking_Array, HH_Array, new_snare_array, Kick_Array, post_abc, num_notes, class_notes_per_measure, true, 4, 4);
					root.myGrooveUtils.note_mapping_array = root.myGrooveUtils.note_mapping_array.concat(root.myGrooveUtils.create_note_mapping_array_for_highlighting(HH_Array, Snare_Array, new_kick_array, num_notes));											
				}	
			}
			break;
			
		case "none":
		default:
			fullABC = root.myGrooveUtils.get_top_ABC_BoilerPlate(class_permutation_type != "none", tuneTitle, tuneAuthor, tuneComments, showLegend, usingTriplets(), true, 4, 4);
			root.myGrooveUtils.note_mapping_array = [];
			
			var addon_abc;
			
			for(var i=0; i < class_number_of_measures; i++) {
				// reset arrays
				Sticking_Array = class_empty_note_array.slice(0);  // copy by value
				HH_Array = class_empty_note_array.slice(0);  // copy by value
				Snare_Array = class_empty_note_array.slice(0);  // copy by value
				Kick_Array = class_empty_note_array.slice(0);  // copy by value
		
				// retrieving 1st measure for the second time from above.   Slightly bad efficiency, but cleaner code  :)
				getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, class_notes_per_measure*i);
				
				if(i == class_number_of_measures-1) { 
					// last measure
					addon_abc = "|\n";
				} else if(i % 2 == 0) {
					// even measure
					addon_abc = "\\\n";
				} else {
					// odd measure
					addon_abc = "\n";
				}
				fullABC += root.myGrooveUtils.create_ABC_from_snare_HH_kick_arrays(Sticking_Array, HH_Array, Snare_Array, Kick_Array, addon_abc, num_notes, class_notes_per_measure, true, 4, 4);
				root.myGrooveUtils.note_mapping_array = root.myGrooveUtils.note_mapping_array.concat(root.myGrooveUtils.create_note_mapping_array_for_highlighting(HH_Array, Snare_Array, new_kick_array, num_notes));											
			}
			
			break;
		}
		
		document.getElementById("ABCsource").value = fullABC;
		root.updateGrooveDBSource();

		root.myGrooveUtils.midiNoteHasChanged(); // pretty likely the case
		
		// update the current URL so that reloads and history traversal and link shares and bookmarks work correctly
		root.updateCurrentURL();
		
		root.displayNewSVG();
	}
	
	
	// called by create_ABC to remake the sheet music on the page
	root.displayNewSVG = function() {
		var	svgTarget = document.getElementById("svgTarget"),
			diverr = document.getElementById("diverr");
		
		var abc_source = document.getElementById("ABCsource").value;
		var svg_return = root.myGrooveUtils.renderABCtoSVG(abc_source);
		
		diverr.innerHTML = svg_return.error_html;
		svgTarget.innerHTML = svg_return.svg;
			
	};
	
	
	function showHideNonPrintableAreas(showElseHide) {
		var myElements = document.querySelectorAll(".nonPrintable");

		for (var i = 0; i < myElements.length; i++) {
			var divBlock = myElements[i];
			divBlock.style.display = showElseHide ? "block" : "none";
		}
		
	}
	
	root.ShowHideABCResults = function() {
		var ABCResults = document.getElementById("ABC_Results");
		
		
		if(ABCResults.style.display == "block")
			ABCResults.style.display = "none";
		else
			ABCResults.style.display = "block";
						
		return false;  // don't follow the link
	};

	// remove a measure from the page
	// measureNum is indexed starting at 1, not 0
	root.closeMeasureButtonClick = function(measureNum) {
		var uiStickings="";
		var uiHH="";
		var uiSnare="";
		var uiKick=""; 
		
		// get the encoded notes out of the UI.
		// run through all the measure, but don't include the one that we are deleting
		var topIndex = class_notes_per_measure*class_number_of_measures;
		for(var i=0; i < topIndex; i++) {
			
			// skip the range we are deleting
			if(i < (measureNum-1)*class_notes_per_measure || i >= measureNum*class_notes_per_measure) {
				uiStickings += get_sticking_state(i, "URL"); 
				uiHH += get_hh_state(i, "URL"); 
				uiSnare += get_snare_state(i, "URL");
				uiKick += get_kick_state(i, "URL");
			}
		}
		
		class_number_of_measures--;
		
		root.expandAuthoringViewWhenNecessary(class_notes_per_measure, class_number_of_measures);

		changeDivisionWithNotes(class_notes_per_measure, uiStickings, uiHH, uiSnare, uiKick);
		
		create_ABC();
	};
	
	// add a measure to the page
	// currently always at the end of the measures
	// copy the notes from the last measure to the new measure
	root.addMeasureButtonClick = function(event) {
		var uiStickings="";
		var uiHH="";
		var uiSnare="";
		var uiKick=""; 
		var i;
		
		// get the encoded notes out of the UI.
		var topIndex = class_notes_per_measure*class_number_of_measures;
		for(i=0; i < topIndex; i++) {
			
			uiStickings += get_sticking_state(i, "URL"); 
			uiHH += get_hh_state(i, "URL"); 
			uiSnare += get_snare_state(i, "URL");
			uiKick += get_kick_state(i, "URL");
		}
		
		// run the the last measure twice to default in some notes
		for(i=topIndex-class_notes_per_measure; i < topIndex; i++) {
			uiStickings += get_sticking_state(i, "URL"); 
			uiHH += get_hh_state(i, "URL"); 
			uiSnare += get_snare_state(i, "URL");
			uiKick += get_kick_state(i, "URL");
		}
		
		class_number_of_measures++;
		
		root.expandAuthoringViewWhenNecessary(class_notes_per_measure, class_number_of_measures);

		changeDivisionWithNotes(class_notes_per_measure, uiStickings, uiHH, uiSnare, uiKick);
		
		create_ABC();
	};
	
	function showHideCSS_ClassDisplay(className, force, showElseHide, showState) {
		var myElements = document.querySelectorAll(className);
		var newStateIsOn = true;
		
		for (var i = 0; i < myElements.length; i++) {
			var element = myElements[i];
	
			if(force) {
				newStateIsOn = showElseHide;
			} else {
				// no-force means to swap on each call
				if(element.style.display == showState)
					newStateIsOn = false;
				else 
					newStateIsOn = true;
			}
			
			if(newStateIsOn)
				element.style.display = showState;
			else
				element.style.display = "none";
		}
		
		return newStateIsOn;
	}
	
	function showHideCSS_ClassVisibility(className, force, showElseHide) {
		var myElements = document.querySelectorAll(className);
		for (var i = 0; i < myElements.length; i++) {
			var stickings = myElements[i];
	
			if(force) {
				if(showElseHide)
					stickings.style.visibility = "visible";
				else
					stickings.style.visibility = "hidden";
			} else {
				// no-force means to swap on each call
				if(stickings.style.visibility == "visible")
					stickings.style.visibility = "hidden";
				else 
					stickings.style.visibility = "visible";
				
			}
		}
	}
	
	function isStickingsVisible() {
		var myElements = document.querySelectorAll(".stickings-container");
		for (var i = 0; i < myElements.length; i++) {
			if(myElements[i].style.display == "block")
				return true;
		}
		
		return false;
	}
	
	root.showHideStickings = function(force, showElseHide, dontRefreshScreen) {
	
		var OnElseOff = showHideCSS_ClassDisplay(".stickings-container", force, showElseHide, "block");
		showHideCSS_ClassDisplay(".stickings-label", force, showElseHide, "block");
		var stickingsButton = document.getElementById("showHideStickingsButton");
		if(stickingsButton) {
			if(OnElseOff)
				stickingsButton.className += " ClickToHide";
			else
				stickingsButton.className = stickingsButton.className.replace(" ClickToHide","");
		}
		
		if(!dontRefreshScreen)
			create_ABC();
		
		return false;  // don't follow the link
	};
	
	root.printMusic = function() {
		var oldMethod = isFirefox();
		
		if(oldMethod) {
			// hide everything but the music and force a print
			// doesn't work for browsers that don't have a blocking print call. (iOS)
			showHideNonPrintableAreas(false);	
			var style = window.getComputedStyle(document.body);
			var oldColor = style.backgroundColor;
			document.body.style.backgroundColor = "#FFF";
			
			var svgTargetDiv = document.getElementById("svgTarget");
			style = window.getComputedStyle(svgTargetDiv);
			var oldBoxShadow = style.boxShadow;
		
			svgTargetDiv.style.boxShadow = "none";
			
			window.print();
			
			// reset
			document.body.style.backgroundColor = oldColor;
			svgTargetDiv.style.boxShadow = oldBoxShadow;
			
			showHideNonPrintableAreas(true);
		} else {
			// open a new window just for printing
			var win = window.open("", class_app_title + " Print");
			win.document.body.innerHTML = "<title>" + class_app_title + "</title>\n";
			win.document.body.innerHTML += document.getElementById("svgTarget").innerHTML;
			win.print();
		}
		
	};

	root.setupWriterHotKeys = function() {
		
					
		document.addEventListener("keydown", function(e){
			
			// only accept the event if it not going to an INPUT field	
			if(e.target.tagName != "TEXTAREA") {
				switch(e.which) {
				case 90:   // ctrl-z
					if(e.ctrlKey) {
						// ctrl-z
						root.undoCommand();
						return false;
					}
					break;
					
				case 89:  // ctrl-y
					if(e.ctrlKey) {
						// ctrl-y
						root.redoCommand();
						return false;
					}
					break;
					
				case 37:  // left arrow
					// left arrow
					root.myGrooveUtils.downTempo();
					return false;
					break;
					
				case 39:  // right arrow
					// right arrow
					root.myGrooveUtils.upTempo();
					return false;
					break;
					
				default:
					/* DEBUG
					else if(e.ctrlKey && e.which !=17 && e.target.type != "text") {
						alert("Key is: " + e.which);
					}
					*/
					break;
				}
			}
		});
		return true;  // let the default handler deal with the keypress
	}
		
	// public function.
	// This function initializes the data for the groove Scribe web page
	root.runsOnPageLoad = function() {
		
		// setup for URL shortener
		gapi.client.setApiKey('AIzaSyBnjOal_AHASONxMQSZPk6E5w9M04CGLcA'); 
		gapi.client.load('urlshortener', 'v1',function(){});
		
		root.setupWriterHotKeys(); // there are other hot keys in GrooveUtils for the midi player
		
		root.setMetronomeButton(0);
		
		setupPermutationMenu();
						
		// set the background and text color of the current subdivision
		selectButton(document.getElementById(class_notes_per_measure + "ths"));
		
		// add html for the midi player
		root.myGrooveUtils.AddMidiPlayerToPage("midiPlayer");
		
		// load the groove from the URL data if it was passed in.
		set_Default_notes(window.location.search);
		
		
		root.myGrooveUtils.midiEventCallbacks.loadMidiDataEvent = function(myroot, playStarting) { 
			var midiURL;
			
			if(playStarting && class_permutation_type != "none" && 
				(document.getElementById("PermuationOptionsCountIn") &&
				 document.getElementById("PermuationOptionsCountIn").checked)) {
				
				midiURL = root.myGrooveUtils.MIDI_build_midi_url_count_in_track();
				root.myGrooveUtils.midiNoteHasChanged();  // this track is temporary
				
			} else {
				midiURL = createMidiUrlFromClickableUI("our_MIDI");
				root.myGrooveUtils.midiResetNoteHasChanged();
			}
			root.myGrooveUtils.loadMIDIFromURL(midiURL);
			root.updateGrooveDBSource();
		};
		
		root.myGrooveUtils.midiEventCallbacks.notePlaying = function(myroot, note_type, percent_complete) {
			if(note_type == "complete" && class_metronome_auto_speed_up_active) {
				// reload with new tempo
				root.myGrooveUtils.midiNoteHasChanged();
				root.metronomeAutoSpeedUpTempoUpdate();
			}
		
			hilight_note(note_type, percent_complete);
		};
		
		
		root.myGrooveUtils.oneTimeInitializeMidi();
		
		// enable or disable swing
		root.myGrooveUtils.swingEnabled( root.myGrooveUtils.doesDivisionSupportSwing(class_notes_per_measure) );
	};
	
	// called right before the midi reloads for the next replay
	// set the new tempo based on the delta required for the time interval
	var class_our_midi_start_time = null;
	var class_our_last_midi_tempo_increase_time = null;
	var class_our_last_midi_tempo_increase_remainder = 0;
	root.metronomeAutoSpeedUpTempoUpdate = function() {
		
		var tempoIncreaseAmount = 1;
		if(document.getElementById("tempoIncreaseAmount"))
			tempoIncreaseAmount = document.getElementById("tempoIncreaseAmount").value;
		var tempoIncreaseInterval = 60;
		if(document.getElementById("tempoIncreaseInterval"))
			tempoIncreaseInterval = document.getElementById("tempoIncreaseInterval").value;
			
		var midiStartTime = root.myGrooveUtils.getMidiStartTime();
		if(class_our_midi_start_time != midiStartTime) {
			class_our_midi_start_time = midiStartTime;
			class_our_last_midi_tempo_increase_remainder = 0;
			class_our_last_midi_tempo_increase_time = new Date(0);
		}
		var totalMidiPlayTime = root.myGrooveUtils.getMidiPlayTime();
		var timeDiffMilliseconds = totalMidiPlayTime.getTime() - class_our_last_midi_tempo_increase_time.getTime();
		var tempoDiff = (tempoIncreaseAmount) * (timeDiffMilliseconds/(tempoIncreaseInterval*1000))
		
		// round the number down, but keep track of the remainder so we carry it forward.   Otherwise
		// rounding errors cause us to be way off.
		tempoDiff += class_our_last_midi_tempo_increase_remainder;
		var tempoDiffSeconds = Math.floor(tempoDiff);
		class_our_last_midi_tempo_increase_remainder = tempoDiff - tempoDiffSeconds;
		
		class_our_last_midi_tempo_increase_time = totalMidiPlayTime;
		
		if(tempoDiffSeconds > 0) 
			root.myGrooveUtils.setTempo(root.myGrooveUtils.getTempo() + tempoDiffSeconds);
	}
				
				
	// takes a string of notes encoded in a serialized string and sets the notes on or off
	// uses drum tab format adapted from wikipedia: http://en.wikipedia.org/wiki/Drum_tablature
	//
	//
	//  HiHat support:   
	//     	x: normal
	//     	X: accent
	//     	o: open
	//		+: close
	//     	c: crash
	//      r: ride
	//     	-: off
	//
	//   Snare support:
	//     	o: normal
	//     	O: accent
	//      f: flam
	//     	g: ghost
	//      x: cross stick
	//     	-: off
	//  
	//   Kick support:
	//     	o: normal
	//     	x: hi hat splash with foot
	//     	X: kick & hi hat splash with foot simultaneously
	//
	//  Note that "|" and " " will be skipped so that standard drum tabs can be applied
	//  Example:
	//     H=|x---x---x---x---|x---x---x---x---|x---x---x---x---|
	// or  H=x-x-x-x-x-x-x-x-x-x-x-x-
	//     S=|----o-------o---|----o-------o---|----o-------o---|
	// or  S=--o---o---o---o---o---o-
	//     B=|o-------o-------|o-------o-o-----|o-----o-o-------|
	// or  B=o---o---o----oo-o--oo---|
	//
	function setNotesFromURLData(drumType, noteString, numberOfMeasures)  {
		var setFunction;
		
		if(drumType == "Stickings") {
			setFunction = set_sticking_state;
		} else if(drumType == "H") {
			setFunction = set_hh_state;
		} else if(drumType == "S") {
			setFunction = set_snare_state;
		} else if(drumType == "K") {
			setFunction = set_kick_state;
		}
		
		// decode the %7C url encoding types
		noteString = decodeURIComponent(noteString);
		
		// ignore ":" and "|" by removing them
		var notes = noteString.replace(/:|\|/g, '');
	
		
		
		// multiple measures of "how_many_notes"
		var notesOnScreen = class_notes_per_measure * numberOfMeasures;
		
		var noteStringScaler = 1;
		var displayScaler = 1;
		if(notes.length > notesOnScreen && notes.length/notesOnScreen >= 2) {
			// if we encounter a 16th note groove for an 8th note board, let's scale it	down	
			noteStringScaler = Math.ceil(notes.length/notesOnScreen);
		} else if(notes.length < notesOnScreen && notesOnScreen/notes.length >= 2) {
			// if we encounter a 8th note groove for an 16th note board, let's scale it up
			displayScaler = Math.ceil(notesOnScreen/notes.length);
		} 

			
		//  DisplayIndex is the index into the notes on the HTML page  starts at 1/32\n%%flatbeams
		var displayIndex = 0;
		var topDisplay = class_notes_per_measure*class_number_of_measures;
		for(var i=0; i < notes.length && displayIndex < topDisplay; i += noteStringScaler, displayIndex += displayScaler) {
		
			switch(notes[i]) {
			case "c":
				setFunction(displayIndex, "crash");
				break;
			case "g":
				setFunction(displayIndex, "ghost");
				break;
			case "f":
				setFunction(displayIndex, "flam");
				break;
			case "l":
			case "L":
				if(drumType == "Stickings")
					setFunction(displayIndex, "left");
			break;
			case "O":
				setFunction(displayIndex, "accent");
				break;
			case "o":
				if(drumType == "H")
					setFunction(displayIndex, "open");
				else
					setFunction(displayIndex, "normal");
				break;
			case "r":
			case "R":
				if(drumType == "H")
					setFunction(displayIndex, "ride");
				else if(drumType == "Stickings")
					setFunction(displayIndex, "right");
				break;
			case "x":
				if(drumType == "S")
					setFunction(displayIndex, "xstick");
				else if(drumType == "K")
					setFunction(displayIndex, "splash");
				else
					setFunction(displayIndex, "normal");
				break;
			case "X":
				if(drumType == "K")
					setFunction(displayIndex, "kick_and_splash");
				else	
					setFunction(displayIndex, "accent");
				break;
			case "+":
				setFunction(displayIndex, "close");
				break;
			case "-":
				setFunction(displayIndex, "off");
				break;
			default:
				alert("Bad note in setNotesFromURLData: " + notes[i]);
				break;
			}	
		}
	}
	
	function setNotesFromABCArray(drumType, abcArray, numberOfMeasures)  {
		var setFunction;
		
		// multiple measures of "how_many_notes"
		var notesOnScreen = class_notes_per_measure * numberOfMeasures;
		
		var noteStringScaler = 1;
		var displayScaler = 1;
		if(abcArray.length > notesOnScreen && abcArray.length/notesOnScreen >= 2) {
			// if we encounter a 16th note groove for an 8th note board, let's scale it	down	
			noteStringScaler = Math.ceil(abcArray.length/notesOnScreen);
		} else if(abcArray.length < notesOnScreen && notesOnScreen/notes.length >= 2) {
			// if we encounter a 8th note groove for an 16th note board, let's scale it up
			displayScaler = Math.ceil(notesOnScreen/notes.length);
		} 
		
		if(drumType == "Stickings") {
			setFunction = set_sticking_state;
		} else if(drumType == "H") {
			setFunction = set_hh_state;
		} else if(drumType == "S") {
			setFunction = set_snare_state;
		} else if(drumType == "K") {
			setFunction = set_kick_state;
		}
	
		//  DisplayIndex is the index into the notes on the HTML page  starts at 1/32\n%%flatbeams
		var displayIndex = 0;
		var topDisplay = class_notes_per_measure*class_number_of_measures;
		for(var i=0; i < abcArray.length && displayIndex < topDisplay; i += noteStringScaler, displayIndex += displayScaler) {
		
			switch(abcArray[i]) {
			case constant_ABC_STICK_R:
				setFunction(displayIndex, "right");
				break;
			case constant_ABC_STICK_L:
				setFunction(displayIndex, "left");
				break;
			case constant_ABC_STICK_OFF:
				setFunction(displayIndex, "off");
				break;
			case constant_ABC_HH_Ride: 
				setFunction(displayIndex, "ride");
				break;
			case constant_ABC_HH_Crash:   
				setFunction(displayIndex, "crash");
				break;
			case constant_ABC_HH_Open: 
				setFunction(displayIndex, "open");
				break;
			case constant_ABC_HH_Close:  
				setFunction(displayIndex, "close");
				break;
			case constant_ABC_HH_Accent: 
				setFunction(displayIndex, "accent");
				break;
			case constant_ABC_HH_Normal:
				setFunction(displayIndex, "normal");
				break;
			case constant_ABC_SN_Ghost:
				setFunction(displayIndex, "ghost");
				break;
			case constant_ABC_SN_Accent:
				setFunction(displayIndex, "accent");
				break;
			case constant_ABC_SN_Normal:
				setFunction(displayIndex, "normal");
				break;
			case constant_ABC_SN_Flam:
				setFunction(displayIndex, "flam");
				break;
			case constant_ABC_SN_XStick:
				setFunction(displayIndex, "xstick");
				break;
			case constant_ABC_KI_SandK:
				setFunction(displayIndex, "kick_and_splash");
				break;
			case constant_ABC_KI_Splash:
				setFunction(displayIndex, "splash");
				break;
			case constant_ABC_KI_Normal:
				setFunction(displayIndex, "normal");
				break;
			case false:
				setFunction(displayIndex, "off");
				break;
			default:
				alert("Bad note in setNotesFromABCArray: " + abcArray[i]);
				break;
			}	
		}
	}
	
	// get a really long URL that encodes all of the notes and the rest of the state of the page.
	// this will allow us to bookmark or reference a groove and handle undo/redo.
	//
	function get_FullURLForPage() {
	
		var fullURL = window.location.protocol + "//" + window.location.host + window.location.pathname;
		
		if(root.myGrooveUtils.debugMode)
			fullURL = "?Debug=1&";
		else
			fullURL = "?";

		// static for now, time signature
		fullURL += "TimeSig=4/4";
			
		// # of notes
		fullURL += "&Div=" + class_notes_per_measure;
		
		var title = document.getElementById("tuneTitle").value.trim();
		if(title != "")
			fullURL += "&Title=" + encodeURIComponent(title);
			
		var author = document.getElementById("tuneAuthor").value.trim();
		if(author != "")
			fullURL += "&Author=" + encodeURIComponent(author);
		
		var comments = document.getElementById("tuneComments").value.trim();
		if(comments != "")
			fullURL += "&Comments=" + encodeURIComponent(comments);
		
		fullURL += "&Tempo=" + root.myGrooveUtils.getTempo();
		
		if(root.myGrooveUtils.getSwing() > 0)
			fullURL += "&Swing=" + root.myGrooveUtils.getSwing();
		
		// # of measures
		fullURL += "&Measures=" + class_number_of_measures;
		
		// notes
		var HH = "&H=|";
		var Snare = "&S=|";
		var Kick = "&K=|";
		var Stickings = "&Stickings=|";
		
		// run through both measures.
		var topIndex = class_notes_per_measure*class_number_of_measures;
		for(var i=0; i < topIndex; i++) {
			Stickings += get_sticking_state(i, "URL"); 
			HH += get_hh_state(i, "URL"); 
			Snare += get_snare_state(i, "URL");
			Kick += get_kick_state(i, "URL");
		
			if(((i+1) % class_notes_per_measure) == 0) {
				Stickings += "|";
				HH += "|";
				Snare += "|";
				Kick += "|";
			}
		}
		
		fullURL += HH + Snare + Kick;
		
		// only add if we need them.  // they are long and ugly. :)
		if(isStickingsVisible())
			fullURL += Stickings;
		
		return fullURL;
	}
	
	root.show_MetronomeAutoSpeedupConfiguration = function() {
		var popup = document.getElementById("metronomeAutoSpeedupConfiguration");
		
		if(popup) {
						
			popup.style.display = "block";	
		}
	};
	
	root.close_MetronomeAutoSpeedupConfiguration = function(type) {
		var popup = document.getElementById("metronomeAutoSpeedupConfiguration");
		
		if(popup) 
			popup.style.display = "none";
			
		if(type == "OK") {
		
		} else {
		
		}
	};
	
	root.updateRangeLabel = function(event, idToUpdate) {
		var element = document.getElementById(idToUpdate);
		
		if(element) {
			element.innerHTML = event.currentTarget.value;
		}
	};
	
	root.show_FullURLPopup = function() {
		var popup = document.getElementById("fullURLPopup");
				
		var ShareButton = new Share("#shareButton", {
		  networks: {
			facebook: {
				before: function() {
					this.url = document.getElementById("fullURLTextField").value;
					this.description = "Check out this groove.";
				},
			  app_id: "839699029418014"
			},
			google_plus: {
				before: function() {
					this.url = encodeURIComponent(document.getElementById("fullURLTextField").value);
					this.description = "Check out this groove.";
				}
			},
			twitter: {
				before: function() {
					this.url = encodeURIComponent(document.getElementById("fullURLTextField").value);
					this.description = "Check out this groove. %0A%0A " + encodeURIComponent(document.getElementById("fullURLTextField").value);
				}
			},
			pinterest: {
				enabled: false
			},
			email: {
				before: function() {
					this.url = document.getElementById("fullURLTextField").value;
					this.description = "Check out this groove. %0A%0A " + encodeURIComponent(document.getElementById("fullURLTextField").value);
				},
				after: function() {
					console.log("User shared:", this.url);
				}
			}
		  }
		});
				
		if(popup) {
			var fullURL = get_FullURLForPage();
			var textField = document.getElementById("fullURLTextField");
			textField.value = fullURL;
			
			popup.style.display = "block";
			
			// select the URL for copy/paste
			textField.focus();
			textField.select();
			
			// fill in link at bottom
			document.getElementById("fullURLLink").href = fullURL;
		}
	};
	
	root.close_FullURLPopup = function() {
		var popup = document.getElementById("fullURLPopup");
				
		if(popup) 
			popup.style.display = "none";
	};
	
	function get_ShortendURL(fullURL, cssIdOfTextFieldToFill) {
	
		if(gapi.client.urlshortener) {
			var request = gapi.client.urlshortener.url.insert({
				'resource': {
				  'longUrl': fullURL
				}
			});
			request.execute(function(response) {      
				if((response.id != null)){
					var textField = document.getElementById(cssIdOfTextFieldToFill);
					textField.value = response.id;
				
					// select the URL for copy/paste
					textField.focus();
					textField.select();
				}
			});
		} else {
			alert("Error: URL Shortener API is not loaded");
		}
		
	}
	
	root.shortenerCheckboxChanged = function () {
		if(document.getElementById("shortenerCheckbox").checked)
			get_ShortendURL(get_FullURLForPage(), 'fullURLTextField');
		else	
			show_FullURLPopup();
	};
	
	function set_Default_notes(encodedURLData) {
		var Division;
		var Stickings;
		var HH;
		var Snare;
		var Kick;
		var stickings_set_from_URL = false;
		
		var myGrooveData = root.myGrooveUtils.getGrooveDataFromUrlString(encodedURLData);
		
		if(myGrooveData.notesPerMeasure != class_notes_per_measure || class_number_of_measures != myGrooveData.numberOfMeasures) {
			class_number_of_measures = myGrooveData.numberOfMeasures;
			changeDivisionWithNotes(myGrooveData.notesPerMeasure);
		} 
		
		root.expandAuthoringViewWhenNecessary(class_notes_per_measure, class_number_of_measures);
		
		setNotesFromABCArray("Stickings", myGrooveData.sticking_array, class_number_of_measures);
		setNotesFromABCArray("H", myGrooveData.hh_array, class_number_of_measures);
		setNotesFromABCArray("S", myGrooveData.snare_array, class_number_of_measures);
		setNotesFromABCArray("K", myGrooveData.kick_array, class_number_of_measures);
		
		if(myGrooveData.showStickings) 
			root.showHideStickings(true, true, true);
		
		document.getElementById("tuneTitle").value = myGrooveData.title;
						
		document.getElementById("tuneAuthor").value = myGrooveData.author;
		
		document.getElementById("tuneComments").value = myGrooveData.comments;
		
		root.myGrooveUtils.setTempo(myGrooveData.tempo);
		
		root.myGrooveUtils.swingUpdate(myGrooveData.swingPercent);
		
		create_ABC();
	}
	
	root.loadNewGroove = function(encodedURLData)  {
		set_Default_notes(encodedURLData);
	};
	
	function getABCDataWithLineEndings() {
		var myABC = document.getElementById("ABCsource").value;

		// add proper line endings for windows
		myABC = myABC.replace(/\r?\n/g, "\r\n");
		
		return myABC;
	}
		
	root.saveABCtoFile = function() {
		myABC = getABCDataWithLineEndings();
		
		myURL = 'data:text/plain;charset=utf-8;base64,' + btoa(myABC);
		
		alert("Use \"Save As\" to save the new page to a local file");
		window.open(myURL);
		
	};
	
	// change the base division to something else.
	// eg  16th to 8ths or   32nds to 8th note triplets
	// need to re-layout the html notes, change any globals and then reinitialize
	function changeDivisionWithNotes (newDivision, Stickings, HH, Snare, Kick) {
		var oldDivision = class_notes_per_measure;
		var wasStickingsVisable = isStickingsVisible();
		class_notes_per_measure = newDivision;
		
		var newHTML = "";
		for(var cur_measure=1; cur_measure <= class_number_of_measures; cur_measure++) {
			newHTML += root.HTMLforStaffContainer(cur_measure, (cur_measure-1)*class_notes_per_measure);
		}
		
		// rewrite the HTML for the HTML note grid
		document.getElementById("measureContainer").innerHTML = newHTML;
		
		// change the Permutation options too
		newHTML = root.HTMLforPermutationOptions();
		document.getElementById("PermutationOptions").innerHTML = newHTML;
		
		if(wasStickingsVisable)
			root.showHideStickings(true, true, true);
		
		// now set the right notes on and off
		if(Stickings && HH && Snare && Kick) {
			setNotesFromURLData("Stickings", Stickings, class_number_of_measures);
			setNotesFromURLData("H", HH, class_number_of_measures);
			setNotesFromURLData("S", Snare, class_number_of_measures);
			setNotesFromURLData("K", Kick, class_number_of_measures);
		}
		
		// un-highlight the old div 
		unselectButton(document.getElementById(oldDivision + "ths"));
		
		// highlight the new div
		selectButton(document.getElementById(class_notes_per_measure + "ths"));
		
		// if the permutation menu is not "none" this will change the layout
		// otherwise it should do nothing
		setupPermutationMenu();
		
		// enable or disable swing
		root.myGrooveUtils.swingEnabled( root.myGrooveUtils.doesDivisionSupportSwing(newDivision) );
		// update the swing output display
		root.myGrooveUtils.swingUpdate();
	}
	
	
	root.expandAuthoringViewWhenNecessary = function(numNotesPerMeasure, numberOfMeasures) {
		var musicalInput = document.getElementById("musicalInput");
		
		// set the size of the musicalInput authoring element based on the number of notes
		if(numNotesPerMeasure > 16 || 
			(numNotesPerMeasure > 4 && class_number_of_measures > 1) || 
			(class_number_of_measures > 2)) {
			if(musicalInput)
				musicalInput.className += " expanded";
		} else {
			if(musicalInput)
				musicalInput.className = musicalInput.className.replace(new RegExp(' expanded', 'g'), "");
		}
	};
	
	// change the base division to something else.
	// eg  16th to 8ths or   32nds to 8th note triplets
	// need to re-layout the html notes, change any globals and then reinitialize
	root.changeDivision = function(newDivision) {
		var uiStickings="|";
		var uiHH="|";
		var uiSnare="|";
		var uiKick="|";
		
		if(!root.myGrooveUtils.isTripletDivision(class_notes_per_measure, 4, 4) && !root.myGrooveUtils.isTripletDivision(newDivision)) {
			// get the encoded notes out of the UI.
			// run through both measures.
			var topIndex = class_notes_per_measure*class_number_of_measures;
			for(var i=0; i < topIndex; i++) {
				uiStickings += get_sticking_state(i, "URL"); 
				uiHH += get_hh_state(i, "URL"); 
				uiSnare += get_snare_state(i, "URL");
				uiKick += get_kick_state(i, "URL");
			}
			
			// override the hi-hat if we are going to a higher division.
			// otherwise the notes get lost in translation (not enough)
			if(newDivision > class_notes_per_measure)
				uiHH = root.myGrooveUtils.GetDefaultHHGroove(newDivision, class_number_of_measures);
		} else {
			// changing from or changing to a triplet division
			// triplets don't scale well, so use defaults when we change
			uiStickings = root.myGrooveUtils.GetDefaultStickingsGroove(newDivision, class_number_of_measures);
			uiHH = root.myGrooveUtils.GetDefaultHHGroove(newDivision, class_number_of_measures);
			uiSnare = root.myGrooveUtils.GetDefaultSnareGroove(newDivision, class_number_of_measures);
			uiKick = root.myGrooveUtils.GetDefaultKickGroove(newDivision, class_number_of_measures);
			
			// reset the metronome click, since it has different options
			root.resetMetronomeOptionsMenuOffsetClick();
		}
		
		root.expandAuthoringViewWhenNecessary(newDivision, class_number_of_measures);

		changeDivisionWithNotes(newDivision, uiStickings, uiHH, uiSnare, uiKick);
		
		create_ABC();
	};
		
	// public function
	// function to create HTML for the music staff and notes.   We usually want more than one of these
	// baseIndex is the index for the css labels "staff-container1, staff-container2"
	// indexStartForNotes is the index for the note ids.  
	root.HTMLforStaffContainer = function(baseindex, indexStartForNotes) {
		var newHTML = ('\
			<div class="staff-container" id="staff-container' + baseindex + '">\
				<div class="stickings-row-container">\
					<div class="line-labels">\
						<div class="stickings-label" onClick="myGrooveWriter.noteLabelClick(event, \'stickings\', ' + baseindex + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteLabelClick(event, \'stickings\', ' + baseindex + ')">STICKINGS</div>\
					</div>\
					<div class="music-line-container">\
						\
						<div class="notes-container">');
						
						newHTML += ('\
							<div class="stickings-container">\
								<div class="opening_note_space"> </div>');
								for(var i = indexStartForNotes; i < class_notes_per_measure+indexStartForNotes; i++) {
								
									newHTML += ('\
										<div id="sticking' + i + '" class="sticking">\
											<div class="sticking_right"  id="sticking_right' + i + '"  onClick="myGrooveWriter.noteLeftClick(event, \'sticking\', ' + i + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteRightClick(event, \'sticking\', ' + i + ') onmouseenter="myGrooveWriter.noteOnMouseEnter(event, \'sticking\'">R</div>\
											<div class="sticking_left"  id="sticking_left' + i + '"  onClick="myGrooveWriter.noteLeftClick(event, \'sticking\', ' + i + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteRightClick(event, \'sticking\', ' + i + ')", ' + i + ')">L</div>\
										</div>\
									');
									
									// add space between notes, exept on the last note
									if((i-(indexStartForNotes-1)) % root.myGrooveUtils.noteGroupingSize(class_notes_per_measure, 4, 4) == 0 && i < class_notes_per_measure+indexStartForNotes-1) {
										newHTML += ('<div class="space_between_note_groups"> </div> ');
									}
								}
							newHTML += ('<div class="end_note_space"></div>\n</div>');
						
						newHTML += ('\
						</div>\
					</div>\
				</div>');
				
		newHTML += ('\
				<span class="notes-row-container">\
					<div class="line-labels">\
						<div class="hh-label" onClick="myGrooveWriter.noteLabelClick(event, \'hh\', ' + baseindex + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteLabelClick(event, \'hh\', ' + baseindex + ')">Hi-hat</div>\
						<div class="snare-label" onClick="myGrooveWriter.noteLabelClick(event, \'snare\', ' + baseindex + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteLabelClick(event, \'snare\', ' + baseindex + ')">Snare</div>\
						<div class="kick-label" onClick="myGrooveWriter.noteLabelClick(event, \'kick\', ' + baseindex + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteLabelClick(event, \'kick\', ' + baseindex + ')">Kick</div>\
					</div>\
					<div class="music-line-container">\
						\
						<div class="notes-container">\
						<div class="staff-line-1"></div>\
						<div class="staff-line-2"></div>\
						<div class="staff-line-3"></div>\
						<div class="staff-line-4"></div>\
						<div class="staff-line-5"></div>');

						
						newHTML += ('\
							<div class="hi-hat-container">\
								<div class="opening_note_space"> </div>');
								for(i = indexStartForNotes; i < class_notes_per_measure+indexStartForNotes; i++) {
								
									newHTML += ('\
										<div id="hi-hat' + i + '" class="hi-hat" onClick="myGrooveWriter.noteLeftClick(event, \'hh\', ' + i + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteRightClick(event, \'hh\', ' + i + ')" onmouseenter="myGrooveWriter.noteOnMouseEnter(event, \'hh\', ' + i + ')">\
											<div class="hh_crash"  id="hh_crash'  + i + '"><i class="fa fa-asterisk"></i></div>\
											<div class="hh_ride"   id="hh_ride'   + i + '">R</div>\
											<div class="hh_cross"  id="hh_cross'  + i + '"><i class="fa fa-times"></i></div>\
											<div class="hh_open"   id="hh_open'   + i + '"><i class="fa fa-circle-o"></i></div>\
											<div class="hh_close"  id="hh_close'  + i + '"><i class="fa fa-plus"></i></div>\
											<div class="hh_accent" id="hh_accent' + i + '"><i class="fa fa-angle-right"></i></div>\
										</div>\
									');
									
									if((i-(indexStartForNotes-1)) % root.myGrooveUtils.noteGroupingSize(class_notes_per_measure, 4, 4) == 0 && i < class_notes_per_measure+indexStartForNotes-1) {
										newHTML += ('<div class="space_between_note_groups"> </div> ');
									}
								}
							newHTML += ('<div class="end_note_space"></div>\n</div>');
							
							newHTML += ('\
							<div class="snare-container">\
								<div class="opening_note_space"> </div> ');
								for(i = indexStartForNotes; i < class_notes_per_measure+indexStartForNotes; i++) {
									newHTML += ('\
										<div id="snare' + i + '" class="snare" onClick="myGrooveWriter.noteLeftClick(event, \'snare\', ' + i + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteRightClick(event, \'snare\', ' + i + ')" onmouseenter="myGrooveWriter.noteOnMouseEnter(event, \'snare\', ' + i + ')">\
										<div class="snare_ghost"  id="snare_ghost'  + i + '">(<i class="fa fa-circle dot_in_snare_ghost_note"></i>)</div>\
										<div class="snare_circle" id="snare_circle' + i + '"></div>\
										<div class="snare_xstick" id="snare_xstick' + i + '"><i class="fa fa-times"></i></div>\
										<div class="snare_flam" id="snare_flam' + i + '"><i class="fa ">&#9835;</i></div>\
										<div class="snare_accent" id="snare_accent' + i + '"><i class="fa fa-angle-right"></i></div>\
										</div> \
										');
										
									if((i-(indexStartForNotes-1)) % root.myGrooveUtils.noteGroupingSize(class_notes_per_measure, 4, 4) == 0 && i < class_notes_per_measure+indexStartForNotes-1) {
										newHTML += ('<div class="space_between_note_groups"> </div> ');
									}
								}
							newHTML += ('<div class="end_note_space"></div>\n</div>');
							
							newHTML += ('\
							<div class="kick-container">\
								<div class="opening_note_space"> </div> ');
								for(var j = indexStartForNotes; j < class_notes_per_measure+indexStartForNotes; j++) {
									newHTML += ('\
										<div id="kick' + j + '" class="kick" onClick="myGrooveWriter.noteLeftClick(event, \'kick\', ' + j + ')" oncontextmenu="event.preventDefault(); myGrooveWriter.noteRightClick(event, \'kick\', ' + j + ')" onmouseenter="myGrooveWriter.noteOnMouseEnter(event, \'kick\', ' + j + ')">\
										<div class="kick_splash" id="kick_splash' + j + '"><i class="fa fa-times"></i></div></a>\
										<div class="kick_circle" id="kick_circle' + j + '"></div></a>\
										</div> \
									');
									
									if((j-(indexStartForNotes-1)) % root.myGrooveUtils.noteGroupingSize(class_notes_per_measure, 4, 4) == 0 && j < class_notes_per_measure+indexStartForNotes-1) {
										newHTML += ('<div class="space_between_note_groups"> </div> ');
									}
								}
							newHTML += ('<div class="end_note_space"></div>\n</div>');
							
			newHTML += ('\
					</div>\
				</div>\
			</span>')
		
		
		if(class_number_of_measures > 1)
			newHTML += '<span title="Remove Measure" id="closeMeasureButton' + baseindex + '" onClick="myGrooveWriter.closeMeasureButtonClick(' + baseindex + ')" class="closeMeasureButton"><i class="fa fa-times-circle"></i></span>';
		else
			newHTML += '<span class="closeMeasureButton"><i class="fa">&nbsp;&nbsp;&nbsp;</i></span>';
			
		if(baseindex == class_number_of_measures) // add new measure button
			newHTML += '<span id="addMeasureButton" title="Add measure"onClick="myGrooveWriter.addMeasureButtonClick(event)"><i class="fa fa-plus"></i></span>';
			
		newHTML += ('</div>');
		
		return newHTML;
	};  // end function HTMLforStaffContainer
	
	// a click on a permutation option checkbox
	root.permutationOptionClick = function(event) {

		var optionId = event.target.id;
		var checkbox = document.getElementById(optionId);
		var OnElseOff = checkbox.checked;	
			
		for(var i=1; i < 5; i++) {
			var subOption = optionId + "_sub" + i;
			
			checkbox = document.getElementById(subOption);
			if(checkbox)
				checkbox.checked = OnElseOff;
		}
		
		myGrooveWriter.refresh_ABC();
	};
	
	// a click on a permutation sub option checkbox
	root.permutationSubOptionClick = function(event) {

		var optionId = event.target.id;
		var checkbox = document.getElementById(optionId);
		var OnElseOff = checkbox.checked;	
			
		if(OnElseOff) {  // only do this if turning a sub option on
			// remove the "_sub" and the number on the end (the last char)
			var mainOption = optionId.replace("_sub", "").slice(0,-1);
				
			checkbox = document.getElementById(mainOption);
			if(checkbox)
				checkbox.checked = true;
			
		}

		myGrooveWriter.refresh_ABC();
	};
	
	// public function
	// function to create HTML for the music staff and notes.   We usually want more than one of these
	// baseIndex is the index for the css labels "staff-container1, staff-container2"
	// indexStartForNotes is the index for the note ids.  
	root.HTMLforPermutationOptions = function() {
	
		if(class_permutation_type == "none")
			return "";
	
		var optionTypeArray = [
			{id: "PermuationOptionsCountIn",
			 subid:  "PermuationOptionsCountIn_sub",
			 name: "Count In 1 Measure",
			 SubOptions: [],
			 defaultOn: true
			},
			{id: "PermuationOptionsOstinato",
			 subid:  "PermuationOptionsOstinato_sub",
			 name: "Ostinato",
			 SubOptions: [],
			 defaultOn: false
			},
			{id: "PermuationOptionsSingles",
			 subid:  "PermuationOptionsSingles_sub",
			 name: "Singles",
			 SubOptions: ["1", "ti", "ta"],
			 defaultOn: true
			},
			{id: "PermuationOptionsDoubles",
			 subid:  "PermuationOptionsDoubles_sub",
			 name: "Doubles",
			 SubOptions: ["1", "ti", "ta"],
			 defaultOn: true
			},
			{id: "PermuationOptionsTriples",
			 subid:  "PermuationOptionsTriples_sub",
			 name: "Triples",
			 SubOptions: [],
			 defaultOn: true
			}];
		
		// change and add other options for non triplet based ostinatos
		// Most of the types have 4 sub options
		// add up beats and down beats
		// add quads
		if(!root.myGrooveUtils.isTripletDivision(class_notes_per_measure, 4, 4)) {
			optionTypeArray[2].SubOptions = ["1", "e", "&", "a"];  // singles
			optionTypeArray[3].SubOptions = ["1", "e", "&", "a"];  // doubles
			optionTypeArray[4].SubOptions = ["1", "e", "&", "a"];  // triples
			optionTypeArray.splice(4, 0, {id: "PermuationOptionsUpsDowns", subid:  "PermuationOptionsUpsDowns_sub", name: "Downbeats/Upbeats", SubOptions: ["downs", "ups"], defaultOn: false});
			optionTypeArray.splice(6, 0, {id: "PermuationOptionsQuads", subid:  "PermuationOptionsQuads_sub", name: "Quads", SubOptions: [], defaultOn: false});
		}
		
		switch(class_permutation_type) {
		case "snare_16ths":
			optionTypeArray.splice(0, 0, {id: "PermuationOptionsAccentGrid", subid:  "", name: "Use Accent Grid", SubOptions: [], defaultOn: false});
			break;
		case "kick_16ths":
			if(!root.myGrooveUtils.isTripletDivision(class_notes_per_measure, 4, 4))
				optionTypeArray.splice(0, 0, {id: "PermuationOptionsSkipSomeFirstNotes", subid:  "", name: "Simplify multiple kicks", SubOptions: [], defaultOn: false});
			break;
		default:
			alert("Bad case in HTMLforPermutationOptions()");
			break;
		}
		
		
		var newHTML = '<span id="PermutationOptionsHeader">Permutation Options</span>\n';
		
		newHTML += '<span class="PermutationOptionWrapper">';
		
		for(var optionType in optionTypeArray) {
			
			newHTML += '' +
				'<div class="PermutationOptionGroup" id="' + optionTypeArray[optionType].id + 'Group">\n' +
					'<div class="PermutationOption">\n' +
						'<input ' + (optionTypeArray[optionType].defaultOn ? "checked" : "") + ' type="checkbox" class="myCheckbox" id="' + optionTypeArray[optionType].id + '" onClick="myGrooveWriter.permutationOptionClick(event)">' +
						'<label for="' + optionTypeArray[optionType].id + '">' + optionTypeArray[optionType].name + '</label>\n' +
					'</div>' +
					'<span class="permutationSubOptionContainer" id="' + optionTypeArray[optionType].subid  +'">\n';
					
			var count = 0;		
			for(var optionName in optionTypeArray[optionType].SubOptions) {
				count++;
				newHTML += '' +
						'<span class="PermutationSubOption">\n' +
						'	<input ' + (optionTypeArray[optionType].defaultOn ? "checked" : "") + ' type="checkbox" class="myCheckbox" id="' + optionTypeArray[optionType].subid + count + '" onClick="myGrooveWriter.permutationSubOptionClick(event)">' + 
						'	<label for="' + optionTypeArray[optionType].subid + count + '">' + optionTypeArray[optionType].SubOptions[optionName] + '</label>' +
						'</span>';	
			}

			newHTML += '' +
				'	</span>\n' +
				'</div>\n';
		}
		
		newHTML += '</span>\n';
		return newHTML;
	};		
		
}  // end of class
		
		