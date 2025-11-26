import { App, Setting, Notice } from 'obsidian';
import type { Economy } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type EconomyModalSubmitCallback = (economy: Economy) => Promise<void>;
export type EconomyModalDeleteCallback = (economy: Economy) => Promise<void>;

/**
 * Modal for creating and editing economic systems
 */
export class EconomyModal extends ResponsiveModal {
    economy: Economy;
    plugin: StorytellerSuitePlugin;
    onSubmit: EconomyModalSubmitCallback;
    onDelete?: EconomyModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        economy: Economy | null,
        onSubmit: EconomyModalSubmitCallback,
        onDelete?: EconomyModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = economy === null;

        this.economy = economy || {
            name: '',
            economicSystem: 'market',
            status: 'stable',
            currencies: [],
            resources: [],
            tradeRoutes: [],
            linkedLocations: [],
            linkedFactions: [],
            linkedCultures: [],
            linkedEvents: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.economy.customFields) this.economy.customFields = {};
        if (!this.economy.currencies) this.economy.currencies = [];
        if (!this.economy.resources) this.economy.resources = [];
        if (!this.economy.tradeRoutes) this.economy.tradeRoutes = [];
        if (!this.economy.linkedLocations) this.economy.linkedLocations = [];
        if (!this.economy.linkedFactions) this.economy.linkedFactions = [];
        if (!this.economy.linkedCultures) this.economy.linkedCultures = [];
        if (!this.economy.linkedEvents) this.economy.linkedEvents = [];
        if (!this.economy.groups) this.economy.groups = [];
        if (!this.economy.connections) this.economy.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-economy-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Economy' : `Edit Economy: ${this.economy.name}`
        });

        // --- Template Selector (for new economies) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured economy template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select an economy template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToEconomy(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'economy'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the economic system (e.g., "Kingdom of Eldoria Economy")')
            .addText(text => {
                text.setValue(this.economy.name)
                    .onChange(value => this.economy.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Representative Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: `Current: ${this.economy.profileImagePath || 'None'}`
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.economy.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.economy.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    this.economy.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                })
            );

        // Economic System
        new Setting(contentEl)
            .setName('Economic System')
            .setDesc('Type of economic organization')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'barter': 'Barter Economy',
                    'market': 'Market Economy',
                    'command': 'Command Economy',
                    'mixed': 'Mixed Economy',
                    'feudal': 'Feudal Economy',
                    'gift': 'Gift Economy',
                    'custom': 'Custom'
                })
                .setValue(this.economy.economicSystem || 'market')
                .onChange(value => this.economy.economicSystem = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .setDesc('Current economic health')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'booming': 'Booming',
                    'growing': 'Growing',
                    'stable': 'Stable',
                    'recession': 'Recession',
                    'depression': 'Depression',
                    'recovering': 'Recovering',
                    'custom': 'Custom'
                })
                .setValue(this.economy.status || 'stable')
                .onChange(value => this.economy.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of the economic system')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.description || '')
                    .onChange(value => this.economy.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Industries (Markdown Section)
        new Setting(contentEl)
            .setName('Industries')
            .setDesc('Major industries, production, and economic activities')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.industries || '')
                    .onChange(value => this.economy.industries = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Taxation (Markdown Section)
        new Setting(contentEl)
            .setName('Taxation & Trade Policy')
            .setDesc('Tax system, trade regulations, and economic policies')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.taxation || '')
                    .onChange(value => this.economy.taxation = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.economy.name) {
                    new Notice('Economy name is required');
                    return;
                }
                await this.onSubmit(this.economy);
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
                        await this.onDelete(this.economy);
                        this.close();
                    }
                })
            );
        }
    }

    private async applyTemplateToEconomy(template: Template): Promise<void> {
        if (!template.entities.economies || template.entities.economies.length === 0) {
            new Notice('This template does not contain any economies');
            return;
        }

        const templateEconomy = template.entities.economies[0];

        Object.keys(templateEconomy).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
                (this.economy as any)[key] = (templateEconomy as any)[key];
            }
        });

        // Clear relationships as they reference template entities
        this.economy.linkedLocations = [];
        this.economy.linkedFactions = [];
        this.economy.linkedCultures = [];
        this.economy.linkedEvents = [];
        this.economy.groups = [];
        this.economy.connections = [];
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
