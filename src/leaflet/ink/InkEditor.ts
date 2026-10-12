/**
 * The Map Ink editor: the glue between the store, the drawing layer, the draw
 * tools and the panels. It mounts a toolbar on the left, and on the right an
 * Inspector with a Layers tab, and routes keys to the armed tool.
 *
 * The drawing stays on the map whether the editor is open or closed. Closing it
 * removes the panels and tools, and keeps the layer in sync with the store.
 *
 * Pure TypeScript: no Obsidian imports. Plain DOM only, on the container's own
 * document. The Leaflet namespace and map are passed in.
 */
import { InkStore } from './InkStore';
import { createInkLayer } from './InkLayer';
import type { InkLayer, InkLeafletNamespace as InkLayerLeafletNamespace } from './InkLayer';
import type { InkHost } from './host';
import type { InkDoc } from './model';
import type { InkToolId } from './storeTypes';
import { INK_TOOLS, InkToolbar } from './InkToolbar';
import { InkInspector } from './InkInspector';
import { InkLayersPanel } from './InkLayersPanel';
import { makeEl } from './ui/ColorPicker';
import { createSelectTool } from './tools/select';
import { PanTool } from './tools/pan';
import { StampTool } from './tools/stamp';
import { TextTool, editTextItem } from './tools/text';
import { PathTool, AreaTool } from './tools/path';
import { FreehandTool } from './tools/freehand';
import { RectTool, EllipseTool } from './tools/shape';
import { handleEditorKey, isTypingTarget } from './tools/keyboard';
import type { EditorKeyOptions } from './tools/keyboard';
import type { InkLeafletNamespace as InkToolLeafletNamespace, InkTool, InkToolContext, InkToolMap } from './tools/types';

/** The Leaflet namespace the editor needs: the layer's classes and the tools' event helpers. */
export type InkEditorLeaflet = InkLayerLeafletNamespace & InkToolLeafletNamespace;

/** The part of an InkLegend the editor keeps up to date. */
export interface InkEditorLegend {
	setDoc(doc: InkDoc): void;
}

export interface InkEditorOptions {
	/** The Leaflet namespace, passed in so the core never imports Leaflet. */
	L: InkEditorLeaflet;
	/** The Leaflet map the drawing sits on. */
	map: InkToolMap;
	host: InkHost;
	/** Element that receives the toolbar and the inspector. Normally the map's own container. */
	container: HTMLElement;
	/** The document to edit. */
	doc: InkDoc;
	/** Reference zoom. Leave out for the default, which the layer uses too. */
	refZoom?: number;
	/** The drawing layer. Created on the map here when not given. */
	layer?: InkLayer;
	/** A legend to refresh whenever the document changes. */
	legend?: InkEditorLegend;
}

/** Keys that open a tool from the toolbar, by shortcut letter. */
const TOOL_BY_KEY = new Map(INK_TOOLS.map(tool => [tool.shortcut.toLowerCase(), tool.id] as const));

export class InkEditor {
	readonly store: InkStore;
	private readonly L: InkEditorLeaflet;
	private readonly map: InkToolMap;
	private readonly host: InkHost;
	private readonly container: HTMLElement;
	private readonly refZoom: number | undefined;
	private readonly legend: InkEditorLegend | undefined;
	private readonly layer: InkLayer;
	private readonly ownsLayer: boolean;
	private readonly doc: Document;
	private readonly tools = new Map<InkToolId, InkTool>();
	private readonly unsubscribeStore: () => void;

	private opened = false;
	private destroyed = false;
	/** Whether the last pointer press was on the map or its panels. Keys with no focus target follow it. */
	private pointerInMap = false;
	/** True while a tool is being swapped. Store changes made then must not re-arm a tool. */
	private switching = false;
	private activeId: InkToolId | undefined;
	private context: InkToolContext | undefined;
	private previewPane: HTMLElement | undefined;
	private leftDock: HTMLElement | undefined;
	private rightDock: HTMLElement | undefined;
	private toolbar: InkToolbar | undefined;
	private inspector: InkInspector | undefined;
	private layersPanel: InkLayersPanel | undefined;
	private finishButton: HTMLButtonElement | undefined;
	private readonly disposers: Array<() => void> = [];

	constructor(opts: InkEditorOptions) {
		this.L = opts.L;
		this.map = opts.map;
		this.host = opts.host;
		this.container = opts.container;
		this.refZoom = opts.refZoom;
		this.legend = opts.legend;
		this.doc = opts.container.ownerDocument;
		this.store = new InkStore(opts.host, opts.doc);

		if (opts.layer) {
			this.layer = opts.layer;
			this.ownsLayer = false;
		} else {
			const layerOptions = typeof this.refZoom === 'number' ? { refZoom: this.refZoom } : {};
			this.layer = createInkLayer(this.L, layerOptions).addTo(this.map);
			this.ownsLayer = true;
		}
		this.layer.setReadOnly(true);

		this.tools.set('select', createSelectTool());
		this.tools.set('pan', new PanTool());
		this.tools.set('stamp', new StampTool());
		this.tools.set('text', new TextTool());
		this.tools.set('path', new PathTool());
		this.tools.set('area', new AreaTool());
		this.tools.set('freehand', new FreehandTool());
		this.tools.set('rect', new RectTool());
		this.tools.set('ellipse', new EllipseTool());

		this.unsubscribeStore = this.store.on('change', () => this.onStoreChange());
		this.syncDrawing();
	}

	/** True between open and close. */
	isOpen(): boolean {
		return this.opened;
	}

	/** Mount the panels, arm the select tool and start routing keys. Does nothing when already open. */
	open(): void {
		if (this.opened || this.destroyed) return;
		this.opened = true;
		// Opening the editor counts as working on the map, so shortcuts work straight away.
		this.pointerInMap = true;
		const doc = this.doc;

		this.previewPane = makeEl(doc, 'div', 'ink-preview-pane');
		this.map.getContainer().appendChild(this.previewPane);

		this.context = {
			L: this.L,
			map: this.map,
			store: this.store,
			layer: this.layer,
			host: this.host,
			previewPane: this.previewPane,
			refZoom: this.refZoom,
			onEditText: id => {
				if (this.context) editTextItem(this.context, id);
			},
			onDraftChange: () => this.syncFinish(),
		};

		this.mountDocks();
		this.layer.setReadOnly(false);
		this.listen(doc, 'keydown', this.onKey);
		this.listen(doc, 'pointerdown', this.trackPointer, true);
		this.activate('select');
		this.syncFinish();
	}

	/**
	 * Close the editor: deactivate the tool (which completes any draft), flush the
	 * store, and remove the panels. The drawing stays on the map. Resolves when
	 * the pending save has finished.
	 */
	async close(): Promise<void> {
		if (!this.opened) return;
		this.opened = false;
		this.switching = true;
		try {
			this.deactivateTool();
		} finally {
			this.switching = false;
		}
		this.unmountDocks();
		for (const dispose of this.disposers.splice(0)) dispose();
		this.previewPane?.remove();
		this.previewPane = undefined;
		this.context = undefined;
		this.layer.setSelection([]);
		this.layer.setReadOnly(true);
		this.store.clearSelection();
		await this.store.flush();
	}

	/** Replace the document with one from outside, such as an edit to the note. Unsaved edits are dropped. */
	setDoc(doc: InkDoc): void {
		if (this.destroyed) return;
		if (JSON.stringify(doc) === JSON.stringify(this.store.doc)) return;
		this.store.replaceDoc(doc, { resetHistory: true });
	}

	/** Close, remove every listener and DOM node, and drop the layer if this editor created it. */
	async destroy(): Promise<void> {
		if (this.destroyed) return;
		await this.close();
		this.destroyed = true;
		this.unsubscribeStore();
		for (const tool of this.tools.values()) tool.deactivate();
		this.tools.clear();
		if (this.ownsLayer) this.layer.destroy();
	}

	// ---- tools ----------------------------------------------------------------

	/** Arm a tool. The previous tool is deactivated first, so its draft is completed. */
	private activate(id: InkToolId): void {
		const tool = this.tools.get(id);
		if (!tool || !this.context || this.switching) return;
		this.switching = true;
		try {
			this.deactivateTool();
			this.activeId = id;
			this.store.setTool(id);
			tool.activate(this.context);
		} finally {
			this.switching = false;
		}
		this.syncFinish();
	}

	private deactivateTool(): void {
		const current = this.activeTool();
		this.activeId = undefined;
		current?.deactivate();
	}

	private activeTool(): InkTool | undefined {
		return this.activeId === undefined ? undefined : this.tools.get(this.activeId);
	}

	// ---- store and layer ------------------------------------------------------

	private onStoreChange(): void {
		this.syncDrawing();
		if (!this.opened || this.switching) return;
		if (this.store.tool !== this.activeId) this.activate(this.store.tool);
		this.syncFinish();
	}

	/** Keep the drawing layer and the legend showing the store's document and selection. */
	private syncDrawing(): void {
		this.layer.setDoc(this.store.doc);
		this.layer.setSelection([...this.store.selection]);
		this.legend?.setDoc(this.store.doc);
	}

	// ---- keys -----------------------------------------------------------------

	private readonly onKey = (e: KeyboardEvent): void => {
		if (!this.opened || e.defaultPrevented || e.isComposing) return;
		if (isTypingTarget(e.target) || !this.keyTargetAllowed(e.target)) return;

		// 1. The armed tool gets the key first.
		if (this.activeTool()?.onKey?.(e)) {
			e.preventDefault();
			return;
		}
		// 2. A tool shortcut letter, with no modifiers.
		if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
			const toolId = TOOL_BY_KEY.get(e.key.toLowerCase());
			if (toolId) {
				e.preventDefault();
				this.activate(toolId);
				return;
			}
		}
		// 3. Selection and editing keys.
		if (handleEditorKey(e, this.store, this.keyOptions())) {
			e.preventDefault();
			return;
		}
		// 4. Escape disarms the tool, back to Select.
		if (e.key === 'Escape' && this.activeId !== 'select') {
			e.preventDefault();
			this.activate('select');
		}
	};

	/**
	 * Keys count when they come from the map or its panels. Keys with no focused element (the page
	 * itself) count only when the last press was on the map, so Delete in a sidebar cannot remove an item.
	 */
	private keyTargetAllowed(target: EventTarget | null): boolean {
		const node = target as Node | null;
		if (node && this.container.contains(node)) return true;
		// Clicking the map does not move focus in Obsidian: it stays on whatever had it, such as
		// the Draw button. So the last press decides, not the focused element.
		return this.pointerInMap;
	}

	private readonly trackPointer = (event: PointerEvent): void => {
		const node = event.target as Node | null;
		this.pointerInMap = !!node && this.container.contains(node);
	};

	private keyOptions(): EditorKeyOptions {
		return {
			pxToLatLng: (x: number, y: number) => {
				const ll = this.map.containerPointToLatLng([x, y]);
				return [ll.lat, ll.lng];
			},
		};
	}

	// ---- panels ---------------------------------------------------------------

	private mountDocks(): void {
		const doc = this.doc;

		const left = makeEl(doc, 'div', 'ink-dock ink-dock-left ink-ui');
		this.stopPropagationOf(left);
		this.toolbar = new InkToolbar(left, this.store, this.host);
		this.finishButton = makeEl(doc, 'button', 'ink-finish', { type: 'button', 'aria-label': 'Finish drawing' });
		const finishIcon = makeEl(doc, 'span', 'ink-icon');
		this.host.icon(finishIcon, 'check');
		this.finishButton.appendChild(finishIcon);
		const finishLabel = makeEl(doc, 'span', 'ink-finish-label');
		finishLabel.textContent = 'Finish';
		this.finishButton.appendChild(finishLabel);
		this.finishButton.hidden = true;
		this.finishButton.addEventListener('click', () => {
			this.activeTool()?.finish?.();
			this.syncFinish();
		});
		left.appendChild(this.finishButton);
		this.container.appendChild(left);
		this.leftDock = left;

		const right = makeEl(doc, 'div', 'ink-dock ink-dock-right ink-ui');
		this.stopPropagationOf(right);
		const side = makeEl(doc, 'div', 'ink-side');
		const tabs = makeEl(doc, 'div', 'ink-side-tabs', { role: 'tablist', 'aria-label': 'Map Ink panels' });
		const propertiesTab = this.tabButton('properties', 'Properties', 'sliders-horizontal');
		const layersTab = this.tabButton('layers', 'Layers', 'layers');
		tabs.append(propertiesTab, layersTab);
		const propertiesPanel = makeEl(doc, 'div', 'ink-side-panel', { 'data-panel': 'properties', role: 'tabpanel' });
		const layersPanel = makeEl(doc, 'div', 'ink-side-panel', { 'data-panel': 'layers', role: 'tabpanel' });
		layersPanel.hidden = true;
		const showTab = (name: 'properties' | 'layers'): void => {
			const isProperties = name === 'properties';
			propertiesTab.setAttribute('aria-selected', String(isProperties));
			layersTab.setAttribute('aria-selected', String(!isProperties));
			propertiesTab.classList.toggle('ink-side-tab-active', isProperties);
			layersTab.classList.toggle('ink-side-tab-active', !isProperties);
			propertiesPanel.hidden = !isProperties;
			layersPanel.hidden = isProperties;
		};
		propertiesTab.addEventListener('click', () => showTab('properties'));
		layersTab.addEventListener('click', () => showTab('layers'));

		this.inspector = new InkInspector(propertiesPanel, this.store, this.host);
		this.layersPanel = new InkLayersPanel(layersPanel, this.store, this.host);
		layersPanel.appendChild(this.layersPanel.el);
		side.append(tabs, propertiesPanel, layersPanel);
		right.appendChild(side);
		this.container.appendChild(right);
		this.rightDock = right;
	}

	private unmountDocks(): void {
		this.toolbar?.destroy();
		this.toolbar = undefined;
		this.inspector?.destroy();
		this.inspector = undefined;
		this.layersPanel?.destroy();
		this.layersPanel = undefined;
		this.leftDock?.remove();
		this.leftDock = undefined;
		this.rightDock?.remove();
		this.rightDock = undefined;
		this.finishButton = undefined;
	}

	private tabButton(name: string, label: string, icon: string): HTMLButtonElement {
		const button = makeEl(this.doc, 'button', 'ink-side-tab', {
			type: 'button',
			role: 'tab',
			'aria-selected': 'false',
			'data-tab': name,
		});
		const slot = makeEl(this.doc, 'span', 'ink-icon');
		this.host.icon(slot, icon);
		button.appendChild(slot);
		const text = makeEl(this.doc, 'span', 'ink-side-tab-label');
		text.textContent = label;
		button.appendChild(text);
		return button;
	}

	/** Panel clicks and wheel turns must not reach the map or the tools. */
	private stopPropagationOf(el: HTMLElement): void {
		for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu']) {
			el.addEventListener(type, event => event.stopPropagation());
		}
	}

	/** The Finish button shows while the armed tool holds an unfinished draft. */
	private syncFinish(): void {
		if (!this.finishButton) return;
		const hasDraft = this.opened && !!this.activeTool()?.hasDraft?.();
		this.finishButton.hidden = !hasDraft;
	}

	private listen(target: EventTarget, type: string, fn: EventListener, capture = false): void {
		target.addEventListener(type, fn, capture);
		this.disposers.push(() => target.removeEventListener(type, fn, capture));
	}
}
