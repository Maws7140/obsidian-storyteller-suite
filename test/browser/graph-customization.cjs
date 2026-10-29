// Run: CHROMIUM_PATH=/path/to/chrome node test/browser/graph-customization.cjs [screenshot-dir]
// Real NetworkGraphRenderer + cytoscape + styles.css in Chromium; Obsidian is stubbed and the plugin is a fake.
// Checks the timeline-style customization: the story's timeline theme reaches the graph, "Colour by"
// recolours nodes the way timeline lanes are coloured, display options rebuild what they should, and
// the legend lists only what is on screen and can hide entries.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { NetworkGraphRenderer } from './src/views/NetworkGraphRenderer';\nexport { notifyTimelineThemeChange } from './src/calendar/CalendarRegistry';\nexport { paletteColorFor } from './src/utils/TimelineStyle';",
            resolveDir: path, loader: 'ts'
        },
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
    await p.setContent('<body class="theme-dark" style="--background-primary:#1e1e1e;--background-secondary:#262626;--background-secondary-alt:#2a2a2a;--background-modifier-border:#3a3a3a;--text-normal:#dadada;--text-muted:#999;--text-accent:#8a5cf5;--interactive-accent:#7c3aed;--font-interface:sans-serif"><div id="host" style="width:1000px;height:700px;position:relative"></div></body>');
    await p.addStyleTag({ content: fs.readFileSync(path + 'styles.css', 'utf8') });
    await p.addScriptTag({ content: fs.readFileSync(path + 'node_modules/cytoscape/dist/cytoscape.min.js', 'utf8') });
    await p.evaluate(() => {
        const P = HTMLElement.prototype;
        P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; Object.entries(o.attr || {}).forEach(([k, v]) => e.setAttribute(k, v)); } this.append(e); return e; };
        P.createDiv = function (o) { return this.createEl('div', o); };
        P.createSpan = function (o) { return this.createEl('span', o); };
        P.empty = function () { this.replaceChildren(); };
        P.setCssStyles = function (s) { Object.assign(this.style, s); };
        P.addClass = function (...c) { this.classList.add(...c); };
        P.toggleClass = function (c, on) { this.classList.toggle(c, on); };
        P.setText = function (t) { this.textContent = t; };
        window.activeDocument = document;
        window.createEl = (tag, o) => { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; return e; };
        window.createDiv = (o) => { const e = document.createElement('div'); if (typeof o === 'string') e.className = o; document.body.appendChild(e); return e; };
    });
    await p.addScriptTag({ content: bundle.outputFiles[0].text });

    await p.evaluate(async () => {
        const story = { activeTimelineThemeId: 'builtin:obsidian-native' };
        const chars = [
            { id: 'c1', name: 'Aria', groups: ['g1'], currentLocationId: 'l1', status: 'Alive', connections: [{ target: 'c2', type: 'ally' }] },
            { id: 'c2', name: 'Bran', groups: ['g1'], currentLocationId: 'l1', status: 'alive', connections: [{ target: 'c3', type: 'enemy' }] },
            { id: 'c3', name: 'Cass', groups: ['g2'], currentLocationId: 'l2', status: 'Dead', connections: [{ target: 'c1', type: 'rival', ended: true }] },
            { id: 'c4', name: 'Dov', connections: [] },
        ];
        const locations = [{ id: 'l1', name: 'Valewood' }, { id: 'l2', name: 'Stonehold' }];
        const groups = [
            { id: 'g1', name: 'Red Hand', color: '#ff0000', members: [{ type: 'character', id: 'c1' }, { type: 'character', id: 'c2' }] },
            { id: 'g2', name: 'Grey Guild', members: [{ type: 'character', id: 'c3' }] },
        ];
        const plugin = {
            settings: { timelineThemes: [] }, saved: 0,
            saveSettings: async () => { plugin.saved++; },
            getActiveStory: () => story,
            listCharacters: async () => chars.map(c => ({ ...c })),
            listLocations: async () => locations.map(l => ({ ...l })),
            listEvents: async () => [], listPlotItems: async () => [],
            listCultures: async () => [], listEconomies: async () => [], listMagicSystems: async () => [],
            getGroups: () => groups.map(g => ({ ...g })),
            app: {
                vault: { getAbstractFileByPath: () => null },
                workspace: { on: () => ({}), offref: () => {} },
                metadataCache: { getFirstLinkpathDest: () => null }
            }
        };
        window.story = story;
        window.plugin = plugin;
        window.r = new NG.NetworkGraphRenderer(document.getElementById('host'), plugin);
        await window.r.initializeCytoscape();
        window.legend = () => Array.from(document.querySelectorAll('.storyteller-network-legend-section')).map(section => ({
            heading: section.querySelector('.storyteller-network-legend-heading')?.textContent || '',
            rows: Array.from(section.querySelectorAll('.storyteller-network-legend-row')).map(row => ({
                label: row.querySelector('.storyteller-network-legend-label').textContent,
                count: Number(row.querySelector('.storyteller-network-legend-count').textContent),
                hidden: row.classList.contains('is-hidden'),
                swatch: getComputedStyle(row.querySelector('.storyteller-network-legend-swatch')).backgroundColor,
            })),
        }));
    });

    // 1. By entity type: colour entries carry the type, relationships and line styles in use only
    const byType = await p.evaluate(() => legend());
    assert.equal(byType[0].heading, 'Colour: entity type');
    assert.deepEqual(byType[0].rows.map(r => [r.label, r.count]), [['Characters', 4], ['Locations', 2], ['Groups', 2]]);
    const rels = byType.find(s => s.heading === 'Relationships').rows.map(r => r.label).sort();
    assert.deepEqual(rels, ['Ally', 'Enemy', 'Rival'], 'only the kinds on screen');
    const lines = byType.find(s => s.heading === 'Lines').rows.map(r => r.label);
    assert.ok(lines.includes('Ended') && lines.includes('Member of a group'), `lines: ${lines}`);
    assert.ok(!lines.includes('Implied inverse'), 'no implied lines on screen, so none in the legend');

    // 2. Colour by group: a group's own colour, else the palette hash the timeline uses
    const byGroup = await p.evaluate(async () => {
        await r.setDisplay({ colorMode: 'group' });
        const color = id => r.cy.getElementById(id).style('background-color');
        return { aria: color('c1'), cass: color('c3'), dov: color('c4'), redHandNode: color('g1'), legend: legend(), saved: plugin.settings.networkGraphDisplay };
    });
    assert.equal(byGroup.aria, 'rgb(255,0,0)', 'Red Hand members take the group colour');
    assert.equal(byGroup.redHandNode, 'rgb(255,0,0)', 'the group node matches its members');
    assert.equal(byGroup.dov, 'rgb(100,116,139)', 'no group is grey');
    assert.notEqual(byGroup.cass, byGroup.dov, 'Grey Guild has a palette colour');
    assert.equal(byGroup.legend[0].heading, 'Colour: group');
    assert.deepEqual(byGroup.legend[0].rows.map(r => [r.label, r.count]), [['Red Hand', 3], ['Grey Guild', 2], ['No group', 3]]);
    assert.equal(byGroup.legend[0].rows[0].swatch, 'rgb(255, 0, 0)', 'legend swatch is the node colour');
    assert.ok(byGroup.legend.some(s => s.heading === 'Shape: entity type'), 'shapes listed once colour stops meaning type');
    assert.equal(byGroup.saved.colorMode, 'group', 'colour mode saved to settings');

    // 3. The legend follows filters: no groups on screen, no group shapes or membership lines
    const filtered = await p.evaluate(async () => {
        await r.applyFilters({ entityTypes: ['character'] });
        return legend();
    });
    assert.deepEqual(filtered.find(s => s.heading === 'Shape: entity type').rows.map(r => r.label), ['Characters']);
    assert.ok(!filtered.find(s => s.heading === 'Lines').rows.some(r => r.label === 'Member of a group'));

    // 4. Clicking an entry hides what it stands for, and survives a refresh
    const hidden = await p.evaluate(async () => {
        const row = Array.from(document.querySelectorAll('.storyteller-network-legend-row'))
            .find(el => el.querySelector('.storyteller-network-legend-label').textContent === 'Red Hand');
        row.click();
        const visible = () => r.cy.nodes().filter(n => n.visible()).map(n => n.id()).sort();
        const afterClick = visible();
        await r.refresh();
        return { afterClick, afterRefresh: visible(), legend: legend(), showAll: !!document.querySelector('.storyteller-network-legend-showall') };
    });
    assert.deepEqual(hidden.afterClick, ['c3', 'c4']);
    assert.deepEqual(hidden.afterRefresh, ['c3', 'c4'], 'hidden entries stay hidden after a refresh');
    assert.equal(hidden.legend[0].rows.find(r => r.label === 'Red Hand').hidden, true, 'hidden entry stays listed, struck through');
    assert.ok(hidden.showAll, 'Show all appears while something is hidden');
    await p.evaluate(() => document.querySelector('.storyteller-network-legend-showall').click());

    // 5. Display options: membership lines and unconnected entities drop out, images toggle
    const options = await p.evaluate(async () => {
        await r.applyFilters({ entityTypes: ['character', 'group'] });
        const before = r.cy.edges().filter(e => e.data('label') === 'member of').length;
        await r.setDisplay({ showMembership: false, showIsolated: false });
        return { before, after: r.cy.edges().filter(e => e.data('label') === 'member of').length, dov: r.cy.getElementById('c4').length };
    });
    assert.ok(options.before > 0);
    assert.equal(options.after, 0, 'membership lines gone');
    assert.equal(options.dov, 0, 'unconnected entity gone');

    // 6. Theme: Parchment reaches the canvas, the labels and the legend
    const themed = await p.evaluate(async () => {
        await r.setDisplay({ showMembership: true, showIsolated: true, legendVisible: true });
        story.activeTimelineThemeId = 'builtin:parchment';
        NG.notifyTimelineThemeChange();
        const canvas = document.querySelector('.storyteller-network-canvas');
        const node = r.cy.getElementById('c3');
        return {
            background: getComputedStyle(canvas).backgroundColor,
            label: node.style('color'),
            legendBg: getComputedStyle(document.querySelector('.storyteller-network-legend-panel')).backgroundColor,
            cass: node.style('background-color'),
            expectedCass: NG.paletteColorFor('g2', ['#8a3b12', '#2f5d50', '#6c4f8a', '#9a6b16', '#3f5f8a', '#7a2e3a', '#4d6b2c', '#a3542b', '#5a4a3a', '#2d6e7e']),
        };
    });
    assert.equal(themed.background, 'rgb(243, 234, 214)', 'canvas takes the theme background');
    assert.equal(themed.label, 'rgb(58,44,26)', 'labels take the theme text colour');
    assert.equal(themed.legendBg, 'rgb(251, 246, 234)', 'legend takes the theme surface');
    const hex = themed.expectedCass.replace('#', '');
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)})`;
    assert.equal(themed.cass, rgb, 'palette-coloured groups follow the theme palette');

    const shotDir = process.argv[2];
    if (shotDir) {
        await p.waitForTimeout(800);
        await p.screenshot({ path: require('path').join(shotDir, 'graph-parchment-by-group.png') });
        await p.evaluate(async () => {
            story.activeTimelineThemeId = 'builtin:high-contrast';
            NG.notifyTimelineThemeChange();
            await r.setDisplay({ colorMode: 'type' });
        });
        await p.waitForTimeout(800);
        await p.screenshot({ path: require('path').join(shotDir, 'graph-high-contrast-by-type.png') });
    }

    await br.close();
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: graph follows the timeline theme, colours by group, and the legend tracks the screen');
})().catch(e => { console.error(e); process.exit(1); });
