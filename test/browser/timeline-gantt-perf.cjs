// Frame-time benchmark for the Gantt view: a story with many events and
// dependencies, timed while panning, zooming and hovering.
//
//   node test/browser/timeline-gantt-perf.cjs [source root] [label] [events]
//   PROFILE=1 ...   also prints the functions taking the most CPU while panning
//   SNAP=out.png ... writes one frame instead, for pixel comparison between builds
//   CHROMIUM_PATH=... uses that Chromium instead of Playwright's
const path = require('path');
const ROOT = path.resolve(process.argv[2] || '.');
const LABEL = process.argv[3] || 'build';
const N = Number(process.argv[4] || 400);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('fs');
const STUB = `
export class Notice { constructor(m) {} }
export class TFile { constructor(p) { this.path = p; this.name = p.split('/').pop(); this.extension = this.name.split('.').pop(); this.basename = this.name; } }
export async function requestUrl() { throw new Error('offline'); }
export const Platform = { isMobile: false, isDesktop: true, isPhone: false, isTablet: false, isMobileApp: false, isDesktopApp: true, isIosApp: false, isAndroidApp: false, isMacOS: false };
export class ButtonComponent {}
export function getIcon() { return null; }
export function normalizePath(p) { return String(p); }
export function setIcon() {}
export class Menu { addItem() { return this; } addSeparator() { return this; } showAtMouseEvent() {} showAtPosition() {} }
export class Modal { open() {} close() {} }
export class FuzzySuggestModal extends Modal {}
export function prepareFuzzySearch() { return () => null; }
export class Setting {}
`;
(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { TimelineRenderer } from './src/utils/NativeTimelineRenderer';", resolveDir: ROOT },
    bundle: true, write: false, format: 'iife', globalName: 'Native', logLevel: 'silent',
    plugins: [{ name: 'host', setup(b) {
      b.onResolve({ filter: /^obsidian$|\/modals\/EventModal$/ }, a => ({ path: a.path, namespace: 'host' }));
      b.onLoad({ filter: /.*/, namespace: 'host' }, a => ({ loader: 'js', contents: a.path === 'obsidian' ? STUB : 'export class EventModal { open() {} }' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<body class="theme-dark"><div id="host" style="width:1300px;height:800px;position:relative"></div></body>');
  await page.addStyleTag({ content: `body { --background-primary:#1e1e1e; --background-secondary:#262626; --background-secondary-alt:#2a2a2a; --background-modifier-border:#3a3a3a; --text-normal:#dadada; --text-muted:#999; --interactive-accent:#7f6df2; --font-interface:sans-serif; margin:0 }\n${fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')}` });
  await page.evaluate(() => {
    HTMLElement.prototype.createEl = function (t, o = {}) { const e = document.createElement(t); if (typeof o === 'string') e.className = o; else { if (o.text) e.textContent = o.text; if (o.cls) e.className = o.cls; for (const [k, v] of Object.entries(o.attr || {})) e.setAttribute(k, v); } this.append(e); return e; };
    HTMLElement.prototype.createDiv = function (o) { return this.createEl('div', o); };
    HTMLElement.prototype.createSpan = function (o) { return this.createEl('span', o); };
    HTMLElement.prototype.empty = function () { this.replaceChildren(); };
    HTMLElement.prototype.setAttr = function (k, v) { this.setAttribute(k, v); };
    HTMLElement.prototype.hide = function () { this.style.display = 'none'; };
    HTMLElement.prototype.show = function () { this.style.display = ''; };
    HTMLElement.prototype.toggleClass = function (c, on) { this.classList.toggle(c, on); };
    HTMLElement.prototype.addClass = function (...c) { this.classList.add(...c); };
    HTMLElement.prototype.removeClass = function (...c) { this.classList.remove(...c); };
    HTMLElement.prototype.setCssStyles = function (s) { Object.assign(this.style, s); };
    HTMLElement.prototype.setText = function (t) { this.textContent = t; };
    window.activeDocument = document; window.activeWindow = window;
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const cdp = await page.context().newCDPSession(page);
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); }
  await page.exposeFunction('__profStart', async () => { if (process.env.PROFILE) await cdp.send('Profiler.start'); });
  await page.exposeFunction('__profStop', async () => {
    if (!process.env.PROFILE) return;
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
    for (const [id, us] of counts) { const n = byId.get(id); const key = `${n.callFrame.functionName || '(anon)'} @${n.callFrame.lineNumber}`; self.set(key, (self.get(key) || 0) + us); }
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / total * 100).toFixed(1)}%  ${k}`).join('\n'));
  });
  if (process.env.SNAP) await page.evaluate(() => { window.__snap = true; });
  const result = await page.evaluate(async (N) => {
    const chars = Array.from({ length: 12 }, (_, i) => `Character ${i + 1}`);
    const events = Array.from({ length: N }, (_, i) => {
      const y = 1400 + Math.floor(i / 12), m = 1 + (i % 12), d = 1 + (i * 7) % 27;
      const start = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const end = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(28, d + 9)).padStart(2, '0')}`;
      return { id: `e${i}`, name: `Event number ${i} with a longer title`, dateTime: i % 3 ? `${start} to ${end}` : start, characters: [chars[i % 12], chars[(i * 5) % 12]], location: `Place ${i % 7}`, isMilestone: i % 17 === 0, dependencies: i > 3 && i % 2 ? [`e${i - 3}`] : [], progress: (i * 13) % 100 };
    });
    const story = { id: 's1', name: 'S', activeTimelineThemeId: 'builtin:obsidian-native' };
    const plugin = {
      settings: { stories: [story], activeStoryId: 's1', timelineThemes: [], calendarSystems: [] },
      getActiveStory: () => story, saveSettings: async () => {},
      app: { workspace: { on: () => ({}), offref() {}, getActiveFile: () => null }, vault: { getMarkdownFiles: () => [], getAbstractFileByPath: () => null, readBinary: async () => null, getResourcePath: () => '' }, metadataCache: { getFileCache: () => null, getFirstLinkpathDest: () => null } },
      listEvents: async () => events, listLocations: async () => [], listCharacters: async () => chars.map(name => ({ id: name, name })),
      listScenes: async () => [], listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [],
      getTimelineEras: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined, getTimelineTracks: () => [], getGroups: () => [],
    };
    const r = new Native.TimelineRenderer(document.getElementById('host'), plugin, { groupMode: 'character', ganttMode: true, showDependencies: true });
    window.r = r;
    await r.initialize();
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const time = (label, fn, n) => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); fn(i); t.push(performance.now() - a); } t.sort((x, y) => x - y); return { label, median: +t[Math.floor(n / 2)].toFixed(2), p90: +t[Math.floor(n * 0.9)].toFixed(2) }; };
    // Zoom into a ~6 year window like a working view.
    r.setVisibleRange(new Date(Date.UTC(1405, 0, 1)), new Date(Date.UTC(1411, 0, 1)));
    const span = r.viewEnd - r.viewStart;
    const out = [];
    if (window.__snap) { r.draw(); window.__png = document.querySelector('#host canvas').toDataURL('image/png'); return []; }
    await window.__profStart();
    for (let i = 0; i < 150; i++) { r.viewStart += span / 300; r.viewEnd += span / 300; r.draw(); document.querySelector('#host canvas').getContext('2d').getImageData(0, 0, 1, 1); }
    await window.__profStop();
    out.push(time('draw (pan)', i => { r.viewStart += span / 200; r.viewEnd += span / 200; r.draw(); }, 120));
    out.push(time('draw (zoom out)', i => { const c = (r.viewStart + r.viewEnd) / 2, h = (r.viewEnd - r.viewStart) / 2 * 1.02; r.viewStart = c - h; r.viewEnd = c + h; r.draw(); }, 60));
    const canvas = document.querySelector('#host canvas');
    const rect = canvas.getBoundingClientRect();
    out.push(time('hover move + draw', i => { canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + 300 + (i * 7) % 900, clientY: rect.top + 120 + (i * 13) % 500, bubbles: true, pointerType: 'mouse' })); r.draw(); }, 120));
    out.push(time('rebuild', () => r.rebuild(false), 10));
    return out;
  }, N);
  if (process.env.SNAP) fs.writeFileSync(process.env.SNAP, Buffer.from((await page.evaluate(() => window.__png)).split(',')[1], 'base64'));
  console.log(LABEL, JSON.stringify(result), errors.length ? 'ERRORS ' + errors.slice(0, 3).join(' | ') : '');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
