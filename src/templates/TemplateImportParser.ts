/**
 * Template Import Parser
 * Parses and validates the contents of a user-selected template file.
 * Pure logic (no Obsidian APIs) so it can be unit tested.
 */

import type {
    SharedTemplatePackage,
    Template,
    TemplateExportData
} from './TemplateTypes';
import { TemplateValidator } from './TemplateValidator';
import { TemplateMigrator } from './TemplateMigrator';

export type TemplateImportParseResult =
    | { ok: true; kind: 'export'; data: TemplateExportData }
    | { ok: true; kind: 'package'; sharedPackage: SharedTemplatePackage }
    | { ok: false; error: string };

const SUPPORTED_PACKAGE_VERSION = '1.0.0';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the parts of a template that the import pipeline relies on.
 * Returns an error message, or null when the template is usable.
 */
function validateImportedTemplate(template: unknown): string | null {
    if (!isRecord(template)) {
        return 'template data is missing or not an object';
    }

    const quick = TemplateValidator.validateQuick(template as Partial<Template>);
    if (!quick.isValid) {
        return quick.errors.join(', ');
    }

    if (!isRecord(template.entities)) {
        return 'template entities are missing or malformed';
    }

    return null;
}

/**
 * Parse the text of a template file. Accepts either a single-template export
 * ({ template, exportVersion, ... }) or a shared template package
 * ({ packageVersion, manifest, templates }). Never throws.
 */
export function parseTemplateImportContent(content: string): TemplateImportParseResult {
    if (!content || content.trim() === '') {
        return { ok: false, error: 'the file is empty' };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return { ok: false, error: 'the file is not valid JSON' };
    }

    if (!isRecord(parsed)) {
        return { ok: false, error: 'the file does not contain a template' };
    }

    if ('packageVersion' in parsed || Array.isArray(parsed.templates)) {
        if (parsed.packageVersion !== SUPPORTED_PACKAGE_VERSION || !Array.isArray(parsed.templates)) {
            return { ok: false, error: 'unsupported template package version' };
        }
        if (parsed.templates.length === 0) {
            return { ok: false, error: 'the template package contains no templates' };
        }
        for (const template of parsed.templates) {
            const problem = validateImportedTemplate(template);
            if (problem) {
                return { ok: false, error: `a template in the package is invalid: ${problem}` };
            }
        }
        return {
            ok: true,
            kind: 'package',
            sharedPackage: parsed as unknown as SharedTemplatePackage
        };
    }

    if ('template' in parsed) {
        const problem = validateImportedTemplate(parsed.template);
        if (problem) {
            return { ok: false, error: `the template is invalid: ${problem}` };
        }
        const data = parsed as unknown as TemplateExportData;
        return {
            ok: true,
            kind: 'export',
            data: {
                ...data,
                template: TemplateMigrator.migrateTemplateToNewFormat(data.template)
            }
        };
    }

    return { ok: false, error: 'the file does not contain a template export or package' };
}
