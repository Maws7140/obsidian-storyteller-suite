// Renders the Calendar view in Chromium and checks that it fills the pane and
// takes its look from the timeline theme, as the canvas views do.
//
//   node test/browser/timeline-calendar.cjs
//
// Screenshots land in the OS temp folder as timeline-calendar-*.png.
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
export function getIcon() { return null; }
export function normalizePath(p) { return String(p); }
export function setIcon() {}
export class Menu { addItem() { return this; } addSeparator() { return this; } showAtMouseEvent() {} showAtPosition() {} }
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
    constructor(kind, setting) { this.kind = kind; this.setting = setting; this.inputEl = document.createElement('input'); this.sliderEl = document.createElement('input'); window.controls.push(this); }
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

const SIZE = { width: 1280, height: 800 };

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { TimelineRenderer } from './src/utils/NativeTimelineRenderer'; export { CalendarRegistry } from './src/calendar/CalendarRegistry'; export { TFile } from 'obsidian';",
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

    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto('about:blank');
        await page.setContent(`<body class="theme-dark"><div id="host" style="width:${SIZE.width}px;height:${SIZE.height}px;position:relative"></div></body>`);
        await page.addStyleTag({ content: `body { --background-primary:#1e1e1e; --background-secondary:#262626; --background-secondary-alt:#2a2a2a; --background-modifier-border:#3a3a3a; --background-modifier-border-hover:#555; --background-modifier-hover:rgba(255,255,255,0.06); --text-normal:#dadada; --text-muted:#999; --text-faint:#666; --text-accent:#a88bfa; --text-on-accent:#fff; --interactive-accent:#7f6df2; --interactive-normal:#2a2a2a; --interactive-hover:#333; --color-red:#fb464c; --color-yellow:#e0ac00; --color-purple:#a882ff; --color-orange:#e9973f; --font-interface:system-ui, sans-serif; --font-ui-smaller:12px; --font-ui-small:13px; --font-ui-medium:15px; --font-ui-large:20px; --radius-s:4px; --radius-m:8px; --shadow-s:0 2px 6px rgba(0,0,0,.4); margin:0; font-family: var(--font-interface) }\n${fs.readFileSync('styles.css', 'utf8')}` });
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
            HTMLElement.prototype.createSpan = function (options) { return this.createEl('span', options); };
            HTMLElement.prototype.empty = function () { this.replaceChildren(); };
            HTMLElement.prototype.setAttr = function (key, value) { this.setAttribute(key, value); };
            HTMLElement.prototype.hide = function () { this.style.display = 'none'; };
            HTMLElement.prototype.show = function () { this.style.display = ''; };
            HTMLElement.prototype.toggleClass = function (cls, on) { this.classList.toggle(cls, on); };
            HTMLElement.prototype.addClass = function (...cls) { this.classList.add(...cls); };
            HTMLElement.prototype.removeClass = function (...cls) { this.classList.remove(...cls); };
            HTMLElement.prototype.hasClass = function (cls) { return this.classList.contains(cls); };
            HTMLElement.prototype.setCssStyles = function (styles) { Object.assign(this.style, styles); };
            HTMLElement.prototype.setCssProps = function (props) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); };
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
            const files = { 'Art/checker.png': bytes };
            const story = { id: 's1', name: 'Story', activeTimelineThemeId: 'builtin:obsidian-native' };
            window.plugin = {
                settings: { stories: [story], activeStoryId: 's1', timelineThemes: [], calendarSystems: [] },
                getActiveStory: () => story,
                saveSettings: async () => {},
                app: {
                    workspace: { on: name => ({ name }), offref() {} },
                    vault: {
                        getMarkdownFiles: () => [],
                        getAbstractFileByPath: p => files[p] ? new Native.TFile(p) : null,
                        readBinary: async file => files[file.path],
                    },
                    metadataCache: { getFileCache: () => null, getFirstLinkpathDest: () => null },
                },
                listEvents: async () => [
                    { id: 'e1', name: 'Founding of the harbour', dateTime: '2026-10-02', location: 'Harbour' },
                    { id: 'e2', name: 'The siege', dateTime: '2026-10-05 to 2026-10-09', location: 'Walls', isMilestone: true },
                    { id: 'e3', name: 'Council meets', dateTime: '2026-10-07', location: 'Harbour' },
                    { id: 'e4', name: 'Market day', dateTime: '2026-10-07', location: 'Square' },
                    { id: 'e5', name: 'Storm season', dateTime: '2026-10-12 to 2026-10-21', location: 'Sea' },
                    { id: 'e6', name: 'Envoy arrives', dateTime: '2026-10-14 09:30', location: 'Harbour' },
                    { id: 'e7', name: 'Lantern festival', dateTime: '2026-10-29', location: 'Square' },
                    { id: 'e8', name: 'Trial of Tavin', dateTime: '2026-10-29 14:00', location: 'Walls' },
                    { id: 'e9', name: 'Fleet departs', dateTime: '2026-10-30 to 2026-11-03', location: 'Sea' },
                    { id: 'e10', name: 'Duel at dawn', dateTime: '2026-10-07', location: 'Walls' },
                    { id: 'e11', name: 'Harvest ends', dateTime: '2026-10-07', location: 'Fields' },
                ],
                listLocations: async () => [],
                listCharacters: async () => [],
                listScenes: async () => [],
                listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [],
                getTimelineEras: () => [],
                getTimelineForks: () => [], getTimelineFork: () => undefined,
                getTimelineTracks: () => [], getGroups: () => [],
            };
            window.renderer = new Native.TimelineRenderer(document.getElementById('host'), plugin, { groupMode: 'location', calendarMode: true });
            await renderer.initialize();
            renderer.setCalendarMode(true);
            renderer.calendarHost.showToday();
        });

        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const shot = name => page.screenshot({ path: path.join(os.tmpdir(), `timeline-calendar-${name}.png`) });
        await settle();
        await shot('native');

        if (process.env.SHOT_ONLY) { console.log('shots in', os.tmpdir()); return; }

        const pixel = (x, y) => page.evaluate(([px, py]) => {
            const canvas = document.querySelector('#host canvas');
            const [r, g, b] = canvas.getContext('2d').getImageData(px, py, 1, 1).data;
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }, [x, y]);
        const geometry = () => page.evaluate(() => {
            const panel = document.querySelector('.storyteller-timeline-calendar').getBoundingClientRect();
            const board = document.querySelector('.storyteller-timeline-calendar-board').getBoundingClientRect();
            const chips = [...document.querySelectorAll('.storyteller-timeline-calendar-chip')];
            return {
                panelBottom: panel.bottom, boardBottom: board.bottom,
                stripes: chips.filter(chip => parseFloat(getComputedStyle(chip).borderLeftWidth) > 0).length,
                chips: chips.length,
                more: document.querySelectorAll('.storyteller-timeline-calendar-more').length,
                radius: getComputedStyle(document.querySelector('.storyteller-timeline-calendar-chip')).borderTopLeftRadius,
                opacity: getComputedStyle(document.querySelector('.storyteller-timeline-calendar-chip')).opacity,
                color: getComputedStyle(document.querySelector('.storyteller-timeline-calendar')).color,
                font: getComputedStyle(document.querySelector('.storyteller-timeline-calendar')).fontFamily,
                todayNumber: document.querySelector('.storyteller-timeline-calendar-daynum.is-today')?.textContent,
                times: [...document.querySelectorAll('.storyteller-timeline-calendar-chip-time')].map(el => el.textContent),
            };
        });

        // Full pane: the month reaches the bottom of the view, and no chip has a side stripe.
        let g = await geometry();
        assert(SIZE.height - g.boardBottom < 30, `board fills the pane (bottom ${g.boardBottom})`);
        assert.equal(g.stripes, 0, 'chips have no coloured side stripe');
        assert.equal(g.todayNumber, '29');
        assert.deepEqual(g.times, ['09:30', '14:00'], 'one-day events show their start time');
        assert.equal(await pixel(5, SIZE.height - 5), '#1e1e1e', 'canvas paints the theme background under the month');

        // A tall pane fits more chip rows per week than a short one.
        const tallChips = g.chips;
        await page.evaluate(() => { document.getElementById('host').style.height = '420px'; });
        await page.waitForTimeout(100); await settle();
        const short = await geometry();
        assert(short.chips < tallChips, `short pane shows fewer chips (${short.chips} < ${tallChips})`);
        assert(short.more >= 1, 'and folds the rest into +N more');
        await shot('short');
        await page.evaluate(h => { document.getElementById('host').style.height = h + 'px'; }, SIZE.height);
        await page.waitForTimeout(100); await settle();

        // Theme colours, font, radius and opacity reach the calendar.
        await page.evaluate(() => new Native.CalendarRegistry(plugin).setActiveTheme('builtin:parchment'));
        await settle();
        g = await geometry();
        assert.equal(g.color, 'rgb(58, 44, 26)', 'theme text colour');
        assert.match(g.font, /Georgia/, 'theme font');
        assert.equal(await pixel(5, SIZE.height - 5), '#f3ead6', 'theme background behind the month');
        await shot('parchment');

        await page.evaluate(async () => {
            const registry = new Native.CalendarRegistry(plugin);
            await registry.saveTheme({
                id: 'custom', name: 'Custom',
                colors: { background: '#000000', text: '#ffffff', accent: '#ff8800' },
                event: { radius: 10, opacity: 0.5, height: 28 },
                background: { image: 'Art/checker.png', fit: 'stretch', opacity: 1 },
            });
            await registry.setActiveTheme('custom');
        });
        await page.waitForFunction(() => {
            const [r, g, b] = document.querySelector('#host canvas').getContext('2d').getImageData(5, 795, 1, 1).data;
            return g < 60 && ((r > 200 && b < 60) || (b > 200 && r < 60));
        }, null, { timeout: 5000 });
        g = await geometry();
        assert.equal(g.radius, '12px', 'chip radius follows the theme');
        assert.equal(g.opacity, '0.5', 'chip opacity follows the theme');
        await shot('custom-image');

        // Narrow pane: the agenda, no stripes either.
        await page.evaluate(() => new Native.CalendarRegistry(plugin).setActiveTheme('builtin:obsidian-native'));
        await page.evaluate(() => { document.getElementById('host').style.width = '420px'; });
        await page.waitForTimeout(100); await settle();
        const agenda = await page.evaluate(() => ({
            days: document.querySelectorAll('.storyteller-timeline-calendar-agenda-day').length,
            stripes: [...document.querySelectorAll('.storyteller-timeline-calendar-agenda-item')].filter(el => parseFloat(getComputedStyle(el).borderLeftWidth) > 0).length,
        }));
        assert(agenda.days > 5, `agenda lists the days (${agenda.days})`);
        assert.equal(agenda.stripes, 0);
        await shot('agenda');
        await page.evaluate(w => { document.getElementById('host').style.width = w + 'px'; }, SIZE.width);
        await page.waitForTimeout(100); await settle();

        // Edit mode: dragging a chip one day to the right moves it by one day.
        await page.evaluate(() => {
            renderer.setEditMode(true);
            renderer.calendarHost.isDraggable = () => true;
            renderer.calendarHost.moveItemByDays = async (item, days) => { window.moved = [item.event.id, days]; };
        });
        await settle();
        const chip = page.locator('.storyteller-timeline-calendar-chip', { hasText: 'Founding of the harbour' });
        const box = await chip.boundingBox();
        const dayWidth = (SIZE.width - 36) / 7;
        await page.mouse.move(box.x + 20, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 20 + dayWidth / 2, box.y + box.height / 2, { steps: 4 });
        await page.mouse.move(box.x + 20 + dayWidth, box.y + box.height / 2, { steps: 4 });
        await page.mouse.up();
        assert.deepEqual(await page.evaluate(() => window.moved), ['e1', 1], 'drag moves the event a day');

        console.log('PASS full-pane month, no stripes, start times, lanes by height, theme colours/font/radius/opacity/background image, agenda, drag to move.');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
