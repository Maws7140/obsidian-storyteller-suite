import { App } from 'obsidian';
import { Location } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class LocationSuggestModal extends BaseEntitySuggestModal<Location> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (location: Location | null) => void) {
		super(
			app,
			plugin,
			onChoose,
			t('selectEventLocationPh'),
			[{ command: 'Shift + Enter', purpose: 'Clear selection (No Location)' }]
		);
	}

	async loadItems(): Promise<Location[]> {
		return await this.plugin.listLocations();
	}

	getErrorMessage(): string {
		return t('errorLoadingLocations');
	}

	getItemText(item: Location): string {
		return item.name || 'Unnamed location';
	}

	handleChooseItem(item: Location, evt: MouseEvent | KeyboardEvent): void {
		if (evt.shiftKey) {
			this.onChoose(null);
		} else {
			this.onChoose(item);
		}
	}
}
