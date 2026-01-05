/**
 * ImageSelectionHelper - Reusable helper for image selection across all modals
 * Provides two options: Gallery selection and File upload from computer
 */

import { App, Setting, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from '../modals/GalleryImageSuggestModal';
import { t } from '../i18n/strings';

export interface ImageSelectionOptions {
    /** Current image path to display */
    currentPath?: string;
    /** Callback when image is selected */
    onSelect: (imagePath: string | undefined) => void;
    /** Description element to update with current path */
    descriptionEl?: HTMLElement;
    /** Whether to trigger tile generation for uploaded images (for map images only) */
    enableTileGeneration?: boolean;
}

/**
 * Add image selection buttons to a Setting
 * Provides Gallery and Upload options
 */
export function addImageSelectionButtons(
    setting: Setting,
    app: App,
    plugin: StorytellerSuitePlugin,
    options: ImageSelectionOptions
): void {
    const { currentPath, onSelect, descriptionEl, enableTileGeneration = false } = options;

    // Gallery selection button
    setting.addButton(button => button
        .setButtonText(t('select'))
        .setTooltip(t('selectFromGallery'))
        .onClick(() => {
            new GalleryImageSuggestModal(app, plugin, (selectedImage) => {
                const path = selectedImage ? selectedImage.filePath : '';
                onSelect(path || undefined);
                if (descriptionEl) {
                    descriptionEl.setText(`Current: ${path || 'None'}`);
                }
            }).open();
        }));

    // File upload button (from computer)
    setting.addButton(button => button
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
                        // Ensure upload folder exists
                        await plugin.ensureFolder(plugin.settings.galleryUploadFolder);
                        
                        // Create unique filename
                        const timestamp = Date.now();
                        const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                        const fileName = `${timestamp}_${sanitizedName}`;
                        const filePath = `${plugin.settings.galleryUploadFolder}/${fileName}`;
                        
                        // Read file as array buffer
                        const arrayBuffer = await file.arrayBuffer();

                        // Save to vault
                        await app.vault.createBinary(filePath, arrayBuffer);

                        // Trigger tile generation for map images if enabled
                        if (enableTileGeneration) {
                            plugin.maybeTriggerTileGeneration(filePath, arrayBuffer);
                        }

                        // Call callback with new path
                        onSelect(filePath);
                        if (descriptionEl) {
                            descriptionEl.setText(`Current: ${filePath}`);
                        }
                        
                        new Notice(t('imageUploaded', fileName));
                    } catch (error) {
                        console.error('Error uploading image:', error);
                        new Notice(t('errorUploadingImage'));
                    }
                }
            };
            fileInput.click();
        }));
}

