/**
 * The Maplog palette: a panel on the map view for choosing a mark, setting its
 * attributes and write-ins, and arming it for placement. Maplog by Roberto
 * Bisceglie, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
 */
import * as L from 'leaflet';
import { Setting } from 'obsidian';
import {
    MAPLOG_CREDIT,
    getMaplogMark,
    maplogAttributesFor,
    maplogMarksByFamily,
    searchMaplogMarks,
    type MaplogMarkDef,
} from './catalogue';
import { MAPLOG_ROTATIONS, isPlacedMark, type MaplogToolState } from './draft';
import { svgElement } from './dom';
import { maplogSvg } from './svg';

export interface MaplogPaletteHost {
    /** The armed tool changed, or is null when nothing is armed. */
    onChange(tool: MaplogToolState | null): void;
    /** Ask the user to pick a location; `done` gets the choice, or null when cancelled. */
    chooseLocation(done: (location: { id?: string; name: string } | null) => void): void;
    /** The palette was closed with the close button. */
    onClose(): void;
}

const STAIR_MARKS = new Set(['stairs-up', 'stairs-down', 'spiral', 'slope', 'shaft', 'shaft-up']);
const GRADE_LABELS: Record<number, string> = {
    1: '1 chevron (slight)',
    2: '2 chevrons (gentle)',
    3: '3 chevrons (steep)',
};

export class MaplogPalette {
    private readonly root: HTMLElement;
    private query = '';
    private tool: MaplogToolState | null = null;
    private linkedName = '';
    private opened = false;

    constructor(parent: HTMLElement, private readonly host: MaplogPaletteHost) {
        this.root = parent.createDiv({ cls: 'maplog-palette' });
        this.root.hide();
        L.DomEvent.disableClickPropagation(this.root);
        L.DomEvent.disableScrollPropagation(this.root);
    }

    isOpen(): boolean {
        return this.opened;
    }

    open(): void {
        this.opened = true;
        this.root.show();
        this.render();
    }

    close(): void {
        this.opened = false;
        this.root.hide();
        this.tool = null;
        this.host.onChange(null);
        this.host.onClose();
    }

    /** Forget the chosen mark, for example after Escape disarms placement. */
    clearSelection(): void {
        this.tool = null;
        this.linkedName = '';
        if (this.isOpen()) this.render();
    }

    destroy(): void {
        this.root.remove();
    }

    private render(): void {
        this.root.empty();
        const head = this.root.createDiv({ cls: 'maplog-palette-head' });
        head.createDiv({ cls: 'maplog-palette-title', text: 'Maplog' });
        const close = head.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': 'Close palette', title: 'Close' } });
        close.setText('×');
        close.addEventListener('click', () => this.close());

        const search = this.root.createEl('input', { type: 'search', attr: { placeholder: 'Search marks', 'aria-label': 'Search marks' } });
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.renderGrid(gridHost);
        });

        const gridHost = this.root.createDiv();
        this.renderGrid(gridHost);

        if (this.tool) this.renderOptions(this.tool);
        this.root.createDiv({ cls: 'maplog-palette-credit maplog-legend-credit', text: MAPLOG_CREDIT });
    }

    private renderGrid(container: HTMLElement): void {
        container.empty();
        const groups = maplogMarksByFamily(searchMaplogMarks(this.query));
        if (groups.length === 0) {
            container.createDiv({ cls: 'maplog-palette-hint', text: 'No mark matches that search.' });
            return;
        }
        for (const group of groups) {
            container.createDiv({ cls: 'maplog-palette-family', text: group.family.label });
            const grid = container.createDiv({ cls: 'maplog-palette-grid' });
            for (const def of group.marks) this.markButton(grid, def);
        }
    }

    private markButton(grid: HTMLElement, def: MaplogMarkDef): void {
        const active = this.tool?.markId === def.id;
        const button = grid.createEl('button', {
            cls: `maplog-palette-mark${active ? ' is-active' : ''}`,
            attr: { type: 'button', 'aria-label': def.label, title: def.label, 'aria-pressed': String(active) },
        });
        button.appendChild(svgElement(button.ownerDocument, maplogSvg(def.id, { size: 26 })));
        button.addEventListener('click', () => {
            if (this.tool?.markId === def.id) {
                // Clicking the armed mark again disarms it.
                this.tool = null;
                this.host.onChange(null);
            } else {
                this.select(def);
            }
            this.render();
        });
    }

    private select(def: MaplogMarkDef): void {
        this.linkedName = '';
        this.tool = {
            markId: def.id,
            attributes: [],
            dashed: false,
            rotation: 0,
            grade: def.grades?.default,
        };
        this.host.onChange(this.tool);
    }

    private update(change: Partial<MaplogToolState>): void {
        if (!this.tool) return;
        this.tool = { ...this.tool, ...change };
        this.host.onChange(this.tool);
    }

    private renderOptions(tool: MaplogToolState): void {
        const def = getMaplogMark(tool.markId);
        if (!def) return;
        const options = this.root.createDiv({ cls: 'maplog-palette-options' });
        const kind = def.kind;
        options.createDiv({ cls: 'maplog-palette-hint', text: kind === 'point' || kind === 'opening'
            ? `${def.label}: click the map to place it. Esc stops placing.`
            : `${def.label}: click to add points. Double-click or press Enter to finish. Backspace removes the last point. Esc cancels.` });

        for (const attr of maplogAttributesFor(def.id)) {
            new Setting(options).setName(attr.label).setDesc(attr.description).addToggle(toggle => toggle
                .setValue(tool.attributes.includes(attr.id))
                .onChange(on => {
                    const next = new Set(tool.attributes);
                    if (on) next.add(attr.id); else next.delete(attr.id);
                    this.update({ attributes: [...next] });
                }));
        }

        new Setting(options).setName('Unconfirmed').setDesc('Draw dashed until you have checked it.').addToggle(toggle => toggle
            .setValue(tool.dashed)
            .onChange(on => this.update({ dashed: on })));

        if (def.rotatable) {
            new Setting(options).setName('Rotation').addDropdown(dropdown => {
                for (const degrees of MAPLOG_ROTATIONS) dropdown.addOption(String(degrees), `${degrees} degrees`);
                dropdown.setValue(String(tool.rotation)).onChange(value => this.update({ rotation: Number(value) }));
            });
        }

        const grades = def.grades;
        if (grades) {
            new Setting(options).setName('Steepness').addDropdown(dropdown => {
                for (let grade = grades.min; grade <= grades.max; grade++) dropdown.addOption(String(grade), GRADE_LABELS[grade] ?? String(grade));
                dropdown.setValue(String(tool.grade ?? grades.default)).onChange(value => this.update({ grade: Number(value) }));
            });
        }

        new Setting(options).setName('Name or text').setDesc(def.id === 'text' ? 'Required for a text mark.' : 'Optional.').addText(text => text
            .setPlaceholder('Chapel, 1 hex = 6 mi')
            .setValue(tool.label ?? '')
            .onChange(value => this.update({ label: value })));

        if (isPlacedMark(def.id) || def.kind === 'area') {
            new Setting(options).setName('Level tag').setDesc('Shown on the map beside the mark.').addText(text => text
                .setPlaceholder('L1')
                .setValue(tool.level ?? '')
                .onChange(value => this.update({ level: value })));
        }

        if (STAIR_MARKS.has(def.id)) {
            new Setting(options).setName('Destination').setDesc('Where the stairs lead: level and room.').addText(text => text
                .setPlaceholder('L3, 1')
                .setValue(tool.destination ?? '')
                .onChange(value => this.update({ destination: value })));
        }

        if (isPlacedMark(def.id) || def.kind === 'area') {
            new Setting(options).setName('Place ID').setDesc('Room or hex ID. Room state from the session log shows on hover.').addText(text => text
                .setPlaceholder('R3')
                .setValue(tool.placeId ?? '')
                .onChange(value => this.update({ placeId: value })));
        }

        if (def.id === 'place-id') {
            new Setting(options).setName('Linked location').setDesc(this.linkedName || 'None chosen.').addButton(button => button
                .setButtonText(tool.locationId ? 'Change' : 'Choose')
                .onClick(() => this.host.chooseLocation(location => {
                    if (!location) return;
                    this.linkedName = location.name;
                    this.update({ locationId: location.id || location.name });
                    this.render();
                })));
        }
    }
}
