

// GrooveUtils class.   The only one in this file. 
function GrooveUtils() { "use strict";

	var root = this;

	var class_empty_note_array = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];
	
	// constants
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
	var constant_ABC_SN_XStick= "^c"; 
	var constant_ABC_KI_SandK=  "[F^d,]";  // kick & splash
	var constant_ABC_KI_Splash= "^d,";     // splash only
	var constant_ABC_KI_Normal= "F";   
	
	/* 
	 * midi_output_type:  "general_MIDI" or "Custom"
	 * num_notes: number of notes in the arrays
	 * num_notes_for_swing: how many notes are we using.   Since we need to know where the upstrokes are we need to know
	 * 			what the proper division is.   It can change when we are doing permutations, otherwise it is what is the 
	 *			class_notes_per_measure
	 *
	 * The arrays passed in contain the ABC notation for a given note value or false for a rest.
	 */
	root.MIDI_from_HH_Snare_Kick_Arrays = function(midiTrack, HH_Array, Snare_Array, Kick_Array, midi_output_type, num_notes, num_notes_for_swing, swing_percentage) { 
			var prev_hh_note = false;
			var prev_snare_note = false;
			var prev_kick_note = false;
			var prev_kick_splash_note = false;
			var midi_channel = 0;   
			
			if(midi_output_type == "general_MIDI")
				midi_channel = 9; // for external midi player
			else
				midi_channel = 0; // for our internal midi player
			
			for(var i=0; i < num_notes; i++)  {
	
				var duration = 512/num_notes;   // "ticks"   16 for 32nd notes.  21.33 for 24th triplets
				var velocity_normal = 85; // how hard the note hits
				var velocity_accent = 120;
				var velocity_ghost = 50;
				
				if(swing_percentage != 0) {
					// swing effects the note placement of the e and the a.  (1e&a)
					// swing increases the distance between the 1 and the e ad shortens the distance between the e and the &
					// likewise the distance between the & and the a is increased and the a and the 1 is shortened
					//  So it sounds like this:   1-e&-a2-e&-a3-e&-a4-e&-a
					var scaler = num_notes / num_notes_for_swing;
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
							hh_note = 42;
						break;
					case constant_ABC_HH_Accent:  // accent
						if(midi_output_type == "general_MIDI") {
							hh_note = 42;
							hh_velocity = velocity_accent;
						} else {
							hh_note = 108;
						}
						break;
					case constant_ABC_HH_Open:  // open
							hh_note = 46;
						break;
					case constant_ABC_HH_Ride:  // ride
							hh_note = 51;
						break;
					case constant_ABC_HH_Crash:  // crash
							hh_note = 49;
						break;
					case false:
						break;
					default:
						alert("Bad case in GrooveUtils.MIDI_from_HH_Snare_Kick_Arrays");
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
							snare_note = 38;
						break;
					case constant_ABC_SN_Accent:  // accent
						if(midi_output_type == "general_MIDI") {
							snare_note = 38;
							snare_velocity = velocity_accent;
						} else {
							snare_note = 22;   // custom note
						}
						break;	
					case constant_ABC_SN_Ghost:  // ghost
						if(midi_output_type == "general_MIDI") {
							snare_note = 38;
							snare_velocity = velocity_ghost;
						} else {
							snare_note = 21;
							snare_velocity = velocity_ghost;
						}
						break;	
					case constant_ABC_SN_XStick:  // xstick
							snare_note = 37;
						break;
					case false:
						break;
					default:
						alert("Bad case in GrooveUtils.MIDI_from_HH_Snare_Kick_Arrays");
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
						kick_splash_note = 44;
					break;	
				case constant_ABC_KI_SandK:  // normal
						kick_splash_note = 44;
						kick_note = 35;
					break;	
				case constant_ABC_KI_Normal:  // normal
						kick_note = 35;
					break;	
				case false:
					break;
				default:
					alert("Bad case in GrooveUtils.MIDI_from_HH_Snare_Kick_Arrays");
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
	} // end of function
	
	
	// the top stuff in the ABC that doesn't depend on the notes
	root.get_top_ABC_BoilerPlate = function(isPermutation, tuneTitle, tuneAuthor, tuneComments, showLegend, isTriplets) {
		// boiler plate
		var fullABC = "%abc\n\X:6\n"
		
		if(isTriplets)
			fullABC += "M:4/4\n";
		else
			fullABC += "M:4/4\n";
		
		// always add a Title even if it's blank
		fullABC += "T: " + tuneTitle + "\n";
			
		// always add an author even if it's blank
		fullABC += "C: " + tuneAuthor + "\n";
		
		if(isTriplets)
			fullABC += "L:1/16\n";
		else
			fullABC += "L:1/32\n";
		
		if(!isPermutation)
			fullABC += "%%stretchlast 1\n";
		
		fullABC +=  "%%flatbeams 1\n" +
					"%%ornament up\n" +
					"%%pagewidth 595px\n" +
					"%%leftmargin 10px\n" +
					"%%rightmargin 10px\n" +
					"%%topspace 0px\n" +
					'%%deco (. 0 a 5 1 1 "@-8,-5("\n' +
					'%%deco ). 0 a 5 1 1 "@4,-5)"\n' +
					'%%beginsvg\n' +
					' <defs>\n' +
					' <use id="VoidWithX" xlink:href="#acc2"/>\n' +
					' </defs>s\n' +
					'%%endsvg\n' +
					'%%map drum ^g heads=VoidWithX print=g  % Hi-Hat\n' +
					'%%map drum ^d, heads=VoidWithX print=d,  % Foot Splash\n' +
					"%%staves (Stickings Hands Feet)\n";
									
		// print comments below the legend if there is one, otherwise in the header section
		if(tuneComments != "") {
			fullABC += "P: " + tuneComments + "\n";
			fullABC += "%%musicspace 5px\n";  // add some space
		} else {
			fullABC += "%%musicspace 0px\n";
		}
		
					
		// the K ends the header;
		fullABC +=	"K:C clef=perc\n";
		
		if(showLegend) {
			fullABC += 	'V:Stickings\n' +
						'x8 x8 x8 x8 x8 x8 x8 x8 ||\n' +
						'V:Hands stem=up \n' +
						'%%voicemap drum\n' +
						'"^Hi-Hat"^g4 "^Open"!open!^g4 "^Close"!plus!^g4 "^Accent"!accent!^g4 ' +
						'"^Crash"^A\'4 "^Ride"^f4 "^Snare"c4 "^Accent"!accent!c4 "^Cross"^c4 "^Ghost"!(.!!).!c4 x8 x8 x8 ||\n' +
						'V:Feet stem=down \n' +
						'z8 z8 z8 z8 z8 "^Kick"F4 "^Hi-Hat w/ foot"^d,4 x4 "^Kick & Hi-Hat"[F^d,]8  ||\n' +
						'T:\n';
		}
		
		// tempo setting
		//fullABC += "Q: 1/4=" + getTempo() + "\n";	
		
		return fullABC;
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
	
	
	// when we generate ABC we use a default larger note array and transpose it
	// For 8th note triplets that means we need to use a larger grouping to make it
	// scale correctly
	// The base array is now 32 notes long to support 32nd notes
	// since we would normally group by 4 we need to group by 8 since we are scaling it
	function ABC_gen_note_grouping_size(usingTriplets) {	
		var note_grouping;
		
		if(usingTriplets)
			note_grouping = 6;
		else
			note_grouping = 8;
			
		return note_grouping;
	}
				

	// takes 4 arrays 24 elements long that represent the stickings, snare, HH & kick.
	// each element contains either the note value in ABC "F","^g" or false to represent off
	// translates them to an ABC string in 2 voices
	// post_voice_abc is a string added to the end of each voice line that can end the line
	function snare_HH_kick_ABC_for_triplets(sticking_array, HH_array, snare_array, kick_array, post_voice_abc, num_notes) {
	
		var scaler = 1;  // we are always in 24 notes here
		var ABC_String = "";
		var stickings_voice_string = "V:Stickings\n";
		var hh_snare_voice_string  = "V:Hands stem=up\n%%voicemap drum\n";
		var kick_voice_string      = "V:Feet stem=down\n%%voicemap drum\n";
			
		for(var i=0; i < num_notes; i++) {
			
			// triplets are special.  We want to output a note or a rest for every space of time
			var end_of_group = 24/class_notes_per_measure;  // assuming we are always dealing with 24 notes
			var grouping_size_for_rests = 24/class_notes_per_measure;   // we scale up the notes to fit a 24 length array
			
			
			if(i % ABC_gen_note_grouping_size(true) == 0) {
				// creates the 3 or the 6 over the note grouping
				hh_snare_voice_string += "(" + note_grouping_size() + ":" + note_grouping_size() + ":" + note_grouping_size();
				//kick_voice_string += "(3:3:3";    // creates the 3 over the note grouping for kick drum
			} 
			 
			if( i % grouping_size_for_rests == 0 ) {
				// we will only output a rest for each place there could be a note
				stickings_voice_string += getABCforRest(sticking_array.slice(i), class_empty_note_array, grouping_size_for_rests, scaler, true);
				hh_snare_voice_string += getABCforRest(snare_array.slice(i), HH_array.slice(i), grouping_size_for_rests, scaler, false);
				kick_voice_string += getABCforRest(kick_array.slice(i), class_empty_note_array, grouping_size_for_rests, scaler, true);
			} 
			
			stickings_voice_string += getABCforNote(sticking_array.slice(i), class_empty_note_array, end_of_group, scaler);
			hh_snare_voice_string += getABCforNote(snare_array.slice(i), HH_array.slice(i), end_of_group, scaler);
			kick_voice_string += getABCforNote(kick_array.slice(i), class_empty_note_array, end_of_group, scaler);
			
			if((i % ABC_gen_note_grouping_size(true)) == ABC_gen_note_grouping_size(true)-1) {
			
				stickings_voice_string += " ";
				hh_snare_voice_string += " ";   // Add a space to break the bar line every group notes
				kick_voice_string += " ";
			}
		}
		
		stickings_voice_string += "|";
		hh_snare_voice_string += "|";
		kick_voice_string += "|";
		ABC_String += stickings_voice_string + post_voice_abc + hh_snare_voice_string + post_voice_abc + kick_voice_string + post_voice_abc;
		
		return ABC_String;
	}
	
	// takes 4 arrays 32 elements long that represent the sticking, snare, HH & kick.
	// each element contains either the note value in ABC "F","^g" or false to represent off
	// translates them to an ABC string in 3 voices
	// post_voice_abc is a string added to the end of each voice line that can end the line
	//
	function snare_HH_kick_ABC_for_quads(sticking_array, HH_array, snare_array, kick_array, post_voice_abc, num_notes) {
	
		var scaler = 1;  // we are always in 32ths notes here
		var ABC_String = "";
		var stickings_voice_string = "V:Stickings\n"    // for stickings.  they are all rests with text comments added
		var hh_snare_voice_string = "V:Hands stem=up\n%%voicemap drum\n";     // for hh and snare
		var kick_voice_string = "V:Feet stem=down\n%%voicemap drum\n";   // for kick drum
		
			
		for(var i=0; i < num_notes; i++) {
			
			var grouping_size_for_rests = ABC_gen_note_grouping_size(false);
			
			var end_of_group;
			if(i%ABC_gen_note_grouping_size(false) == 0)
				end_of_group = ABC_gen_note_grouping_size(false);
			else
				end_of_group = (ABC_gen_note_grouping_size(false)-((i)%ABC_gen_note_grouping_size(false)));
					 
			 
			if(i % ABC_gen_note_grouping_size(false) == 0) {
				// we will only output a rest at the beginning of a beat phrase, or if triplets for every space
				var hidden_rest = false;
				stickings_voice_string += getABCforRest(sticking_array.slice(i), class_empty_note_array, grouping_size_for_rests, scaler, true);
				hh_snare_voice_string += getABCforRest(snare_array.slice(i), HH_array.slice(i), grouping_size_for_rests, scaler, hidden_rest);
				kick_voice_string += getABCforRest(kick_array.slice(i), class_empty_note_array, grouping_size_for_rests, scaler, hidden_rest);
			
			} 
			
			stickings_voice_string += getABCforNote(sticking_array.slice(i), class_empty_note_array, end_of_group, scaler);
			hh_snare_voice_string += getABCforNote(snare_array.slice(i), HH_array.slice(i), end_of_group, scaler);
			kick_voice_string += getABCforNote(kick_array.slice(i), class_empty_note_array, end_of_group, scaler);
			
			if((i % ABC_gen_note_grouping_size(false)) == ABC_gen_note_grouping_size(false)-1) {
			
				stickings_voice_string += " ";
				hh_snare_voice_string += " ";   // Add a space to break the bar line every group notes
				kick_voice_string += " ";
			}
		}
		
		stickings_voice_string += "|";
		hh_snare_voice_string += "|";
		kick_voice_string += "|";
		ABC_String += stickings_voice_string + post_voice_abc  + hh_snare_voice_string + post_voice_abc + kick_voice_string + post_voice_abc;
		
		return ABC_String;
	}
	
	// create ABC from note arrays
	root.create_ABC_from_snare_HH_kick_arrays = function(sticking_array, HH_array, snare_array, kick_array, post_voice_abc, num_notes) {
		
		if((num_notes % 3) == 0) { // triplets 
			return snare_HH_kick_ABC_for_triplets(sticking_array, HH_array, snare_array, kick_array, post_voice_abc, num_notes);
		} else {
			return snare_HH_kick_ABC_for_quads(sticking_array, HH_array, snare_array, kick_array, post_voice_abc, num_notes);
		}
	}
	
	
	// callback class for abc generator library
	function SVGLibCallback() {
		// -- required methods
		this.abc_svg_output = "";
		this.abc_error_output = "";
		
		// include a file (%%abc-include)
		this.read_file = function(fn) {
			return "";
		}
		// insert the errors
		this.errmsg = function(msg, l, c) {
			this.abc_error_output += msg + "<br/>\n"
		}
		
		// for possible playback or linkage
		this.get_abcmodel = function(tsfirst, voice_tb, music_types) {
			
			//console.log(tsfirst);
			//var next = tsfirst.next;
			//
			//while(next) {
			//	console.log(next);
			//	next = next.next;	
			//}	
		}
		
		// image output
		this.img_out = function(str) {
			this.abc_svg_output += str	// + '\n'
		}
		
		// -- optional attributes
		this.page_format = true		// define the non-page-breakable blocks
	}
	var abcToSVGCallback = new SVGLibCallback()   // singleton
	
	
	// converts incoming ABC notation source into an svg image.
	// returns an object with two items.   "svg" and "error_html"
	root.renderABCtoSVG = function(abc_source) {
		
		var abc = new Abc(abcToSVGCallback);
		abcToSVGCallback.abc_svg_output = '';   // clear
		abcToSVGCallback.abc_error_output = '';   // clear
		
		diverr.innerHTML = '';
		abc.tosvg("SOURCE", abc_source);
		return {
			svg: abcToSVGCallback.abc_svg_output,
			error_html: abcToSVGCallback.abc_error_output
		};	
	}
	
} // end of class
	