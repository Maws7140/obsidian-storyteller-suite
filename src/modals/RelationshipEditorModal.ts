// Modal for adding/editing a single typed relationship

import { App, Modal, Setting, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { TypedRelationship, RelationshipType, Character, Location, Event, PlotItem } from '../types';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PlotItemSuggestModal } from './PlotItemSuggestModal';
import { t } from '../i18n/strings';

export type RelationshipEditorCallback = (relationship: TypedRelationship) => void;

export class RelationshipEditorModal extends Modal {
    plugin: StorytellerSuitePlugin;
    relationship: TypedRelationship;
    onSubmit: RelationshipEditorCallback;
    isNew: boolean;
    entityType: 'any' | 'character' | 'location' | 'event' | 'item';

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
        this.onSubmit = onSubmit;
        this.modalEl.addClass('storyteller-relationship-editor-modal');
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
                    // Show entity selector based on entityType
                    if (this.entityType === 'any') {
                        // Show multi-type selector (simplified - just show character selector for now)
                        // In a full implementation, you'd have a combined selector
                        new CharacterSuggestModal(this.app, this.plugin, (selected) => {
                            if (selected) {
                                this.relationship.target = selected.id || selected.name;
                                targetDesc.setText(selected.name);
                            }
                        }).open();
                    } else if (this.entityType === 'character') {
                        new CharacterSuggestModal(this.app, this.plugin, (selected) => {
                            if (selected) {
                                this.relationship.target = selected.id || selected.name;
                                targetDesc.setText(selected.name);
                            }
                        }).open();
                    } else if (this.entityType === 'location') {
                        new LocationSuggestModal(this.app, this.plugin, (selected) => {
                            if (selected) {
                                this.relationship.target = selected.id || selected.name;
                                targetDesc.setText(selected.name);
                            }
                        }).open();
                    } else if (this.entityType === 'event') {
                        new EventSuggestModal(this.app, this.plugin, (selected) => {
                            if (selected) {
                                this.relationship.target = selected.id || selected.name;
                                targetDesc.setText(selected.name);
                            }
                        }).open();
                    } else if (this.entityType === 'item') {
                        new PlotItemSuggestModal(this.app, this.plugin, (selected) => {
                            if (selected) {
                                this.relationship.target = selected.id || selected.name;
                                targetDesc.setText(selected.name);
                            }
                        }).open();
                    }
                }));

        // Relationship type dropdown
        new Setting(contentEl)
            .setName(t('relationshipType'))
            .setDesc(t('relationshipTypeDesc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('ally', t('ally'))
                    .addOption('enemy', t('enemy'))
                    .addOption('family', t('family'))
                    .addOption('rival', t('rival'))
                    .addOption('romantic', t('romantic'))
                    .addOption('mentor', t('mentor'))
                    .addOption('acquaintance', t('acquaintance'))
                    .addOption('neutral', t('neutral'))
                    .addOption('custom', t('custom'))
                    .setValue(this.relationship.type)
                    .onChange(value => {
                        this.relationship.type = value as RelationshipType;
                    });
            });

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
}

