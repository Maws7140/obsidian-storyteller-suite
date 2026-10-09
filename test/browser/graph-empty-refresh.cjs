// Run: CHROMIUM_PATH=/path/to/chrome node test/browser/graph-empty-refresh.cjs
// Real NetworkGraphRenderer + cytoscape in Chromium; Obsidian is stubbed and the plugin is a fake.
// Regression: a graph opened while empty never drew again, because refresh() returned early
// when no Cytoscape instance had been created.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

(async () => {
    const bundle = await esbuild.build({
        stdin: { contents: "export { NetworkGraphRenderer } from './src/views/NetworkGraphRenderer';", resolveDir: path, loader: 'ts' },
        bundle: true, write: false, format: 'iife', globalName: 'NG',
        plugins: [{ name: 'host', setup(b) {
            b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
            b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export class TFile {}; export const setIcon=()=>{}; export class Notice{constructor(){}}', loader: 'js' }));
        } }]
    });
    const br = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }) });
    const p = await br.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.setContent('<div id="host" style="width:900px;height:600px;position:relative"></div>');
    await p.addScriptTag({ content: require('fs').readFileSync(path + 'node_modules/cytoscape/dist/cytoscape.min.js', 'utf8') });
    await p.evaluate(() => {
        const P = HTMLElement.prototype;
        P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; } this.append(e); return e; };
        P.createDiv = function (o) { return this.createEl('div', o); };
        P.empty = function () { this.replaceChildren(); };
        P.setCssStyles = function (s) { Object.assign(this.style, s); };
        P.addClass = function (...c) { this.classList.add(...c); };
        P.setText = function (t) { this.textContent = t; };
        window.activeDocument = document;
        window.createEl = (tag, o) => { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; return e; };
        window.createDiv = (o) => { const e = document.createElement('div'); if (typeof o === 'string') e.className = o; document.body.appendChild(e); return e; };
    });
    await p.addScriptTag({ content: bundle.outputFiles[0].text });

    // Empty vault: open the graph, create a character, press Refresh
    const empty = await p.evaluate(async () => {
        const chars = [];
        const plugin = {
            listCharacters: async () => chars.map(c => ({ ...c })),
            listLocations: async () => [], listEvents: async () => [], listPlotItems: async () => [],
            listCultures: async () => [], listEconomies: async () => [], listMagicSystems: async () => [],
            getGroups: () => [], app: { vault: { getAbstractFileByPath: () => null } }
        };
        const host = document.getElementById('host');
        const r = new NG.NetworkGraphRenderer(host, plugin);
        await r.initializeCytoscape();
        const before = r.getNodeCount();
        chars.push({ id: 'c1', name: 'Aria', connections: [] });
        await r.refresh();
        return { before, afterRefresh: r.getNodeCount(), emptyStateStillShown: !!host.querySelector('.storyteller-network-empty-state') };
    });
    assert.equal(empty.before, 0, 'starts empty');
    assert.equal(empty.afterRefresh, 1, 'refresh after a character is created must draw it');
    assert.equal(empty.emptyStateStillShown, false, 'empty-state message must be cleared once nodes exist');

    // Going back to empty must show the message again and clear the graph
    const back = await p.evaluate(async () => {
        const host = document.getElementById('host');
        const chars = [{ id: 'c1', name: 'Aria', connections: [] }];
        const plugin = {
            listCharacters: async () => chars.map(c => ({ ...c })),
            listLocations: async () => [], listEvents: async () => [], listPlotItems: async () => [],
            listCultures: async () => [], listEconomies: async () => [], listMagicSystems: async () => [],
            getGroups: () => [], app: { vault: { getAbstractFileByPath: () => null } }
        };
        host.replaceChildren();
        const r = new NG.NetworkGraphRenderer(host, plugin);
        await r.initializeCytoscape();
        chars.length = 0;
        await r.refresh();
        return { afterEmpty: r.getNodeCount(), emptyStateShown: !!host.querySelector('.storyteller-network-empty-state') };
    });
    assert.equal(back.afterEmpty, 0, 'refresh to an empty set clears the graph');
    assert.equal(back.emptyStateShown, true, 'empty-state message returns when nothing is left to draw');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: graph opened empty draws after refresh');
    await br.close();
})().catch(e => { console.error(e); process.exit(1); });
