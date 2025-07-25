import { App, FuzzySuggestModal, Notice } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';

export class EventSuggestModal extends FuzzySuggestModal<Event> {
    plugin: StorytellerSuitePlugin;
    onChoose: (event: Event) => void;
    events: Event[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (event: Event) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Select an event to link...');
    }

    async onOpen() {
        super.onOpen();
        try {
            this.events = await this.plugin.listEvents();
        } catch (error) {
            console.error('Storyteller Suite: Error fetching events for suggester:', error);
            new Notice('Error loading events. Check console.');
            this.events = [];
        }
    }

    getItems(): Event[] {
        return this.events;
    }

    getItemText(item: Event): string {
        return item.name || 'Unnamed event';
    }

    onChooseItem(item: Event, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
} 