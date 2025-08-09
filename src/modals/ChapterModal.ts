/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent, ButtonComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Chapter, Character, Location, Event, PlotItem, Group } from '../types';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';

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
        contentEl.createEl('h2', { text: this.isNew ? 'Create chapter' : `Edit ${this.chapter.name}` });

        new Setting(contentEl)
            .setName('Title')
            .addText(t => t
                .setPlaceholder('Chapter title')
                .setValue(this.chapter.name || '')
                .onChange(v => this.chapter.name = v)
            );

        new Setting(contentEl)
            .setName('Number')
            .setDesc('Ordering number (optional)')
            .addText(t => t
                .setPlaceholder('e.g., 1')
                .setValue(this.chapter.number != null ? String(this.chapter.number) : '')
                .onChange(v => {
                    const n = parseInt(v, 10);
                    this.chapter.number = Number.isFinite(n) ? n : undefined;
                })
            );

        new Setting(contentEl)
            .setName('Tags')
            .addText(t => t
                .setPlaceholder('tag1, tag2')
                .setValue((this.chapter.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.chapter.tags = arr.length ? arr : undefined;
                })
            );

        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName('Image')
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: `Current: ${this.chapter.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.chapter.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.chapter.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(btn => btn
                .setButtonText('Upload')
                .setTooltip('Upload new image')
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
                                new Notice(`Image uploaded: ${fileName}`);
                            } catch (error) {
                                console.error('Error uploading image:', error);
                                new Notice('Error uploading image. Please try again.');
                            }
                        }
                    };
                    fileInput.click();
                })
            )
            .addButton(btn => btn
                .setIcon('cross')
                .setClass('mod-warning')
                .setTooltip('Clear image')
                .onClick(() => {
                    this.chapter.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText('Current: None');
                })
            );

        new Setting(contentEl)
            .setName('Summary')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder('Brief summary for this chapter...')
                  .setValue(this.chapter.summary || '')
                  .onChange(v => this.chapter.summary = v || undefined);
                ta.inputEl.rows = 10;
            });

        // Linked entities
        contentEl.createEl('h3', { text: 'Linked Entities' });

        new Setting(contentEl)
            .setName('Characters')
            .setDesc((this.chapter.linkedCharacters || []).length ? (this.chapter.linkedCharacters || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                    if (!this.chapter.linkedCharacters) this.chapter.linkedCharacters = [];
                    if (!this.chapter.linkedCharacters.includes(ch.name)) this.chapter.linkedCharacters.push(ch.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.chapter.linkedCharacters = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Locations')
            .setDesc((this.chapter.linkedLocations || []).length ? (this.chapter.linkedLocations || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new LocationSuggestModal(this.app, this.plugin, (loc) => {
                    if (!loc) return;
                    if (!this.chapter.linkedLocations) this.chapter.linkedLocations = [];
                    if (!this.chapter.linkedLocations.includes(loc.name)) this.chapter.linkedLocations.push(loc.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.chapter.linkedLocations = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Events')
            .setDesc((this.chapter.linkedEvents || []).length ? (this.chapter.linkedEvents || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new EventSuggestModal(this.app, this.plugin, (evt) => {
                    if (!this.chapter.linkedEvents) this.chapter.linkedEvents = [];
                    if (!this.chapter.linkedEvents.includes(evt.name)) this.chapter.linkedEvents.push(evt.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.chapter.linkedEvents = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Items')
            .setDesc((this.chapter.linkedItems || []).length ? (this.chapter.linkedItems || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(async () => {
                const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
                new PlotItemSuggestModal(this.app, this.plugin, (item) => {
                    if (!this.chapter.linkedItems) this.chapter.linkedItems = [];
                    if (!this.chapter.linkedItems.includes(item.name)) this.chapter.linkedItems.push(item.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.chapter.linkedItems = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Groups')
            .setDesc((this.chapter.linkedGroups || []).length ? (this.chapter.linkedGroups || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                const groups = this.plugin.getGroups();
                const options = groups.map(g => g.name).join('\n');
                const pick = prompt('Type group name to add:\n' + options);
                const matched = groups.find(g => g.name.trim().toLowerCase() === (pick || '').trim().toLowerCase());
                if (matched) {
                    if (!this.chapter.linkedGroups) this.chapter.linkedGroups = [];
                    if (!this.chapter.linkedGroups.includes(matched.id)) this.chapter.linkedGroups.push(matched.id);
                    this.onOpen();
                } else if (pick) {
                    new Notice('Group not found');
                }
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.chapter.linkedGroups = [];
                this.onOpen();
            }));

        // Buttons
        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText('Delete')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (this.chapter.filePath && confirm(`Delete chapter "${this.chapter.name}"?`)) {
                        await this.onDelete!(this.chapter);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? 'Create Chapter' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.chapter.name || !this.chapter.name.trim()) {
                    new Notice('Chapter title is required.');
                    return;
                }
                await this.onSubmit(this.chapter);
                this.close();
            }));
    }

    onClose(): void { this.contentEl.empty(); }
}


