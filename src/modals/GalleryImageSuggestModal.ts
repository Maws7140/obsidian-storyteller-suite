import { App } from 'obsidian';
import { GalleryImage } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class GalleryImageSuggestModal extends BaseEntitySuggestModal<GalleryImage> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (image: GalleryImage | null) => void) {
		super(
			app,
			plugin,
			onChoose,
			t('selectGalleryImagePh'),
			[{ command: 'Shift + Enter', purpose: 'Clear selection' }]
		);
	}

	async loadItems(): Promise<GalleryImage[]> {
		// GalleryImageSuggestModal uses synchronous getGalleryImages(), so wrap it in Promise.resolve
		return Promise.resolve(this.plugin.getGalleryImages());
	}

	getErrorMessage(): string {
		return 'Error loading gallery images';
	}

	getItemText(item: GalleryImage): string {
		return item.title || item.filePath; // Display title or path
	}

	handleChooseItem(item: GalleryImage, evt: MouseEvent | KeyboardEvent): void {
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
