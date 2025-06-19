import { App, FuzzySuggestModal, Notice } from 'obsidian';
import { Location } from '../types';
import StorytellerSuitePlugin from '../main';

export class LocationSuggestModal extends FuzzySuggestModal<Location> {
	plugin: StorytellerSuitePlugin;
	onChoose: (location: Location | null) => void;
    locations: Location[] = []; // Store locations locally

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (location: Location | null) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder("Select the event's location...");
        this.setInstructions([{ command: 'Shift + Enter', purpose: 'Clear selection (No Location)' }]);
	}

    // Override onOpen to fetch data asynchronously *before* getItems is needed
    async onOpen() {
        super.onOpen(); // Important: Call parent onOpen
        try {
            this.locations = await this.plugin.listLocations();
        } catch (error) {
            console.error("Storyteller Suite: Error fetching locations for suggester:", error);
            new Notice("Error loading locations. Check console.");
            this.locations = []; // Ensure it's an empty array on error
        }
         // Note: We don't explicitly refresh the suggestions here.
    }

	// getItems is now synchronous and returns the pre-fetched list
	getItems(): Location[] {
		return this.locations;
	}

	getItemText(item: Location): string {
        return item.name || 'Unnamed location';
	}

	onChooseItem(item: Location, evt: MouseEvent | KeyboardEvent): void {
        if (evt.shiftKey) {
            this.onChoose(null);
        } else {
		    this.onChoose(item);
        }
	}
}