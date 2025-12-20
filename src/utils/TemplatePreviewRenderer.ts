/**
 * Template Preview Renderer Utility
 * Renders note previews showing YAML frontmatter + markdown content
 */

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
export function entityToYaml(entity: any): string {
    // If yamlContent exists, use it directly
    if (entity.yamlContent && typeof entity.yamlContent === 'string') {
        return entity.yamlContent;
    }
    
    // Otherwise, build YAML from entity fields
    const { templateId, sectionContent, customYamlFields, yamlContent, markdownContent, ...fields } = entity;
    
    // Merge custom YAML fields
    const allFields = { ...fields, ...(customYamlFields || {}) };
    
    // Remove undefined/null values and internal fields
    const cleanFields: Record<string, any> = {};
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
        const { stringifyYaml } = require('obsidian');
        const yaml = stringifyYaml(cleanFields);
        return yaml.trim();
    } catch {
        // Fallback: simple YAML serialization
        return Object.entries(cleanFields)
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    return `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]`;
                } else if (typeof value === 'string') {
                    return `${key}: "${value}"`;
                } else if (typeof value === 'object') {
                    return `${key}: ${JSON.stringify(value)}`;
                }
                return `${key}: ${value}`;
            })
            .join('\n');
    }
}

/**
 * Convert entity sectionContent to markdown string
 * Handles both new format (markdownContent) and old format (sectionContent object)
 * Also handles direct fields like description and backstory
 */
export function entityToMarkdown(entity: any): string {
    // If markdownContent exists, use it directly
    if (entity.markdownContent && typeof entity.markdownContent === 'string') {
        return entity.markdownContent;
    }
    
    // Build markdown from sectionContent if it exists
    const sections: Record<string, string> = {};
    
    if (entity.sectionContent && typeof entity.sectionContent === 'object') {
        Object.assign(sections, entity.sectionContent);
    }
    
    // Also check for common direct fields that should become markdown sections
    const commonFields = ['description', 'backstory', 'history', 'outcome', 'summary', 'content'];
    commonFields.forEach(field => {
        if (entity[field] && typeof entity[field] === 'string' && entity[field].trim()) {
            const sectionName = field.charAt(0).toUpperCase() + field.slice(1);
            sections[sectionName] = entity[field];
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
export function getEntityNotePreview(entity: any): string {
    const yaml = entityToYaml(entity);
    const markdown = entityToMarkdown(entity);
    return renderNotePreview(yaml, markdown);
}

