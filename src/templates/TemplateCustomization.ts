/**
 * Template Customization
 * Builds a customized, in-memory copy of a template for a single application
 * run. The stored template is never mutated.
 */

import type { Template, TemplateVariableValue } from './TemplateTypes';

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
