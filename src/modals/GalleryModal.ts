import { App, Modal, Setting, TFile, FuzzySuggestModal, prepareFuzzySearch, FuzzyMatch, Notice } from 'obsidian';
import { t } from '../i18n/strings';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';
import { ImageDetailModal } from './ImageDetailModal';

// Simple Suggester for image files
export class ImageSuggestModal extends FuzzySuggestModal<TFile> { // Added export
    plugin: StorytellerSuitePlugin;
    onChoose: (file: TFile) => void;

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (file: TFile) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder(t('selectImageFilePh'));
    }

    async onOpen() {
        super.onOpen();
        // Force-refresh suggestions so initial list shows without typing
        setTimeout(() => {
            if (this.inputEl) {
                try { (this as any).setQuery?.(''); } catch {}
                try { this.inputEl.dispatchEvent(new window.Event('input')); } catch {}
            }
            try { (this as any).onInputChanged?.(); } catch {}
        }, 0);
        setTimeout(() => {
            if (this.inputEl) {
                try { (this as any).setQuery?.(''); } catch {}
                try { this.inputEl.dispatchEvent(new window.Event('input')); } catch {}
            }
            try { (this as any).onInputChanged?.(); } catch {}
        }, 50);
    }

    // Show all files initially; fuzzy-match when there is a query
    getSuggestions(query: string): FuzzyMatch<TFile>[] {
        const items = this.getItems();
        if (!query) {
            return items.map((f) => ({ item: f, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map((f) => {
                const match = fuzzy(this.getItemText(f));
                return match ? ({ item: f, match } as FuzzyMatch<TFile>) : null;
            })
            .filter((fm): fm is FuzzyMatch<TFile> => !!fm);
    }

    getItems(): TFile[] {
        // Get all image files in the vault
        return this.app.vault.getFiles().filter(file =>
            ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(file.extension.toLowerCase())
        );
    }

    getItemText(item: TFile): string {
        return item.path; // Display full path
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}


export class GalleryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    images: GalleryImage[];
    gridContainer: HTMLElement; // Store container reference
    private currentFilter: string = '';

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.images = plugin.getGalleryImages(); // Get current images
        this.modalEl.addClass('storyteller-gallery-modal'); // Specific class
    }

    /**
     * Helper method to get the appropriate image source path
     * Handles both external URLs and local vault paths
     * @param imagePath The image path (URL or vault path)
     * @returns The appropriate src for img element
     */
    private getImageSrc(imagePath: string): string {
        // Check if it's an external URL
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('//')) {
            const allow = this.plugin.settings.allowRemoteImages ?? false;
            if (!allow) return '';
            return imagePath;
        }
        // Otherwise, treat it as a vault path
        return this.app.vault.adapter.getResourcePath(imagePath);
    }

    async onOpen() {
        const { contentEl } = this;
        await this.plugin.syncGalleryWatchFolder();
        this.images = this.plugin.getGalleryImages();
        contentEl.empty();
        this.titleEl.setText(t('imageGallery'));

        // Store the container element
        this.gridContainer = contentEl.createDiv('storyteller-gallery-grid');

        // --- Controls (Add Image, Filter) ---
        const controlsEl = contentEl.createDiv('storyteller-gallery-controls');
        new Setting(controlsEl)
            .setName(t('filter'))
            .addText(text => {
                text.setPlaceholder(t('filterImagesPh'))
                    // Pass the container to renderGrid
                    .onChange(value => this.renderGrid(value.toLowerCase(), this.gridContainer));
            })
            .addButton(button => button
                .setButtonText(t('addImage'))
                .onClick(() => {
                    new ImageSuggestModal(this.app, this.plugin, async (selectedFile: TFile) => {
                        // Add basic image data with required ID
                        const imageData: Omit<GalleryImage, 'id'> = { filePath: selectedFile.path };
                        // Use the plugin's addGalleryImage method to create with ID
                        const newImage = await this.plugin.addGalleryImage(imageData);
                        // Open detail modal to add more info
                        new ImageDetailModal(this.app, this.plugin, newImage, false, async () => {
                            await this.refreshGallery();
                        }).open();
                    }).open();
                }))
            .addButton(button => button
                .setButtonText(t('upload'))
                .setCta()
                .onClick(() => {
                    void this.handleUploadClick();
                }));


        // --- Image Grid ---
        // Render using the stored container
        this.renderGrid('', this.gridContainer);
    }

    async refreshGallery() {
        // Reload images from plugin and re-render
        await this.plugin.syncGalleryWatchFolder();
        this.images = this.plugin.getGalleryImages();
        this.renderGrid(this.currentFilter, this.gridContainer);
    }

    private async handleUploadClick(): Promise<void> {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.onchange = async () => {
            const files = fileInput.files;
            if (!files || files.length === 0) return;

            try {
                const { imported, failed } = await this.plugin.importGalleryUploads(Array.from(files));
                if (imported.length === 1 && failed.length === 0) {
                    await this.refreshGallery();
                    new ImageDetailModal(this.app, this.plugin, imported[0], true, async () => {
                        await this.refreshGallery();
                    }).open();
                } else {
                    await this.refreshGallery();
                    if (imported.length > 0) {
                        new Notice(`Added ${imported.length} image${imported.length === 1 ? '' : 's'} to the gallery.`);
                    }
                    if (failed.length > 0) {
                        new Notice(`Failed to import ${failed.length} image${failed.length === 1 ? '' : 's'}. Check console for details.`);
                    }
                }
            } catch (error) {
                console.error('Error uploading gallery images:', error);
                new Notice('Error uploading gallery images. Check console for details.');
            } finally {
                fileInput.value = '';
            }
        };
        fileInput.click();
    }

    renderGrid(filter: string, container: HTMLElement) {
        this.currentFilter = filter;
        container.empty(); // Clear previous grid

        const filteredImages = this.images.filter(img =>
            img.filePath.toLowerCase().includes(filter) ||
            (img.title || '').toLowerCase().includes(filter) ||
            (img.caption || '').toLowerCase().includes(filter) ||
            (img.description || '').toLowerCase().includes(filter) ||
            (img.tags || []).join(' ').toLowerCase().includes(filter) ||
            (img.linkedCharacters || []).join(' ').toLowerCase().includes(filter) ||
            (img.linkedLocations || []).join(' ').toLowerCase().includes(filter) ||
            (img.linkedEvents || []).join(' ').toLowerCase().includes(filter)
        );

        if (filteredImages.length === 0) {
            container.createEl('p', { text: t('noImagesFound') + (filter ? t('matchingFilter') : '') });
            return;
        }

        filteredImages.forEach(image => {
            const imgWrapper = container.createDiv('storyteller-gallery-item');
            const imgEl = imgWrapper.createEl('img', { cls: 'storyteller-gallery-item-image' });

            // Use helper method for proper path handling
            imgEl.src = this.getImageSrc(image.filePath);
            imgEl.alt = image.title || image.filePath;
            imgEl.title = image.title || image.filePath; // Tooltip
            imgEl.loading = 'lazy';

            const titleEl = imgWrapper.createDiv('storyteller-gallery-item-title');
            const titleText = image.title || image.filePath.split('/').pop() || '';
            titleEl.setText(titleText);
            titleEl.setAttribute('title', titleText);

            // Add click handler to open detail modal
            imgWrapper.addEventListener('click', () => {
                this.close();
                new ImageDetailModal(this.app, this.plugin, image, false, async () => {
                    await this.refreshGallery();
                }).open();
            });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
