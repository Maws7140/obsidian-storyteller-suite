/**
 * Text tool: click the map to type a label straight onto it. The editor is a
 * contenteditable over the map, styled like the final text at the current zoom.
 * Enter commits, Shift+Enter adds a line, Escape cancels, and leaving the editor
 * commits. Empty text commits nothing.
 *
 * editTextItem reopens an existing text item for editing. The select tool calls it
 * on double click.
 *
 * Pure TypeScript: no Obsidian imports. Plain DOM only.
 */
import type { InkPoint, InkTextStyle, InkText as InkTextItem } from '../model';
import type { InkToolId } from '../storeTypes';
import { defaultScaleWithMap, eyedropAt, refZoomOf, snapLatLng, startDrawSession, toContainer } from './types';
import type { DrawSession, InkTool, InkToolContext } from './types';

/** Font stacks, the same as the ones the layer draws with. Keep in step with svgBuild.ts. */
const FONT_STACKS: Record<InkTextStyle['font'], string> = {
	serif: 'var(--font-text-theme, Georgia), "Iowan Old Style", "Palatino Linotype", serif',
	sans: 'var(--font-interface-theme, system-ui), "Segoe UI", Helvetica, Arial, sans-serif',
	hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
	mono: 'var(--font-monospace-theme, ui-monospace), "SFMono-Regular", Menlo, Consolas, monospace',
};

/** Line height and the offset from the anchor to the top of the first line, in em. Same as the layer. */
const LINE_HEIGHT = 1.2;
const ASCENT = 0.8;

interface OpenEditor {
	commit(): void;
	cancel(): void;
}

/** The one text editor that may be open at a time, from any tool. */
let open: OpenEditor | undefined;

interface EditorOptions {
	at: InkPoint;
	style: InkTextStyle;
	scaleWithMap: boolean;
	initial: string;
	/** Called with the typed text when the editor commits with something in it. */
	onCommit(text: string): void;
}

/** The editor's screen size and anchor: the zoom scale is applied only when the text scales with the map. */
function screenMetrics(ctx: InkToolContext, at: InkPoint, style: InkTextStyle, scaleWithMap: boolean): { scale: number; size: number; halo: number; left: number; top: number } {
	const map = ctx.map;
	const scale = scaleWithMap ? map.getZoomScale(map.getZoom(), refZoomOf(ctx)) : 1;
	const size = style.size * scale;
	const anchor = toContainer(ctx, at);
	return {
		scale,
		size,
		halo: style.haloWidth * scale,
		left: anchor.x,
		top: anchor.y - ASCENT * size,
	};
}

function applyEditorStyle(ctx: InkToolContext, el: HTMLElement, style: InkTextStyle, scaleWithMap: boolean, at: InkPoint): void {
	const m = screenMetrics(ctx, at, style, scaleWithMap);
	const shift = style.align === 'middle' ? '-50%' : style.align === 'end' ? '-100%' : '0';
	const r = Math.max(0, m.halo);
	const d = r * 0.7;
	const shadows = style.halo && r > 0
		? [[r, 0], [-r, 0], [0, r], [0, -r], [d, d], [-d, d], [d, -d], [-d, -d]]
			.map(([x, y]) => `${x}px ${y}px 0 ${style.halo}`)
			.join(', ')
		: 'none';
	const css = [
		'position: absolute',
		`left: ${m.left}px`,
		`top: ${m.top}px`,
		`transform: translateX(${shift})`,
		'min-width: 1em',
		'margin: 0',
		'padding: 0 2px',
		'white-space: pre-wrap',
		'outline: 1px dashed rgba(59, 130, 196, 0.85)',
		'outline-offset: 2px',
		'background: transparent',
		'pointer-events: auto',
		'cursor: text',
		'z-index: 1',
		`font-family: ${FONT_STACKS[style.font]}`,
		`font-size: ${m.size}px`,
		`line-height: ${LINE_HEIGHT}`,
		`letter-spacing: ${style.letterSpacing ?? 0}em`,
		`color: ${style.color}`,
		`text-align: ${style.align}`,
		style.bold ? 'font-weight: 700' : '',
		style.italic ? 'font-style: italic' : '',
		`text-shadow: ${shadows}`,
	].filter(part => part !== '').join('; ');
	el.setAttribute('style', css);
}

function readText(el: HTMLElement): string {
	return (el.innerText || '').replace(/\r\n?/g, '\n');
}

/** Open an editor over the map. Any editor already open is committed first. */
function openEditor(ctx: InkToolContext, opts: EditorOptions): void {
	open?.commit();
	const doc = ctx.previewPane.ownerDocument;
	const el = doc.createElement('div');
	el.setAttribute('class', 'ink-text-editor');
	el.setAttribute('contenteditable', 'true');
	el.setAttribute('role', 'textbox');
	el.setAttribute('aria-label', 'Map text');
	el.setAttribute('spellcheck', 'false');
	el.textContent = opts.initial;
	applyEditorStyle(ctx, el, opts.style, opts.scaleWithMap, opts.at);
	ctx.previewPane.appendChild(el);

	let finished = false;
	const end = (commit: boolean): void => {
		if (finished) return;
		finished = true;
		if (open === state) open = undefined;
		const text = commit ? readText(el) : '';
		el.remove();
		if (commit && text.trim() !== '') opts.onCommit(text);
	};
	const state: OpenEditor = { commit: () => end(true), cancel: () => end(false) };
	open = state;

	el.addEventListener('keydown', (e: KeyboardEvent) => {
		e.stopPropagation();
		if (e.isComposing) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			end(true);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			end(false);
		}
	});
	el.addEventListener('blur', () => end(true));

	el.focus();
	const selection = doc.defaultView ? doc.defaultView.getSelection() : null;
	if (selection) {
		const range = doc.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

/** Reopen an existing text item for editing. Commits a new text, or leaves the item alone when the text is empty. */
export function editTextItem(ctx: InkToolContext, id: string): void {
	const item = ctx.store.doc.items.find(candidate => candidate.id === id);
	if (!item || item.kind !== 'text') return;
	ctx.store.select([id]);
	openEditor(ctx, {
		at: item.at,
		style: { ...item.style },
		scaleWithMap: item.scaleWithMap,
		initial: item.text,
		onCommit: text => {
			if (text === item.text) return;
			ctx.store.apply(doc => ({
				...doc,
				items: doc.items.map(candidate => (candidate.id === id && candidate.kind === 'text' ? { ...candidate, text } : candidate)),
			}));
		},
	});
}

export class TextTool implements InkTool {
	readonly id: InkToolId = 'text';
	private session: DrawSession | undefined;

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.session = startDrawSession(ctx, 'text', {
			down: (e, p) => {
				if (eyedropAt(ctx, e, 'text')) return;
				// A click while typing finishes the text and places nothing new.
				if (open) {
					open.commit();
					return;
				}
				const at = snapLatLng(ctx, p, e);
				const style = ctx.store.currentTextStyle();
				openEditor(ctx, {
					at,
					style,
					scaleWithMap: defaultScaleWithMap(ctx),
					initial: '',
					onCommit: text => {
						const item: Omit<InkTextItem, 'id' | 'layer'> = {
							kind: 'text',
							scaleWithMap: defaultScaleWithMap(ctx),
							at,
							text,
							rotation: 0,
							style: { ...style },
						};
						ctx.store.addItem(item);
					},
				});
			},
		});
	}

	deactivate(): void {
		open?.commit();
		this.session?.end();
		this.session = undefined;
	}
}
