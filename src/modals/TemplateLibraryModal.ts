/**
 * Template Library Modal
 * Browse, filter, and manage templates
 */

import { App, Notice, Setting, TFile, normalizePath, setIcon } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateFilter,
    TemplateGenre,
    TemplateCategory,
    SharedTemplatePackage
} from '../templates/TemplateTypes';
import { TemplateEditorModal } from './TemplateEditorModal';

type NoteBackedTemplate = Template & {
    isNoteBased?: boolean;
    noteFilePath?: string;
};

export class TemplateLibraryModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private onTemplateSelected?: (template: Template) => void;

    // Filter state
    private filter: TemplateFilter = {
        showBuiltIn: true,
        showCustom: true
    };

    private templates: Template[] = [];

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        onTemplateSelected?: (template: Template) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onTemplateSelected = onTemplateSelected;
    }

    onOpen(): void {
        super.onOpen();
        this.refreshTemplates();
        this.displayContent();
    }

    private refreshTemplates(): void {
        this.templates = this.plugin.templateManager.getFilteredTemplates(this.filter);
    }

    private displayContent(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Template library' });

        // Create filter section
        this.createFilterSection(contentEl);

        // Create template list
        this.createTemplateList(contentEl);

        // Create new template button
        const createButton = contentEl.createEl('button', {
            text: 'Create new template',
            cls: 'mod-cta'
        });
        createButton.setCssStyles({ marginTop: '1em' });
        createButton.addEventListener('click', () => this.handleCreateNew());

        const importButton = contentEl.createEl('button', {
            text: 'Import shared template'
        });
        importButton.setCssStyles({ marginTop: '1em' });
        importButton.setCssStyles({ marginLeft: '0.5em' });
        importButton.addEventListener('click', () => this.handleImportSharedTemplate());
    }

    private createFilterSection(container: HTMLElement): void {
        const filterContainer = container.createDiv({ cls: 'template-library-filters' });

        // Search text
        new Setting(filterContainer)
            .setName('Search')
            .setDesc('Search templates by name, description, or tags')
            .addText(text => text
                .setPlaceholder('Search...')
                .setValue(this.filter.searchText || '')
                .onChange(value => {
                    this.filter.searchText = value || undefined;
                    this.refreshAndDisplay();
                })
            );

        // Genre filter
        new Setting(filterContainer)
            .setName('Genre')
            .setDesc('Filter by genre')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'All genres');
                dropdown.addOption('fantasy', 'Fantasy');
                dropdown.addOption('scifi', 'Sci-fi');
                dropdown.addOption('mystery', 'Mystery');
                dropdown.addOption('horror', 'Horror');
                dropdown.addOption('romance', 'Romance');
                dropdown.addOption('historical', 'Historical');
                dropdown.addOption('western', 'Western');
                dropdown.addOption('thriller', 'Thriller');
                dropdown.addOption('custom', 'Custom');
                dropdown.setValue('');
                dropdown.onChange(value => {
                    this.filter.genre = value ? [value as TemplateGenre] : undefined;
                    this.refreshAndDisplay();
                });
            });

        // Category filter
        new Setting(filterContainer)
            .setName('Category')
            .setDesc('Filter by category')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'All categories');
                dropdown.addOption('single-entity', 'Single entity');
                dropdown.addOption('entity-set', 'Entity set');
                dropdown.addOption('full-world', 'Full world');
                dropdown.setValue('');
                dropdown.onChange(value => {
                    this.filter.category = value ? [value as TemplateCategory] : undefined;
                    this.refreshAndDisplay();
                });
            });

        // Show built-in / custom toggles
        new Setting(filterContainer)
            .setName('Show built-in templates')
            .addToggle(toggle => toggle
                .setValue(this.filter.showBuiltIn !== false)
                .onChange(value => {
                    this.filter.showBuiltIn = value;
                    this.refreshAndDisplay();
                })
            );

        new Setting(filterContainer)
            .setName('Show custom templates')
            .addToggle(toggle => toggle
                .setValue(this.filter.showCustom !== false)
                .onChange(value => {
                    this.filter.showCustom = value;
                    this.refreshAndDisplay();
                })
            );

        // Sort options
        new Setting(filterContainer)
            .setName('Sort by')
            .setDesc('Sort templates')
            .addDropdown(dropdown => {
                dropdown.addOption('name', 'Name');
                dropdown.addOption('usage', 'Usage count');
                dropdown.addOption('recent', 'Recently used');
                dropdown.setValue('name');
                dropdown.onChange(value => {
                    this.filter.sortByUsage = value === 'usage';
                    this.filter.sortByRecent = value === 'recent';
                    this.refreshAndDisplay();
                });
            });
    }

    private createTemplateList(container: HTMLElement): void {
        const listContainer = container.createDiv({ cls: 'template-library-list' });

        if (this.templates.length === 0) {
            listContainer.createEl('p', {
                text: 'No templates found. Try adjusting your filters or create a new template.',
                cls: 'template-library-empty'
            });
            return;
        }

        // Display template count
        listContainer.createEl('p', {
            text: `Found ${this.templates.length} template${this.templates.length !== 1 ? 's' : ''}`,
            cls: 'template-library-count'
        });

        // Create template cards
        this.templates.forEach(template => {
            this.createTemplateCard(listContainer, template);
        });
    }

    private getGenreIconName(genre?: string): string {
        const icons: Record<string, string> = {
            fantasy: 'wand',
            scifi: 'rocket',
            mystery: 'search',
            horror: 'skull',
            romance: 'heart',
            historical: 'scroll',
            western: 'sun',
            thriller: 'zap',
            adventure: 'sword',
            drama: 'theater',
        };
        return (genre && icons[genre]) || 'book-open';
    }

    private createTemplateCard(container: HTMLElement, template: Template): void {
        const card = container.createDiv({ cls: 'template-card' });
        const noteBackedTemplate = template as NoteBackedTemplate;
        const isNoteBased = noteBackedTemplate.isNoteBased === true;

        // Thumbnail / icon
        const thumbEl = card.createDiv({ cls: 'template-card-thumbnail' });
        if (template.thumbnail) {
            const img = thumbEl.createEl('img', { cls: 'template-card-thumbnail-img' });
            img.src = template.thumbnail;
            img.alt = template.name;
        } else {
            const iconEl = thumbEl.createEl('span', { cls: 'template-card-thumbnail-icon' });
            setIcon(iconEl, this.getGenreIconName(template.genre));
        }

        // Header
        const header = card.createDiv({ cls: 'template-card-header' });
        header.createEl('h3', { text: template.name });

        if (template.isBuiltIn) {
            header.createEl('span', { text: 'Built-in', cls: 'template-badge template-badge-builtin' });
        }

        if (isNoteBased) {
            header.createEl('span', { text: 'Note-based', cls: 'template-badge template-badge-note' });
        }

        // Description
        card.createEl('p', { text: template.description, cls: 'template-card-description' });

        // Metadata
        const meta = card.createDiv({ cls: 'template-card-meta' });
        meta.createEl('span', { text: `Genre: ${template.genre}` });
        meta.createEl('span', { text: `Category: ${template.category}` });

        if (template.usageCount && template.usageCount > 0) {
            meta.createEl('span', { text: `Used: ${template.usageCount} times` });
        }

        // Entity types
        if (template.entityTypes && template.entityTypes.length > 0) {
            const entityTypesEl = card.createDiv({ cls: 'template-card-entity-types' });
            entityTypesEl.createEl('span', { text: 'Contains: ' });
            template.entityTypes.forEach(type => {
                entityTypesEl.createEl('span', {
                    text: type,
                    cls: 'template-entity-type-badge'
                });
            });
        }

        // Tags
        if (template.tags && template.tags.length > 0) {
            const tagsEl = card.createDiv({ cls: 'template-card-tags' });
            template.tags.forEach(tag => {
                tagsEl.createEl('span', { text: tag, cls: 'template-tag' });
            });
        }

        // Actions
        const actions = card.createDiv({ cls: 'template-card-actions' });

        const applyButton = actions.createEl('button', { text: 'Apply template', cls: 'mod-cta' });
        applyButton.addEventListener('click', () => { void this.handleUseTemplate(template); });

        if (isNoteBased) {
            // Note-based template actions
            const editInObsidianButton = actions.createEl('button', { text: 'Edit in Obsidian' });
            editInObsidianButton.addEventListener('click', () => this.handleEditNoteTemplate(template));

            const convertButton = actions.createEl('button', { text: 'Convert to full template' });
            convertButton.addEventListener('click', () => this.handleConvertToFullTemplate(template));

            const deleteButton = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
            deleteButton.addEventListener('click', () => { void this.handleDeleteNoteTemplate(template); });
        } else {
            // JSON template actions
            if (template.isEditable) {
                const editButton = actions.createEl('button', { text: 'Edit' });
                editButton.addEventListener('click', () => this.handleEditTemplate(template));

                const deleteButton = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
                deleteButton.addEventListener('click', () => { void this.handleDeleteTemplate(template); });
            }

            const duplicateButton = actions.createEl('button', { text: 'Duplicate' });
            duplicateButton.addEventListener('click', () => { void this.handleDuplicateTemplate(template); });
        }

        const exportButton = actions.createEl('button', { text: 'Export' });
        exportButton.addEventListener('click', () => { void this.handleExportTemplate(template); });
    }

    private refreshAndDisplay(): void {
        this.refreshTemplates();
        this.displayContent();
    }

    private async handleUseTemplate(template: Template): Promise<void> {
        

        // Check if there's an active story
        const activeStory = this.plugin.getActiveStory();
        

        if (!activeStory) {
            new Notice('Please select or create a story first before applying a template.');
            return;
        }

        // If onTemplateSelected callback is provided, use it (for entity creation modals)
        if (this.onTemplateSelected) {
            
            this.onTemplateSelected(template);
            this.close();
            return;
        }

        // Otherwise, apply the template directly to the story
        
        this.close(); // Close the library modal first

        // Apply template with variable collection prompt
        await this.plugin.applyTemplateWithPrompt(template);
        
    }

    private handleEditTemplate(template: Template): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            template,
            (updatedTemplate) => { void (async () => {
                this.refreshAndDisplay();
            })(); }
        ).open();
    }

    private async handleDeleteTemplate(template: Template): Promise<void> {
        const confirmed = await this.confirmDelete(template.name);
        if (confirmed) {
            try {
                await this.plugin.templateManager.deleteTemplate(template.id);
                this.refreshAndDisplay();
            } catch (error) {
                
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Failed to delete template: ${message}`);
            }
        }
    }

    private async handleDuplicateTemplate(template: Template): Promise<void> {
        try {
            const newName = `${template.name} (Copy)`;
            await this.plugin.templateManager.copyTemplate(
                template.id,
                newName
            );
            new Notice(`Template duplicated as "${newName}"`);
            this.refreshAndDisplay();
        } catch (error) {
            
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to duplicate template: ${message}`);
        }
    }

    private handleCreateNew(): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            null, // null = new template
            (newTemplate) => { void (async () => {
                this.refreshAndDisplay();
            })(); }
        ).open();
    }

    private async handleExportTemplate(template: Template): Promise<void> {
        try {
            const sharedPackage = this.plugin.templateManager.exportSharedTemplatePackage([template.id], template.name);
            const exportFolder = normalizePath(`${this.plugin.templateManager.getTemplateFolder()}/Exports`);
            await this.ensureFolder(exportFolder);

            const safeName = this.toSafeFileName(template.name || template.id);
            const filePath = normalizePath(`${exportFolder}/${safeName}.storyteller-template.json`);
            const content = JSON.stringify(sharedPackage, null, 2);
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.create(filePath, content);
            }
            new Notice(`Template exported to ${filePath}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to export template: ${message}`);
        }
    }

    private handleImportSharedTemplate(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.storyteller-template.json,application/json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                void this.importSharedTemplateContent(String(reader.result ?? ''));
            };
            reader.onerror = () => {
                new Notice('Failed to read template package file');
            };
            reader.readAsText(file);
        });
        input.click();
    }

    private async importSharedTemplateContent(content: string): Promise<void> {
        try {
            const sharedPackage = JSON.parse(content) as SharedTemplatePackage;
            const imported = await this.plugin.templateManager.importSharedTemplatePackage(sharedPackage);
            new Notice(`Imported ${imported.length} template${imported.length !== 1 ? 's' : ''}`);
            this.refreshAndDisplay();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to import template package: ${message}`);
        }
    }

    private async ensureFolder(folderPath: string): Promise<void> {
        const normalizedPath = normalizePath(folderPath);
        if (this.app.vault.getAbstractFileByPath(normalizedPath)) {
            return;
        }

        const parts = normalizedPath.split('/');
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(currentPath)) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    private toSafeFileName(name: string): string {
        const safeName = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 100);
        return safeName || 'template';
    }

    private handleEditNoteTemplate(template: Template): void {
        const noteFilePath = (template as NoteBackedTemplate).noteFilePath;
        if (noteFilePath) {
            // Open the note file in Obsidian
            const file = this.app.vault.getAbstractFileByPath(noteFilePath);
            if (file) {
                void this.app.workspace.openLinkText(noteFilePath, '', true);
                this.close();
            } else {
                new Notice('Template note file not found');
            }
        } else {
            new Notice('Template note file path not available');
        }
    }

    private handleConvertToFullTemplate(template: Template): void {
        // Convert note-based template to full template editor format
        // This opens the template in the full editor, allowing conversion
        new TemplateEditorModal(
            this.app,
            this.plugin,
            template,
            (updatedTemplate) => { void (async () => {
                // After saving, the template will be in JSON format
                // Optionally delete the note-based version
                this.refreshAndDisplay();
            })(); }
        ).open();
    }

    private async handleDeleteNoteTemplate(template: Template): Promise<void> {
        const confirmed = await this.confirmDelete(template.name);
        if (confirmed) {
            try {
                if (this.plugin.templateNoteManager) {
                    await this.plugin.templateNoteManager.deleteNoteTemplate(template.id);
                } else {
                    await this.plugin.templateManager.deleteTemplate(template.id);
                }
                this.refreshAndDisplay();
            } catch (error) {
                
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Failed to delete template: ${message}`);
            }
        }
    }

    private async confirmDelete(templateName: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new ConfirmDeleteModal(this.app, templateName, resolve);
            modal.open();
        });
    }
}

/**
 * Confirmation modal for template deletion
 */
class ConfirmDeleteModal extends ResponsiveModal {
    private templateName: string;
    private onConfirm: (confirmed: boolean) => void;

    constructor(app: App, templateName: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.templateName = templateName;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Delete template?' });
        contentEl.createEl('p', {
            text: `Are you sure you want to delete the template "${this.templateName}"? This action cannot be undone.`
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.onConfirm(false);
            this.close();
        });

        const deleteButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }
}
