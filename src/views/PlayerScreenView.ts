/*
 * Player screen: what the DM pushed, shown on a TV. Pinned pushes form a
 * "Story" strip; the oldest popup covers the view until a player closes it.
 * Everything is drawn inside this view's own container, so it also shows
 * when the view sits in a pop-out window.
 */
import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { PlayerPush, PlayerScreenState } from '../campaign/PlayerPush';
import { VIEW_TYPE_CAMPAIGN } from './CampaignView';
import type { CampaignView } from './CampaignView';

export const VIEW_TYPE_PLAYER_SCREEN = 'storyteller-player-screen';

function cardTitle(push: PlayerPush): string {
	return push.target ? `For ${push.target}: ${push.heading}` : push.heading;
}

export class PlayerScreenView extends ItemView {
	private plugin: StorytellerSuitePlugin;
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PLAYER_SCREEN;
	}

	getDisplayText(): string {
		return 'Player screen';
	}

	getIcon(): string {
		return 'monitor';
	}

	onOpen(): Promise<void> {
		this.unsubscribe?.();
		// subscribe() calls draw straight away, then on every change.
		this.unsubscribe = this.plugin.playerScreen.subscribe(state => this.draw(state));
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		return Promise.resolve();
	}

	/** Name of the campaign session loaded in the play view, if one is open. */
	private sessionName(): string | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CAMPAIGN)[0];
		const view = leaf?.view as CampaignView | undefined;
		const name = view?.getLoadedSession()?.name?.trim();
		return name ? name : null;
	}

	private draw(state: PlayerScreenState): void {
		const root = this.contentEl;
		root.empty();
		const screen = root.createDiv({
			cls: 'storyteller-player-screen',
			attr: { 'data-sts-part': 'player-screen' },
		});
		screen.createDiv({
			cls: 'storyteller-player-screen-header',
			text: this.sessionName() ?? 'Player screen',
		});

		if (state.pinned.length === 0 && state.popups.length === 0) {
			screen.createDiv({ cls: 'storyteller-player-screen-empty', text: 'Waiting for the DM…' });
			return;
		}
		if (state.pinned.length > 0) this.drawStory(screen, state.pinned);
		if (state.popups.length > 0) this.drawPopup(screen, state.popups[0], state.popups.length);
	}

	private drawStory(parent: HTMLElement, pinned: PlayerPush[]): void {
		const strip = parent.createDiv({ cls: 'storyteller-player-screen-story' });
		strip.createDiv({ cls: 'storyteller-player-screen-section-label', text: 'Story' });
		for (const push of pinned) {
			const card = strip.createDiv({
				cls: 'storyteller-player-screen-card',
				attr: { 'data-sts-part': 'player-story-card' },
			});
			const head = card.createDiv({ cls: 'storyteller-player-screen-card-head' });
			head.createEl('h2', { cls: 'storyteller-player-screen-card-title', text: cardTitle(push) });
			const dismiss = head.createEl('button', {
				cls: 'storyteller-player-screen-dismiss',
				attr: { 'aria-label': 'Remove from story' },
			});
			setIcon(dismiss, 'x');
			dismiss.addEventListener('click', () => this.plugin.playerScreen.dismiss(push.id));
			this.renderMarkdown(card.createDiv({ cls: 'storyteller-player-screen-card-body' }), push.markdown);
		}
	}

	private drawPopup(parent: HTMLElement, popup: PlayerPush, count: number): void {
		const overlay = parent.createDiv({ cls: 'storyteller-player-screen-overlay' });
		const card = overlay.createDiv({
			cls: 'storyteller-player-screen-popup',
			attr: { role: 'dialog', 'aria-modal': 'true', 'data-sts-part': 'player-popup' },
		});
		card.createEl('h2', { cls: 'storyteller-player-screen-card-title', text: cardTitle(popup) });
		this.renderMarkdown(card.createDiv({ cls: 'storyteller-player-screen-card-body' }), popup.markdown);
		const foot = card.createDiv({ cls: 'storyteller-player-screen-popup-foot' });
		if (count > 1) {
			foot.createSpan({ cls: 'storyteller-player-screen-queue', text: `1 of ${count}` });
		}
		const close = foot.createEl('button', { cls: 'mod-cta', text: 'Close' });
		close.addEventListener('click', () => this.plugin.playerScreen.dismiss(popup.id));
	}

	private renderMarkdown(el: HTMLElement, markdown: string): void {
		void (async () => {
			await MarkdownRenderer.render(this.app, markdown, el, '', this);
		})();
	}
}
