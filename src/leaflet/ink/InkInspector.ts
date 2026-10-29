/**
 * Inspector: the right-side panel for Map Ink. It shows the sections that fit
 * the selection, or the current tool's defaults when nothing is selected.
 *
 * Sections are rebuilt only when the selection, tool, layers or preset list
 * change. Other store changes update the existing controls in place, so a
 * slider being dragged is never replaced under the pointer.
 *
 * Plain DOM. Icons come from host.icon (Lucide names).
 */
import type { InkHost } from './host';
import type {
	FillPattern,
	InkArea,
	InkBox,
	InkItem,
	InkKind,
	InkPath,
	InkStamp,
	InkStyle,
	InkText,
	InkTextStyle,
} from './model';
import { PRESETS, withPatch } from './styles';
import type { InkPreset, InkPresetFit } from './styles';
import type { InkStoreLike, InkToolId } from './storeTypes';
import { SYMBOLS, SYMBOL_CATEGORIES } from './symbols';
import { brushesByCategory, getBrush } from './brushes';
import { ColorPicker, makeEl, setValueIfIdle } from './ui/ColorPicker';
import { StrokeStylePicker, WIDTH_RANGE } from './ui/StrokeStylePicker';

const ALL_KINDS: InkKind[] = ['stamp', 'text', 'path', 'freehand', 'area', 'rect', 'ellipse'];
const STYLE_KINDS: InkKind[] = ['path', 'freehand', 'area', 'rect', 'ellipse'];
const FILL_KINDS: InkKind[] = ['area', 'rect', 'ellipse'];
const SMOOTH_KINDS: InkKind[] = ['path', 'freehand', 'area'];
const ARROW_KINDS: InkKind[] = ['path', 'freehand'];

const FONT_OPTIONS: ReadonlyArray<{ value: string; name: string }> = [
	{ value: 'serif', name: 'Serif' },
	{ value: 'sans', name: 'Sans serif' },
	{ value: 'hand', name: 'Handwritten' },
	{ value: 'mono', name: 'Monospace' },
];

const ALIGN_OPTIONS: ReadonlyArray<{ value: string; name: string }> = [
	{ value: 'start', name: 'Left' },
	{ value: 'middle', name: 'Centre' },
	{ value: 'end', name: 'Right' },
];

/** Fill patterns: the basic set, then one symbol pattern per nature symbol. */
const FILL_PATTERN_OPTIONS: ReadonlyArray<{ value: string; name: string }> = [
	{ value: 'none', name: 'None' },
	{ value: 'solid', name: 'Solid' },
	{ value: 'hatch', name: 'Hatching' },
	{ value: 'crosshatch', name: 'Cross hatching' },
	{ value: 'dots', name: 'Dots' },
	...SYMBOLS.filter(symbol => symbol.category === 'nature').map(symbol => ({
		value: `symbol:${symbol.id}`,
		name: `${symbol.name} pattern`,
	})),
];

/**
 * Collapsed state of sections and groups, kept for the session. Keys are a section
 * title, or "Section / Group". Anything not listed here starts expanded.
 */
const collapsedMemo = new Map<string, boolean>();
const COLLAPSED_BY_DEFAULT = new Set<string>(['Arrange', 'Link', 'Presets', 'Text / Spacing']);

const STAMP_SIZE = { min: 4, max: 400, step: 1 };
const ANGLE = { min: -360, max: 360, step: 1 };
const WIDTH = { min: 0, max: 20, step: 0.5 };
/** Brush scale: spacing and tick size multiplier. 1 is the brush as designed. */
const BRUSH_SCALE = { min: 0.5, max: 3, step: 0.1 };

/** The value every selected item shares, or undefined when they differ or there are none. */
function shared<T>(values: readonly T[]): T | undefined {
	if (values.length === 0) return undefined;
	const first = values[0];
	return values.every(v => v === first) ? first : undefined;
}

function hasStyle(item: InkItem): item is InkPath | InkArea | InkBox {
	return item.kind !== 'stamp' && item.kind !== 'text';
}

function toolKind(tool: InkToolId): InkKind | undefined {
	switch (tool) {
		case 'path': return 'path';
		case 'freehand': return 'freehand';
		case 'area': return 'area';
		case 'rect': return 'rect';
		case 'ellipse': return 'ellipse';
		case 'text': return 'text';
		case 'stamp': return 'stamp';
		default: return undefined;
	}
}

function fitOf(kind: InkKind): InkPresetFit | undefined {
	switch (kind) {
		case 'path':
		case 'freehand': return 'path';
		case 'area':
		case 'rect':
		case 'ellipse': return 'area';
		case 'text': return 'text';
		case 'stamp': return 'stamp';
		default: return undefined;
	}
}

function singleFit(items: readonly InkItem[]): InkPresetFit | undefined {
	const fits = new Set<InkPresetFit>();
	for (const item of items) {
		const fit = fitOf(item.kind);
		if (fit) fits.add(fit);
	}
	return fits.size === 1 ? Array.from(fits)[0] : undefined;
}

function patchStyle(item: InkItem, patch: Partial<InkStyle>): InkItem {
	if (!hasStyle(item)) return item;
	return { ...item, style: withPatch(item.style, patch) };
}

function withFlag(item: InkItem, key: 'locked' | 'hidden', on: boolean): InkItem {
	const copy: InkItem = { ...item };
	if (on) copy[key] = true;
	else delete copy[key];
	return copy;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function text(value: number | undefined): string {
	return value === undefined ? '' : String(value);
}

interface Range { min: number; max: number; step: number }

export class InkInspector {
	readonly el: HTMLElement;
	private readonly doc: Document;
	private readonly store: InkStoreLike;
	private readonly host: InkHost;
	private readonly body: HTMLElement;
	private readonly unsubscribe: () => void;
	private lastSignature = '';
	private fields: Array<() => void> = [];
	private disposers: Array<() => void> = [];

	constructor(parent: HTMLElement, store: InkStoreLike, host: InkHost) {
		this.doc = parent.ownerDocument;
		this.store = store;
		this.host = host;
		this.el = makeEl(this.doc, 'aside', 'ink-inspector', {
			role: 'complementary',
			'aria-label': 'Map Ink inspector',
		});
		this.body = makeEl(this.doc, 'div', 'ink-inspector-body');
		this.el.appendChild(this.body);
		parent.appendChild(this.el);
		this.unsubscribe = this.store.on('change', () => this.refresh());
		this.refresh(true);
	}

	/**
	 * Re-reads the store. Rebuilds the sections when the layout inputs changed
	 * (or when `force` is set), otherwise only syncs the values.
	 */
	refresh(force = false): void {
		const signature = this.signature();
		if (force || signature !== this.lastSignature) {
			this.lastSignature = signature;
			this.build();
		}
		for (const sync of this.fields) sync();
	}

	destroy(): void {
		this.unsubscribe();
		this.clear();
		this.el.remove();
	}

	// ---- building ------------------------------------------------------------

	private signature(): string {
		return JSON.stringify([
			this.store.tool,
			this.selectedItems().map(item => `${item.id}:${item.kind}`),
			this.store.doc.layers.map(layer => `${layer.id}=${layer.name}`),
			this.host.presets().map(p => p.id),
		]);
	}

	private clear(): void {
		for (const dispose of this.disposers) dispose();
		this.disposers = [];
		this.fields = [];
		this.body.replaceChildren();
	}

	private build(): void {
		this.clear();
		const doc = this.doc;
		const items = this.selectedItems();
		const kinds = this.activeKinds();

		const summary = makeEl(doc, 'p', 'ink-summary', { role: 'status', 'aria-live': 'polite' });
		this.body.appendChild(summary);
		this.fields.push(() => {
			const n = this.selectedItems().length;
			summary.textContent = n === 0 ? 'Settings for new items' : n === 1 ? '1 item selected' : `${n} items selected`;
		});

		if (kinds.length === 0) {
			const hint = makeEl(doc, 'p', 'ink-hint');
			hint.textContent = 'Select an item on the map to see its settings. Shift-click to add more.';
			this.body.appendChild(hint);
			return;
		}

		if (kinds.some(k => STYLE_KINDS.includes(k))) this.strokeSection();
		if (kinds.some(k => FILL_KINDS.includes(k))) this.fillSection();
		if (kinds.includes('text')) this.textSection();
		if (kinds.includes('stamp')) this.stampSection();
		if (items.length > 0) {
			this.arrangeSection();
			this.linkSection();
			this.presetSection(items);
		}
	}

	/** A section: a header that folds its body. Returns the body the controls go in. */
	private section(title: string): HTMLElement {
		const root = makeEl(this.doc, 'section', 'ink-section', { 'aria-label': title });
		this.body.appendChild(root);
		return this.fold(root, title, title, 'ink-section-head', 'h3', 'ink-section-title');
	}

	/** A small folding group inside a section, for the less used controls. */
	private group(parent: HTMLElement, sectionTitle: string, title: string): HTMLElement {
		const root = makeEl(this.doc, 'div', 'ink-group');
		parent.appendChild(root);
		return this.fold(root, `${sectionTitle} / ${title}`, title, 'ink-group-head', 'h4', 'ink-group-title');
	}

	/**
	 * Adds a header with a fold button to `root` and a body under it. The fold state
	 * is read from the session memory and written back on each click.
	 */
	private fold(root: HTMLElement, key: string, title: string, headClass: string, headTag: 'h3' | 'h4', titleClass: string): HTMLElement {
		const doc = this.doc;
		const head = makeEl(doc, 'div', headClass);
		const heading = makeEl(doc, headTag, titleClass);
		heading.textContent = title;
		const toggle = makeEl(doc, 'button', 'ink-fold', { type: 'button' });
		const slot = makeEl(doc, 'span', 'ink-icon');
		toggle.appendChild(slot);
		this.host.icon(slot, 'chevron-down');
		head.appendChild(heading);
		head.appendChild(toggle);
		const body = makeEl(doc, 'div', 'ink-fold-body');
		root.appendChild(head);
		root.appendChild(body);

		let collapsed = collapsedMemo.get(key) ?? COLLAPSED_BY_DEFAULT.has(key);
		const apply = (): void => {
			root.classList.toggle('ink-folded', collapsed);
			body.hidden = collapsed;
			toggle.setAttribute('aria-expanded', String(!collapsed));
			toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
		};
		apply();
		// The fold button sits inside the head, so one listener on the head covers mouse and keyboard.
		head.addEventListener('click', () => {
			collapsed = !collapsed;
			collapsedMemo.set(key, collapsed);
			apply();
		});
		return body;
	}

	/** A labelled row. `visible` decides on each sync whether the row shows. */
	private row(parent: HTMLElement, label: string, visible?: () => boolean): HTMLElement {
		const row = makeEl(this.doc, 'div', 'ink-row');
		const name = makeEl(this.doc, 'span', 'ink-label');
		name.textContent = label;
		row.appendChild(name);
		parent.appendChild(row);
		if (visible) this.fields.push(() => { row.hidden = !visible(); });
		return row;
	}

	/** A colour chip with its popover, placed in `row` (which may hold other controls). */
	private colour(
		row: HTMLElement,
		label: string,
		opts: { allowNone?: boolean; showOpacity?: boolean },
		read: () => { color: string | null; opacity: number | null },
		write: (colour: string | null, opacity: number | null) => void,
	): void {
		const initial = read();
		const picker = new ColorPicker(row, {
			label,
			color: initial.color,
			opacity: initial.opacity,
			recent: this.store.recentColors(),
			allowNone: opts.allowNone,
			showOpacity: opts.showOpacity,
			onChange: write,
		});
		this.disposers.push(() => picker.destroy());
		this.fields.push(() => picker.update({ ...read(), recent: this.store.recentColors() }));
	}

	private check(
		parent: HTMLElement,
		label: string,
		read: () => boolean | undefined,
		write: (on: boolean) => void,
		visible?: () => boolean,
		caption?: string,
	): HTMLInputElement {
		const wrap = makeEl(this.doc, 'label', 'ink-check');
		const input = makeEl(this.doc, 'input', undefined, { type: 'checkbox', 'aria-label': label });
		const name = makeEl(this.doc, 'span');
		name.textContent = caption ?? label;
		wrap.appendChild(input);
		wrap.appendChild(name);
		parent.appendChild(wrap);
		input.addEventListener('change', () => write(input.checked));
		this.fields.push(() => {
			const value = read();
			input.checked = value === true;
			input.indeterminate = value === undefined;
		});
		if (visible) this.fields.push(() => { wrap.hidden = !visible(); });
		return input;
	}

	private number(
		parent: HTMLElement,
		label: string,
		range: Range,
		read: () => number | undefined,
		write: (value: number) => void,
	): HTMLInputElement {
		const input = makeEl(this.doc, 'input', 'ink-input ink-number', {
			type: 'number',
			'aria-label': label,
			min: String(range.min),
			max: String(range.max),
			step: String(range.step),
		});
		input.addEventListener('input', () => {
			if (input.value.trim() === '') return;
			const value = Number(input.value);
			if (Number.isFinite(value)) write(clamp(value, range.min, range.max));
		});
		parent.appendChild(input);
		this.fields.push(() => setValueIfIdle(input, text(read())));
		return input;
	}

	private slider(
		parent: HTMLElement,
		label: string,
		range: Range,
		read: () => number | undefined,
		write: (value: number) => void,
	): void {
		const wrap = makeEl(this.doc, 'div', 'ink-slider');
		const input = makeEl(this.doc, 'input', 'ink-range', {
			type: 'range',
			min: String(range.min),
			max: String(range.max),
			step: String(range.step),
			'aria-label': label,
		});
		const out = makeEl(this.doc, 'span', 'ink-range-value');
		wrap.appendChild(input);
		wrap.appendChild(out);
		parent.appendChild(wrap);
		input.addEventListener('input', () => {
			const value = Number(input.value);
			out.textContent = String(value);
			write(value);
		});
		this.fields.push(() => {
			const value = read();
			input.value = String(value ?? range.min);
			out.textContent = value === undefined ? 'Mixed' : String(value);
		});
	}

	private select(
		parent: HTMLElement,
		label: string,
		options: ReadonlyArray<{ value: string; name: string }>,
		read: () => string | undefined,
		write: (value: string) => void,
	): HTMLSelectElement {
		const doc = this.doc;
		const select = makeEl(doc, 'select', 'ink-input ink-select', { 'aria-label': label });
		const mixed = makeEl(doc, 'option', undefined, { value: '', disabled: 'true' });
		mixed.textContent = 'Mixed';
		select.appendChild(mixed);
		for (const option of options) {
			const el = makeEl(doc, 'option', undefined, { value: option.value });
			el.textContent = option.name;
			select.appendChild(el);
		}
		select.addEventListener('change', () => {
			if (select.value !== '') write(select.value);
		});
		parent.appendChild(select);
		this.fields.push(() => setValueIfIdle(select, read() ?? ''));
		return select;
	}

	private button(label: string, icon: string | undefined, onClick: () => void | Promise<void>): HTMLButtonElement {
		const btn = makeEl(this.doc, 'button', 'ink-btn', { type: 'button' });
		if (icon) {
			const slot = makeEl(this.doc, 'span', 'ink-icon');
			btn.appendChild(slot);
			this.host.icon(slot, icon);
		}
		const name = makeEl(this.doc, 'span');
		name.textContent = label;
		btn.appendChild(name);
		btn.addEventListener('click', () => { void onClick(); });
		return btn;
	}

	/**
	 * A compact icon toggle. `read` gives true, false, or undefined for a mixed
	 * selection. The button announces its state with aria-pressed.
	 */
	private toggle(
		parent: HTMLElement,
		label: string,
		icon: string,
		read: () => boolean | undefined,
		write: (on: boolean) => void,
	): HTMLButtonElement {
		const btn = makeEl(this.doc, 'button', 'ink-toggle', { type: 'button', 'aria-label': label, title: label });
		const slot = makeEl(this.doc, 'span', 'ink-icon');
		btn.appendChild(slot);
		this.host.icon(slot, icon);
		btn.addEventListener('click', () => write(btn.getAttribute('aria-pressed') !== 'true'));
		parent.appendChild(btn);
		this.fields.push(() => {
			const value = read();
			btn.setAttribute('aria-pressed', value === undefined ? 'mixed' : String(value));
			btn.classList.toggle('ink-toggle-mixed', value === undefined);
		});
		return btn;
	}

	private hint(parent: HTMLElement, message: string, visible?: () => boolean): HTMLElement {
		const p = makeEl(this.doc, 'p', 'ink-hint');
		p.textContent = message;
		parent.appendChild(p);
		if (visible) this.fields.push(() => { p.hidden = !visible(); });
		return p;
	}

	// ---- sections ------------------------------------------------------------

	private strokeSection(): void {
		const sec = this.section('Stroke');
		const styled = () => this.activeKinds().some(k => STYLE_KINDS.includes(k));

		// Colour and width share one row. The colour popover keeps the opacity slider.
		const strokeRow = this.row(sec, 'Stroke', styled);
		this.colour(strokeRow, 'Stroke colour', { showOpacity: true }, () => ({
			color: this.styleShared('stroke') ?? null,
			opacity: this.styleShared('strokeOpacity') ?? null,
		}), (colour, opacity) => {
			if (colour !== null) this.writeStyle({ stroke: colour }, 'stroke-colour');
			if (opacity !== null) this.writeStyle({ strokeOpacity: opacity }, 'stroke-opacity');
		});
		this.slider(strokeRow, 'Stroke width', WIDTH_RANGE,
			() => this.styleShared('strokeWidth'),
			value => this.writeStyle({ strokeWidth: value }, 'stroke-width'));

		const lineRow = this.row(sec, 'Dash', styled);
		const line = new StrokeStylePicker(lineRow, {
			dash: this.styleShared('dash') ?? null,
			width: null,
			label: 'Stroke',
			showWidth: false,
			onDashChange: dash => this.writeStyle({ dash }),
		});
		this.disposers.push(() => line.destroy());
		this.fields.push(() => line.update(this.styleShared('dash') ?? null, null));
		this.fields.push(() => line.setDisabled(this.anyBrush()));
		this.hint(sec, 'Brush replaces the dash style', () => this.anyBrush());

		this.brushSelect(this.row(sec, 'Brush', styled), 'Brush');
		this.check(sec, 'Flip side',
			() => this.styleFlag('brushFlip', STYLE_KINDS),
			on => this.writeStyle({ brushFlip: on }, undefined, STYLE_KINDS),
			() => this.allOneSidedBrush());
		this.slider(this.row(sec, 'Brush scale', () => this.anyBrush()), 'Brush scale', BRUSH_SCALE,
			() => shared(this.styleEntries().map(e => e.style.brushScale ?? 1)),
			value => this.writeStyle({ brushScale: value }, 'brush-scale', STYLE_KINDS));

		this.check(sec, 'Smooth curves',
			() => this.styleFlag('smooth', SMOOTH_KINDS),
			on => this.writeStyle({ smooth: on }, undefined, SMOOTH_KINDS),
			() => this.activeKinds().some(k => SMOOTH_KINDS.includes(k)));

		// Both arrow ends share one row, shown only for lines.
		const arrowRow = this.row(sec, 'Arrows', () => this.activeKinds().some(k => ARROW_KINDS.includes(k)));
		const arrowsShown = () => this.activeKinds().some(k => ARROW_KINDS.includes(k));
		this.check(arrowRow, 'Arrow at start',
			() => this.styleFlag('arrowStart', ARROW_KINDS),
			on => this.writeStyle({ arrowStart: on }, undefined, ARROW_KINDS),
			arrowsShown, 'Start');
		this.check(arrowRow, 'Arrow at end',
			() => this.styleFlag('arrowEnd', ARROW_KINDS),
			on => this.writeStyle({ arrowEnd: on }, undefined, ARROW_KINDS),
			arrowsShown, 'End');
	}

	private fillSection(): void {
		const sec = this.section('Fill');
		const filled = () => this.activeKinds().some(k => FILL_KINDS.includes(k));

		// Fill colour and its opacity share one row.
		const fillRow = this.row(sec, 'Fill', filled);
		this.colour(fillRow, 'Fill colour', { allowNone: true, showOpacity: false }, () => ({
			color: this.styleShared('fill', FILL_KINDS) ?? null,
			opacity: null,
		}), colour => {
			if (colour !== null) this.writeStyle({ fill: colour }, 'fill-colour', FILL_KINDS);
		});
		this.slider(fillRow, 'Fill opacity', { min: 0, max: 100, step: 1 },
			() => {
				const opacity = shared(this.styleEntries()
					.filter(e => FILL_KINDS.includes(e.kind))
					.map(e => e.style.fillOpacity ?? 1));
				return opacity === undefined ? undefined : Math.round(opacity * 100);
			},
			value => this.writeStyle({ fillOpacity: value / 100 }, 'fill-opacity', FILL_KINDS));

		this.select(this.row(sec, 'Pattern', filled), 'Fill pattern', FILL_PATTERN_OPTIONS,
			() => this.styleShared('fillPattern', FILL_KINDS),
			value => this.writeStyle({ fillPattern: value as FillPattern }, undefined, FILL_KINDS));
	}

	private textSection(): void {
		const sec = this.section('Text');
		const hasText = () => this.selectedItems().some(item => item.kind === 'text');

		const content = makeEl(this.doc, 'textarea', 'ink-textarea', { 'aria-label': 'Text content', rows: '2' });
		content.addEventListener('input', () => {
			const value = content.value;
			if (value.trim() === '') return;
			this.writeItems(['text'], item => (item.kind === 'text' ? { ...item, text: value } : item), 'text-content');
		});
		this.row(sec, 'Words', hasText).appendChild(content);
		this.fields.push(() => {
			const texts = this.selectedItems()
				.filter((item): item is InkText => item.kind === 'text')
				.map(item => item.text);
			const value = shared(texts);
			setValueIfIdle(content, value ?? '');
			content.setAttribute('placeholder', value === undefined && texts.length > 1 ? 'Several texts' : '');
		});

		// Font and size share a row.
		const fontRow = this.row(sec, 'Font');
		this.select(fontRow, 'Font', FONT_OPTIONS,
			() => this.textShared('font'),
			value => this.writeTextStyle({ font: value as InkTextStyle['font'] }));
		this.number(fontRow, 'Text size', STAMP_SIZE,
			() => this.textShared('size'),
			value => this.writeTextStyle({ size: value }, 'text-size'));

		// Text colour, halo colour and halo width share a row.
		const colourRow = this.row(sec, 'Colour');
		this.colour(colourRow, 'Text colour', { showOpacity: false }, () => ({
			color: this.textShared('color') ?? null,
			opacity: null,
		}), colour => {
			if (colour !== null) this.writeTextStyle({ color: colour }, 'text-colour');
		});
		this.colour(colourRow, 'Halo colour', { allowNone: true, showOpacity: false }, () => {
			const halo = this.textShared('halo');
			return { color: halo === undefined ? null : halo === '' ? 'none' : halo, opacity: null };
		}, colour => {
			if (colour !== null) this.writeTextStyle({ halo: colour === 'none' ? '' : colour }, 'halo-colour');
		});
		const haloCaption = makeEl(this.doc, 'span', 'ink-unit');
		haloCaption.textContent = 'halo';
		colourRow.appendChild(haloCaption);
		this.number(colourRow, 'Halo width', WIDTH,
			() => this.textShared('haloWidth'),
			value => this.writeTextStyle({ haloWidth: value }, 'halo-width'));

		// Bold and italic, then the three alignments, as icon toggles.
		const styleRow = this.row(sec, 'Style');
		const styleGroup = makeEl(this.doc, 'div', 'ink-toggle-group', { role: 'group', 'aria-label': 'Text style' });
		styleRow.appendChild(styleGroup);
		this.toggle(styleGroup, 'Bold', 'bold',
			() => shared(this.textEntries().map(style => style.bold === true)),
			on => this.writeTextStyle({ bold: on }));
		this.toggle(styleGroup, 'Italic', 'italic',
			() => shared(this.textEntries().map(style => style.italic === true)),
			on => this.writeTextStyle({ italic: on }));
		const alignGroup = makeEl(this.doc, 'div', 'ink-toggle-group', { role: 'group', 'aria-label': 'Text alignment' });
		styleRow.appendChild(alignGroup);
		const aligns: ReadonlyArray<{ value: InkTextStyle['align']; label: string; icon: string }> = [
			{ value: 'start', label: 'Align left', icon: 'align-left' },
			{ value: 'middle', label: 'Align centre', icon: 'align-center' },
			{ value: 'end', label: 'Align right', icon: 'align-right' },
		];
		for (const align of aligns) {
			this.toggle(alignGroup, align.label, align.icon,
				() => this.textShared('align') === align.value,
				on => { if (on) this.writeTextStyle({ align: align.value }); });
		}

		// Less used: letter spacing and rotation, folded by default.
		const spacing = this.group(sec, 'Text', 'Spacing');
		this.number(this.row(spacing, 'Letter spacing'), 'Letter spacing', { min: -0.2, max: 1, step: 0.01 },
			() => this.textShared('letterSpacing'),
			value => this.writeTextStyle({ letterSpacing: value }, 'letter-spacing'));
		this.number(this.row(spacing, 'Rotation', hasText), 'Text rotation', ANGLE,
			() => shared(this.selectedItems().filter((item): item is InkText => item.kind === 'text').map(item => item.rotation)),
			value => this.writeItems(['text'], item => (item.kind === 'text' ? { ...item, rotation: value } : item), 'text-rotation'));
	}

	private stampSection(): void {
		const sec = this.section('Stamp');
		const placed = () => this.selectedItems().some(item => item.kind === 'stamp');

		const symbolRow = this.row(sec, 'Symbol');
		const select = makeEl(this.doc, 'select', 'ink-input ink-select', { 'aria-label': 'Stamp symbol' });
		const mixed = makeEl(this.doc, 'option', undefined, { value: '', disabled: 'true' });
		mixed.textContent = 'Mixed';
		select.appendChild(mixed);
		for (const category of SYMBOL_CATEGORIES) {
			const group = makeEl(this.doc, 'optgroup', undefined, { label: category.name });
			for (const symbol of SYMBOLS.filter(s => s.category === category.id)) {
				const option = makeEl(this.doc, 'option', undefined, { value: symbol.id });
				option.textContent = symbol.name;
				group.appendChild(option);
			}
			select.appendChild(group);
		}
		select.addEventListener('change', () => {
			if (select.value === '') return;
			if (placed()) this.writeStamp({ symbol: select.value });
			else this.store.setCurrentSymbol(select.value);
		});
		symbolRow.appendChild(select);
		this.fields.push(() => {
			const value = placed() ? this.stampShared('symbol') ?? '' : this.store.currentSymbol();
			setValueIfIdle(select, value);
		});

		// Colour and opacity share a row.
		const colourRow = this.row(sec, 'Colour', placed);
		this.colour(colourRow, 'Stamp colour', { showOpacity: false }, () => ({
			color: this.stampShared('color') ?? null,
			opacity: null,
		}), colour => {
			if (colour !== null) this.writeStamp({ color: colour }, 'stamp-colour');
		});
		this.slider(colourRow, 'Stamp opacity', { min: 0, max: 100, step: 1 },
			() => {
				const opacity = this.stampShared('opacity');
				return opacity === undefined ? undefined : Math.round(opacity * 100);
			},
			value => this.writeStamp({ opacity: value / 100 }, 'stamp-opacity'));
		this.number(this.row(sec, 'Size', placed), 'Stamp size', STAMP_SIZE,
			() => this.stampShared('size'),
			value => this.writeStamp({ size: value }, 'stamp-size'));
		this.number(this.row(sec, 'Rotation', placed), 'Stamp rotation', ANGLE,
			() => this.stampShared('rotation'),
			value => this.writeStamp({ rotation: value }, 'stamp-rotation'));
	}

	private arrangeSection(): void {
		const sec = this.section('Arrange');
		const actions = makeEl(this.doc, 'div', 'ink-actions');
		actions.appendChild(this.button('Bring forward', 'arrow-up', () => this.store.bringForward()));
		actions.appendChild(this.button('Send backward', 'arrow-down', () => this.store.sendBackward()));
		sec.appendChild(actions);

		const layers = this.store.doc.layers.map(layer => ({ value: layer.id, name: layer.name }));
		this.select(this.row(sec, 'Layer'), 'Layer', layers,
			() => shared(this.selectedItems().map(item => item.layer)),
			value => this.store.setSelectedLayer(value));

		this.check(sec, 'Lock item',
			() => shared(this.selectedItems().map(item => item.locked === true)),
			on => this.writeItems(ALL_KINDS, item => withFlag(item, 'locked', on)));
		this.check(sec, 'Scale with map',
			() => shared(this.selectedItems().map(item => item.scaleWithMap !== false)),
			on => this.writeItems(ALL_KINDS, item => ({ ...item, scaleWithMap: on })));
		this.hint(sec, 'Turn off to keep the same size on screen when the map zooms.');
	}

	private linkSection(): void {
		const sec = this.section('Link');
		const status = this.hint(sec, '');
		const actions = makeEl(this.doc, 'div', 'ink-actions');
		const pick = this.button('Link to location', 'link', () => this.linkLocation());
		const open = this.button('Open location', 'external-link', () => {
			const id = this.selectedItems().find(item => item.locationId)?.locationId;
			if (id) this.host.openLocation(id);
		});
		const unlink = this.button('Unlink', 'unlink', () => this.writeItems(ALL_KINDS, item => {
			const copy = { ...item };
			delete copy.locationId;
			return copy;
		}));
		actions.appendChild(pick);
		actions.appendChild(open);
		actions.appendChild(unlink);
		sec.appendChild(actions);

		this.fields.push(() => {
			const items = this.selectedItems();
			const linked = items.filter(item => item.locationId).length;
			status.textContent = linked === 0
				? 'Not linked to a location.'
				: linked === items.length
					? 'Linked to a location. Click it on the map to open it in view mode.'
					: 'Some of the selected items are linked.';
			open.hidden = linked === 0;
			unlink.hidden = linked === 0;
		});
	}

	private async linkLocation(): Promise<void> {
		const picked = await this.host.pickLocation();
		if (!picked) return;
		this.writeItems(ALL_KINDS, item => ({ ...item, locationId: picked.id }));
	}

	/** The brush select: None, then each category's brushes. A mixed selection shows blank. */
	private brushSelect(parent: HTMLElement, label: string): HTMLSelectElement {
		const doc = this.doc;
		const select = makeEl(doc, 'select', 'ink-input ink-select', { 'aria-label': label });
		const blank = makeEl(doc, 'option', undefined, { value: '', disabled: 'true' });
		blank.textContent = '';
		select.appendChild(blank);
		const none = makeEl(doc, 'option', undefined, { value: 'none' });
		none.textContent = 'None';
		select.appendChild(none);
		for (const group of brushesByCategory()) {
			if (group.brushes.length === 0) continue;
			const optgroup = makeEl(doc, 'optgroup', undefined, { label: group.name });
			for (const brush of group.brushes) {
				const option = makeEl(doc, 'option', undefined, { value: brush.id });
				option.textContent = brush.name;
				optgroup.appendChild(option);
			}
			select.appendChild(optgroup);
		}
		select.addEventListener('change', () => {
			if (select.value !== '') this.setBrush(select.value);
		});
		parent.appendChild(select);
		this.fields.push(() => {
			const shownBrush = shared(this.styleEntries().map(e => e.style.brush ?? 'none'));
			setValueIfIdle(select, shownBrush ?? '');
		});
		return select;
	}

	/** Sets the brush on the selection (or the tool default). Flip is kept only for one-sided brushes. */
	private setBrush(value: string): void {
		if (value === 'none') {
			this.writeStyle({ brush: undefined, brushFlip: undefined }, undefined, STYLE_KINDS);
			return;
		}
		const patch: Partial<InkStyle> = { brush: value };
		if (getBrush(value)?.oneSided !== true) patch.brushFlip = undefined;
		this.writeStyle(patch, undefined, STYLE_KINDS);
	}

	/** True when any styled entry has a brush, so the dash style does not apply. */
	private anyBrush(): boolean {
		return this.styleEntries().some(e => e.style.brush !== undefined);
	}

	/** True when every styled entry has a brush and each one is one-sided. */
	private allOneSidedBrush(): boolean {
		const entries = this.styleEntries();
		return entries.length > 0 && entries.every(e => {
			const brush = e.style.brush;
			return brush !== undefined && getBrush(brush)?.oneSided === true;
		});
	}

	private presetSection(items: InkItem[]): void {
		const sec = this.section('Presets');
		const doc = this.doc;
		const fits = new Set<InkPresetFit>();
		for (const item of items) {
			const fit = fitOf(item.kind);
			if (fit) fits.add(fit);
		}
		const available: InkPreset[] = [...PRESETS, ...this.host.presets()].filter(p => fits.has(p.fits));
		if (available.length === 0) {
			this.hint(sec, 'No presets fit the selected items.');
		} else {
			// Presets without a group come first, then each group under its name.
			const ungrouped = available.filter(p => !p.group);
			if (ungrouped.length > 0) sec.appendChild(this.presetList(ungrouped));
			const groups: string[] = [];
			for (const preset of available) {
				if (preset.group && !groups.includes(preset.group)) groups.push(preset.group);
			}
			for (const group of groups) {
				const heading = makeEl(doc, 'h4', 'ink-preset-heading');
				heading.textContent = group;
				sec.appendChild(heading);
				sec.appendChild(this.presetList(available.filter(p => p.group === group)));
			}
		}

		const saveRow = makeEl(doc, 'div', 'ink-save-row');
		const name = makeEl(doc, 'input', 'ink-input', {
			type: 'text',
			'aria-label': 'Preset name',
			placeholder: 'Name this style',
			maxlength: '60',
		});
		const save = this.button('Save as preset', undefined, () => this.savePreset(name));
		saveRow.appendChild(name);
		saveRow.appendChild(save);
		sec.appendChild(saveRow);
		this.hint(sec, 'Saves the style of the first selected item.');
	}

	private presetList(presets: readonly InkPreset[]): HTMLElement {
		const list = makeEl(this.doc, 'div', 'ink-preset-list');
		for (const preset of presets) {
			const label = preset.group ? `${preset.group}: ${preset.name}` : preset.name;
			const btn = makeEl(this.doc, 'button', 'ink-preset', {
				type: 'button',
				'aria-label': `Apply preset ${label}`,
			});
			btn.textContent = preset.name;
			btn.addEventListener('click', () => this.store.applyPresetToSelection(preset.id));
			list.appendChild(btn);
		}
		return list;
	}

	private savePreset(nameInput: HTMLInputElement): void {
		const name = nameInput.value.trim();
		if (name === '') {
			this.host.notify('Type a name for the preset first.');
			return;
		}
		const items = this.selectedItems();
		const fit = singleFit(items);
		const first = items[0];
		if (!fit || fit === 'stamp' || !first) {
			this.host.notify('Select items of one kind to save a preset.');
			return;
		}
		const id = `custom-${Date.now().toString(36)}`;
		let preset: InkPreset;
		if (first.kind === 'text') {
			preset = { id, name, fits: 'text', textStyle: { ...first.style } };
		} else if (hasStyle(first)) {
			preset = { id, name, fits: fit, style: { ...first.style } };
		} else {
			return;
		}
		this.host.savePreset(preset);
		this.host.notify(`Saved "${name}" as a preset.`);
		this.refresh(true);
	}

	// ---- reading the selection or the tool defaults ----------------------------

	private selectedItems(): InkItem[] {
		const selection = this.store.selection;
		if (selection.size === 0) return [];
		return this.store.doc.items.filter(item => selection.has(item.id));
	}

	/** Kinds the panel edits: the selected items' kinds, or the current tool's kind when nothing is selected. */
	private activeKinds(): InkKind[] {
		const items = this.selectedItems();
		if (items.length > 0) {
			const kinds: InkKind[] = [];
			for (const item of items) if (!kinds.includes(item.kind)) kinds.push(item.kind);
			return kinds;
		}
		const kind = toolKind(this.store.tool);
		return kind ? [kind] : [];
	}

	private styleEntries(): Array<{ kind: InkKind; style: InkStyle }> {
		if (this.selectedItems().length === 0) {
			const kind = toolKind(this.store.tool);
			return kind && STYLE_KINDS.includes(kind)
				? [{ kind, style: this.store.currentStyle(kind) }]
				: [];
		}
		const entries: Array<{ kind: InkKind; style: InkStyle }> = [];
		for (const item of this.selectedItems()) {
			if (hasStyle(item)) entries.push({ kind: item.kind, style: item.style });
		}
		return entries;
	}

	private styleShared<K extends keyof InkStyle>(key: K, only: readonly InkKind[] = STYLE_KINDS): InkStyle[K] | undefined {
		return shared(this.styleEntries().filter(e => only.includes(e.kind)).map(e => e.style[key]));
	}

	private styleFlag(key: 'smooth' | 'arrowStart' | 'arrowEnd' | 'brushFlip', only: readonly InkKind[]): boolean | undefined {
		return shared(this.styleEntries().filter(e => only.includes(e.kind)).map(e => e.style[key] === true));
	}

	private textEntries(): InkTextStyle[] {
		if (this.selectedItems().length === 0) {
			return this.store.tool === 'text' ? [this.store.currentTextStyle()] : [];
		}
		return this.selectedItems()
			.filter((item): item is InkText => item.kind === 'text')
			.map(item => item.style);
	}

	private textShared<K extends keyof InkTextStyle>(key: K): InkTextStyle[K] | undefined {
		return shared(this.textEntries().map(style => style[key]));
	}

	private stampShared<K extends 'symbol' | 'color' | 'size' | 'rotation' | 'opacity'>(key: K): InkStamp[K] | undefined {
		return shared(this.selectedItems()
			.filter((item): item is InkStamp => item.kind === 'stamp')
			.map(item => item[key]));
	}

	// ---- writing ---------------------------------------------------------------

	/** Edits the tool's default style when nothing is selected, else every selected item of the given kinds. */
	private writeStyle(patch: Partial<InkStyle>, key?: string, only?: readonly InkKind[]): void {
		if (this.selectedItems().length === 0) {
			this.store.setCurrentStyle(patch);
			return;
		}
		this.store.updateSelected(
			item => (hasStyle(item) && (!only || only.includes(item.kind)) ? patchStyle(item, patch) : item),
			key,
		);
	}

	private writeTextStyle(patch: Partial<InkTextStyle>, key?: string): void {
		if (this.selectedItems().length === 0) {
			this.store.setCurrentTextStyle(patch);
			return;
		}
		this.store.updateSelected(
			item => (item.kind === 'text' ? { ...item, style: { ...item.style, ...patch } } : item),
			key,
		);
	}

	private writeStamp(patch: Partial<InkStamp>, key?: string): void {
		this.writeItems(['stamp'], item => (item.kind === 'stamp' ? { ...item, ...patch } : item), key);
	}

	private writeItems(kinds: readonly InkKind[], change: (item: InkItem) => InkItem, key?: string): void {
		this.store.updateSelected(item => (kinds.includes(item.kind) ? change(item) : item), key);
	}
}
