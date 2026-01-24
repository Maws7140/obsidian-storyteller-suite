/**
 * Note to Template Converter
 * Converts markdown notes into template objects
 * Auto-detects variables and extracts YAML/markdown content
 */

import { TFile } from 'obsidian';
import {
    Template,
    TemplateEntity,
    TemplateEntities,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType,
    TemplateVariable
} from './TemplateTypes';
import { parseSectionsFromMarkdown, parseFrontmatterFromContent } from '../yaml/EntitySections';

export interface NoteTemplateMetadata {
    templateName?: string;
    templateDescription?: string;
    templateGenre?: TemplateGenre;
    templateCategory?: TemplateCategory;
    templateTags?: string[];
    templateVariables?: TemplateVariable[];
}

/**
 * Convert a note file to a template
 */
export class NoteToTemplateConverter {
    /**
     * Convert a note file to a Template object
     */
    static async convertNoteToTemplate(
        app: any,
        file: TFile,
        entityType: TemplateEntityType,
        metadata: {
            name: string;
            description: string;
            genre: TemplateGenre;
            category: TemplateCategory;
            tags?: string[];
        }
    ): Promise<Template> {
        // Read file content
        const content = await app.vault.read(file);

        // Extract YAML and markdown
        const { yamlContent, markdownContent, frontmatter } = this.extractContent(content);

        // Auto-detect variables
        const variables = this.detectVariables(yamlContent, markdownContent);

        // Check for template metadata in frontmatter
        const templateMetadata = this.extractTemplateMetadata(frontmatter);

        // Override metadata with frontmatter values if present
        const finalMetadata = {
            name: templateMetadata.templateName || metadata.name,
            description: templateMetadata.templateDescription || metadata.description,
            genre: templateMetadata.templateGenre || metadata.genre,
            category: templateMetadata.templateCategory || metadata.category,
            tags: templateMetadata.templateTags || metadata.tags || []
        };

        // Merge detected variables with frontmatter variables
        const finalVariables = this.mergeVariables(
            variables,
            templateMetadata.templateVariables || []
        );

        // Create template entity
        const templateEntity: TemplateEntity<any> = {
            templateId: `${entityType.toUpperCase()}_1`,
            yamlContent,
            markdownContent
        };

        // Create entities container
        const entities: TemplateEntities = {};
        const pluralKey = this.getEntityTypePlural(entityType);
        (entities as any)[pluralKey] = [templateEntity];

        // Create template
        const template: Template = {
            id: `note-template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: finalMetadata.name,
            description: finalMetadata.description,
            genre: finalMetadata.genre,
            category: finalMetadata.category,
            version: '1.0.0',
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: finalMetadata.tags,
            entities,
            entityTypes: [entityType],
            usageCount: 0,
            quickApplyEnabled: true,
            variables: finalVariables.length > 0 ? finalVariables : undefined
        };

        // Mark as note-based template
        (template as any).isNoteBased = true;
        (template as any).noteFilePath = file.path;

        return template;
    }

    /**
     * Extract YAML frontmatter and markdown body from note content
     */
    private static extractContent(content: string): {
        yamlContent: string;
        markdownContent: string;
        frontmatter: Record<string, unknown>;
    } {
        let yamlContent = '';
        let markdownContent = '';
        let frontmatter: Record<string, unknown> = {};

        // Check if content has frontmatter
        if (content.startsWith('---')) {
            const frontmatterEndIndex = content.indexOf('\n---', 3);
            if (frontmatterEndIndex !== -1) {
                // Extract YAML frontmatter (without --- markers)
                yamlContent = content.substring(3, frontmatterEndIndex).trim();
                
                // Extract markdown body (after frontmatter)
                markdownContent = content.substring(frontmatterEndIndex + 4).trim();
                
                // Parse frontmatter
                frontmatter = parseFrontmatterFromContent(content) || {};
            } else {
                // No closing ---, treat entire content as markdown
                markdownContent = content;
            }
        } else {
            // No frontmatter, entire content is markdown
            markdownContent = content;
        }

        return { yamlContent, markdownContent, frontmatter };
    }

    /**
     * Auto-detect variables in YAML and markdown content
     * Looks for {{variableName}} patterns
     */
    private static detectVariables(
        yamlContent: string,
        markdownContent: string
    ): TemplateVariable[] {
        const variablePattern = /\{\{([a-zA-Z][a-zA-Z0-9]*)(?::([^}]+))?\}\}/g;
        const variables = new Map<string, TemplateVariable>();

        // Scan YAML content
        this.scanForVariables(yamlContent, variablePattern, variables);

        // Scan markdown content
        this.scanForVariables(markdownContent, variablePattern, variables);

        return Array.from(variables.values());
    }

    /**
     * Scan text for variable patterns and add to variables map
     */
    private static scanForVariables(
        text: string,
        pattern: RegExp,
        variables: Map<string, TemplateVariable>
    ): void {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const varName = match[1];
            const defaultValue = match[2] || undefined;

            // Skip if already added
            if (variables.has(varName)) {
                continue;
            }

            // Create variable
            const variable: TemplateVariable = {
                name: varName,
                label: this.formatVariableLabel(varName),
                type: 'text', // Default to text, can be inferred later
                defaultValue: defaultValue
            };

            variables.set(varName, variable);
        }
    }

    /**
     * Format variable name to human-readable label
     * e.g., "heroName" -> "Hero Name"
     */
    private static formatVariableLabel(varName: string): string {
        // Convert camelCase to Title Case
        return varName
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Extract template metadata from frontmatter
     */
    private static extractTemplateMetadata(
        frontmatter: Record<string, unknown>
    ): NoteTemplateMetadata {
        const metadata: NoteTemplateMetadata = {};

        if (frontmatter.templateName) {
            metadata.templateName = String(frontmatter.templateName);
        }
        if (frontmatter.templateDescription) {
            metadata.templateDescription = String(frontmatter.templateDescription);
        }
        if (frontmatter.templateGenre) {
            metadata.templateGenre = frontmatter.templateGenre as TemplateGenre;
        }
        if (frontmatter.templateCategory) {
            metadata.templateCategory = frontmatter.templateCategory as TemplateCategory;
        }
        if (frontmatter.templateTags) {
            if (Array.isArray(frontmatter.templateTags)) {
                metadata.templateTags = frontmatter.templateTags.map(t => String(t));
            } else {
                metadata.templateTags = [String(frontmatter.templateTags)];
            }
        }
        if (frontmatter.templateVariables) {
            if (Array.isArray(frontmatter.templateVariables)) {
                metadata.templateVariables = frontmatter.templateVariables as TemplateVariable[];
            }
        }

        return metadata;
    }

    /**
     * Merge detected variables with frontmatter variables
     * Frontmatter variables take precedence
     */
    private static mergeVariables(
        detected: TemplateVariable[],
        frontmatter: TemplateVariable[]
    ): TemplateVariable[] {
        const merged = new Map<string, TemplateVariable>();

        // Add detected variables first
        detected.forEach(v => merged.set(v.name, v));

        // Override with frontmatter variables
        frontmatter.forEach(v => merged.set(v.name, v));

        return Array.from(merged.values());
    }

    /**
     * Get plural form of entity type
     */
    private static getEntityTypePlural(entityType: TemplateEntityType): string {
        const pluralMap: Record<TemplateEntityType, string> = {
            character: 'characters',
            location: 'locations',
            event: 'events',
            item: 'items',
            group: 'groups',
            map: 'maps',
            culture: 'cultures',
            economy: 'economies',
            magicSystem: 'magicSystems',
            chapter: 'chapters',
            scene: 'scenes',
            reference: 'references'
        };
        return pluralMap[entityType];
    }

    /**
     * Detect entity type from note file path or frontmatter
     */
    static detectEntityType(
        file: TFile,
        frontmatter?: Record<string, unknown>
    ): TemplateEntityType | null {
        // Check frontmatter first
        if (frontmatter) {
            // Check templateEntityType (new field we add when saving)
            if (frontmatter.templateEntityType) {
                const type = String(frontmatter.templateEntityType);
                const match = this.findMatchingEntityType(type);
                if (match) return match;
            }
            // Check type field
            if (frontmatter.type) {
                const type = String(frontmatter.type);
                const match = this.findMatchingEntityType(type);
                if (match) return match;
            }
            // Check entityType field
            if (frontmatter.entityType) {
                const type = String(frontmatter.entityType);
                const match = this.findMatchingEntityType(type);
                if (match) return match;
            }
        }

        // Check file path
        const path = file.path.toLowerCase();
        const pathParts = path.split('/');

        // Check folder names
        for (const part of pathParts) {
            const normalized = part.replace(/s$/, ''); // Remove plural 's'
            const match = this.findMatchingEntityType(normalized);
            if (match) return match;
        }

        return null;
    }

    /**
     * Check if string is a valid entity type (case-insensitive)
     */
    private static isValidEntityType(type: string): boolean {
        const validTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];
        return validTypes.some(validType => validType.toLowerCase() === type.toLowerCase());
    }

    /**
     * Find matching entity type (case-insensitive) and return the correctly-cased type
     */
    private static findMatchingEntityType(type: string): TemplateEntityType | null {
        const validTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];
        const match = validTypes.find(validType => validType.toLowerCase() === type.toLowerCase());
        return match || null;
    }
}

