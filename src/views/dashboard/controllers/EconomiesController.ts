import { setIcon } from 'obsidian';
import { EconomyDetailModal } from '../../../modals/EconomyDetailModal';
import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const economiesController: DashboardTabController = {
    id: 'economies',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('economies'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderEconomiesList(container, context);
        }, () => {
            void import('../../../modals/EconomyModal').then(({ EconomyModal }) => {
                new EconomyModal(context.app, context.plugin, null, async (economy) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveEconomy(economy);
                        },
                        successNotice: t('economyCreated', economy.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'economy-created',
                    });
                }).open();
            });
        }, t('createNew'));

        await renderEconomiesList(container, context);
    },
};

async function renderEconomiesList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const economies = (await context.plugin.listEconomies()).filter(e =>
        e.name.toLowerCase().includes(filter) ||
        (e.industries || '').toLowerCase().includes(filter) ||
        (e.taxation || '').toLowerCase().includes(filter) ||
        (e.economicSystem || '').toLowerCase().includes(filter) ||
        (e.linkedCharacters || []).join(' ').toLowerCase().includes(filter) ||
        (e.linkedLocations || []).join(' ').toLowerCase().includes(filter) ||
        (e.linkedCultures || []).join(' ').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (economies.length === 0) {
        listContainer.createEl('p', { text: t('noEconomiesFound') + (filter ? t('matchingFilter') : '') });
        return;
    }

    economies.forEach(economy => {
        const itemEl = listContainer.createDiv('storyteller-list-item storyteller-economy-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (economy.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(economy.profileImagePath);
            imgEl.alt = economy.name;
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: economy.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const titleRow = infoEl.createDiv('storyteller-economy-card-title-row');
        titleRow.createEl('strong', { text: economy.name });
        if (economy.status) {
            const statusKey = economy.status.toLowerCase().replace(/\s+/g, '-');
            titleRow.createEl('span', {
                cls: `storyteller-economy-status-badge is-${statusKey}`,
                text: economy.status
            });
        }

        if (economy.description) {
            const preview = economy.description.length > 100 ? economy.description.substring(0, 100) + '...' : economy.description;
            infoEl.createEl('p', { text: preview });
        }

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (economy.economicSystem) meta.createSpan({ text: economy.economicSystem });
        if (economy.currencies && economy.currencies.length > 0) {
            meta.createSpan({ text: ` • ${economy.currencies.length} ${economy.currencies.length === 1 ? 'currency' : 'currencies'}` });
        }
        if (economy.tradeRoutes && economy.tradeRoutes.length > 0) {
            meta.createSpan({ text: ` • ${economy.tradeRoutes.length} trade ${economy.tradeRoutes.length === 1 ? 'route' : 'routes'}` });
        }

        const linkedCounts: [string, number][] = [
            ['chars', (economy.linkedCharacters || []).length],
            ['loc', (economy.linkedLocations || []).length],
            ['cultures', (economy.linkedCultures || []).length],
        ].filter(([, count]) => count > 0) as [string, number][];

        if (linkedCounts.length > 0) {
            const linksRow = infoEl.createDiv('storyteller-economy-links-row');
            for (const [label, count] of linkedCounts) {
                linksRow.createEl('span', {
                    cls: 'storyteller-economy-link-count',
                    text: `${count} ${label}`
                });
            }
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            void import('../../../modals/EconomyModal').then(({ EconomyModal }) => {
                new EconomyModal(context.app, context.plugin, economy, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveEconomy(updated);
                        },
                        successNotice: t('economyUpdated', updated.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'economy-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteEconomy(toDelete.filePath);
                        context.queueDashboardRefresh('economy-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (economy.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: t('confirmDeleteEconomy', economy.name),
                    action: async () => {
                        await context.plugin.deleteEconomy(economy.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'economy-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, economy.filePath);

        const detailBtn = actionsEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Details' } });
        setIcon(detailBtn, 'book-open');
        detailBtn.addEventListener('click', () => {
            new EconomyDetailModal(context.app, context.plugin, economy).open();
        });
    });
}
