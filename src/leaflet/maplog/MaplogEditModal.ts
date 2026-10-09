/**
 * Edit dialog for a placed Maplog item: attributes, confirmation, rotation,
 * grade and write-ins. Changes are returned to the caller, which saves them.
 */
import { App, Modal, Setting } from 'obsidian';
import { getMaplogMark, maplogAttributesFor, type MaplogAttributeId } from './catalogue';
import { MAPLOG_ROTATIONS } from './draft';
import type { MaplogItemRef } from './model';

/** Fields the edit dialog can change. Missing keys keep the stored value. */
export interface MaplogItemEdits {
    attributes?: string[];
    dashed?: boolean;
    rotation?: number;
    grade?: number;
    label?: string;
    level?: string;
    destination?: string;
    placeId?: string;
}

/** The current state of an item, as the dialog shows it. */
export interface MaplogItemView {
    ref: MaplogItemRef;
    mark: string;
    attributes?: string[];
    dashed?: boolean;
    rotation?: number;
    grade?: number;
    label?: string;
    level?: string;
    destination?: string;
    placeId?: string;
}

const STAIR_MARKS = new Set(['stairs-up', 'stairs-down', 'spiral', 'slope', 'shaft', 'shaft-up']);

export class MaplogEditModal extends Modal {
    private readonly edits: MaplogItemEdits;

    constructor(app: App, private readonly item: MaplogItemView, private readonly onSave: (edits: MaplogItemEdits) => void | Promise<void>) {
        super(app);
        this.edits = {
            attributes: item.attributes ? [...item.attributes] : [],
            dashed: item.dashed === true,
            rotation: item.rotation ?? 0,
            grade: item.grade,
            label: item.label ?? '',
            level: item.level ?? '',
            destination: item.destination ?? '',
            placeId: item.placeId ?? '',
        };
    }

    onOpen(): void {
        const { contentEl } = this;
        const def = getMaplogMark(this.item.mark);
        this.setTitle(`Edit ${def?.label ?? 'Maplog mark'}`);
        contentEl.empty();

        for (const attr of maplogAttributesFor(this.item.mark)) {
            new Setting(contentEl).setName(attr.label).setDesc(attr.description).addToggle(toggle => toggle
                .setValue(this.edits.attributes?.includes(attr.id) ?? false)
                .onChange(on => this.setAttribute(attr.id, on)));
        }

        new Setting(contentEl).setName('Unconfirmed').setDesc('Draw dashed until you have checked it.').addToggle(toggle => toggle
            .setValue(this.edits.dashed === true)
            .onChange(on => { this.edits.dashed = on; }));

        if (def?.rotatable) {
            new Setting(contentEl).setName('Rotation').addDropdown(dropdown => {
                for (const degrees of MAPLOG_ROTATIONS) dropdown.addOption(String(degrees), `${degrees} degrees`);
                dropdown.setValue(String(this.edits.rotation ?? 0)).onChange(value => { this.edits.rotation = Number(value); });
            });
        }

        if (def?.grades) {
            const grades = def.grades;
            new Setting(contentEl).setName('Steepness').addDropdown(dropdown => {
                for (let grade = grades.min; grade <= grades.max; grade++) dropdown.addOption(String(grade), `${grade} chevron${grade === 1 ? '' : 's'}`);
                dropdown.setValue(String(this.edits.grade ?? grades.default)).onChange(value => { this.edits.grade = Number(value); });
            });
        }

        new Setting(contentEl).setName('Name or text').addText(text => text
            .setValue(this.edits.label ?? '')
            .onChange(value => { this.edits.label = value; }));

        if (this.item.ref.type === 'mark') {
            new Setting(contentEl).setName('Level tag').addText(text => text
                .setPlaceholder('L1')
                .setValue(this.edits.level ?? '')
                .onChange(value => { this.edits.level = value; }));
            if (STAIR_MARKS.has(this.item.mark)) {
                new Setting(contentEl).setName('Destination').addText(text => text
                    .setPlaceholder('L3, 1')
                    .setValue(this.edits.destination ?? '')
                    .onChange(value => { this.edits.destination = value; }));
            }
            new Setting(contentEl).setName('Place ID').addText(text => text
                .setPlaceholder('R3')
                .setValue(this.edits.placeId ?? '')
                .onChange(value => { this.edits.placeId = value; }));
        }

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
            .addButton(button => button.setButtonText('Save').setCta().onClick(() => {
                void Promise.resolve(this.onSave(this.collected())).then(() => this.close());
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private setAttribute(id: MaplogAttributeId, on: boolean): void {
        const next = new Set(this.edits.attributes ?? []);
        if (on) next.add(id); else next.delete(id);
        this.edits.attributes = [...next];
    }

    /** The edits, with the label and place fields trimmed so blanks clear them. */
    private collected(): MaplogItemEdits {
        return {
            ...this.edits,
            label: this.edits.label?.trim() ?? '',
            level: this.edits.level?.trim() ?? '',
            destination: this.edits.destination?.trim() ?? '',
            placeId: this.edits.placeId?.trim() ?? '',
        };
    }
}
