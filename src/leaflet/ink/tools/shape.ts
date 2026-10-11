/**
 * Rectangle and ellipse tools: drag from one corner to the other. Shift keeps the
 * shape square or round. Alt draws from the centre. Drags under 4 px draw nothing.
 *
 * Pure TypeScript: no Obsidian imports.
 */
import type { InkBox, InkPoint } from '../model';
import type { InkToolId } from '../storeTypes';
import type { Point } from '../geometry';
import { TINY_DRAG, eyedropAt, snapLatLng, startDrawSession, toContainer, toLatLng, distance } from './types';
import type { DrawSession, InkTool, InkToolContext } from './types';

interface Modifiers {
	shiftKey: boolean;
	altKey: boolean;
}

abstract class BoxTool implements InkTool {
	abstract readonly id: InkToolId;
	protected abstract readonly kind: 'rect' | 'ellipse';
	private session: DrawSession | undefined;
	private ctx: InkToolContext | undefined;
	private start: Point | undefined;
	private current: Point | undefined;
	private mods: Modifiers = { shiftKey: false, altKey: false };

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.ctx = ctx;
		this.session = startDrawSession(ctx, 'crosshair', {
			down: (e, p) => {
				if (eyedropAt(ctx, e, this.id)) return;
				const at = toContainer(ctx, snapLatLng(ctx, p, e));
				this.start = at;
				this.current = at;
				this.mods = { shiftKey: e.shiftKey, altKey: e.altKey };
			},
			move: (e, p) => {
				if (!this.start) return;
				this.current = toContainer(ctx, snapLatLng(ctx, p, e));
				this.mods = { shiftKey: e.shiftKey, altKey: e.altKey };
				this.preview();
			},
			up: (e, p) => {
				if (!this.start) return;
				this.current = toContainer(ctx, snapLatLng(ctx, p, e));
				this.mods = { shiftKey: e.shiftKey, altKey: e.altKey };
				this.commitBox();
			},
			cancel: () => this.reset(),
		});
	}

	deactivate(): void {
		this.reset();
		this.session?.end();
		this.session = undefined;
		this.ctx = undefined;
	}

	private reset(): void {
		this.start = undefined;
		this.current = undefined;
		this.session?.preview.clear();
	}

	/** The two corners in latlng, after the Shift and Alt constraints. */
	private corners(): [InkPoint, InkPoint] | undefined {
		const ctx = this.ctx;
		const start = this.start;
		const cur = this.current;
		if (!ctx || !start || !cur) return undefined;
		let dx = cur.x - start.x;
		let dy = cur.y - start.y;
		if (this.mods.shiftKey) {
			const m = Math.max(Math.abs(dx), Math.abs(dy));
			dx = dx < 0 ? -m : m;
			dy = dy < 0 ? -m : m;
		}
		let a: Point = start;
		const b: Point = { x: start.x + dx, y: start.y + dy };
		if (this.mods.altKey) a = { x: start.x - dx, y: start.y - dy };
		return [toLatLng(ctx, a), toLatLng(ctx, b)];
	}

	private preview(): void {
		const ctx = this.ctx;
		const corners = this.corners();
		if (!ctx || !corners || !this.session) return;
		if (this.tiny()) {
			this.session.preview.clear();
			return;
		}
		const item: InkBox = {
			id: 'draft',
			kind: this.kind,
			layer: 'draft',
			scaleWithMap: true,
			a: corners[0],
			b: corners[1],
			rotation: 0,
			style: ctx.store.currentStyle(this.kind),
		};
		this.session.preview.draw([item]);
	}

	private tiny(): boolean {
		const start = this.start;
		const cur = this.current;
		return !start || !cur || distance(start, cur) < TINY_DRAG;
	}

	private commitBox(): void {
		const ctx = this.ctx;
		const corners = this.corners();
		const tiny = this.tiny();
		this.reset();
		if (!ctx || !corners || tiny) return;
		const box: Omit<InkBox, 'id' | 'layer'> = {
			kind: this.kind,
			scaleWithMap: true,
			a: corners[0],
			b: corners[1],
			rotation: 0,
			style: ctx.store.currentStyle(this.kind),
		};
		ctx.store.addItem(box);
	}
}

export class RectTool extends BoxTool {
	readonly id: InkToolId = 'rect';
	protected readonly kind = 'rect' as const;
}

export class EllipseTool extends BoxTool {
	readonly id: InkToolId = 'ellipse';
	protected readonly kind = 'ellipse' as const;
}

