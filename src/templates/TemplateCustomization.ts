/**
 * Template Customization
 * Builds a customized, in-memory copy of a template for a single application
 * run. The stored template is never mutated.
 */

import type { Template, TemplateVariableValue } from './TemplateTypes';
import type { EntityFileName } from '../modals/TemplateApplicationModal';

/**
 * Convert the file names chosen in the apply modal into applicator field overrides.
 * The chosen file name becomes the created entity's name, matching the behaviour of
 * the other apply paths. Entries with an empty name are left out.
 */
export function buildFieldOverridesFromEntityFileNames(
    entityFileNames: readonly EntityFileName[]
): Map<string, { name: string }> {
    const overrides = new Map<string, { name: string }>();
    for (const entityInfo of entityFileNames) {
        if (entityInfo.fileName) {
            overrides.set(entityInfo.templateId, { name: entityInfo.fileName });
        }
    }
    return overrides;
}

/**
 * Return a deep copy of the template whose variable defaults reflect the
 * supplied values. Variables without a supplied value keep their defaults.
 */
export function createCustomizedTemplateCopy(
    template: Template,
    variableValues: Record<string, TemplateVariableValue>
): Template {
    const copy = structuredClone(template);

    if (copy.variables) {
        copy.variables = copy.variables.map(variable => {
            if (!Object.prototype.hasOwnProperty.call(variableValues, variable.name)) {
                return variable;
            }
            return { ...variable, defaultValue: variableValues[variable.name] };
        });
    }

    return copy;
}
