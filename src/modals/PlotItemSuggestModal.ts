import { App, FuzzySuggestModal, Notice } from 'obsidian';
import { PlotItem } from '../types';
import StorytellerSuitePlugin from '../main';

export class PlotItemSuggestModal extends FuzzySuggestModal<PlotItem> {
	plugin: StorytellerSuitePlugin;
	onChoose: (item: PlotItem) => void;
    items: PlotItem[] = [];

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (item: PlotItem) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder("Select an item to link...");
	}

    async onOpen() {
        super.onOpen();
        try {
            this.items = await this.plugin.listPlotItems();
        } catch (error) {
            console.error('Storyteller Suite: Error fetching items for suggester:', error);
            new Notice('Error loading items. Check console.');
            this.items = [];
        }
    }

	getItems(): PlotItem[] {
		return this.items;
	}

	getItemText(item: PlotItem): string {
		return item.name || 'Unnamed item';
	}

	onChooseItem(item: PlotItem, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}