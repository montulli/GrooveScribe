/**
 * Performance Playback UI Tests
 * Tests the full performance playback workflow with fixture-driven scenarios.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

describe('Drum Coach Performance Playback UI', () => {
    let browser;
    let page;
    const testHelperPath = path.resolve(process.cwd(), 'coach/tests/visual/testHelper.js');
    const testHelperCode = fs.readFileSync(testHelperPath, 'utf8');
    const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');

    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();

        // Capture browser console logs
        page.on('console', msg => {
            console.log(`[BROWSER] ${msg.text()}`);
        });

        await page.setViewport({ width: 1280, height: 800 });
    });

    afterAll(async () => {
        await browser.close();
    });

    async function runFixtureTest(fixtureName, expectedMarkerCount) {
        const fixturePath = path.join(fixturesDir, fixtureName);
        if (!fs.existsSync(fixturePath)) {
            console.log(`Fixture not found: ${fixturePath}`);
            return { skipped: true };
        }

        const PERFECT_BLUE = '#00BFFF';
        const GOOD_GREEN = '#32CD32';
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        console.log(`Running UI test for fixture: ${fixture.meta.name} (${fixture.meta.bpm} BPM)`);

        // 1. Navigate to the app (start with any state)
        await page.goto('http://localhost:8080/', { waitUntil: 'load' });

        // 2. Wait for the app to be ready
        await page.waitForFunction(() => {
            return window.myGrooveWriter !== undefined &&
                typeof window.myGrooveWriter.loadNewGroove === 'function';
        }, { timeout: 15000 });

        // 3. Inject test helper
        await page.evaluate(testHelperCode);

        // 4. Load the specific groove from the fixture
        await page.evaluate((g) => window.CoachTestHelper.loadGroove(g), fixture.groove);

        // 5. Wait for SVG to be rendered and note rectangles to be present
        await page.waitForFunction(() => {
            const svg = document.querySelector('#svgTarget svg');
            return svg && svg.querySelectorAll('rect.abcr').length > 0;
        }, { timeout: 15000 });


        // 6. Start coach session in headless mode (bypasses MIDI playback)
        await page.evaluate(() => window.CoachTestHelper.startSessionHeadless());

        // 6. Play back the performance
        await page.evaluate((p) => window.CoachTestHelper.simulatePerformance(p), fixture.performance);

        // 7. Wait for the performance to finish
        const beatDurationMs = 60000 / fixture.meta.bpm;
        const durationMs = (fixture.groove.measures || 1) * 4 * beatDurationMs;

        console.log(`Waiting ${durationMs + 1000}ms for performance to complete...`);
        await new Promise(r => setTimeout(r, durationMs + 1000));

        // 8. Verify markers
        const result = await page.evaluate(() => {
            const markers = Array.from(document.querySelectorAll('.coach-hit-marker'));
            return {
                markerCount: markers.length,
                markerColors: markers.map(m => window.getComputedStyle(m).fill)
            };
        });

        const markerCount = result.markerCount;
        // Match both hex and rgb formats (normalized to FeedbackRenderer names)
        const isGoodColor = (c) => {
            return c === 'rgb(0, 191, 255)' || c === '#00bfff' || // Perfect: DeepSkyBlue
                c === 'rgb(50, 205, 50)' || c === '#32cd32';    // Good: LimeGreen
        };
        const goodCount = result.markerColors.filter(isGoodColor).length;

        console.log(`Marker count for ${fixtureName}: ${markerCount} (Expected: ${expectedMarkerCount})`);
        console.log(`Marker colors found: ${JSON.stringify(result.markerColors)}`);


        // We expect at least some markers
        expect(markerCount).toBeGreaterThan(0);
        expect(goodCount).toBe(expectedMarkerCount);

        // 9. Capture screenshot for visual confirmation
        const screenshotPath = path.resolve(process.cwd(), `coach/tests/visual/screenshots/test_${fixtureName.replace('.json', '')}.png`);
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved to ${screenshotPath}`);

        return { markerCount, fixture };
    }

    // Core rock grooves
    test('Rock 16th - Perfect Timing @ 80BPM', async () => {
        await runFixtureTest('rock16th_perfect.json', 20);
    }, 45000);

    test('Rock 16th - Rushing @ 80BPM', async () => {
        await runFixtureTest('rock16th_rushing.json', 20);
    }, 45000);

    test('Rock 16th - Dragging @ 80BPM', async () => {
        await runFixtureTest('rock16th_dragging.json', 20);
    }, 45000);

    test('Rock 8th - Perfect @ 80BPM', async () => {
        await runFixtureTest('rock8th_perfect.json', 11);
    }, 45000);

    // Triplet grooves
    test('Jazz Shuffle - Perfect @ 100BPM', async () => {
        await runFixtureTest('jazzShuffle_perfect.json', 24);
    }, 45000);

    test('Purdie Shuffle - Perfect @ 120BPM', async () => {
        await runFixtureTest('purdieShuffle_perfect.json', 20);
    }, 60000);

    // World grooves
    test('Bossa Nova - Perfect @ 140BPM', async () => {
        await runFixtureTest('bossaNova_perfect.json', 34);
    }, 60000);

    test('Jazz Samba - Perfect @ 80BPM', async () => {
        await runFixtureTest('jazzSamba_perfect.json', 38);
    }, 45000);

    // Test patterns - Unisons
    test('Triple Unison (Kick+Snare+HH) - Perfect', async () => {
        await runFixtureTest('tripleUnison_perfect.json', 3);
    }, 45000);

    test('4-Voice Vertical Stack - Perfect', async () => {
        await runFixtureTest('verticalStack4_perfect.json', 8);
    }, 45000);

    // Dense patterns
    test('Dense 16th Note Hi-Hats - Perfect', async () => {
        await runFixtureTest('denseSixteenths_perfect.json', 16);
    }, 45000);

    // All hit types
    test('Rock 16th - All Hit Types', async () => {
        await runFixtureTest('rock16th_all_hit_types.json', 20);
    }, 45000);

    // Performance with issues
    test('Rock 16th - With Misses', async () => {
        await runFixtureTest('rock16th_with_misses.json', 17);
    }, 45000);

    test('Rock 16th - With Extras', async () => {
        await runFixtureTest('rock16th_with_extras.json', 20);
    }, 45000);
});
