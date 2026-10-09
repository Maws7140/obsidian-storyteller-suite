// Run: node test/browser/partylog-import-apply.cjs
// Real ImportPartylogModal in headless Chromium with a minimal Obsidian DOM stub.
// Pastes a log, previews it, then clicks "Import selected" twice before the first run finishes.
// The faction must be created once. Set CHROMIUM_PATH to use a specific Chromium binary.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const LOG = '## Session 2\n=> [Faction:City Watch|tier:2|standing:neutral->suspicious]';

const STUB = `
export class Modal { constructor(app){ this.app=app; this.modalEl=document.createElement('div'); this.contentEl=document.createElement('div'); this.modalEl.appendChild(this.contentEl); }
  onOpen(){} onClose(){} open(){ this.onOpen(); } close(){ this.onClose(); } }
export class App {}
export class FuzzySuggestModal { constructor(app){ this.app=app; } setPlaceholder(){} open(){} close(){} }
export class TFile { constructor(p){ this.path=p; this.basename=p.split('/').pop().replace(/\\.md$/,''); } }
export class TFolder {}
export class Notice { constructor(m){ (window.notices ??= []).push(m); } hide(){} }
export class Setting { constructor(el){ this.settingEl=el.createDiv('setting-item'); this.nameEl=this.settingEl.createDiv('name'); this.descEl=this.settingEl.createDiv('desc'); this.controlEl=this.settingEl.createDiv('control'); }
  setName(n){ this.nameEl.textContent=n; return this; } setDesc(d){ this.descEl.textContent=d; return this; } setHeading(){ return this; }
  addText(f){ const i=this.controlEl.createEl('input'); const t={ inputEl:i, setPlaceholder(p){ i.placeholder=p; return t; }, setValue(v){ i.value=v; return t; }, getValue(){ return i.value; }, onChange(fn){ i.addEventListener('input',()=>fn(i.value)); return t; } }; f(t); return this; }
  addToggle(f){ const i=this.controlEl.createEl('input'); i.type='checkbox'; const t={ toggleEl:i, setValue(v){ i.checked=v; return t; }, onChange(fn){ i.addEventListener('change',()=>fn(i.checked)); return t; } }; f(t); return this; }
  addButton(f){ const b=this.controlEl.createEl('button'); const t={ buttonEl:b, setButtonText(x){ b.textContent=x; return t; }, setCta(){ b.classList.add('mod-cta'); return t; }, setWarning(){ return t; }, setTooltip(){ return t; }, setDisabled(d){ b.disabled=!!d; return t; }, onClick(fn){ b.addEventListener('click',fn); return t; } }; f(t); return this; } }
export class ButtonComponent { constructor(el){ this.buttonEl=el.createEl('button'); } setButtonText(t){ this.buttonEl.textContent=t; return this; } setCta(){ this.buttonEl.classList.add('mod-cta'); return this; } setWarning(){ return this; } setDisabled(d){ this.buttonEl.disabled=!!d; return this; } onClick(fn){ this.buttonEl.addEventListener('click',fn); return this; } }
export class Platform { static isMobile=false; static isTablet=false; static isPhone=false; static isDesktop=true; static isAndroidApp=false; static isIosApp=false; }
export function normalizePath(p){ return p; }
export function setIcon(){}
export function parseYaml(s){ const o={}; for(const line of s.split('\\n')){ const m=/^(\\w+):\\s*(.*)$/.exec(line); if(m) o[m[1]]=m[2].replace(/^"|"$/g,''); } return o; }
export function stringifyYaml(o){ return Object.entries(o).map(([k,v])=>k+': '+v).join('\\n'); }
`;

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { ImportPartylogModal } from './src/modals/ImportPartylogModal';", resolveDir: path, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'IPM', logLevel: 'error',
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

    await p.evaluate(async (log) => {
      const createGroupCalls = [];
      const groups = [];
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      window.createGroupCalls = createGroupCalls;
      const app = { vault: {
        getAbstractFileByPath: (path) => new IPM.TFile(path),
        getMarkdownFiles: () => [],
        cachedRead: async () => '',
        process: async () => '',
      } };
      const plugin = {
        app,
        settings: { groups },
        getActiveStory: () => ({ id: 'story-1' }),
        getGroups: () => groups,
        listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [], listSessions: async () => [],
        createGroup: async (name) => {
          createGroupCalls.push(name);
          await delay(50);
          const g = { id: 'group-' + groups.length, storyId: 'story-1', name, members: [] };
          groups.push(g);
          return g;
        },
        saveCharacter: async () => {}, saveLocation: async () => {}, savePlotItem: async () => {}, saveGroupFull: async () => {},
        saveSession: async (s) => { await delay(20); s.filePath = 'Sessions/' + s.name + '.md'; },
      };
      const modal = new IPM.ImportPartylogModal(app, plugin);
      modal.open();
      document.body.appendChild(modal.contentEl);
      modal.textArea.value = log;
      const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent === text);
      button('Preview').click();
      await delay(30);
      window.importButton = () => button('Import selected');
    }, LOG);

    // Two clicks before the first run has finished
    await p.evaluate(async () => {
      const button = window.importButton();
      assert_present(button);
      button.click();
      button.click();
      await new Promise(r => setTimeout(r, 500));
      function assert_present(b) { if (!b) throw new Error('Import selected button not rendered'); }
    });

    const creates = await p.evaluate(() => window.createGroupCalls);
    assert.deepEqual(creates, ['City Watch'], 'the faction is created once, not once per click');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('partylog-import-apply: passed');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
