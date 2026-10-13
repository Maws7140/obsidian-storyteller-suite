import type { SceneBranch, SceneOutcomeFields } from '../types';

/** One effect shown as a chip: `kind` picks the colour (`is-grant`, `is-remove`, ...). */
export interface OutcomeChip {
    kind: 'grant' | 'remove' | 'flag' | 'event' | 'standing' | 'lore' | 'tags' | 'encounter';
    text: string;
}

/** Describes what a choice or encounter row does when it happens, in a fixed order. */
export function outcomeChips(fields: SceneOutcomeFields & Pick<SceneBranch, 'rollsEncounter'>): OutcomeChip[] {
    const chips: OutcomeChip[] = [];
    if (fields.rollsEncounter) chips.push({ kind: 'encounter', text: 'Rolls encounter' });
    if (fields.grantsItem) chips.push({ kind: 'grant', text: `+ ${fields.grantsItem}` });
    if (fields.removesItem) chips.push({ kind: 'remove', text: `- ${fields.removesItem}` });
    if (fields.grantsCharacter) chips.push({ kind: 'grant', text: `+ ${fields.grantsCharacter} joins` });
    if (fields.removesCharacter) chips.push({ kind: 'remove', text: `- ${fields.removesCharacter} leaves` });
    if (fields.setsFlag) chips.push({ kind: 'flag', text: `Flag: ${fields.setsFlag}` });
    if (fields.clearsFlag) chips.push({ kind: 'flag', text: `Clears: ${fields.clearsFlag}` });
    if (fields.changesGroupStanding || fields.changesGroupStandingId) {
        const delta = fields.groupStandingDelta ?? 1;
        const name = fields.changesGroupStanding ?? fields.changesGroupStandingId;
        chips.push({ kind: 'standing', text: `${name} ${delta > 0 ? '+' : ''}${delta}` });
    }
    if (fields.revealsCompendiumEntry || fields.revealsCompendiumEntryId) {
        chips.push({ kind: 'lore', text: `Lore: ${fields.revealsCompendiumEntry ?? fields.revealsCompendiumEntryId}` });
    }
    if (fields.triggersEvent || fields.triggersEventId) {
        chips.push({ kind: 'event', text: `Event: ${fields.triggersEvent ?? fields.triggersEventId}` });
    }
    if (fields.tags?.trim()) chips.push({ kind: 'tags', text: fields.tags.trim() });
    return chips;
}
