	// Javascript for the Groove Writer HTML application
	// Groove Writer is for drummers and helps create sheet music with an easy to use WYSIWYG groove editor.
	//
	// Author: Lou Montulli   
	// Original Creation date: Feb 2015.


	// globals
	global_app_title = "Groove Writer";
	global_number_of_measures = 2;  // only 2 for now (future expansion to more possible)
	global_empty_note_array = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];
	global_notes_per_measure = 8;  // default to 8ths
	global_aNoteHasChangedSinceLastReset = false;  // global var
	global_isMIDIPaused = false;
	global_shouldMIDIRepeat = true;
	global_visible_context_menu = false;   // a single context menu can be visible at a time.
	global_permutationType = "none";
	global_advancedEditIsOn = false;
	
	// constants
	constant_default_tempo = 80;
	constant_note_stem_off_color = "transparent";
	constant_note_on_color_hex  = "#000000";  // black
	constant_note_on_color_rgb  = 'rgb(0, 0, 0)';  // black
	constant_note_off_color_hex = "#CCCCCC";  // gray
	constant_note_off_color_rgb = 'rgb(204, 204, 204)';  // gray
	constant_note_hidden_color_rgb = "transparent";
	constant_ABC_STICK_R=  '"R"x';
	constant_ABC_STICK_L=  '"L"x';
	constant_ABC_STICK_OFF=  '""x';
	constant_ABC_HH_Ride=  "^f";       
	constant_ABC_HH_Crash=  "^A'";       
	constant_ABC_HH_Open=   "!open!^g";  
	constant_ABC_HH_Close=  "!plus!^g";  
	constant_ABC_HH_Accent= "!accent!^g";  
	constant_ABC_HH_Normal= "^g"; 
	constant_ABC_SN_Ghost=  "_c";  
	constant_ABC_SN_Accent= "!accent!c";   
	constant_ABC_SN_Normal= "c";   
	constant_ABC_SN_XStick= "^c"; 
	constant_ABC_KI_SandK=  "[F^d,]";  // kick & splash
	constant_ABC_KI_Splash= "^d,";     // splash only
	constant_ABC_KI_Normal= "F";   
				
	// functions
	
	// Get the "?query" values from the page URL
	function getQueryVariable(variable, def_value)
	{
		   var query = window.location.search.substring(1);
		   var vars = query.split("&");
		   for (var i=0;i<vars.length;i++) {
				   var pair = vars[i].split("=");
				   if(pair[0].toLowerCase() == variable.toLowerCase()){return pair[1];}
		   }
		   return(def_value);
	}	
	// here because we need the function defined first.
	global_notes_per_measure = parseInt(getQueryVariable("Div", "8"));	// default to 8ths

	// check for firefox browser
	function isFirefox() {
		var val = navigator.userAgent.toLowerCase(); 
		if(val.indexOf("firefox") > -1)
			return true;
			
		return false;
	}
		
	// is the division a triplet groove?   6, 12, or 24 notes
	function usingTriplets() {
		if(isTripletDivision(global_notes_per_measure))
			return true;
			
		return false;
	}
	
	// figure it out from the division  Division is number of notes per measure 4, 6, 8, 12, 16, 24, 32, etc...
	function isTripletDivision(division) {
		if(division % 6 == 0)
			return true;
			
		return false;
	}
	
	// is the browser a touch device.   Usually this means no right click
	function is_touch_device() {
		 return (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
	}

	// the note grouping size is how groups of notes within a measure group
	// for 8ths and 16th we group with 4
	// for triplets we group with 3
	function note_grouping_size() {	
		var note_grouping = 4;
		
		switch(global_notes_per_measure) {
		case 4:
			note_grouping = 1;
			break;
		case 6:
			note_grouping = 3;
			break;
		case 8:
			note_grouping = 2;
			break;
		case 12:
			note_grouping = 3;
			break;
		case 16:
			note_grouping = 4;
			break;
		case 24:
			note_grouping = 6;
			break;
		case 32:
			note_grouping = 8;
			break;
		default:
			alert("bad switch in note_grouping_size()");
			if(usingTriplets())
				note_grouping = 3;
			else
				note_grouping = 4;
		}
		
		return note_grouping;
	}
	
	// when we generate ABC we use a default larger note array and transpose it
	// For 8th note triplets that means we need to use a larger grouping to make it
	// scale correctly
	// The base array is now 32 notes long to support 32nd notes
	// since we would normally group by 4 we need to group by 8 since we are scaling it
	function ABC_gen_note_grouping_size() {	
		var note_grouping = note_grouping_size() * 2;
		
		switch(global_notes_per_measure) {
		case 4:
		case 8:
		case 16:
		case 32:   // non triplets
			note_grouping = 8;
			break;
		
		case 6:
			note_grouping = 12;
			break;
		case 12:
			note_grouping = 6;
			break;
		case 24:
			note_grouping = 6;
			break;
			
		default:
			alert("bad switch in ABC_gen_note_grouping_size()");
			if(usingTriplets())
				note_grouping = 6;
			else
				note_grouping = 8;
		}
		
		return note_grouping;
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
			alert("bad returnType in get_snare_state()")
			returnType = "ABC";
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
				return constant_ABC_SN_XStick;   // snare normal
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
			alert("bad returnType in get_kick_state()")
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
			break;
		case "normal":
			document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			break;
		case "splash":
			document.getElementById("kick_splash" + id).style.color = constant_note_on_color_hex;
			break;
		case "kick_and_splash":
			document.getElementById("kick_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("kick_splash" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("bad switch in set_kick_state");
		}
	}
	
	
	function set_snare_state(id, mode) {
						
		// hide everything optional
		document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_hidden_color_rgb;
		document.getElementById("snare_ghost" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("snare_accent" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("snare_xstick" + id).style.color = constant_note_hidden_color_rgb;
						
		// turn stuff on conditionally
		switch(mode) {
		case "off":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_off_color_hex;
			break;
		case "normal":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			break;
		case "ghost":
			document.getElementById("snare_ghost" + id).style.color = constant_note_on_color_hex;
			break;
		case "accent":
			document.getElementById("snare_circle" + id).style.backgroundColor = constant_note_on_color_hex;
			document.getElementById("snare_accent" + id).style.color = constant_note_on_color_hex;
			break;
		case "xstick":
			document.getElementById("snare_xstick" + id).style.color = constant_note_on_color_hex;
			break;
		default:
			alert("bad switch in set_snare_state");
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
			alert("bad returnType in get_hh_state()")
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
			document.getElementById("hh_cross" + id).style.color = constant_note_off_color_hex;
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
		}
	}
	
	function set_sticking_state(id, new_state) {
		
		// turn both off
		document.getElementById("sticking_right" + id).style.color = constant_note_hidden_color_rgb;
		document.getElementById("sticking_left" + id).style.color = constant_note_hidden_color_rgb;
			
		switch(new_state) {
		case "off":
			// show them both greyed out.
			document.getElementById("sticking_right" + id).style.color = constant_note_off_color_hex;
			document.getElementById("sticking_left" + id).style.color = constant_note_off_color_hex;
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
			alert("bad returnType in get_kick_state()")
			returnType = "ABC";
		}	
			
		var element = document.getElementById("sticking_right" + id);
	
		// since colors are inherited, if we have not set a color it will be blank in the ID'd element
		// we set all colors to off in the stylesheet, so it must be off.
		if( (document.getElementById("sticking_right" + id).style.color == "" && document.getElementById("sticking_left" + id).style.color == "") 
			|| (document.getElementById("sticking_right" + id).style.color == constant_note_off_color_rgb && document.getElementById("sticking_left" + id).style.color == constant_note_off_color_rgb)) {
			
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
	global_cur_hh_highlight_id = false;
	global_cur_snare_highlight_id = false;
	global_cur_kick_highlight_id = false;
	function hilight_note(instrument, id) {
		
		id = Math.floor(id);
		if(id < 0 || id >= global_notes_per_measure*global_number_of_measures)
			return;
		
		// turn this one on;
		document.getElementById(instrument + id).style.borderColor = "orange";
		
		// turn off all the previously highlighted notes that are not on the same beat
		if(global_cur_hh_highlight_id !== false && global_cur_hh_highlight_id != id) {
				if(global_cur_hh_highlight_id < global_notes_per_measure*global_number_of_measures)
					document.getElementById("hi-hat" + global_cur_hh_highlight_id).style.borderColor = "transparent";
				global_cur_hh_highlight_id = false;
		}
		if(global_cur_snare_highlight_id !== false && global_cur_snare_highlight_id != id) {
				if(global_cur_snare_highlight_id < global_notes_per_measure*global_number_of_measures)
					document.getElementById("snare" + global_cur_snare_highlight_id).style.borderColor = "transparent";
				global_cur_snare_highlight_id = false;
		}
		if(global_cur_kick_highlight_id !== false && global_cur_kick_highlight_id != id) {
				if(global_cur_kick_highlight_id < global_notes_per_measure*global_number_of_measures)
					document.getElementById("kick" + global_cur_kick_highlight_id).style.borderColor = "transparent";
				global_cur_kick_highlight_id = false;
		}
			
		switch(instrument) {
			case "hi-hat":
				global_cur_hh_highlight_id = id;
				break;
			case "snare":
				global_cur_snare_highlight_id = id;
				break;
			case "kick":
				global_cur_kick_highlight_id = id;
				break;
			default: 
				alert("bad case in hilight_note");
				break;
		}
	}
	
	function clear_all_highlights(instrument) {
		
		// now turn off  notes if necessary;
		if(global_cur_hh_highlight_id !== false) {
				document.getElementById("hi-hat" + global_cur_hh_highlight_id).style.borderColor = "transparent";
				global_cur_hh_highlight_id = false;
		}
		if(global_cur_snare_highlight_id !== false) {
				document.getElementById("snare" + global_cur_snare_highlight_id).style.borderColor = "transparent";
				global_cur_snare_highlight_id = false;
		}
		if(global_cur_kick_highlight_id !== false) {
				document.getElementById("kick" + global_cur_kick_highlight_id).style.borderColor = "transparent";
				global_cur_kick_highlight_id = false;
		}
		
	}
	
	
	// every click passes through here.
	// close a popup if one is up and we click off of it.
	function documentOnClickHanderCloseContextMenu(event) {
		if(global_visible_context_menu ) {
			hideContextMenu( global_visible_context_menu );
		}
	}
	
	function showContextMenu(contextMenu) {
		contextMenu.style.display = "block";
		global_visible_context_menu = contextMenu;
		
		// use a timeout to setup the onClick handler.
		// otherwise the click that opened the menu will close it
		// right away.  :(  
		setTimeout(function(){
			document.onclick = documentOnClickHanderCloseContextMenu;
			},100);
		
		
	}
	
	function hideContextMenu(contextMenu) {
		document.onclick = false;
		
		if(contextMenu) {
			contextMenu.style.display = "none";
		}
		global_visible_context_menu = false;
		
	}
	
	// returns false if the click should be processed without a popup, (non advance edit)
	function handleNotePopup(event, type, id) {
	
		global_which_index_last_clicked = id;
		var contextMenu;
	
		// don't use the pop up if advanced edit isn't on.
		if(global_advancedEditIsOn != true)
			return false;
			
		switch(type) {
		case "hh":
			contextMenu = document.getElementById("hhContextMenu")
			break;
		case "snare":
			contextMenu = document.getElementById("snareContextMenu")
			break;
		case "kick":
			contextMenu = document.getElementById("kickContextMenu")
			break;
		default:
			alert("Bad case in handleNotePopup")
		}
		
		if(contextMenu) {
			// position it
			if (!event) var event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-75 + "px";
			}
			showContextMenu(contextMenu);  // display it
		}
			
		return true;
	}
	
	function noteHasChanged() {
		global_aNoteHasChangedSinceLastReset = true;
	}
	
	function noteHasChangedReset() {
		global_aNoteHasChangedSinceLastReset = false;
	}
	
	function noteHasChangedSinceLastReset() {
		return global_aNoteHasChangedSinceLastReset;
	}
	
	// the user has clicked on the permutation menu
	function permutationAnchorClick(event) {
		var contextMenu;
		
		contextMenu = document.getElementById("permutationContextMenu");
		if(contextMenu) {
			if (!event) var event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-75 + "px";
			}
			showContextMenu(contextMenu);
		}
	}
	
	function setupPermutationMenu() {
		// disable for triplets
		if(usingTriplets) {
			document.getElementById("permutationAnchor").style.fontColor = "gray";
		} else {
			document.getElementById("permutationAnchor").style.fontColor = "blue";
		}
		
	}
	
	function permutationPopupClick(perm_type) {
		global_permutationType = perm_type;
		
		switch (perm_type) {
		case "kick_16ths":
			showHideCSS_ClassVisibility(".kick-container", true, false);  // hide it
			showHideCSS_ClassVisibility(".snare-container", true, true);  // show it
			document.getElementById("staff-container2").style.display = "none";
			document.getElementById("permutationAnchor").style.backgroundColor = "orange";
			break;
			
		case "snare_16ths":
			showHideCSS_ClassVisibility(".kick-container", true, true);  // show it
			showHideCSS_ClassVisibility(".snare-container", true, false);  // hide it
			document.getElementById("staff-container2").style.display = "none";
			document.getElementById("permutationAnchor").style.backgroundColor = "orange";
			break;

		case "none":
		default:
			showHideCSS_ClassVisibility(".kick-container", true, true);  // show it
			showHideCSS_ClassVisibility(".snare-container", true, true);  // show it
			// document.getElementById("staff-container2").style.display = "block";
			global_permutationType = "none";
			document.getElementById("permutationAnchor").style.backgroundColor = "#FFFFCC";;
			break;
		}
		
		create_ABC();
	}
	
	// user has clicked on the advanced edit button
	function toggleAdvancedEdit() {
		if(global_advancedEditIsOn) {
			// turn it off
			global_advancedEditIsOn = false;
			document.getElementById("advancedEditAnchor").style.backgroundColor = "#FFFFCC";;
		} else {
			global_advancedEditIsOn = true;
			document.getElementById("advancedEditAnchor").style.backgroundColor = "orange";;
		}
	}
	
	
	// context menu for labels
	function noteLabelClick(event, instrument) {
		var contextMenu = false;
		
		switch(instrument) {
		case "stickings":
			contextMenu = document.getElementById("stickingsLabelContextMenu")
			break;
		case "hh":
			contextMenu = document.getElementById("hhLabelContextMenu")
			break;
		case "snare":
			contextMenu = document.getElementById("snareLabelContextMenu")
			break;
		case "kick":
			contextMenu = document.getElementById("kickLabelContextMenu")
			break;
		default:
			alert("bad case in noteLabelClick");
		}
		
		if(contextMenu) {
			if (!event) var event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-35 + "px";
			}
			showContextMenu(contextMenu);
		}
		
		return false;
	}
	
	function noteLabelPopupClick(instrument, action) {
		var setFunction = false;
		var contextMenu = false;
		
		switch(instrument) {
		case "stickings":
			contextMenu = document.getElementById("stickingsLabelContextMenu")
			setFunction = set_sticking_state;
			break;
		case "hh":
			contextMenu = document.getElementById("hhLabelContextMenu")
			setFunction = set_hh_state;
			break;
		case "snare":
			contextMenu = document.getElementById("snareLabelContextMenu")
			setFunction = set_snare_state;
			break;
		case "kick":
			contextMenu = document.getElementById("kickLabelContextMenu")
			setFunction = set_kick_state;
			break;
		default:
			alert("bad case in noteLabelPopupClick");
			return false;
		}
		
		for(var i=0; i < global_notes_per_measure*global_number_of_measures; i++) {
			if(action == "all_off")
				setFunction(i, "off")
			else if(instrument == "stickings" && action == "all_right")
				setFunction(i, "right");
			else if(instrument == "stickings" && action == "all_left")
				setFunction(i, "left");
			else if(instrument == "stickings" && action == "alternate")
				setFunction(i, (i % 2 == 0 ? "right" :"left") );
			else if(instrument == "snare" && action == "all_on")
				setFunction(i, "accent");
			else if(action == "all_on")
				setFunction(i, "normal");
			else if(action == "cancel")
				continue;  // do nothing.
			else 
				alert("Bad IF case in noteLabelPopupClick");
		}
		
		if(contextMenu) {
			hideContextMenu(contextMenu);
		}
		
		create_ABC();
		
		return false;
	}
	
	// returns true on error!
	// returns false if working.  (this is because of the onContextMenu handler 
	function noteRightClick(event, type, id) {
		global_which_index_last_clicked = id;
		var contextMenu;
		
		switch(type) {
		case "hh":
			contextMenu = document.getElementById("hhContextMenu")
			break;
		case "snare":
			contextMenu = document.getElementById("snareContextMenu")
			break;
		case "kick":
			contextMenu = document.getElementById("kickContextMenu")
			break;
		default:
			alert("Bad case in handleNotePopup")
		}
		
		if(contextMenu) {
			if (!event) var event = window.event;
			if (event.pageX || event.pageY)
			{
				contextMenu.style.top = event.pageY-30 + "px";
				contextMenu.style.left = event.pageX-75 + "px";
			}
			showContextMenu(contextMenu);
		}
		else {
			return true;  //error
		}
		
		return false;
	}
	
	function noteLeftClick(event, type, id) {
		
		// handleNotePopup will return true if it handled the event
		if(!handleNotePopup(event, type, id)) {
		
			// this is a non advanced edit click
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
				alert("Bad case in noteLeftClick")
			}
		
			create_ABC();
		}
		
	};

	function notePopupClick(type, new_setting) {
		var id = global_which_index_last_clicked
		
		switch(type) {
			case "hh":
				contextMenu = document.getElementById("hhContextMenu")
				set_hh_state(id, new_setting);
				break;
			case "snare":
				contextMenu = document.getElementById("snareContextMenu")
				set_snare_state(id, new_setting);
				break;
			case "kick":
				contextMenu = document.getElementById("kickContextMenu")
				set_kick_state(id, new_setting);
				break;
			default:
				alert("Bad case in contextMenuClick")
		}
		
		if(contextMenu) {
			hideContextMenu(contextMenu);
		}
		
		create_ABC();
	};
	
	// called when we initially mouseOver a note.   
	// We can use it to sense left or right mouse or ctrl events
	function noteOnMouseEnter(event, instrument, id) {
	
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
			}
			create_ABC();  // update music
		}
		
		return false;
	}
				
	function is_hh_or_snare_on(id) {
		if( is_hh_on(id) ) return true;
		if( is_snare_on(id) ) return true;
		
		return false;
	}
	
	
	// since note values are 16ths or 12ths this corrects for that by multiplying note values
	function getNoteScaler() {
		var scaler;

		switch(global_notes_per_measure) {
		case 4:
			scaler = 8;
			break;
		case 6:
			scaler = 4;  // triplet
			break;
		case 8:
			scaler = 4;
			break;
		case 12:
			scaler = 2;  // triplet
			break;
		case 16:
			scaler = 2;
			break;
		case 24:
			scaler = 1;  // triplet
			break;
		case 32:
			scaler = 1;
			break;
		
		default:
			alert("bad case in getNoteScaler()");
			scaler = 1;
		}
		
			
		return scaler;
	}
	
	// note1_array:   an array containing "false" or a note character in ABC to designate that is is on
	// note2_array:   an array containing "false" or a note character in ABC to designate that is is on
	// end_of_group:  when to stop looking ahead in the array.
	function getABCforNote(note1_array, note2_array, end_of_group, scaler) {
	
			var ABC_String = "";
			var note1_ABC_String = "";
			var note2_ABC_String = ""; 
			
			if(note1_array[0] != false) {
				// look ahead and see when the next note is
				var nextCount = 1;
				for(var indexB = 1; indexB < end_of_group; indexB++) {
					if(note1_array[indexB] != false || note2_array[indexB] != false)
						break;
					else
						nextCount++;
				}
					
				note1_ABC_String += note1_array[0] + (scaler * nextCount);
			}
			
			if(note2_array[0] != false) {
				// look ahead and see when the next note is
				var nextCount = 1;
				for(var indexB = 1; indexB < end_of_group; indexB++) {
					if(note1_array[indexB] != false || note2_array[indexB] != false)
						break;
					else
						nextCount++;
				}
					
				note2_ABC_String += note2_array[0] + (scaler * nextCount);
			}
			
			if(note1_array[0] != false && note2_array[0] != false) {
				// if both notes are on, we need to combine them with []
				// horrible hack.  Turns out ABC will render the accents wrong unless the are outside the brackets []
				// look for any accents that are delimited by "!"  (eg !accent!  or !plus!)
				// move the accents to the front
				var rindex = note1_ABC_String.lastIndexOf("!")
				if(rindex > -1) {
					ABC_String += note1_ABC_String.slice(0, rindex+1);
					note1_ABC_String = note1_ABC_String.slice(rindex+1);
				}
				rindex = note2_ABC_String.lastIndexOf("!")
				if(rindex > -1) {
					ABC_String += note2_ABC_String.slice(0, rindex+1)
					note2_ABC_String = note2_ABC_String.slice(rindex+1);
				}
				
				ABC_String += "[" + note1_ABC_String + note2_ABC_String + "]";  // [^gc]
			} else {
				ABC_String += note1_ABC_String + note2_ABC_String;  // note this could be a noOp is both strings are blank
			}
			
			return ABC_String;
	}
	
	// calculate the rest ABC string
	function getABCforRest(note1_array, note2_array, end_of_group, scaler, use_hidden_rest) {
		var ABC_String = "";
		
		// count the # of rest
		if(note1_array[0] == false && note2_array[0] == false) {
			var restCount = 1;
			for(var indexB = 1; indexB < end_of_group; indexB++) {
				if(note1_array[indexB] != false || note2_array[indexB] != false)
					break;
				else
					restCount++;
			}
		
			// now output a rest for the duration of the rest count
			if(use_hidden_rest)
				ABC_String += "x" + (scaler * restCount);
			else
				ABC_String += "z" + (scaler * restCount);
		}
		
		return ABC_String
	}
	
	// this determines the max size of the note array during conversion
	// we use 16 notes for non triplets
	// we use 12 notes for triplets
	function getMaxArrayLengthForABCConverstion() {
		max_size = 32;
		
		if(usingTriplets())
			max_size = 24;
			
		return max_size;
	}
	
	// takes 3 arrays 24 elements long that represent the snare, HH & kick.
	// each element contains either the note value in ABC "F","^g" or false to represent off
	// translates them to an ABC string in 2 voices
	// post_voice_abc is a string added to the end of each voice line that can end the line
	function snare_HH_kick_ABC_for_triplets(sticking_array, HH_array, snare_array, kick_array, post_voice_abc) {
	
		var array_length = getMaxArrayLengthForABCConverstion();  
		var scaler = 1;  // we are always in 24 notes here
		var ABC_String = "";
		var stickings_voice_string = "V:1\n";
		var hh_snare_voice_string  = "V:2 stem=up\n";
		var kick_voice_string      = "V:3 stem=down\n";
			
		for(var i=0; i < array_length; i++) {
			
			// triplets are special.  We want to output a note or a rest for every space of time
			var end_of_group = 24/global_notes_per_measure;  // assuming we are always dealing with 24 notes
			var grouping_size_for_rests = 24/global_notes_per_measure;   // we scale up the notes to fit a 24 length array
			
			
			if(i % ABC_gen_note_grouping_size() == 0) {
				// creates the 3 or the 6 over the note grouping
				hh_snare_voice_string += "(" + note_grouping_size() + ":" + note_grouping_size() + ":" + note_grouping_size();
				//kick_voice_string += "(3:3:3";    // creates the 3 over the note grouping for kick drum
			} 
			 
			if( i % grouping_size_for_rests == 0 ) {
				// we will only output a rest for each place there could be a note
				stickings_voice_string += getABCforRest(sticking_array.slice(i), global_empty_note_array, grouping_size_for_rests, scaler, true);
				hh_snare_voice_string += getABCforRest(snare_array.slice(i), HH_array.slice(i), grouping_size_for_rests, scaler, false);
				kick_voice_string += getABCforRest(kick_array.slice(i), global_empty_note_array, grouping_size_for_rests, scaler, true);
			} 
			
			stickings_voice_string += getABCforNote(sticking_array.slice(i), global_empty_note_array, end_of_group, scaler);
			hh_snare_voice_string += getABCforNote(snare_array.slice(i), HH_array.slice(i), end_of_group, scaler);
			kick_voice_string += getABCforNote(kick_array.slice(i), global_empty_note_array, end_of_group, scaler);
			
			if((i % ABC_gen_note_grouping_size()) == ABC_gen_note_grouping_size()-1) {
			
				stickings_voice_string += " ";
				hh_snare_voice_string += " ";   // Add a space to break the bar line every group notes
				kick_voice_string += " ";
			}
		}
		
		stickings_voice_string += "|\n";
		hh_snare_voice_string += "|";
		kick_voice_string += "|";
		ABC_String += stickings_voice_string + hh_snare_voice_string + post_voice_abc + kick_voice_string + post_voice_abc;
		
		return ABC_String;
	}
	
	// takes 3 arrays 32 elements long that represent the snare, HH & kick.
	// each element contains either the note value in ABC "F","^g" or false to represent off
	// translates them to an ABC string in 2 voices
	// post_voice_abc is a string added to the end of each voice line that can end the line
	//
	function snare_HH_kick_ABC_for_quads(sticking_array, HH_array, snare_array, kick_array, post_voice_abc) {
	
		var array_length = getMaxArrayLengthForABCConverstion();  
		var scaler = 1;  // we are always in 32ths notes here
		var ABC_String = "";
		var stickings_voice_string = "V:1\n"    // for stickings.  they are all rests with text comments added
		var hh_snare_voice_string = "V:2 stem=up\n";     // for hh and snare
		var kick_voice_string = "V:3 stem=down\n";   // for kick drum
		
			
		for(var i=0; i < array_length; i++) {
			
			var grouping_size_for_rests = ABC_gen_note_grouping_size();
			
			var end_of_group;
			if(i%ABC_gen_note_grouping_size() == 0)
				end_of_group = ABC_gen_note_grouping_size();
			else
				end_of_group = (ABC_gen_note_grouping_size()-((i)%ABC_gen_note_grouping_size()));
					 
			 
			if(i % ABC_gen_note_grouping_size() == 0) {
				// we will only output a rest at the beginning of a beat phrase, or if triplets for every space
				var hidden_rest = false;
				stickings_voice_string += getABCforRest(sticking_array.slice(i), global_empty_note_array, grouping_size_for_rests, scaler, true);
				hh_snare_voice_string += getABCforRest(snare_array.slice(i), HH_array.slice(i), grouping_size_for_rests, scaler, hidden_rest);
				kick_voice_string += getABCforRest(kick_array.slice(i), global_empty_note_array, grouping_size_for_rests, scaler, hidden_rest);
			
			} 
			
			stickings_voice_string += getABCforNote(sticking_array.slice(i), global_empty_note_array, end_of_group, scaler);
			hh_snare_voice_string += getABCforNote(snare_array.slice(i), HH_array.slice(i), end_of_group, scaler);
			kick_voice_string += getABCforNote(kick_array.slice(i), global_empty_note_array, end_of_group, scaler);
			
			if((i % ABC_gen_note_grouping_size()) == ABC_gen_note_grouping_size()-1) {
			
				stickings_voice_string += " ";
				hh_snare_voice_string += " ";   // Add a space to break the bar line every group notes
				kick_voice_string += " ";
			}
		}
		
		stickings_voice_string += "|\n";
		hh_snare_voice_string += "|";
		kick_voice_string += "|";
		ABC_String += stickings_voice_string + hh_snare_voice_string + post_voice_abc + kick_voice_string + post_voice_abc;
		
		return ABC_String;
	}
	
	function snare_HH_kick_ABC(sticking_array, HH_array, snare_array, kick_array, post_voice_abc) {
		
		if(usingTriplets()) {
			return snare_HH_kick_ABC_for_triplets(sticking_array, HH_array, snare_array, kick_array, post_voice_abc);
		} else {
			return snare_HH_kick_ABC_for_quads(sticking_array, HH_array, snare_array, kick_array, post_voice_abc);
		}
	}
	
	
	// the top stuff in the ABC that doesn't depend on the notes
	function get_top_ABC_BoilerPlate() {
		// boiler plate
		var fullABC = "%abc\n\X:6\n"
		
		if(usingTriplets())
			fullABC += "M:4/4\n";
		else
			fullABC += "M:4/4\n";
		
		// always add a Title even if it's blank
		fullABC += "T: " + document.getElementById("tuneTitle").value + "\n";
			
		// always add an author even if it's blank
		fullABC += "C: " + document.getElementById("tuneAuthor").value + "\n";
		
		if(usingTriplets())
			fullABC += "L:1/16\n";
		else
			fullABC += "L:1/32\n";
		
		fullABC += "%%flatbeams 1\n%%staves (1 2 3)\nK:C clef=perc\n";
		
		if(document.getElementById("showLegend").checked)
			fullABC += 	'V:1 stem=up \n' +
						'"^Hi-Hat"^g4 "^Open"!open!^g4 "^Close"!plus!^g4 "^Accent"!accent!^g4 ' +
						'"^Crash"^A\'4 "^Ride"^f4 "^Snare"c4 "^Accent"!accent!c4 "^Cross"^c4 "^Ghost"_c4 x8 x8 x8 ||\n' +
						'V:2 stem=down \n' +
						'z8 z8 z8 z8 z8 "^Kick"F4 "^Hi-Hat w/ foot"^d,4 x4 "^Kick & Hi-Hat"[F^d,]8  ||\n' +
						'T:\n';
				
		// print this below the Legend if there is one.
		// use the "parts" field to add comments because it prints above the music.
		fullABC += "P: " + document.getElementById("tuneComments").value + "\n";
		
		// tempo setting
		//fullABC += "Q: 1/4=" + getTempo() + "\n";	
		
		return fullABC;
	}
	
	function get_permutation_pre_ABC(section) {
		var abc = "";
		
		if(usingTriplets()) {
			// skip every fourth one
			section += Math.floor(section/4);
			
			if(section == 8)
				section = 9;
		}
		
		switch(section) {
		case 0:
			abc += "P:Ostinato\n%\n%\n%Just the Ositnato\n"
			break;
		case 1:
			abc += "T: \nP: Singles\n%\n%\n% singles on the \"1\"\n%\n"
			break;
		case 2:
			abc += "%\n%\n% singles on the \"e\"\n%\n"
			break;
		case 3:
			abc += "%\n%\n% singles on the \"&\"\n%\n";
			break;
		case 4:
			abc += "%\n%\n% singles on the \"a\"\n%\n";		
			break;
		case 5:
			abc += "T: \nP: Doubles\n%\n%\n% doubles on the \"1\"\n%\n"
			break;
		case 6:
			abc += "%\n%\n% doubles on the \"e\"\n%\n"
			break;
		case 7:
			abc += "%\n%\n% doubles on the \"&\"\n%\n";
			break;
		case 8:
			abc += "%\n%\n% doubles on the \"a\"\n%\n";		
			break;
		case 9:
			abc += "T: \nP: Triples\n%\n%\n% triples on the \"1\"\n%\n"
			break;
		case 10:
			abc += "%\n%\n% triples on the \"e\"\n%\n"
			break;
		case 11:
			abc += "%\n%\n% triples on the \"&\"\n%\n";
			break;
		case 12:
			abc += "%\n%\n% triples on the \"a\"\n%\n";		
			break;
		case 13:
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
		
		if(usingTriplets()) {
			// skip every third one
			section += Math.floor(section/3);
		}
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
			abc += "\\\n";
			break;
		case 8:
			abc += "|\n";		
			break;
		case 9:
			abc += "\\\n";
			break;
		case 10:
			abc += "\n";
			break;
		case 11:
			abc += "\\\n";
			break;
		case 12:
			abc += "|\n";		
			break;
		case 13:
			abc += "\\\n";
			break;
		default:
			abc += "\nT: Error: No index passed\n";
			break;
		}
		
		return abc;
	}
	
	// 16th note permutation array expressed in 32nd notes
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
			break
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
		case 9:
			kick_array = ["F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false, 
						  "F", false, "F", false, "F", false, false, false];
			break;
		case 10:
			kick_array = [false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, "F", false];
			break;
		case 11:
			kick_array = ["F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false, 
						  "F", false, false, false, "F", false, "F", false];
			break;
		case 12:
			kick_array = ["F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false, 
						  "F", false, "F", false, false, false, "F", false];
			break;
		case 13:
		default:
			kick_array = ["F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, "F", false]
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
						  false, false, false, false, false, false]
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
						  false, false, false, false, "F", false]
			break;
		case 4:
			kick_array = ["F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false];
			break;
		case 5:
			kick_array = [false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false];
			break;
		case 6:
			kick_array = ["F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false];
			break;
		case 7:
		default:
			kick_array = ["F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false];
			break;
		}
		
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
						  false, false, false, false, false, false]
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
						  false, false, false, false, "F", false]
			break;
		case 4:
			kick_array = ["F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false, 
						  "F", false, "F", false, false, false];
			break;
		case 5:
			kick_array = [false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false, 
						  false, false, "F", false, "F", false];
			break;
		case 6:
			kick_array = ["F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false,
						  "F", false, false, false, "F", false];
			break;
		case 7:
		default:
			kick_array = ["F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false, 
						  "F", false, "F", false, "F", false];
			break;
		}
		
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
						  false, false, false, false, false, false]
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
						  false, false, "F", false, false, false]
			break;
		case 4:
			kick_array = ["F", false, false, false, "F", false, 
						  false, false, false, false, false, false, 
						  "F", false, false, false, "F", false, 
						  false, false, false, false, false, false];
			break;
		case 5:
			kick_array = [false, false, false, false, "F", false, 
						  false, false, "F", false, false, false,
						  false, false, false, false, "F", false,
						  false, false, "F", false, false, false];
			break;
		case 6:
			kick_array = ["F", false, false, false, false, false, 
						  false, false, "F", false, false, false, 
						  "F", false, false, false, false, false, 
						  false, false, "F", false, false, false]
			break;
		case 7:
		default:
			kick_array = ["F", false, false, false, "F", false, 
						  false, false, "F", false, false, false, 
						  "F", false, false, false, "F", false, 
						  false, false, "F", false, false, false];
			break;
		}
		
		return kick_array;
	}
	
	function get_kick16th_permutation_array(section) {
		if(usingTriplets()) {
			if(global_notes_per_measure == 6)
				return get_kick16th_triplets_permutation_array_for_4ths(section);
			else if(global_notes_per_measure == 12)
				return get_kick16th_triplets_permutation_array_for_8ths(section);
			else if(global_notes_per_measure == 24)
				return get_kick16th_triplets_permutation_array_for_16ths(section);
			else
				return global_empty_note_array;
		} else	{
			return get_kick16th_strait_permutation_array(section);
		}
	}
	
	// snare permutation 
	function get_snare_permutation_array(section) {

		// its the same as the 16th kick permutation, but with different notes
		snare_array = get_kick16th_permutation_array(section);
		
		// turn the kicks into snares
		for(var i=0; i < snare_array.length; i++)
		{
			if(snare_array[i] != false)
				snare_array[i] = "c";
		}
		
		return snare_array;
	}
	
	function get_kick_on_1_and_3_array(section) {
		
		var kick_array 
		
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
	
	// query the clickable UI and generate a 32 element array representing the notes
	// note: the ui may have fewer notes, but we scale them to fit into the 32 elements proportionally
	function getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, startIndexForClickableUI) {
		
		scaler = getNoteScaler();  // fill proportionally
		
		// fill in the arrays from the clickable UI
		for(var i=0; i < global_notes_per_measure+0; i++) {
			var array_index = (i)*scaler;
			
			// only grab the stickings if they are visible
			if(isStickingsVisible())
				Sticking_Array[array_index] = get_sticking_state(i+startIndexForClickableUI, "ABC");
			
			HH_Array[array_index] = get_hh_state(i+startIndexForClickableUI, "ABC");
		
			Snare_Array[array_index] = get_snare_state(i+startIndexForClickableUI, "ABC");
		
			Kick_Array[array_index] = get_kick_state(i+startIndexForClickableUI, "ABC");
		}
	}
		
	function MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, Kick_Array, midi_output_type) {
			var array_length = getMaxArrayLengthForABCConverstion();  
			var prev_hh_note = false;
			var prev_snare_note = false;
			var prev_kick_note = false;
			var prev_kick_splash_note = false;
			var midi_channel = 0;   
			
			if(midi_output_type == "general_MIDI")
				midi_channel = 9; // for external midi player
			else
				midi_channel = 0; // for our internal midi player
			
			for(var i=0; i < array_length; i++)  {
	
				var duration = 16; // "ticks"  1/32th notes
				var velocity_normal = 85; // how hard the note hits
				var velocity_accent = 120;
				var velocity_ghost = 50;
				
				if(usingTriplets)
					duration = 21.33;
				
				swing_percentage = getSwing()/100;
				if(swing_percentage != 0 && !usingTriplets()) {
					// swing effects the note placement of the e and the a.  (1e&a)
					// swing increases the distance between the 1 and the e ad shortens the distance between the e and the &
					// likewise the distance between the & and the a is increased and the a and the 1 is shortened
					//  So it sounds like this:   1-e&-a2-e&-a3-e&-a4-e&-a
					var scaler = array_length / global_notes_per_measure;
					var val = i%(4*scaler);
					
					if(val < scaler) {
						// this is the 1, increase the distance between this note and the e
						duration += (duration * swing_percentage);
					} else if(val < scaler*2) {
						// this is the e, shorten the distance between this note and the &
						duration -= (duration * swing_percentage);
					} else if(val < scaler*3) {
						// this is the &, increase the distance between this note and the a
						duration += (duration * swing_percentage);
					} else if(val < scaler*4) {
						// this is the a, shorten the distance between this note and the 2
						duration -= (duration * swing_percentage);
					}
				}
				
				var hh_velocity = velocity_normal;
				var hh_note = false;
				switch(HH_Array[i]) {
					case constant_ABC_HH_Normal:  // normal
					case constant_ABC_HH_Close:  // normal
						if(midi_output_type == "general_MIDI")
							hh_note = 42;
						else
							hh_note = 'Ab1';
						break;
					case constant_ABC_HH_Accent:  // accent
						if(midi_output_type == "general_MIDI") {
							hh_note = 42;
							hh_velocity = velocity_accent;
						} else {
							hh_note = 'B0';
						}
						break;
					case constant_ABC_HH_Open:  // open
						if(midi_output_type == "general_MIDI")
							hh_note = 46;
						else
							hh_note = 'Bb0';
						break;
					case constant_ABC_HH_Ride:  // ride
						if(midi_output_type == "general_MIDI")
							hh_note = 51;
						else
							hh_note = 'D1';
						break;
					case constant_ABC_HH_Crash:  // crash
						if(midi_output_type == "general_MIDI")
							hh_note = 49;
						else
							hh_note = 'Eb1';
						break;
				}
				
				if(hh_note != false) {
					if(prev_hh_note != false)
						midiTrack.addNoteOff(midi_channel, prev_hh_note, 0);
					midiTrack.addNoteOn(midi_channel, hh_note, 0, hh_velocity);
					prev_hh_note = hh_note;
				}
				
				var snare_velocity = velocity_normal;
				var snare_note = false;
				switch(Snare_Array[i]) {
					case constant_ABC_SN_Normal:  // normal
						if(midi_output_type == "general_MIDI") {
							snare_note = 8;
						} else {
							snare_note = 'A1';
						}
						break;
					case constant_ABC_SN_Accent:  // accent
						if(midi_output_type == "general_MIDI") {
							snare_note = 38;
							snare_velocity = velocity_accent;
						} else {
							snare_note = 'C1';
						}
						break;	
					case constant_ABC_SN_Ghost:  // ghost
						if(midi_output_type == "general_MIDI") {
							snare_note = 38;
							snare_velocity = velocity_ghost;
						} else {
							snare_note = 'Bb1';
							snare_velocity = velocity_ghost;
						}
						break;	
					case constant_ABC_SN_XStick:  // xstick
						if(midi_output_type == "general_MIDI") {
							snare_note = 37;
						} else {
							snare_note = 'B1';
						}
						break;	
				}
				
				if(snare_note != false) {
					if(prev_snare_note != false)
						midiTrack.addNoteOff(midi_channel, prev_snare_note, 0);
					midiTrack.addNoteOn(midi_channel, snare_note, 0, snare_velocity);
					prev_snare_note = snare_note;
				}
			
				var kick_velocity = velocity_normal;
				var kick_note = false;
				var kick_splash_note = false;
				switch(Kick_Array[i]) {
				case constant_ABC_KI_Splash:  // normal
					if(midi_output_type == "general_MIDI")
						kick_splash_note = 44;
					else
						kick_splash_note = 'B0';
					break;	
				case constant_ABC_KI_SandK:  // normal
					if(midi_output_type == "general_MIDI") {
						kick_splash_note = 44;
						kick_note = 35;
					} else {
						kick_splash_note = 'B0';
						kick_note = 'Db1';
					}
					break;	
				case constant_ABC_KI_Normal:  // normal
					if(midi_output_type == "general_MIDI")
						kick_note = 35;
					else
						kick_note = 'Db1';
					break;	
				}
				if(kick_note != false) {
					if(prev_kick_note != false)
						midiTrack.addNoteOff(midi_channel, prev_kick_note, 0);
					midiTrack.addNoteOn(midi_channel, kick_note, 0, kick_velocity);
					prev_kick_note = kick_note;
				}
				if(kick_splash_note != false) {
					if(prev_kick_splash_note != false)
						midiTrack.addNoteOff(midi_channel, prev_kick_splash_note, 0);
					midiTrack.addNoteOn(midi_channel, kick_splash_note, 0, kick_velocity);
					prev_kick_splash_note = kick_splash_note;
				}
				
				midiTrack.addNoteOff(0, 60, duration);  // add a blank note for spacing
			}
	}
	
	function getTempo() {
		var tempo = parseInt(document.getElementById("tempoInput").value);
		if(tempo < 19 && tempo > 281)
			tempo = constant_default_tempo;
		
		return tempo;
	}
	
	function setTempo(tempo) {
		tempo = parseInt(tempo);
		if(tempo < 19 && tempo > 281)
			tempo = constant_default_tempo;
		document.getElementById("tempoInput").value = tempo;
		
		tempoUpdate(tempo);
		
		return tempo;
	}
	
	// used to update the on screen tempo display
	// also the onClick handler for the tempo slider
	function tempoUpdate(tempo) {
		document.getElementById('tempoOutput').innerHTML = "" + tempo + " bpm";
	}

	// used to update the on screen swing display
	// also the onClick handler for the swing slider
	function swingUpdate(swingAmount) {
		if(!swingAmount) {
			// grab the actual amount from the slider
			swingAmount = parseInt(document.getElementById("swingInput").value);
		}
		
		if(usingTriplets() || global_notes_per_measure == 4)
			document.getElementById('swingOutput').value = "swing N/A";
		else	
			document.getElementById('swingOutput').innerHTML = "" + swingAmount + "% swing";
	}

	function getSwing() {
		var swing = parseInt(document.getElementById("swingInput").value);
		if(swing < 0 || swing > 60)
			swing = 0;
		
		// our real swing value only goes to 60%. 
		return (swing);
	}
	
	function setSwing(swing) {
		swing = parseInt(swing);
		if(swing < 0 && swing > 60)
			swing = 0;
		document.getElementById("swingInput").value = swing;
		
		swingUpdate(swing);
		
		return swing;
	}
	
	function create_MIDI(MIDI_type) {
		var Sticking_Array = global_empty_note_array.slice(0);  // copy by value
		var HH_Array = global_empty_note_array.slice(0);  // copy by value
		var Snare_Array = global_empty_note_array.slice(0);  // copy by value
		var Kick_Array = global_empty_note_array.slice(0);  // copy by value
		var numSections = usingTriplets() ? 8 : 14;
		
		getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, 0);
		
		var midiFile = new Midi.File();
		var midiTrack = new Midi.Track();
		midiFile.addTrack(midiTrack);

		midiTrack.setTempo(getTempo());
		midiTrack.setInstrument(0, 0x13);
		
		switch (global_permutationType) {
		case "kick_16ths":
		
			// compute sections with different kick patterns
			for(var i=0; i < numSections; i++) {
				var new_kick_array;
				
				new_kick_array = get_kick16th_permutation_array(i);
			
				MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, new_kick_array, MIDI_type);
			}
			break;
			
		
		case "snare_16ths":  // use the hh & snare from the user
		
			//compute sections with different snare patterns		
			for(var i=0; i < numSections; i++) {
				var new_snare_array = get_snare_permutation_array(i);
				
				MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, new_snare_array, Kick_Array, MIDI_type);
			}
			break;
			
		case "none":
		default:
			MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, Kick_Array, MIDI_type);
			
			if(isSecondMeasureVisable()) {
				// reset arrays
				Sticking_Array = global_empty_note_array.slice(0);  // copy by value
				HH_Array = global_empty_note_array.slice(0);  // copy by value
				Snare_Array = global_empty_note_array.slice(0);  // copy by value
				Kick_Array = global_empty_note_array.slice(0);  // copy by value
		
				getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, global_notes_per_measure);
				
				MIDI_from_HH_Snare_Kick_Arrays(midiTrack, HH_Array, Snare_Array, Kick_Array, MIDI_type);
			}
		}
		
		var midi_url = "data:audio/midi;base64," + btoa(midiFile.toBytes());
		
		
		return midi_url;
	}
	
	function loadMIDI_for_playback() {
		midi_url = create_MIDI("our_MIDI");
		
		MIDI.Player = MIDI.Player;
		MIDI.Player.timeWarp = 1; // speed the song is played back
		MIDI.Player.loadFile(midi_url, MIDILoaderCallback());
	}
	
	function MIDI_save_as() {
		midi_url = create_MIDI("general_MIDI");
		
		// save as 
		document.location = midi_url;
	}
	
	function pauseMIDI_playback() {
		if(global_isMIDIPaused == false) {
			global_isMIDIPaused = true;
			document.getElementById("playImage").src="images/play.png";
			MIDI.Player.pause();
			clear_all_highlights()
		}
	}
	
	// play button or keypress
	function startMIDI_playback() {
		if(MIDI.Player.playing) {
			return;
		} else if(global_isMIDIPaused && false == noteHasChangedSinceLastReset() ) {
			MIDI.Player.resume();
		} else {
			MIDI.Player.stop();
			loadMIDI_for_playback();
			noteHasChangedReset();  // reset so we know if there is a change
			MIDI.Player.loop(global_shouldMIDIRepeat);   // set the loop parameter
			MIDI.Player.start();
		}
		document.getElementById("playImage").src="images/pause.png";
		global_isMIDIPaused = false;
	}
	
	// stop button or keypress
	function stopMIDI_playback() {
		if(MIDI.Player.playing || global_isMIDIPaused ) {
			global_isMIDIPaused = false;
			MIDI.Player.stop();
			//document.getElementById("stopImage").src="images/grey_stop.png";
			document.getElementById("playImage").src="images/play.png";
			document.getElementById("MIDIProgress").value = 0;
			clear_all_highlights();
		} 
	}
	
	// modal play/stop button
	function startOrPauseMIDI_playback() {
		
		if(MIDI.Player.playing) {
			pauseMIDI_playback();
		} else {
			startMIDI_playback();
		}			
	}
	
	function repeatMIDI_playback() {
		if(global_shouldMIDIRepeat == false) {
			document.getElementById("repeatImage").src="images/repeat.png";
			global_shouldMIDIRepeat = true;
			MIDI.Player.loop(true);
		} else {
			document.getElementById("repeatImage").src="images/grey_repeat.png";
			global_shouldMIDIRepeat = false;
			MIDI.Player.loop(false);
		}
	}
	
	var note_count = 0;
	var global_midi_note_num = 0;  // global, but only used in this function
	function ourMIDICallback(data) {
		document.getElementById("MIDIProgress").value = (data.now/data.end)*100;
		
		if(data.now < 1) {
			// this is considered the start.   It usually comes in at .5 for some reason?
			global_midi_note_num = 0;
		}
		if(data.now == data.end) {
			
			if(global_shouldMIDIRepeat) {
		
				if(noteHasChangedSinceLastReset()) {
					loadMIDI_for_playback();  // regen before repeat
					noteHasChangedReset();  // reset so we know if there is a change
					MIDI.Player.stop();
					MIDI.Player.start();
				}
			} else {
				// not repeating, so stopping
				MIDI.Player.stop();
				document.getElementById("MIDIProgress").value = 100;
				document.getElementById("playImage").src="images/play.png";
				clear_all_highlights();
			}
		}
		
		// note on
		var note_type;
		if(data.message == 144) {
			if(data.note == 32 || data.note == 22 || data.note == 23 || data.note == 27 || data.note == 26)  {
				note_type = "hi-hat";
			} else if(data.note == 24 || data.note == 33 || data.note == 34 || data.note == 35) {
				note_type = "snare";
			} else if(data.note == 25) {
				note_type = "kick";
			}
			hilight_note(note_type, (global_midi_note_num/getNoteScaler()));
		}
		
		if(data.note == 60)
			global_midi_note_num++;
	
		if(0 && data.message == 144) {
			note_count++;
			// my debugging code for midi
			var newHTML = "";
			if(data.note != 60)
				newHTML += "<b>";
				
			newHTML += note_type + " total notes: " + note_count + " - count#: " + global_midi_note_num + 
											" now: " + data.now + 
											" note: " + data.note + 
											" message: " + data.message + 
											" channel: " + data.channel + 
											" velocity: " + data.velocity +
											"<br>";
											
			if(data.note != 60)
				newHTML += "</b>";
			
			document.getElementById("midiTextOutput").innerHTML += newHTML;
		}
		
	}
	
	function MIDILoaderCallback() {
		MIDI.Player.addListener(ourMIDICallback);
	}
	
	// this is called by a bunch of places anytime we modify the musical notes on the page
	// this will recreate the ABC code and will then use the ABC to rerender the sheet music
	// on the page.
	function create_ABC() {
	
		var Sticking_Array = global_empty_note_array.slice(0);  // copy by value
		var HH_Array = global_empty_note_array.slice(0);  // copy by value
		var Snare_Array = global_empty_note_array.slice(0);  // copy by value
		var Kick_Array = global_empty_note_array.slice(0);  // copy by value
		var numSections = usingTriplets() ? 8 : 14;
		
		getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, 0);
		
		// abc header boilerplate
		var fullABC = get_top_ABC_BoilerPlate();
		
		switch (global_permutationType) {
		case "kick_16ths":  // use the hh & snare from the user
		
			// compute sections with different kick patterns
			for(var i=0; i < numSections; i++) {
				var new_kick_array;
				
				new_kick_array = get_kick16th_permutation_array(i);
								
				fullABC += get_permutation_pre_ABC(i);
				fullABC += snare_HH_kick_ABC(Sticking_Array, HH_Array, Snare_Array, new_kick_array, get_permutation_post_ABC(i));
			}
			break;
			
		case "snare_16ths":  // use the hh & kick from the user
		
			//compute 16 sections with different snare patterns		
			for(var i=0; i < numSections; i++) {
				var new_snare_array = get_snare_permutation_array(i);
				
				fullABC += get_permutation_pre_ABC(i);
				fullABC += snare_HH_kick_ABC(Sticking_Array, HH_Array, new_snare_array, Kick_Array, get_permutation_post_ABC(i));
			}
			break;
			
		case "none":
		default:
			fullABC += snare_HH_kick_ABC(Sticking_Array, HH_Array, Snare_Array, Kick_Array, "\\\n");
			
			if(isSecondMeasureVisable()) {
				// reset arrays
				Sticking_Array = global_empty_note_array.slice(0);  // copy by value
				HH_Array = global_empty_note_array.slice(0);  // copy by value
				Snare_Array = global_empty_note_array.slice(0);  // copy by value
				Kick_Array = global_empty_note_array.slice(0);  // copy by value
		
				getArrayFromClickableUI(Sticking_Array, HH_Array, Snare_Array, Kick_Array, global_notes_per_measure);
				fullABC += snare_HH_kick_ABC(Sticking_Array, HH_Array, Snare_Array, Kick_Array, "|\n");
			}
			
			break;
		}
		
		
		document.getElementById("ABCsource").value = fullABC;

		noteHasChanged(); // pretty likely the case
		renderABCtoSVG();
	}
	
	// called by create_ABC to remake the sheet music on the page
	function renderABCtoSVG() {
		var	svgTarget = document.getElementById("svgTarget"),
			diverr = document.getElementById("diverr");
		abc2svg_init();
		page_format = false;		
		annotate = false;    // linkback SVG notes to ABC source
		cfmt.bgcolor = "white";

		abc_images = '';
		diverr.innerHTML = '';
		abc_fe("SOURCE", document.getElementById("ABCsource").value);
	
		svgTarget.innerHTML =
			abc_images.replace(/<abc type=/g, '<rect class="abc" abc=');

	}
		
	// insert the errors
	function errmsg(msg, l, c) {
		var	diverr = document.getElementById("diverr")
		if (l)
			diverr.innerHTML += '<b onclick="gotoabc(' +
				(l - 1) + ',' + c +
				')" style="cursor: pointer; display: inline-block">' +
				msg + "</b><br/>\n"
		else
			diverr.innerHTML += msg + "<br/>\n"
	}
	
	// svg image coming from abc2svg
	function img_out(str) {
		abc_images += str;
		abc_images += '\n'
	}
	
	function showHideNonPrintableAreas(showElseHide) {
		var myElements = document.querySelectorAll(".nonPrintable");

		for (var i = 0; i < myElements.length; i++) {
			divBlock = myElements[i];
			divBlock.style.display = showElseHide ? "block" : "none";
		}
		
	}
	
	function ShowHideABCResults() {
		var ABCResults = document.getElementById("ABC_Results");
		
		
		if(ABCResults.style.display == "block")
			ABCResults.style.display = "none";
		else
			ABCResults.style.display = "block";
						
		return false;  // don't follow the link
	}

	function isSecondMeasureVisable() {
		var secondMeasure = document.getElementById("staff-container2");
		
		if(secondMeasure.style.display == "inline-block")
			return true;
						
		return false;  // don't follow the link
	}
	
	function showHideSecondMeasure(force, showElseHide) {
		var secondMeasure = document.getElementById("staff-container2");
		
		if(force) {
			if(showElseHide)
				secondMeasure.style.display = "inline-block";
			else
				secondMeasure.style.display = "none";
		} else {
			// no-force means to swap on each call
			if(secondMeasure.style.display == "inline-block")
				secondMeasure.style.display = "none";
			else
				secondMeasure.style.display = "inline-block";
		}
		
		create_ABC();
		return false;  // don't follow the link
	}
	
	function showHideCSS_ClassDisplay(className, force, showElseHide, showState) {
		var myElements = document.querySelectorAll(className);
		for (var i = 0; i < myElements.length; i++) {
			stickings = myElements[i];
	
			if(force) {
				if(showElseHide)
					stickings.style.display = showState;
				else
					stickings.style.display = "none";
			} else {
				// no-force means to swap on each call
				if(stickings.style.display == showState)
					stickings.style.display = "none";
				else 
					stickings.style.display = showState;
			}
		}
	}
	
	function showHideCSS_ClassVisibility(className, force, showElseHide) {
		var myElements = document.querySelectorAll(className);
		for (var i = 0; i < myElements.length; i++) {
			stickings = myElements[i];
	
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
			if(myElements[i].style.visibility == "visible")
				return true;
		}
		
		return false;
	}
	
	function showHideStickings(force, showElseHide) {
	
		showHideCSS_ClassVisibility(".stickings-container", force, showElseHide);
		showHideCSS_ClassVisibility(".stickings-label", force, showElseHide);
		
		create_ABC();
		
		return false;  // don't follow the link
	}
	
	function printMusic() {
		var oldMethod = isFirefox();
		
		if(oldMethod) {
			// hide everything but the music and force a print
			// doesn't work for browsers that don't have a blocking print call. (iOS)
			showHideNonPrintableAreas(false);	
			var oldColor = document.body.style.backgroundColor;
			document.body.style.backgroundColor = "#FFF";
			window.print();
			document.body.style.backgroundColor = oldColor;
			showHideNonPrintableAreas(true);
		} else {
			// open a new window just for printing
			var win = window.open("", global_app_title + " Print");
			win.document.body.innerHTML = "<title>" + global_app_title + "</title>\n";
			win.document.body.innerHTML += document.getElementById("svgTarget").innerHTML;
			win.print();
		}
		
	}

	function setupHotKeys() {
		
		var isCtrl = false;
		document.onkeyup=function(e) {
				if(e.which == 17) 
					isCtrl=false;
		}
			
		document.onkeydown=function(e){
			if(e.which == 17) 
				isCtrl=true;
			/*
			if(e.which == 83 && isCtrl == true) {
				 alert('CTRL-S pressed');
				 return false;
			}
			*/
			// only accept the event if it not going to an INPUT field
			// otherwise we can't use spacebar in text fields :(
			if(e.which == 32 && e.target.tagName != "INPUT" && e.target.tagName != "TEXTAREA") {
				// spacebar
				startOrPauseMIDI_playback();
				return false;
			}
			if(e.which == 179) {
				// Play button
				startOrPauseMIDI_playback();
			}
			if(e.which == 178) {
				// Stop button
				stopMIDI_playback()
			}
		}
	}
	
	function runsOnPageLoad() {
		
		// setup for URL shortener
		gapi.client.setApiKey('AIzaSyBnjOal_AHASONxMQSZPk6E5w9M04CGLcA'); 
		gapi.client.load('urlshortener', 'v1',function(){});
		
		//setupHotKeys();  Runs on midi load now
		
		setupPermutationMenu();
						
		// set the background color of the current subdivision
		document.getElementById(global_notes_per_measure + "ths").style.background = "orange";
		
		set_Default_notes();
		
		MIDI.loadPlugin({
			soundfontUrl: "./soundfont/",
			instruments: ["gunshot" ],
			callback: function() {
				MIDI.programChange(0, 127);   // use "Gunshot" instrument because I don't know how to create new ones
				document.getElementById("playImage").src="images/play.png";
				document.getElementById("playImage").onclick = function (event){event.preventDefault(); startOrPauseMIDI_playback();};  // enable play button
				
				setupHotKeys();  // spacebar to play
			}
		});
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
		
		// ignore "|" by removing them
		var notes = noteString.replace(/\|/g, '');
		
		// multiple measures of "how_many_notes"
		var notesOnScreen = global_notes_per_measure * numberOfMeasures;
		
		noteStringScaler = 1;
		displayScaler = 1;
		if(notes.length > notesOnScreen && notes.length/notesOnScreen >= 2) {
			// if we encounter a 16th note groove for an 8th note board, let's scale it	down	
			noteStringScaler = Math.ceil(notes.length/notesOnScreen);
		} else if(notes.length < notesOnScreen && notesOnScreen/notes.length >= 2) {
			// if we encounter a 8th note groove for an 16th note board, let's scale it up
			displayScaler = Math.ceil(notesOnScreen/notes.length);
		} 

			
		//  DisplayIndex is the index into the notes on the HTML page  starts at 1/32\n%%flatbeams
		var displayIndex = 0;
		var topDisplay = global_notes_per_measure*global_number_of_measures;
		for(var i=0; i < notes.length && displayIndex < topDisplay; i += noteStringScaler, displayIndex += displayScaler) {
		
			switch(notes[i]) {
			case "c":
				setFunction(displayIndex, "crash");
				break;
			case "g":
				setFunction(displayIndex, "ghost");
				break;
			case "l":
			case "L":
				if(drumType == "Stickings")
					setFunction(displayIndex, "left")
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
					setFunction(displayIndex, "right")
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
				alert("Bad note in setNotesFromURLData: " + notes[i])
				break;
			}	
		}
	}
	
	
	// get a really long URL that encodes all of the notes and the rest of the state of the page.
	// this will allow us to bookmark or reference a groove.
	//
	function get_FullURLForPage() {
	
		var fullURL = window.location.protocol + "//" + window.location.host + window.location.pathname;
		
		// # of notes
		fullURL += "?Div=" + global_notes_per_measure;
		
		var title = document.getElementById("tuneTitle").value.trim();
		if(title != "")
			fullURL += "&Title=" + encodeURI(title);
			
		var author = document.getElementById("tuneAuthor").value.trim();
		if(author != "")
			fullURL += "&Author=" + encodeURI(author);
		
		var comments = document.getElementById("tuneComments").value.trim();
		if(comments != "")
			fullURL += "&Comments=" + encodeURI(comments);
		
		fullURL += "&Tempo=" + getTempo();
		
		if(getSwing() > 0)
			fullURL += "&Swing=" + getSwing();
		
		// # of measures
		fullURL += "&Measures=2";
		
		if(isSecondMeasureVisable())
			fullURL += "&showMeasures=2";
		else	
			fullURL += "&showMeasures=1";
		
		// notes
		var HH = "&H=|"
		var Snare = "&S=|";
		var Kick = "&K=|";
		var Stickings = "&Stickings=|";
		
		// run through both measures.
		topIndex = global_notes_per_measure*global_number_of_measures;
		for(var i=0; i < topIndex; i++) {
			Stickings += get_sticking_state(i, "URL"); 
			HH += get_hh_state(i, "URL"); 
			Snare += get_snare_state(i, "URL");
			Kick += get_kick_state(i, "URL");
		
			if(((i+1) % global_notes_per_measure) == 0) {
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
	
	function show_FullURLPopup() {
		popup = document.getElementById("fullURLPopup");
				
		new Share("#shareButton", {
		  networks: {
			facebook: {
				before: function() {
					this.url = document.getElementById("fullURLTextField").value;
					this.description = "Check out this groove.";
				},
			  app_id: "839699029418014",
			},
			google_plus: {
				before: function() {
					this.url = encodeURIComponent(document.getElementById("fullURLTextField").value);
					this.description = "Check out this groove.";
				},
			},
			twitter: {
				before: function() {
					this.url = encodeURIComponent(document.getElementById("fullURLTextField").value);
					this.description = "Check out this groove. %0A%0A " + encodeURIComponent(document.getElementById("fullURLTextField").value);
				},
			},
			pinterest: {
				enabled: false,
			},
			email: {
				before: function() {
					this.url = document.getElementById("fullURLTextField").value;
					this.description = "Check out this groove. %0A%0A " + encodeURIComponent(document.getElementById("fullURLTextField").value);
				},
				after: function() {
					console.log("User shared:", this.url);
				}
			},
		  }
		});
				
		if(popup) {
			fullURL = get_FullURLForPage();
			textField = document.getElementById("fullURLTextField");
			textField.value = fullURL;
			
			popup.style.visibility = "visible";
			
			// select the URL for copy/paste
			textField.focus();
			textField.select();
			
			// fill in link at bottom
			document.getElementById("fullURLLink").href = fullURL;
		}
	}
	
	function close_FullURLPopup() {
		popup = document.getElementById("fullURLPopup");
				
		if(popup) 
			popup.style.visibility = "hidden";
	}
	
	function get_ShortendURL(fullURL, cssIdOfTextFieldToFill) {
	
		if(gapi.client.urlshortener) {
			var request = gapi.client.urlshortener.url.insert({
				'resource': {
				  'longUrl': fullURL
				}
			});
			request.execute(function(response) {      
				if((response.id != null)){
					textField = document.getElementById(cssIdOfTextFieldToFill);
					textField.value = response.id;
				
					// select the URL for copy/paste
					textField.focus();
					textField.select();
				}
			});
		} else {
			alert("Error: URL Shortener API is not loaded")
		}
		
	}
	
	function shortenerCheckboxChanged() {
		if(document.getElementById("shortenerCheckbox").checked)
			get_ShortendURL(get_FullURLForPage(), 'fullURLTextField');
		else	
			show_FullURLPopup();
	}
	
	function GetDefaultStickingsGroove(division) {
		if(isTripletDivision(division)) {
			return "|------------------------|------------------------|";
		} else { 
			return "|--------------------------------|--------------------------------|";
		}
	}
	
	function GetDefaultHHGroove(division) {
		if(isTripletDivision(division)) {
			return "|xxxxxxxxxxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxxxxxxxxxx|";
		} else { 
			return "|x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-|x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-|";
		}
	}
	
	function GetDefaultSnareGroove(division) {
		if(isTripletDivision(division)) {
			if(division == 6)
				return "|---O--|---O--|";
			else	
				return "|---O-----O--|---O-----O--|";
		} else { 
			return "|--------O---------------O-------|--------O---------------O-------|";
		}
	}
	
	function GetDefaultKickGroove(division) {
		if(isTripletDivision(division)) {
			if(division == 6)
				return "|o-----|o-----|";
			else
				return "|o-----o-----|o-----o-----|";
		} else { 
			return "|o---------------o---------------|o---------------o---------------|";
		}
	}
	
	function set_Default_notes() {
		var Stickings;
		var HH;
		var Snare;
		var Kick;
		var numberOfMeasures = 2;
		var stickings_set_from_URL = false;
		
		Stickings = getQueryVariable("Stickings", false);
		if(!Stickings) {
			getQueryVariable("Stickings", false)
			if(!Stickings) {
				Stickings = GetDefaultStickingsGroove(global_notes_per_measure);
			}
		} else {
			stickings_set_from_URL = true;
		}
		
		HH = getQueryVariable("H", false);
		if(!HH) {
			getQueryVariable("HH", false)
			if(!HH) {
				HH = GetDefaultHHGroove(global_notes_per_measure);
			}
		}
		
		Snare = getQueryVariable("S", false);
		if(!Snare) {
			Snare = GetDefaultSnareGroove(global_notes_per_measure);
		}
		
		Kick = getQueryVariable("K", false);
		if(!Kick) {
			getQueryVariable("B", false)
			if(!Kick) {
				Kick = GetDefaultKickGroove(global_notes_per_measure);
			}
		}
			
		// for now we only support up to 2 measures
		numberOfMeasures = getQueryVariable("measures", 2);
		if(numberOfMeasures > 2)
			numberOfMeasures = 2;

		setNotesFromURLData("Stickings", Stickings, numberOfMeasures);
		setNotesFromURLData("H", HH, numberOfMeasures);
		setNotesFromURLData("S", Snare, numberOfMeasures);
		setNotesFromURLData("K", Kick, numberOfMeasures);
		
		numberOfMeasuresToShow = getQueryVariable("showMeasures", 1);
		if(numberOfMeasuresToShow == 2)
			showHideSecondMeasure(true, true);
		else
			showHideSecondMeasure(true, false);
		
		if(stickings_set_from_URL) 
				showHideStickings(true, true);
		
		var title = getQueryVariable("title", "");
		title = decodeURI(title);
		title = title.replace(/\+/g, " ");
		document.getElementById("tuneTitle").value = title;
						
		var author = getQueryVariable("author", "");
		author = decodeURI(author);
		author = author.replace(/\+/g, " ");
		document.getElementById("tuneAuthor").value = author;
		
		var comments = getQueryVariable("comments", "");
		comments = decodeURI(comments);
		comments = comments.replace(/\+/g, " ");
		document.getElementById("tuneComments").value = comments;
		
		var tempo = getQueryVariable("tempo", "");
		if(tempo != "")
			setTempo(tempo);
		
		var swing = getQueryVariable("swing", "");
		if(swing != "")
			setSwing(swing);
		
		create_ABC();
	}
	
	function getABCDataWithLineEndings() {
		var myABC = document.getElementById("ABCsource").value;

		// add proper line endings for windows
		myABC = myABC.replace(/\r?\n/g, "\r\n");
		
		return myABC;
	}
		
	function saveABCtoFile() {
		myABC = getABCDataWithLineEndings();
		
		myURL = 'data:text/plain;charset=utf-8;base64,' + btoa(myABC);
		
		alert("Use \"Save As\" to save the new page to a local file");
		window.open(myURL);
		
	}
	
	// change the base division to something else.
	// eg  16th to 8ths or   32nds to 8th note triplets
	// need to re-layout the html notes, change any globals and then reinitialize
	function changeDivisionWithNotes (newDivision, Stickings, HH, Snare, Kick) {
		var oldDivision = global_notes_per_measure;
		var wasSecondMeasureVisabile = isSecondMeasureVisable();
		var wasStickingsVisable = isStickingsVisible();
		global_notes_per_measure = newDivision;
		
		var newHTML = HTMLforStaffContainer(1,0);
		newHTML += HTMLforStaffContainer(2, global_notes_per_measure);
		
		// rewrite the HTML for the HTML note grid
		document.getElementById("musicalInput").innerHTML = newHTML;
		
		if(wasSecondMeasureVisabile)
			showHideSecondMeasure(true, true);
		
		if(wasStickingsVisable)
			showHideStickings(true, true);
		
		// now set the right notes on and off
		setNotesFromURLData("Stickings", Stickings, 2);
		setNotesFromURLData("H", HH, 2);
		setNotesFromURLData("S", Snare, 2);
		setNotesFromURLData("K", Kick, 2);
		
		// un-highlight the old div 
		document.getElementById(oldDivision + "ths").style.background = "#FFFFCC";
		
		// highlight the new div
		document.getElementById(global_notes_per_measure + "ths").style.background = "orange";
		
		// if the permutation menu is not "none" this will change the layout
		// otherwise it should do nothing
		setupPermutationMenu();
		
		// update the swing output display
		swingUpdate();
	}
	
	// change the base division to something else.
	// eg  16th to 8ths or   32nds to 8th note triplets
	// need to re-layout the html notes, change any globals and then reinitialize
	function changeDivision (newDivision) {
		var uiStickings="|";
		var uiHH="|";
		var uiSnare="|";
		var uiKick="|";
		
		if(!isTripletDivision(global_notes_per_measure) && !isTripletDivision(newDivision)) {
			// get the encoded notes out of the UI.
			// run through both measures.
			topIndex = global_notes_per_measure*global_number_of_measures;
			for(var i=0; i < topIndex; i++) {
					uiStickings += get_sticking_state(i, "URL"); 
					uiHH += get_hh_state(i, "URL"); 
					uiSnare += get_snare_state(i, "URL");
					uiKick += get_kick_state(i, "URL");
				
				if(i == global_notes_per_measure-1) {
					uiStickings += "|"
					uiHH += "|"
					uiSnare += "|";
					uiKick += "|";
				}
			}
			
			// override the hi-hat if we are going to a higher division.
			// otherwise the notes get lost in translation (not enough)
			if(newDivision > global_notes_per_measure)
				uiHH = GetDefaultHHGroove(newDivision);
		} else {
			// triplets don't scale well, so use defaults when we change
			uiStickings = GetDefaultStickingsGroove(newDivision);
			uiHH = GetDefaultHHGroove(newDivision);
			uiSnare = GetDefaultSnareGroove(newDivision);
			uiKick = GetDefaultKickGroove(newDivision);
		}
		
		changeDivisionWithNotes(newDivision, uiStickings, uiHH, uiSnare, uiKick);
		
		create_ABC();
	}
		

	// function to create HTML for the music staff and notes.   We usually want more than one of these
	// baseIndex is the index for the css labels "staff-container1, staff-container2"
	// indexStartForNotes is the index for the note ids.  
	function HTMLforStaffContainer(baseindex, indexStartForNotes) {
		var newHTML = ('\
			<div class="staff-container" id="staff-container' + baseindex + '">\
				<div class="line-labels">\
					<div class="stickings-label" onClick="noteLabelClick(event, \'stickings\')" oncontextmenu="event.preventDefault(); noteLabelClick(event, \'stickings\')">stickings</div>\
					<div class="hh-label" onClick="noteLabelClick(event, \'hh\')" oncontextmenu="event.preventDefault(); noteLabelClick(event, \'hh\')">hi-hat</div>\
					<div class="snare-label" onClick="noteLabelClick(event, \'snare\')" oncontextmenu="event.preventDefault(); noteLabelClick(event, \'snare\')">snare</div>\
					<div class="kick-label" onClick="noteLabelClick(event, \'kick\')" oncontextmenu="event.preventDefault(); noteLabelClick(event, \'kick\')">kick</div>\
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
						<div class="stickings-container">\
							<div class="opening_note_space"> </div>');
							for(var i = indexStartForNotes; i < global_notes_per_measure+indexStartForNotes; i++) {
							
								newHTML += ('\
									<div id="sticking' + i + '" class="sticking">\
										<div class="sticking_right"  id="sticking_right' + i + '"  onClick="noteLeftClick(event, \'sticking\', ' + i + ')" oncontextmenu="event.preventDefault(); noteRightClick(event, \'sticking\', ' + i + ') onmouseenter="noteOnMouseEnter(event, \'sticking\'">R</div>\
										<div class="sticking_left"  id="sticking_left' + i + '"  onClick="noteLeftClick(event, \'sticking\', ' + i + ')" oncontextmenu="event.preventDefault(); noteRightClick(event, \'sticking\', ' + i + ')", ' + i + ')">L</div>\
									</div>\
								');
								
								// add space between notes, exept on the last note
								if((i-(indexStartForNotes-1)) % note_grouping_size() == 0 && i < global_notes_per_measure+indexStartForNotes-1) {
									newHTML += ('<div class="space_between_note_groups"> </div> ');
								}
							}
						newHTML += ('<div class="end_note_space"></div>\n</div>');
					
					newHTML += ('\
						<div class="hi-hat-container">\
							<div class="opening_note_space"> </div>');
							for(var i = indexStartForNotes; i < global_notes_per_measure+indexStartForNotes; i++) {
							
								newHTML += ('\
									<div id="hi-hat' + i + '" class="hi-hat" onClick="noteLeftClick(event, \'hh\', ' + i + ')" oncontextmenu="event.preventDefault(); noteRightClick(event, \'hh\', ' + i + ')" onmouseenter="noteOnMouseEnter(event, \'hh\', ' + i + ')">\
										<div class="hh_crash"  id="hh_crash'  + i + '">*</div>\
										<div class="hh_ride"   id="hh_ride'   + i + '">R</div>\
										<div class="hh_cross"  id="hh_cross'  + i + '">X</div>\
										<div class="hh_open"   id="hh_open'   + i + '">o</div>\
										<div class="hh_close"  id="hh_close'  + i + '">+</div>\
										<div class="hh_accent" id="hh_accent' + i + '">&gt;</div>\
									</div>\
								');
								
								if((i-(indexStartForNotes-1)) % note_grouping_size() == 0 && i < global_notes_per_measure+indexStartForNotes-1) {
									newHTML += ('<div class="space_between_note_groups"> </div> ');
								}
							}
						newHTML += ('<div class="end_note_space"></div>\n</div>');
						
						newHTML += ('\
						<div class="snare-container">\
							<div class="opening_note_space"> </div> ');
							for(var i = indexStartForNotes; i < global_notes_per_measure+indexStartForNotes; i++) {
								newHTML += ('\
									<div id="snare' + i + '" class="snare" onClick="noteLeftClick(event, \'snare\', ' + i + ')" oncontextmenu="event.preventDefault(); noteRightClick(event, \'snare\', ' + i + ')" onmouseenter="noteOnMouseEnter(event, \'snare\', ' + i + ')">\
									<div class="snare_ghost"  id="snare_ghost'  + i + '">(&bull;)</div>\
									<div class="snare_circle" id="snare_circle' + i + '"></div>\
									<div class="snare_xstick" id="snare_xstick' + i + '">X</div>\
									<div class="snare_accent" id="snare_accent' + i + '">&gt;</div>\
									</div> \
									');
									
								if((i-(indexStartForNotes-1)) % note_grouping_size() == 0 && i < global_notes_per_measure+indexStartForNotes-1) {
									newHTML += ('<div class="space_between_note_groups"> </div> ');
								}
							}
						newHTML += ('<div class="end_note_space"></div>\n</div>');
						
						newHTML += ('\
						<div class="kick-container">\
							<div class="opening_note_space"> </div> ');
							for(var i = indexStartForNotes; i < global_notes_per_measure+indexStartForNotes; i++) {
								newHTML += ('\
									<div id="kick' + i + '" class="kick" onClick="noteLeftClick(event, \'kick\', ' + i + ')" oncontextmenu="event.preventDefault(); noteRightClick(event, \'kick\', ' + i + ')" onmouseenter="noteOnMouseEnter(event, \'kick\', ' + i + ')">\
									<div class="kick_splash" id="kick_splash' + i + '">X</div></a>\
									<div class="kick_circle" id="kick_circle' + i + '"></div></a>\
									</div> \
								');
								
								if((i-(indexStartForNotes-1)) % note_grouping_size() == 0 && i < global_notes_per_measure+indexStartForNotes-1) {
									newHTML += ('<div class="space_between_note_groups"> </div> ');
								}
							}
						newHTML += ('<div class="end_note_space"></div>\n</div>');
						
		newHTML += ('\
				</div>\
			</div>\
		</div>')
		
		return newHTML;
	}  // end function HTMLforStaffContainer
		
		