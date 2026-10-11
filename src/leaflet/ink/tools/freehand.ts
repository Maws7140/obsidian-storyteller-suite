/**
 * Freehand tool: drag to draw a line. The stroke is simplified on release, with a
 * tolerance in container pixels, and stored as latlng points.
 *
 * Pure TypeScript: no Obsidian imports.
 */
import type { InkPath, InkPoint } from '../model';
import type { InkToolId } from '../storeTypes';
import { simplify } from '../geometry';
import type { Point } from '../geometry';
import { FREEHAND_TOLERANCE, TINY_DRAG, eyedropAt, extentOf, startDrawSession, toLatLng } from './types';
import type { DrawSession, InkTool, InkToolContext } from './types';

export class FreehandTool implements InkTool {
	readonly id: InkToolId = 'freehand';
	private session: DrawSession | undefined;
	private ctx: InkToolContext | undefined;
	private stroke: Point[] | undefined;

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.ctx = ctx;
		this.session = startDrawSession(ctx, 'crosshair', {
			down: (e, p) => {
				if (eyedropAt(ctx, e, 'freehand')) return;
				this.stroke = [p];
			},
			move: (_e, p) => {
				const stroke = this.stroke;
				if (!stroke) return;
				const last = stroke[stroke.length - 1];
				if (Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
				stroke.push(p);
				this.preview(stroke);
			},
			up: (_e, p) => {
				const stroke = this.stroke;
				if (!stroke) return;
				this.stroke = undefined;
				this.session?.preview.clear();
				stroke.push(p);
				this.commit(ctx, stroke);
			},
			cancel: () => {
				this.stroke = undefined;
				this.session?.preview.clear();
			},
		});
	}

	deactivate(): void {
		this.stroke = undefined;
		this.session?.end();
		this.session = undefined;
		this.ctx = undefined;
	}

	private preview(stroke: Point[]): void {
		const ctx = this.ctx;
		if (!ctx || !this.session) return;
		const points: InkPoint[] = stroke.map(p => toLatLng(ctx, p));
		const item: InkPath = {
			id: 'draft',
			kind: 'freehand',
			layer: 'draft',
			scaleWithMap: true,
			points,
			style: ctx.store.currentStyle('freehand'),
		};
		this.session.preview.draw([item]);
	}

	private commit(ctx: InkToolContext, stroke: Point[]): void {
		if (extentOf(stroke) < TINY_DRAG) return;
		const simplified = simplify(stroke, FREEHAND_TOLERANCE);
		const points = simplified.map(p => toLatLng(ctx, p));
		if (points.length < 2) return;
		const item: Omit<InkPath, 'id' | 'layer'> = {
			kind: 'freehand',
			scaleWithMap: true,
			points,
			style: ctx.store.currentStyle('freehand'),
		};
		ctx.store.addItem(item);
	}
}
