import type { DashboardControllerContext, DashboardTabController } from './types';

export const compendiumController: DashboardTabController = {
    id: 'compendium',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, 'Compendium', async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderCompendiumList(container, context);
        }, () => {
            import('../../../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                new CompendiumEntryModal(context.app, context.plugin, null, async (entry) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveCompendiumEntry(entry);
                        },
                        successNotice: `Entry "${entry.name}" created.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'compendium-entry-created',
                    });
                }).open();
            });
        }, 'New Entry');

        await renderCompendiumList(container, context);
    },
};

async function renderCompendiumList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const entries = (await context.plugin.listCompendiumEntries()).filter(entry =>
        entry.name.toLowerCase().includes(filter) ||
        (entry.entryType || '').toLowerCase().includes(filter) ||
        (entry.description || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (entries.length === 0) {
        listContainer.createEl('p', { text: 'No compendium entries found.' + (filter ? ' (matching filter)' : '') });
        return;
    }

    entries.forEach(entry => {
        const itemEl = listContainer.createDiv('storyteller-list-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (entry.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(entry.profileImagePath);
            imgEl.alt = entry.name;
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: entry.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const nameRow = infoEl.createDiv({ cls: 'storyteller-compendium-name-row' });
        nameRow.createEl('strong', { text: entry.name });

        if (entry.entryType) {
            nameRow.createSpan({
                cls: `storyteller-compendium-badge storyteller-compendium-${entry.entryType}`,
                text: entry.entryType
            });
        }
        if (entry.rarity) {
            nameRow.createSpan({
                cls: `storyteller-compendium-badge storyteller-rarity-${entry.rarity}`,
                text: entry.rarity
            });
        }
        if (entry.dangerRating && entry.dangerRating !== 'none') {
            nameRow.createSpan({
                cls: `storyteller-compendium-badge storyteller-danger-${entry.dangerRating}`,
                text: `⚠ ${entry.dangerRating}`
            });
        }

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        const locCount = entry.linkedLocations?.length ?? 0;
        const charCount = entry.linkedCharacters?.length ?? 0;
        if (locCount > 0) meta.createSpan({ text: `${locCount} location${locCount > 1 ? 's' : ''}` });
        if (charCount > 0) {
            if (locCount > 0) meta.appendText(' • ');
            meta.createSpan({ text: `${charCount} character${charCount > 1 ? 's' : ''}` });
        }

        if (entry.description) {
            const preview = entry.description.length > 80 ? entry.description.substring(0, 80) + '...' : entry.description;
            infoEl.createEl('p', { text: preview });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            import('../../../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                new CompendiumEntryModal(context.app, context.plugin, entry, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveCompendiumEntry(updated);
                        },
                        successNotice: `Entry "${updated.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'compendium-entry-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteCompendiumEntry(toDelete.filePath);
                        context.queueDashboardRefresh('compendium-entry-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (entry.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Delete "${entry.name}"?`,
                    action: async () => {
                        await context.plugin.deleteCompendiumEntry(entry.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'compendium-entry-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, entry.filePath);
    });
}
