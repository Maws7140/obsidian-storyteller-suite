/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ItemView, WorkspaceLeaf, Setting, Notice, App, ButtonComponent, TFile, normalizePath, debounce } from 'obsidian'; // Added normalizePath, debounce
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
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

    /** Network graph renderer instance for persistence across refreshes */
    private networkGraphRenderer: any = null;

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
            { id: 'characters', label: t('characters'), renderFn: this.renderCharactersContent.bind(this) },
            { id: 'locations', label: t('locations'), renderFn: this.renderLocationsContent.bind(this) },
            { id: 'events', label: t('timeline'), renderFn: this.renderEventsContent.bind(this) },
            { id: 'items', label: t('items'), renderFn: this.renderItemsContent.bind(this) },
            { id: 'network', label: t('networkGraph'), renderFn: this.renderNetworkContent.bind(this) },
            { id: 'gallery', label: t('gallery'), renderFn: this.renderGalleryContent.bind(this) },
            { id: 'groups', label: t('groups'), renderFn: this.renderGroupsContent.bind(this) },
            { id: 'references', label: t('references'), renderFn: this.renderReferencesContent.bind(this) },
            { id: 'chapters', label: t('chapters'), renderFn: this.renderChaptersContent.bind(this) },
            { id: 'scenes', label: t('scenes'), renderFn: this.renderScenesContent.bind(this) },
            { id: 'cultures', label: 'Cultures', renderFn: this.renderCulturesContent.bind(this) },
            { id: 'economies', label: 'Economies', renderFn: this.renderEconomiesContent.bind(this) },
            { id: 'magicsystems', label: 'Magic Systems', renderFn: this.renderMagicSystemsContent.bind(this) },
            { id: 'templates', label: 'Templates', renderFn: this.renderTemplatesContent.bind(this) },
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
        return t('dashboardTitle');
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
        // First, ensure the main containerEl can expand properly for our content
        this.containerEl.style.height = '100%';
        this.containerEl.style.overflow = 'visible';
        this.containerEl.style.display = 'flex';
        this.containerEl.style.flexDirection = 'column';
        
        const container = this.containerEl.children[1]; // View content container
        container.empty();
        container.addClass('storyteller-dashboard-view-container'); // Add a class for styling
        // Ensure container fills the pane and provides a fixed height for inner layout
        (container as HTMLElement).style.display = 'flex';
        (container as HTMLElement).style.flexDirection = 'column';
        (container as HTMLElement).style.height = '100%';
        (container as HTMLElement).style.overflow = 'visible'; // Changed from hidden to visible
        (container as HTMLElement).style.minHeight = '0';
        // Create isolated stacking context for proper z-index layering
        (container as HTMLElement).style.isolation = 'isolate';
        (container as HTMLElement).style.position = 'relative';

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
        // Use Obsidian's official z-index layer system
        headerContainer.style.zIndex = 'var(--layer-status-bar, 15)';
        headerContainer.style.background = getComputedStyle(document.body).getPropertyValue('--background-primary') || 'var(--background-primary)';
        headerContainer.style.flexShrink = '0'; // Prevent header from shrinking

        // --- Header Top Row (title + selector/button) ---
        const headerTopRow = headerContainer.createDiv('storyteller-dashboard-header-top');

        // --- Title (inside the header top row) ---
        const titleEl = headerTopRow.createEl('h2', {
            cls: 'storyteller-dashboard-title'
        });

        titleEl.append(t('dashboardTitle'));

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
        // If one-story mode is enabled but there is still no story, prompt initialization
        if (this.plugin.settings.enableOneStoryMode && this.plugin.settings.stories.length === 0) {
            // Fire and forget; will refresh active tab once folders are ensured
            this.plugin.initializeOneStoryModeIfNeeded().then(() => this.onOpen());
        }
        storySelector.onchange = async (e) => {
            const id = (e.target as HTMLSelectElement).value;
            await this.plugin.setActiveStory(id);
            this.onOpen();
        };

        if (!this.plugin.settings.enableOneStoryMode) {
            const newStoryBtn = selectorButtonGroup.createEl('button', { text: t('newStory'), cls: 'storyteller-new-story-btn' });
            newStoryBtn.onclick = () => {
                new NewStoryModal(
                    this.app,
                    this.plugin,
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
        // Place tabs as their own row below the header
        this.tabHeaderContainer = container.createDiv('storyteller-dashboard-tabs');
        this.tabHeaderContainer.setAttr('role', 'tablist');
        // Use Obsidian's official z-index layer system - just below header
        this.tabHeaderContainer.style.zIndex = 'calc(var(--layer-status-bar, 15) - 1)';
        this.tabHeaderContainer.style.display = 'flex';
        this.tabHeaderContainer.style.alignItems = 'center';
        this.tabHeaderContainer.style.gap = '0.25rem';
        this.tabHeaderContainer.style.width = '100%';
        this.tabHeaderContainer.style.flexShrink = '0'; // Prevent tabs from shrinking

        // Ribbon row (visible tabs)
        this.tabHeaderRibbonEl = this.tabHeaderContainer.createDiv('storyteller-tab-ribbon');
        this.tabHeaderRibbonEl.style.display = 'flex';
        this.tabHeaderRibbonEl.style.gap = '0.5rem';
        this.tabHeaderRibbonEl.style.alignItems = 'center';
        this.tabHeaderRibbonEl.style.whiteSpace = 'normal';
        this.tabHeaderRibbonEl.style.justifyContent = 'center';
        (this.tabHeaderRibbonEl.style as any).alignContent = 'center';
        (this.tabHeaderRibbonEl.style as any).flex = '1 1 auto';
        this.tabHeaderRibbonEl.style.width = '100%';

        // Measurement/More removed; tabs will wrap freely

        // Responsive layout via ResizeObserver
        this.tabsResizeObserver = new ResizeObserver(() => {
            this.layoutTabs();
            // Use requestAnimationFrame to ensure layout is complete before measuring
            requestAnimationFrame(() => {
                this.updateStickyOffsets(headerContainer);
            });
        });
        this.tabsResizeObserver.observe(this.tabHeaderContainer);

        // Initial layout and sticky offset
        this.layoutTabs();
        // Use requestAnimationFrame to ensure initial layout is complete
        requestAnimationFrame(() => {
            this.updateStickyOffsets(headerContainer);
        });

        // --- Tab Content ---
        this.tabContentContainer = container.createDiv('storyteller-dashboard-content');
        // Content area is the sole vertical scroller under header+tabs
        this.tabContentContainer.style.flex = '1 1 auto';
        this.tabContentContainer.style.minHeight = '0';
        this.tabContentContainer.style.overflowY = 'auto';
        this.tabContentContainer.style.overflowX = 'hidden';
        this.tabContentContainer.style.height = 'auto'; // Allow content to expand

        // Initial active state - use first visible tab if current tab is hidden
        const visibleTabs = this.getVisibleTabs();
        const initialTabId = visibleTabs.find(t => t.id === this.activeTabId)?.id || visibleTabs[0]?.id || this.tabs[0].id;
        this.setActiveTab(initialTabId);

        // --- Register Vault Event Listeners for Auto-refresh ---
        this.registerVaultEventListeners();

        // --- Register Workspace Resize Event Listener ---
        this.registerEvent(this.app.workspace.on('resize', () => {
            this.debouncedRefreshActiveTab();
            // Relayout tabs and update offsets on window resize
            this.layoutTabs();
            requestAnimationFrame(() => {
                this.updateStickyOffsets(headerContainer);
            });
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

    /** Update layout to ensure proper spacing (no longer needed for sticky positioning) */
    private updateStickyOffsets(headerEl: HTMLElement): void {
        // This function is now primarily for maintaining compatibility
        // Since we switched to relative positioning, no offset calculation is needed
        try {
            if (!this.tabHeaderContainer || !headerEl) return;
            // Force a layout recalculation to ensure proper rendering
            this.tabHeaderContainer.style.display = 'flex';
        } catch (e) {
            console.warn('Storyteller: failed to update layout', e);
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

    /**
     * Get visible tabs (excluding hidden tabs based on user settings)
     */
    private getVisibleTabs() {
        const hiddenTabs = this.plugin.settings.hiddenDashboardTabs || [];
        return this.tabs.filter(tab => !hiddenTabs.includes(tab.id));
    }

    /** Render or re-render tabs according to available width (priority+ ribbon) */
    private layoutTabs(): void {
        if (!this.tabHeaderContainer || !this.tabHeaderRibbonEl) return;

        // Prepare container: allow wrapping/growing rows
        this.tabHeaderRibbonEl.style.flexWrap = 'wrap';
        (this.tabHeaderRibbonEl.style as any).rowGap = '6px';

        // Reset
        this.tabHeaderRibbonEl.empty();

        const mode = this.getTabDisplayMode();
        const btnMode: 'compact' | 'normal' = (mode === 'normal') ? 'normal' : 'compact';

        // Tiny: still render tabs; they'll wrap to multiple lines
        // Compact mode reduces padding via mode pass-through

        // Render visible tabs only and allow natural wrapping to any number of rows
        const visibleTabs = this.getVisibleTabs();
        for (const tab of visibleTabs) {
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
        this.renderHeaderControls(container, t('characters'), async (filter: string) => {
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
            const emptyMsg = listContainer.createEl('p', { text: t('noCharactersFound'), cls: 'storyteller-empty-state' });
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
        this.renderHeaderControls(container, t('locations'), async (filter: string) => {
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
            listContainer.createEl('p', { text: t('noLocationsFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
        this.renderHeaderControls(container, t('events'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderEventsList(container);
        }, () => {
            new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                await this.plugin.saveEvent(eventData);
                new Notice(`Event "${eventData.name}" created.`);
            }).open();
        }, t('createNew'), (setting: Setting) => {
            setting.addButton(button => button
                .setButtonText(t('viewTimeline'))
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
            listContainer.createEl('p', { text: t('noEventsFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
            .setName(t('filterItems'))
            .addText(text => text
                .setPlaceholder(t('searchX', 'items'))
                .onChange(async (value) => {
                    this.currentFilter = value.toLowerCase();
                    await this.renderItemsList(container, showPlotCriticalOnly);
                }));

        // "Plot Critical Only" Toggle Button
        new Setting(controlsGroup)
            .setName(t('plotCritical'))
            .setDesc(t('filterX', 'bookmarked'))
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
                    .setButtonText(t('createNew'))
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
            listContainer.createEl('p', { text: t('noItemsFound') });
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
     * Render the Network Graph tab content
     * Shows interactive graph visualization of entity relationships
     * @param container The container element to render content into
     */
    async renderNetworkContent(container: HTMLElement) {
        // Import NetworkGraphRenderer dynamically
        const { NetworkGraphRenderer } = await import('./NetworkGraphRenderer');
        
        // If graph already exists and is initialized, just refresh the data
        if (this.networkGraphRenderer && this.networkGraphRenderer.cy) {
            try {
                await this.networkGraphRenderer.refresh();
                return;
            } catch (error) {
                console.error('Error refreshing network graph, recreating:', error);
                // If refresh fails, destroy and recreate
                this.networkGraphRenderer.destroy();
                this.networkGraphRenderer = null;
            }
        }
        
        // Clear container only when creating new graph
        container.empty();
        
        // Create controls container (search, zoom, layout)
        const controlsContainer = container.createDiv('storyteller-network-controls');
        controlsContainer.style.marginBottom = '1rem';
        controlsContainer.style.padding = '1rem';
        controlsContainer.style.backgroundColor = 'var(--background-secondary)';
        controlsContainer.style.borderRadius = '8px';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '1rem';
        controlsContainer.style.flexWrap = 'wrap';
        controlsContainer.style.alignItems = 'center';

        // Use class property for graph renderer persistence
        let graphRenderer = this.networkGraphRenderer;

        // Search box
        const searchContainer = controlsContainer.createDiv();
        searchContainer.style.flex = '1 1 300px';
        searchContainer.style.minWidth = '200px';
        
        const searchInput = searchContainer.createEl('input', { 
            type: 'text',
            placeholder: t('searchEntities')
        });
        searchInput.style.width = '100%';
        searchInput.style.padding = '6px 12px';
        searchInput.style.border = '1px solid var(--background-modifier-border)';
        searchInput.style.borderRadius = '4px';
        searchInput.style.backgroundColor = 'var(--background-primary)';
        searchInput.style.color = 'var(--text-normal)';
        
        searchInput.addEventListener('input', () => {
            if (graphRenderer) {
                if (searchInput.value) {
                    graphRenderer.searchAndHighlight(searchInput.value);
                } else {
                    graphRenderer.clearSearch();
                }
            }
        });

        // Zoom controls
        const zoomContainer = controlsContainer.createDiv();
        zoomContainer.style.display = 'flex';
        zoomContainer.style.gap = '0.5rem';
        
        const createControlButton = (text: string, title: string, onClick: () => void) => {
            const btn = zoomContainer.createEl('button', { text });
            btn.title = title;
            btn.style.padding = '6px 12px';
            btn.style.border = '1px solid var(--background-modifier-border)';
            btn.style.borderRadius = '4px';
            btn.style.backgroundColor = 'var(--background-primary)';
            btn.style.color = 'var(--text-normal)';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '14px';
            btn.style.fontWeight = '600';
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'var(--background-primary)';
            });
            return btn;
        };

        createControlButton('+', t('zoomIn'), () => graphRenderer?.zoomIn());
        createControlButton('−', t('zoomOut'), () => graphRenderer?.zoomOut());
        createControlButton('⊡', t('fitToView'), () => graphRenderer?.fitToView());

        // Layout selector
        const layoutContainer = controlsContainer.createDiv();
        layoutContainer.style.display = 'flex';
        layoutContainer.style.alignItems = 'center';
        layoutContainer.style.gap = '0.5rem';
        
        const layoutLabel = layoutContainer.createSpan({ text: t('layout') + ':' });
        layoutLabel.style.fontSize = '13px';
        layoutLabel.style.color = 'var(--text-muted)';
        
        const layoutSelect = layoutContainer.createEl('select');
        layoutSelect.style.padding = '6px 12px';
        layoutSelect.style.border = '1px solid var(--background-modifier-border)';
        layoutSelect.style.borderRadius = '4px';
        layoutSelect.style.backgroundColor = 'var(--background-primary)';
        layoutSelect.style.color = 'var(--text-normal)';
        layoutSelect.style.cursor = 'pointer';
        
        const layouts = [
            { value: 'cose', label: t('forceDirected') },
            { value: 'circle', label: t('circle') },
            { value: 'grid', label: t('grid') },
            { value: 'concentric', label: t('concentric') }
        ];
        
        layouts.forEach(layout => {
            const option = layoutSelect.createEl('option', { 
                text: layout.label,
                value: layout.value
            });
        });
        
        layoutSelect.addEventListener('change', () => {
            if (graphRenderer) {
                graphRenderer.changeLayout(layoutSelect.value as any);
            }
        });
        
        // Expand buttons - Open in Panel and Modal
        const expandContainer = controlsContainer.createDiv();
        expandContainer.style.display = 'flex';
        expandContainer.style.gap = '0.5rem';
        expandContainer.style.marginLeft = 'auto';
        
        const createExpandButton = (text: string, title: string, onClick: () => void) => {
            const btn = expandContainer.createEl('button', { text });
            btn.title = title;
            btn.style.padding = '6px 12px';
            btn.style.border = '1px solid var(--background-modifier-border)';
            btn.style.borderRadius = '4px';
            btn.style.backgroundColor = 'var(--interactive-accent)';
            btn.style.color = 'var(--text-on-accent)';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '13px';
            btn.style.fontWeight = '500';
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--interactive-accent-hover)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'var(--interactive-accent)';
            });
            return btn;
        };

        createExpandButton(t('openInPanel'), t('openInPanel'), async () => {
            await this.openNetworkGraphInPanel();
        });
        
        createExpandButton(t('openInModal'), t('openInModal'), async () => {
            await this.openNetworkGraphInModal();
        });
        
        // Create filters container
        const filtersContainer = container.createDiv('storyteller-network-filters');
        filtersContainer.style.marginBottom = '1rem';
        filtersContainer.style.padding = '1rem';
        filtersContainer.style.backgroundColor = 'var(--background-secondary)';
        filtersContainer.style.borderRadius = '8px';

        // Filter state
        let currentFilters: any = {
            groups: [],
            timelineStart: undefined,
            timelineEnd: undefined,
            entityTypes: ['character', 'location', 'event', 'item']
        };

        // Group filter
        const groups = this.plugin.getGroups();
        if (groups.length > 0) {
            new Setting(filtersContainer)
                .setName(t('filterByGroup'))
                .setDesc(t('selectEntityTypes'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('all') || 'All');
                    groups.forEach(g => dropdown.addOption(g.id, g.name));
                    dropdown.onChange(async (value) => {
                        currentFilters.groups = value ? [value] : [];
                        if (graphRenderer) {
                            await graphRenderer.applyFilters(currentFilters);
                        }
                    });
                });
        }

        // Entity type checkboxes
        const entityTypeSetting = new Setting(filtersContainer)
            .setName(t('filterByEntityTypes'))
            .setDesc(t('selectEntityTypes'));

        const entityTypeContainer = entityTypeSetting.controlEl.createDiv('storyteller-entity-type-filters');
        entityTypeContainer.style.display = 'flex';
        entityTypeContainer.style.gap = '1rem';
        entityTypeContainer.style.flexWrap = 'wrap';

        const entityTypes = ['character', 'location', 'event', 'item'] as const;
        entityTypes.forEach(type => {
            const checkboxContainer = entityTypeContainer.createDiv();
            checkboxContainer.style.display = 'flex';
            checkboxContainer.style.alignItems = 'center';
            checkboxContainer.style.gap = '0.5rem';

            const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
            checkbox.checked = true;
            checkbox.id = `entity-type-${type}`;
            checkbox.onchange = async () => {
                if (checkbox.checked) {
                    if (!currentFilters.entityTypes.includes(type)) {
                        currentFilters.entityTypes.push(type);
                    }
                } else {
                    currentFilters.entityTypes = currentFilters.entityTypes.filter((t: string) => t !== type);
                }
                if (graphRenderer) {
                    await graphRenderer.applyFilters(currentFilters);
                }
            };

            const label = checkboxContainer.createEl('label', { text: t((type + 's') as any) });
            label.htmlFor = `entity-type-${type}`;
            label.style.cursor = 'pointer';
        });

        // Timeline filters
        const timelineFilterSetting = new Setting(filtersContainer)
            .setName(t('filterByTimeline'))
            .setDesc(t('timelineStart') + ' / ' + t('timelineEnd'));

        const timelineContainer = timelineFilterSetting.controlEl.createDiv();
        timelineContainer.style.display = 'flex';
        timelineContainer.style.gap = '0.5rem';
        timelineContainer.style.alignItems = 'center';

        const startInput = timelineContainer.createEl('input', { type: 'date' });
        startInput.onchange = async () => {
            currentFilters.timelineStart = startInput.value || undefined;
            if (graphRenderer) {
                await graphRenderer.applyFilters(currentFilters);
            }
        };

        timelineContainer.createSpan({ text: '—' });

        const endInput = timelineContainer.createEl('input', { type: 'date' });
        endInput.onchange = async () => {
            currentFilters.timelineEnd = endInput.value || undefined;
            if (graphRenderer) {
                await graphRenderer.applyFilters(currentFilters);
            }
        };

        // Export and reset buttons
        new Setting(filtersContainer)
            .addButton(button => button
                .setButtonText(t('resetFilters'))
                .onClick(async () => {
                    currentFilters = {
                        groups: [],
                        timelineStart: undefined,
                        timelineEnd: undefined,
                        entityTypes: ['character', 'location', 'event', 'item']
                    };
                    startInput.value = '';
                    endInput.value = '';
                    entityTypes.forEach(type => {
                        const checkbox = container.querySelector(`#entity-type-${type}`) as HTMLInputElement;
                        if (checkbox) checkbox.checked = true;
                    });
                    if (graphRenderer) {
                        await graphRenderer.applyFilters(currentFilters);
                    }
                }))
            .addButton(button => button
                .setButtonText(t('exportAsPNG'))
                .setCta()
                .onClick(async () => {
                    if (graphRenderer) {
                        await graphRenderer.exportAsImage('png');
                    }
                }));

        // Create graph container
        const graphContainer = container.createDiv('storyteller-network-graph-container');
        graphContainer.style.marginBottom = '1rem';

        // Initialize graph renderer (legend is now built-in to the renderer)
        try {
            graphRenderer = new NetworkGraphRenderer(graphContainer, this.plugin);
            await graphRenderer.initializeCytoscape();
            // Store renderer instance for future refreshes
            this.networkGraphRenderer = graphRenderer;
        } catch (error) {
            console.error('Error initializing network graph:', error);
            graphContainer.createEl('p', {
                text: 'Error loading network graph. See console for details.',
                cls: 'storyteller-empty-state'
            });
        }
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

        this.renderHeaderControls(container, t('gallery'), filterCallback, () => {
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
                        // Use the relative filePath, not createdFile.path which may be absolute on Windows
                        const newImageData = await this.plugin.addGalleryImage({ filePath: filePath, title: createdFile.basename });
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
        }, t('uploadImage'));

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
            gridContainer.createEl('p', { text: t('noImagesFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
        this.renderHeaderControls(container, t('groups'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderGroupsList(container);
        }, () => {
            if (!this.plugin.getActiveStory()) {
                new Notice('Select or create a story first.');
                return;
            }
            new GroupModal(
                this.app,
                this.plugin,
                null,
                async () => {
                    // Manual refresh removed - automatic vault event refresh will handle this
                },
                async (groupId) => {
                    await this.plugin.deleteGroup(groupId);
                }
            ).open();
        }, t('createNewGroup'));

        await this.renderGroupsList(container);
    }

    /**
     * Render just the groups list (without header controls)
     * Used by filter function to avoid infinite recursion
     */
    private async renderGroupsList(container: HTMLElement) {
        // Clear existing list container if it exists
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) {
            existingListContainer.remove();
        }

        const groups = this.plugin.getGroups().filter(group => {
            const filter = this.currentFilter.toLowerCase();
            return (
                group.name.toLowerCase().includes(filter) ||
                (group.description && group.description.toLowerCase().includes(filter))
            );
        });

        const listContainer = container.createDiv('storyteller-list-container');
        if (groups.length === 0) {
            const emptyMsg = listContainer.createEl('p', { text: t('noGroupsFound'), cls: 'storyteller-empty-state' });
            emptyMsg.style.color = 'var(--text-muted)';
            emptyMsg.style.fontStyle = 'italic';
            return;
        }
        const allCharacters = await this.plugin.listCharacters();
        const allLocations = await this.plugin.listLocations();
        const allEvents = await this.plugin.listEvents();
        const allItems = await this.plugin.listPlotItems();

        groups.forEach((group, idx) => {
            // Collapsible card state: expanded by default if filter is active, else collapsed
            const isExpanded = !!this.currentFilter || false;
            const groupCard = listContainer.createDiv('storyteller-group-card sts-card');
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
            const editBtn = actionsDiv.createEl('button', { text: t('edit'), cls: 'mod-cta storyteller-group-edit-btn' });
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
                membersSection.createEl('em', { text: t('noMembers') });
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
    private renderHeaderControls(container: HTMLElement, title: string, filterFn: (filter: string) => Promise<void>, addFn: () => void, addButtonText: string = t('createNew'), extendButtons?: (s: Setting) => void) {
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
            .setName(t('filterX', title.toLowerCase()))
            .setDesc('')
            .addText(text => {
                const component = text
                    .setPlaceholder(t('searchX', title.toLowerCase()))
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
        }, t('createNew'));

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
            const emptyMsg = listContainer.createEl('p', { text: t('noReferencesFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
        }, t('createNew'));

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
            listContainer.createEl('p', { text: t('noChaptersFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
        }, t('createNew'));

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
            listContainer.createEl('p', { text: t('noScenesFound' as any) || ('No scenes found.' + (this.currentFilter ? t('matchingFilter') : '')) });
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
            if (location.parentLocation) {
                if (location.locationType || location.region) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-parent', text: `within ${location.parentLocation}` });
            }
            if (location.status) {
                if (location.locationType || location.region || location.parentLocation) extraInfoEl.appendText(' • '); // Separator
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

    /**
     * Open network graph in a dedicated panel view
     */
    async openNetworkGraphInPanel(): Promise<void> {
        const { workspace } = this.app;
        
        // Import NetworkGraphView dynamically
        const { NetworkGraphView, VIEW_TYPE_NETWORK_GRAPH } = await import('./NetworkGraphView');
        
        // Check if a network graph view already exists
        const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_NETWORK_GRAPH);
        
        if (existingLeaves.length > 0) {
            // Reveal existing view
            workspace.revealLeaf(existingLeaves[0]);
            return;
        }
        
        // Create new leaf for network graph view
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_NETWORK_GRAPH,
                active: true
            });
            workspace.revealLeaf(leaf);
        }
    }
    
    /**
     * Open network graph in a modal overlay
     */
    async openNetworkGraphInModal(): Promise<void> {
        // Import NetworkGraphModal dynamically
        const { NetworkGraphModal } = await import('../modals/NetworkGraphModal');

        // Create and open the modal
        const modal = new NetworkGraphModal(this.app, this.plugin);
        modal.open();
    }

    // ========== Phase 2A: World-Building Entity Render Methods ==========

    async renderCulturesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Cultures', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCulturesList(container);
        }, () => {
            import('../modals/CultureModal').then(({ CultureModal }) => {
                new CultureModal(this.app, this.plugin, null, async (culture) => {
                    await this.plugin.saveCulture(culture);
                    new Notice(`Culture "${culture.name}" created.`);
                }).open();
            });
        }, t('createNew'));

        await this.renderCulturesList(container);
    }

    private async renderCulturesList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const cultures = (await this.plugin.listCultures()).filter(c =>
            c.name.toLowerCase().includes(this.currentFilter) ||
            (c.values || '').toLowerCase().includes(this.currentFilter) ||
            (c.religion || '').toLowerCase().includes(this.currentFilter) ||
            (c.governmentType || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (cultures.length === 0) {
            listContainer.createEl('p', { text: 'No cultures found' + (this.currentFilter ? ' matching filter' : '') });
            return;
        }

        cultures.forEach(culture => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (culture.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(culture.profileImagePath);
                imgEl.alt = culture.name;
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: culture.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: culture.name });

            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (culture.governmentType) meta.createSpan({ text: `Gov: ${culture.governmentType}` });
            if (culture.techLevel) meta.createSpan({ text: ` • Tech: ${culture.techLevel}` });

            if (culture.values) {
                const preview = culture.values.length > 120 ? culture.values.substring(0, 120) + '…' : culture.values;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/CultureModal').then(({ CultureModal }) => {
                    new CultureModal(this.app, this.plugin, culture, async (updated) => {
                        await this.plugin.saveCulture(updated);
                        new Notice(`Culture "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteCulture(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (culture.filePath && confirm(`Delete culture "${culture.name}"?`)) {
                    await this.plugin.deleteCulture(culture.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, culture.filePath);
        });
    }


    async renderEconomiesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Economies', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderEconomiesList(container);
        }, () => {
            import('../modals/EconomyModal').then(({ EconomyModal }) => {
                new EconomyModal(this.app, this.plugin, null, async (economy) => {
                    await this.plugin.saveEconomy(economy);
                    new Notice(`Economy "${economy.name}" created.`);
                }).open();
            });
        }, t('createNew'));

        await this.renderEconomiesList(container);
    }

    private async renderEconomiesList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const economies = (await this.plugin.listEconomies()).filter(e =>
            e.name.toLowerCase().includes(this.currentFilter) ||
            (e.industries || '').toLowerCase().includes(this.currentFilter) ||
            (e.taxation || '').toLowerCase().includes(this.currentFilter) ||
            (e.economicSystem || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (economies.length === 0) {
            listContainer.createEl('p', { text: 'No economies found' + (this.currentFilter ? ' matching filter' : '') });
            return;
        }

        economies.forEach(economy => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (economy.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(economy.profileImagePath);
                imgEl.alt = economy.name;
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: economy.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: economy.name });

            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (economy.economicSystem) meta.createSpan({ text: `System: ${economy.economicSystem}` });
            if (economy.currencies && economy.currencies.length > 0) {
                meta.createSpan({ text: ` • Currencies: ${economy.currencies.length}` });
            }

            if (economy.industries) {
                const preview = economy.industries.length > 120 ? economy.industries.substring(0, 120) + '…' : economy.industries;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/EconomyModal').then(({ EconomyModal }) => {
                    new EconomyModal(this.app, this.plugin, economy, async (updated) => {
                        await this.plugin.saveEconomy(updated);
                        new Notice(`Economy "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteEconomy(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (economy.filePath && confirm(`Delete economy "${economy.name}"?`)) {
                    await this.plugin.deleteEconomy(economy.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, economy.filePath);
        });
    }

    async renderMagicSystemsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Magic Systems', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderMagicSystemsList(container);
        }, () => {
            import('../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                new MagicSystemModal(this.app, this.plugin, null, async (magicSystem) => {
                    await this.plugin.saveMagicSystem(magicSystem);
                    new Notice(`Magic System "${magicSystem.name}" created.`);
                }).open();
            });
        }, t('createNew'));

        await this.renderMagicSystemsList(container);
    }

    private async renderMagicSystemsList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const magicSystems = (await this.plugin.listMagicSystems()).filter(m =>
            m.name.toLowerCase().includes(this.currentFilter) ||
            (m.rules || '').toLowerCase().includes(this.currentFilter) ||
            (m.source || '').toLowerCase().includes(this.currentFilter) ||
            (m.systemType || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (magicSystems.length === 0) {
            listContainer.createEl('p', { text: 'No magic systems found' + (this.currentFilter ? ' matching filter' : '') });
            return;
        }

        magicSystems.forEach(magicSystem => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (magicSystem.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(magicSystem.profileImagePath);
                imgEl.alt = magicSystem.name;
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: magicSystem.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: magicSystem.name });

            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (magicSystem.systemType) meta.createSpan({ text: `Type: ${magicSystem.systemType}` });
            if (magicSystem.rarity) meta.createSpan({ text: ` • Rarity: ${magicSystem.rarity}` });

            if (magicSystem.rules) {
                const preview = magicSystem.rules.length > 120 ? magicSystem.rules.substring(0, 120) + '…' : magicSystem.rules;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                    new MagicSystemModal(this.app, this.plugin, magicSystem, async (updated) => {
                        await this.plugin.saveMagicSystem(updated);
                        new Notice(`Magic System "${updated.name}" updated.`);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteMagicSystem(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (magicSystem.filePath && confirm(`Delete magic system "${magicSystem.name}"?`)) {
                    await this.plugin.deleteMagicSystem(magicSystem.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, magicSystem.filePath);
        });
    }

    /**
     * Render the Templates tab content
     * Shows template library with filtering and management
     * @param container The container element to render content into
     */
    async renderTemplatesContent(container: HTMLElement) {
        container.empty();

        // Import the template library modal components
        const { TemplateLibraryModal } = await import('../modals/TemplateLibraryModal');

        // Create header
        const header = container.createDiv('storyteller-templates-header');
        header.createEl('h3', { text: 'Entity Templates' });
        header.createEl('p', {
            text: 'Browse and manage reusable templates for characters, locations, and other entities.',
            cls: 'storyteller-templates-description'
        });

        // Create action buttons
        const actionsContainer = container.createDiv('storyteller-templates-actions');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '0.5rem';
        actionsContainer.style.marginBottom = '1rem';

        const openLibraryBtn = actionsContainer.createEl('button', {
            text: 'Open Template Library',
            cls: 'mod-cta'
        });
        openLibraryBtn.addEventListener('click', () => {
            new TemplateLibraryModal(this.app, this.plugin).open();
        });

        const createTemplateBtn = actionsContainer.createEl('button', {
            text: 'Create New Template'
        });
        createTemplateBtn.addEventListener('click', () => {
            const { TemplateEditorModal } = require('../modals/TemplateEditorModal');
            new TemplateEditorModal(
                this.app,
                this.plugin,
                async (template) => {
                    new Notice(`Template "${template.name}" created!`);
                    await this.renderTemplatesQuickView(container);
                }
            ).open();
        });

        // Render quick view of templates
        await this.renderTemplatesQuickView(container);
    }

    /**
     * Render a quick view of available templates
     */
    private async renderTemplatesQuickView(container: HTMLElement) {
        // Remove existing quick view if it exists
        const existingQuickView = container.querySelector('.storyteller-templates-quickview');
        if (existingQuickView) {
            existingQuickView.remove();
        }

        const quickViewContainer = container.createDiv('storyteller-templates-quickview');

        // Get templates from template manager
        const allTemplates = this.plugin.templateManager.getAllTemplates();

        if (allTemplates.length === 0) {
            quickViewContainer.createEl('p', {
                text: 'No templates available. Create your first template to get started!',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Show summary stats
        const statsContainer = quickViewContainer.createDiv('storyteller-templates-stats');
        statsContainer.style.marginBottom = '1rem';
        statsContainer.style.padding = '1rem';
        statsContainer.style.backgroundColor = 'var(--background-secondary)';
        statsContainer.style.borderRadius = '8px';

        const builtInCount = allTemplates.filter(t => t.isBuiltIn).length;
        const customCount = allTemplates.filter(t => !t.isBuiltIn).length;

        statsContainer.createEl('div', {
            text: `Total Templates: ${allTemplates.length}`,
            cls: 'storyteller-stat-item'
        });
        statsContainer.createEl('div', {
            text: `Built-in: ${builtInCount} | Custom: ${customCount}`,
            cls: 'storyteller-stat-item'
        });

        // Show recently used templates
        const recentTemplates = this.plugin.templateManager.getRecentlyUsedTemplates(5);
        if (recentTemplates.length > 0) {
            quickViewContainer.createEl('h4', { text: 'Recently Used' });
            const recentList = quickViewContainer.createDiv('storyteller-templates-recent-list');
            recentList.style.display = 'grid';
            recentList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            recentList.style.gap = '0.5rem';
            recentList.style.marginBottom = '1rem';

            recentTemplates.forEach(template => {
                this.renderTemplateCard(recentList, template);
            });
        }

        // Show most popular templates
        const popularTemplates = this.plugin.templateManager.getMostPopularTemplates(5);
        if (popularTemplates.length > 0 && popularTemplates.some(t => (t.usageCount || 0) > 0)) {
            quickViewContainer.createEl('h4', { text: 'Most Popular' });
            const popularList = quickViewContainer.createDiv('storyteller-templates-popular-list');
            popularList.style.display = 'grid';
            popularList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            popularList.style.gap = '0.5rem';

            popularTemplates.forEach(template => {
                this.renderTemplateCard(popularList, template);
            });
        }
    }

    /**
     * Render a template card in the quick view
     */
    private renderTemplateCard(container: HTMLElement, template: any) {
        const card = container.createDiv('storyteller-template-card');
        card.style.padding = '0.75rem';
        card.style.backgroundColor = 'var(--background-primary)';
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.borderRadius = '6px';
        card.style.cursor = 'pointer';
        card.style.transition = 'all 0.2s';

        card.addEventListener('mouseenter', () => {
            card.style.backgroundColor = 'var(--background-modifier-hover)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.backgroundColor = 'var(--background-primary)';
        });

        card.addEventListener('click', () => {
            const { TemplateLibraryModal } = require('../modals/TemplateLibraryModal');
            new TemplateLibraryModal(this.app, this.plugin).open();
        });

        const titleEl = card.createEl('div', {
            text: template.name,
            cls: 'storyteller-template-card-title'
        });
        titleEl.style.fontWeight = 'bold';
        titleEl.style.marginBottom = '0.25rem';

        const metaEl = card.createDiv('storyteller-template-card-meta');
        metaEl.style.fontSize = '0.85em';
        metaEl.style.color = 'var(--text-muted)';

        const categoryBadge = metaEl.createEl('span', { text: template.category });
        categoryBadge.style.marginRight = '0.5rem';

        if (template.usageCount && template.usageCount > 0) {
            metaEl.createEl('span', { text: `Used: ${template.usageCount}x` });
        }

        if (template.entityTypes && template.entityTypes.length > 0) {
            const typesEl = card.createDiv('storyteller-template-card-types');
            typesEl.style.marginTop = '0.5rem';
            typesEl.style.fontSize = '0.75em';
            typesEl.createEl('span', {
                text: template.entityTypes.slice(0, 2).join(', '),
                cls: 'storyteller-template-entity-types'
            });
        }
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

        // Clean up network graph renderer
        if (this.networkGraphRenderer) {
            this.networkGraphRenderer.destroy();
            this.networkGraphRenderer = null;
        }
        
        // Event listeners are automatically cleaned up by registerEvent()
    }
}
