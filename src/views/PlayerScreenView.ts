/*
 * Player screen: the table's view of the game, for a TV or a second monitor.
 *
 * It draws only what the DM view publishes on the player screen bus, which is already cut down
 * to what players may see (revealed places, opened votes, shared clocks). The board shows the
 * map under fog with holes at the places the party has seen, the party token where the party is,
 * and, while a vote is open, each choice as a numbered path; a choice into unseen country ends
 * in the fog with a question mark. Pushed text shows as popups and a pinned Story strip.
 * Everything is drawn inside this view's own container, so it also works in a pop-out window.
 */
import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { VIEW_TYPE_PLAYER_SCREEN } from '../campaign/PlayerPush';
import type { PlayerPush, PlayerScreenState, PlayerView } from '../campaign/PlayerPush';

export { VIEW_TYPE_PLAYER_SCREEN };

/** Radius of the clear area around each seen place, in percent of the board width. */
const FOG_CLEAR_RADIUS = 9;
const SVG_NS = 'http://www.w3.org/2000/svg';

function cardTitle(push: PlayerPush): string {
	return push.target ? `For ${push.target}: ${push.heading}` : push.heading;
}

/** Party initials for the token, as on the DM's board. */
function initials(names: string[]): string[] {
	return names.slice(0, 4).map(name => name.trim().charAt(0).toUpperCase() || '?');
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

	private draw(state: PlayerScreenState): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('storyteller-player-screen-host');
		const { view, controls } = state;
		const screen = root.createDiv({
			cls: `storyteller-player-screen is-${controls.mode}`,
			attr: { 'data-sts-part': 'player-screen' },
		});

		if (controls.mode === 'blank') {
			// A blank screen still shows pushed popups: the DM can put a handout on black.
		} else if (!view) {
			screen.createDiv({ cls: 'storyteller-player-screen-empty', text: 'Waiting for the DM…' });
		} else {
			this.drawHeader(screen, view, controls.voteOpen && Boolean(view.choices?.length));
			const main = screen.createDiv('storyteller-player-screen-main');
			const stage = main.createDiv('storyteller-player-screen-stage');
			if (controls.mode === 'board' && view.board) {
				this.drawBoard(stage, view);
			} else {
				stage.createDiv({ cls: 'storyteller-player-screen-scene-title', text: view.sceneName ?? view.sessionName });
			}
			if (state.pinned.length > 0) this.drawStory(stage, state.pinned);
			this.drawSide(main.createDiv('storyteller-player-screen-side'), view);
		}

		if (state.popups.length > 0) this.drawPopup(screen, state.popups[0], state.popups.length);
	}

	private drawHeader(screen: HTMLElement, view: PlayerView, voting: boolean): void {
		const header = screen.createDiv('storyteller-player-screen-header');
		header.createSpan({ cls: 'storyteller-player-screen-header-scene', text: view.sceneName ?? view.sessionName });
		if (view.date) header.createSpan({ cls: 'storyteller-player-screen-header-date', text: view.date });
		if (voting) header.createSpan({ cls: 'storyteller-player-screen-badge', text: 'Vote' });
	}

	private drawBoard(stage: HTMLElement, view: PlayerView): void {
		const board = view.board!;
		const frame = stage.createDiv({ cls: 'storyteller-player-screen-board', attr: { 'data-sts-part': 'player-board' } });
		const canvas = frame.createDiv('storyteller-player-screen-board-canvas');
		canvas.setCssStyles({ aspectRatio: `${board.width} / ${board.height}` });
		const img = canvas.createEl('img', { cls: 'storyteller-player-screen-board-image', attr: { src: board.imageUrl, alt: board.name } });
		img.draggable = false;

		// Fog: a dark layer with a clear circle at every seen place.
		const fog = canvas.createDiv('storyteller-player-screen-fog');
		const ratio = board.width / Math.max(board.height, 1);
		const holes = board.places.map(place =>
			`radial-gradient(ellipse ${FOG_CLEAR_RADIUS}% ${FOG_CLEAR_RADIUS * ratio}% at ${place.x}% ${place.y}%, transparent 60%, #000 100%)`
		);
		if (holes.length > 0) {
			fog.setCssProps({ '--sts-fog-mask': holes.join(', ') });
			fog.addClass('has-holes');
		}

		const here = board.places.find(place => place.current);
		const choices = view.choices ?? [];
		if (here && choices.length > 0) {
			const svg = canvas.ownerDocument.createElementNS(SVG_NS, 'svg');
			svg.setAttribute('class', 'storyteller-player-screen-paths');
			svg.setAttribute('viewBox', '0 0 100 100');
			svg.setAttribute('preserveAspectRatio', 'none');
			canvas.appendChild(svg);
			for (const choice of choices) {
				const target = choice.toKey ? board.places.find(place => place.key === choice.toKey) : undefined;
				const end = target ?? choice.intoFog;
				if (!end) continue;
				const line = canvas.ownerDocument.createElementNS(SVG_NS, 'line');
				line.setAttribute('x1', String(here.x));
				line.setAttribute('y1', String(here.y));
				line.setAttribute('x2', String(end.x));
				line.setAttribute('y2', String(end.y));
				line.setAttribute('class', 'storyteller-player-screen-path' + (target ? '' : ' is-into-fog'));
				svg.appendChild(line);
				const badge = canvas.createDiv({ cls: 'storyteller-player-screen-choice', text: String(choice.number) });
				badge.setCssStyles({ left: `${here.x + (end.x - here.x) * 0.6}%`, top: `${here.y + (end.y - here.y) * 0.6}%` });
				if (!target) {
					const unknown = canvas.createDiv({ cls: 'storyteller-player-screen-unknown', text: '?' });
					unknown.setCssStyles({ left: `${end.x}%`, top: `${end.y}%` });
				}
			}
		}

		for (const place of board.places) {
			const pin = canvas.createDiv('storyteller-player-screen-place' + (place.current ? ' is-current' : ''));
			pin.setCssStyles({ left: `${place.x}%`, top: `${place.y}%` });
			pin.createSpan({ cls: 'storyteller-player-screen-place-dot' });
			pin.createSpan({ cls: 'storyteller-player-screen-place-label', text: place.name });
			if (place.current) {
				const token = pin.createDiv('storyteller-player-screen-party');
				for (const letter of initials(view.party.map(member => member.name))) token.createSpan({ text: letter });
			}
		}
	}

	private drawSide(side: HTMLElement, view: PlayerView): void {
		if (view.roll) {
			const card = side.createDiv({ cls: 'storyteller-player-screen-roll', attr: { 'data-sts-part': 'player-roll' } });
			card.createDiv({ cls: 'storyteller-player-screen-roll-title', text: view.roll.title });
			const row = card.createDiv('storyteller-player-screen-roll-row');
			row.createSpan({ cls: 'storyteller-player-screen-roll-total', text: String(view.roll.total) });
			row.createSpan({ cls: 'storyteller-player-screen-roll-result', text: view.roll.result });
		}

		if (view.choices && view.choices.length > 0) {
			const vote = side.createDiv({ cls: 'storyteller-player-screen-block storyteller-player-screen-vote', attr: { 'data-sts-part': 'player-vote' } });
			vote.createDiv({ cls: 'storyteller-player-screen-section-label', text: 'Vote' });
			for (const choice of view.choices) {
				const row = vote.createDiv('storyteller-player-screen-vote-row');
				row.createSpan({ cls: 'storyteller-player-screen-choice is-inline', text: String(choice.number) });
				row.createSpan({ text: choice.label });
			}
		}

		if (view.party.length > 0) {
			const party = side.createDiv({ cls: 'storyteller-player-screen-block', attr: { 'data-sts-part': 'player-party' } });
			party.createDiv({ cls: 'storyteller-player-screen-section-label', text: 'Party' });
			for (const member of view.party) {
				const row = party.createDiv('storyteller-player-screen-member');
				const top = row.createDiv('storyteller-player-screen-member-top');
				top.createSpan({ cls: 'storyteller-player-screen-member-name', text: member.name });
				if (member.hp !== undefined && member.maxHp) {
					top.createSpan({ cls: 'storyteller-player-screen-member-hp', text: `${member.hp}/${member.maxHp}` });
					const bar = row.createDiv('storyteller-player-screen-hp');
					const fill = bar.createDiv('storyteller-player-screen-hp-fill');
					const share = Math.max(0, Math.min(1, member.hp / member.maxHp));
					fill.setCssStyles({ width: `${share * 100}%` });
					if (share <= 0.25) fill.addClass('is-low');
				}
				if (member.conditions.length > 0) {
					const conditions = row.createDiv('storyteller-player-screen-conditions');
					for (const condition of member.conditions) conditions.createSpan({ text: condition });
				}
			}
		}

		if (view.clocks.length > 0) {
			const clocks = side.createDiv({ cls: 'storyteller-player-screen-block', attr: { 'data-sts-part': 'player-clocks' } });
			clocks.createDiv({ cls: 'storyteller-player-screen-section-label', text: 'Clocks' });
			for (const clock of view.clocks) {
				const row = clocks.createDiv('storyteller-player-screen-clock');
				row.createSpan({ cls: 'storyteller-player-screen-clock-name', text: clock.name });
				const segments = row.createDiv('storyteller-player-screen-clock-segments');
				for (let i = 0; i < clock.segments; i++) segments.createSpan({ cls: i < clock.filled ? 'is-filled' : '' });
			}
		}
	}

	private drawStory(parent: HTMLElement, pinned: PlayerPush[]): void {
		const strip = parent.createDiv({ cls: 'storyteller-player-screen-story', attr: { 'data-sts-part': 'player-story' } });
		for (const push of pinned) {
			const card = strip.createDiv({
				cls: 'storyteller-player-screen-card',
				attr: { 'data-sts-part': 'player-story-card' },
			});
			const head = card.createDiv({ cls: 'storyteller-player-screen-card-head' });
			head.createEl('h2', { cls: 'storyteller-player-screen-card-title', text: cardTitle(push) });
			const dismiss = head.createEl('button', {
				cls: 'clickable-icon storyteller-player-screen-dismiss',
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
