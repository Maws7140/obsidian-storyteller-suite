// Renders the native timeline in Chromium with real canvas drawing and checks
// that themes, CSS snippets and background images reach the pixels.
//
//   node test/browser/timeline-theme.cjs
//
// Screenshots land in the OS temp folder as timeline-theme-*.png.
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const OBSIDIAN_STUB = `
export class Notice { constructor(message) { (window.notices ||= []).push(message); } }
export class TFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); this.extension = this.name.split('.').pop(); this.basename = this.name.replace(/\\.[^.]+$/, ''); } }
export async function requestUrl() { throw new Error('offline'); }
export const Platform = { isMobile: false, isMobileApp: false, isDesktop: true, isDesktopApp: true, isTablet: false, isPhone: false, isIosApp: false, isAndroidApp: false, isMacOS: false };
export class ButtonComponent {}
export class Modal {
    constructor(app) { this.app = app; this.modalEl = document.createElement('div'); this.modalEl.className = 'modal'; this.contentEl = this.modalEl.createDiv('modal-content'); this.modalEl.addClass = (...c) => this.modalEl.classList.add(...c); this.modalEl.setCssStyles = s => Object.assign(this.modalEl.style, s); }
    open() { document.body.append(this.modalEl); this.onOpen(); }
    close() { this.onClose?.(); this.modalEl.remove(); }
}
export class FuzzySuggestModal extends Modal { setPlaceholder() {} }
export function prepareFuzzySearch() { return () => null; }
// Records every control so the harness can drive it by setting name.
window.controls = [];
class Component {
    constructor(kind, setting) { this.kind = kind; this.setting = setting; this.inputEl = document.createElement('input'); window.controls.push(this); }
    setValue(v) { this.value = v; return this; } getValue() { return this.value; }
    onChange(f) { this.change = f; return this; } onClick(f) { this.click = f; return this; }
    setPlaceholder() { return this; } setLimits() { return this; } setDynamicTooltip() { return this; }
    setButtonText(t) { this.text = t; return this; } setCta() { return this; } setTooltip() { return this; } setIcon() { return this; } setDisabled() { return this; }
    addOption() { return this; }
}
export class Setting {
    constructor(el) { this.settingEl = el.createDiv('setting-item'); }
    setName(n) { this.name = n; this.settingEl.dataset.name = n; return this; } setDesc(d) { this.desc = d; return this; } setHeading() { return this; }
    add(kind, f) { f(new Component(kind, this)); return this; }
    addText(f) { return this.add('text', f); } addTextArea(f) { return this.add('textarea', f); } addColorPicker(f) { return this.add('color', f); }
    addSlider(f) { return this.add('slider', f); } addToggle(f) { return this.add('toggle', f); } addDropdown(f) { return this.add('dropdown', f); }
    addButton(f) { return this.add('button', f); } addExtraButton(f) { return this.add('extra', f); }
}
`;

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { TimelineRenderer } from './src/utils/NativeTimelineRenderer'; export { CalendarRegistry } from './src/calendar/CalendarRegistry'; export { PARCHMENT_THEME, HIGH_CONTRAST_THEME } from './src/calendar/themes'; export { TFile } from 'obsidian'; export { TimelineThemeEditorModal } from './src/modals/TimelineThemeModal';",
            resolveDir: process.cwd(),
        },
        bundle: true,
        write: false,
        format: 'iife',
        globalName: 'Native',
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

    // CHROMIUM_PATH lets a machine whose Playwright browsers do not match point at its own Chromium.
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto('about:blank');
        await page.setContent('<body class="theme-dark"><div id="host" style="width:1000px;height:520px;position:relative"></div></body>');
        // Stand-in Obsidian theme variables, then the plugin stylesheet.
        await page.addStyleTag({ content: `body { --background-primary:#1e1e1e; --background-secondary:#262626; --background-secondary-alt:#2a2a2a; --background-modifier-border:#3a3a3a; --background-modifier-border-hover:#555; --text-normal:#dadada; --text-muted:#999; --text-accent:#a88bfa; --text-on-accent:#fff; --interactive-accent:#7f6df2; --color-red:#fb464c; --color-yellow:#e0ac00; --color-purple:#a882ff; --color-orange:#e9973f; --font-interface:sans-serif; margin:0 }\n${fs.readFileSync('styles.css', 'utf8')}` });
        await page.evaluate(() => {
            HTMLElement.prototype.createEl = function (tag, options = {}) {
                const el = document.createElement(tag);
                if (typeof options === 'string') el.className = options;
                else {
                    if (options.text) el.textContent = options.text;
                    if (options.cls) el.className = options.cls;
                    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
                }
                this.append(el);
                return el;
            };
            HTMLElement.prototype.createDiv = function (options) { return this.createEl('div', options); };
            HTMLElement.prototype.empty = function () { this.replaceChildren(); };
            HTMLElement.prototype.hide = function () { this.style.display = 'none'; };
            HTMLElement.prototype.show = function () { this.style.display = ''; };
            HTMLElement.prototype.toggleClass = function (cls, on) { this.classList.toggle(cls, on); };
            window.activeDocument = document;
        });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });

        await page.evaluate(async () => {
            // A 4x4 red/blue checker as the vault image.
            const art = document.createElement('canvas');
            art.width = 4; art.height = 4;
            const g = art.getContext('2d');
            g.fillStyle = '#ff0000'; g.fillRect(0, 0, 4, 4);
            g.fillStyle = '#0000ff'; g.fillRect(0, 0, 2, 2); g.fillRect(2, 2, 2, 2);
            const bytes = await new Promise(resolve => art.toBlob(blob => blob.arrayBuffer().then(resolve)));
            window.cssChange = [];
            const files = { 'Art/checker.png': bytes };
            const story = { id: 's1', name: 'Story', activeTimelineThemeId: 'builtin:obsidian-native' };
            window.plugin = {
                settings: { stories: [story], activeStoryId: 's1', timelineThemes: [], calendarSystems: [] },
                getActiveStory: () => story,
                saveSettings: async () => {},
                app: {
                    workspace: { on: (name, callback) => { if (name === 'css-change') window.cssChange.push(callback); return { name }; }, offref() {} },
                    vault: {
                        getMarkdownFiles: () => [],
                        getAbstractFileByPath: p => files[p] ? new Native.TFile(p) : null,
                        readBinary: async file => files[file.path],
                    },
                    metadataCache: { getFileCache: () => null, getFirstLinkpathDest: () => null },
                },
                listEvents: async () => [
                    { id: 'e1', name: 'Founding of the harbour', dateTime: '1420-03-15', characters: ['Mira'], location: 'Harbour' },
                    { id: 'e2', name: 'The siege', dateTime: '1422-06-01 to 1422-09-01', characters: ['Mira', 'Tavin'], location: 'Walls', isMilestone: true },
                    { id: 'e3', name: 'Council meets', dateTime: '1423-01-10', characters: ['Tavin'], location: 'Harbour', dependencies: ['e1'] },
                ],
                listLocations: async () => [],
                listCharacters: async () => [],
                listScenes: async () => [],
                listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [],
                getTimelineEras: () => [],
                getTimelineForks: () => [], getTimelineFork: () => undefined,
                getTimelineTracks: () => [], getGroups: () => [],
            };
            window.renderer = new Native.TimelineRenderer(document.getElementById('host'), plugin, { groupMode: 'location', ganttMode: true });
            await renderer.initialize();
        });

        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const pixel = (x, y) => page.evaluate(([px, py]) => {
            const canvas = document.querySelector('#host canvas');
            const [r, g, b] = canvas.getContext('2d').getImageData(px, py, 1, 1).data;
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }, [x, y]);
        const shot = name => page.screenshot({ path: path.join(os.tmpdir(), `timeline-theme-${name}.png`) });
        // Bottom-right corner: plot area, below every lane.
        const PLOT = [990, 510];

        await settle();
        assert.equal(await pixel(...PLOT), '#1e1e1e', 'native theme follows the Obsidian background');
        await shot('native');

        // Zoomed in, the axis walks months and then days on real boundaries.
        for (const [name, from, to] of [['months', [1420, 0, 1], [1421, 5, 1]], ['days', [1420, 2, 1], [1420, 4, 1]]]) {
            await page.evaluate(([a, b]) => renderer.setVisibleRange(new Date(Date.UTC(...a)), new Date(Date.UTC(...b))), [from, to]);
            await settle();
            await shot(name);
        }
        await page.evaluate(() => renderer.fitToView());
        await settle();

        // A CSS snippet reaches the canvas, and a css-change event repaints live.
        await page.addStyleTag({ content: '.sts-native-timeline { --sts-timeline-background: #ff00ff; }' });
        await page.evaluate(() => window.cssChange.forEach(callback => callback()));
        await settle();
        assert.equal(await pixel(...PLOT), '#ff00ff', 'snippet variable drives the canvas after css-change');

        // Switching the story's theme repaints open timelines without remounting.
        await page.evaluate(() => new Native.CalendarRegistry(plugin).setActiveTheme('builtin:parchment'));
        await settle();
        assert.equal(await pixel(...PLOT), '#f3ead6', 'a theme colour wins over the snippet');
        const font = await page.evaluate(() => getComputedStyle(document.querySelector('.sts-native-timeline')).getPropertyValue('--sts-timeline-font').trim());
        assert.match(font, /Georgia/);
        await shot('parchment');

        // Back to native: inline variables are cleared, so the snippet shows again.
        await page.evaluate(() => new Native.CalendarRegistry(plugin).setActiveTheme('builtin:obsidian-native'));
        await settle();
        assert.equal(await pixel(...PLOT), '#ff00ff', 'switching away clears the previous theme');

        // A saved custom theme: wider lane labels, own palette, background image.
        await page.evaluate(async () => {
            const registry = new Native.CalendarRegistry(plugin);
            await registry.saveTheme({
                id: 'custom', name: 'Custom',
                colors: { background: '#000000', sidebar: '#003300' },
                palette: ['#00ff00'],
                lane: { labelWidth: 300 },
                background: { image: 'Art/checker.png', fit: 'stretch', opacity: 1 },
            });
            await registry.setActiveTheme('custom');
        });
        await page.waitForFunction(() => {
            const [r, , b] = document.querySelector('#host canvas').getContext('2d').getImageData(990, 510, 1, 1).data;
            return r > 200 || b > 200;
        }, null, { timeout: 5000 });
        const bg = await pixel(...PLOT);
        assert(bg === '#ff0000' || bg === '#0000ff', `background image is drawn (got ${bg})`);
        // The sidebar is 300px wide now: x=280 is still sidebar, x=320 is plot.
        assert.equal(await pixel(280, 120), '#003300', 'lane label width comes from the theme');
        assert.notEqual(await pixel(320, 120), '#003300');
        await shot('custom-image');

        // Export with the image still produces a data URL (the canvas is not tainted).
        const exported = await page.evaluate(() => {
            const full = renderer.renderFullRange();
            return full ? full.toDataURL('image/png').slice(0, 22) : null;
        });
        assert.equal(exported, 'data:image/png;base64,');

        // A theme override, as the editor's preview uses, beats the story's theme.
        await page.evaluate(() => renderer.setTheme({ id: 'draft', name: 'Draft', colors: { background: '#123456' } }));
        await settle();
        assert.equal(await pixel(...PLOT), '#123456', 'preview override draws the draft');

        // The editor: opens with a live preview, previews a colour change
        // without touching the story, and saves into the story's themes.
        await page.evaluate(async () => {
            renderer.destroy();
            window.editor = new Native.TimelineThemeEditorModal(plugin.app, plugin, { id: 'edited', name: 'Edited' }, { activateOnSave: true });
            editor.open();
            await new Promise(resolve => setTimeout(resolve, 100));
        });
        await settle();
        const previewPixel = () => page.evaluate(() => {
            const canvas = document.querySelector('.storyteller-theme-preview-canvas canvas');
            const [r, g, b] = canvas.getContext('2d').getImageData(canvas.width - 4, canvas.height - 4, 1, 1).data;
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        });
        assert.equal(await previewPixel(), '#ff00ff', 'preview starts from the inherited look (the snippet)');
        const inheritedHex = await page.evaluate(() => controls.find(c => c.kind === 'color' && c.setting.name === 'Background').value);
        assert.equal(inheritedHex, '#ff00ff', 'colour picker opens on the inherited value');
        await page.evaluate(() => controls.find(c => c.kind === 'color' && c.setting.name === 'Background').change('#00aa55'));
        await page.waitForTimeout(150);
        await settle();
        assert.equal(await previewPixel(), '#00aa55', 'preview follows the draft');
        assert.equal(await page.evaluate(() => plugin.settings.stories[0].activeTimelineThemeId), 'custom', 'nothing saved before Save');
        await page.evaluate(() => controls.find(c => c.kind === 'toggle' && c.setting.name === 'Custom palette').change(true));
        const paletteRows = await page.evaluate(() => controls.filter(c => c.kind === 'color' && /^Colour \d+$/.test(c.setting.name)).length);
        assert.equal(paletteRows, 10, 'custom palette starts from the inherited ten colours');
        await page.evaluate(async () => { await controls.find(c => c.kind === 'button' && c.text === 'Save theme').click(); });
        await page.waitForTimeout(50);
        const saved = await page.evaluate(() => ({ active: plugin.settings.stories[0].activeTimelineThemeId, theme: plugin.settings.timelineThemes.find(t => t.id === 'edited') }));
        assert.equal(saved.active, 'edited');
        assert.equal(saved.theme.colors.background, '#00aa55');
        assert.equal(saved.theme.palette.length, 10);
        assert.equal(await page.locator('.storyteller-theme-preview-canvas canvas').count(), 0, 'closing tears the preview down');

        assert.deepEqual(errors, []);
        console.log('PASS native, CSS snippet + css-change, theme switch, custom palette/label width/background image, export, preview override, theme editor preview and save.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
