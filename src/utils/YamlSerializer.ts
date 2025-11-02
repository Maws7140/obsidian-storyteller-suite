/**
 * Custom YAML serializer that explicitly preserves empty string values.
 *
 * The problem: Obsidian's stringifyYaml() may filter out empty string values,
 * causing manually-added empty frontmatter fields to be deleted on save.
 *
 * The solution: Pre-process the object to mark empty strings for preservation,
 * then post-process the YAML output to ensure they're written correctly.
 */

import { stringifyYaml } from 'obsidian';

/**
 * Serialize an object to YAML with explicit empty string preservation.
 *
 * Empty strings will be written as:
 * - `fieldName: ""` for better clarity
 *
 * @param obj The object to serialize
 * @returns YAML string with empty values preserved
 */
export function stringifyYamlWithEmptyFields(obj: Record<string, unknown>): string {
    if (!obj || Object.keys(obj).length === 0) {
        return '';
    }

    // Track which fields have empty string values
    const emptyStringFields = new Set<string>();

    // Create a modified object where empty strings are replaced with a marker
    const processed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value === '') {
            emptyStringFields.add(key);
            // Use a special marker that won't be in normal data
            processed[key] = '__EMPTY_STRING_MARKER__';
        } else {
            processed[key] = value;
        }
    }

    // Serialize with Obsidian's built-in function
    let yaml = stringifyYaml(processed);

    // Post-process: replace markers with proper empty string representation
    if (emptyStringFields.size > 0) {
        for (const field of emptyStringFields) {
            // Replace the marker with an empty string representation
            // This regex handles the field whether it's quoted or not
            const markerPattern = new RegExp(
                `^(${escapeRegex(field)}:\\s*)(__EMPTY_STRING_MARKER__|"__EMPTY_STRING_MARKER__"|'__EMPTY_STRING_MARKER__')\\s*$`,
                'gm'
            );
            yaml = yaml.replace(markerPattern, `$1""`);
        }
    }

    return yaml;
}

/**
 * Helper function to escape special regex characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that a frontmatter object won't lose fields when saved.
 *
 * @param newFrontmatter The frontmatter about to be saved
 * @param originalFrontmatter The original frontmatter from the file
 * @returns Object with validation results
 */
export function validateFrontmatterPreservation(
    newFrontmatter: Record<string, unknown>,
    originalFrontmatter?: Record<string, unknown>
): {
    valid: boolean;
    lostFields: string[];
    warnings: string[];
} {
    const result = {
        valid: true,
        lostFields: [] as string[],
        warnings: [] as string[]
    };

    if (!originalFrontmatter) {
        return result; // Nothing to validate against
    }

    // Check for fields that existed in original but are missing in new
    const originalKeys = new Set(Object.keys(originalFrontmatter));
    const newKeys = new Set(Object.keys(newFrontmatter));

    // Skip Obsidian internal fields
    const internalFields = new Set(['position']);

    for (const key of originalKeys) {
        if (internalFields.has(key)) continue;

        if (!newKeys.has(key)) {
            result.valid = false;
            result.lostFields.push(key);
            result.warnings.push(
                `Field "${key}" existed in original file but will be removed on save`
            );
        }
    }

    // Check for empty values that might be at risk
    for (const [key, value] of Object.entries(newFrontmatter)) {
        if (value === '' || value === null || value === undefined) {
            const existedInOriginal = originalKeys.has(key);
            if (!existedInOriginal) {
                result.warnings.push(
                    `Field "${key}" has empty value and may not persist correctly`
                );
            }
        }
    }

    return result;
}

/**
 * Enhanced YAML serialization with field preservation logging.
 * Use this for development/debugging to understand what's happening to fields.
 *
 * @param obj The object to serialize
 * @param originalFrontmatter Optional original frontmatter for comparison
 * @param context Context string for logging (e.g., "Character: John Doe")
 * @returns YAML string with empty values preserved
 */
export function stringifyYamlWithLogging(
    obj: Record<string, unknown>,
    originalFrontmatter?: Record<string, unknown>,
    context?: string
): string {
    const prefix = context ? `[${context}]` : '[YamlSerializer]';

    // Validate before serialization
    if (originalFrontmatter) {
        const validation = validateFrontmatterPreservation(obj, originalFrontmatter);

        if (!validation.valid) {
            console.warn(`${prefix} Field preservation issues detected:`, validation.warnings);
        }

        if (validation.lostFields.length > 0) {
            console.warn(`${prefix} These fields will be LOST:`, validation.lostFields);
        }
    }

    // Track empty fields
    const emptyFields = Object.entries(obj)
        .filter(([_, value]) => value === '' || value === null || value === undefined)
        .map(([key]) => key);

    if (emptyFields.length > 0) {
        console.debug(`${prefix} Preserving empty fields:`, emptyFields);
    }

    // Serialize
    const yaml = stringifyYamlWithEmptyFields(obj);

    // Verify empty fields made it through
    for (const field of emptyFields) {
        if (!yaml.includes(`${field}:`)) {
            console.error(`${prefix} FAILED to preserve empty field: ${field}`);
        }
    }

    return yaml;
}
