/**
 * Template Entity Selection
 * Helpers for choosing which template entities are created when a template is
 * applied: listing entities, building the includeEntities selection, and finding
 * references from kept entities to entities the user excluded.
 */

import type { Template, TemplateEntitySelection, TemplateEntityType } from './TemplateTypes';
import {
    TEMPLATE_ENTITY_TYPES,
    getTemplateEntityLabel,
    getTemplateEntityPluralKey
} from './TemplateEntityRegistry';

/** A template entity offered for inclusion, identified by its templateId */
export interface TemplateEntityListItem {
    templateId: string;
    entityType: TemplateEntityType;
    /** Raw name as written in the template (may contain {{variables}}) */
    name: string;
}

/** A kept entity that refers to an excluded entity */
export interface ExcludedEntityReference {
    sourceTemplateId: string;
    sourceName: string;
    sourceType: TemplateEntityType;
    targetTemplateId: string;
    targetName: string;
    targetType: TemplateEntityType;
}

type TemplateEntityRecord = {
    templateId?: string;
    name?: unknown;
    yamlContent?: unknown;
    [key: string]: unknown;
};

/** Reads the raw name of a template entity from its name field or YAML content */
export function getTemplateEntityName(entity: { name?: unknown; yamlContent?: unknown }): string {
    if (typeof entity.name === 'string' && entity.name.trim().length > 0) {
        return entity.name.trim();
    }
    if (typeof entity.yamlContent === 'string') {
        const match = entity.yamlContent.match(/^name:\s*(.+)$/m);
        if (match) {
            return match[1].trim().replace(/^["']|["']$/g, '').trim();
        }
    }
    return '';
}

function getEntityRecords(template: Template, entityType: TemplateEntityType): TemplateEntityRecord[] {
    const list = template.entities[getTemplateEntityPluralKey(entityType)];
    return Array.isArray(list) ? list : [];
}

function collectTemplateEntities(template: Template): Array<{ entityType: TemplateEntityType; entity: TemplateEntityRecord }> {
    const result: Array<{ entityType: TemplateEntityType; entity: TemplateEntityRecord }> = [];
    for (const entityType of TEMPLATE_ENTITY_TYPES) {
        for (const entity of getEntityRecords(template, entityType)) {
            if (typeof entity.templateId === 'string' && entity.templateId.length > 0) {
                result.push({ entityType, entity });
            }
        }
    }
    return result;
}

/** Lists every template entity that has a templateId, grouped in registry order */
export function listTemplateEntities(template: Template): TemplateEntityListItem[] {
    return collectTemplateEntities(template).map(({ entityType, entity }) => ({
        templateId: entity.templateId as string,
        entityType,
        name: getTemplateEntityName(entity)
    }));
}

/**
 * Build the includeEntities selection used by TemplateApplicator.filterEntities:
 * one array of kept templateIds per entity collection, keyed by plural key.
 */
export function buildIncludeSelection(
    items: readonly TemplateEntityListItem[],
    excludedTemplateIds: ReadonlySet<string>
): TemplateEntitySelection {
    const selection: Record<string, string[]> = {};
    for (const item of items) {
        const key = getTemplateEntityPluralKey(item.entityType) as string;
        const kept = selection[key] ?? [];
        selection[key] = kept;
        if (!excludedTemplateIds.has(item.templateId)) {
            kept.push(item.templateId);
        }
    }
    return selection;
}

/** Normalizes one reference token for comparison against ids and names */
function normalizeToken(value: string): string {
    return value
        .trim()
        .replace(/^\[\[|\]\]$/g, '')
        .replace(/^["']|["']$/g, '')
        .trim()
        .toLowerCase();
}

/**
 * Extract the candidate reference values from one line of YAML or plain text.
 * Top-level "name:" lines are skipped so an entity never matches itself by name.
 */
function lineReferenceTokens(line: string): string[] {
    if (/^name:/.test(line)) return [];

    let text = line.trim().replace(/^-\s+/, '');
    const colon = text.indexOf(':');
    if (colon >= 0) {
        text = text.slice(colon + 1);
    }
    text = text.trim();

    if (text.startsWith('[') && !text.startsWith('[[') && text.endsWith(']')) {
        return text.slice(1, -1).split(',').map(normalizeToken).filter(token => token.length > 0);
    }

    const token = normalizeToken(text);
    return token.length > 0 ? [token] : [];
}

function collectReferenceTokens(value: unknown, tokens: Set<string>): void {
    if (typeof value === 'string') {
        for (const line of value.split('\n')) {
            lineReferenceTokens(line).forEach(token => tokens.add(token));
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectReferenceTokens(item, tokens));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            // The entity's own id and top-level name are not references
            if (key === 'templateId' || key === 'name') continue;
            collectReferenceTokens(nested, tokens);
        }
    }
}

/**
 * Find kept entities whose fields mention an excluded entity by templateId or name.
 * Matching is exact per value (not substring), so free-text mentions are not flagged.
 */
export function findExcludedReferences(
    template: Template,
    excludedTemplateIds: ReadonlySet<string>,
    displayNames?: ReadonlyMap<string, string>
): ExcludedEntityReference[] {
    if (excludedTemplateIds.size === 0) return [];

    const entries = collectTemplateEntities(template);
    const excluded = entries.filter(({ entity }) => excludedTemplateIds.has(entity.templateId as string));
    if (excluded.length === 0) return [];

    const displayName = (templateId: string, rawName: string): string =>
        displayNames?.get(templateId) || rawName || 'Unnamed';

    const targets = excluded.map(({ entityType, entity }) => {
        const templateId = entity.templateId as string;
        const rawName = getTemplateEntityName(entity);
        const identifiers = [templateId.toLowerCase()];
        if (rawName.length > 0) identifiers.push(rawName.toLowerCase());
        return { templateId, entityType, identifiers, name: displayName(templateId, rawName) };
    });

    const references: ExcludedEntityReference[] = [];
    const seen = new Set<string>();

    for (const { entityType, entity } of entries) {
        const sourceTemplateId = entity.templateId as string;
        if (excludedTemplateIds.has(sourceTemplateId)) continue;

        const tokens = new Set<string>();
        collectReferenceTokens(entity, tokens);

        for (const target of targets) {
            if (!target.identifiers.some(identifier => tokens.has(identifier))) continue;
            const key = `${sourceTemplateId}->${target.templateId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            references.push({
                sourceTemplateId,
                sourceName: displayName(sourceTemplateId, getTemplateEntityName(entity)),
                sourceType: entityType,
                targetTemplateId: target.templateId,
                targetName: target.name,
                targetType: target.entityType
            });
        }
    }

    return references;
}

/** Turns excluded-reference findings into one readable line per finding */
export function describeExcludedReferences(references: readonly ExcludedEntityReference[]): string[] {
    return references.map(reference => {
        const source = `${reference.sourceName} (${getTemplateEntityLabel(reference.sourceType)})`;
        const target = `${reference.targetName} (${getTemplateEntityLabel(reference.targetType)})`;
        return `${source} refers to ${target}, which will not be created.`;
    });
}
