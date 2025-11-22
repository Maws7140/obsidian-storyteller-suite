import { App } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class EventSuggestModal extends BaseEntitySuggestModal<Event> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (event: Event) => void) {
		super(app, plugin, onChoose, t('selectEventPh'));
	}

	async loadItems(): Promise<Event[]> {
		return await this.plugin.listEvents();
	}

	getErrorMessage(): string {
		return t('errorLoadingEvents');
	}

	getItemText(item: Event): string {
		return item.name || 'Unnamed event';
	}
}
