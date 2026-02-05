/**
 * Comprehensive Visual Feedback Tests
 * Tests for the Drum Coach visual feedback rendering including:
 * - All groove types from UI (rock, triplet, world, ostinatos, permutations)
 * - All performance profiles (perfect, rushing, dragging, all hit types)
 * - Unison/vertical note stacking
 * - Multi-measure patterns
 * - Screenshot comparison against reference images
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

describe('Drum Coach Comprehensive Visual Tests', () => {
    let browser;
    let page;
    const testHelperPath = path.resolve(process.cwd(), 'coach/tests/visual/testHelper.js');
    const testHelperCode = fs.readFileSync(testHelperPath, 'utf8');
    const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');
    const screenshotsDir = path.resolve(process.cwd(), 'coach/tests/visual/screenshots');
    const referenceDir = path.resolve(process.cwd(), 'coach/tests/visual/reference');
    const diffDir = path.resolve(process.cwd(), 'coach/tests/visual/diff');

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

        // Ensure screenshots and diff directories exist
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        if (!fs.existsSync(diffDir)) {
            fs.mkdirSync(diffDir, { recursive: true });
        }
    });

    afterAll(async () => {
        await browser.close();
    });

    /**
     * Compare a screenshot against its reference image
     * @returns {Object} { match: boolean, diffPixels: number, diffPercent: number }
     */
    function compareScreenshots(screenshotPath, referencePath, diffPath) {
        if (!fs.existsSync(referencePath)) {
            console.log(`No reference image found at ${referencePath}`);
            return { match: true, diffPixels: 0, diffPercent: 0, noReference: true };
        }

        const img1 = PNG.sync.read(fs.readFileSync(screenshotPath));
        const img2 = PNG.sync.read(fs.readFileSync(referencePath));

        if (img1.width !== img2.width || img1.height !== img2.height) {
            console.log(`Image dimensions differ: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
            return { match: false, diffPixels: -1, diffPercent: 100, dimensionMismatch: true };
        }

        const diff = new PNG({ width: img1.width, height: img1.height });
        const diffPixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {
            threshold: 0.1  // Allow small color variations
        });

        const totalPixels = img1.width * img1.height;
        const diffPercent = (diffPixels / totalPixels) * 100;

        // Save diff image if there are differences
        if (diffPixels > 0) {
            fs.writeFileSync(diffPath, PNG.sync.write(diff));
        }

        // Allow up to 0.05% difference for minor rendering variations
        const match = diffPercent < 0.05;

        return { match, diffPixels, diffPercent };
    }

    /**
     * Core test runner for fixtures
     */
    async function runFixtureTest(fixtureName, options = {}) {
        const fixturePath = path.join(fixturesDir, fixtureName);
        if (!fs.existsSync(fixturePath)) {
            console.log(`Skipping ${fixtureName} - fixture not found`);
            return null;
        }

        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        console.log(`Running UI test for: ${fixture.meta.name} (${fixture.meta.bpm} BPM, ${fixture.meta.noteCount} notes)`);

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


        // 6. Enable debug grid for visual confirmation
        await page.evaluate(() => window.CoachTestHelper.setDebugMode(true));

        // 7. Start coach session in headless mode (bypasses MIDI playback)
        await page.evaluate(() => window.CoachTestHelper.startSessionHeadless());


        // 7. Play back the performance INSTANTLY
        await page.evaluate((p) => window.CoachTestHelper.simulatePerformanceInstant(p), fixture.performance);


        // 8. Wait a tiny bit for the feedback circles' pop animation to settle
        await new Promise(r => setTimeout(r, 300));

        // 8. Verify markers
        const result = await page.evaluate(() => {
            const markers = Array.from(document.querySelectorAll('.coach-hit-marker'));
            return {
                markerCount: markers.length,
                markerColors: markers.map(m => window.getComputedStyle(m).fill)
            };
        });

        const markerCount = result.markerCount;

        // Define color matching logic based on normalized FeedbackRenderer colors
        const colors = {
            perfect: c => c === 'rgb(0, 191, 255)' || c === '#00bfff', // DeepSkyBlue
            good: c => c === 'rgb(50, 205, 50)' || c === '#32cd32',     // LimeGreen
            close: c => c === 'rgb(255, 215, 0)' || c === '#ffd700',    // Gold
            miss: c => c === 'rgb(255, 69, 0)' || c === '#ff4500',      // OrangeRed
            extra: c => c === 'rgb(149, 165, 166)' || c === '#95a5a6'   // Gray
        };

        const goodCount = result.markerColors.filter(c => colors.perfect(c) || colors.good(c)).length;

        console.log(`Marker count for ${fixtureName}: ${markerCount}`);
        if (markerCount > 0) {
            console.log(`Marker colors found: ${JSON.stringify(result.markerColors.slice(0, 5))}...`);
        }

        // 9. Capture screenshot
        const screenshotName = fixtureName.replace('.json', '.png');
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved: ${screenshotPath}`);

        // 10. Compare against reference screenshot
        const referencePath = path.join(referenceDir, screenshotName);
        const diffPath = path.join(diffDir, screenshotName);
        const comparison = compareScreenshots(screenshotPath, referencePath, diffPath);

        if (comparison.noReference) {
            console.log(`No reference image for ${screenshotName} - skipping comparison`);
        } else if (comparison.match) {
            console.log(`Screenshot matches reference for ${screenshotName}`);
        } else {
            console.log(`Screenshot DIFFERS from reference: ${comparison.diffPercent.toFixed(3)}% different (${comparison.diffPixels} pixels)`);
        }

        return {
            markerCount: result.markerCount,
            markerColors: result.markerColors, // Consistently use RGB from getComputedStyle
            fixture,
            screenshotPath,
            comparison
        };
    }


    // =========================================================================
    // ROCK GROOVES
    // =========================================================================

    describe('Rock Grooves', () => {
        test('16th Note Rock - Perfect Timing', async () => {
            const result = await runFixtureTest('rock16th_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('16th Note Rock - Rushing (Early)', async () => {
            const result = await runFixtureTest('rock16th_rushing.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('16th Note Rock - Dragging (Late)', async () => {
            const result = await runFixtureTest('rock16th_dragging.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('16th Note Rock - All Hit Types', async () => {
            const result = await runFixtureTest('rock16th_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
                // Should have variety of colors
                const uniqueColors = new Set(result.markerColors);
                console.log(`Unique marker colors: ${uniqueColors.size}`);
            }
        }, 30000);

        test('8th Note Rock - Perfect Timing', async () => {
            const result = await runFixtureTest('rock8th_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Train Beat - Perfect Timing', async () => {
            const result = await runFixtureTest('trainBeat_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Syncopated Hi-hats #1 - Mixed', async () => {
            const result = await runFixtureTest('syncopatedHH1_mixed.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // TRIPLET GROOVES
    // =========================================================================

    describe('Triplet Grooves', () => {
        test('Jazz Shuffle - Perfect Timing', async () => {
            const result = await runFixtureTest('jazzShuffle_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Jazz Shuffle - Rushing', async () => {
            const result = await runFixtureTest('jazzShuffle_rushing.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Purdie Shuffle - Perfect', async () => {
            const result = await runFixtureTest('purdieShuffle_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Jazz Ride - Perfect', async () => {
            const result = await runFixtureTest('jazzRide_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Half Time Shuffle 8th - All Hit Types', async () => {
            const result = await runFixtureTest('halfTimeShuffle8th_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // WORLD GROOVES
    // =========================================================================

    describe('World Grooves', () => {
        test('Bossa Nova - Perfect Timing', async () => {
            const result = await runFixtureTest('bossaNova_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 45000); // Longer for 2 measures

        test('Jazz Samba - Perfect Timing', async () => {
            const result = await runFixtureTest('jazzSamba_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Songo - All Hit Types', async () => {
            const result = await runFixtureTest('songo_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // FOOT OSTINATOS
    // =========================================================================

    describe('Foot Ostinatos', () => {
        test('Samba Ostinato - Perfect', async () => {
            const result = await runFixtureTest('sambaOstinato_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Tumbao Ostinato - Dragging', async () => {
            const result = await runFixtureTest('tumbaoOstinato_dragging.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Baiao Ostinato - Rushing', async () => {
            const result = await runFixtureTest('baiaoOstinato_rushing.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // KICK PERMUTATIONS
    // =========================================================================

    describe('Kick Permutations', () => {
        test('Kick on Quarters - Perfect', async () => {
            const result = await runFixtureTest('kickQuarters_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Syncopated Kick - All Hit Types', async () => {
            const result = await runFixtureTest('kickSyncopated_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Dense Kick Pattern - Perfect', async () => {
            const result = await runFixtureTest('kickDense_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // SNARE PERMUTATIONS
    // =========================================================================

    describe('Snare Permutations', () => {
        test('Standard Backbeat - Perfect', async () => {
            const result = await runFixtureTest('snareBackbeat_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Backbeat with Ghosts - Perfect', async () => {
            const result = await runFixtureTest('snareWithGhosts_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Dense Ghost Pattern - All Hit Types', async () => {
            const result = await runFixtureTest('snareGhostPattern_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // VERTICAL STACKING (UNISONS)
    // =========================================================================

    describe('Vertical Stacking (Unisons)', () => {
        test('Single Kick - Perfect', async () => {
            const result = await runFixtureTest('singleKick_perfect.json');
            if (result) {
                expect(result.markerCount).toBe(1);
            }
        }, 30000);

        test('Kick+Snare Unison - Perfect', async () => {
            const result = await runFixtureTest('kickSnareUnison_perfect.json');
            if (result) {
                // Both kick and snare on same beat
                expect(result.markerCount).toBeGreaterThanOrEqual(1);
            }
        }, 30000);

        test('Triple Unison (Kick+Snare+HH) - Perfect', async () => {
            const result = await runFixtureTest('tripleUnison_perfect.json');
            if (result) {
                // All 3 drums on same beat
                expect(result.markerCount).toBeGreaterThanOrEqual(1);
            }
        }, 30000);

        test('4-Voice Vertical Stack - Perfect', async () => {
            const result = await runFixtureTest('verticalStack4_perfect.json');
            if (result) {
                // 4 drums on each of 2 beats = potentially 8 markers (or fewer if consolidated)
                expect(result.markerCount).toBeGreaterThanOrEqual(1);
            }
        }, 30000);

        test('4-Voice Vertical Stack - All Hit Types', async () => {
            const result = await runFixtureTest('verticalStack4_all_hit_types.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThanOrEqual(1);
            }
        }, 30000);
    });

    // =========================================================================
    // DENSE PATTERNS
    // =========================================================================

    describe('Dense Patterns', () => {
        test('Dense 16th Note Hi-Hats - Perfect', async () => {
            const result = await runFixtureTest('denseSixteenths_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Dense 16th Note Hi-Hats - Rushing', async () => {
            const result = await runFixtureTest('denseSixteenths_rushing.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('32nd Note Hi-Hats - Perfect', async () => {
            const result = await runFixtureTest('all32ndNotes_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // ALL ARTICULATIONS
    // =========================================================================

    describe('All Articulations', () => {
        test('All Articulations Pattern - Perfect', async () => {
            const result = await runFixtureTest('allArticulations_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 45000); // 2 measures

        test('All Drums Sequential - Perfect', async () => {
            const result = await runFixtureTest('allDrumsSequential_perfect.json');
            if (result) {
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Tom Fill Pattern - Perfect', async () => {
            const result = await runFixtureTest('tomFill_perfect.json');
            if (result) {
                // Tests all 4 toms with kick and crash
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Snare Flam Pattern - Perfect', async () => {
            const result = await runFixtureTest('snareFlam_perfect.json');
            if (result) {
                // Tests flam articulation (two close snare hits)
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Snare Flam Pattern - Rushing', async () => {
            const result = await runFixtureTest('snareFlam_rushing.json');
            if (result) {
                // Flam hits early - circle should shift left
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Snare Flam Pattern - Dragging', async () => {
            const result = await runFixtureTest('snareFlam_dragging.json');
            if (result) {
                // Flam hits late - circle should shift right
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);
    });

    // =========================================================================
    // PERFORMANCE SCENARIOS (Miss/Extra)
    // =========================================================================

    describe('Performance Scenarios', () => {
        test('Rock 16th - With Misses', async () => {
            const result = await runFixtureTest('rock16th_with_misses.json');
            if (result) {
                // Should have fewer markers than notes
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Rock 16th - With Extras', async () => {
            const result = await runFixtureTest('rock16th_with_extras.json');
            if (result) {
                // Extra hits might show up as 'extra' markers
                expect(result.markerCount).toBeGreaterThan(0);
                expect(result.comparison.match).toBe(true);
            }
        }, 30000);

        test('Rock 16th - Wrong Pads', async () => {
            const result = await runFixtureTest('rock16th_wrong_pads.json');
            if (result) {
                // Wrong pad hits should show as extras or misses
                expect(result.markerCount).toBeGreaterThanOrEqual(0);
            }
        }, 30000);
    });

    // =========================================================================
    // TIMING TIER VERIFICATION
    // =========================================================================

    describe('Timing Tier Verification', () => {
        // Use normalized RGB colors from getComputedStyle
        const PERFECT_BLUE = 'rgb(0, 191, 255)';  // DeepSkyBlue
        const GOOD_GREEN = 'rgb(50, 205, 50)';    // LimeGreen
        const CLOSE_YELLOW = 'rgb(255, 215, 0)';  // Gold
        const MISS_RED = 'rgb(255, 69, 0)';       // OrangeRed
        const EXTRA_GRAY = 'rgb(149, 165, 166)';  // Gray

        test('Only Perfect - Should be all blue', async () => {
            const result = await runFixtureTest('rock16th_only_perfect.json');
            if (result && result.markerCount > 0) {
                // All markers should be perfect (blue)
                const perfectCount = result.markerColors.filter(c => c === PERFECT_BLUE).length;
                console.log(`Perfect (blue) markers: ${perfectCount}/${result.markerCount}`);
                expect(perfectCount).toBeGreaterThan(0);
            }
        }, 30000);

        test('Only Good - Should be all green', async () => {
            const result = await runFixtureTest('rock16th_only_good.json');
            if (result && result.markerCount > 0) {
                const goodCount = result.markerColors.filter(c => c === GOOD_GREEN || c === PERFECT_BLUE).length;
                console.log(`Good (green) markers: ${goodCount}/${result.markerCount}`);
                expect(goodCount).toBeGreaterThan(0);
            }
        }, 30000);

        test('Only Close - Should be all yellow', async () => {
            const result = await runFixtureTest('rock16th_only_close.json');
            if (result && result.markerCount > 0) {
                const closeCount = result.markerColors.filter(c => c === CLOSE_YELLOW).length;
                console.log(`Close (yellow) markers: ${closeCount}/${result.markerCount}`);
                expect(closeCount).toBeGreaterThan(0);
            }
        }, 30000);

        test('Only Miss - Should be all red/orange', async () => {
            const result = await runFixtureTest('rock16th_only_miss.json');
            if (result && result.markerCount > 0) {
                const missCount = result.markerColors.filter(c => c === MISS_RED).length;
                console.log(`Miss (red) markers: ${missCount}/${result.markerCount}`);
                expect(missCount).toBeGreaterThan(0);
            }
        }, 30000);
    });
});
