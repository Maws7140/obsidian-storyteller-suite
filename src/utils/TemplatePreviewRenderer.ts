/**
 * Template Preview Renderer Utility
 * Renders note previews showing YAML frontmatter + markdown content
 */

import { stringifyYaml } from 'obsidian';

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

/**
 * Render a complete note preview from YAML and markdown content
 * @param yamlContent YAML frontmatter content (without --- markers)
 * @param markdownContent Markdown body content
 * @returns Complete note format as string
 */
export function renderNotePreview(
    yamlContent: string,
    markdownContent: string
): string {
    const yaml = yamlContent.trim();
    const markdown = markdownContent.trim();
    
    if (!yaml && !markdown) {
        return '---\n---\n';
    }
    
    if (!yaml) {
        return markdown;
    }
    
    if (!markdown) {
        return `---\n${yaml}\n---\n`;
    }
    
    return `---\n${yaml}\n---\n\n${markdown}`;
}

/**
 * Convert entity object to YAML string
 * Handles both new format (yamlContent) and old format (object fields)
 */
export function entityToYaml(entity: unknown): string {
    const entityRecord = asRecord(entity);

    // If yamlContent exists, use it directly
    if (typeof entityRecord.yamlContent === 'string') {
        return entityRecord.yamlContent;
    }
    
    // Otherwise, build YAML from entity fields
    const { customYamlFields, ...fields } = entityRecord;
    delete fields.templateId;
    delete fields.sectionContent;
    delete fields.yamlContent;
    delete fields.markdownContent;
    
    // Merge custom YAML fields
    const customFieldsRecord = asRecord(customYamlFields);
    const allFields = { ...fields, ...customFieldsRecord };
    
    // Remove undefined/null values and internal fields
    const cleanFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(allFields)) {
        // Skip internal template fields
        if (key === 'templateId' || key === 'yamlContent' || key === 'markdownContent') {
            continue;
        }
        // Skip section content (belongs in markdown, not YAML)
        if (key === 'sectionContent') {
            continue;
        }
        // Skip multi-line strings (they belong in markdown sections)
        if (typeof value === 'string' && value.includes('\n')) {
            continue;
        }
        if (value !== undefined && value !== null) {
            cleanFields[key] = value;
        }
    }
    
    // Use Obsidian's stringifyYaml if available
    try {
        const yaml = stringifyYaml(cleanFields);
        return yaml.trim();
    } catch {
        // Fallback: simple YAML serialization
        return Object.entries(cleanFields)
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    return `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]`;
                } else if (typeof value === 'string') {
                    return `${key}: "${value}"`;
                } else if (typeof value === 'object' && value !== null) {
                    return `${key}: ${JSON.stringify(value)}`;
                }
                return `${key}: ${String(value)}`;
            })
            .join('\n');
    }
}

/**
 * Convert entity sectionContent to markdown string
 * Handles both new format (markdownContent) and old format (sectionContent object)
 * Also handles direct fields like description and backstory
 */
export function entityToMarkdown(entity: unknown): string {
    const entityRecord = asRecord(entity);

    // If markdownContent exists, use it directly
    if (typeof entityRecord.markdownContent === 'string') {
        return entityRecord.markdownContent;
    }
    
    // Build markdown from sectionContent if it exists
    const sections: Record<string, string> = {};
    
    const sectionContent = asRecord(entityRecord.sectionContent);
    for (const [sectionName, sectionValue] of Object.entries(sectionContent)) {
        sections[sectionName] = String(sectionValue ?? '');
    }
    
    // Also check for common direct fields that should become markdown sections
    const commonFields = ['description', 'backstory', 'history', 'outcome', 'summary', 'content'];
    commonFields.forEach(field => {
        const value = entityRecord[field];
        if (typeof value === 'string' && value.trim()) {
            const sectionName = field.charAt(0).toUpperCase() + field.slice(1);
            sections[sectionName] = value;
        }
    });
    
    if (Object.keys(sections).length > 0) {
        return Object.entries(sections)
            .map(([sectionName, content]) => {
                const contentStr = content || '';
                return `## ${sectionName}\n${contentStr}`;
            })
            .join('\n\n');
    }
    
    return '';
}

/**
 * Get complete note preview for an entity
 */
export function getEntityNotePreview(entity: unknown): string {
    const yaml = entityToYaml(entity);
    const markdown = entityToMarkdown(entity);
    return renderNotePreview(yaml, markdown);
}

