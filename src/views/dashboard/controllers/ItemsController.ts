import { Notice, Setting } from 'obsidian';
import { PlotItemModal } from '../../../modals/PlotItemModal';
import { t } from '../../../i18n/strings';
import type { PlotItem } from '../../../types';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const itemsController: DashboardTabController = {
    id: 'items',
    async render(container, context) {
        container.empty();
        let showPlotCriticalOnly = false;

        const controlsGroup = container.createDiv('storyteller-controls-group');
        new Setting(controlsGroup)
            .setName(t('filterItems'))
            .addText(text => text
                .setPlaceholder(t('searchX', 'items'))
                .onChange(async (value) => {
                    context.setCurrentFilter(value);
                    await renderItemsList(container, context, showPlotCriticalOnly);
                }));

        new Setting(controlsGroup)
            .setName(t('plotCritical'))
            .setDesc(t('filterX', 'bookmarked'))
            .addToggle(toggle => {
                toggle.setValue(showPlotCriticalOnly)
                    .onChange(async (value) => {
                        showPlotCriticalOnly = value;
                        await renderItemsList(container, context, showPlotCriticalOnly);
                    });
            });

        new Setting(controlsGroup)
            .addButton(button => {
                const hasActiveStory = !!context.plugin.getActiveStory();
                button
                    .setButtonText(t('createNew'))
                    .setCta()
                    .onClick(() => {
                        if (!context.plugin.getActiveStory()) {
                            new Notice('Select or create a story first.');
                            return;
                        }
                        new PlotItemModal(context.app, context.plugin, null, async (item: PlotItem) => {
                            await context.mutationRunner.runCreate({
                                action: async () => {
                                    await context.plugin.savePlotItem(item);
                                },
                                successNotice: `Item "${item.name}" created.`,
                                refreshMode: 'immediate',
                                refreshDetail: 'plot-item-created',
                            });
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });

        await renderItemsList(container, context, showPlotCriticalOnly);
    },
};

async function renderItemsList(container: HTMLElement, context: DashboardControllerContext, plotCriticalOnly: boolean): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    let items = await context.plugin.listPlotItems();
    const locations = await context.plugin.listLocations();

    if (plotCriticalOnly) items = items.filter(item => item.isPlotCritical);

    const filter = context.getCurrentFilter();
    items = items.filter(item =>
        item.name.toLowerCase().includes(filter) ||
        (item.description || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (items.length === 0) {
        listContainer.createEl('p', { text: t('noItemsFound') });
        return;
    }

    items.forEach(item => {
        const itemEl = listContainer.createDiv('storyteller-list-item');
        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (item.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(item.profileImagePath);
            imgEl.alt = item.name;
        } else {
            pfpContainer.setText(item.isPlotCritical ? '★' : '●');
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const titleEl = infoEl.createEl('strong', { text: item.name });
        if (item.isPlotCritical) {
            titleEl.setText(`★ ${item.name}`);
            titleEl.style.color = 'var(--text-accent)';
        }
        if (item.description) infoEl.createEl('p', { text: item.description.substring(0, 80) + '...' });

        const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
        if (item.currentOwner) extraInfoEl.createSpan({ text: `Owner: ${item.currentOwner}` });
        if (item.currentLocation) {
            if (item.currentOwner) extraInfoEl.appendText(' • ');
            extraInfoEl.createSpan({ text: `Location: ${context.resolveLocationName(item.currentLocation, locations)}` });
        }
        if (item.economicValue) {
            if (item.currentOwner || item.currentLocation) extraInfoEl.appendText(' • ');
            extraInfoEl.createSpan({ cls: 'storyteller-item-value-badge', text: item.economicValue });
        }
        const tagCount = (item.magicSystems?.length ?? 0) + (item.linkedCultures?.length ?? 0);
        if (tagCount > 0) {
            const parts: string[] = [];
            if (item.magicSystems?.length) parts.push(`${item.magicSystems.length} magic`);
            if (item.linkedCultures?.length) parts.push(`${item.linkedCultures.length} culture${item.linkedCultures.length > 1 ? 's' : ''}`);
            if (item.currentOwner || item.currentLocation || item.economicValue) extraInfoEl.appendText(' • ');
            extraInfoEl.createSpan({ cls: 'storyteller-item-tags', text: parts.join(' · ') });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            new PlotItemModal(context.app, context.plugin, item, async (updatedData: PlotItem) => {
                await context.mutationRunner.runUpdate({
                    action: async () => {
                        await context.plugin.savePlotItem(updatedData);
                    },
                    successNotice: `Item "${updatedData.name}" updated.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'plot-item-updated',
                });
            }).open();
        });
        context.addDeleteButton(actionsEl, async () => {
            if (item.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Are you sure you want to delete "${item.name}"?`,
                    action: async () => {
                        await context.plugin.deletePlotItem(item.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'plot-item-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, item.filePath);
    });
}
