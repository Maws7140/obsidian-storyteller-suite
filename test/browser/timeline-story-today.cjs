// Each story keeps its own "today". Renders the Calendar view in Chromium and
// checks that the today cell follows the story's custom today, falls back to
// the vault-wide one when the story clears it, and in a story with its own
// calendar lands on the same day as an event dated the same way.
//
//   node test/browser/timeline-story-today.cjs
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('fs');
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
            contents: "export { TimelineRenderer } from './src/utils/NativeTimelineRenderer'; export { CalendarRegistry } from './src/calendar/CalendarRegistry'; export { resolveReferenceToday } from './src/calendar/ReferenceToday';",
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
        await page.addStyleTag({ content: fs.readFileSync('styles.css', 'utf8') });
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
            const fantasy = {
                schemaVersion: 1, id: 'fantasy-forty', name: 'Fantasy Forty', baseUnit: 'day', unitsPerDay: 1, epochAbsoluteDay: 0, epochLabel: 'AF',
                months: [{ name: 'Frost', abbr: 'Fr', days: 10 }, { name: 'Bloom', abbr: 'Bl', days: 10 }, { name: 'Blaze', abbr: 'Bz', days: 10 }, { name: 'Fade', abbr: 'Fa', days: 10 }],
            };
            window.story = { id: 's1', name: 'Story', customToday: '1420-06-15' };
            window.events = [{ id: 'e1', name: 'Coronation', dateTime: '1420-06-15' }];
            window.plugin = {
                settings: { stories: [story], activeStoryId: 's1', timelineThemes: [], calendarSystems: [fantasy], customTodayISO: '1300-01-01' },
                getActiveStory: () => story,
                saveSettings: async () => {},
                app: {
                    workspace: { on: name => ({ name }), offref() {} },
                    vault: { getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
                    metadataCache: { getFileCache: () => null, getFirstLinkpathDest: () => null },
                },
                listEvents: async () => events,
                listLocations: async () => [], listCharacters: async () => [], listScenes: async () => [],
                listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [],
                getTimelineEras: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
                getTimelineTracks: () => [], getGroups: () => [],
            };
            // What the plugin's getReferenceTodayDate does when no timeline block overrides it.
            const registry = new Native.CalendarRegistry(plugin);
            const today = () => Native.resolveReferenceToday([story.customToday, plugin.settings.customTodayISO], registry.calendarFor(story));
            window.renderer = new Native.TimelineRenderer(document.getElementById('host'), plugin, { calendarMode: true, getReferenceDate: today });
            await renderer.initialize();
            renderer.setCalendarMode(true);
            renderer.calendarHost.showToday();
        });

        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = () => page.evaluate(() => ({
            month: document.querySelector('.storyteller-timeline-calendar-title-month')?.textContent,
            year: document.querySelector('.storyteller-timeline-calendar-title-year')?.textContent,
            todayNumbers: [...document.querySelectorAll('.storyteller-timeline-calendar-daynum.is-today')].map(el => el.textContent),
        }));
        const show = async () => {
            await page.evaluate(async () => { await renderer.refresh(); renderer.calendarHost.showToday(); });
            await settle();
            return state();
        };

        await settle();
        let s = await state();
        assert.equal(s.month, 'June', 'opens on the story\'s today, not the system date or the vault default');
        assert.match(s.year, /1420/);
        assert.deepEqual(s.todayNumbers, ['15']);

        // Clearing the story's today falls back to the vault-wide default.
        await page.evaluate(() => { story.customToday = undefined; });
        s = await show();
        assert.equal(s.month, 'January');
        assert.match(s.year, /1300/);
        assert.deepEqual(s.todayNumbers, ['1']);

        // A story with its own calendar: today typed in that calendar sits on the
        // same day as an event dated the same way.
        await page.evaluate(() => {
            story.activeCalendarId = 'fantasy-forty';
            story.customToday = 'Bloom 7, 342 AF';
            events.splice(0, events.length, { id: 'e2', name: 'Thaw feast', dateTime: 'Bloom 7, 342 AF' });
        });
        s = await show();
        assert.equal(s.month, 'Bloom');
        assert.match(s.year, /342/);
        assert.deepEqual(s.todayNumbers, ['7']);
        const placement = await page.evaluate(() => {
            const chip = [...document.querySelectorAll('.storyteller-timeline-calendar-chip')].find(el => el.textContent.includes('Thaw feast'));
            const today = document.querySelector('.storyteller-timeline-calendar-daynum.is-today');
            if (!chip || !today) return `chip ${Boolean(chip)}, today ${Boolean(today)}`;
            const a = chip.getBoundingClientRect(), b = today.getBoundingClientRect();
            const sameColumn = a.left < b.right && b.left < a.right;
            const justBelow = a.top >= b.top && a.top - b.bottom < 80;
            return sameColumn && justBelow ? 'under today' : `chip ${a.left},${a.top}; today ${b.left},${b.bottom}`;
        });
        assert.equal(placement, 'under today', 'the event dated today sits in the today cell');

        assert.deepEqual(errors, []);
        console.log('timeline-story-today: ok');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
