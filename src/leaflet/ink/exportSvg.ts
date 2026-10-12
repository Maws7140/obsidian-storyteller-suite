/**
 * The Map Ink drawing as an SVG document, for image export. Items are laid out the
 * way the live layer lays them out, and the whole drawing is placed and scaled to the
 * export canvas. Keep-size items keep their on-screen size at the export scale.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { buildScene, fmt } from './svgBuild';
import type { Projector } from './svgBuild';
import type { InkDoc } from './model';

export interface InkExportView {
	/** Export canvas size in pixels. */
	width: number;
	height: number;
	/** Canvas position of the reference origin (reference pixel 0, 0). */
	originX: number;
	originY: number;
	/** Canvas pixels per reference pixel at the export size. */
	scale: number;
	/** Screen pixels per reference pixel in the live view. Keep-size items are counter-scaled by its inverse. */
	viewScale: number;
	/** Latlng to reference pixels, as the live layer projects. */
	project: Projector;
}

/** The SVG markup for the whole drawing, sized to the export canvas. Hidden items and layers are left out. */
export function buildInkExportSvg(doc: InkDoc, view: InkExportView): string {
	const scene = buildScene(doc, { project: view.project, readOnly: true, idPrefix: 'ink-export-' });
	const counter = fmt(1 / view.viewScale);
	// Keep-size groups are emitted with a unit counter scale. Their real scale depends on the view.
	const items = scene.items
		.map(item => item.svg)
		.join('')
		.replace(/scale\(1\)" data-ink-counter="1"/g, `scale(${counter})" data-ink-counter="1"`);
	const w = fmt(view.width);
	const h = fmt(view.height);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
		`<defs>${scene.defs}</defs>` +
		`<g transform="translate(${fmt(view.originX)} ${fmt(view.originY)}) scale(${fmt(view.scale)})">${items}</g>` +
		'</svg>'
	);
}
