/**
 * Variable Substitution Engine
 * Handles replacement of {{variableName}} with actual values
 * Supports nested objects, arrays, and complex data structures
 */

import { TemplateVariable } from './TemplateTypes';
import { TemplateVariableValues } from '../modals/TemplateApplicationModal';

export interface SubstitutionResult {
    success: boolean;
    value: any;
    warnings: string[];
    errors: string[];
}

export class VariableSubstitution {
    /**
     * Replace all {{variables}} in a string with their values
     */
    static substituteString(
        text: string,
        variableValues: TemplateVariableValues,
        strictMode: boolean = false
    ): SubstitutionResult {
        const warnings: string[] = [];
        const errors: string[] = [];
        let result = text;

        // Find all {{variableName}} patterns
        const variablePattern = /\{\{(\w+)\}\}/g;
        const matches = Array.from(text.matchAll(variablePattern));

        matches.forEach(match => {
            const fullMatch = match[0]; // {{variableName}}
            const variableName = match[1]; // variableName

            if (variableValues.hasOwnProperty(variableName)) {
                const value = variableValues[variableName];

                // Convert value to string appropriately
                let replacement: string;
                if (value === null || value === undefined) {
                    replacement = '';
                    warnings.push(`Variable "{{${variableName}}}" has no value, replaced with empty string`);
                } else if (typeof value === 'boolean') {
                    replacement = value.toString();
                } else if (typeof value === 'number') {
                    replacement = value.toString();
                } else if (Array.isArray(value)) {
                    replacement = value.join(', ');
                } else if (typeof value === 'object') {
                    replacement = JSON.stringify(value);
                    warnings.push(`Variable "{{${variableName}}}" is an object, converted to JSON`);
                } else {
                    replacement = value.toString();
                }

                result = result.replace(fullMatch, replacement);
            } else {
                if (strictMode) {
                    errors.push(`Variable "{{${variableName}}}" not found in provided values`);
                } else {
                    warnings.push(`Variable "{{${variableName}}}" not found, leaving as-is`);
                }
            }
        });

        return {
            success: errors.length === 0,
            value: result,
            warnings,
            errors
        };
    }

    /**
     * Substitute variables in an object (recursive)
     */
    static substituteObject(
        obj: any,
        variableValues: TemplateVariableValues,
        strictMode: boolean = false
    ): SubstitutionResult {
        const warnings: string[] = [];
        const errors: string[] = [];

        if (obj === null || obj === undefined) {
            return { success: true, value: obj, warnings, errors };
        }

        // Handle different types
        if (typeof obj === 'string') {
            return this.substituteString(obj, variableValues, strictMode);
        }

        if (Array.isArray(obj)) {
            const newArray: any[] = [];
            obj.forEach((item, index) => {
                const result = this.substituteObject(item, variableValues, strictMode);
                newArray.push(result.value);
                warnings.push(...result.warnings);
                errors.push(...result.errors);
            });
            return { success: errors.length === 0, value: newArray, warnings, errors };
        }

        if (typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const result = this.substituteObject(obj[key], variableValues, strictMode);
                    newObj[key] = result.value;
                    warnings.push(...result.warnings);
                    errors.push(...result.errors);
                }
            }
            return { success: errors.length === 0, value: newObj, warnings, errors };
        }

        // Primitive types (number, boolean) - return as-is
        return { success: true, value: obj, warnings, errors };
    }

    /**
     * Find all {{variables}} used in a string
     */
    static findVariables(text: string): string[] {
        const variablePattern = /\{\{(\w+)\}\}/g;
        const matches = Array.from(text.matchAll(variablePattern));
        return matches.map(match => match[1]);
    }

    /**
     * Find all {{variables}} used in an object (recursive)
     */
    static findVariablesInObject(obj: any): string[] {
        const variables: Set<string> = new Set();

        if (obj === null || obj === undefined) {
            return [];
        }

        if (typeof obj === 'string') {
            this.findVariables(obj).forEach(v => variables.add(v));
        } else if (Array.isArray(obj)) {
            obj.forEach(item => {
                this.findVariablesInObject(item).forEach(v => variables.add(v));
            });
        } else if (typeof obj === 'object') {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    this.findVariablesInObject(obj[key]).forEach(v => variables.add(v));
                }
            }
        }

        return Array.from(variables);
    }

    /**
     * Validate that all variables in template are provided
     */
    static validateVariables(
        templateVariables: TemplateVariable[],
        providedValues: TemplateVariableValues
    ): { isValid: boolean; missingVariables: string[] } {
        const missingVariables: string[] = [];

        templateVariables.forEach(variable => {
            if (!providedValues.hasOwnProperty(variable.name)) {
                missingVariables.push(variable.name);
            }
        });

        return {
            isValid: missingVariables.length === 0,
            missingVariables
        };
    }

    /**
     * Get preview of substitution without actually applying it
     */
    static previewSubstitution(
        text: string,
        variableValues: TemplateVariableValues,
        maxLength: number = 100
    ): string {
        const result = this.substituteString(text, variableValues, false);
        const preview = result.value;

        if (preview.length > maxLength) {
            return preview.substring(0, maxLength) + '...';
        }

        return preview;
    }

    /**
     * Apply variable substitution to a template entity
     */
    static substituteEntity<T>(
        entity: T,
        variableValues: TemplateVariableValues,
        strictMode: boolean = false
    ): SubstitutionResult {
        // Clone the entity to avoid mutations
        const clonedEntity = JSON.parse(JSON.stringify(entity));

        // Substitute all properties
        const result = this.substituteObject(clonedEntity, variableValues, strictMode);

        return result;
    }

    /**
     * Batch substitute multiple entities
     */
    static substituteEntities<T>(
        entities: T[],
        variableValues: TemplateVariableValues,
        strictMode: boolean = false
    ): { results: SubstitutionResult[]; allSuccess: boolean } {
        const results: SubstitutionResult[] = [];

        entities.forEach(entity => {
            const result = this.substituteEntity(entity, variableValues, strictMode);
            results.push(result);
        });

        const allSuccess = results.every(r => r.success);

        return { results, allSuccess };
    }

    /**
     * Create a summary of substitutions that will be performed
     */
    static createSubstitutionSummary(
        templateVariables: TemplateVariable[],
        variableValues: TemplateVariableValues
    ): string[] {
        const summary: string[] = [];

        templateVariables.forEach(variable => {
            const value = variableValues[variable.name];
            const valueStr = value !== undefined && value !== null ? value.toString() : '(empty)';
            summary.push(`{{${variable.name}}} → ${valueStr}`);
        });

        return summary;
    }

    /**
     * Escape special regex characters in variable names
     */
    private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Check if a string contains any variables
     */
    static containsVariables(text: string): boolean {
        const variablePattern = /\{\{(\w+)\}\}/;
        return variablePattern.test(text);
    }

    /**
     * Get a map of variable names to their usage count in text
     */
    static getVariableUsageCount(text: string): Map<string, number> {
        const usageMap = new Map<string, number>();
        const variablePattern = /\{\{(\w+)\}\}/g;
        const matches = Array.from(text.matchAll(variablePattern));

        matches.forEach(match => {
            const variableName = match[1];
            const currentCount = usageMap.get(variableName) || 0;
            usageMap.set(variableName, currentCount + 1);
        });

        return usageMap;
    }

    /**
     * Replace only specific variables (partial substitution)
     */
    static substitutePartial(
        text: string,
        variablesToReplace: string[],
        variableValues: TemplateVariableValues
    ): SubstitutionResult {
        const warnings: string[] = [];
        const errors: string[] = [];
        let result = text;

        variablesToReplace.forEach(variableName => {
            if (variableValues.hasOwnProperty(variableName)) {
                const pattern = new RegExp(`\\{\\{${this.escapeRegex(variableName)}\\}\\}`, 'g');
                const value = variableValues[variableName];
                const replacement = value !== null && value !== undefined ? value.toString() : '';
                result = result.replace(pattern, replacement);
            } else {
                warnings.push(`Variable "{{${variableName}}}" not found in values`);
            }
        });

        return {
            success: errors.length === 0,
            value: result,
            warnings,
            errors
        };
    }
}
