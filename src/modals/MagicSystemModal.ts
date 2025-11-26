import { App, Setting, Notice } from 'obsidian';
import type { MagicSystem } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type MagicSystemModalSubmitCallback = (magicSystem: MagicSystem) => Promise<void>;
export type MagicSystemModalDeleteCallback = (magicSystem: MagicSystem) => Promise<void>;

/**
 * Modal for creating and editing magic systems
 */
export class MagicSystemModal extends ResponsiveModal {
    magicSystem: MagicSystem;
    plugin: StorytellerSuitePlugin;
    onSubmit: MagicSystemModalSubmitCallback;
    onDelete?: MagicSystemModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        magicSystem: MagicSystem | null,
        onSubmit: MagicSystemModalSubmitCallback,
        onDelete?: MagicSystemModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = magicSystem === null;

        this.magicSystem = magicSystem || {
            name: '',
            systemType: 'arcane',
            rarity: 'common',
            powerLevel: 'moderate',
            status: 'active',
            categories: [],
            abilities: [],
            consistencyRules: [],
            linkedCharacters: [],
            linkedLocations: [],
            linkedCultures: [],
            linkedEvents: [],
            linkedItems: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.magicSystem.customFields) this.magicSystem.customFields = {};
        if (!this.magicSystem.categories) this.magicSystem.categories = [];
        if (!this.magicSystem.abilities) this.magicSystem.abilities = [];
        if (!this.magicSystem.consistencyRules) this.magicSystem.consistencyRules = [];
        if (!this.magicSystem.linkedCharacters) this.magicSystem.linkedCharacters = [];
        if (!this.magicSystem.linkedLocations) this.magicSystem.linkedLocations = [];
        if (!this.magicSystem.linkedCultures) this.magicSystem.linkedCultures = [];
        if (!this.magicSystem.linkedEvents) this.magicSystem.linkedEvents = [];
        if (!this.magicSystem.linkedItems) this.magicSystem.linkedItems = [];
        if (!this.magicSystem.groups) this.magicSystem.groups = [];
        if (!this.magicSystem.connections) this.magicSystem.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-magic-system-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Magic System' : `Edit Magic System: ${this.magicSystem.name}`
        });

        // --- Template Selector (for new magic systems) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured magic system template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a magic system template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToMagicSystem(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'magicSystem'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the magic system (e.g., "Arcane Arts", "Divine Magic")')
            .addText(text => {
                text.setValue(this.magicSystem.name)
                    .onChange(value => this.magicSystem.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Representative Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: `Current: ${this.magicSystem.profileImagePath || 'None'}`
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.magicSystem.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.magicSystem.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    this.magicSystem.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                })
            );

        // System Type
        new Setting(contentEl)
            .setName('System Type')
            .setDesc('Source or category of magical power')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'arcane': 'Arcane (Learned)',
                    'divine': 'Divine (Faith-based)',
                    'natural': 'Natural (Nature/Druidic)',
                    'psionic': 'Psionic (Mind Powers)',
                    'blood': 'Blood Magic',
                    'elemental': 'Elemental',
                    'necromancy': 'Necromancy',
                    'alchemy': 'Alchemy',
                    'rune': 'Rune Magic',
                    'custom': 'Custom'
                })
                .setValue(this.magicSystem.systemType || 'arcane')
                .onChange(value => this.magicSystem.systemType = value)
            );

        // Rarity
        new Setting(contentEl)
            .setName('Rarity')
            .setDesc('How common is magic in the world?')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'ubiquitous': 'Ubiquitous (Everyone has it)',
                    'common': 'Common (Many have it)',
                    'uncommon': 'Uncommon (Some have it)',
                    'rare': 'Rare (Few have it)',
                    'legendary': 'Legendary (Almost none)',
                    'custom': 'Custom'
                })
                .setValue(this.magicSystem.rarity || 'common')
                .onChange(value => this.magicSystem.rarity = value)
            );

        // Power Level
        new Setting(contentEl)
            .setName('Power Level')
            .setDesc('Overall potency of this magic system')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'low': 'Low (Subtle effects)',
                    'moderate': 'Moderate (Noticeable effects)',
                    'high': 'High (Powerful effects)',
                    'godlike': 'Godlike (Reality-bending)',
                    'custom': 'Custom'
                })
                .setValue(this.magicSystem.powerLevel || 'moderate')
                .onChange(value => this.magicSystem.powerLevel = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .setDesc('Current state of the magic system')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'active': 'Active',
                    'forbidden': 'Forbidden',
                    'lost': 'Lost Knowledge',
                    'declining': 'Declining',
                    'resurgent': 'Resurgent',
                    'custom': 'Custom'
                })
                .setValue(this.magicSystem.status || 'active')
                .onChange(value => this.magicSystem.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of how magic works in this system')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.description || '')
                    .onChange(value => this.magicSystem.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Rules (Markdown Section)
        new Setting(contentEl)
            .setName('Rules & Mechanics')
            .setDesc('How magic is used, cast, or channeled')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.rules || '')
                    .onChange(value => this.magicSystem.rules = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Source (Markdown Section)
        new Setting(contentEl)
            .setName('Source')
            .setDesc('Where does magical power come from?')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.source || '')
                    .onChange(value => this.magicSystem.source = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Costs (Markdown Section)
        new Setting(contentEl)
            .setName('Costs & Consequences')
            .setDesc('What does using magic cost the caster?')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.costs || '')
                    .onChange(value => this.magicSystem.costs = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Limitations (Markdown Section)
        new Setting(contentEl)
            .setName('Limitations')
            .setDesc('What are the boundaries and restrictions of this magic?')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.limitations || '')
                    .onChange(value => this.magicSystem.limitations = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Training (Markdown Section)
        new Setting(contentEl)
            .setName('Training & Learning')
            .setDesc('How is magic learned and mastered?')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.training || '')
                    .onChange(value => this.magicSystem.training = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName('History')
            .setDesc('Origins and evolution of this magic system')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.history || '')
                    .onChange(value => this.magicSystem.history = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.magicSystem.name) {
                    new Notice('Magic system name is required');
                    return;
                }
                await this.onSubmit(this.magicSystem);
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
                        await this.onDelete(this.magicSystem);
                        this.close();
                    }
                })
            );
        }
    }

    private async applyTemplateToMagicSystem(template: Template): Promise<void> {
        if (!template.entities.magicSystems || template.entities.magicSystems.length === 0) {
            new Notice('This template does not contain any magic systems');
            return;
        }

        const templateMagic = template.entities.magicSystems[0];

        Object.keys(templateMagic).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
                (this.magicSystem as any)[key] = (templateMagic as any)[key];
            }
        });

        // Clear relationships as they reference template entities
        this.magicSystem.linkedCharacters = [];
        this.magicSystem.linkedLocations = [];
        this.magicSystem.linkedCultures = [];
        this.magicSystem.linkedEvents = [];
        this.magicSystem.linkedItems = [];
        this.magicSystem.groups = [];
        this.magicSystem.connections = [];
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
