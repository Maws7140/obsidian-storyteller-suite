/**
 * Import existing notes as entities.
 *
 * Wizard: source folder and target type, property mapping, placement, preview
 * and apply. The decision logic lives in utils/NoteAdoption.ts; this file only
 * reads the vault, shows the plan and applies it. A failure on one note is
 * recorded in the report and does not stop the run.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { FolderSuggestModal } from './FolderSuggestModal';
import { getFrontmatterSectionFields } from '../utils/SectionFieldPlacement';
import {
    ADOPTABLE_ENTITY_TYPES,
    ADOPTABLE_TYPE_LABELS,
    AdoptableEntityType,
    ConflictPolicy,
    FrontmatterKeyStat,
    KEEP_ACTION,
    MappingAction,
    NotePatchResult,
    PlacementDecision,
    collectFrontmatterKeys,
    computeNotePatch,
    decodeMappingAction,
    encodeMappingAction,
    findNameDuplicates,
    getMappableFields,
    planPlacement,
    suggestMappings,
    summarizeRenames,
} from '../utils/NoteAdoption';

type WizardStep = 'source' | 'mapping' | 'placement' | 'preview' | 'report';

interface PlannedNote {
    file: TFile;
    decision: PlacementDecision;
    /** Null when the note is skipped and therefore left completely untouched. */
    patch: NotePatchResult | null;
}

interface ApplyReport {
    folder: string;
    selected: number;
    moved: number;
    updated: number;
    skipped: number;
    failed: Array<{ path: string; message: string }>;
    conflicts: string[];
}

export class ImportExistingNotesModal extends Modal {
    private readonly plugin: StorytellerSuitePlugin;
    private step: WizardStep = 'source';
    private sourceFolder = '';
    private includeSubfolders = true;
    private targetType: AdoptableEntityType = 'character';
    private conflictPolicy: ConflictPolicy = 'skip';
    private mappings: Record<string, MappingAction> = {};
    private mappingsScope = '';
    private keyStats: FrontmatterKeyStat[] = [];
    private sourceNotes: TFile[] = [];
    private plan: PlannedNote[] = [];
    private planClashes: Array<{ path: string; name: string; duplicateOf: string }> = [];
    private applying = false;
    private report: ApplyReport | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.modalEl.addClass('storyteller-import-existing-modal', 'storyteller-modal-scroll');
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.createEl('h2', { text: 'Import existing notes as entities' });
        this.renderStepIndicator();
        switch (this.step) {
            case 'source': this.renderSource(); break;
            case 'mapping': this.renderMapping(); break;
            case 'placement': this.renderPlacement(); break;
            case 'preview': this.renderPreview(); break;
            case 'report': this.renderReport(); break;
        }
    }

    private renderStepIndicator(): void {
        const labels: Array<[WizardStep, string]> = [
            ['source', '1. Source'],
            ['mapping', '2. Properties'],
            ['placement', '3. Placement'],
            ['preview', '4. Preview'],
        ];
        const bar = this.contentEl.createDiv({ cls: 'setting-item-description' });
        const current = labels.findIndex(([id]) => id === this.step);
        bar.setText(labels.map(([id, label], index) => (
            index === current || (this.step === 'report' && id === 'preview') ? `[${label}]` : label
        )).join('  ›  '));
    }

    // ---- Step 1: source -------------------------------------------------

    private renderSource(): void {
        const intro = this.contentEl.createDiv();
        intro.createEl('p', {
            text: 'Choose the folder that holds your notes and the kind of entity they should become. '
                + 'Notes are read from the folder you pick, and the chosen type decides which fields you can map to.',
        });

        new Setting(this.contentEl)
            .setName('Source folder')
            .setDesc('Markdown notes in this folder are imported.')
            .addText(text => {
                text.setPlaceholder('Folder path').setValue(this.sourceFolder).onChange(value => {
                    this.sourceFolder = value.trim();
                    this.refreshSourceCount();
                });
            })
            .addButton(button => button.setButtonText('Browse').onClick(() => {
                new FolderSuggestModal(this.app, folder => {
                    this.sourceFolder = folder;
                    this.render();
                }).open();
            }));

        new Setting(this.contentEl)
            .setName('Include subfolders')
            .setDesc('Also import notes from folders nested inside the source folder.')
            .addToggle(toggle => toggle.setValue(this.includeSubfolders).onChange(value => {
                this.includeSubfolders = value;
                this.refreshSourceCount();
            }));

        new Setting(this.contentEl)
            .setName('Import as')
            .setDesc('The entity type the notes become.')
            .addDropdown(dropdown => {
                for (const type of ADOPTABLE_ENTITY_TYPES) {
                    dropdown.addOption(type, ADOPTABLE_TYPE_LABELS[type]);
                }
                dropdown.setValue(this.targetType).onChange(value => {
                    this.targetType = value as AdoptableEntityType;
                    this.render();
                });
            });

        const targetLine = this.contentEl.createDiv({ cls: 'setting-item-description' });
        const target = this.plugin.tryGetEntityFolder(this.targetType);
        if (target.error || !target.path) {
            targetLine.setText(`The plugin cannot find a folder for this type: ${target.error ?? 'unknown error'}`);
        } else {
            targetLine.setText(`Notes will be moved to: ${target.path}`);
        }

        const countLine = this.contentEl.createDiv({ cls: 'setting-item-description' });
        countLine.setAttr('data-role', 'source-count');
        this.sourceNotes = this.scanSource();
        countLine.setText(this.describeSourceCount());

        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        const next = actions.createEl('button', { text: 'Next', cls: 'mod-cta' });
        next.disabled = !this.canContinueFromSource();
        next.addEventListener('click', () => {
            this.step = 'mapping';
            this.render();
        });
    }

    private refreshSourceCount(): void {
        this.sourceNotes = this.scanSource();
        const line = this.contentEl.querySelector('[data-role="source-count"]');
        if (line) line.textContent = this.describeSourceCount();
        const next = this.contentEl.querySelector<HTMLButtonElement>('button.mod-cta');
        if (next) next.disabled = !this.canContinueFromSource();
    }

    private canContinueFromSource(): boolean {
        const target = this.plugin.tryGetEntityFolder(this.targetType);
        return this.sourceNotes.length > 0 && !target.error && !!target.path;
    }

    private describeSourceCount(): string {
        if (!this.sourceFolder) return 'Choose a source folder to see how many notes it holds.';
        const withFrontmatter = this.sourceNotes.filter(file => this.frontmatterOf(file) !== null).length;
        return `Found ${this.sourceNotes.length} markdown note(s), ${withFrontmatter} with frontmatter.`;
    }

    private scanSource(): TFile[] {
        const folder = normalizePath(this.sourceFolder).replace(/^\/+|\/+$/g, '');
        if (!folder) return [];
        const prefix = `${folder}/`;
        return this.app.vault.getMarkdownFiles().filter(file => {
            if (!file.path.startsWith(prefix)) return false;
            return this.includeSubfolders || !file.path.slice(prefix.length).includes('/');
        });
    }

    /** Frontmatter from the metadata cache, or null when the note has none. */
    private frontmatterOf(file: TFile): Record<string, unknown> | null {
        const cached = this.app.metadataCache.getFileCache(file)?.frontmatter;
        return cached ? { ...cached } : null;
    }

    // ---- Step 2: property mapping --------------------------------------

    /** Body-section fields this type stores as properties, offered as mapping targets. */
    private sectionFrontmatterFields(): string[] {
        return getFrontmatterSectionFields(this.plugin.settings.sectionFieldsInFrontmatter, this.targetType);
    }

    private ensureMappings(): void {
        const scope = `${this.sourceFolder}|${this.includeSubfolders}|${this.targetType}`;
        if (scope === this.mappingsScope) return;
        this.mappingsScope = scope;
        const notes = this.sourceNotes.map(file => ({ frontmatter: this.frontmatterOf(file) ?? {} }));
        this.keyStats = collectFrontmatterKeys(notes);
        this.mappings = suggestMappings(this.keyStats.map(stat => stat.key), this.targetType, this.sectionFrontmatterFields());
    }

    private renderMapping(): void {
        this.ensureMappings();
        const total = this.sourceNotes.length;
        const intro = this.contentEl.createDiv();
        intro.createEl('p', {
            text: `These are the property keys used by the ${total} selected note(s). For each one, choose what happens to it.`,
        });
        const legend = intro.createEl('ul');
        legend.createEl('li', { text: 'Keep as is: the value stays in the note. Single-line text shows up as a custom field in the entity editor.' });
        legend.createEl('li', { text: 'Map to a built-in field: the value moves to that field. Keys the plugin already reads are suggested automatically.' });
        legend.createEl('li', { text: 'Ignore: the key is left exactly as it is and is not mapped. Nothing is deleted.' });

        if (this.keyStats.length === 0) {
            this.contentEl.createEl('p', {
                text: 'None of these notes has frontmatter properties. They will get the entity type and a name taken from the file name.',
            });
        }

        const fields = getMappableFields(this.targetType, this.sectionFrontmatterFields());
        for (const stat of this.keyStats) {
            const setting = new Setting(this.contentEl)
                .setName(stat.key)
                .setDesc(`Used by ${stat.count} of ${total} note(s).${stat.example ? ` Example: ${stat.example}` : ''}`);
            setting.addDropdown(dropdown => {
                dropdown.addOption('keep', 'Keep as is');
                dropdown.addOption('ignore', 'Ignore');
                for (const field of fields) {
                    dropdown.addOption(`map:${field.field}`, `Map to ${field.label}`);
                }
                dropdown.setValue(encodeMappingAction(this.mappings[stat.key] ?? KEEP_ACTION));
                dropdown.onChange(choice => {
                    this.mappings[stat.key] = decodeMappingAction(choice);
                });
            });
        }

        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        actions.createEl('button', { text: 'Back' }).addEventListener('click', () => {
            this.step = 'source';
            this.render();
        });
        actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: 'Next', cls: 'mod-cta' }).addEventListener('click', () => {
            this.step = 'placement';
            this.render();
        });
    }

    // ---- Step 3: placement ---------------------------------------------

    private renderPlacement(): void {
        const folder = this.targetFolder();
        const intro = this.contentEl.createDiv();
        intro.createEl('p', {
            text: `Storyteller Suite only lists entities that sit directly in their entity folder. `
                + `Notes outside ${folder ?? 'that folder'} are invisible to the plugin, so the notes will be moved there. `
                + 'Obsidian updates links to the moved notes.',
        });

        new Setting(this.contentEl)
            .setName('When a file with the same name already exists in the folder')
            .setDesc('Choose what happens to the imported note in that case.')
            .addDropdown(dropdown => {
                dropdown.addOption('skip', 'Skip the note and leave it untouched');
                dropdown.addOption('suffix', 'Import it under a numbered name');
                dropdown.setValue(this.conflictPolicy).onChange(value => {
                    this.conflictPolicy = value as ConflictPolicy;
                });
            });

        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        actions.createEl('button', { text: 'Back' }).addEventListener('click', () => {
            this.step = 'mapping';
            this.render();
        });
        actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: 'Preview', cls: 'mod-cta' }).addEventListener('click', () => {
            this.buildPlan();
            this.step = 'preview';
            this.render();
        });
    }

    private targetFolder(): string | null {
        const target = this.plugin.tryGetEntityFolder(this.targetType);
        return target.path ? normalizePath(target.path) : null;
    }

    // ---- Step 4: preview ------------------------------------------------

    private buildPlan(): void {
        const folder = this.targetFolder();
        this.plan = [];
        this.planClashes = [];
        if (!folder) return;

        const allPaths = this.app.vault.getMarkdownFiles().map(file => file.path);
        const decisions = planPlacement(
            this.sourceNotes.map(file => ({ path: file.path, basename: file.basename, folderPath: file.parent?.path ?? '' })),
            folder,
            allPaths,
            this.conflictPolicy
        );
        const byPath = new Map(this.sourceNotes.map(file => [file.path, file]));
        const planned: PlannedNote[] = [];
        for (const decision of decisions) {
            const file = byPath.get(decision.path);
            if (!file) continue;
            const patch = decision.action === 'skip'
                ? null
                : computeNotePatch(this.frontmatterOf(file) ?? {}, file.basename, this.targetType, this.mappings);
            planned.push({ file, decision, patch });
        }
        this.plan = planned;

        const incoming = planned
            .filter(entry => entry.patch)
            .map(entry => {
                const name = entry.patch?.next['name'];
                return { path: entry.file.path, name: typeof name === 'string' ? name : entry.file.basename };
            });
        const incomingPaths = new Set(incoming.map(entry => entry.path));
        const existing = this.app.vault.getMarkdownFiles()
            .filter(file => file.parent?.path === folder && !incomingPaths.has(file.path))
            .map(file => {
                const name = this.frontmatterOf(file)?.['name'];
                return { path: file.path, name: typeof name === 'string' && name.trim() ? name : file.basename };
            });
        this.planClashes = findNameDuplicates(incoming, existing);
    }

    private renderPreview(): void {
        const folder = this.targetFolder() ?? '(unresolved folder)';
        const moves = this.plan.filter(entry => entry.decision.action === 'move').length;
        const stays = this.plan.filter(entry => entry.decision.action === 'stay').length;
        const skips = this.plan.filter(entry => entry.decision.action === 'skip');
        const patches = this.plan.map(entry => entry.patch).filter((p): p is NotePatchResult => p !== null);

        const summary = this.contentEl.createDiv();
        summary.createEl('p', {
            text: `${this.plan.length} note(s) selected for ${ADOPTABLE_TYPE_LABELS[this.targetType]} in ${folder}: `
                + `${moves} to move, ${stays} already in place, ${skips.length} skipped.`,
        });

        const renames = summarizeRenames(patches.map(p => p.renames));
        if (renames.length > 0) {
            summary.createEl('p', { text: 'Properties renamed:' });
            const list = summary.createEl('ul');
            for (const rename of renames) list.createEl('li', { text: `${rename.from} -> ${rename.to} (${rename.count} note(s))` });
        } else {
            summary.createEl('p', { text: 'No properties are renamed.' });
        }

        const stamped = patches.length;
        const retyped = patches.filter(p => p.retypedFrom).length;
        const nameFromFile = patches.filter(p => p.nameFromFilename).length;
        summary.createEl('p', {
            text: `Entity type set on ${stamped} note(s)${retyped ? `, including ${retyped} note(s) whose type stamp named a different type (overwritten)` : ''}. `
                + `${nameFromFile} note(s) get their name from the file name.`,
        });

        const conflicts = this.plan.flatMap(entry => (entry.patch?.conflicts ?? []).map(conflict => `${entry.file.name}: ${conflict.reason}`));
        if (conflicts.length > 0) {
            summary.createEl('p', { text: `${conflicts.length} conflict(s). The conflicting keys stay in place. First few:` });
            const list = summary.createEl('ul');
            for (const line of conflicts.slice(0, 5)) list.createEl('li', { text: line });
        }

        if (skips.length > 0) {
            summary.createEl('p', { text: `${skips.length} note(s) skipped because their destination already exists. First few:` });
            const list = summary.createEl('ul');
            for (const entry of skips.slice(0, 5)) list.createEl('li', { text: `${entry.file.path}: ${entry.decision.reason ?? ''}` });
        }

        if (this.planClashes.length > 0) {
            summary.createEl('p', { text: `${this.planClashes.length} name(s) are already used by another entity. Both notes are still imported. First few:` });
            const list = summary.createEl('ul');
            for (const clash of this.planClashes.slice(0, 5)) {
                list.createEl('li', { text: `"${clash.name}" (${clash.path}) matches ${clash.duplicateOf}` });
            }
        }

        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        actions.createEl('button', { text: 'Back' }).addEventListener('click', () => {
            this.step = 'placement';
            this.render();
        });
        actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
        const apply = actions.createEl('button', { text: 'Apply import', cls: 'mod-cta' });
        apply.disabled = this.applying || this.plan.every(entry => entry.decision.action === 'skip');
        apply.addEventListener('click', () => {
            void this.applyPlan();
        });
    }

    // ---- Step 5: apply and report --------------------------------------

    private async applyPlan(): Promise<void> {
        if (this.applying) return;
        this.applying = true;
        const folder = this.targetFolder() ?? '';
        const report: ApplyReport = {
            folder,
            selected: this.plan.length,
            moved: 0,
            updated: 0,
            skipped: 0,
            failed: [],
            conflicts: [],
        };
        try {
            const needsFolder = this.plan.some(entry => entry.decision.action === 'move');
            if (needsFolder && folder) await this.plugin.ensureFolder(folder);

            for (const entry of this.plan) {
                if (entry.decision.action === 'skip' || !entry.patch) {
                    report.skipped += 1;
                    continue;
                }
                const basename = entry.file.basename;
                const holder: { result?: NotePatchResult } = {};
                try {
                    await this.app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
                        // Recompute against the live block so a note edited since the preview is not clobbered.
                        const result = computeNotePatch(frontmatter, basename, this.targetType, this.mappings);
                        holder.result = result;
                        for (const key of Object.keys(frontmatter)) delete frontmatter[key];
                        Object.assign(frontmatter, result.next);
                    });
                    report.updated += 1;
                } catch (error) {
                    report.failed.push({ path: entry.file.path, message: `Could not update properties: ${errorMessage(error)}` });
                    continue;
                }
                for (const conflict of holder.result?.conflicts ?? []) {
                    report.conflicts.push(`${entry.file.name}: ${conflict.reason}`);
                }
                if (entry.decision.action === 'move') {
                    try {
                        await this.app.fileManager.renameFile(entry.file, entry.decision.destPath);
                        report.moved += 1;
                    } catch (error) {
                        report.failed.push({ path: entry.file.path, message: `Properties were updated but the move failed: ${errorMessage(error)}` });
                    }
                }
            }
        } finally {
            this.applying = false;
            this.plugin.refreshEntitiesAfterBulkChange();
        }

        this.report = report;
        const failedNote = report.failed.length > 0 ? `, ${report.failed.length} failed` : '';
        new Notice(`Storyteller Suite: imported ${report.moved} note(s) into ${folder}, updated ${report.updated}${failedNote}.`);
        this.step = 'report';
        this.render();
    }

    private renderReport(): void {
        const report = this.report;
        if (!report) return;
        this.contentEl.createEl('p', {
            text: `Imported into ${report.folder}: ${report.moved} moved, ${report.updated} updated, `
                + `${report.skipped} skipped, ${report.failed.length} failed.`,
        });
        if (report.failed.length > 0) {
            this.contentEl.createEl('p', { text: 'Failed notes (the rest of the run completed):' });
            const list = this.contentEl.createEl('ul');
            for (const failure of report.failed.slice(0, 20)) list.createEl('li', { text: `${failure.path}: ${failure.message}` });
        }
        if (report.conflicts.length > 0) {
            this.contentEl.createEl('p', { text: `${report.conflicts.length} conflict(s) were left in place. First few:` });
            const list = this.contentEl.createEl('ul');
            for (const line of report.conflicts.slice(0, 10)) list.createEl('li', { text: line });
        }
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        actions.createEl('button', { text: 'Close', cls: 'mod-cta' }).addEventListener('click', () => this.close());
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
