/**
 * The part of InkStore that the UI components use. The UI is written against
 * this interface, so it can be tested with a fake store.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkDoc, InkItem, InkKind, InkStyle, InkTextStyle } from './model';

export type InkToolId = 'select' | 'pan' | 'stamp' | 'text' | 'path' | 'area' | 'freehand' | 'rect' | 'ellipse';

export interface InkStoreLike {
	readonly doc: InkDoc;
	readonly selection: ReadonlySet<string>;
	readonly tool: InkToolId;
	currentStyle(kind: InkKind): InkStyle;
	currentTextStyle(): InkTextStyle;
	currentSymbol(): string;
	recentColors(): string[];
	setTool(t: InkToolId): void;
	setCurrentStyle(patch: Partial<InkStyle>): void;
	setCurrentTextStyle(patch: Partial<InkTextStyle>): void;
	setCurrentSymbol(id: string): void;
	/** Edits every selected item. Edits sharing a coalesceKey merge into one undo step. */
	updateSelected(patch: (item: InkItem) => InkItem, coalesceKey?: string): void;
	applyPresetToSelection(id: string): void;
	deleteSelected(): void;
	bringForward(): void;
	sendBackward(): void;
	setSelectedLayer(layerId: string): void;
	undo(): void;
	redo(): void;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	on(event: 'change', fn: () => void): () => void;
}
