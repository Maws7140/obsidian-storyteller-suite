import { App, Setting, Notice, TextAreaComponent } from 'obsidian';
import type { Culture } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type CultureModalSubmitCallback = (culture: Culture) => Promise<void>;
export type CultureModalDeleteCallback = (culture: Culture) => Promise<void>;

/**
 * Modal for creating and editing cultures/societies
 */
export class CultureModal extends ResponsiveModal {
    culture: Culture;
    plugin: StorytellerSuitePlugin;
    onSubmit: CultureModalSubmitCallback;
    onDelete?: CultureModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        culture: Culture | null,
        onSubmit: CultureModalSubmitCallback,
        onDelete?: CultureModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = culture === null;

        this.culture = culture || {
            name: '',
            languages: [],
            techLevel: 'medieval',
            governmentType: 'monarchy',
            status: 'thriving',
            linkedLocations: [],
            linkedCharacters: [],
            linkedEvents: [],
            relatedCultures: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.culture.customFields) this.culture.customFields = {};
        if (!this.culture.languages) this.culture.languages = [];
        if (!this.culture.linkedLocations) this.culture.linkedLocations = [];
        if (!this.culture.linkedCharacters) this.culture.linkedCharacters = [];
        if (!this.culture.linkedEvents) this.culture.linkedEvents = [];
        if (!this.culture.relatedCultures) this.culture.relatedCultures = [];
        if (!this.culture.groups) this.culture.groups = [];
        if (!this.culture.connections) this.culture.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-culture-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Culture' : `Edit Culture: ${this.culture.name}`
        });

        // --- Template Selector (for new cultures) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured culture template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a culture template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToCulture(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'culture'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the culture or society')
            .addText(text => {
                text.setValue(this.culture.name)
                    .onChange(value => this.culture.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Profile Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: `Current: ${this.culture.profileImagePath || 'None'}`
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.culture.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.culture.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    this.culture.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                })
            );

        // Technology Level
        new Setting(contentEl)
            .setName('Technology Level')
            .setDesc('Technological advancement of the culture')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'stone-age': 'Stone Age',
                    'bronze-age': 'Bronze Age',
                    'iron-age': 'Iron Age',
                    'medieval': 'Medieval',
                    'renaissance': 'Renaissance',
                    'industrial': 'Industrial',
                    'modern': 'Modern',
                    'futuristic': 'Futuristic',
                    'custom': 'Custom'
                })
                .setValue(this.culture.techLevel || 'medieval')
                .onChange(value => this.culture.techLevel = value)
            );

        // Government Type
        new Setting(contentEl)
            .setName('Government Type')
            .setDesc('Political system and leadership structure')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'monarchy': 'Monarchy',
                    'democracy': 'Democracy',
                    'republic': 'Republic',
                    'theocracy': 'Theocracy',
                    'tribal': 'Tribal',
                    'empire': 'Empire',
                    'feudal': 'Feudal',
                    'oligarchy': 'Oligarchy',
                    'anarchy': 'Anarchy',
                    'custom': 'Custom'
                })
                .setValue(this.culture.governmentType || 'monarchy')
                .onChange(value => this.culture.governmentType = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .setDesc('Current state of the culture')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'thriving': 'Thriving',
                    'stable': 'Stable',
                    'declining': 'Declining',
                    'extinct': 'Extinct',
                    'emerging': 'Emerging',
                    'custom': 'Custom'
                })
                .setValue(this.culture.status || 'thriving')
                .onChange(value => this.culture.status = value)
            );

        // Languages (comma-separated)
        new Setting(contentEl)
            .setName('Languages')
            .setDesc('Comma-separated list of languages spoken (e.g., Common, Elvish, Dwarvish)')
            .addText(text => text
                .setValue(this.culture.languages?.join(', ') || '')
                .onChange(value => {
                    this.culture.languages = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s);
                })
            );

        // Population
        new Setting(contentEl)
            .setName('Population')
            .setDesc('Estimated population size (e.g., "10,000" or "Large")')
            .addText(text => text
                .setValue(this.culture.population || '')
                .onChange(value => this.culture.population = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of the culture and its characteristics')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.description || '')
                    .onChange(value => this.culture.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Values & Beliefs (Markdown Section)
        new Setting(contentEl)
            .setName('Values & Beliefs')
            .setDesc('Core cultural values, worldview, and philosophical beliefs')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.values || '')
                    .onChange(value => this.culture.values = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Religion (Markdown Section)
        new Setting(contentEl)
            .setName('Religion')
            .setDesc('Religious beliefs, practices, and deities worshipped')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.religion || '')
                    .onChange(value => this.culture.religion = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Social Structure (Markdown Section)
        new Setting(contentEl)
            .setName('Social Structure')
            .setDesc('Class hierarchy, social organization, and caste systems')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.socialStructure || '')
                    .onChange(value => this.culture.socialStructure = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName('History')
            .setDesc('Origins, major historical events, and cultural evolution')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.history || '')
                    .onChange(value => this.culture.history = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Naming Conventions (Markdown Section)
        new Setting(contentEl)
            .setName('Naming Conventions')
            .setDesc('How members of this culture name people, places, and things')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.namingConventions || '')
                    .onChange(value => this.culture.namingConventions = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Customs (Markdown Section)
        new Setting(contentEl)
            .setName('Customs & Traditions')
            .setDesc('Cultural practices, ceremonies, holidays, and traditions')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.customs || '')
                    .onChange(value => this.culture.customs = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.culture.name) {
                    new Notice('Culture name is required');
                    return;
                }
                await this.onSubmit(this.culture);
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
                        await this.onDelete(this.culture);
                        this.close();
                    }
                })
            );
        }
    }

    private async applyTemplateToCulture(template: Template): Promise<void> {
        if (!template.entities.cultures || template.entities.cultures.length === 0) {
            new Notice('This template does not contain any cultures');
            return;
        }

        const templateCulture = template.entities.cultures[0];

        Object.keys(templateCulture).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
                (this.culture as any)[key] = (templateCulture as any)[key];
            }
        });

        // Clear relationships as they reference template entities
        this.culture.linkedLocations = [];
        this.culture.linkedCharacters = [];
        this.culture.linkedEvents = [];
        this.culture.relatedCultures = [];
        this.culture.parentCulture = undefined;
        this.culture.groups = [];
        this.culture.connections = [];
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
