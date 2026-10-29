/*
 * The New event button on every timeline surface goes through one helper: it opens the event
 * modal, saves what comes back, then hands control to the surface to redraw. Without an active
 * story it says so instead of opening a form that has nowhere to save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices: string[] = [];
const opened: { seed: unknown; submit: (event: any) => Promise<void> }[] = [];

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Notice { constructor(message: string) { notices.push(message); } }
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => {
            if (prop === 'Notice') return Notice;
            return prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined;
        },
        has: () => true,
    });
});

vi.mock('../../src/modals/EventModal', () => ({
    EventModal: class {
        constructor(_app: unknown, _plugin: unknown, _event: unknown, private submit: (event: any) => Promise<void>, private seed?: unknown) {}
        open() { opened.push({ seed: this.seed, submit: this.submit }); }
    },
}));

const { openNewEventModal } = await import('../../src/utils/OpenNewEventModal');

function makePlugin(activeStory: boolean) {
    const saved: any[] = [];
    const plugin: any = {
        app: {},
        getActiveStory: () => (activeStory ? { id: 's1', name: 'Story' } : undefined),
        saveEvent: async (event: any) => { saved.push(event); },
    };
    return { plugin, saved };
}

describe('openNewEventModal', () => {
    beforeEach(() => { notices.length = 0; opened.length = 0; });

    it('opens the modal, saves the new event, then refreshes the caller', async () => {
        const { plugin, saved } = makePlugin(true);
        const order: string[] = [];
        plugin.saveEvent = async (event: any) => { order.push('save'); saved.push(event); };
        const onCreated = vi.fn(async () => { order.push('refresh'); });

        const result = await openNewEventModal(plugin, { seed: { dateTime: '2020-06-01' }, onCreated });

        expect(result).toBe(true);
        expect(opened).toHaveLength(1);
        expect(opened[0].seed).toMatchObject({ name: '', dateTime: '2020-06-01' });

        const event = { name: 'Coronation', dateTime: '2020-06-01' };
        await opened[0].submit(event);
        expect(saved).toEqual([event]);
        expect(onCreated).toHaveBeenCalledWith(event);
        expect(order).toEqual(['save', 'refresh']);
    });

    it('opens a blank modal when there is nothing to prefill', async () => {
        const { plugin } = makePlugin(true);
        await openNewEventModal(plugin);
        expect(opened).toHaveLength(1);
        expect(opened[0].seed).toBeUndefined();
    });

    it('shows a notice and opens nothing when no story is active', async () => {
        const { plugin, saved } = makePlugin(false);
        const onCreated = vi.fn();

        const result = await openNewEventModal(plugin, { onCreated });

        expect(result).toBe(false);
        expect(opened).toHaveLength(0);
        expect(saved).toHaveLength(0);
        expect(onCreated).not.toHaveBeenCalled();
        expect(notices).toEqual(['Select or create a story first.']);
    });
});
