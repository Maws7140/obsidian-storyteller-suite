/*
 * Preview and apply for "Apply ripples to entities". Existing entities gain their bullets
 * (selected by default). New entities are offered unselected. Nothing is deleted.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { Notice, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { LORELOG_NAME, createLoreEntity, saveLoreEntityDescription } from '../lore/WorldLog';
import type { LoreEntityRef } from '../lore/WorldLog';
import type { LorelogSyncItem, LorelogSyncPlan } from '../lore/lorelog';
import { ResponsiveModal } from './ResponsiveModal';

const KIND_LABEL: Record<LorelogSyncItem['kind'], string> = {
	character: 'Person',
	location: 'Location',
	group: 'Faction',
	event: 'Event',
};

export class LorelogSyncModal extends ResponsiveModal {
	private plugin: StorytellerSuitePlugin;
	private plan: LorelogSyncPlan;
	private refs: LoreEntityRef[];
	private selected = new Set<string>();
	private onApplied: () => void;

	constructor(plugin: StorytellerSuitePlugin, plan: LorelogSyncPlan, refs: LoreEntityRef[], onApplied: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.plan = plan;
		this.refs = refs;
		this.onApplied = onApplied;
		for (const item of plan.updates) this.selected.add(`update:${item.id}`);
	}

	onOpen(): void {
		void super.onOpen();
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: `Apply ${LORELOG_NAME} ripples to entities` });
		const { plan } = this;
		if (plan.updates.length === 0 && plan.creates.length === 0) {
			contentEl.createEl('p', {
				text: plan.alreadyRecorded > 0
					? 'Every ripple is already recorded on its entity.'
					: 'No ripples match an entity or a new entity type in this log.',
			});
			return;
		}
		contentEl.createEl('p', {
			text: `Each ripple is added as a dated bullet under a ${LORELOG_NAME} changes heading. Nothing is removed.`,
			cls: 'setting-item-description',
		});

		if (plan.updates.length > 0) {
			contentEl.createEl('h3', { text: 'Existing entities' });
			for (const item of plan.updates) this.renderItem(item, 'update');
		}
		if (plan.creates.length > 0) {
			contentEl.createEl('h3', { text: 'New entities (not selected)' });
			for (const item of plan.creates) this.renderItem(item, 'create');
		}

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText('Apply selected')
				.setCta()
				.onClick(() => { void this.apply(); }))
			.addButton((button) => button
				.setButtonText('Cancel')
				.onClick(() => this.close()));
	}

	private renderItem(item: LorelogSyncItem, mode: 'update' | 'create'): void {
		const key = `${mode}:${item.id}`;
		const block = this.contentEl.createDiv({ cls: 'storyteller-lore-sync-item' });
		const label = block.createEl('label', { cls: 'storyteller-lore-sync-label' });
		const box = label.createEl('input', { type: 'checkbox' });
		box.checked = this.selected.has(key);
		box.addEventListener('change', () => {
			if (box.checked) this.selected.add(key);
			else this.selected.delete(key);
		});
		label.createSpan({ text: ` ${KIND_LABEL[item.kind]}: ${item.name}` });
		const list = block.createEl('ul');
		for (const change of item.changes) list.createEl('li', { text: change.bullet.replace(/^- /, '') });
	}

	private async apply(): Promise<void> {
		let written = 0;
		let failed = 0;
		for (const item of this.plan.updates) {
			if (!this.selected.has(`update:${item.id}`)) continue;
			const ref = this.refs.find((r) => r.kind === item.kind && r.name.trim().toLowerCase() === item.name.trim().toLowerCase());
			if (!ref) continue;
			try {
				await saveLoreEntityDescription(this.plugin, ref, item.nextDescription);
				written++;
			} catch {
				failed++;
			}
		}
		for (const item of this.plan.creates) {
			if (!this.selected.has(`create:${item.id}`)) continue;
			try {
				await createLoreEntity(this.plugin, item.kind, item.name, item.nextDescription);
				written++;
			} catch {
				failed++;
			}
		}
		new Notice(`Updated ${written} ${written === 1 ? 'entity' : 'entities'}.${failed > 0 ? ` ${failed} failed; see the console.` : ''}`);
		this.onApplied();
		this.close();
	}
}
