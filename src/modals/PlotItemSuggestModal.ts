import { App } from 'obsidian';
import { PlotItem } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { BaseEntitySuggestModal } from './BaseEntitySuggestModal';

export class PlotItemSuggestModal extends BaseEntitySuggestModal<PlotItem> {
	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (item: PlotItem) => void) {
		super(app, plugin, onChoose, t('selectItemPh'));
	}

	async loadItems(): Promise<PlotItem[]> {
		return await this.plugin.listPlotItems();
	}

	getErrorMessage(): string {
		return t('errorLoadingItems');
	}

	getItemText(item: PlotItem): string {
		return item.name || 'Unnamed item';
	}
}
