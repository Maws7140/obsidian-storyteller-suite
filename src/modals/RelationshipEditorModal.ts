// Modal for adding/editing a single typed relationship

import { App, DropdownComponent, Modal, Setting, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { TypedRelationship, RelationshipType, RelationshipDirection } from '../types';
import { RELATIONSHIP_CATEGORIES, defaultDirectionFor } from '../utils/RelationshipKinds';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PlotItemSuggestModal } from './PlotItemSuggestModal';
import { EntitySuggestModal } from './EntitySuggestModal';
import { t } from '../i18n/strings';

export type RelationshipEditorCallback = (relationship: TypedRelationship) => void;

export class RelationshipEditorModal extends Modal {
    plugin: StorytellerSuitePlugin;
    relationship: TypedRelationship;
    onSubmit: RelationshipEditorCallback;
    isNew: boolean;
    entityType: 'any' | 'character' | 'location' | 'event' | 'item';
    private directionTouched = false;
    private directionDropdown: DropdownComponent | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        relationship: TypedRelationship | null,
        entityType: 'any' | 'character' | 'location' | 'event' | 'item' = 'any',
        onSubmit: RelationshipEditorCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = relationship === null;
        this.entityType = entityType;
        this.relationship = relationship ? { ...relationship } : {
            target: '',
            type: 'neutral',
            label: undefined
        };
        // Existing notes without a stored direction show the direction their kind implies
        this.relationship.direction = this.relationship.direction ?? defaultDirectionFor(this.relationship.type);
        this.onSubmit = onSubmit;
        this.modalEl.addClass('storyteller-relationship-editor-modal', 'storyteller-modal-scroll');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('addRelationship') : t('editRelationship') });

        // Target entity selection
        let targetDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('targetEntity'))
            .setDesc('')
            .then(setting => {
                targetDesc = setting.descEl.createEl('small', {
                    text: this.relationship.target || t('none')
                });
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(async () => {
                    // Store the display name as the target — ids leak into
                    // rendered notes and break display paths that expect names.
                    const applySelection = (selected: { name: string } | null) => {
                        if (selected?.name) {
                            this.relationship.target = selected.name;
                            targetDesc.setText(selected.name);
                        }
                    };
                    if (this.entityType === 'any') {
                        new EntitySuggestModal(this.app, this.plugin, applySelection).open();
                    } else if (this.entityType === 'character') {
                        new CharacterSuggestModal(this.app, this.plugin, applySelection).open();
                    } else if (this.entityType === 'location') {
                        new LocationSuggestModal(this.app, this.plugin, applySelection).open();
                    } else if (this.entityType === 'event') {
                        new EventSuggestModal(this.app, this.plugin, applySelection).open();
                    } else if (this.entityType === 'item') {
                        new PlotItemSuggestModal(this.app, this.plugin, applySelection).open();
                    }
                }));

        // Relationship kind, grouped by category
        new Setting(contentEl)
            .setName(t('relationshipType'))
            .setDesc(t('relationshipTypeDesc'))
            .addDropdown(dropdown => {
                for (const category of RELATIONSHIP_CATEGORIES) {
                    const group = dropdown.selectEl.createEl('optgroup', { attr: { label: t(category.labelKey) } });
                    for (const kind of category.kinds) {
                        group.createEl('option', { value: kind, text: t(kind) });
                    }
                }
                dropdown
                    .setValue(this.relationship.type)
                    .onChange(value => {
                        this.relationship.type = value as RelationshipType;
                        // Follow the kind's default direction until the user picks one
                        if (!this.directionTouched) {
                            this.relationship.direction = defaultDirectionFor(this.relationship.type);
                            this.syncDirectionDropdown();
                        }
                    });
            });

        // Direction: one-way arrow or mutual line
        new Setting(contentEl)
            .setName(t('relationshipDirection'))
            .setDesc(t('relationshipDirectionDesc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('to', t('directionOneWay'))
                    .addOption('mutual', t('directionMutual'))
                    .setValue(this.relationship.direction ?? 'to')
                    .onChange(value => {
                        this.directionTouched = true;
                        this.relationship.direction = value as RelationshipDirection;
                    });
                this.directionDropdown = dropdown;
            });

        // Ended: severed relationships stay on the map as history
        new Setting(contentEl)
            .setName(t('relationshipEnded'))
            .setDesc(t('relationshipEndedDesc'))
            .addToggle(toggle => toggle
                .setValue(this.relationship.ended === true)
                .onChange(value => {
                    this.relationship.ended = value ? true : undefined;
                }));

        // Optional label
        new Setting(contentEl)
            .setName(t('label') + ' ' + t('optional'))
            .setDesc(t('relationshipLabelDesc'))
            .addText(text => text
                .setPlaceholder(t('exampleRelationshipLabel'))
                .setValue(this.relationship.label || '')
                .onChange(value => {
                    this.relationship.label = value || undefined;
                }));

        // Buttons
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('cancel'))
                .onClick(() => {
                    this.close();
                }))
            .addButton(button => button
                .setButtonText(this.isNew ? t('add') : t('save'))
                .setCta()
                .onClick(() => {
                    if (!this.relationship.target) {
                        new Notice(t('pleaseSelectTarget'));
                        return;
                    }
                    this.onSubmit(this.relationship);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    private syncDirectionDropdown(): void {
        this.directionDropdown?.setValue(this.relationship.direction ?? 'to');
    }
}

