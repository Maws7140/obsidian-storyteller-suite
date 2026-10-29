/**
 * Legend for Map Ink: a toggle button at the bottom right of the map that opens a
 * panel listing what the map uses. Stamps are grouped by symbol and colour. Lines
 * and areas are grouped by the preset whose style they match, or as "Custom" when
 * none matches. Items on hidden layers are skipped.
 *
 * Read-only: the legend needs only the document and the host, so embedded maps
 * can show it without a store. It stops click and wheel events at its own
 * element, so the map underneath does not react to them.
 *
 * Plain DOM. Elements come from the container's ownerDocument. The toggle icon
 * comes from host.icon (Lucide name). Symbol swatches use symbolSvg.
 */
import type { InkHost } from './host';
import type { InkArea, InkBox, InkDoc, InkItem, InkPath, InkStyle } from './model';
import { isValidColor } from './model';
import { PRESETS } from './styles';
import type { InkPreset } from './styles';
import { getSymbol, symbolSvg } from './symbols';
import { brushPreviewSvg, getBrush } from './brushes';
import { makeEl } from './ui/ColorPicker';

export interface InkLegendOptions {
	/** Toggle label and panel heading. Defaults to "Legend". */
	title?: string;
}

type Section = 'symbols' | 'lines' | 'areas';

interface LegendEntry {
	section: Section;
	name: string;
	count: number;
	/** Markup for the swatch. Built only from validated values and the symbol library. */
	swatch: string;
	/** Used to merge items that share a row. */
	key: string;
}

const SECTION_TITLES: Record<Section, string> = {
	symbols: 'Symbols',
	lines: 'Lines',
	areas: 'Areas',
};

const DEFAULT_STROKE = '#2b2b2b';
const DEFAULT_FILL = '#c9a66b';
const SYMBOL_SIZE = 20;
const SYMBOL_STROKE = 1.75;
const EMPTY_TEXT = 'Nothing drawn yet.';

/** Ids for clip paths in area swatches. Each swatch needs its own id on the page. */
let clipCounter = 0;

type StyledItem = InkPath | InkArea | InkBox;

function hasStyle(item: InkItem): item is StyledItem {
	return item.kind !== 'stamp' && item.kind !== 'text';
}

function num(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function colour(value: string | undefined, fallback: string): string {
	return typeof value === 'string' && isValidColor(value) ? value : fallback;
}

/** Items that are drawn: their layer and the item itself are not hidden. */
function visibleItems(doc: InkDoc): InkItem[] {
	const hiddenLayers = new Set(doc.layers.filter(l => !l.visible).map(l => l.id));
	return doc.items.filter(item => !item.hidden && !hiddenLayers.has(item.layer));
}

/** The preset whose style fields all equal the item's style. The most specific match wins. */
function matchPreset(item: StyledItem, presets: readonly InkPreset[]): InkPreset | undefined {
	const fit = item.kind === 'path' || item.kind === 'freehand' ? 'path' : 'area';
	let best: InkPreset | undefined;
	let bestSize = -1;
	for (const preset of presets) {
		const style = preset.style;
		if (preset.fits !== fit || !style) continue;
		const keys = Object.keys(style) as Array<keyof InkStyle>;
		const matches = keys.every(key => style[key] === undefined || style[key] === item.style[key]);
		if (matches && keys.length > bestSize) {
			best = preset;
			bestSize = keys.length;
		}
	}
	return best;
}

function svgOpen(width: number, height: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">`;
}

/** A line sample: the stroke width, colour and dash style of a path. */
function lineSwatch(style: InkStyle): string {
	const stroke = colour(style.stroke, DEFAULT_STROKE);
	const width = num(style.strokeWidth, 0.5, 6, 2);
	const base = `fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;
	const line = (y: number, w: number, extra = ''): string =>
		`<path d="M2 ${y} H34" stroke-width="${w}" ${base}${extra}/>`;
	let body: string;
	switch (style.dash) {
		case 'dashed':
			body = line(7, width, ' stroke-dasharray="6 4"');
			break;
		case 'dotted':
			body = line(7, width, ' stroke-dasharray="0.1 4.5"');
			break;
		case 'double':
			body = line(5, 1, '') + line(9, 1, '');
			break;
		case 'wavy':
			body = `<path d="M2 7 q4 -4 8 0 t8 0 t8 0 t8 0" stroke-width="${width}" ${base}/>`;
			break;
		case 'ticked':
			body = line(7, width)
				+ `<path d="M6 3 V11 M12 3 V11 M18 3 V11 M24 3 V11 M30 3 V11" stroke-width="1" ${base}/>`;
			break;
		case 'railway':
			body = line(7, 1)
				+ `<path d="M2 7 H34" stroke-width="${Math.max(2, width)}" stroke-dasharray="1.5 2.5" ${base}/>`;
			break;
		default:
			body = line(7, width);
	}
	return `${svgOpen(36, 14)}${body}</svg>`;
}

function hatchMarkup(colourValue: string, cross: boolean): string {
	const paths: string[] = [];
	for (let x = -16; x <= 28; x += 4) {
		paths.push(`M${x} 17 L${x + 16} 1`);
		if (cross) paths.push(`M${x} 1 L${x + 16} 17`);
	}
	return `<path d="${paths.join(' ')}" fill="none" stroke="${colourValue}" stroke-width="0.9" stroke-opacity="0.8"/>`;
}

function dotsMarkup(colourValue: string): string {
	const dots: string[] = [];
	for (let x = 4; x <= 24; x += 5) {
		for (let y = 4; y <= 14; y += 5) dots.push(`<circle cx="${x}" cy="${y}" r="0.9"/>`);
	}
	return `<g fill="${colourValue}">${dots.join('')}</g>`;
}

/** A brush sample: the brush's line in the item's colour. */
function brushSwatch(brushId: string, style: InkStyle): string {
	return brushPreviewSvg(brushId, { width: 36, height: 14, color: colour(style.stroke, DEFAULT_STROKE) });
}

/** A small repeated glyph: three copies, the symbol's body in the pattern colour. */
function symbolPatternMarkup(symbolId: string, colourValue: string): string {
	const symbol = getSymbol(symbolId);
	if (!symbol) return '';
	const copies = [[3, 1], [14, 1], [8, 8]];
	return copies.map(([x, y]) =>
		`<g transform="translate(${x} ${y}) scale(0.45)" fill="none" stroke="${colourValue}" color="${colourValue}"`
		+ ` stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${symbol.body}</g>`,
	).join('');
}

/** An area sample: a filled square with its stroke, and a hint of the fill pattern. */
function areaSwatch(style: InkStyle): string {
	const stroke = colour(style.stroke, DEFAULT_STROKE);
	const fill = colour(style.fill, DEFAULT_FILL);
	const fillOpacity = num(style.fillOpacity, 0, 1, 0);
	const patternColour = colour(style.patternColor, stroke);
	const clipId = `ink-legend-clip-${++clipCounter}`;
	const rect = 'x="1" y="1" width="26" height="16" rx="2"';

	let hint = '';
	const pattern = style.fillPattern;
	if (pattern === 'hatch') hint = hatchMarkup(patternColour, false);
	else if (pattern === 'crosshatch') hint = hatchMarkup(patternColour, true);
	else if (pattern === 'dots') hint = dotsMarkup(patternColour);
	else if (typeof pattern === 'string' && pattern.startsWith('symbol:')) {
		hint = symbolPatternMarkup(pattern.slice('symbol:'.length), patternColour);
	}

	return svgOpen(28, 18)
		+ `<defs><clipPath id="${clipId}"><rect ${rect}/></clipPath></defs>`
		+ `<rect ${rect} fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="1.25"/>`
		+ `<g clip-path="url(#${clipId})">${hint}</g>`
		+ '</svg>';
}

/** Groups what the map uses into legend rows, in display order within each section. */
export function legendEntries(doc: InkDoc, presets: readonly InkPreset[]): LegendEntry[] {
	const symbols = new Map<string, LegendEntry>();
	const lines = new Map<string, LegendEntry>();
	const areas = new Map<string, LegendEntry>();

	for (const item of visibleItems(doc)) {
		if (item.kind === 'stamp') {
			const symbol = getSymbol(item.symbol);
			if (!symbol) continue;
			const color = colour(item.color, DEFAULT_STROKE);
			const key = `${symbol.id}|${color}`;
			const existing = symbols.get(key);
			if (existing) {
				existing.count++;
			} else {
				symbols.set(key, {
					section: 'symbols',
					key,
					name: symbol.name,
					count: 1,
					swatch: symbolSvg(symbol.id, { color, size: SYMBOL_SIZE, strokeWidth: SYMBOL_STROKE }),
				});
			}
			continue;
		}
		if (!hasStyle(item)) continue;

		const isLine = item.kind === 'path' || item.kind === 'freehand';
		// A line with a brush is named for the brush, whatever preset its style came from.
		const brush = isLine && item.style.brush !== undefined ? getBrush(item.style.brush) : undefined;
		if (brush) {
			const color = colour(item.style.stroke, DEFAULT_STROKE);
			const key = `brush:${brush.id}|${color}`;
			const existing = lines.get(key);
			if (existing) {
				existing.count++;
			} else {
				lines.set(key, {
					section: 'lines',
					key,
					name: brush.name,
					count: 1,
					swatch: brushSwatch(brush.id, item.style),
				});
			}
			continue;
		}
		const preset = matchPreset(item, presets);
		const groups = isLine ? lines : areas;
		const key = preset ? `preset:${preset.id}` : `custom:${JSON.stringify(item.style)}`;
		const existing = groups.get(key);
		if (existing) {
			existing.count++;
			continue;
		}
		groups.set(key, {
			section: isLine ? 'lines' : 'areas',
			key,
			name: preset ? preset.name : (isLine ? 'Custom line' : 'Custom area'),
			count: 1,
			swatch: isLine ? lineSwatch(item.style) : areaSwatch(item.style),
		});
	}

	const byName = (a: LegendEntry, b: LegendEntry): number =>
		a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
	return [
		...Array.from(symbols.values()).sort(byName),
		...Array.from(lines.values()).sort(byName),
		...Array.from(areas.values()).sort(byName),
	];
}

export class InkLegend {
	private readonly doc: Document;
	private readonly host: InkHost;
	private readonly root: HTMLElement;
	private readonly panel: HTMLElement;
	private readonly body: HTMLElement;
	private readonly toggle: HTMLButtonElement;
	private current: InkDoc | null = null;
	private open = false;
	private destroyed = false;

	private readonly onOutsidePointer = (event: Event): void => {
		const target = event.target as Node | null;
		if (target && this.root.contains(target)) return;
		this.setOpen(false);
	};

	constructor(container: HTMLElement, host: InkHost, opts: InkLegendOptions = {}) {
		this.doc = container.ownerDocument;
		this.host = host;
		const title = opts.title ?? 'Legend';

		this.root = makeEl(this.doc, 'div', 'ink-legend');

		this.panel = makeEl(this.doc, 'div', 'ink-legend-panel', { role: 'dialog', 'aria-label': title });
		this.panel.hidden = true;
		const heading = makeEl(this.doc, 'div', 'ink-legend-title');
		heading.textContent = title;
		this.body = makeEl(this.doc, 'div', 'ink-legend-body');
		this.panel.appendChild(heading);
		this.panel.appendChild(this.body);
		this.panel.addEventListener('keydown', event => {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			this.setOpen(false);
			this.toggle.focus();
		});

		this.toggle = makeEl(this.doc, 'button', 'ink-legend-toggle', {
			type: 'button',
			'aria-expanded': 'false',
			'aria-label': title,
		});
		const slot = makeEl(this.doc, 'span', 'ink-icon');
		this.toggle.appendChild(slot);
		this.host.icon(slot, 'list');
		const label = makeEl(this.doc, 'span', 'ink-legend-toggle-label');
		label.textContent = title;
		this.toggle.appendChild(label);
		this.toggle.addEventListener('click', () => this.setOpen(!this.open));

		this.root.appendChild(this.panel);
		this.root.appendChild(this.toggle);
		container.appendChild(this.root);

		// The map must not pan, zoom or place items when the legend is used.
		for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown', 'wheel']) {
			this.root.addEventListener(type, event => event.stopPropagation());
		}

		this.doc.addEventListener('pointerdown', this.onOutsidePointer);
		this.render();
	}

	/** Shows what `doc` uses. Call again whenever the document changes. */
	setDoc(doc: InkDoc): void {
		if (this.destroyed) return;
		this.current = doc;
		this.render();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.doc.removeEventListener('pointerdown', this.onOutsidePointer);
		this.root.remove();
		this.current = null;
	}

	private setOpen(open: boolean): void {
		this.open = open;
		this.panel.hidden = !open;
		this.toggle.setAttribute('aria-expanded', String(open));
	}

	private render(): void {
		this.body.replaceChildren();
		const entries = this.current ? legendEntries(this.current, this.presets()) : [];
		if (entries.length === 0) {
			const empty = makeEl(this.doc, 'p', 'ink-legend-empty');
			empty.textContent = EMPTY_TEXT;
			this.body.appendChild(empty);
			return;
		}
		for (const section of ['symbols', 'lines', 'areas'] as Section[]) {
			const rows = entries.filter(e => e.section === section);
			if (rows.length === 0) continue;
			const heading = makeEl(this.doc, 'div', 'ink-legend-heading');
			heading.textContent = SECTION_TITLES[section];
			const list = makeEl(this.doc, 'ul', 'ink-legend-list', { 'aria-label': SECTION_TITLES[section] });
			for (const entry of rows) list.appendChild(this.buildRow(entry));
			this.body.appendChild(heading);
			this.body.appendChild(list);
		}
	}

	private buildRow(entry: LegendEntry): HTMLElement {
		const row = makeEl(this.doc, 'li', 'ink-legend-row');
		const swatch = makeEl(this.doc, 'span', `ink-legend-swatch ink-legend-swatch-${entry.section}`);
		swatch.innerHTML = entry.swatch;
		const name = makeEl(this.doc, 'span', 'ink-legend-name');
		name.textContent = entry.name;
		row.appendChild(swatch);
		row.appendChild(name);
		if (entry.count > 1) {
			const count = makeEl(this.doc, 'span', 'ink-legend-count', { 'aria-label': `${entry.count} used` });
			count.textContent = `×${entry.count}`;
			row.appendChild(count);
		}
		return row;
	}

	private presets(): InkPreset[] {
		return [...PRESETS, ...this.host.presets()];
	}
}
