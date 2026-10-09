// Scratch: does a grid paint stroke leak a map 'click' to Leaflet listeners (e.g. an armed Maplog tool)?
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
const entry="export { GridController } from './src/leaflet/grid/GridController'; export { MaplogEditor } from './src/leaflet/maplog/MaplogEditor'; export { emptyMaplogData, normalizeMaplogData } from './src/leaflet/maplog/model';";
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
// Arm a Maplog Door on the same map (the palette would do this), so a leaked click has a visible effect.
await p.evaluate(()=>{window.mlData=Bundle.emptyMaplogData();window.ed=new Bundle.MaplogEditor({app:{},getMap:()=>map,getData:()=>mlData,save:async n=>{window.mlData=n},onDisarm:()=>{}});ed.setTool({markId:'door',attributes:[],dashed:false,rotation:0});});
await p.getByRole('button',{name:'Grid',exact:true}).click();
await p.getByRole('button',{name:'Location area',exact:true}).click();
await p.mouse.move(280,250);await p.mouse.down();await p.mouse.move(430,250,{steps:10});await p.mouse.up();await p.waitForTimeout(150);
const painted=await p.evaluate(()=>controller.selected.size);
const leaked=await p.evaluate(()=>clicks.length);
const doors=await p.evaluate(()=>mlData.marks.length);
console.log(JSON.stringify({painted,mapClicksAfterStroke:leaked,maplogMarksPlaced:doors,clickAt:await p.evaluate(()=>clicks),edBound:await p.evaluate(()=>!!ed.bound),edTool:await p.evaluate(()=>ed.tool && ed.tool.markId),notices:await p.evaluate(()=>window.notices||null)}));
assert(painted>=3,'stroke painted cells');
assert.equal(leaked,0,'a paint stroke must not reach map click listeners');
assert.equal(doors,0,'a paint stroke must not place a Maplog mark');
console.log('PASS (no leak)');
assert.deepEqual(errors,[]);
}finally{await b.close()}
})().catch(e=>{console.error('FAIL:',e.message||e);process.exit(1)});
