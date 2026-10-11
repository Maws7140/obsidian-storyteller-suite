/**
 * Types shared by the Map Ink select tool, the keyboard handler and the transforms.
 *
 * InkSelectStore is the contract the InkStore must meet. It extends InkStoreLike, so
 * the UI components and the select tool see the same store.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no Leaflet import. The map and the
 * Leaflet namespace are passed in with the structural types below.
 */
import type { InkDoc, InkPoint } from '../model';
import type { InkStoreLike } from '../storeTypes';
import type { InkHost } from '../host';
import type { InkLayer, InkLeafletNamespace } from '../InkLayer';

export interface InkSelectStore extends InkStoreLike {
	/** Replace the selection. */
	select(ids: Iterable<string>): void;
	/** Add the id to the selection, or remove it when it is already selected. */
	toggleSelect(id: string): void;
	clearSelection(): void;
	/**
	 * Change the document. One undo step per coalesceKey run. Normalises and saves.
	 * `change` receives the current document and must return the next one.
	 */
	apply(change: (doc: InkDoc) => InkDoc, coalesceKey?: string): void;
	/** Write any pending save now. */
	flush(): Promise<void>;
	/** The layer id that new items go to. */
	activeLayer(): string;
}

/** The part of a Leaflet map the select tool uses. A real Leaflet Map fits. */
export interface InkSelectMap {
	getContainer(): HTMLElement;
	getZoom(): number;
	getMinZoom(): number;
	options: { crs?: unknown };
	project(latlng: [number, number], zoom?: number): { x: number; y: number };
	unproject(point: [number, number], zoom?: number): { lat: number; lng: number };
	containerPointToLatLng(point: [number, number]): { lat: number; lng: number };
	latLngToContainerPoint(latlng: [number, number]): { x: number; y: number };
	getZoomScale(toZoom: number, fromZoom: number): number;
	dragging?: { enable(): void; disable(): void; enabled(): boolean };
}

/** The part of the ink layer the select tool uses. The real layer from createInkLayer fits. */
export type InkSelectLayer = Pick<InkLayer, 'setDoc' | 'setSelection' | 'itemsInRect'>;

export interface InkToolContext {
	/** The Leaflet namespace, passed in so the core never imports Leaflet. */
	L: InkLeafletNamespace;
	map: InkSelectMap;
	store: InkSelectStore;
	layer: InkSelectLayer;
	host: InkHost;
	/**
	 * The reference zoom the layer projects at. Must match the layer's own choice:
	 * pass the same refZoom given to createInkLayer, or leave it out to use the default
	 * (0 for CRS.Simple, else the map's min zoom).
	 */
	refZoom?: number;
	/** Called with the id of a text item the user double-clicked. */
	onEditText?: (id: string) => void;
}

/** A tool module. The select tool, and later the draw tools, have this shape. */
export interface InkToolLike {
	readonly id: string;
	activate(ctx: InkToolContext): void;
	deactivate(): void;
	/** Returns true when the key was handled. */
	onKey?(e: KeyboardEvent): boolean;
}

/** A point in latlng, as [lat, lng]. */
export type LatLngPoint = InkPoint;
