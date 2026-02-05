import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

describe('Drum Coach Comprehensive Visual Tests - Parallel', () => {
    const testHelperPath = path.resolve(process.cwd(), 'coach/tests/visual/testHelper.js');
    const testHelperCode = fs.readFileSync(testHelperPath, 'utf8');
    const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');
    const screenshotsDir = path.resolve(process.cwd(), 'coach/tests/visual/screenshots');
    const referenceDir = path.resolve(process.cwd(), 'coach/tests/visual/reference');
    const diffDir = path.resolve(process.cwd(), 'coach/tests/visual/diff');

    // Dynamically get the fixture list based on what reference images we have
    const getFixtures = () => {
        if (!fs.existsSync(referenceDir)) return [];
        return fs.readdirSync(referenceDir)
            .filter(f => f.endsWith('.png'))
            .map(f => f.replace('.png', '.json'))
            .sort();
    };

    const chunkArray = (arr, n) => {
        const chunks = Array.from({ length: n }, () => []);
        arr.forEach((item, i) => chunks[i % n].push(item));
        return chunks;
    };

    beforeAll(async () => {
        // Cleanup prior screenshots and diffs
        [screenshotsDir, diffDir].forEach(dir => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(file => {
                    if (file.endsWith('.png')) {
                        try { fs.unlinkSync(path.join(dir, file)); } catch (e) { }
                    }
                });
            } else {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    });

    function compareScreenshots(screenshotPath, referencePath, diffPath) {
        if (!fs.existsSync(referencePath)) return { match: true, noReference: true };
        const img1 = PNG.sync.read(fs.readFileSync(screenshotPath));
        const img2 = PNG.sync.read(fs.readFileSync(referencePath));
        if (img1.width !== img2.width || img1.height !== img2.height) return { match: false, dimensionMismatch: true };
        const diff = new PNG({ width: img1.width, height: img1.height });
        const pixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, { threshold: 0.1 });
        const percent = (pixels / (img1.width * img1.height)) * 100;
        if (pixels > 0) fs.writeFileSync(diffPath, PNG.sync.write(diff));
        return { match: percent < 0.05, diffPercent: percent, diffPixels: pixels };
    }

    async function runFixtureBatch(batch, batchId) {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            let isInitialized = false;

            for (const fixtureName of batch) {
                const fixturePath = path.join(fixturesDir, fixtureName);
                if (!fs.existsSync(fixturePath)) {
                    console.warn(`[Batch ${batchId}] Fixture not found: ${fixtureName}`);
                    continue;
                }
                const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

                if (!isInitialized) {
                    await page.goto('http://localhost:8080/', { waitUntil: 'load' });
                    await page.waitForFunction(() => window.myGrooveWriter !== undefined, { timeout: 15000 });
                    await page.evaluate(testHelperCode);
                    isInitialized = true;
                }

                // Load and setup
                await page.evaluate((g) => {
                    window.CoachTestHelper.loadGroove(g);
                    window.CoachTestHelper.setDebugMode(true);
                }, fixture.groove);

                // Wait for SVG render
                await page.waitForFunction(() => {
                    const svg = document.querySelector('#svgTarget svg');
                    return svg && svg.querySelectorAll('rect.abcr').length > 0;
                }, { timeout: 15000 });

                // Run simulation
                await page.evaluate((p) => {
                    window.CoachTestHelper.startSessionHeadless();
                    window.CoachTestHelper.simulatePerformanceInstant(p);
                }, fixture.performance);

                // Wait for UI to settle
                await page.waitForFunction(() => {
                    const playBtn = document.querySelector('.midiPlayImage');
                    return playBtn && (playBtn.classList.contains('Stopped') || playBtn.classList.contains('Paused') || playBtn.classList.contains('Playing'));
                }, { timeout: 5000 });

                await new Promise(r => setTimeout(r, 600));
                await page.mouse.move(0, 0);

                // Capture
                const screenshotName = fixtureName.replace('.json', '.png');
                const screenshotPath = path.join(screenshotsDir, screenshotName);
                const referencePath = path.join(referenceDir, screenshotName);
                const diffPath = path.join(diffDir, screenshotName);

                await page.screenshot({ path: screenshotPath });

                const result = await page.evaluate(() => ({ markerCount: document.querySelectorAll('.coach-hit-marker').length }));
                const comparison = compareScreenshots(screenshotPath, referencePath, diffPath);

                if (result.markerCount === 0) throw new Error(`${fixtureName}: Zero markers found`);
                if (!comparison.noReference && !comparison.match) {
                    throw new Error(`${fixtureName}: Visual mismatch (${comparison.diffPercent.toFixed(3)}%)`);
                }

                console.log(`[Batch ${batchId}] Passed: ${fixtureName}`);
            }
        } finally {
            await browser.close();
        }
    }

    const NUM_WORKERS = 5;
    const allFixtures = getFixtures();
    const fixtureChunks = chunkArray(allFixtures, NUM_WORKERS);

    test.concurrent.each(fixtureChunks.map((chunk, idx) => [idx, chunk]))(
        'Parallel Worker %s: Processing fixtures',
        async (batchId, batch) => {
            if (batch.length === 0) return;
            await runFixtureBatch(batch, batchId);
        },
        300000
    );
});
