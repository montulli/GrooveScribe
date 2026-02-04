import { PerformanceGenerator, GROOVES } from '../lib/PerformanceGenerator.js';
import fs from 'fs';
import path from 'path';

const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');

if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

const scenarios = [
    { name: 'perfect', profile: 'perfect', jitterMs: 2 },
    { name: 'good', profile: 'good', jitterMs: 5 },
    { name: 'rushing', profile: 'rushing', jitterMs: 5 },
    { name: 'dragging', profile: 'dragging', jitterMs: 5 },
    { name: 'random', profile: 'random', jitterMs: 15 },
    { name: 'mixed', profile: 'mixed', jitterMs: 10 },
    { name: 'with_misses', profile: 'good', missRate: 0.1, jitterMs: 5 },
    { name: 'with_extras', profile: 'good', extraHitRate: 0.1, jitterMs: 5 }
];

const selectedGrooves = [
    { name: 'basicRock', groove: GROOVES.basicRock },
    { name: 'denseSixteenths', groove: GROOVES.denseSixteenths },
    { name: 'fastTempo', groove: GROOVES.fastTempo },
    { name: 'slowTempo', groove: GROOVES.slowTempo }
];

function generateAllFixtures() {
    const generator = new PerformanceGenerator({ seed: 42 });
    let count = 0;

    for (const { name: grooveName, groove } of selectedGrooves) {
        for (const scenario of scenarios) {
            generator.reset(); // Key for reproducibility per fixture
            const performance = generator.generatePerformance(groove, {
                bpm: groove.bpm,
                timingProfile: scenario.profile,
                missRate: scenario.missRate || 0,
                extraHitRate: scenario.extraHitRate || 0,
                jitterMs: scenario.jitterMs
            });

            const expected = generator.calculateExpectedResults(groove, performance);

            const fixture = {
                meta: {
                    id: `${grooveName}_${scenario.name}`,
                    name: `${grooveName} - ${scenario.name}`,
                    scenario: scenario.name,
                    bpm: groove.bpm
                },
                groove,
                performance,
                expected: { results: expected }
            };

            const filename = `${grooveName}_${scenario.name}.json`;
            const filepath = path.join(fixturesDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2));
            count++;
        }
    }

    console.log(`Successfully generated ${count} fixtures in ${fixturesDir}`);
}

generateAllFixtures();
