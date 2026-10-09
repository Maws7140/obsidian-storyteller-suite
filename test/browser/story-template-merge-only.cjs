// Run: node test/browser/story-template-merge-only.cjs
// Real StoryTemplateDetailModal in headless Chromium with a minimal Obsidian DOM stub.
// Checks that the apply footer offers only the merge mode: no "replace" radio and no
// replace wording. Set CHROMIUM_PATH to use a specific Chromium binary.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const TEMPLATE_PATH = process.env.TEMPLATE_JSON
  || '/home/user/Maws-Vault-/Storyteller Import Test/hobbit-village-template.json';

const STUB = `
export class Modal { constructor(app){ this.app=app; this.modalEl=document.createElement('div'); this.contentEl=document.createElement('div'); this.modalEl.appendChild(this.contentEl); }
  onOpen(){} onClose(){} open(){ this.onOpen(); } close(){ this.onClose(); } }
export class App {}
export class Plugin {} export class PluginSettingTab {} export class FuzzySuggestModal {}
export class Notice { constructor(m){ (window.notices ??= []).push(m); } hide(){} }
export class Setting { constructor(el){ this.settingEl=el.createDiv('setting-item'); this.nameEl=this.settingEl.createDiv('name'); this.descEl=this.settingEl.createDiv('desc'); this.controlEl=this.settingEl.createDiv('control'); }
  setName(n){ this.nameEl.textContent=n; return this; } setDesc(d){ this.descEl.textContent=d; return this; } setHeading(){ return this; }
  addText(f){ const i=this.controlEl.createEl('input'); const t={ inputEl:i, setPlaceholder(p){ i.placeholder=p; return t; }, setValue(v){ i.value=v; return t; }, getValue(){ return i.value; }, onChange(fn){ i.addEventListener('input',()=>fn(i.value)); return t; } }; f(t); return this; }
  addToggle(f){ const i=this.controlEl.createEl('input'); i.type='checkbox'; const t={ toggleEl:i, setValue(v){ i.checked=v; return t; }, onChange(fn){ i.addEventListener('change',()=>fn(i.checked)); return t; } }; f(t); return this; }
  addDropdown(f){ const s=this.controlEl.createEl('select'); const d={ selectEl:s, addOption(v,l){ const o=document.createElement('option'); o.value=v; o.textContent=l; s.appendChild(o); return d; }, setValue(v){ s.value=v; return d; }, getValue(){ return s.value; }, onChange(fn){ s.addEventListener('change',()=>fn(s.value)); return d; } }; f(d); return this; }
  addButton(f){ const b=this.controlEl.createEl('button'); const t={ buttonEl:b, setButtonText(x){ b.textContent=x; return t; }, setCta(){ b.classList.add('mod-cta'); return t; }, setWarning(){ return t; }, setTooltip(){ return t; }, onClick(fn){ b.addEventListener('click',fn); return t; } }; f(t); return this; } }
export class ButtonComponent { constructor(el){ this.buttonEl=el.createEl('button'); } setButtonText(t){ this.buttonEl.textContent=t; return this; } setCta(){ this.buttonEl.classList.add('mod-cta'); return this; } setWarning(){ return this; } setTooltip(){ return this; } setDisabled(){ return this; } onClick(fn){ this.buttonEl.addEventListener('click',fn); return this; } }
export class ToggleComponent {}
export class Menu { addItem(){ return this; } addSeparator(){ return this; } showAtMouseEvent(){} }
export class Platform { static isMobile=false; static isTablet=false; static isPhone=false; static isDesktop=true; static isAndroidApp=false; static isIosApp=false; }
export class TFile {} export class TFolder {}
export function normalizePath(p){ return p; }
export function setIcon(){}
export function parseYaml(s){ const o={}; for(const line of s.split('\\n')){ const m=/^(\\w+):\\s*(.*)$/.exec(line); if(m) o[m[1]]=m[2].replace(/^"|"$/g,''); } return o; }
export function stringifyYaml(o){ return Object.entries(o).map(([k,v])=>k+': '+v).join('\\n'); }
`;

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { StoryTemplateDetailModal } from './src/templates/modals/StoryTemplateDetailModal';", resolveDir: path, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'STD', logLevel: 'error',
    plugins: [{ name: 'host', setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
      b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: STUB, loader: 'js' }));
    } }],
  });
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8')).template;

  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }) });
  try {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setContent('<html><body></body></html>');
    await p.evaluate(() => {
      const P = HTMLElement.prototype;
      P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.type) e.type = o.type; if (o.value) e.value = o.value; } this.appendChild(e); return e; };
      P.createDiv = function (o) { return this.createEl('div', o); };
      P.createSpan = function (o) { return this.createEl('span', o); };
      P.empty = function () { this.replaceChildren(); };
      P.setText = function (t) { this.textContent = t; };
      P.addClass = function (...c) { this.classList.add(...c); };
      P.removeClass = function (...c) { this.classList.remove(...c); };
      P.toggleClass = function (c, v) { this.classList.toggle(c, v); };
      P.setAttr = function (k, v) { this.setAttribute(k, v); };
      P.setCssStyles = function () {}; P.setCssProps = function () {};
      P.remove = P.remove || function () { this.parentNode && this.parentNode.removeChild(this); };
    });
    await p.addScriptTag({ content: bundle.outputFiles[0].text }).catch(e => { throw new Error('bundle load: ' + e.message + ' ' + errors.join(' / ')); });
    if (errors.length) throw new Error('page errors while loading bundle: ' + errors.join(' / '));
    await p.evaluate(tplJson => {
      const plugin = { settings: { groups: [], activeStoryId: 's1' }, app: {}, listCharacters: async () => [], listLocations: async () => [], listEvents: async () => [], listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [], listScenes: async () => [] };
      const modal = new STD.StoryTemplateDetailModal({}, plugin, { getTemplate: () => undefined, getAllTemplates: () => [], getTemplateStats: () => ({ entityCounts: {}, totalEntities: 0, totalRelationships: 0 }) }, tplJson);
      modal.open();
      document.body.appendChild(modal.contentEl);
    }, template);

    const footer = await p.evaluate(() => {
      const f = document.querySelector('.storyteller-template-footer');
      return f ? f.textContent : null;
    });
    assert.notEqual(footer, null, 'footer rendered');
    const radios = await p.evaluate(() => [...document.querySelectorAll('input[type=radio]')].map(i => i.value));
    assert.deepEqual(radios, [], 'no application-mode radio buttons are offered');
    const bodyText = await p.evaluate(() => document.body.textContent);
    assert.ok(!/replace current story/i.test(bodyText), 'no "Replace current story" option');
    assert.ok(!/replace story/i.test(bodyText), 'no replace wording');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('story-template-merge-only: passed');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
