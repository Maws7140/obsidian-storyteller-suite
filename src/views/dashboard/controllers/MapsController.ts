import { Notice, setIcon } from 'obsidian';
import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const mapsController: DashboardTabController = {
    id: 'maps',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, 'Maps', async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderMapsList(container, context);
        }, () => {
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
        }, t('createNew'));

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
