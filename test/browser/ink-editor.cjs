// Run: node test/browser/ink-editor.cjs
// Real Leaflet with InkEditor and a fake host. Opens the editor, draws an area with the
// Area tool, selects it, changes its fill in the inspector, undoes, adds and hides a
// layer from the Layers tab, closes the editor, and checks the drawing is still on the map.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const SHOT = process.env.INK_EDITOR_SHOT || '';

(async () => {
	const bundle = await esbuild.build({
		stdin: {
			contents: [
				"export { InkEditor } from './src/leaflet/ink/InkEditor';",
				"export { defaultInkDoc } from './src/leaflet/ink/model';",
				"export { DEFAULT_STYLE } from './src/leaflet/ink/styles';",
			].join('\n'),
			resolveDir: path,
			loader: 'ts',
		},
		bundle: true,
		write: false,
		format: 'iife',
		globalName: 'INK',
	});

	const br = await chromium.launch({
		headless: true,
		executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
	});
	const page = await br.newPage({ viewport: { width: 1200, height: 800 } });
	page.setDefaultTimeout(10000);
	const step = name => { if (process.env.INK_DEBUG) console.log('step:', name); };
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

	await page.setContent('<div id="wrap" style="width:1000px;height:700px;position:relative;overflow:hidden"><div id="map" style="position:absolute;top:0;left:0;width:1000px;height:700px"></div></div>');
	await page.addStyleTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.css', 'utf8') + fs.readFileSync(path + 'styles.css', 'utf8') });
	await page.addScriptTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.js', 'utf8') });
	await page.addScriptTag({ content: bundle.outputFiles[0].text });

	await page.evaluate(() => {
		window.map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, attributionControl: false }).setView([350, 500], 0);
		L.rectangle([[0, 0], [700, 1000]], { color: '#8a7650', weight: 2, fillColor: '#e8d9b5', fillOpacity: 1 }).addTo(map);
		window.saves = [];
		window.notes = [];
		const host = {
			notify: m => window.notes.push(m),
			confirm: async () => true,
			showMenu: () => undefined,
			icon: (el, name) => { el.setAttribute('data-icon', name); },
			pickLocation: async () => null,
			openLocation: () => undefined,
			load: () => INK.defaultInkDoc(),
			save: async doc => { window.saves.push(JSON.parse(JSON.stringify(doc))); },
			presets: () => [],
			savePreset: () => undefined,
		};
		window.host = host;
		// The editor creates its own drawing layer on the map.
		window.editor = new INK.InkEditor({ L, map, host, container: map.getContainer(), doc: INK.defaultInkDoc() });
		window.store = editor.store;
	});

	const DEFAULT_FILL = await page.evaluate(() => INK.DEFAULT_STYLE.fill);

	const box = await page.evaluate(() => {
		const r = document.getElementById('map').getBoundingClientRect();
		return { left: r.left, top: r.top };
	});
	const at = (x, y) => ({ x: box.left + x, y: box.top + y });
	const clickMap = async (x, y) => {
		const p = at(x, y);
		await page.mouse.click(p.x, p.y);
	};
	// The last area the host saved, read from the page.
	const latestArea = () => page.evaluate(() => window.saves.at(-1).items.filter(item => item.kind === 'area').at(-1));

	step('open');
	// Open the editor and check the panels mounted.
	await page.evaluate(() => editor.open());
	assert.ok(await page.$('.ink-toolbar'), 'toolbar mounted');
	assert.ok(await page.$('.ink-inspector'), 'inspector mounted');
	assert.ok(await page.$('.ink-layers'), 'layers panel mounted');
	assert.equal(await page.evaluate(() => store.tool), 'select', 'select is armed by default');

	step('draw');
	// Draw an area with the Area tool from the toolbar.
	await page.click('button[data-tool="area"]');
	assert.equal(await page.evaluate(() => store.tool), 'area');
	const corners = [[300, 200], [520, 200], [410, 380]];
	for (const [x, y] of corners) await clickMap(x, y);
	// Clicking the first point closes the area.
	await clickMap(corners[0][0], corners[0][1]);
	await page.evaluate(() => editor.store.flush());
	const areaCount = await page.evaluate(() => store.doc.items.filter(i => i.kind === 'area').length);
	assert.equal(areaCount, 1, 'one area drawn');
	const saved = await latestArea();
	assert.ok(saved, 'area saved');
	assert.equal(saved.style.fill, DEFAULT_FILL, 'area saved with the default fill');
	const areaId = saved.id;

	step('select');
	// Path tool: two points show the Finish button, and Finish completes the path.
	await page.click('button[data-tool="path"]');
	await clickMap(120, 500);
	await clickMap(260, 560);
	assert.ok(await page.isVisible('.ink-finish'), 'Finish shows while a path is unfinished');
	await page.click('.ink-finish');
	await page.evaluate(() => editor.store.flush());
	assert.equal(await page.isVisible('.ink-finish'), false, 'Finish hides once the path is saved');
	const pathCount = await page.evaluate(() => store.doc.items.filter(i => i.kind === 'path').length);
	assert.equal(pathCount, 1, 'Finish saves the path');

	// Select it with the Select tool and change its fill in the inspector.
	await page.click('button[data-tool="select"]');
	// The default fill is transparent, so click the edge of the area.
	await clickMap(410, 200);
	const selected = await page.evaluate(() => [...store.selection]);
	assert.deepEqual(selected, [areaId], 'the area is selected');

	await page.click('button[aria-label^="Fill colour:"]');
	await page.evaluate(() => {
		const input = [...document.querySelectorAll('input.ink-native')].find(el => el.offsetParent !== null);
		if (!input) throw new Error('no open colour input');
		input.value = '#1e6fd9';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await page.evaluate(() => editor.store.flush());
	const recoloured = await latestArea();
	assert.equal(recoloured.style.fill, '#1e6fd9', 'fill changed through the inspector');

	step('undo');
	// Undo the colour change with Ctrl+Z.
	await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
	await page.keyboard.press('Control+z');
	await page.evaluate(() => editor.store.flush());
	assert.equal((await latestArea()).style.fill, DEFAULT_FILL, 'undo restores the fill');

	step('layers');
	// Add a layer from the Layers tab and hide it.
	await page.click('button[data-tab="layers"]');
	await page.click('button[aria-label="Add layer"]');
	// The new layer opens a name field. Enter confirms the name.
	await page.keyboard.press('Enter');
	const layerName = await page.evaluate(() => store.doc.layers.at(-1).name);
	const layerId = await page.evaluate(() => store.doc.layers.at(-1).id);
	assert.ok(layerName.startsWith('Layer '), 'new layer is named');
	await page.click(`button[aria-label="Hide layer ${layerName}"]`);
	const hidden = await page.evaluate(id => store.doc.layers.find(l => l.id === id).visible, layerId);
	assert.equal(hidden, false, 'new layer is hidden');

	step('focus');
	// In Obsidian a click on the map leaves focus where it was (the Draw button). Shortcuts must
	// follow the last press on the map, and stop after a press outside it.
	await page.evaluate(() => {
		const b = document.createElement('button');
		b.id = 'outside';
		b.textContent = 'Draw';
		b.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:9999';
		document.body.appendChild(b);
		b.focus();
	});
	await clickMap(900, 650);
	assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'focus stays on the outside button');
	await page.keyboard.press('r');
	assert.equal(await page.evaluate(() => store.tool), 'rect', 'shortcut works after a map click');
	await page.click('#outside');
	await page.keyboard.press('e');
	assert.equal(await page.evaluate(() => store.tool), 'rect', 'shortcut ignored after a press outside the map');
	await clickMap(900, 650);
	await page.keyboard.press('Escape');
	assert.equal(await page.evaluate(() => store.tool), 'select', 'Escape returns to Select');

	if (SHOT) await page.screenshot({ path: SHOT });

	step('close');
	// Close the editor. The drawing stays on the map and the panels go.
	await page.evaluate(() => editor.close());
	assert.equal(await page.evaluate(() => editor.isOpen()), false);
	assert.equal(await page.$('.ink-toolbar'), null, 'toolbar removed on close');
	assert.equal(await page.$('.ink-inspector'), null, 'inspector removed on close');
	const drawn = await page.evaluate(id => {
		const el = document.querySelector(`[data-ink-id="${id}"]`);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { width: r.width, height: r.height, fill: el.querySelector('path, polygon') ? 'yes' : 'no' };
	}, areaId);
	assert.ok(drawn && drawn.width > 0 && drawn.height > 0, 'area still drawn after close');
	assert.deepEqual(errors, [], 'no page errors');

	await br.close();
	console.log('ink-editor: all checks passed');
})().catch(err => {
	console.error('ink-editor FAILED:', err.message);
	process.exitCode = 1;
});
