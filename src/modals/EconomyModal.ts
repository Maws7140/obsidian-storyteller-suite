import { App, Setting, Notice } from 'obsidian';
import type { Economy } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';

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
            text: this.isNew ? t('createNewEconomy') : `${t('editEconomy')}: ${this.economy.name}`
        });

        // --- Template Selector (for new economies) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName(t('startFromTemplate'))
                .setDesc(t('startFromTemplateDesc'))
                .addButton(button => button
                    .setButtonText(t('chooseTemplate'))
                    .setTooltip(t('selectTemplate'))
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToEconomy(template);
                                this.refresh();
                                new Notice(t('templateApplied', template.name));
                            },
                            'economy'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('economyNameDesc'))
            .addText(text => {
                text.setValue(this.economy.name)
                    .onChange(value => this.economy.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('representativeImage'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: t('currentValue', this.economy.profileImagePath || t('none'))
                });
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.economy.profileImagePath = path || undefined;
                        imagePathDesc.setText(t('currentValue', this.economy.profileImagePath || t('none')));
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText(t('clear'))
                .onClick(() => {
                    this.economy.profileImagePath = undefined;
                    imagePathDesc.setText(t('currentValue', t('none')));
                })
            );

        // Economic System
        new Setting(contentEl)
            .setName(t('economicSystem'))
            .setDesc(t('economicSystemDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'barter': t('barterEconomy'),
                    'market': t('marketEconomy'),
                    'command': t('commandEconomy'),
                    'mixed': t('mixedEconomy'),
                    'feudal': t('feudalEconomy'),
                    'gift': t('giftEconomy'),
                    'custom': t('custom')
                })
                .setValue(this.economy.economicSystem || 'market')
                .onChange(value => this.economy.economicSystem = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('economyStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'booming': t('booming'),
                    'growing': t('growing'),
                    'stable': t('stable'),
                    'recession': t('recession'),
                    'depression': t('depression'),
                    'recovering': t('recovering'),
                    'custom': t('custom')
                })
                .setValue(this.economy.status || 'stable')
                .onChange(value => this.economy.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('economyDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.description || '')
                    .onChange(value => this.economy.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Industries (Markdown Section)
        new Setting(contentEl)
            .setName(t('industries'))
            .setDesc(t('industriesDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.industries || '')
                    .onChange(value => this.economy.industries = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Taxation (Markdown Section)
        new Setting(contentEl)
            .setName(t('taxation'))
            .setDesc(t('taxationDesc'))
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
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.economy.name) {
                    new Notice(t('economyNameRequired'));
                    return;
                }
                await this.onSubmit(this.economy);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText(t('cancel'))
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('delete'))
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
            new Notice(t('noTemplatesAvailable'));
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
