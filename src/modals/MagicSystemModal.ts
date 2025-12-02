import { App, Setting, Notice } from 'obsidian';
import type { MagicSystem } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';

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
            text: this.isNew ? t('createNewMagicSystem') : `${t('editMagicSystem')}: ${this.magicSystem.name}`
        });

        // --- Template Selector (for new magic systems) ---
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
                                await this.applyTemplateToMagicSystem(template);
                                this.refresh();
                                new Notice(t('templateApplied', template.name));
                            },
                            'magicSystem'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('magicSystemNameDesc'))
            .addText(text => {
                text.setValue(this.magicSystem.name)
                    .onChange(value => this.magicSystem.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('representativeImage'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: t('currentValue', this.magicSystem.profileImagePath || t('none'))
                });
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.magicSystem.profileImagePath = path || undefined;
                        imagePathDesc.setText(t('currentValue', this.magicSystem.profileImagePath || t('none')));
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText(t('clear'))
                .onClick(() => {
                    this.magicSystem.profileImagePath = undefined;
                    imagePathDesc.setText(t('currentValue', t('none')));
                })
            );

        // System Type
        new Setting(contentEl)
            .setName(t('systemType'))
            .setDesc(t('systemTypeDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'arcane': t('arcane'),
                    'divine': t('divine'),
                    'natural': t('natural'),
                    'psionic': t('psionic'),
                    'blood': t('bloodMagic'),
                    'elemental': t('elemental'),
                    'necromancy': t('necromancy'),
                    'alchemy': t('alchemy'),
                    'rune': t('runeMagic'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.systemType || 'arcane')
                .onChange(value => this.magicSystem.systemType = value)
            );

        // Rarity
        new Setting(contentEl)
            .setName(t('rarity'))
            .setDesc(t('rarityDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'ubiquitous': t('ubiquitous'),
                    'common': t('common'),
                    'uncommon': t('uncommon'),
                    'rare': t('rare'),
                    'legendary': t('legendary'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.rarity || 'common')
                .onChange(value => this.magicSystem.rarity = value)
            );

        // Power Level
        new Setting(contentEl)
            .setName(t('powerLevel'))
            .setDesc(t('powerLevelDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'low': t('low'),
                    'moderate': t('moderate'),
                    'high': t('high'),
                    'godlike': t('godlike'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.powerLevel || 'moderate')
                .onChange(value => this.magicSystem.powerLevel = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('magicSystemStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'active': t('active'),
                    'forbidden': t('forbidden'),
                    'lost': t('lostKnowledge'),
                    'declining': t('declining'),
                    'resurgent': t('resurgent'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.status || 'active')
                .onChange(value => this.magicSystem.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('magicSystemDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.description || '')
                    .onChange(value => this.magicSystem.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Rules (Markdown Section)
        new Setting(contentEl)
            .setName(t('rulesMechanics'))
            .setDesc(t('rulesMechanicsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.rules || '')
                    .onChange(value => this.magicSystem.rules = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Source (Markdown Section)
        new Setting(contentEl)
            .setName(t('source'))
            .setDesc(t('sourceDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.source || '')
                    .onChange(value => this.magicSystem.source = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Costs (Markdown Section)
        new Setting(contentEl)
            .setName(t('costsConsequences'))
            .setDesc(t('costsConsequencesDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.costs || '')
                    .onChange(value => this.magicSystem.costs = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Limitations (Markdown Section)
        new Setting(contentEl)
            .setName(t('limitations'))
            .setDesc(t('limitationsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.limitations || '')
                    .onChange(value => this.magicSystem.limitations = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Training (Markdown Section)
        new Setting(contentEl)
            .setName(t('trainingLearning'))
            .setDesc(t('trainingLearningDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.training || '')
                    .onChange(value => this.magicSystem.training = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName(t('history'))
            .setDesc(t('magicSystemHistoryDesc'))
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
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.magicSystem.name) {
                    new Notice(t('magicSystemNameRequired'));
                    return;
                }
                await this.onSubmit(this.magicSystem);
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
                        await this.onDelete(this.magicSystem);
                        this.close();
                    }
                })
            );
        }
    }

    private async applyTemplateToMagicSystem(template: Template): Promise<void> {
        if (!template.entities.magicSystems || template.entities.magicSystems.length === 0) {
            new Notice(t('noTemplatesAvailable'));
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
