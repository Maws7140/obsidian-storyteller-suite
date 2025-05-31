import { App, Modal, Setting, Notice } from 'obsidian';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';

export class ImageDetailModal extends Modal {
    plugin: StorytellerSuitePlugin;
    image: GalleryImage;
    isNew: boolean;
    onSaveCallback?: () => Promise<void>; // Add callback param

    constructor(app: App, plugin: StorytellerSuitePlugin, image: GalleryImage, isNew: boolean, onSaveCallback?: () => Promise<void>) {
        super(app);
        this.plugin = plugin;
        this.image = { ...image }; // Create a shallow copy for editing
        this.isNew = isNew;
        this.onSaveCallback = onSaveCallback;
        this.modalEl.addClass('storyteller-image-detail-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Add image details' : 'Edit image details' });

        const mainContainer = contentEl.createDiv('storyteller-image-detail-container');

        // --- Image Preview ---
        const previewEl = mainContainer.createDiv('storyteller-image-preview');
        const imgEl = previewEl.createEl('img');
        const resourcePath = this.app.vault.adapter.getResourcePath(this.image.filePath);
        imgEl.src = resourcePath;
        imgEl.alt = this.image.title || this.image.filePath;
        previewEl.createEl('p', { text: this.image.filePath }); // Show file path

        // --- Form Fields ---
        const formEl = mainContainer.createDiv('storyteller-image-form');

        new Setting(formEl)
            .setName('Title')
            .addText(text => text
                .setValue(this.image.title || '')
                .onChange(value => { this.image.title = value || undefined; }));

        new Setting(formEl)
            .setName('Caption')
            .addText(text => text
                .setValue(this.image.caption || '')
                .onChange(value => { this.image.caption = value || undefined; }));

        new Setting(formEl)
            .setName('Description')
            .addTextArea(text => {
                text.setValue(this.image.description || '')
                    .onChange(value => { this.image.description = value || undefined; });
                text.inputEl.rows = 3;
            });

        new Setting(formEl)
            .setName('Tags')
            .setDesc('Comma-separated tags.')
            .addText(text => text
                .setValue((this.image.tags || []).join(', '))
                .onChange(value => {
                    this.image.tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }));

        formEl.createEl('h3', { text: 'Links' });

        new Setting(formEl)
            .setName('Characters')
            .setDesc('Comma-separated character names.')
            .addText(text => text
                .setValue((this.image.linkedCharacters || []).join(', '))
                .onChange(value => {
                    this.image.linkedCharacters = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        new Setting(formEl)
            .setName('Locations')
            .setDesc('Comma-separated location names.')
            .addText(text => text
                .setValue((this.image.linkedLocations || []).join(', '))
                .onChange(value => {
                    this.image.linkedLocations = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        new Setting(formEl)
            .setName('Events')
            .setDesc('Comma-separated event names.')
            .addText(text => text
                .setValue((this.image.linkedEvents || []).join(', '))
                .onChange(value => {
                    this.image.linkedEvents = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        // Action Buttons
        new Setting(formEl)
            .setClass('storyteller-modal-buttons')
            .addButton(button => button
                .setButtonText('Save details')
                .setCta()
                .onClick(async () => {
                    await this.plugin.updateGalleryImage(this.image);
                    new Notice(`Image details for "${this.image.filePath}" saved.`);
                    if (this.onSaveCallback) {
                        await this.onSaveCallback();
                    }
                    this.close();
                }))
            .addButton(button => button
                .setButtonText('Remove from gallery')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to remove "${this.image.filePath}" from the gallery? This does not delete the file itself.`)) {
                        await this.plugin.deleteGalleryImage(this.image.id);
                        new Notice(`Image "${this.image.filePath}" removed from gallery.`);
                        if (this.onSaveCallback) {
                            await this.onSaveCallback();
                        }
                        this.close();
                    }
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
