// Run: node test/browser/template-customize-filename.cjs
// Real TemplateApplicationModal (customize flow) in headless Chromium with a minimal Obsidian DOM stub.
// Checks that a file name the user typed survives later variable edits and entity unticks.
// Set CHROMIUM_PATH to use a specific Chromium binary.
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
export class Notice { constructor(m){ (window.notices ??= []).push(m); } }
export class Setting { constructor(el){ this.settingEl=el.createDiv('setting-item'); this.nameEl=this.settingEl.createDiv('name'); this.descEl=this.settingEl.createDiv('desc'); this.controlEl=this.settingEl.createDiv('control'); }
  setName(n){ this.nameEl.textContent=n; return this; } setDesc(d){ this.descEl.textContent=d; return this; } setHeading(){ return this; }
  addText(f){ const i=this.controlEl.createEl('input'); const t={ inputEl:i, setPlaceholder(p){ i.placeholder=p; return t; }, setValue(v){ i.value=v; return t; }, getValue(){ return i.value; }, onChange(fn){ i.addEventListener('input',()=>fn(i.value)); return t; } }; f(t); return this; }
  addToggle(f){ const i=this.controlEl.createEl('input'); i.type='checkbox'; const t={ toggleEl:i, setValue(v){ i.checked=v; return t; }, onChange(fn){ i.addEventListener('change',()=>fn(i.checked)); return t; } }; f(t); return this; }
  addDropdown(f){ const s=this.controlEl.createEl('select'); const d={ selectEl:s, addOption(v,l){ const o=document.createElement('option'); o.value=v; o.textContent=l; s.appendChild(o); return d; }, setValue(v){ s.value=v; return d; }, getValue(){ return s.value; }, onChange(fn){ s.addEventListener('change',()=>fn(s.value)); return d; } }; f(d); return this; }
  addButton(f){ const b=this.controlEl.createEl('button'); const t={ buttonEl:b, setButtonText(x){ b.textContent=x; return t; }, setCta(){ b.classList.add('mod-cta'); return t; }, setWarning(){ return t; }, setTooltip(){ return t; }, onClick(fn){ b.addEventListener('click',fn); return t; } }; f(t); return this; } }
export class ButtonComponent { constructor(el){ this.buttonEl=el.createEl('button'); } setButtonText(t){ this.buttonEl.textContent=t; return this; } setCta(){ this.buttonEl.classList.add('mod-cta'); return this; } setWarning(){ return this; } onClick(fn){ this.buttonEl.addEventListener('click',fn); return this; } }
export class Platform { static isMobile=false; static isTablet=false; static isPhone=false; static isDesktop=true; static isAndroidApp=false; static isIosApp=false; }
export function parseYaml(s){ const o={}; for(const line of s.split('\\n')){ const m=/^(\\w+):\\s*(.*)$/.exec(line); if(m) o[m[1]]=m[2].replace(/^"|"$/g,''); } return o; }
export class TFile {} export class TFolder {} export class FuzzySuggestModal {} export class Menu {}
export function normalizePath(p){ return p; }
export class ToggleComponent {}
`;

async function openModal(browser, bundleText, template) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.setContent('<html><body></body></html>');
  await p.evaluate(() => {
    const P = HTMLElement.prototype;
    P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.type) e.type = o.type; } this.appendChild(e); return e; };
    P.createDiv = function (o) { return this.createEl('div', o); };
    P.createSpan = function (o) { return this.createEl('span', o); };
    P.empty = function () { this.replaceChildren(); };
    P.setText = function (t) { this.textContent = t; };
    P.addClass = function (...c) { this.classList.add(...c); };
    P.removeClass = function (...c) { this.classList.remove(...c); };
    P.setAttr = function (k, v) { this.setAttribute(k, v); };
    P.setCssStyles = function () {}; P.setCssProps = function () {};
    P.remove = P.remove || function () { this.parentNode && this.parentNode.removeChild(this); };
  });
  await p.addScriptTag({ content: bundleText });
  await p.evaluate(tplJson => {
    window.applied = null;
    const plugin = { settings: { groups: [], activeStoryId: 's1' }, listCharacters: async () => [], listLocations: async () => [], listEvents: async () => [], listPlotItems: async () => [], listCultures: async () => [], listMagicSystems: async () => [], listScenes: async () => [] };
    const modal = new TAM.TemplateApplicationModal({}, plugin, tplJson, (vars, names) => { window.applied = { vars, names: names.map(n => ({ id: n.templateId, fileName: n.fileName })) }; }, () => {}, { allowEntityToggles: true });
    modal.open();
    document.body.appendChild(modal.contentEl);
  }, template);
  return { p, errors };
}

const namingInputs = (p) => p.evaluate(() => [...document.querySelectorAll('.template-entity-naming-item input')].map(i => i.value));
const typeIntoFirstNamingInput = (p, value) => p.evaluate(v => {
  const i = document.querySelectorAll('.template-entity-naming-item input')[0];
  i.value = v; i.dispatchEvent(new Event('input'));
}, value);
const appliedFileNames = (p) => p.evaluate(() => window.applied && window.applied.names.map(n => n.fileName));

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { TemplateApplicationModal } from './src/modals/TemplateApplicationModal';", resolveDir: path, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'TAM',
    plugins: [{ name: 'host', setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
      b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: STUB, loader: 'js' }));
    } }],
  });
  const bundleText = bundle.outputFiles[0].text;
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8')).template;

  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }) });
  try {
    // Scenario 1: type a name, then edit a variable (re-renders the naming section).
    {
      const { p, errors } = await openModal(browser, bundleText, template);
      await typeIntoFirstNamingInput(p, 'Mayor Custom');
      assert.equal((await namingInputs(p))[0], 'Mayor Custom', 'typed name shown before edit');
      await p.evaluate(() => { const i = document.querySelector('.template-variable-input input'); i.value = 'Bywater Two'; i.dispatchEvent(new Event('input')); });
      assert.equal((await namingInputs(p))[0], 'Mayor Custom', 'typed name kept after variable edit');
      await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Apply template'); btn.click(); });
      assert.equal((await appliedFileNames(p))[0], 'Mayor Custom', 'typed name applied after variable edit');
      assert.deepEqual(errors, []);
      await p.close();
    }

    // Scenario 2: type a name, then untick an unrelated entity.
    {
      const { p, errors } = await openModal(browser, bundleText, template);
      await typeIntoFirstNamingInput(p, 'Mayor Custom');
      await p.evaluate(() => { const t = [...document.querySelectorAll('.template-entity-inclusion-group input[type=checkbox]')]; const last = t[t.length - 1]; last.checked = false; last.dispatchEvent(new Event('change')); });
      assert.equal((await namingInputs(p))[0], 'Mayor Custom', 'typed name kept after unticking another entity');
      await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Apply template'); btn.click(); });
      assert.equal((await appliedFileNames(p))[0], 'Mayor Custom', 'typed name applied after unticking another entity');
      assert.deepEqual(errors, []);
      await p.close();
    }
    console.log('template-customize-filename: all scenarios passed');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
