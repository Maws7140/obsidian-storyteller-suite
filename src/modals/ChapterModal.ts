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

        new Setting(contentEl)
            .setName(t('characters'))
            .setDesc((this.chapter.linkedCharacters || []).length ? (this.chapter.linkedCharacters || []).join(', ') : t('none'))
            .addButton(btn => btn.setButtonText(t('add')).onClick(() => {
                new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                    if (!this.chapter.linkedCharacters) this.chapter.linkedCharacters = [];
                    if (!this.chapter.linkedCharacters.includes(ch.name)) this.chapter.linkedCharacters.push(ch.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText(t('clear')).onClick(() => {
                this.chapter.linkedCharacters = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName(t('locations'))
            .setDesc((this.chapter.linkedLocations || []).length ? (this.chapter.linkedLocations || []).join(', ') : t('none'))
            .addButton(btn => btn.setButtonText(t('add')).onClick(() => {
                new LocationSuggestModal(this.app, this.plugin, (loc) => {
                    if (!loc) return;
                    if (!this.chapter.linkedLocations) this.chapter.linkedLocations = [];
                    if (!this.chapter.linkedLocations.includes(loc.name)) this.chapter.linkedLocations.push(loc.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText(t('clear')).onClick(() => {
                this.chapter.linkedLocations = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName(t('events'))
            .setDesc((this.chapter.linkedEvents || []).length ? (this.chapter.linkedEvents || []).join(', ') : t('none'))
            .addButton(btn => btn.setButtonText(t('add')).onClick(() => {
                new EventSuggestModal(this.app, this.plugin, (evt) => {
                    if (!this.chapter.linkedEvents) this.chapter.linkedEvents = [];
                    if (!this.chapter.linkedEvents.includes(evt.name)) this.chapter.linkedEvents.push(evt.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText(t('clear')).onClick(() => {
                this.chapter.linkedEvents = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName(t('items'))
            .setDesc((this.chapter.linkedItems || []).length ? (this.chapter.linkedItems || []).join(', ') : t('none'))
            .addButton(btn => btn.setButtonText(t('add')).onClick(async () => {
                const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
                new PlotItemSuggestModal(this.app, this.plugin, (item) => {
                    if (!this.chapter.linkedItems) this.chapter.linkedItems = [];
                    if (!this.chapter.linkedItems.includes(item.name)) this.chapter.linkedItems.push(item.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText(t('clear')).onClick(() => {
                this.chapter.linkedItems = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName(t('groups'))
            .setDesc((this.chapter.linkedGroups || []).length ? (this.chapter.linkedGroups || []).join(', ') : t('none'))
            .addButton(btn => btn.setButtonText(t('add')).onClick(() => {
                new GroupSuggestModal(this.app, this.plugin, (g) => {
                    if (!this.chapter.linkedGroups) this.chapter.linkedGroups = [];
                    if (!this.chapter.linkedGroups.includes(g.id)) this.chapter.linkedGroups.push(g.id);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText(t('clear')).onClick(() => {
                this.chapter.linkedGroups = [];
                this.onOpen();
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

    onClose(): void { this.contentEl.empty(); }
}


