/**
 * Map interaction for Maplog: places points and openings with a click, draws
 * lines and areas point by point, and opens the menu for a placed item. Every
 * change goes through the host's save, which writes the map note.
 */
import * as L from 'leaflet';
import { App, Menu, Notice } from 'obsidian';
import { getMaplogMark } from './catalogue';
import {
    createMaplogArea,
    createMaplogLine,
    createMaplogMark,
    isPlacedMark,
    type MaplogToolState,
} from './draft';
import { MaplogEditModal, type MaplogItemEdits } from './MaplogEditModal';
import {
    removeMaplogItem,
    updateMaplogArea,
    updateMaplogLine,
    updateMaplogMark,
    type MaplogData,
    type MaplogItemRef,
    type MaplogLatLng,
} from './model';

export interface MaplogEditorHost {
    app: App;
    getMap(): L.Map | null;
    getData(): MaplogData;
    /** Write the whole Maplog state to the map note. Rejects when the note cannot be written. */
    save(next: MaplogData): Promise<void>;
    /** Escape with nothing in progress: the tool was disarmed. */
    onDisarm(): void;
}

const DRAFT_STYLE: L.PolylineOptions = { color: '#7c4dff', weight: 2, dashArray: '4 4', interactive: false };

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/** A double click made with a mouse, not synthesised from touch or pen taps. */
function isMouseDoubleClick(event: MouseEvent | undefined): boolean {
    if (!event) return false;
    const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities;
    if (capabilities?.firesTouchEvents) return false;
    const pointerType = (event as MouseEvent & { pointerType?: string }).pointerType;
    return !pointerType || pointerType === 'mouse';
}

export class MaplogEditor {
    private tool: MaplogToolState | null = null;
    private points: L.LatLng[] = [];
    private finishing = false;
    private preview: L.Polyline | null = null;
    private bound: L.Map | null = null;
    private zoomWasEnabled: boolean | null = null;

    private readonly onClick = (event: L.LeafletMouseEvent): void => this.handleClick(event);
    private readonly onDoubleClick = (event: L.LeafletMouseEvent): void => this.handleDoubleClick(event);
    private readonly onMove = (event: L.LeafletMouseEvent): void => this.handleMove(event);
    private readonly onKey = (event: KeyboardEvent): void => this.handleKey(event);

    constructor(private readonly host: MaplogEditorHost) {}

    /** Arm a tool, or disarm with null. Changing between point and drawn marks abandons the draft. */
    setTool(tool: MaplogToolState | null): void {
        const previous = this.tool;
        this.tool = tool;
        if (!tool || (previous && isPlacedMark(previous.markId) !== isPlacedMark(tool.markId))) this.cancelDraft();
        this.attach(tool !== null);
        this.syncDoubleClickZoom();
    }

    /** Finish the line or area being drawn (the palette's Finish button). */
    finish(): void {
        void this.finishDraft();
    }

    /** Remove the last point of the line or area being drawn. */
    undoPoint(): void {
        this.points.pop();
        this.updatePreview(null);
    }

    /** Drop the line or area being drawn and keep the tool armed. */
    cancel(): void {
        this.cancelDraft();
    }

    destroy(): void {
        this.cancelDraft();
        this.attach(false);
        this.tool = null;
    }

    /** The menu for a placed item: edit, confirm or unconfirm, rotate, delete. */
    openItemMenu(ref: MaplogItemRef, event: MouseEvent): void {
        const item = this.find(ref);
        if (!item) return;
        const menu = new Menu();
        menu.addItem(entry => entry.setTitle('Edit details').setIcon('pencil').onClick(() => this.openEditor(ref)));
        menu.addItem(entry => entry
            .setTitle(item.dashed ? 'Mark as confirmed' : 'Mark as unconfirmed')
            .setIcon(item.dashed ? 'check' : 'help-circle')
            .onClick(() => { void this.patch(ref, { dashed: !item.dashed }); }));
        if (ref.type === 'mark' && getMaplogMark(item.mark)?.rotatable) {
            menu.addItem(entry => entry
                .setTitle('Rotate 45 degrees')
                .setIcon('rotate-cw')
                .onClick(() => { void this.patch(ref, { rotation: ((item.rotation ?? 0) + 45) % 360 }); }));
        }
        menu.addSeparator();
        menu.addItem(entry => entry
            .setTitle('Delete')
            .setIcon('trash-2')
            .onClick(() => { void this.remove(ref); }));
        menu.showAtMouseEvent(event);
    }

    private find(ref: MaplogItemRef): { mark: string; dashed?: boolean; rotation?: number } | undefined {
        const data = this.host.getData();
        if (ref.type === 'mark') return data.marks.find(item => item.id === ref.id);
        if (ref.type === 'line') return data.lines.find(item => item.id === ref.id);
        return data.areas.find(item => item.id === ref.id);
    }

    private openEditor(ref: MaplogItemRef): void {
        const data = this.host.getData();
        if (ref.type === 'mark') {
            const item = data.marks.find(m => m.id === ref.id);
            if (item) {
                new MaplogEditModal(this.host.app, {
                    ref, mark: item.mark, attributes: item.attributes, dashed: item.dashed, label: item.label,
                    rotation: item.rotation, grade: item.grade, level: item.level, destination: item.destination, placeId: item.placeId,
                }, edits => this.patch(ref, edits)).open();
            }
        } else if (ref.type === 'line') {
            const item = data.lines.find(l => l.id === ref.id);
            if (item) new MaplogEditModal(this.host.app, { ref, mark: item.mark, attributes: item.attributes, dashed: item.dashed, label: item.label }, edits => this.patch(ref, edits)).open();
        } else {
            const item = data.areas.find(a => a.id === ref.id);
            if (item) new MaplogEditModal(this.host.app, { ref, mark: item.mark, dashed: item.dashed, label: item.label }, edits => this.patch(ref, edits)).open();
        }
    }

    private async patch(ref: MaplogItemRef, edits: MaplogItemEdits): Promise<void> {
        const data = this.host.getData();
        const next = ref.type === 'mark'
            ? updateMaplogMark(data, ref.id, item => ({ ...item, ...edits }))
            : ref.type === 'line'
                ? updateMaplogLine(data, ref.id, item => ({ ...item, ...edits }))
                : updateMaplogArea(data, ref.id, item => ({ ...item, ...edits }));
        await this.commit(next);
    }

    private async remove(ref: MaplogItemRef): Promise<void> {
        await this.commit(removeMaplogItem(this.host.getData(), ref));
    }

    /** Resolves true when the save committed, false (after a Notice) when it failed. */
    private async commit(next: MaplogData): Promise<boolean> {
        try {
            await this.host.save(next);
            return true;
        } catch (error) {
            new Notice(`Maplog could not save: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private attach(on: boolean): void {
        const map = this.host.getMap();
        if (this.bound && this.bound !== map) this.detach(this.bound);
        if (!map) return;
        if (on && this.bound !== map) {
            map.on('click', this.onClick);
            map.on('dblclick', this.onDoubleClick);
            map.on('mousemove', this.onMove);
            activeDocument.addEventListener('keydown', this.onKey);
            this.bound = map;
        } else if (!on && this.bound) {
            this.detach(this.bound);
        }
    }

    private detach(map: L.Map): void {
        map.off('click', this.onClick);
        map.off('dblclick', this.onDoubleClick);
        map.off('mousemove', this.onMove);
        activeDocument.removeEventListener('keydown', this.onKey);
        if (this.bound === map) this.bound = null;
        this.preview?.remove();
        this.preview = null;
        this.points = [];
        this.restoreDoubleClickZoom(map);
    }

    /** Double-clicking finishes a drawn line or area, so it must not also zoom the map. */
    private syncDoubleClickZoom(): void {
        const map = this.bound ?? this.host.getMap();
        if (!map) return;
        const drawing = this.tool !== null && !isPlacedMark(this.tool.markId);
        if (drawing) {
            if (this.zoomWasEnabled === null) this.zoomWasEnabled = map.doubleClickZoom.enabled();
            map.doubleClickZoom.disable();
        } else {
            this.restoreDoubleClickZoom(map);
        }
    }

    private restoreDoubleClickZoom(map: L.Map): void {
        if (this.zoomWasEnabled === null) return;
        if (this.zoomWasEnabled) map.doubleClickZoom.enable();
        this.zoomWasEnabled = null;
    }

    /** Bind to the current map again, for example after the view rendered a new one. */
    rebind(): void {
        if (this.tool) this.attach(true);
    }

    private handleClick(event: L.LeafletMouseEvent): void {
        const tool = this.tool;
        if (!tool) return;
        if (isPlacedMark(tool.markId)) {
            void this.placeMark(tool, [event.latlng.lat, event.latlng.lng]);
            return;
        }
        const last = this.points[this.points.length - 1];
        if (last && last.equals(event.latlng)) return;
        this.points.push(event.latlng);
        this.updatePreview(null);
    }

    private async placeMark(tool: MaplogToolState, latlng: MaplogLatLng): Promise<void> {
        const data = this.host.getData();
        const record = createMaplogMark(tool, latlng, data);
        if (typeof record === 'string') {
            new Notice(record);
            return;
        }
        await this.commit({ ...data, marks: [...data.marks, record] });
    }

    private handleDoubleClick(event: L.LeafletMouseEvent): void {
        if (!this.tool || isPlacedMark(this.tool.markId)) return;
        event.originalEvent?.preventDefault();
        // Quick taps on a touchscreen or pen arrive as a double click and would end the line after
        // two points. Only a mouse double click on the last point finishes; touch uses Finish.
        if (!isMouseDoubleClick(event.originalEvent)) return;
        const last = this.points[this.points.length - 1];
        const map = this.bound;
        if (last && map && map.latLngToContainerPoint(last).distanceTo(event.containerPoint) > 12) return;
        void this.finishDraft();
    }

    private handleMove(event: L.LeafletMouseEvent): void {
        if (!this.preview || this.points.length === 0) return;
        this.updatePreview(event.latlng);
    }

    private handleKey(event: KeyboardEvent): void {
        const tool = this.tool;
        if (!tool || isTypingTarget(event.target)) return;
        if (event.key === 'Escape') {
            if (this.points.length > 0) {
                this.cancelDraft();
            } else {
                this.setTool(null);
                this.host.onDisarm();
            }
            return;
        }
        if (isPlacedMark(tool.markId) || this.points.length === 0) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            void this.finishDraft();
        } else if (event.key === 'Backspace') {
            event.preventDefault();
            this.points.pop();
            this.updatePreview(null);
        }
    }

    private async finishDraft(): Promise<void> {
        // Points stay until the save commits, so a second Finish during the save must not commit them again.
        if (this.finishing) return;
        this.finishing = true;
        try {
            await this.commitDraft();
        } finally {
            this.finishing = false;
        }
    }

    private async commitDraft(): Promise<void> {
        const tool = this.tool;
        if (!tool || this.points.length === 0) return;
        const latlngs: MaplogLatLng[] = this.points.map(p => [p.lat, p.lng]);
        const data = this.host.getData();
        if (getMaplogMark(tool.markId)?.kind === 'area') {
            const area = createMaplogArea(tool, latlngs, data);
            if (typeof area === 'string') {
                new Notice(area);
                return;
            }
            // Keep the points until the save commits so a failed save can be retried.
            if (await this.commit({ ...data, areas: [...data.areas, area] })) this.cancelDraft();
            return;
        }
        const line = createMaplogLine(tool, latlngs, data);
        if (typeof line === 'string') {
            new Notice(line);
            return;
        }
        // Keep the points until the save commits so a failed save can be retried.
        if (await this.commit({ ...data, lines: [...data.lines, line] })) this.cancelDraft();
    }

    private cancelDraft(): void {
        this.points = [];
        this.preview?.remove();
        this.preview = null;
    }

    /** Redraw the rubber-band line from the last point to the cursor (or just the points). */
    private updatePreview(cursor: L.LatLng | null): void {
        const map = this.bound;
        if (!map) return;
        if (this.points.length === 0) {
            this.preview?.remove();
            this.preview = null;
            return;
        }
        const latlngs = cursor ? [...this.points, cursor] : [...this.points];
        if (!this.preview) {
            this.preview = L.polyline(latlngs, DRAFT_STYLE).addTo(map);
        } else {
            this.preview.setLatLngs(latlngs);
        }
    }
}
