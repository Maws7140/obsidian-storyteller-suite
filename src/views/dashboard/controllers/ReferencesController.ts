import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const referencesController: DashboardTabController = {
    id: 'references',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, 'References', async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderReferencesList(container, context);
        }, () => {
            import('../../../modals/ReferenceModal').then(({ ReferenceModal }) => {
                new ReferenceModal(context.app, context.plugin, null, async (ref) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveReference(ref);
                        },
                        successNotice: `Reference "${ref.name}" created.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'reference-created',
                    });
                }).open();
            });
        }, t('createNew'));

        await renderReferencesList(container, context);
    },
};

async function renderReferencesList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const references = (await context.plugin.listReferences()).filter(ref =>
        ref.name.toLowerCase().includes(filter) ||
        (ref.category || '').toLowerCase().includes(filter) ||
        (ref.content || '').toLowerCase().includes(filter) ||
        (ref.tags || []).join(' ').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (references.length === 0) {
        const emptyMsg = listContainer.createEl('p', { text: t('noReferencesFound') + (filter ? t('matchingFilter') : '') });
        emptyMsg.addClass('storyteller-empty-state');
        return;
    }

    references.forEach(ref => {
        const itemEl = listContainer.createDiv('storyteller-list-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (ref.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            try {
                imgEl.src = context.getImageSrc(ref.profileImagePath);
                imgEl.alt = ref.name;
            } catch {
                pfpContainer.createSpan({ text: '?' });
            }
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: ref.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: ref.name });
        if (ref.category) {
            infoEl.createEl('span', { text: ` (${ref.category})`, cls: 'storyteller-list-item-status' });
        }
        if (ref.content) {
            const preview = ref.content.length > 120 ? ref.content.substring(0, 120) + '...' : ref.content;
            infoEl.createEl('p', { text: preview });
        }
        if (ref.tags && ref.tags.length > 0) {
            const tagsRow = infoEl.createDiv('storyteller-list-item-extra');
            tagsRow.createSpan({ text: ref.tags.map(tag => `#${tag}`).join(' ') });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            import('../../../modals/ReferenceModal').then(({ ReferenceModal }) => {
                new ReferenceModal(context.app, context.plugin, ref, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveReference(updated);
                        },
                        successNotice: `Reference "${updated.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'reference-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteReference(toDelete.filePath);
                        context.queueDashboardRefresh('reference-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (ref.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Delete reference "${ref.name}"?`,
                    action: async () => {
                        await context.plugin.deleteReference(ref.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'reference-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, ref.filePath);
    });
}
