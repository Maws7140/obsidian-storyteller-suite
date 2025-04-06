import { App, Modal, Setting, Notice, TextAreaComponent } from 'obsidian';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';

export class ImageDetailModal extends Modal {
    plugin: StorytellerSuitePlugin;
    image: GalleryImage; // Use a deep copy for editing
    isNew: boolean;
    onSaveCallback?: () => Promise<void>; // Optional callback

    constructor(app: App, plugin: StorytellerSuitePlugin, image: GalleryImage, isNew: boolean, onSaveCallback?: () => Promise<void>) { // Add callback param
        super(app);
        this.plugin = plugin;
        this.image = { ...image }; // Create a shallow copy for editing
        // Deep copy arrays if they exist
        this.image.tags = [...(image.tags || [])];
        this.image.linkedCharacters = [...(image.linkedCharacters || [])];
        this.image.linkedLocations = [...(image.linkedLocations || [])];
        this.image.linkedEvents = [...(image.linkedEvents || [])];
        this.isNew = isNew;
        this.onSaveCallback = onSaveCallback; // Store the callback
        this.modalEl.addClass('storyteller-image-detail-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Add Image Details' : 'Edit Image Details' });

        const mainContainer = contentEl.createDiv('storyteller-image-detail-container');

        // --- Image Preview ---
        const previewEl = mainContainer.createDiv('storyteller-image-preview');
        const img = previewEl.createEl('img');
        const resourcePath = this.app.vault.adapter.getResourcePath(this.image.filePath);
        img.src = resourcePath;
        img.alt = this.image.filePath;
        previewEl.createEl('p', { text: this.image.filePath }); // Show file path

        // --- Details Form ---
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
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.image.description || '')
                    .onChange(value => { this.image.description = value || undefined; });
                text.inputEl.rows = 3;
            });

        new Setting(formEl)
            .setName('Tags')
            .setDesc('Comma-separated tags.')
            .addTextArea(text => text
                .setValue((this.image.tags || []).join(', '))
                .onChange(value => { this.image.tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0); }));

        // --- Links ---
        formEl.createEl('h3', { text: 'Links' });
        new Setting(formEl)
            .setName('Characters')
            .setDesc('Comma-separated names/links.')
            .addTextArea(text => text
                .setValue((this.image.linkedCharacters || []).join(', '))
                .onChange(value => { this.image.linkedCharacters = value.split(',').map(t => t.trim()).filter(t => t.length > 0); }));

        new Setting(formEl)
            .setName('Locations')
            .setDesc('Comma-separated names/links.')
            .addTextArea(text => text
                .setValue((this.image.linkedLocations || []).join(', '))
                .onChange(value => { this.image.linkedLocations = value.split(',').map(t => t.trim()).filter(t => t.length > 0); }));

        new Setting(formEl)
            .setName('Events')
            .setDesc('Comma-separated names/links.')
            .addTextArea(text => text
                .setValue((this.image.linkedEvents || []).join(', '))
                .onChange(value => { this.image.linkedEvents = value.split(',').map(t => t.trim()).filter(t => t.length > 0); }));

        // --- Actions ---
        const actionsEl = contentEl.createDiv('storyteller-modal-actions');
        new Setting(actionsEl)
            .addButton(button => button
                .setButtonText('Save Details')
                .setCta()
                .onClick(async () => {
                    await this.plugin.updateGalleryImage(this.image); // Update uses ID match
                    this.close();
                    // Call the callback if it exists
                    if (this.onSaveCallback) {
                        await this.onSaveCallback();
                    }
                }))
            .addButton(button => button
                .setButtonText('Remove from Gallery')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to remove "${this.image.filePath}" from the gallery? This does not delete the file itself.`)) {
                        await this.plugin.deleteGalleryImage(this.image.id);
                        this.close();
                        // Call the callback if it exists
                        if (this.onSaveCallback) {
                            await this.onSaveCallback();
                        }
                    }
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
