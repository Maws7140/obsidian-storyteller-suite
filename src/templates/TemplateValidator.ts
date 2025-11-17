/**
 * Template Validator
 * Enhanced validation for entity templates with placeholder and variable support
 */

import {
    Template,
    TemplateValidationResult,
    TemplateEntityType,
    TemplatePlaceholder,
    TemplateVariable
} from './TemplateTypes';

export class TemplateValidator {
    /**
     * Validate template structure, references, and configurations
     */
    static validate(template: Template): TemplateValidationResult {
        const result: TemplateValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            brokenReferences: []
        };

        // Check required fields
        this.validateRequiredFields(template, result);

        // Validate entities and collect IDs
        const allIds = this.collectEntityIds(template);

        // Validate entity references
        this.validateEntityReferences(template, allIds, result);

        // Validate placeholders
        if (template.placeholders) {
            this.validatePlaceholders(template, allIds, result);
        }

        // Validate variables
        if (template.variables) {
            this.validateVariables(template, allIds, result);
        }

        // Validate entity types list matches actual entities
        if (template.entityTypes) {
            this.validateEntityTypes(template, result);
        }

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
     * Validate required fields
     */
    private static validateRequiredFields(
        template: Template,
        result: TemplateValidationResult
    ): void {
        if (!template.id) {
            result.errors.push('Template ID is required');
        }
        if (!template.name || template.name.trim() === '') {
            result.errors.push('Template name is required');
        }
        if (!template.version) {
            result.errors.push('Template version is required');
        }
        if (!template.category) {
            result.errors.push('Template category is required');
        }
        if (!template.genre) {
            result.errors.push('Template genre is required');
        }
    }

    /**
     * Collect all template IDs from entities
     */
    private static collectEntityIds(template: Template): Set<string> {
        const allIds = new Set<string>();
        const entities = template.entities;

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

        return allIds;
    }

    /**
     * Validate entity references
     */
    private static validateEntityReferences(
        template: Template,
        allIds: Set<string>,
        result: TemplateValidationResult
    ): void {
        const entities = template.entities;

        // Validate character references
        this.validateReferences(entities.characters, 'character', allIds, result, [
            { field: 'relationships' },
            { field: 'locations' },
            { field: 'events' },
            { field: 'groups' },
            { field: 'connections' }
        ]);

        // Validate location references
        this.validateReferences(entities.locations, 'location', allIds, result, [
            { field: 'parentLocation' },
            { field: 'groups' },
            { field: 'connections' }
        ]);

        // Validate event references
        this.validateReferences(entities.events, 'event', allIds, result, [
            { field: 'characters' },
            { field: 'location' },
            { field: 'groups' },
            { field: 'connections' },
            { field: 'dependencies' }
        ]);

        // Validate item references
        this.validateReferences(entities.items, 'item', allIds, result, [
            { field: 'currentOwner' },
            { field: 'pastOwners' },
            { field: 'currentLocation' },
            { field: 'associatedEvents' },
            { field: 'groups' }
        ]);

        // Validate group references
        this.validateReferences(entities.groups, 'group', allIds, result, [
            { field: 'members' },
            { field: 'territories' },
            { field: 'linkedEvents' },
            { field: 'parentGroup' },
            { field: 'subgroups' },
            { field: 'groupRelationships' }
        ]);

        // Validate culture references
        this.validateReferences(entities.cultures, 'culture', allIds, result, [
            { field: 'linkedLocations' },
            { field: 'linkedCharacters' },
            { field: 'linkedEvents' },
            { field: 'relatedCultures' },
            { field: 'parentCulture' }
        ]);

        // Validate economy references
        this.validateReferences(entities.economies, 'economy', allIds, result, [
            { field: 'linkedLocations' },
            { field: 'linkedFactions' },
            { field: 'linkedCultures' },
            { field: 'linkedEvents' }
        ]);

        // Validate magic system references
        this.validateReferences(entities.magicSystems, 'magicSystem', allIds, result, [
            { field: 'linkedCharacters' },
            { field: 'linkedLocations' },
            { field: 'linkedCultures' },
            { field: 'linkedEvents' },
            { field: 'linkedItems' }
        ]);

        // Validate chapter references
        this.validateReferences(entities.chapters, 'chapter', allIds, result, [
            { field: 'linkedCharacters' },
            { field: 'linkedLocations' },
            { field: 'linkedEvents' },
            { field: 'linkedItems' },
            { field: 'linkedGroups' }
        ]);

        // Validate scene references
        this.validateReferences(entities.scenes, 'scene', allIds, result, [
            { field: 'chapterId' },
            { field: 'linkedCharacters' },
            { field: 'linkedLocations' },
            { field: 'linkedEvents' },
            { field: 'linkedItems' },
            { field: 'linkedGroups' }
        ]);
    }

    /**
     * Validate references for a specific entity type
     */
    private static validateReferences(
        items: any[] | undefined,
        entityType: TemplateEntityType,
        allIds: Set<string>,
        result: TemplateValidationResult,
        fields: { field: string }[]
    ): void {
        if (!items) return;

        items.forEach(item => {
            fields.forEach(({ field }) => {
                const value = item[field];
                if (!value) return;

                // Handle arrays
                if (Array.isArray(value)) {
                    value.forEach((ref: any) => {
                        const refId = typeof ref === 'string' ? ref : ref.target || ref.name;
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
                else if (field === 'members' && value.name) {
                    if (!allIds.has(value.name)) {
                        result.brokenReferences.push({
                            entityType,
                            entityId: item.templateId,
                            referenceType: 'members',
                            targetId: value.name
                        });
                    }
                }
            });
        });
    }

    /**
     * Validate placeholders
     */
    private static validatePlaceholders(
        template: Template,
        allIds: Set<string>,
        result: TemplateValidationResult
    ): void {
        if (!template.placeholders) return;

        template.placeholders.forEach((placeholder, index) => {
            // Validate entity template ID exists
            if (!allIds.has(placeholder.entityTemplateId)) {
                result.errors.push(
                    `Placeholder ${index}: entityTemplateId "${placeholder.entityTemplateId}" does not exist in template`
                );
            }

            // Validate field name
            if (!placeholder.field || placeholder.field.trim() === '') {
                result.errors.push(`Placeholder ${index}: field name is required`);
            }

            // Validate placeholder text
            if (!placeholder.placeholderText || placeholder.placeholderText.trim() === '') {
                result.warnings.push(`Placeholder ${index}: placeholder text is empty`);
            }

            // Validate validation rule if present
            if (placeholder.validationRule) {
                try {
                    new RegExp(placeholder.validationRule);
                } catch (e) {
                    result.errors.push(
                        `Placeholder ${index}: invalid validation rule regex "${placeholder.validationRule}"`
                    );
                }
            }
        });
    }

    /**
     * Validate template variables
     */
    private static validateVariables(
        template: Template,
        allIds: Set<string>,
        result: TemplateValidationResult
    ): void {
        if (!template.variables) return;

        const variableNames = new Set<string>();

        template.variables.forEach((variable, index) => {
            // Validate variable name
            if (!variable.name || variable.name.trim() === '') {
                result.errors.push(`Variable ${index}: name is required`);
            } else if (variableNames.has(variable.name)) {
                result.errors.push(`Variable ${index}: duplicate variable name "${variable.name}"`);
            } else {
                variableNames.add(variable.name);
            }

            // Validate label
            if (!variable.label || variable.label.trim() === '') {
                result.warnings.push(`Variable ${index}: label is empty`);
            }

            // Validate type
            const validTypes = ['text', 'number', 'boolean', 'select', 'date'];
            if (!validTypes.includes(variable.type)) {
                result.errors.push(`Variable ${index}: invalid type "${variable.type}"`);
            }

            // Validate select options
            if (variable.type === 'select' && (!variable.options || variable.options.length === 0)) {
                result.errors.push(`Variable ${index}: select type requires options`);
            }

            // Validate usedIn references
            if (variable.usedIn) {
                variable.usedIn.forEach((usage, usageIndex) => {
                    if (!allIds.has(usage.entityTemplateId)) {
                        result.warnings.push(
                            `Variable ${index}, usage ${usageIndex}: entityTemplateId "${usage.entityTemplateId}" does not exist`
                        );
                    }
                });
            }
        });
    }

    /**
     * Validate entity types list
     */
    private static validateEntityTypes(
        template: Template,
        result: TemplateValidationResult
    ): void {
        const actualTypes = new Set<TemplateEntityType>();
        const entities = template.entities;

        if (entities.characters && entities.characters.length > 0) actualTypes.add('character');
        if (entities.locations && entities.locations.length > 0) actualTypes.add('location');
        if (entities.events && entities.events.length > 0) actualTypes.add('event');
        if (entities.items && entities.items.length > 0) actualTypes.add('item');
        if (entities.groups && entities.groups.length > 0) actualTypes.add('group');
        if (entities.cultures && entities.cultures.length > 0) actualTypes.add('culture');
        if (entities.economies && entities.economies.length > 0) actualTypes.add('economy');
        if (entities.magicSystems && entities.magicSystems.length > 0) actualTypes.add('magicSystem');
        if (entities.chapters && entities.chapters.length > 0) actualTypes.add('chapter');
        if (entities.scenes && entities.scenes.length > 0) actualTypes.add('scene');
        if (entities.references && entities.references.length > 0) actualTypes.add('reference');

        // Check if entityTypes list matches actual entities
        const declaredTypes = new Set(template.entityTypes);

        actualTypes.forEach(type => {
            if (!declaredTypes.has(type)) {
                result.warnings.push(
                    `Template contains ${type} entities but they are not listed in entityTypes`
                );
            }
        });

        declaredTypes.forEach(type => {
            if (!actualTypes.has(type)) {
                result.warnings.push(
                    `Template declares ${type} in entityTypes but contains no ${type} entities`
                );
            }
        });
    }

    /**
     * Quick validation for required fields only
     */
    static validateQuick(template: Partial<Template>): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!template.name || template.name.trim() === '') {
            errors.push('Template name is required');
        }
        if (!template.category) {
            errors.push('Template category is required');
        }
        if (!template.genre) {
            errors.push('Template genre is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
