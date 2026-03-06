import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
import { CompendiumEntry } from '../types';
import StorytellerSuitePlugin from '../main';
import { CompendiumEntryModal } from './CompendiumEntryModal';

export class CompendiumListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    entries: CompendiumEntry[];
    private listContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin, entries: CompendiumEntry[]) {
        super(app);
        this.plugin = plugin;
        this.entries = entries;
        this.modalEl.addClass('storyteller-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('compendium') });

        this.listContainer = contentEl.createDiv('storyteller-list-container');

        new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder(t('searchCompendiumEntries'))
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        this.renderList('', this.listContainer);

        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createCompendiumEntry'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new CompendiumEntryModal(this.app, this.plugin, null, async (entry: CompendiumEntry) => {
                            await this.plugin.saveCompendiumEntry(entry);
                            new Notice(t('compendiumEntryCreated', entry.name));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();

        const filtered = this.entries.filter(e =>
            e.name.toLowerCase().includes(filter) ||
            (e.entryType || '').toLowerCase().includes(filter) ||
            (e.description || '').toLowerCase().includes(filter)
        );

        if (filtered.length === 0) {
            container.createEl('p', { text: t('noCompendiumEntriesFound') + (filter ? t('matchingFilter') : '') });
            return;
        }

        filtered.forEach(entry => {
            const itemEl = container.createDiv('storyteller-list-item');

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: entry.name });

            const meta: string[] = [];
            if (entry.entryType) meta.push(entry.entryType.charAt(0).toUpperCase() + entry.entryType.slice(1));
            if (entry.rarity) meta.push(entry.rarity);
            if (entry.dangerRating && entry.dangerRating !== 'none') meta.push(`danger: ${entry.dangerRating}`);
            if (meta.length > 0) {
                infoEl.createEl('p', { text: meta.join(' · '), cls: 'storyteller-list-meta' });
            }
            if (entry.description) {
                const preview = entry.description.substring(0, 100);
                infoEl.createEl('p', { text: preview + (entry.description.length > 100 ? '...' : '') });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close();
                    new CompendiumEntryModal(this.app, this.plugin, entry, async (updated: CompendiumEntry) => {
                        await this.plugin.saveCompendiumEntry(updated);
                        new Notice(t('compendiumEntryUpdated', updated.name));
                    }).open();
                });

            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteCompendiumEntry', entry.name))) {
                        if (entry.filePath) {
                            await this.plugin.deleteCompendiumEntry(entry.filePath);
                            this.entries = this.entries.filter(e => e.filePath !== entry.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(t('cannotDeleteWithoutPath'));
                        }
                    }
                });

            new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!entry.filePath) {
                        new Notice(t('cannotOpenWithoutPath'));
                        return;
                    }
                    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
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
