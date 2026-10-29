/**
 * Pan tool: the map drags normally. Nothing is drawn and no clicks are taken.
 *
 * Pure TypeScript: no Obsidian imports.
 */
import type { InkToolId } from '../storeTypes';
import type { InkTool, InkToolContext } from './types';

export class PanTool implements InkTool {
	readonly id: InkToolId = 'pan';
	private ctx: InkToolContext | undefined;
	private dragWas = true;
	private cursorWas = '';

	activate(ctx: InkToolContext): void {
		this.deactivate();
		this.ctx = ctx;
		const container = ctx.map.getContainer();
		this.cursorWas = container.style.cursor;
		container.style.cursor = 'grab';
		this.dragWas = ctx.map.dragging.enabled();
		ctx.map.dragging.enable();
	}

	deactivate(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		ctx.map.dragging[this.dragWas ? 'enable' : 'disable']();
		ctx.map.getContainer().style.cursor = this.cursorWas;
		this.ctx = undefined;
	}
}
