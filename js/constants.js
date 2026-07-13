// Drum-notation and MIDI constants shared across the app.
// Extracted from groove_utils.js (Step 2 of the refactor). Both groove_utils.js
// and groove_writer.js import what they need from here.

export const constant_MAX_MEASURES = 10;
export const constant_DEFAULT_TEMPO = 80;
export const constant_ABC_STICK_R = '"R"x';
export const constant_ABC_STICK_L = '"L"x';
export const constant_ABC_STICK_BOTH = '"R/L"x';
export const constant_ABC_STICK_COUNT = '"count"x';
export const constant_ABC_STICK_OFF = '""x';
export const constant_ABC_HH_Ride = "^A'";
export const constant_ABC_HH_Ride_Bell = "^B'";
export const constant_ABC_HH_Cow_Bell = "^D'";
export const constant_ABC_HH_Crash = "^c'";
export const constant_ABC_HH_Stacker = "^d'";
export const constant_ABC_HH_Metronome_Normal = "^e'";
export const constant_ABC_HH_Metronome_Accent = "^f'";
export const constant_ABC_HH_Open = '!open!^g';
export const constant_ABC_HH_Close = '!plus!^g';
export const constant_ABC_HH_Accent = '!accent!^g';
export const constant_ABC_HH_Normal = '^g';
export const constant_ABC_SN_Ghost = '!(.!!).!c';
export const constant_ABC_SN_Accent = '!accent!c';
export const constant_ABC_SN_Normal = 'c';
export const constant_ABC_SN_XStick = '^c';
export const constant_ABC_SN_Buzz = '!///!c';
export const constant_ABC_SN_Flam = '!accent!{/c}c';
export const constant_ABC_SN_Drag = '{/cc}c';
export const constant_ABC_KI_SandK = '[F^d,]'; // kick & splash
export const constant_ABC_KI_Splash = '^d,'; // splash only
export const constant_ABC_KI_Normal = 'F';
export const constant_ABC_T1_Normal = 'e';
export const constant_ABC_T2_Normal = 'd';
export const constant_ABC_T3_Normal = 'B';
export const constant_ABC_T4_Normal = 'A';
export const constant_NUMBER_OF_TOMS = 4;
export const constant_ABC_OFF = false;
export const constant_OUR_MIDI_VELOCITY_NORMAL = 85;
export const constant_OUR_MIDI_VELOCITY_ACCENT = 120;
export const constant_OUR_MIDI_VELOCITY_GHOST = 50;
export const constant_OUR_MIDI_METRONOME_1 = 76;
export const constant_OUR_MIDI_METRONOME_NORMAL = 77;
export const constant_OUR_MIDI_HIHAT_NORMAL = 42;
export const constant_OUR_MIDI_HIHAT_OPEN = 46;
export const constant_OUR_MIDI_HIHAT_ACCENT = 108;
export const constant_OUR_MIDI_HIHAT_CRASH = 49;
export const constant_OUR_MIDI_HIHAT_STACKER = 52;
export const constant_OUR_MIDI_HIHAT_METRONOME_NORMAL = 77;
export const constant_OUR_MIDI_HIHAT_METRONOME_ACCENT = 76;
export const constant_OUR_MIDI_HIHAT_RIDE = 51;
export const constant_OUR_MIDI_HIHAT_RIDE_BELL = 53;
export const constant_OUR_MIDI_HIHAT_COW_BELL = 105;
export const constant_OUR_MIDI_HIHAT_FOOT = 44;
export const constant_OUR_MIDI_SNARE_NORMAL = 38;
export const constant_OUR_MIDI_SNARE_ACCENT = 22;
export const constant_OUR_MIDI_SNARE_GHOST = 21;
export const constant_OUR_MIDI_SNARE_XSTICK = 37;
export const constant_OUR_MIDI_SNARE_BUZZ = 104;
export const constant_OUR_MIDI_SNARE_FLAM = 107;
export const constant_OUR_MIDI_SNARE_DRAG = 103;
export const constant_OUR_MIDI_KICK_NORMAL = 35;
export const constant_OUR_MIDI_TOM1_NORMAL = 48;
export const constant_OUR_MIDI_TOM2_NORMAL = 47;
export const constant_OUR_MIDI_TOM3_NORMAL = 45;
export const constant_OUR_MIDI_TOM4_NORMAL = 43;

// Grid note "on" colors. The gridState readers compare each cell's rendered
// color against these to recover its state; the note setters paint the matching
// color (note-on/snare-accent are painted via their hex form, which the browser
// normalizes to these rgb strings on readback).
export const constant_note_on_color_rgb = 'rgb(0, 0, 0)'; // black
export const constant_snare_accent_on_color_rgb = 'rgb(255, 255, 255)';
export const constant_sticking_right_on_color_rgb = 'rgb(36, 132, 192)';
export const constant_sticking_left_on_color_rgb = 'rgb(57, 57, 57)';
export const constant_sticking_both_on_color_rgb = 'rgb(57, 57, 57)';
export const constant_sticking_count_on_color_rgb = 'rgb(57, 57, 57)';
