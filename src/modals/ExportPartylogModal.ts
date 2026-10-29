/**
 * ExportPartylogModal: writes the active story's campaign sessions as a Partylog log.
 * Scope is the whole story or one session. Output goes to StorytellerSuite/Exports/.
 */
import { App, Notice, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { PARTYLOG_NAME, buildPartylogExport, uniqueExportPath } from '../campaign/PartylogExport';
import type { PartylogExportSession } from '../campaign/PartylogExport';
import type { FormatStyle } from '../campaign/partylog';
import type { CampaignSession, Character } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

export const PARTYLOG_EXPORT_FOLDER = 'StorytellerSuite/Exports';

const WHOLE_STORY = 'whole-story';

/** Sessions in play order: by number, then by date, then by name. */
export function orderSessionsForExport(sessions: CampaignSession[]): CampaignSession[] {
	return sessions.slice().sort((a, b) => {
		const numberA = a.sessionNumber ?? Number.MAX_SAFE_INTEGER;
		const numberB = b.sessionNumber ?? Number.MAX_SAFE_INTEGER;
		if (numberA !== numberB) return numberA - numberB;
		const dateA = a.date ?? '';
		const dateB = b.date ?? '';
		if (dateA !== dateB) return dateA < dateB ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

export class ExportPartylogModal extends ResponsiveModal {
	private plugin: StorytellerSuitePlugin;
	private sessions: CampaignSession[] = [];
	private chosenScope = WHOLE_STORY;
	private style: FormatStyle = 'digital';

	constructor(app: App, plugin: StorytellerSuitePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		void super.onOpen();
		void this.load();
	}

	private async load(): Promise<void> {
		this.sessions = await this.plugin.listSessions().catch(() => [] as CampaignSession[]);
		this.render();
	}

	private sessionKey(session: CampaignSession): string {
		return session.filePath ?? session.name;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: `Export campaign as ${PARTYLOG_NAME}` });
		if (this.sessions.length === 0) {
			contentEl.createEl('p', { text: 'The active story has no campaign sessions yet.' });
			return;
		}

		new Setting(contentEl)
			.setName('Scope')
			.setDesc('Whole story writes every session in play order.')
			.addDropdown((dropdown) => {
				dropdown.addOption(WHOLE_STORY, 'Whole story');
				for (const session of orderSessionsForExport(this.sessions)) {
					dropdown.addOption(this.sessionKey(session), session.name);
				}
				dropdown.setValue(this.chosenScope).onChange((value) => { this.chosenScope = value; });
			});

		new Setting(contentEl)
			.setName('Style')
			.setDesc('Digital uses Markdown headings and fenced blocks. Analog uses notebook-style lines.')
			.addDropdown((dropdown) => {
				dropdown.addOption('digital', 'Digital (Markdown)');
				dropdown.addOption('analog', 'Analog (notebook)');
				dropdown.setValue(this.style).onChange((value) => { this.style = value === 'analog' ? 'analog' : 'digital'; });
			});

		new Setting(contentEl).addButton((button) => button
			.setButtonText('Export')
			.setCta()
			.onClick(() => { void this.runExport(); }));
	}

	private async runExport(): Promise<void> {
		const ordered = orderSessionsForExport(this.sessions);
		const chosen = this.chosenScope === WHOLE_STORY ? ordered : ordered.filter((session) => this.sessionKey(session) === this.chosenScope);
		if (chosen.length === 0) {
			new Notice('Choose a session to export.');
			return;
		}
		const storyName = this.plugin.getActiveStory()?.name ?? 'Campaign';
		try {
			const entries: PartylogExportSession[] = [];
			for (const session of chosen) {
				const logBody = session.filePath ? await this.plugin.loadSessionLog(session.filePath).catch(() => '') : '';
				entries.push({ session, logBody });
			}
			const characters = await this.plugin.listCharacters().catch((): Character[] => []);
			const context = {
				groups: this.plugin.getGroups().map((group) => ({ id: group.id, name: group.name })),
				characters: characters.filter((character) => !!character.id).map((character) => ({ id: character.id as string, name: character.name })),
			};
			const result = buildPartylogExport({ title: storyName, sessions: entries, style: this.style, context });
			const base = this.chosenScope === WHOLE_STORY ? `Partylog ${storyName}` : `Partylog ${storyName} ${chosen[0].name}`;
			await this.plugin.ensureFolder(PARTYLOG_EXPORT_FOLDER);
			const path = uniqueExportPath(PARTYLOG_EXPORT_FOLDER, base, (candidate) => this.app.vault.getAbstractFileByPath(candidate) !== null);
			await this.app.vault.create(path, result.markdown);
			new Notice(`Partylog export written to ${path}`);
			if (result.warnings.length > 0) new Notice(`Export finished with ${result.warnings.length} warning(s). Check the console for details.`);
			for (const warning of result.warnings) console.warn(warning);
			this.close();
		} catch (error) {
			console.error('Partylog export failed', error);
			new Notice('Partylog export failed. See the console for details.');
		}
	}
}
