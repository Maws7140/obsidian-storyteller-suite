/**
 * Template Validator
 * Enhanced validation for entity templates with placeholder and variable support
 */

import {
    Template,
    TemplateValidationResult,
    TemplateEntityType
} from './TemplateTypes';
import {
    TEMPLATE_ENTITY_DEFINITIONS,
    getTemplateEntityCounts,
    getTemplateEntityPluralKey
} from './TemplateEntityRegistry';
import { getLinkFieldDefinition } from './TemplateLinkFields';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(value: Record<string, unknown>, field: string): string | undefined {
    const fieldValue = value[field];
    return typeof fieldValue === 'string' ? fieldValue : undefined;
}

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

        // Validate existing-entity links
        if (template.existingEntityLinks) {
            this.validateExistingEntityLinks(template, allIds, result);
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

        const addIds = (items: readonly unknown[] | undefined) => {
            if (items) {
                items.forEach(item => {
                    if (isRecord(item)) {
                        const templateId = getStringField(item, 'templateId');
                        if (templateId) {
                            allIds.add(templateId);
                        }
                    }
                });
            }
        };

        TEMPLATE_ENTITY_DEFINITIONS.forEach(definition => {
            addIds(entities[definition.pluralKey]);
        });

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

        // Validate map references
        this.validateReferences(entities.maps, 'map', allIds, result, [
            { field: 'parentMapId' },
            { field: 'childMapIds' },
            { field: 'correspondingLocationId' },
            { field: 'linkedLocations' },
            { field: 'linkedCharacters' },
            { field: 'linkedEvents' },
            { field: 'linkedItems' },
            { field: 'linkedGroups' },
            { field: 'linkedCultures' },
            { field: 'linkedEconomies' },
            { field: 'linkedMagicSystems' },
            { field: 'linkedScenes' },
            { field: 'linkedReferences' }
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

        // Validate compendium references
        this.validateReferences(entities.compendiumEntries, 'compendiumEntry', allIds, result, [
            { field: 'linkedLocations' },
            { field: 'linkedCharacters' },
            { field: 'linkedItems' },
            { field: 'linkedMagicSystems' },
            { field: 'linkedCultures' },
            { field: 'linkedEvents' },
            { field: 'groups' },
            { field: 'connections' },
            { field: 'triggeredAtLocations' },
            { field: 'triggeredByItem' }
        ]);

        // Validate book references
        this.validateReferences(entities.books, 'book', allIds, result, [
            { field: 'linkedChapters' },
            { field: 'groups' },
            { field: 'connections' }
        ]);

        // Validate campaign session references
        this.validateReferences(entities.campaignSessions, 'campaignSession', allIds, result, [
            { field: 'currentSceneId' },
            { field: 'activeMapId' },
            { field: 'partyCharacterIds' },
            { field: 'partyItems' },
            { field: 'revealedCompendiumEntryIds' }
        ]);
    }

    /**
     * Validate references for a specific entity type
     */
    private static validateReferences(
        items: readonly unknown[] | undefined,
        entityType: TemplateEntityType,
        allIds: Set<string>,
        result: TemplateValidationResult,
        fields: { field: string }[]
    ): void {
        if (!items) return;

        items.forEach(item => {
            if (!isRecord(item)) {
                return;
            }

            const entityId = getStringField(item, 'templateId');
            if (!entityId) {
                return;
            }

            fields.forEach(({ field }) => {
                const value = item[field];
                if (!value) return;

                // Handle arrays
                if (Array.isArray(value)) {
                    value.forEach(ref => {
                        const refId = this.getReferenceId(ref);
                        if (refId && !allIds.has(refId)) {
                            result.brokenReferences.push({
                                entityType,
                                entityId,
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
                            entityId,
                            referenceType: field,
                            targetId: value
                        });
                    }
                }
                // Handle Group members (special case)
                else if (field === 'members' && isRecord(value)) {
                    const memberName = getStringField(value, 'name');
                    if (memberName && !allIds.has(memberName)) {
                        result.brokenReferences.push({
                            entityType,
                            entityId,
                            referenceType: 'members',
                            targetId: memberName
                        });
                    }
                }
            });
        });
    }

    private static getReferenceId(ref: unknown): string | undefined {
        if (typeof ref === 'string') {
            return ref;
        }
        if (!isRecord(ref)) {
            return undefined;
        }
        return getStringField(ref, 'target') ?? getStringField(ref, 'name');
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
                } catch {
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
        const entityCounts = getTemplateEntityCounts(template.entities);
        TEMPLATE_ENTITY_DEFINITIONS.forEach(definition => {
            if (entityCounts[definition.type] > 0) {
                actualTypes.add(definition.type);
            }
        });

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
     * Validate existing-entity links: source entity must exist and match its declared
     * type, the target field must be allowlisted for that source type, and the link's
     * cardinality/target type must match the allowlist. Required links need a label.
     */
    private static validateExistingEntityLinks(
        template: Template,
        allIds: Set<string>,
        result: TemplateValidationResult
    ): void {
        const links = template.existingEntityLinks;
        if (!links) return;

        const seenIds = new Set<string>();

        links.forEach((link, index) => {
            if (!link.id || link.id.trim() === '') {
                result.errors.push(`Link ${index}: id is required`);
            } else if (seenIds.has(link.id)) {
                result.errors.push(`Link ${index}: duplicate link id "${link.id}"`);
            } else {
                seenIds.add(link.id);
            }

            // Source entity must exist in the template
            if (!allIds.has(link.sourceTemplateId)) {
                result.errors.push(
                    `Link ${index}: source entity "${link.sourceTemplateId}" does not exist in template`
                );
            } else {
                // Source entity must be of the declared source type
                const collection = template.entities[getTemplateEntityPluralKey(link.sourceType)] as
                    Array<{ templateId?: string }> | undefined;
                const matchesType = Array.isArray(collection)
                    && collection.some(entity => entity?.templateId === link.sourceTemplateId);
                if (!matchesType) {
                    result.errors.push(
                        `Link ${index}: source entity "${link.sourceTemplateId}" is not a ${link.sourceType}`
                    );
                }
            }

            // Target field must be allowlisted for the source type
            const definition = getLinkFieldDefinition(link.sourceType, link.targetField);
            if (!definition) {
                result.errors.push(
                    `Link ${index}: field "${link.targetField}" is not linkable for ${link.sourceType}`
                );
            } else {
                if (definition.targetType !== link.targetType) {
                    result.errors.push(
                        `Link ${index}: field "${link.targetField}" targets ${definition.targetType}, not ${link.targetType}`
                    );
                }
                if (definition.multiple !== link.multiple) {
                    result.errors.push(
                        `Link ${index}: field "${link.targetField}" cardinality mismatch (expected multiple=${definition.multiple})`
                    );
                }
            }

            // Required links must have a label
            if (link.required && (!link.label || link.label.trim() === '')) {
                result.errors.push(`Link ${index}: required links must have a label`);
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
