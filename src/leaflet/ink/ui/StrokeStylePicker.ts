/**
 * Line style picker: a dropdown of dash styles, each with a small SVG preview,
 * and a width slider. Closes on outside click or Escape. Arrow keys move
 * between styles.
 *
 * Plain DOM. Elements come from the parent's ownerDocument.
 */
import type { DashStyle } from '../model';
import { makeEl } from './ColorPicker';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const DASH_STYLES: readonly { id: DashStyle; name: string }[] = [
	{ id: 'solid', name: 'Solid' },
	{ id: 'dashed', name: 'Dashed' },
	{ id: 'dotted', name: 'Dotted' },
	{ id: 'double', name: 'Double line' },
	{ id: 'wavy', name: 'Wavy' },
	{ id: 'ticked', name: 'Ticked' },
	{ id: 'railway', name: 'Railway' },
];

/** Width slider range, in the units of InkStyle.strokeWidth. */
export const WIDTH_RANGE = { min: 0.5, max: 12, step: 0.5 } as const;

export interface StrokeStylePickerOptions {
	/** Current dash style, or null when the selection has mixed values. */
	dash: DashStyle | null;
	/** Current width, or null when the selection has mixed values. */
	width: number | null;
	/** Accessible prefix, such as "Stroke". Defaults to "Line". */
	label?: string;
	onDashChange(dash: DashStyle): void;
	onWidthChange(width: number): void;
}

type ShapeAttrs = Record<string, string>;

/** The line shapes for each dash style, drawn on a 64 by 14 preview. */
const DASH_SHAPES: Record<DashStyle, ShapeAttrs[]> = {
	solid: [{ d: 'M3 7 H61', 'stroke-width': '2' }],
	dashed: [{ d: 'M3 7 H61', 'stroke-width': '2', 'stroke-dasharray': '7 4' }],
	dotted: [{ d: 'M3 7 H61', 'stroke-width': '2.5', 'stroke-dasharray': '0.1 4', 'stroke-linecap': 'round' }],
	double: [
		{ d: 'M3 5 H61', 'stroke-width': '1.5' },
		{ d: 'M3 9 H61', 'stroke-width': '1.5' },
	],
	wavy: [{ d: 'M3 7 q4 -4 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0', 'stroke-width': '2' }],
	ticked: [
		{ d: 'M3 7 H61', 'stroke-width': '2' },
		{ d: 'M9 3 V11 M18 3 V11 M27 3 V11 M36 3 V11 M45 3 V11 M54 3 V11', 'stroke-width': '1.5' },
	],
	railway: [
		{ d: 'M3 5 H61 M3 9 H61', 'stroke-width': '1.5' },
		{ d: 'M9 4 V10 M18 4 V10 M27 4 V10 M36 4 V10 M45 4 V10 M54 4 V10', 'stroke-width': '1.5' },
	],
};

/** An inline SVG preview of one dash style. Uses currentColor. */
export function dashPreview(doc: Document, dash: DashStyle): Element {
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 64 14');
	svg.setAttribute('width', '64');
	svg.setAttribute('height', '14');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('class', 'ink-dash-preview');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-linejoin', 'round');
	for (const shape of DASH_SHAPES[dash]) {
		const path = doc.createElementNS(SVG_NS, 'path');
		for (const key of Object.keys(shape)) path.setAttribute(key, shape[key]);
		svg.appendChild(path);
	}
	return svg;
}

function dashName(dash: DashStyle): string {
	return DASH_STYLES.find(d => d.id === dash)?.name ?? 'Solid';
}

export class StrokeStylePicker {
	readonly el: HTMLElement;
	private readonly doc: Document;
	private readonly trigger: HTMLButtonElement;
	private readonly triggerPreview: HTMLElement;
	private readonly triggerName: HTMLElement;
	private readonly list: HTMLElement;
	private readonly optionButtons: HTMLButtonElement[] = [];
	private readonly width: HTMLInputElement;
	private readonly widthOut: HTMLElement;
	private readonly label: string;
	private readonly onDashChange: StrokeStylePickerOptions['onDashChange'];
	private readonly onWidthChange: StrokeStylePickerOptions['onWidthChange'];
	private dash: DashStyle | null;
	private open = false;

	private readonly onOutside = (event: Event): void => {
		const target = event.target as Node | null;
		if (target && this.el.contains(target)) return;
		this.close();
	};

	constructor(parent: HTMLElement, options: StrokeStylePickerOptions) {
		this.doc = parent.ownerDocument;
		const doc = this.doc;
		this.label = options.label ?? 'Line';
		this.onDashChange = options.onDashChange;
		this.onWidthChange = options.onWidthChange;
		this.dash = options.dash;

		this.el = makeEl(doc, 'div', 'ink-stroke-style');

		const dropdown = makeEl(doc, 'div', 'ink-dropdown');
		this.trigger = makeEl(doc, 'button', 'ink-dropdown-trigger', {
			type: 'button',
			'aria-haspopup': 'listbox',
			'aria-expanded': 'false',
		});
		this.triggerPreview = makeEl(doc, 'span', 'ink-dash-slot');
		this.triggerName = makeEl(doc, 'span', 'ink-dropdown-name');
		this.trigger.appendChild(this.triggerPreview);
		this.trigger.appendChild(this.triggerName);
		dropdown.appendChild(this.trigger);

		this.list = makeEl(doc, 'div', 'ink-popover ink-listbox', {
			role: 'listbox',
			'aria-label': `${this.label} style`,
		});
		this.list.hidden = true;
		for (const style of DASH_STYLES) {
			const btn = makeEl(doc, 'button', 'ink-option', {
				type: 'button',
				role: 'option',
				'aria-selected': 'false',
				'aria-label': style.name,
				'data-dash': style.id,
			});
			btn.appendChild(dashPreview(doc, style.id));
			const name = makeEl(doc, 'span', 'ink-option-name');
			name.textContent = style.name;
			btn.appendChild(name);
			btn.addEventListener('click', () => this.choose(style.id));
			this.optionButtons.push(btn);
			this.list.appendChild(btn);
		}
		dropdown.appendChild(this.list);
		this.el.appendChild(dropdown);

		this.list.addEventListener('keydown', (event: KeyboardEvent) => {
			const index = this.optionButtons.indexOf(event.target as HTMLButtonElement);
			if (event.key === 'Escape') {
				event.stopPropagation();
				this.close();
				this.trigger.focus();
				return;
			}
			if (index < 0) return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				const next = (index + step + this.optionButtons.length) % this.optionButtons.length;
				this.optionButtons[next].focus();
			}
		});
		this.trigger.addEventListener('click', () => {
			if (this.open) this.close();
			else this.setOpen(true);
		});

		const widthRow = makeEl(doc, 'div', 'ink-slider');
		this.width = makeEl(doc, 'input', 'ink-range', {
			type: 'range',
			min: String(WIDTH_RANGE.min),
			max: String(WIDTH_RANGE.max),
			step: String(WIDTH_RANGE.step),
			'aria-label': `${this.label} width`,
		});
		this.widthOut = makeEl(doc, 'span', 'ink-range-value');
		widthRow.appendChild(this.width);
		widthRow.appendChild(this.widthOut);
		this.el.appendChild(widthRow);
		this.width.addEventListener('input', () => {
			const value = Number(this.width.value);
			this.widthOut.textContent = String(value);
			this.onWidthChange(value);
		});

		parent.appendChild(this.el);
		this.update(options.dash, options.width);
	}

	/** Shows new values without calling the change callbacks. */
	update(dash: DashStyle | null, width: number | null): void {
		this.dash = dash;
		this.triggerPreview.replaceChildren(dashPreview(this.doc, dash ?? 'solid'));
		this.triggerName.textContent = dash === null ? 'Mixed' : dashName(dash);
		this.trigger.setAttribute('aria-label', `${this.label} style: ${dash === null ? 'Mixed' : dashName(dash)}`);
		for (const btn of this.optionButtons) {
			const selected = btn.getAttribute('data-dash') === dash;
			btn.setAttribute('aria-selected', String(selected));
			btn.classList.toggle('ink-option-active', selected);
		}
		const value = width ?? 2;
		this.width.value = String(value);
		this.widthOut.textContent = width === null ? 'Mixed' : String(width);
	}

	/**
	 * Disables the dropdown (a brush replaces the dash style). The width slider stays
	 * usable. Closes the list when it is open.
	 */
	setDisabled(disabled: boolean): void {
		if (disabled) this.setOpen(false);
		this.trigger.disabled = disabled;
		this.trigger.setAttribute('aria-disabled', String(disabled));
		this.el.classList.toggle('ink-stroke-style-disabled', disabled);
	}

	isOpen(): boolean {
		return this.open;
	}

	close(): void {
		this.setOpen(false);
	}

	destroy(): void {
		this.setOpen(false);
		this.el.remove();
	}

	private choose(dash: DashStyle): void {
		this.setOpen(false);
		this.update(dash, this.width.value === '' ? null : Number(this.width.value));
		this.trigger.focus();
		this.onDashChange(dash);
	}

	private setOpen(open: boolean): void {
		if (open === this.open) return;
		this.open = open;
		this.list.hidden = !open;
		this.trigger.setAttribute('aria-expanded', String(open));
		if (open) {
			this.doc.addEventListener('pointerdown', this.onOutside);
			const selected = this.optionButtons.find(btn => btn.getAttribute('aria-selected') === 'true');
			(selected ?? this.optionButtons[0]).focus();
		} else {
			this.doc.removeEventListener('pointerdown', this.onOutside);
		}
	}
}
