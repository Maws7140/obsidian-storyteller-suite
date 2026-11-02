// Renders a story folder's characters, locations and groups through the real network graph
// with a theme file, for eyeballing showcase screenshots. Not part of the test suite.
//
//   node test/browser/showcase-graph-preview.cjs <story folder> <theme .storytl.json> <out dir>
//
// Writes graph-by-group.png and graph-characters.png to <out dir>.
const root = require('path').resolve(__dirname, '../..') + '/';
const path = require('path');
const fs = require('fs');
const yaml = require(root + 'node_modules/js-yaml');
const { chromium } = require(root + 'node_modules/playwright');
const esbuild = require(root + 'node_modules/esbuild');

const [storyDir, themeFile, outDir] = process.argv.slice(2);
if (!storyDir || !themeFile || !outDir) {
    console.error('usage: node test/browser/showcase-graph-preview.cjs <story folder> <theme file> <out dir>');
    process.exit(1);
}

function readNotes(folder) {
    const dir = path.join(storyDir, folder);
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
        const text = fs.readFileSync(path.join(dir, f), 'utf8');
        const m = text.match(/^---\n([\s\S]*?)\n---/);
        const data = m ? yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) || {} : {};
        return { ...data, name: data.name || f.replace(/\.md$/, '') };
    });
}

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { NetworkGraphRenderer } from './src/views/NetworkGraphRenderer';\nexport { parseTypedRelationships } from './src/yaml/EntitySections';",
            resolveDir: root, loader: 'ts',
        },
        bundle: true, write: false, format: 'iife', globalName: 'NG', logLevel: 'error',
        plugins: [{ name: 'host', setup(b) {
            b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
            b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export class TFile {}; export const setIcon=()=>{}; export class Notice{constructor(){}}; export function normalizePath(p){return p}; export function parseYaml(){return {}}; export function stringifyYaml(){return ""}', loader: 'js' }));
        } }],
    });

    const characters = readNotes('Characters');
    const locations = readNotes('Locations');
    const groupNotes = readNotes('Groups');
    const groups = groupNotes.map(g => ({
        id: g['storyteller-id'], name: g.name, color: g.color,
        members: characters.filter(c => (c.groups || []).includes(g['storyteller-id'])).map(c => ({ type: 'character', id: c.id })),
    }));
    const theme = JSON.parse(fs.readFileSync(themeFile, 'utf8')).theme;

    fs.mkdirSync(outDir, { recursive: true });
    const br = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const shots = [
        { file: 'graph-by-group.png', display: { colorMode: 'group', showMembership: false, showIsolated: false, legendVisible: true }, types: ['character'] },
        { file: 'graph-characters.png', display: { colorMode: 'connections', showMembership: false, showIsolated: false, legendVisible: true }, types: ['character'] },
    ];
    for (const shot of shots) {
        const p = await br.newPage({ viewport: { width: 1600, height: 900 } });
        const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        await p.setContent('<body class="theme-dark" style="margin:0;--background-primary:#1e1e1e;--background-secondary:#262626;--background-modifier-border:#3a3a3a;--text-normal:#dadada;--text-muted:#999;--interactive-accent:#7c3aed;--font-interface:sans-serif"><div id="host" style="width:1600px;height:900px;position:relative"></div></body>');
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
        await p.addScriptTag({ content: bundle.outputFiles[0].text });
        await p.evaluate(async ({ characters, locations, groups, theme, display, types }) => {
            const story = { activeTimelineThemeId: theme.id };
            const chars = characters.map(c => ({ ...c, connections: NG.parseTypedRelationships(c.connections || []) }));
            const plugin = {
                settings: { timelineThemes: [theme], networkGraphDisplay: display },
                saveSettings: async () => {},
                getActiveStory: () => story,
                listCharacters: async () => chars,
                listLocations: async () => locations,
                listEvents: async () => [], listPlotItems: async () => [],
                listCultures: async () => [], listEconomies: async () => [], listMagicSystems: async () => [],
                getGroups: () => groups,
                app: { vault: { getAbstractFileByPath: () => null }, workspace: { on: () => ({}), offref: () => {} }, metadataCache: { getFirstLinkpathDest: () => null } },
            };
            window.r = new NG.NetworkGraphRenderer(document.getElementById('host'), plugin);
            await r.initializeCytoscape();
            await r.applyFilters({ entityTypes: types });
            await r.setDisplay(display);
        }, { characters, locations, groups, theme, display: shot.display, types: shot.types });
        await p.waitForTimeout(1500);
        await p.screenshot({ path: path.join(outDir, shot.file) });
        if (errors.length) console.log(shot.file, 'page errors:', errors.slice(0, 3));
        await p.close();
    }
    await br.close();
    console.log('wrote', shots.map(s => s.file).join(', '), 'to', outDir);
})().catch(e => { console.error(e); process.exit(1); });
