import { App } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class CharacterSuggestModal extends BaseEntitySuggestModal<Character> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (character: Character) => void) {
		super(app, plugin, onChoose, t('selectCharacterPh'));
	}

	async loadItems(): Promise<Character[]> {
		return await this.plugin.listCharacters();
	}

	getErrorMessage(): string {
		return t('errorLoadingCharacters');
	}

	getItemText(item: Character): string {
		return item.name || 'Unnamed character';
	}
}
