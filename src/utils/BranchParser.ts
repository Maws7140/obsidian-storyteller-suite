import { parseYaml, stringifyYaml } from 'obsidian';
import { SceneBranch, EncounterTable, EncounterTableRow } from '../types';

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
        if (item['target'])        b.target        = String(item['target']);
        if (item['target-scene-id']) b.targetSceneId = String(item['target-scene-id']);
        if (item['targetSceneId'])   b.targetSceneId = String(item['targetSceneId']);
        if (item['fail'])          b.fail          = String(item['fail']);
        if (item['fail-scene-id']) b.failSceneId   = String(item['fail-scene-id']);
        if (item['failSceneId'])   b.failSceneId   = String(item['failSceneId']);
        if (item['fail-mode'])     b.failMode      = item['fail-mode'] as SceneBranch['failMode'];
        if (item['failMode'])      b.failMode      = item['failMode'] as SceneBranch['failMode'];
        if (item['dice'])          b.dice          = item['dice'] as SceneBranch['dice'];
        if (item['stat'])          b.stat          = String(item['stat']) as SceneBranch['stat'];
        if (item['threshold'] != null) b.threshold = Number(item['threshold']);
        if (item['requires-item'])      b.requiresItem      = String(item['requires-item']);
        if (item['requiresItem'])       b.requiresItem      = String(item['requiresItem']);
        if (item['requires-character']) b.requiresCharacter = String(item['requires-character']);
        if (item['requiresCharacter'])  b.requiresCharacter = String(item['requiresCharacter']);
        if (item['requires-character-id']) b.requiresCharacterId = String(item['requires-character-id']);
        if (item['requiresCharacterId'])   b.requiresCharacterId = String(item['requiresCharacterId']);
        if (item['requires-flag'])      b.requiresFlag      = String(item['requires-flag']);
        if (item['requiresFlag'])       b.requiresFlag      = String(item['requiresFlag']);
        if (item['requires-stat-min'] != null) b.requiresStatMin = Number(item['requires-stat-min']);
        if (item['requiresStatMin'] != null)   b.requiresStatMin = Number(item['requiresStatMin']);
        if (item['requires-group-standing'])   b.requiresGroupStanding = String(item['requires-group-standing']);
        if (item['requiresGroupStanding'])     b.requiresGroupStanding = String(item['requiresGroupStanding']);
        if (item['requires-group-standing-id']) b.requiresGroupStandingId = String(item['requires-group-standing-id']);
        if (item['requiresGroupStandingId'])    b.requiresGroupStandingId = String(item['requiresGroupStandingId']);
        if (item['requires-group-standing-min'] != null) b.requiresGroupStandingMin = Number(item['requires-group-standing-min']);
        if (item['requiresGroupStandingMin'] != null)   b.requiresGroupStandingMin = Number(item['requiresGroupStandingMin']);
        if (item['requires-compendium-entry'])  b.requiresCompendiumEntry = String(item['requires-compendium-entry']);
        if (item['requiresCompendiumEntry'])    b.requiresCompendiumEntry = String(item['requiresCompendiumEntry']);
        if (item['requires-compendium-entry-id']) b.requiresCompendiumEntryId = String(item['requires-compendium-entry-id']);
        if (item['requiresCompendiumEntryId'])    b.requiresCompendiumEntryId = String(item['requiresCompendiumEntryId']);
        if (item['grants-item'])        b.grantsItem        = String(item['grants-item']);
        if (item['grantsItem'])         b.grantsItem        = String(item['grantsItem']);
        if (item['removes-item'])       b.removesItem       = String(item['removes-item']);
        if (item['removesItem'])        b.removesItem       = String(item['removesItem']);
        if (item['grants-character'])   b.grantsCharacter   = String(item['grants-character']);
        if (item['grantsCharacter'])    b.grantsCharacter   = String(item['grantsCharacter']);
        if (item['removes-character'])  b.removesCharacter  = String(item['removes-character']);
        if (item['removesCharacter'])   b.removesCharacter  = String(item['removesCharacter']);
        if (item['sets-flag'])          b.setsFlag          = String(item['sets-flag']);
        if (item['setsFlag'])           b.setsFlag          = String(item['setsFlag']);
        if (item['changes-group-standing'])    b.changesGroupStanding = String(item['changes-group-standing']);
        if (item['changesGroupStanding'])      b.changesGroupStanding = String(item['changesGroupStanding']);
        if (item['changes-group-standing-id']) b.changesGroupStandingId = String(item['changes-group-standing-id']);
        if (item['changesGroupStandingId'])    b.changesGroupStandingId = String(item['changesGroupStandingId']);
        if (item['group-standing-delta'] != null) b.groupStandingDelta = Number(item['group-standing-delta']);
        if (item['groupStandingDelta'] != null)   b.groupStandingDelta = Number(item['groupStandingDelta']);
        if (item['reveals-compendium-entry'])  b.revealsCompendiumEntry = String(item['reveals-compendium-entry']);
        if (item['revealsCompendiumEntry'])    b.revealsCompendiumEntry = String(item['revealsCompendiumEntry']);
        if (item['reveals-compendium-entry-id']) b.revealsCompendiumEntryId = String(item['reveals-compendium-entry-id']);
        if (item['revealsCompendiumEntryId'])    b.revealsCompendiumEntryId = String(item['revealsCompendiumEntryId']);
        if (item['triggers-event'])     b.triggersEvent     = String(item['triggers-event']);
        if (item['triggersEvent'])      b.triggersEvent     = String(item['triggersEvent']);
        if (item['triggers-event-id'])  b.triggersEventId   = String(item['triggers-event-id']);
        if (item['triggersEventId'])    b.triggersEventId   = String(item['triggersEventId']);
        if (item['hidden'] != null)     b.hidden            = Boolean(item['hidden']);
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
            rows.push({
                min:    Number(r['min'] ?? 1),
                max:    Number(r['max'] ?? 1),
                label:  String(r['label'] ?? ''),
                target: String(r['target'] ?? 'continue'),
            });
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
        if (b.target)       item['target']        = b.target;
        if (b.targetSceneId) item['target-scene-id'] = b.targetSceneId;
        if (b.fail)         item['fail']           = b.fail;
        if (b.failSceneId)  item['fail-scene-id']  = b.failSceneId;
        if (b.failMode)     item['fail-mode']      = b.failMode;
        if (b.dice)         item['dice']           = b.dice;
        if (b.stat)         item['stat']           = b.stat;
        if (b.threshold != null)    item['threshold']         = b.threshold;
        if (b.requiresItem)         item['requires-item']     = b.requiresItem;
        if (b.requiresCharacter)    item['requires-character']= b.requiresCharacter;
        if (b.requiresCharacterId)  item['requires-character-id'] = b.requiresCharacterId;
        if (b.requiresFlag)         item['requires-flag']     = b.requiresFlag;
        if (b.requiresStatMin != null) item['requires-stat-min'] = b.requiresStatMin;
        if (b.requiresGroupStanding) item['requires-group-standing'] = b.requiresGroupStanding;
        if (b.requiresGroupStandingId) item['requires-group-standing-id'] = b.requiresGroupStandingId;
        if (b.requiresGroupStandingMin != null) item['requires-group-standing-min'] = b.requiresGroupStandingMin;
        if (b.requiresCompendiumEntry) item['requires-compendium-entry'] = b.requiresCompendiumEntry;
        if (b.requiresCompendiumEntryId) item['requires-compendium-entry-id'] = b.requiresCompendiumEntryId;
        if (b.grantsItem)           item['grants-item']       = b.grantsItem;
        if (b.removesItem)          item['removes-item']      = b.removesItem;
        if (b.grantsCharacter)      item['grants-character']  = b.grantsCharacter;
        if (b.removesCharacter)     item['removes-character'] = b.removesCharacter;
        if (b.setsFlag)             item['sets-flag']         = b.setsFlag;
        if (b.changesGroupStanding) item['changes-group-standing'] = b.changesGroupStanding;
        if (b.changesGroupStandingId) item['changes-group-standing-id'] = b.changesGroupStandingId;
        if (b.groupStandingDelta != null) item['group-standing-delta'] = b.groupStandingDelta;
        if (b.revealsCompendiumEntry) item['reveals-compendium-entry'] = b.revealsCompendiumEntry;
        if (b.revealsCompendiumEntryId) item['reveals-compendium-entry-id'] = b.revealsCompendiumEntryId;
        if (b.triggersEvent)        item['triggers-event']    = b.triggersEvent;
        if (b.triggersEventId)      item['triggers-event-id'] = b.triggersEventId;
        if (b.hidden)               item['hidden']            = true;
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
        rows:    table.rows.map(r => ({ min: r.min, max: r.max, label: r.label, target: r.target })),
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
