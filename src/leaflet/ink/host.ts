/**
 * The seam between Map Ink and the app that hosts it. The core never imports
 * Obsidian. Storyteller implements this in ink/obsidian/ObsidianInkHost.ts.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkDoc, InkPoint } from './model';
import type { InkPreset } from './styles';

/** One entry in a context menu opened with showMenu. */
export interface InkMenuItem {
	title: string;
	icon?: string;
	onClick: () => void;
	disabled?: boolean;
	separatorBefore?: boolean;
}

export interface InkHost {
	/** Show a short message to the user. */
	notify(msg: string): void;
	/** Ask a yes or no question. Resolves true when the user agrees. */
	confirm(msg: string): Promise<boolean>;
	/** Open a context menu at the event position. */
	showMenu(items: InkMenuItem[], event: MouseEvent): void;
	/** Fill `el` with the Lucide icon called `lucideName`. */
	icon(el: HTMLElement, lucideName: string): void;
	/** Let the user pick a Storyteller location. Resolves null when cancelled. */
	pickLocation(): Promise<{ id: string; name: string } | null>;
	/** Open a Storyteller location by id. */
	openLocation(id: string): void;
	/** The saved document. */
	load(): InkDoc;
	/** Save the document. Rejections keep the in-memory document. */
	save(doc: InkDoc): Promise<void>;
	/** Optional snapping, such as the placement grid. Returns the snapped point. */
	snapPoint?(latlng: InkPoint): InkPoint;
	/** Custom presets the user has saved. */
	presets(): InkPreset[];
	/** Store a preset the user created. */
	savePreset(p: InkPreset): void;
}
