/**
 * Template Note Manager
 * Manages note-based templates, syncs to JSON, and handles file operations
 */

import { App, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { Template, TemplateCategory, TemplateEntityType, TemplateGenre } from './TemplateTypes';
import { NoteToTemplateConverter } from './NoteToTemplateConverter';
import { TemplateStorageManager } from './TemplateStorageManager';
import { parseFrontmatterFromContent as parseFM } from '../yaml/EntitySections';
import { TEMPLATE_ENTITY_TYPES, getTemplateEntityFolder } from './TemplateEntityRegistry';

const TEMPLATE_GENRES: readonly TemplateGenre[] = [
    'fantasy',
    'scifi',
    'mystery',
    'horror',
    'romance',
    'historical',
    'western',
    'thriller',
    'custom'
];

const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
    'full-world',
    'entity-set',
    'single-entity'
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTemplateGenre(value: unknown): TemplateGenre {
    return typeof value === 'string' && TEMPLATE_GENRES.includes(value as TemplateGenre)
        ? value as TemplateGenre
        : 'custom';
}

function asTemplateCategory(value: unknown): TemplateCategory {
    return typeof value === 'string' && TEMPLATE_CATEGORIES.includes(value as TemplateCategory)
        ? value as TemplateCategory
        : 'single-entity';
}

function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(item => String(item));
    }
    return value === undefined ? [] : [String(value)];
}

export class TemplateNoteManager {
    private app: App;
    private templateStorageManager: TemplateStorageManager;
    private notesFolder: string;
    private noteTemplates: Map<string, Template> = new Map();
    private disableFolderCreation: boolean;

    constructor(
        app: App,
        templateStorageManager: TemplateStorageManager,
        notesFolder: string = 'StorytellerSuite/Templates/Notes',
        disableFolderCreation: boolean = false
    ) {
        this.app = app;
        this.templateStorageManager = templateStorageManager;
        this.notesFolder = notesFolder;
        this.disableFolderCreation = disableFolderCreation;
    }

    /**
     * Initialize the note template system
     */
    async initialize(): Promise<void> {
        // Only create folders if not disabled
        if (!this.disableFolderCreation) {
            await this.ensureNotesFolderExists();
        }
        await this.loadNoteTemplates();
    }

    /**
     * Ensure the notes folder exists
     */
    private async ensureNotesFolderExists(): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(this.notesFolder);
        if (!folder) {
            try {
                await this.app.vault.createFolder(this.notesFolder);
            } catch {
            	// intentional
                
            }
        }

        // Ensure entity type subfolders exist
        for (const entityType of TEMPLATE_ENTITY_TYPES) {
            const folderName = this.getEntityTypeFolder(entityType);
            const folderPath = `${this.notesFolder}/${folderName}`;
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                try {
                    await this.app.vault.createFolder(folderPath);
                } catch {
                    // Folder might already exist
                }
            }
        }
    }

    /**
     * Get the folder name for a given entity type
     */
    private getEntityTypeFolder(entityType: TemplateEntityType): string {
        return getTemplateEntityFolder(entityType);
    }

    /**
     * Load all note-based templates
     */
    async loadNoteTemplates(): Promise<void> {
        this.noteTemplates.clear();

        const folder = this.app.vault.getAbstractFileByPath(this.notesFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return;
        }

        // Load from root notes folder
        await this.loadTemplatesFromFolder(this.notesFolder);

        // Load from entity type subfolders
        for (const entityType of TEMPLATE_ENTITY_TYPES) {
            const folderName = this.getEntityTypeFolder(entityType);
            const folderPath = `${this.notesFolder}/${folderName}`;
            await this.loadTemplatesFromFolder(folderPath);
        }
    }

    /**
     * Load templates from a specific folder
     */
    private async loadTemplatesFromFolder(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            return;
        }

        const templateFiles = folder.children.filter(
            file => file instanceof TFile && file.extension === 'md'
        ) as TFile[];

        for (const file of templateFiles) {
            try {
                const template = await this.loadTemplateFromNote(file);
                if (template) {
                    this.noteTemplates.set(template.id, template);
                }
            } catch {
            	// intentional
                
            }
        }
    }

    /**
     * Extract content from note (helper method)
     */
    private extractContent(content: string): {
        yamlContent: string;
        markdownContent: string;
        frontmatter: Record<string, unknown>;
    } {
        let yamlContent = '';
        let markdownContent = '';
        let frontmatter: Record<string, unknown> = {};

        if (content.startsWith('---')) {
            const frontmatterEndIndex = content.indexOf('\n---', 3);
            if (frontmatterEndIndex !== -1) {
                yamlContent = content.substring(3, frontmatterEndIndex).trim();
                markdownContent = content.substring(frontmatterEndIndex + 4).trim();
                frontmatter = parseFrontmatterFromContent(content) || {};
            } else {
                markdownContent = content;
            }
        } else {
            markdownContent = content;
        }

        return { yamlContent, markdownContent, frontmatter };
    }

    /**
     * Load a template from a note file
     */
    async loadTemplateFromNote(file: TFile): Promise<Template | null> {
        try {
            const content = await this.app.vault.read(file);
            const { frontmatter } = this.extractContent(content);

            // Detect entity type
            const entityType = NoteToTemplateConverter.detectEntityType(file, frontmatter);
            if (!entityType) {
                
                return null;
            }

            // Extract metadata from frontmatter or use defaults
            const metadata = {
                name: typeof frontmatter.templateName === 'string' ? frontmatter.templateName : file.basename,
                description: typeof frontmatter.templateDescription === 'string' ? frontmatter.templateDescription : '',
                genre: asTemplateGenre(frontmatter.templateGenre),
                category: asTemplateCategory(frontmatter.templateCategory),
                tags: asStringArray(frontmatter.templateTags)
            };

            // Convert note to template
            const template = await NoteToTemplateConverter.convertNoteToTemplate(
                this.app,
                file,
                entityType,
                metadata
            );

            // Ensure note file path is stored
            template.isNoteBased = true;
            template.noteFilePath = file.path;

            return template;
        } catch {
            
            return null;
        }
    }

    /**
     * Save a note as a template
     */
    async saveNoteAsTemplate(
        sourceFile: TFile,
        entityType: TemplateEntityType,
        metadata: {
            name: string;
            description: string;
            genre: string;
            category: string;
            tags: string[];
        }
    ): Promise<Template> {
        // Read source file content
        const content = await this.app.vault.read(sourceFile);

        // Determine target folder
        const entityTypeFolder = this.getEntityTypeFolder(entityType);
        const targetFolderPath = `${this.notesFolder}/${entityTypeFolder}`;

        // Ensure target folder exists
        await this.ensureNotesFolderExists();

        // Generate safe filename
        const safeName = this.generateSafeFileName(metadata.name);
        const targetFilePath = `${targetFolderPath}/${safeName}.md`;

        // Add template metadata to frontmatter (including entityType for reliable detection)
        const enhancedContent = this.addTemplateMetadataToContent(content, {
            ...metadata,
            entityType
        });

        // Create or update the template note file
        const existingFile = this.app.vault.getAbstractFileByPath(targetFilePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, enhancedContent);
        } else {
            await this.app.vault.create(targetFilePath, enhancedContent);
        }

        // Load the template from the new note
        const templateFile = this.app.vault.getAbstractFileByPath(targetFilePath);
        if (!(templateFile instanceof TFile)) {
            throw new Error('Failed to create template note file');
        }
        const template = await this.loadTemplateFromNote(templateFile);

        if (!template) {
            throw new Error('Failed to create template from note');
        }

        // Sync to JSON for compatibility
        await this.syncNoteToJson(template);

        // Update cache
        this.noteTemplates.set(template.id, template);

        return template;
    }

    /**
     * Add template metadata to note content frontmatter
     */
    private addTemplateMetadataToContent(
        content: string,
        metadata: {
            name: string;
            description: string;
            genre: string;
            category: string;
            tags: string[];
            entityType?: string;
        }
    ): string {
        let frontmatter: Record<string, unknown> = {};
        let markdownContent = content;

        // Extract existing frontmatter
        if (content.startsWith('---')) {
            const frontmatterEndIndex = content.indexOf('\n---', 3);
            if (frontmatterEndIndex !== -1) {
                const frontmatterContent = content.substring(3, frontmatterEndIndex);
                try {
                    const parsed = parseYaml(frontmatterContent) as unknown;
                    frontmatter = isRecord(parsed) ? parsed : {};
                } catch {
                    // Fallback parsing
                    frontmatter = parseFrontmatterFromContent(content) || {};
                }
                markdownContent = content.substring(frontmatterEndIndex + 4).trim();
            }
        }

        // Add template metadata
        frontmatter.template = true;
        frontmatter.templateName = metadata.name;
        frontmatter.templateDescription = metadata.description;
        frontmatter.templateGenre = metadata.genre;
        frontmatter.templateCategory = metadata.category;
        if (metadata.entityType) {
            frontmatter.templateEntityType = metadata.entityType;
        }
        if (metadata.tags.length > 0) {
            frontmatter.templateTags = metadata.tags;
        }

        // Reconstruct content with enhanced frontmatter
        const yamlContent = stringifyYaml(frontmatter);
        return `---\n${yamlContent}---\n\n${markdownContent}`;
    }

    /**
     * Generate a safe filename from template name
     */
    private generateSafeFileName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 100); // Limit length
    }

    /**
     * Sync note-based template to JSON for compatibility
     */
    async syncNoteToJson(template: Template): Promise<void> {
        try {
            // Create a copy without note-specific fields
            const jsonTemplate = { ...template };
            delete jsonTemplate.isNoteBased;
            delete jsonTemplate.noteFilePath;

            // Save via template storage manager
            await this.templateStorageManager.saveTemplate(jsonTemplate);
        } catch {
            
            // Don't throw - note is the source of truth
        }
    }

    /**
     * Get all note-based templates
     */
    getAllNoteTemplates(): Template[] {
        return Array.from(this.noteTemplates.values());
    }

    /**
     * Get template by ID
     */
    getNoteTemplate(id: string): Template | undefined {
        return this.noteTemplates.get(id);
    }

    /**
     * Delete a note-based template
     */
    async deleteNoteTemplate(id: string): Promise<void> {
        const template = this.noteTemplates.get(id);
        if (!template) {
            throw new Error('Template not found');
        }

        const noteFilePath = template.noteFilePath;
        if (typeof noteFilePath === 'string') {
            const file = this.app.vault.getAbstractFileByPath(noteFilePath);
            if (file instanceof TFile) {
                await this.app.fileManager.trashFile(file);
            }
        }

        // Also delete JSON version if it exists
        try {
            await this.templateStorageManager.deleteTemplate(id);
        } catch {
            // JSON version might not exist, that's okay
        }

        this.noteTemplates.delete(id);
    }

    /**
     * Handle note file change (sync to JSON)
     */
    async handleNoteChange(file: TFile): Promise<void> {
        // Check if this is a template note
        if (!file.path.startsWith(this.notesFolder) || file.extension !== 'md') {
            return;
        }

        // Reload template from note
        const template = await this.loadTemplateFromNote(file);
        if (template) {
            // Update cache
            this.noteTemplates.set(template.id, template);

            // Sync to JSON
            await this.syncNoteToJson(template);
        }
    }
}

// Helper function for parsing frontmatter
function parseFrontmatterFromContent(content: string): Record<string, unknown> | undefined {
    const frontmatter = parseFM(content) as unknown;
    return isRecord(frontmatter) ? frontmatter : undefined;
}

