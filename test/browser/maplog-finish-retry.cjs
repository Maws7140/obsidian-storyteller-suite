// Scratch: when the host save rejects, a finished Maplog line/area should survive (retry) instead of being discarded.
const path=require('path');const ROOT=path.resolve(__dirname,'../..');
const {chromium}=require(ROOT+'/node_modules/playwright');const esbuild=require(ROOT+'/node_modules/esbuild');const fs=require('fs');const assert=require('assert');
(async()=>{
const stub=`export class Notice {constructor(m){(window.notices??=[]).push(m)}}
export class App {}
export class Menu {addItem(){return this}addSeparator(){return this}showAtMouseEvent(){}}`;
const entry="export { MaplogEditor } from './src/leaflet/maplog/MaplogEditor'; export { emptyMaplogData } from './src/leaflet/maplog/model';";
const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:ROOT,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'B',plugins:[{name:'host',setup(b){b.onResolve({filter:/^(leaflet|obsidian)$|MaplogEditModal/},a=>({path:a.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},a=>({contents:a.path==='leaflet'?'module.exports=window.L':a.path==='obsidian'?stub:'export class MaplogEditModal{open(){}}',loader:'js'}));}}]});
const br=await chromium.launch({headless:true,executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
try{const p=await br.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.setContent('<div id="map" style="width:800px;height:600px"></div>');
await p.addStyleTag({content:fs.readFileSync(ROOT+'/node_modules/leaflet/dist/leaflet.css','utf8')+fs.readFileSync(ROOT+'/styles.css','utf8')});
await p.addScriptTag({content:fs.readFileSync(ROOT+'/node_modules/leaflet/dist/leaflet.js','utf8')});
await p.addScriptTag({content:bundle.outputFiles[0].text});
await p.evaluate(()=>{window.activeDocument=document;window.map=L.map('map',{crs:L.CRS.Simple,zoomSnap:0}).setView([300,400],0);window.saved=[];window.failNext=true;window.data=B.emptyMaplogData();
window.ed=new B.MaplogEditor({app:{},getMap:()=>map,getData:()=>data,save:async n=>{if(failNext){failNext=false;throw new Error('note locked')}window.data=n;saved.push(n)},onDisarm:()=>{}});
ed.setTool({markId:'wall',attributes:[],dashed:false,rotation:0});
for(const [x,y] of [[100,100],[300,100],[300,300]]) map.fire('click',{latlng:L.latLng(y,x),containerPoint:L.point(x,y),originalEvent:new MouseEvent('click')});
});
const before=await p.evaluate(()=>ed.points.length);
await p.evaluate(()=>ed.finish());await p.waitForTimeout(100);
const after=await p.evaluate(()=>({points:ed.points.length,lines:data.lines.length,notices:window.notices}));
console.log(JSON.stringify({pointsBeforeFinish:before,afterFailedFinish:after}));
// Retry: user taps Finish again (or clicks once more) after the failure
await p.evaluate(()=>ed.finish());await p.waitForTimeout(100);
const retry=await p.evaluate(()=>({lines:data.lines.length,points:ed.points.length}));
console.log('after retry',JSON.stringify(retry));
assert(retry.lines===1,'a line whose save failed should be retryable, not discarded');
assert.deepEqual(errors,[]);console.log('PASS');
}finally{await br.close()}})().catch(e=>{console.error('FAIL:',e.message||e);process.exit(1)});
