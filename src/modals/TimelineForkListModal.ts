import { App, Modal, Notice } from 'obsidian';
import type { TimelineFork } from '../types';
import type StorytellerSuitePlugin from '../main';
import { TimelineForkModal } from './TimelineForkModal';
import { ResponsiveModal } from './ResponsiveModal';
import { VIEW_TYPE_TIMELINE, TimelineView } from '../views/TimelineView';

/** Reads better than the stored value, and keeps the badge text in one place. */
const STATUS_LABELS: Record<TimelineFork['status'], string> = {
    exploring: 'Exploring',
    canon: 'Canon',
    abandoned: 'Abandoned',
    merged: 'Merged'
};

/**
 * The list of branches, and what you can do to one.
 *
 * There was a "View timeline forks" command before this, which counted the
 * branches and put the number in a notice. It reported that forks existed
 * without ever showing one, which reads as the feature being broken.
 */
export class TimelineForkListModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;
    private forks: TimelineFork[];
    private listContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.forks = plugin.getTimelineForks();
        this.modalEl.addClass('storyteller-fork-list-modal');
    }

    onOpen() {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();

        contentEl.createEl('h2', { text: 'Timeline branches' });
        contentEl.createEl('p', {
            text: 'A branch is a what-if: the story up to a divergence, then somewhere else. Open one to read it on its own, or compare them side by side on the timeline.',
            cls: 'storyteller-modal-description'
        });

        const headerContainer = contentEl.createDiv('storyteller-list-header');
        headerContainer.createEl('button', { text: '+ create new branch', cls: 'mod-cta' }, btn => {
            btn.addEventListener('click', () => this.openForkModal(null));
        });
        headerContainer.createEl('span', {
            text: `${this.forks.length} branch${this.forks.length === 1 ? '' : 'es'}`,
            cls: 'storyteller-list-count'
        });

        this.listContainer = contentEl.createDiv('storyteller-fork-list');
        this.renderForkList();

        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer', attr: { 'aria-hidden': 'true' } });
        if (this.forks.length > 1) {
            this.createFooterButton(footerEl, 'Compare all', () => { void this.openOnTimeline('__compare__'); });
        }
        this.createFooterButton(footerEl, 'Close', () => this.close());
    }

    private renderForkList() {
        this.listContainer.empty();

        if (!this.forks.length) {
            this.listContainer.createEl('p', {
                text: 'No branches yet. Click "create new branch" to split the story at an event.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        const byId = new Map(this.forks.map(fork => [fork.id, fork]));

        for (const fork of this.forks) {
            const card = this.listContainer.createDiv('storyteller-fork-card');

            const content = card.createDiv('storyteller-fork-content');

            const headerRow = content.createDiv('storyteller-fork-header');
            // A swatch rather than a bar down the card's edge: this is the
            // colour the branch draws in on the timeline, not a selection mark.
            const swatch = headerRow.createDiv('storyteller-fork-swatch');
            if (fork.color) swatch.setCssStyles({ backgroundColor: fork.color });
            headerRow.createEl('h3', { text: fork.name || '(Unnamed branch)' });
            headerRow.createEl('span', {
                text: STATUS_LABELS[fork.status] || fork.status,
                cls: `storyteller-fork-status-badge is-${fork.status}`
            });

            content.createDiv('storyteller-fork-meta', div => {
                div.createEl('strong', { text: 'Diverges: ' });
                const where = fork.divergenceEvent || 'unspecified event';
                const when = fork.divergenceDate ? ` (${fork.divergenceDate})` : '';
                div.createSpan({ text: `${where}${when}` });
            });

            // Only shown when the branch left another branch. Saying "from the
            // main timeline" on every other card is noise.
            const parent = fork.parentTimelineId ? byId.get(fork.parentTimelineId) : undefined;
            if (parent) {
                content.createDiv('storyteller-fork-meta', div => {
                    div.createEl('strong', { text: 'Branched from: ' });
                    div.createSpan({ text: parent.name });
                });
            }

            content.createDiv('storyteller-fork-meta', div => {
                const count = fork.linkedEvents?.length || 0;
                div.createEl('strong', { text: 'Own events: ' });
                div.createSpan({ text: String(count) });
            });

            if (fork.description) {
                content.createDiv('storyteller-fork-description', div => {
                    div.createSpan({
                        text: fork.description && fork.description.length > 120
                            ? `${fork.description.slice(0, 120)}...`
                            : fork.description || ''
                    });
                });
            }

            const actions = content.createDiv('storyteller-fork-actions');

            actions.createEl('button', { text: 'Show on timeline', cls: 'storyteller-fork-action-btn' }, btn => {
                btn.addEventListener('click', () => { void this.openOnTimeline(fork.id); });
            });

            actions.createEl('button', { text: 'Edit', cls: 'storyteller-fork-action-btn' }, btn => {
                btn.addEventListener('click', () => this.openForkModal(fork));
            });

            actions.createEl('button', { text: 'Delete', cls: 'storyteller-fork-action-btn mod-warning' }, btn => {
                btn.addEventListener('click', () => { void (async () => {
                    if (!await this.confirmDelete(fork.name)) return;
                    await this.plugin.deleteTimelineFork(fork.id);
                    this.forks = this.plugin.getTimelineForks();
                    this.renderForkList();
                })(); });
            });
        }
    }

    /**
     * Open the timeline on a branch.
     *
     * The view is asked to rebuild its picker rather than merely redraw,
     * because a branch created in this session is not in the picker yet and the
     * selection would have nothing to land on.
     */
    private async openOnTimeline(selection: string): Promise<void> {
        await this.plugin.activateTimelineView();
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE)[0];
        if (!(leaf?.view instanceof TimelineView)) {
            new Notice('Could not open the timeline view');
            return;
        }
        await leaf.view.showBranch(selection);
        this.close();
    }

    private openForkModal(fork: TimelineFork | null) {
        new TimelineForkModal(
            this.app,
            this.plugin,
            fork,
            async (updated) => {
                if (fork) {
                    await this.plugin.updateTimelineFork(updated);
                } else {
                    await this.plugin.createTimelineFork(
                        updated.name,
                        updated.divergenceEvent,
                        updated.divergenceDate,
                        updated.description || ''
                    );
                }
                this.forks = this.plugin.getTimelineForks();
                this.renderForkList();
            },
            async (toDelete) => {
                await this.plugin.deleteTimelineFork(toDelete.id);
                this.forks = this.plugin.getTimelineForks();
                this.renderForkList();
            }
        ).open();
    }

    private async confirmDelete(forkName: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const confirmModal = new Modal(this.app);
            confirmModal.contentEl.createEl('h3', { text: 'Delete branch?' });
            confirmModal.contentEl.createEl('p', {
                text: `Delete "${forkName}"? The events it holds stay in the vault, but the branch that gathered them does not.`
            });

            const buttons = confirmModal.contentEl.createDiv('modal-button-container');
            buttons.createEl('button', { text: 'Cancel' }, btn => {
                btn.addEventListener('click', () => { resolve(false); confirmModal.close(); });
            });
            buttons.createEl('button', { text: 'Delete', cls: 'mod-warning' }, btn => {
                btn.addEventListener('click', () => { resolve(true); confirmModal.close(); });
            });

            confirmModal.open();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
