// One way in to "create an event" from every timeline surface, so the toolbar,
// an embedded ```timeline block and the tag timeline all behave the same.

import { Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Event } from '../types';
import { t } from '../i18n/strings';

export interface OpenNewEventOptions {
    /** Fields the surface already knows, such as the date in view or a tag. */
    seed?: Partial<Event>;
    /** Redraw the surface that asked, once the event is saved. */
    onCreated?: (event: Event) => void | Promise<void>;
}

/**
 * Open the event modal for a new event, save it, then let the caller refresh.
 *
 * Without an active story there is nowhere to save the event, so this says so
 * instead of opening a form that cannot be submitted.
 *
 * @returns whether the modal was opened
 */
export async function openNewEventModal(plugin: StorytellerSuitePlugin, options: OpenNewEventOptions = {}): Promise<boolean> {
    if (!plugin.getActiveStory()) {
        new Notice(t('selectOrCreateStoryFirst'));
        return false;
    }
    const { EventModal } = await import('../modals/EventModal');
    const seed: Event | undefined = options.seed
        ? { name: '', dateTime: '', description: '', outcome: '', ...options.seed }
        : undefined;
    new EventModal(plugin.app, plugin, null, async created => {
        await plugin.saveEvent(created);
        new Notice(t('created', t('event'), created.name));
        await options.onCreated?.(created);
    }, seed).open();
    return true;
}
