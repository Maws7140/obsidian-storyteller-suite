import { App, SuggestModal, setIcon } from 'obsidian';
import { Location } from '../types';

export class LocationSelectionModal extends SuggestModal<Location | 'create-new'> {
    private locations: Location[];
    private onChoose: (result: Location | 'create-new') => void;

    constructor(app: App, locations: Location[], onChoose: (result: Location | 'create-new') => void) {
        super(app);
        this.locations = locations;
        this.onChoose = onChoose;
        this.setPlaceholder('Select a nearby location or create new...');
    }

    getSuggestions(query: string): (Location | 'create-new')[] {
        const options: (Location | 'create-new')[] = ['create-new', ...this.locations];
        if (!query) return options;
        
        const lowerQuery = query.toLowerCase();
        return options.filter(opt => {
            if (opt === 'create-new') return 'create new location'.includes(lowerQuery);
            return opt.name.toLowerCase().includes(lowerQuery);
        });
    }

    renderSuggestion(value: Location | 'create-new', el: HTMLElement) {
        if (value === 'create-new') {
            const div = el.createDiv({ cls: 'suggestion-content' });
            const plusIcon = div.createSpan();
            setIcon(plusIcon, 'plus');
            div.appendText(' Create New Location');
        } else {
            const div = el.createDiv({ cls: 'suggestion-content' });
            const pinIcon = div.createSpan();
            setIcon(pinIcon, 'map-pin');
            div.appendText(` ${value.name}`);
            if (value.description) {
                el.createDiv({ text: value.description, cls: 'suggestion-note' });
            }
        }
    }

    onChooseSuggestion(item: Location | 'create-new', evt: MouseEvent | KeyboardEvent) {
        this.onChoose(item);
    }
}
