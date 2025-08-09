/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Scene } from '../types';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';

export type SceneModalSubmitCallback = (sc: Scene) => Promise<void>;
export type SceneModalDeleteCallback = (sc: Scene) => Promise<void>;

export class SceneModal extends Modal {
    plugin: StorytellerSuitePlugin;
    scene: Scene;
    onSubmit: SceneModalSubmitCallback;
    onDelete?: SceneModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, sc: Scene | null, onSubmit: SceneModalSubmitCallback, onDelete?: SceneModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = sc == null;
        this.scene = sc ? { ...sc } : { name: '', status: 'Draft', tags: [], linkedCharacters: [], linkedLocations: [], linkedEvents: [], linkedItems: [], linkedGroups: [] } as Scene;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-scene-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create scene' : `Edit ${this.scene.name}` });

        new Setting(contentEl)
            .setName('Title')
            .addText(t => t
                .setPlaceholder('Scene title')
                .setValue(this.scene.name || '')
                .onChange(v => this.scene.name = v)
            );

        // Chapter selector
        new Setting(contentEl)
            .setName('Chapter')
            .setDesc(this.scene.chapterName || 'Unassigned')
            .addDropdown(async dd => {
                dd.addOption('', 'Unassigned');
                const chapters = await this.plugin.listChapters();
                chapters.forEach(ch => dd.addOption(ch.id || ch.name, ch.number != null ? `${ch.number}. ${ch.name}` : ch.name));
                dd.setValue(this.scene.chapterId || '');
                dd.onChange((val) => {
                    if (!val) { this.scene.chapterId = undefined; this.scene.chapterName = undefined; }
                    else {
                        const picked = chapters.find(c => (c.id && c.id === val) || (!c.id && c.name === val));
                        this.scene.chapterId = picked?.id;
                        this.scene.chapterName = picked?.name;
                    }
                    this.onOpen();
                });
            });

        new Setting(contentEl)
            .setName('Status')
            .addDropdown(dd => dd
                .addOptions({ Draft: 'Draft', Outline: 'Outline', WIP: 'WIP', Revised: 'Revised', Final: 'Final' })
                .setValue(this.scene.status || 'Draft')
                .onChange(v => this.scene.status = v)
            );

        new Setting(contentEl)
            .setName('Priority (in chapter)')
            .addText(t => t
                .setPlaceholder('e.g., 1')
                .setValue(this.scene.priority != null ? String(this.scene.priority) : '')
                .onChange(v => {
                    const n = parseInt(v, 10);
                    this.scene.priority = Number.isFinite(n) ? n : undefined;
                })
            );

        new Setting(contentEl)
            .setName('Tags')
            .addText(t => t
                .setPlaceholder('tag1, tag2')
                .setValue((this.scene.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.scene.tags = arr.length ? arr : undefined;
                })
            );

        // Image block
        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName('Image')
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: `Current: ${this.scene.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.scene.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.scene.profileImagePath || 'None'}`);
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
                                this.scene.profileImagePath = filePath;
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
                    this.scene.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText('Current: None');
                })
            );

        // Content
        new Setting(contentEl)
            .setName('Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder('Write your scene...')
                  .setValue(this.scene.content || '')
                  .onChange(v => this.scene.content = v || undefined);
                ta.inputEl.rows = 10;
            });

        // Beat sheet
        new Setting(contentEl)
            .setName('Beat sheet (one per line)')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                const value = (this.scene.beats || []).join('\n');
                ta.setPlaceholder('- Meet the mentor\n- The refusal')
                  .setValue(value)
                  .onChange(v => {
                      const lines = v.split('\n').map(s => s.trim()).filter(Boolean);
                      this.scene.beats = lines.length ? lines : undefined;
                  });
                ta.inputEl.rows = 6;
            });

        // Linked entities
        contentEl.createEl('h3', { text: 'Linked Entities' });

        new Setting(contentEl)
            .setName('Characters')
            .setDesc((this.scene.linkedCharacters || []).length ? (this.scene.linkedCharacters || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                    if (!this.scene.linkedCharacters) this.scene.linkedCharacters = [];
                    if (!this.scene.linkedCharacters.includes(ch.name)) this.scene.linkedCharacters.push(ch.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.scene.linkedCharacters = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Locations')
            .setDesc((this.scene.linkedLocations || []).length ? (this.scene.linkedLocations || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new LocationSuggestModal(this.app, this.plugin, (loc) => {
                    if (!loc) return;
                    if (!this.scene.linkedLocations) this.scene.linkedLocations = [];
                    if (!this.scene.linkedLocations.includes(loc.name)) this.scene.linkedLocations.push(loc.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.scene.linkedLocations = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Events')
            .setDesc((this.scene.linkedEvents || []).length ? (this.scene.linkedEvents || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                new EventSuggestModal(this.app, this.plugin, (evt) => {
                    if (!this.scene.linkedEvents) this.scene.linkedEvents = [];
                    if (!this.scene.linkedEvents.includes(evt.name)) this.scene.linkedEvents.push(evt.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.scene.linkedEvents = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Items')
            .setDesc((this.scene.linkedItems || []).length ? (this.scene.linkedItems || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(async () => {
                const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
                new PlotItemSuggestModal(this.app, this.plugin, (item) => {
                    if (!this.scene.linkedItems) this.scene.linkedItems = [];
                    if (!this.scene.linkedItems.includes(item.name)) this.scene.linkedItems.push(item.name);
                    this.onOpen();
                }).open();
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.scene.linkedItems = [];
                this.onOpen();
            }));

        new Setting(contentEl)
            .setName('Groups')
            .setDesc((this.scene.linkedGroups || []).length ? (this.scene.linkedGroups || []).join(', ') : 'None')
            .addButton(btn => btn.setButtonText('Add').onClick(() => {
                const groups = this.plugin.getGroups();
                const options = groups.map(g => g.name).join('\n');
                const pick = prompt('Type group name to add:\n' + options);
                const matched = groups.find(g => g.name.trim().toLowerCase() === (pick || '').trim().toLowerCase());
                if (matched) {
                    if (!this.scene.linkedGroups) this.scene.linkedGroups = [];
                    if (!this.scene.linkedGroups.includes(matched.id)) this.scene.linkedGroups.push(matched.id);
                    this.onOpen();
                } else if (pick) {
                    new Notice('Group not found');
                }
            }))
            .addButton(btn => btn.setButtonText('Clear').onClick(() => {
                this.scene.linkedGroups = [];
                this.onOpen();
            }));

        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText('Delete')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (this.scene.filePath && confirm(`Delete scene "${this.scene.name}"?`)) {
                        await this.onDelete!(this.scene);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? 'Create Scene' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.scene.name || !this.scene.name.trim()) {
                    new Notice('Scene title is required.');
                    return;
                }
                await this.onSubmit(this.scene);
                this.close();
            }));
    }

    onClose(): void { this.contentEl.empty(); }
}


