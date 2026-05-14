import { setIcon } from 'obsidian';
import type { CampaignSession } from '../../../types';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const campaignController: DashboardTabController = {
    id: 'campaign',
    async render(container, context) {
        container.empty();

        context.renderHeaderControls(container, 'Campaign', async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderCampaignList(container, context);
        }, () => {
            void import('../../../modals/CampaignSessionModal').then(({ CampaignSessionModal }) => {
                new CampaignSessionModal(context.app, context.plugin, () => { void (async () => {
                    context.queueDashboardRefresh('campaign-session-created-or-updated');
                })(); }).open();
            });
        }, 'New Session');

        const headerRow = container.querySelector('.storyteller-header-controls');
        if (headerRow) {
            const graphBtn = headerRow.createEl('button', { cls: 'storyteller-header-secondary-btn', text: 'Scene graph' });
            setIcon(graphBtn.createSpan(), 'git-branch');
            graphBtn.addEventListener('click', () => {
                void context.plugin.activateSceneGraphView();
            });
        }

        await renderCampaignList(container, context);
    },
};

async function renderCampaignList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingList = container.querySelector('.storyteller-list-container');
    if (existingList) existingList.remove();

    let sessions: CampaignSession[] = [];
    try {
        sessions = await context.plugin.listSessions();
    } catch {
        // no active story
    }

    const filter = context.getCurrentFilter().toLowerCase();
    const filtered = sessions.filter(session =>
        session.name.toLowerCase().includes(filter) ||
        (session.currentSceneName ?? '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (filtered.length === 0) {
        listContainer.createEl('p', { text: 'No sessions found. Click "new session" to start a campaign.' });
        return;
    }

    for (const session of filtered) {
        const itemEl = listContainer.createDiv('storyteller-list-item');

        const iconEl = itemEl.createDiv('storyteller-list-item-pfp');
        const iconInner = iconEl.createDiv({ cls: 'storyteller-pfp-placeholder' });
        setIcon(iconInner, 'swords');

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const titleRow = infoEl.createDiv('storyteller-list-item-title');
        titleRow.createEl('strong', { text: session.name, cls: 'storyteller-list-item-name' });
        const statusSlug = (session.status ?? 'active').replace(/\s+/g, '-');
        titleRow.createSpan({ cls: `storyteller-meta-badge storyteller-campaign-status-${statusSlug}`, text: session.status ?? 'active' });

        const extraEl = infoEl.createDiv('storyteller-list-item-extra');
        if (session.currentSceneName) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: `Scene: ${session.currentSceneName}` });
        if (session.partyCharacterNames?.length) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: `Party: ${session.partyCharacterNames.join(', ')}` });
        if (session.modified) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: new Date(session.modified).toLocaleDateString() });

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

        const resumeBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn mod-cta', text: 'Resume' });
        resumeBtn.addEventListener('click', () => {
            void context.plugin.activateCampaignView(session);
        });

        if (session.filePath) {
            const openBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn' });
            setIcon(openBtn, 'file-text');
            openBtn.setAttribute('aria-label', 'Open session note');
            openBtn.addEventListener('click', () => {
                const file = context.app.vault.getAbstractFileByPath(session.filePath!);
                if (file) void context.app.workspace.openLinkText(file.name, '', true);
            });

            const delBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn mod-warning' });
            setIcon(delBtn, 'trash');
            delBtn.setAttribute('aria-label', 'Delete session');
            delBtn.addEventListener('click', () => { void (async () => {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Delete session "${session.name}"?`,
                    action: async () => {
                        await context.plugin.deleteSession(session.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'campaign-session-deleted',
                });
            })(); });
        }
    }
}
