/*
 * Lorelog quick capture: one cycle (trigger, facts, frictions, ripples, follow-up questions),
 * appended to the end of the current build session in the active story's world log.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { ButtonComponent, Notice, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { LORELOG_NAME, appendCycleToWorldLog, listLoreEntities } from '../lore/WorldLog';
import type { LoreEntityRef } from '../lore/WorldLog';
import { emptyLorelogCycle, parseLorelogLine } from '../lore/lorelog';
import type { LorelogCycle, LorelogSyncKind } from '../lore/lorelog';
import { ResponsiveModal } from './ResponsiveModal';

/** Ripple element types offered in the picker, with the entity kind each one autocompletes from. */
export const RIPPLE_TYPES: Array<{ type: string; label: string; entityKind?: LorelogSyncKind }> = [
	{ type: 'F', label: 'Faction (F)', entityKind: 'group' },
	{ type: 'N', label: 'Person (N)', entityKind: 'character' },
	{ type: 'L', label: 'Location (L)', entityKind: 'location' },
	{ type: 'Rule', label: 'Rule' },
	{ type: 'Tension', label: 'Tension' },
	{ type: 'Hist', label: 'History (Hist)', entityKind: 'event' },
	{ type: 'Term', label: 'Term' },
	{ type: 'Q', label: 'Question (Q)' },
	{ type: 'Need', label: 'Need' },
];

/** A ripple tag from a type, a name, and optional fields such as `+wardens` or `open`. */
export function rippleLine(type: string, name: string, fields: string): string | undefined {
	const cleanName = name.replace(/[[\]|]/g, '').trim();
	if (cleanName.length === 0) return undefined;
	const cleanFields = fields.replace(/[[\]]/g, '').trim();
	const body = cleanFields.length > 0 ? `${cleanName}|${cleanFields}` : cleanName;
	return `>> [${type}:${body}]`;
}

export interface CycleFormInput {
	triggerKind: 'question' | 'need';
	triggerText: string;
	unit: string;
	section: string;
	title: string;
	method: string;
	factLines: string[];
	provisional: boolean;
	frictionLines: string[];
	ripples: Array<{ type: string; name: string; fields: string }>;
	freeRippleLines: string[];
	followUpLines: string[];
}

function lines(text: string): string[] {
	return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * Builds the cycle the form describes. Every line goes through the Lorelog line parser, so the
 * written notation reads back exactly as it was entered. Returns undefined when the form is empty.
 */
export function cycleFromForm(input: CycleFormInput, id: string): LorelogCycle | undefined {
	const cycle = emptyLorelogCycle({
		id,
		title: input.title.trim() || undefined,
		section: input.section.trim().replace(/^§/, '') || undefined,
	});
	const trigger = input.triggerText.trim();
	if (trigger.length > 0) {
		const unit = input.unit.trim();
		const text = input.triggerKind === 'need' && unit ? `! ${unit} needs ${trigger}` : `${input.triggerKind === 'need' ? '!' : '?'} ${trigger}`;
		const parsed = parseLorelogLine(text);
		if (parsed.kind === 'trigger') cycle.triggers.push({ ...parsed.trigger, section: input.section.trim().replace(/^§/, '') || undefined, line: 0 });
	}
	if (input.method.trim()) cycle.vias.push(input.method.trim());

	for (const factLine of input.factLines) {
		const parsed = parseLorelogLine(`${input.provisional ? '=?' : '='} ${factLine}`);
		if (parsed.kind === 'fact') cycle.facts.push({ ...parsed.fact, retracted: false, line: 0 });
	}
	for (const frictionLine of input.frictionLines) {
		const parsed = parseLorelogLine(`~ ${frictionLine}`);
		if (parsed.kind === 'friction') cycle.frictions.push({ ...parsed.friction, line: 0 });
	}

	const rippleSources: string[] = [];
	for (const row of input.ripples) {
		const source = rippleLine(row.type, row.name, row.fields);
		if (source) rippleSources.push(source);
	}
	for (const free of input.freeRippleLines) rippleSources.push(`>> ${free}`);
	for (const source of rippleSources) {
		const parsed = parseLorelogLine(source);
		if (parsed.kind === 'ripple') cycle.ripples.push({ ...parsed.ripple, line: 0 });
	}

	for (const followUp of input.followUpLines) {
		const parsed = parseLorelogLine(followUp.startsWith('!') ? followUp : `? ${followUp.replace(/^\?\s*/, '')}`);
		if (parsed.kind === 'trigger') cycle.followUps.push({ ...parsed.trigger, line: 0 });
	}

	// A follow-up only reads as part of this cycle after a ripple, so a bare ripple stands in.
	if (cycle.followUps.length > 0 && cycle.ripples.length === 0) {
		cycle.ripples.push({ text: '', tags: [], line: 0 });
	}

	const empty = !cycle.triggers.length && !cycle.facts.length && !cycle.frictions.length && !cycle.ripples.length && !cycle.followUps.length;
	return empty ? undefined : cycle;
}

export class LorelogCycleModal extends ResponsiveModal {
	private plugin: StorytellerSuitePlugin;
	private entities: LoreEntityRef[] = [];
	private form: CycleFormInput = {
		triggerKind: 'question',
		triggerText: '',
		unit: '',
		section: '',
		title: '',
		method: '',
		factLines: [],
		provisional: false,
		frictionLines: [],
		ripples: [],
		freeRippleLines: [],
		followUpLines: [],
	};
	private rippleList?: HTMLElement;
	private datalistEl?: HTMLDataListElement;
	/** True while a cycle is being written, so a second click cannot write the same cycle again. */
	private saving = false;
	private addButton?: ButtonComponent;

	constructor(plugin: StorytellerSuitePlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		void super.onOpen();
		void this.load();
	}

	private async load(): Promise<void> {
		this.entities = await listLoreEntities(this.plugin).catch(() => [] as LoreEntityRef[]);
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: `${LORELOG_NAME}: add cycle` });
		contentEl.createEl('p', {
			text: 'Writes one cycle to the end of the current build session in the world log.',
			cls: 'setting-item-description',
		});

		new Setting(contentEl)
			.setName('Trigger')
			.setDesc('A question comes from curiosity. A need comes from a story unit.')
			.addDropdown((dropdown) => {
				dropdown.addOption('question', '? Question');
				dropdown.addOption('need', '! Need');
				dropdown.setValue(this.form.triggerKind).onChange((value) => {
					this.form.triggerKind = value === 'need' ? 'need' : 'question';
				});
			});

		new Setting(contentEl)
			.setName('Story unit')
			.setDesc('For a need only. Examples: chapter 3, scene 14.')
			.addText((text) => text.setPlaceholder('Ch3').setValue(this.form.unit).onChange((v) => { this.form.unit = v; }));

		new Setting(contentEl)
			.setName('Question or need')
			.addText((text) => text
				.setPlaceholder('Who guards the gates?')
				.setValue(this.form.triggerText)
				.onChange((v) => { this.form.triggerText = v; }));

		new Setting(contentEl)
			.setName('Section')
			.setDesc('Part of your setting notes this touches, e.g. Politics.')
			.addText((text) => text.setValue(this.form.section).onChange((v) => { this.form.section = v; }));

		new Setting(contentEl)
			.setName('Cycle title')
			.addText((text) => text.setValue(this.form.title).onChange((v) => { this.form.title = v; }));

		new Setting(contentEl)
			.setName('Method')
			.setDesc('How the answer was reached. Examples: decide, or a random table roll.')
			.addText((text) => text.setValue(this.form.method).onChange((v) => { this.form.method = v; }));

		new Setting(contentEl)
			.setName('Facts')
			.setDesc('One fact per line.')
			.addTextArea((area) => {
				area.inputEl.rows = 3;
				area.setValue(this.form.factLines.join('\n')).onChange((v) => { this.form.factLines = lines(v); });
			});

		new Setting(contentEl)
			.setName('Provisional')
			.setDesc('Mark the facts as working assumptions (=?).')
			.addToggle((toggle) => toggle.setValue(this.form.provisional).onChange((v) => { this.form.provisional = v; }));

		new Setting(contentEl)
			.setName('Frictions')
			.setDesc('The tension each fact creates, one per line.')
			.addTextArea((area) => {
				area.inputEl.rows = 2;
				area.setValue(this.form.frictionLines.join('\n')).onChange((v) => { this.form.frictionLines = lines(v); });
			});

		contentEl.createEl('h3', { text: 'Ripples' });
		contentEl.createEl('p', { text: 'Tags that the facts change. Names suggest entities from this story.', cls: 'setting-item-description' });
		this.datalistEl = contentEl.createEl('datalist');
		this.datalistEl.id = 'storyteller-lore-entity-names';
		this.rippleList = contentEl.createDiv({ cls: 'storyteller-lore-ripples' });
		this.renderRippleRows();
		new Setting(contentEl).addButton((button) => button
			.setButtonText('Add ripple')
			.onClick(() => {
				this.form.ripples.push({ type: 'F', name: '', fields: '' });
				this.renderRippleRows();
			}));

		new Setting(contentEl)
			.setName('Other ripples')
			.setDesc('One per line. Start a line with the section sign and a name to point at a section, or write a tag.')
			.addTextArea((area) => {
				area.inputEl.rows = 2;
				area.setValue(this.form.freeRippleLines.join('\n')).onChange((v) => { this.form.freeRippleLines = lines(v); });
			});

		new Setting(contentEl)
			.setName('Follow-up questions')
			.setDesc('New questions the ripples raise, one per line. Start a line with an exclamation mark for a need.')
			.addTextArea((area) => {
				area.inputEl.rows = 3;
				area.setValue(this.form.followUpLines.join('\n')).onChange((v) => { this.form.followUpLines = lines(v); });
			});

		new Setting(contentEl).addButton((button) => {
			this.addButton = button;
			button
				.setButtonText('Add cycle')
				.setCta()
				.setDisabled(this.saving)
				.onClick(() => { void this.save(); });
		});
	}

	private entityNamesFor(type: string): string[] {
		const kind = RIPPLE_TYPES.find((entry) => entry.type === type)?.entityKind;
		if (!kind) return [];
		return this.entities.filter((ref) => ref.kind === kind).map((ref) => ref.name);
	}

	private renderRippleRows(): void {
		if (!this.rippleList) return;
		this.rippleList.empty();
		if (this.datalistEl) {
			this.datalistEl.empty();
		}
		this.form.ripples.forEach((row, index) => {
			const rowEl = this.rippleList!.createDiv({ cls: 'storyteller-lore-ripple-row' });
			const select = rowEl.createEl('select');
			for (const entry of RIPPLE_TYPES) {
				const option = select.createEl('option', { text: entry.label, value: entry.type });
				if (entry.type === row.type) option.selected = true;
			}
			select.addEventListener('change', () => {
				row.type = select.value;
				this.renderRippleRows();
			});
			const name = rowEl.createEl('input', { type: 'text', placeholder: 'Name' });
			name.value = row.name;
			name.setAttribute('list', 'storyteller-lore-entity-names');
			name.addEventListener('input', () => { row.name = name.value; });
			const fields = rowEl.createEl('input', { type: 'text', placeholder: '+tag or open' });
			fields.value = row.fields;
			fields.addEventListener('input', () => { row.fields = fields.value; });
			const remove = rowEl.createEl('button', { text: 'Remove' });
			remove.addEventListener('click', () => {
				this.form.ripples.splice(index, 1);
				this.renderRippleRows();
			});
		});
		if (this.datalistEl) {
			const names = new Set(this.form.ripples.flatMap((row) => this.entityNamesFor(row.type)));
			for (const name of names) this.datalistEl.createEl('option', { value: name });
		}
	}

	private async save(): Promise<void> {
		const form = this.form;
		if (this.saving) return;
		if (!cycleFromForm(form, 'C0')) {
			new Notice('Add a question, a fact, a friction or a ripple first.');
			return;
		}
		this.saving = true;
		this.addButton?.setDisabled(true);
		try {
			const id = await appendCycleToWorldLog(this.plugin, (cycleId) => cycleFromForm(form, cycleId) ?? emptyLorelogCycle({ id: cycleId }));
			new Notice(`Added ${id} to the world log.`);
			this.close();
		} catch {
			new Notice(`Could not write to the ${LORELOG_NAME} world log.`);
			this.saving = false;
			this.addButton?.setDisabled(false);
		}
	}
}
