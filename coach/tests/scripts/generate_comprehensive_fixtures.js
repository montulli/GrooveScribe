/**
 * Comprehensive Fixture Generator
 * Generates test fixtures for all grooves from the UI and all performance profiles.
 * 
 * Run with: node --experimental-vm-modules coach/tests/scripts/generate_comprehensive_fixtures.js
 */
import { PerformanceGenerator, GROOVES } from '../lib/PerformanceGenerator.js';
import {
    ROCK_GROOVES,
    TRIPLET_GROOVES,
    WORLD_GROOVES,
    FOOT_OSTINATOS,
    KICK_PERMUTATIONS,
    SNARE_PERMUTATIONS,
    TEST_PATTERNS,
    toTestFormat
} from '../lib/GrooveLibrary.js';
import fs from 'fs';
import path from 'path';

const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');

if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

// All performance scenarios
const PERFORMANCE_SCENARIOS = [
    // Basic timing profiles
    { name: 'perfect', profile: 'perfect', jitterMs: 2 },
    { name: 'good', profile: 'good', jitterMs: 5 },
    { name: 'rushing', profile: 'rushing', jitterMs: 5 },
    { name: 'dragging', profile: 'dragging', jitterMs: 5 },
    { name: 'random', profile: 'random', jitterMs: 15 },
    { name: 'mixed', profile: 'mixed', jitterMs: 10 },

    // Error scenarios
    { name: 'with_misses', profile: 'good', missRate: 0.15, jitterMs: 5 },
    { name: 'with_extras', profile: 'good', extraHitRate: 0.15, jitterMs: 5 },

    // All hit types (for testing visual feedback colors)
    { name: 'all_hit_types', profile: 'allHitTypes', jitterMs: 0 },

    // Individual tier tests
    { name: 'only_perfect', profile: 'onlyPerfect', jitterMs: 0 },
    { name: 'only_good', profile: 'onlyGood', jitterMs: 0 },
    { name: 'only_close', profile: 'onlyClose', jitterMs: 0 },
    { name: 'only_miss', profile: 'onlyMiss', jitterMs: 0 }
];

// Grooves to generate fixtures for
const GROOVE_SETS = {
    'rock': ROCK_GROOVES,
    'triplet': TRIPLET_GROOVES,
    'world': WORLD_GROOVES,
    'ostinato': FOOT_OSTINATOS,
    'kick_perm': KICK_PERMUTATIONS,
    'snare_perm': SNARE_PERMUTATIONS,
    'test': TEST_PATTERNS
};

// Quick test grooves (subset for fast test runs)
const QUICK_TEST_GROOVES = {
    'rock16th': ROCK_GROOVES.rock16th,
    'trainBeat': ROCK_GROOVES.trainBeat,
    'jazzShuffle': TRIPLET_GROOVES.jazzShuffle,
    'bossaNova': WORLD_GROOVES.bossaNova,
    'singleKick': TEST_PATTERNS.singleKick,
    'tripleUnison': TEST_PATTERNS.tripleUnison,
    'denseSixteenths': TEST_PATTERNS.denseSixteenths,
    'verticalStack4': TEST_PATTERNS.verticalStack4
};

function generateFixture(grooveKey, groove, scenario, generator) {
    generator.reset();

    // Convert groove to test format
    const testGroove = toTestFormat(groove);

    const performance = generator.generatePerformance(testGroove, {
        bpm: testGroove.bpm,
        timingProfile: scenario.profile,
        missRate: scenario.missRate || 0,
        extraHitRate: scenario.extraHitRate || 0,
        jitterMs: scenario.jitterMs
    });

    const expected = generator.calculateExpectedResults(testGroove, performance);

    return {
        meta: {
            id: `${grooveKey}_${scenario.name}`,
            name: `${groove.name || grooveKey} - ${scenario.name}`,
            scenario: scenario.name,
            bpm: testGroove.bpm,
            noteCount: testGroove.notes.length,
            category: groove.category || 'general'
        },
        groove: testGroove,
        performance,
        expected: { results: expected }
    };
}

function generateAllFixtures(fullSuite = false) {
    const generator = new PerformanceGenerator({ seed: 42 });
    let count = 0;
    const manifest = [];

    const groovesToProcess = fullSuite ?
        Object.entries(GROOVE_SETS).flatMap(([cat, grooves]) =>
            Object.entries(grooves).map(([key, groove]) => ({ key, groove, category: cat }))
        ) :
        Object.entries(QUICK_TEST_GROOVES).map(([key, groove]) => ({ key, groove, category: 'quick' }));

    for (const { key: grooveKey, groove, category } of groovesToProcess) {
        // Skip empty grooves
        if (!groove.notes || groove.notes.length === 0) {
            console.log(`Skipping ${grooveKey} (no notes)`);
            continue;
        }

        for (const scenario of PERFORMANCE_SCENARIOS) {
            const fixture = generateFixture(grooveKey, groove, scenario, generator);
            fixture.meta.category = category;

            const filename = `${grooveKey}_${scenario.name}.json`;
            const filepath = path.join(fixturesDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2));

            manifest.push({
                id: fixture.meta.id,
                filename,
                grooveKey,
                scenario: scenario.name,
                noteCount: fixture.meta.noteCount,
                category
            });

            count++;
        }
    }

    // Generate special fixtures
    console.log('Generating special fixtures...');

    // 1. Wrong pad hits fixture
    generator.reset();
    const wrongPadGroove = toTestFormat(ROCK_GROOVES.rock16th);
    const wrongPadPerf = generator.generateWrongPadPerformance(wrongPadGroove, {
        bpm: wrongPadGroove.bpm,
        wrongPadRate: 0.3
    });
    const wrongPadFixture = {
        meta: {
            id: 'rock16th_wrong_pads',
            name: '16th Note Rock - Wrong Pad Hits',
            scenario: 'wrong_pads',
            bpm: wrongPadGroove.bpm,
            noteCount: wrongPadGroove.notes.length,
            category: 'special'
        },
        groove: wrongPadGroove,
        performance: wrongPadPerf,
        expected: {
            results: {
                note: 'Some hits on wrong pads will be marked as extra or miss'
            }
        }
    };
    fs.writeFileSync(
        path.join(fixturesDir, 'rock16th_wrong_pads.json'),
        JSON.stringify(wrongPadFixture, null, 2)
    );
    count++;

    // 2. All MIDI hits fixture
    generator.reset();
    const allHitsPerf = generator.generateAllHitsPerformance(80);
    const allHitsFixture = {
        meta: {
            id: 'all_midi_hits',
            name: 'All MIDI Hit Types',
            scenario: 'all_hits',
            bpm: 80,
            noteCount: allHitsPerf.hits.length,
            category: 'special'
        },
        groove: {
            timeSignature: '4/4',
            measures: 2,
            bpm: 80,
            notes: allHitsPerf.hits.map(h => ({ drum: h.drum, beat: h.beat }))
        },
        performance: allHitsPerf,
        expected: {
            results: {
                perfect: allHitsPerf.hits.length,
                allDrums: allHitsPerf.allDrums
            }
        }
    };
    fs.writeFileSync(
        path.join(fixturesDir, 'all_midi_hits_perfect.json'),
        JSON.stringify(allHitsFixture, null, 2)
    );
    count++;

    // Write manifest
    const manifestPath = path.join(fixturesDir, '_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
        generated: new Date().toISOString(),
        totalFixtures: count,
        scenarios: PERFORMANCE_SCENARIOS.map(s => s.name),
        fixtures: manifest
    }, null, 2));

    console.log(`\nSuccessfully generated ${count} fixtures in ${fixturesDir}`);
    console.log(`Manifest written to ${manifestPath}`);

    return count;
}

// Check command line args
const args = process.argv.slice(2);
const fullSuite = args.includes('--full');

if (fullSuite) {
    console.log('Generating FULL fixture suite (all grooves × all scenarios)...\n');
} else {
    console.log('Generating QUICK fixture suite (subset of grooves × all scenarios)...');
    console.log('Run with --full flag for complete suite.\n');
}

generateAllFixtures(fullSuite);
