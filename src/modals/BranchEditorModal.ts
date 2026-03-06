/**
 * BranchEditorModal — two-tab GUI for editing branch choices and encounter tables
 * embedded in a scene file's ## Choices and ## Encounter Table sections.
 *
 * Changes are written atomically via vault.process() on save.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath, setIcon } from 'obsidian';
import { SceneBranch, EncounterTable, EncounterTableRow, Scene, Character, Event } from '../types';
import {
    serializeBranches, serializeEncounterTable,
    extractBranchesFromMarkdown, extractEncounterTableFromMarkdown
} from '../utils/BranchParser';
import StorytellerSuitePlugin from '../main';

const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
const STAT_TYPES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export class BranchEditorModal extends Modal {
    private filePath: string;
    private plugin: StorytellerSuitePlugin;
    private onSaved: () => void;

    private branches: SceneBranch[] = [];
    private encounterTable: EncounterTable | null = null;

    private activeTab: 'choices' | 'encounter' = 'choices';
    private sceneOptions: Scene[] = [];
    private characterOptions: Character[] = [];
    private eventOptions: Event[] = [];
    private readonly normalizeName = (value: string): string => value.trim().toLowerCase();

    constructor(app: App, plugin: StorytellerSuitePlugin, filePath: string, onSaved: () => void) {
        super(app);
        this.filePath = filePath;
        this.plugin = plugin;
        this.onSaved = onSaved;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        this.modalEl.addClass('storyteller-branch-editor-modal');
        contentEl.empty();

        // Load current data from the file
        const file = this.app.vault.getAbstractFileByPath(normalizePath(this.filePath));
        if (file instanceof TFile) {
            const content = await this.app.vault.cachedRead(file);
            this.branches = extractBranchesFromMarkdown(content);
            this.encounterTable = extractEncounterTableFromMarkdown(content);
        }

        const [scenes, characters, events] = await Promise.allSettled([
            this.plugin.listScenes(),
            this.plugin.listCharacters(),
            this.plugin.listEvents(),
        ]);
        this.sceneOptions = scenes.status === 'fulfilled' ? scenes.value : [];
        this.characterOptions = characters.status === 'fulfilled' ? characters.value : [];
        this.eventOptions = events.status === 'fulfilled' ? events.value : [];

        // Title
        contentEl.createEl('h2', { text: 'Branch & Encounter Editor' });

        // Tab bar
        const tabBar = contentEl.createDiv('storyteller-tab-bar');
        const choicesTab = tabBar.createEl('button', { cls: 'storyteller-tab-btn', text: 'Choices' });
        const encounterTab = tabBar.createEl('button', { cls: 'storyteller-tab-btn', text: 'Encounter Table' });

        const tabBody = contentEl.createDiv('storyteller-tab-body');

        const renderActiveTab = () => {
            tabBody.empty();
            choicesTab.toggleClass('is-active', this.activeTab === 'choices');
            encounterTab.toggleClass('is-active', this.activeTab === 'encounter');
            if (this.activeTab === 'choices') {
                this.renderChoicesTab(tabBody);
            } else {
                this.renderEncounterTab(tabBody);
            }
        };

        choicesTab.addEventListener('click', () => { this.activeTab = 'choices'; renderActiveTab(); });
        encounterTab.addEventListener('click', () => { this.activeTab = 'encounter'; renderActiveTab(); });

        renderActiveTab();

        // Save / Cancel
        const footer = contentEl.createDiv('storyteller-modal-footer');
        const cancelBtn = footer.createEl('button', { cls: 'storyteller-modal-btn', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', { cls: 'storyteller-modal-btn mod-cta', text: 'Save' });
        saveBtn.addEventListener('click', () => this.save());
    }

    // ─── Choices Tab ──────────────────────────────────────────────────────────

    private renderChoicesTab(container: HTMLElement): void {
        if (this.branches.length === 0) {
            container.createEl('p', { cls: 'storyteller-modal-list-empty', text: 'No choices yet. Click "Add Choice" to begin.' });
        }

        const listEl = container.createDiv('storyteller-branch-editor-list');
        this.renderBranchList(listEl);

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Add Choice')
                .setIcon('plus')
                .onClick(() => {
                    this.branches.push({ id: `branch-${Date.now()}`, label: 'New choice' });
                    listEl.empty();
                    this.renderBranchList(listEl);
                })
            );
    }

    private renderBranchList(container: HTMLElement): void {
        container.empty();
        this.branches.forEach((branch, i) => {
            const card = container.createDiv('storyteller-branch-editor-card');

            // Reorder buttons
            const reorder = card.createDiv('storyteller-branch-reorder');
            const upBtn = reorder.createEl('button', { attr: { 'aria-label': 'Move up' } });
            setIcon(upBtn, 'arrow-up');
            upBtn.disabled = i === 0;
            upBtn.addEventListener('click', () => {
                if (i > 0) {
                    [this.branches[i - 1], this.branches[i]] = [this.branches[i], this.branches[i - 1]];
                    this.renderBranchList(container);
                }
            });
            const downBtn = reorder.createEl('button', { attr: { 'aria-label': 'Move down' } });
            setIcon(downBtn, 'arrow-down');
            downBtn.disabled = i === this.branches.length - 1;
            downBtn.addEventListener('click', () => {
                if (i < this.branches.length - 1) {
                    [this.branches[i], this.branches[i + 1]] = [this.branches[i + 1], this.branches[i]];
                    this.renderBranchList(container);
                }
            });

            const fields = card.createDiv('storyteller-branch-editor-fields');

            // Label
            new Setting(fields)
                .setName('Label')
                .addText(t => t.setValue(branch.label).onChange(v => { branch.label = v; }));

            // Target scene
            new Setting(fields)
                .setName('Target scene')
                .addText(t => t.setValue(branch.target ?? '').setPlaceholder('Scene name').onChange(v => { branch.target = v || undefined; }));
            new Setting(fields)
                .setName('Target scene (linked)')
                .setDesc('Uses scene ID to stay valid after renames.')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const scene of this.sceneOptions) {
                        if (!scene.id) continue;
                        dd.addOption(scene.id, scene.name);
                    }
                    const selectedByName = branch.target
                        ? this.sceneOptions.find(scene => this.normalizeName(scene.name) === this.normalizeName(branch.target!))?.id
                        : '';
                    dd.setValue(branch.targetSceneId ?? selectedByName ?? '');
                    dd.onChange(value => {
                        branch.targetSceneId = value || undefined;
                        const scene = this.sceneOptions.find(item => item.id === value);
                        if (scene) branch.target = scene.name;
                    });
                });

            // Dice condition (collapsible toggle)
            const diceToggle = fields.createEl('details', { cls: 'storyteller-branch-dice-details' });
            const diceSummary = diceToggle.createEl('summary', { text: 'Dice condition' });
            if (branch.dice) diceToggle.setAttribute('open', '');

            const diceRow = diceToggle.createDiv('storyteller-branch-dice-row');

            new Setting(diceRow)
                .setName('Dice')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const d of DICE_TYPES) dd.addOption(d, d);
                    dd.setValue(branch.dice ?? '');
                    dd.onChange(v => { branch.dice = (v || undefined) as SceneBranch['dice']; });
                });

            new Setting(diceRow)
                .setName('Stat')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const s of STAT_TYPES) dd.addOption(s, s.toUpperCase());
                    dd.setValue(branch.stat ?? '');
                    dd.onChange(v => { branch.stat = (v || undefined) as SceneBranch['stat']; });
                });

            new Setting(diceRow)
                .setName('Threshold (≥)')
                .addText(t => t
                    .setValue(branch.threshold != null ? String(branch.threshold) : '')
                    .setPlaceholder('e.g. 14')
                    .onChange(v => {
                        const n = parseInt(v);
                        branch.threshold = isNaN(n) ? undefined : n;
                    })
                );

            new Setting(diceRow)
                .setName('On fail')
                .addText(t => t.setValue(branch.fail ?? '').setPlaceholder('Scene name (or blank)').onChange(v => { branch.fail = v || undefined; }));
            new Setting(diceRow)
                .setName('Fail scene (linked)')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const scene of this.sceneOptions) {
                        if (!scene.id) continue;
                        dd.addOption(scene.id, scene.name);
                    }
                    const selectedByName = branch.fail
                        ? this.sceneOptions.find(scene => this.normalizeName(scene.name) === this.normalizeName(branch.fail!))?.id
                        : '';
                    dd.setValue(branch.failSceneId ?? selectedByName ?? '');
                    dd.onChange(value => {
                        branch.failSceneId = value || undefined;
                        const scene = this.sceneOptions.find(item => item.id === value);
                        if (scene) branch.fail = scene.name;
                    });
                });

            new Setting(diceRow)
                .setName('Fail mode')
                .addDropdown(dd => {
                    dd.addOption('loop', 'Loop (try again)');
                    dd.addOption('scene', 'Go to fail scene');
                    dd.addOption('continue', 'Narrate and continue');
                    dd.setValue(branch.failMode ?? 'loop');
                    dd.onChange(v => { branch.failMode = v as SceneBranch['failMode']; });
                });

            // Item gate
            new Setting(fields)
                .setName('Requires item')
                .addText(t => t.setValue(branch.requiresItem ?? '').setPlaceholder('Item name').onChange(v => { branch.requiresItem = v || undefined; }));

            new Setting(fields)
                .setName('Requires character')
                .addText(t => t.setValue(branch.requiresCharacter ?? '').setPlaceholder('Character name').onChange(v => { branch.requiresCharacter = v || undefined; }));
            new Setting(fields)
                .setName('Requires character (linked)')
                .setDesc('Uses character ID to survive renames.')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const character of this.characterOptions) {
                        if (!character.id) continue;
                        dd.addOption(character.id, character.name);
                    }
                    const selectedByName = branch.requiresCharacter
                        ? this.characterOptions.find(character => this.normalizeName(character.name) === this.normalizeName(branch.requiresCharacter!))?.id
                        : '';
                    dd.setValue(branch.requiresCharacterId ?? selectedByName ?? '');
                    dd.onChange(value => {
                        branch.requiresCharacterId = value || undefined;
                        const character = this.characterOptions.find(item => item.id === value);
                        if (character) branch.requiresCharacter = character.name;
                    });
                });

            new Setting(fields)
                .setName('Requires flag')
                .addText(t => t.setValue(branch.requiresFlag ?? '').setPlaceholder('Flag').onChange(v => { branch.requiresFlag = v || undefined; }));

            new Setting(fields)
                .setName('Requires stat min')
                .setDesc('Only used when Stat is set.')
                .addText(t => t
                    .setValue(branch.requiresStatMin != null ? String(branch.requiresStatMin) : '')
                    .setPlaceholder('e.g. 12')
                    .onChange(v => {
                        const n = parseInt(v);
                        branch.requiresStatMin = isNaN(n) ? undefined : n;
                    })
                );

            // Outcomes
            const outcomeToggle = fields.createEl('details', { cls: 'storyteller-branch-dice-details' });
            outcomeToggle.createEl('summary', { text: 'Outcomes' });
            if (branch.grantsItem || branch.removesItem || branch.grantsCharacter || branch.removesCharacter || branch.setsFlag || branch.triggersEvent) {
                outcomeToggle.setAttribute('open', '');
            }

            const outcomeFields = outcomeToggle.createDiv('storyteller-branch-dice-row');
            new Setting(outcomeFields)
                .setName('Grants item')
                .addText(t => t.setValue(branch.grantsItem ?? '').setPlaceholder('Item name').onChange(v => { branch.grantsItem = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Removes item')
                .addText(t => t.setValue(branch.removesItem ?? '').setPlaceholder('Item name').onChange(v => { branch.removesItem = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Grants character')
                .addText(t => t.setValue(branch.grantsCharacter ?? '').setPlaceholder('Character name').onChange(v => { branch.grantsCharacter = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Removes character')
                .addText(t => t.setValue(branch.removesCharacter ?? '').setPlaceholder('Character name').onChange(v => { branch.removesCharacter = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Sets flag')
                .addText(t => t.setValue(branch.setsFlag ?? '').setPlaceholder('Flag').onChange(v => { branch.setsFlag = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Triggers event')
                .addText(t => t.setValue(branch.triggersEvent ?? '').setPlaceholder('Event name').onChange(v => { branch.triggersEvent = v || undefined; }));
            new Setting(outcomeFields)
                .setName('Triggers event (linked)')
                .setDesc('Uses Event ID to survive renames.')
                .addDropdown(dd => {
                    dd.addOption('', 'None');
                    for (const event of this.eventOptions) {
                        if (!event.id) continue;
                        dd.addOption(event.id, event.name);
                    }
                    const selectedByName = branch.triggersEvent
                        ? this.eventOptions.find(event => this.normalizeName(event.name) === this.normalizeName(branch.triggersEvent!))?.id
                        : '';
                    dd.setValue(branch.triggersEventId ?? selectedByName ?? '');
                    dd.onChange(value => {
                        branch.triggersEventId = value || undefined;
                        const event = this.eventOptions.find(item => item.id === value);
                        if (event) branch.triggersEvent = event.name;
                    });
                });

            new Setting(fields)
                .setName('Hidden')
                .setDesc('Hide this branch from players in Campaign play mode.')
                .addToggle(toggle => {
                    toggle.setValue(Boolean(branch.hidden));
                    toggle.onChange(value => { branch.hidden = value || undefined; });
                });

            // Delete button
            const delBtn = card.createEl('button', { cls: 'storyteller-branch-editor-delete', attr: { 'aria-label': 'Delete' } });
            setIcon(delBtn, 'trash');
            delBtn.addEventListener('click', () => {
                this.branches.splice(i, 1);
                this.renderBranchList(container);
            });
        });
    }

    // ─── Encounter Table Tab ──────────────────────────────────────────────────

    private renderEncounterTab(container: HTMLElement): void {
        if (!this.encounterTable) {
            this.encounterTable = { dice: 'd6', trigger: 'manual', rows: [] };
        }
        const table = this.encounterTable;

        new Setting(container)
            .setName('Dice type')
            .addDropdown(dd => {
                for (const d of DICE_TYPES) dd.addOption(d, d);
                dd.setValue(table.dice);
                dd.onChange(v => { table.dice = v as EncounterTable['dice']; });
            });

        new Setting(container)
            .setName('Trigger')
            .addDropdown(dd => {
                dd.addOption('manual', 'Manual (DM rolls)');
                dd.addOption('on-enter', 'On Enter (auto-roll)');
                dd.setValue(table.trigger);
                dd.onChange(v => { table.trigger = v as EncounterTable['trigger']; });
            });

        container.createEl('h3', { text: 'Roll Table Rows' });
        const rowsEl = container.createDiv('storyteller-encounter-rows');
        const renderRows = () => {
            rowsEl.empty();
            table.rows.forEach((row, i) => {
                const r = rowsEl.createDiv('storyteller-encounter-row-editor');

                new Setting(r)
                    .setName(`Row ${i + 1}`)
                    .addText(t => t.setValue(String(row.min)).setPlaceholder('Min').onChange(v => { row.min = parseInt(v) || 1; }))
                    .addText(t => t.setValue(String(row.max)).setPlaceholder('Max').onChange(v => { row.max = parseInt(v) || 1; }))
                    .addText(t => t.setValue(row.label).setPlaceholder('Event description').onChange(v => { row.label = v; }))
                    .addText(t => t.setValue(row.target).setPlaceholder('Target scene or "continue"').onChange(v => { row.target = v; }))
                    .addButton(btn => btn.setIcon('trash').setClass('mod-warning').onClick(() => {
                        table.rows.splice(i, 1);
                        renderRows();
                    }));
            });
        };
        renderRows();

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Add Row')
                .setIcon('plus')
                .onClick(() => {
                    const last = table.rows[table.rows.length - 1];
                    const newMin = last ? last.max + 1 : 1;
                    table.rows.push({ min: newMin, max: newMin, label: '', target: 'continue' });
                    renderRows();
                })
            );

        // Remove entire encounter table button
        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Remove Encounter Table')
                .setClass('mod-warning')
                .onClick(() => {
                    this.encounterTable = null;
                    container.empty();
                    this.renderEncounterTab(container);
                })
            );
    }

    // ─── Save ─────────────────────────────────────────────────────────────────

    private async save(): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(this.filePath));
        if (!(file instanceof TFile)) {
            new Notice('Could not find scene file to save branches.');
            return;
        }

        const issues = this.validateBranches();
        if (issues.length) {
            console.warn('[BranchEditorModal] Validation warnings', issues);
            new Notice(`Branch validation: ${issues.length} warning(s). Check console for details.`);
        }

        const branchBlock = this.branches.length > 0
            ? '```branch\n' + serializeBranches(this.branches) + '\n```'
            : null;

        const encounterBlock = this.encounterTable && this.encounterTable.rows.length > 0
            ? '```encounter\n' + serializeEncounterTable(this.encounterTable) + '\n```'
            : null;

        await (this.app.vault as any).process(file, (content: string) => {
            let updated = content;

            // Update ## Choices section
            updated = this.upsertSection(updated, 'Choices', branchBlock);
            // Update ## Encounter Table section
            updated = this.upsertSection(updated, 'Encounter Table', encounterBlock);

            return updated;
        });

        this.onSaved();
        new Notice('Branches saved.');
        this.close();
    }

    private validateBranches(): string[] {
        const issues: string[] = [];

        const sceneIds = new Set(this.sceneOptions.map(scene => scene.id).filter(Boolean));
        const sceneNames = new Set(this.sceneOptions.map(scene => this.normalizeName(scene.name)));
        const characterIds = new Set(this.characterOptions.map(character => character.id).filter(Boolean));
        const characterNames = new Set(this.characterOptions.map(character => this.normalizeName(character.name)));
        const eventIds = new Set(this.eventOptions.map(event => event.id).filter(Boolean));
        const eventNames = new Set(this.eventOptions.map(event => this.normalizeName(event.name)));
        const hasSceneCatalog = this.sceneOptions.length > 0;
        const hasCharacterCatalog = this.characterOptions.length > 0;
        const hasEventCatalog = this.eventOptions.length > 0;

        this.branches.forEach((branch, index) => {
            const row = `Choice ${index + 1}`;

            if (!branch.label?.trim()) {
                issues.push(`${row}: label is empty.`);
            }

            if (hasSceneCatalog && branch.targetSceneId && !sceneIds.has(branch.targetSceneId)) {
                issues.push(`${row}: target scene ID not found (${branch.targetSceneId}).`);
            } else if (hasSceneCatalog && branch.target && !sceneNames.has(this.normalizeName(branch.target))) {
                issues.push(`${row}: target scene name not found (${branch.target}).`);
            }

            if (hasSceneCatalog && branch.failSceneId && !sceneIds.has(branch.failSceneId)) {
                issues.push(`${row}: fail scene ID not found (${branch.failSceneId}).`);
            } else if (hasSceneCatalog && branch.fail && !sceneNames.has(this.normalizeName(branch.fail))) {
                issues.push(`${row}: fail scene name not found (${branch.fail}).`);
            }

            if (hasCharacterCatalog && branch.requiresCharacterId && !characterIds.has(branch.requiresCharacterId)) {
                issues.push(`${row}: required character ID not found (${branch.requiresCharacterId}).`);
            } else if (hasCharacterCatalog && branch.requiresCharacter && !characterNames.has(this.normalizeName(branch.requiresCharacter))) {
                issues.push(`${row}: required character name not found (${branch.requiresCharacter}).`);
            }

            if (hasEventCatalog && branch.triggersEventId && !eventIds.has(branch.triggersEventId)) {
                issues.push(`${row}: triggered event ID not found (${branch.triggersEventId}).`);
            } else if (hasEventCatalog && branch.triggersEvent && !eventNames.has(this.normalizeName(branch.triggersEvent))) {
                issues.push(`${row}: triggered event name not found (${branch.triggersEvent}).`);
            }
        });

        return issues;
    }

    /**
     * Upsert a markdown section (## heading) in the content.
     * If newContent is null/empty, removes the section.
     * If section doesn't exist and newContent is provided, appends it.
     */
    private upsertSection(content: string, sectionName: string, newContent: string | null): string {
        const headingPattern = new RegExp(`(^## ${sectionName}\\s*$)([\\s\\S]*?)(?=^## |$)`, 'm');
        const match = content.match(headingPattern);

        if (match) {
            if (!newContent) {
                // Remove section entirely
                return content.replace(headingPattern, '');
            }
            // Replace section body
            return content.replace(headingPattern, `## ${sectionName}\n${newContent}\n\n`);
        } else if (newContent) {
            // Append new section
            return content.trimEnd() + `\n\n## ${sectionName}\n${newContent}\n`;
        }
        return content;
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
