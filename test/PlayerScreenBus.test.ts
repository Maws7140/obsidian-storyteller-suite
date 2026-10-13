import { describe, expect, it, vi } from 'vitest';
import { PlayerScreenBus } from '../src/campaign/PlayerPush';

const popupInput = { sourceName: 'Session 1', heading: 'The gate', markdown: 'It opens.', mode: 'popup' as const };
const pinnedInput = { sourceName: 'Session 1', heading: 'Rules', markdown: 'Be kind.', mode: 'pinned' as const };

describe('PlayerScreenBus', () => {
    it('puts popup pushes in the popup queue, oldest first', () => {
        const bus = new PlayerScreenBus();
        const a = bus.push(popupInput);
        const b = bus.push({ ...popupInput, heading: 'Second' });
        const state = bus.getState();
        expect(state.popups.map(p => p.id)).toEqual([a.id, b.id]);
        expect(state.pinned).toEqual([]);
    });

    it('puts pinned pushes in the pinned strip, not the popup queue', () => {
        const bus = new PlayerScreenBus();
        const pin = bus.push(pinnedInput);
        const state = bus.getState();
        expect(state.pinned.map(p => p.id)).toEqual([pin.id]);
        expect(state.popups).toEqual([]);
    });

    it('gives every push a unique id and a timestamp', () => {
        const bus = new PlayerScreenBus();
        const a = bus.push(popupInput);
        const b = bus.push(popupInput);
        expect(a.id).not.toBe(b.id);
        expect(typeof a.at).toBe('number');
    });

    it('dismiss closes a popup', () => {
        const bus = new PlayerScreenBus();
        const a = bus.push(popupInput);
        const b = bus.push({ ...popupInput, heading: 'Second' });
        bus.dismiss(a.id);
        expect(bus.getState().popups.map(p => p.id)).toEqual([b.id]);
    });

    it('dismiss unpins a pinned push and leaves others alone', () => {
        const bus = new PlayerScreenBus();
        const a = bus.push(pinnedInput);
        const b = bus.push({ ...pinnedInput, heading: 'Other' });
        bus.dismiss(a.id);
        expect(bus.getState().pinned.map(p => p.id)).toEqual([b.id]);
    });

    it('dismiss with an unknown id changes nothing', () => {
        const bus = new PlayerScreenBus();
        const a = bus.push(popupInput);
        bus.dismiss('no-such-id');
        expect(bus.getState().popups.map(p => p.id)).toEqual([a.id]);
    });

    it('clear empties both popups and pinned pushes', () => {
        const bus = new PlayerScreenBus();
        bus.push(popupInput);
        bus.push(pinnedInput);
        bus.clear();
        expect(bus.getState()).toEqual({ popups: [], pinned: [] });
    });

    it('subscribe calls the listener immediately with the current state', () => {
        const bus = new PlayerScreenBus();
        bus.push(pinnedInput);
        const listener = vi.fn();
        bus.subscribe(listener);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].pinned).toHaveLength(1);
    });

    it('subscribe calls the listener on push, dismiss and clear', () => {
        const bus = new PlayerScreenBus();
        const listener = vi.fn();
        bus.subscribe(listener);
        const pushed = bus.push(popupInput);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener.mock.calls[1][0].popups).toHaveLength(1);
        bus.dismiss(pushed.id);
        expect(listener).toHaveBeenCalledTimes(3);
        expect(listener.mock.calls[2][0].popups).toHaveLength(0);
        bus.clear();
        expect(listener).toHaveBeenCalledTimes(4);
    });

    it('unsubscribe stops further calls', () => {
        const bus = new PlayerScreenBus();
        const listener = vi.fn();
        const unsubscribe = bus.subscribe(listener);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        bus.push(popupInput);
        bus.clear();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies each listener separately, so one unsubscribe leaves the others', () => {
        const bus = new PlayerScreenBus();
        const first = vi.fn();
        const second = vi.fn();
        const unsubscribeFirst = bus.subscribe(first);
        bus.subscribe(second);
        unsubscribeFirst();
        bus.push(popupInput);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(2);
    });
});
