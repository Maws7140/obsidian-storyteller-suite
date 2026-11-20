/**
 * Bulk parsing and serialization for template variables.
 *
 * Accepts three input shapes in a single textarea and auto-detects which one
 * was pasted:
 *
 *  - Delimited, one variable per line. Delimiter is detected per input from
 *    tab, `|`, `:` or `,` (in that precedence). Columns are type-dependent:
 *      select : name, options(`;`-separated), default, label, description
 *      other  : name, type, default, label, description
 *    A leading `name` alone is valid and yields a text variable.
 *  - JSON: an array of variable objects, or a single object.
 *  - YAML: a list of variable mappings.
 *
 * Parsing never throws and never partially commits — callers get every row
 * back with its own error so a preview can show exactly which lines are bad.
 */

import { parseYaml } from 'obsidian';
import { TemplateVariable } from './TemplateTypes';

/** Variable names must be usable inside {{...}}, which matches \w+. */
export const VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const VARIABLE_TYPES: ReadonlyArray<TemplateVariable['type']> =
    ['text', 'number', 'boolean', 'select', 'date'];

export type BulkInputFormat = 'delimited' | 'json' | 'yaml';

/** One parsed row. `variable` is undefined when the row failed validation. */
export interface BulkParsedRow {
    /** 1-based index of the source line or array element, for the preview. */
    index: number;
    /** The raw source text for this row. */
    source: string;
    /** Parsed variable, or undefined when `error` is set. */
    variable?: TemplateVariable;
    /** Why this row was rejected. */
    error?: string;
}

export interface BulkParseResult {
    format: BulkInputFormat;
    rows: BulkParsedRow[];
    /** Failure that prevented parsing the input as a whole (bad JSON/YAML). */
    fatalError?: string;
}

/** Detect which of the three input shapes this text is. */
export function detectBulkFormat(input: string): BulkInputFormat {
    const trimmed = input.trim();
    if (!trimmed) return 'delimited';
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
    // A YAML list of mappings is the only YAML shape we accept, and it always
    // starts its entries with "- ". Without this the delimited parser would
    // happily read "- name: x" as a colon-delimited row named "- name".
    if (/^\s*-\s+/m.test(trimmed)) return 'yaml';
    return 'delimited';
}

/**
 * Pick the column delimiter. Tab and pipe are unambiguous; colon is the format
 * this panel originally shipped with, so it outranks comma, which is the most
 * likely character to appear inside a label or default value.
 */
function detectDelimiter(lines: string[]): string {
    const candidates = ['\t', '|', ':', ','];
    for (const candidate of candidates) {
        if (lines.some(line => line.includes(candidate))) return candidate;
    }
    // Single-column input: nothing to split on, any delimiter behaves the same.
    return '|';
}

function coerceDefaultValue(
    raw: string | undefined,
    type: TemplateVariable['type']
): { value?: string | number | boolean; error?: string } {
    // An omitted column means "no default". An explicitly empty one does too —
    // there is no way to type a meaningful empty default in a delimited row.
    if (raw === undefined || raw.trim() === '') return {};
    const text = raw.trim();

    if (type === 'number') {
        const num = Number(text);
        if (!Number.isFinite(num)) return { error: `default "${text}" is not a number` };
        return { value: num };
    }
    if (type === 'boolean') {
        const lowered = text.toLowerCase();
        if (['true', 'yes', '1'].includes(lowered)) return { value: true };
        if (['false', 'no', '0'].includes(lowered)) return { value: false };
        return { error: `default "${text}" is not a boolean` };
    }
    if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { error: `default "${text}" is not a yyyy-mm-dd date` };
    }
    return { value: text };
}

/**
 * Validate and normalise a loosely-shaped variable from any of the three
 * formats into a TemplateVariable.
 */
function buildVariable(fields: {
    name?: unknown;
    type?: unknown;
    label?: unknown;
    defaultValue?: unknown;
    options?: unknown;
    description?: unknown;
}): { variable?: TemplateVariable; error?: string } {
    const name = typeof fields.name === 'string' ? fields.name.trim() : '';
    if (!name) return { error: 'missing variable name' };
    if (!VARIABLE_NAME_PATTERN.test(name)) {
        return { error: `"${name}" is not a valid name (letters, numbers and underscore; cannot start with a number)` };
    }

    const rawType = typeof fields.type === 'string' ? fields.type.trim().toLowerCase() : '';
    if (rawType && !VARIABLE_TYPES.includes(rawType as TemplateVariable['type'])) {
        return { error: `unknown type "${rawType}" (expected ${VARIABLE_TYPES.join(', ')})` };
    }
    const type = (rawType || 'text') as TemplateVariable['type'];

    let options: string[] | undefined;
    if (Array.isArray(fields.options)) {
        options = fields.options.map(opt => String(opt).trim()).filter(opt => opt.length > 0);
    } else if (typeof fields.options === 'string') {
        options = fields.options.split(';').map(opt => opt.trim()).filter(opt => opt.length > 0);
    }
    if (options && options.length === 0) options = undefined;

    if (type === 'select' && !options) {
        return { error: `select variable "${name}" needs options (separate them with ;)` };
    }
    if (type !== 'select' && options) {
        return { error: `only select variables take options, but "${name}" is ${type}` };
    }

    // JSON and YAML carry real types already; delimited input arrives as strings
    // and needs coercing so a number default does not persist as "25".
    let defaultValue: string | number | boolean | undefined;
    if (typeof fields.defaultValue === 'number' || typeof fields.defaultValue === 'boolean') {
        defaultValue = fields.defaultValue;
    } else if (typeof fields.defaultValue === 'string') {
        const coerced = coerceDefaultValue(fields.defaultValue, type);
        if (coerced.error) return { error: coerced.error };
        defaultValue = coerced.value;
    }

    if (type === 'select' && defaultValue !== undefined && options && !options.includes(String(defaultValue))) {
        return { error: `default "${String(defaultValue)}" is not one of the options for "${name}"` };
    }

    const label = typeof fields.label === 'string' && fields.label.trim()
        ? fields.label.trim()
        : name;
    const description = typeof fields.description === 'string' && fields.description.trim()
        ? fields.description.trim()
        : undefined;

    const variable: TemplateVariable = { name, label, type };
    if (defaultValue !== undefined) variable.defaultValue = defaultValue;
    if (options) variable.options = options;
    if (description) variable.description = description;
    return { variable };
}

function parseDelimited(input: string): BulkParsedRow[] {
    const lines = input
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
    const delimiter = detectDelimiter(lines);

    return lines.map((line, i) => {
        const parts = line.split(delimiter).map(part => part.trim());
        const name = parts[0];
        const rawType = (parts[1] || 'text').toLowerCase();

        // select shifts the columns: its options have to come from somewhere and
        // a dedicated column reads better than overloading the default.
        const isSelect = rawType === 'select';
        const built = buildVariable({
            name,
            type: parts[1],
            options: isSelect ? parts[2] : undefined,
            defaultValue: isSelect ? parts[3] : parts[2],
            label: isSelect ? parts[4] : parts[3],
            description: isSelect ? parts[5] : parts[4],
        });

        return { index: i + 1, source: line, ...built };
    });
}

function parseStructured(input: string, format: BulkInputFormat): BulkParseResult {
    let parsed: unknown;
    try {
        parsed = format === 'json' ? JSON.parse(input) : parseYaml(input);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { format, rows: [], fatalError: `Could not read the ${format.toUpperCase()}: ${message}` };
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (entries.length === 0) {
        return { format, rows: [], fatalError: 'No variables found in the input.' };
    }

    const rows = entries.map((entry, i): BulkParsedRow => {
        const source = typeof entry === 'object' && entry !== null
            ? JSON.stringify(entry)
            : String(entry);
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return { index: i + 1, source, error: 'expected an object with a name field' };
        }
        const record = entry as Record<string, unknown>;
        const built = buildVariable({
            name: record.name,
            type: record.type,
            label: record.label,
            // Accept both spellings — "default" reads naturally when hand-writing
            // YAML, "defaultValue" is what the template file itself stores.
            defaultValue: record.defaultValue !== undefined ? record.defaultValue : record.default,
            options: record.options,
            description: record.description,
        });
        return { index: i + 1, source, ...built };
    });

    return { format, rows };
}

/** Parse pasted text into candidate variables. Never throws. */
export function parseBulkVariables(input: string): BulkParseResult {
    const format = detectBulkFormat(input);
    if (!input.trim()) return { format, rows: [] };
    if (format === 'json' || format === 'yaml') return parseStructured(input, format);
    return { format, rows: parseDelimited(input) };
}

/**
 * Render variables back out in the pipe-delimited format so a set can be copied
 * from one template into another. Round-trips through parseBulkVariables.
 */
export function serializeVariables(variables: TemplateVariable[]): string {
    return variables.map(variable => {
        const columns = variable.type === 'select'
            ? [
                variable.name,
                variable.type,
                (variable.options || []).join(';'),
                variable.defaultValue !== undefined ? String(variable.defaultValue) : '',
                variable.label !== variable.name ? variable.label : '',
                variable.description || '',
            ]
            : [
                variable.name,
                variable.type,
                variable.defaultValue !== undefined ? String(variable.defaultValue) : '',
                variable.label !== variable.name ? variable.label : '',
                variable.description || '',
            ];
        // Drop empty trailing columns so simple variables stay one word wide.
        while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop();
        return columns.join(' | ');
    }).join('\n');
}
