import { describe, it, expect } from 'vitest';
import { connectionForEditing, replaceConnectionAt } from '../../src/utils/ConnectionEdits';
import type { TypedRelationship } from '../../src/types';

const names = (ref: string) => (ref === 'k3x9ab' ? 'Bran' : ref);

describe('editing an existing connection', () => {
    it('opens the editor with the stored target, kind, label, direction and ended state', () => {
        const existing: TypedRelationship = { target: 'Aria', type: 'rival', label: 'old feud', direction: 'to', ended: true };
        expect(connectionForEditing(existing, names)).toEqual({
            target: 'Aria', type: 'rival', label: 'old feud', direction: 'to', ended: true,
        });
    });

    it('infers the direction from the kind for notes that never stored one', () => {
        expect(connectionForEditing({ target: 'Aria', type: 'ally' } as TypedRelationship, names).direction).toBe('mutual');
        expect(connectionForEditing({ target: 'Aria', type: 'mentor' } as TypedRelationship, names).direction).toBe('to');
    });

    it('normalises legacy targetId and name shapes to a display-name target', () => {
        expect(connectionForEditing({ targetId: 'k3x9ab', type: 'ally' } as unknown as TypedRelationship, names).target).toBe('Bran');
        expect(connectionForEditing({ name: 'Boromir', type: 'rival' } as unknown as TypedRelationship, names).target).toBe('Boromir');
    });

    it('replaces the edited entry at the same index and leaves the others in order', () => {
        const list: TypedRelationship[] = [
            { target: 'A', type: 'ally' },
            { target: 'B', type: 'rival', ended: true },
            { target: 'C', type: 'mentor' },
        ];
        const updated = replaceConnectionAt(list, 1, { target: 'B', type: 'rival', direction: 'to' });
        expect(updated).toEqual([
            { target: 'A', type: 'ally' },
            { target: 'B', type: 'rival', direction: 'to' },
            { target: 'C', type: 'mentor' },
        ]);
        expect(list[1].ended).toBe(true);
    });

    it('leaves the list unchanged for an index that does not exist', () => {
        const list: TypedRelationship[] = [{ target: 'A', type: 'ally' }];
        expect(replaceConnectionAt(list, 4, { target: 'Z', type: 'ally' })).toEqual(list);
    });
});
