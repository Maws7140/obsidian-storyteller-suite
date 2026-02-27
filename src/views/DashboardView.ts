/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ItemView, WorkspaceLeaf, Setting, Notice, App, ButtonComponent, TFile, normalizePath, debounce, Modal, setIcon } from 'obsidian'; // Added normalizePath, debounce
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
import { Character, Location, Event, Group, PlotItem, GalleryImage, StoryMap } from '../types'; // Import types
import { NewStoryModal } from '../modals/NewStoryModal';
import { GroupModal } from '../modals/GroupModal';
import { PlatformUtils } from '../utils/PlatformUtils';
import {
    Template,
    TemplateFilter,
    TemplateGenre,
    TemplateCategory
} from '../templates/TemplateTypes';
import { TemplateEditorModal } from '../modals/TemplateEditorModal';
import { EconomyDetailModal } from '../modals/EconomyDetailModal';

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

    /** Tab being dragged (ID), null when no drag is in progress */
    private _draggedTabId: string | null = null;

    /** Persist chapter expand/collapse state across re-renders (Writing tab) */
    private _chapterCollapseState = new Map<string, boolean>();

    /** Persist chapter-group expand/collapse state across re-renders (Scenes tab) */
    private _sceneGroupCollapseState = new Map<string, boolean>();

    /** Template library filter state */
    private templateFilter: TemplateFilter = {
        showBuiltIn: true,
        showCustom: true
    };

    /** Cached templates for the template library tab */
    private templatesCache: Template[] = [];

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
     * Helper method to resolve a location ID or name to its display name
     * @param locationValue The location value (could be an ID or name)
     * @param locations List of available locations to search
     * @returns The location display name, or the original value if not found
     */
    private resolveLocationName(locationValue: string, locations: Location[]): string {
        // First, try to find by ID
        const locationById = locations.find(loc => loc.id === locationValue);
        if (locationById) {
            return locationById.name;
        }
        // If not found by ID, try to find by name (in case it's already a name)
        const locationByName = locations.find(loc => loc.name === locationValue);
        if (locationByName) {
            return locationByName.name;
        }
        // Return original value if no match found
        return locationValue;
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
            { id: 'maps', label: 'Maps', renderFn: this.renderMapsContent.bind(this) },
            { id: 'network', label: t('networkGraph'), renderFn: this.renderNetworkContent.bind(this) },
            { id: 'gallery', label: t('gallery'), renderFn: this.renderGalleryContent.bind(this) },
            { id: 'groups', label: t('groups'), renderFn: this.renderGroupsContent.bind(this) },
            { id: 'references', label: t('references'), renderFn: this.renderReferencesContent.bind(this) },
            { id: 'writing', label: 'Writing', renderFn: this.renderWritingContent.bind(this) },
            { id: 'compile', label: t('compile'), renderFn: this.renderCompileContent.bind(this) },
            { id: 'cultures', label: t('cultures'), renderFn: this.renderCulturesContent.bind(this) },
            { id: 'economies', label: t('economies'), renderFn: this.renderEconomiesContent.bind(this) },
            { id: 'magicsystems', label: t('magicSystems'), renderFn: this.renderMagicSystemsContent.bind(this) },
            { id: 'compendium', label: 'Compendium', renderFn: this.renderCompendiumContent.bind(this) },
            { id: 'templates', label: t('templates'), renderFn: this.renderTemplatesContent.bind(this) },
            { id: 'analytics', label: 'Analytics', renderFn: this.renderAnalyticsContent.bind(this) },
        ];

        this.applyTabOrder();

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
        // Let the dedicated content area handle vertical scrolling.
        // On mobile this prevents the header+tabs from pushing content out of view.
        (container as HTMLElement).style.overflow = 'hidden';
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
        
        // Remove inline styles that force vertical stacking.
        // We will handle layout entirely in CSS (styles.css).


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

    /** Apply saved tab order from settings, appending any new tabs at the end. */
    private applyTabOrder(): void {
        const savedOrder = this.plugin.settings.dashboardTabOrder;
        if (!savedOrder || savedOrder.length === 0) return;
        const reordered: Array<{ id: string; label: string; renderFn: (container: HTMLElement) => Promise<void> }> = [];
        for (const id of savedOrder) {
            const tab = this.tabs.find(t => t.id === id);
            if (tab) reordered.push(tab);
        }
        // Any tabs not yet in saved order (newly added) go at the end
        for (const tab of this.tabs) {
            if (!reordered.some(r => r.id === tab.id)) reordered.push(tab);
        }
        this.tabs = reordered;
    }

    /** Persist the current tab order to plugin settings. */
    private async saveTabOrder(): Promise<void> {
        this.plugin.settings.dashboardTabOrder = this.tabs.map(t => t.id);
        await this.plugin.saveSettings();
    }

    /** Render or re-render tabs according to available width (priority+ ribbon) */
    private layoutTabs(): void {
        if (!this.tabHeaderContainer || !this.tabHeaderRibbonEl) return;

        const isMobile = PlatformUtils.isMobile();

        // Prepare container layout:
        // - Desktop: tabs can wrap to multiple rows.
        // - Mobile: force a single horizontal row that scrolls sideways so content stays reachable.
        if (isMobile) {
            this.tabHeaderRibbonEl.style.flexWrap = 'nowrap';
            this.tabHeaderRibbonEl.style.overflowX = 'auto';
            this.tabHeaderRibbonEl.style.overflowY = 'hidden';
            this.tabHeaderRibbonEl.style.justifyContent = 'flex-start';
            (this.tabHeaderRibbonEl.style as any).rowGap = '0px';

            this.tabHeaderContainer.style.overflowX = 'auto';
            this.tabHeaderContainer.style.overflowY = 'hidden';
        } else {
            this.tabHeaderRibbonEl.style.flexWrap = 'wrap';
            (this.tabHeaderRibbonEl.style as any).rowGap = '6px';
            this.tabHeaderRibbonEl.style.overflowX = 'visible';
            this.tabHeaderRibbonEl.style.overflowY = 'visible';

            this.tabHeaderContainer.style.overflowX = 'visible';
            this.tabHeaderContainer.style.overflowY = 'visible';
        }

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
            btn.setAttribute('draggable', 'true');
            btn.style.cursor = 'grab';

            btn.addEventListener('dragstart', (e: DragEvent) => {
                this._draggedTabId = tab.id;
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tab.id);
                }
                btn.style.opacity = '0.45';
            });

            btn.addEventListener('dragend', () => {
                this._draggedTabId = null;
                btn.style.opacity = '';
                this.tabHeaderRibbonEl?.querySelectorAll('.storyteller-tab-drag-over').forEach(el => {
                    el.classList.remove('storyteller-tab-drag-over');
                });
            });

            btn.addEventListener('dragover', (e: DragEvent) => {
                if (!this._draggedTabId || this._draggedTabId === tab.id) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                btn.classList.add('storyteller-tab-drag-over');
            });

            btn.addEventListener('dragleave', () => {
                btn.classList.remove('storyteller-tab-drag-over');
            });

            btn.addEventListener('drop', (e: DragEvent) => {
                e.preventDefault();
                btn.classList.remove('storyteller-tab-drag-over');
                const fromId = this._draggedTabId;
                if (!fromId || fromId === tab.id) return;

                const fromIdx = this.tabs.findIndex(t => t.id === fromId);
                const toIdx = this.tabs.findIndex(t => t.id === tab.id);
                if (fromIdx === -1 || toIdx === -1) return;

                const [moved] = this.tabs.splice(fromIdx, 1);
                this.tabs.splice(toIdx, 0, moved);

                this.layoutTabs();
                void this.saveTabOrder();
            });

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
        }, t('createLocation'));

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
                .onClick(() => {
                    this.plugin.activateTimelineView();
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

        // Fetch locations to resolve location IDs to names
        const locations = await this.plugin.listLocations();

        const listContainer = container.createDiv('storyteller-list-container storyteller-timeline-container'); // Add timeline class if needed
        if (events.length === 0) {
            listContainer.createEl('p', { text: t('noEventsFound') + (this.currentFilter ? t('matchingFilter') : '') });
            return;
        }
        this.renderEventList(events, listContainer, container, locations);
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
        // Load locations for name resolution
        const locations = await this.plugin.listLocations();

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
                // Resolve location ID to display name
                const locationName = this.resolveLocationName(item.currentLocation, locations);
                extraInfoEl.createSpan({ text: `Location: ${locationName}` });
            }
            if (item.economicValue) {
                if (item.currentOwner || item.currentLocation) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-item-value-badge', text: item.economicValue });
            }
            const tagCount = (item.magicSystems?.length ?? 0) + (item.linkedCultures?.length ?? 0);
            if (tagCount > 0) {
                const parts: string[] = [];
                if (item.magicSystems?.length) parts.push(`${item.magicSystems.length} magic`);
                if (item.linkedCultures?.length) parts.push(`${item.linkedCultures.length} culture${item.linkedCultures.length > 1 ? 's' : ''}`);
                if (item.currentOwner || item.currentLocation || item.economicValue) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-item-tags', text: parts.join(' · ') });
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
     * Render the Maps tab content
     * Shows list of maps with create/edit functionality
     * @param container The container element to render content into
     */
    async renderMapsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Maps', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderMapsList(container);
        }, () => {
            if (!this.plugin.getActiveStory()) {
                new Notice(t('selectOrCreateStoryFirst'));
                return;
            }
            import('../utils/MapModalHelper').then(({ openMapModal }) => {
                openMapModal(this.app, this.plugin, null);
            });
        }, t('createNew'));

        await this.renderMapsList(container);
    }

    /**
     * Render just the maps list (without header controls)
     */
    private async renderMapsList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const maps = (await this.plugin.listMaps()).filter(m =>
            m.name.toLowerCase().includes(this.currentFilter) ||
            (m.description || '').toLowerCase().includes(this.currentFilter) ||
            (m.type || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (maps.length === 0) {
            listContainer.createEl('p', { text: 'No maps found.' + (this.currentFilter ? ' Try a different search.' : '') });
            return;
        }

        maps.forEach(map => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (map.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(map.profileImagePath);
                imgEl.alt = map.name;
            } else {
                const pfpPlaceholder = pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder' });
                setIcon(pfpPlaceholder, 'map');
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: map.name });

            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (map.type) meta.createSpan({ text: `Type: ${map.type}` });
            if (map.markers && map.markers.length > 0) {
                meta.createSpan({ text: ` • Markers: ${map.markers.length}` });
            }

            if (map.description) {
                const preview = map.description.length > 120 ? map.description.substring(0, 120) + '…' : map.description;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../utils/MapModalHelper').then(({ openMapModal }) => {
                    openMapModal(this.app, this.plugin, map, {
                        onDelete: async () => {
                            // Refresh the list after deletion
                            await this.renderMapsList(this.tabContentContainer);
                        }
                    });
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (map.filePath && confirm(`Delete map "${map.name}"?`)) {
                    await this.plugin.deleteMap(map.filePath);
                }
            });
            // Open in Map View button
            new ButtonComponent(actionsEl)
                .setButtonText('Open in View')
                .setIcon('map')
                .onClick(async () => {
                    const mapId = map.id || map.name;
                    await this.plugin.activateMapView(mapId);
                });
            this.addOpenFileButton(actionsEl, map.filePath);
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

        // Always clear and recreate - the container changes on each tab switch
        // The old approach of trying to refresh the existing renderer fails because
        // the container element is recreated by the tab system
        if (this.networkGraphRenderer) {
            this.networkGraphRenderer.destroy();
            this.networkGraphRenderer = null;
        }

        // Clear container before creating new graph
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
            .setDesc(t('timelineStart') + t('timelineRangeSeparator') + t('timelineEnd'));

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
            // Actions (Edit + Go to note)
            const actionsDiv = groupHeader.createDiv('storyteller-group-actions');
            const goToNoteBtn = actionsDiv.createEl('button', { cls: 'storyteller-group-note-btn' });
            setIcon(goToNoteBtn, 'file-text');
            goToNoteBtn.setAttribute('aria-label', 'Go to note');
            goToNoteBtn.title = 'Open group note';
            goToNoteBtn.onclick = async (e: MouseEvent) => {
                e.stopPropagation();
                const filePath = this.plugin.getGroupFilePath(group.name);
                if (!filePath) { new Notice('No active story.'); return; }
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    await this.app.workspace.openLinkText(filePath, '', false);
                } else {
                    new Notice('Group note not found — save the group to create it.');
                }
            };
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
            const typeIconNames: Record<string, string> = {
                character: 'user',
                location: 'map-pin',
                event: 'clock',
                item: 'box',
            };

            (['character', 'location', 'event', 'item'] as const).forEach(type => {
                if (grouped[type].length > 0) {
                    // Section container for grid layout
                    const section = membersSection.createDiv('storyteller-group-section');
                    // Section header
                    const header = section.createDiv('storyteller-group-entity-header');
                    header.setAttr('role', 'heading');
                    header.setAttr('aria-level', '4');
                    const headerIcon = header.createSpan('storyteller-group-entity-icon');
                    setIcon(headerIcon, typeIconNames[type]);
                    header.createSpan().setText(typeLabels[type]);
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
                            li.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const path = filePath as string;
                                this.app.workspace.openLinkText(path, '', false);
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

    /** Render the Chapters tab content - now shows scenes grouped under each chapter */
    /** Unified Writing tab — chapters with scenes nested, goal banner, dual add buttons */
    async renderWritingContent(container: HTMLElement) {
        container.empty();
        this.renderWritingGoalBanner(container);
        this.renderHeaderControls(
            container,
            'Writing',
            async (filter: string) => {
                this.currentFilter = filter;
                await this.renderChaptersWithScenesList(container);
            },
            () => {
                import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, null, async (ch) => {
                        await this.plugin.saveChapter(ch);
                        new Notice(`Chapter "${ch.name}" created.`);
                        await this.renderChaptersWithScenesList(container);
                    }).open();
                });
            },
            'Add Chapter',
            (s) => {
                s.addButton(btn => {
                    btn.setButtonText('Add Scene').onClick(() => {
                        import('../modals/SceneModal').then(({ SceneModal }) => {
                            new SceneModal(this.app, this.plugin, null, async (sc) => {
                                await this.plugin.saveScene(sc);
                                new Notice(`Scene "${sc.name}" created.`);
                                await this.renderChaptersWithScenesList(container);
                            }).open();
                        });
                    });
                });
            }
        );
        await this.renderChaptersWithScenesList(container);
    }

    async renderChaptersContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Chapters', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderChaptersWithScenesList(container);
        }, () => {
            import('../modals/ChapterModal').then(({ ChapterModal }) => {
                new ChapterModal(this.app, this.plugin, null, async (ch) => {
                    await this.plugin.saveChapter(ch);
                    new Notice(`Chapter "${ch.name}" created.`);
                }).open();
            });
        }, t('createNew'));

        await this.renderChaptersWithScenesList(container);
    }

    /** Render chapters with their scenes nested underneath */
    private async renderChaptersWithScenesList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const chapters = (await this.plugin.listChapters()).filter(ch =>
            ch.name.toLowerCase().includes(this.currentFilter) ||
            ('' + (ch.number ?? '')).toLowerCase().includes(this.currentFilter) ||
            (ch.summary || '').toLowerCase().includes(this.currentFilter) ||
            (ch.tags || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const allScenes = await this.plugin.listScenes();

        const listContainer = container.createDiv('storyteller-list-container');
        if (chapters.length === 0) {
            listContainer.createEl('p', { text: t('noChaptersFound') + (this.currentFilter ? t('matchingFilter') : '') });
            return;
        }

        // Sort chapters by number if available
        chapters.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

        chapters.forEach(ch => {
            // Chapter header item
            const chapterGroup = listContainer.createDiv('storyteller-chapter-group');
            const chapterHeader = chapterGroup.createDiv('storyteller-chapter-header');
            
            // Expand/collapse toggle
            const toggleBtn = chapterHeader.createDiv('storyteller-chapter-toggle');
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
            
            const pfpContainer = chapterHeader.createDiv('storyteller-list-item-pfp');
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

            const infoEl = chapterHeader.createDiv('storyteller-list-item-info');
            const title = ch.number != null ? `Chapter ${ch.number}: ${ch.name}` : ch.name;
            
            // Get scenes for this chapter
            const chapterScenes = allScenes.filter(sc => 
                sc.chapterId === ch.id || sc.chapterName === ch.name
            );
            
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            const chapterTitleEl = titleRow.createEl('strong', { text: title });
            if (ch.filePath) {
                chapterTitleEl.addClass('storyteller-chapter-name-link');
                chapterTitleEl.title = 'Click to open note';
                chapterTitleEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const file = this.app.vault.getAbstractFileByPath(ch.filePath!);
                    if (file instanceof TFile) this.app.workspace.openLinkText(ch.filePath!, '', false);
                });
            }
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${chapterScenes.length} scene${chapterScenes.length !== 1 ? 's' : ''}` });

            if (ch.summary) {
                const preview = ch.summary.length > 100 ? ch.summary.substring(0, 100) + '…' : ch.summary;
                infoEl.createEl('p', { text: preview, cls: 'storyteller-chapter-summary' });
            }

            const actionsEl = chapterHeader.createDiv('storyteller-list-item-actions');
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

            // Scenes container (nested under chapter)
            const scenesContainer = chapterGroup.createDiv('storyteller-chapter-scenes');
            
            if (chapterScenes.length === 0) {
                scenesContainer.createEl('p', { cls: 'storyteller-no-scenes', text: 'No scenes in this chapter' });
            } else {
                chapterScenes.forEach(sc => {
                    this.renderSceneItem(scenesContainer, sc, true);
                });
            }
            
            // Add scene button for this chapter
            const addSceneBtn = scenesContainer.createDiv('storyteller-add-scene-btn');
            const addSceneBtnIcon = addSceneBtn.createSpan();
            setIcon(addSceneBtnIcon, 'plus');
            addSceneBtn.createSpan({ text: ' Add scene to this chapter' });
            addSceneBtn.onclick = () => {
                import('../modals/SceneModal').then(({ SceneModal }) => {
                    const newScene = { chapterId: ch.id, chapterName: ch.name } as any;
                    new SceneModal(this.app, this.plugin, newScene, async (sc) => {
                        sc.chapterId = ch.id;
                        sc.chapterName = ch.name;
                        await this.plugin.saveScene(sc);
                        new Notice(`Scene "${sc.name}" created in chapter "${ch.name}".`);
                        await this.renderChaptersWithScenesList(container);
                    }).open();
                });
            };

            // Toggle expand/collapse — persist state across re-renders
            const chapterKey = ch.id || ch.name;
            let isExpanded = this._chapterCollapseState.has(chapterKey) ? this._chapterCollapseState.get(chapterKey)! : true;
            if (!isExpanded) {
                scenesContainer.style.display = 'none';
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._chapterCollapseState.set(chapterKey, isExpanded);
                scenesContainer.style.display = isExpanded ? 'block' : 'none';
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        });

        // Show unassigned scenes section
        const unassignedScenes = allScenes.filter(sc => 
            !sc.chapterId && !sc.chapterName
        ).filter(sc =>
            sc.name.toLowerCase().includes(this.currentFilter) ||
            (sc.content || '').toLowerCase().includes(this.currentFilter)
        );

        if (unassignedScenes.length > 0) {
            const unassignedGroup = listContainer.createDiv('storyteller-chapter-group storyteller-unassigned-group');
            const unassignedHeader = unassignedGroup.createDiv('storyteller-chapter-header');
            
            const toggleBtn = unassignedHeader.createDiv('storyteller-chapter-toggle');
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
            
            const pfpContainer = unassignedHeader.createDiv('storyteller-list-item-pfp');
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder storyteller-unassigned-badge', text: '?' });
            
            const infoEl = unassignedHeader.createDiv('storyteller-list-item-info');
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: 'Unassigned Scenes' });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${unassignedScenes.length} scene${unassignedScenes.length !== 1 ? 's' : ''}` });

            const scenesContainer = unassignedGroup.createDiv('storyteller-chapter-scenes');
            unassignedScenes.forEach(sc => {
                this.renderSceneItem(scenesContainer, sc, true, chapters);
            });

            const unassignedKey = '__unassigned__';
            let isExpanded = this._chapterCollapseState.has(unassignedKey) ? this._chapterCollapseState.get(unassignedKey)! : true;
            if (!isExpanded) {
                scenesContainer.style.display = 'none';
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._chapterCollapseState.set(unassignedKey, isExpanded);
                scenesContainer.style.display = isExpanded ? 'block' : 'none';
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }
    }

    /** Render just the chapters list (without header controls) - legacy flat view */
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

    /** Render the Scenes tab content - now groups by chapter */
    async renderScenesContent(container: HTMLElement) {
        container.empty();

        // Writing goal banner — surfaces daily goal progress
        this.renderWritingGoalBanner(container);

        this.renderHeaderControls(container, 'Scenes', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderScenesGroupedByChapter(container);
        }, () => {
            import('../modals/SceneModal').then(({ SceneModal }) => {
                new SceneModal(this.app, this.plugin, null, async (sc) => {
                    await this.plugin.saveScene(sc);
                    new Notice(`Scene "${sc.name}" created.`);
                }).open();
            });
        }, t('createNew'));

        await this.renderScenesGroupedByChapter(container);
    }

    /** Render scenes grouped by chapter */
    private async renderScenesGroupedByChapter(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const allScenes = (await this.plugin.listScenes()).filter(sc =>
            sc.name.toLowerCase().includes(this.currentFilter) ||
            (sc.content || '').toLowerCase().includes(this.currentFilter) ||
            (sc.status || '').toLowerCase().includes(this.currentFilter) ||
            (sc.chapterName || '').toLowerCase().includes(this.currentFilter) ||
            (sc.tags || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const chapters = await this.plugin.listChapters();
        chapters.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

        const listContainer = container.createDiv('storyteller-list-container');
        
        if (allScenes.length === 0) {
            listContainer.createEl('p', { text: t('noScenesFound' as any) || ('No scenes found.' + (this.currentFilter ? t('matchingFilter') : '')) });
            return;
        }

        // Group scenes by chapter
        const scenesByChapter = new Map<string, { chapter: typeof chapters[0] | null; scenes: typeof allScenes }>();
        
        // Initialize with chapters
        for (const ch of chapters) {
            scenesByChapter.set(ch.id || ch.name, { chapter: ch, scenes: [] });
        }
        scenesByChapter.set('__unassigned__', { chapter: null, scenes: [] });

        // Assign scenes to chapters
        for (const sc of allScenes) {
            const chapterKey = sc.chapterId || sc.chapterName;
            if (chapterKey && scenesByChapter.has(chapterKey)) {
                scenesByChapter.get(chapterKey)!.scenes.push(sc);
            } else if (chapterKey) {
                // Try to find by name
                const foundChapter = chapters.find(c => c.name === sc.chapterName || c.id === sc.chapterId);
                if (foundChapter) {
                    const key = foundChapter.id || foundChapter.name;
                    if (!scenesByChapter.has(key)) {
                        scenesByChapter.set(key, { chapter: foundChapter, scenes: [] });
                    }
                    scenesByChapter.get(key)!.scenes.push(sc);
                } else {
                    scenesByChapter.get('__unassigned__')!.scenes.push(sc);
                }
            } else {
                scenesByChapter.get('__unassigned__')!.scenes.push(sc);
            }
        }

        // Render each chapter group (only those with scenes or if filter is empty)
        for (const [key, { chapter, scenes }] of scenesByChapter) {
            if (key === '__unassigned__') continue; // Handle unassigned separately
            if (scenes.length === 0 && this.currentFilter) continue; // Skip empty chapters when filtering

            const chapterGroup = listContainer.createDiv('storyteller-chapter-group');
            const chapterHeader = chapterGroup.createDiv('storyteller-chapter-header storyteller-chapter-header-compact');
            
            // Expand/collapse toggle
            const toggleBtn = chapterHeader.createDiv('storyteller-chapter-toggle');
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
            
            const infoEl = chapterHeader.createDiv('storyteller-list-item-info');
            const chapterNum = chapter?.number ?? '?';
            const chapterName = chapter?.name ?? 'Unknown Chapter';
            const title = `Chapter ${chapterNum}: ${chapterName}`;
            
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: title });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${scenes.length} scene${scenes.length !== 1 ? 's' : ''}` });

            // Open chapter note button
            const chapterActionsEl = chapterHeader.createDiv('storyteller-list-item-actions');
            this.addOpenFileButton(chapterActionsEl, chapter?.filePath);

            // Scenes container
            const scenesContainer = chapterGroup.createDiv('storyteller-chapter-scenes');
            
            if (scenes.length === 0) {
                scenesContainer.createEl('p', { cls: 'storyteller-no-scenes', text: 'No scenes in this chapter' });
            } else {
                scenes.forEach(sc => {
                    this.renderSceneItem(scenesContainer, sc, false);
                });
            }

            // Toggle expand/collapse — persist state across re-renders
            let isExpanded = this._sceneGroupCollapseState.has(key) ? this._sceneGroupCollapseState.get(key)! : true;
            if (!isExpanded) {
                scenesContainer.style.display = 'none';
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._sceneGroupCollapseState.set(key, isExpanded);
                scenesContainer.style.display = isExpanded ? 'block' : 'none';
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }

        // Render unassigned scenes
        const unassigned = scenesByChapter.get('__unassigned__')!.scenes;
        if (unassigned.length > 0) {
            const unassignedGroup = listContainer.createDiv('storyteller-chapter-group storyteller-unassigned-group');
            const unassignedHeader = unassignedGroup.createDiv('storyteller-chapter-header storyteller-chapter-header-compact');
            
            const toggleBtn = unassignedHeader.createDiv('storyteller-chapter-toggle');
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
            
            const infoEl = unassignedHeader.createDiv('storyteller-list-item-info');
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: 'Unassigned Scenes' });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${unassigned.length} scene${unassigned.length !== 1 ? 's' : ''}` });

            const scenesContainer = unassignedGroup.createDiv('storyteller-chapter-scenes');
            unassigned.forEach(sc => {
                this.renderSceneItem(scenesContainer, sc, false, chapters);
            });

            const sgUnassignedKey = '__unassigned__';
            let isExpanded = this._sceneGroupCollapseState.has(sgUnassignedKey) ? this._sceneGroupCollapseState.get(sgUnassignedKey)! : true;
            if (!isExpanded) {
                scenesContainer.style.display = 'none';
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._sceneGroupCollapseState.set(sgUnassignedKey, isExpanded);
                scenesContainer.style.display = isExpanded ? 'block' : 'none';
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }
    }

    /** Helper to render a single scene item */
    private renderSceneItem(container: HTMLElement, sc: any, showChapterAssign: boolean, chapters?: any[]) {
        const itemEl = container.createDiv('storyteller-list-item storyteller-scene-item');

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
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: sc.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const nameEl = infoEl.createEl('strong', { text: sc.name });
        if (sc.filePath) {
            nameEl.addClass('storyteller-scene-name-link');
            nameEl.title = 'Click to open note';
            nameEl.addEventListener('click', () => {
                const file = this.app.vault.getAbstractFileByPath(sc.filePath);
                if (file instanceof TFile) this.app.workspace.openLinkText(sc.filePath, '', false);
            });
        }

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (sc.status) {
            const statusBadge = meta.createSpan({ cls: `storyteller-status-badge storyteller-status-${(sc.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`, text: sc.status });
        }
        if (sc.tags && sc.tags.length > 0) {
            meta.createSpan({ text: sc.tags.map((t: string) => `#${t}`).join(' ') });
        }
        
        if (sc.content) {
            const preview = sc.content.length > 80 ? sc.content.substring(0, 80) + '…' : sc.content;
            infoEl.createEl('p', { cls: 'storyteller-scene-preview', text: preview });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        
        // Chapter assignment dropdown for unassigned scenes
        if (showChapterAssign && chapters && !sc.chapterId && !sc.chapterName) {
            const assignBtn = actionsEl.createEl('button', { cls: 'storyteller-assign-chapter-btn', text: 'Assign' });
            assignBtn.onclick = async () => {
                const select = container.createEl('select', { cls: 'storyteller-chapter-assign-select' });
                select.createEl('option', { value: '', text: 'Select chapter...' });
                chapters.forEach(ch => {
                    select.createEl('option', { value: ch.id || ch.name, text: `${ch.number ?? '?'}. ${ch.name}` });
                });
                select.onchange = async () => {
                    const selectedChapter = chapters.find(c => (c.id || c.name) === select.value);
                    if (selectedChapter) {
                        sc.chapterId = selectedChapter.id;
                        sc.chapterName = selectedChapter.name;
                        await this.plugin.saveScene(sc);
                        new Notice(`Scene assigned to chapter "${selectedChapter.name}"`);
                        // Refresh the view
                        const tabContent = container.closest('.storyteller-tab-content');
                        if (tabContent) {
                            if (tabContent.classList.contains('chapters-content')) {
                                await this.renderChaptersWithScenesList(tabContent as HTMLElement);
                            } else {
                                await this.renderScenesGroupedByChapter(tabContent as HTMLElement);
                            }
                        }
                    }
                };
                assignBtn.replaceWith(select);
                select.focus();
            };
        }
        
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
    }

    /** Render just the scenes list - legacy flat view */
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
                                this.app.workspace.openLinkText(chapterForScene.filePath, '', false);
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

    /** Render the Compile/Manuscript tab content */
    async renderCompileContent(container: HTMLElement) {
        container.empty();
        
        // Get active story
        const activeStory = this.plugin.settings.stories.find(s => s.id === this.plugin.settings.activeStoryId);
        if (!activeStory) {
            container.createEl('p', { text: t('noStorySelected') });
            return;
        }

        // Import compile utilities
        const { SceneOrderManager, WordCountTracker, CompileEngine } = await import('../compile');
        const sceneManager = new SceneOrderManager(this.plugin);
        const wordTracker = new WordCountTracker(this.plugin);

        // Get drafts for this story
        const drafts = sceneManager.getDraftsForStory(activeStory.id);
        const activeDraft = sceneManager.getActiveDraft(activeStory);

        // Header with draft selector
        const headerEl = container.createDiv('storyteller-compile-header');
        headerEl.createEl('h3', { text: t('manuscript') });
        
        // Draft selector
        const draftSelectorEl = headerEl.createDiv('storyteller-draft-selector');
        draftSelectorEl.createSpan({ text: `${t('draft')}: ` });
        
        if (drafts.length === 0) {
            const createBtn = draftSelectorEl.createEl('button', { text: t('createFirstDraft') });
            createBtn.onclick = async () => {
                await sceneManager.createDraft(activeStory, 'First Draft');
                await this.renderCompileContent(container);
            };
        } else {
            const draftSelect = draftSelectorEl.createEl('select');
            drafts.forEach(draft => {
                const opt = draftSelect.createEl('option', { value: draft.id, text: draft.name });
                if (activeDraft && draft.id === activeDraft.id) {
                    opt.selected = true;
                }
            });
            draftSelect.onchange = async () => {
                await sceneManager.setActiveDraft(draftSelect.value);
                await this.renderCompileContent(container);
            };
            
            // New draft button
            const newDraftBtn = draftSelectorEl.createEl('button', { text: '+' });
            newDraftBtn.title = t('createNewDraft');
            newDraftBtn.onclick = async () => {
                const draftNumber = drafts.length + 1;
                await sceneManager.createDraft(activeStory, `Draft ${draftNumber}`);
                await this.renderCompileContent(container);
            };
            
            // Sync button - discovers new scenes and removes deleted ones
            const syncBtn = draftSelectorEl.createEl('button', { text: '🔄' });
            syncBtn.title = t('syncScenes');
            syncBtn.onclick = async () => {
                if (activeDraft) {
                    const result = await sceneManager.syncDraftWithScenes(activeDraft);
                    if (result.added.length > 0 || result.removed.length > 0) {
                        new Notice(`Synced: ${result.added.length} added, ${result.removed.length} removed`);
                    } else {
                        new Notice('Draft is up to date');
                    }
                    await this.renderCompileContent(container);
                }
            };
        }

        // Statistics section
        const statsEl = container.createDiv('storyteller-compile-stats');
        
        if (activeDraft) {
            const stats = await sceneManager.getDraftStatistics(activeDraft);
            const orderedScenes = await sceneManager.getOrderedScenes(activeDraft);
            
            const statsGrid = statsEl.createDiv('storyteller-stats-grid');
            
            // Word count
            const wordStatEl = statsGrid.createDiv('storyteller-stat-item');
            wordStatEl.createDiv({ cls: 'storyteller-stat-value', text: wordTracker.formatWordCount(stats.totalWords) });
            wordStatEl.createDiv({ cls: 'storyteller-stat-label', text: t('words') });
            
            // Scene count
            const sceneStatEl = statsGrid.createDiv('storyteller-stat-item');
            sceneStatEl.createDiv({ cls: 'storyteller-stat-value', text: `${stats.includedScenes}/${stats.totalScenes}` });
            sceneStatEl.createDiv({ cls: 'storyteller-stat-label', text: t('scenes') });
            
            // Chapter count
            const chapterStatEl = statsGrid.createDiv('storyteller-stat-item');
            chapterStatEl.createDiv({ cls: 'storyteller-stat-value', text: `${stats.chapterCount}` });
            chapterStatEl.createDiv({ cls: 'storyteller-stat-label', text: t('chapterCount') });
            
            // Writing streak
            const streak = wordTracker.getWritingStreak();
            const streakStatEl = statsGrid.createDiv('storyteller-stat-item');
            streakStatEl.createDiv({ cls: 'storyteller-stat-value', text: `${streak}` });
            streakStatEl.createDiv({ cls: 'storyteller-stat-label', text: t('dayStreak') });
            
            // Daily goal progress
            const goalProgress = wordTracker.getDailyGoalProgress();
            const goalStatEl = statsGrid.createDiv('storyteller-stat-item');
            goalStatEl.createDiv({ cls: 'storyteller-stat-value', text: `${Math.round(goalProgress)}%` });
            goalStatEl.createDiv({ cls: 'storyteller-stat-label', text: t('dailyGoal') });
        }

        // Scene ordering section
        if (activeDraft) {
            const sceneOrderEl = container.createDiv('storyteller-scene-order');
            
            // Scene order header with action buttons
            const sceneOrderHeader = sceneOrderEl.createDiv('storyteller-scene-order-header');
            sceneOrderHeader.createEl('h4', { text: t('sceneOrder') });
            
            const sceneOrderActions = sceneOrderHeader.createDiv('storyteller-scene-order-actions');
            
            // Reorder by chapter button
            const reorderBtn = sceneOrderActions.createEl('button', { text: '📚' });
            reorderBtn.title = t('reorderByChapter');
            reorderBtn.onclick = async () => {
                await sceneManager.reorderByChapter(activeDraft);
                new Notice('Scenes reordered by chapter');
                await this.renderCompileContent(container);
            };
            
            const orderedScenes = await sceneManager.getOrderedScenes(activeDraft);
            const sceneListEl = sceneOrderEl.createDiv('storyteller-ordered-scene-list');
            
            if (orderedScenes.length === 0) {
                const emptyEl = sceneListEl.createDiv('storyteller-empty-draft');
                emptyEl.createEl('p', { text: t('noScenesInDraft') });
                
                // Add auto-populate button if there are scenes available
                const allScenes = await this.plugin.listScenes();
                if (allScenes.length > 0) {
                    const populateBtn = emptyEl.createEl('button', { 
                        text: `🔄 Add ${allScenes.length} existing scene${allScenes.length > 1 ? 's' : ''}`,
                        cls: 'mod-cta'
                    });
                    populateBtn.onclick = async () => {
                        await sceneManager.autoPopulateDraft(activeDraft);
                        await this.renderCompileContent(container);
                    };
                }
            } else {
                // Group scenes by chapter for visual clarity
                let currentChapter: string | undefined = undefined;
                
                for (const orderedScene of orderedScenes) {
                    const sceneChapter = orderedScene.chapterName || t('unassigned');
                    
                    // Add chapter separator if chapter changed
                    if (sceneChapter !== currentChapter) {
                        currentChapter = sceneChapter;
                        const chapterDivider = sceneListEl.createDiv('storyteller-chapter-divider');
                        const chapterLabelSpan = chapterDivider.createSpan({ cls: 'storyteller-chapter-label' });
                        const chapterIcon = chapterLabelSpan.createSpan();
                        setIcon(chapterIcon, 'book-open');
                        chapterLabelSpan.appendText(` ${currentChapter}`);
                    }
                    
                    const sceneEl = sceneListEl.createDiv('storyteller-ordered-scene-item');
                    sceneEl.style.paddingLeft = `${(orderedScene.indentLevel + 1) * 16}px`;
                    
                    // Include checkbox
                    const sceneId = orderedScene.scene.id || orderedScene.scene.name;
                    const ref = activeDraft.sceneOrder.find(s => s.sceneId === sceneId);
                    const checkbox = sceneEl.createEl('input', { type: 'checkbox' });
                    checkbox.checked = ref?.includeInCompile ?? true;
                    checkbox.onclick = async () => {
                        await sceneManager.toggleSceneInCompile(activeDraft, sceneId);
                    };
                    
                    // Scene info
                    const infoEl = sceneEl.createDiv('storyteller-ordered-scene-info');
                    infoEl.createSpan({ text: orderedScene.scene.name, cls: 'storyteller-scene-name' });
                    
                    // Show word count if available
                    if (orderedScene.scene.wordCount) {
                        infoEl.createSpan({ 
                            text: ` (${wordTracker.formatWordCount(orderedScene.scene.wordCount)})`, 
                            cls: 'storyteller-scene-wordcount' 
                        });
                    }
                    
                    // Click to open
                    infoEl.onclick = () => {
                        if (orderedScene.scene.filePath) {
                            this.app.workspace.openLinkText(orderedScene.scene.filePath, '', false);
                        }
                    };
                    
                    // Movement buttons
                    const actionsEl = sceneEl.createDiv('storyteller-ordered-scene-actions');
                    
                    const upBtn = actionsEl.createEl('button', { text: '↑' });
                    upBtn.title = t('moveUp');
                    upBtn.onclick = async () => {
                        await sceneManager.moveSceneUp(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const downBtn = actionsEl.createEl('button', { text: '↓' });
                    downBtn.title = t('moveDown');
                    downBtn.onclick = async () => {
                        await sceneManager.moveSceneDown(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const indentBtn = actionsEl.createEl('button', { text: '→' });
                    indentBtn.title = t('indent');
                    indentBtn.onclick = async () => {
                        await sceneManager.indentScene(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const unindentBtn = actionsEl.createEl('button', { text: '←' });
                    unindentBtn.title = t('unindent');
                    unindentBtn.onclick = async () => {
                        await sceneManager.unindentScene(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                }
            }
        }

        // Compile actions section
        const compileActionsEl = container.createDiv('storyteller-compile-actions');
        compileActionsEl.createEl('h4', { text: t('compile') });
        
        // Workflow selector
        const workflowSelectorEl = compileActionsEl.createDiv('storyteller-workflow-selector');
        workflowSelectorEl.createSpan({ text: `${t('exportFormat')}: ` });
        
        const engine = new CompileEngine(this.app, this.plugin);
        const presetWorkflows = engine.getPresetWorkflows();
        
        const workflowSelect = workflowSelectorEl.createEl('select', { cls: 'storyteller-workflow-select' });
        presetWorkflows.forEach(workflow => {
            const opt = workflowSelect.createEl('option', { 
                value: workflow.id, 
                text: workflow.name 
            });
            if (workflow.description) {
                opt.title = workflow.description;
            }
        });
        
        // Compile button
        const compileBtn = compileActionsEl.createEl('button', { cls: 'mod-cta' });
        setIcon(compileBtn.createSpan(), 'book-open');
        compileBtn.createSpan().setText(` ${t('compileManuscript')}`);
        compileBtn.onclick = async () => {
            if (!activeDraft) {
                new Notice(t('noDraftAvailable'));
                return;
            }
            
            const selectedWorkflowId = workflowSelect.value;
            const workflow = engine.getWorkflowById(selectedWorkflowId) || engine.createDefaultWorkflow();
            
            new Notice(`${t('compiling')} (${workflow.name})`);
            
            try {
                const result = await engine.compile(activeDraft, workflow);
                if (result.success) {
                    const wordCount = result.stats?.wordCount ?? 0;
                    new Notice(`${t('compileComplete')} ${wordCount} ${t('words').toLowerCase()}`);
                } else {
                    new Notice(`${t('compileFailed')}: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Compile error:', error);
                new Notice(`${t('compileFailed')}: ${error}`);
            }
        };
        
        // Workflow description
        const workflowDescEl = compileActionsEl.createDiv('storyteller-workflow-description');
        workflowDescEl.setText(presetWorkflows[0]?.description || '');
        
        workflowSelect.onchange = () => {
            const selectedWorkflow = presetWorkflows.find(w => w.id === workflowSelect.value);
            workflowDescEl.setText(selectedWorkflow?.description || '');
        };

        // Custom compile steps management
        await this.renderCustomCompileSteps(container);
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
            if (character.race) {
                extraInfoEl.createSpan({ cls: 'storyteller-char-attr-chip', text: character.race });
            }
            if (character.age) {
                if (character.race) extraInfoEl.appendText(' · ');
                extraInfoEl.createSpan({ cls: 'storyteller-char-attr-chip', text: character.age });
            }
            if (character.status) {
                if (character.race || character.age) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: character.status });
            }
            if (character.affiliation) {
                if (character.race || character.age || character.status) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-affiliation', text: character.affiliation });
            }
            if (character.balance) {
                if (character.race || character.age || character.status || character.affiliation) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${character.balance}` });
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
            if (location.balance) {
                if (location.locationType || location.region || location.parentLocation || location.status) extraInfoEl.appendText(' • ');
                extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${location.balance}` });
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

    renderEventList(events: Event[], listContainer: HTMLElement, viewContainer: HTMLElement, locations: Location[] = []) {
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
                // Resolve location ID to name if possible
                const locationName = this.resolveLocationName(event.location, locations);
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-location', text: `@ ${locationName}` });
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
                   this.app.workspace.openLinkText(filePath, '', false);
               } else {
                   new Notice('Could not find the note file.');
               }
           });
    }

    /** Add a button that opens the given map in the dedicated Map view */
    addOpenMapViewButton(container: HTMLElement, mapId: string | undefined) {
        if (!mapId) return;
        new ButtonComponent(container)
            .setIcon('map')
            .setTooltip('Open in map view')
            .onClick(async () => {
                await this.plugin.activateMapView(mapId);
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
    
    // ========== Custom Compile Steps =========================================

    private async renderCustomCompileSteps(container: HTMLElement): Promise<void> {
        const section = container.createDiv('storyteller-compile-custom-steps');

        const header = section.createDiv('storyteller-compile-custom-header');
        header.createEl('h4', { text: 'Custom Compile Steps' });

        const addBtn = header.createEl('button', { cls: 'mod-cta storyteller-compile-add-step-btn' });
        const addIcon = addBtn.createSpan();
        setIcon(addIcon, 'plus');
        addBtn.createSpan({ text: ' Add Step' });
        addBtn.addEventListener('click', () => this.openCustomStepModal(null, container));

        const steps = this.plugin.settings.customCompileSteps ?? [];
        if (steps.length === 0) {
            section.createEl('p', {
                text: 'No custom steps yet. Add a JavaScript step to extend the compile pipeline.',
                cls: 'storyteller-compile-custom-empty'
            });
            return;
        }

        const list = section.createDiv('storyteller-compile-custom-list');
        for (const step of steps) {
            const row = list.createDiv('storyteller-compile-custom-row');

            const info = row.createDiv('storyteller-compile-custom-info');
            info.createDiv({ text: step.name, cls: 'storyteller-compile-custom-name' });
            const meta = info.createDiv({ cls: 'storyteller-compile-custom-meta' });
            meta.createSpan({ text: step.context, cls: `storyteller-compile-stage storyteller-compile-stage--${step.context}` });
            if (step.description) meta.createSpan({ text: ` · ${step.description}`, cls: 'storyteller-compile-custom-desc' });

            const actions = row.createDiv('storyteller-compile-custom-actions');

            const editBtn = actions.createEl('button');
            setIcon(editBtn, 'pencil');
            editBtn.title = 'Edit step';
            editBtn.addEventListener('click', () => this.openCustomStepModal(step, container));

            const deleteBtn = actions.createEl('button');
            setIcon(deleteBtn, 'trash');
            deleteBtn.title = 'Delete step';
            deleteBtn.addEventListener('click', async () => {
                this.plugin.settings.customCompileSteps = (this.plugin.settings.customCompileSteps ?? [])
                    .filter(s => s.id !== step.id);
                await this.plugin.saveSettings();
                await this.renderCompileContent(container);
            });
        }
    }

    private openCustomStepModal(
        existing: import('../types').CustomCompileStepDef | null,
        refreshContainer: HTMLElement
    ): void {
        import('../modals/CustomCompileStepModal').then(({ CustomCompileStepModal }) => {
            new CustomCompileStepModal(this.app, existing, async (saved) => {
                const steps = this.plugin.settings.customCompileSteps ?? [];
                const idx = steps.findIndex(s => s.id === saved.id);
                if (idx >= 0) steps[idx] = saved;
                else steps.push(saved);
                this.plugin.settings.customCompileSteps = steps;
                await this.plugin.saveSettings();
                await this.renderCompileContent(refreshContainer);
            }).open();
        });
    }

    // ========== Phase 2A: World-Building Entity Render Methods ==========

    async renderCulturesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, t('cultures'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCulturesList(container);
        }, () => {
            import('../modals/CultureModal').then(({ CultureModal }) => {
                new CultureModal(this.app, this.plugin, null, async (culture) => {
                    await this.plugin.saveCulture(culture);
                    new Notice(t('cultureCreated', culture.name));
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
            listContainer.createEl('p', { text: t('noCulturesFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
            if (culture.balance) meta.createSpan({ cls: 'storyteller-balance-chip', text: ` • ⚖ ${culture.balance}` });

            if (culture.values) {
                const preview = culture.values.length > 120 ? culture.values.substring(0, 120) + '…' : culture.values;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/CultureModal').then(({ CultureModal }) => {
                    new CultureModal(this.app, this.plugin, culture, async (updated) => {
                        await this.plugin.saveCulture(updated);
                        new Notice(t('cultureUpdated', updated.name));
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteCulture(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (culture.filePath && confirm(t('confirmDeleteCulture', culture.name))) {
                    await this.plugin.deleteCulture(culture.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, culture.filePath);
        });
    }


    async renderEconomiesContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, t('economies'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderEconomiesList(container);
        }, () => {
            import('../modals/EconomyModal').then(({ EconomyModal }) => {
                new EconomyModal(this.app, this.plugin, null, async (economy) => {
                    await this.plugin.saveEconomy(economy);
                    new Notice(t('economyCreated', economy.name));
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
            (e.economicSystem || '').toLowerCase().includes(this.currentFilter) ||
            (e.linkedCharacters || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (e.linkedLocations  || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (e.linkedCultures   || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (economies.length === 0) {
            listContainer.createEl('p', { text: t('noEconomiesFound') + (this.currentFilter ? t('matchingFilter') : '') });
            return;
        }

        economies.forEach(economy => {
            const itemEl = listContainer.createDiv('storyteller-list-item storyteller-economy-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (economy.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(economy.profileImagePath);
                imgEl.alt = economy.name;
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: economy.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');

            // Title row: name + status badge
            const titleRow = infoEl.createDiv('storyteller-economy-card-title-row');
            titleRow.createEl('strong', { text: economy.name });
            if (economy.status) {
                const statusKey = economy.status.toLowerCase().replace(/\s+/g, '-');
                titleRow.createEl('span', {
                    cls: `storyteller-economy-status-badge is-${statusKey}`,
                    text: economy.status
                });
            }

            // Description preview
            if (economy.description) {
                const preview = economy.description.length > 100
                    ? economy.description.substring(0, 100) + '…'
                    : economy.description;
                infoEl.createEl('p', { text: preview });
            }

            // Meta row: system, currency count, trade route count
            const meta = infoEl.createDiv('storyteller-list-item-extra');
            if (economy.economicSystem) meta.createSpan({ text: economy.economicSystem });
            if (economy.currencies && economy.currencies.length > 0) {
                meta.createSpan({ text: ` • ${economy.currencies.length} ${economy.currencies.length === 1 ? 'currency' : 'currencies'}` });
            }
            if (economy.tradeRoutes && economy.tradeRoutes.length > 0) {
                meta.createSpan({ text: ` • ${economy.tradeRoutes.length} trade ${economy.tradeRoutes.length === 1 ? 'route' : 'routes'}` });
            }

            // Linked entity count chips
            const linkedCounts: [string, number][] = [
                ['chars',    (economy.linkedCharacters || []).length],
                ['loc',      (economy.linkedLocations  || []).length],
                ['cultures', (economy.linkedCultures   || []).length],
            ].filter(([, n]) => n > 0) as [string, number][];

            if (linkedCounts.length > 0) {
                const linksRow = infoEl.createDiv('storyteller-economy-links-row');
                for (const [label, count] of linkedCounts) {
                    linksRow.createEl('span', {
                        cls: 'storyteller-economy-link-count',
                        text: `${count} ${label}`
                    });
                }
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/EconomyModal').then(({ EconomyModal }) => {
                    new EconomyModal(this.app, this.plugin, economy, async (updated) => {
                        await this.plugin.saveEconomy(updated);
                        new Notice(t('economyUpdated', updated.name));
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteEconomy(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (economy.filePath && confirm(t('confirmDeleteEconomy', economy.name))) {
                    await this.plugin.deleteEconomy(economy.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, economy.filePath);

            // Details button — opens rich EconomyDetailModal
            const detailBtn = actionsEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Details' } });
            setIcon(detailBtn, 'book-open');
            detailBtn.addEventListener('click', () => {
                new EconomyDetailModal(this.app, this.plugin, economy).open();
            });
        });
    }

    async renderMagicSystemsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, t('magicSystems'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderMagicSystemsList(container);
        }, () => {
            import('../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                new MagicSystemModal(this.app, this.plugin, null, async (magicSystem) => {
                    await this.plugin.saveMagicSystem(magicSystem);
                    new Notice(t('magicSystemCreated', magicSystem.name));
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
            listContainer.createEl('p', { text: t('noMagicSystemsFound') + (this.currentFilter ? t('matchingFilter') : '') });
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
                        new Notice(t('magicSystemUpdated', updated.name));
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteMagicSystem(toDelete.filePath);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (magicSystem.filePath && confirm(t('confirmDeleteMagicSystem', magicSystem.name))) {
                    await this.plugin.deleteMagicSystem(magicSystem.filePath);
                }
            });
            this.addOpenFileButton(actionsEl, magicSystem.filePath);
        });
    }

    async renderCompendiumContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Compendium', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCompendiumList(container);
        }, () => {
            import('../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                new CompendiumEntryModal(this.app, this.plugin, null, async (entry) => {
                    await this.plugin.saveCompendiumEntry(entry);
                    new Notice(`Entry "${entry.name}" created.`);
                    await this.renderCompendiumList(container);
                }).open();
            });
        }, 'New Entry');

        await this.renderCompendiumList(container);
    }

    private async renderCompendiumList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const entries = (await this.plugin.listCompendiumEntries()).filter(e =>
            e.name.toLowerCase().includes(this.currentFilter) ||
            (e.entryType || '').toLowerCase().includes(this.currentFilter) ||
            (e.description || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (entries.length === 0) {
            listContainer.createEl('p', { text: 'No compendium entries found.' + (this.currentFilter ? ' (matching filter)' : '') });
            return;
        }

        entries.forEach(entry => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (entry.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                imgEl.src = this.getImageSrc(entry.profileImagePath);
                imgEl.alt = entry.name;
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: entry.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const nameRow = infoEl.createDiv({ cls: 'storyteller-compendium-name-row' });
            nameRow.createEl('strong', { text: entry.name });

            if (entry.entryType) {
                nameRow.createSpan({
                    cls: `storyteller-compendium-badge storyteller-compendium-${entry.entryType}`,
                    text: entry.entryType
                });
            }
            if (entry.rarity) {
                nameRow.createSpan({
                    cls: `storyteller-compendium-badge storyteller-rarity-${entry.rarity}`,
                    text: entry.rarity
                });
            }
            if (entry.dangerRating && entry.dangerRating !== 'none') {
                nameRow.createSpan({
                    cls: `storyteller-compendium-badge storyteller-danger-${entry.dangerRating}`,
                    text: `⚠ ${entry.dangerRating}`
                });
            }

            const meta = infoEl.createDiv('storyteller-list-item-extra');
            const locCount = entry.linkedLocations?.length ?? 0;
            const charCount = entry.linkedCharacters?.length ?? 0;
            if (locCount > 0) meta.createSpan({ text: `${locCount} location${locCount > 1 ? 's' : ''}` });
            if (charCount > 0) {
                if (locCount > 0) meta.appendText(' • ');
                meta.createSpan({ text: `${charCount} character${charCount > 1 ? 's' : ''}` });
            }

            if (entry.description) {
                const preview = entry.description.length > 80 ? entry.description.substring(0, 80) + '…' : entry.description;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                    new CompendiumEntryModal(this.app, this.plugin, entry, async (updated) => {
                        await this.plugin.saveCompendiumEntry(updated);
                        new Notice(`Entry "${updated.name}" updated.`);
                        await this.renderCompendiumList(container);
                    }, async (toDelete) => {
                        if (toDelete.filePath) await this.plugin.deleteCompendiumEntry(toDelete.filePath);
                        await this.renderCompendiumList(container);
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (entry.filePath && confirm(`Delete "${entry.name}"?`)) {
                    await this.plugin.deleteCompendiumEntry(entry.filePath);
                    await this.renderCompendiumList(container);
                }
            });
            this.addOpenFileButton(actionsEl, entry.filePath);
        });
    }

    /**
     * Render the Templates tab content
     * Shows full template library with filtering and management inline
     * @param container The container element to render content into
     */
    async renderTemplatesContent(container: HTMLElement) {
        container.empty();

        // Refresh templates from manager
        this.templatesCache = this.plugin.templateManager.getFilteredTemplates(this.templateFilter);

        // Create header with action button
        const header = container.createDiv('storyteller-templates-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'flex-start';
        header.style.marginBottom = '1rem';

        const headerText = header.createDiv('storyteller-templates-header-text');
        headerText.createEl('h3', { text: t('entityTemplates') });
        headerText.createEl('p', {
            text: t('browseManageTemplates'),
            cls: 'storyteller-templates-description'
        });

        const createTemplateBtn = header.createEl('button', {
            text: t('createNewTemplate'),
            cls: 'mod-cta'
        });
        createTemplateBtn.style.flexShrink = '0';
        createTemplateBtn.addEventListener('click', () => {
            new TemplateEditorModal(
                this.app,
                this.plugin,
                null, // null = new template
                async (template) => {
                    new Notice(t('templateCreated', template.name));
                    await this.renderTemplatesContent(container);
                }
            ).open();
        });

        // Create filter section
        this.createTemplateFilterSection(container);

        // Create template list
        this.createTemplateListSection(container);
    }

    /**
     * Create the filter section for the template library
     */
    private createTemplateFilterSection(container: HTMLElement): void {
        const filterContainer = container.createDiv({ cls: 'storyteller-template-library-filters' });
        filterContainer.style.marginBottom = '1rem';
        filterContainer.style.padding = '1rem';
        filterContainer.style.backgroundColor = 'var(--background-secondary)';
        filterContainer.style.borderRadius = '8px';

        // Search row
        const searchRow = filterContainer.createDiv('storyteller-filter-row');
        searchRow.style.marginBottom = '0.75rem';

        const searchLabel = searchRow.createEl('label', { text: t('searchTemplates') });
        searchLabel.style.display = 'block';
        searchLabel.style.marginBottom = '0.25rem';
        searchLabel.style.fontWeight = '500';

        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: t('searchTemplatesPlaceholder')
        });
        searchInput.style.width = '100%';
        searchInput.style.padding = '0.5rem';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid var(--background-modifier-border)';
        searchInput.value = this.templateFilter.searchText || '';
        searchInput.addEventListener('input', () => {
            this.templateFilter.searchText = searchInput.value || undefined;
            this.refreshTemplateList(container);
        });

        // Filter options row
        const filtersRow = filterContainer.createDiv('storyteller-filter-options');
        filtersRow.style.display = 'flex';
        filtersRow.style.flexWrap = 'wrap';
        filtersRow.style.gap = '1rem';
        filtersRow.style.alignItems = 'flex-end';

        // Genre dropdown
        const genreGroup = filtersRow.createDiv('storyteller-filter-group');
        genreGroup.createEl('label', { text: t('genre') }).style.display = 'block';
        const genreSelect = genreGroup.createEl('select');
        genreSelect.style.padding = '0.35rem';
        genreSelect.style.borderRadius = '4px';
        genreSelect.createEl('option', { text: t('allGenres'), value: '' });
        const genres: TemplateGenre[] = ['fantasy', 'scifi', 'mystery', 'horror', 'romance', 'historical', 'western', 'thriller', 'custom'];
        genres.forEach(g => genreSelect.createEl('option', { text: g.charAt(0).toUpperCase() + g.slice(1), value: g }));
        genreSelect.value = this.templateFilter.genre?.[0] || '';
        genreSelect.addEventListener('change', () => {
            this.templateFilter.genre = genreSelect.value ? [genreSelect.value as TemplateGenre] : undefined;
            this.refreshTemplateList(container);
        });

        // Category dropdown
        const categoryGroup = filtersRow.createDiv('storyteller-filter-group');
        categoryGroup.createEl('label', { text: t('templateCategory') }).style.display = 'block';
        const categorySelect = categoryGroup.createEl('select');
        categorySelect.style.padding = '0.35rem';
        categorySelect.style.borderRadius = '4px';
        categorySelect.createEl('option', { text: t('allTemplateCategories'), value: '' });
        const categories: TemplateCategory[] = ['single-entity', 'entity-set', 'full-world'];
        const categoryLabels: Record<TemplateCategory, string> = {
            'single-entity': t('singleEntity'),
            'entity-set': t('entitySet'),
            'full-world': t('fullWorld')
        };
        categories.forEach(c => categorySelect.createEl('option', { text: categoryLabels[c], value: c }));
        categorySelect.value = this.templateFilter.category?.[0] || '';
        categorySelect.addEventListener('change', () => {
            this.templateFilter.category = categorySelect.value ? [categorySelect.value as TemplateCategory] : undefined;
            this.refreshTemplateList(container);
        });

        // Sort dropdown
        const sortGroup = filtersRow.createDiv('storyteller-filter-group');
        sortGroup.createEl('label', { text: t('sortBy') }).style.display = 'block';
        const sortSelect = sortGroup.createEl('select');
        sortSelect.style.padding = '0.35rem';
        sortSelect.style.borderRadius = '4px';
        sortSelect.createEl('option', { text: t('sortByName'), value: 'name' });
        sortSelect.createEl('option', { text: t('sortByUsage'), value: 'usage' });
        sortSelect.createEl('option', { text: t('sortByRecent'), value: 'recent' });
        sortSelect.value = this.templateFilter.sortByUsage ? 'usage' : (this.templateFilter.sortByRecent ? 'recent' : 'name');
        sortSelect.addEventListener('change', () => {
            this.templateFilter.sortByUsage = sortSelect.value === 'usage';
            this.templateFilter.sortByRecent = sortSelect.value === 'recent';
            this.refreshTemplateList(container);
        });

        // Toggle row
        const togglesRow = filterContainer.createDiv('storyteller-filter-toggles');
        togglesRow.style.display = 'flex';
        togglesRow.style.gap = '1.5rem';
        togglesRow.style.marginTop = '0.75rem';

        // Built-in toggle
        const builtInLabel = togglesRow.createEl('label');
        builtInLabel.style.display = 'flex';
        builtInLabel.style.alignItems = 'center';
        builtInLabel.style.gap = '0.5rem';
        builtInLabel.style.cursor = 'pointer';
        const builtInCheck = builtInLabel.createEl('input', { type: 'checkbox' });
        builtInCheck.checked = this.templateFilter.showBuiltIn !== false;
        builtInCheck.addEventListener('change', () => {
            this.templateFilter.showBuiltIn = builtInCheck.checked;
            this.refreshTemplateList(container);
        });
        builtInLabel.createEl('span', { text: t('showBuiltIn') });

        // Custom toggle
        const customLabel = togglesRow.createEl('label');
        customLabel.style.display = 'flex';
        customLabel.style.alignItems = 'center';
        customLabel.style.gap = '0.5rem';
        customLabel.style.cursor = 'pointer';
        const customCheck = customLabel.createEl('input', { type: 'checkbox' });
        customCheck.checked = this.templateFilter.showCustom !== false;
        customCheck.addEventListener('change', () => {
            this.templateFilter.showCustom = customCheck.checked;
            this.refreshTemplateList(container);
        });
        customLabel.createEl('span', { text: t('showCustom') });
    }

    /**
     * Refresh the template list based on current filters
     */
    private refreshTemplateList(container: HTMLElement): void {
        this.templatesCache = this.plugin.templateManager.getFilteredTemplates(this.templateFilter);
        
        // Remove existing list and recreate
        const existingList = container.querySelector('.storyteller-template-library-list');
        if (existingList) {
            existingList.remove();
        }
        
        // Append new list at the end
        const listSection = this.createTemplateListElement();
        container.appendChild(listSection);
    }

    /**
     * Create the template list section
     */
    private createTemplateListSection(container: HTMLElement): void {
        const listSection = this.createTemplateListElement();
        container.appendChild(listSection);
    }

    /**
     * Create the template list element
     */
    private createTemplateListElement(): HTMLElement {
        const listContainer = document.createElement('div');
        listContainer.className = 'storyteller-template-library-list';

        if (this.templatesCache.length === 0) {
            const emptyState = listContainer.createDiv('storyteller-empty-state');
            emptyState.style.padding = '2rem';
            emptyState.style.textAlign = 'center';
            emptyState.style.color = 'var(--text-muted)';
            emptyState.createEl('p', {
                text: t('noTemplatesFound')
            });
            return listContainer;
        }

        // Display template count
        const countEl = listContainer.createEl('p', {
            text: t('foundXTemplates', this.templatesCache.length),
            cls: 'storyteller-template-count'
        });
        countEl.style.marginBottom = '0.75rem';
        countEl.style.color = 'var(--text-muted)';

        // Create template cards grid
        const cardsGrid = listContainer.createDiv('storyteller-template-cards-grid');
        cardsGrid.style.display = 'grid';
        cardsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        cardsGrid.style.gap = '1rem';

        this.templatesCache.forEach(template => {
            this.renderFullTemplateCard(cardsGrid, template);
        });

        return listContainer;
    }

    /**
     * Render a full template card with all actions
     */
    private renderFullTemplateCard(container: HTMLElement, template: Template): void {
        const card = container.createDiv({ cls: 'storyteller-template-card-full' });
        card.style.padding = '1rem';
        card.style.backgroundColor = 'var(--background-primary)';
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.borderRadius = '8px';

        // Header
        const header = card.createDiv('storyteller-template-card-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '0.5rem';

        header.createEl('h4', { text: template.name }).style.margin = '0';

        if (template.isBuiltIn) {
            const badge = header.createEl('span', { text: t('builtIn') });
            badge.style.fontSize = '0.75em';
            badge.style.padding = '0.2rem 0.5rem';
            badge.style.backgroundColor = 'var(--interactive-accent)';
            badge.style.color = 'var(--text-on-accent)';
            badge.style.borderRadius = '4px';
        }

        // Description
        const desc = card.createEl('p', { text: template.description });
        desc.style.margin = '0.5rem 0';
        desc.style.color = 'var(--text-muted)';
        desc.style.fontSize = '0.9em';

        // Metadata
        const meta = card.createDiv('storyteller-template-card-meta');
        meta.style.display = 'flex';
        meta.style.flexWrap = 'wrap';
        meta.style.gap = '0.5rem';
        meta.style.marginBottom = '0.5rem';
        meta.style.fontSize = '0.85em';

        const genreBadge = meta.createEl('span', { text: template.genre });
        genreBadge.style.padding = '0.15rem 0.4rem';
        genreBadge.style.backgroundColor = 'var(--background-secondary)';
        genreBadge.style.borderRadius = '4px';

        const categoryBadge = meta.createEl('span', { text: template.category });
        categoryBadge.style.padding = '0.15rem 0.4rem';
        categoryBadge.style.backgroundColor = 'var(--background-secondary)';
        categoryBadge.style.borderRadius = '4px';

        if (template.usageCount && template.usageCount > 0) {
            const usageBadge = meta.createEl('span', { text: t('usedXTimes', template.usageCount) });
            usageBadge.style.padding = '0.15rem 0.4rem';
            usageBadge.style.backgroundColor = 'var(--background-secondary)';
            usageBadge.style.borderRadius = '4px';
        }

        // Entity types
        if (template.entityTypes && template.entityTypes.length > 0) {
            const entityTypesEl = card.createDiv('storyteller-template-card-entity-types');
            entityTypesEl.style.marginBottom = '0.5rem';
            entityTypesEl.style.fontSize = '0.85em';
            entityTypesEl.createEl('span', { text: t('contains') });
            template.entityTypes.forEach(type => {
                const typeBadge = entityTypesEl.createEl('span', { text: type });
                typeBadge.style.marginLeft = '0.25rem';
                typeBadge.style.padding = '0.1rem 0.3rem';
                typeBadge.style.backgroundColor = 'var(--interactive-accent)';
                typeBadge.style.color = 'var(--text-on-accent)';
                typeBadge.style.borderRadius = '3px';
                typeBadge.style.fontSize = '0.85em';
            });
        }

        // Tags
        if (template.tags && template.tags.length > 0) {
            const tagsEl = card.createDiv('storyteller-template-card-tags');
            tagsEl.style.display = 'flex';
            tagsEl.style.flexWrap = 'wrap';
            tagsEl.style.gap = '0.25rem';
            tagsEl.style.marginBottom = '0.75rem';
            template.tags.forEach(tag => {
                const tagEl = tagsEl.createEl('span', { text: tag });
                tagEl.style.fontSize = '0.75em';
                tagEl.style.padding = '0.1rem 0.3rem';
                tagEl.style.backgroundColor = 'var(--background-modifier-border)';
                tagEl.style.borderRadius = '3px';
            });
        }

        // Actions
        const actions = card.createDiv('storyteller-template-card-actions');
        actions.style.display = 'flex';
        actions.style.flexWrap = 'wrap';
        actions.style.gap = '0.5rem';
        actions.style.marginTop = '0.75rem';
        actions.style.paddingTop = '0.75rem';
        actions.style.borderTop = '1px solid var(--background-modifier-border)';

        const applyButton = actions.createEl('button', { text: t('applyTemplate'), cls: 'mod-cta' });
        applyButton.addEventListener('click', () => this.handleUseTemplate(template));

        if (template.isEditable) {
            const editButton = actions.createEl('button', { text: t('edit') });
            editButton.addEventListener('click', () => this.handleEditTemplate(template, container));

            const deleteButton = actions.createEl('button', { text: t('delete'), cls: 'mod-warning' });
            deleteButton.addEventListener('click', () => this.handleDeleteTemplate(template, container));
        }

        const duplicateButton = actions.createEl('button', { text: t('duplicate') });
        duplicateButton.addEventListener('click', () => this.handleDuplicateTemplate(template, container));
    }

    /**
     * Handle using a template
     */
    private async handleUseTemplate(template: Template): Promise<void> {
        console.log('DashboardView: handleUseTemplate called with template:', template.name);
        // Apply the template with variable collection prompt
        await this.plugin.applyTemplateWithPrompt(template);
        console.log('DashboardView: applyTemplateWithPrompt completed');
    }

    /**
     * Handle editing a template
     */
    private handleEditTemplate(template: Template, container: HTMLElement): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            template,
            async (updatedTemplate) => {
                await this.renderTemplatesContent(container);
            }
        ).open();
    }

    /**
     * Handle deleting a template
     */
    private async handleDeleteTemplate(template: Template, container: HTMLElement): Promise<void> {
        const confirmed = await this.confirmTemplateDelete(template.name);
        if (confirmed) {
            try {
                await this.plugin.templateManager.deleteTemplate(template.id);
                await this.renderTemplatesContent(container);
                new Notice(t('templateDeleted', template.name));
            } catch (error) {
                console.error('Error deleting template:', error);
                new Notice(t('failedToDeleteTemplate', (error as Error).message));
            }
        }
    }

    /**
     * Handle duplicating a template
     */
    private async handleDuplicateTemplate(template: Template, container: HTMLElement): Promise<void> {
        try {
            const newName = `${template.name}${t('templateCopySuffix')}`;
            await this.plugin.templateManager.copyTemplate(template.id, newName);
            new Notice(t('templateDuplicated', newName));
            await this.renderTemplatesContent(container);
        } catch (error) {
            console.error('Error duplicating template:', error);
            new Notice(t('failedToDuplicateTemplate', (error as Error).message));
        }
    }

    /**
     * Confirmation dialog for template deletion
     */
    private async confirmTemplateDelete(templateName: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new ConfirmDeleteTemplateModal(this.app, templateName, resolve);
            modal.open();
        });
    }

    /** Render daily writing goal progress banner */
    private renderWritingGoalBanner(container: HTMLElement): void {
        const goal = this.plugin.settings.dailyWordCountGoal ?? 0;
        if (!goal || !this.plugin.wordTracker) return;

        const tracker = this.plugin.wordTracker;
        const todayStats = tracker.getTodayStats();
        const wordsToday = todayStats?.wordsWritten ?? 0;
        const pct = Math.min(100, (wordsToday / goal) * 100);
        const met = wordsToday >= goal;
        const streak = (tracker as any).getWritingStreak?.() ?? 0;

        const banner = container.createDiv({
            cls: `storyteller-goal-banner${met ? ' storyteller-goal-banner--met' : ''}`
        });

        const top = banner.createDiv('storyteller-goal-banner-top');

        const labelEl = top.createDiv('storyteller-goal-banner-label');
        const labelIcon = labelEl.createSpan();
        setIcon(labelIcon, met ? 'check-circle' : 'target');
        labelEl.createSpan({ text: met ? ' Daily goal met!' : ' Daily writing goal' });

        top.createSpan({
            text: `${wordsToday.toLocaleString()} / ${goal.toLocaleString()} words`,
            cls: 'storyteller-goal-banner-count'
        });

        const barEl = banner.createDiv('storyteller-goal-bar');
        const fillEl = barEl.createDiv('storyteller-goal-fill');
        fillEl.style.width = `${pct}%`;

        if (streak > 1) {
            const streakEl = banner.createDiv('storyteller-goal-streak');
            const streakIcon = streakEl.createSpan();
            setIcon(streakIcon, 'flame');
            streakEl.createSpan({ text: ` ${streak}-day streak` });
        }
    }

    /** Render the Writing Analytics tab content */
    async renderAnalyticsContent(container: HTMLElement) {
        container.empty();

        const header = container.createDiv('storyteller-section-header');
        header.createEl('h3', { text: 'Writing Analytics' });

        const desc = container.createEl('p', {
            text: 'Track character screen time, POV distribution, writing velocity, foreshadowing, and more.',
            cls: 'storyteller-analytics-tab-desc'
        });

        const cached = this.plugin.settings.analyticsData;
        if (cached) {
            const summary = container.createDiv('storyteller-analytics-tab-summary');

            const grid = summary.createDiv('storyteller-analytics-tab-grid');

            const addStat = (label: string, value: string, icon: string) => {
                const card = grid.createDiv('storyteller-stat-card');
                const iconEl = card.createDiv('storyteller-stat-icon');
                setIcon(iconEl, icon);
                card.createDiv('storyteller-stat-value').setText(value);
                card.createDiv('storyteller-stat-label').setText(label);
            };

            addStat('Total Words', (cached.totalWords ?? 0).toLocaleString(), 'file-text');
            addStat('Characters', (cached.characterScreenTime?.length ?? 0).toString(), 'users');
            addStat('POVs', (cached.povStats?.length ?? 0).toString(), 'eye');
            addStat('Foreshadowing', (cached.foreshadowing?.length ?? 0).toString(), 'git-merge');

            const updated = container.createEl('p', {
                text: `Last updated: ${cached.lastUpdated ? new Date(cached.lastUpdated).toLocaleString() : 'never'}`,
                cls: 'storyteller-analytics-tab-updated'
            });
        } else {
            container.createEl('p', {
                text: 'No analytics data yet. Open the dashboard to calculate.',
                cls: 'u-muted'
            });
        }

        const openBtn = container.createEl('button', {
            cls: 'mod-cta storyteller-analytics-open-btn'
        });
        const btnIcon = openBtn.createSpan();
        setIcon(btnIcon, 'bar-chart-2');
        openBtn.createSpan({ text: ' Open Analytics Dashboard' });
        openBtn.addEventListener('click', () => {
            this.plugin.activateAnalyticsView();
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

        // Clean up network graph renderer
        if (this.networkGraphRenderer) {
            this.networkGraphRenderer.destroy();
            this.networkGraphRenderer = null;
        }
        
        // Event listeners are automatically cleaned up by registerEvent()
    }
}

/**
 * Confirmation modal for template deletion in dashboard
 */
class ConfirmDeleteTemplateModal extends Modal {
    private templateName: string;
    private onConfirm: (confirmed: boolean) => void;

    constructor(app: App, templateName: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.templateName = templateName;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: t('deleteTemplate') });
        contentEl.createEl('p', {
            text: t('confirmDeleteTemplate', this.templateName)
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '0.5rem';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.marginTop = '1rem';

        const cancelButton = buttonContainer.createEl('button', { text: t('cancel') });
        cancelButton.addEventListener('click', () => {
            this.onConfirm(false);
            this.close();
        });

        const deleteButton = buttonContainer.createEl('button', {
            text: t('delete'),
            cls: 'mod-warning'
        });
        deleteButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }
}
