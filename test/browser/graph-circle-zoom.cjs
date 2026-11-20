// Run: CHROMIUM_PATH=/path/to/chrome node test/browser/graph-circle-zoom.cjs
// A large graph in circle layout is wider than the old 0.2 zoom floor allowed. Checks
// that zooming out can bring every node on screen, that Fit to view shows them all,
// and that a small graph keeps the normal floor.
const root = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(root + 'node_modules/playwright');
const esbuild = require(root + 'node_modules/esbuild');

async function open(browser, bundle, count) {
    const p = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setContent('<body class="theme-dark" style="margin:0;--background-primary:#1e1e1e;--text-normal:#dadada;--font-interface:sans-serif"><div id="host" style="width:1000px;height:700px;position:relative"></div></body>');
    await p.addStyleTag({ content: fs.readFileSync(root + 'styles.css', 'utf8') });
    await p.addScriptTag({ content: fs.readFileSync(root + 'node_modules/cytoscape/dist/cytoscape.min.js', 'utf8') });
    await p.evaluate(() => {
        const P = HTMLElement.prototype;
        P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; Object.entries(o.attr || {}).forEach(([k, v]) => e.setAttribute(k, v)); } this.append(e); return e; };
        P.createDiv = function (o) { return this.createEl('div', o); };
        P.createSpan = function (o) { return this.createEl('span', o); };
        P.empty = function () { this.replaceChildren(); };
        P.setCssStyles = function (s) { Object.assign(this.style, s); };
        P.addClass = function (...c) { this.classList.add(...c); };
        P.removeClass = function (...c) { this.classList.remove(...c); };
        P.toggleClass = function (c, on) { this.classList.toggle(c, on); };
        P.setText = function (t) { this.textContent = t; };
        window.activeDocument = document;
        window.createEl = (tag, o) => { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; return e; };
        window.createDiv = (o) => { const e = document.createElement('div'); if (typeof o === 'string') e.className = o; document.body.appendChild(e); return e; };
    });
    await p.addScriptTag({ content: bundle });
    await p.evaluate(async (count) => {
        const chars = Array.from({ length: count }, (_, i) => ({
            id: `c${i}`, name: `Character ${i}`,
            connections: i ? [{ target: `c${i - 1}`, type: 'ally' }] : [],
        }));
        const plugin = {
            settings: { timelineThemes: [], networkGraphDisplay: { layout: 'circle', spacing: 'spacious', showIsolated: true } },
            saveSettings: async () => {},
            getActiveStory: () => ({}),
            listCharacters: async () => chars,
            listLocations: async () => [], listEvents: async () => [], listPlotItems: async () => [],
            listCultures: async () => [], listEconomies: async () => [], listMagicSystems: async () => [],
            getGroups: () => [],
            app: { vault: { getAbstractFileByPath: () => null }, workspace: { on: () => ({}), offref: () => {} }, metadataCache: { getFirstLinkpathDest: () => null } },
        };
        window.r = new NG.NetworkGraphRenderer(document.getElementById('host'), plugin);
        await r.initializeCytoscape();
        await new Promise(resolve => setTimeout(resolve, 900));
        r.changeLayout('circle');
        await new Promise(resolve => setTimeout(resolve, 900));
        window.allOnScreen = () => {
            const w = r.cy.width(), h = r.cy.height();
            return r.cy.nodes().every(n => { const q = n.renderedPosition(); return q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h; });
        };
    }, count);
    return { p, errors };
}

(async () => {
    const bundle = await esbuild.build({
        stdin: { contents: "export { NetworkGraphRenderer } from './src/views/NetworkGraphRenderer';", resolveDir: root, loader: 'ts' },
        bundle: true, write: false, format: 'iife', globalName: 'NG', logLevel: 'error',
        plugins: [{ name: 'host', setup(b) {
            b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
            b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export class TFile {}; export const setIcon=()=>{}; export class Notice{constructor(){}}', loader: 'js' }));
        } }],
    });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });

    // 1. A 160-node circle: zoom out step by step until everything is on screen.
    const big = await open(browser, bundle.outputFiles[0].text, 160);
    const width = await big.p.evaluate(() => r.cy.nodes().boundingBox().w);
    assert.ok(width > 1000 / 0.2, `circle is wider than the old floor could show (${Math.round(width)}px)`);
    const minZoom = await big.p.evaluate(() => r.cy.minZoom());
    assert.ok(minZoom < 0.2, `zoom floor lowered for the big circle (${minZoom.toFixed(3)})`);
    const reached = await big.p.evaluate(() => {
        for (let i = 0; i < 40 && !allOnScreen(); i++) r.zoomOut();
        return { all: allOnScreen(), zoom: r.cy.zoom() };
    });
    assert.ok(reached.all, `zooming out shows every node (stopped at zoom ${reached.zoom.toFixed(3)})`);

    // 2. Fit to view shows every node in one step.
    await big.p.evaluate(() => { r.cy.zoom(1); r.fitToView(); });
    assert.ok(await big.p.evaluate(() => allOnScreen()), 'Fit to view shows every node');
    assert.deepEqual(big.errors, [], 'no page errors');

    // 3. A small graph keeps the usual floor.
    const small = await open(browser, bundle.outputFiles[0].text, 6);
    assert.equal(await small.p.evaluate(() => r.cy.minZoom()), 0.2, 'small graph keeps the 0.2 floor');
    assert.deepEqual(small.errors, [], 'no page errors');

    await browser.close();
    console.log(`PASS: a ${Math.round(width)}px circle can be zoomed out and fitted in full; small graphs keep the 0.2 floor`);
})().catch(e => { console.error(e); process.exit(1); });
