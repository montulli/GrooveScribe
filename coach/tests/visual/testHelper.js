/**
 * Visual Test Helper - Can be loaded in the browser console to test the Drum Coach
 * Usage: Copy and paste this into the browser console on the GrooveScribe page
 */

window.CoachTestHelper = {
    /**
     * Load a groove definition into the app
     */
    loadGroove(groove) {
        const writer = window.myGrooveWriter;
        if (!writer || !writer.myGrooveUtils) {
            console.error('GrooveWriter/Utils not found');
            return;
        }

        // If groove has a URL, load directly via loadNewGroove
        if (groove.url) {
            console.log(`[TestHelper] Loading URL-based groove: ${groove.url}`);
            writer.loadNewGroove(groove.url);
            return;
        }

        // Create a new data object correctly
        const data = new writer.myGrooveUtils.grooveDataNew();
        const utils = writer.myGrooveUtils;

        // Basic properties
        data.tempo = groove.tempo || groove.bpm || 120;
        data.numBeats = groove.numBeats || 4;
        data.noteValue = groove.noteValue || 4;
        data.numberOfMeasures = groove.measures || 1;

        // Determine division
        const div = groove.div || groove.timeDivision || 16;
        data.timeDivision = div;
        data.notesPerMeasure = utils.calc_notes_per_measure(data.timeDivision, data.numBeats, data.noteValue);

        const totalNotes = data.notesPerMeasure * data.numberOfMeasures;

        // Initialize arrays
        data.hh_array = new Array(totalNotes).fill(false);
        data.snare_array = new Array(totalNotes).fill(false);
        data.kick_array = new Array(totalNotes).fill(false);
        data.toms_array = [new Array(totalNotes).fill(false), new Array(totalNotes).fill(false), new Array(totalNotes).fill(false), new Array(totalNotes).fill(false)];
        data.sticking_array = new Array(totalNotes).fill(false);

        // Map shortcodes to ABC constants
        const mapToAbc = (drum, val) => {
            if (!val || val === "") return false;
            // If it already looks like ABC notation (e.g. contains ^ or !), use it as-is
            if (typeof val === 'string' && (val.includes('^') || val.includes('!') || val === 'c' || val === 'F' || val === 'e')) return val;
            // Otherwise use the internal helper
            return writer.myGrooveUtils.tablatureToABCNotationPerNote(drum, val);
        };

        // Support array-based groove definitions
        if (groove.hh) groove.hh.forEach((v, i) => data.hh_array[i] = mapToAbc('H', v));
        if (groove.snare) groove.snare.forEach((v, i) => data.snare_array[i] = mapToAbc('S', v));
        if (groove.kick) groove.kick.forEach((v, i) => data.kick_array[i] = mapToAbc('K', v));
        if (groove.toms) {
            groove.toms.forEach((row, tomIdx) => {
                row.forEach((v, i) => data.toms_array[tomIdx][i] = mapToAbc(`T${tomIdx + 1}`, v));
            });
            data.showToms = true;
        }

        // Fallback for simple note-based format
        if (groove.notes) {
            groove.notes.forEach(note => {
                const index = Math.round((note.beat - 1) * (data.notesPerMeasure / data.numBeats));
                if (index >= 0 && index < totalNotes) {
                    const d = note.drum;
                    // Use raw shorthand codes that the timeline generator recognizes
                    if (d === 'kick') data.kick_array[index] = 'o';
                    else if (d === 'kick_splash') data.kick_array[index] = 'x';
                    else if (d === 'snare') data.snare_array[index] = 'o';
                    else if (d === 'snare_ghost') data.snare_array[index] = 'g';
                    else if (d === 'snare_xstick') data.snare_array[index] = 'x';
                    else if (d === 'snare_flam') data.snare_array[index] = 'f';
                    else if (d === 'hh_normal') data.hh_array[index] = 'x';
                    else if (d === 'hh_open') data.hh_array[index] = 'o';
                    else if (d === 'hh_accent') data.hh_array[index] = 'X';
                    else if (d === 'hh_foot') data.kick_array[index] = 'x';
                    else if (d === 'ride') data.hh_array[index] = 'r';
                    else if (d === 'ride_bell') data.hh_array[index] = 'b';
                    else if (d === 'crash') data.hh_array[index] = 'c';
                    else if (d === 'splash') data.hh_array[index] = 's';
                    else if (d === 'china') data.hh_array[index] = 'k';
                    else if (d === 'tom1' || d === 'tom_high') { data.toms_array[0][index] = 'o'; data.showToms = true; }
                    else if (d === 'tom2') { data.toms_array[1][index] = 'o'; data.showToms = true; }
                    else if (d === 'tom3' || d === 'tom_low') { data.toms_array[2][index] = 'o'; data.showToms = true; }
                    else if (d === 'tom4') { data.toms_array[3][index] = 'o'; data.showToms = true; }
                }
            });
        }


        // Use the internal loader to set all the notes and update the UI
        const urlData = writer.myGrooveUtils.getUrlStringFromGrooveData(data, 'fullGrooveScribe');
        const queryIndex = urlData.indexOf('?');
        const queryData = queryIndex !== -1 ? urlData.substring(queryIndex) : '?' + urlData;

        console.log(`[TestHelper] Loading groove with query: ${queryData}`);
        writer.loadNewGroove(queryData);

        console.log('[TestHelper] Loaded groove via loadNewGroove:', groove);
    },

    /**
     * Simulate a MIDI hit at the current playback position
     */
    simulateHit(drum = 'kick', delayMs = 0) {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }
        if (!controller.engine.isPlaying) {
            console.error('Coach session not active');
            return;
        }

        setTimeout(() => {
            const timestamp = performance.now();
            controller.handleMidiHit(drum, timestamp, 100);
            console.log(`[TestHelper] Simulated ${drum} hit at ${timestamp.toFixed(2)}ms`);
        }, delayMs);
    },

    /**
     * Simulate a sequence of hits matching the current groove
     */
    async simulateGroove(timing = 'perfect') {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }

        if (!controller.engine.isPlaying) {
            console.error('Coach session not active - start a session first');
            return;
        }

        const timeline = controller.engine.noteTimeline;
        const startTime = controller.engine.startTime;

        // Calculate timing offset based on profile
        const offsets = {
            perfect: () => 0,
            good: () => (Math.random() - 0.5) * 30,      // -15 to +15ms
            early: () => -20 + (Math.random() * 10),    // -20 to -10ms
            late: () => 10 + (Math.random() * 10),      // +10 to +20ms
            random: () => (Math.random() - 0.5) * 60    // -30 to +30ms
        };

        const getOffset = offsets[timing] || offsets.perfect;

        console.log(`[TestHelper] Simulating groove with "${timing}" timing...`);
        console.log(`[TestHelper] ${timeline.length} notes to simulate`);

        const now = performance.now();

        for (const note of timeline) {
            const targetTime = startTime + note.time;
            const offset = getOffset();
            const hitTime = targetTime + offset;
            const delay = hitTime - now;

            if (delay > 0) {
                setTimeout(() => {
                    controller.handleMidiHit(note.type, performance.now(), 100);
                }, delay);
            }
        }

        console.log(`[TestHelper] All hits scheduled`);
    },

    /**
     * Replay a deterministic performance fixture
     */
    async simulatePerformance(perf) {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }

        // Wait for engine to be synced with playback
        console.log('[TestHelper] Waiting for engine sync...');
        let waitCount = 0;
        while (!controller.isSynced && waitCount < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitCount++;
        }

        if (!controller.isSynced) {
            console.warn('[TestHelper] Engine not synced after 5s, proceeding anyway...');
        } else {
            console.log('[TestHelper] Engine synced! Replaying hits...');
        }

        const startTime = controller.sessionStartTime; // Use controller's synced start time
        const audioLatency = controller.engine.audioLatency || 0;

        // Use the same extraction logic as the controller to get the current state
        const data = window.myGrooveWriter?.grooveDataFromClickableUI();
        const bpm = data?.tempo || 120;
        const beatDurationMs = 60000 / bpm;

        console.log(`[TestHelper] Replaying performance with ${perf.hits.length} hits... (BPM: ${bpm}, audioLatency: ${audioLatency}, startTime: ${startTime.toFixed(2)})`);

        const now = performance.now();

        perf.hits.forEach(hit => {
            // Fix: beatOffset in our fixtures is already the 0-indexed beat position (beat - 1)
            // Doubling it caused simulated hits to drift away from the timeline.
            const totalBeatOffset = hit.beatOffset !== undefined ? hit.beatOffset : (hit.beat ? hit.beat - 1 : 0);
            const hitTime = startTime + (totalBeatOffset * beatDurationMs) + audioLatency + (hit.timingErrorMs || 0);
            const delay = hitTime - now;

            if (true) { // Firing regardless of delay for testing purposes
                setTimeout(() => {
                    console.log(`[TestHelper] Firing ${hit.drum} hit at ${performance.now().toFixed(2)} (scheduled for ${hitTime.toFixed(2)}) (rel: ${(performance.now() - startTime).toFixed(2)})`);
                    // Use the EXACT hitTime as the timestamp for the engine to ensure perfect matching in fixtures
                    controller.handleMidiHit(hit.drum, hitTime, 100);
                }, Math.max(0, delay));
            }
        });
    },

    /**
     * Instantly replay a performance fixture for faster testing
     */
    simulatePerformanceInstant: function (perf) {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }

        const startTime = controller.sessionStartTime;
        const bpm = perf.bpm || 80;
        const beatDurationMs = 60000 / bpm;
        const audioLatency = perf.audioLatencyMs || 0;

        perf.hits.forEach(hit => {
            const totalBeatOffset = hit.beatOffset !== undefined ? hit.beatOffset : (hit.beat ? hit.beat - 1 : 0);
            const hitTime = startTime + (totalBeatOffset * beatDurationMs) + audioLatency + (hit.timingErrorMs || 0);

            // Fire immediately with the correct theoretical timestamp
            controller.handleMidiHit(hit.drum, hitTime, 0.8);
        });

        console.log(`[TestHelper] Instantly replayed ${perf.hits.length} hits.`);
    },

    /**
     * Start a coach session (calls the start button programmatically)
     */
    async startSession() {
        const controller = window.coachController;
        if (controller) {
            try {
                // Disable repeat for tests
                if (window.myGrooveWriter?.myGrooveUtils) {
                    window.myGrooveWriter.myGrooveUtils.shouldMIDIRepeat = false;
                }
                await controller.startSession();
                console.log('[TestHelper] Session started');
            } catch (error) {
                console.error('[TestHelper] Failed to start session:', error.message || error);
                throw error;
            }
        } else {
            console.error('CoachController not found');
        }
    },

    /**
     * Start a coach session in headless mode (bypasses MIDI playback)
     * This directly initializes the engine for testing without audio context
     */
    startSessionHeadless() {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }

        // Disable repeat for tests
        if (window.myGrooveWriter?.myGrooveUtils) {
            window.myGrooveWriter.myGrooveUtils.shouldMIDIRepeat = false;
        }

        // Get current groove data from writer
        const grooveData = controller.getGrooveAsTimeline();

        // Setup engine with normal tolerance
        const toleranceWindows = { perfect: 20, good: 35, close: 50 };
        controller.engine.windows = toleranceWindows;
        controller.engine.audioLatency = controller.latencyManager.getTotalOffset();
        controller.engine.loadGroove({ target: grooveData });

        // Activate coaching mode
        controller.isCoachingActive = true;
        controller.currentRepetition = 0;

        // Initialize UI
        controller.renderer.init();
        controller.renderer.clearFeedback();

        // Manually trigger playback start (bypassing MIDI)
        controller.sessionStartTime = performance.now();
        controller._refreshAbcMapping();
        controller.engine.start(controller.sessionStartTime);
        controller._setRendererGrooveContext(); // Set groove context for time-based rendering
        controller.isSynced = true;

        console.log('[TestHelper] Headless session started');
    },


    /**
     * Stop the coach session
     */
    stopSession() {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }
        controller.stopSession();
        console.log('[TestHelper] Session stopped');
    },

    /**
     * Get current results
     */
    getResults() {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return null;
        }
        return controller.engine.getResults();
    },

    /**
     * Check if the visual feedback layer exists
     */
    checkVisualFeedback() {
        const controller = window.coachController;
        if (!controller) {
            console.error('CoachController not found');
            return;
        }

        const renderer = controller.renderer;
        console.log('[TestHelper] Renderer diagnostics:');
        console.log('  - svgElement:', renderer.svgElement ? 'found' : 'NOT FOUND');
        console.log('  - feedbackLayer:', renderer.feedbackLayer ? 'found' : 'NOT FOUND');
        console.log('  - noteRects:', renderer.noteRects.length);

        // Check for abcr rectangles
        const svg = document.querySelector('#svgTarget svg');
        if (svg) {
            const rects = svg.querySelectorAll('rect.abcr');
            console.log('  - rect.abcr elements in SVG:', rects.length);
        } else {
            console.log('  - SVG element: NOT FOUND');
        }

        // Check note_mapping_array
        const mappingArray = window.myGrooveWriter?.myGrooveUtils?.note_mapping_array;
        if (mappingArray) {
            console.log('  - note_mapping_array length:', mappingArray.length);
            console.log('  - note_mapping_array active notes:', mappingArray.filter(x => x).length);
        } else {
            console.log('  - note_mapping_array: NOT FOUND');
        }
    },

    /**
     * Enable/disable debug grid
     */
    setDebugMode(enabled) {
        const controller = window.coachController;
        if (controller && controller.state) {
            controller.state.showDebug = enabled;
            console.log(`[TestHelper] Debug grid ${enabled ? 'enabled' : 'disabled'}`);
        }
    },

    /**
     * Run a full visual test
     */
    async runFullTest() {
        console.log('=== Starting Full Visual Test ===');

        // Check prerequisites
        this.checkVisualFeedback();

        // Start session
        this.startSession();

        // Wait a moment for playback to start
        await new Promise(r => setTimeout(r, 500));

        // Simulate groove with perfect timing
        await this.simulateGroove('perfect');

        // Wait for the pattern to complete
        const bpm = window.myGrooveWriter?.myGrooveUtils?.myGrooveData?.tempo || 80;
        const measureDuration = (60000 / bpm) * 4;

        console.log(`[TestHelper] Waiting ${measureDuration}ms for pattern to complete...`);
        await new Promise(r => setTimeout(r, measureDuration + 500));

        // Get results
        const results = this.getResults();
        console.log('[TestHelper] Results:', results);

        // Stop session
        this.stopSession();

        console.log('=== Visual Test Complete ===');
        return results;
    }
};

console.log('[CoachTestHelper] Loaded! Use window.CoachTestHelper.runFullTest() to test');
console.log('[CoachTestHelper] Available methods:');
console.log('  - startSession()');
console.log('  - stopSession()');
console.log('  - simulateHit(drum, delayMs)');
console.log('  - simulateGroove(timing) - timing: perfect, good, early, late, random');
console.log('  - getResults()');
console.log('  - checkVisualFeedback()');
console.log('  - runFullTest()');
