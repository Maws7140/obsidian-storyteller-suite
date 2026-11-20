/**
 * Initiative tracking for campaign play.
 *
 * A combat is saved on the session, so it survives closing Obsidian mid-fight. Party members are
 * linked to the session's party state by name, so damage dealt in combat and on the Party tab is
 * the same number. Monsters keep their own HP here. Duplicate names are lettered (Goblin A,
 * Goblin B) the way D&D Beyond Maps does it, so the DM can tell them apart at a glance.
 */

export interface Combatant {
    id: string;
    name: string;
    initiative: number;
    /** A party member: HP and conditions live in the session's party state. */
    isPlayer: boolean;
    hp?: number;
    maxHp?: number;
    conditions?: string[];
    /** Not on the player screen until the DM reveals it (an ambusher, a hidden caster). */
    hidden?: boolean;
    /** Dropped or defeated: stays in the list, struck through, and is skipped on turns. */
    out?: boolean;
}

export interface CombatState {
    round: number;
    /** Index into the initiative order of whoever is acting. */
    turn: number;
    combatants: Combatant[];
}

export interface NewCombatant {
    name: string;
    initiative: number;
    isPlayer: boolean;
    hp?: number;
    maxHp?: number;
    hidden?: boolean;
}

let nextId = 0;
const newId = () => `c${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** Initiative order: highest first; ties go to the party, then by name. */
export function initiativeOrder(combat: CombatState): Combatant[] {
    return [...combat.combatants].sort((a, b) =>
        b.initiative - a.initiative
        || Number(b.isPlayer) - Number(a.isPlayer)
        || a.name.localeCompare(b.name));
}

/**
 * Letters monsters that share a name: "Goblin", "Goblin" becomes "Goblin A", "Goblin B".
 * Names already lettered keep their letter, and new ones take the next free letter.
 */
export function letterDuplicates(combatants: Combatant[]): Combatant[] {
    const base = (name: string) => name.replace(/ [A-Z]$/, '');
    const groups = new Map<string, Combatant[]>();
    for (const c of combatants) {
        if (c.isPlayer) continue;
        const key = base(c.name);
        groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const renamed = new Map<string, string>();
    for (const [key, members] of groups) {
        if (members.length < 2) continue;
        const used = new Set(members.map(m => (/ ([A-Z])$/.exec(m.name) ?? [])[1]).filter(Boolean));
        let letter = 0;
        for (const member of members) {
            if (/ [A-Z]$/.test(member.name)) continue;
            while (used.has(String.fromCharCode(65 + letter))) letter++;
            const assigned = String.fromCharCode(65 + letter);
            used.add(assigned);
            renamed.set(member.id, `${key} ${assigned}`);
        }
    }
    return combatants.map(c => (renamed.has(c.id) ? { ...c, name: renamed.get(c.id)! } : c));
}

export function startCombat(entries: NewCombatant[]): CombatState {
    const combatants = letterDuplicates(entries.map(entry => ({
        id: newId(),
        name: entry.name.trim() || 'Unknown',
        initiative: entry.initiative,
        isPlayer: entry.isPlayer,
        hp: entry.hp,
        maxHp: entry.maxHp ?? entry.hp,
        hidden: entry.hidden || undefined,
        conditions: [],
    })));
    return { round: 1, turn: 0, combatants };
}

export function addCombatants(combat: CombatState, entries: NewCombatant[]): CombatState {
    const acting = initiativeOrder(combat)[combat.turn]?.id;
    const added = startCombat(entries).combatants;
    const combatants = letterDuplicates([...combat.combatants, ...added]);
    return keepTurnOn({ ...combat, combatants }, acting);
}

export function removeCombatant(combat: CombatState, id: string): CombatState {
    const order = initiativeOrder(combat);
    const acting = order[combat.turn]?.id;
    const combatants = combat.combatants.filter(c => c.id !== id);
    if (acting === id) {
        // The one acting left: the next in order acts.
        const next = order.slice(combat.turn + 1).find(c => c.id !== id && !c.out) ?? order.find(c => c.id !== id && !c.out);
        return keepTurnOn({ ...combat, combatants }, next?.id);
    }
    return keepTurnOn({ ...combat, combatants }, acting);
}

/** Changes a combatant and keeps the turn on whoever was acting, even if the order changed. */
export function updateCombatant(combat: CombatState, id: string, change: Partial<Combatant>): CombatState {
    const acting = initiativeOrder(combat)[combat.turn]?.id;
    const combatants = combat.combatants.map(c => (c.id === id ? { ...c, ...change } : c));
    return keepTurnOn({ ...combat, combatants }, acting);
}

function keepTurnOn(combat: CombatState, actingId: string | undefined): CombatState {
    const order = initiativeOrder(combat);
    const turn = Math.max(0, order.findIndex(c => c.id === actingId));
    return { ...combat, turn: Math.min(turn, Math.max(0, order.length - 1)) };
}

/** Moves to the next combatant who is still in the fight; passing the end starts a new round. */
export function nextTurn(combat: CombatState): CombatState {
    const order = initiativeOrder(combat);
    if (order.length === 0 || order.every(c => c.out)) return combat;
    let { turn, round } = combat;
    do {
        turn += 1;
        if (turn >= order.length) {
            turn = 0;
            round += 1;
        }
    } while (order[turn].out);
    return { ...combat, turn, round };
}

export function previousTurn(combat: CombatState): CombatState {
    const order = initiativeOrder(combat);
    if (order.length === 0 || order.every(c => c.out)) return combat;
    let { turn, round } = combat;
    do {
        turn -= 1;
        if (turn < 0) {
            if (round <= 1) return combat;
            turn = order.length - 1;
            round -= 1;
        }
    } while (order[turn].out);
    return { ...combat, turn, round };
}

/** Applies damage (positive) or healing (negative) to a monster's own HP. Dropping to 0 takes it out. */
export function damageCombatant(combat: CombatState, id: string, amount: number): CombatState {
    const target = combat.combatants.find(c => c.id === id);
    if (!target || target.hp === undefined) return combat;
    const max = target.maxHp ?? target.hp;
    const hp = Math.max(0, Math.min(max, target.hp - amount));
    return updateCombatant(combat, id, { hp, out: hp === 0 ? true : undefined });
}

/** Parses "Goblin x3 hp 7 init 12" style input from the add box: name, count, HP and initiative are optional. */
export function parseCombatantInput(text: string): { name: string; count: number; hp?: number; initiative?: number } | null {
    let rest = text.trim();
    if (!rest) return null;
    const take = (pattern: RegExp): number | undefined => {
        const match = pattern.exec(rest);
        if (!match) return undefined;
        rest = (rest.slice(0, match.index) + rest.slice(match.index + match[0].length)).trim();
        return Number(match[1]);
    };
    const count = take(/\bx\s*(\d+)\b/i) ?? take(/^(\d+)\s+/) ?? 1;
    const hp = take(/\bhp\s*(\d+)\b/i);
    const initiative = take(/\binit(?:iative)?\s*(-?\d+)\b/i);
    const name = rest.replace(/\s+/g, ' ').trim();
    if (!name) return null;
    return { name, count: Math.max(1, Math.min(count, 26)), hp, initiative };
}

/** How a monster's health reads to players, who never see its numbers. */
export function healthWord(hp: number | undefined, maxHp: number | undefined): string | undefined {
    if (hp === undefined || !maxHp) return undefined;
    if (hp <= 0) return 'Down';
    const share = hp / maxHp;
    if (share <= 0.5) return 'Bloodied';
    return share < 1 ? 'Hurt' : 'Unhurt';
}
