/**
 * Template Migrator
 * Utility to convert templates from old format to new format
 * Old format: direct properties + customYamlFields + sectionContent
 * New format: yamlContent + markdownContent
 */

import { Template } from './TemplateTypes';
import { entityToYaml, entityToMarkdown } from '../utils/TemplatePreviewRenderer';

export class TemplateMigrator {
    /**
     * Convert a template from old format to new format
     * Converts all entities in the template
     */
    static migrateTemplateToNewFormat(template: Template): Template {
        // Deep clone to avoid mutations
        const migrated = JSON.parse(JSON.stringify(template));
        
        // Convert all entity types
        const entityTypes = ['characters', 'locations', 'events', 'items', 'groups', 
                          'cultures', 'economies', 'magicSystems', 'chapters', 'scenes', 'references'];
        
        entityTypes.forEach(entityType => {
            const entities = (migrated.entities as any)[entityType];
            if (entities && Array.isArray(entities)) {
                entities.forEach((entity: any) => {
                    this.migrateEntityToNewFormat(entity);
                });
            }
        });
        
        return migrated;
    }
    
    /**
     * Convert a single entity from old format to new format
     */
    private static migrateEntityToNewFormat(entity: any): void {
        // Skip if already in new format
        if (entity.yamlContent || entity.markdownContent) {
            return;
        }
        
        // Use existing utility functions
        entity.yamlContent = entityToYaml(entity);
        entity.markdownContent = entityToMarkdown(entity);
        
        // Optionally remove old format fields (keep for backward compatibility during transition)
        // delete entity.customYamlFields;
        // delete entity.sectionContent;
    }
}

