/**
 * STUB FOR W5b ONLY. This file is a test-only stand-in so the UI code compiles
 * and runs before W5a merges. The orchestrator replaces it with W5a's brushes.ts
 * at merge. Do not extend it: it has 3 brushes and a single-stroke piece builder.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkStyle } from './model';
import type { Point } from './geometry';

export type BrushCategory = 'natural' | 'manmade' | 'edges';

export interface InkBrush {
	id: string;
	name: string;
	category: BrushCategory;
	keywords: string[];
	oneSided: boolean;
	defaultStyle: Partial<InkStyle>;
	description: string;
}

export type Segment = [Point, Point];

export type BrushPiece =
	| { kind: 'stroke'; points: Point[]; closed?: boolean; width: number; dash?: string; cap?: 'round' | 'butt' | 'square'; opacity?: number }
	| { kind: 'segments'; segments: Segment[]; width: number; cap?: 'round' | 'butt' }
	| { kind: 'dots'; points: Point[]; radius: number; filled: boolean }
	| { kind: 'symbols'; symbol: string; at: { p: Point; angle: number }[]; size: number }
	| { kind: 'polygons'; polygons: Point[][]; filled: boolean; width: number };

/** STUB: three brushes only. W5a supplies the full list. */
export const BRUSHES: readonly InkBrush[] = [
	{ id: 'cliff', name: 'Cliff', category: 'natural', keywords: ['cliff', 'drop', 'edge', 'ledge'], oneSided: true,
		defaultStyle: { strokeWidth: 3 }, description: 'Heavy line with ticks on the drop side.' },
	{ id: 'wall', name: 'Wall', category: 'manmade', keywords: ['wall', 'thick', 'barrier'], oneSided: false,
		defaultStyle: { strokeWidth: 4 }, description: 'Thick solid line.' },
	{ id: 'river', name: 'River', category: 'natural', keywords: ['river', 'water', 'wavy', 'stream'], oneSided: false,
		defaultStyle: { strokeWidth: 3 }, description: 'Wavy line.' },
];

const CATEGORY_NAMES: Record<BrushCategory, string> = {
	natural: 'Natural',
	manmade: 'Man-made',
	edges: 'Edges',
};

export function getBrush(id: string): InkBrush | undefined {
	return BRUSHES.find(brush => brush.id === id);
}

export function brushesByCategory(): { category: BrushCategory; name: string; brushes: InkBrush[] }[] {
	return (['natural', 'manmade', 'edges'] as BrushCategory[]).map(category => ({
		category,
		name: CATEGORY_NAMES[category],
		brushes: BRUSHES.filter(brush => brush.category === category),
	}));
}

/** STUB: one plain stroke through the points, whatever the brush. */
export function brushPieces(
	id: string,
	points: readonly Point[],
	o: { width: number; closed: boolean; flip?: boolean; scale?: number },
): BrushPiece[] {
	if (!getBrush(id)) return [];
	return [{ kind: 'stroke', points: points.slice(), closed: o.closed, width: o.width, cap: 'round' }];
}

/** STUB: a plain line in the given colour. */
export function brushPreviewSvg(
	id: string,
	o: { width?: number; height?: number; color?: string } = {},
): string {
	const width = o.width ?? 64;
	const height = o.height ?? 16;
	const color = o.color ?? 'currentColor';
	const mid = height / 2;
	const known = getBrush(id) ? '' : ' data-unknown-brush="true"';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false"${known}>`
		+ `<path d="M3 ${mid} H${width - 3}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
