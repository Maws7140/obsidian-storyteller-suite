/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent, ButtonComponent } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { Scene } from '../types';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { GroupSuggestModal } from './GroupSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

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
        contentEl.createEl('h2', { text: this.isNew ? t('createNewScene') : `${t('editScene')} ${this.scene.name}` });

        // --- Template Selector (for new scenes) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured scene template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a scene template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToScene(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'scene'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('sceneTitlePh'))
                .setValue(this.scene.name || '')
                .onChange(v => this.scene.name = v)
            );

        // Chapter selector
        new Setting(contentEl)
            .setName(t('chapter'))
            .setDesc(this.scene.chapterName || t('none'))
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
            .setName(t('status'))
            .addDropdown(dd => dd
                .addOptions({ Draft: 'Draft', Outline: 'Outline', WIP: 'WIP', Revised: 'Revised', Final: 'Final' })
                .setValue(this.scene.status || 'Draft')
                .onChange(v => this.scene.status = v)
            );

        new Setting(contentEl)
            .setName(t('priorityInChapter'))
            .addText(text => text
                .setPlaceholder(t('priorityEg'))
                .setValue(this.scene.priority != null ? String(this.scene.priority) : '')
                .onChange(v => {
                    const n = parseInt(v, 10);
                    this.scene.priority = Number.isFinite(n) ? n : undefined;
                })
            );

        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.scene.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.scene.tags = arr.length ? arr : undefined;
                })
            );

        // Image block
        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: t('currentValue', this.scene.profileImagePath || t('none')) });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText(t('select'))
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.scene.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.scene.profileImagePath || 'None'}`);
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
                                this.scene.profileImagePath = filePath;
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
                .setTooltip('Clear image')
                .onClick(() => {
                    this.scene.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText('Current: None');
                })
            );

        // Content
        new Setting(contentEl)
            .setName(t('content') || 'Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder(t('writeScenePh'))
                  .setValue(this.scene.content || '')
                  .onChange(v => this.scene.content = v || undefined);
                ta.inputEl.rows = 10;
            });

        // Beat sheet
        new Setting(contentEl)
            .setName(t('beatSheetOneLine'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                const value = (this.scene.beats || []).join('\n');
                ta.setPlaceholder(t('beatSheetPh'))
                  .setValue(value)
                  .onChange(v => {
                      const lines = v.split('\n').map(s => s.trim()).filter(Boolean);
                      this.scene.beats = lines.length ? lines : undefined;
                  });
                ta.inputEl.rows = 6;
            });

        // Linked entities
        contentEl.createEl('h3', { text: t('links') });

        const charactersSetting = new Setting(contentEl)
            .setName(t('characters'));
        const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(charactersListEl, this.scene.linkedCharacters, 'characters');
        charactersSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                if (!this.scene.linkedCharacters) this.scene.linkedCharacters = [];
                if (!this.scene.linkedCharacters.includes(ch.name)) this.scene.linkedCharacters.push(ch.name);
                this.renderLinkedEntities(charactersListEl, this.scene.linkedCharacters, 'characters');
            }).open();
        }));

        const locationsSetting = new Setting(contentEl)
            .setName(t('locations'));
        const locationsListEl = locationsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(locationsListEl, this.scene.linkedLocations, 'locations');
        locationsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new LocationSuggestModal(this.app, this.plugin, (loc) => {
                if (!loc) return;
                if (!this.scene.linkedLocations) this.scene.linkedLocations = [];
                if (!this.scene.linkedLocations.includes(loc.name)) this.scene.linkedLocations.push(loc.name);
                this.renderLinkedEntities(locationsListEl, this.scene.linkedLocations, 'locations');
            }).open();
        }));

        const eventsSetting = new Setting(contentEl)
            .setName(t('events'));
        const eventsListEl = eventsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(eventsListEl, this.scene.linkedEvents, 'events');
        eventsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new EventSuggestModal(this.app, this.plugin, (evt) => {
                if (!this.scene.linkedEvents) this.scene.linkedEvents = [];
                if (!this.scene.linkedEvents.includes(evt.name)) this.scene.linkedEvents.push(evt.name);
                this.renderLinkedEntities(eventsListEl, this.scene.linkedEvents, 'events');
            }).open();
        }));

        const itemsSetting = new Setting(contentEl)
            .setName(t('items'));
        const itemsListEl = itemsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(itemsListEl, this.scene.linkedItems, 'items');
        itemsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(async () => {
            const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
            new PlotItemSuggestModal(this.app, this.plugin, (item) => {
                if (!this.scene.linkedItems) this.scene.linkedItems = [];
                if (!this.scene.linkedItems.includes(item.name)) this.scene.linkedItems.push(item.name);
                this.renderLinkedEntities(itemsListEl, this.scene.linkedItems, 'items');
            }).open();
        }));

        const groupsSetting = new Setting(contentEl)
            .setName(t('groups'));
        const groupsListEl = groupsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(groupsListEl, this.scene.linkedGroups, 'groups');
        groupsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new GroupSuggestModal(this.app, this.plugin, (g) => {
                if (!this.scene.linkedGroups) this.scene.linkedGroups = [];
                if (!this.scene.linkedGroups.includes(g.id)) this.scene.linkedGroups.push(g.id);
                this.renderLinkedEntities(groupsListEl, this.scene.linkedGroups, 'groups');
            }).open();
        }));

        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText(t('delete'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (this.scene.filePath && confirm(t('confirmDeleteScene', this.scene.name))) {
                        await this.onDelete!(this.scene);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText(t('cancel')).onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? t('createSceneBtn') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.scene.name || !this.scene.name.trim()) {
                    new Notice(t('sceneNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.scene.content = this.scene.content || '';
                this.scene.beats = this.scene.beats || [];
                await this.onSubmit(this.scene);
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
                            if (this.scene.linkedCharacters) {
                                this.scene.linkedCharacters.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedCharacters, entityType);
                            }
                            break;
                        case 'locations':
                            if (this.scene.linkedLocations) {
                                this.scene.linkedLocations.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedLocations, entityType);
                            }
                            break;
                        case 'events':
                            if (this.scene.linkedEvents) {
                                this.scene.linkedEvents.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedEvents, entityType);
                            }
                            break;
                        case 'items':
                            if (this.scene.linkedItems) {
                                this.scene.linkedItems.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedItems, entityType);
                            }
                            break;
                        case 'groups':
                            if (this.scene.linkedGroups) {
                                this.scene.linkedGroups.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedGroups, entityType);
                            }
                            break;
                    }
                });
        });
    }

    private async applyTemplateToScene(template: Template): Promise<void> {
        if (!template.entities.scenes || template.entities.scenes.length === 0) {
            new Notice('This template does not contain any scenes');
            return;
        }

        const templateScene = template.entities.scenes[0];

        Object.keys(templateScene).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath' && key !== 'chapterId' && key !== 'chapterName') {
                (this.scene as any)[key] = (templateScene as any)[key];
            }
        });

        // Clear relationships as they reference template entities
        this.scene.linkedCharacters = [];
        this.scene.linkedLocations = [];
        this.scene.linkedEvents = [];
        this.scene.linkedItems = [];
        this.scene.linkedGroups = [];
    }

    private refresh(): void {
        this.onOpen();
    }

    onClose(): void { this.contentEl.empty(); }
}


