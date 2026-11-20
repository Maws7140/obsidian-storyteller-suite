// Renders a story folder through the native timeline with a theme file, for eyeballing
// showcase screenshots before they go into a vault. Not part of the test suite.
//
//   node test/browser/showcase-preview.cjs <story folder> <theme .storytl.json> <out dir>
//
// Writes chronology.png, timeline.png, vertical.png and gantt.png to <out dir>.
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const [storyDir, themeFile, outDir] = process.argv.slice(2);
if (!storyDir || !themeFile || !outDir) {
    console.error('usage: node test/browser/showcase-preview.cjs <story folder> <theme file> <out dir>');
    process.exit(1);
}

function readNotes(folder) {
    const dir = path.join(storyDir, folder);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
        const text = fs.readFileSync(path.join(dir, f), 'utf8');
        const m = text.match(/^---\n([\s\S]*?)\n---/);
        const data = m ? yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) || {} : {};
        return { ...data, name: data.name || f.replace(/\.md$/, ''), filePath: `${folder}/${f}` };
    });
}

const unlink = v => typeof v === 'string' ? v.replace(/^\[\[|\]\]$/g, '') : v;
const events = readNotes('Events').map(e => ({
    ...e,
    dateTime: typeof e.dateTime === 'number' ? String(e.dateTime) : e.dateTime,
    location: unlink(e.location),
    characters: (e.characters || []).map(unlink),
    dependencies: (e.dependencies || []).map(unlink),
    isMilestone: e.isMilestone === true || e.isMilestone === 'true',
}));
const eras = readNotes('Eras');
const locations = readNotes('Locations');
const characters = readNotes('Characters');
const themeDoc = JSON.parse(fs.readFileSync(themeFile, 'utf8'));

const OBSIDIAN_STUB = `
export class Notice { constructor() {} }
export class TFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); this.extension = this.name.split('.').pop(); this.basename = this.name.replace(/\\.[^.]+$/, ''); } }
export async function requestUrl() { throw new Error('offline'); }
export const Platform = { isMobile: false, isDesktop: true, isDesktopApp: true, isPhone: false, isTablet: false };
export class ButtonComponent {}
export function getIcon() { return null; }
export function normalizePath(p) { return String(p); }
export function setIcon() {}
export class Menu { addItem() { return this; } addSeparator() { return this; } showAtMouseEvent() {} showAtPosition() {} }
export class Modal { constructor(app) { this.app = app; } open() {} close() {} }
export class FuzzySuggestModal extends Modal {}
export function prepareFuzzySearch() { return () => null; }
export class Setting {}
`;

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { TimelineRenderer } from './src/utils/NativeTimelineRenderer'; export { TFile } from 'obsidian';",
            resolveDir: process.cwd(),
        },
        bundle: true, write: false, format: 'iife', globalName: 'Native', logLevel: 'error',
        plugins: [{
            name: 'host',
            setup(build) {
                build.onResolve({ filter: /^obsidian$|\/modals\/EventModal$|\/modals\/GalleryModal$/ }, args => ({ path: args.path, namespace: 'host' }));
                build.onLoad({ filter: /.*/, namespace: 'host' }, args => ({
                    loader: 'js',
                    contents: args.path === 'obsidian' ? OBSIDIAN_STUB : args.path.endsWith('GalleryModal') ? 'export class ImageSuggestModal { open() {} }' : 'export class EventModal { open() {} }',
                }));
            },
        }],
    });

    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const SIZE = { width: 1600, height: 900 };
    const views = [
        { file: 'chronology.png', options: { groupMode: 'location', timelineLayout: 'chronology' }, range: [[3018, 8, 20], [3018, 9, 1]] },
        { file: 'timeline.png', options: { groupMode: 'location', timelineLayout: 'timeline' }, range: [[3018, 8, 20], [3018, 9, 1]] },
        { file: 'vertical.png', options: { groupMode: 'location', timelineLayout: 'timeline', timelineOrientation: 'vertical' }, range: [[3018, 8, 20], [3018, 9, 8]] },
        { file: 'gantt.png', options: { groupMode: 'location', ganttMode: true, showEras: true }, range: [[3018, 9, 10], [3019, 2, 5]] },
        { file: 'overview.png', options: { groupMode: 'none', timelineLayout: 'chronology', showEras: true }, range: [[3018, 2, 1], [3019, 2, 15]] },
    ];
    for (const view of views) {
        const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent(`<body class="theme-dark"><div id="host" style="width:${SIZE.width}px;height:${SIZE.height}px;position:relative"></div></body>`);
        await page.addStyleTag({ content: `body { --background-primary:#1e1e1e; --background-secondary:#262626; --background-modifier-border:#3a3a3a; --text-normal:#dadada; --text-muted:#999; --text-faint:#666; --interactive-accent:#7f6df2; --font-interface:system-ui, sans-serif; margin:0 }\n${fs.readFileSync('styles.css', 'utf8')}` });
        await page.evaluate(() => {
            HTMLElement.prototype.createEl = function (tag, options = {}) {
                const el = document.createElement(tag);
                if (typeof options === 'string') el.className = options;
                else { if (options.text) el.textContent = options.text; if (options.cls) el.className = options.cls; for (const [k, v] of Object.entries(options.attr || {})) el.setAttribute(k, v); }
                this.append(el); return el;
            };
            HTMLElement.prototype.createDiv = function (o) { return this.createEl('div', o); };
            HTMLElement.prototype.createSpan = function (o) { return this.createEl('span', o); };
            HTMLElement.prototype.empty = function () { this.replaceChildren(); };
            HTMLElement.prototype.setAttr = function (k, v) { this.setAttribute(k, v); };
            HTMLElement.prototype.addClass = function (...c) { this.classList.add(...c); };
            HTMLElement.prototype.removeClass = function (...c) { this.classList.remove(...c); };
            HTMLElement.prototype.hide = function () { this.style.display = 'none'; };
            HTMLElement.prototype.show = function () { this.style.display = ''; };
            HTMLElement.prototype.toggleClass = function (c, on) { this.classList.toggle(c, on); };
            HTMLElement.prototype.setCssStyles = function (s) { Object.assign(this.style, s); };
            window.activeDocument = document;
        });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(async ({ events, eras, locations, characters, theme, options }) => {
            const story = { id: 's1', name: 'The Fellowship of the Ring', activeTimelineThemeId: theme.id };
            window.plugin = {
                settings: { stories: [story], activeStoryId: 's1', timelineThemes: [theme], calendarSystems: [] },
                getActiveStory: () => story,
                saveSettings: async () => {},
                app: {
                    workspace: { on: () => ({}), offref() {} },
                    vault: { getMarkdownFiles: () => [], getAbstractFileByPath: () => null, readBinary: async () => new ArrayBuffer(0) },
                    metadataCache: { getFileCache: () => null, getFirstLinkpathDest: () => null },
                },
                listEvents: async () => events,
                listLocations: async () => locations,
                listCharacters: async () => characters,
                listScenes: async () => [],
                listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [],
                getTimelineEras: () => eras,
                getTimelineForks: () => [], getTimelineFork: () => undefined,
                getTimelineTracks: () => [], getGroups: () => [],
            };
            window.renderer = new Native.TimelineRenderer(document.getElementById('host'), plugin, options);
            await renderer.initialize();
        }, { events, eras, locations, characters, theme: themeDoc.theme, options: view.options });
        await page.evaluate(([a, b]) => renderer.setVisibleRange(new Date(Date.UTC(...a)), new Date(Date.UTC(...b))), view.range);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(outDir, view.file) });
        if (errors.length) console.log(view.file, 'page errors:', errors.slice(0, 3));
        await page.close();
    }
    await browser.close();
    console.log('wrote', views.map(v => v.file).join(', '), 'to', outDir);
})().catch(error => { console.error(error); process.exit(1); });
