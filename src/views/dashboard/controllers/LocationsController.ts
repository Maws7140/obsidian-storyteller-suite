import { LocationModal } from '../../../modals/LocationModal';
import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const locationsController: DashboardTabController = {
    id: 'locations',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('locations'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderLocationsList(container, context);
        }, () => {
            new LocationModal(context.app, context.plugin, null, async (loc) => {
                await context.mutationRunner.runCreate({
                    action: async () => {
                        await context.plugin.saveLocation(loc);
                    },
                    successNotice: `Location "${loc.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'location-created',
                });
            }).open();
        }, t('createLocation'));

        await renderLocationsList(container, context);
    },
};

async function renderLocationsList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const locations = (await context.plugin.listLocations()).filter(location =>
        location.name.toLowerCase().includes(filter) ||
        (location.description || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (locations.length === 0) {
        listContainer.createEl('p', { text: t('noLocationsFound') + (filter ? t('matchingFilter') : '') });
        return;
    }

    locations.forEach(location => {
        const itemEl = listContainer.createDiv('storyteller-list-item');
        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (location.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            try {
                imgEl.src = context.getImageSrc(location.profileImagePath);
                imgEl.alt = location.name;
            } catch {
                pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
            }
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: location.name.substring(0, 1).toUpperCase() });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: location.name });
        if (location.description) {
            infoEl.createEl('p', { text: location.description.substring(0, 100) + (location.description.length > 100 ? '...' : '') });
        }

        const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
        if (location.locationType) {
            const typeSlug = location.locationType.toLowerCase().replace(/\s+/g, '-');
            extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-loc-type-badge storyteller-loctype-${typeSlug}`, text: location.locationType });
        }
        if (location.region) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-loc-region-badge', text: location.region });
        if (location.parentLocation) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-loc-parent-badge', text: `↑ ${location.parentLocation}` });
        if (location.status) {
            const statusSlug = location.status.toLowerCase().replace(/\s+/g, '-');
            extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-loc-status-badge storyteller-loc-status-${statusSlug}`, text: location.status });
        }
        if (location.balance) extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${location.balance}` });

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            new LocationModal(context.app, context.plugin, location, async (updatedData) => {
                await context.mutationRunner.runUpdate({
                    action: async () => {
                        await context.plugin.saveLocation(updatedData);
                    },
                    successNotice: `Location "${updatedData.name}" updated.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'location-updated',
                });
            }).open();
        });
        context.addDeleteButton(actionsEl, async () => {
            if (location.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Are you sure you want to delete "${location.name}"?`,
                    action: async () => {
                        await context.plugin.deleteLocation(location.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'location-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, location.filePath);
    });
}
