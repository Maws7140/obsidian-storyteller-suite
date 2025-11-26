/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent, ButtonComponent } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { Chapter, Character, Location, Event, PlotItem, Group } from '../types';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { GroupSuggestModal } from './GroupSuggestModal';
import { PromptModal } from './ui/PromptModal';
import { getWhitelistKeys } from '../yaml/EntitySections';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type ChapterModalSubmitCallback = (ch: Chapter) => Promise<void>;
export type ChapterModalDeleteCallback = (ch: Chapter) => Promise<void>;

export class ChapterModal extends Modal {
    plugin: StorytellerSuitePlugin;
    chapter: Chapter;
    onSubmit: ChapterModalSubmitCallback;
    onDelete?: ChapterModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, ch: Chapter | null, onSubmit: ChapterModalSubmitCallback, onDelete?: ChapterModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = ch == null;
        this.chapter = ch ? { ...ch } : { name: '', tags: [], linkedCharacters: [], linkedLocations: [], linkedEvents: [], linkedItems: [], linkedGroups: [] } as Chapter;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-chapter-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewChapter') : `${t('editChapter')} ${this.chapter.name}` });

        // --- Template Selector (for new chapters) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured chapter template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a chapter template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToChapter(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'chapter'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('chapterTitlePh'))
                .setValue(this.chapter.name || '')
                .onChange(v => this.chapter.name = v)
            );

        new Setting(contentEl)
            .setName(t('number') || 'Number')
            .setDesc(t('orderingNumber') || 'Ordering number (optional)')
            .addText(text => text
                .setPlaceholder(t('numberEg'))
                .setValue(this.chapter.number != null ? String(this.chapter.number) : '')
                .onChange(v => {
                    const n = parseInt(v, 10);
                    this.chapter.number = Number.isFinite(n) ? n : undefined;
                })
            );

        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.chapter.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.chapter.tags = arr.length ? arr : undefined;
                })
            );

        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: t('currentValue', this.chapter.profileImagePath || t('none')) });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText(t('select'))
                .setTooltip(t('selectFromGallery'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.chapter.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.chapter.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(btn => btn
                .setButtonText(t('upload'))
                .setTooltip(t('uploadImage'))
                .onClick(async () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = async () => {
                        const file = fileInput.files?.[0];
                        if (file) {
                            try {
                                const uploadFolder = this.plugin.settings.galleryUploadFolder;
                                await this.plugin.ensureFolder(uploadFolder);
                                const timestamp = Date.now();
                                const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                                const fileName = `${timestamp}_${sanitizedName}`;
                                const filePath = `${uploadFolder}/${fileName}`;
                                const arrayBuffer = await file.arrayBuffer();
                                await this.app.vault.createBinary(filePath, arrayBuffer);
                                this.chapter.profileImagePath = filePath;
                                if (imageDescEl) imageDescEl.setText(`Current: ${filePath}`);
                                new Notice(t('imageUploaded', fileName));
                            } catch (error) {
                                console.error('Error uploading image:', error);
                                new Notice(t('errorUploadingImage'));
                            }
                        }
                    };
                    fileInput.click();
                })
            )
            .addButton(btn => btn
                .setIcon('cross')
                .setClass('mod-warning')
                .setTooltip(t('clearImage'))
                .onClick(() => {
                    this.chapter.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText(`${t('current')}: ${t('none')}`);
                })
            );

        new Setting(contentEl)
            .setName(t('summary') || 'Summary')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder(t('briefChapterSummaryPh'))
                  .setValue(this.chapter.summary || '')
                  .onChange(v => this.chapter.summary = v || undefined);
                ta.inputEl.rows = 10;
            });

        // Custom fields (add only)
        contentEl.createEl('h3', { text: t('customFields') });
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    const reserved = new Set<string>([...getWhitelistKeys('chapter'), 'customFields', 'filePath', 'id', 'sections']);
                    // Chapter type currently has no customFields in interface, but we preserve any extras
                    const fields = (this.chapter as any).customFields || ((this.chapter as any).customFields = {});
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
                            const exists = Object.keys(fields).some((k: string) => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return t('fieldAlreadyExists');
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
                }));

        // Linked entities
        contentEl.createEl('h3', { text: t('links') });

        const charactersSetting = new Setting(contentEl)
            .setName(t('characters'));
        const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(charactersListEl, this.chapter.linkedCharacters, 'characters');
        charactersSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                if (!this.chapter.linkedCharacters) this.chapter.linkedCharacters = [];
                if (!this.chapter.linkedCharacters.includes(ch.name)) this.chapter.linkedCharacters.push(ch.name);
                this.renderLinkedEntities(charactersListEl, this.chapter.linkedCharacters, 'characters');
            }).open();
        }));

        const locationsSetting = new Setting(contentEl)
            .setName(t('locations'));
        const locationsListEl = locationsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(locationsListEl, this.chapter.linkedLocations, 'locations');
        locationsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new LocationSuggestModal(this.app, this.plugin, (loc) => {
                if (!loc) return;
                if (!this.chapter.linkedLocations) this.chapter.linkedLocations = [];
                if (!this.chapter.linkedLocations.includes(loc.name)) this.chapter.linkedLocations.push(loc.name);
                this.renderLinkedEntities(locationsListEl, this.chapter.linkedLocations, 'locations');
            }).open();
        }));

        const eventsSetting = new Setting(contentEl)
            .setName(t('events'));
        const eventsListEl = eventsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(eventsListEl, this.chapter.linkedEvents, 'events');
        eventsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new EventSuggestModal(this.app, this.plugin, (evt) => {
                if (!this.chapter.linkedEvents) this.chapter.linkedEvents = [];
                if (!this.chapter.linkedEvents.includes(evt.name)) this.chapter.linkedEvents.push(evt.name);
                this.renderLinkedEntities(eventsListEl, this.chapter.linkedEvents, 'events');
            }).open();
        }));

        const itemsSetting = new Setting(contentEl)
            .setName(t('items'));
        const itemsListEl = itemsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(itemsListEl, this.chapter.linkedItems, 'items');
        itemsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(async () => {
            const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
            new PlotItemSuggestModal(this.app, this.plugin, (item) => {
                if (!this.chapter.linkedItems) this.chapter.linkedItems = [];
                if (!this.chapter.linkedItems.includes(item.name)) this.chapter.linkedItems.push(item.name);
                this.renderLinkedEntities(itemsListEl, this.chapter.linkedItems, 'items');
            }).open();
        }));

        const groupsSetting = new Setting(contentEl)
            .setName(t('groups'));
        const groupsListEl = groupsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(groupsListEl, this.chapter.linkedGroups, 'groups');
        groupsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new GroupSuggestModal(this.app, this.plugin, (g) => {
                if (!this.chapter.linkedGroups) this.chapter.linkedGroups = [];
                if (!this.chapter.linkedGroups.includes(g.id)) this.chapter.linkedGroups.push(g.id);
                this.renderLinkedEntities(groupsListEl, this.chapter.linkedGroups, 'groups');
            }).open();
        }));

        // Buttons
        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText(t('delete'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (this.chapter.filePath && confirm(t('confirmDeleteChapter', this.chapter.name))) {
                        await this.onDelete!(this.chapter);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText(t('cancel')).onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? t('createChapterBtn') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.chapter.name || !this.chapter.name.trim()) {
                    new Notice(t('chapterNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.chapter.summary = this.chapter.summary || '';
                await this.onSubmit(this.chapter);
                this.close();
            }));
    }

    // Helper method to render linked entities with individual delete buttons
    renderLinkedEntities(container: HTMLElement, items: string[] | undefined, entityType: string): void {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            return;
        }
        
        items.forEach((item, index) => {
            const itemEl = container.createDiv('storyteller-modal-list-item');
            itemEl.createSpan({ text: item });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${item}`)
                .setIcon('cross')
                .onClick(() => {
                    // Remove the item from the appropriate array
                    switch (entityType) {
                        case 'characters':
                            if (this.chapter.linkedCharacters) {
                                this.chapter.linkedCharacters.splice(index, 1);
                                this.renderLinkedEntities(container, this.chapter.linkedCharacters, entityType);
                            }
                            break;
                        case 'locations':
                            if (this.chapter.linkedLocations) {
                                this.chapter.linkedLocations.splice(index, 1);
                                this.renderLinkedEntities(container, this.chapter.linkedLocations, entityType);
                            }
                            break;
                        case 'events':
                            if (this.chapter.linkedEvents) {
                                this.chapter.linkedEvents.splice(index, 1);
                                this.renderLinkedEntities(container, this.chapter.linkedEvents, entityType);
                            }
                            break;
                        case 'items':
                            if (this.chapter.linkedItems) {
                                this.chapter.linkedItems.splice(index, 1);
                                this.renderLinkedEntities(container, this.chapter.linkedItems, entityType);
                            }
                            break;
                        case 'groups':
                            if (this.chapter.linkedGroups) {
                                this.chapter.linkedGroups.splice(index, 1);
                                this.renderLinkedEntities(container, this.chapter.linkedGroups, entityType);
                            }
                            break;
                    }
                });
        });
    }

    private async applyTemplateToChapter(template: Template): Promise<void> {
        if (!template.entities.chapters || template.entities.chapters.length === 0) {
            new Notice('This template does not contain any chapters');
            return;
        }

        const templateChapter = template.entities.chapters[0];

        Object.keys(templateChapter).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
                (this.chapter as any)[key] = (templateChapter as any)[key];
            }
        });

        // Clear relationships as they reference template entities
        this.chapter.linkedCharacters = [];
        this.chapter.linkedLocations = [];
        this.chapter.linkedEvents = [];
        this.chapter.linkedItems = [];
        this.chapter.linkedGroups = [];
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void { this.contentEl.empty(); }
}


