import { parseYaml, stringifyYaml } from 'obsidian';
import { SceneBranch, SceneOutcomeFields, EncounterTable, EncounterTableRow } from '../types';

type FieldKind = 'string' | 'number' | 'boolean';

/** One optional YAML field: the camelCase key on the object and the kebab-case key written to the block. */
interface FieldSpec<T> {
    key: keyof T & string;
    yaml: string;
    kind: FieldKind;
}

const field = <T>(key: keyof T & string, yaml: string, kind: FieldKind = 'string'): FieldSpec<T> => ({ key, yaml, kind });

/** Effects shared by choices and encounter rows, in the order they are written. */
const OUTCOME_FIELDS: ReadonlyArray<FieldSpec<SceneOutcomeFields>> = [
    field('grantsItem', 'grants-item'),
    field('removesItem', 'removes-item'),
    field('grantsCharacter', 'grants-character'),
    field('removesCharacter', 'removes-character'),
    field('setsFlag', 'sets-flag'),
    field('clearsFlag', 'clears-flag'),
    field('changesGroupStanding', 'changes-group-standing'),
    field('changesGroupStandingId', 'changes-group-standing-id'),
    field('groupStandingDelta', 'group-standing-delta', 'number'),
    field('revealsCompendiumEntry', 'reveals-compendium-entry'),
    field('revealsCompendiumEntryId', 'reveals-compendium-entry-id'),
    field('triggersEvent', 'triggers-event'),
    field('triggersEventId', 'triggers-event-id'),
    field('tags', 'tags'),
];

/** Choice fields before the shared outcomes, in the order they are written. */
const BRANCH_FIELDS: ReadonlyArray<FieldSpec<SceneBranch>> = [
    field('target', 'target'),
    field('targetSceneId', 'target-scene-id'),
    field('fail', 'fail'),
    field('failSceneId', 'fail-scene-id'),
    field('failMode', 'fail-mode'),
    field('dice', 'dice'),
    field('stat', 'stat'),
    field('threshold', 'threshold', 'number'),
    field('requiresItem', 'requires-item'),
    field('requiresCharacter', 'requires-character'),
    field('requiresCharacterId', 'requires-character-id'),
    field('requiresFlag', 'requires-flag'),
    field('requiresNoFlag', 'requires-no-flag'),
    field('requiresStatMin', 'requires-stat-min', 'number'),
    field('requiresGroupStanding', 'requires-group-standing'),
    field('requiresGroupStandingId', 'requires-group-standing-id'),
    field('requiresGroupStandingMin', 'requires-group-standing-min', 'number'),
    field('requiresCompendiumEntry', 'requires-compendium-entry'),
    field('requiresCompendiumEntryId', 'requires-compendium-entry-id'),
];

/** Choice fields after the shared outcomes. */
const BRANCH_TAIL_FIELDS: ReadonlyArray<FieldSpec<SceneBranch>> = [
    field('rollsEncounter', 'rolls-encounter', 'boolean'),
    field('hidden', 'hidden', 'boolean'),
];

/** Reads each field from its kebab-case or camelCase key; camelCase wins when both are present. */
function readFields<T>(item: Record<string, unknown>, specs: ReadonlyArray<FieldSpec<T>>, out: T): void {
    const target = out as Record<string, unknown>;
    for (const spec of specs) {
        for (const key of [spec.yaml, spec.key]) {
            const value = item[key];
            if (spec.kind === 'string') {
                if (value) target[spec.key] = String(value);
            } else if (spec.kind === 'number') {
                if (value != null) target[spec.key] = Number(value);
            } else if (value != null) {
                target[spec.key] = Boolean(value);
            }
        }
    }
}

/** Writes set fields under their kebab-case keys. Booleans are written only when true. */
function writeFields<T>(src: T, specs: ReadonlyArray<FieldSpec<T>>, item: Record<string, unknown>): void {
    const source = src as Record<string, unknown>;
    for (const spec of specs) {
        const value = source[spec.key];
        if (spec.kind === 'string') {
            if (value) item[spec.yaml] = value;
        } else if (spec.kind === 'number') {
            if (value != null) item[spec.yaml] = value;
        } else if (value) {
            item[spec.yaml] = true;
        }
    }
}

/**
 * Parse a raw `branch` code block body (YAML list) into SceneBranch objects.
 * Assigns a stable index-based id to each branch that lacks one.
 */
export function parseBranches(source: string): SceneBranch[] {
    if (!source || !source.trim()) return [];
    let raw: unknown;
    try {
        raw = parseYaml(source);
    } catch {
        return [];
    }
    if (!Array.isArray(raw)) return [];
    return (raw as Record<string, unknown>[]).map((item, i) => {
        const b: SceneBranch = {
            id: String(item['id'] ?? `branch-${i}`),
            label: String(item['label'] ?? ''),
        };
        readFields(item, BRANCH_FIELDS, b);
        readFields(item, OUTCOME_FIELDS, b);
        readFields(item, BRANCH_TAIL_FIELDS, b);
        return b;
    });
}

/**
 * Parse a raw `encounter` code block body (YAML map) into an EncounterTable.
 */
export function parseEncounterTable(source: string): EncounterTable | null {
    if (!source || !source.trim()) return null;
    let raw: unknown;
    try {
        raw = parseYaml(source);
    } catch {
        return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const rows: EncounterTableRow[] = [];
    if (Array.isArray(obj['rows'])) {
        for (const r of obj['rows'] as Record<string, unknown>[]) {
            const row: EncounterTableRow = {
                min:    Number(r['min'] ?? 1),
                max:    Number(r['max'] ?? 1),
                label:  String(r['label'] ?? ''),
                target: String(r['target'] ?? 'continue'),
            };
            if (r['id']) row.id = String(r['id']);
            readFields(r, OUTCOME_FIELDS, row);
            rows.push(row);
        }
    }
    return {
        dice:    (obj['dice'] as EncounterTable['dice']) ?? 'd6',
        trigger: (obj['trigger'] as EncounterTable['trigger']) ?? 'manual',
        rows,
    };
}

/**
 * Serialize SceneBranch[] back to the YAML list used inside a `branch` code block.
 */
export function serializeBranches(branches: SceneBranch[]): string {
    const list = branches.map(b => {
        const item: Record<string, unknown> = { label: b.label };
        writeFields(b, BRANCH_FIELDS, item);
        writeFields(b, OUTCOME_FIELDS, item);
        writeFields(b, BRANCH_TAIL_FIELDS, item);
        return item;
    });
    return stringifyYaml(list).trimEnd();
}

/**
 * Serialize an EncounterTable back to the YAML map used inside an `encounter` code block.
 */
export function serializeEncounterTable(table: EncounterTable): string {
    const obj = {
        dice:    table.dice,
        trigger: table.trigger,
        rows:    table.rows.map(r => {
            const item: Record<string, unknown> = { min: r.min, max: r.max, label: r.label, target: r.target };
            if (r.id) item['id'] = r.id;
            writeFields(r, OUTCOME_FIELDS, item);
            return item;
        }),
    };
    return stringifyYaml(obj).trimEnd();
}

/** Extract branch/encounter code fences from a markdown string using regex. */
function extractCodeBlock(markdown: string, lang: string): string | null {
    const regex = new RegExp('```' + lang + '\\r?\\n([\\s\\S]*?)```', 'i');
    const m = markdown.match(regex);
    return m ? m[1] : null;
}

/**
 * Extract all SceneBranches from a full scene markdown string.
 * Looks for a ```branch block anywhere in the content.
 */
export function extractBranchesFromMarkdown(markdown: string): SceneBranch[] {
    const src = extractCodeBlock(markdown, 'branch');
    return src ? parseBranches(src) : [];
}

/**
 * Extract an EncounterTable from a full scene markdown string.
 * Looks for an ```encounter block anywhere in the content.
 */
export function extractEncounterTableFromMarkdown(markdown: string): EncounterTable | null {
    const src = extractCodeBlock(markdown, 'encounter');
    return src ? parseEncounterTable(src) : null;
}
