import { describe, it, expect } from 'vitest';
import { describeRoomState, parseRoomStates, roomPlaceKey, roomStateForPlace, roomTagKey } from '../../src/leaflet/maplog/roomState';

const LOG = `
[R:1|unexplored]
... you enter and fight ...
[R:1|cleared]
[R:2|active|library, candles still lit|exits S:R1, E:R3]
[R:3|cleared, looted|guard room]
[R:4|+trapped]
[R:4|+looted]
[#R:2]
Some prose with brackets [not a tag] and [L:0304|port town].
`;

describe('parseRoomStates', () => {
    it('keeps the latest state of each room', () => {
        const states = parseRoomStates(LOG);
        expect(states.get('1')?.status).toBe('cleared');
    });

    it('reads status and description and ignores exits', () => {
        const states = parseRoomStates(LOG);
        expect(states.get('2')).toEqual({ key: '2', status: 'active', description: 'library, candles still lit' });
        expect(states.get('3')).toEqual({ key: '3', status: 'cleared, looted', description: 'guard room' });
    });

    it('adds shorthand statuses to the status before them', () => {
        expect(parseRoomStates(LOG).get('4')?.status).toBe('trapped, looted');
    });

    it('ignores references, location tags and prose', () => {
        const states = parseRoomStates(LOG);
        expect([...states.keys()].sort()).toEqual(['1', '2', '3', '4']);
    });

    it('returns nothing for an empty log', () => {
        expect(parseRoomStates('').size).toBe(0);
    });

    it('accepts a room tag with no status', () => {
        expect(parseRoomStates('[R:9]').get('9')).toEqual({ key: '9', status: '' });
    });
});

describe('room keys', () => {
    it('matches R-prefixed place IDs to plain room tags', () => {
        expect(roomPlaceKey('R3')).toBe('3');
        expect(roomPlaceKey('r03')).toBe('3');
        expect(roomTagKey('R3')).toBe('3');
        expect(roomTagKey(' 3 ')).toBe('3');
    });

    it('gives hex IDs no room key, so they never match a room tag', () => {
        expect(roomPlaceKey('0203')).toBeUndefined();
        expect(roomPlaceKey(undefined)).toBeUndefined();
        expect(roomStateForPlace(parseRoomStates(LOG), '0203')).toBeUndefined();
    });

    it('looks up a placed room and describes it for a tooltip', () => {
        const state = roomStateForPlace(parseRoomStates(LOG), 'R3');
        expect(state).toBeDefined();
        expect(describeRoomState(state!, 'R3')).toBe('R3: cleared, looted (guard room)');
        const bare = roomStateForPlace(parseRoomStates('[R:5|locked]'), 'R5');
        expect(describeRoomState(bare!, 'R5')).toBe('R5: locked');
    });
});
