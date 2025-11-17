/**
 * Template Placeholders Utility
 * Handles placeholder processing and variable substitution for templates
 */

import {
    Template,
    TemplatePlaceholder,
    TemplateVariable,
    TemplateEntityType
} from '../templates/TemplateTypes';

export class TemplatePlaceholderProcessor {
    /**
     * Apply placeholders to an entity
     */
    static applyPlaceholders(
        entity: any,
        entityType: TemplateEntityType,
        templateId: string,
        template: Template
    ): any {
        if (!template.placeholders) {
            return entity;
        }

        const entityPlaceholders = template.placeholders.filter(
            p => p.entityType === entityType && p.entityTemplateId === templateId
        );

        const processedEntity = { ...entity };

        entityPlaceholders.forEach(placeholder => {
            const { field, defaultValue, placeholderText } = placeholder;

            // If field is empty or undefined, set default value
            if (processedEntity[field] === undefined || processedEntity[field] === '') {
                if (defaultValue !== undefined) {
                    processedEntity[field] = defaultValue;
                }
            }
        });

        return processedEntity;
    }

    /**
     * Apply template variables to entity
     */
    static applyVariables(
        entity: any,
        entityType: TemplateEntityType,
        templateId: string,
        template: Template,
        variableValues: Record<string, any>
    ): any {
        if (!template.variables || !variableValues) {
            return entity;
        }

        const processedEntity = { ...entity };

        // Find variables used in this entity
        const usedVariables = template.variables.filter(v =>
            v.usedIn?.some(
                u => u.entityType === entityType && u.entityTemplateId === templateId
            )
        );

        usedVariables.forEach(variable => {
            const value = variableValues[variable.name] ?? variable.defaultValue;

            if (value === undefined) return;

            // Find all fields where this variable is used
            const fieldsToUpdate = variable.usedIn
                ?.filter(u => u.entityType === entityType && u.entityTemplateId === templateId)
                .map(u => u.field) || [];

            fieldsToUpdate.forEach(field => {
                // Replace variable placeholders in the field value
                if (typeof processedEntity[field] === 'string') {
                    processedEntity[field] = this.replaceVariable(
                        processedEntity[field],
                        variable.name,
                        value
                    );
                }
            });
        });

        return processedEntity;
    }

    /**
     * Replace variable placeholder in text
     */
    private static replaceVariable(
        text: string,
        variableName: string,
        value: any
    ): string {
        const placeholder = `{{${variableName}}}`;
        const stringValue = String(value);
        return text.replace(new RegExp(placeholder, 'g'), stringValue);
    }

    /**
     * Get placeholder for a specific field
     */
    static getPlaceholder(
        entityType: TemplateEntityType,
        entityTemplateId: string,
        field: string,
        template: Template
    ): TemplatePlaceholder | undefined {
        if (!template.placeholders) return undefined;

        return template.placeholders.find(
            p =>
                p.entityType === entityType &&
                p.entityTemplateId === entityTemplateId &&
                p.field === field
        );
    }

    /**
     * Validate field value against placeholder rules
     */
    static validateFieldValue(
        value: any,
        placeholder: TemplatePlaceholder
    ): { isValid: boolean; error?: string } {
        // Check if required
        if (placeholder.isRequired && (!value || value.trim() === '')) {
            return {
                isValid: false,
                error: `${placeholder.field} is required`
            };
        }

        // Check validation rule if present
        if (placeholder.validationRule && value) {
            try {
                const regex = new RegExp(placeholder.validationRule);
                if (!regex.test(String(value))) {
                    return {
                        isValid: false,
                        error: placeholder.helpText || `${placeholder.field} does not match required format`
                    };
                }
            } catch (e) {
                console.error('Invalid validation rule:', e);
            }
        }

        return { isValid: true };
    }

    /**
     * Get all required fields for a template
     */
    static getRequiredFields(
        template: Template,
        entityType?: TemplateEntityType
    ): TemplatePlaceholder[] {
        if (!template.placeholders) return [];

        return template.placeholders.filter(p => {
            if (entityType && p.entityType !== entityType) {
                return false;
            }
            return p.isRequired;
        });
    }

    /**
     * Extract all variables from template
     */
    static extractVariables(template: Template): TemplateVariable[] {
        return template.variables || [];
    }

    /**
     * Find all variable references in text
     */
    static findVariableReferences(text: string): string[] {
        const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
        return matches.map(match => match.replace(/\{\{|\}\}/g, ''));
    }

    /**
     * Check if text contains variable references
     */
    static hasVariableReferences(text: string): boolean {
        return /\{\{[a-zA-Z0-9_]+\}\}/.test(text);
    }

    /**
     * Generate placeholder text for entity fields
     */
    static generatePlaceholderText(
        entityType: TemplateEntityType,
        field: string
    ): string {
        const placeholders: Record<TemplateEntityType, Record<string, string>> = {
            character: {
                name: 'Enter character name...',
                description: 'Describe the character\'s appearance and personality...',
                backstory: 'Enter the character\'s background...',
                status: 'alive',
                affiliation: 'Enter affiliation or faction...'
            },
            location: {
                name: 'Enter location name...',
                description: 'Describe the location...',
                locationType: 'Enter type (city, forest, dungeon, etc.)...',
                climate: 'Enter climate...'
            },
            event: {
                name: 'Enter event name...',
                description: 'Describe what happens...',
                eventType: 'Enter type (battle, celebration, etc.)...',
                date: 'Enter date or time...'
            },
            item: {
                name: 'Enter item name...',
                description: 'Describe the item...',
                itemType: 'weapon',
                rarity: 'common'
            },
            group: {
                name: 'Enter group name...',
                description: 'Describe the group\'s purpose and structure...',
                groupType: 'faction'
            },
            culture: {
                name: 'Enter culture name...',
                description: 'Describe the culture...'
            },
            economy: {
                name: 'Enter economy name...',
                description: 'Describe the economic system...'
            },
            magicSystem: {
                name: 'Enter magic system name...',
                description: 'Describe how magic works...'
            },
            chapter: {
                name: 'Enter chapter title...',
                summary: 'Summarize chapter events...'
            },
            scene: {
                name: 'Enter scene name...',
                summary: 'Describe what happens in this scene...'
            },
            reference: {
                name: 'Enter reference name...',
                content: 'Enter reference content...'
            }
        };

        return placeholders[entityType]?.[field] || `Enter ${field}...`;
    }

    /**
     * Create default placeholders for an entity
     */
    static createDefaultPlaceholders(
        entityType: TemplateEntityType,
        entityTemplateId: string,
        fields: string[]
    ): TemplatePlaceholder[] {
        return fields.map(field => ({
            entityType,
            entityTemplateId,
            field,
            placeholderText: this.generatePlaceholderText(entityType, field),
            isRequired: field === 'name', // Name is always required
            defaultValue: field === 'name' ? '' : undefined
        }));
    }
}
