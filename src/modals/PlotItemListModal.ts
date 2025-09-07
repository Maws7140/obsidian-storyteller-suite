/* eslint-disable @typescript-eslint/no-unused-vars */

import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
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
        contentEl.createEl('h2', { text: t('plotItems') });

        this.listContainer = contentEl.createDiv('storyteller-list-container');

        new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder(t('searchX', t('items')))
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        this.renderList('', this.listContainer);

        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createItem'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new PlotItemModal(this.app, this.plugin, null, async (itemData: PlotItem) => {
                            await this.plugin.savePlotItem(itemData);
                            new Notice(t('created', t('item'), itemData.name));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();

        const filteredItems = this.items.filter(item =>
            item.name.toLowerCase().includes(filter) ||
            (item.description || '').toLowerCase().includes(filter) ||
            (item.currentOwner || '').toLowerCase().includes(filter)
        );

        if (filteredItems.length === 0) {
            container.createEl('p', { text: t('noItemsFound') + (filter ? t('matchingFilter') : '') });
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
                infoEl.createEl('p', { text: t('ownerValue', item.currentOwner) });
            }


            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close();
                    new PlotItemModal(this.app, this.plugin, item, async (updatedData: PlotItem) => {
                        await this.plugin.savePlotItem(updatedData);
                        new Notice(t('updated', t('item'), updatedData.name));
                    }).open();
                });

            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteItemTrash', item.name))) {
                        if (item.filePath) {
                            await this.plugin.deletePlotItem(item.filePath);
                            this.items = this.items.filter(i => i.filePath !== item.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(t('errorCannotDeleteWithoutFilePath', t('item')));
                        }
                    }
                });

            new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!item.filePath) {
                        new Notice(t('errorCannotOpenNoteWithoutFilePath', t('item')));
                        return;
                    }
                    const file = this.app.vault.getAbstractFileByPath(item.filePath);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(file);
                        this.close();
                    } else {
                        new Notice(t('workspaceLeafRevealError'));
                    }
                });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}