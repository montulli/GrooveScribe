import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

describe('Drum Coach Comprehensive Visual Tests - Sequential', () => {
    const testHelperPath = path.resolve(process.cwd(), 'coach/tests/visual/testHelper.js');
    const testHelperCode = fs.readFileSync(testHelperPath, 'utf8');
    const fixturesDir = path.resolve(process.cwd(), 'coach/tests/fixtures/generated');
    const screenshotsDir = path.resolve(process.cwd(), 'coach/tests/visual/screenshots');
    const referenceDir = path.resolve(process.cwd(), 'coach/tests/visual/reference');
    const diffDir = path.resolve(process.cwd(), 'coach/tests/visual/diff');

    // Get only fixtures that have a reference image
    const getFixtures = () => {
        if (!fs.existsSync(referenceDir)) return [];
        return fs.readdirSync(referenceDir)
            .filter(f => f.endsWith('.png'))
            .map(f => f.replace('.png', '.json'))
            .sort();
    };

    let browser;
    let page;

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

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('http://localhost:8080/', { waitUntil: 'load' });
        await page.waitForFunction(() => window.myGrooveWriter !== undefined, { timeout: 15000 });
        await page.evaluate(testHelperCode);
    }, 30000);

    afterAll(async () => {
        if (browser) await browser.close();
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

    const fixtures = getFixtures();

    test.each(fixtures)('Fixture: %s', async (fixtureName) => {
        const fixturePath = path.join(fixturesDir, fixtureName);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        // Load and setup
        await page.evaluate(async (g) => {
            const target = document.querySelector('#svgTarget');
            if (target) target.innerHTML = '';
            window.CoachTestHelper.loadGroove(g);
            window.CoachTestHelper.setDebugMode(true);
        }, fixture.groove);

        // Wait for SVG render (handle empty score case where there are no notes)
        await page.waitForFunction(() => {
            const svg = document.querySelector('#svgTarget svg');
            return svg !== null; // Just need SVG to be present, may have zero notes
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

        await new Promise(r => setTimeout(r, 200));
        await page.mouse.move(0, 0);

        // Capture
        const screenshotName = fixtureName.replace('.json', '.png');
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        const referencePath = path.join(referenceDir, screenshotName);
        const diffPath = path.join(diffDir, screenshotName);

        await page.screenshot({ path: screenshotPath });

        const result = await page.evaluate(() => ({ markerCount: document.querySelectorAll('.coach-hit-marker').length }));
        console.log(`Fixture: ${fixtureName} | Markers Found: ${result.markerCount}`);

        const comparison = compareScreenshots(screenshotPath, referencePath, diffPath);

        if (result.markerCount === 0) throw new Error(`${fixtureName}: Zero markers found`);
        if (!comparison.noReference && !comparison.match) {
            console.warn(`[Visual Mismatch] ${fixtureName}: ${comparison.diffPercent.toFixed(3)}%`);
            // We'll throw at the end if we want strict mode, but for now let's just log and continue if possible
            // Actually Jest will fail the individual test, which is what we want.
            throw new Error(`${fixtureName}: Visual mismatch (${comparison.diffPercent.toFixed(3)}%)`);
        }
        console.log(`Passed: ${fixtureName}`);
    }, 30000);
});
