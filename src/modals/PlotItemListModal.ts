/* eslint-disable @typescript-eslint/no-unused-vars */

import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { PlotItem } from '../types';
import StorytellerSuitePlugin from '../main';
import { PlotItemModal } from './PlotItemModal';

export class PlotItemListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    items: PlotItem[];
    listContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin, items: PlotItem[]) {
        super(app);
        this.plugin = plugin;
        this.items = items;
        this.modalEl.addClass('storyteller-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Plot items' });

        this.listContainer = contentEl.createDiv('storyteller-list-container');

        new Setting(contentEl)
            .setName('Search')
            .addText(text => {
                text.setPlaceholder('Filter items...')
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        this.renderList('', this.listContainer);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create new item')
                .setCta()
                .onClick(() => {
                    this.close();
                    new PlotItemModal(this.app, this.plugin, null, async (itemData: PlotItem) => {
                        await this.plugin.savePlotItem(itemData);
                        new Notice(`Item "${itemData.name}" created.`);
                    }).open();
                }));
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();

        const filteredItems = this.items.filter(item =>
            item.name.toLowerCase().includes(filter) ||
            (item.description || '').toLowerCase().includes(filter) ||
            (item.currentOwner || '').toLowerCase().includes(filter)
        );

        if (filteredItems.length === 0) {
            container.createEl('p', { text: 'No items found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        filteredItems.forEach(item => {
            const itemEl = container.createDiv('storyteller-list-item');
            const infoEl = itemEl.createDiv('storyteller-list-item-info');

            const titleEl = infoEl.createEl('strong', { text: item.name });
            if (item.isPlotCritical) {
                titleEl.setText(`★ ${item.name}`);
                titleEl.style.color = 'var(--text-accent)';
            }

            if (item.description) {
                const preview = item.description.substring(0, 100);
                const displayText = item.description.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            if (item.currentOwner) {
                infoEl.createEl('p', { text: `Owner: ${item.currentOwner}` });
            }


            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    this.close();
                    new PlotItemModal(this.app, this.plugin, item, async (updatedData: PlotItem) => {
                        await this.plugin.savePlotItem(updatedData);
                        new Notice(`Item "${updatedData.name}" updated.`);
                    }).open();
                });

            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete "${item.name}"? This will move the file to system trash.`)) {
                        if (item.filePath) {
                            await this.plugin.deletePlotItem(item.filePath);
                            this.items = this.items.filter(i => i.filePath !== item.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice('Error: Cannot delete item without file path.');
                        }
                    }
                });

            new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip('Open note')
                .onClick(() => {
                    if (!item.filePath) {
                        new Notice('Error: Cannot open item note without file path.');
                        return;
                    }
                    const file = this.app.vault.getAbstractFileByPath(item.filePath);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(file);
                        this.close();
                    } else {
                        new Notice('Could not find the note file.');
                    }
                });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}