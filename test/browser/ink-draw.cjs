// Run: node test/browser/ink-draw.cjs
// Real Leaflet (CRS.Simple) with the Map Ink store, layer and draw tools. Draws one of
// each kind with the mouse and keyboard through Playwright, and checks the document.
// A separate map click listener must hear no clicks while the tools are armed.
const path = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require(path + 'node_modules/playwright');
const esbuild = require(path + 'node_modules/esbuild');

const SHOT = '/home/user/wt/ink-w2a-draw.png';

(async () => {
	const bundle = await esbuild.build({
		stdin: {
			contents: [
				"export { createInkLayer } from './src/leaflet/ink/InkLayer';",
				"export { InkStore } from './src/leaflet/ink/InkStore';",
				"export { defaultInkDoc, normalizeInk, inkFrontmatter } from './src/leaflet/ink/model';",
				"export { StampTool } from './src/leaflet/ink/tools/stamp';",
				"export { TextTool, editTextItem } from './src/leaflet/ink/tools/text';",
				"export { PathTool, AreaTool } from './src/leaflet/ink/tools/path';",
				"export { FreehandTool } from './src/leaflet/ink/tools/freehand';",
				"export { RectTool, EllipseTool } from './src/leaflet/ink/tools/shape';",
				"export { PanTool } from './src/leaflet/ink/tools/pan';",
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

	// Map, store, layer, tools and a host that records saves.
	await page.evaluate(() => {
		window.map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4, attributionControl: false }).setView([350, 500], 0);
		L.rectangle([[0, 0], [700, 1000]], { color: '#8a7650', weight: 2, fillColor: '#e8d9b5', fillOpacity: 1 }).addTo(map);

		// A map click listener that must hear nothing while the draw tools are armed.
		window.mapClicks = 0;
		map.on('click', () => { window.mapClicks++; });

		window.saves = [];
		window.notes = [];
		const host = {
			notify: m => window.notes.push(m),
			confirm: async () => true,
			showMenu: () => undefined,
			icon: () => undefined,
			pickLocation: async () => null,
			openLocation: () => undefined,
			load: () => INK.defaultInkDoc(),
			save: async doc => { window.saves.push(JSON.parse(JSON.stringify(doc))); },
			presets: () => [],
			savePreset: () => undefined,
		};
		window.host = host;

		// The preview overlay sits over the map and takes no pointer input of its own.
		const pane = document.createElement('div');
		pane.className = 'ink-preview-pane';
		pane.setAttribute('style', 'position:absolute;left:0;top:0;width:1000px;height:700px;pointer-events:none;z-index:1000');
		map.getContainer().appendChild(pane);

		window.store = new INK.InkStore(host, INK.defaultInkDoc());
		// Seed one path with a known colour, for the eyedropper check.
		store.apply(doc => Object.assign({}, doc, { items: [{
			id: 'seed-route', kind: 'path', layer: 'routes', scaleWithMap: true,
			points: [[600, 700 - 620], [500, 700 - 720]].map(p => [p[0], p[1]]),
			style: { stroke: '#8e2c2c', strokeWidth: 3, strokeOpacity: 1, dash: 'dotted', fill: '#000000', fillOpacity: 0, fillPattern: 'none' },
		}] }));
		window.layer = INK.createInkLayer(L, {}).addTo(map);
		layer.setDoc(store.doc);
		store.on('change', () => {
			layer.setDoc(store.doc);
			layer.setSelection([...store.selection]);
		});

		window.ctx = { L, map, store, layer, host, previewPane: pane };
		window.tools = {
			stamp: new INK.StampTool(), text: new INK.TextTool(), path: new INK.PathTool(),
			area: new INK.AreaTool(), freehand: new INK.FreehandTool(), rect: new INK.RectTool(),
			ellipse: new INK.EllipseTool(), pan: new INK.PanTool(),
		};
		window.current = undefined;
		// The editor routes keys to the armed tool. This harness does the same.
		document.addEventListener('keydown', e => {
			if (window.current && current.onKey && current.onKey(e)) e.preventDefault();
		});
		window.setTool = id => {
			if (current) current.deactivate();
			store.setTool(id);
			current = tools[id];
			current.activate(ctx);
		};
	});

	// Page coordinates of a container pixel, and of a latlng.
	const box = await page.evaluate(() => {
		const r = document.getElementById('map').getBoundingClientRect();
		return { left: r.left, top: r.top };
	});
	const at = (x, y) => ({ x: box.left + x, y: box.top + y });

	const clicks = () => page.evaluate(() => window.mapClicks);
	const doc = () => page.evaluate(() => JSON.parse(JSON.stringify(store.doc)));
	const itemsOf = async kind => (await doc()).items.filter(i => i.kind === kind);

	// 1. Stamp: one click places the current symbol at the click.
	await page.evaluate(() => { setTool('stamp'); store.setCurrentSymbol('tower'); });
	let p = at(540, 460);
	await page.mouse.click(p.x, p.y);
	let stamps = await itemsOf('stamp');
	assert.equal(stamps.length, 1, 'one stamp placed');
	assert.ok(Math.abs(stamps[0].at[0] - 240) < 0.5 && Math.abs(stamps[0].at[1] - 540) < 0.5, 'stamp at the click ' + JSON.stringify(stamps[0].at));
	assert.equal(stamps[0].symbol, 'tower', 'stamp uses the current symbol');
	assert.equal(await clicks(), 0, 'stamp: map click listener heard nothing');

	// 2. Path: three clicks, then a double click finishes it. The double click's own clicks add no extra point.
	await page.evaluate(() => setTool('path'));
	for (const [x, y] of [[80, 100], [200, 200], [300, 140]]) {
		await page.mouse.click(at(x, y).x, at(x, y).y);
	}
	p = at(300, 140);
	await page.mouse.dblclick(p.x, p.y);
	let paths = await itemsOf('path');
	assert.equal(paths.length, 2, 'seed route plus one new path: ' + paths.length);
	const newPath = paths.find(i => i.id !== 'seed-route');
	assert.equal(newPath.points.length, 3, 'path has three points: ' + JSON.stringify(newPath.points));
	assert.equal(await clicks(), 0, 'path: map click listener heard nothing');

	// 3. Path: Escape cancels a draft. Enter finishes one.
	await page.evaluate(() => setTool('path'));
	await page.mouse.click(at(120, 300).x, at(120, 300).y);
	await page.mouse.click(at(220, 320).x, at(220, 320).y);
	await page.keyboard.press('Escape');
	assert.equal((await itemsOf('path')).length, 2, 'Escape cancels the path draft');
	await page.mouse.click(at(120, 300).x, at(120, 300).y);
	await page.mouse.click(at(220, 320).x, at(220, 320).y);
	await page.keyboard.press('Enter');
	assert.equal((await itemsOf('path')).length, 3, 'Enter finishes a path');

	// 4. Area: three corners and a click on the first point closes it.
	await page.evaluate(() => setTool('area'));
	for (const [x, y] of [[380, 60], [480, 60], [480, 140], [380, 140]]) {
		await page.mouse.click(at(x, y).x, at(x, y).y);
	}
	await page.mouse.click(at(380, 60).x, at(380, 60).y);
	const areas = await itemsOf('area');
	assert.equal(areas.length, 1, 'one area');
	assert.equal(areas[0].points.length, 4, 'area has four corners: ' + JSON.stringify(areas[0].points));
	assert.equal(await clicks(), 0, 'area: map click listener heard nothing');

	// 5. Freehand: drag, then the stroke is simplified and stored.
	await page.evaluate(() => setTool('freehand'));
	const stroke = [[620, 260], [630, 268], [640, 280], [660, 270], [690, 300], [720, 290], [760, 320]];
	await page.mouse.move(at(...stroke[0]).x, at(...stroke[0]).y);
	await page.mouse.down();
	for (const [x, y] of stroke.slice(1)) await page.mouse.move(at(x, y).x, at(x, y).y, { steps: 3 });
	await page.mouse.up();
	const free = await itemsOf('freehand');
	assert.equal(free.length, 1, 'one freehand stroke');
	assert.ok(free[0].points.length >= 2 && free[0].points.length <= stroke.length, 'freehand simplified: ' + free[0].points.length);
	assert.equal(await clicks(), 0, 'freehand: map click listener heard nothing');

	// 6. Rectangle: a drag.
	await page.evaluate(() => setTool('rect'));
	await page.mouse.move(at(800, 120).x, at(800, 120).y);
	await page.mouse.down();
	await page.mouse.move(at(860, 160).x, at(860, 160).y, { steps: 4 });
	await page.mouse.move(at(920, 200).x, at(920, 200).y, { steps: 4 });
	await page.mouse.up();
	const rects = await itemsOf('rect');
	assert.equal(rects.length, 1, 'one rectangle');
	const r = rects[0];
	const widthPx = await page.evaluate(([a, b]) => { const pa = map.latLngToContainerPoint(a); const pb = map.latLngToContainerPoint(b); return [Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y)]; }, [r.a, r.b]);
	assert.ok(Math.abs(widthPx[0] - 120) < 1.5 && Math.abs(widthPx[1] - 80) < 1.5, 'rectangle spans the drag ' + JSON.stringify(widthPx));

	// 7. Ellipse: Shift makes it round, so the box is square.
	await page.evaluate(() => setTool('ellipse'));
	await page.keyboard.down('Shift');
	await page.mouse.move(at(800, 260).x, at(800, 260).y);
	await page.mouse.down();
	await page.mouse.move(at(860, 300).x, at(860, 300).y, { steps: 4 });
	await page.mouse.move(at(900, 330).x, at(900, 330).y, { steps: 4 });
	await page.mouse.up();
	await page.keyboard.up('Shift');
	const ells = await itemsOf('ellipse');
	assert.equal(ells.length, 1, 'one ellipse');
	const ePx = await page.evaluate(([a, b]) => { const pa = map.latLngToContainerPoint(a); const pb = map.latLngToContainerPoint(b); return [Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y)]; }, [ells[0].a, ells[0].b]);
	assert.ok(Math.abs(ePx[0] - ePx[1]) < 1.5, 'Shift makes the ellipse round ' + JSON.stringify(ePx));
	assert.equal(await clicks(), 0, 'shapes: map click listener heard nothing');

	// 8. Tiny drags draw nothing.
	await page.evaluate(() => setTool('rect'));
	const before = (await itemsOf('rect')).length;
	await page.mouse.move(at(100, 600).x, at(100, 600).y);
	await page.mouse.down();
	await page.mouse.move(at(101, 601).x, at(101, 601).y);
	await page.mouse.up();
	assert.equal((await itemsOf('rect')).length, before, 'a tiny drag draws nothing');

	// 9. Text: click, type, Shift+Enter for a second line, Enter to commit.
	await page.evaluate(() => setTool('text'));
	p = at(560, 620);
	await page.mouse.click(p.x, p.y);
	assert.equal(await page.evaluate(() => document.querySelectorAll('.ink-text-editor').length), 1, 'text editor open');
	assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('ink-text-editor')), true, 'text editor has focus');
	await page.keyboard.type('Hello');
	await page.keyboard.press('Shift+Enter');
	await page.keyboard.type('there');
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => document.querySelectorAll('.ink-text-editor').length), 0, 'editor closed on Enter');
	let texts = await itemsOf('text');
	assert.equal(texts.length, 1, 'one text item');
	assert.equal(texts[0].text, 'Hello\nthere', 'text with a line break: ' + JSON.stringify(texts[0].text));
	assert.ok(Math.abs(texts[0].at[0] - 80) < 0.5 && Math.abs(texts[0].at[1] - 560) < 0.5, 'text anchored at the click');
	assert.equal(await clicks(), 0, 'text: map click listener heard nothing');

	// 10. Text: Escape cancels; an empty text commits nothing; blur commits.
	p = at(200, 560);
	await page.mouse.click(p.x, p.y);
	await page.keyboard.type('gone');
	await page.keyboard.press('Escape');
	assert.equal((await itemsOf('text')).length, 1, 'Escape cancels text');
	await page.mouse.click(p.x, p.y);
	await page.keyboard.press('Enter');
	assert.equal((await itemsOf('text')).length, 1, 'empty text commits nothing');
	await page.mouse.click(p.x, p.y);
	await page.keyboard.type('Blurred');
	await page.evaluate(() => document.activeElement && document.activeElement.blur());
	texts = await itemsOf('text');
	assert.equal(texts.length, 2, 'blur commits text');
	assert.equal(texts.find(t => t.text === 'Blurred') !== undefined, true, 'blurred text saved');

	// 11. Editing an existing text item reopens it, and an edit is one undo step.
	await page.evaluate(() => { const id = store.doc.items.find(i => i.kind === 'text' && i.text === 'Hello\nthere').id; INK.editTextItem(ctx, id); });
	assert.equal(await page.evaluate(() => document.querySelectorAll('.ink-text-editor').length), 1, 'editTextItem opens an editor');
	await page.keyboard.press('Control+A');
	await page.keyboard.type('Hi');
	await page.keyboard.press('Enter');
	texts = await itemsOf('text');
	assert.ok(texts.some(t => t.text === 'Hi'), 'edited text saved');
	await page.evaluate(() => store.undo());
	texts = await itemsOf('text');
	assert.ok(texts.some(t => t.text === 'Hello\nthere'), 'undo restores the edited text');

	// 12. Eyedropper: Alt-click a stamp with the path tool, which copies its colour into the path style.
	// Lines and areas cannot be hit yet (Leaflet's CSS sets pointer-events none on svg paths in a pane),
	// so the check uses a stamp, whose hit target is a rect.
	await page.evaluate(() => {
		store.apply(doc => ({ ...doc, items: doc.items.map(i => (i.kind === 'stamp' ? { ...i, color: '#b03a2e' } : i)) }));
		setTool('path');
	});
	const stampHit = await page.evaluate(() => { const r = document.querySelector('[data-ink-kind="stamp"] .ink-hit'); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
	const pathCount = (await itemsOf('path')).length;
	await page.keyboard.down('Alt');
	await page.mouse.click(stampHit.x, stampHit.y);
	await page.keyboard.up('Alt');
	assert.equal((await itemsOf('path')).length, pathCount, 'Alt-click adds no point');
	const copied = await page.evaluate(() => store.currentStyle('path'));
	assert.equal(copied.stroke, '#b03a2e', 'eyedropper copies the stamp colour into the path style: ' + copied.stroke);

	// 13. Space pans the map with any tool and draws nothing.
	await page.evaluate(() => setTool('stamp'));
	const beforeCount = (await doc()).items.length;
	const centreBefore = await page.evaluate(() => map.getCenter().lng);
	await page.keyboard.down('Space');
	p = at(400, 400);
	await page.mouse.move(p.x, p.y);
	await page.mouse.down();
	await page.mouse.move(p.x - 60, p.y, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.up('Space');
	await page.waitForTimeout(50);
	const centreAfter = await page.evaluate(() => map.getCenter().lng);
	assert.ok(centreAfter - centreBefore > 30, 'Space-drag pans the map ' + (centreAfter - centreBefore));
	assert.equal((await doc()).items.length, beforeCount, 'Space-drag draws nothing');

	// 14. Dragging the map is off while a draw tool is armed, and back on for Pan.
	const dragOff = await page.evaluate(() => map.dragging.enabled());
	assert.equal(dragOff, false, 'draw tools turn map dragging off');
	const zoomOff = await page.evaluate(() => map.doubleClickZoom.enabled());
	assert.equal(zoomOff, false, 'draw tools turn double-click zoom off');
	await page.evaluate(() => setTool('pan'));
	assert.equal(await page.evaluate(() => map.dragging.enabled()), true, 'Pan tool turns dragging on');
	assert.equal(await page.evaluate(() => map.doubleClickZoom.enabled()), true, 'Pan tool leaves double-click zoom on');
	await page.evaluate(() => setTool('stamp'));
	assert.equal(await page.evaluate(() => map.dragging.enabled()), false, 'back to a draw tool: dragging off');
	await page.evaluate(() => current.deactivate());
	assert.equal(await page.evaluate(() => map.dragging.enabled() && map.doubleClickZoom.enabled()), true, 'deactivate restores the map');

	// 14b. Snapping: the host's snapPoint, then a vertex within 10 px.
	await page.evaluate(() => { setTool('stamp'); store.setCurrentSymbol('star'); });
	const grid = await page.evaluate(() => {
		const near = (v, step) => Math.round(v / step) * step;
		const G = [near(100, 10), near(100, 10)];
		const P = [G[0] + 3, G[1] + 3];
		const G2 = [G[0] + 100, G[1] + 100];
		const toPx = ll => { const q = map.latLngToContainerPoint(ll); return { x: q.x, y: q.y }; };
		return { G, P, G2, pG: toPx(G), pP: toPx(P), pG2: toPx(G2) };
	});
	const page2 = (q) => at(q.x, q.y);
	// No host snap: a free point lands where it was clicked.
	await page.evaluate(() => { delete host.snapPoint; });
	let q = page2(grid.pP);
	// Click a whole pixel and expect the latlng of that pixel: the browser reports whole-pixel
	// pointer positions, so comparing against the fractional target made this check flaky.
	q = { x: Math.round(q.x), y: Math.round(q.y) };
	await page.mouse.click(q.x, q.y);
	const freeExpected = await page.evaluate(([x, y]) => {
		const r = map.getContainer().getBoundingClientRect();
		const ll = map.containerPointToLatLng([x - r.left, y - r.top]);
		return [ll.lat, ll.lng];
	}, [q.x, q.y]);
	const freeStamp = (await itemsOf('stamp')).pop();
	if (Math.abs(freeStamp.at[1] - freeExpected[1]) >= 0.02) console.log('stamp landed off target; items near the click:', JSON.stringify((await doc()).items.map(i => [i.id, i.kind, i.at || i.a || (i.points || []).filter(pt => Math.abs(pt[0] - 103) < 15 && Math.abs(pt[1] - 103) < 15)]).filter(x => x[2] && (x[2].length === undefined || x[2].length))), JSON.stringify(q));
	assert.ok(Math.abs(freeStamp.at[0] - freeExpected[0]) < 0.02 && Math.abs(freeStamp.at[1] - freeExpected[1]) < 0.02, 'without snapping the stamp is where it was clicked ' + JSON.stringify([freeStamp.at, freeExpected]));
	// Host grid snap on: the click lands on the grid point 4 px away, and the free point is 4 px from the grid point, so the vertex snap moves it onto the free point.
	await page.evaluate(() => { host.snapPoint = ll => [Math.round(ll[0] / 10) * 10, Math.round(ll[1] / 10) * 10]; });
	q = page2(grid.pG);
	await page.mouse.click(q.x, q.y);
	const vertexSnapped = (await itemsOf('stamp')).pop();
	assert.ok(Math.abs(vertexSnapped.at[0] - freeStamp.at[0]) < 0.01 && Math.abs(vertexSnapped.at[1] - freeStamp.at[1]) < 0.01, 'a vertex within 10 px wins over the grid: ' + JSON.stringify(vertexSnapped.at));
	// Grid snap alone, far from any vertex.
	q = page2(grid.pG2);
	await page.mouse.click(q.x, q.y);
	const gridSnapped = (await itemsOf('stamp')).pop();
	assert.ok(Math.abs(gridSnapped.at[0] - grid.G2[0]) < 0.01 && Math.abs(gridSnapped.at[1] - grid.G2[1]) < 0.01, 'grid snap applies with no vertex nearby: ' + JSON.stringify(gridSnapped.at));
	await page.evaluate(() => { delete host.snapPoint; });

	// 15. Saves and the saved frontmatter.
	await page.evaluate(() => store.flush());
	const saved = await page.evaluate(() => window.saves.length);
	assert.ok(saved > 0, 'the document was saved');
	const fm = await page.evaluate(() => {
		const f = INK.inkFrontmatter(store.doc);
		const back = INK.normalizeInk(f);
		return { kinds: back.items.map(i => i.kind), count: back.items.length, lastSaveCount: window.saves[window.saves.length - 1].items.length };
	});
	assert.equal(fm.count, (await doc()).items.length, 'frontmatter reads back to the same item count');
	assert.equal(fm.lastSaveCount, (await doc()).items.length, 'the last save holds every item');
	for (const kind of ['stamp', 'text', 'path', 'freehand', 'area', 'rect', 'ellipse']) {
		assert.ok(fm.kinds.includes(kind), 'frontmatter has a ' + kind + ': ' + JSON.stringify(fm.kinds));
	}
	assert.deepEqual(await page.evaluate(() => window.notes), [], 'no save errors reported');

	await page.evaluate(() => { layer.setSelection(store.doc.items.map(i => i.id).slice(-3)); });
	await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 1000, height: 700 } });

	assert.deepEqual(errors, [], 'no page errors');
	console.log('items drawn', JSON.stringify(fm.kinds));
	console.log('screenshot', SHOT);
	console.log('PASS: Map Ink draw tools place every kind, the map hears no clicks, and the document saves.');
	await br.close();
})().catch(e => { console.error(e); process.exit(1); });
