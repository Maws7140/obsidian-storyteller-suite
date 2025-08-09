/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Notice, Setting, TextAreaComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Reference } from '../types';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';

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
        contentEl.createEl('h2', { text: this.isNew ? 'Create reference' : `Edit ${this.refData.name}` });

        new Setting(contentEl)
            .setName('Name')
            .addText(t => t
                .setPlaceholder('Reference title')
                .setValue(this.refData.name || '')
                .onChange(v => this.refData.name = v)
            );

        new Setting(contentEl)
            .setName('Category')
            .addText(t => t
                .setPlaceholder('Language, Prophecy, Inspiration, Misc, ...')
                .setValue(this.refData.category || '')
                .onChange(v => this.refData.category = v || undefined)
            );

        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated tags (e.g., elves, phonology)')
            .addText(t => t
                .setPlaceholder('tag1, tag2')
                .setValue((this.refData.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.refData.tags = arr.length ? arr : undefined;
                })
            );

        let imageDescEl: HTMLElement | null = null;
        new Setting(contentEl)
            .setName('Image')
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: `Current: ${this.refData.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText('Select')
                .setTooltip('Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.refData.profileImagePath = img?.filePath;
                        if (imageDescEl) imageDescEl.setText(`Current: ${this.refData.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(btn => btn
                .setIcon('cross')
                .setClass('mod-warning')
                .setTooltip('Clear image')
                .onClick(() => {
                    this.refData.profileImagePath = undefined;
                    if (imageDescEl) imageDescEl.setText(`Current: None`);
                })
            );

        new Setting(contentEl)
            .setName('Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder('Write your reference content here...')
                  .setValue(this.refData.content || '')
                  .onChange(v => this.refData.content = v || undefined);
                ta.inputEl.rows = 12;
            });

        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText('Delete')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Delete reference "${this.refData.name}"?`)) {
                        await this.onDelete!(this.refData);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? 'Create Reference' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.refData.name || !this.refData.name.trim()) {
                    new Notice('Reference name is required.');
                    return;
                }
                await this.onSubmit(this.refData);
                this.close();
            })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


