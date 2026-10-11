/**
 * Compatibility names for the select tool and the keyboard handler.
 *
 * The tools share one context type, InkToolContext, defined in ./types. The names
 * here are aliases of it, so code written against the older select-only shape still
 * compiles.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no Leaflet import.
 */
import type { InkPoint } from '../model';
import type { InkLayer } from '../InkLayer';
import type { InkTool, InkToolMap, InkToolStore } from './types';

export type { InkToolContext } from './types';
export type InkSelectStore = InkToolStore;
export type InkSelectMap = InkToolMap;
/** The part of the ink layer the select tool uses. */
export type InkSelectLayer = Pick<InkLayer, 'setDoc' | 'setSelection' | 'itemsInRect'>;
/** A tool module. Same as InkTool. */
export type InkToolLike = InkTool;
/** A point in latlng, as [lat, lng]. */
export type LatLngPoint = InkPoint;
