import fs from 'fs';
import path from 'path';

const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');

function fixFixtures() {
    const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));
    console.log(`Processing ${files.length} fixtures...`);

    files.forEach(file => {
        const filePath = path.join(fixturesDir, file);
        const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let modified = false;

        // 1. Fix groove notes
        if (fixture.groove && fixture.groove.notes) {
            fixture.groove.notes.forEach(note => {
                if (note.drum === 'tom2') {
                    note.drum = 'tom1';
                    modified = true;
                } else if (note.drum === 'tom3') {
                    note.drum = 'tom4';
                    modified = true;
                }
            });
        }

        // 2. Fix performance hits
        if (fixture.performance && fixture.performance.hits) {
            fixture.performance.hits.forEach(hit => {
                // Correct drum types to base types for real MIDI simulation
                const oldDrum = hit.drum;
                if (hit.drum === 'snare_ghost' || hit.drum === 'snare_accent' ||
                    hit.drum === 'snare_drag' || hit.drum === 'snare_buzz') {
                    hit.drum = 'snare';
                } else if (hit.drum === 'hh_accent' || hit.drum === 'hh_close') {
                    hit.drum = 'hh_normal';
                } else if (hit.drum === 'tom2') {
                    hit.drum = 'tom1';
                } else if (hit.drum === 'tom3') {
                    hit.drum = 'tom4';
                }

                if (hit.drum !== oldDrum) modified = true;

                // Also fix expectedDrum if present
                if (hit.expectedDrum === 'tom2') {
                    hit.expectedDrum = 'tom1';
                    modified = true;
                } else if (hit.expectedDrum === 'tom3') {
                    hit.expectedDrum = 'tom4';
                    modified = true;
                }
            });
        }

        if (modified) {
            console.log(`Updating ${file}...`);
            fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2));
        }
    });

    console.log('Done!');
}

fixFixtures();
