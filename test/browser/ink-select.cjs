// Run: node test/browser/ink-select.cjs
// Real Leaflet (CRS.Simple, zoom 0: one map unit is one pixel) with the Map Ink layer and the
// select tool, driven by real mouse and keyboard events. A minimal fake store wraps a document
// and a real InkHistory. Covers click select, shift toggle, marquee, move, resize, rotate
// (with Shift snap), vertex drag, midpoint insert, Alt-click vertex delete, text double-click,
// the item menu, locked items, undo of each gesture via Ctrl+Z, and that no Leaflet click or
// pan comes from any of these gestures.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const SHOT = '/home/user/wt/ink-w2b-select.png';

// Screen point (client px) for a latlng on the map.
async function at(page, lat, lng) {
	return page.evaluate(([la, ln]) => {
		const r = map.getContainer().getBoundingClientRect();
		const p = map.latLngToContainerPoint([la, ln]);
		return { x: r.left + p.x, y: r.top + p.y };
	}, [lat, lng]);
}

// Centre of an element's bounding box (client px), or null when it is not drawn.
async function centreOf(page, selector) {
	return page.evaluate(sel => {
		const el = document.querySelector(sel);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}, selector);
}

async function itemCentre(page, id) {
	const c = await centreOf(page, `[data-ink-id="${id}"] .ink-hit`);
	assert.ok(c, `no hit area for ${id}`);
	return c;
}

async function drag(page, from, to, steps = 12) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps });
	await page.mouse.up();
	await page.waitForTimeout(20);
}

async function state(page) {
	return page.evaluate(() => ({
		ids: window.store.doc.items.map(i => i.id),
		selection: Array.from(window.store.selection).sort(),
		item: id => window.store.doc.items.find(i => i.id === id),
	}));
}

async function docItem(page, id) {
	return page.evaluate(i => JSON.parse(JSON.stringify(window.store.doc.items.find(x => x.id === i) || null)), id);
}

async function selection(page) {
	return page.evaluate(() => Array.from(window.store.selection).sort());
}

async function undo(page) {
	await page.keyboard.press('Control+z');
	await page.waitForTimeout(20);
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} got ${a}`);

(async () => {
	const bundle = await esbuild.build({
		stdin: {
			contents: [
				"export { createInkLayer } from './src/leaflet/ink/InkLayer';",
				"export { normalizeInk, defaultInkDoc } from './src/leaflet/ink/model';",
				"export { createSelectTool } from './src/leaflet/ink/tools/select';",
				"export { handleEditorKey } from './src/leaflet/ink/tools/keyboard';",
				"export { InkHistory } from './src/leaflet/ink/history';",
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
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

	await page.setContent('<div id="wrap" style="width:1000px;height:700px;position:relative;overflow:hidden"><div id="map" style="position:absolute;top:0;left:0;width:1000px;height:700px"></div></div>');
	await page.addStyleTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.css', 'utf8') + fs.readFileSync(path + 'styles.css', 'utf8') });
	await page.addScriptTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.js', 'utf8') });
	await page.addScriptTag({ content: bundle.outputFiles[0].text });

	await page.evaluate(() => {
		// Minimal InkStore: a document, a selection, a real InkHistory, and the methods the select tool uses.
		function makeStore(initial) {
			let doc = initial;
			const sel = new Set();
			const history = new INK.InkHistory();
			const listeners = new Set();
			const emit = () => listeners.forEach(fn => fn());
			return {
				get doc() { return doc; },
				get selection() { return sel; },
				get canUndo() { return history.canUndo; },
				get canRedo() { return history.canRedo; },
				select(ids) { sel.clear(); for (const id of ids) sel.add(id); emit(); },
				toggleSelect(id) { if (sel.has(id)) sel.delete(id); else sel.add(id); emit(); },
				clearSelection() { sel.clear(); emit(); },
				apply(change, key) { history.push(doc, key); doc = INK.normalizeInk(change(doc)); emit(); },
				undo() { const prev = history.undo(doc); if (prev) { doc = prev; emit(); } },
				redo() { const next = history.redo(doc); if (next) { doc = next; emit(); } },
				flush() { return Promise.resolve(); },
				activeLayer() { return 'features'; },
				on(event, fn) { listeners.add(fn); return () => listeners.delete(fn); },
			};
		}

		window.map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, attributionControl: false, zoomControl: false }).setView([350, 500], 0);
		L.rectangle([[0, 0], [700, 1000]], { color: '#8a7650', weight: 2, fillColor: '#e8d9b5', fillOpacity: 1 }).addTo(map);

		const st = (o) => Object.assign({
			stroke: '#2b2b2b', strokeWidth: 3, strokeOpacity: 1, dash: 'solid',
			fill: '#3b82c4', fillOpacity: 0.3, fillPattern: 'none',
		}, o);
		const items = [
			{ id: 'road', kind: 'path', layer: 'routes', scaleWithMap: true, points: [[150, 100], [400, 100], [400, 300]], style: st({ stroke: '#7a5c3a', strokeWidth: 4 }) },
			{ id: 'lake', kind: 'area', layer: 'terrain', scaleWithMap: true, points: [[500, 100], [500, 200], [600, 200], [600, 100]], style: st({ stroke: '#1f5fa8', fill: '#3b82c4', fillOpacity: 0.3 }) },
			{ id: 'door', kind: 'stamp', layer: 'features', scaleWithMap: true, at: [250, 600], symbol: 'door', size: 40, rotation: 0, color: '#8b5a2b', opacity: 1 },
			{ id: 'box', kind: 'rect', layer: 'features', scaleWithMap: true, a: [400, 600], b: [500, 700], rotation: 0, style: st({ stroke: '#7b4fa0', fillOpacity: 0.1 }) },
			{ id: 'label', kind: 'text', layer: 'labels', scaleWithMap: true, at: [600, 600], text: 'Town', rotation: 0,
				style: { font: 'serif', size: 24, color: '#2b1d12', halo: '#f4ecd8', haloWidth: 3, align: 'middle' } },
			{ id: 'locked', kind: 'path', layer: 'routes', locked: true, scaleWithMap: true, points: [[450, 850], [550, 850]], style: st({ stroke: '#b03a2e' }) },
		];
		window.store = makeStore(INK.normalizeInk({
			layers: [
				{ id: 'terrain', name: 'Terrain', visible: true, locked: false },
				{ id: 'routes', name: 'Routes', visible: true, locked: false },
				{ id: 'features', name: 'Features', visible: true, locked: false },
				{ id: 'labels', name: 'Labels', visible: true, locked: false },
			],
			items,
		}));
		window.mapClicks = 0;
		window.mapMoves = 0;
		window.edited = [];
		window.menus = [];
		map.on('click', () => { window.mapClicks += 1; });
		map.on('movestart', () => { window.mapMoves += 1; });

		window.ink = INK.createInkLayer(L, {}).addTo(map);
		window.tool = INK.createSelectTool();
		const host = {
			notify() {}, confirm: async () => true, icon() {},
			showMenu(menuItems) { window.menus.push(menuItems.map(m => m.title)); window.lastMenu = menuItems; },
			pickLocation: async () => null, openLocation() {},
			load: () => window.store.doc, save: async () => {}, presets: () => [], savePreset() {},
		};
		window.tool.activate({
			L, map, store: window.store, layer: window.ink, host,
			onEditText: id => window.edited.push(id),
		});
		// Keys go to the tool first, as the editor does.
		document.addEventListener('keydown', e => { if (window.tool.onKey(e)) e.preventDefault(); });
		window.ink.setDoc(window.store.doc);
	});

	// 1. Click selects, shift toggles, empty click clears, the locked item cannot be selected.
	let p = await itemCentre(page, 'door');
	await page.mouse.click(p.x, p.y);
	assert.deepEqual(await selection(page), ['door'], 'click selects the stamp');
	// Away from the selection handles, which take priority over items underneath.
	const roadPoint = await at(page, 200, 100);
	await page.keyboard.down('Shift');
	await page.mouse.click(roadPoint.x, roadPoint.y);
	await page.keyboard.up('Shift');
	assert.deepEqual(await selection(page), ['door', 'road'], 'shift-click adds the path');
	await page.keyboard.down('Shift');
	await page.mouse.click(roadPoint.x, roadPoint.y);
	await page.keyboard.up('Shift');
	assert.deepEqual(await selection(page), ['door'], 'shift-click on a selected item removes it');
	const empty = await at(page, 50, 900);
	await page.mouse.click(empty.x, empty.y);
	assert.deepEqual(await selection(page), [], 'click on empty space clears the selection');
	const lockedAt = await at(page, 500, 850);
	await page.mouse.click(lockedAt.x, lockedAt.y);
	assert.deepEqual(await selection(page), [], 'a locked item cannot be selected');
	console.log('ok: click, shift toggle, empty clear, locked item');

	// 2. Marquee selects through itemsInRect. The rectangle covers the door only.
	const m0 = await at(page, 300, 650);
	const m1 = await at(page, 150, 550);
	await page.mouse.move(m0.x, m0.y);
	await page.mouse.down();
	await page.mouse.move(m1.x, m1.y, { steps: 6 });
	const marquee = await page.evaluate(() => !!document.querySelector('.ink-marquee'));
	assert.ok(marquee, 'marquee div is shown while dragging');
	await page.mouse.up();
	assert.equal(await page.evaluate(() => document.querySelectorAll('.ink-marquee').length), 0, 'marquee is removed on release');
	assert.deepEqual(await selection(page), ['door'], 'marquee selects the door only');
	console.log('ok: marquee');

	// 3. Move the selection by a pixel drag: one gesture, one undo step.
	const doorBefore = await docItem(page, 'door');
	p = await itemCentre(page, 'door');
	await drag(page, p, { x: p.x + 50, y: p.y + 30 });
	let door = await docItem(page, 'door');
	near(door.at[1], doorBefore.at[1] + 50, 0.6, 'door moved right by 50 px');
	near(door.at[0], doorBefore.at[0] - 30, 0.6, 'door moved down by 30 px');
	await undo(page);
	door = await docItem(page, 'door');
	near(door.at[1], doorBefore.at[1], 0.01, 'undo restores the door position');
	near(door.at[0], doorBefore.at[0], 0.01, 'undo restores the door latitude');
	// Redo the move so later steps build on it.
	await page.keyboard.press('Control+Shift+Z');
	door = await docItem(page, 'door');
	near(door.at[1], doorBefore.at[1] + 50, 0.6, 'redo restores the move');
	console.log('ok: move, undo, redo');

	// 4. Resize from the south-east handle: the stamp grows from 40 to about 60 px.
	const before = await docItem(page, 'door');
	const se = await centreOf(page, '[data-ink-handle="se"]');
	assert.ok(se, 'south-east handle drawn for the selected stamp');
	await drag(page, se, { x: se.x + 20, y: se.y + 20 });
	door = await docItem(page, 'door');
	near(door.size, 60, 1.5, 'stamp grows by the handle drag');
	await undo(page);
	door = await docItem(page, 'door');
	near(door.size, before.size, 0.01, 'undo restores the stamp size');
	await page.keyboard.press('Control+Shift+Z');
	console.log('ok: resize, undo');

	// 5. Vertex drag on the road: select the road and move its middle vertex.
	await page.evaluate(() => window.store.select(['road']));
	const v1 = await centreOf(page, '[data-ink-vertex="1"]');
	assert.ok(v1, 'vertex handle drawn for the path');
	const target = await at(page, 300, 200);
	await drag(page, v1, target);
	let road = await docItem(page, 'road');
	near(road.points[1][0], 300, 0.6, 'vertex moved to latitude 300');
	near(road.points[1][1], 200, 0.6, 'vertex moved to longitude 200');
	await undo(page);
	road = await docItem(page, 'road');
	assert.deepEqual(road.points[1].map(v => Math.round(v)), [400, 100], 'undo restores the vertex');
	await page.keyboard.press('Control+Shift+Z');
	console.log('ok: vertex drag, undo');

	// 6. Midpoint insert: drag the ghost between vertex 1 and vertex 2 to a new point.
	const ghost = await centreOf(page, '[data-ink-mid="2"]');
	assert.ok(ghost, 'midpoint ghost drawn between vertices 1 and 2');
	const insertAt = await at(page, 330, 240);
	await drag(page, ghost, insertAt);
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 4, 'midpoint drag inserts one vertex');
	near(road.points[2][0], 330, 0.6, 'inserted vertex follows the pointer (lat)');
	near(road.points[2][1], 240, 0.6, 'inserted vertex follows the pointer (lng)');
	await undo(page);
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 3, 'undo removes the inserted vertex');
	console.log('ok: midpoint insert, undo');

	// 7. Alt-click a vertex deletes it.
	await page.evaluate(() => window.store.select(['road']));
	await page.evaluate(() => window.ink.setSelection(['road']));
	await page.waitForTimeout(20);
	const vAlt = await centreOf(page, '[data-ink-vertex="1"]');
	await page.keyboard.down('Alt');
	await page.mouse.click(vAlt.x, vAlt.y);
	await page.keyboard.up('Alt');
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 2, 'Alt-click deletes the vertex (path keeps two points)');
	await undo(page);
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 3, 'undo restores the deleted vertex');
	// Right-click on a vertex also deletes it, and does not open the item menu.
	const menusBefore = await page.evaluate(() => window.menus.length);
	const vRight = await centreOf(page, '[data-ink-vertex="1"]');
	await page.mouse.click(vRight.x, vRight.y, { button: 'right' });
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 2, 'right-click deletes the vertex');
	assert.equal(await page.evaluate(() => window.menus.length), menusBefore, 'right-click on a vertex opens no menu');
	await undo(page);
	road = await docItem(page, 'road');
	assert.equal(road.points.length, 3, 'undo restores the vertex deleted by right-click');
	console.log('ok: Alt-click and right-click vertex delete, undo');

	// 8. Rotate the rectangle, with Shift snapping to 15 degrees. 47 degrees snaps to 45.
	await page.evaluate(() => window.store.select(['box']));
	const rot = await centreOf(page, '[data-ink-handle="rotate"]');
	assert.ok(rot, 'rotate handle drawn for the rectangle');
	const boxC = await itemCentre(page, 'box');
	const radius = 100;
	const angle = (-90 + 47) * Math.PI / 180;
	const rotTarget = { x: boxC.x + radius * Math.cos(angle), y: boxC.y + radius * Math.sin(angle) };
	await page.keyboard.down('Shift');
	await drag(page, rot, rotTarget);
	await page.keyboard.up('Shift');
	let box = await docItem(page, 'box');
	near(box.rotation, 45, 0.6, 'shift-rotate snaps to 45 degrees');
	await undo(page);
	box = await docItem(page, 'box');
	near(box.rotation, 0, 0.01, 'undo restores the rotation');
	console.log('ok: rotate with shift snap, undo');

	// 9. Text: double-click reopens it through onEditText. Locked items stay put.
	const labelC = await itemCentre(page, 'label');
	await page.mouse.dblclick(labelC.x, labelC.y);
	await page.waitForTimeout(20);
	assert.deepEqual(await page.evaluate(() => window.edited), ['label'], 'double-click calls onEditText');
	assert.deepEqual(await selection(page), ['label'], 'double-click selects the text');
	console.log('ok: text double-click');

	// 10. Right-click opens the item menu with the expected entries. Duplicate runs from it.
	await page.evaluate(() => window.store.select([]));
	const doorC = await itemCentre(page, 'door');
	await page.mouse.click(doorC.x, doorC.y, { button: 'right' });
	const titles = await page.evaluate(() => window.menus[window.menus.length - 1]);
	const want = ['Duplicate', 'Bring forward', 'Send backward', 'Bring to front', 'Send to back', 'Copy style', 'Paste style', 'Lock', 'Delete'];
	for (const t of want) assert.ok(titles.indexOf(t) >= 0, `menu has ${t}: ${JSON.stringify(titles)}`);
	await page.evaluate(() => { window.lastMenu.find(m => m.title === 'Duplicate').onClick(); });
	const copies = await page.evaluate(() => window.store.doc.items.length);
	assert.equal(copies, 7, 'Duplicate from the menu adds one item to the six in the fixture');
	await undo(page);
	assert.equal(await page.evaluate(() => window.store.doc.items.length), 6, 'undo removes the duplicate');
	console.log('ok: right-click menu, duplicate from menu');

	// 11. Map input: no Leaflet click or pan came from any of the gestures above.
	await page.keyboard.press('Escape');
	assert.deepEqual(await selection(page), [], 'Escape clears the selection');
	const clicks = await page.evaluate(() => window.mapClicks);
	const moves = await page.evaluate(() => window.mapMoves);
	assert.equal(clicks, 0, 'a separate map click listener receives no clicks from these gestures');
	assert.equal(moves, 0, 'the map does not pan during select gestures');
	const dragging = await page.evaluate(() => map.dragging.enabled());
	assert.ok(dragging, 'map dragging is restored after the gestures');
	console.log('ok: no map clicks, no pan, dragging restored');
	// Control: with the tool off, the same empty click does reach Leaflet, so the zero above means something.
	await page.evaluate(() => window.tool.deactivate());
	await page.mouse.click(empty.x, empty.y);
	assert.equal(await page.evaluate(() => window.mapClicks), 1, 'control: with the tool off a map click reaches Leaflet');
	console.log('ok: control, a map click reaches Leaflet once the tool is off');

	await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 1000, height: 700 } });
	assert.deepEqual(errors, [], 'no page errors');
	console.log('screenshot', SHOT);
	console.log('PASS: Map Ink select tool covers click, marquee, move, resize, rotate, vertices, text, menu, undo, and map isolation.');
	await br.close();
})().catch(e => { console.error(e); process.exit(1); });
