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
import { Character, Location, Event, Group, PlotItem, GalleryImage } from '../types'; // Import types
import { NewStoryModal } from '../modals/NewStoryModal';
import { GroupModal } from '../modals/GroupModal';
import { PlatformUtils } from '../utils/PlatformUtils';

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
    // Responsive tabs UI state
    private tabHeaderRibbonEl: HTMLElement | null = null;
    // Measurement/More elements removed
    private tabsResizeObserver: ResizeObserver | null = null;
    // Icons removed per UX request; text-only tabs
    
    /** Search input reference for focus preservation */
    private currentSearchInput: HTMLInputElement | null = null;
    
    /** Debounced search function */
    private debouncedSearch: ((filterFn: (filter: string) => Promise<void>) => void) | null = null;

    /** Flag to track if user is actively typing (mobile optimization) */
    private isUserTyping: boolean = false;

    /** Timer to reset typing state */
    private typingTimer: number | null = null;

    /** Timer for clearing search input dismissal flag */
    private dismissalTimer: number | null = null;

    /**
     * Helper method to mark search input dismissal intent
     * Sets a temporary attribute to indicate user requested keyboard dismissal
     */
    private markSearchInputDismissal() {
        if (this.currentSearchInput) {
            this.currentSearchInput.setAttribute('data-user-dismissed', 'true');
            
            // Clear any existing dismissal timer to prevent overlapping timers
            if (this.dismissalTimer) {
                clearTimeout(this.dismissalTimer);
            }
            
            // Clear the flag after 500ms - this delay allows normal interaction
            // to resume while preventing immediate refocus during user-initiated dismissal
            this.dismissalTimer = window.setTimeout(() => {
                if (this.currentSearchInput) {
                    this.currentSearchInput.removeAttribute('data-user-dismissed');
                }
                this.dismissalTimer = null;
            }, 500);
        }
    }

    /**
     * Helper method to get the appropriate image source path
     * Handles external URLs, data URIs, app/obsidian protocols, and local vault paths
     * @param imagePath The image path (URL or vault path)
     * @returns The appropriate src for img element
     */
    private getImageSrc(imagePath: string): string {
        // Check if it's an external URL, data URI, or special protocol
        if (imagePath.startsWith('http://') || 
            imagePath.startsWith('https://') ||
            imagePath.startsWith('data:') ||
            imagePath.startsWith('app://') ||
            imagePath.startsWith('obsidian://') ||
            imagePath.startsWith('//')) {
            // Guard: block remote images when disabled
            if (imagePath.startsWith('http') || imagePath.startsWith('//')) {
                const allow = this.plugin.settings.allowRemoteImages ?? false;
                if (!allow) {
                    // Block: return empty data URI so the UI doesn't break. An import flow will be offered elsewhere.
                    return '';
                }
            }
            return imagePath;
        }
        // Otherwise, treat it as a vault path
        return this.app.vault.adapter.getResourcePath(imagePath);
    }

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
            { id: 'references', label: 'Reference', renderFn: this.renderReferencesContent.bind(this) },
            { id: 'chapters', label: 'Chapters', renderFn: this.renderChaptersContent.bind(this) },
            { id: 'scenes', label: 'Scenes', renderFn: this.renderScenesContent.bind(this) },
        ];

        this.debouncedRefreshActiveTab = debounce(this.refreshActiveTab.bind(this), 200, true);
        
        // Initialize debounced search for mobile optimization
        this.debouncedSearch = debounce(async (filterFn: (filter: string) => Promise<void>) => {
            try {
                await filterFn(this.currentFilter);
                // Restore focus to search input on mobile after re-render
                if (PlatformUtils.isMobile() && this.currentSearchInput && document.activeElement !== this.currentSearchInput) {
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        if (this.currentSearchInput) {
                            this.currentSearchInput.focus();
                        }
                    }, 50);
                }
            } catch (error) {
                console.error('Storyteller Suite: Error in debounced search:', error);
            }
        }, PlatformUtils.getSearchDebounceDelay());
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
            const refFolder = this.plugin.getEntityFolder('reference');
            const chapterFolder = this.plugin.getEntityFolder('chapter');
            const sceneFolder = this.plugin.getEntityFolder('scene');
            
            const isRelevant = filePath.startsWith(charFolder + '/') ||
                filePath.startsWith(locFolder + '/') ||
                filePath.startsWith(evtFolder + '/') ||
                filePath.startsWith(itemFolder + '/') || // ADDED THIS LINE
                filePath.startsWith(refFolder + '/') ||
                filePath.startsWith(chapterFolder + '/') ||
                filePath.startsWith(sceneFolder + '/') ||
                filePath.startsWith(this.plugin.settings.galleryUploadFolder + '/');
            return isRelevant;
        } catch {
            return false;
        }
    }

    /**
     * Refresh the currently active tab (with mobile typing protection)
     * Prevents refresh while user is actively typing on mobile to avoid keyboard dismissal
     */
    private async refreshActiveTab() {
        if (!this.tabContentContainer) {
            return;
        }
        
        // On mobile, don't refresh while user is actively typing to prevent keyboard dismissal
        if (PlatformUtils.isMobile() && this.isUserTyping) {
            console.log('Storyteller Suite: Skipping refresh while user is typing on mobile');
            return;
        }
        
        // Preserve search input state before refresh
        const searchInputValue = this.currentSearchInput?.value || '';
        const searchInputWasFocused = document.activeElement === this.currentSearchInput;
        
        const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
        if (activeTab) {
            try {
                await activeTab.renderFn(this.tabContentContainer);
                
                // Restore search input state after refresh (mobile optimization)
                if (PlatformUtils.isMobile() && (searchInputValue || searchInputWasFocused)) {
                    setTimeout(() => {
                        if (this.currentSearchInput) {
                            if (searchInputValue) {
                                this.currentSearchInput.value = searchInputValue;
                                this.currentFilter = searchInputValue.toLowerCase();
                            }
                            if (searchInputWasFocused) {
                                this.currentSearchInput.focus();
                            }
                        }
                    }, 100);
                }
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
        // Ensure container fills the pane and provides a fixed height for inner layout
        (container as HTMLElement).style.display = 'flex';
        (container as HTMLElement).style.flexDirection = 'column';
        (container as HTMLElement).style.height = '100%';
        (container as HTMLElement).style.overflow = 'hidden';

        // Apply mobile-specific classes
        const mobileClasses = PlatformUtils.getMobileCssClasses();
        mobileClasses.forEach(className => {
            container.addClass(className);
        });

        // Add mobile-responsive class
        if (PlatformUtils.isMobile()) {
            container.addClass('mobile-dashboard');
        }

        // --- Create a Header Container ---
        const headerContainer = container.createDiv('storyteller-dashboard-header');
        // Make header stick to the top of the scroll container
        headerContainer.style.position = 'sticky';
        headerContainer.style.top = '0';
        headerContainer.style.zIndex = '10';
        headerContainer.style.background = getComputedStyle(document.body).getPropertyValue('--background-primary') || 'var(--background-primary)';

        // --- Header Top Row (title + selector/button) ---
        const headerTopRow = headerContainer.createDiv('storyteller-dashboard-header-top');

        // --- Title (inside the header top row) ---
        const titleEl = headerTopRow.createEl('h2', {
            cls: 'storyteller-dashboard-title'
        });

        titleEl.append('Storyteller suite');

        // --- Group for selector and button (mobile-optimized layout) ---
        const selectorButtonGroup = headerTopRow.createDiv('storyteller-selector-button-group');
        
        if (PlatformUtils.isMobile() && !PlatformUtils.isTablet()) {
            // Stack vertically on mobile phones
            selectorButtonGroup.style.display = 'flex';
            selectorButtonGroup.style.flexDirection = 'column';
            selectorButtonGroup.style.gap = '0.75rem';
            selectorButtonGroup.style.width = '100%';
        } else {
            // Horizontal layout for desktop and tablets
            selectorButtonGroup.style.display = 'flex';
            selectorButtonGroup.style.alignItems = 'center';
            selectorButtonGroup.style.gap = '0.5em';
        }

        // --- Story Selector or Custom Folders Indicator (mobile-optimized) ---
        const storySelector = selectorButtonGroup.createEl('select', { cls: 'storyteller-story-selector' });
        storySelector.id = 'storyteller-story-selector';

        if (PlatformUtils.isMobile()) {
            const touchTargetSize = PlatformUtils.getTouchTargetSize();
            storySelector.style.minHeight = `${touchTargetSize}px`;
            storySelector.style.fontSize = `${1.1 * PlatformUtils.getFontScaling()}rem`;
            storySelector.style.width = '100%';
        }

        // Populate stories (also in custom-folder mode)
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

        if (!this.plugin.settings.enableOneStoryMode) {
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
        }

        // --- Tab Headers (priority+ ribbon) ---
        // Place tabs as their own sticky row below the header
        this.tabHeaderContainer = container.createDiv('storyteller-dashboard-tabs');
        this.tabHeaderContainer.setAttr('role', 'tablist');
        this.tabHeaderContainer.style.overflow = 'hidden';
        this.tabHeaderContainer.style.position = 'sticky';
        // Will be updated dynamically based on header height
        this.tabHeaderContainer.style.top = '0px';
        this.tabHeaderContainer.style.zIndex = '9';
        this.tabHeaderContainer.style.display = 'flex';
        this.tabHeaderContainer.style.alignItems = 'center';
        this.tabHeaderContainer.style.gap = '0.25rem';
        this.tabHeaderContainer.style.width = '100%';

        // Ribbon row (visible tabs)
        this.tabHeaderRibbonEl = this.tabHeaderContainer.createDiv('storyteller-tab-ribbon');
        this.tabHeaderRibbonEl.style.display = 'flex';
        this.tabHeaderRibbonEl.style.gap = '0.5rem';
        this.tabHeaderRibbonEl.style.alignItems = 'center';
        this.tabHeaderRibbonEl.style.whiteSpace = 'nowrap';
        this.tabHeaderRibbonEl.style.justifyContent = 'center';
        (this.tabHeaderRibbonEl.style as any).alignContent = 'center';
        (this.tabHeaderRibbonEl.style as any).flex = '1 1 auto';
        this.tabHeaderRibbonEl.style.width = '100%';

        // Measurement/More removed; tabs will wrap freely

        // Responsive layout via ResizeObserver
        this.tabsResizeObserver = new ResizeObserver(() => {
            this.layoutTabs();
            this.updateStickyOffsets(headerContainer);
        });
        this.tabsResizeObserver.observe(this.tabHeaderContainer);

        // Initial layout and sticky offset
        this.layoutTabs();
        this.updateStickyOffsets(headerContainer);

        // --- Tab Content ---
        this.tabContentContainer = container.createDiv('storyteller-dashboard-content');
        // Fixed-height content area that hosts scrollable lists/grids
        this.tabContentContainer.style.flex = '1 1 auto';
        this.tabContentContainer.style.minHeight = '0';
        this.tabContentContainer.style.overflowY = 'hidden';
        this.tabContentContainer.style.overflowX = 'hidden';

        // Initial active state
        this.setActiveTab(this.activeTabId || this.tabs[0].id);

        // --- Register Vault Event Listeners for Auto-refresh ---
        this.registerVaultEventListeners();

        // --- Register Workspace Resize Event Listener ---
        this.registerEvent(this.app.workspace.on('resize', () => {
            this.debouncedRefreshActiveTab();
            this.updateStickyOffsets(headerContainer);
        }));

        // --- Register Global Click Handler for Mobile Keyboard Dismissal ---
        if (PlatformUtils.isMobile()) {
            this.registerDomEvent(document, 'click', (e: MouseEvent) => {
                try {
                    // Type guard: ensure e.target is a Node before proceeding
                    if (!e.target || !(e.target instanceof Node)) {
                        return;
                    }

                    // If user taps outside any search input, allow keyboard dismissal
                    if (this.currentSearchInput && 
                        e.target !== this.currentSearchInput && 
                        !this.currentSearchInput.contains(e.target)) {
                        // Mark as user-requested dismissal and remove focus
                        this.markSearchInputDismissal();
                        this.currentSearchInput.blur();
                    }
                } catch (error) {
                    console.error('Storyteller Suite: Error in mobile keyboard dismissal handler:', error);
                }
            });
        }

        // --- Initial Content Render ---
        await this.renderCharactersContent(this.tabContentContainer); // Render the first tab initially
    }

    /** Update sticky top offsets so tabs sit exactly below header without clipping */
    private updateStickyOffsets(headerEl: HTMLElement): void {
        try {
            if (!this.tabHeaderContainer || !headerEl) return;
            const rect = headerEl.getBoundingClientRect();
            const headerHeight = Math.ceil(rect.height);
            this.tabHeaderContainer.style.top = `${headerHeight}px`;
        } catch (e) {
            console.warn('Storyteller: failed to update sticky offsets', e);
        }
    }

    /** Compute responsive display mode based on container width */
    private getTabDisplayMode(): 'tiny' | 'compact' | 'normal' {
        const width = this.tabHeaderContainer?.clientWidth ?? 0;
        // Favor showing labels more often
        if (width < 320) return 'tiny';
        if (width < 480) return 'compact';
        return 'normal';
    }

    /** Render or re-render tabs according to available width (priority+ ribbon) */
    private layoutTabs(): void {
        if (!this.tabHeaderContainer || !this.tabHeaderRibbonEl) return;

        // Prepare container
        this.tabHeaderRibbonEl.style.flexWrap = 'wrap';
        (this.tabHeaderRibbonEl.style as any).rowGap = '6px';

        // Reset
        this.tabHeaderRibbonEl.empty();

        const mode = this.getTabDisplayMode();
        const btnMode: 'compact' | 'normal' = (mode === 'normal') ? 'normal' : 'compact';

        // Tiny: still render tabs; they'll wrap to multiple lines
        // Compact mode reduces padding via mode pass-through

        // Render all tabs and allow natural wrapping to any number of rows
        for (const tab of this.tabs) {
            const btn = this.createTabButtonEl(tab, btnMode, false);
            this.tabHeaderRibbonEl.appendChild(btn);
        }

        this.syncActiveTabStyles();
    }

    private createTabButtonEl(tab: { id: string; label: string }, mode: 'normal' | 'compact', forMeasure = false): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'storyteller-tab-header';
        btn.setAttribute('role', 'tab');
        btn.dataset.tabId = tab.id;
        btn.title = mode === 'compact' ? tab.label : '';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.gap = '0.25rem';
        btn.style.padding = '6px 10px';
        btn.style.borderRadius = '6px';
        if (!forMeasure) {
            (btn.style as any).flex = '0 1 auto';
            btn.style.minWidth = '96px';
            btn.style.maxWidth = '220px';
        }

        const labelSpan = document.createElement('span');
        labelSpan.textContent = tab.label;
        // Always render label (icons removed); keep visible in all modes
        labelSpan.style.display = 'inline';
        btn.appendChild(labelSpan);

        if (!forMeasure) {
            btn.addEventListener('click', async () => {
                await this.setActiveTab(tab.id);
            });
        }
        return btn;
    }

    // More dropdown removed

    private async setActiveTab(tabId: string) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        // Update state
        this.activeTabId = tabId;
        this.currentFilter = '';
        this.currentSearchInput = null;
        // Render content
        await tab.renderFn(this.tabContentContainer);
        // Update styles
        this.syncActiveTabStyles();
    }

    private syncActiveTabStyles() {
        if (!this.tabHeaderRibbonEl) return;
        const all = this.tabHeaderContainer?.querySelectorAll('.storyteller-tab-header') ?? [];
        all.forEach((el: Element) => {
            const h = el as HTMLElement;
            const isActive = h.dataset.tabId === this.activeTabId;
            h.classList.toggle('active', !!isActive);
            h.setAttribute('aria-selected', isActive ? 'true' : 'false');
            h.setAttribute('tabindex', isActive ? '0' : '-1');
            h.style.background = isActive ? 'var(--background-modifier-hover)' : 'transparent';
            h.style.outline = 'none';
        });
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
            }).open();
        }, 'Create new', (setting: Setting) => {
            setting.addButton(button => button
                .setButtonText('View timeline')
                .setCta()
                .onClick(async () => {
                    const events = await this.plugin.listEvents();
                    const { TimelineModal } = await import('../modals/TimelineModal');
                    new TimelineModal(this.app as unknown as App, this.plugin, events).open();
                }));
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
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create new')
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice('Select or create a story first.');
                            return;
                        }
                        new PlotItemModal(this.app, this.plugin, null, async (item: PlotItem) => {
                            await this.plugin.savePlotItem(item);
                            new Notice(`Item "${item.name}" created.`);
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });

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
                imgEl.src = this.getImageSrc(item.profileImagePath);
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
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create new group')
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice('Select or create a story first.');
                            return;
                        }
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
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });
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
        await this.renderGroupsList(groupListContainer);
    }

    // New helper to render just the group list (filtered)
    async renderGroupsList(container: HTMLElement) {
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
        const allCharacters = await this.plugin.listCharacters();
        const allLocations = await this.plugin.listLocations();
        const allEvents = await this.plugin.listEvents();
        const allItems = await this.plugin.listPlotItems();

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
            if (group.profileImagePath) {
                const img = infoDiv.createEl('img', { cls: 'storyteller-group-pfp' });
                try { img.src = this.getImageSrc(group.profileImagePath); } catch (e) { /* ignore */ }
            }
            infoDiv.createEl('strong', { text: group.name });
            if (group.description) {
                infoDiv.createEl('span', { text: group.description, cls: 'storyteller-group-desc' });
            }
            if (group.tags && group.tags.length > 0) {
                const tagsRow = infoDiv.createDiv('storyteller-group-tags');
                tagsRow.createSpan({ text: (group.tags || []).map(t => `#${t}`).join(' ') });
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
                item: group.members.filter(m => m.type === 'item'),
            } as const;
            const typeLabels = {
                character: 'Characters',
                location: 'Locations',
                event: 'Events',
                item: 'Items', // ADDED
            };
            const typeIcons = {
                character: `👤`,
                location: `📍`,
                event: `🕒`,
                item: `💎`,
            } as const;
            
            (['character', 'location', 'event', 'item'] as const).forEach(type => {
                if (grouped[type].length > 0) {
                    // Section container for grid layout
                    const section = membersSection.createDiv('storyteller-group-section');
                    // Section header
                    const header = section.createDiv('storyteller-group-entity-header');
                    header.setAttr('role', 'heading');
                    header.setAttr('aria-level', '4');
                    header.innerHTML = `<span class="storyteller-group-entity-icon">${typeIcons[type]}</span> <span>${typeLabels[type]}</span>`;
                    // Sublist
                    const list = section.createEl('ul', { cls: 'storyteller-group-entity-list' });
                    grouped[type].forEach(member => {
                        const li = list.createEl('li', { cls: 'storyteller-group-entity-item' });
                        // Resolve display name
                        let displayName = member.id;
                        let filePath: string | undefined;
                        if (type === 'character') {
                            const c = allCharacters.find(c => (c.id || c.name) === member.id);
                            if (c) { displayName = c.name; filePath = c.filePath; }
                        } else if (type === 'location') {
                            const l = allLocations.find(l => (l.id || l.name) === member.id);
                            if (l) { displayName = l.name; filePath = l.filePath; }
                        } else if (type === 'event') {
                            const e = allEvents.find(e => (e.id || e.name) === member.id);
                            if (e) { displayName = e.name; filePath = e.filePath; }
                        } else if (type === 'item') {
                            const i = allItems.find(i => (i.id || i.name) === member.id);
                            if (i) { displayName = i.name; filePath = i.filePath; }
                        }
                        li.textContent = displayName;
                        if (filePath) {
                            li.classList.add('is-link');
                            li.addEventListener('click', () => {
                                const path = filePath as string;
                                const file = this.app.vault.getAbstractFileByPath(path);
                                if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
                            });
                        }
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
    private renderHeaderControls(container: HTMLElement, title: string, filterFn: (filter: string) => Promise<void>, addFn: () => void, addButtonText: string = 'Create new', extendButtons?: (s: Setting) => void) {
        const controlsGroup = container.createDiv('storyteller-controls-group');
        controlsGroup.style.display = 'flex';
        controlsGroup.style.alignItems = 'center';
        controlsGroup.style.gap = '0.5em';
        
        // Determine entity type from title for folder resolvability check
        const titleKey = title.toLowerCase();
        let entityType: 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | null = null;
        if (titleKey.startsWith('character')) entityType = 'character';
        else if (titleKey.startsWith('location')) entityType = 'location';
        else if (titleKey.includes('event') || titleKey.includes('timeline')) entityType = 'event';
        else if (titleKey.startsWith('item')) entityType = 'item';
        else if (titleKey.startsWith('reference')) entityType = 'reference';
        else if (titleKey.startsWith('chapter')) entityType = 'chapter';
        else if (titleKey.startsWith('scene')) entityType = 'scene';

        const canCreate = (() => {
            if (!entityType) return true; // Non-entity sections like Gallery
            try {
                // Will throw if no resolvable folder (e.g., requires active story)
                this.plugin.getEntityFolder(entityType);
                return true;
            } catch {
                return false;
            }
        })();

        const headerSetting = new Setting(controlsGroup)
            .setName(`Filter ${title.toLowerCase()}`)
            .setDesc('')
            .addText(text => {
                const component = text
                    .setPlaceholder(`Search ${title.toLowerCase()}...`)
                    .onChange(async (value) => {
                        this.currentFilter = value.toLowerCase();
                        
                        // Use debounced search to prevent keyboard hiding on mobile
                        if (this.debouncedSearch) {
                            this.debouncedSearch(filterFn);
                        } else {
                            // Fallback for immediate execution if debounce not available
                            await filterFn(this.currentFilter);
                        }
                    });
                
                // Store reference to the input element for focus preservation
                this.currentSearchInput = component.inputEl;
                
                // Add mobile-specific attributes to prevent keyboard issues
                if (PlatformUtils.isMobile()) {
                    component.inputEl.autocomplete = 'off';
                    component.inputEl.setAttribute('autocorrect', 'off');
                    component.inputEl.setAttribute('autocapitalize', 'none');
                    component.inputEl.spellcheck = false;
                    
                    // Add mobile-friendly CSS classes
                    component.inputEl.addClass('mobile-input');
                    component.inputEl.addClass('search-input');
                    
                    // Prevent zoom on iOS
                    if (PlatformUtils.isIOS()) {
                        component.inputEl.style.fontSize = '1.1rem';
                    }
                    
                    // Add typing detection to prevent auto-refresh while typing
                    const startTyping = () => {
                        this.isUserTyping = true;
                        // Reset dismissal flag when user types
                        component.inputEl.removeAttribute('data-user-dismissed');
                        if (this.typingTimer) {
                            clearTimeout(this.typingTimer);
                        }
                        // User stops typing after 2 seconds of inactivity
                        this.typingTimer = window.setTimeout(() => {
                            this.isUserTyping = false;
                        }, 2000);
                    };
                    
                    component.inputEl.addEventListener('input', startTyping);
                    component.inputEl.addEventListener('focus', startTyping);
                    
                    // Handle keyboard events including Enter key for dismissal
                    component.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        startTyping(); // Still track typing for auto-refresh prevention
                        
                        // Allow Enter key to dismiss keyboard on mobile
                        if (e.key === 'Enter' && PlatformUtils.isMobile()) {
                            this.markSearchInputDismissal();
                            component.inputEl.blur(); // Dismiss keyboard
                            e.preventDefault(); // Prevent any default form submission
                        }
                    });
                    
                    component.inputEl.addEventListener('blur', () => {
                        // User stopped typing when they leave the input
                        this.isUserTyping = false;
                        if (this.typingTimer) {
                            clearTimeout(this.typingTimer);
                            this.typingTimer = null;
                        }
                    });
                    
                    // Additional mobile-specific event handling
                    component.inputEl.addEventListener('focus', () => {
                        // Reset dismissal flag when user focuses again
                        component.inputEl.removeAttribute('data-user-dismissed');
                        
                        // Ensure the input stays focused on mobile
                        if (PlatformUtils.isMobile()) {
                            // Prevent the input from losing focus due to layout changes
                            component.inputEl.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center',
                                inline: 'nearest'
                            });
                        }
                    });
                    
                    // Improved blur handling - only restore focus if NOT user-initiated
                    component.inputEl.addEventListener('blur', (e) => {
                        const userDismissed = component.inputEl.hasAttribute('data-user-dismissed');
                        
                        if (PlatformUtils.isMobile() && 
                            !userDismissed && // Respect user's dismissal intent
                            document.activeElement !== component.inputEl) {
                            
                            // Small delay before attempting to restore focus
                            setTimeout(() => {
                                const stillUserDismissed = component.inputEl.hasAttribute('data-user-dismissed');
                                if (this.currentSearchInput === component.inputEl && 
                                    !stillUserDismissed && // Double-check dismissal flag
                                    document.activeElement !== component.inputEl &&
                                    component.inputEl.isConnected) {
                                    try {
                                        component.inputEl.focus();
                                    } catch (error) {
                                        // Ignore focus errors
                                    }
                                }
                            }, 10);
                        }
                    });
                }
                
                return component;
            });
        headerSetting
            .addButton(button => {
                button
                    .setButtonText(addButtonText)
                    .setCta()
                    .onClick(() => {
                        // Re-evaluate on click in case state changed
                        if (entityType) {
                            try { this.plugin.getEntityFolder(entityType); }
                            catch { new Notice('Select or create a story first.'); return; }
                        }
                        addFn();
                    });
                if (!canCreate) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });

        if (extendButtons) {
            extendButtons(headerSetting);
        }
    }

    // --- List/Grid Rendering Helpers (Adapted from Modals) ---

    /** Render the Reference tab content */
    async renderReferencesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'References', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderReferencesList(container);
        }, () => {
            import('../modals/ReferenceModal').then(({ ReferenceModal }) => {
                new ReferenceModal(this.app, this.plugin, null, async (ref) => {
                    await this.plugin.saveReference(ref);
                    new Notice(`Reference "${ref.name}" created.`);
                }).open();
            });
        }, 'Create new');

        await this.renderReferencesList(container);
    }

    /** Render just the references list (without header controls) */
    private async renderReferencesList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const references = (await this.plugin.listReferences()).filter(ref =>
            ref.name.toLowerCase().includes(this.currentFilter) ||
            (ref.category || '').toLowerCase().includes(this.currentFilter) ||
            (ref.content || '').toLowerCase().includes(this.currentFilter) ||
            (ref.tags || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (references.length === 0) {
            const emptyMsg = listContainer.createEl('p', { text: 'No references found.' + (this.currentFilter ? ' Matching filter.' : '') });
            emptyMsg.addClass('storyteller-empty-state');
            return;
        }

        references.forEach(ref => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (ref.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    imgEl.src = this.getImageSrc(ref.profileImagePath);
                    imgEl.alt = ref.name;
                } catch (e) {
                    pfpContainer.createSpan({ text: '?' });
                }
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: ref.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const titleEl = infoEl.createEl('strong', { text: ref.name });
            if (ref.category) {
                infoEl.createEl('span', { text: ` (${ref.category})`, cls: 'storyteller-list-item-status' });
            }
            if (ref.content) {
                const preview = ref.content.length > 120 ? ref.content.substring(0, 120) + '…' : ref.content;
                infoEl.createEl('p', { text: preview });
            }
            if (ref.tags && ref.tags.length > 0) {
                const tagsRow = infoEl.createDiv('storyteller-list-item-extra');
                tagsRow.createSpan({ text: ref.tags.map(t => `#${t}`).join(' ') });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/ReferenceModal').then(({ ReferenceModal }) => {
                    new ReferenceModal(this.app, this.plugin, ref, async (updated) => {
                        await this.plugin.saveReference(updated);
                        new Notice(`Reference "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteReference(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (ref.filePath && confirm(`Delete reference "${ref.name}"?`)) {
                    await this.plugin.deleteReference(ref.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, ref.filePath);
        });
    }

    /** Render the Chapters tab content */
    async renderChaptersContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Chapters', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderChaptersList(container);
        }, () => {
            import('../modals/ChapterModal').then(({ ChapterModal }) => {
                new ChapterModal(this.app, this.plugin, null, async (ch) => {
                    await this.plugin.saveChapter(ch);
                    new Notice(`Chapter "${ch.name}" created.`);
                }).open();
            });
        }, 'Create new');

        await this.renderChaptersList(container);
    }

    /** Render just the chapters list (without header controls) */
    private async renderChaptersList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const chapters = (await this.plugin.listChapters()).filter(ch =>
            ch.name.toLowerCase().includes(this.currentFilter) ||
            ('' + (ch.number ?? '')).toLowerCase().includes(this.currentFilter) ||
            (ch.summary || '').toLowerCase().includes(this.currentFilter) ||
            (ch.tags || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (chapters.length === 0) {
            listContainer.createEl('p', { text: 'No chapters found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }

        chapters.forEach(ch => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (ch.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    imgEl.src = this.getImageSrc(ch.profileImagePath);
                    imgEl.alt = ch.name;
                } catch (e) {
                    pfpContainer.createSpan({ text: '?' });
                }
            } else {
                const badge = pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: (ch.number ?? '?').toString() });
                badge.title = 'Chapter number';
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const title = ch.number != null ? `${ch.number}. ${ch.name}` : ch.name;
            infoEl.createEl('strong', { text: title });
            if (ch.summary) {
                const preview = ch.summary.length > 120 ? ch.summary.substring(0, 120) + '…' : ch.summary;
                infoEl.createEl('p', { text: preview });
            }
            if (ch.tags && ch.tags.length > 0) {
                const tagsRow = infoEl.createDiv('storyteller-list-item-extra');
                tagsRow.createSpan({ text: ch.tags.map(t => `#${t}`).join(' ') });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, ch, async (updated) => {
                        await this.plugin.saveChapter(updated);
                        new Notice(`Chapter "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteChapter(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (ch.filePath && confirm(`Delete chapter "${ch.name}"?`)) {
                    await this.plugin.deleteChapter(ch.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, ch.filePath);
        });
    }

    /** Render the Scenes tab content */
    async renderScenesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Scenes', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderScenesList(container);
        }, () => {
            import('../modals/SceneModal').then(({ SceneModal }) => {
                new SceneModal(this.app, this.plugin, null, async (sc) => {
                    await this.plugin.saveScene(sc);
                    new Notice(`Scene "${sc.name}" created.`);
                }).open();
            });
        }, 'Create new');

        await this.renderScenesList(container);
    }

    /** Render just the scenes list */
    private async renderScenesList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const scenes = (await this.plugin.listScenes()).filter(sc =>
            sc.name.toLowerCase().includes(this.currentFilter) ||
            (sc.content || '').toLowerCase().includes(this.currentFilter) ||
            (sc.status || '').toLowerCase().includes(this.currentFilter) ||
            (sc.chapterName || '').toLowerCase().includes(this.currentFilter) ||
            (sc.tags || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        // Preload chapters once for inline assignment controls
        const chapters = await this.plugin.listChapters();

        const listContainer = container.createDiv('storyteller-list-container');
        if (scenes.length === 0) {
            listContainer.createEl('p', { text: 'No scenes found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }

        scenes.forEach(sc => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (sc.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    imgEl.src = this.getImageSrc(sc.profileImagePath);
                    imgEl.alt = sc.name;
                } catch (e) {
                    pfpContainer.createSpan({ text: '?' });
                }
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: sc.name.substring(0,1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const titleEl = infoEl.createEl('strong', { text: sc.name });
            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (sc.chapterName) meta.createSpan({ text: `Chapter: ${sc.chapterName}` }); else meta.createSpan({ text: 'Unassigned' });
            if (sc.status) meta.createSpan({ text: ` • ${sc.status}` });
            if (sc.content) {
                const preview = sc.content.length > 120 ? sc.content.substring(0, 120) + '…' : sc.content;
                infoEl.createEl('p', { text: preview });
            }
            if (sc.tags && sc.tags.length > 0) {
                const tagsRow = infoEl.createDiv('storyteller-list-item-extra');
                tagsRow.createSpan({ text: sc.tags.map(t => `#${t}`).join(' ') });
            }

            // Go to chapter button (replaces dropdown)
            const chapterForScene = sc.chapterId
                ? chapters.find(c => c.id === sc.chapterId)
                : (sc.chapterName ? chapters.find(c => c.name === sc.chapterName) : undefined);
            if (chapterForScene) {
                const goBtn = new ButtonComponent(itemEl.createDiv('storyteller-scene-go-chapter'))
                    .setIcon('arrow-right')
                    .setTooltip('Go to chapter')
                    .onClick(() => {
                        if (chapterForScene.filePath) {
                            const file = this.app.vault.getAbstractFileByPath(chapterForScene.filePath);
                            if (file instanceof TFile) {
                                this.app.workspace.getLeaf(false).openFile(file);
                                return;
                            }
                        }
                        // Fallback: switch to Chapters tab
                        const header = this.tabHeaderContainer?.querySelector('[data-tab-id="chapters"]') as HTMLElement;
                        header?.click();
                    });
                goBtn.buttonEl.classList.add('mod-cta');
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/SceneModal').then(({ SceneModal }) => {
                    new SceneModal(this.app, this.plugin, sc, async (updated) => {
                        await this.plugin.saveScene(updated);
                        new Notice(`Scene "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteScene(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (sc.filePath && confirm(`Delete scene "${sc.name}"?`)) {
                    await this.plugin.deleteScene(sc.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, sc.filePath);
        });
    }

    renderCharacterList(characters: Character[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        characters.forEach(character => {
            const itemEl = listContainer.createDiv('storyteller-list-item storyteller-character-item'); // Add specific class

            // --- Profile Picture ---
            const imgContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (character.profileImagePath) {
                const imgEl = imgContainer.createEl('img');
                try {
                    imgEl.src = this.getImageSrc(character.profileImagePath);
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
                    imgEl.src = this.getImageSrc(location.profileImagePath);
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
                    imgEl.src = this.getImageSrc(event.profileImagePath);
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
                        thumb.src = this.getImageSrc(imagePath);
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

    renderGalleryGrid(images: GalleryImage[], gridContainer: HTMLElement, refreshCallback: () => Promise<void>) {
        // Apply grid styling class to the container (ensure CSS exists for this class)
        gridContainer.addClass('storyteller-gallery-grid'); // Added this line

        images.forEach(image => {
            // --- Item Wrapper ---
            const imgWrapper = gridContainer.createDiv('storyteller-gallery-item');
            imgWrapper.setAttribute('role', 'button'); // Make it behave like a button for accessibility
            imgWrapper.setAttribute('tabindex', '0'); // Make it focusable

            // --- Image Element ---
            const imgEl = imgWrapper.createEl('img', { cls: 'storyteller-gallery-item-image' }); // Add class for styling
            imgEl.src = this.getImageSrc(image.filePath);
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
        
        // Clean up typing timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
        
        // Clean up dismissal timer
        if (this.dismissalTimer) {
            clearTimeout(this.dismissalTimer);
            this.dismissalTimer = null;
        }
        
        // Reset typing state
        this.isUserTyping = false;
        this.currentSearchInput = null;
        
        // Event listeners are automatically cleaned up by registerEvent()
    }
}
