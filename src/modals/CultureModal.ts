import { App, Setting, Notice, TextAreaComponent } from 'obsidian';
import type { Culture } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';

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
            text: this.isNew ? t('createNewCulture') : `${t('editCulture')}: ${this.culture.name}`
        });

        // --- Template Selector (for new cultures) ---
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
                                await this.applyTemplateToCulture(template);
                                this.refresh();
                                new Notice(t('templateApplied', template.name));
                            },
                            'culture'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('cultureNameDesc'))
            .addText(text => {
                text.setValue(this.culture.name)
                    .onChange(value => this.culture.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: t('currentValue', this.culture.profileImagePath || t('none'))
                });
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.culture.profileImagePath = path || undefined;
                        imagePathDesc.setText(t('currentValue', this.culture.profileImagePath || t('none')));
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText(t('clear'))
                .onClick(() => {
                    this.culture.profileImagePath = undefined;
                    imagePathDesc.setText(t('currentValue', t('none')));
                })
            );

        // Technology Level
        new Setting(contentEl)
            .setName(t('techLevel'))
            .setDesc(t('techLevelDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'stone-age': t('stoneAge'),
                    'bronze-age': t('bronzeAge'),
                    'iron-age': t('ironAge'),
                    'medieval': t('medieval'),
                    'renaissance': t('renaissance'),
                    'industrial': t('industrial'),
                    'modern': t('modern'),
                    'futuristic': t('futuristic'),
                    'custom': t('custom')
                })
                .setValue(this.culture.techLevel || 'medieval')
                .onChange(value => this.culture.techLevel = value)
            );

        // Government Type
        new Setting(contentEl)
            .setName(t('governmentType'))
            .setDesc(t('governmentTypeDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'monarchy': t('monarchy'),
                    'democracy': t('democracy'),
                    'republic': t('republic'),
                    'theocracy': t('theocracy'),
                    'tribal': t('tribal'),
                    'empire': t('empire'),
                    'feudal': t('feudal'),
                    'oligarchy': t('oligarchy'),
                    'anarchy': t('anarchy'),
                    'custom': t('custom')
                })
                .setValue(this.culture.governmentType || 'monarchy')
                .onChange(value => this.culture.governmentType = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('cultureStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'thriving': t('thriving'),
                    'stable': t('stable'),
                    'declining': t('declining'),
                    'extinct': t('extinct'),
                    'emerging': t('emerging'),
                    'custom': t('custom')
                })
                .setValue(this.culture.status || 'thriving')
                .onChange(value => this.culture.status = value)
            );

        // Languages (comma-separated)
        new Setting(contentEl)
            .setName(t('languages'))
            .setDesc(t('languagesDesc'))
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
            .setName(t('population'))
            .setDesc(t('populationDesc'))
            .addText(text => text
                .setValue(this.culture.population || '')
                .onChange(value => this.culture.population = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('cultureDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.description || '')
                    .onChange(value => this.culture.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Values & Beliefs (Markdown Section)
        new Setting(contentEl)
            .setName(t('valuesBeliefs'))
            .setDesc(t('valuesBeliefsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.values || '')
                    .onChange(value => this.culture.values = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Religion (Markdown Section)
        new Setting(contentEl)
            .setName(t('religion'))
            .setDesc(t('religionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.religion || '')
                    .onChange(value => this.culture.religion = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Social Structure (Markdown Section)
        new Setting(contentEl)
            .setName(t('socialStructure'))
            .setDesc(t('socialStructureDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.socialStructure || '')
                    .onChange(value => this.culture.socialStructure = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName(t('history'))
            .setDesc(t('cultureHistoryDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.history || '')
                    .onChange(value => this.culture.history = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Naming Conventions (Markdown Section)
        new Setting(contentEl)
            .setName(t('namingConventions'))
            .setDesc(t('namingConventionsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.namingConventions || '')
                    .onChange(value => this.culture.namingConventions = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Customs (Markdown Section)
        new Setting(contentEl)
            .setName(t('customsTraditions'))
            .setDesc(t('customsTraditionsDesc'))
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
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.culture.name) {
                    new Notice(t('cultureNameRequired'));
                    return;
                }
                await this.onSubmit(this.culture);
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
                        await this.onDelete(this.culture);
                        this.close();
                    }
                })
            );
        }
    }

    private async applyTemplateToCulture(template: Template): Promise<void> {
        if (!template.entities.cultures || template.entities.cultures.length === 0) {
            new Notice(t('noTemplatesAvailable'));
            return;
        }

        const templateCulture = template.entities.cultures[0];

        // Extract template-specific fields
        const { templateId, sectionContent, customYamlFields, id, filePath, ...entityData } = templateCulture as any;

        // Apply base entity fields
        Object.assign(this.culture, entityData);

        // Apply custom YAML fields if they exist
        if (customYamlFields) {
            Object.assign(this.culture, customYamlFields);
        }

        // Apply section content if it exists (map section names to lowercase properties)
        if (sectionContent) {
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (this.culture as any)[propName] = content;
            }
        }

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
