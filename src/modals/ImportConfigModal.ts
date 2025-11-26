/**
 * Import Configuration Modal
 * Multi-step wizard for configuring story and chapter imports
 */

import { App, Modal, Notice, Setting, TextComponent, DropdownComponent, ButtonComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { ImportManager } from '../import/ImportManager';
import { ImportConfiguration, ParsedDocument, ChapterImportConfig, ConflictResolution, ContentPlacement, EntityMappingConfig, EntityMappingAction, DraftStrategy } from '../import/ImportTypes';
import { EntityExtractor, ExtractedEntity } from '../import/EntityExtractor';

/**
 * Import wizard step
 */
type ImportStep = 'upload' | 'review' | 'entities' | 'configure' | 'confirm';

/**
 * Import Configuration Modal
 */
export class ImportConfigModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private importManager: ImportManager;
    private entityExtractor: EntityExtractor;
    private currentStep: ImportStep = 'upload';
    private parsedDocument: ParsedDocument | null = null;
    private configuration: ImportConfiguration | null = null;
    private fileName: string = '';
    private extractedCharacters: ExtractedEntity[] = [];
    private extractedLocations: ExtractedEntity[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.importManager = new ImportManager(plugin);
        this.entityExtractor = new EntityExtractor();
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
            case 'entities':
                this.renderEntitiesStep();
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
            text: 'Upload a file containing your story chapters.'
        });
        desc.addClass('storyteller-import-description');

        // File input
        const fileInputContainer = this.contentEl.createDiv('storyteller-file-input-container');

        const fileInput = fileInputContainer.createEl('input', {
            type: 'file',
            attr: {
                accept: '.txt,.md,.markdown,.docx,.json,.epub,.html,.htm,.rtf,.odt,.fountain,.spmd,.pdf'
            }
        });
        fileInput.addClass('storyteller-file-input');
        fileInput.style.display = 'none'; // Hide the default file input

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

            new Notice('Parsing document...');

            try {
                const lowerFileName = this.fileName.toLowerCase();
                
                // Handle binary formats that need ArrayBuffer
                if (lowerFileName.endsWith('.docx')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const docxParser = this.importManager.getDocxParser();
                    
                    if (docxParser) {
                        this.parsedDocument = await docxParser.parseAsync(arrayBuffer, this.fileName);
                    } else {
                        new Notice('DOCX parser not available.');
                        return;
                    }
                } else if (lowerFileName.endsWith('.epub')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const epubParser = this.importManager.getEpubParser();
                    
                    if (epubParser) {
                        this.parsedDocument = await epubParser.parseAsync(arrayBuffer, this.fileName);
                    } else {
                        new Notice('EPUB parser not available.');
                        return;
                    }
                } else if (lowerFileName.endsWith('.odt')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const odtParser = this.importManager.getOdtParser();

                    if (odtParser) {
                        this.parsedDocument = await odtParser.parseAsync(arrayBuffer, this.fileName);
                    } else {
                        new Notice('ODT parser not available.');
                        return;
                    }
                } else if (lowerFileName.endsWith('.pdf')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfParser = this.importManager.getPdfParser();

                    if (pdfParser) {
                        this.parsedDocument = await pdfParser.parseAsync(arrayBuffer, this.fileName);
                    } else {
                        new Notice('PDF parser not available.');
                        return;
                    }
                } else {
                    // Read text-based files (txt, md, json, html, rtf, fountain)
                    const content = await file.text();
                    this.parsedDocument = this.importManager.parseDocument(content, this.fileName);
                }

                if (this.parsedDocument) {
                    new Notice(`Found ${this.parsedDocument.chapters.length} chapters`);
                    this.currentStep = 'review';
                    this.renderStep();
                }
            } catch (error) {
                console.error('Error parsing file:', error);
                new Notice(`Error parsing file: ${error}`);
            }
        });

        // Instructions
        const instructions = this.contentEl.createEl('div');
        instructions.addClass('storyteller-import-instructions');
        instructions.createEl('h3', { text: 'Supported Formats:' });
        const ul = instructions.createEl('ul');
        ul.createEl('li', { text: 'Plain text (.txt) with chapter markers like "Chapter 1"' });
        ul.createEl('li', { text: 'Markdown (.md) with heading hierarchy (# Chapter 1)' });
        ul.createEl('li', { text: 'Word documents (.docx) with heading styles' });
        ul.createEl('li', { text: 'EPUB e-books (.epub) - standard e-book format' });
        ul.createEl('li', { text: 'PDF documents (.pdf) with chapter markers' });
        ul.createEl('li', { text: 'HTML files (.html, .htm) with heading structure' });
        ul.createEl('li', { text: 'Rich Text Format (.rtf) with chapter markers' });
        ul.createEl('li', { text: 'OpenDocument Text (.odt) - LibreOffice/OpenOffice' });
        ul.createEl('li', { text: 'Fountain screenplays (.fountain) with act/scene structure' });
        ul.createEl('li', { text: 'JSON (.json) with structured chapter data' });

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

        // Create configuration early if not exists so we can track enabled/disabled state
        if (!this.configuration) {
            this.configuration = this.importManager.createDefaultConfiguration(
                this.parsedDocument,
                this.fileName
            );
        }

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
            warningsDiv.createEl('h3', { text: 'Warnings:' });
            const warningsList = warningsDiv.createEl('ul');
            for (const warning of this.parsedDocument.warnings) {
                warningsList.createEl('li', { text: warning });
            }
        }

        // Chapter list header with select all/none
        const chaptersDiv = this.contentEl.createDiv('storyteller-import-chapters');
        const chaptersHeader = chaptersDiv.createDiv('storyteller-chapters-header');
        chaptersHeader.style.display = 'flex';
        chaptersHeader.style.justifyContent = 'space-between';
        chaptersHeader.style.alignItems = 'center';
        chaptersHeader.style.marginBottom = '8px';
        
        chaptersHeader.createEl('h3', { text: 'Chapters:' });
        
        // Selection summary and controls
        const selectionControls = chaptersHeader.createDiv('storyteller-selection-controls');
        selectionControls.style.display = 'flex';
        selectionControls.style.gap = '8px';
        selectionControls.style.alignItems = 'center';
        
        const enabledCount = this.configuration.chapters.filter(c => c.enabled).length;
        const selectionSummary = selectionControls.createSpan('storyteller-selection-summary');
        selectionSummary.setText(`${enabledCount}/${this.configuration.chapters.length} selected`);
        selectionSummary.style.fontSize = '0.9em';
        selectionSummary.style.color = 'var(--text-muted)';
        
        const selectAllBtn = selectionControls.createEl('button', { text: 'Select All' });
        selectAllBtn.style.fontSize = '0.85em';
        selectAllBtn.style.padding = '2px 8px';
        
        const selectNoneBtn = selectionControls.createEl('button', { text: 'Select None' });
        selectNoneBtn.style.fontSize = '0.85em';
        selectNoneBtn.style.padding = '2px 8px';

        const chapterList = chaptersDiv.createDiv('storyteller-chapter-list');
        chapterList.style.maxHeight = '300px';
        chapterList.style.overflowY = 'auto';
        chapterList.style.border = '1px solid var(--background-modifier-border)';
        chapterList.style.padding = '10px';
        chapterList.style.marginBottom = '10px';

        const checkboxes: HTMLInputElement[] = [];

        const updateSelectionSummary = () => {
            const count = this.configuration!.chapters.filter(c => c.enabled).length;
            selectionSummary.setText(`${count}/${this.configuration!.chapters.length} selected`);
        };

        for (let i = 0; i < this.configuration.chapters.length; i++) {
            const chapterConfig = this.configuration.chapters[i];
            const parsedChapter = this.parsedDocument.chapters[i];

            const chapterItem = chapterList.createDiv('storyteller-chapter-item');
            chapterItem.style.marginBottom = '10px';
            chapterItem.style.padding = '8px';
            chapterItem.style.border = '1px solid var(--background-modifier-border)';
            chapterItem.style.borderRadius = '4px';
            chapterItem.style.display = 'flex';
            chapterItem.style.alignItems = 'flex-start';
            chapterItem.style.gap = '10px';

            // Checkbox for enabling/disabling
            const checkbox = chapterItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = chapterConfig.enabled;
            checkbox.style.marginTop = '4px';
            checkbox.addEventListener('change', () => {
                chapterConfig.enabled = checkbox.checked;
                updateSelectionSummary();
            });
            checkboxes.push(checkbox);

            // Chapter info container
            const infoContainer = chapterItem.createDiv('storyteller-chapter-info');
            infoContainer.style.flex = '1';

            // Editable row with chapter number and name
            const editableRow = infoContainer.createDiv('storyteller-chapter-editable');
            editableRow.style.display = 'flex';
            editableRow.style.gap = '8px';
            editableRow.style.alignItems = 'center';
            editableRow.style.marginBottom = '4px';

            // Chapter number input
            const numberLabel = editableRow.createSpan();
            numberLabel.setText('Ch.');
            numberLabel.style.fontSize = '0.9em';
            numberLabel.style.color = 'var(--text-muted)';

            const numberInput = editableRow.createEl('input', { type: 'number' });
            numberInput.value = String(chapterConfig.targetNumber ?? '');
            numberInput.style.width = '50px';
            numberInput.style.padding = '2px 4px';
            numberInput.style.fontSize = '0.9em';
            numberInput.placeholder = '#';
            numberInput.addEventListener('change', () => {
                const num = parseInt(numberInput.value, 10);
                chapterConfig.targetNumber = isNaN(num) ? undefined : num;
            });

            // Chapter name input
            const nameInput = editableRow.createEl('input', { type: 'text' });
            nameInput.value = chapterConfig.targetName;
            nameInput.style.flex = '1';
            nameInput.style.padding = '2px 6px';
            nameInput.style.fontSize = '0.9em';
            nameInput.placeholder = 'Chapter name';
            nameInput.addEventListener('change', () => {
                chapterConfig.targetName = nameInput.value.trim() || chapterConfig.sourceTitle;
            });

            // Info line with word count and original title
            const infoLine = infoContainer.createDiv();
            infoLine.style.fontSize = '0.85em';
            infoLine.style.color = 'var(--text-muted)';
            const originalTitle = parsedChapter.title !== chapterConfig.targetName 
                ? ` (original: "${parsedChapter.title}")` 
                : '';
            infoLine.setText(`${parsedChapter.wordCount.toLocaleString()} words${originalTitle}`);
        }

        // Wire up select all/none buttons
        selectAllBtn.addEventListener('click', () => {
            checkboxes.forEach((cb, i) => {
                cb.checked = true;
                this.configuration!.chapters[i].enabled = true;
            });
            updateSelectionSummary();
        });

        selectNoneBtn.addEventListener('click', () => {
            checkboxes.forEach((cb, i) => {
                cb.checked = false;
                this.configuration!.chapters[i].enabled = false;
            });
            updateSelectionSummary();
        });

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('Back')
                .onClick(() => {
                    this.currentStep = 'upload';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Next')
                .setCta()
                .onClick(() => {
                    // Validate at least one chapter is selected
                    const enabledCount = this.configuration!.chapters.filter(c => c.enabled).length;
                    if (enabledCount === 0) {
                        new Notice('Please select at least one chapter to import.');
                        return;
                    }

                    // Extract entities from enabled chapters
                    new Notice('Analyzing text for characters and locations...');
                    const enabledContent = this.configuration!.chapters
                        .filter(c => c.enabled)
                        .map(c => c.content)
                        .join('\n\n');

                    const { characters, locations } = this.entityExtractor.extractEntities(enabledContent);
                    this.extractedCharacters = characters;
                    this.extractedLocations = locations;

                    // Initialize entity mappings if not already set
                    if (this.configuration!.entityMappings.length === 0) {
                        this.configuration!.entityMappings = [
                            ...characters.map(c => ({
                                extractedName: c.name,
                                type: 'character' as const,
                                action: 'ignore' as EntityMappingAction,
                                occurrences: c.occurrences,
                                confidence: c.confidence
                            })),
                            ...locations.map(l => ({
                                extractedName: l.name,
                                type: 'location' as const,
                                action: 'ignore' as EntityMappingAction,
                                occurrences: l.occurrences,
                                confidence: l.confidence
                            }))
                        ];
                    }

                    this.currentStep = 'entities';
                    this.renderStep();
                })
            );
    }

    /**
     * Step 3: Entity mapping
     */
    private async renderEntitiesStep(): Promise<void> {
        if (!this.configuration) return;

        this.titleEl.setText('Import Story - Entity Mapping');

        const totalEntities = this.extractedCharacters.length + this.extractedLocations.length;

        if (totalEntities === 0) {
            // No entities found, skip to configure
            const noEntitiesDiv = this.contentEl.createDiv('storyteller-no-entities');
            noEntitiesDiv.style.padding = '20px';
            noEntitiesDiv.style.textAlign = 'center';
            noEntitiesDiv.createEl('p', { text: 'No character or location names were detected in your text.' });
            noEntitiesDiv.createEl('p', { 
                text: 'You can continue without entity linking, or go back and check your chapters.',
                cls: 'setting-item-description'
            });
        } else {
            // Description
            const desc = this.contentEl.createEl('p', {
                text: `Found ${this.extractedCharacters.length} potential characters and ${this.extractedLocations.length} potential locations. Choose how to handle each entity during import.`
            });
            desc.style.marginBottom = '16px';

            // Load existing entities for linking options
            const existingCharacters = await this.plugin.listCharacters();
            const existingLocations = await this.plugin.listLocations();

            // Characters section
            if (this.extractedCharacters.length > 0) {
                this.renderEntitySection(
                    'Characters',
                    'character',
                    this.extractedCharacters,
                    existingCharacters.map(c => ({ id: c.id || '', name: c.name }))
                );
            }

            // Locations section
            if (this.extractedLocations.length > 0) {
                this.renderEntitySection(
                    'Locations',
                    'location',
                    this.extractedLocations,
                    existingLocations.map(l => ({ id: l.id || '', name: l.name }))
                );
            }
        }

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('Back')
                .onClick(() => {
                    this.currentStep = 'review';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Skip Entity Linking')
                .onClick(() => {
                    // Set all to ignore
                    for (const mapping of this.configuration!.entityMappings) {
                        mapping.action = 'ignore';
                    }
                    this.configuration!.entityExtractionEnabled = false;
                    this.currentStep = 'configure';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Next')
                .setCta()
                .onClick(() => {
                    // Enable entity extraction if any entities are set to create or link
                    const hasEntityActions = this.configuration!.entityMappings.some(
                        m => m.action === 'create' || m.action === 'link'
                    );
                    this.configuration!.entityExtractionEnabled = hasEntityActions;
                    this.currentStep = 'configure';
                    this.renderStep();
                })
            );
    }

    /**
     * Render a section of entities (characters or locations)
     */
    private renderEntitySection(
        title: string,
        type: 'character' | 'location',
        extracted: ExtractedEntity[],
        existingEntities: Array<{ id: string; name: string }>
    ): void {
        const section = this.contentEl.createDiv('storyteller-entity-section');
        section.style.marginBottom = '20px';

        const header = section.createEl('h3', { text: title });
        header.style.marginBottom = '10px';

        const entityList = section.createDiv('storyteller-entity-list');
        entityList.style.maxHeight = '200px';
        entityList.style.overflowY = 'auto';
        entityList.style.border = '1px solid var(--background-modifier-border)';
        entityList.style.borderRadius = '4px';
        entityList.style.padding = '8px';

        for (const entity of extracted) {
            // Find the mapping for this entity
            const mapping = this.configuration!.entityMappings.find(
                m => m.extractedName === entity.name && m.type === type
            );
            if (!mapping) continue;

            const entityItem = entityList.createDiv('storyteller-entity-item');
            entityItem.style.padding = '8px';
            entityItem.style.marginBottom = '8px';
            entityItem.style.border = '1px solid var(--background-modifier-border)';
            entityItem.style.borderRadius = '4px';
            entityItem.style.backgroundColor = 'var(--background-secondary)';

            // Entity name and info
            const nameRow = entityItem.createDiv();
            nameRow.style.display = 'flex';
            nameRow.style.justifyContent = 'space-between';
            nameRow.style.alignItems = 'center';
            nameRow.style.marginBottom = '8px';

            const nameSpan = nameRow.createEl('strong', { text: entity.name });
            
            const infoSpan = nameRow.createSpan();
            infoSpan.style.fontSize = '0.85em';
            infoSpan.style.color = 'var(--text-muted)';
            const confidenceLabel = entity.confidence === 'high' ? 'High' : 
                                   entity.confidence === 'medium' ? 'Med' : 'Low';
            infoSpan.setText(`${entity.occurrences}x | ${confidenceLabel} confidence`);

            // Action selection row
            const actionRow = entityItem.createDiv();
            actionRow.style.display = 'flex';
            actionRow.style.gap = '8px';
            actionRow.style.alignItems = 'center';
            actionRow.style.flexWrap = 'wrap';

            // Action dropdown
            const actionLabel = actionRow.createSpan({ text: 'Action:' });
            actionLabel.style.fontSize = '0.9em';

            const actionSelect = actionRow.createEl('select');
            actionSelect.style.padding = '2px 6px';
            actionSelect.style.fontSize = '0.9em';

            const ignoreOption = actionSelect.createEl('option', { value: 'ignore', text: 'Ignore' });
            const createOption = actionSelect.createEl('option', { value: 'create', text: 'Create new' });
            
            if (existingEntities.length > 0) {
                const linkOption = actionSelect.createEl('option', { value: 'link', text: 'Link to existing' });
            }

            actionSelect.value = mapping.action;

            // Existing entity dropdown (shown only when action is 'link')
            const linkContainer = actionRow.createDiv();
            linkContainer.style.display = mapping.action === 'link' ? 'flex' : 'none';
            linkContainer.style.gap = '4px';
            linkContainer.style.alignItems = 'center';

            const linkLabel = linkContainer.createSpan({ text: 'to:' });
            linkLabel.style.fontSize = '0.9em';

            const linkSelect = linkContainer.createEl('select');
            linkSelect.style.padding = '2px 6px';
            linkSelect.style.fontSize = '0.9em';
            linkSelect.style.maxWidth = '150px';

            for (const existing of existingEntities) {
                const option = linkSelect.createEl('option', { 
                    value: existing.id, 
                    text: existing.name 
                });
            }

            if (mapping.linkedEntityId) {
                linkSelect.value = mapping.linkedEntityId;
            } else if (existingEntities.length > 0) {
                mapping.linkedEntityId = existingEntities[0].id;
            }

            // Event handlers
            actionSelect.addEventListener('change', () => {
                mapping.action = actionSelect.value as EntityMappingAction;
                linkContainer.style.display = mapping.action === 'link' ? 'flex' : 'none';
                if (mapping.action === 'link' && existingEntities.length > 0 && !mapping.linkedEntityId) {
                    mapping.linkedEntityId = existingEntities[0].id;
                }
            });

            linkSelect.addEventListener('change', () => {
                mapping.linkedEntityId = linkSelect.value;
            });

            // Context preview (collapsed by default)
            if (entity.contexts.length > 0) {
                const contextToggle = entityItem.createEl('button', { text: 'Show context' });
                contextToggle.style.fontSize = '0.8em';
                contextToggle.style.padding = '2px 6px';
                contextToggle.style.marginTop = '8px';

                const contextDiv = entityItem.createDiv();
                contextDiv.style.display = 'none';
                contextDiv.style.marginTop = '8px';
                contextDiv.style.padding = '8px';
                contextDiv.style.backgroundColor = 'var(--background-primary)';
                contextDiv.style.borderRadius = '4px';
                contextDiv.style.fontSize = '0.85em';
                contextDiv.style.fontStyle = 'italic';
                contextDiv.style.color = 'var(--text-muted)';

                for (const ctx of entity.contexts.slice(0, 2)) {
                    contextDiv.createEl('p', { text: ctx });
                }

                contextToggle.addEventListener('click', () => {
                    const isHidden = contextDiv.style.display === 'none';
                    contextDiv.style.display = isHidden ? 'block' : 'none';
                    contextToggle.setText(isHidden ? 'Hide context' : 'Show context');
                });
            }
        }
    }

    /**
     * Step 4: Configure import options
     */
    private renderConfigureStep(): void {
        if (!this.configuration) return;

        this.titleEl.setText('Import Story - Configure Options');

        // Container for story target options
        const storyTargetContainer = this.contentEl.createDiv('storyteller-story-target-container');

        // Toggle: Create new story vs Add to existing
        const existingStories = this.plugin.settings.stories || [];
        const hasExistingStories = existingStories.length > 0;

        let storyNameSetting: Setting | null = null;
        let existingStorySetting: Setting | null = null;

        const updateStoryTargetUI = () => {
            // Clear the container
            storyTargetContainer.empty();

            // Create new story / Add to existing toggle
            new Setting(storyTargetContainer)
                .setName('Import Target')
                .setDesc('Choose where to import the chapters')
                .addDropdown(dropdown => {
                    dropdown
                        .addOption('new', 'Create new story')
                        .setValue(this.configuration!.createNewStory ? 'new' : 'existing');
                    
                    if (hasExistingStories) {
                        dropdown.addOption('existing', 'Add to existing story');
                    }

                    dropdown.onChange(value => {
                        this.configuration!.createNewStory = (value === 'new');
                        if (value === 'new') {
                            this.configuration!.targetStoryId = undefined;
                        } else {
                            // Default to first story if switching to existing
                            if (!this.configuration!.targetStoryId && existingStories.length > 0) {
                                this.configuration!.targetStoryId = existingStories[0].id;
                            }
                        }
                        updateStoryTargetUI();
                    });
                });

            if (this.configuration!.createNewStory) {
                // Story name input for new story
                storyNameSetting = new Setting(storyTargetContainer)
                    .setName('Story Name')
                    .setDesc('Name for the new story')
                    .addText(text => text
                        .setValue(this.configuration!.targetStoryName || '')
                        .onChange(value => {
                            this.configuration!.targetStoryName = value;
                        })
                    );
            } else {
                // Existing story dropdown
                existingStorySetting = new Setting(storyTargetContainer)
                    .setName('Select Story')
                    .setDesc('Choose an existing story to add chapters to')
                    .addDropdown(dropdown => {
                        for (const story of existingStories) {
                            dropdown.addOption(story.id, story.name);
                        }
                        dropdown.setValue(this.configuration!.targetStoryId || existingStories[0]?.id || '');
                        dropdown.onChange(value => {
                            this.configuration!.targetStoryId = value;
                        });
                    });
            }
        };

        updateStoryTargetUI();

        // Draft version (for naming)
        new Setting(this.contentEl)
            .setName('Draft Version')
            .setDesc('Optional version label (e.g., "Rough Draft", "Revised")')
            .addText(text => text
                .setPlaceholder('e.g., Rough Draft')
                .setValue(this.configuration!.draftVersion || '')
                .onChange(value => {
                    this.configuration!.draftVersion = value;
                    // Update story name if draft version is set and creating new story
                    if (value.trim() && this.configuration!.createNewStory) {
                        const baseName = this.fileName.replace(/\.(txt|md|docx|json|csv)$/i, '');
                        this.configuration!.targetStoryName = `${baseName} - ${value}`;
                    }
                })
            );

        // Draft strategy selector
        new Setting(this.contentEl)
            .setName('Draft Strategy')
            .setDesc('How to organize multiple drafts of the same story')
            .addDropdown(dropdown => dropdown
                .addOption('separate-stories', 'Separate stories (create new story per draft)')
                .addOption('version-tags', 'Version tags (tag chapters with draft version)')
                .addOption('scene-status', 'Scene status (use status field for version)')
                .addOption('custom-metadata', 'Custom metadata (add draftVersion field)')
                .setValue(this.configuration!.draftStrategy)
                .onChange(value => {
                    this.configuration!.draftStrategy = value as DraftStrategy;
                })
            );

        // Content placement choice
        new Setting(this.contentEl)
            .setName('Content Placement')
            .setDesc('Where to store the imported chapter content')
            .addDropdown(dropdown => dropdown
                .addOption('chapter-summary', 'Chapter summary (content in chapter file)')
                .addOption('scene-files', 'Scene files (create scene for each chapter)')
                .setValue(this.configuration!.contentPlacement || 'chapter-summary')
                .onChange(value => {
                    this.configuration!.contentPlacement = value as ContentPlacement;
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
                .setButtonText('Back')
                .onClick(() => {
                    this.currentStep = 'entities';
                    this.renderStep();
                })
            )
            .addButton(btn => btn
                .setButtonText('Next')
                .setCta()
                .onClick(() => {
                    this.currentStep = 'confirm';
                    this.renderStep();
                })
            );
    }

    /**
     * Step 5: Confirm and execute
     */
    private renderConfirmStep(): void {
        if (!this.configuration) return;

        this.titleEl.setText('Import Story - Confirm');

        // Summary
        const summary = this.contentEl.createDiv('storyteller-import-summary');
        summary.createEl('h3', { text: 'Import Summary:' });

        const summaryList = summary.createEl('ul');
        
        // Show story target info
        if (this.configuration.createNewStory) {
            summaryList.createEl('li', { text: `Story: ${this.configuration.targetStoryName} (new)` });
        } else {
            const existingStory = this.plugin.settings.stories?.find(s => s.id === this.configuration!.targetStoryId);
            summaryList.createEl('li', { text: `Story: ${existingStory?.name || 'Unknown'} (existing)` });
        }
        
        if (this.configuration.draftVersion) {
            summaryList.createEl('li', { text: `Draft: ${this.configuration.draftVersion}` });
        }
        
        // Show enabled chapters count
        const enabledChapters = this.configuration.chapters.filter(c => c.enabled);
        summaryList.createEl('li', { text: `Chapters: ${enabledChapters.length} of ${this.configuration.chapters.length}` });
        
        // Calculate words for enabled chapters only
        const enabledWords = enabledChapters.reduce((sum, ch) => sum + ch.content.split(/\s+/).length, 0);
        summaryList.createEl('li', { text: `Total Words: ${enabledWords.toLocaleString()}` });
        
        // Content placement info
        const placementText = this.configuration.contentPlacement === 'scene-files'
            ? 'Scene files (will create scenes)'
            : 'Chapter summaries';
        summaryList.createEl('li', { text: `Content: ${placementText}` });
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

        // Progress container (hidden initially)
        const progressContainer = this.contentEl.createDiv('storyteller-import-progress');
        progressContainer.style.display = 'none';
        progressContainer.style.marginTop = '16px';
        progressContainer.style.marginBottom = '16px';

        const progressLabel = progressContainer.createDiv('storyteller-progress-label');
        progressLabel.style.marginBottom = '8px';
        progressLabel.style.fontSize = '0.9em';

        const progressBarOuter = progressContainer.createDiv('storyteller-progress-bar-outer');
        progressBarOuter.style.height = '8px';
        progressBarOuter.style.backgroundColor = 'var(--background-modifier-border)';
        progressBarOuter.style.borderRadius = '4px';
        progressBarOuter.style.overflow = 'hidden';

        const progressBarInner = progressBarOuter.createDiv('storyteller-progress-bar-inner');
        progressBarInner.style.height = '100%';
        progressBarInner.style.width = '0%';
        progressBarInner.style.backgroundColor = 'var(--interactive-accent)';
        progressBarInner.style.transition = 'width 0.2s ease';

        const progressDetail = progressContainer.createDiv('storyteller-progress-detail');
        progressDetail.style.marginTop = '4px';
        progressDetail.style.fontSize = '0.85em';
        progressDetail.style.color = 'var(--text-muted)';

        // Buttons
        const buttonContainer = this.contentEl.createDiv('storyteller-modal-buttons');
        let backButton: ButtonComponent;
        
        new Setting(buttonContainer)
            .addButton(btn => {
                backButton = btn
                    .setButtonText('Back')
                    .onClick(() => {
                        this.currentStep = 'configure';
                        this.renderStep();
                    });
                return btn;
            })
            .addButton(btn => {
                const button = btn
                    .setButtonText('Import')
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        backButton.setDisabled(true);
                        button.setButtonText('Importing...');
                        progressContainer.style.display = 'block';

                        const result = await this.importManager.executeImport(
                            this.configuration!,
                            (progress) => {
                                progressLabel.setText(progress.currentStep);
                                progressBarInner.style.width = `${progress.percentage}%`;
                                if (progress.currentItem) {
                                    progressDetail.setText(`${progress.currentItem} (${progress.processed}/${progress.total})`);
                                } else {
                                    progressDetail.setText(`${progress.processed}/${progress.total}`);
                                }
                            }
                        );

                        if (result.success) {
                            const scenesMsg = result.stats.totalScenes > 0 
                                ? ` and ${result.stats.totalScenes} scenes` 
                                : '';
                            new Notice(`Successfully imported ${result.stats.totalChapters} chapters${scenesMsg}!`);
                            this.close();
                        } else {
                            new Notice(`Import failed: ${result.error}`);
                            progressContainer.style.display = 'none';
                            button.setDisabled(false);
                            backButton.setDisabled(false);
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
