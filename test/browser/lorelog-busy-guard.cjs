// Run: node test/browser/lorelog-busy-guard.cjs
// Real LorelogCycleModal and LorelogSyncModal in headless Chromium with a minimal Obsidian DOM stub.
// Clicks "Add cycle" and "Apply selected" twice before the first write finishes. Each write must
// happen once. Set CHROMIUM_PATH to use a specific Chromium binary.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const STUB = `
export class Modal { constructor(app){ this.app=app; this.modalEl=document.createElement('div'); this.contentEl=document.createElement('div'); this.modalEl.appendChild(this.contentEl); }
  onOpen(){} onClose(){} open(){ this.onOpen(); } close(){ this.onClose(); } }
export class App {}
export class FuzzySuggestModal { constructor(app){ this.app=app; } setPlaceholder(){} open(){} close(){} }
export class TFile { constructor(p){ this.path=p; this.basename=p.split('/').pop().replace(/\\.md$/,''); this.extension='md'; } }
export class TFolder {}
export class Notice { constructor(m){ (window.notices ??= []).push(m); } hide(){} }
function wrap(el, api){ return api; }
export class Setting { constructor(el){ this.settingEl=el.createDiv('setting-item'); this.nameEl=this.settingEl.createDiv('name'); this.descEl=this.settingEl.createDiv('desc'); this.controlEl=this.settingEl.createDiv('control'); }
  setName(n){ this.nameEl.textContent=n; return this; } setDesc(d){ this.descEl.textContent=d; return this; } setHeading(){ return this; }
  addText(f){ const i=this.controlEl.createEl('input'); const t={ inputEl:i, setPlaceholder(p){ i.placeholder=p; return t; }, setValue(v){ i.value=v; return t; }, getValue(){ return i.value; }, onChange(fn){ i.addEventListener('input',()=>fn(i.value)); return t; } }; f(t); return this; }
  addTextArea(f){ const i=this.controlEl.createEl('textarea'); const t={ inputEl:i, setPlaceholder(p){ i.placeholder=p; return t; }, setValue(v){ i.value=v; return t; }, getValue(){ return i.value; }, onChange(fn){ i.addEventListener('input',()=>fn(i.value)); return t; } }; f(t); return this; }
  addToggle(f){ const i=this.controlEl.createEl('input'); i.type='checkbox'; const t={ toggleEl:i, setValue(v){ i.checked=v; return t; }, onChange(fn){ i.addEventListener('change',()=>fn(i.checked)); return t; } }; f(t); return this; }
  addDropdown(f){ const s=this.controlEl.createEl('select'); const d={ selectEl:s, addOption(v,l){ const o=document.createElement('option'); o.value=v; o.textContent=l; s.appendChild(o); return d; }, setValue(v){ s.value=v; return d; }, getValue(){ return s.value; }, onChange(fn){ s.addEventListener('change',()=>fn(s.value)); return d; } }; f(d); return this; }
  addButton(f){ const b=this.controlEl.createEl('button'); const t={ buttonEl:b, setButtonText(x){ b.textContent=x; return t; }, setCta(){ b.classList.add('mod-cta'); return t; }, setWarning(){ return t; }, setTooltip(){ return t; }, setDisabled(d){ b.disabled=!!d; return t; }, onClick(fn){ b.addEventListener('click',fn); return t; } }; f(t); return this; } }
export class ButtonComponent { constructor(el){ this.buttonEl=el.createEl('button'); } setButtonText(t){ this.buttonEl.textContent=t; return this; } setCta(){ this.buttonEl.classList.add('mod-cta'); return this; } setWarning(){ return this; } setDisabled(d){ this.buttonEl.disabled=!!d; return this; } onClick(fn){ this.buttonEl.addEventListener('click',fn); return this; } }
export class ToggleComponent {}
export class Platform { static isMobile=false; static isTablet=false; static isPhone=false; static isDesktop=true; static isAndroidApp=false; static isIosApp=false; }
export function normalizePath(p){ return p; }
export function setIcon(){}
export function parseYaml(s){ const o={}; for(const line of s.split('\\n')){ const m=/^(\\w+):\\s*(.*)$/.exec(line); if(m) o[m[1]]=m[2].replace(/^"|"$/g,''); } return o; }
export function stringifyYaml(o){ return Object.entries(o).map(([k,v])=>k+': '+v).join('\\n'); }
`;

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { LorelogCycleModal } from './src/modals/LorelogCycleModal'; export { LorelogSyncModal } from './src/modals/LorelogSyncModal'; export { TFile } from 'obsidian';", resolveDir: path, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'LM', logLevel: 'error',
    plugins: [{ name: 'host', setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
      b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: STUB, loader: 'js' }));
    } }],
  });

  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }) });
  try {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setContent('<html><body></body></html>');
    await p.evaluate(() => {
      const P = HTMLElement.prototype;
      P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === 'string') e.className = o; else { if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.type) e.type = o.type; if (o.placeholder) e.placeholder = o.placeholder; } this.appendChild(e); return e; };
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
    await p.addScriptTag({ content: bundle.outputFiles[0].text });
    if (errors.length) throw new Error('page errors while loading bundle: ' + errors.join(' / '));

    const result = await p.evaluate(async () => {
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent === text);
      const out = {};

      // Scenario 1: Add cycle, clicked twice
      {
        const writes = [];
        const vault = {
          getAbstractFileByPath: (path) => new LM.TFile(path),
          getMarkdownFiles: () => [],
          cachedRead: async () => '',
          process: async (file, fn) => { await delay(50); writes.push(fn('# World\n')); },
        };
        const plugin = {
          app: { vault },
          settings: { groups: [] },
          getActiveStory: () => ({ id: 'story-1', name: 'Story' }),
          getStoryRootFolder: () => 'Story',
          getGroups: () => [],
          listCharacters: async () => [], listLocations: async () => [], listEvents: async () => [],
        };
        const modal = new LM.LorelogCycleModal(plugin);
        modal.open();
        document.body.appendChild(modal.contentEl);
        await delay(20);
        modal.form.triggerText = 'Who holds the key?';
        button('Add cycle').click();
        button('Add cycle').click();
        await delay(300);
        out.cycleWrites = writes.length;
        out.cycleDisabledAfterClick = button('Add cycle') ? button('Add cycle').disabled : null;
        modal.close();
      }

      // Scenario 2: Apply selected with a new faction, clicked twice
      {
        const groupsCreated = [];
        const plugin = {
          app: {},
          settings: { groups: [] },
          getActiveStory: () => ({ id: 'story-1', name: 'Story' }),
          getGroups: () => [],
          saveGroupFull: async (g) => { await delay(50); groupsCreated.push(g.name); },
          saveCharacter: async () => {}, saveLocation: async () => {}, saveEvent: async () => {},
        };
        const plan = {
          updates: [],
          creates: [{ id: 'g1', kind: 'group', name: 'Riders of Rohan', nextDescription: 'Horse lords', changes: [] }],
          alreadyRecorded: 0,
        };
        const modal = new LM.LorelogSyncModal(plugin, plan, [], () => {});
        modal.selected.add('create:g1');
        modal.open();
        document.body.appendChild(modal.contentEl);
        button('Apply selected').click();
        button('Apply selected').click();
        await delay(300);
        out.groupCreates = groupsCreated;
        modal.close();
      }
      return out;
    });

    assert.equal(result.cycleWrites, 1, 'Add cycle writes the cycle once');
    assert.equal(result.cycleDisabledAfterClick, true, 'Add cycle is disabled while the cycle is written');
    assert.deepEqual(result.groupCreates, ['Riders of Rohan'], 'Apply selected creates the faction once');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('lorelog-busy-guard: passed');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
