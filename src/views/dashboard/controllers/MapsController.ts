import { Notice, setIcon } from 'obsidian';
import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const mapsController: DashboardTabController = {
    id: 'maps',
    async render(container, context) {
        container.empty();
        const openMapsPanel = async () => {
            await context.plugin.activateMapView();
        };
        context.renderHeaderControls(
            container,
            'Maps',
            async (filter: string) => {
                context.setCurrentFilter(filter);
                await renderMapsList(container, context);
            },
            () => {
                if (!context.plugin.getActiveStory()) {
                    new Notice(t('selectOrCreateStoryFirst'));
                    return;
                }
                void import('../../../utils/MapModalHelper').then(({ openMapModal }) => {
                    openMapModal(context.app, context.plugin, null, {
                        onSave: async () => {
                            context.mutationRunner.requestRefresh('immediate', 'map-created');
                        }
                    });
                });
            },
            t('createNew'),
            (setting) => {
                setting.addButton(button => {
                    button
                        .setIcon('panel-right-open')
                        .setTooltip('Open maps panel')
                        .onClick(() => {
                            void openMapsPanel();
                        });
                });
            },
            (menu) => {
                menu.addItem(item => {
                    item.setTitle('Open maps panel');
                    item.setIcon('panel-right-open');
                    item.onClick(() => {
                        void openMapsPanel();
                    });
                });
            }
        );

        await renderMapsList(container, context);
    },
};

async function renderMapsList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const maps = (await context.plugin.listMaps()).filter(map =>
        map.name.toLowerCase().includes(filter) ||
        (map.description || '').toLowerCase().includes(filter) ||
        (map.type || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (maps.length === 0) {
        listContainer.createEl('p', { text: 'No maps found.' + (filter ? ' Try a different search.' : '') });
        return;
    }

    maps.forEach(map => {
        const itemEl = listContainer.createDiv('storyteller-list-item');
        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (map.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(map.profileImagePath);
            imgEl.alt = map.name;
        } else {
            const pfpPlaceholder = pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder' });
            setIcon(pfpPlaceholder, 'map');
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: map.name });

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (map.type) meta.createSpan({ text: `Type: ${map.type}` });
        if (map.markers && map.markers.length > 0) meta.createSpan({ text: ` • Markers: ${map.markers.length}` });
        if (map.description) {
            const preview = map.description.length > 120 ? map.description.substring(0, 120) + '...' : map.description;
            infoEl.createEl('p', { text: preview });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        addOpenMapViewButton(actionsEl, context, map.id || map.name);
        context.addEditButton(actionsEl, () => {
            void import('../../../utils/MapModalHelper').then(({ openMapModal }) => {
                openMapModal(context.app, context.plugin, map, {
                    onSave: async () => {
                        context.mutationRunner.requestRefresh('immediate', 'map-updated');
                    },
                    onDelete: async () => {
                        context.mutationRunner.requestRefresh('immediate', 'map-deleted-from-modal');
                    }
                });
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (map.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Delete map "${map.name}"?`,
                    action: async () => {
                        await context.plugin.deleteMap(map.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'map-deleted-from-dashboard',
                });
            }
        });
        context.addOpenFileButton(actionsEl, map.filePath);
    });
}

function addOpenMapViewButton(container: HTMLElement, context: DashboardControllerContext, mapId: string | undefined): void {
    if (!mapId) {
        return;
    }

    const button = container.createEl('button', { cls: 'clickable-icon' });
    button.type = 'button';
    button.setAttribute('aria-label', 'Open in map view');
    button.title = 'Open in map view';
    setIcon(button, 'map');
    button.addEventListener('click', () => {
        void context.plugin.activateMapView(mapId);
    });
}
