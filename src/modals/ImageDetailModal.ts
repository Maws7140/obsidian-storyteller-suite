import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import { t } from '../i18n/strings';
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

    /**
     * Helper method to get the appropriate image source path
     * Handles both external URLs and local vault paths
     * @param imagePath The image path (URL or vault path)
     * @returns The appropriate src for img element
     */
    private getImageSrc(imagePath: string): string {
        // External URL? ─ allow http(s), protocol‐relative (“//…”) or data URIs
        if (/^(https?:)?\/\//i.test(imagePath) || imagePath.startsWith('data:')) {
            return imagePath;
        }

        // Local vault file – resolve to TFile and use Vault API
        const file = this.app.vault.getAbstractFileByPath(imagePath);
        if (file && 'stat' in file) { // Check if it's a TFile by checking for a TFile-specific property
            return this.app.vault.getResourcePath(file as TFile);
        }

        // Fallback – return original path so errors can be handled upstream
        return imagePath;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('addImageDetails') : t('editImageDetails') });

        const mainContainer = contentEl.createDiv('storyteller-image-detail-container');

        // --- Image Preview ---
        const previewEl = mainContainer.createDiv('storyteller-image-preview');
        const imgEl = previewEl.createEl('img');
        imgEl.src = this.getImageSrc(this.image.filePath);
        imgEl.alt = this.image.title || this.image.filePath;
        previewEl.createEl('p', { text: this.image.filePath }); // Show file path

        // --- Form Fields ---
        const formEl = mainContainer.createDiv('storyteller-image-form');

        new Setting(formEl)
            .setName(t('title'))
            .addText(text => text
                .setValue(this.image.title || '')
                .onChange(value => { this.image.title = value || undefined; }));

        new Setting(formEl)
            .setName(t('caption'))
            .addText(text => text
                .setValue(this.image.caption || '')
                .onChange(value => { this.image.caption = value || undefined; }));

        new Setting(formEl)
            .setName(t('description'))
            .addTextArea(text => {
                text.setValue(this.image.description || '')
                    .onChange(value => { this.image.description = value || undefined; });
                text.inputEl.rows = 3;
            });

        new Setting(formEl)
            .setName(t('tags'))
            .setDesc(t('commaSeparatedTags'))
            .addText(text => text
                .setValue((this.image.tags || []).join(', '))
                .onChange(value => {
                    this.image.tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }));

        formEl.createEl('h3', { text: t('links') });

        new Setting(formEl)
            .setName(t('characters'))
            .setDesc(t('commaSeparatedCharacterNames'))
            .addText(text => text
                .setValue((this.image.linkedCharacters || []).join(', '))
                .onChange(value => {
                    this.image.linkedCharacters = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        new Setting(formEl)
            .setName(t('locations'))
            .setDesc(t('commaSeparatedLocationNames'))
            .addText(text => text
                .setValue((this.image.linkedLocations || []).join(', '))
                .onChange(value => {
                    this.image.linkedLocations = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        new Setting(formEl)
            .setName(t('events'))
            .setDesc(t('commaSeparatedEventNames'))
            .addText(text => text
                .setValue((this.image.linkedEvents || []).join(', '))
                .onChange(value => {
                    this.image.linkedEvents = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }));

        // Action Buttons
        new Setting(formEl)
            .setClass('storyteller-modal-buttons')
            .addButton(button => button
                .setButtonText(t('saveDetails'))
                .setCta()
                .onClick(async () => {
                    await this.plugin.updateGalleryImage(this.image);
                    new Notice(t('imageDetailsSaved', this.image.filePath));
                    if (this.onSaveCallback) {
                        await this.onSaveCallback();
                    }
                    this.close();
                }))
            .addButton(button => button
                .setButtonText(t('removeFromGallery'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmRemoveImageFromGallery', this.image.filePath))) {
                        await this.plugin.deleteGalleryImage(this.image.id);
                        new Notice(t('imageRemovedFromGallery', this.image.filePath));
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
