import { App, Setting, Notice, TextAreaComponent } from 'obsidian';
import type { Faction } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';

export type FactionModalSubmitCallback = (faction: Faction) => Promise<void>;
export type FactionModalDeleteCallback = (faction: Faction) => Promise<void>;

/**
 * Modal for creating and editing factions/organizations
 */
export class FactionModal extends ResponsiveModal {
    faction: Faction;
    plugin: StorytellerSuitePlugin;
    onSubmit: FactionModalSubmitCallback;
    onDelete?: FactionModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        faction: Faction | null,
        onSubmit: FactionModalSubmitCallback,
        onDelete?: FactionModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = faction === null;

        this.faction = faction || {
            name: '',
            factionType: 'organization',
            strength: 'moderate',
            status: 'active',
            members: [],
            territories: [],
            factionRelationships: [],
            linkedEvents: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.faction.customFields) this.faction.customFields = {};
        if (!this.faction.members) this.faction.members = [];
        if (!this.faction.territories) this.faction.territories = [];
        if (!this.faction.factionRelationships) this.faction.factionRelationships = [];
        if (!this.faction.linkedEvents) this.faction.linkedEvents = [];
        if (!this.faction.colors) this.faction.colors = [];
        if (!this.faction.groups) this.faction.groups = [];
        if (!this.faction.connections) this.faction.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-faction-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Faction' : `Edit Faction: ${this.faction.name}`
        });

        // Name (Required)
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the faction or organization')
            .addText(text => {
                text.setValue(this.faction.name)
                    .onChange(value => this.faction.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Emblem/Symbol')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: `Current: ${this.faction.profileImagePath || 'None'}`
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.faction.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.faction.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    this.faction.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                })
            );

        // Faction Type
        new Setting(contentEl)
            .setName('Faction Type')
            .setDesc('Category or classification of this faction')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'guild': 'Guild',
                    'military': 'Military',
                    'religious': 'Religious Order',
                    'criminal': 'Criminal Organization',
                    'political': 'Political Party',
                    'mercenary': 'Mercenary Company',
                    'trading': 'Trading Company',
                    'academic': 'Academic Institution',
                    'secret': 'Secret Society',
                    'organization': 'General Organization',
                    'custom': 'Custom'
                })
                .setValue(this.faction.factionType || 'organization')
                .onChange(value => this.faction.factionType = value)
            );

        // Strength/Power Level
        new Setting(contentEl)
            .setName('Power Level')
            .setDesc('Overall strength and influence of the faction')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'weak': 'Weak',
                    'moderate': 'Moderate',
                    'strong': 'Strong',
                    'dominant': 'Dominant',
                    'custom': 'Custom'
                })
                .setValue(this.faction.strength || 'moderate')
                .onChange(value => this.faction.strength = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .setDesc('Current state of the faction')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'active': 'Active',
                    'growing': 'Growing',
                    'declining': 'Declining',
                    'disbanded': 'Disbanded',
                    'dormant': 'Dormant',
                    'custom': 'Custom'
                })
                .setValue(this.faction.status || 'active')
                .onChange(value => this.faction.status = value)
            );

        // Colors (comma-separated)
        new Setting(contentEl)
            .setName('Colors')
            .setDesc('Comma-separated colors (e.g., "Red, Gold, Black")')
            .addText(text => text
                .setValue(this.faction.colors?.join(', ') || '')
                .onChange(value => {
                    this.faction.colors = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s);
                })
            );

        // Motto
        new Setting(contentEl)
            .setName('Motto')
            .setDesc('Faction motto or slogan')
            .addText(text => text
                .setValue(this.faction.motto || '')
                .onChange(value => this.faction.motto = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of the faction and its purpose')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.faction.description || '')
                    .onChange(value => this.faction.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName('History')
            .setDesc('Origins and major events in faction history')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.faction.history || '')
                    .onChange(value => this.faction.history = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Structure (Markdown Section)
        new Setting(contentEl)
            .setName('Structure')
            .setDesc('Organizational hierarchy and leadership')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.faction.structure || '')
                    .onChange(value => this.faction.structure = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Goals (Markdown Section)
        new Setting(contentEl)
            .setName('Goals')
            .setDesc('Primary objectives and motivations')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.faction.goals || '')
                    .onChange(value => this.faction.goals = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Resources (Markdown Section)
        new Setting(contentEl)
            .setName('Resources')
            .setDesc('Assets, wealth, and capabilities')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.faction.resources || '')
                    .onChange(value => this.faction.resources = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.faction.name) {
                    new Notice('Faction name is required');
                    return;
                }
                await this.onSubmit(this.faction);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete')
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.faction);
                        this.close();
                    }
                })
            );
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
