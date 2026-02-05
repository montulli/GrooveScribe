/**
 * Centralized drum pad identifiers to avoid literal string duplication
 */
export const DrumType = {
    KICK: 'kick',
    SNARE: 'snare',
    SNARE_GHOST: 'snare_ghost',
    SNARE_XSTICK: 'snare_xstick',
    SNARE_FLAM: 'snare_flam',
    SNARE_DRAG: 'snare_drag',
    SNARE_BUZZ: 'snare_buzz',
    SNARE_ACCENT: 'snare_accent',

    HH_NORMAL: 'hh_normal',
    HH_FOOT: 'hh_foot',
    HH_OPEN: 'hh_open',
    HH_CLOSE: 'hh_close',
    HH_ACCENT: 'hh_accent',

    TOM1: 'tom1',
    TOM4: 'tom4',

    CRASH: 'crash',
    RIDE: 'ride',
    RIDE_BELL: 'ride_bell',
    COWBELL: 'cow_bell',
    STACKER: 'stacker',

    METRONOME_NORMAL: 'metronome_normal',
    METRONOME_ACCENT: 'metronome_accent',

    // Virtual types for rendering/engine
    FLAM_GRACE: 'flam_grace',
    UNKNOWN: 'unknown'
};


/**
 * List of drum types that are supported by the editor grid.
 * Hits for types not in this list should be ignored or mapped.
 */
export const SupportedDrumTypes = [
    DrumType.KICK,
    DrumType.SNARE,
    DrumType.SNARE_GHOST,
    DrumType.SNARE_XSTICK,
    DrumType.SNARE_FLAM,
    DrumType.SNARE_DRAG,
    DrumType.SNARE_BUZZ,
    DrumType.SNARE_ACCENT,
    DrumType.HH_NORMAL,
    DrumType.HH_FOOT,
    DrumType.HH_OPEN,
    DrumType.HH_CLOSE,
    DrumType.HH_ACCENT,
    DrumType.TOM1,
    DrumType.TOM4,
    DrumType.CRASH,
    DrumType.RIDE,
    DrumType.RIDE_BELL,
    DrumType.COWBELL,
    DrumType.STACKER,
    DrumType.METRONOME_NORMAL,
    DrumType.METRONOME_ACCENT
];
