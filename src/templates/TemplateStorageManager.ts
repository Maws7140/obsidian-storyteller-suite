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
    }

    /**
     * Load user templates from vault
     */
    async loadUserTemplates(): Promise<void> {
        this.userTemplates.clear();

        // Ensure template folder exists
        await this.ensureTemplateFolderExists();

        // Get all JSON files in template folder
        const folder = this.app.vault.getAbstractFileByPath(this.templateFolder);
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

        return filteredStats.map(s => s.template);
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

        // Save to vault
        const filePath = `${this.templateFolder}/${template.id}.json`;
        const content = JSON.stringify(template, null, 2);

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.ensureTemplateFolderExists();
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

        const filePath = `${this.templateFolder}/${id}.json`;
        const file = this.app.vault.getAbstractFileByPath(filePath);

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
        const result: TemplateValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            brokenReferences: []
        };

        // Check required fields
        if (!template.id) {
            result.errors.push('Template ID is required');
        }
        if (!template.name) {
            result.errors.push('Template name is required');
        }
        if (!template.version) {
            result.errors.push('Template version is required');
        }

        // Collect all template IDs
        const allIds = new Set<string>();
        const entities = template.entities;

        // Helper to add IDs
        const addIds = (items: any[] | undefined) => {
            if (items) {
                items.forEach(item => {
                    if (item.templateId) {
                        allIds.add(item.templateId);
                    }
                });
            }
        };

        addIds(entities.characters);
        addIds(entities.locations);
        addIds(entities.events);
        addIds(entities.items);
        addIds(entities.groups);
        addIds(entities.cultures);
        addIds(entities.economies);
        addIds(entities.magicSystems);
        addIds(entities.chapters);
        addIds(entities.scenes);
        addIds(entities.references);

        // Validate references in each entity type
        const validateReferences = (
            items: any[] | undefined,
            entityType: TemplateEntityType,
            fields: { field: string; targetType?: TemplateEntityType }[]
        ) => {
            if (!items) return;

            items.forEach(item => {
                fields.forEach(({ field, targetType }) => {
                    const value = item[field];
                    if (!value) return;

                    // Handle arrays
                    if (Array.isArray(value)) {
                        value.forEach((ref: any) => {
                            const refId = typeof ref === 'string' ? ref : ref.target;
                            if (refId && !allIds.has(refId)) {
                                result.brokenReferences.push({
                                    entityType,
                                    entityId: item.templateId,
                                    referenceType: field,
                                    targetId: refId
                                });
                            }
                        });
                    }
                    // Handle single reference
                    else if (typeof value === 'string') {
                        if (!allIds.has(value)) {
                            result.brokenReferences.push({
                                entityType,
                                entityId: item.templateId,
                                referenceType: field,
                                targetId: value
                            });
                        }
                    }
                    // Handle Group members (special case)
                    else if (field === 'members' && Array.isArray(value)) {
                        value.forEach((member: any) => {
                            if (member.name && !allIds.has(member.name)) {
                                result.brokenReferences.push({
                                    entityType,
                                    entityId: item.templateId,
                                    referenceType: 'members',
                                    targetId: member.name
                                });
                            }
                        });
                    }
                });
            });
        };

        // Validate character references
        validateReferences(entities.characters, 'character', [
            { field: 'relationships' },
            { field: 'locations' },
            { field: 'events' },
            { field: 'groups' },
            { field: 'connections' }
        ]);

        // Validate location references
        validateReferences(entities.locations, 'location', [
            { field: 'parentLocation' },
            { field: 'groups' },
            { field: 'connections' }
        ]);

        // Validate event references
        validateReferences(entities.events, 'event', [
            { field: 'characters' },
            { field: 'location' },
            { field: 'groups' },
            { field: 'connections' },
            { field: 'dependencies' }
        ]);

        // Validate item references
        validateReferences(entities.items, 'item', [
            { field: 'currentOwner' },
            { field: 'pastOwners' },
            { field: 'currentLocation' },
            { field: 'associatedEvents' },
            { field: 'groups' }
        ]);

        // Validate group references
        validateReferences(entities.groups, 'group', [
            { field: 'members' },
            { field: 'territories' },
            { field: 'linkedEvents' },
            { field: 'parentGroup' },
            { field: 'subgroups' },
            { field: 'groupRelationships' }
        ]);

        // Validate culture references
        validateReferences(entities.cultures, 'culture', [
            { field: 'linkedLocations' },
            { field: 'linkedCharacters' },
            { field: 'linkedEvents' },
            { field: 'relatedCultures' },
            { field: 'parentCulture' }
        ]);

        // Validate economy references
        validateReferences(entities.economies, 'economy', [
            { field: 'linkedLocations' },
            { field: 'linkedFactions' },
            { field: 'linkedCultures' },
            { field: 'linkedEvents' }
        ]);

        // Validate magic system references
        validateReferences(entities.magicSystems, 'magicSystem', [
            { field: 'linkedCharacters' },
            { field: 'linkedLocations' },
            { field: 'linkedCultures' },
            { field: 'linkedEvents' },
            { field: 'linkedItems' }
        ]);

        // Add warnings for broken references
        if (result.brokenReferences.length > 0) {
            result.warnings.push(
                `Found ${result.brokenReferences.length} broken references. These will be removed when applying template.`
            );
        }

        result.isValid = result.errors.length === 0;
        return result;
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
}
