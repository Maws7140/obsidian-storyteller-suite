// Does a grid paint stroke leak to the map or to an armed Map Ink tool? Arms the Ink stamp tool,
// wires the grid's onEditStart hook the way MapView does, then paints. Nothing may be placed.
const path=require('path');const ROOT=path.resolve(__dirname,'../..');
const {chromium}=require(ROOT+'/node_modules/playwright');const esbuild=require(ROOT+'/node_modules/esbuild');const fs=require('fs');const assert=require('assert');
(async()=>{
const stub=`export class Notice {constructor(message){(window.notices??=[]).push(message)}}
export class App {}
export class Menu {addItem(){return this}addSeparator(){return this}showAtMouseEvent(){}}
export class TFile {constructor(){this.path='map.md'}};
export class Modal {constructor(){this.contentEl=document.createElement('div');this.contentEl.className='test-modal'}open(){document.body.append(this.contentEl);this.onOpen?.()}close(){this.contentEl.remove();this.onClose?.()}}
export class Setting {constructor(el){this.el=el.createDiv?el:document.createElement('div')}setName(){return this}setDesc(){return this}addText(fn){const e=document.createElement('input');this.el.append(e);const t={setValue(v){e.value=v;return t},setDisabled(){return t},setPlaceholder(){return t},onChange(){return t}};fn(t);return this}addToggle(fn){const t={setValue(){return t},onChange(){return t}};fn(t);return this}addDropdown(fn){const t={addOption(){return t},setValue(){return t},onChange(){return t}};fn(t);return this}addButton(fn){const t={setButtonText(){return t},setCta(){return t},onClick(){return t}};fn(t);return this}}
export class LocationSuggestModal {constructor(a,p,fn){this.fn=fn}open(){this.fn(window.locations[0])}}
export class LocationModal {open(){}}
export async function confirmWithModal(){return true}
`;
const entry="export { GridController } from './src/leaflet/grid/GridController'; export { InkEditor } from './src/leaflet/ink/InkEditor'; export { defaultInkDoc } from './src/leaflet/ink/model';";
const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:ROOT,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'Bundle',plugins:[{name:'host',setup(b){b.onResolve({filter:/^(leaflet|obsidian)$|LocationSuggestModal|LocationModal|ConfirmModal|MapMembershipService/},args=>({path:args.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},args=>({contents:args.path==='leaflet'?'module.exports=window.L':args.path==='obsidian'?stub:'export class MapMembershipService{}; export function detachFromMaps(){}; export function confirmWithModal(){return Promise.resolve(true)}; export class LocationModal{open(){}}; export class LocationSuggestModal{constructor(a,p,fn){this.fn=fn}open(){this.fn(window.locations[0])}}',loader:'js'}));}}]});
const b=await chromium.launch({headless:true,executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
try{const p=await b.newPage({viewport:{width:1200,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('http://grid.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="toolbar" style="position:relative;display:flex"></div><div id="map" style="width:1000px;height:760px"></div>'}));
await p.goto('http://grid.test/');
await p.addStyleTag({content:fs.readFileSync(ROOT+'/node_modules/leaflet/dist/leaflet.css','utf8')+fs.readFileSync(ROOT+'/styles.css','utf8')+'.test-modal{position:fixed;inset:100px;background:white;z-index:9999}'});
await p.addScriptTag({content:fs.readFileSync(ROOT+'/node_modules/leaflet/dist/leaflet.js','utf8')});
await p.evaluate(()=>{HTMLElement.prototype.createEl=function(tag,opt={}){const e=document.createElement(tag);if(typeof opt==='string')e.className=opt;else{if(opt.cls)e.className=opt.cls;if(opt.text)e.textContent=opt.text;if(opt.type)e.type=opt.type;if(opt.placeholder)e.placeholder=opt.placeholder;for(const [k,v]of Object.entries(opt.attr||{}))e.setAttribute(k,v)}this.append(e);return e};HTMLElement.prototype.createDiv=function(o){return this.createEl('div',o)};HTMLElement.prototype.createSpan=function(o){return this.createEl('span',o)};HTMLElement.prototype.empty=function(){this.replaceChildren()};HTMLElement.prototype.setText=function(t){this.textContent=t};HTMLElement.prototype.hide=function(){this.style.display='none'};HTMLElement.prototype.show=function(){this.style.display=''};window.activeDocument=document;});
await p.addScriptTag({content:bundle.outputFiles[0].text});
await p.evaluate(()=>{
window.locations=[{id:'a',name:'West',type:'city'},{id:'b',name:'East',type:'city'}];window.fm={};window.record={id:'map',filePath:'map.md',name:'Test',gridSize:50,markers:[],scale:'region'};
window.map=L.map('map',{crs:L.CRS.Simple,zoomSnap:0,zoomAnimation:false}).setView([400,500],0);window.bounds=L.latLngBounds([[0,0],[800,1000]]);
window.file=new (window.TFileCtor||Object)();
window.plugin={app:{vault:{getName:()=>'Test',getAbstractFileByPath:()=>({path:'map.md'})},fileManager:{processFrontMatter:async(f,cb)=>{cb(window.fm)}},workspace:{openLinkText:async()=>{}}},listMaps:async()=>[{...record,...fm}],listLocations:async()=>window.locations,listCharacters:async()=>[],listEvents:async()=>[],listPlotItems:async()=>[],listScenes:async()=>[],getGroups:async()=>[],listCultures:async()=>[],listEconomies:async()=>[],listMagicSystems:async()=>[],listReferences:async()=>[]};
window.clicks=[];map.on('click',e=>clicks.push([e.latlng.lat,e.latlng.lng]));
window.controller=new Bundle.GridController(plugin,map,record,bounds,document.getElementById('toolbar'));
});
// Open the Ink editor on the same map and arm its stamp tool, so a leaked click has a visible effect.
// MapView closes the editor when the grid starts editing; the same hook is wired here.
await p.evaluate(()=>{
window.inkSaves=[];
const host={notify:()=>{},confirm:async()=>true,showMenu:()=>{},icon:()=>{},pickLocation:async()=>null,openLocation:()=>{},load:()=>Bundle.defaultInkDoc(),save:async d=>{inkSaves.push(d)},presets:()=>[],savePreset:()=>{}};
window.ink=new Bundle.InkEditor({L,map,host,container:map.getContainer(),doc:Bundle.defaultInkDoc()});
ink.open();ink.store.setTool('stamp');
controller.onEditStart=()=>{void ink.close();};
});
await p.getByRole('button',{name:'Grid',exact:true}).click();
await p.getByRole('button',{name:'Location area',exact:true}).click();
await p.mouse.move(280,250);await p.mouse.down();await p.mouse.move(430,250,{steps:10});await p.mouse.up();await p.waitForTimeout(150);
const painted=await p.evaluate(()=>controller.selected.size);
const leaked=await p.evaluate(()=>clicks.length);
const stamps=await p.evaluate(()=>ink.store.doc.items.length);
const inkOpen=await p.evaluate(()=>ink.isOpen());
console.log(JSON.stringify({painted,mapClicksAfterStroke:leaked,inkStampsPlaced:stamps,inkOpenAfterPaint:inkOpen,clickAt:await p.evaluate(()=>clicks),notices:await p.evaluate(()=>window.notices||null)}));
assert(painted>=3,'stroke painted cells');
assert.equal(leaked,0,'a paint stroke must not reach map click listeners');
assert.equal(stamps,0,'a paint stroke must not place a Map Ink stamp');
assert.equal(inkOpen,false,'starting a grid edit must close the Map Ink editor');
console.log('PASS (no leak)');
assert.deepEqual(errors,[]);
}finally{await b.close()}
})().catch(e=>{console.error('FAIL:',e.message||e);process.exit(1)});
