import { describe, expect, it } from 'vitest';
import {
    addCombatants, damageCombatant, healthWord, initiativeOrder, letterDuplicates, nextTurn,
    parseCombatantInput, previousTurn, removeCombatant, startCombat, updateCombatant,
} from '../../src/campaign/Combat';

const names = (combat: ReturnType<typeof startCombat>) => initiativeOrder(combat).map(c => c.name);

describe('combat', () => {
    it('orders by initiative, party first on ties, and letters duplicate monsters', () => {
        const combat = startCombat([
            { name: 'Goblin', initiative: 12, isPlayer: false, hp: 7 },
            { name: 'Aragorn', initiative: 12, isPlayer: true },
            { name: 'Goblin', initiative: 15, isPlayer: false, hp: 7 },
            { name: 'Troll', initiative: 3, isPlayer: false, hp: 84 },
        ]);
        expect(names(combat)).toEqual(['Goblin B', 'Aragorn', 'Goblin A', 'Troll']);
        expect(combat.round).toBe(1);
    });

    it('adds more of a monster with the next free letter', () => {
        let combat = startCombat([{ name: 'Goblin', initiative: 10, isPlayer: false }, { name: 'Goblin', initiative: 9, isPlayer: false }]);
        combat = addCombatants(combat, [{ name: 'Goblin', initiative: 1, isPlayer: false }]);
        expect(names(combat)).toEqual(['Goblin A', 'Goblin B', 'Goblin C']);
    });

    it('steps turns, wraps into a new round, skips anyone out, and steps back', () => {
        let combat = startCombat([
            { name: 'A', initiative: 20, isPlayer: true },
            { name: 'B', initiative: 10, isPlayer: false, hp: 5 },
            { name: 'C', initiative: 5, isPlayer: false, hp: 5 },
        ]);
        const b = combat.combatants.find(c => c.name === 'B')!;
        combat = damageCombatant(combat, b.id, 10);
        combat = nextTurn(combat);
        expect(initiativeOrder(combat)[combat.turn].name).toBe('C');
        combat = nextTurn(combat);
        expect(combat.round).toBe(2);
        expect(initiativeOrder(combat)[combat.turn].name).toBe('A');
        combat = previousTurn(combat);
        expect(combat.round).toBe(1);
        expect(initiativeOrder(combat)[combat.turn].name).toBe('C');
    });

    it('keeps the turn on whoever acts when initiative changes or someone leaves', () => {
        let combat = startCombat([
            { name: 'A', initiative: 20, isPlayer: true },
            { name: 'B', initiative: 10, isPlayer: false },
        ]);
        combat = nextTurn(combat); // B acts
        const a = combat.combatants.find(c => c.name === 'A')!;
        combat = updateCombatant(combat, a.id, { initiative: 1 });
        expect(initiativeOrder(combat)[combat.turn].name).toBe('B');
        const bId = combat.combatants.find(c => c.name === 'B')!.id;
        combat = removeCombatant(combat, bId);
        expect(initiativeOrder(combat)[combat.turn].name).toBe('A');
    });

    it('heals a downed monster back into the fight', () => {
        let combat = startCombat([{ name: 'Orc', initiative: 5, isPlayer: false, hp: 10 }]);
        const id = combat.combatants[0].id;
        combat = damageCombatant(combat, id, 12);
        expect(combat.combatants[0]).toMatchObject({ hp: 0, out: true });
        combat = damageCombatant(combat, id, -4);
        expect(combat.combatants[0].hp).toBe(4);
        expect(combat.combatants[0].out).toBeUndefined();
    });

    it('reads the add box', () => {
        expect(parseCombatantInput('Goblin x3 hp 7')).toEqual({ name: 'Goblin', count: 3, hp: 7, initiative: undefined });
        expect(parseCombatantInput('2 Wolves init 14')).toEqual({ name: 'Wolves', count: 2, hp: undefined, initiative: 14 });
        expect(parseCombatantInput('Cave troll')).toEqual({ name: 'Cave troll', count: 1, hp: undefined, initiative: undefined });
        expect(parseCombatantInput('  ')).toBeNull();
    });

    it('describes monster health in words for players', () => {
        expect(healthWord(10, 10)).toBe('Unhurt');
        expect(healthWord(7, 10)).toBe('Hurt');
        expect(healthWord(5, 10)).toBe('Bloodied');
        expect(healthWord(0, 10)).toBe('Down');
        expect(healthWord(undefined, 10)).toBeUndefined();
    });

    it('leaves party members unlettered', () => {
        const out = letterDuplicates([
            { id: '1', name: 'Pip', initiative: 1, isPlayer: true },
            { id: '2', name: 'Pip', initiative: 1, isPlayer: true },
        ]);
        expect(out.map(c => c.name)).toEqual(['Pip', 'Pip']);
    });
});
