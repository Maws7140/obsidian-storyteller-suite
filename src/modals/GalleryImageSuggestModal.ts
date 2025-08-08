import { App, FuzzySuggestModal, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';

export class GalleryImageSuggestModal extends FuzzySuggestModal<GalleryImage> {
    plugin: StorytellerSuitePlugin;
    onChoose: (image: GalleryImage | null) => void; // Allow null for clearing

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (image: GalleryImage | null) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder("Select an image from the gallery...");
        // Add instruction for clearing
        this.setInstructions([{ command: 'Shift + Enter', purpose: 'Clear selection' }]);
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
                return match ? ({ item: img, match } as FuzzyMatch<GalleryImage>) : null;
            })
            .filter((fm): fm is FuzzyMatch<GalleryImage> => !!fm);
    }

    getItems(): GalleryImage[] {
        return this.plugin.getGalleryImages();
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
