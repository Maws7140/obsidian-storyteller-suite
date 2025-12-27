import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
import { StoryMap as Map } from '../types';
import StorytellerSuitePlugin from '../main';
import { openMapModal } from '../utils/MapModalHelper';

export class MapListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    maps: Map[];
    listContainer: HTMLElement;
    currentFilter: string = '';

    constructor(app: App, plugin: StorytellerSuitePlugin, maps: Map[]) {
        super(app);
        this.plugin = plugin;
        this.maps = maps;
        this.modalEl.addClass('storyteller-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Maps' });

        this.listContainer = contentEl.createDiv('storyteller-list-container');

        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder('Search maps...')
                    .onChange(value => {
                        this.currentFilter = value.toLowerCase();
                        this.renderList(this.currentFilter, this.listContainer);
                    });
            });

        this.renderList('', this.listContainer);

        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create Map')
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        openMapModal(this.app, this.plugin, null);
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();
        const filtered = this.maps.filter(map =>
            map.name.toLowerCase().includes(filter) ||
            (map.description || '').toLowerCase().includes(filter) ||
            (map.scale || '').toLowerCase().includes(filter)
        );

        if (filtered.length === 0) {
            container.createEl('p', { text: 'No maps found' + (filter ? ' matching filter' : '') });
            return;
        }

        filtered.forEach(map => {
            const itemEl = container.createDiv('storyteller-list-item');
            
            const header = itemEl.createDiv('storyteller-list-item-header');
            header.createEl('h3', { text: map.name });
            
            if (map.description) {
                itemEl.createEl('p', { text: map.description, cls: 'storyteller-list-item-description' });
            }

            const meta = itemEl.createDiv('storyteller-list-item-meta');
            meta.createSpan({ text: `Type: ${map.type || 'image'}` });
            meta.createSpan({ text: `Scale: ${map.scale || 'custom'}` });
            if (map.markers && map.markers.length > 0) {
                meta.createSpan({ text: `${map.markers.length} marker(s)` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            new ButtonComponent(actionsEl)
                .setButtonText('Open in View')
                .setIcon('map')
                .setCta()
                .onClick(async () => {
                    this.close();
                    const mapId = map.id || map.name;
                    await this.plugin.activateMapView(mapId);
                });

            new ButtonComponent(actionsEl)
                .setButtonText('Edit')
                .setIcon('pencil')
                .onClick(() => {
                    this.close();
                    openMapModal(this.app, this.plugin, map, {
                        onDelete: async () => {
                            // Refresh the list after deletion
                            const updatedMaps = await this.plugin.listMaps();
                            this.maps = updatedMaps;
                            this.renderList(this.currentFilter, this.listContainer);
                        }
                    });
                });

            new ButtonComponent(actionsEl)
                .setButtonText('Delete')
                .setIcon('trash')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (map.filePath) {
                        await this.plugin.deleteMap(map.filePath);
                        new Notice(`Deleted map: ${map.name}`);
                        this.close();
                        // Reopen with updated list
                        const updatedMaps = await this.plugin.listMaps();
                        new MapListModal(this.app, this.plugin, updatedMaps).open();
                    }
                });

            if (map.filePath) {
                new ButtonComponent(actionsEl)
                    .setButtonText('Open Note')
                    .setIcon('file-text')
                    .onClick(() => {
                        const file = this.app.vault.getAbstractFileByPath(map.filePath!);
                        if (file instanceof TFile) {
                            this.app.workspace.openLinkText(map.filePath!, '', false);
                        }
                    });
            }
        });
    }
}

