/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ItemView, WorkspaceLeaf, Setting, Notice, App, ButtonComponent, TFile, normalizePath, debounce } from 'obsidian'; // Added normalizePath, debounce
import StorytellerSuitePlugin from '../main';
// Import necessary modals for button actions (Edit/Create/Detail)
import { CharacterModal } from '../modals/CharacterModal';
import { LocationModal } from '../modals/LocationModal';
import { EventModal } from '../modals/EventModal';
import { PlotItemModal } from '../modals/PlotItemModal';
// Remove GalleryModal import if no longer needed directly
// import { GalleryModal } from '../modals/GalleryModal';
import { ImageDetailModal } from '../modals/ImageDetailModal';
// Remove ImageSuggestModal import as we replace its usage
// import { ImageSuggestModal } from '../modals/GalleryModal';
import { Character, Location, Event, Group, PlotItem } from '../types'; // Import types
import { NewStoryModal } from '../modals/NewStoryModal';
import { GroupModal } from '../modals/GroupModal';

/** Unique identifier for the dashboard view type in Obsidian's workspace */
export const VIEW_TYPE_DASHBOARD = "storyteller-dashboard-view";

/**
 * Main dashboard view class providing a tabbed interface for story management
 * This view integrates all storytelling entities (characters, locations, events, gallery)
 * into a single, unified interface within Obsidian's sidebar
 */
export class DashboardView extends ItemView {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;
    
    /** Container element for tab content area */
    tabContentContainer: HTMLElement;
    
    /** Container element for tab headers */
    tabHeaderContainer: HTMLElement;
    
    /** Current filter text applied to entity lists */
    currentFilter: string = '';
    
    /** File input element reference for gallery image uploads */
    fileInput: HTMLInputElement | null = null;

    /** Currently active tab ID for automatic refresh */
    activeTabId: string = 'characters';

    /** Tab configuration mapping */
    tabs: Array<{ id: string; label: string; renderFn: (container: HTMLElement) => Promise<void> }>;

    private debouncedRefreshActiveTab: () => void; // Declare property for debounce

    /**
     * Constructor for the dashboard view
     * @param leaf The workspace leaf that will contain this view
     * @param plugin Reference to the main plugin instance
     */
    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;

        // Initialize tab configuration
        this.tabs = [
            { id: 'characters', label: 'Characters', renderFn: this.renderCharactersContent.bind(this) },
            { id: 'locations', label: 'Locations', renderFn: this.renderLocationsContent.bind(this) },
            { id: 'events', label: 'Timeline', renderFn: this.renderEventsContent.bind(this) },
            { id: 'items', label: 'Items', renderFn: this.renderItemsContent.bind(this) }, // NEW TAB
            { id: 'gallery', label: 'Gallery', renderFn: this.renderGalleryContent.bind(this) },
            { id: 'groups', label: 'Groups', renderFn: this.renderGroupsContent.bind(this) },
        ];

        this.debouncedRefreshActiveTab = debounce(this.refreshActiveTab.bind(this), 200, true);
    }

    /**
     * Get the unique identifier for this view type
     * Required by Obsidian's view system
     */
    getViewType() {
        return VIEW_TYPE_DASHBOARD;
    }

    /**
     * Get the display text for this view (shown in tab title)
     * Required by Obsidian's view system
     */
    getDisplayText() {
        return "Storyteller dashboard";
    }

    /**
     * Get the icon identifier for this view
     * Used in the view tab and sidebar
     */
    getIcon() {
        return "book-open"; // Icon for the view tab
    }



    /**
     * Register vault event listeners to automatically refresh active tab when files change
     */
    private registerVaultEventListeners() {
        // Listen for file creation events
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (this.isRelevantFile(file.path)) {
                this.debouncedRefreshActiveTab();
            }
        }));

        // Listen for file modification events  
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (this.isRelevantFile(file.path)) {
                this.debouncedRefreshActiveTab();
            }
        }));

        // Listen for file deletion events
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (this.isRelevantFile(file.path)) {
                this.debouncedRefreshActiveTab();
            }
        }));

        // Listen for file rename events
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (this.isRelevantFile(file.path) || this.isRelevantFile(oldPath)) {
                this.debouncedRefreshActiveTab();
            }
        }));

        // Listen for metadata changes (fires after Obsidian has processed the file)
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (this.isRelevantFile(file.path)) {
                    this.debouncedRefreshActiveTab();
                }
            })
        );
    }

    /**
     * Check if a file path is relevant to the storyteller plugin (characters, locations, events)
     * @param filePath The file path to check
     */
    private isRelevantFile(filePath: string): boolean {
        try {
            const charFolder = this.plugin.getEntityFolder('character');
            const locFolder = this.plugin.getEntityFolder('location');
            const evtFolder = this.plugin.getEntityFolder('event');
            const itemFolder = this.plugin.getEntityFolder('item'); // ADDED THIS LINE
            
            const isRelevant = filePath.startsWith(charFolder + '/') ||
                filePath.startsWith(locFolder + '/') ||
                filePath.startsWith(evtFolder + '/') ||
                filePath.startsWith(itemFolder + '/') || // ADDED THIS LINE
                filePath.startsWith(this.plugin.settings.galleryUploadFolder + '/');
            return isRelevant;
        } catch {
            return false;
        }
    }

    /**
     * Refresh the currently active tab
     */
    private async refreshActiveTab() {
        if (!this.tabContentContainer) {
            return;
        }
        
        const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
        if (activeTab) {
            try {
                await activeTab.renderFn(this.tabContentContainer);
            } catch (error) {
                console.error(`Storyteller Suite: Error refreshing active tab ${this.activeTabId}:`, error);
            }
        }
    }

    /**
     * Initialize and render the dashboard view
     * Called when the view is first opened or needs to be rebuilt
     */
    async onOpen() {
        const container = this.containerEl.children[1]; // View content container
        container.empty();
        container.addClass('storyteller-dashboard-view-container'); // Add a class for styling

        // --- Create a Header Container ---
        const headerContainer = container.createDiv('storyteller-dashboard-header');

        // --- Title (inside the header container) ---
        const titleEl = headerContainer.createEl('h2', {
            cls: 'storyteller-dashboard-title'
        });

        titleEl.append('Storyteller suite');

        // --- Group for selector and button ---
        const selectorButtonGroup = headerContainer.createDiv('storyteller-selector-button-group');
        selectorButtonGroup.style.display = 'flex';
        selectorButtonGroup.style.alignItems = 'center';
        selectorButtonGroup.style.gap = '0.5em';

        // --- Story Selector Dropdown ---
        const storySelector = selectorButtonGroup.createEl('select', { cls: 'storyteller-story-selector' });
        storySelector.id = 'storyteller-story-selector';
        this.plugin.settings.stories.forEach(story => {
            const option = storySelector.createEl('option', { text: story.name });
            option.value = story.id;
            if (story.id === this.plugin.settings.activeStoryId) option.selected = true;
        });
        storySelector.onchange = async (e) => {
            const id = (e.target as HTMLSelectElement).value;
            await this.plugin.setActiveStory(id);
            this.onOpen();
        };

        const newStoryBtn = selectorButtonGroup.createEl('button', { text: '+ New story', cls: 'storyteller-new-story-btn' });
        newStoryBtn.onclick = () => {
            new NewStoryModal(
                this.app,
                this.plugin.settings.stories.map(s => s.name),
                async (name, description) => {
                    const story = await this.plugin.createStory(name, description);
                    await this.plugin.setActiveStory(story.id);
                    // @ts-ignore
                    new window.Notice(`Story "${name}" created and activated.`);
                    this.onOpen();
                }
            ).open();
        };

        // --- Tab Headers (Now added AFTER the header container) ---
        this.tabHeaderContainer = container.createDiv('storyteller-dashboard-tabs my-plugin-scrollable-tabs');
        this.tabHeaderContainer.setAttr('role', 'tablist');
        this.tabHeaderContainer.tabIndex = 0; // Make tablist focusable for keyboard navigation

        // Mouse wheel horizontal scroll support (improved for natural direction and smoothness)
        this.tabHeaderContainer.addEventListener('wheel', (e: WheelEvent) => {
            // Use both axes, and a multiplier for deltaY for natural feel
            const scrollAmount = e.deltaX + e.deltaY * 2;
            if (scrollAmount !== 0) {
                e.preventDefault();
                this.tabHeaderContainer.scrollLeft += scrollAmount;
            }
        }, { passive: false });

        // Keyboard navigation for tabs (left/right arrow)
        this.tabHeaderContainer.addEventListener('keydown', (e: KeyboardEvent) => {
            const tabs = Array.from(this.tabHeaderContainer.querySelectorAll('.storyteller-tab-header'));
            const activeIdx = tabs.findIndex((el) => el.classList.contains('active'));
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIdx = (activeIdx + 1) % tabs.length;
                (tabs[nextIdx] as HTMLElement).focus();
                (tabs[nextIdx] as HTMLElement).click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIdx = (activeIdx - 1 + tabs.length) % tabs.length;
                (tabs[prevIdx] as HTMLElement).focus();
                (tabs[prevIdx] as HTMLElement).click();
            }
        });

        // --- Tab Content ---
        this.tabContentContainer = container.createDiv('storyteller-dashboard-content');

        // --- Create Tab Headers ---
        this.tabs.forEach((tab, index) => {
             const header = this.tabHeaderContainer.createEl('div', {
                 text: tab.label,
                 cls: 'storyteller-tab-header' + (index === 0 ? ' active' : '') // Activate first tab
             });
             header.dataset.tabId = tab.id; // Store tab id
             header.setAttr('role', 'tab');
             header.setAttr('tabindex', index === 0 ? '0' : '-1');
             if (index === 0) header.setAttr('aria-selected', 'true');
             else header.setAttr('aria-selected', 'false');

             header.addEventListener('click', async () => {
                 // Deactivate others
                 this.tabHeaderContainer.querySelectorAll('.storyteller-tab-header').forEach(h => {
                     h.removeClass('active');
                     h.setAttr('aria-selected', 'false');
                     h.setAttr('tabindex', '-1');
                 });
                 // Activate clicked
                 header.addClass('active');
                 header.setAttr('aria-selected', 'true');
                 header.setAttr('tabindex', '0');
                 // Update active tab tracking
                 this.activeTabId = tab.id;
                 // Render content
                 this.currentFilter = ''; // Reset filter on tab switch
                 await tab.renderFn(this.tabContentContainer);
             });
        });

        // --- Register Vault Event Listeners for Auto-refresh ---
        this.registerVaultEventListeners();

        // --- Register Workspace Resize Event Listener ---
        this.registerEvent(this.app.workspace.on('resize', () => {
            this.debouncedRefreshActiveTab();
        }));

        // --- Initial Content Render ---
        await this.renderCharactersContent(this.tabContentContainer); // Render the first tab initially
    }

    // --- Render Functions for Tab Content ---

    /**
     * Render the Characters tab content
     * Shows character list with filtering and management controls
     * @param container The container element to render content into
     */
    async renderCharactersContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Characters', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCharactersList(container);
        }, () => {
            new CharacterModal(this.app, this.plugin, null, async (char: Character) => {
                await this.plugin.saveCharacter(char);
                new Notice(`Character "${char.name}" created.`);
                // Manual refresh removed - automatic vault event refresh will handle this
            }).open();
        });

        await this.renderCharactersList(container);
    }

    /**
     * Render just the characters list (without header controls)
     * Used by filter function to avoid infinite recursion
     */
    private async renderCharactersList(container: HTMLElement) {
        // Clear existing list container if it exists
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) {
            existingListContainer.remove();
        }

        const characters = (await this.plugin.listCharacters()).filter(char =>
            char.name.toLowerCase().includes(this.currentFilter) ||
            (char.description || '').toLowerCase().includes(this.currentFilter) ||
            (char.traits || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (characters.length === 0) {
            const emptyMsg = listContainer.createEl('p', { text: 'No characters found. Click "Create new" to add your first character.', cls: 'storyteller-empty-state' });
            emptyMsg.style.color = 'var(--text-muted)';
            emptyMsg.style.fontStyle = 'italic';
            return;
        }
        this.renderCharacterList(characters, listContainer, container);
    }

    /**
     * Render the Locations tab content
     * Shows location list with filtering and management controls
     * @param container The container element to render content into
     */
    async renderLocationsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Locations', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderLocationsList(container);
        }, () => {
            new LocationModal(this.app, this.plugin, null, async (loc: Location) => {
                await this.plugin.saveLocation(loc);
                new Notice(`Location "${loc.name}" created.`);
                // Manual refresh removed - automatic vault event refresh will handle this
            }).open();
        });

        await this.renderLocationsList(container);
    }

    /**
     * Render just the locations list (without header controls)
     * Used by filter function to avoid infinite recursion
     */
    private async renderLocationsList(container: HTMLElement) {
        // Clear existing list container if it exists
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) {
            existingListContainer.remove();
        }

        const locations = (await this.plugin.listLocations()).filter(loc =>
            loc.name.toLowerCase().includes(this.currentFilter) ||
            (loc.description || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (locations.length === 0) {
            listContainer.createEl('p', { text: 'No locations found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        this.renderLocationList(locations, listContainer, container);
    }

    /**
     * Render the Events/Timeline tab content
     * Shows event list with filtering and management controls
     * @param container The container element to render content into
     */
    async renderEventsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Events/timeline', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderEventsList(container);
        }, () => {
            new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                await this.plugin.saveEvent(eventData);
                new Notice(`Event "${eventData.name}" created.`);
                // Manual refresh removed - automatic vault event refresh will handle this
            }).open();
        });

        await this.renderEventsList(container);
    }

    /**
     * Render just the events list (without header controls)
     * Used by filter function to avoid infinite recursion
     */
    private async renderEventsList(container: HTMLElement) {
        // Clear existing list container if it exists
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) {
            existingListContainer.remove();
        }

        const events = (await this.plugin.listEvents()).filter(evt =>
            evt.name.toLowerCase().includes(this.currentFilter) ||
            (evt.description || '').toLowerCase().includes(this.currentFilter) ||
            (evt.dateTime || '').toLowerCase().includes(this.currentFilter) ||
            (evt.location || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container storyteller-timeline-container'); // Add timeline class if needed
        if (events.length === 0) {
            listContainer.createEl('p', { text: 'No events found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        this.renderEventList(events, listContainer, container);
    }
    /**
     * Render the Items tab content
     * Shows plot item list with filtering and management controls
     * @param container The container element to render content into
     */
    async renderItemsContent(container: HTMLElement) {
        container.empty();
        let showPlotCriticalOnly = false; // State for the filter toggle

        const controlsGroup = container.createDiv('storyteller-controls-group');
        const filterSetting = new Setting(controlsGroup)
            .setName('Filter Items')
            .addText(text => text
                .setPlaceholder('Search items...')
                .onChange(async (value) => {
                    this.currentFilter = value.toLowerCase();
                    await this.renderItemsList(container, showPlotCriticalOnly);
                }));

        // "Plot Critical Only" Toggle Button
        new Setting(controlsGroup)
            .setName('Plot Critical')
            .setDesc('Show only bookmarked items.')
            .addToggle(toggle => {
                toggle.setValue(showPlotCriticalOnly)
                    .onChange(async (value) => {
                        showPlotCriticalOnly = value;
                        await this.renderItemsList(container, showPlotCriticalOnly);
                    });
            });

        new Setting(controlsGroup)
            .addButton(button => button
                .setButtonText('Create new')
                .setCta()
                .onClick(() => {
                    new PlotItemModal(this.app, this.plugin, null, async (item: PlotItem) => {
                        await this.plugin.savePlotItem(item);
                        new Notice(`Item "${item.name}" created.`);
                    }).open();
                }));

        await this.renderItemsList(container, showPlotCriticalOnly);
    }

    /**
     * Render just the items list (without header controls)
     */
    private async renderItemsList(container: HTMLElement, plotCriticalOnly: boolean) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) {
            existingListContainer.remove();
        }

        let items = await this.plugin.listPlotItems();

        if (plotCriticalOnly) {
            items = items.filter(item => item.isPlotCritical);
        }

        items = items.filter(item =>
            item.name.toLowerCase().includes(this.currentFilter) ||
            (item.description || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (items.length === 0) {
            listContainer.createEl('p', { text: 'No items found.' });
            return;
        }

        items.forEach(item => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (item.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.app.vault.adapter.getResourcePath(item.profileImagePath);
                imgEl.alt = item.name;
            } else {
                pfpContainer.setText(item.isPlotCritical ? '★' : '●');
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const titleEl = infoEl.createEl('strong', { text: item.name });
            if(item.isPlotCritical) {
                titleEl.setText(`★ ${item.name}`);
                titleEl.style.color = 'var(--text-accent)';
            }
            if (item.description) {
                infoEl.createEl('p', { text: item.description.substring(0, 80) + '...' });
            }

            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (item.currentOwner) {
                extraInfoEl.createSpan({ text: `Owner: ${item.currentOwner}` });
            }
             if (item.currentLocation) {
                if(item.currentOwner) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ text: `Location: ${item.currentLocation}` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new PlotItemModal(this.app, this.plugin, item, async (updatedData: PlotItem) => {
                    await this.plugin.savePlotItem(updatedData);
                    new Notice(`Item "${updatedData.name}" updated.`);
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
                    if (item.filePath) {
                        await this.plugin.deletePlotItem(item.filePath);
                    }
                }
            });
            this.addOpenFileButton(actionsEl, item.filePath);
        });
    }

    /**
     * Render the Gallery tab content
     * Shows image gallery with upload functionality
     * @param container The container element to render content into
     */
    async renderGalleryContent(container: HTMLElement) {
        container.empty();
        const filterCallback = async (filter: string) => {
            this.currentFilter = filter;
            await this.renderGalleryList(container);
        };
        const refreshCallback = async () => {
            await this.renderGalleryContent(container);
        };

        this.renderHeaderControls(container, 'Gallery', filterCallback, () => {
            // --- Upload Image Logic ---
            if (!this.fileInput) {
                // Create file input element if it doesn't exist
                this.fileInput = container.createEl('input', { type: 'file', cls: 'storyteller-hidden' });
                this.fileInput.accept = 'image/*'; // Accept only image files

                this.fileInput.onchange = async (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (!files || files.length === 0) {
                        return; // No file selected
                    }
                    const file = files[0];
                    const uploadFolderPath = this.plugin.settings.galleryUploadFolder;

                    try {
                        // 1. Ensure upload folder exists
                        await this.plugin.ensureFolder(uploadFolderPath);

                        // 2. Determine unique file path
                        let fileName = file.name;
                        let filePath = normalizePath(`${uploadFolderPath}/${fileName}`);
                        let counter = 0;
                        // Check for existing file and add counter if needed
                        while (this.app.vault.getAbstractFileByPath(filePath)) {
                            counter++;
                            const nameParts = file.name.split('.');
                            const extension = nameParts.pop();
                            fileName = `${nameParts.join('.')}_${counter}.${extension}`;
                            filePath = normalizePath(`${uploadFolderPath}/${fileName}`);
                        }

                        // 3. Read file content
                        const arrayBuffer = await file.arrayBuffer();

                        // 4. Create file in vault
                        const createdFile = await this.app.vault.createBinary(filePath, arrayBuffer);
                        new Notice(`Uploaded "${fileName}" to vault.`);

                        // 5. Add to gallery data and open detail modal
                        const newImageData = await this.plugin.addGalleryImage({ filePath: createdFile.path, title: createdFile.basename });
                        new ImageDetailModal(this.app, this.plugin, newImageData, true, refreshCallback).open();

                    } catch (error) {
                        console.error("Error uploading file:", error);
                        new Notice("Error uploading file. Check console for details.");
                    } finally {
                        // Reset file input value to allow uploading the same file again
                        if (this.fileInput) {
                            this.fileInput.value = '';
                        }
                    }
                };
            }
            // Trigger click on the hidden file input
            this.fileInput.click();
        }, "Upload Image"); // Change button text

        await this.renderGalleryList(container);
    }

    /**
     * Render just the gallery list (without header controls)
     * Used by filter function to avoid infinite recursion
     */
    private async renderGalleryList(container: HTMLElement) {
        // Clear existing gallery grid if it exists
        const existingGridContainer = container.querySelector('.storyteller-gallery-grid');
        if (existingGridContainer) {
            existingGridContainer.remove();
        }

        const images = this.plugin.getGalleryImages().filter(img =>
            img.filePath.toLowerCase().includes(this.currentFilter) ||
            (img.title || '').toLowerCase().includes(this.currentFilter) ||
            (img.caption || '').toLowerCase().includes(this.currentFilter) ||
            (img.description || '').toLowerCase().includes(this.currentFilter) ||
            (img.tags || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedCharacters || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedLocations || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedEvents || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const gridContainer = container.createDiv('storyteller-gallery-grid');
        if (images.length === 0) {
            gridContainer.createEl('p', { text: 'No images found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        // Pass refreshCallback to renderGalleryGrid
        const refreshCallback = async () => {
            await this.renderGalleryContent(container);
        };
        this.renderGalleryGrid(images, gridContainer, refreshCallback);
    }

    /**
     * Render the Groups tab content
     * Shows group list and allows creating new groups
     * @param container The container element to render content into
     */
    async renderGroupsContent(container: HTMLElement) {
        container.empty();
        // Header and create group button
        new Setting(container)
            .setName('Groups')
            .setDesc('Manage your groups. Shared across all entity types.')
            .addButton(button => button
                .setButtonText('Create new group')
                .setCta()
                .onClick(() => {
                    new GroupModal(
                        this.app,
                        this.plugin,
                        null,
                        async () => { await this.renderGroupsContent(container); },
                        async (groupId) => {
                            await this.plugin.deleteGroup(groupId);
                            await this.renderGroupsContent(container);
                        }
                    ).open();
                })
            );
        // --- Persistent Filter Bar and Group List Containers ---
        let filterBar = container.querySelector('.storyteller-group-filter-bar') as HTMLElement;
        let groupListContainer = container.querySelector('.storyteller-group-list-container') as HTMLElement;
        if (!filterBar) {
            filterBar = container.createDiv('storyteller-group-filter-bar');
            // Only create filter input once
            new Setting(filterBar)
                .setName('Filter groups')
                .setDesc('Search by group name or description.')
                .addText(text => {
                    text.setPlaceholder('Search groups...')
                        .setValue(this.currentFilter)
                        .onChange(async (value) => {
                            this.currentFilter = value;
                            // Only re-render the group list, not the filter input
                            this.renderGroupsList(groupListContainer);
                        });
                    text.inputEl.setAttribute('aria-label', 'Filter groups');
                });
        }
        if (!groupListContainer) {
            groupListContainer = container.createDiv('storyteller-group-list-container');
        }
        // Always render the group list (but only clear/re-render this part)
        this.renderGroupsList(groupListContainer);
    }

    // New helper to render just the group list (filtered)
    renderGroupsList(container: HTMLElement) {
        container.empty();
        const groups = this.plugin.getGroups().filter(group => {
            const filter = this.currentFilter.toLowerCase();
            return (
                group.name.toLowerCase().includes(filter) ||
                (group.description && group.description.toLowerCase().includes(filter))
            );
        });
        if (groups.length === 0) {
            container.createEl('p', { text: 'No groups found.' });
            return;
        }
        groups.forEach((group, idx) => {
            // Collapsible card state: expanded by default if filter is active, else collapsed
            const isExpanded = !!this.currentFilter || false;
            const groupCard = container.createDiv('storyteller-group-card sts-card');
            groupCard.setAttr('tabindex', '0'); // Make card focusable
            // Header row with expand/collapse button, group info, and actions
            const groupHeader = groupCard.createDiv('storyteller-group-header');
            // Expand/collapse button
            const toggleBtn = groupHeader.createEl('button', {
                cls: 'storyteller-group-toggle-btn',
                text: isExpanded ? '▼' : '►',
            });
            toggleBtn.setAttr('aria-label', isExpanded ? 'Collapse group' : 'Expand group');
            toggleBtn.setAttr('aria-expanded', isExpanded ? 'true' : 'false');
            // Group info
            const infoDiv = groupHeader.createDiv('storyteller-group-info');
            infoDiv.createEl('strong', { text: group.name });
            if (group.description) {
                infoDiv.createEl('span', { text: group.description, cls: 'storyteller-group-desc' });
            }
            // Actions (Edit button)
            const actionsDiv = groupHeader.createDiv('storyteller-group-actions');
            const editBtn = actionsDiv.createEl('button', { text: 'Edit', cls: 'mod-cta storyteller-group-edit-btn' });
            editBtn.onclick = () => {
                new GroupModal(
                    this.app,
                    this.plugin,
                    group,
                    async () => { this.renderGroupsList(container); },
                    async (groupId) => {
                        await this.plugin.deleteGroup(groupId);
                        this.renderGroupsList(container);
                    }
                ).open();
            };
            // Collapsible content (members)
            const membersSection = groupCard.createDiv('storyteller-group-members');
            if (!isExpanded) membersSection.addClass('collapsed');
            
            // Group members by type
            const grouped = {
                character: group.members.filter(m => m.type === 'character'),
                location: group.members.filter(m => m.type === 'location'),
                event: group.members.filter(m => m.type === 'event'),
                item: group.members.filter(m => m.type === 'item'), // ADDED
            };
            const typeLabels = {
                character: 'Characters',
                location: 'Locations',
                event: 'Events',
                item: 'Items', // ADDED
            };
            const typeIcons = {
                character: `<svg ...>`, // existing
                location: `<svg ...>`, // existing
                event: `<svg ...>`,   // existing
                item: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gem"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M12 22V9"/><path d="m3.5 8.5 17 0"/></svg>`, // ADDED
            };
            
            (['character', 'location', 'event', 'item'] as const).forEach(type => { // ADDED 'item'
                if (grouped[type].length > 0) {
                    // Section header
                    const header = membersSection.createDiv('storyteller-group-entity-header');
                    header.setAttr('role', 'heading');
                    header.setAttr('aria-level', '4');
                    header.innerHTML = `<span class="storyteller-group-entity-icon">${typeIcons[type]}</span> <span>${typeLabels[type]}</span>`;
                    // Sublist
                    const list = membersSection.createEl('ul', { cls: 'storyteller-group-entity-list' });
                    grouped[type].forEach(member => {
                        const li = list.createEl('li', { cls: 'storyteller-group-entity-item' });
                        li.textContent = member.id;
                    });
                }
            });
            if (group.members.length === 0) {
                membersSection.createEl('em', { text: 'No members.' });
            }
            // Toggle expand/collapse
            let expanded = isExpanded;
            const updateCollapse = () => {
                expanded = !expanded;
                toggleBtn.textContent = expanded ? '▼' : '►';
                toggleBtn.setAttr('aria-label', expanded ? 'Collapse group' : 'Expand group');
                toggleBtn.setAttr('aria-expanded', expanded ? 'true' : 'false');
                membersSection.toggleClass('collapsed', !expanded);
            };
            toggleBtn.onclick = updateCollapse;
            toggleBtn.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    updateCollapse();
                }
            };
        });
    }

    // --- Header Controls (Filter + Add Button) ---
    private renderHeaderControls(container: HTMLElement, title: string, filterFn: (filter: string) => Promise<void>, addFn: () => void, addButtonText: string = 'Create new') {
        const controlsGroup = container.createDiv('storyteller-controls-group');
        controlsGroup.style.display = 'flex';
        controlsGroup.style.alignItems = 'center';
        controlsGroup.style.gap = '0.5em';
        new Setting(controlsGroup)
            .setName(`Filter ${title.toLowerCase()}`)
            .setDesc('')
            .addText(text => text
                .setPlaceholder(`Search ${title.toLowerCase()}...`)
                .onChange(async (value) => {
                    this.currentFilter = value.toLowerCase();
                    await filterFn(this.currentFilter);
                }))
            .addButton(button => button
                .setButtonText(addButtonText)
                .setCta()
                .onClick(addFn));
    }

    // --- List/Grid Rendering Helpers (Adapted from Modals) ---

    renderCharacterList(characters: Character[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        characters.forEach(character => {
            const itemEl = listContainer.createDiv('storyteller-list-item storyteller-character-item'); // Add specific class

            // --- Profile Picture ---
            const imgContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (character.profileImagePath) {
                const imgEl = imgContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(character.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = character.name;
                } catch (e) {
                    console.error(`Error loading profile image for ${character.name}: ${character.profileImagePath}`, e);
                    imgContainer.createSpan({ text: '?', title: 'Error loading image' }); // Placeholder on error
                }
            } else {
                // Optional: Placeholder icon/initials if no image
                imgContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: character.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: character.name });
            if (character.description) {
                infoEl.createEl('p', { text: character.description.substring(0, 80) + (character.description.length > 80 ? '...' : '') });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (character.status) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: character.status });
            }
            if (character.affiliation) {
                if (character.status) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-affiliation', text: character.affiliation });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new CharacterModal(this.app, this.plugin, character, async (updatedData: Character) => {
                    await this.plugin.saveCharacter(updatedData);
                    new Notice(`Character "${updatedData.name}" updated.`);
                    // Manual refresh removed - automatic vault event refresh will handle this
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${character.name}"? This will move the file to system trash.`)) {
                    if (character.filePath) {
                        await this.plugin.deleteCharacter(character.filePath);
                        // Manual refresh removed - automatic vault event refresh will handle this
                    } else {
                        new Notice('Error: Cannot delete character without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, character.filePath);
        });
    }

    renderLocationList(locations: Location[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        locations.forEach(location => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            // --- Image --- Use pfp class and logic
            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (location.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(location.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = location.name;
                } catch (e) {
                    console.error(`Error loading image for ${location.name}: ${location.profileImagePath}`, e);
                    pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
                }
            } else {
                // Placeholder: First letter of name
                const initials = location.name.substring(0, 1).toUpperCase();
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: initials });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: location.name });
            if (location.description) {
                infoEl.createEl('p', { text: location.description.substring(0, 100) + (location.description.length > 100 ? '...' : '') });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (location.locationType) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-type', text: location.locationType });
            }
            if (location.region) {
                if (location.locationType) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-region', text: `(${location.region})` });
            }
            if (location.status) {
                if (location.locationType || location.region) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: `[${location.status}]` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new LocationModal(this.app, this.plugin, location, async (updatedData) => {
                    await this.plugin.saveLocation(updatedData);
                    new Notice(`Location "${updatedData.name}" updated.`);
                    // Manual refresh removed - automatic vault event refresh will handle this
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${location.name}"?`)) {
                    if (location.filePath) {
                        await this.plugin.deleteLocation(location.filePath);
                        // Manual refresh removed - automatic vault event refresh will handle this
                    } else {
                        new Notice('Error: Cannot delete location without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, location.filePath);
        });
    }

    renderEventList(events: Event[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        events.forEach(event => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            // --- Image --- Use pfp class and logic
            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (event.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(event.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = event.name;
                } catch (e) {
                    console.error(`Error loading image for ${event.name}: ${event.profileImagePath}`, e);
                    pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
                }
            } else {
                // Placeholder: First letter of name
                const initials = event.name.substring(0, 1).toUpperCase();
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: initials });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: event.name });
            if (event.dateTime) {
                infoEl.createEl('span', { text: ` (${event.dateTime})`, cls: 'storyteller-timeline-date' });
            }
            if (event.description) {
                infoEl.createEl('p', { text: event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '') });
            }

            // --- Associated Images Thumbnails ---
            if (event.images && Array.isArray(event.images) && event.images.length > 0) {
                const imagesRow = infoEl.createDiv('storyteller-event-images-row');
                event.images.forEach(imagePath => {
                    try {
                        const thumb = imagesRow.createEl('img', { cls: 'storyteller-event-image-thumb' });
                        const resourcePath = this.app.vault.adapter.getResourcePath(imagePath);
                        thumb.src = resourcePath;
                        thumb.alt = event.name + ' image';
                        thumb.loading = 'lazy';
                        thumb.style.maxWidth = '48px';
                        thumb.style.maxHeight = '48px';
                        thumb.style.marginRight = '4px';
                        thumb.style.cursor = 'pointer';
                        thumb.addEventListener('click', () => {
                            // Open in modal (ImageDetailModal)
                            new ImageDetailModal(
                                this.app,
                                this.plugin,
                                { id: imagePath, filePath: imagePath },
                                false,
                                () => Promise.resolve()
                            ).open();
                        });
                    } catch (e) {
                        imagesRow.createSpan({ text: '?', title: 'Error loading image' });
                    }
                });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (event.status) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: `[${event.status}]` });
            }
            if (event.location) {
                if (event.status) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-location', text: `@ ${event.location}` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new EventModal(this.app, this.plugin, event, async (updatedData) => {
                    await this.plugin.saveEvent(updatedData);
                    new Notice(`Event "${updatedData.name}" updated.`);
                    // Manual refresh removed - automatic vault event refresh will handle this
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${event.name}"?`)) {
                    if (event.filePath) {
                        await this.plugin.deleteEvent(event.filePath);
                        // Manual refresh removed - automatic vault event refresh will handle this
                    } else {
                        new Notice('Error: Cannot delete event without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, event.filePath);
        });
    }

    renderGalleryGrid(images: any[], gridContainer: HTMLElement, refreshCallback: () => Promise<void>) {
        // Apply grid styling class to the container (ensure CSS exists for this class)
        gridContainer.addClass('storyteller-gallery-grid'); // Added this line

        images.forEach(image => {
            // --- Item Wrapper ---
            const imgWrapper = gridContainer.createDiv('storyteller-gallery-item');
            imgWrapper.setAttribute('role', 'button'); // Make it behave like a button for accessibility
            imgWrapper.setAttribute('tabindex', '0'); // Make it focusable

            // --- Image Element ---
            const imgEl = imgWrapper.createEl('img', { cls: 'storyteller-gallery-item-image' }); // Add class for styling
            const resourcePath = this.app.vault.adapter.getResourcePath(image.filePath);
            imgEl.src = resourcePath;
            imgEl.alt = image.title || image.filePath.split('/').pop() || 'Gallery image'; // Provide alt text
            imgEl.loading = 'lazy'; // Improve performance for many images

            // --- Title Element ---
            const titleEl = imgWrapper.createDiv('storyteller-gallery-item-title'); // Create div for title
            // Use title if available, otherwise fallback to filename
            const titleText = image.title || image.filePath.split('/').pop() || '';
            titleEl.setText(titleText);
            titleEl.setAttribute('title', titleText); // Add full text as tooltip

            // --- Click Handler ---
            // Use keydown for accessibility as well
            const openDetailModal = () => {
                new ImageDetailModal(this.app, this.plugin, image, false, refreshCallback).open();
            };
            imgWrapper.addEventListener('click', openDetailModal);
            imgWrapper.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault(); // Prevent default spacebar scroll
                    openDetailModal();
                }
            });
        });
    }

    // --- Action Button Helpers ---
    addEditButton(container: HTMLElement, onClick: () => void) {
        new ButtonComponent(container)
            .setIcon('pencil')
            .setTooltip('Edit')
            .onClick(onClick);
    }

    addDeleteButton(container: HTMLElement, onClick: () => Promise<void>) {
        new ButtonComponent(container)
            .setIcon('trash')
            .setTooltip('Delete')
            .setClass('mod-warning')
            .onClick(onClick);
    }

    addOpenFileButton(container: HTMLElement, filePath: string | undefined) {
        if (!filePath) return;
        new ButtonComponent(container)
           .setIcon('go-to-file')
           .setTooltip('Open note')
           .onClick(() => {
               const file = this.app.vault.getAbstractFileByPath(filePath);
               if (file instanceof TFile) {
                   this.app.workspace.getLeaf(false).openFile(file);
               } else {
                   new Notice('Could not find the note file.');
               }
           });
    }

    async onClose() {
        // Clean up file input if it exists
        this.fileInput?.remove();
        this.fileInput = null;
        // Event listeners are automatically cleaned up by registerEvent()
    }
}
