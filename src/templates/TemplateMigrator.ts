/**
 * Template Migrator
 * Utility to convert templates from old format to new format
 * Old format: direct properties + customYamlFields + sectionContent
 * New format: yamlContent + markdownContent
 */

import { Template, TemplateEntities } from './TemplateTypes';
import { entityToYaml, entityToMarkdown } from '../utils/TemplatePreviewRenderer';
import { TEMPLATE_ENTITY_DEFINITIONS } from './TemplateEntityRegistry';

export class TemplateMigrator {
    /**
     * Convert a template from old format to new format
     * Converts all entities in the template
     */
    static migrateTemplateToNewFormat(template: Template): Template {
        // Deep clone to avoid mutations
        const migrated = structuredClone(template);
        
        // Convert all entity types
        const entityTypes: Array<keyof TemplateEntities> = TEMPLATE_ENTITY_DEFINITIONS.map(
            definition => definition.pluralKey
        );
        
        entityTypes.forEach(entityType => {
            const entities = migrated.entities[entityType] as Array<{ yamlContent?: string; markdownContent?: string }> | undefined;
            if (entities && Array.isArray(entities)) {
                entities.forEach(entity => {
                    this.migrateEntityToNewFormat(entity);
                });
            }
        });
        
        return migrated;
    }
    
    /**
     * Convert a single entity from old format to new format
     */
    private static migrateEntityToNewFormat(entity: { yamlContent?: string; markdownContent?: string }): void {
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

