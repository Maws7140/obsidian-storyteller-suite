// Run: node test/browser/ink-render.cjs
// Real Leaflet (CRS.Simple) with the Map Ink layer: one item of every kind, dash style and fill
// pattern. Checks node presence, zoom and pan placement, that zoom never adds or removes item
// nodes, keep-size items, hit testing, read-only, destroy, and saves a screenshot.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const SHOT = '/home/user/wt/ink-w1c-render.png';
const SHEET = '/home/user/wt/w5a-brushes.png';

(async () => {
	const bundle = await esbuild.build({
		stdin: {
			contents: "export { createInkLayer } from './src/leaflet/ink/InkLayer'; export { normalizeInk, defaultInkDoc } from './src/leaflet/ink/model'; export { buildItem, brushDetailFor } from './src/leaflet/ink/svgBuild'; export { BRUSHES } from './src/leaflet/ink/brushes'; export { oldLinePieces, oldPieceMarkup } from './test/browser/maplog-old/lines';",
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

	// Build the map, the document and the layer in the page.
	await page.evaluate(() => {
		const rect = (y0, x0, y1, x1) => [[y0, x0], [y0, x1], [y1, x1], [y1, x0]];
		const st = (o) => Object.assign({
			stroke: '#2b2b2b', strokeWidth: 2, strokeOpacity: 1, dash: 'solid',
			fill: '#3b82c4', fillOpacity: 0.35, fillPattern: 'none',
		}, o);
		const ts = (o) => Object.assign({
			font: 'serif', size: 22, color: '#2b1d12', halo: '#f4ecd8', haloWidth: 3, align: 'middle',
		}, o);

		window.map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, attributionControl: false }).setView([350, 500], 0);
		L.rectangle([[0, 0], [700, 1000]], { color: '#8a7650', weight: 2, fillColor: '#e8d9b5', fillOpacity: 1 }).addTo(map);

		const items = [];
		// Terrain: one area per fill pattern.
		const patterns = [
			['none', 'none'], ['solid', 'solid'], ['hatch', 'hatch'], ['crosshatch', 'crosshatch'],
			['dots', 'dots'], ['symbol:tree', 'symbol:tree'],
		];
		patterns.forEach(([name, fillPattern], i) => {
			const x0 = 40 + i * 155;
			items.push({ id: 'area-' + name.replace(/[^a-z]/g, ''), kind: 'area', layer: 'terrain', scaleWithMap: true,
				points: rect(40, x0, 130, x0 + 130),
				style: st({ fillPattern, fill: '#5c9a4a', fillOpacity: fillPattern === 'none' ? 0 : 0.3, stroke: '#2e5e3a' }) });
		});
		items.push({ id: 'area-water', kind: 'area', layer: 'terrain', scaleWithMap: true, points: [[150, 40], [150, 300], [250, 260], [240, 60]],
			style: st({ stroke: '#1f5fa8', strokeWidth: 1.5, fill: '#3b82c4', fillOpacity: 0.35, fillPattern: 'symbol:wave', patternColor: '#1f5fa8', smooth: true }) });
		items.push({ id: 'area-ellipse', kind: 'ellipse', layer: 'terrain', scaleWithMap: true, a: [150, 330], b: [250, 470], rotation: 15,
			style: st({ stroke: '#8e2c2c', dash: 'dashed', fill: '#e0645a', fillOpacity: 0.2, fillPattern: 'dots', patternColor: '#8e2c2c' }) });

		// Routes: one path per dash style, plus smoothing, arrowheads and a freehand stroke.
		const dashes = ['solid', 'dashed', 'dotted', 'double', 'wavy', 'ticked', 'railway'];
		dashes.forEach((dash, i) => {
			const y = 300 + i * 40;
			items.push({ id: 'route-' + dash, kind: 'path', layer: 'routes', scaleWithMap: true,
				points: [[y, 40], [y - 10, 180], [y + 5, 300], [y, 420]], style: st({ stroke: '#7a5c3a', strokeWidth: 3, dash }) });
		});
		items.push({ id: 'route-smooth-arrow', kind: 'path', layer: 'routes', scaleWithMap: true,
			points: [[600, 40], [560, 160], [640, 260], [600, 380]],
			style: st({ stroke: '#8e2c2c', strokeWidth: 2.5, dash: 'solid', smooth: true, arrowEnd: true, arrowStart: true }) });
		items.push({ id: 'route-freehand', kind: 'freehand', layer: 'routes', scaleWithMap: true,
			points: [[600, 460], [580, 490], [610, 520], [585, 550], [620, 580]], style: st({ stroke: '#3f7d3a', strokeWidth: 2, dash: 'dotted' }) });
		items.push({ id: 'route-thin', kind: 'path', layer: 'routes', scaleWithMap: false,
			points: [[500, 40], [520, 300]], style: st({ stroke: '#b03a2e', strokeWidth: 3, dash: 'double' }) });

		// Features: stamps, including a rotated one, a keep-size one and a linked one.
		items.push({ id: 'stamp-door', kind: 'stamp', layer: 'features', scaleWithMap: true, at: [240, 540], symbol: 'door', size: 48, rotation: 0, color: '#8b5a2b', opacity: 1 });
		items.push({ id: 'stamp-tower', kind: 'stamp', layer: 'features', scaleWithMap: true, at: [240, 640], symbol: 'tower', size: 40, rotation: 20, color: '#2b2b2b', opacity: 1 });
		items.push({ id: 'stamp-tree', kind: 'stamp', layer: 'features', scaleWithMap: true, at: [300, 700], symbol: 'tree', size: 36, rotation: 0, color: '#2e5e3a', opacity: 0.9 });
		items.push({ id: 'stamp-keep', kind: 'stamp', layer: 'features', scaleWithMap: false, at: [330, 540], symbol: 'pin', size: 20, rotation: 0, color: '#b03a2e', opacity: 1 });
		items.push({ id: 'stamp-linked', kind: 'stamp', layer: 'features', scaleWithMap: true, at: [360, 640], symbol: 'castle', size: 40, rotation: 0, color: '#5f6368', opacity: 1, locationId: 'loc-1', name: 'Castle' });
		items.push({ id: 'box-rect', kind: 'rect', layer: 'features', scaleWithMap: true, a: [400, 540], b: [470, 680], rotation: -8,
			style: st({ stroke: '#7b4fa0', strokeWidth: 2, dash: 'railway', fill: '#7b4fa0', fillOpacity: 0.1, fillPattern: 'none' }) });

		// Labels: every font, bold, italic, letter spacing, multi-line, rotated, keep-size.
		items.push({ id: 'text-title', kind: 'text', layer: 'labels', scaleWithMap: true, at: [60, 500], text: 'Map title', rotation: 0,
			style: ts({ font: 'serif', size: 56, bold: true, letterSpacing: 0.08, color: '#2b1d12', halo: '#f4ecd8', haloWidth: 5 }) });
		items.push({ id: 'text-sans', kind: 'text', layer: 'labels', scaleWithMap: true, at: [520, 760], text: 'Sans label', rotation: 0, style: ts({ font: 'sans', size: 22 }) });
		items.push({ id: 'text-hand', kind: 'text', layer: 'labels', scaleWithMap: true, at: [560, 760], text: 'Hand written', rotation: 0, style: ts({ font: 'hand', size: 24 }) });
		items.push({ id: 'text-mono', kind: 'text', layer: 'labels', scaleWithMap: true, at: [600, 760], text: 'mono 12', rotation: 0, style: ts({ font: 'mono', size: 18, letterSpacing: 0.05 }) });
		items.push({ id: 'text-water', kind: 'text', layer: 'labels', scaleWithMap: true, at: [230, 150], text: 'Silver\nRiver', rotation: -12,
			style: ts({ font: 'serif', size: 20, italic: true, color: '#1f5fa8', halo: '#f4ecd8', haloWidth: 3 }) });
		items.push({ id: 'text-keep', kind: 'text', layer: 'labels', scaleWithMap: false, at: [690, 60], text: 'Keeps its size', rotation: 0, style: ts({ font: 'sans', size: 14, halo: '' }) });

		// Items that must not be drawn.
		items.push({ id: 'brush-wall', kind: 'path', layer: 'routes', scaleWithMap: true,
			points: [[600, 460], [620, 560], [600, 660]], style: st({ stroke: '#2b2118', strokeWidth: 4, brush: 'wall' }) });
		items.push({ id: 'hidden-item', kind: 'path', layer: 'routes', hidden: true, scaleWithMap: true, points: [[690, 40], [690, 300]], style: st({}) });
		items.push({ id: 'hidden-layer-item', kind: 'path', layer: 'secret', scaleWithMap: true, points: [[680, 40], [680, 300]], style: st({}) });

		window.doc = INK.normalizeInk({
			layers: [
				{ id: 'terrain', name: 'Terrain', visible: true, locked: false },
				{ id: 'routes', name: 'Routes', visible: true, locked: false },
				{ id: 'features', name: 'Features', visible: true, locked: false },
				{ id: 'labels', name: 'Labels', visible: true, locked: false },
				{ id: 'secret', name: 'Secret', visible: false, locked: false },
			],
			items,
		});
		window.clicked = [];
		window.ink = INK.createInkLayer(L, { onItemClick: (id) => { window.clicked.push(id); } }).addTo(map);
		ink.setDoc(window.doc);
	});

	const ids = await page.evaluate(() => window.doc.items.map(i => i.id));
	const hiddenIds = ['hidden-item', 'hidden-layer-item'];
	const shownIds = ids.filter(id => hiddenIds.indexOf(id) < 0);

	// 1. Every visible item is drawn once, hidden ones are not.
	for (const id of shownIds) {
		const n = await page.evaluate(i => document.querySelectorAll(`[data-ink-id="${i}"]`).length, id);
		assert.equal(n, 1, `item ${id} drawn ${n} times`);
	}
	for (const id of hiddenIds) {
		const n = await page.evaluate(i => document.querySelectorAll(`[data-ink-id="${i}"]`).length, id);
		assert.equal(n, 0, `hidden item ${id} must not be drawn`);
	}
	const kinds = await page.evaluate(() => {
		const out = {};
		for (const el of document.querySelectorAll('.ink-item')) {
			const k = el.getAttribute('data-ink-kind');
			out[k] = (out[k] || 0) + 1;
		}
		return out;
	});
	for (const k of ['stamp', 'text', 'path', 'freehand', 'area', 'rect', 'ellipse']) {
		assert.ok(kinds[k] > 0, `kind ${k} missing: ${JSON.stringify(kinds)}`);
	}
	console.log('kinds drawn', JSON.stringify(kinds));

	// 2. Every dash style and fill pattern shows up.
	const dashCheck = await page.evaluate(() => ['solid', 'dashed', 'dotted', 'double', 'wavy', 'ticked', 'railway']
		.map(d => [d, document.querySelector(`[data-ink-id="route-${d}"] .ink-stroke`) !== null]));
	assert.ok(dashCheck.every(([, ok]) => ok), 'every dash style draws strokes ' + JSON.stringify(dashCheck));
	const fillCheck = await page.evaluate(() => ({
		none: document.querySelectorAll('[data-ink-id="area-none"] .ink-fill').length,
		hatch: document.querySelectorAll('[data-ink-id="area-hatch"] .ink-pattern').length,
		crosshatch: document.querySelectorAll('[data-ink-id="area-crosshatch"] .ink-pattern').length,
		dots: document.querySelectorAll('[data-ink-id="area-dots"] .ink-pattern').length,
		tree: document.querySelectorAll('[data-ink-id="area-symboltree"] .ink-pattern').length,
		patternDefs: document.querySelectorAll('.ink-svg defs pattern').length,
		markers: document.querySelectorAll('.ink-svg defs marker').length,
	}));
	assert.equal(fillCheck.none, 0, 'fill none draws no fill layer');
	assert.ok(fillCheck.hatch && fillCheck.crosshatch && fillCheck.dots && fillCheck.tree, 'fill patterns drawn ' + JSON.stringify(fillCheck));
	assert.ok(fillCheck.markers >= 1, 'arrowhead marker defined');
	console.log('fills and defs', JSON.stringify(fillCheck));

	// 3. Placement: a stamp's hit box centre sits on its latlng, at every zoom and after a pan.
	const placed = async (id, ll) => page.evaluate(([i, p]) => {
		const hit = document.querySelector(`[data-ink-id="${i}"] .ink-hit`).getBoundingClientRect();
		const box = document.getElementById('map').getBoundingClientRect();
		const pt = map.latLngToContainerPoint(L.latLng(p[0], p[1]));
		return { dx: hit.left + hit.width / 2 - (box.left + pt.x), dy: hit.top + hit.height / 2 - (box.top + pt.y), w: hit.width };
	}, [id, ll]);
	const door = [240, 540];
	let p0 = await placed('stamp-door', door);
	assert.ok(Math.abs(p0.dx) < 1.5 && Math.abs(p0.dy) < 1.5, 'stamp centre on latlng at zoom 0 ' + JSON.stringify(p0));
	assert.ok(Math.abs(p0.w - 48) < 1.5, 'map-scaled stamp is 48 px at zoom 0 ' + p0.w);

	// 4. Zoom twice (in, then in again). No item node may be added or removed, except brushed
	// items: their detail follows the zoom only partly (brushDetailFor), so they are redrawn.
	const brushWidth = () => page.evaluate(() => {
		const stroke = document.querySelector('.ink-items [data-ink-id="brush-wall"] .ink-brush path, .ink-items [data-ink-id="brush-wall"] .ink-brush polyline');
		const root = document.querySelector('.ink-svg > g');
		const scale = Number(/scale\(([^)]+)\)/.exec(root.getAttribute('transform'))[1]);
		return stroke ? Number(stroke.getAttribute('stroke-width')) * scale : null;
	});
	const brushW0 = await brushWidth();
	await page.evaluate(() => {
		window.before = Array.from(document.querySelectorAll('.ink-items [data-ink-id]')).filter(n => !n.querySelector('.ink-brush'));
		window.records = [];
		window.observer = new MutationObserver(list => { for (const r of list) window.records.push(r); });
		window.observer.observe(document.querySelector('.ink-items'), { childList: true, subtree: true });
		ink.setSelection(['stamp-door', 'route-smooth-arrow']);
	});
	await page.evaluate(() => { map.setZoom(1); });
	await page.waitForTimeout(600);
	const z1 = await placed('stamp-door', door);
	assert.ok(Math.abs(z1.dx) < 1.5 && Math.abs(z1.dy) < 1.5, 'stamp centre on latlng at zoom 1 ' + JSON.stringify(z1));
	assert.ok(Math.abs(z1.w - 96) < 2, 'map-scaled stamp doubles at zoom 1 ' + z1.w);
	await page.evaluate(() => { map.setZoom(2); });
	await page.waitForTimeout(600);
	const z2 = await placed('stamp-door', door);
	assert.ok(Math.abs(z2.dx) < 1.5 && Math.abs(z2.dy) < 1.5, 'stamp centre on latlng at zoom 2 ' + JSON.stringify(z2));

	// Pan without animation, then check placement again.
	await page.evaluate(() => { map.panBy([37, -21], { animate: false }); });
	await page.waitForTimeout(100);
	const pan = await placed('stamp-door', door);
	assert.ok(Math.abs(pan.dx) < 1.5 && Math.abs(pan.dy) < 1.5, 'stamp centre on latlng after pan ' + JSON.stringify(pan));

	const nodeCheck = await page.evaluate(() => {
		const plain = x => x.nodeType === 1 && x.hasAttribute('data-ink-id') && !x.querySelector('.ink-brush');
		const added = window.records.reduce((n, r) => n + Array.from(r.addedNodes).filter(plain).length, 0);
		const removed = window.records.reduce((n, r) => n + Array.from(r.removedNodes).filter(plain).length, 0);
		const same = window.before.every(n => n.isConnected && document.querySelector('.ink-items').contains(n));
		window.observer.disconnect();
		return { added, removed, same, count: window.before.length };
	});
	assert.equal(nodeCheck.added, 0, 'zoom added item nodes');
	assert.equal(nodeCheck.removed, 0, 'zoom removed item nodes');
	assert.ok(nodeCheck.same, 'every item node kept its identity across zoom and pan');
	console.log('zoom and pan: item nodes kept', nodeCheck.count, 'added', nodeCheck.added, 'removed', nodeCheck.removed);
	const brushW2 = await brushWidth();
	if (brushW0 !== null) {
		const growth = brushW2 / brushW0;
		console.log('brush screen width zoom 0 to 2:', brushW0.toFixed(2), '->', brushW2.toFixed(2), 'x' + growth.toFixed(2));
		assert.ok(growth > 1.5 && growth < 2.0, 'brush detail grows gently with zoom (about 4^0.4), not 4x: ' + growth);
		const copies = await page.evaluate(() => document.querySelectorAll('.ink-items [data-ink-id="brush-wall"]').length);
		assert.equal(copies, 1, 'a redrawn brush item is drawn once');
	}

	// 5. Keep-size items keep their screen size at every zoom.
	const keep = await page.evaluate(() => document.querySelector('[data-ink-id="stamp-keep"] .ink-hit').getBoundingClientRect().width);
	assert.ok(Math.abs(keep - 20) < 1.5, 'keep-size stamp is 20 px at zoom 2: ' + keep);
	const keepText = await page.evaluate(() => document.querySelector('[data-ink-id="text-keep"] text').getBoundingClientRect().height);
	assert.ok(keepText > 5 && keepText < 30, 'keep-size text has a screen size ' + keepText);

	// 6. Hit testing and click callbacks.
	await page.evaluate(() => { map.setView([360, 640], 2, { animate: false }); });
	const hit = await page.evaluate(() => {
		const r = document.querySelector('[data-ink-id="stamp-linked"] .ink-hit').getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});
	const itemAt = await page.evaluate(([x, y]) => ink.itemAt(x, y), [hit.x, hit.y]);
	assert.equal(itemAt, 'stamp-linked', 'itemAt finds the linked stamp');
	// leaflet.css turns off pointer events on every path in a pane's SVG; lines must still be hittable.
	await page.evaluate(() => { map.setView([300, 230], 1, { animate: false }); });
	await page.waitForTimeout(50);
	const onLine = await page.evaluate(() => {
		const path = document.querySelector('[data-ink-id="route-solid"] path.ink-hit');
		const m = path.getScreenCTM();
		const box = document.getElementById('map').getBoundingClientRect();
		for (let t = 0; t <= 1; t += 0.01) {
			const p = path.getPointAtLength(path.getTotalLength() * t);
			const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
			if (x > box.left + 20 && x < box.right - 20 && y > box.top + 20 && y < box.bottom - 20) return { x, y };
		}
		return { x: -1, y: -1 };
	});
	const lineAt = await page.evaluate(([x, y]) => ink.itemAt(x, y), [onLine.x, onLine.y]);
	assert.equal(lineAt, 'route-solid', 'itemAt finds a line');
	await page.evaluate(() => { map.setView([360, 640], 2, { animate: false }); });
	await page.waitForTimeout(50);
	await page.mouse.click(hit.x, hit.y);
	await page.waitForTimeout(50);
	const clicked = await page.evaluate(() => window.clicked.slice());
	assert.deepEqual(clicked, ['stamp-linked'], 'click reports the item id');

	const inRect = await page.evaluate(() => ink.itemsInRect(L.latLngBounds([[300, 500], [420, 700]])));
	assert.ok(inRect.indexOf('stamp-linked') >= 0 && inRect.indexOf('box-rect') >= 0 && inRect.indexOf('stamp-keep') >= 0, 'itemsInRect finds items: ' + JSON.stringify(inRect));
	assert.ok(inRect.indexOf('stamp-door') < 0 && inRect.indexOf('area-none') < 0, 'itemsInRect ignores items outside the bounds');

	// 6b. Editing an item replaces its node; the old drawing must not stay behind.
	const copies = await page.evaluate(() => {
		const doc = ink.getDoc();
		const target = doc.items.find(i => i.kind === 'stamp');
		for (const [size, color] of [[30, '#b03a2e'], [44, '#3b82c4'], [60, '#3f7d3a']]) {
			ink.setDoc({ ...doc, items: doc.items.map(i => i.id === target.id ? { ...i, size, color } : i) });
		}
		const ids = [...document.querySelectorAll('g.ink-item[data-ink-id]')].map(g => g.getAttribute('data-ink-id'));
		const counts = {};
		for (const id of ids) counts[id] = (counts[id] || 0) + 1;
		const dupes = Object.entries(counts).filter(([, n]) => n > 1);
		const g = document.querySelector(`g.ink-item[data-ink-id="${target.id}"]`);
		return { dupes, color: g && g.querySelector('g[color]:last-of-type, g[color]') && [...g.querySelectorAll('[color]')].map(e => e.getAttribute('color')) };
	});
	assert.deepEqual(copies.dupes, [], 'every item is drawn once after edits');
	assert.ok(copies.color.includes('#3f7d3a'), 'the edited stamp shows its new colour');

	// 7. Read-only: no overlay, unlinked items take no pointer input.
	await page.evaluate(() => { ink.setReadOnly(true); });
	const ro = await page.evaluate(() => ({
		overlay: document.querySelectorAll('.ink-overlay > *').length,
		unlinkedPe: document.querySelector('[data-ink-id="route-solid"]').style.pointerEvents,
		linkedPe: document.querySelector('[data-ink-id="stamp-linked"]').style.pointerEvents.toLowerCase(),
	}));
	assert.equal(ro.overlay, 0, 'read-only draws no selection overlay');
	assert.equal(ro.unlinkedPe, 'none', 'read-only unlinked item takes no pointer input');
	assert.equal(ro.linkedPe, 'visiblepainted', 'read-only linked item stays clickable');
	await page.evaluate(() => { ink.setReadOnly(false); ink.setSelection(['stamp-door', 'route-smooth-arrow']); });

	// 8. Keep the final state for the screenshot: zoom back to 0 with the selection showing.
	await page.evaluate(() => { map.setView([350, 500], 0, { animate: false }); });
	await page.waitForTimeout(300);
	const back = await placed('stamp-door', door);
	assert.ok(Math.abs(back.dx) < 1.5 && Math.abs(back.dy) < 1.5, 'stamp centre after zooming back ' + JSON.stringify(back));
	await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 1000, height: 700 } });

	// 9. destroy removes the SVG and the layer.
	await page.evaluate(() => { ink.destroy(); ink = null; });
	const gone = await page.evaluate(() => document.querySelectorAll('.ink-svg').length);
	assert.equal(gone, 0, 'destroy removes the SVG');

	assert.deepEqual(errors, [], 'no page errors');
	console.log('screenshot', SHOT);

	// 10. Brush sheet: every brush through the real layer, then old Maplog lines beside the new brushes at two zoom levels.
	const sheet = await br.newPage({ viewport: { width: 1320, height: 900 } });
	const sheetErrors = [];
	sheet.on('pageerror', e => sheetErrors.push(e.message));
	sheet.on('console', m => { if (m.type() === 'error') sheetErrors.push(m.text()); });
	await sheet.setContent('<body style="margin:0;padding:20px 24px;background:#f4ecd8;color:#2b1d12;font:14px Georgia,serif">'
		+ '<h2 style="margin:0 0 6px">Map Ink barrier brushes (W5a)</h2>'
		+ '<div style="margin-bottom:10px">Left to right: Maplog as it was before removal, then the Map Ink brush of the same name. Zoom 1 shows every brush; zoom 2 doubles the map scale: Maplog keeps its screen-pixel geometry, Map Ink brush detail grows 2^0.4 (brushDetailFor) while the path follows the map.</div>'
		+ '<h3 style="margin:14px 0 6px">Rack, drawn by the Map Ink layer</h3>'
		+ '<div id="rack" style="width:1000px;height:1200px;position:relative"></div>'
		+ '<div id="cmp"></div></body>');
	await sheet.addStyleTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.css', 'utf8') + fs.readFileSync(path + 'styles.css', 'utf8') });
	await sheet.addScriptTag({ content: fs.readFileSync(path + 'node_modules/leaflet/dist/leaflet.js', 'utf8') });
	await sheet.addScriptTag({ content: bundle.outputFiles[0].text });
	const sheetCheck = await sheet.evaluate(() => {
		const BR = INK.BRUSHES;
		const SAMPLE = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ x: 20 + i * 27.5, y: 31 + 9 * Math.sin(i * 0.9) }));
		const COL = 260;
		const ROW = 62;
		const LINES = ['wall', 'offmap', 'bars', 'ledge', 'cliff', 'border', 'road', 'track', 'trail', 'river', 'stream'];
		const brushStyle = (b, extra) => Object.assign({
			stroke: b.defaultStyle.stroke, strokeWidth: b.defaultStyle.strokeWidth, strokeOpacity: 1,
			dash: 'solid', fill: '#000000', fillOpacity: 0, fillPattern: 'none', brush: b.id,
		}, extra || {});

		// 1. Rack: every brush as a real Map Ink path, plus a flipped cliff and a rocky-shore area outline.
		const rowTop = (i) => 20 + i * 46;
		// Leaflet's simple CRS has y pointing up, so flip rows to read top-down.
		const up = (v) => (20 + (BR.length + 2) * 46 + 20) - v;
		const items = [];
		BR.forEach((b, i) => {
			items.push({ id: 'rack-' + b.id, kind: 'path', layer: 'routes', scaleWithMap: true,
				points: SAMPLE.map(p => [up(rowTop(i) + p.y), p.x]), style: brushStyle(b) });
			items.push({ id: 'label-' + b.id, kind: 'text', layer: 'labels', scaleWithMap: false,
				at: [up(rowTop(i) + 36), 270], text: b.name + '  (' + b.id + ')', rotation: 0,
				style: { font: 'sans', size: 13, color: '#2b1d12', halo: '#f4ecd8', haloWidth: 3, align: 'start' } });
		});
		const cliff = BR.find(b => b.id === 'cliff');
		const flipTop = rowTop(BR.length);
		items.push({ id: 'rack-cliff-flip', kind: 'path', layer: 'routes', scaleWithMap: true,
			points: SAMPLE.map(p => [up(flipTop + p.y), p.x]), style: brushStyle(cliff, { brushFlip: true }) });
		items.push({ id: 'label-cliff-flip', kind: 'text', layer: 'labels', scaleWithMap: false,
			at: [up(flipTop + 36), 270], text: 'Cliff, flipped', rotation: 0, style: { font: 'sans', size: 13, color: '#2b1d12', halo: '#f4ecd8', haloWidth: 3, align: 'start' } });
		const areaTop = rowTop(BR.length + 1);
		items.push({ id: 'rack-area-rocky', kind: 'area', layer: 'terrain', scaleWithMap: true,
			points: [[up(areaTop), 20], [up(areaTop), 240], [up(areaTop + 40), 240], [up(areaTop + 40), 20]],
			style: { stroke: '#6b6258', strokeWidth: 1.5, strokeOpacity: 1, dash: 'solid', fill: '#c9a66b', fillOpacity: 0.3, fillPattern: 'none', brush: 'rocky-shore' } });
		const height = rowTop(BR.length + 2) + 20;
		const rack = document.getElementById('rack');
		rack.style.height = height + 'px';
		window.map = L.map('rack', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, attributionControl: false, zoomControl: false }).setView([height / 2, 150], 0);
		L.rectangle([[0, 0], [height, 300]], { color: '#8a7650', weight: 1, fillColor: '#e8d9b5', fillOpacity: 0.6 }).addTo(map);
		window.ink = INK.createInkLayer(L, { onItemClick: () => {} }).addTo(map);
		ink.setDoc(INK.normalizeInk({ layers: INK.defaultInkDoc().layers, items }));
		const rackNodes = {};
		for (const b of BR) {
			rackNodes[b.id] = {
				brushNodes: document.querySelectorAll(`[data-ink-id="rack-${b.id}"] .ink-brush`).length,
				pieces: document.querySelectorAll(`[data-ink-id="rack-${b.id}"] .ink-brush > *`).length,
			};
		}
		const flipHtml = document.querySelector('[data-ink-id="rack-cliff-flip"] .ink-brush')?.innerHTML || '';
		const plainHtml = document.querySelector('[data-ink-id="rack-cliff"] .ink-brush')?.innerHTML || '';
		rackNodes.areaRocky = document.querySelectorAll('[data-ink-id="rack-area-rocky"] .ink-brush > *').length;
		rackNodes.flipDiffers = flipHtml !== '' && flipHtml !== plainHtml;

		// 2. Comparison: old Maplog pieces and new brush markup for the same sample line at two zoom levels.
		const newSvg = (brushId, z) => {
			const b = BR.find(x => x.id === brushId);
			const item = { id: 'cell-' + brushId, kind: 'path', layer: 'routes', scaleWithMap: true,
				points: SAMPLE.map(p => [p.y, p.x]), style: brushStyle(b) };
			const markup = INK.buildItem(item, { project: p => ({ x: p[1], y: p[0] }), readOnly: true, idPrefix: 'sh-' + brushId + '-', brushDetail: INK.brushDetailFor(z) });
			return `<svg width="${COL * z}" height="${ROW * z}" viewBox="0 0 ${COL} ${ROW}" style="display:block;flex:none">${markup}</svg>`;
		};
		const oldSvg = (mark, z) => {
			const pts = SAMPLE.map(p => ({ x: p.x * z, y: p.y * z }));
			const markup = INK.oldPieceMarkup(INK.oldLinePieces(mark, pts), '#222222');
			return `<svg width="${COL * z}" height="${ROW * z}" viewBox="0 0 ${COL * z} ${ROW * z}" style="display:block;flex:none">${markup}</svg>`;
		};
		const none = (z) => `<div style="width:${COL * z}px;flex:none;color:#6b5a3e;font-style:italic">No Maplog line of this kind</div>`;
		const row = (label, left, right) => `<div style="display:flex;align-items:center;gap:16px;margin:0 0 8px">`
			+ `<div style="width:190px;flex:none"><b>${label.name}</b><br><span style="color:#6b5a3e;font-size:12px">${label.id}</span></div>`
			+ `${left}${right}</div>`;
		const head = (z) => `<div style="display:flex;gap:16px;margin:0 0 6px;font-size:12px;color:#6b5a3e"><div style="width:190px;flex:none"></div>`
			+ `<div style="width:${COL * z}px;flex:none">Maplog (old)</div><div style="width:${COL * z}px;flex:none">Map Ink brush</div></div>`;
		const panel = (title, z, list) => `<h3 style="margin:18px 0 6px">${title}</h3>${head(z)}`
			+ list.map(b => row(b, LINES.includes(b.id) ? oldSvg(b.id, z) : none(z), newSvg(b.id, z))).join('');
		document.getElementById('cmp').innerHTML = panel('Zoom 1: every brush', 1, BR)
			+ panel('Zoom 2: Maplog lines against their Map Ink brushes', 2, BR.filter(b => LINES.includes(b.id)));

		// 3. Every brush has a markup node in the comparison, with pieces.
		const cmpNodes = {};
		for (const b of BR) {
			const svg = newSvg(b.id, 1);
			cmpNodes[b.id] = (svg.match(new RegExp('data-brush="' + b.id + '"', 'g')) || []).length;
		}
		return { rackNodes, cmpNodes };
	});
	for (const b of Object.keys(sheetCheck.rackNodes).filter(k => !['areaRocky', 'flipDiffers'].includes(k))) {
		assert.equal(sheetCheck.rackNodes[b].brushNodes, 1, `brush ${b} drawn through the Map Ink layer`);
		assert.ok(sheetCheck.rackNodes[b].pieces > 0, `brush ${b} has pieces in the layer`);
	}
	assert.ok(sheetCheck.rackNodes.areaRocky > 0, 'area outlined with rocky-shore draws brush pieces');
	assert.ok(sheetCheck.rackNodes.flipDiffers, 'flipped cliff draws its marks on the other side');
	for (const [id, n] of Object.entries(sheetCheck.cmpNodes)) assert.equal(n, 1, `comparison draws ${id}`);
	await sheet.waitForTimeout(200);
	await sheet.screenshot({ path: SHEET, fullPage: true });
	assert.deepEqual(sheetErrors, [], 'brush sheet has no page errors');
	console.log('brush sheet', SHEET);
	await sheet.close();
	assert.deepEqual(errors, [], 'no page errors');
	console.log('PASS: Map Ink renders every kind, dash style and fill, zoom and pan keep nodes and placement.');
	await br.close();
})().catch(e => { console.error(e); process.exit(1); });
