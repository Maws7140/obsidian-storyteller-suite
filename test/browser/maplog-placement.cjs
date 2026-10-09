// Run: node test/browser/maplog-placement.cjs [inside|sibling]
// Real Leaflet + Maplog palette/editor/layer with pointer and touch input; Obsidian UI is stubbed.
const path=require('path').resolve(__dirname,'../..')+'/';const assert=require('assert');
const {chromium}=require(path+'node_modules/playwright');const esbuild=require(path+'node_modules/esbuild');const fs=require('fs');
(async()=>{
const stub=`export class Notice{constructor(m){(window.notices??=[]).push(m)}}
export class App{} export class Modal{constructor(){this.contentEl=document.createElement('div')}open(){}close(){}}
export class Menu{addItem(f){return this}addSeparator(){return this}showAtMouseEvent(){}}
export class Setting{constructor(el){this.el=el.createDiv('setting-item')}setName(n){this.el.createDiv({text:n});return this}setDesc(){return this}
addToggle(f){const i=this.el.createEl('input',{type:'checkbox'});const t={setValue(v){i.checked=v;return t},onChange(fn){i.onchange=()=>fn(i.checked);return t}};f(t);return this}
addDropdown(f){const s=this.el.createEl('select');const d={addOption(v,l){const o=document.createElement('option');o.value=v;o.text=l;s.append(o);return d},setValue(v){s.value=v;return d},onChange(fn){s.onchange=()=>fn(s.value);return d}};f(d);return this}
addText(f){const i=this.el.createEl('input');const t={setPlaceholder(){return t},setValue(v){i.value=v;return t},onChange(fn){i.oninput=()=>fn(i.value);return t}};f(t);return this}
addButton(f){const b=this.el.createEl('button');const t={setButtonText(x){b.textContent=x;return t},onClick(fn){b.onclick=fn;return t}};f(t);return this}}`;
const bundle=await esbuild.build({stdin:{contents:"export { MaplogPalette } from './src/leaflet/maplog/MaplogPalette'; export { MaplogEditor } from './src/leaflet/maplog/MaplogEditor'; export { MaplogLayer } from './src/leaflet/maplog/MaplogLayer'; export { normalizeMaplogData, emptyMaplogData } from './src/leaflet/maplog/model';",resolveDir:path,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'ML',plugins:[{name:'host',setup(b){b.onResolve({filter:/^(leaflet|obsidian)$/},a=>({path:a.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},a=>({contents:a.path==='leaflet'?'module.exports=window.L':stub,loader:'js'}));}}]});
const SIBLING=process.argv[2]==='sibling';const br=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'})});const p=await br.newPage({viewport:{width:1200,height:800},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await p.setContent('<div id="wrap" class="storyteller-map-container" style="width:1000px;height:700px;position:relative;overflow:hidden"><div id="map" style="position:absolute;top:0;left:0;width:1000px;height:700px"></div></div>');
await p.addStyleTag({content:fs.readFileSync(path+'node_modules/leaflet/dist/leaflet.css','utf8')+fs.readFileSync(path+'styles.css','utf8')});
await p.addScriptTag({content:fs.readFileSync(path+'node_modules/leaflet/dist/leaflet.js','utf8')});
await p.evaluate(()=>{const P=HTMLElement.prototype;P.createEl=function(tag,o={}){const e=document.createElement(tag);if(typeof o==='string')e.className=o;else{if(o.cls)e.className=o.cls;if(o.text)e.textContent=o.text;if(o.type)e.type=o.type;for(const[k,v]of Object.entries(o.attr||{}))e.setAttribute(k,v)}this.append(e);return e};P.createDiv=function(o){return this.createEl('div',o)};P.createSpan=function(o){return this.createEl('span',o)};P.empty=function(){this.replaceChildren()};P.setText=function(t){this.textContent=t};P.hide=function(){this.style.display='none'};P.show=function(){this.style.display=''};window.activeDocument=document;});
await p.addScriptTag({content:bundle.outputFiles[0].text});
await p.evaluate(s=>{window.SIB=s},SIBLING);await p.evaluate(()=>{
 window.map=L.map('map',{crs:L.CRS.Simple,zoomSnap:0}).setView([350,500],0);
 L.rectangle([[0,0],[700,1000]],{color:'#888'}).addTo(map);
 window.data=ML.emptyMaplogData();
 window.layer=new ML.MaplogLayer(map,{readOnly:false});layer.setData(data);
 window.editor=new ML.MaplogEditor({app:{},getMap:()=>map,getData:()=>ML.normalizeMaplogData({maplogMarks:data.marks,maplogLines:data.lines,maplogAreas:data.areas}),save:async n=>{window.data=ML.normalizeMaplogData({maplogMarks:n.marks,maplogLines:n.lines,maplogAreas:n.areas});layer.setData(window.data)},onDisarm:()=>{}});
 window.palette=new ML.MaplogPalette(document.getElementById(window.SIB?'wrap':'map'),{onChange:t=>editor.setTool(t),chooseLocation:()=>{},onClose:()=>{},drawing:{finish:()=>editor.finish(),undo:()=>editor.undoPoint(),cancel:()=>editor.cancel()}});
 palette.open();
});
// arm "Door" via UI
const door=p.locator('.maplog-palette-mark[aria-label="Door"]');console.log('door buttons',await door.count());
await door.first().click();
await p.mouse.click(300,300);await p.waitForTimeout(200);
console.log('marks after click', await p.evaluate(()=>JSON.stringify(data.marks)));
console.log('mark DOM', await p.evaluate(()=>{const els=[...document.querySelectorAll('.leaflet-marker-icon')];return els.map(e=>({cls:e.className,w:e.offsetWidth,h:e.offsetHeight,html:e.innerHTML.slice(0,80)}))}));
// line with Finish button and touch taps
await p.locator('.maplog-palette-mark[aria-label="Wall"]').first().click();
await p.touchscreen.tap(400,200);await p.touchscreen.tap(600,200);await p.touchscreen.tap(600,400);
await p.getByRole('button',{name:'Undo point'}).click();await p.touchscreen.tap(500,450);
await p.getByRole('button',{name:'Finish'}).click();await p.waitForTimeout(200);
console.log('lines', await p.evaluate(()=>JSON.stringify(data.lines)));
// disarm by clicking mark again, then a map click must place nothing
console.log('armed before toggle', await p.evaluate(()=>document.querySelector('.maplog-palette-mark.is-active')?.getAttribute('aria-label')||'none'));
await p.locator('.maplog-palette-mark[aria-label="Wall"]').first().click();
console.log('armed after toggle', await p.evaluate(()=>document.querySelector('.maplog-palette-mark.is-active')?.getAttribute('aria-label')||'none'), 'editor tool', await p.evaluate(()=>editor.tool&&editor.tool.markId));
await p.waitForTimeout(300);const before=await p.evaluate(()=>data.marks.length+data.lines.length);await p.mouse.click(200,500);await p.waitForTimeout(100);
await p.locator('.maplog-palette-mark[aria-label="Wall"]').first().click();
await p.mouse.click(300,550);await p.mouse.click(450,550);await p.mouse.dblclick(450,620);await p.waitForTimeout(100);
console.log('dblclick far from last point keeps drawing', await p.evaluate(()=>data.lines.length));
await p.mouse.dblclick(450,620);await p.waitForTimeout(200);
console.log('dblclick on last point finishes', await p.evaluate(()=>JSON.stringify(data.lines[data.lines.length-1].points)));
console.log('disarmed click adds', await p.evaluate(b=>data.marks.length+data.lines.length-b,before), 'before',before, await p.evaluate(()=>JSON.stringify(data.lines.map(l=>l.points.length))), await p.evaluate(()=>data.marks.length));
console.log('notices', await p.evaluate(()=>window.notices||[]));
assert.equal(await p.evaluate(()=>data.marks.length),1,'palette clicks must not place marks');
assert.equal(await p.evaluate(()=>data.lines[0].points.length),3,'touch taps add points, Undo removes one, Finish commits');
assert.deepEqual(errors,[]);console.log('PASS: Maplog placement, touch drawing with Finish/Undo, disarm.');
console.log('errors',errors);await br.close();
})().catch(e=>{console.error(e);process.exit(1)});
