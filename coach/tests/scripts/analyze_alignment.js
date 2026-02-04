
import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const url = 'http://localhost:8080/?TimeSig=4/4&Div=16&tempo=80&measures=1&H=%7Cx-x-x-x-x-x-x-x-%7C&S=%7C----o-------o---%7C&K=%7Co-------o-------%7C&T1=%7C--o-------------%7C&T2=%7C----o-----------%7C&T3=%7C------o---------%7C&T4=%7C--------o-------%7C';

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForFunction(() => {
        return window.coachController && window.coachController.abcNoteMap;
    }, { timeout: 15000 });

    const data = await page.evaluate(() => {
        const map = window.coachController.abcNoteMap;
        const mapData = {};
        map.forEach((val, key) => {
            mapData[key] = val;
        });

        const rects = Array.from(document.querySelectorAll('rect.abcr')).map(r => ({
            id: r.getAttribute('id'),
            bbox: r.getBBox()
        }));

        const svg = document.querySelector('#svgTarget svg');
        const paths = Array.from(svg.querySelectorAll('path, use')).map(p => ({
            bbox: p.getBBox(),
            d: p.getAttribute('d'),
            href: p.getAttribute('href') || p.getAttribute('xlink:href')
        }));

        return { mapData, rects, paths };
    });

    console.log('--- ABC Note Map ---');
    console.log(JSON.stringify(data.mapData, null, 2));

    console.log('--- Alignment Correlation ---');
    // Group map by index
    const indexToKeys = {};
    Object.entries(data.mapData).forEach(([key, idx]) => {
        if (!indexToKeys[idx]) indexToKeys[idx] = [];
        indexToKeys[idx].push(key);
    });

    data.rects.forEach(rect => {
        const idx = parseInt(rect.id.split('_').pop());
        const instruments = indexToKeys[idx] || [];

        console.log(`\nRect ${rect.id} (Index ${idx}) -> Instruments: ${instruments.join(', ')}`);

        const overlapping = data.paths.filter(p => {
            return p.bbox.x >= rect.bbox.x - 2 && p.bbox.x <= rect.bbox.x + rect.bbox.width + 2;
        });

        overlapping.forEach(p => {
            const centerY = p.bbox.y + p.bbox.height / 2;
            const ratio = (centerY - rect.bbox.y) / rect.bbox.height;
            console.log(`  Path @ ratio ${ratio.toFixed(4)} (y:${p.bbox.y.toFixed(1)} h:${p.bbox.height.toFixed(1)})`);
        });
    });

    await browser.close();
}

run().catch(console.error);
