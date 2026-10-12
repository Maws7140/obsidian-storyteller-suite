/**
 * Path and area tools. Click to add points, with a rubber band to the pointer.
 *
 * Path: finish with a double click (mouse), Enter, or finish() for a touch Finish
 * button. Area: the same, and clicking the first point closes the shape. Backspace
 * removes the last point. Escape cancels the draft. Switching tools completes a
 * draft that has enough points, and drops one that does not.
 *
 * Pure TypeScript: no Obsidian imports.
 */
import type { InkArea, InkPath, InkPoint } from '../model';
import type { InkToolId } from '../storeTypes';
import { defaultScaleWithMap, SNAP_RADIUS, distance, eyedropAt, pathDraft, snapLatLng, startDrawSession, toContainer } from './types';
import type { DrawSession, InkTool, InkToolContext } from './types';
import type { Point } from '../geometry';

/** A click this close to the previous point adds nothing (a double click adds one point, not two). */
const DUPLICATE_RADIUS = 2;

abstract class PolyTool implements InkTool {
	abstract readonly id: InkToolId;
	protected abstract readonly closed: boolean;
	private session: DrawSession | undefined;
	private ctx: InkToolContext | undefined;
	private points: InkPoint[] = [];
	private cursor: InkPoint | undefined;
	private pointerType = 'mouse';

	private get minimum(): number {
		return this.closed ? 3 : 2;
	}

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.ctx = ctx;
		this.session = startDrawSession(ctx, 'crosshair', {
			down: (e, p) => {
				this.pointerType = e.pointerType;
				if (eyedropAt(ctx, e, this.id)) return;
				if (this.closed && this.points.length >= this.minimum && this.nearFirst(p)) {
					this.finish();
					return;
				}
				const at = snapLatLng(ctx, p, e);
				const last = this.points[this.points.length - 1];
				if (last && distance(toContainer(ctx, last), toContainer(ctx, at)) < DUPLICATE_RADIUS) return;
				this.points.push(at);
				this.cursor = at;
				this.redraw();
			},
			move: (e, p) => {
				if (this.points.length === 0) return;
				this.cursor = snapLatLng(ctx, p, e);
				this.redraw();
			},
			dblclick: () => {
				if (this.pointerType === 'mouse') this.finish();
			},
			cancel: () => this.redraw(),
		});
	}

	deactivate(): void {
		if (this.points.length >= this.minimum) this.finish();
		this.reset();
		this.session?.end();
		this.session = undefined;
		this.ctx = undefined;
	}

	/** Finish the draft, for a touch Finish button. Returns false when there are too few points. */
	finish(): boolean {
		const ctx = this.ctx;
		if (!ctx || this.points.length < this.minimum) return false;
		const points = this.points.slice();
		this.reset();
		if (this.closed) {
			const area: Omit<InkArea, 'id' | 'layer'> = {
				kind: 'area',
				scaleWithMap: defaultScaleWithMap(ctx),
				points,
				style: ctx.store.currentStyle('area'),
			};
			ctx.store.addItem(area);
		} else {
			const path: Omit<InkPath, 'id' | 'layer'> = {
				kind: 'path',
				scaleWithMap: defaultScaleWithMap(ctx),
				points,
				style: ctx.store.currentStyle('path'),
			};
			ctx.store.addItem(path);
		}
		return true;
	}

	/** True while points are placed and not yet finished. */
	hasDraft(): boolean {
		return this.points.length > 0;
	}

	onKey(e: KeyboardEvent): boolean {
		switch (e.key) {
			case 'Enter':
				return this.finish();
			case 'Backspace':
				if (this.points.length === 0) return false;
				this.points.pop();
				this.cursor = this.points.length > 0 ? this.cursor : undefined;
				this.redraw();
				return true;
			case 'Escape':
				if (this.points.length === 0) return false;
				this.reset();
				return true;
			default:
				return false;
		}
	}

	private nearFirst(p: Point): boolean {
		const ctx = this.ctx;
		if (!ctx || this.points.length === 0) return false;
		return distance(toContainer(ctx, this.points[0]), p) <= SNAP_RADIUS;
	}

	private reset(): void {
		this.points = [];
		this.cursor = undefined;
		this.session?.preview.clear();
	}

	private redraw(): void {
		const ctx = this.ctx;
		const session = this.session;
		if (!ctx || !session) return;
		if (this.points.length === 0) {
			session.preview.clear();
			return;
		}
		const shape = this.cursor ? [...this.points, this.cursor] : this.points.slice();
		const style = ctx.store.currentStyle(this.closed ? 'area' : 'path');
		const draft = this.closed
			? { id: 'draft', kind: 'area' as const, layer: 'draft', scaleWithMap: defaultScaleWithMap(ctx), points: shape, style }
			: pathDraft(shape, style);
		session.preview.draw([draft], this.points);
	}
}

export class PathTool extends PolyTool {
	readonly id: InkToolId = 'path';
	protected readonly closed = false;
}

export class AreaTool extends PolyTool {
	readonly id: InkToolId = 'area';
	protected readonly closed = true;
}
