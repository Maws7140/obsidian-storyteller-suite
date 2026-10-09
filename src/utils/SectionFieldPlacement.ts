/**
 * Where a body-section field lives on disk: the `## Heading` body of a note, or
 * a frontmatter property.
 *
 * By default every field in BODY_SECTION_FIELD_MAP is a body section (for
 * example `## Description`). The user can opt a field into frontmatter per
 * entity type, so a Bases query such as `description` works. This module holds
 * the pure decisions; main.ts applies them on save and on read.
 *
 * Rules (see the feature notes in the settings tab):
 * - Read: a configured field prefers its frontmatter value when the key is
 *   present (even if empty). Otherwise the body section is used, so notes
 *   written before the switch still load.
 * - Write, field configured: the value goes to frontmatter (multi-line allowed)
 *   and the body section is removed, so no duplicate section is left behind.
 *   Other body content is never touched.
 * - Write, field no longer configured: a frontmatter copy is removed and the
 *   value is written back into the body section. Keys the whitelist owns (for
 *   example a map's description) are never moved.
 */

import { BODY_SECTION_FIELD_MAP } from './EntityTemplates';
import { getWhitelistKeys } from '../yaml/EntitySections';
import type { EntityType } from '../yaml/EntitySections';

/** Settings shape: entity type -> body-section field names stored as frontmatter. */
export type SectionFieldSettings = Record<string, unknown> | undefined | null;

/**
 * Fields that are never offered for frontmatter storage. Their body text is
 * parsed into structured data (scene beats become a list), which a plain
 * string property would not round-trip.
 */
const NON_CONFIGURABLE_FIELDS: Partial<Record<EntityType, readonly string[]>> = {
    scene: ['beats'],
};

export interface ConfigurableSectionField {
    /** Entity field name, e.g. "description". */
    field: string;
    /** Canonical body heading, e.g. "Description" (first listed in the map). */
    sectionName: string;
    /** Other headings that feed the same field (legacy names). */
    legacySectionNames: string[];
}

/** Body-section fields of a type that the user may store as frontmatter. */
export function getConfigurableSectionFields(type: EntityType): ConfigurableSectionField[] {
    const map = BODY_SECTION_FIELD_MAP[type] ?? {};
    const blocked = NON_CONFIGURABLE_FIELDS[type] ?? [];
    const byField = new Map<string, ConfigurableSectionField>();
    for (const [sectionName, field] of Object.entries(map)) {
        if (blocked.includes(field)) continue;
        const existing = byField.get(field);
        if (existing) existing.legacySectionNames.push(sectionName);
        else byField.set(field, { field, sectionName, legacySectionNames: [] });
    }
    return [...byField.values()];
}

/**
 * Fields of a type currently stored as frontmatter, from the settings. Unknown
 * or malformed entries are dropped so a hand-edited settings file cannot break
 * a save.
 */
export function getFrontmatterSectionFields(settings: SectionFieldSettings, type: EntityType): string[] {
    const raw = settings?.[type];
    if (!Array.isArray(raw)) return [];
    const available = new Set(getConfigurableSectionFields(type).map(entry => entry.field));
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry === 'string' && available.has(entry) && !out.includes(entry)) out.push(entry);
    }
    return out;
}

/** Result of planning: what to change in the frontmatter and the body. */
export interface SectionFieldPlan {
    /** Frontmatter keys to set. Applied after the whitelist build, so multi-line values are kept. */
    frontmatter: Record<string, string>;
    /** Frontmatter keys to delete. */
    removeFrontmatter: string[];
    /** Body sections to set (overwrite the value written by the normal save path). */
    sections: Record<string, string>;
    /** Body headings to drop. */
    removeSections: string[];
}

export interface PlanSectionFieldInput {
    entityType: EntityType;
    settings: SectionFieldSettings;
    /**
     * Fields the user switched back to note sections after storing them as
     * properties (settings `sectionFieldsReleasedToBody`). Only these have a
     * frontmatter copy moved back into the body; a property the user typed by
     * hand on a never-configured field is left alone.
     */
    released?: SectionFieldSettings;
    /** The entity being saved. Read for each configurable field. */
    entity: Record<string, unknown>;
    /** Frontmatter of the note as it is on disk (undefined for a new note). */
    originalFrontmatter?: Record<string, unknown>;
    /** Body sections of the note as it is on disk (empty for a new note). */
    existingSections?: Record<string, string>;
}

function emptyPlan(): SectionFieldPlan {
    return { frontmatter: {}, removeFrontmatter: [], sections: {}, removeSections: [] };
}

/**
 * Work out how one save should place the configurable fields of a type.
 * The value comes from the entity first, then the note's frontmatter, then the
 * note's body (so an old note migrates on its next save), then the entity's
 * template sections.
 */
export function planSectionFieldPlacement(input: PlanSectionFieldInput): SectionFieldPlan {
    const plan = emptyPlan();
    const { entityType, entity, originalFrontmatter, existingSections = {} } = input;
    const configured = new Set(getFrontmatterSectionFields(input.settings, entityType));
    const released = new Set(getFrontmatterSectionFields(input.released, entityType));
    const whitelist = getWhitelistKeys(entityType);
    const templateSections = (entity as { _templateSections?: Record<string, string> })._templateSections ?? {};

    for (const { field, sectionName, legacySectionNames } of getConfigurableSectionFields(entityType)) {
        const headings = [sectionName, ...legacySectionNames];
        const hasOriginalKey = originalFrontmatter !== undefined && field in originalFrontmatter;

        if (configured.has(field)) {
            const value = resolveFieldValue(field, headings, entity, originalFrontmatter, existingSections, templateSections);
            if (value !== '' || hasOriginalKey) plan.frontmatter[field] = value;
            plan.removeSections.push(...headings);
            continue;
        }

        // Not configured. Move a frontmatter copy back only when the user had
        // stored this field as a property and switched it off again.
        if (hasOriginalKey && released.has(field) && !whitelist.has(field)) {
            plan.removeFrontmatter.push(field);
            plan.sections[sectionName] = resolveFieldValue(field, headings, entity, originalFrontmatter, existingSections, templateSections);
        }
    }
    return plan;
}

function resolveFieldValue(
    field: string,
    headings: string[],
    entity: Record<string, unknown>,
    originalFrontmatter: Record<string, unknown> | undefined,
    existingSections: Record<string, string>,
    templateSections: Record<string, string>
): string {
    const fromEntity = entity[field];
    if (typeof fromEntity === 'string') return fromEntity;
    const fromFrontmatter = originalFrontmatter?.[field];
    if (typeof fromFrontmatter === 'string') return fromFrontmatter;
    for (const heading of headings) {
        const fromBody = existingSections[heading];
        if (typeof fromBody === 'string' && fromBody !== '') return fromBody;
    }
    for (const heading of headings) {
        const fromTemplate = templateSections[heading];
        if (typeof fromTemplate === 'string' && fromTemplate !== '') return fromTemplate;
    }
    return '';
}

/**
 * Read side: copy body sections into entity fields that the note's frontmatter
 * does not supply. Mutates `data`. Existing non-empty values in `data` win, as
 * before. A configured field that has a frontmatter key (even an empty one) is
 * never filled from the body.
 */
export function fillFieldsFromBodySections(
    entityType: EntityType,
    settings: SectionFieldSettings,
    data: Record<string, unknown>,
    frontmatter: Record<string, unknown>,
    sections: Record<string, string>
): void {
    const stored = new Set(getFrontmatterSectionFields(settings, entityType));
    for (const [sectionName, fieldName] of Object.entries(BODY_SECTION_FIELD_MAP[entityType] ?? {})) {
        if (!(sectionName in sections)) continue;
        if (stored.has(fieldName) && frontmatter[fieldName] !== undefined && frontmatter[fieldName] !== null) continue;
        const existing = data[fieldName];
        if (existing !== undefined && existing !== null && existing !== '') continue;
        data[fieldName] = sections[sectionName];
    }
}

/** Apply the frontmatter half of a plan (call before the YAML is serialised). */
export function applySectionFieldPlanToFrontmatter(plan: SectionFieldPlan, frontmatter: Record<string, unknown>): void {
    for (const key of plan.removeFrontmatter) delete frontmatter[key];
    Object.assign(frontmatter, plan.frontmatter);
}

/** Apply the body half of a plan (call once the section map is built). */
export function applySectionFieldPlanToSections(plan: SectionFieldPlan, sections: Record<string, string>): void {
    for (const heading of plan.removeSections) delete sections[heading];
    Object.assign(sections, plan.sections);
}
