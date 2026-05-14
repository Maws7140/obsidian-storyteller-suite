import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const magicSystemsController: DashboardTabController = {
    id: 'magicsystems',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('magicSystems'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderMagicSystemsList(container, context);
        }, () => {
            void import('../../../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                new MagicSystemModal(context.app, context.plugin, null, async (magicSystem) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveMagicSystem(magicSystem);
                        },
                        successNotice: t('magicSystemCreated', magicSystem.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'magic-system-created',
                    });
                }).open();
            });
        }, t('createNew'));

        await renderMagicSystemsList(container, context);
    },
};

async function renderMagicSystemsList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const magicSystems = (await context.plugin.listMagicSystems()).filter(m =>
        m.name.toLowerCase().includes(filter) ||
        (m.rules || '').toLowerCase().includes(filter) ||
        (m.source || '').toLowerCase().includes(filter) ||
        (m.systemType || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (magicSystems.length === 0) {
        listContainer.createEl('p', { text: t('noMagicSystemsFound') + (filter ? t('matchingFilter') : '') });
        return;
    }

    magicSystems.forEach(magicSystem => {
        const itemEl = listContainer.createDiv('storyteller-list-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (magicSystem.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            imgEl.src = context.getImageSrc(magicSystem.profileImagePath);
            imgEl.alt = magicSystem.name;
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: magicSystem.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: magicSystem.name });

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (magicSystem.systemType) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-magic-type-badge', text: magicSystem.systemType });
        if (magicSystem.rarity) {
            const raritySlug = magicSystem.rarity.toLowerCase();
            meta.createSpan({ cls: `storyteller-meta-badge storyteller-rarity-${raritySlug}`, text: magicSystem.rarity });
        }

        if (magicSystem.rules) {
            const preview = magicSystem.rules.length > 120 ? magicSystem.rules.substring(0, 120) + '...' : magicSystem.rules;
            infoEl.createEl('p', { text: preview });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            void import('../../../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                new MagicSystemModal(context.app, context.plugin, magicSystem, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveMagicSystem(updated);
                        },
                        successNotice: t('magicSystemUpdated', updated.name),
                        refreshMode: 'immediate',
                        refreshDetail: 'magic-system-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteMagicSystem(toDelete.filePath);
                        context.queueDashboardRefresh('magic-system-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (magicSystem.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: t('confirmDeleteMagicSystem', magicSystem.name),
                    action: async () => {
                        await context.plugin.deleteMagicSystem(magicSystem.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'magic-system-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, magicSystem.filePath);
    });
}
