import { describe, it, expect } from 'vitest';
import { stringifyYaml } from 'obsidian';
import {
    applySectionFieldPlanToFrontmatter,
    applySectionFieldPlanToSections,
    fillFieldsFromBodySections,
    getConfigurableSectionFields,
    getFrontmatterSectionFields,
    planSectionFieldPlacement,
} from '../../src/utils/SectionFieldPlacement';
import type { SectionFieldSettings } from '../../src/utils/SectionFieldPlacement';
import { buildFrontmatter, parseFrontmatterFromContent, parseSectionsFromMarkdown } from '../../src/yaml/EntitySections';
import { getTemplateSections } from '../../src/utils/EntityTemplates';
import { sweepCustomFieldsOnRead } from '../../src/modals/entity/CustomFieldDefinitions';

const ON: SectionFieldSettings = { character: ['description'] };
const OFF: SectionFieldSettings = {};

/**
 * Mirrors the character save path in main.ts (saveCharacter): frontmatter from the
 * whitelist, placement plan applied, sections merged default < existing < provided,
 * then the note is assembled as `---` YAML `---` followed by `## Heading` blocks.
 */
function saveCharacterNote(
    entity: Record<string, unknown>,
    settings: SectionFieldSettings,
    existing?: string
): string {
    const originalFrontmatter = existing ? parseFrontmatterFromContent(existing) : undefined;
    const existingSections = existing ? parseSectionsFromMarkdown(existing) : {};
    const { description, backstory, ...rest } = entity as Record<string, string | undefined>;
    const frontmatter = buildFrontmatter('character', rest, undefined, { originalFrontmatter });
    const plan = planSectionFieldPlacement({
        entityType: 'character',
        settings,
        entity,
        originalFrontmatter,
        existingSections,
    });
    applySectionFieldPlanToFrontmatter(plan, frontmatter);

    const provided = {
        Description: description !== undefined ? description : '',
        Backstory: backstory !== undefined ? backstory : '',
    };
    const sections = existing
        ? { ...getTemplateSections('character', provided), ...existingSections, ...provided }
        : { ...getTemplateSections('character', provided), ...provided };
    applySectionFieldPlanToSections(plan, sections);

    const yaml = Object.keys(frontmatter).length > 0 ? stringifyYaml(frontmatter) : '';
    let content = `---\n${yaml}---\n\n`;
    content += Object.entries(sections).map(([key, value]) => `## ${key}\n${value || ''}`).join('\n\n');
    return content.endsWith('\n') ? content : `${content}\n`;
}

/** Mirrors the body fallback in parseFile (main.ts). */
function loadCharacter(content: string, settings: SectionFieldSettings): Record<string, unknown> {
    const frontmatter = parseFrontmatterFromContent(content) ?? {};
    const sections = parseSectionsFromMarkdown(content);
    const data: Record<string, unknown> = { ...frontmatter };
    fillFieldsFromBodySections('character', settings, data, frontmatter, sections);
    return data;
}

const MULTI_LINE = 'Mara keeps the lighthouse.\n\nShe never sleeps: the lamp is her oath.\n- wary of boats\n- loves storms';

describe('SectionFieldPlacement', () => {
    describe('configuration', () => {
        it('lists configurable fields once, using the canonical heading', () => {
            const item = getConfigurableSectionFields('item').map(entry => entry.field);
            expect(item.filter(field => field === 'history')).toHaveLength(1);
            const history = getConfigurableSectionFields('item').find(entry => entry.field === 'history');
            expect(history?.sectionName).toBe('History');
            expect(history?.legacySectionNames).toEqual(['History / Lore']);
        });

        it('never offers scene beats, which parse into a list', () => {
            const fields = getConfigurableSectionFields('scene').map(entry => entry.field);
            expect(fields).not.toContain('beats');
        });

        it('keeps only known string fields from settings, without duplicates', () => {
            expect(getFrontmatterSectionFields({ character: ['description', 'description', 'nope', 'backstory'] }, 'character'))
                .toEqual(['description', 'backstory']);
            expect(getFrontmatterSectionFields({ character: 'description' as unknown as string[] }, 'character')).toEqual([]);
            expect(getFrontmatterSectionFields(undefined, 'character')).toEqual([]);
            expect(getFrontmatterSectionFields({}, 'character')).toEqual([]);
        });
    });

    describe('round trip with description as a property', () => {
        it('writes a multi-line description to frontmatter and drops the Description section', () => {
            const content = saveCharacterNote({ name: 'Mara', description: MULTI_LINE, backstory: 'Born at sea.' }, ON);

            expect(content).not.toContain('## Description');
            expect(content).toContain('## Backstory\nBorn at sea.');
            const fm = parseFrontmatterFromContent(content);
            expect(fm?.description).toBe(MULTI_LINE);
        });

        it('reads the same description back', () => {
            const content = saveCharacterNote({ name: 'Mara', description: MULTI_LINE, backstory: 'Born at sea.' }, ON);
            const loaded = loadCharacter(content, ON);
            expect(loaded.description).toBe(MULTI_LINE);
            expect(loaded.backstory).toBe('Born at sea.');
        });

        it('keeps markdown headings inside the property out of the body section parser', () => {
            const tricky = '## Not a section\nText line\n---\nmore';
            const content = saveCharacterNote({ name: 'Mara', description: tricky, backstory: 'x' }, ON);
            const loaded = loadCharacter(content, ON);
            expect(loaded.description).toBe(tricky);
            expect(Object.keys(parseSectionsFromMarkdown(content))).toEqual(['Backstory']);
        });

        it('keeps an empty description as an empty property when the key was already there', () => {
            const first = saveCharacterNote({ name: 'Mara', description: 'Something', backstory: '' }, ON);
            const cleared = saveCharacterNote({ name: 'Mara', description: '', backstory: '' }, ON, first);
            expect(parseFrontmatterFromContent(cleared)).toHaveProperty('description', '');
            expect(loadCharacter(cleared, ON).description).toBe('');
        });
    });

    describe('reading notes written before the switch', () => {
        const legacyNote = [
            '---',
            'entityType: character',
            'name: Mara',
            '---',
            '',
            '## Description',
            'Old body text.',
            '',
            '## Backstory',
            'Old backstory.',
        ].join('\n');

        it('falls back to the body section when the property is absent', () => {
            expect(loadCharacter(legacyNote, ON).description).toBe('Old body text.');
        });

        it('migrates the section into the property on the next save', () => {
            const loaded = loadCharacter(legacyNote, ON);
            const saved = saveCharacterNote(loaded, ON, legacyNote);
            expect(parseFrontmatterFromContent(saved)).toHaveProperty('description', 'Old body text.');
            expect(saved).not.toContain('## Description');
            expect(saved).toContain('## Backstory\nOld backstory.');
        });

        it('does not change how a note reads when the setting is off', () => {
            expect(loadCharacter(legacyNote, OFF).description).toBe('Old body text.');
        });

        it('does not let a body section override an empty property', () => {
            const note = legacyNote.replace('name: Mara', "name: Mara\ndescription: ''");
            expect(loadCharacter(note, ON).description).toBe('');
        });
    });

    describe('switching the setting off again', () => {
        it('moves the value back into the Description section and removes the property', () => {
            const onNote = saveCharacterNote({ name: 'Mara', description: MULTI_LINE, backstory: 'Born at sea.' }, ON);
            const loaded = loadCharacter(onNote, OFF);
            expect(loaded.description).toBe(MULTI_LINE);

            const offNote = saveCharacterNote(loaded, OFF, onNote);
            expect(parseFrontmatterFromContent(offNote)).not.toHaveProperty('description');
            expect(parseSectionsFromMarkdown(offNote).Description).toBe(MULTI_LINE);
            expect(parseSectionsFromMarkdown(offNote).Backstory).toBe('Born at sea.');
        });

        it('keeps the property value when the entity arrives without a description', () => {
            const onNote = saveCharacterNote({ name: 'Mara', description: 'Kept safe.', backstory: '' }, ON);
            const offNote = saveCharacterNote({ name: 'Mara', backstory: '' }, OFF, onNote);
            expect(parseFrontmatterFromContent(offNote)).not.toHaveProperty('description');
            expect(parseSectionsFromMarkdown(offNote).Description).toBe('Kept safe.');
        });

        it('leaves the frontmatter alone when the setting was never on (default vaults)', () => {
            const note = saveCharacterNote({ name: 'Mara', description: 'Plain.', backstory: '' }, OFF);
            expect(parseFrontmatterFromContent(note)).not.toHaveProperty('description');
            expect(parseSectionsFromMarkdown(note).Description).toBe('Plain.');
        });
    });

    describe('plan details', () => {
        it('does nothing for fields that are not configured and not in frontmatter', () => {
            const plan = planSectionFieldPlacement({
                entityType: 'character',
                settings: OFF,
                entity: { name: 'Mara', description: 'Body only.' },
            });
            expect(plan.frontmatter).toEqual({});
            expect(plan.removeFrontmatter).toEqual([]);
            expect(plan.sections).toEqual({});
            expect(plan.removeSections).toEqual([]);
        });

        it('never moves a key the whitelist owns (map description)', () => {
            const plan = planSectionFieldPlacement({
                entityType: 'map',
                settings: OFF,
                entity: { name: 'Atlas', description: 'Old' },
                originalFrontmatter: { name: 'Atlas', description: 'Old' },
            });
            expect(plan.removeFrontmatter).toEqual([]);
        });

        it('drops legacy headings that feed a configured field', () => {
            const plan = planSectionFieldPlacement({
                entityType: 'item',
                settings: { item: ['history'] },
                entity: { name: 'Blade', history: 'Forged in fire.' },
            });
            expect(plan.removeSections).toEqual(expect.arrayContaining(['History', 'History / Lore']));
            expect(plan.frontmatter.history).toBe('Forged in fire.');
        });

        it('applies to other entity types the same way', () => {
            const plan = planSectionFieldPlacement({
                entityType: 'location',
                settings: { location: ['description'] },
                entity: { name: 'Harbour', description: 'A quiet harbour.\nTwo piers.' },
                existingSections: { Description: 'Stale.', History: 'Kept.' },
            });
            const fm: Record<string, unknown> = { name: 'Harbour' };
            applySectionFieldPlanToFrontmatter(plan, fm);
            const sections: Record<string, string> = { Description: 'Stale.', History: 'Kept.' };
            applySectionFieldPlanToSections(plan, sections);
            expect(fm.description).toBe('A quiet harbour.\nTwo piers.');
            expect(sections).toEqual({ History: 'Kept.' });
        });
    });

    describe('read sweep', () => {
        it('keeps a stored section field at the top level instead of moving it to customFields', () => {
            const item = { name: 'Blade', culturalSignificance: 'Sung about in the north.' } as Record<string, unknown>;
            sweepCustomFieldsOnRead('item', item, [], ['culturalSignificance']);
            expect(item.culturalSignificance).toBe('Sung about in the north.');
            expect(item.customFields).toEqual({});
        });

        it('still sweeps the same key when it is not stored as a property', () => {
            const item = { name: 'Blade', culturalSignificance: 'Sung about in the north.' } as Record<string, unknown>;
            sweepCustomFieldsOnRead('item', item);
            expect(item).not.toHaveProperty('culturalSignificance');
            expect(item.customFields).toEqual({ culturalSignificance: 'Sung about in the north.' });
        });
    });
});
