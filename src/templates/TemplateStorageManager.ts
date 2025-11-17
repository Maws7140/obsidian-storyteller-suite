/**
 * Template Storage Manager
 * Handles loading, saving, and managing templates
 */

import { App, Notice, TFolder, TFile } from 'obsidian';
import {
    Template,
    TemplateFilter,
    TemplateValidationResult,
    TemplateExportData,
    TemplateStats,
    TemplateEntityType
} from './TemplateTypes';

export class TemplateStorageManager {
    private app: App;
    private builtInTemplates: Map<string, Template> = new Map();
    private userTemplates: Map<string, Template> = new Map();
    private templateFolder: string;

    constructor(app: App, templateFolder: string = 'StorytellerSuite/Templates') {
        this.app = app;
        this.templateFolder = templateFolder;
    }

    /**
     * Initialize the template system
     */
    async initialize(): Promise<void> {
        // Load built-in templates
        await this.loadBuiltInTemplates();

        // Load user templates from vault
        await this.loadUserTemplates();
    }

    /**
     * Load built-in templates from plugin resources
     */
    private async loadBuiltInTemplates(): Promise<void> {
        // Built-in templates will be imported from separate files
        // This allows us to ship them with the plugin
        try {
            const { FANTASY_KINGDOM_TEMPLATE } = await import('./prebuilt/FantasyKingdom');
            this.builtInTemplates.set(FANTASY_KINGDOM_TEMPLATE.id, FANTASY_KINGDOM_TEMPLATE);
        } catch (error) {
            console.log('Fantasy Kingdom template not yet available');
        }

        try {
            const { CYBERPUNK_METROPOLIS_TEMPLATE } = await import('./prebuilt/CyberpunkMetropolis');
            this.builtInTemplates.set(CYBERPUNK_METROPOLIS_TEMPLATE.id, CYBERPUNK_METROPOLIS_TEMPLATE);
        } catch (error) {
            console.log('Cyberpunk Metropolis template not yet available');
        }

        try {
            const { MURDER_MYSTERY_TEMPLATE } = await import('./prebuilt/MurderMystery');
            this.builtInTemplates.set(MURDER_MYSTERY_TEMPLATE.id, MURDER_MYSTERY_TEMPLATE);
        } catch (error) {
            console.log('Murder Mystery template not yet available');
        }

        // Load built-in character templates
        try {
            const { BUILTIN_CHARACTER_TEMPLATES } = await import('./prebuilt/CharacterTemplates');
            BUILTIN_CHARACTER_TEMPLATES.forEach(template => {
                this.builtInTemplates.set(template.id, template);
            });
        } catch (error) {
            console.log('Character templates not yet available:', error);
        }
    }

    /**
     * Load user templates from vault
     */
    async loadUserTemplates(): Promise<void> {
        this.userTemplates.clear();

        // Ensure template folder exists
        await this.ensureTemplateFolderExists();
        await this.ensureEntityTypeFoldersExist();

        // Load templates from root template folder (for backward compatibility)
        await this.loadTemplatesFromFolder(this.templateFolder);

        // Load templates from entity-type subfolders
        const entityTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];

        for (const entityType of entityTypes) {
            const entityTypeFolder = this.getEntityTypeFolder(entityType);
            const folderPath = `${this.templateFolder}/${entityTypeFolder}`;
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
            file => file instanceof TFile && file.extension === 'json'
        );

        for (const file of templateFiles) {
            if (file instanceof TFile) {
                try {
                    const content = await this.app.vault.read(file);
                    const template = JSON.parse(content) as Template;

                    // Validate template
                    const validation = this.validateTemplate(template);
                    if (validation.isValid) {
                        this.userTemplates.set(template.id, template);
                    } else {
                        console.warn(`Invalid template ${file.path}:`, validation.errors);
                    }
                } catch (error) {
                    console.error(`Error loading template ${file.path}:`, error);
                }
            }
        }
    }

    /**
     * Ensure template folder exists
     */
    private async ensureTemplateFolderExists(): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(this.templateFolder);
        if (!folder) {
            await this.app.vault.createFolder(this.templateFolder);
        }
    }

    /**
     * Get the folder name for a given entity type
     */
    private getEntityTypeFolder(entityType: TemplateEntityType): string {
        const folderMap: Record<TemplateEntityType, string> = {
            character: 'Characters',
            location: 'Locations',
            event: 'Events',
            item: 'Items',
            group: 'Groups',
            culture: 'Cultures',
            economy: 'Economies',
            magicSystem: 'MagicSystems',
            chapter: 'Chapters',
            scene: 'Scenes',
            reference: 'References'
        };
        return folderMap[entityType] || 'General';
    }

    /**
     * Determine the primary entity type for a template
     */
    private determineTemplateEntityType(template: Template): TemplateEntityType {
        // Use the first entity type if available
        if (template.entityTypes && template.entityTypes.length > 0) {
            return template.entityTypes[0];
        }
        // Default to 'character' if not specified
        return 'character';
    }

    /**
     * Ensure all entity type subfolders exist
     */
    private async ensureEntityTypeFoldersExist(): Promise<void> {
        const entityTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];

        for (const entityType of entityTypes) {
            const folderName = this.getEntityTypeFolder(entityType);
            const folderPath = `${this.templateFolder}/${folderName}`;
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                try {
                    await this.app.vault.createFolder(folderPath);
                } catch (error) {
                    // Folder might already exist, ignore error
                }
            }
        }
    }

    /**
     * Get all templates (built-in and user)
     */
    getAllTemplates(): Template[] {
        return [
            ...Array.from(this.builtInTemplates.values()),
            ...Array.from(this.userTemplates.values())
        ];
    }

    /**
     * Get filtered templates
     */
    getFilteredTemplates(filter: TemplateFilter): Template[] {
        let templates = this.getAllTemplates();

        // Filter by built-in/custom
        if (filter.showBuiltIn === false) {
            templates = templates.filter(t => !t.isBuiltIn);
        }
        if (filter.showCustom === false) {
            templates = templates.filter(t => t.isBuiltIn);
        }

        // Filter by genre
        if (filter.genre && filter.genre.length > 0) {
            templates = templates.filter(t => filter.genre!.includes(t.genre));
        }

        // Filter by category
        if (filter.category && filter.category.length > 0) {
            templates = templates.filter(t => filter.category!.includes(t.category));
        }

        // Filter by entity types
        if (filter.entityTypes && filter.entityTypes.length > 0) {
            templates = templates.filter(t => {
                if (!t.entityTypes) return false;
                return filter.entityTypes!.some(type => t.entityTypes!.includes(type));
            });
        }

        // Filter by author
        if (filter.author && filter.author.length > 0) {
            templates = templates.filter(t => filter.author!.includes(t.author));
        }

        // Filter by search text
        if (filter.searchText) {
            const searchLower = filter.searchText.toLowerCase();
            templates = templates.filter(t =>
                t.name.toLowerCase().includes(searchLower) ||
                t.description.toLowerCase().includes(searchLower) ||
                t.tags.some(tag => tag.toLowerCase().includes(searchLower))
            );
        }

        // Filter by entity count
        const stats = templates.map(t => ({ template: t, stats: this.getTemplateStats(t) }));
        let filteredStats = stats;

        if (filter.minEntities !== undefined) {
            filteredStats = filteredStats.filter(s => s.stats.totalEntities >= filter.minEntities!);
        }
        if (filter.maxEntities !== undefined) {
            filteredStats = filteredStats.filter(s => s.stats.totalEntities <= filter.maxEntities!);
        }

        templates = filteredStats.map(s => s.template);

        // Sort templates
        if (filter.sortByUsage) {
            templates = templates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        } else if (filter.sortByRecent) {
            templates = templates.sort((a, b) => {
                const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
                const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
                return bTime - aTime;
            });
        }

        return templates;
    }

    /**
     * Get template by ID
     */
    getTemplate(id: string): Template | undefined {
        return this.builtInTemplates.get(id) || this.userTemplates.get(id);
    }

    /**
     * Save user template
     */
    async saveTemplate(template: Template): Promise<void> {
        if (template.isBuiltIn) {
            throw new Error('Cannot save built-in templates. Create a copy first.');
        }

        // Validate template
        const validation = this.validateTemplate(template);
        if (!validation.isValid) {
            throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
        }

        // Update modified timestamp
        template.modified = new Date().toISOString();

        // Determine entity type and folder
        const entityType = this.determineTemplateEntityType(template);
        const entityTypeFolder = this.getEntityTypeFolder(entityType);
        const entityTypeFolderPath = `${this.templateFolder}/${entityTypeFolder}`;

        // Ensure entity type subfolder exists
        await this.ensureTemplateFolderExists();
        await this.ensureEntityTypeFoldersExist();

        // Save to vault in entity-type-specific folder
        const filePath = `${entityTypeFolderPath}/${template.id}.json`;
        const content = JSON.stringify(template, null, 2);

        // Check if template exists in old location (for migration)
        const oldFilePath = `${this.templateFolder}/${template.id}.json`;
        const oldFile = this.app.vault.getAbstractFileByPath(oldFilePath);
        if (oldFile instanceof TFile) {
            // Delete old file if it exists
            await this.app.vault.delete(oldFile);
        }

        // Save to new location
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }

        // Update cache
        this.userTemplates.set(template.id, template);

        new Notice(`Template "${template.name}" saved successfully`);
    }

    /**
     * Delete user template
     */
    async deleteTemplate(id: string): Promise<void> {
        const template = this.userTemplates.get(id);
        if (!template) {
            throw new Error('Template not found or is built-in');
        }

        // Try to find and delete the template file
        // Check in entity-type folder first
        const entityType = this.determineTemplateEntityType(template);
        const entityTypeFolder = this.getEntityTypeFolder(entityType);
        const entityTypeFolderPath = `${this.templateFolder}/${entityTypeFolder}`;
        let filePath = `${entityTypeFolderPath}/${id}.json`;
        let file = this.app.vault.getAbstractFileByPath(filePath);

        // If not found in entity-type folder, check root template folder (backward compatibility)
        if (!file) {
            filePath = `${this.templateFolder}/${id}.json`;
            file = this.app.vault.getAbstractFileByPath(filePath);
        }

        if (file instanceof TFile) {
            await this.app.vault.delete(file);
        }

        this.userTemplates.delete(id);
        new Notice(`Template "${template.name}" deleted`);
    }

    /**
     * Copy template (useful for creating editable version of built-in)
     */
    async copyTemplate(sourceId: string, newName: string): Promise<Template> {
        const source = this.getTemplate(sourceId);
        if (!source) {
            throw new Error('Source template not found');
        }

        const newTemplate: Template = {
            ...JSON.parse(JSON.stringify(source)), // Deep clone
            id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: newName,
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };

        await this.saveTemplate(newTemplate);
        return newTemplate;
    }

    /**
     * Validate template structure and references
     */
    validateTemplate(template: Template): TemplateValidationResult {
        // Use the enhanced TemplateValidator
        const { TemplateValidator } = require('./TemplateValidator');
        return TemplateValidator.validate(template);
    }

    /**
     * Get template statistics
     */
    getTemplateStats(template: Template): TemplateStats {
        const entities = template.entities;
        const entityCounts: Record<TemplateEntityType, number> = {
            character: entities.characters?.length || 0,
            location: entities.locations?.length || 0,
            event: entities.events?.length || 0,
            item: entities.items?.length || 0,
            group: entities.groups?.length || 0,
            culture: entities.cultures?.length || 0,
            economy: entities.economies?.length || 0,
            magicSystem: entities.magicSystems?.length || 0,
            chapter: entities.chapters?.length || 0,
            scene: entities.scenes?.length || 0,
            reference: entities.references?.length || 0
        };

        const totalEntities = Object.values(entityCounts).reduce((a, b) => a + b, 0);

        // Count total relationships
        let totalRelationships = 0;

        const countRelationships = (items: any[] | undefined, fields: string[]) => {
            if (!items) return;
            items.forEach(item => {
                fields.forEach(field => {
                    const value = item[field];
                    if (Array.isArray(value)) {
                        totalRelationships += value.length;
                    } else if (value) {
                        totalRelationships += 1;
                    }
                });
            });
        };

        countRelationships(entities.characters, ['relationships', 'locations', 'events', 'groups', 'connections']);
        countRelationships(entities.locations, ['groups', 'connections']);
        countRelationships(entities.events, ['characters', 'groups', 'connections', 'dependencies']);
        countRelationships(entities.items, ['associatedEvents', 'groups']);
        countRelationships(entities.groups, ['members', 'territories', 'linkedEvents']);

        return {
            totalEntities,
            entityCounts,
            totalRelationships
        };
    }

    /**
     * Export template to JSON file
     */
    async exportTemplate(templateId: string, includeBundledImages: boolean = false): Promise<TemplateExportData> {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error('Template not found');
        }

        const exportData: TemplateExportData = {
            template,
            exportVersion: '1.0.0',
            exportedAt: new Date().toISOString()
        };

        // TODO: Optionally bundle images as base64
        if (includeBundledImages) {
            exportData.bundledImages = [];
            // Collect all image paths and encode them
            // This would require iterating through all entities and their image fields
        }

        return exportData;
    }

    /**
     * Import template from export data
     */
    async importTemplate(exportData: TemplateExportData, generateNewId: boolean = true): Promise<Template> {
        let template = exportData.template;

        if (generateNewId) {
            // Generate new ID to avoid conflicts
            template = {
                ...template,
                id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                isBuiltIn: false,
                isEditable: true,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            };
        }

        // TODO: Handle bundled images if present
        if (exportData.bundledImages && exportData.bundledImages.length > 0) {
            // Extract and save bundled images to vault
        }

        await this.saveTemplate(template);
        return template;
    }

    /**
     * Update template folder path
     */
    setTemplateFolder(newPath: string): void {
        this.templateFolder = newPath;
    }

    /**
     * Get template folder path
     */
    getTemplateFolder(): string {
        return this.templateFolder;
    }

    /**
     * Increment template usage count
     */
    async incrementUsageCount(templateId: string): Promise<void> {
        const template = this.getTemplate(templateId);
        if (!template) return;

        // Update usage count and last used
        template.usageCount = (template.usageCount || 0) + 1;
        template.lastUsed = new Date().toISOString();

        // Save if it's a user template
        if (!template.isBuiltIn) {
            await this.saveTemplate(template);
        }

        // Update cache
        this.userTemplates.set(templateId, template);
    }

    /**
     * Get templates by entity type
     */
    getTemplatesByEntityType(entityType: TemplateEntityType): Template[] {
        return this.getAllTemplates().filter(t =>
            t.entityTypes?.includes(entityType)
        );
    }

    /**
     * Get recently used templates
     */
    getRecentlyUsedTemplates(limit: number = 5): Template[] {
        return this.getAllTemplates()
            .filter(t => t.lastUsed)
            .sort((a, b) => {
                const aTime = new Date(a.lastUsed!).getTime();
                const bTime = new Date(b.lastUsed!).getTime();
                return bTime - aTime;
            })
            .slice(0, limit);
    }

    /**
     * Get most popular templates
     */
    getMostPopularTemplates(limit: number = 5): Template[] {
        return this.getAllTemplates()
            .filter(t => t.usageCount && t.usageCount > 0)
            .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
            .slice(0, limit);
    }

    /**
     * Auto-populate entityTypes field based on actual entities
     */
    autoPopulateEntityTypes(template: Template): void {
        const entityTypes: TemplateEntityType[] = [];
        const entities = template.entities;

        if (entities.characters && entities.characters.length > 0) entityTypes.push('character');
        if (entities.locations && entities.locations.length > 0) entityTypes.push('location');
        if (entities.events && entities.events.length > 0) entityTypes.push('event');
        if (entities.items && entities.items.length > 0) entityTypes.push('item');
        if (entities.groups && entities.groups.length > 0) entityTypes.push('group');
        if (entities.cultures && entities.cultures.length > 0) entityTypes.push('culture');
        if (entities.economies && entities.economies.length > 0) entityTypes.push('economy');
        if (entities.magicSystems && entities.magicSystems.length > 0) entityTypes.push('magicSystem');
        if (entities.chapters && entities.chapters.length > 0) entityTypes.push('chapter');
        if (entities.scenes && entities.scenes.length > 0) entityTypes.push('scene');
        if (entities.references && entities.references.length > 0) entityTypes.push('reference');

        template.entityTypes = entityTypes;
    }
}
