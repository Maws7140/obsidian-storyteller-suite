/**
 * Colour picker: a trigger button showing the current colour, opening a popover
 * with swatches, recent colours, a hex field, a native colour input, and an
 * opacity slider. Closes on outside click or Escape.
 *
 * Plain DOM. Elements come from the parent's ownerDocument.
 */
import { SWATCHES } from '../styles';

/** How many recent colours the popover shows. */
export const RECENT_LIMIT = 8;

export interface ColorPickerOptions {
	/** Accessible name of the trigger, such as "Stroke colour". */
	label: string;
	/** '#rrggbb', 'none', or null when the selection has mixed values. */
	color: string | null;
	/** 0 to 1, or null when the selection has mixed values. */
	opacity: number | null;
	/** Recently used colours, newest first. */
	recent?: readonly string[];
	/** Adds a "No colour" button, for fills and halos. */
	allowNone?: boolean;
	/** Shows the opacity slider. Defaults to true. */
	showOpacity?: boolean;
	/**
	 * Called when the user picks a colour or moves the opacity slider. A null
	 * argument means that value did not change.
	 */
	onChange(color: string | null, opacity: number | null): void;
}

export interface ColorPickerValues {
	color: string | null;
	opacity: number | null;
	recent?: readonly string[];
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Turns '#rgb', 'rgb' or '#rrggbb' into lower-case '#rrggbb'. Returns undefined when invalid. */
export function normaliseHex(input: string): string | undefined {
	const match = HEX_PATTERN.exec(input.trim());
	if (!match) return undefined;
	let digits = match[1].toLowerCase();
	if (digits.length === 3) digits = digits.split('').map(ch => ch + ch).join('');
	return `#${digits}`;
}

/** Creates an element in `doc`, with an optional class and attributes. */
export function makeEl<K extends keyof HTMLElementTagNameMap>(
	doc: Document,
	tag: K,
	className?: string,
	attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
	const node = doc.createElement(tag);
	if (className) node.className = className;
	if (attrs) {
		for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]);
	}
	return node;
}

/**
 * Sets an input's value unless the user is typing in it. Stops a store refresh
 * from overwriting text the user is in the middle of entering.
 */
export function setValueIfIdle(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
	if (input.ownerDocument.activeElement === input) return;
	if (input.value !== value) input.value = value;
}

export class ColorPicker {
	readonly el: HTMLElement;
	private readonly doc: Document;
	private readonly trigger: HTMLButtonElement;
	private readonly chip: HTMLElement;
	private readonly popover: HTMLElement;
	private readonly recentBox: HTMLElement;
	private readonly recentRow: HTMLElement;
	private readonly hex: HTMLInputElement;
	private readonly hexHint: HTMLElement;
	private readonly native: HTMLInputElement;
	private readonly opacityRow: HTMLElement;
	private readonly range: HTMLInputElement;
	private readonly rangeOut: HTMLElement;
	private readonly onChange: ColorPickerOptions['onChange'];
	private readonly label: string;
	private readonly allowNone: boolean;
	private color: string | null;
	private opacity: number | null;
	private recent: readonly string[];
	private renderedRecent = '\u0000';
	private readonly swatchButtons: HTMLButtonElement[] = [];
	private recentButtons: HTMLButtonElement[] = [];
	private open = false;

	private readonly onOutside = (event: Event): void => {
		const target = event.target as Node | null;
		if (target && this.el.contains(target)) return;
		this.close();
	};

	constructor(parent: HTMLElement, options: ColorPickerOptions) {
		this.doc = parent.ownerDocument;
		const doc = this.doc;
		this.onChange = options.onChange;
		this.label = options.label;
		this.allowNone = options.allowNone === true;
		this.color = options.color;
		this.opacity = options.opacity;
		this.recent = options.recent ?? [];

		this.el = makeEl(doc, 'div', 'ink-color');
		this.trigger = makeEl(doc, 'button', 'ink-color-trigger', {
			type: 'button',
			'aria-haspopup': 'dialog',
			'aria-expanded': 'false',
		});
		this.chip = makeEl(doc, 'span', 'ink-chip');
		this.trigger.appendChild(this.chip);
		this.el.appendChild(this.trigger);

		this.popover = makeEl(doc, 'div', 'ink-popover', {
			role: 'dialog',
			'aria-label': `${options.label} picker`,
		});
		this.popover.hidden = true;

		const swatches = makeEl(doc, 'div', 'ink-swatches', { role: 'group', 'aria-label': 'Swatches' });
		for (const colour of SWATCHES) {
			const btn = this.colourButton(colour, 'ink-swatch', `Use colour ${colour}`);
			this.swatchButtons.push(btn);
			swatches.appendChild(btn);
		}
		this.popover.appendChild(swatches);

		this.recentBox = makeEl(doc, 'div', 'ink-popover-section');
		const recentTitle = makeEl(doc, 'div', 'ink-popover-title');
		recentTitle.textContent = 'Recent';
		this.recentRow = makeEl(doc, 'div', 'ink-swatches ink-recent', { role: 'group', 'aria-label': 'Recent colours' });
		this.recentBox.appendChild(recentTitle);
		this.recentBox.appendChild(this.recentRow);
		this.popover.appendChild(this.recentBox);

		if (this.allowNone) {
			const none = makeEl(doc, 'button', 'ink-none-btn', { type: 'button', 'aria-label': 'No colour' });
			none.textContent = 'No colour';
			none.addEventListener('click', () => this.commit('none'));
			this.popover.appendChild(none);
		}

		const hexRow = makeEl(doc, 'div', 'ink-popover-section');
		this.hex = makeEl(doc, 'input', 'ink-hex', {
			type: 'text',
			'aria-label': 'Hex colour',
			maxlength: '7',
			spellcheck: 'false',
			autocomplete: 'off',
			placeholder: '#3b82c4',
		});
		this.hexHint = makeEl(doc, 'div', 'ink-hint', { role: 'status' });
		this.hexHint.textContent = 'Use a hex colour such as #3b82c4.';
		this.hexHint.hidden = true;
		hexRow.appendChild(this.hex);
		hexRow.appendChild(this.hexHint);
		this.popover.appendChild(hexRow);

		this.native = makeEl(doc, 'input', 'ink-native', { type: 'color', 'aria-label': 'Pick any colour' });
		const nativeRow = makeEl(doc, 'div', 'ink-popover-section');
		nativeRow.appendChild(this.native);
		this.popover.appendChild(nativeRow);

		this.opacityRow = makeEl(doc, 'div', 'ink-popover-section ink-opacity-row');
		const opacityTitle = makeEl(doc, 'span', 'ink-label');
		opacityTitle.textContent = 'Opacity';
		this.range = makeEl(doc, 'input', 'ink-range', {
			type: 'range',
			min: '0',
			max: '100',
			step: '1',
			'aria-label': `${options.label} opacity`,
		});
		this.rangeOut = makeEl(doc, 'span', 'ink-range-value');
		this.opacityRow.appendChild(opacityTitle);
		this.opacityRow.appendChild(this.range);
		this.opacityRow.appendChild(this.rangeOut);
		this.opacityRow.hidden = options.showOpacity === false;
		this.popover.appendChild(this.opacityRow);

		this.el.appendChild(this.popover);
		parent.appendChild(this.el);

		this.trigger.addEventListener('click', () => {
			if (this.open) this.close();
			else this.setOpen(true);
		});
		this.el.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && this.open) {
				event.stopPropagation();
				this.close();
				this.trigger.focus();
			}
		});
		this.hex.addEventListener('input', () => {
			const raw = this.hex.value.trim();
			const valid = normaliseHex(raw) !== undefined;
			this.hexHint.hidden = raw === '' || valid;
			this.hex.setAttribute('aria-invalid', raw === '' || valid ? 'false' : 'true');
		});
		this.hex.addEventListener('change', () => this.commitHex());
		this.hex.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.commitHex();
			}
		});
		this.native.addEventListener('input', () => this.commit(this.native.value));
		this.native.addEventListener('change', () => this.commit(this.native.value));
		this.range.addEventListener('input', () => {
			const value = Number(this.range.value) / 100;
			this.opacity = value;
			this.rangeOut.textContent = `${Math.round(value * 100)}%`;
			this.onChange(null, value);
		});

		this.applyValues();
	}

	/** Shows new values without calling onChange. */
	update(values: ColorPickerValues): void {
		this.color = values.color;
		this.opacity = values.opacity;
		if (values.recent) this.recent = values.recent;
		this.applyValues();
	}

	isOpen(): boolean {
		return this.open;
	}

	/** Closes the popover. Does nothing when it is already closed. */
	close(): void {
		this.setOpen(false);
	}

	destroy(): void {
		this.setOpen(false);
		this.el.remove();
	}

	private setOpen(open: boolean): void {
		if (open === this.open) return;
		this.open = open;
		this.popover.hidden = !open;
		this.trigger.setAttribute('aria-expanded', String(open));
		if (open) this.doc.addEventListener('pointerdown', this.onOutside);
		else this.doc.removeEventListener('pointerdown', this.onOutside);
	}

	private commit(colour: string): void {
		this.color = colour;
		this.hexHint.hidden = true;
		this.hex.setAttribute('aria-invalid', 'false');
		this.applyValues();
		this.onChange(colour, null);
	}

	private commitHex(): void {
		const raw = this.hex.value.trim();
		if (raw === '') return;
		const colour = normaliseHex(raw);
		if (!colour) {
			this.hexHint.hidden = false;
			this.hex.setAttribute('aria-invalid', 'true');
			return;
		}
		this.commit(colour);
	}

	private colourButton(colour: string, className: string, label: string): HTMLButtonElement {
		const btn = makeEl(this.doc, 'button', className, { type: 'button', 'aria-label': label, title: colour });
		btn.style.backgroundColor = colour;
		btn.setAttribute('data-colour', colour);
		btn.setAttribute('aria-pressed', String(colour === this.color));
		btn.addEventListener('click', () => this.commit(colour));
		return btn;
	}

	private applyValues(): void {
		const colour = this.color;
		const solid = colour !== null && colour !== 'none' ? normaliseHex(colour) : undefined;
		const display = colour === null ? 'Mixed' : colour === 'none' ? 'No colour' : (solid ?? colour);
		this.trigger.setAttribute('aria-label', `${this.label}: ${display}`);
		this.chip.className = colour === null
			? 'ink-chip ink-chip-mixed'
			: colour === 'none' ? 'ink-chip ink-chip-none' : 'ink-chip';
		this.chip.style.backgroundColor = solid ?? '';

		setValueIfIdle(this.hex, solid ?? '');
		setValueIfIdle(this.native, solid ?? '#000000');

		const pct = this.opacity === null ? null : Math.round(this.opacity * 100);
		this.range.value = String(pct ?? 100);
		this.rangeOut.textContent = pct === null ? 'Mixed' : `${pct}%`;

		this.renderRecent();
		for (const btn of [...this.swatchButtons, ...this.recentButtons]) {
			btn.setAttribute('aria-pressed', String(btn.getAttribute('data-colour') === colour));
		}
	}

	private renderRecent(): void {
		const list: string[] = [];
		for (const colour of this.recent) {
			const solid = normaliseHex(colour);
			if (solid && !list.includes(solid)) list.push(solid);
			if (list.length === RECENT_LIMIT) break;
		}
		const key = list.join(',');
		this.recentBox.hidden = list.length === 0;
		if (key === this.renderedRecent) return;
		this.renderedRecent = key;
		this.recentRow.replaceChildren();
		this.recentButtons = [];
		for (const colour of list) {
			const btn = this.colourButton(colour, 'ink-swatch', `Use recent colour ${colour}`);
			this.recentButtons.push(btn);
			this.recentRow.appendChild(btn);
		}
	}
}
