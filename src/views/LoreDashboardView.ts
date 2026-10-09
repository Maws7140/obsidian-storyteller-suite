/*
 * Lore dashboard: open questions and needs, tensions by state, recent and provisional facts,
 * retractions and elements of the active story's world log. Rows link to the line in the log;
 * element names open their entity note when one exists.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import {
	LORELOG_NAME,
	addBuildSession,
	createWorldLog,
	listLoreEntities,
	loadWorldLogState,
	WORLD_LOG_FILE_NAME,
	openWorldLogAtLine,
	toSyncEntities,
	worldLogPath,
} from '../lore/WorldLog';
import type { LoreEntityRef, WorldLogState } from '../lore/WorldLog';
import { TENSION_GROUPS, planEntitySync } from '../lore/lorelog';
import type { LorelogElementUse, LorelogFactItem, LorelogOpenItem, TensionGroup } from '../lore/lorelog';
import { LorelogCycleModal } from '../modals/LorelogCycleModal';
import { LorelogSyncModal } from '../modals/LorelogSyncModal';

export const VIEW_TYPE_LORE_DASHBOARD = 'storyteller-lore-dashboard';

const TENSION_LABEL: Record<TensionGroup, string> = {
	latent: 'Latent',
	open: 'Open',
	seasonal: 'Seasonal',
	cyclic: 'Cyclic',
	resolved: 'Resolved',
	unstated: 'No state',
};

const ELEMENT_KIND: Record<string, LoreEntityRef['kind'] | undefined> = {
	N: 'character',
	L: 'location',
	F: 'group',
	Hist: 'event',
};

export class LoreDashboardView extends ItemView {
	private plugin: StorytellerSuitePlugin;
	private state?: WorldLogState;
	private entities: LoreEntityRef[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LORE_DASHBOARD;
	}

	getDisplayText(): string {
		return `${LORELOG_NAME} dashboard`;
	}

	getIcon(): string {
		return 'scroll';
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.path === worldLogPath(this.plugin)) void this.refresh();
		}));
		await this.refresh();
	}

	/** Re-reads the world log and the story's entities, then redraws. */
	async refresh(): Promise<void> {
		try {
			this.state = await loadWorldLogState(this.plugin);
			this.entities = await listLoreEntities(this.plugin);
		} catch {
			this.state = undefined;
		}
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('storyteller-lore-dashboard');

		const story = this.plugin.getActiveStory();
		root.createEl('h2', { text: `${LORELOG_NAME} lore` });
		root.createEl('p', { text: story ? `Story: ${story.name}` : 'No active story. Select one to see its world log.', cls: 'storyteller-lore-muted' });

		const toolbar = root.createDiv({ cls: 'storyteller-lore-toolbar' });
		if (!story) return;
		if (!this.state) {
			toolbar.createEl('button', { text: 'Create world log', cls: 'mod-cta' }).addEventListener('click', () => {
				void (async () => {
					try {
						const file = await createWorldLog(this.plugin);
						await openWorldLogAtLine(this.plugin, file, 1);
						await this.refresh();
					} catch {
						new Notice(`Could not create the ${LORELOG_NAME} world log.`);
					}
				})();
			});
			root.createEl('p', { text: `The world log holds the cycles of this story. It lives in the story folder as ${WORLD_LOG_FILE_NAME}.` });
			return;
		}

		const state = this.state;
		toolbar.createEl('button', { text: 'Add cycle', cls: 'mod-cta' }).addEventListener('click', () => {
			new LorelogCycleModal(this.plugin).open();
		});
		toolbar.createEl('button', { text: 'Add build session' }).addEventListener('click', () => {
			void (async () => {
				try {
					const number = await addBuildSession(this.plugin);
					new Notice(`Added build ${number}.`);
					await this.refresh();
				} catch {
					new Notice(`Could not add a build session to the ${LORELOG_NAME} world log.`);
				}
			})();
		});
		toolbar.createEl('button', { text: 'Apply ripples to entities' }).addEventListener('click', () => this.openSync());
		toolbar.createEl('button', { text: 'Open world log' }).addEventListener('click', () => {
			void openWorldLogAtLine(this.plugin, state.file, 1);
		});
		toolbar.createEl('button', { text: 'Refresh' }).addEventListener('click', () => { void this.refresh(); });

		this.renderCounts(root, state);
		this.renderLinkList(root, 'Open questions', state.summary.openQuestions, state.file, 'No open questions.');
		this.renderLinkList(root, 'Open needs', state.summary.openNeeds, state.file, 'No open needs.');
		this.renderTensions(root, state);
		this.renderFacts(root, state);
		this.renderRetractions(root, state);
		this.renderElements(root, state);
	}

	private renderCounts(root: HTMLElement, state: WorldLogState): void {
		const c = state.summary.counts;
		const grid = root.createDiv({ cls: 'storyteller-lore-counts' });
		const stat = (label: string, value: number) => {
			const cell = grid.createDiv({ cls: 'storyteller-lore-stat' });
			cell.createDiv({ text: String(value), cls: 'storyteller-lore-stat-value' });
			cell.createDiv({ text: label, cls: 'storyteller-lore-stat-label' });
		};
		stat('Cycles', c.cycles);
		stat('Builds', c.builds);
		stat('Facts', c.facts);
		stat('Provisional', c.provisional);
		stat('Retracted', c.retracted);
		stat('Open questions', state.summary.openQuestions.length);
		stat('Open needs', state.summary.openNeeds.length);
	}

	private section(root: HTMLElement, title: string): HTMLElement {
		root.createEl('h3', { text: title });
		return root.createDiv({ cls: 'storyteller-lore-section' });
	}

	private renderLinkList(root: HTMLElement, title: string, items: LorelogOpenItem[], file: TFile, empty: string): void {
		const body = this.section(root, title);
		if (items.length === 0) {
			body.createEl('p', { text: empty, cls: 'storyteller-lore-muted' });
			return;
		}
		const list = body.createEl('ul');
		for (const item of items) {
			const li = list.createEl('li');
			this.lineLink(li, item.text, file, item.line);
			const meta = [item.unit ? `unit ${item.unit}` : undefined, item.cycleId, item.priority ? `p${item.priority}` : undefined, item.origin === 'backlog' ? 'backlog' : undefined]
				.filter(Boolean)
				.join(', ');
			if (meta) li.createSpan({ text: ` (${meta})`, cls: 'storyteller-lore-muted' });
		}
	}

	private renderTensions(root: HTMLElement, state: WorldLogState): void {
		const body = this.section(root, 'Tensions');
		const groups = TENSION_GROUPS.filter((group) => state.summary.tensions[group].length > 0);
		if (groups.length === 0) {
			body.createEl('p', { text: 'No tensions yet.', cls: 'storyteller-lore-muted' });
			return;
		}
		for (const group of groups) {
			body.createEl('h4', { text: TENSION_LABEL[group] });
			const list = body.createEl('ul');
			for (const item of state.summary.tensions[group]) {
				const li = list.createEl('li');
				this.lineLink(li, item.name, state.file, item.line);
				if (item.cycleId) li.createSpan({ text: ` (${item.cycleId})`, cls: 'storyteller-lore-muted' });
			}
		}
	}

	private renderFacts(root: HTMLElement, state: WorldLogState): void {
		const body = this.section(root, 'Recent facts');
		const recent = state.summary.facts.slice(-10).reverse();
		if (recent.length === 0) {
			body.createEl('p', { text: 'No facts yet.', cls: 'storyteller-lore-muted' });
		} else {
			const list = body.createEl('ul');
			for (const fact of recent) this.factRow(list, fact, state.file);
		}
		const provisional = state.summary.provisional;
		body.createEl('h4', { text: `Provisional (${provisional.length})` });
		if (provisional.length === 0) {
			body.createEl('p', { text: 'No provisional facts.', cls: 'storyteller-lore-muted' });
			return;
		}
		const list = body.createEl('ul');
		for (const fact of provisional) this.factRow(list, fact, state.file);
	}

	private factRow(list: HTMLElement, fact: LorelogFactItem, file: TFile): void {
		const li = list.createEl('li');
		this.lineLink(li, fact.text, file, fact.line);
		if (fact.provisional) li.createSpan({ text: ' provisional', cls: 'storyteller-lore-badge' });
	}

	private renderRetractions(root: HTMLElement, state: WorldLogState): void {
		const body = this.section(root, 'Retractions');
		if (state.summary.retractions.length === 0) {
			body.createEl('p', { text: 'Nothing retracted.', cls: 'storyteller-lore-muted' });
			return;
		}
		const list = body.createEl('ul');
		for (const item of state.summary.retractions) {
			const li = list.createEl('li');
			this.lineLink(li, item.text, state.file, item.line);
			if (item.reason) li.createSpan({ text: ` because ${item.reason}`, cls: 'storyteller-lore-muted' });
		}
	}

	private renderElements(root: HTMLElement, state: WorldLogState): void {
		const body = this.section(root, 'Elements');
		const elements = state.summary.elements.slice(0, 40);
		if (elements.length === 0) {
			body.createEl('p', { text: 'No tagged elements yet.', cls: 'storyteller-lore-muted' });
			return;
		}
		const list = body.createEl('ul');
		for (const element of elements) this.elementRow(list, element);
	}

	private elementRow(list: HTMLElement, element: LorelogElementUse): void {
		const li = list.createEl('li');
		const ref = this.entityFor(element);
		const label = `${element.name}`;
		if (ref?.filePath) {
			const link = li.createEl('a', { text: label, cls: 'storyteller-lore-entity-link' });
			link.addEventListener('click', (evt) => {
				evt.preventDefault();
				void this.app.workspace.openLinkText(ref.filePath as string, '', false);
			});
		} else {
			li.createSpan({ text: label, attr: { title: ref ? 'Entity without a note file' : 'No entity note yet' } });
		}
		li.createSpan({ text: ` ${element.type} x${element.count}`, cls: 'storyteller-lore-muted' });
		if (element.state) li.createSpan({ text: ` ${element.state}`, cls: 'storyteller-lore-badge' });
	}

	private entityFor(element: LorelogElementUse): LoreEntityRef | undefined {
		const kind = ELEMENT_KIND[element.type];
		if (!kind) return undefined;
		const name = element.name.trim().toLowerCase();
		return this.entities.find((ref) => ref.kind === kind && ref.name.trim().toLowerCase() === name);
	}

	private lineLink(parent: HTMLElement, text: string, file: TFile, line: number): void {
		const link = parent.createEl('a', { text, cls: 'storyteller-lore-line-link' });
		link.setAttr('href', '#');
		link.addEventListener('click', (evt) => {
			evt.preventDefault();
			void openWorldLogAtLine(this.plugin, file, line);
		});
	}

	private openSync(): void {
		if (!this.state) return;
		const plan = planEntitySync(this.state.log, toSyncEntities(this.entities));
		new LorelogSyncModal(this.plugin, plan, this.entities, () => { void this.refresh(); }).open();
	}
}
