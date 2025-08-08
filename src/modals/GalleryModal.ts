import { App, Modal, Setting, TFile, FuzzySuggestModal, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
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
        this.setPlaceholder("Select an image file...");
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
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            return imagePath;
        }
        // Otherwise, treat it as a vault path
        return this.app.vault.adapter.getResourcePath(imagePath);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Image gallery' });

        // Store the container element
        this.gridContainer = contentEl.createDiv('storyteller-gallery-grid');

        // --- Controls (Add Image, Filter) ---
        const controlsEl = contentEl.createDiv('storyteller-gallery-controls');
        new Setting(controlsEl)
            .setName('Filter')
            .addText(text => {
                text.setPlaceholder('Filter by title, tag, link...')
                    // Pass the container to renderGrid
                    .onChange(value => this.renderGrid(value.toLowerCase(), this.gridContainer));
            })
            .addButton(button => button
                .setButtonText('Add image')
                .setCta()
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
                }));


        // --- Image Grid ---
        // Render using the stored container
        this.renderGrid('', this.gridContainer);
    }

    async refreshGallery() {
        // Reload images from plugin and re-render
        this.images = this.plugin.getGalleryImages();
        this.renderGrid('', this.gridContainer);
    }

    renderGrid(filter: string, container: HTMLElement) {
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
            container.createEl('p', { text: 'No images found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        filteredImages.forEach(image => {
            const imgWrapper = container.createDiv('storyteller-gallery-item');
            const imgEl = imgWrapper.createEl('img');

            // Use helper method for proper path handling
            imgEl.src = this.getImageSrc(image.filePath);
            imgEl.alt = image.title || image.filePath;
            imgEl.title = image.title || image.filePath; // Tooltip

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
