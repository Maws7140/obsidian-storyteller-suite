import { App, Modal, Setting, Notice } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { TagEventGenerator, TagGenerationOptions } from '../utils/TagEventGenerator';

export class TagBasedEventModal extends Modal {
    plugin: StorytellerSuitePlugin;
    private selectedTags: Set<string> = new Set();
    private selectedEntityTypes: Set<'scene' | 'chapter' | 'reference'> = new Set(['scene', 'chapter', 'reference']);
    private nameTemplate = '[{type}] {name}';
    private previewContainer: HTMLElement;
    private previewEvents: Array<{ event: Event; source: any; warnings: string[] }> = [];

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.modalEl.addClass('storyteller-tag-event-modal');
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Generate Timeline Events from Tags' });

        contentEl.createEl('p', {
            text: 'This will scan your scenes, chapters, and references for specific tags and create timeline events from them.',
            cls: 'storyteller-modal-description'
        });

        // Get all available tags
        const scenes = await this.plugin.listScenes();
        const chapters = await this.plugin.listChapters();
        const references = await this.plugin.listReferences();
        const allTags = TagEventGenerator.getAllTags(scenes, chapters, references);

        if (allTags.length === 0) {
            contentEl.createEl('p', {
                text: '⚠️ No tags found in your scenes, chapters, or references. Please add tags to your entities first.',
                cls: 'storyteller-warning'
            });

            contentEl.createEl('button', { text: 'Close' }, btn => {
                btn.addEventListener('click', () => this.close());
            });
            return;
        }

        // Tag Selection
        const tagSection = contentEl.createDiv('storyteller-tag-selection-section');
        tagSection.createEl('h3', { text: 'Select Tags to Scan' });
        tagSection.createEl('p', {
            text: 'Events will be created from entities that have ANY of these tags:'
        });

        const tagContainer = tagSection.createDiv('storyteller-tag-checkboxes');
        for (const tag of allTags.sort()) {
            const tagRow = tagContainer.createDiv('storyteller-tag-checkbox-row');
            tagRow.createEl('input', {
                type: 'checkbox',
                value: tag
            }, checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.selectedTags.add(tag);
                    } else {
                        this.selectedTags.delete(tag);
                    }
                });
                if (this.selectedTags.has(tag)) {
                    checkbox.checked = true;
                }
            });
            tagRow.createEl('label', { text: tag });
        }

        // Select All / Deselect All
        const tagActions = tagSection.createDiv('storyteller-tag-actions');
        tagActions.createEl('button', { text: 'Select All' }, btn => {
            btn.addEventListener('click', () => {
                allTags.forEach(tag => this.selectedTags.add(tag));
                tagContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    (cb as HTMLInputElement).checked = true;
                });
            });
        });
        tagActions.createEl('button', { text: 'Deselect All' }, btn => {
            btn.addEventListener('click', () => {
                this.selectedTags.clear();
                tagContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    (cb as HTMLInputElement).checked = false;
                });
            });
        });

        // Entity Type Selection
        const entitySection = contentEl.createDiv('storyteller-entity-type-section');
        entitySection.createEl('h3', { text: 'Entity Types to Scan' });

        const entityContainer = entitySection.createDiv('storyteller-entity-checkboxes');

        const entityTypes: Array<{ type: 'scene' | 'chapter' | 'reference'; label: string }> = [
            { type: 'scene', label: 'Scenes' },
            { type: 'chapter', label: 'Chapters' },
            { type: 'reference', label: 'References' }
        ];

        for (const { type, label } of entityTypes) {
            const row = entityContainer.createDiv('storyteller-entity-checkbox-row');
            row.createEl('input', {
                type: 'checkbox',
                value: type
            }, checkbox => {
                checkbox.checked = this.selectedEntityTypes.has(type);
                checkbox.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.selectedEntityTypes.add(type);
                    } else {
                        this.selectedEntityTypes.delete(type);
                    }
                });
            });
            row.createEl('label', { text: label });
        }

        // Name Template
        new Setting(contentEl)
            .setName('Event Name Template')
            .setDesc('Template for generated event names. Use {type} for entity type and {name} for entity name.')
            .addText(text => text
                .setPlaceholder('[{type}] {name}')
                .setValue(this.nameTemplate)
                .onChange(value => {
                    this.nameTemplate = value || '[{type}] {name}';
                }));

        // Preview Button
        const previewSection = contentEl.createDiv('storyteller-preview-section');
        previewSection.createEl('button', {
            text: 'Preview Events',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', async () => {
                await this.generatePreview();
            });
        });

        // Preview Container
        this.previewContainer = contentEl.createDiv('storyteller-event-preview-container');

        // Action Buttons
        const buttonContainer = contentEl.createDiv('storyteller-modal-buttons');

        buttonContainer.createEl('button', { text: 'Cancel' }, btn => {
            btn.addEventListener('click', () => {
                this.close();
            });
        });

        buttonContainer.createEl('button', {
            text: 'Generate Events',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', async () => {
                await this.generateAndSaveEvents();
            });
        });
    }

    private async generatePreview() {
        if (this.selectedTags.size === 0) {
            new Notice('Please select at least one tag');
            return;
        }

        if (this.selectedEntityTypes.size === 0) {
            new Notice('Please select at least one entity type');
            return;
        }

        const scenes = await this.plugin.listScenes();
        const chapters = await this.plugin.listChapters();
        const references = await this.plugin.listReferences();

        const options: TagGenerationOptions = {
            tags: Array.from(this.selectedTags),
            entityTypes: Array.from(this.selectedEntityTypes),
            nameTemplate: this.nameTemplate,
            extractDatesFromContent: true,
            idPrefix: 'tag-generated'
        };

        this.previewEvents = TagEventGenerator.previewEvents(scenes, chapters, references, options);

        this.renderPreview();
    }

    private renderPreview() {
        this.previewContainer.empty();

        if (this.previewEvents.length === 0) {
            this.previewContainer.createEl('p', {
                text: 'No entities found with the selected tags.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        this.previewContainer.createEl('h3', {
            text: `Preview: ${this.previewEvents.length} event${this.previewEvents.length !== 1 ? 's' : ''} will be created`
        });

        const previewTable = this.previewContainer.createEl('div', {
            cls: 'storyteller-event-preview-table'
        });

        for (const { event, source, warnings } of this.previewEvents) {
            const row = previewTable.createDiv('storyteller-preview-row');

            const mainInfo = row.createDiv('storyteller-preview-main');
            mainInfo.createEl('strong', { text: event.name });

            if (event.dateTime) {
                mainInfo.createDiv('storyteller-preview-date', div => {
                    div.createSpan({ text: `📅 ${event.dateTime}` });
                });
            }

            if (event.description) {
                const desc = event.description.length > 100
                    ? event.description.slice(0, 100) + '...'
                    : event.description;
                mainInfo.createDiv('storyteller-preview-desc', div => {
                    div.createSpan({ text: desc });
                });
            }

            if (warnings.length > 0) {
                const warningDiv = row.createDiv('storyteller-preview-warnings');
                for (const warning of warnings) {
                    warningDiv.createDiv('storyteller-preview-warning', div => {
                        div.createSpan({ text: `⚠️ ${warning}` });
                    });
                }
            }

            row.createDiv('storyteller-preview-source', div => {
                div.createSpan({
                    text: `Source: ${source.type} "${source.entity.name}"`
                });
            });
        }
    }

    private async generateAndSaveEvents() {
        if (this.previewEvents.length === 0) {
            new Notice('Please preview events first');
            return;
        }

        try {
            let successCount = 0;
            let errorCount = 0;

            for (const { event } of this.previewEvents) {
                try {
                    await this.plugin.saveEvent(event);
                    successCount++;
                } catch (error) {
                    console.error('Error saving generated event:', event.name, error);
                    errorCount++;
                }
            }

            if (successCount > 0) {
                new Notice(`✅ Successfully created ${successCount} event${successCount !== 1 ? 's' : ''}`);
            }

            if (errorCount > 0) {
                new Notice(`⚠️ Failed to create ${errorCount} event${errorCount !== 1 ? 's' : ''}. Check console for details.`);
            }

            if (successCount > 0) {
                this.close();
            }
        } catch (error) {
            console.error('Error generating events:', error);
            new Notice('Error generating events. Check console for details.');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
