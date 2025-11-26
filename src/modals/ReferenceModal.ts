/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { Reference } from '../types';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { PromptModal } from './ui/PromptModal';
import { getWhitelistKeys } from '../yaml/EntitySections';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type ReferenceModalSubmitCallback = (ref: Reference) => Promise<void>;
export type ReferenceModalDeleteCallback = (ref: Reference) => Promise<void>;

export class ReferenceModal extends Modal {
    plugin: StorytellerSuitePlugin;
    refData: Reference;
    onSubmit: ReferenceModalSubmitCallback;
    onDelete?: ReferenceModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, ref: Reference | null, onSubmit: ReferenceModalSubmitCallback, onDelete?: ReferenceModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = ref == null;
        this.refData = ref ? { ...ref } : { name: '', category: 'Misc', tags: [] } as Reference;
        if (!this.refData.tags) this.refData.tags = [];
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-reference-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createReference') : `${t('editReference')} ${this.refData.name}` });

        // --- Template Selector (for new references) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured reference template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a reference template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToReference(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'reference'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('title'))
                .setValue(this.refData.name || '')
                .onChange(v => this.refData.name = v)
            );

        new Setting(contentEl)
            .setName(t('category') || 'Category')
            .addText(text => text
                .setPlaceholder(t('categoryPh'))
                .setValue(this.refData.category || '')
                .onChange(v => this.refData.category = v || undefined)
            );

        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .setDesc(t('traitsPlaceholder'))
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.refData.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.refData.tags = arr.length ? arr : undefined;
                })
            );

        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: t('currentValue', this.refData.profileImagePath || t('none')) });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText(t('select'))
                .setTooltip(t('selectFromGallery'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.refData.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.refData.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(btn => btn
                .setButtonText(t('upload'))
                .setTooltip(t('uploadImage'))
                .onClick(async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        try {
                            const uploadFolder = this.plugin.settings.galleryUploadFolder;
                            await this.plugin.ensureFolder(uploadFolder);
                            const timestamp = Date.now();
                            const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                            const fileName = `${timestamp}_${sanitizedName}`;
                            const filePath = `${uploadFolder}/${fileName}`;
                            const arrayBuffer = await file.arrayBuffer();
                            await this.app.vault.createBinary(filePath, arrayBuffer);
                            this.refData.profileImagePath = filePath;
                            if (imageDescEl) imageDescEl.setText(`Current: ${filePath}`);
                            new Notice(t('imageUploaded', fileName));
                        } catch (e) {
                            console.error('Upload failed', e);
                            new Notice(t('errorUploadingImage'));
                        }
                    };
                    input.click();
                })
            )
            .addButton(btn => btn
                .setIcon('cross')
                .setClass('mod-warning')
                .setTooltip(t('clearImage'))
                .onClick(() => {
                    this.refData.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText(`${t('current')}: ${t('none')}`);
                })
            );

        new Setting(contentEl)
            .setName(t('content') || 'Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder(t('content'))
                  .setValue(this.refData.content || '')
                  .onChange(v => this.refData.content = v || undefined);
                ta.inputEl.rows = 12;
            });

        // Custom fields (add only)
        contentEl.createEl('h3', { text: t('customFields') });
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    const reserved = new Set<string>([...getWhitelistKeys('reference'), 'customFields', 'filePath', 'id', 'sections']);
                    const anyRef = this.refData as any;
                    if (!anyRef.customFields) anyRef.customFields = {} as Record<string, string>;
                    const fields = anyRef.customFields as Record<string, string>;
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: t('customFieldValueTitle'),
                            label: t('valueForX', key),
                            defaultValue: '',
                            onSubmit: (val: string) => { fields[key] = val; }
                        }).open();
                    };
                    new PromptModal(this.app, {
                        title: t('newCustomFieldTitle'),
                        label: t('fieldName'),
                        defaultValue: '',
                        validator: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed) return t('fieldNameCannotBeEmpty');
                            if (reserved.has(trimmed)) return t('thatNameIsReserved');
                            const exists = Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return t('fieldAlreadyExists');
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
                }));

        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText(t('delete'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteReference', this.refData.name))) {
                        await this.onDelete!(this.refData);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText(t('cancel')).onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? t('createReferenceBtn') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.refData.name || !this.refData.name.trim()) {
                    new Notice(t('title'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.refData.content = this.refData.content || '';
                await this.onSubmit(this.refData);
                this.close();
            })
        );
    }

    private async applyTemplateToReference(template: Template): Promise<void> {
        if (!template.entities.references || template.entities.references.length === 0) {
            new Notice('This template does not contain any references');
            return;
        }

        const templateRef = template.entities.references[0];

        Object.keys(templateRef).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
                (this.refData as any)[key] = (templateRef as any)[key];
            }
        });
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


