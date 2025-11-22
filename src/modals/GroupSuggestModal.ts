import { App } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Group } from '../types';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class GroupSuggestModal extends BaseEntitySuggestModal<Group> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (group: Group) => void) {
		super(app, plugin, onChoose, t('selectGroupPh'));
	}

	async loadItems(): Promise<Group[]> {
		// GroupSuggestModal uses synchronous getGroups(), so wrap it in Promise.resolve
		return Promise.resolve(this.plugin.getGroups());
	}

	getErrorMessage(): string {
		return 'Error loading groups';
	}

	getItemText(item: Group): string {
		return item.name || 'Unnamed group';
	}
}
