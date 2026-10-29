// Leaflet's redraw() set the tile zoom to the fractional map zoom (zoomSnap 0), so every redraw
// asked for tiles at a zoom with none: the campaign board went blank when a sidebar opened.
// ObsidianTileLayer.redraw rounds through _setView. Real Leaflet, real ObsidianTileLayer.
const path = require('path'); const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(ROOT + '/node_modules/playwright'); const esbuild = require(ROOT + '/node_modules/esbuild');
const fs = require('fs'); const assert = require('assert');
(async () => {
	const stub = `export class TFile { constructor(p){ this.path = p; } }`;
	const bundle = await esbuild.build({
		stdin: { contents: "export { ObsidianTileLayer } from './src/leaflet/ObsidianTileLayer';", resolveDir: ROOT, loader: 'ts' },
		bundle: true, write: false, format: 'iife', globalName: 'Bundle', logLevel: 'error',
		plugins: [{ name: 'host', setup(b) {
			b.onResolve({ filter: /^(leaflet|obsidian)$/ }, a => ({ path: a.path, namespace: 'host' }));
			b.onLoad({ filter: /.*/, namespace: 'host' }, a => ({ contents: a.path === 'leaflet' ? 'module.exports=window.L' : stub, loader: a.path === 'leaflet' ? 'js' : 'ts' }));
		} }],
	});
	const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
	try {
		const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
		await page.setContent('<div id="map" style="width:800px;height:400px"></div>');
		await page.addStyleTag({ content: fs.readFileSync(ROOT + '/node_modules/leaflet/dist/leaflet.css', 'utf8') });
		await page.addScriptTag({ content: fs.readFileSync(ROOT + '/node_modules/leaflet/dist/leaflet.js', 'utf8') });
		await page.evaluate(() => { window.createEl = (t) => document.createElement(t); HTMLElement.prototype.setCssStyles = function (s) { Object.assign(this.style, s); }; });
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		const r = await page.evaluate(() => {
			// Every tile "exists"; URLs are tiny data images so tiles load.
			const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
			const plugin = { app: { vault: { getAbstractFileByPath: p => ({ path: p }), adapter: { getResourcePath: () => png } } } };
			const map = L.map('map', { crs: L.CRS.Simple, zoomSnap: 0, minZoom: -2, maxZoom: 6 });
			const bounds = L.latLngBounds([[0, 0], [1024, 1536]]);
			const layer = new Bundle.ObsidianTileLayer(plugin, 'h', 'tiles', { minNativeZoom: 0, maxNativeZoom: 3, tileSize: 256, noWrap: true, bounds });
			map.setView([512, 768], 2.2667, { animate: false });
			layer.addTo(map);
			const before = Object.keys(layer._tiles).length;
			layer.redraw();
			return { before, after: Object.keys(layer._tiles).length, tileZoom: layer._tileZoom, mapZoom: map.getZoom() };
		});
		console.log(JSON.stringify(r));
		assert.ok(r.before > 0, 'tiles before redraw');
		assert.ok(Number.isInteger(r.tileZoom), 'tile zoom is a whole number after redraw: ' + r.tileZoom);
		assert.ok(r.after > 0, 'redraw at a fractional map zoom keeps tiles on the map');
		console.log('PASS: redraw at a fractional zoom keeps whole-number tile zoom and tiles.');
	} finally { await browser.close(); }
})().catch(e => { console.error('FAIL:', e.message || e); process.exit(1); });
