/**
 * Stamp tool: click to place the current symbol, in the current colour and size.
 * Alt-click copies the style of the item under the pointer. A faint ghost of the
 * symbol follows the pointer.
 *
 * Pure TypeScript: no Obsidian imports.
 */
import type { InkItem, InkStamp } from '../model';
import type { InkToolId } from '../storeTypes';
import { eyedropAt, snapLatLng, startDrawSession } from './types';
import type { DrawSession, InkTool, InkToolContext } from './types';

export class StampTool implements InkTool {
	readonly id: InkToolId = 'stamp';
	private session: DrawSession | undefined;
	private ctx: InkToolContext | undefined;

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.ctx = ctx;
		this.session = startDrawSession(ctx, 'crosshair', {
			down: (e, p) => {
				if (eyedropAt(ctx, e, 'stamp')) return;
				const at = snapLatLng(ctx, p, e);
				const style = ctx.store.currentStyle('stamp');
				const stamp: Omit<InkStamp, 'id' | 'layer'> = {
					kind: 'stamp',
					scaleWithMap: true,
					at,
					symbol: ctx.store.currentSymbol(),
					size: style.strokeWidth,
					rotation: 0,
					color: style.stroke,
					opacity: style.strokeOpacity,
				};
				ctx.store.addItem(stamp);
				this.session?.preview.clear();
			},
			move: (e, p) => {
				if (!this.session) return;
				const at = snapLatLng(ctx, p, e);
				this.session.preview.draw([this.ghost(at)]);
			},
			cancel: () => this.session?.preview.clear(),
		});
	}

	deactivate(): void {
		this.session?.end();
		this.session = undefined;
		this.ctx = undefined;
	}

	/** The stamp that would be placed at `at`, drawn as a preview. */
	private ghost(at: [number, number]): InkItem {
		const ctx = this.ctx as InkToolContext;
		const style = ctx.store.currentStyle('stamp');
		const stamp: InkStamp = {
			id: 'draft',
			kind: 'stamp',
			layer: 'draft',
			scaleWithMap: true,
			at,
			symbol: ctx.store.currentSymbol(),
			size: style.strokeWidth,
			rotation: 0,
			color: style.stroke,
			opacity: Math.min(0.6, style.strokeOpacity),
		};
		return stamp;
	}
}
