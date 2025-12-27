/**
 * LocationPicker - Hierarchical location picker component
 * Displays locations in a tree structure with search functionality
 */

import type StorytellerSuitePlugin from '../main';
import type { Location } from '../types';
import { LocationService } from '../services/LocationService';

export class LocationPicker {
    private plugin: StorytellerSuitePlugin;
    private container: HTMLElement;
    private onSelect: (locationId: string) => void;
    private locationService: LocationService;
    private currentLocationId?: string;

    constructor(
        plugin: StorytellerSuitePlugin,
        container: HTMLElement,
        currentLocationId: string | undefined,
        onSelect: (locationId: string) => void
    ) {
        this.plugin = plugin;
        this.container = container;
        this.onSelect = onSelect;
        this.currentLocationId = currentLocationId;
        this.locationService = new LocationService(plugin);
        
        this.render();
    }

    private async render(): Promise<void> {
        this.container.empty();
        this.container.addClass('storyteller-location-picker');
        
        const locations = await this.plugin.listLocations();
        
        // Current selection display
        const selectionDisplay = this.container.createDiv('current-selection');
        if (this.currentLocationId) {
            try {
                const path = await this.locationService.getLocationPath(this.currentLocationId);
                selectionDisplay.innerHTML = `
                    <span class="selection-label">Current:</span>
                    <span class="selection-path">${path.map(l => l.name).join(' › ')}</span>
                    <button class="clear-btn">×</button>
                `;
                selectionDisplay.querySelector('.clear-btn')!.addEventListener('click', () => {
                    this.onSelect('');
                    this.currentLocationId = undefined;
                    this.render();
                });
            } catch (error) {
                console.error('Error getting location path:', error);
                selectionDisplay.innerHTML = `<span class="selection-empty">Invalid location</span>`;
            }
        } else {
            selectionDisplay.innerHTML = `<span class="selection-empty">No location set</span>`;
        }
        
        // Dropdown trigger
        const dropdownTrigger = this.container.createDiv('dropdown-trigger');
        dropdownTrigger.innerHTML = `
            <span>Select Location</span>
            <span class="dropdown-arrow">▼</span>
        `;
        
        // Dropdown content (hidden by default)
        const dropdownContent = this.container.createDiv('dropdown-content hidden');
        
        // Search
        const searchInput = dropdownContent.createEl('input', {
            type: 'text',
            placeholder: 'Search locations...',
            cls: 'location-search'
        });
        
        // Tree view
        const treeContainer = dropdownContent.createDiv('location-tree');
        const rootLocations = locations.filter(l => !l.parentLocationId);
        await this.renderTree(treeContainer, rootLocations, locations, 0);
        
        // Toggle dropdown
        dropdownTrigger.addEventListener('click', () => {
            dropdownContent.classList.toggle('hidden');
            if (!dropdownContent.classList.contains('hidden')) {
                searchInput.focus();
            }
        });
        
        // Search filter
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            const items = treeContainer.querySelectorAll('.tree-item');
            items.forEach((item: HTMLElement) => {
                const name = item.dataset.name?.toLowerCase() || '';
                const match = name.includes(query);
                item.style.display = match || query === '' ? '' : 'none';
            });
        });
    }

    private async renderTree(
        container: HTMLElement,
        locations: Location[],
        allLocations: Location[],
        depth: number
    ): Promise<void> {
        for (const location of locations) {
            const item = container.createDiv({ cls: 'tree-item' });
            item.dataset.name = location.name;
            item.style.paddingLeft = `${depth * 16}px`;
            
            const hasChildren = location.childLocationIds && location.childLocationIds.length > 0;
            
            item.innerHTML = `
                ${hasChildren ? '<span class="expand-icon">▶</span>' : '<span class="expand-spacer"></span>'}
                <span class="location-icon">${this.getLocationIcon(location.type || location.locationType || 'custom')}</span>
                <span class="location-name">${location.name}</span>
            `;
            
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(location.id || location.name);
                this.currentLocationId = location.id || location.name;
                this.render();
            });
            
            // Child container (collapsed by default)
            if (hasChildren) {
                const childContainer = container.createDiv({ cls: 'tree-children hidden' });
                const children = allLocations.filter(l => 
                    (location.id || location.name) === (l.parentLocationId || l.parentLocation)
                );
                await this.renderTree(childContainer, children, allLocations, depth + 1);
                
                const expandIcon = item.querySelector('.expand-icon');
                if (expandIcon) {
                    expandIcon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        childContainer.classList.toggle('hidden');
                        expandIcon.textContent = childContainer.classList.contains('hidden') ? '▶' : '▼';
                    });
                }
            }
        }
    }

    private getLocationIcon(type: string | undefined): string {
        const icons: Record<string, string> = {
            world: '🌍',
            continent: '🗺️',
            region: '🏞️',
            city: '🏙️',
            district: '🏘️',
            building: '🏛️',
            room: '🚪',
            custom: '📍'
        };
        return icons[type || 'custom'] || '📍';
    }

    /**
     * Update the current selection
     */
    updateSelection(locationId: string | undefined): void {
        this.currentLocationId = locationId;
        this.render();
    }
}

