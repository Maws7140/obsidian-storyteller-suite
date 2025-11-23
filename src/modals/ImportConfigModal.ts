/**
 * Import Configuration Modal
 * Multi-step wizard for configuring story and chapter imports
 */

import { App, Modal, Notice, Setting, TextComponent, DropdownComponent, ButtonComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { ImportManager } from '../import/ImportManager';
import { ImportConfiguration, ParsedDocument, ChapterImportConfig, ConflictResolution } from '../import/ImportTypes';

/**
 * Import wizard step
 */
type ImportStep = 'upload' | 'review' | 'configure' | 'confirm';

/**
 * Import Configuration Modal
 */
export class ImportConfigModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private importManager: ImportManager;
    private currentStep: ImportStep = 'upload';
    private parsedDocument: ParsedDocument | null = null;
    private configuration: ImportConfiguration | null = null;
    private fileName: string = '';

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.importManager = new ImportManager(plugin);
        this.modalEl.addClass('storyteller-import-modal');
    }

    onOpen(): void {
        this.renderStep();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /**
     * Render current step
     */
    private renderStep(): void {
        this.contentEl.empty();

        switch (this.currentStep) {
            case 'upload':
                this.renderUploadStep();
                break;
            case 'review':
                this.renderReviewStep();
                break;
            case 'configure':
                this.renderConfigureStep();
                break;
            case 'confirm':
                this.renderConfirmStep();
                break;
        }
    }

    /**
     * Step 1: Upload file
     */
    private renderUploadStep(): void {
        this.titleEl.setText('Import Story - Upload File');

        const desc = this.contentEl.createEl('p', {
            text: 'Upload a text or markdown file containing your story chapters.'
        });
        desc.addClass('storyteller-import-description');

        // File input
        const fileInputContainer = this.contentEl.createDiv('storyteller-file-input-container');

        const fileInput = fileInputContainer.createEl('input', {
            type: 'file',
            attr: {
                accept: '.txt,.md,.markdown'
            }
        });
        fileInput.addClass('storyteller-file-input');

        const uploadButton = fileInputContainer.createEl('button', {
            text: 'Choose File'
        });
        uploadButton.addClass('mod-cta');

        const fileNameDisplay = fileInputContainer.createEl('div', {
            text: 'No file selected'
        });
        fileNameDisplay.addClass('storyteller-file-name');

        uploadButton.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];

            if (!file) return;

            this.fileName = file.name;
            fileNameDisplay.setText(`Selected: ${this.fileName}`);

            // Read file
            const content = await file.text();

            // Parse document
            new Notice('Parsing document...');
            this.parsedDocument = this.importManager.parseDocument(content, this.fileName);

            if (this.parsedDocument) {
                new Notice(`Found ${this.parsedDocument.chapters.length} chapters`);
                this.currentStep = 'review';
                this.renderStep();
            }
        });

        // Instructions
        const instructions = this.contentEl.createEl('div');
        instructions.addClass('storyteller-import-instructions');
        instructions.createEl('h3', { text: 'Supported Formats:' });
        const ul = instructions.createEl('ul');
        ul.createEl('li', { text: 'Plain text (.txt) with chapter markers like "Chapter 1"' });
        ul.createEl('li', { text: 'Markdown (.md) with heading hierarchy (# Chapter 1)' });

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close())
            );
    }

    /**
     * Step 2: Review detected chapters
     */
    private renderReviewStep(): void {
        if (!this.parsedDocument) return;

        this.titleEl.setText('Import Story - Review Chapters');

        // Metadata
        const metadata = this.contentEl.createDiv('storyteller-import-metadata');
        metadata.createEl('p', {
            text: `Detected ${this.parsedDocument.chapters.length} chapters using "${this.parsedDocument.metadata.detectionMethod}"`
        });
        metadata.createEl('p', {
            text: `Total words: ${this.parsedDocument.metadata.totalWords.toLocaleString()}`
        });
        metadata.createEl('p', {
            text: `Confidence: ${this.parsedDocument.metadata.confidence}%`
        });

        // Warnings
        if (this.parsedDocument.warnings.length > 0) {
            const warningsDiv = this.contentEl.createDiv('storyteller-import-warnings');
            warningsDiv.createEl('h3', { text: '⚠️ Warnings:' });
            const warningsList = warningsDiv.createEl('ul');
            for (const warning of this.parsedDocument.warnings) {
                warningsList.createEl('li', { text: warning });
            }
        }

        // Chapter list
        const chaptersDiv = this.contentEl.createDiv('storyteller-import-chapters');
        chaptersDiv.createEl('h3', { text: 'Chapters:' });

        const chapterList = chaptersDiv.createDiv('storyteller-chapter-list');
        chapterList.style.maxHeight = '300px';
        chapterList.style.overflowY = 'auto';
        chapterList.style.border = '1px solid var(--background-modifier-border)';
        chapterList.style.padding = '10px';
        chapterList.style.marginBottom = '10px';

        for (const chapter of this.parsedDocument.chapters) {
            const chapterItem = chapterList.createDiv('storyteller-chapter-item');
            chapterItem.style.marginBottom = '10px';
            chapterItem.style.padding = '8px';
            chapterItem.style.border = '1px solid var(--background-modifier-border)';
            chapterItem.style.borderRadius = '4px';

            const titleLine = chapterItem.createDiv();
            titleLine.createEl('strong', { text: `Chapter ${chapter.number || '?'}: ${chapter.title}` });

            const infoLine = chapterItem.createDiv();
            infoLine.style.fontSize = '0.9em';
            infoLine.style.color = 'var(--text-muted)';
            infoLine.setText(`${chapter.wordCount.toLocaleString()} words`);
        }

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('← Back')
                .onClick(() => {
                    this.currentStep = 'upload';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Next →')
                .setCta()
                .onClick(() => {
                    // Create default configuration
                    this.configuration = this.importManager.createDefaultConfiguration(
                        this.parsedDocument!,
                        this.fileName
                    );
                    this.currentStep = 'configure';
                    this.renderStep();
                })
            );
    }

    /**
     * Step 3: Configure import options
     */
    private renderConfigureStep(): void {
        if (!this.configuration) return;

        this.titleEl.setText('Import Story - Configure Options');

        // Story name
        new Setting(this.contentEl)
            .setName('Story Name')
            .setDesc('Name for the new story')
            .addText(text => text
                .setValue(this.configuration!.targetStoryName || '')
                .onChange(value => {
                    this.configuration!.targetStoryName = value;
                })
            );

        // Draft version (for naming)
        new Setting(this.contentEl)
            .setName('Draft Version')
            .setDesc('Optional version label (e.g., "Rough Draft", "Revised")')
            .addText(text => text
                .setPlaceholder('e.g., Rough Draft')
                .setValue(this.configuration!.draftVersion || '')
                .onChange(value => {
                    this.configuration!.draftVersion = value;
                    // Update story name if draft version is set
                    if (value.trim()) {
                        const baseName = this.fileName.replace(/\.(txt|md)$/i, '');
                        this.configuration!.targetStoryName = `${baseName} - ${value}`;
                    }
                })
            );

        // Conflict resolution
        new Setting(this.contentEl)
            .setName('Conflict Resolution')
            .setDesc('How to handle chapters with duplicate names')
            .addDropdown(dropdown => dropdown
                .addOption('rename', 'Rename (add number suffix)')
                .addOption('skip', 'Skip conflicting chapters')
                .addOption('overwrite', 'Overwrite existing chapters')
                .setValue(this.configuration!.conflictResolution)
                .onChange(value => {
                    this.configuration!.conflictResolution = value as ConflictResolution;
                })
            );

        // Chapter tags
        new Setting(this.contentEl)
            .setName('Tags')
            .setDesc('Tags to apply to all imported chapters (comma-separated)')
            .addText(text => text
                .setPlaceholder('e.g., imported, draft')
                .onChange(value => {
                    const tags = value.split(',').map(t => t.trim()).filter(Boolean);
                    // Apply to all chapters
                    for (const chapter of this.configuration!.chapters) {
                        chapter.tags = tags;
                    }
                })
            );

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('← Back')
                .onClick(() => {
                    this.currentStep = 'review';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Next →')
                .setCta()
                .onClick(() => {
                    this.currentStep = 'confirm';
                    this.renderStep();
                })
            );
    }

    /**
     * Step 4: Confirm and execute
     */
    private renderConfirmStep(): void {
        if (!this.configuration) return;

        this.titleEl.setText('Import Story - Confirm');

        // Summary
        const summary = this.contentEl.createDiv('storyteller-import-summary');
        summary.createEl('h3', { text: 'Import Summary:' });

        const summaryList = summary.createEl('ul');
        summaryList.createEl('li', { text: `Story: ${this.configuration.targetStoryName}` });
        if (this.configuration.draftVersion) {
            summaryList.createEl('li', { text: `Draft: ${this.configuration.draftVersion}` });
        }
        summaryList.createEl('li', { text: `Chapters: ${this.configuration.chapters.length}` });
        summaryList.createEl('li', { text: `Total Words: ${this.configuration.parsedDocument.metadata.totalWords.toLocaleString()}` });
        summaryList.createEl('li', { text: `Conflict Resolution: ${this.configuration.conflictResolution}` });

        // Validation
        const validation = this.importManager.validateImport(this.configuration);

        if (!validation.isValid) {
            const errorsDiv = this.contentEl.createDiv('storyteller-import-errors');
            errorsDiv.style.color = 'var(--text-error)';
            errorsDiv.createEl('h3', { text: '❌ Errors:' });
            const errorsList = errorsDiv.createEl('ul');
            for (const error of validation.errors) {
                errorsList.createEl('li', { text: error });
            }
        }

        if (validation.warnings.length > 0) {
            const warningsDiv = this.contentEl.createDiv('storyteller-import-warnings');
            warningsDiv.createEl('h3', { text: '⚠️ Warnings:' });
            const warningsList = warningsDiv.createEl('ul');
            for (const warning of validation.warnings) {
                warningsList.createEl('li', { text: warning });
            }
        }

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('← Back')
                .onClick(() => {
                    this.currentStep = 'configure';
                    this.renderStep();
                })
            )
            .addButton(btn => {
                const button = btn
                    .setButtonText('Import')
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        button.setButtonText('Importing...');

                        const result = await this.importManager.executeImport(this.configuration!);

                        if (result.success) {
                            new Notice(`Successfully imported ${result.stats.totalChapters} chapters!`);
                            this.close();
                        } else {
                            new Notice(`Import failed: ${result.error}`);
                            button.setDisabled(false);
                            button.setButtonText('Import');
                        }
                    });

                if (!validation.isValid) {
                    button.setDisabled(true);
                }

                return button;
            });
    }
}
