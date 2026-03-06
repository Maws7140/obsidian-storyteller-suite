import { App, Modal, ButtonComponent, Notice, TFile } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { CharacterSheetGenerator, SheetData } from '../utils/CharacterSheetGenerator';
import { BUILT_IN_SHEET_TEMPLATES } from '../utils/CharacterSheetTemplates';

export class CharacterSheetPreviewModal extends Modal {
    private generator: CharacterSheetGenerator;
    private sheetData: SheetData | null = null;
    private selectedTemplateId: string;
    private previewEl: HTMLDivElement | null = null;

    constructor(
        app: App,
        private plugin: StorytellerSuitePlugin,
        private character: Character
    ) {
        super(app);
        this.generator = new CharacterSheetGenerator(app, plugin);
        this.selectedTemplateId = plugin.settings.defaultCharacterSheetTemplateId ?? 'classic';
    }

    async onOpen() {
        this.modalEl.addClass('sts-character-sheet-modal');
        this.titleEl.setText(`${this.character.name} — Character Sheet`);

        // ── Action bar ────────────────────────────────────────────────────────
        const bar = this.contentEl.createDiv('sts-sheet-action-bar');

        // Template picker
        const pickerWrap = bar.createDiv('sts-sheet-template-picker');
        pickerWrap.createEl('label', { text: 'Template:', cls: 'sts-sheet-tpl-label' });

        const select = pickerWrap.createEl('select', { cls: 'dropdown' });

        const builtInGroup = select.createEl('optgroup', { attr: { label: 'Built-in' } });
        for (const tpl of BUILT_IN_SHEET_TEMPLATES) {
            const opt = builtInGroup.createEl('option', { text: tpl.name, value: tpl.id });
            if (tpl.id === this.selectedTemplateId) opt.selected = true;
        }

        const customTemplates = this.plugin.settings.characterSheetTemplates ?? [];
        if (customTemplates.length > 0) {
            const customGroup = select.createEl('optgroup', { attr: { label: 'Custom' } });
            for (const tpl of customTemplates) {
                const opt = customGroup.createEl('option', { text: tpl.name, value: tpl.id });
                if (tpl.id === this.selectedTemplateId) opt.selected = true;
            }
        }

        const exportBtn = new ButtonComponent(bar)
            .setIcon('download')
            .setButtonText('Export HTML')
            .setCta();
        exportBtn.onClick(() => this.exportHTML());

        const noteBtn = new ButtonComponent(bar)
            .setIcon('file-text')
            .setButtonText('Save to Note');
        noteBtn.onClick(() => this.saveToNote());

        // ── Loading state ─────────────────────────────────────────────────────
        const loading = this.contentEl.createDiv('sts-sheet-loading');
        loading.setText('Building character sheet…');

        try {
            this.sheetData = await this.generator.collectData(this.character);
        } catch (err) {
            loading.setText('Failed to load character data.');
            console.error('[CharacterSheetPreviewModal]', err);
            return;
        }

        loading.remove();

        // ── Preview ───────────────────────────────────────────────────────────
        this.previewEl = this.contentEl.createDiv('sts-sheet-preview');
        this.renderPreview();

        // Wire template switching after data is ready
        select.addEventListener('change', () => {
            this.selectedTemplateId = select.value;
            this.renderPreview();
        });
    }

    private renderPreview() {
        if (!this.previewEl || !this.sheetData) return;
        this.previewEl.innerHTML = this.generator.buildInnerHTML(this.sheetData, this.selectedTemplateId);
    }

    private async exportHTML() {
        if (!this.sheetData) return;
        try {
            const filePath = await this.generator.saveSheetHTML(this.character, this.selectedTemplateId);
            new Notice(`HTML exported to ${filePath}`);
        } catch (err) {
            new Notice(`Export failed: ${err}`);
        }
    }

    private async saveToNote() {
        try {
            const filePath = await this.generator.saveSheetToNote(this.character, this.selectedTemplateId);
            new Notice(`Saved to ${filePath}`);
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            }
            this.close();
        } catch (err) {
            new Notice(`Save failed: ${err}`);
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
