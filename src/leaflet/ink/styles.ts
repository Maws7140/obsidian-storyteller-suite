/**
 * Default styles, the swatch palette and built-in presets for Map Ink.
 * A preset only sets the starting style for a new item. Changing a preset never
 * changes items that are already drawn.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkStyle, InkTextStyle } from './model';

export type InkPresetFit = 'path' | 'area' | 'text' | 'stamp';

export interface InkPreset {
	id: string;
	name: string;
	fits: InkPresetFit;
	/** Presets with the same group are listed together in the inspector under the group name. */
	group?: string;
	style?: Partial<InkStyle>;
	textStyle?: Partial<InkTextStyle>;
}

/** Group name for the hand-inked pack: monochrome brush lines and ink-only terrain fills. */
export const HAND_INKED_GROUP = 'Hand-inked';

/** The ink colour of the hand-inked pack: a warm near-black, like brown ink on paper. */
export const INK_COLOUR = '#2b2118';

/** New shapes and areas: a visible brown edge with a soft tan fill, readable on parchment. */
export const DEFAULT_STYLE: InkStyle = {
	stroke: '#5b4a3a',
	strokeWidth: 2,
	strokeOpacity: 1,
	dash: 'solid',
	fill: '#c9a66b',
	fillOpacity: 0.25,
	fillPattern: 'none',
};

/** New paths and freehand lines: the same brown edge, a little heavier, and no fill to show. */
export const DEFAULT_PATH_STYLE: InkStyle = {
	...DEFAULT_STYLE,
	strokeWidth: 3,
};

/** New text: the label-place look (serif, small, dark ink on a parchment halo). */
export const DEFAULT_TEXT_STYLE: InkTextStyle = {
	font: 'serif',
	size: 14,
	color: '#2b1d12',
	halo: '#f4ecd8',
	haloWidth: 3,
	letterSpacing: 0,
	align: 'middle',
};

/** 24 colours that read on parchment and on dark backgrounds. */
export const SWATCHES: readonly string[] = [
	'#3b82c4', '#1f5fa8', '#6fa8dc', '#0b3d66',
	'#2e7d6b', '#3f7d3a', '#6aa84f', '#2e5e3a',
	'#8fbc5a', '#4a7c59', '#8b5a2b', '#a0522d',
	'#c49a6c', '#5c3a21', '#2b2b2b', '#5f6368',
	'#9aa0a6', '#b03a2e', '#8e2c2c', '#e0645a',
	'#c9a227', '#d4a017', '#7b4fa0', '#c2185b',
];

const LABEL_HALO = '#f4ecd8';
const LABEL_INK = '#2b1d12';

/** One brush per hand-inked line preset: the brush id, its name and a sensible width. */
export const HAND_INKED_BRUSHES: ReadonlyArray<{ brush: string; name: string; width: number }> = [
	{ brush: 'cliff', name: 'Cliff', width: 2 },
	{ brush: 'ledge', name: 'Ledge', width: 1.5 },
	{ brush: 'ridge', name: 'Ridge', width: 2 },
	{ brush: 'chasm', name: 'Chasm', width: 2.5 },
	{ brush: 'rocky-shore', name: 'Rocky shore', width: 2 },
	{ brush: 'river', name: 'River', width: 3 },
	{ brush: 'stream', name: 'Stream', width: 1.5 },
	{ brush: 'rapids', name: 'Rapids', width: 2 },
	{ brush: 'treeline', name: 'Treeline', width: 2 },
	{ brush: 'marsh-edge', name: 'Marsh edge', width: 1.5 },
	{ brush: 'wall', name: 'Wall', width: 4 },
	{ brush: 'stone-wall', name: 'Stone wall', width: 4 },
	{ brush: 'castle-wall', name: 'Castle wall', width: 4 },
	{ brush: 'palisade', name: 'Palisade', width: 2.5 },
	{ brush: 'fence', name: 'Fence', width: 1.5 },
	{ brush: 'bars', name: 'Bars', width: 2.5 },
	{ brush: 'ditch', name: 'Ditch', width: 2 },
	{ brush: 'road', name: 'Road', width: 3 },
	{ brush: 'track', name: 'Track', width: 2 },
	{ brush: 'trail', name: 'Trail', width: 1.5 },
	{ brush: 'railway', name: 'Railway', width: 2.5 },
	{ brush: 'border', name: 'Border', width: 1.5 },
	{ brush: 'province-line', name: 'Province line', width: 1.5 },
	{ brush: 'offmap', name: 'Off-map edge', width: 4 },
	{ brush: 'unexplored', name: 'Unexplored', width: 1.5 },
];

/** Ink-only terrain fills: no tint, the symbol repeated in the ink colour, an ink outline. */
export const HAND_INKED_FILLS: ReadonlyArray<{ symbol: string; name: string }> = [
	{ symbol: 'tree', name: 'Trees' },
	{ symbol: 'hill', name: 'Hills' },
	{ symbol: 'mountain', name: 'Mountains' },
	{ symbol: 'wave', name: 'Water' },
	{ symbol: 'reeds', name: 'Reeds' },
	{ symbol: 'dune', name: 'Dunes' },
];

const HAND_INKED_PRESETS: readonly InkPreset[] = [
	...HAND_INKED_BRUSHES.map(({ brush, name, width }): InkPreset => ({
		id: `ink-${brush}`,
		name,
		fits: 'path',
		group: HAND_INKED_GROUP,
		style: { stroke: INK_COLOUR, strokeWidth: width, strokeOpacity: 1, brush },
	})),
	...HAND_INKED_FILLS.map(({ symbol, name }): InkPreset => ({
		id: `ink-fill-${symbol}`,
		name,
		fits: 'area',
		group: HAND_INKED_GROUP,
		style: {
			stroke: INK_COLOUR,
			strokeWidth: 1.5,
			fill: INK_COLOUR,
			fillOpacity: 0,
			// Water uses the continuous wave rows, the old hand-drawn water fill.
			fillPattern: symbol === 'wave' ? 'waves' : `symbol:${symbol}`,
			patternColor: INK_COLOUR,
		},
	})),
];

export const PRESETS: readonly InkPreset[] = [
	// Areas
	{ id: 'water', name: 'Water', fits: 'area',
		style: { stroke: '#1f5fa8', strokeWidth: 1.5, fill: '#3b82c4', fillOpacity: 0.16, fillPattern: 'waves', patternColor: '#2a6aa8' } },
	{ id: 'deep-water', name: 'Deep water', fits: 'area',
		style: { stroke: '#0b3d66', strokeWidth: 2, fill: '#1f5fa8', fillOpacity: 0.3, fillPattern: 'waves', patternColor: '#0b3d66' } },
	{ id: 'forest', name: 'Forest', fits: 'area',
		style: { stroke: '#2e5e3a', strokeWidth: 1.5, fill: '#3f7d3a', fillOpacity: 0.3, fillPattern: 'symbol:tree' } },
	{ id: 'jungle', name: 'Jungle', fits: 'area',
		style: { stroke: '#1d3d26', strokeWidth: 1.5, fill: '#2e5e3a', fillOpacity: 0.35, fillPattern: 'symbol:palm' } },
	{ id: 'hills', name: 'Hills', fits: 'area',
		style: { stroke: '#5a7d3a', strokeWidth: 1.5, fill: '#8fbc5a', fillOpacity: 0.3, fillPattern: 'symbol:hill' } },
	{ id: 'mountains', name: 'Mountains', fits: 'area',
		style: { stroke: '#5c4a3a', strokeWidth: 2, fill: '#8c7b6b', fillOpacity: 0.3, fillPattern: 'symbol:mountain' } },
	{ id: 'plains', name: 'Plains', fits: 'area',
		style: { stroke: '#8f7f2a', strokeWidth: 1, fill: '#c9b458', fillOpacity: 0.25, fillPattern: 'dots' } },
	{ id: 'desert', name: 'Desert', fits: 'area',
		style: { stroke: '#b8860b', strokeWidth: 1, fill: '#d4a017', fillOpacity: 0.25, fillPattern: 'dots' } },
	{ id: 'swamp', name: 'Swamp', fits: 'area',
		style: { stroke: '#3c5a3a', strokeWidth: 1.5, fill: '#5c7a5a', fillOpacity: 0.3, fillPattern: 'hatch' } },
	{ id: 'ice', name: 'Ice', fits: 'area',
		style: { stroke: '#6fa8dc', strokeWidth: 1.5, fill: '#cfe8f5', fillOpacity: 0.5, fillPattern: 'none' } },
	{ id: 'region-outline', name: 'Region outline', fits: 'area',
		style: { stroke: '#5f6368', strokeWidth: 2, dash: 'dashed', fill: '#5f6368', fillOpacity: 0, fillPattern: 'none' } },

	// Paths
	{ id: 'river', name: 'River', fits: 'path',
		style: { stroke: '#3b6fa8', strokeWidth: 3, dash: 'wavy' } },
	{ id: 'stream', name: 'Stream', fits: 'path',
		style: { stroke: '#5f8fc4', strokeWidth: 1.6, dash: 'wavy' } },
	{ id: 'road', name: 'Road', fits: 'path',
		style: { stroke: '#7a5c3a', strokeWidth: 3, dash: 'solid' } },
	{ id: 'track', name: 'Track', fits: 'path',
		style: { stroke: '#8b6b4a', strokeWidth: 2, dash: 'dashed' } },
	{ id: 'trail', name: 'Trail', fits: 'path',
		style: { stroke: '#6b5a3e', strokeWidth: 1.5, dash: 'dotted' } },
	{ id: 'wall', name: 'Wall', fits: 'path',
		style: { stroke: '#2b2b2b', strokeWidth: 4, dash: 'solid' } },
	{ id: 'border', name: 'Border', fits: 'path',
		style: { stroke: '#8e2c2c', strokeWidth: 2, dash: 'double' } },
	{ id: 'cliff', name: 'Cliff', fits: 'path',
		style: { stroke: '#5c4a3a', strokeWidth: 2, dash: 'ticked' } },

	// Text
	{ id: 'label-title', name: 'Label (map title)', fits: 'text',
		textStyle: { font: 'serif', size: 28, bold: true, letterSpacing: 0.15, color: LABEL_INK, halo: LABEL_HALO, haloWidth: 5, align: 'middle' } },
	{ id: 'label-place', name: 'Label (place)', fits: 'text',
		textStyle: { font: 'serif', size: 12, color: LABEL_INK, halo: LABEL_HALO, haloWidth: 3, align: 'middle' } },
	{ id: 'label-water', name: 'Label (water)', fits: 'text',
		textStyle: { font: 'serif', size: 13, italic: true, color: '#1f5fa8', halo: LABEL_HALO, haloWidth: 3, align: 'middle' } },

	...HAND_INKED_PRESETS,
];

/** Look up a built-in preset by id. */
export function findPreset(id: string): InkPreset | undefined {
	return PRESETS.find(p => p.id === id);
}

/**
 * Copy `patch` over `base`. A key set to undefined in `patch` is removed from the
 * result, so a patch can clear an optional field such as `brush`. Returns a new
 * object; neither argument is changed.
 */
export function withPatch<T extends object>(base: T, patch: Partial<T>): T {
	const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
	for (const key of Object.keys(patch)) {
		const value = (patch as Record<string, unknown>)[key];
		if (value === undefined) delete out[key];
		else out[key] = value;
	}
	return out as T;
}

/**
 * Copy `patch` over `base`, skipping undefined values. Returns a new object;
 * neither argument is changed.
 */
export function mergeStyle<T extends object>(base: T, patch?: Partial<T>): T {
	const out: T = { ...base };
	if (!patch) return out;
	for (const key of Object.keys(patch) as Array<keyof T>) {
		const value = patch[key];
		if (value !== undefined) out[key] = value as T[keyof T];
	}
	return out;
}

/**
 * Starting style for an item from a preset. Presets fit 'text' use textStyle;
 * the other kinds use style.
 */
export function applyPreset(base: InkStyle, preset: InkPreset): InkStyle;
export function applyPreset(base: InkTextStyle, preset: InkPreset): InkTextStyle;
export function applyPreset(base: InkStyle | InkTextStyle, preset: InkPreset): InkStyle | InkTextStyle {
	if (preset.fits === 'text') return mergeStyle(base as InkTextStyle, preset.textStyle);
	return mergeStyle(base as InkStyle, preset.style);
}
