import { App, Modal, Setting, Notice } from 'obsidian';
import { TagTimelineGenerator, TagTimelineOptions, GeneratedEventPreview } from '../utils/TagTimelineGenerator';
import { Event } from '../types';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';

/**
 * Modal for generating timeline events from tags
 */
export class TagTimelineModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private generator: TagTimelineGenerator;
    private selectedTags: string[] = [];
    private previews: GeneratedEventPreview[] = [];
    private previewListEl: HTMLElement | null = null;
    private options: TagTimelineOptions = {
        tags: [],
        dateStrategy: 'auto',
        dateFrontmatterField: 'date',
        includeContent: true,
        maxContentLength: 500,
        defaultStatus: 'Generated'
    };

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.generator = new TagTimelineGenerator(app);
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-tag-timeline-generator');

        // Title
        contentEl.createEl('h2', { text: 'Generate Timeline from Tags' });

        // Description
        contentEl.createDiv({
            text: 'Automatically create timeline events from notes with specific tags. Events will be extracted based on your chosen date strategy.',
            cls: 'storyteller-tag-timeline-desc'
        });

        // Options section
        await this.renderOptions(contentEl);

        // Generate button
        new Setting(contentEl)
            .setName('Generate Preview')
            .setDesc('Scan notes and preview events that will be created')
            .addButton(btn => btn
                .setButtonText('Generate')
                .setCta()
                .onClick(() => this.generatePreview())
            );

        // Preview section
        const previewSection = contentEl.createDiv({ cls: 'storyteller-tag-timeline-preview-section' });
        previewSection.createEl('h3', { text: 'Preview' });

        this.previewListEl = previewSection.createDiv({ cls: 'storyteller-tag-timeline-preview-list' });
        this.renderPreviewList();

        // Action buttons
        const buttonContainer = new Setting(contentEl);
        buttonContainer.addButton(btn => btn
            .setButtonText('Create Events')
            .setCta()
            .setDisabled(this.previews.length === 0)
            .onClick(() => this.createEvents())
        );
        buttonContainer.addButton(btn => btn
            .setButtonText(t('cancel') || 'Cancel')
            .onClick(() => this.close())
        );

        // Add CSS
        this.addStyles();
    }

    private async renderOptions(containerEl: HTMLElement): Promise<void> {
        const optionsEl = containerEl.createDiv({ cls: 'storyteller-tag-timeline-options' });
        optionsEl.createEl('h3', { text: 'Options' });

        // Tag selection
        const allTags = await this.generator.getAllTags();
        const tagStats = await this.generator.getTagStatistics();

        new Setting(optionsEl)
            .setName('Tags to Include')
            .setDesc('Select tags to filter notes (leave empty for all tags)')
            .addText(text => {
                text
                    .setPlaceholder('Enter tags (comma-separated)')
                    .onChange(value => {
                        this.selectedTags = value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                        this.options.tags = this.selectedTags;
                    });
            });

        // Show available tags
        if (allTags.length > 0) {
            const tagListEl = optionsEl.createDiv({ cls: 'storyteller-tag-list' });
            tagListEl.createEl('small', { text: 'Available tags:' });
            const tagListContainer = tagListEl.createDiv({ cls: 'storyteller-tag-chips' });

            allTags.slice(0, 20).forEach(tag => {
                const count = tagStats.get(tag) || 0;
                const chip = tagListContainer.createSpan({
                    text: `${tag} (${count})`,
                    cls: 'storyteller-tag-chip'
                });
                chip.addEventListener('click', () => {
                    if (!this.selectedTags.includes(tag)) {
                        this.selectedTags.push(tag);
                        this.options.tags = this.selectedTags;
                        chip.addClass('storyteller-tag-chip-selected');
                    }
                });
            });

            if (allTags.length > 20) {
                tagListEl.createEl('small', { text: `... and ${allTags.length - 20} more` });
            }
        }

        // Date extraction strategy
        new Setting(optionsEl)
            .setName('Date Extraction Strategy')
            .setDesc('How to extract dates from notes')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('auto', 'Auto (try all methods)')
                    .addOption('frontmatter', 'From Frontmatter')
                    .addOption('content', 'From Content')
                    .addOption('file-created', 'File Creation Date')
                    .addOption('file-modified', 'File Modification Date')
                    .setValue(this.options.dateStrategy)
                    .onChange(value => {
                        this.options.dateStrategy = value as any;
                    });
            });

        // Frontmatter field
        new Setting(optionsEl)
            .setName('Frontmatter Date Field')
            .setDesc('Field name to extract date from (when using frontmatter strategy)')
            .addText(text => {
                text
                    .setValue(this.options.dateFrontmatterField || 'date')
                    .setPlaceholder('date')
                    .onChange(value => {
                        this.options.dateFrontmatterField = value;
                    });
            });

        // Include content
        new Setting(optionsEl)
            .setName('Include Note Content')
            .setDesc('Add note content as event description')
            .addToggle(toggle => {
                toggle
                    .setValue(this.options.includeContent || false)
                    .onChange(value => {
                        this.options.includeContent = value;
                    });
            });

        // Max content length
        new Setting(optionsEl)
            .setName('Max Description Length')
            .setDesc('Maximum characters for event description')
            .addText(text => {
                text
                    .setValue(String(this.options.maxContentLength || 500))
                    .setPlaceholder('500')
                    .onChange(value => {
                        this.options.maxContentLength = parseInt(value) || 500;
                    });
                text.inputEl.type = 'number';
            });

        // Default status
        new Setting(optionsEl)
            .setName('Default Status')
            .setDesc('Status for generated events')
            .addText(text => {
                text
                    .setValue(this.options.defaultStatus || 'Generated')
                    .setPlaceholder('Generated')
                    .onChange(value => {
                        this.options.defaultStatus = value;
                    });
            });
    }

    private async generatePreview(): Promise<void> {
        new Notice('Scanning notes for tags...');

        try {
            this.previews = await this.generator.generateFromTags(this.options);

            if (this.previews.length === 0) {
                new Notice('No notes found with the selected tags');
            } else {
                new Notice(`Found ${this.previews.length} potential events`);
            }

            this.renderPreviewList();

            // Enable create button if we have previews
            const createBtn = this.contentEl.querySelector('button.mod-cta') as HTMLButtonElement;
            if (createBtn) {
                createBtn.disabled = this.previews.length === 0;
            }
        } catch (error) {
            new Notice(`Error generating preview: ${error}`);
            console.error('Tag timeline generation error:', error);
        }
    }

    private renderPreviewList(): void {
        if (!this.previewListEl) return;
        this.previewListEl.empty();

        if (this.previews.length === 0) {
            this.previewListEl.createDiv({
                text: 'No events to preview. Click "Generate Preview" to scan your notes.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Validate previews
        const { valid, invalid } = TagTimelineGenerator.validateGeneratedEvents(this.previews);

        // Show validation summary
        const summaryEl = this.previewListEl.createDiv({ cls: 'storyteller-preview-summary' });
        summaryEl.createDiv({
            text: `Valid: ${valid.length}`,
            cls: 'storyteller-preview-stat storyteller-preview-valid'
        });
        if (invalid.length > 0) {
            summaryEl.createDiv({
                text: `Invalid: ${invalid.length}`,
                cls: 'storyteller-preview-stat storyteller-preview-invalid'
            });
        }

        // Render valid previews
        valid.forEach(preview => {
            this.renderPreviewItem(preview, true);
        });

        // Render invalid previews
        invalid.forEach(({ preview, errors }) => {
            this.renderPreviewItem(preview, false, errors);
        });
    }

    private renderPreviewItem(
        preview: GeneratedEventPreview,
        isValid: boolean,
        errors?: string[]
    ): void {
        if (!this.previewListEl) return;

        const itemEl = this.previewListEl.createDiv({
            cls: `storyteller-preview-item ${isValid ? 'valid' : 'invalid'}`
        });

        // Header
        const headerEl = itemEl.createDiv({ cls: 'storyteller-preview-header' });

        if (!isValid) {
            headerEl.createSpan({
                text: '⚠',
                cls: 'storyteller-preview-warning'
            });
        }

        headerEl.createSpan({
            text: preview.event.name || 'Untitled',
            cls: 'storyteller-preview-name'
        });

        // Confidence badge
        const confidencePct = Math.round((preview.confidence || 0) * 100);
        const confidenceClass = confidencePct >= 80 ? 'high' :
            confidencePct >= 50 ? 'medium' : 'low';
        headerEl.createSpan({
            text: `${confidencePct}%`,
            cls: `storyteller-preview-confidence storyteller-confidence-${confidenceClass}`
        });

        // Details
        const detailsEl = itemEl.createDiv({ cls: 'storyteller-preview-details' });

        if (preview.event.dateTime) {
            detailsEl.createDiv({
                text: `Date: ${preview.event.dateTime}`,
                cls: 'storyteller-preview-detail'
            });
        }

        detailsEl.createDiv({
            text: `Source: ${preview.sourceFile.path}`,
            cls: 'storyteller-preview-detail storyteller-preview-source'
        });

        detailsEl.createDiv({
            text: `Method: ${preview.extractionMethod}`,
            cls: 'storyteller-preview-detail storyteller-preview-method'
        });

        if (preview.event.characters && preview.event.characters.length > 0) {
            detailsEl.createDiv({
                text: `Characters: ${preview.event.characters.join(', ')}`,
                cls: 'storyteller-preview-detail'
            });
        }

        if (preview.event.location) {
            detailsEl.createDiv({
                text: `Location: ${preview.event.location}`,
                cls: 'storyteller-preview-detail'
            });
        }

        if (preview.event.tags && preview.event.tags.length > 0) {
            detailsEl.createDiv({
                text: `Tags: ${preview.event.tags.join(', ')}`,
                cls: 'storyteller-preview-detail'
            });
        }

        // Warnings
        if (preview.warnings.length > 0) {
            const warningsEl = detailsEl.createDiv({ cls: 'storyteller-preview-warnings' });
            preview.warnings.forEach(warning => {
                warningsEl.createDiv({
                    text: `⚠ ${warning}`,
                    cls: 'storyteller-preview-warning-item'
                });
            });
        }

        // Errors (for invalid items)
        if (errors && errors.length > 0) {
            const errorsEl = detailsEl.createDiv({ cls: 'storyteller-preview-errors' });
            errors.forEach(error => {
                errorsEl.createDiv({
                    text: `❌ ${error}`,
                    cls: 'storyteller-preview-error-item'
                });
            });
        }
    }

    private async createEvents(): Promise<void> {
        const { valid } = TagTimelineGenerator.validateGeneratedEvents(this.previews);

        if (valid.length === 0) {
            new Notice('No valid events to create');
            return;
        }

        new Notice(`Creating ${valid.length} events...`);

        let created = 0;
        let failed = 0;

        for (const preview of valid) {
            try {
                // Create full event
                const event: Event = {
                    id: undefined,
                    name: preview.event.name || 'Untitled',
                    dateTime: preview.event.dateTime,
                    description: preview.event.description,
                    characters: preview.event.characters,
                    location: preview.event.location,
                    tags: preview.event.tags,
                    status: preview.event.status,
                    customFields: {
                        generatedFrom: preview.sourceFile.path,
                        generationMethod: preview.extractionMethod,
                        generationConfidence: String(Math.round((preview.confidence || 0) * 100))
                    }
                };

                await this.plugin.saveEvent(event);
                created++;
            } catch (error) {
                console.error(`Failed to create event ${preview.event.name}:`, error);
                failed++;
            }
        }

        new Notice(`Created ${created} events${failed > 0 ? `, ${failed} failed` : ''}`);
        this.close();
    }

    private addStyles(): void {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .storyteller-tag-timeline-generator {
                padding: 1em;
                max-width: 900px;
            }

            .storyteller-tag-timeline-desc {
                margin-bottom: 1.5em;
                color: var(--text-muted);
                font-size: 0.9em;
            }

            .storyteller-tag-timeline-options h3,
            .storyteller-tag-timeline-preview-section h3 {
                margin-top: 1.5em;
                margin-bottom: 1em;
                color: var(--text-accent);
            }

            .storyteller-tag-list {
                margin-top: 0.5em;
                padding: 0.75em;
                background: var(--background-secondary);
                border-radius: 4px;
            }

            .storyteller-tag-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5em;
                margin-top: 0.5em;
            }

            .storyteller-tag-chip {
                padding: 0.25em 0.75em;
                background: var(--background-modifier-border);
                border-radius: 12px;
                cursor: pointer;
                font-size: 0.85em;
                transition: all 0.2s;
            }

            .storyteller-tag-chip:hover {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .storyteller-tag-chip-selected {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .storyteller-tag-timeline-preview-list {
                max-height: 50vh;
                overflow-y: auto;
                margin-top: 1em;
            }

            .storyteller-preview-summary {
                display: flex;
                gap: 1em;
                margin-bottom: 1em;
                padding: 0.75em;
                background: var(--background-secondary);
                border-radius: 6px;
            }

            .storyteller-preview-stat {
                padding: 0.5em 1em;
                border-radius: 4px;
                background: var(--background-primary);
                font-weight: 600;
            }

            .storyteller-preview-valid {
                color: var(--text-success);
                border-left: 3px solid var(--text-success);
            }

            .storyteller-preview-invalid {
                color: var(--text-error);
                border-left: 3px solid var(--text-error);
            }

            .storyteller-preview-item {
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin-bottom: 1em;
                padding: 1em;
                background: var(--background-secondary);
            }

            .storyteller-preview-item.valid {
                border-left: 3px solid var(--text-success);
            }

            .storyteller-preview-item.invalid {
                border-left: 3px solid var(--text-error);
                opacity: 0.7;
            }

            .storyteller-preview-header {
                display: flex;
                align-items: center;
                gap: 0.75em;
                margin-bottom: 0.75em;
            }

            .storyteller-preview-warning {
                font-size: 1.2em;
            }

            .storyteller-preview-name {
                flex: 1;
                font-weight: 600;
                font-size: 1.1em;
            }

            .storyteller-preview-confidence {
                padding: 0.25em 0.5em;
                border-radius: 3px;
                font-size: 0.85em;
                font-weight: 600;
            }

            .storyteller-confidence-high {
                background: var(--text-success);
                color: white;
            }

            .storyteller-confidence-medium {
                background: var(--text-warning);
                color: var(--text-on-accent);
            }

            .storyteller-confidence-low {
                background: var(--text-error);
                color: white;
            }

            .storyteller-preview-details {
                margin-left: 0.5em;
                font-size: 0.9em;
            }

            .storyteller-preview-detail {
                margin-bottom: 0.35em;
                color: var(--text-muted);
            }

            .storyteller-preview-source {
                font-style: italic;
            }

            .storyteller-preview-method {
                font-family: var(--font-monospace);
                font-size: 0.85em;
            }

            .storyteller-preview-warnings,
            .storyteller-preview-errors {
                margin-top: 0.75em;
                padding-top: 0.75em;
                border-top: 1px solid var(--background-modifier-border);
            }

            .storyteller-preview-warning-item {
                color: var(--text-warning);
                margin-bottom: 0.25em;
            }

            .storyteller-preview-error-item {
                color: var(--text-error);
                margin-bottom: 0.25em;
                font-weight: 600;
            }

            .storyteller-empty-state {
                text-align: center;
                padding: 3em;
                color: var(--text-muted);
                font-style: italic;
            }
        `;
        this.contentEl.appendChild(styleEl);
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
