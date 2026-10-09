/**
 * ImportPartylogModal: brings a Partylog or Lonelog log into the active story. Paste text or
 * pick a vault note, preview the planned entities and sessions, untick anything unwanted, then
 * apply. Nothing is deleted, and a failed item does not stop the others.
 */
import { App, FuzzySuggestModal, Notice, Setting, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import {
	LONELOG_NAME,
	applyImportPlan,
	buildImportPlan,
	withSessionLogBody,
} from '../campaign/PartylogImport';
import type { ImportExistingData, ImportPlan, ImportPlanItem, ImportPorts } from '../campaign/PartylogImport';
import type { CampaignSession } from '../types';
import { ResponsiveModal } from './ResponsiveModal';
import { PARTYLOG_NAME } from '../campaign/PartylogExport';

function itemLabel(item: ImportPlanItem): string {
	const noun = item.kind === 'group' ? 'faction' : item.kind;
	if (item.kind === 'session') return 'Create session';
	return `${item.action === 'create' ? 'Create' : 'Update'} ${noun}`;
}

class VaultNotePicker extends FuzzySuggestModal<TFile> {
	private onPick: (file: TFile) => void;

	constructor(app: App, onPick: (file: TFile) => void) {
		super(app);
		this.onPick = onPick;
		this.setPlaceholder('Choose a note to import');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item);
	}
}

export class ImportPartylogModal extends ResponsiveModal {
	private plugin: StorytellerSuitePlugin;
	private textArea?: HTMLTextAreaElement;
	private previewEl?: HTMLElement;
	private sourceName?: string;
	private plan?: ImportPlan;
	private selected = new Set<string>();

	constructor(app: App, plugin: StorytellerSuitePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: `Import ${PARTYLOG_NAME} or ${LONELOG_NAME} log` });
		contentEl.createEl('p', {
			text: `Paste a log, or choose a note. Lines in ${PARTYLOG_NAME} or ${LONELOG_NAME} notation are kept, and entities are proposed from tags. Preview before importing.`,
		});

		this.textArea = contentEl.createEl('textarea', { cls: 'storyteller-partylog-import-text' });
		this.textArea.rows = 12;
		this.textArea.setCssProps({ width: '100%' });
		this.textArea.placeholder = 'Paste log text here';

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Choose vault note').onClick(() => {
				new VaultNotePicker(this.app, (file) => { void this.loadNote(file); }).open();
			}))
			.addButton((button) => button.setButtonText('Preview').setCta().onClick(() => { void this.preview(); }));

		this.previewEl = contentEl.createDiv('storyteller-partylog-import-preview');
	}

	private async loadNote(file: TFile): Promise<void> {
		const content = await this.app.vault.cachedRead(file);
		if (this.textArea) this.textArea.value = content;
		this.sourceName = file.basename;
	}

	private async loadExisting(): Promise<ImportExistingData> {
		const [characters, locations, items, sessions] = await Promise.all([
			this.plugin.listCharacters().catch(() => [] as import('../types').Character[]),
			this.plugin.listLocations().catch(() => [] as import('../types').Location[]),
			this.plugin.listPlotItems().catch(() => [] as import('../types').PlotItem[]),
			this.plugin.listSessions().catch(() => [] as CampaignSession[]),
		]);
		return {
			storyId: this.plugin.getActiveStory()?.id ?? '',
			characters,
			locations,
			groups: this.plugin.getGroups(),
			items,
			sessionNames: sessions.map((session) => session.name),
		};
	}

	private async preview(): Promise<void> {
		const text = this.textArea?.value ?? '';
		if (!text.trim()) {
			new Notice('Paste a log or choose a note first.');
			return;
		}
		const existing = await this.loadExisting();
		this.plan = buildImportPlan(text, existing, { sourceName: this.sourceName });
		this.selected = new Set(this.plan.items.map((item) => item.id));
		this.renderPlan();
	}

	private renderPlan(): void {
		const container = this.previewEl;
		const plan = this.plan;
		if (!container || !plan) return;
		container.empty();
		container.createEl('h3', { text: 'Planned changes' });
		if (plan.title) container.createEl('p', { text: `Campaign: ${plan.title}` });
		for (const warning of plan.warnings) container.createEl('p', { text: warning, cls: 'mod-warning' });
		if (plan.items.length === 0) {
			container.createEl('p', { text: 'Nothing new to import.' });
			return;
		}
		for (const item of plan.items) {
			new Setting(container)
				.setName(`${itemLabel(item)}: ${item.name}`)
				.setDesc(item.detail)
				.addToggle((toggle) => toggle
					.setValue(this.selected.has(item.id))
					.onChange((value) => {
						if (value) this.selected.add(item.id);
						else this.selected.delete(item.id);
					}));
		}
		new Setting(container).addButton((button) => button
			.setButtonText('Import selected')
			.setCta()
			.onClick(() => { void this.apply(); }));
	}

	private ports(): ImportPorts {
		const plugin = this.plugin;
		return {
			saveCharacter: (character) => plugin.saveCharacter(character),
			saveLocation: (location) => plugin.saveLocation(location),
			savePlotItem: (item) => plugin.savePlotItem(item),
			createGroup: (name) => plugin.createGroup(name),
			saveGroup: (group) => plugin.saveGroupFull(group),
			saveSession: (session) => plugin.saveSession(session),
			writeSessionLog: async (session, body) => {
				const file = this.app.vault.getAbstractFileByPath(session.filePath ?? '');
				if (!(file instanceof TFile)) throw new Error('the session note was not found');
				await this.app.vault.process(file, (content: string) => withSessionLogBody(content, body));
			},
		};
	}

	private async apply(): Promise<void> {
		const plan = this.plan;
		if (!plan) return;
		const result = await applyImportPlan(plan, this.selected, this.ports());
		new Notice(`Imported: ${result.created} created, ${result.updated} updated, ${result.sessions} session(s).${result.errors.length ? ` ${result.errors.length} failed.` : ''}`);
		for (const error of result.errors) console.error(`Partylog import: ${error}`);
		if (result.errors.length === 0) {
			this.close();
			return;
		}
		const errorList = this.previewEl?.createDiv('storyteller-partylog-import-errors');
		errorList?.createEl('h4', { text: 'Some items failed' });
		for (const error of result.errors) errorList?.createEl('p', { text: error });
	}
}
