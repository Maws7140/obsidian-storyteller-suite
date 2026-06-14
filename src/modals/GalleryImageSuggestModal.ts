import { App, FuzzySuggestModal, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

export class GalleryImageSuggestModal extends FuzzySuggestModal<GalleryImage> {
    plugin: StorytellerSuitePlugin;
    onChoose: (image: GalleryImage | null) => void; // Allow null for clearing
    private images: GalleryImage[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (image: GalleryImage | null) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder(t('selectGalleryImagePh'));
        // Add instruction for clearing
        this.setInstructions([{ command: 'Shift + Enter', purpose: 'Clear selection' }]);
    }

    async onOpen() {
        void super.onOpen();
        await this.plugin.syncGalleryWatchFolder();

        // Registered gallery images (have titles, tags, etc.)
        const registered = this.plugin.getGalleryImages();
        const allRegistered = this.plugin.getGalleryImages({ includeAll: true });
        const registeredPaths = new Set(allRegistered.map(img => img.filePath));

        // Any image file in the vault not already registered
        const vaultImages: GalleryImage[] = this.app.vault.getFiles()
            .filter(f => IMAGE_EXTS.has(f.extension?.toLowerCase()) && !registeredPaths.has(f.path))
            .map(f => ({
                id: f.path,
                filePath: f.path,
                title: f.basename,
                caption: '',
                description: '',
                tags: []
            }));

        this.images = [...registered, ...vaultImages];

        // Force-refresh suggestions so initial list shows without typing.
        scheduleSuggestRefresh(this);
    }

    // Show all items initially; fuzzy-match when there is a query
    getSuggestions(query: string): FuzzyMatch<GalleryImage>[] {
        const items = this.getItems();
        if (!query) {
            return items.map((img) => ({ item: img, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map((img) => {
                const text = this.getItemText(img);
                const match = fuzzy(text);
                return match ? ({ item: img, match }) : null;
            })
            .filter((fm): fm is FuzzyMatch<GalleryImage> => !!fm);
    }

    getItems(): GalleryImage[] {
        return this.images;
    }

    getItemText(item: GalleryImage): string {
        return item.title || item.filePath; // Display title or path
    }

    onChooseItem(item: GalleryImage, evt: MouseEvent | KeyboardEvent): void {
                // Handle clearing selection
        if (evt.shiftKey) {
            this.onChoose(null);
        } else {
            this.onChoose(item);
        }
    }

    // Optional: Render a preview? Might be too complex for a suggester.
    // renderSuggestion(item: FuzzyMatch<GalleryImage>, el: HTMLElement): void {
    //     super.renderSuggestion(item, el); // Keep default text rendering
    //     // Add a small preview image?
    //     // const imgPath = this.app.vault.adapter.getResourcePath(item.item.filePath);
    //     // el.createEl('img', { attr: { src: imgPath, width: 30, height: 30, style: 'margin-left: 10px; vertical-align: middle;' } });
    // }
}
