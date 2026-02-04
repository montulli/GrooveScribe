/**
 * Comprehensive Groove Library for Testing
 * Contains all grooves from the GrooveScribe UI plus additional test patterns.
 * 
 * Each groove is defined in the Coach format (notes with drum/beat) and includes
 * the original URL string for visual tests.
 */

// Helper to parse URL string to groove notes
function parseGrooveUrl(url) {
    const params = new URLSearchParams(url.replace('?', ''));
    const timeSig = params.get('TimeSig') || '4/4';
    const [numBeats, noteValue] = timeSig.split('/').map(Number);
    const div = parseInt(params.get('Div') || '16');
    const tempo = parseInt(params.get('Tempo') || '80');
    const measures = parseInt(params.get('Measures') || '1');

    const notesPerBeat = div / noteValue;
    const notesPerMeasure = div;
    const totalNotes = notesPerMeasure * measures;

    // Duration of each grid position in beats
    const gridBeat = numBeats / notesPerMeasure;

    const notes = [];

    // Parse hi-hat
    const hhStr = params.get('H') || '';
    const hhNotes = hhStr.replace(/\|/g, '').split('');
    hhNotes.forEach((char, idx) => {
        if (char !== '-' && char !== '') {
            const beat = 1 + (idx * gridBeat);
            let drum = 'hh_normal';
            if (char === 'o' || char === 'O') drum = 'hh_open';
            else if (char === 'x') drum = 'hh_normal';
            else if (char === 'X') drum = 'hh_accent';
            else if (char === 'r' || char === 'R') drum = 'ride';
            else if (char === 'b' || char === 'B') drum = 'ride_bell';
            else if (char === 'c' || char === 'C') drum = 'crash';
            notes.push({ drum, beat, char });
        }
    });

    // Parse snare
    const snareStr = params.get('S') || '';
    const snareNotes = snareStr.replace(/\|/g, '').split('');
    snareNotes.forEach((char, idx) => {
        if (char !== '-' && char !== '') {
            const beat = 1 + (idx * gridBeat);
            let drum = 'snare';
            if (char === 'g') drum = 'snare_ghost';
            else if (char === 'f' || char === 'X') drum = 'snare_flam';
            else if (char === 'x') drum = 'snare_xstick';
            else if (char === 'o' || char === 'O') drum = 'snare';
            notes.push({ drum, beat, char });
        }
    });

    // Parse kick
    const kickStr = params.get('K') || '';
    const kickNotes = kickStr.replace(/\|/g, '').split('');
    kickNotes.forEach((char, idx) => {
        if (char !== '-' && char !== '') {
            const beat = 1 + (idx * gridBeat);
            // 'x' = foot hi-hat only
            // 'X' = kick + foot hi-hat together (unison)
            // 'o'/'O' = kick only
            if (char === 'x') {
                notes.push({ drum: 'hh_foot', beat, char });
            } else if (char === 'X') {
                // Uppercase X = both kick AND hh_foot
                notes.push({ drum: 'kick', beat, char });
                notes.push({ drum: 'hh_foot', beat, char });
            } else if (char === 'o' || char === 'O') {
                notes.push({ drum: 'kick', beat, char });
            }
        }
    });

    // Parse toms
    for (let t = 1; t <= 4; t++) {
        const tomStr = params.get(`T${t}`) || '';
        const tomNotes = tomStr.replace(/\|/g, '').split('');
        tomNotes.forEach((char, idx) => {
            if (char !== '-' && char !== '') {
                const beat = 1 + (idx * gridBeat);
                notes.push({ drum: `tom${t}`, beat, char });
            }
        });
    }

    // Sort by beat
    notes.sort((a, b) => a.beat - b.beat);

    return {
        timeSig,
        numBeats,
        noteValue,
        div,
        tempo,
        measures,
        notes,
        url
    };
}

// ============================================================================
// ROCK GROOVES (from js/grooves.js)
// ============================================================================

export const ROCK_GROOVES = {
    emptyGroove16th: {
        name: 'Empty 16th note groove',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|')
    },

    rock8th: {
        name: '8th Note Rock',
        url: '?TimeSig=4/4&Div=8&Tempo=80&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---o---|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=8&Tempo=80&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---o---|')
    },

    rock16th: {
        name: '16th Note Rock',
        // Corrected version with proper 8 kick notes per measure grid
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|')
    },

    syncopatedHH1: {
        name: 'Syncopated Hi-hats #1',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----O-------O---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----O-------O---|&K=|o-------o-------|')
    },

    syncopatedHH2: {
        name: 'Syncopated Hi-hats #2',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxx-xxx-xxx-xxx-|&S=|----O-------O---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxx-xxx-xxx-xxx-|&S=|----O-------O---|&K=|o-------o-------|')
    },

    trainBeat: {
        name: 'Train Beat',
        url: '?TimeSig=4/4&Div=16&Tempo=95&Measures=1&H=|----------------|&S=|ggOgggOgggOggOOg|&K=|o-x-o-x-o-x-o-x-|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=95&Measures=1&H=|----------------|&S=|ggOgggOgggOggOOg|&K=|o-x-o-x-o-x-o-x-|')
    }
};

// ============================================================================
// TRIPLET GROOVES (from js/grooves.js)
// ============================================================================

export const TRIPLET_GROOVES = {
    jazzShuffle: {
        name: 'Jazz Shuffle',
        url: '?TimeSig=4/4&Div=12&Tempo=100&Measures=1&H=|r--r-rr--r-r|&S=|g-gO-gg-gO-g|&K=|o--X--o--X--|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=12&Tempo=100&Measures=1&H=|r--r-rr--r-r|&S=|g-gO-gg-gO-g|&K=|o--X--o--X--|')
    },

    halfTimeShuffle8th: {
        name: 'Half Time Shuffle in 8th notes',
        url: '?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|------------|')
    },

    halfTimeShuffle16th: {
        name: 'Half Time Shuffle in 16th notes',
        url: '?TimeSig=4/4&Div=24&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=24&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|')
    },

    purdieShuffle: {
        name: 'Purdie Shuffle',
        url: '?TimeSig=4/4&Div=12&Tempo=120&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|o----o-----o|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=12&Tempo=120&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|o----o-----o|')
    },

    jazzRide: {
        name: 'Jazz Ride',
        url: '?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|r--r-rr--r-r|&S=|------------|&K=|---x-----x--|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|r--r-rr--r-r|&S=|------------|&K=|---x-----x--|')
    }
};

// ============================================================================
// WORLD GROOVES (from js/grooves.js)
// ============================================================================

export const WORLD_GROOVES = {
    bossaNova: {
        name: 'Bossa Nova',
        url: '?TimeSig=4/4&Div=8&Tempo=140&Measures=2&H=|xxxxxxxx|xxxxxxxx|&S=|x-x--x-x|-x--x-x-|&K=|o-xoo-xo|o-xoo-xo|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=8&Tempo=140&Measures=2&H=|xxxxxxxx|xxxxxxxx|&S=|x-x--x-x|-x--x-x-|&K=|o-xoo-xo|o-xoo-xo|')
    },

    jazzSamba: {
        name: 'Jazz Samba',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|r-rrr-rrr-rrr-rr|&S=|o-o--o-o-o-oo-o-|&K=|o-xoo-xoo-xoo-xo|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|r-rrr-rrr-rrr-rr|&S=|o-o--o-o-o-oo-o-|&K=|o-xoo-xoo-xoo-xo|')
    },

    songo: {
        name: 'Songo',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|x---x---x---x---|&S=|--O--g-O-gg--g-g|&K=|---o--o----o--o-|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|x---x---x---x---|&S=|--O--g-O-gg--g-g|&K=|---o--o----o--o-|')
    }
};

// ============================================================================
// FOOT OSTINATOS (from js/grooves.js)
// ============================================================================

export const FOOT_OSTINATOS = {
    sambaOstinato: {
        name: 'Samba Ostinato',
        url: '?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xoo-xoo-xoo-xo|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xoo-xoo-xoo-xo|')
    },

    tumbaoOstinato: {
        name: 'Tumbao Ostinato',
        url: '?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|x--ox-o-x--ox-o-|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|x--ox-o-x--ox-o-|')
    },

    baiaoOstinato: {
        name: 'Baiao Ostinato',
        url: '?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xo--X-o-xo--X-|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xo--X-o-xo--X-|')
    }
};

// ============================================================================
// KICK PERMUTATIONS (16th note grid, Kick variations over basic rock)
// ============================================================================

export const KICK_PERMUTATIONS = {
    kickQuarters: {
        name: 'Kick on Quarters',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o---o---o---o---|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o---o---o---o---|')
    },

    kickAndOf1And3: {
        name: 'Kick on 1, &1, 3, &3',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-o-----o-o-----|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-o-----o-o-----|')
    },

    kickSyncopated: {
        name: 'Syncopated Kick Pattern',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-----o-o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-----o-o-------|')
    },

    kickEand: {
        name: 'Kick on e-and pattern',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|-oo-----o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|-oo-----o-------|')
    },

    kickDense: {
        name: 'Dense Kick Pattern',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-o-o-o-o-o-o-o-|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-o-o-o-o-o-o-o-|')
    }
};

// ============================================================================
// SNARE PERMUTATIONS (from 2 & 4 backbeat variations)
// ============================================================================

export const SNARE_PERMUTATIONS = {
    snareBackbeat: {
        name: 'Standard Backbeat (2 and 4)',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|')
    },

    snareWithGhosts: {
        name: 'Backbeat with Ghosts',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|g---O--gg---O-g-|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|g---O--gg---O-g-|&K=|o-------o-------|')
    },

    snareHalfTime: {
        name: 'Half Time Feel (snare on 3)',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|--------O-------|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|--------O-------|&K=|o-------o-------|')
    },

    snareQuarters: {
        name: 'Snare on all Quarters',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|O---O---O---O---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|O---O---O---O---|&K=|o-------o-------|')
    },

    snareGhostPattern: {
        name: 'Dense Ghost Pattern',
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|g-g-O-g-g-g-O-g-|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|g-g-O-g-g-g-O-g-|&K=|o-------o-------|')
    },

    snareFlam: {
        name: 'Flam Pattern',
        // 'f' = flam - grace note + primary on same beat in GrooveScribe
        // Flams on beats 2 and 4 with simple rock kick
        url: '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----f-------f---|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----f-------f---|&K=|o-------o-------|')
    }
};

// ============================================================================
// SPECIAL TEST PATTERNS
// ============================================================================

export const TEST_PATTERNS = {
    singleKick: {
        name: 'Single Kick',
        url: '?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------| &S=|----------------| &K=|o---------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------|&S=|----------------|&K=|o---------------|')
    },

    singleSnare: {
        name: 'Single Snare',
        url: '?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------|&S=|----o-----------|&K=|----------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------|&S=|----o-----------|&K=|----------------|')
    },

    kickSnareUnison: {
        name: 'Kick+Snare Unison',
        url: '?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------|&S=|o---------------|&K=|o---------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|----------------|&S=|o---------------|&K=|o---------------|')
    },

    tripleUnison: {
        name: 'Triple Unison (Kick+Snare+HH)',
        url: '?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|x---------------|&S=|o---------------|&K=|o---------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|x---------------|&S=|o---------------|&K=|o---------------|')
    },

    denseSixteenths: {
        name: 'Dense 16th Note Hi-Hats',
        url: '?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----------------|&K=|----------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=120&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----------------|&K=|----------------|')
    },

    all32ndNotes: {
        name: '32nd Note Hi-Hats',
        url: '?TimeSig=4/4&Div=32&Tempo=60&Measures=1&H=|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|&S=|--------------------------------|&K=|--------------------------------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=32&Tempo=60&Measures=1&H=|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|&S=|--------------------------------|&K=|--------------------------------|')
    },

    allDrumsSequential: {
        name: 'All Drums Sequential',
        // kick, snare, hh, hh_open, tom1, tom2, ride, crash on 8th notes
        url: '?TimeSig=4/4&Div=8&Tempo=120&Measures=1&H=|--xo--rc|&S=|-o------|&K=|o-------|&T1=|----o---|&T2=|-----o--|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=8&Tempo=120&Measures=1&H=|--xo--rc|&S=|-o------|&K=|o-------|&T1=|----o---|&T2=|-----o--|')
    },

    allArticulations: {
        name: 'All Articulations',
        // Measure 1: snare, ghost, xstick, flam, hh, open, accent
        // Measure 2: kick, hh_foot, ride, ride_bell, crash, tom1, tom2
        url: '?TimeSig=4/4&Div=8&Tempo=80&Measures=2&H=|----xoX-|--rbcc--|&S=|ogxf----|--------|&K=|--------|ox------|&T1=|--------|------o-|&T2=|--------|-------o|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=8&Tempo=80&Measures=2&H=|----xoX-|--rbcc--|&S=|ogxf----|--------|&K=|--------|ox------|&T1=|--------|------o-|&T2=|--------|-------o|')
    },

    verticalStack4: {
        name: '4-Voice Vertical Stack',
        // Kick+Snare+HH+Crash on beats 1 and 3
        url: '?TimeSig=4/4&Div=16&Tempo=100&Measures=1&H=|c-------c-------|&S=|o-------o-------|&K=|o-------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=100&Measures=1&H=|c-------c-------|&S=|o-------o-------|&K=|o-------o-------|')
    },

    tomFill: {
        name: 'Tom Fill Pattern',
        // Classic descending tom fill: kick, then tom1→tom2→tom3→tom4, ending with crash+kick
        // Using 16th notes for clear spacing
        url: '?TimeSig=4/4&Div=16&Tempo=100&Measures=1&H=|---------------c|&S=|----------------|&K=|o--------------o|&T1=|--o-------------|&T2=|----o-----------|&T3=|------o---------|&T4=|--------o-------|',
        ...parseGrooveUrl('?TimeSig=4/4&Div=16&Tempo=100&Measures=1&H=|---------------c|&S=|----------------|&K=|o--------------o|&T1=|--o-------------|&T2=|----o-----------|&T3=|------o---------|&T4=|--------o-------|')
    },

    polyrhythm3over4: {
        name: 'Polyrhythm 3 over 4',
        timeSig: '4/4',
        tempo: 100,
        measures: 1,
        notes: [
            // 4 quarter notes on kick
            { drum: 'kick', beat: 1.0 },
            { drum: 'kick', beat: 2.0 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'kick', beat: 4.0 },
            // 3 triplet notes on snare
            { drum: 'snare', beat: 1.0 },
            { drum: 'snare', beat: 1 + (4 / 3) },
            { drum: 'snare', beat: 1 + (8 / 3) }
        ]
    },

    oddMeter7over8: {
        name: '7/8 Time Signature',
        timeSig: '7/8',
        tempo: 90,
        measures: 1,
        notes: [
            { drum: 'kick', beat: 1.0 },
            { drum: 'hh_normal', beat: 1.0 },
            { drum: 'hh_normal', beat: 1.5 },
            { drum: 'snare', beat: 2.0 },
            { drum: 'hh_normal', beat: 2.0 },
            { drum: 'hh_normal', beat: 2.5 },
            { drum: 'kick', beat: 3.0 },
            { drum: 'hh_normal', beat: 3.0 }
        ]
    }
};

// ============================================================================
// AGGREGATE ALL GROOVES
// ============================================================================

export const ALL_GROOVES = {
    ...ROCK_GROOVES,
    ...TRIPLET_GROOVES,
    ...WORLD_GROOVES,
    ...FOOT_OSTINATOS,
    ...KICK_PERMUTATIONS,
    ...SNARE_PERMUTATIONS,
    ...TEST_PATTERNS
};

export const GROOVE_CATEGORIES = {
    'Rock Grooves': ROCK_GROOVES,
    'Triplet Grooves': TRIPLET_GROOVES,
    'World Grooves': WORLD_GROOVES,
    'Foot Ostinatos': FOOT_OSTINATOS,
    'Kick Permutations': KICK_PERMUTATIONS,
    'Snare Permutations': SNARE_PERMUTATIONS,
    'Test Patterns': TEST_PATTERNS
};

// Helper to get all grooves as flat array
export function getAllGrooves() {
    const result = [];
    for (const [category, grooves] of Object.entries(GROOVE_CATEGORIES)) {
        for (const [key, groove] of Object.entries(grooves)) {
            result.push({
                id: key,
                category,
                ...groove
            });
        }
    }
    return result;
}

// Helper to convert to test format
export function toTestFormat(groove) {
    return {
        timeSignature: groove.timeSig || '4/4',
        measures: groove.measures || 1,
        bpm: groove.tempo || 80,
        div: groove.div || 16,
        notes: groove.notes || [],
        url: groove.url
    };
}

export default {
    ROCK_GROOVES,
    TRIPLET_GROOVES,
    WORLD_GROOVES,
    FOOT_OSTINATOS,
    KICK_PERMUTATIONS,
    SNARE_PERMUTATIONS,
    TEST_PATTERNS,
    ALL_GROOVES,
    GROOVE_CATEGORIES,
    getAllGrooves,
    toTestFormat
};
