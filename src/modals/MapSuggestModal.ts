/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept for backward compatibility only.
 */

// MapSuggestModal - Fuzzy suggestion modal for selecting maps
// Allows quick search and selection of maps from the story

import { FuzzySuggestModal } from 'obsidian';
import { Map as StoryMap } from '../types';
import StorytellerSuitePlugin from '../main';

export class MapSuggestModal extends FuzzySuggestModal<StoryMap> {
    plugin: StorytellerSuitePlugin;
    onChoose: (map: StoryMap | null) => void;
    private maps: StoryMap[] = [];

    constructor(
        app: any,
        plugin: StorytellerSuitePlugin,
        onChoose: (map: StoryMap | null) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        
        // Add option to clear selection with Shift+Enter
        this.setPlaceholder('Type to search for a map... (Shift+Enter to clear)');
        
        // Load maps asynchronously when modal opens
        this.plugin.listMaps().then(maps => {
            this.maps = maps;
        });
    }

    getItems(): StoryMap[] {
        return this.maps;
    }

    getItemText(map: StoryMap): string {
        const scale = map.scale ? ` [${map.scale}]` : '';
        const markerCount = map.markers.length > 0 ? ` (${map.markers.length} markers)` : '';
        return `${map.name}${scale}${markerCount}`;
    }

    onChooseItem(map: StoryMap, evt: MouseEvent | KeyboardEvent): void {
        // If Shift key is pressed, clear the selection
        if (evt.shiftKey) {
            this.onChoose(null);
            return;
        }
        
        this.onChoose(map);
    }
}

