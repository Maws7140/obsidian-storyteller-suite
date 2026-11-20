// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node test/browser/placement-cancel.cjs
// The placement instruction bar has a tappable Cancel button that exits without placing anything (touch users have no Esc).
const path=require('path').resolve(__dirname,'../..')+'/';const assert=require('assert');
const {chromium}=require(path+'node_modules/playwright');const esbuild=require(path+'node_modules/esbuild');const fs=require('fs');
(async()=>{
const bundle=await esbuild.build({stdin:{contents:"export { createPlacementOverlay } from './src/leaflet/placementOverlay';",resolveDir:path,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'PO',plugins:[{name:'host',setup(b){b.onResolve({filter:/^leaflet$/},a=>({path:a.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},()=>({contents:'module.exports=window.L',loader:'js'}));}}]});
const br=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,...(process.env.CHROMIUM_PATH?{}:{channel:'chrome'})});
const p=await br.newPage({viewport:{width:1000,height:700},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.setContent('<div id="wrap" class="storyteller-map-container" style="width:900px;height:600px;position:relative;overflow:hidden"><div id="map" style="position:absolute;top:0;left:0;width:900px;height:600px"></div></div>');
await p.addStyleTag({content:fs.readFileSync(path+'node_modules/leaflet/dist/leaflet.css','utf8')+fs.readFileSync(path+'styles.css','utf8')});
await p.addScriptTag({content:fs.readFileSync(path+'node_modules/leaflet/dist/leaflet.js','utf8')});
await p.addScriptTag({content:bundle.outputFiles[0].text});
await p.evaluate(()=>{window.map=L.map('map',{crs:L.CRS.Simple}).setView([300,450],0);L.rectangle([[0,0],[600,900]],{color:'#888'}).addTo(map);
window.mapClicks=0;window.cancels=0;map.on('click',()=>mapClicks++);
// Overlay inside the Leaflet container, as the move-marker instruction is.
window.overlay=PO.createPlacementOverlay(map.getContainer(),{text:'Click on the map to set the new marker position',hint:'Press ESC to cancel',onCancel:()=>{cancels++;overlay.remove();}});});
const btn=p.locator('.placement-cancel');assert.equal(await btn.count(),1,'overlay has a Cancel button');
const box=await btn.boundingBox();const cx=box.x+box.width/2,cy=box.y+box.height/2;
const hit=await p.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return !!el&&(el.classList.contains('placement-cancel')||!!el.closest('.placement-cancel'))},[cx,cy]);
assert(hit,'Cancel button is hit-testable through the overlay');
await p.touchscreen.tap(cx,cy);await p.waitForTimeout(150);
assert.equal(await p.evaluate(()=>cancels),1,'tapping Cancel calls onCancel once');
assert.equal(await p.evaluate(()=>mapClicks),0,'tapping Cancel must not reach the map click handlers');
assert.equal(await p.evaluate(()=>!document.querySelector('.storyteller-placement-overlay')),true,'caller removes the overlay');
assert.deepEqual(errors,[]);console.log('PASS: placement Cancel button is tappable and does not reach the map');
await br.close();
})().catch(e=>{console.error('FAIL:',e.message||e);process.exit(1)});
