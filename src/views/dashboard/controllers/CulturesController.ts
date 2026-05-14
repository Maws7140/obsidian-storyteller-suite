import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const culturesController: DashboardTabController = {
    id: 'cultures',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('cultures'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderCulturesList(container, context);
        }, () => {
            void import('../../../modals/CultureModal').then(({ CultureModal }) => {
                new CultureModal(context.app, context.plugin, null, async (culture) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveCulture(culture);
                        },
                        successNotice: t('cultureCreated', culture.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'culture-created',
                    });
                }).open();
            });
        }, t('createNew'));

        await renderCulturesList(container, context);
    },
};

async function renderCulturesList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const cultures = (await context.plugin.listCultures()).filter(c =>
        c.name.toLowerCase().includes(filter) ||
        (c.values || '').toLowerCase().includes(filter) ||
        (c.religion || '').toLowerCase().includes(filter) ||
        (c.governmentType || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (cultures.length === 0) {
        listContainer.createEl('p', { text: t('noCulturesFound') + (filter ? t('matchingFilter') : '') });
        return;
    }

    cultures.forEach(culture => {
        const itemEl = listContainer.createDiv('storyteller-list-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (culture.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(culture.profileImagePath);
            imgEl.alt = culture.name;
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: culture.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: culture.name });

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (culture.governmentType) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-gov-badge', text: culture.governmentType });
        if (culture.techLevel) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-tech-badge', text: culture.techLevel });
        if (culture.balance) meta.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${culture.balance}` });

        if (culture.values) {
            const preview = culture.values.length > 120 ? culture.values.substring(0, 120) + '...' : culture.values;
            infoEl.createEl('p', { text: preview });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            void import('../../../modals/CultureModal').then(({ CultureModal }) => {
                new CultureModal(context.app, context.plugin, culture, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveCulture(updated);
                        },
                        successNotice: t('cultureUpdated', updated.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'culture-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteCulture(toDelete.filePath);
                        context.queueDashboardRefresh('culture-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (culture.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: t('confirmDeleteCulture', culture.name),
                    action: async () => {
                        await context.plugin.deleteCulture(culture.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'culture-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, culture.filePath);
    });
}
