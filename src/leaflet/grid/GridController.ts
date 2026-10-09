import { detachFromMaps } from '../../services/MapMembershipService';
import * as L from 'leaflet';
import { Notice, Modal, Setting, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../../main';
import type { Location, StoryMap } from '../../types';
import { LocationModal } from '../../modals/LocationModal';
import { LocationSuggestModal } from '../../modals/LocationSuggestModal';
import { confirmWithModal } from '../../modals/ui/ConfirmModal';
import {
    Cell,
    PlacementGrid,
    Resolution,
    cellAt,
    cellCenter,
    stamp,
    outline,
    overlaps,
    commitArea,
    resizeGrid,
    validateGrid,
} from './GridModel';
export class GridController {
    private grid: PlacementGrid;
    private base: string;
    private locations: Location[] = [];
    private selected = new Set<Cell>();
    private history: Cell[][] = [];
    private future: Cell[][] = [];
    private editing: Location | null = null;
    private canvas: HTMLCanvasElement;
    private toolbar: HTMLElement;
    private panel: HTMLElement;
    private ctx: CanvasRenderingContext2D;
    private show = false;
    private placing = false;
    private snap = true;
    private mode = 'paint';
    private radius = 0;
    private drawing = false;
    private space = false;
    private points: [number, number][] = [];
    private label = '';
    private labelCell?: Cell;
    private busy = false;
    private dead = false;
    private status: HTMLElement;
    private entities: { id?: string; name: string; type: string; filePath?: string; coordinates: [number, number] }[] = [];
    private baseline = '';
    private frame: number | null = null;
    private draftSnapshot = '';
    private hover: Cell | null = null;
    private draftKey() {
        return `storyteller-grid-draft:${this.plugin.app.vault.getName()}:${this.record.id ?? this.record.filePath}`;
    }
    private saveDraft() {
        if (this.dirty() && this.editing) {
            try {
                const snapshot = JSON.stringify({
                    locationId: this.editing.id,
                    cells: [...this.selected],
                    label: this.label,
                    labelCell: this.labelCell,
                    presets: this.grid.presets,
                    base: this.base,
                });
                if (snapshot !== this.draftSnapshot) {
                    localStorage.setItem(this.draftKey(), snapshot);
                    this.draftSnapshot = snapshot;
                }
            } catch {
                new Notice('Could not retain area draft locally. Keep this view open.');
            }
        }
    }
    private clearDraft() {
        try {
            localStorage.removeItem(this.draftKey());
            this.draftSnapshot = '';
        } catch {
            /* unavailable local storage */
        }
    }
    constructor(
        private plugin: StorytellerSuitePlugin,
        private map: L.Map,
        private record: StoryMap,
        private bounds: L.LatLngBounds,
        toolbarHost: HTMLElement
    ) {
        this.grid = JSON.parse(
            JSON.stringify(
                record.placementGrid ?? {
                    version: 1,
                    size: Math.max(record.gridSize || 32, Math.ceil(Math.sqrt((bounds.getEast() * bounds.getNorth()) / 100000))),
                    width: bounds.getEast(),
                    height: bounds.getNorth(),
                    presets: { region: 3, city: 2, district: 1, building: 0, room: 0 },
                    areas: [],
                    agreements: [],
                }
            )
        );
        validateGrid(this.grid);
        if (this.grid.width !== bounds.getEast() || this.grid.height !== bounds.getNorth())
            throw Error('Map image dimensions changed. Restore the original image before editing territory.');
        this.base = JSON.stringify(record.placementGrid ?? null);
        const host = map.getContainer();
        this.canvas = host.createEl('canvas', { cls: 'st-grid-canvas' });
        this.ctx = this.canvas.getContext('2d')!;
        this.toolbar = toolbarHost.createDiv('st-grid-controls');
        this.button(this.toolbar, 'Grid', () => this.setGridVisible(!this.show));
        this.button(this.toolbar, 'Location area', () => this.pick()).classList.add('st-grid-mode-action');
        this.button(this.toolbar, 'Grid settings', () => {
            if (this.editing) {
                new Notice('Finish or cancel the area draft first.');
                return;
            }
            this.settings();
        }).classList.add('st-grid-mode-action');
        const snap = this.toolbar.createEl('label', { text: ' Snap ', cls: 'st-grid-mode-action' });
        const check = snap.createEl('input', { type: 'checkbox' });
        check.checked = true;
        check.onchange = () => (this.snap = check.checked);
        this.panel = this.toolbar.createDiv('st-grid-editor');
        this.panel.setAttribute('aria-label', 'Location area editor');
        this.panel.hidden = true;
        this.status = this.panel.createDiv();
        L.DomEvent.disableClickPropagation(this.toolbar);
        L.DomEvent.disableScrollPropagation(this.toolbar);
        L.DomEvent.disableClickPropagation(this.panel);
        L.DomEvent.disableScrollPropagation(this.panel);
        this.canvas.addEventListener('pointerdown', this.down);
        this.canvas.addEventListener('pointermove', this.move);
        this.canvas.addEventListener('pointerup', this.up);
        this.canvas.addEventListener('pointercancel', this.cancelStroke);
        // A paint stroke ends with a browser click on the canvas. Keep it from reaching the map so armed tools
        // (Maplog marks, entity placement) do not also act on the end of the stroke.
        this.canvas.addEventListener('click', e => e.stopPropagation());
        host.ownerDocument.addEventListener('keydown', this.key);
        host.ownerDocument.addEventListener('keyup', this.keyUp);
        map.on('move zoom resize', this.draw);
        map.on('storyteller:edit-area', this.editFromNode);
        void plugin.listLocations().then(l => {
            if (!this.dead) {
                this.locations = l;
                const ids = new Set(l.map(v => v.id));
                this.grid.areas = this.grid.areas.filter(a => ids.has(a.locationId));
                this.grid.agreements = this.grid.agreements.filter(a => ids.has(a.a) && ids.has(a.b));
                this.draw();
            }
        });
        void this.loadEntities();
        this.draw();
        try {
            const draft = localStorage.getItem(this.draftKey());
            if (draft)
                this.button(this.toolbar, 'Recover draft', async () => {
                    const saved = JSON.parse(draft);
                    if (saved.base !== this.base) {
                        new Notice('Map changed since draft; cannot safely restore.');
                        return;
                    }
                    const loc = (await plugin.listLocations()).find(l => l.id === saved.locationId);
                    if (loc) {
                        this.edit(loc);
                        this.selected = new Set(saved.cells);
                        this.label = saved.label;
                        this.labelCell = saved.labelCell;
                        if (saved.presets) this.grid.presets = saved.presets;
                        this.controls();
                        this.draw();
                    }
                });
        } catch {
            /* unavailable local storage */
        }
    }
    /** Reattach owned controls after MapView rebuilds its existing toolbar. */
    mountToolbar(host: HTMLElement): void {
        host.appendChild(this.toolbar);
    }
    private button(el: HTMLElement, text: string, fn: () => unknown) {
        const b = el.createEl('button', { text });
        b.onclick = () => {
            void fn();
        };
        return b;
    }
    private parents() {
        return Object.fromEntries(this.locations.filter(l => l.id).map(l => [l.id!, l.parentLocationId]));
    }
    private noteName(name: string) {
        return name.replace(/[\\/:"*?<>|]+/g, '').toLowerCase();
    }
    private name(id: string) {
        return this.locations.find(l => l.id === id)?.name ?? `Missing location (${id})`;
    }
    private at(e: PointerEvent): [number, number] {
        const p = this.map.mouseEventToLatLng(e);
        return [p.lng, p.lat];
    }
    private checkpoint() {
        this.history.push([...this.selected]);
        if (this.history.length > 100) this.history.shift();
        this.future = [];
    }
    private controls() {
        this.panel.empty();
        this.status = this.panel.createDiv({ text: `${this.editing?.name} · ${this.editing?.type ?? 'custom'}` });
        const input = this.panel.createEl('input', { type: 'text', placeholder: 'Map label (optional)' });
        input.value = this.label;
        input.oninput = () => {
            this.label = input.value;
            this.saveDraft();
        };
        const modes = this.panel.createEl('select');
        for (const [value, text] of Object.entries({
            paint: 'Paint',
            erase: 'Erase',
            outline: 'Freehand outline',
            stamp: 'Level footprint',
            label: 'Position label',
            pan: 'Pan',
        }))
            modes.createEl('option', { value, text });
        modes.onchange = () => {
            this.mode = modes.value;
            this.inputState();
        };
        modes.value = this.mode;
        const radius = this.panel.createEl('input', {
            type: 'number',
            attr: { min: '0', max: '50', 'aria-label': 'Surrounding rings' },
        });
        radius.value = String(this.radius);
        radius.onchange = () => {
            this.radius = Math.max(0, Math.min(50, Number(radius.value) || 0));
            this.updateStatus();
        };
        this.button(this.panel, 'Use as level preset', () => {
            this.grid.presets[this.editing?.type ?? 'custom'] = this.radius;
            new Notice('Preset will be saved with this area.');
        });
        this.button(this.panel, 'Undo', () => {
            if (this.history.length) {
                this.future.push([...this.selected]);
                this.selected = new Set(this.history.pop()!);
                this.draw();
            }
        });
        this.button(this.panel, 'Redo', () => {
            if (this.future.length) {
                this.history.push([...this.selected]);
                this.selected = new Set(this.future.pop()!);
                this.draw();
            }
        });
        this.button(this.panel, 'Clear area', () => {
            this.checkpoint();
            this.selected.clear();
            this.draw();
        });
        this.button(this.panel, 'Edit location name / level', () => {
            if (this.editing)
                new LocationModal(this.plugin.app, this.plugin, this.editing, async loc => {
                    if (
                        (await this.plugin.listLocations()).some(
                            l => l.id !== loc.id && this.noteName(l.name) === this.noteName(loc.name)
                        )
                    ) {
                        new Notice('Choose a unique location note name. Map labels can repeat.');
                        throw Error('Duplicate location note name');
                    }
                    await this.plugin.saveLocation(loc);
                    this.locations = await this.plugin.listLocations();
                    this.editing = loc;
                    this.radius = this.grid.presets[loc.type ?? 'custom'] ?? 0;
                    this.controls();
                    this.draw();
                }).open();
        });
        this.button(this.panel, 'Save', () => this.save());
        this.button(this.panel, 'Cancel', () => this.cancel());
        this.panel.createDiv({
            text: 'Drag to paint · Space-drag or Pan to move · Esc cancels · Empty area removes territory, not the location/pin.',
        });
        this.updateStatus();
    }
    private updateStatus() {
        if (this.editing)
            this.status.setText(
                `${this.editing.name} · ${this.selected.size} cells · radius ${this.radius} (${2 * this.radius + 1} × ${2 * this.radius + 1})`
            );
    }
    private setGridVisible(visible: boolean): void {
        if (!visible) {
            this.cancelStroke();
            this.saveDraft();
            this.space = false;
        }
        this.show = visible;
        this.toolbar.classList.toggle('st-grid-enabled', visible);
        this.toolbar.querySelector('button')?.setAttribute('aria-pressed', String(visible));
        this.map.getContainer().classList.toggle('st-grid-enabled', visible);
        this.panel.hidden = !visible || !this.editing;
        this.inputState();
        this.draw();
    }
    private inputState() {
        const edit = this.show && !!this.editing && !this.space && this.mode !== 'pan' && !this.busy;
        this.canvas.style.pointerEvents = edit ? 'auto' : 'none';
        this.canvas.style.zIndex = edit ? '650' : '450';
        this.canvas.style.touchAction = edit ? 'none' : '';
        if (edit) this.map.dragging.disable();
        else this.map.dragging.enable();
    }
    async pick() {
        if (!(await this.canLeave())) return;
        const picker = new LocationSuggestModal(this.plugin.app, this.plugin, loc => {
            if (loc) this.edit(loc);
        });
        picker.getItemText = loc =>
            `${loc.name} - ${loc.type ?? 'custom'}${loc.parentLocationId ? ' - ' + this.name(loc.parentLocationId) : ''}`;
        picker.open();
    }
    private edit(loc: Location) {
        if (!this.show) {
            new Notice('Turn Grid on to edit location areas.');
            return;
        }
        if (!loc.id) {
            new Notice('Save the location first to assign a stable ID.');
            return;
        }
        this.editing = loc;
        const area = this.grid.areas.find(a => a.locationId === loc.id);
        this.selected = new Set(area?.cells ?? []);
        this.label = area?.label ?? '';
        this.labelCell = area?.labelCell;
        this.history = [];
        this.future = [];
        this.radius = this.grid.presets[loc.type ?? 'custom'] ?? 0;
        this.mode = 'paint';
        this.panel.hidden = false;
        this.baseline = JSON.stringify([
            this.selected.size ? [...this.selected] : [],
            this.label,
            this.labelCell,
            this.grid.presets,
        ]);
        this.controls();
        this.inputState();
        this.draw();
    }
    private down = (e: PointerEvent) => {
        if (!this.show || !this.editing || this.busy || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.canvas.setPointerCapture(e.pointerId);
        this.checkpoint();
        this.drawing = true;
        this.points = [this.at(e)];
        this.applyPoint(this.points[0]);
    };
    private move = (e: PointerEvent) => {
        if (!this.drawing) {
            this.hover = cellAt(this.grid, ...this.at(e));
            this.draw();
            return;
        }
        e.preventDefault();
        const point = this.at(e),
            prev = this.points[this.points.length - 1];
        this.points.push(point);
        if (this.mode === 'paint' || this.mode === 'erase') {
            const n = Math.max(1, Math.ceil(Math.hypot(point[0] - prev[0], point[1] - prev[1]) / (this.grid.size / 2)));
            for (let i = 1; i <= n; i++)
                this.applyPoint([prev[0] + ((point[0] - prev[0]) * i) / n, prev[1] + ((point[1] - prev[1]) * i) / n]);
        }
        this.draw();
    };
    private up = (e: PointerEvent) => {
        if (!this.drawing) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.mode === 'outline') outline(this.grid, this.points).forEach(c => this.selected.add(c));
        this.drawing = false;
        this.points = [];
        this.draw();
    };
    private cancelStroke = () => {
        if (this.drawing && this.history.length) this.selected = new Set(this.history.pop()!);
        this.drawing = false;
        this.points = [];
        this.draw();
    };
    private applyPoint(p: [number, number]) {
        const c = cellAt(this.grid, ...p);
        if (!c) return;
        if (this.mode === 'erase') this.selected.delete(c);
        else if (this.mode === 'paint') this.selected.add(c);
        else if (this.mode === 'stamp') stamp(this.grid, c, this.radius).forEach(v => this.selected.add(v));
        else if (this.mode === 'label' && this.selected.has(c)) this.labelCell = c;
        this.draw();
    }
    private key = (e: KeyboardEvent) => {
        if (!this.show || !this.editing || ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
        if (e.code === 'Space') {
            e.preventDefault();
            this.space = true;
            this.inputState();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            void this.cancel();
        }
    };
    private keyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            this.space = false;
            this.inputState();
        }
    };
    private dirty() {
        return (
            !!this.editing &&
            this.baseline !== JSON.stringify([[...this.selected], this.label, this.labelCell, this.grid.presets])
        );
    }
    async canLeave() {
        if (this.busy) {
            new Notice('Wait for the grid save to finish.');
            return false;
        }
        if (!this.dirty()) return true;
        const discard = await confirmWithModal(this.plugin.app, {
            title: 'Discard area draft?',
            body: 'Unsaved grid selection and label edits will be discarded.',
            confirmText: 'Discard',
        });
        if (discard) {
            this.clearDraft();
            this.baseline = JSON.stringify([[...this.selected], this.label, this.labelCell, this.grid.presets]);
        }
        return discard;
    }
    async endEditing(): Promise<boolean> {
        if (!(await this.canLeave())) return false;
        this.editing = null;
        this.panel.hidden = true;
        this.space = false;
        this.inputState();
        this.draw();
        return true;
    }
    async cancel() {
        if (!(await this.canLeave())) return;
        this.editing = null;
        this.clearDraft();
        this.grid = JSON.parse(
            JSON.stringify(
                this.record.placementGrid ?? {
                    ...this.grid,
                    presets: { region: 3, city: 2, district: 1, building: 0, room: 0 },
                    areas: [],
                    agreements: [],
                }
            )
        );
        this.panel.hidden = true;
        this.inputState();
        this.draw();
    }
    private async save() {
        if (!this.editing || this.busy) return;
        const location = this.editing;
        this.busy = true;
        this.inputState();
        try {
            this.locations = await this.plugin.listLocations();
            if (!this.locations.some(l => l.id === location.id)) throw Error('Location was deleted; cancel this draft.');
            if (
                !this.selected.size &&
                !(await confirmWithModal(this.plugin.app, {
                    title: 'Remove this territory?',
                    body: 'The location and any existing pin remain; only this map area is removed.',
                }))
            )
                return;
            const choices: Record<string, Resolution> = {};
            for (const conflict of overlaps(this.grid, location.id!, [...this.selected], this.parents())) {
                const choice = await this.resolve(this.name(conflict.id), conflict.cells.length);
                if (!choice) return;
                choices[conflict.id] = choice;
                if (
                    choice === 'transfer' &&
                    !(await confirmWithModal(this.plugin.app, {
                        title: 'Transfer territory?',
                        body: `Remove ${conflict.cells.length} cells from ${this.name(conflict.id)}? This can split or empty its area.`,
                        confirmText: 'Transfer',
                    }))
                )
                    return;
            }
            const next = commitArea(
                this.grid,
                {
                    locationId: location.id!,
                    cells: [...this.selected],
                    label: this.label || undefined,
                    labelCell: this.labelCell,
                },
                this.parents(),
                choices
            );
            await this.persist(next);
            this.clearDraft();
            this.editing = null;
            this.panel.hidden = true;
            this.map.fire('storyteller:area-saved');
            new Notice('Location area saved.');
        } catch (e) {
            new Notice(`Area not saved: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.busy = false;
            this.inputState();
            this.draw();
        }
    }
    private resolve(name: string, count: number): Promise<Resolution | null> {
        return new Promise(resolve => {
            const modal = new Modal(this.plugin.app);
            let result: Resolution | null = null;
            modal.onOpen = () => {
                modal.contentEl.createEl('h3', { text: `${count} overlapping cells: ${name}` });
                modal.contentEl.createEl('p', { text: 'Choose explicitly. Shared does not imply disputed.' });
                for (const [value, label] of Object.entries({
                    exclude: 'Exclude overlaps',
                    shared: 'Share area',
                    disputed: 'Mark disputed',
                    transfer: 'Transfer to this location',
                }))
                    this.button(modal.contentEl, label, () => {
                        result = value as Resolution;
                        modal.close();
                    });
                this.button(modal.contentEl, 'Back to editing', () => modal.close());
            };
            modal.onClose = () => resolve(result);
            modal.open();
        });
    }
    private async persist(next: PlacementGrid) {
        validateGrid(next);
        // One map-file update commits all memberships and agreements together.
        const file = this.plugin.app.vault.getAbstractFileByPath(this.record.filePath!);
        if (!(file instanceof TFile)) throw Error('Save the map before editing its grid.');
        // processFrontMatter preserves unrelated note content and uses a single file operation.
        await this.plugin.app.fileManager.processFrontMatter(file, fm => {
            if (JSON.stringify(fm.placementGrid ?? null) !== this.base) throw Error('Grid changed elsewhere. Reopen map.');
            fm.placementGrid = next;
            if (this.editing && Array.isArray(fm.removedMapEntities))
                fm.removedMapEntities = fm.removedMapEntities.filter((key: string) => key !== `location:${this.editing!.id}`);
        });
        this.grid = next;
        this.record.placementGrid = next;
        this.base = JSON.stringify(next);
    }
    private settings() {
        const modal = new Modal(this.plugin.app);
        let size = this.grid.size;
        modal.onOpen = () => {
            modal.contentEl.createEl('h3', { text: 'Placement grid' });
            modal.contentEl.createEl('p', {
                text: 'Resolution changes resample by cell center. Preview the new areas before confirming; small areas can disappear.',
            });
            new Setting(modal.contentEl).setName('Cell size in image pixels').addText(t =>
                t.setValue(String(size)).onChange(v => {
                    size = Number(v);
                })
            );
            const preview = modal.contentEl.createDiv();
            let pending: PlacementGrid | null = null;
            this.button(modal.contentEl, 'Preview resolution', () => {
                try {
                    pending = resizeGrid(this.grid, size);
                    preview.empty();
                    for (const area of pending.areas) {
                        const old = this.grid.areas.find(a => a.locationId === area.locationId)!;
                        preview.createDiv({
                            text: `${this.name(area.locationId)}: ${old.cells.length} -> ${area.cells.length} cells${!area.cells.length ? ' - AREA WILL BE EMPTY' : ''}`,
                        });
                    }
                    preview.createDiv({
                        text: `${Math.ceil(pending.width / size)} columns x ${Math.ceil(pending.height / size)} rows`,
                    });
                    const current = this.grid;
                    this.grid = pending;
                    this.setGridVisible(true);
                    this.paint();
                    this.grid = current;
                } catch (e) {
                    new Notice(String(e));
                    pending = null;
                }
            });
            this.button(modal.contentEl, 'Apply resolution', async () => {
                if (!pending || pending.size !== size) {
                    new Notice('Preview this resolution first.');
                    return;
                }
                if (
                    !(await confirmWithModal(this.plugin.app, {
                        title: 'Replace grid resolution?',
                        body: 'Apply the preview to all location areas and shared/disputed cells? Existing pins are unchanged.',
                    }))
                )
                    return;
                try {
                    await this.persist(pending);
                    modal.close();
                    this.draw();
                } catch (e) {
                    new Notice(String(e));
                }
            });
        };
        modal.onClose = () => this.draw();
        modal.open();
    }
    setPlacement(value: boolean) {
        this.placing = value;
        this.draw();
    }
    snapPoint(coords: [number, number]): [number, number] {
        if (!this.snap) return coords;
        const c = cellAt(this.grid, coords[1], coords[0]);
        if (!c) return coords;
        const [x, y] = cellCenter(this.grid, c);
        return [y, x];
    }
    async refreshFromVault(record?: StoryMap): Promise<void> {
        this.locations = await this.plugin.listLocations();
        const valid = new Set(this.locations.map(l => l.id));
        if (this.editing && !valid.has(this.editing.id)) {
            this.editing = null;
            this.panel.hidden = true;
            this.clearDraft();
            this.inputState();
            new Notice('This location was deleted. Its area draft has been closed.');
        }
        if (record && !this.editing && !this.busy) {
            this.record = record;
            if (record.placementGrid) this.grid = JSON.parse(JSON.stringify(record.placementGrid));
            this.base = JSON.stringify(record.placementGrid ?? null);
        }
        const removed = new Set(record?.removedMapEntities ?? this.record.removedMapEntities ?? []);
        this.grid.areas = this.grid.areas.filter(a => valid.has(a.locationId) && !removed.has(`location:${a.locationId}`));
        this.grid.agreements = this.grid.agreements.filter(
            a => valid.has(a.a) && valid.has(a.b) && !removed.has(`location:${a.a}`) && !removed.has(`location:${a.b}`)
        );
        this.refreshEntities();
        this.draw();
    }
    private async removeNode(type: string, id: string, name: string): Promise<void> {
        if (
            !(await confirmWithModal(this.plugin.app, {
                title: 'Remove from this map?',
                body: `Remove ${name} from this map only? The note and story relationships remain.`,
            }))
        )
            return;
        try {
            await detachFromMaps(this.plugin, type, id, name, this.record.id || this.record.name);
            this.map.closePopup();
        } catch (error) {
            new Notice(`Removal failed: ${String(error)}`);
        }
    }
    refreshEntities() {
        this.entities = [];
        void this.loadEntities();
    }
    private async loadEntities() {
        const readers: [string, () => Promise<unknown[]>][] = [
            ['character', () => this.plugin.listCharacters()],
            ['event', () => this.plugin.listEvents()],
            ['item', () => this.plugin.listPlotItems()],
            ['scene', () => this.plugin.listScenes()],
            ['group', async () => this.plugin.getGroups()],
            ['culture', () => this.plugin.listCultures()],
            ['economy', () => this.plugin.listEconomies()],
            ['magicsystem', () => this.plugin.listMagicSystems()],
            ['reference', () => this.plugin.listReferences()],
        ];
        for (const [type, read] of readers) {
            try {
                for (const raw of await read()) {
                    const entity = raw as {
                        id?: string;
                        name: string;
                        filePath?: string;
                        mapId?: string;
                        mapCoordinates?: [number, number];
                    };
                    if (
                        entity.mapId === (this.record.id || this.record.name) &&
                        entity.mapCoordinates &&
                        !this.record.removedMapEntities?.includes(`${type}:${entity.id || entity.name}`)
                    )
                        this.entities.push({ ...entity, type, coordinates: entity.mapCoordinates });
                }
            } catch {
                /* optional entity service */
            }
        }
    }
    private async removeNodePicker(): Promise<void> {
        if (!(await this.canLeave())) return;
        const modal = new Modal(this.plugin.app);
        modal.onOpen = () => {
            modal.contentEl.createEl('h3', { text: 'Remove node from this map (keep note)' });
            for (const location of this.locations)
                if (
                    this.grid.areas.some(a => a.locationId === location.id) ||
                    location.mapBindings?.some(b => b.mapId === (this.record.id || this.record.name))
                ) {
                    this.button(modal.contentEl, location.name, async () => {
                        await this.removeNode('location', location.id || location.name, location.name);
                        modal.close();
                    });
                }
            for (const entity of this.entities)
                this.button(modal.contentEl, `${entity.name} - ${entity.type}`, async () => {
                    await this.removeNode(entity.type, entity.id || entity.name, entity.name);
                    modal.close();
                });
            for (const marker of this.record.markers ?? [])
                this.button(modal.contentEl, `Pin: ${marker.label || marker.id}`, async () => {
                    if (
                        !(await confirmWithModal(this.plugin.app, {
                            title: 'Remove pin?',
                            body: 'Remove this saved pin from the map, keeping its linked notes.',
                        }))
                    )
                        return;
                    const file = this.record.filePath ? this.plugin.app.vault.getAbstractFileByPath(this.record.filePath) : null;
                    if (file instanceof TFile)
                        await this.plugin.app.fileManager.processFrontMatter(file, fm => {
                            if (Array.isArray(fm.markers))
                                fm.markers = fm.markers.filter((m: { id: string }) => m.id !== marker.id);
                        });
                    modal.close();
                });
        };
        modal.open();
    }
    private editFromNode = (event: L.LeafletEvent) => {
        const id = (event as L.LeafletEvent & { locationId: string }).locationId;
        void (async () => {
            if (!(await this.canLeave())) return;
            this.locations = await this.plugin.listLocations();
            const location = this.locations.find(l => (l.id || l.name) === id);
            if (location) this.edit(location);
        })();
    };
    private draw = () => {
        if (this.dead || this.frame !== null) return;
        this.frame = window.requestAnimationFrame(() => {
            this.frame = null;
            this.paint();
        });
    };
    private paint = () => {
        if (this.dead) return;
        const size = this.map.getSize(),
            dpr = window.devicePixelRatio || 1;
        this.canvas.width = size.x * dpr;
        this.canvas.height = size.y * dpr;
        this.canvas.style.width = `${size.x}px`;
        this.canvas.style.height = `${size.y}px`;
        const ctx = this.ctx;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, size.x, size.y);
        const view = this.map.getBounds(),
            g = this.grid;
        const minX = Math.max(0, Math.floor(view.getWest() / g.size)),
            maxX = Math.min(Math.ceil(g.width / g.size) - 1, Math.floor(view.getEast() / g.size));
        const minY = Math.max(0, Math.floor(view.getSouth() / g.size)),
            maxY = Math.min(Math.ceil(g.height / g.size) - 1, Math.floor(view.getNorth() / g.size));
        const editing = this.show && !!this.editing;
        const owners = new Map<Cell, string[]>();
        for (const a of g.areas)
            for (const c of a.cells) {
                const list = owners.get(c) ?? [];
                list.push(a.locationId);
                owners.set(c, list);
            }
        const conflicts = new Set(
            editing ? overlaps(g, this.editing!.id!, [...this.selected], this.parents()).flatMap(v => v.cells) : []
        );
        const disputed = new Set(g.agreements.filter(a => a.kind === 'disputed').flatMap(a => a.cells));
        // Visible cells only, and stop drawing grid lines at subpixel density.
        const visibleCount = (maxX - minX + 1) * (maxY - minY + 1);
        const drawGrid = this.show && visibleCount < 30000;
        const cells = new Set<Cell>([...owners.keys(), ...(editing ? this.selected : [])]);
        if (drawGrid) for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) cells.add(`${x},${y}`);
        for (const c of cells) {
            const [x, y] = c.split(',').map(Number);
            if (x < minX || x > maxX || y < minY || y > maxY) continue;
            const p = this.map.latLngToContainerPoint([Math.min(g.height, (y + 1) * g.size), x * g.size]),
                q = this.map.latLngToContainerPoint([y * g.size, Math.min(g.width, (x + 1) * g.size)]);
            const w = q.x - p.x,
                h = q.y - p.y;
            const selected = editing && this.selected.has(c),
                has = owners.has(c);
            if (selected || has) {
                ctx.fillStyle = conflicts.has(c)
                    ? 'rgba(255,90,40,.5)'
                    : selected
                      ? 'rgba(40,200,140,.4)'
                      : disputed.has(c)
                        ? 'rgba(225,140,25,.25)'
                        : 'rgba(70,130,230,.13)';
                ctx.fillRect(p.x, p.y, w, h);
            }
            if (drawGrid) {
                ctx.strokeStyle = 'rgba(130,150,170,.45)';
                ctx.lineWidth = 0.6;
                ctx.strokeRect(p.x, p.y, w, h);
            }
            if (disputed.has(c)) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(p.x, p.y, w, h);
                ctx.clip();
                ctx.strokeStyle = 'rgba(200,110,20,.6)';
                for (let k = -h; k < w; k += 8) {
                    ctx.beginPath();
                    ctx.moveTo(p.x + k, p.y);
                    ctx.lineTo(p.x + k + h, p.y + h);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
        // Names, hover cards and popups belong to the existing native node renderer.
        if (editing && this.hover && this.mode === 'stamp' && !this.drawing) {
            ctx.strokeStyle = '#2c9';
            ctx.lineWidth = 2;
            for (const c of stamp(g, this.hover, this.radius)) {
                const [x, y] = c.split(',').map(Number);
                const p = this.map.latLngToContainerPoint([Math.min(g.height, (y + 1) * g.size), x * g.size]),
                    q = this.map.latLngToContainerPoint([y * g.size, Math.min(g.width, (x + 1) * g.size)]);
                ctx.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
            }
        }
        if (this.drawing && this.mode === 'outline') {
            ctx.strokeStyle = '#2c9';
            ctx.beginPath();
            this.points.forEach(([x, y], i) => {
                const p = this.map.latLngToContainerPoint([y, x]);
                if (i) ctx.lineTo(p.x, p.y);
                else ctx.moveTo(p.x, p.y);
            });
            ctx.stroke();
        }
        this.updateStatus();
        this.saveDraft();
    };
    destroy() {
        this.saveDraft();
        this.dead = true;
        if (this.frame !== null) window.cancelAnimationFrame(this.frame);
        this.map.off('move zoom resize', this.draw);
        this.map.off('storyteller:edit-area', this.editFromNode);
        const doc = this.map.getContainer().ownerDocument;
        doc.removeEventListener('keydown', this.key);
        doc.removeEventListener('keyup', this.keyUp);
        this.map.getContainer().classList.remove('st-grid-enabled');
        this.canvas.remove();
        this.toolbar.remove();
        this.panel.remove();
        this.map.dragging.enable();
    }
}
