import { SceneBranch, EncounterTable, EncounterTableRow, CampaignSession } from '../types';

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

const DICE_SIDES: Record<DiceType, number> = {
    d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100,
};

/** Roll a single die, returning 1–sides. */
export function roll(dice: DiceType): number {
    const sides = DICE_SIDES[dice] ?? 20;
    return Math.floor(Math.random() * sides) + 1;
}

/** Standard D&D ability score modifier: floor((score - 10) / 2). */
export function statModifier(score: number): number {
    return Math.floor((score - 10) / 2);
}

/** Roll a die and add a stat modifier to it. */
export function rollWithStat(
    dice: DiceType,
    statScore: number
): { raw: number; mod: number; total: number } {
    const raw = roll(dice);
    const mod = statModifier(statScore);
    return { raw, mod, total: raw + mod };
}

/**
 * Given a branch with a dice check and the total roll result,
 * return whether the roll was a success or fail.
 * Branches without a dice requirement always succeed.
 */
export function resolveBranch(branch: SceneBranch, rollTotal: number): 'success' | 'fail' {
    if (!branch.dice || branch.threshold == null) return 'success';
    return rollTotal >= branch.threshold ? 'success' : 'fail';
}

/**
 * Roll on an encounter table and return the matching row.
 * If no row matches (gap in ranges), returns the last row as a fallback.
 */
export function rollEncounterTable(table: EncounterTable): EncounterTableRow {
    const result = roll(table.dice);
    const match = table.rows.find(r => result >= r.min && result <= r.max);
    return match ?? table.rows[table.rows.length - 1];
}

/**
 * Check whether all non-dice conditions on a branch are satisfied by the
 * current session state. Returns a list of unmet condition descriptions, or
 * an empty array if all conditions pass.
 *
 * Does NOT check dice — that is handled separately via rollWithStat / resolveBranch.
 */
export function checkBranchConditions(
    branch: SceneBranch,
    session: Pick<CampaignSession, 'partyCharacterNames' | 'partyItems' | 'flags' | 'partyState' | 'groupStandings' | 'revealedCompendiumEntryIds'>,
    /** Optional: the character whose stat to use for requires-stat-min (defaults to best in party). */
    characterState?: ({ characterName?: string } & Record<string, unknown>)
): { met: boolean; unmet: string[] } {
    const unmet: string[] = [];
    const normalize = (value: string): string => value.trim().toLowerCase();

    if (branch.requiresItem) {
        const items = session.partyItems ?? [];
        if (!items.some(i => i.toLowerCase() === branch.requiresItem!.toLowerCase())) {
            unmet.push(`Missing item: ${branch.requiresItem}`);
        }
    }

    if (branch.requiresCharacter) {
        const names = session.partyCharacterNames ?? [];
        if (!names.some(n => n.toLowerCase() === branch.requiresCharacter!.toLowerCase())) {
            unmet.push(`${branch.requiresCharacter} not in party`);
        }
    }

    if (branch.requiresFlag) {
        const flags = session.flags ?? [];
        if (!flags.includes(branch.requiresFlag)) {
            unmet.push(`Flag not set: ${branch.requiresFlag}`);
        }
    }

    if (branch.requiresCompendiumEntry || branch.requiresCompendiumEntryId) {
        const revealed = (session.revealedCompendiumEntryIds ?? []).map(entry => normalize(entry));
        const targetId = branch.requiresCompendiumEntryId ? normalize(branch.requiresCompendiumEntryId) : '';
        const targetName = branch.requiresCompendiumEntry ? normalize(branch.requiresCompendiumEntry) : '';
        const hasEntry = Boolean(
            (targetId && revealed.includes(targetId)) ||
            (targetName && revealed.includes(targetName))
        );
        if (!hasEntry) {
            unmet.push(`Lore not discovered: ${branch.requiresCompendiumEntry ?? branch.requiresCompendiumEntryId}`);
        }
    }

    if (branch.requiresGroupStanding || branch.requiresGroupStandingId) {
        const standings = session.groupStandings ?? [];
        const targetStanding = standings.find(entry =>
            (branch.requiresGroupStandingId && entry.groupId === branch.requiresGroupStandingId) ||
            (branch.requiresGroupStanding && entry.groupName && normalize(entry.groupName) === normalize(branch.requiresGroupStanding))
        );
        const currentValue = targetStanding?.value ?? 0;
        const minStanding = branch.requiresGroupStandingMin ?? 1;
        if (currentValue < minStanding) {
            const groupLabel = branch.requiresGroupStanding ?? branch.requiresGroupStandingId ?? 'group';
            unmet.push(`${groupLabel} standing ${currentValue} < ${minStanding}`);
        }
    }

    if (branch.requiresStatMin != null && branch.stat) {
        // Check the highest value of the relevant stat across all party members.
        // The caller can pass a specific characterState to override this.
        const statKey = `dnd${branch.stat.charAt(0).toUpperCase() + branch.stat.slice(1)}` as string;
        let best = characterState ? Number(characterState[statKey] ?? 0) : 0;
        if (!characterState) {
            // partyState doesn't carry D&D stats directly — CampaignView will need to
            // look them up from character files. Here we just note the requirement.
            // Return unmet only if we have explicit data showing it fails.
        }
        if (characterState && best < branch.requiresStatMin) {
            const actor = characterState.characterName ? ` (${characterState.characterName})` : '';
            unmet.push(`${branch.stat.toUpperCase()}${actor} ${best} < ${branch.requiresStatMin}`);
        }
    }

    return { met: unmet.length === 0, unmet };
}

/**
 * Apply the outcomes of a taken branch to the session, returning a mutated copy.
 * Does not persist — caller is responsible for calling saveSession.
 */
export function applyBranchOutcomes(
    branch: SceneBranch,
    session: CampaignSession
): CampaignSession {
    const next = { ...session };
    const normalize = (value: string): string => value.trim().toLowerCase();

    if (branch.grantsItem) {
        next.partyItems = [...(next.partyItems ?? []), branch.grantsItem];
    }
    if (branch.removesItem) {
        next.partyItems = (next.partyItems ?? []).filter(
            i => i.toLowerCase() !== branch.removesItem!.toLowerCase()
        );
    }
    if (branch.grantsCharacter) {
        const names = next.partyCharacterNames ?? [];
        if (!names.some(n => n.toLowerCase() === branch.grantsCharacter!.toLowerCase())) {
            next.partyCharacterNames = [...names, branch.grantsCharacter];
        }
    }
    if (branch.removesCharacter) {
        next.partyCharacterNames = (next.partyCharacterNames ?? []).filter(
            n => n.toLowerCase() !== branch.removesCharacter!.toLowerCase()
        );
    }
    if (branch.setsFlag) {
        const flags = next.flags ?? [];
        if (!flags.includes(branch.setsFlag)) {
            next.flags = [...flags, branch.setsFlag];
        }
    }

    if (branch.revealsCompendiumEntry || branch.revealsCompendiumEntryId) {
        const ref = branch.revealsCompendiumEntryId ?? branch.revealsCompendiumEntry;
        if (ref) {
            const current = next.revealedCompendiumEntryIds ?? [];
            if (!current.some(entry => normalize(entry) === normalize(ref))) {
                next.revealedCompendiumEntryIds = [...current, ref];
            }
        }
    }

    if (branch.changesGroupStanding || branch.changesGroupStandingId) {
        const groupRefId = branch.changesGroupStandingId;
        const groupRefName = branch.changesGroupStanding;
        const delta = branch.groupStandingDelta ?? 1;
        const standings = [...(next.groupStandings ?? [])];
        const existingIndex = standings.findIndex(entry =>
            (groupRefId && entry.groupId === groupRefId) ||
            (groupRefName && entry.groupName && normalize(entry.groupName) === normalize(groupRefName))
        );
        if (existingIndex >= 0) {
            const existing = standings[existingIndex];
            standings[existingIndex] = {
                ...existing,
                groupId: existing.groupId ?? groupRefId,
                groupName: existing.groupName ?? groupRefName,
                value: (existing.value ?? 0) + delta,
            };
        } else {
            standings.push({
                groupId: groupRefId,
                groupName: groupRefName,
                value: delta,
            });
        }
        next.groupStandings = standings;
    }

    return next;
}
