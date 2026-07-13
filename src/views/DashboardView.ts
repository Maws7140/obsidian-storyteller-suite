 
 
import { ItemView, WorkspaceLeaf, Setting, Notice, App, ButtonComponent, TFile, debounce, Modal, Menu, setIcon } from 'obsidian'; // Added debounce
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
import { Character, Location, Event, PlotItem, GalleryImage, IndentedSceneRef, StoryDraft, CompileWorkflow, GraphFilters } from '../types'; // Import types
import { NewStoryModal } from '../modals/NewStoryModal';
import { GroupModal } from '../modals/GroupModal';
import { PlatformUtils } from '../utils/PlatformUtils';
import type { DashboardLayoutMode } from '../utils/PlatformUtils';
import {
    Template,
    TemplateFilter,
    TemplateGenre,
    TemplateCategory
} from '../templates/TemplateTypes';
import { TemplateEditorModal } from '../modals/TemplateEditorModal';
import { EconomyDetailModal } from '../modals/EconomyDetailModal';
import { WritingViewRenderers } from './WritingViewRenderers';
import type { CompileEngine as CompileEngineType } from '../compile';
import { confirmWithModal } from '../modals/ui/ConfirmModal';
import { DashboardRefreshCoordinator } from './dashboard/DashboardRefreshCoordinator';
import { DashboardMutationRunner } from './dashboard/DashboardMutationRunner';
import { createDashboardControllerRegistry } from './dashboard/controllers/DashboardControllerRegistry';
import type { DashboardControllerContext, DashboardTabController } from './dashboard/controllers/types';
import {
    captureDashboardStateSnapshot,
    restoreDashboardStateSnapshot,
} from './dashboard/DashboardStateSnapshot';
import { renderWritingChapterSceneList } from './dashboard/rendering/WritingListRenderer';

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

    /** Dashboard shell root. Layout mode hangs off this instead of five random selectors. */
    private dashboardRootEl: HTMLElement | null = null;
    
    /** Current filter text applied to entity lists */
    currentFilter: string = '';
    
    /** File input element reference for gallery image uploads */
    fileInput: HTMLInputElement | null = null;

    /** Currently active tab ID for automatic refresh */
    activeTabId: string = 'characters';

    /** Tab configuration mapping */
    tabs: Array<{ id: string; label: string; renderFn: (container: HTMLElement) => Promise<void> }>;

    // Responsive tabs UI state
    private tabHeaderRibbonEl: HTMLElement | null = null;
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
    private networkGraphRenderer: import('./NetworkGraphRenderer').NetworkGraphRenderer | null = null;

    /** Tab being dragged (ID), null when no drag is in progress */
    private _draggedTabId: string | null = null;

    /** Active view mode in the Writing tab */
    private _writingViewMode: 'list' | 'board' | 'arc' | 'heatmap' | 'holes' = 'list';
    /** Shared renderer instance for the four writing analysis views */
    private _writingRenderers: import('./WritingViewRenderers').WritingViewRenderers | null = null;

    /** Persist chapter expand/collapse state across re-renders (Writing tab) */
    private _chapterCollapseState = new Map<string, boolean>();

    /** Persist chapter-group expand/collapse state across re-renders (Scenes tab) */
    private _sceneGroupCollapseState = new Map<string, boolean>();

    /** Persist per-tab scroll positions (supports nested scrollable regions) */
    private _tabScrollPositions = new Map<string, { top: number; targetSelector?: string }>();
    /** Guard to avoid clobbering saved scroll positions during tab re-render */
    private _suppressScrollCapture = false;
    /** Prevent duplicate subscriptions when the sidebar view is reopened */
    private hasRegisteredViewListeners = false;
    /** Shared dashboard refresh scheduler */
    private refreshCoordinator: DashboardRefreshCoordinator;
    /** Shared dashboard mutation helper */
    private mutationRunner: DashboardMutationRunner;
    /** Migrated dashboard tab controllers */
    private controllerRegistry: Map<string, DashboardTabController>;
    /** Serialize active-tab refreshes so repeated events cannot append duplicate content */
    private isRefreshingActiveTab = false;
    private pendingActiveTabRefresh = false;

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
                window.clearTimeout(this.dismissalTimer);
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

    private isSimplifiedMobileDashboard(): boolean {
        return PlatformUtils.shouldUseSimplifiedUI();
    }

    private getDashboardLayoutMode(): DashboardLayoutMode {
        return PlatformUtils.getDashboardLayoutMode();
    }

    private applyDashboardLayoutMode(): void {
        if (!this.dashboardRootEl) return;

        const layoutMode = this.getDashboardLayoutMode();
        this.dashboardRootEl.dataset.layout = layoutMode;

        // Keep the old classes around for compatibility, but this data attr is the real contract now.
        this.dashboardRootEl.toggleClass('mobile-dashboard', layoutMode !== 'desktop');
        this.dashboardRootEl.toggleClass('storyteller-dashboard-simplified', layoutMode === 'phone');
        this.dashboardRootEl.toggleClass('storyteller-dashboard-tablet', layoutMode.startsWith('tablet'));
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
            { id: 'characters', label: t('characters'), renderFn: (c: HTMLElement) => this.renderCharactersContent(c) },
            { id: 'locations', label: t('locations'), renderFn: (c: HTMLElement) => this.renderLocationsContent(c) },
            { id: 'events', label: t('timeline'), renderFn: (c: HTMLElement) => this.renderEventsContent(c) },
            { id: 'items', label: t('items'), renderFn: (c: HTMLElement) => this.renderItemsContent(c) },
            { id: 'maps', label: 'Maps', renderFn: (c: HTMLElement) => this.renderMapsContent(c) },
            { id: 'network', label: t('networkGraph'), renderFn: (c: HTMLElement) => this.renderNetworkContent(c) },
            { id: 'gallery', label: t('gallery'), renderFn: (c: HTMLElement) => this.renderGalleryContent(c) },
            { id: 'groups', label: t('groups'), renderFn: (c: HTMLElement) => this.renderGroupsContent(c) },
            { id: 'references', label: t('references'), renderFn: (c: HTMLElement) => this.renderReferencesContent(c) },
            { id: 'writing', label: 'Writing', renderFn: (c: HTMLElement) => this.renderWritingContent(c) },
            { id: 'compile', label: t('compile'), renderFn: (c: HTMLElement) => this.renderCompileContent(c) },
            { id: 'cultures', label: t('cultures'), renderFn: (c: HTMLElement) => this.renderCulturesContent(c) },
            { id: 'economies', label: t('economies'), renderFn: (c: HTMLElement) => this.renderEconomiesContent(c) },
            { id: 'magicsystems', label: t('magicSystems'), renderFn: (c: HTMLElement) => this.renderMagicSystemsContent(c) },
            { id: 'compendium', label: 'Compendium', renderFn: (c: HTMLElement) => this.renderCompendiumContent(c) },
            { id: 'books', label: 'Books', renderFn: (c: HTMLElement) => this.renderBooksContent(c) },
            { id: 'campaign', label: 'Campaign', renderFn: (c: HTMLElement) => this.renderCampaignContent(c) },
            { id: 'templates', label: t('templates'), renderFn: (c: HTMLElement) => this.renderTemplatesContent(c) },
            { id: 'analytics', label: 'Analytics', renderFn: (c: HTMLElement) => this.renderAnalyticsContent(c) },
        ];

        this.applyTabOrder();
        this.refreshCoordinator = new DashboardRefreshCoordinator(() => this.refreshActiveTab(), 200);
        this.mutationRunner = new DashboardMutationRunner(this.app, this.refreshCoordinator);
        this.controllerRegistry = createDashboardControllerRegistry();
        
        // Initialize debounced search for mobile optimization
        this.debouncedSearch = debounce(async (filterFn: (filter: string) => Promise<void>) => {
            try {
                await filterFn(this.currentFilter);
                // Restore focus to search input on mobile after re-render
                if (PlatformUtils.isMobile() &&
                    this.getDashboardLayoutMode() !== 'phone' &&
                    this.currentSearchInput &&
                    activeDocument.activeElement !== this.currentSearchInput) {
                    // Small delay to ensure DOM is ready
                    window.setTimeout(() => {
                        if (this.currentSearchInput) {
                            this.currentSearchInput.focus();
                        }
                    }, 50);
                }
            } catch {
            	// intentional
                
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
            if (this.plugin.isRelevantDashboardFile(file.path)) {
                this.refreshCoordinator.requestRefresh({ source: 'vault', eventType: 'create', path: file.path });
            }
        }));

        // Listen for file modification events  
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (this.plugin.isRelevantDashboardFile(file.path)) {
                this.refreshCoordinator.requestRefresh({ source: 'vault', eventType: 'modify', path: file.path });
            }
        }));

        // Listen for file deletion events
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (this.plugin.isRelevantDashboardFile(file.path)) {
                this.refreshCoordinator.requestRefresh({ source: 'vault', eventType: 'delete', path: file.path });
            }
        }));

        // Listen for file rename events
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (this.plugin.isRelevantDashboardFile(file.path) || this.plugin.isRelevantDashboardFile(oldPath)) {
                this.refreshCoordinator.requestRefresh({ source: 'vault', eventType: 'rename', path: file.path, detail: oldPath });
            }
        }));

        // Listen for metadata changes (fires after Obsidian has processed the file)
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (this.plugin.isRelevantDashboardFile(file.path)) {
                    this.refreshCoordinator.requestRefresh({ source: 'vault', eventType: 'metadata-changed', path: file.path });
                }
            })
        );
    }

    /**
     * Refresh the currently active tab (with mobile typing protection)
     * Prevents refresh while user is actively typing on mobile to avoid keyboard dismissal
     */
    /** Public entry point for external callers (e.g. plugin) to trigger an active-tab refresh. */
    refreshCurrentTab(): void {
        void this.refreshActiveTab();
    }

    private async refreshActiveTab() {
        if (!this.tabContentContainer) {
            return;
        }

        if (this.isRefreshingActiveTab) {
            this.pendingActiveTabRefresh = true;
            return;
        }
        
        // On mobile, don't refresh while user is actively typing to prevent keyboard dismissal
        if (PlatformUtils.isMobile() && this.isUserTyping) {
            
            return;
        }
        
        const snapshot = captureDashboardStateSnapshot(this.currentSearchInput);
        
        const currentTabId = this.activeTabId;
        this.captureTabScrollState(currentTabId);

        const activeTab = this.tabs.find(tab => tab.id === currentTabId);
        if (activeTab) {
            try {
                this.isRefreshingActiveTab = true;
                this._suppressScrollCapture = true;
                await activeTab.renderFn(this.tabContentContainer);
                await this.restoreTabScroll(currentTabId);
                
                restoreDashboardStateSnapshot(
                    snapshot,
                    () => this.currentSearchInput,
                    (value) => {
                        this.currentFilter = value;
                    },
                    () => !this.isSimplifiedMobileDashboard()
                );
            } catch {
            	// intentional
                
            } finally {
                this._suppressScrollCapture = false;
                this.isRefreshingActiveTab = false;
                if (this.pendingActiveTabRefresh) {
                    this.pendingActiveTabRefresh = false;
                    queueMicrotask(() => { void this.refreshActiveTab(); });
                }
            }
        }
    }

    requestActiveTabRefresh(detail: string = 'manual-refresh'): void {
        this.refreshCoordinator.requestImmediateRefresh({ source: 'plugin', detail });
    }

    queueDashboardRefresh(detail: string): void {
        this.mutationRunner.requestRefresh('immediate', detail);
    }

    private getDashboardControllerContext(): DashboardControllerContext {
        return {
            app: this.app,
            plugin: this.plugin,
            getCurrentFilter: () => this.currentFilter,
            setCurrentFilter: (filter: string) => {
                this.currentFilter = filter.toLowerCase();
            },
            isSimplifiedMobileDashboard: () => this.isSimplifiedMobileDashboard(),
            renderWritingGoalBanner: (c: HTMLElement) => this.renderWritingGoalBanner(c),
            getWritingViewMode: () => this._writingViewMode,
            setWritingViewMode: (mode) => {
                this._writingViewMode = mode;
            },
            renderWritingMode: async (mode, container) => {
                switch (mode) {
                    case 'list':
                        await renderWritingChapterSceneList(container, {
                            app: this.app,
                            plugin: this.plugin,
                            currentFilter: this.currentFilter,
                            chapterCollapseState: this._chapterCollapseState,
                            getImageSrc: (p: string) => this.getImageSrc(p),
                            addEditButton: (c: HTMLElement, fn: () => void) => this.addEditButton(c, fn),
                            addDeleteButton: (c: HTMLElement, fn: () => Promise<void>) => this.addDeleteButton(c, fn),
                            addOpenFileButton: (c: HTMLElement, fp: string | undefined): import('obsidian').ButtonComponent | null => { this.addOpenFileButton(c, fp); return null; },
                            persistChapter: (ch, n, d) => this.persistChapterFromDashboard(ch, n, d),
                            persistScene: (sc, n, d) => this.persistSceneFromDashboard(sc, n, d),
                            removeChapter: (fp: string, d: string) => this.removeChapterFromDashboard(fp, d),
                            removeScene: (fp: string, d: string) => this.removeSceneFromDashboard(fp, d),
                            confirmDeleteChapter: (fp: string, cn: string, d: string) => this.confirmDeleteChapterFromDashboard(fp, cn, d),
                            confirmDeleteScene: (fp: string, sn: string, d: string) => this.confirmDeleteSceneFromDashboard(fp, sn, d),
                        });
                        break;
                    case 'board':
                        await this.renderKanbanBoard(container);
                        break;
                    case 'arc':
                        await this.renderArcChart(container);
                        break;
                    case 'heatmap':
                        await this.renderHeatmap(container);
                        break;
                    case 'holes':
                        await this.renderPlotHoles(container);
                        break;
                }
            },
            renderHeaderControls: (...args) => this.renderHeaderControls(...args),
            getImageSrc: (p: string) => this.getImageSrc(p),
            resolveLocationName: (v: string, locs: import('../types').Location[]) => this.resolveLocationName(v, locs),
            addEditButton: (c: HTMLElement, fn: () => void) => this.addEditButton(c, fn),
            addDeleteButton: (c: HTMLElement, fn: () => Promise<void>) => this.addDeleteButton(c, fn),
            addOpenFileButton: (c: HTMLElement, fp: string | undefined): import('obsidian').ButtonComponent | null => { this.addOpenFileButton(c, fp); return null; },
            mutationRunner: this.mutationRunner,
            queueDashboardRefresh: (d: string) => this.queueDashboardRefresh(d),
        };
    }

    private async renderWithController(tabId: string, container: HTMLElement, fallback: () => Promise<void>): Promise<void> {
        const controller = this.controllerRegistry.get(tabId);
        if (!controller) {
            await fallback();
            return;
        }
        await controller.render(container, this.getDashboardControllerContext());
    }

    private async persistChapterFromDashboard(chapter: import('../types').Chapter, successNotice: string, detail: string): Promise<void> {
        await this.mutationRunner.runUpdate({
            action: async () => {
                await this.plugin.saveChapter(chapter);
            },
            successNotice,
            refreshMode: 'immediate',
            refreshDetail: detail,
        });
    }

    private async persistSceneFromDashboard(scene: import('../types').Scene, successNotice: string, detail: string): Promise<void> {
        await this.mutationRunner.runUpdate({
            action: async () => {
                await this.plugin.saveScene(scene);
            },
            successNotice,
            refreshMode: 'immediate',
            refreshDetail: detail,
        });
    }

    private async removeChapterFromDashboard(filePath: string, detail: string): Promise<void> {
        await this.plugin.deleteChapter(filePath);
        this.queueDashboardRefresh(detail);
    }

    private async removeSceneFromDashboard(filePath: string, detail: string): Promise<void> {
        await this.plugin.deleteScene(filePath);
        this.queueDashboardRefresh(detail);
    }

    private async confirmDeleteChapterFromDashboard(filePath: string, chapterName: string, detail: string): Promise<void> {
        await this.mutationRunner.runDelete({
            confirmMessage: `Delete chapter "${chapterName}"?`,
            action: async () => {
                await this.plugin.deleteChapter(filePath);
            },
            refreshMode: 'immediate',
            refreshDetail: detail,
        });
    }

    private async confirmDeleteSceneFromDashboard(filePath: string, sceneName: string, detail: string): Promise<void> {
        await this.mutationRunner.runDelete({
            confirmMessage: `Delete scene "${sceneName}"?`,
            action: async () => {
                await this.plugin.deleteScene(filePath);
            },
            refreshMode: 'immediate',
            refreshDetail: detail,
        });
    }

    /**
     * Initialize and render the dashboard view
     * Called when the view is first opened or needs to be rebuilt
     */
    async onOpen() {
        this.containerEl.addClass('storyteller-dashboard-shell-host');

        const container = this.containerEl.children[1]; // View content container
        container.empty();
        container.addClass('storyteller-dashboard-view-container');
        this.dashboardRootEl = container as HTMLElement;

        // Apply mobile-specific classes
        const mobileClasses = PlatformUtils.getMobileCssClasses();
        mobileClasses.forEach(className => {
            container.addClass(className);
        });

        this.applyDashboardLayoutMode();
        container.toggleClass('storyteller-dashboard-accent-borders', !!this.plugin.settings.dashboardAccentBorders);

        // --- Create a Header Container ---
        const headerContainer = container.createDiv('storyteller-dashboard-header');

        // --- Header Top Row (title + selector/button) ---
        const headerTopRow = headerContainer.createDiv('storyteller-dashboard-header-top');

        // --- Title (inside the header top row) ---
        const titleEl = headerTopRow.createEl('h2', {
            cls: 'storyteller-dashboard-title'
        });

        titleEl.append(this.getDashboardLayoutMode() === 'phone' ? 'Storyteller' : t('dashboardTitle'));

        // --- Group for selector and button (mobile-optimized layout) ---
        const selectorButtonGroup = headerTopRow.createDiv('storyteller-selector-button-group');
        
        // Remove inline styles that force vertical stacking.
        // We will handle layout entirely in CSS (styles.css).


        // --- Story Selector or Custom Folders Indicator (mobile-optimized) ---
        const storySelector = selectorButtonGroup.createEl('select', { cls: 'storyteller-story-selector' });
        storySelector.id = 'storyteller-story-selector';

        if (PlatformUtils.isMobile()) {
            const touchTargetSize = PlatformUtils.getTouchTargetSize();
            storySelector.setCssStyles({ minHeight: `${touchTargetSize}px` });
            storySelector.setCssStyles({ fontSize: `${1.1 * PlatformUtils.getFontScaling()}rem` });
            storySelector.setCssStyles({ width: '100%' });
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
            void this.plugin.initializeOneStoryModeIfNeeded().then(() => this.onOpen());
        }
        storySelector.onchange = async (e) => {
            const id = (e.target as HTMLSelectElement).value;
            await this.plugin.setActiveStory(id);
            void this.onOpen();
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
                        new Notice(`Story "${name}" created and activated.`);
                        void this.onOpen();
                    }
                ).open();
            };
        }

        // --- Tab Headers (priority+ ribbon) ---
        // Place tabs as their own row below the header
        this.tabHeaderContainer = container.createDiv('storyteller-dashboard-tabs');
        this.tabHeaderContainer.setAttr('role', 'tablist');

        // Ribbon row (visible tabs)
        this.tabHeaderRibbonEl = this.tabHeaderContainer.createDiv('storyteller-tab-ribbon');

        // Responsive layout via ResizeObserver
        this.tabsResizeObserver?.disconnect();
        this.tabsResizeObserver = new ResizeObserver(() => {
            this.applyDashboardLayoutMode();
            this.layoutTabs();
            // Use requestAnimationFrame to ensure layout is complete before measuring
            window.requestAnimationFrame(() => {
                this.updateStickyOffsets(headerContainer);
            });
        });
        this.tabsResizeObserver.observe(this.tabHeaderContainer);

        // Initial layout and sticky offset
        this.layoutTabs();
        // Use requestAnimationFrame to ensure initial layout is complete
        window.requestAnimationFrame(() => {
            this.updateStickyOffsets(headerContainer);
        });

        // --- Tab Content ---
        this.tabContentContainer = container.createDiv('storyteller-dashboard-content');
        this.registerDomEvent(this.tabContentContainer, 'scroll', (evt: UIEvent) => {
            if (this._suppressScrollCapture) return;
            const target = evt.target instanceof HTMLElement ? evt.target : this.tabContentContainer;
            this.captureTabScrollState(this.activeTabId, target);
        }, { capture: true, passive: true });

        // Initial active state - use first visible tab if current tab is hidden
        const visibleTabs = this.getVisibleTabs();
        const initialTabId = visibleTabs.find(t => t.id === this.activeTabId)?.id || visibleTabs[0]?.id || this.tabs[0].id;
        await this.setActiveTab(initialTabId);

        if (!this.hasRegisteredViewListeners) {
            // --- Register Vault Event Listeners for Auto-refresh ---
            this.registerVaultEventListeners();

            // --- Register Workspace Resize Event Listener ---
            this.registerEvent(this.app.workspace.on('resize', () => {
                this.refreshCoordinator.requestRefresh({ source: 'manual', detail: 'workspace-resize' });
                // Relayout tabs and update offsets on window resize
                this.layoutTabs();
                window.requestAnimationFrame(() => {
                    this.updateStickyOffsets(headerContainer);
                });
            }));

            // --- Register Global Click Handler for Mobile Keyboard Dismissal ---
            if (PlatformUtils.isMobile()) {
                this.registerDomEvent(activeDocument, 'click', (e: MouseEvent) => {
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

            this.hasRegisteredViewListeners = true;
        }

    }

    /** Update layout to ensure proper spacing (no longer needed for sticky positioning) */
    private updateStickyOffsets(headerEl: HTMLElement): void {
        // This function is now primarily for maintaining compatibility
        // Since we switched to relative positioning, no offset calculation is needed
        try {
            if (!this.tabHeaderContainer || !headerEl) return;
            // Force a layout recalculation to ensure proper rendering
            this.tabHeaderContainer.setCssStyles({ display: 'flex' });
        } catch {
        	// intentional
            
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

        const isMobileLayout = this.getDashboardLayoutMode() !== 'desktop';

        // Mobile gets one horizontal tab rail everywhere so phones and tablets behave the same way.
        if (isMobileLayout) {
            this.tabHeaderRibbonEl.setCssStyles({ flexWrap: 'nowrap' });
            this.tabHeaderRibbonEl.setCssStyles({ overflowX: 'auto' });
            this.tabHeaderRibbonEl.setCssStyles({ overflowY: 'hidden' });
            this.tabHeaderRibbonEl.setCssStyles({ justifyContent: 'flex-start' });
            this.tabHeaderRibbonEl.setCssStyles({ rowGap: '0px' });

            this.tabHeaderContainer.setCssStyles({ overflowX: 'auto' });
            this.tabHeaderContainer.setCssStyles({ overflowY: 'hidden' });
        } else {
            this.tabHeaderRibbonEl.setCssStyles({ flexWrap: 'wrap' });
            this.tabHeaderRibbonEl.setCssStyles({ rowGap: '6px' });
            this.tabHeaderRibbonEl.setCssStyles({ overflowX: 'visible' });
            this.tabHeaderRibbonEl.setCssStyles({ overflowY: 'visible' });

            this.tabHeaderContainer.setCssStyles({ overflowX: 'visible' });
            this.tabHeaderContainer.setCssStyles({ overflowY: 'visible' });
        }

        // Reset
        this.tabHeaderRibbonEl.empty();

        const mode = this.getTabDisplayMode();
        const btnMode: 'compact' | 'normal' = (mode === 'normal') ? 'normal' : 'compact';

        for (const tab of this.getVisibleTabs()) {
            const btn = this.createTabButtonEl(tab, btnMode, false);
            this.tabHeaderRibbonEl.appendChild(btn);
        }

        this.syncActiveTabStyles();
    }

    private createTabButtonEl(tab: { id: string; label: string }, mode: 'normal' | 'compact', forMeasure = false): HTMLElement {
        const btn = createEl('button');
        btn.className = 'storyteller-tab-header';
        btn.setAttribute('role', 'tab');
        btn.dataset.tabId = tab.id;
        btn.title = mode === 'compact' ? tab.label : '';
        btn.setCssStyles({ display: 'inline-flex' });
        btn.setCssStyles({ alignItems: 'center' });
        btn.setCssStyles({ justifyContent: 'center' });
        btn.setCssStyles({ gap: '0.25rem' });
        btn.setCssStyles({ padding: '6px 10px' });
        btn.setCssStyles({ borderRadius: '6px' });
        if (!forMeasure) {
            btn.setCssStyles({ flex: '0 1 auto' });
            btn.setCssStyles({ minWidth: '96px' });
            btn.setCssStyles({ maxWidth: '220px' });
        }

        const labelSpan = createSpan();
        labelSpan.textContent = tab.label;
        // Always render label (icons removed); keep visible in all modes
        labelSpan.setCssStyles({ display: 'inline' });
        btn.appendChild(labelSpan);

        if (!forMeasure) {
            if (!this.isSimplifiedMobileDashboard()) {
                btn.setAttribute('draggable', 'true');
                btn.setCssStyles({ cursor: 'grab' });

                btn.addEventListener('dragstart', (e: DragEvent) => {
                    this._draggedTabId = tab.id;
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', tab.id);
                    }
                    btn.setCssStyles({ opacity: '0.45' });
                });

                btn.addEventListener('dragend', () => {
                    this._draggedTabId = null;
                    btn.setCssStyles({ opacity: '' });
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
            }

            btn.addEventListener('click', () => { void (async () => {
                await this.setActiveTab(tab.id);
            })(); });
        }
        return btn;
    }

    private captureTabScrollState(tabId: string, sourceEl?: HTMLElement): void {
        if (!this.tabContentContainer) return;
        const candidate = sourceEl ?? this.tabContentContainer;

        const isScrollable = (el: HTMLElement) => {
            if (el === this.tabContentContainer) return true;
            const style = window.getComputedStyle(el);
            const oy = style.overflowY;
            const allowsScroll = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
            return allowsScroll && el.scrollHeight > el.clientHeight + 1;
        };

        let targetEl: HTMLElement = this.tabContentContainer;
        if (candidate !== this.tabContentContainer && this.tabContentContainer.contains(candidate) && isScrollable(candidate)) {
            targetEl = candidate;
        }

        if (targetEl === this.tabContentContainer) {
            // Fallback scan: if a nested scroller currently holds position, prefer it.
            const nested = Array.from(this.tabContentContainer.querySelectorAll<HTMLElement>('*'))
                .filter(el => isScrollable(el) && el.scrollTop > 0)
                .sort((a, b) => b.scrollTop - a.scrollTop)[0];
            if (nested) targetEl = nested;
        }

        if (targetEl === this.tabContentContainer) {
            this._tabScrollPositions.set(tabId, { top: this.tabContentContainer.scrollTop });
            return;
        }

        const firstClass = Array.from(targetEl.classList)[0];
        const targetSelector = firstClass ? `.${firstClass}` : undefined;
        this._tabScrollPositions.set(tabId, {
            top: targetEl.scrollTop,
            targetSelector
        });
    }

    private async restoreTabScroll(tabId: string): Promise<void> {
        if (!this.tabContentContainer) return;
        const saved = this._tabScrollPositions.get(tabId);
        const target = saved?.top ?? 0;
        await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
                if (!this.tabContentContainer) {
                    resolve();
                    return;
                }
                let restored = false;
                if (saved?.targetSelector) {
                    const nested = this.tabContentContainer.querySelector<HTMLElement>(saved.targetSelector);
                    if (nested) {
                        nested.scrollTop = target;
                        restored = true;
                    }
                }
                if (!restored) {
                    this.tabContentContainer.scrollTop = target;
                }
                resolve();
            });
        });
    }

    private async setActiveTab(tabId: string) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        const previousTabId = this.activeTabId;
        if (this.tabContentContainer) {
            this.captureTabScrollState(previousTabId);
        }
        // Update state
        this.activeTabId = tabId;
        this.currentFilter = '';
        this.currentSearchInput = null;
        // Mark tab context for CSS entity card accent colors
        this.tabContentContainer.setAttr('data-tab', tabId);
        // Render content and restore scroll without capturing intermediate resets
        this._suppressScrollCapture = true;
        try {
            await tab.renderFn(this.tabContentContainer);
            await this.restoreTabScroll(tabId);
        } finally {
            this._suppressScrollCapture = false;
        }
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
            h.setCssStyles({ background: isActive ? 'var(--background-modifier-hover)' : 'transparent' });
            h.setCssStyles({ outline: 'none' });
        });
    }

    private queueSearchFilter(filterFn: (filter: string) => Promise<void>, value: string): void {
        this.currentFilter = value.toLowerCase();

        if (this.debouncedSearch) {
            this.debouncedSearch(filterFn);
            return;
        }

        void filterFn(this.currentFilter);
    }

    private decorateSearchInput(inputEl: HTMLInputElement): void {
        this.currentSearchInput = inputEl;

        if (!PlatformUtils.isMobile()) return;

        inputEl.autocomplete = 'off';
        inputEl.setAttribute('autocorrect', 'off');
        inputEl.setAttribute('autocapitalize', 'none');
        inputEl.spellcheck = false;

        inputEl.addClass('mobile-input');
        inputEl.addClass('search-input');

        if (PlatformUtils.isIOS()) {
            inputEl.setCssStyles({ fontSize: '1.1rem' });
        }

        const startTyping = () => {
            this.isUserTyping = true;
            inputEl.removeAttribute('data-user-dismissed');
            if (this.typingTimer) {
                window.clearTimeout(this.typingTimer);
            }
            this.typingTimer = window.setTimeout(() => {
                this.isUserTyping = false;
            }, 2000);
        };

        inputEl.addEventListener('input', startTyping);
        inputEl.addEventListener('focus', startTyping);

        inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            startTyping();
            if (e.key === 'Enter' && PlatformUtils.isMobile()) {
                this.markSearchInputDismissal();
                inputEl.blur();
                e.preventDefault();
            }
        });

        inputEl.addEventListener('blur', () => {
            this.isUserTyping = false;
            if (this.typingTimer) {
                window.clearTimeout(this.typingTimer);
                this.typingTimer = null;
            }
        });

        inputEl.addEventListener('focus', () => {
            inputEl.removeAttribute('data-user-dismissed');

            if (PlatformUtils.isMobile()) {
                inputEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        });

        inputEl.addEventListener('blur', () => {
            const userDismissed = inputEl.hasAttribute('data-user-dismissed');
            const shouldRestoreFocus = PlatformUtils.isMobile() && !this.isSimplifiedMobileDashboard();

            if (shouldRestoreFocus &&
                !userDismissed &&
                activeDocument.activeElement !== inputEl) {

                window.setTimeout(() => {
                    const stillUserDismissed = inputEl.hasAttribute('data-user-dismissed');
                    if (this.currentSearchInput === inputEl &&
                        !stillUserDismissed &&
                        activeDocument.activeElement !== inputEl &&
                        inputEl.isConnected) {
                        try {
                            inputEl.focus();
                        } catch {
                            // Ignore focus errors
                        }
                    }
                }, 10);
            }
        });
    }

    // --- Render Functions for Tab Content ---

    /**
     * Render the Characters tab content
     * Shows character list with filtering and management controls
     * @param container The container element to render content into
     */
    async renderCharactersContent(container: HTMLElement) {
        await this.renderWithController('characters', container, async () => {
        container.empty();
        this.renderHeaderControls(container, t('characters'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCharactersList(container);
        }, () => {
            new CharacterModal(this.app, this.plugin, null, async (char: Character) => {
                await this.mutationRunner.runCreate({
                    action: async () => {
                        await this.plugin.saveCharacter(char);
                    },
                    successNotice: `Character "${char.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'character-created',
                });
            }).open();
        });

        await this.renderCharactersList(container);
        });
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
            emptyMsg.setCssStyles({ color: 'var(--text-muted)' });
            emptyMsg.setCssStyles({ fontStyle: 'italic' });
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
        await this.renderWithController('locations', container, async () => {
        container.empty();
        this.renderHeaderControls(container, t('locations'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderLocationsList(container);
        }, () => {
            new LocationModal(this.app, this.plugin, null, async (loc: Location) => {
                await this.mutationRunner.runCreate({
                    action: async () => {
                        await this.plugin.saveLocation(loc);
                    },
                    successNotice: `Location "${loc.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'location-created',
                });
            }).open();
        }, t('createLocation'));

        await this.renderLocationsList(container);
        });
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
        await this.renderWithController('events', container, async () => {
        container.empty();
        this.renderHeaderControls(container, t('events'), async (filter: string) => {
            this.currentFilter = filter;
            await this.renderEventsList(container);
        }, () => {
            new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                await this.mutationRunner.runCreate({
                    action: async () => {
                        await this.plugin.saveEvent(eventData);
                    },
                    successNotice: `Event "${eventData.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'event-created',
                });
            }).open();
        }, t('createNew'), (setting: Setting) => {
            setting.addButton(button => button
                .setButtonText(t('viewTimeline'))
                .setCta()
                .onClick(() => {
                    void this.plugin.activateTimelineView();
                }));
        });

        await this.renderEventsList(container);
        });
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

        const listContainer = container.createDiv('storyteller-list-container storyteller-events-list-container');
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
        await this.renderWithController('items', container, async () => {
        container.empty();
        let showPlotCriticalOnly = false; // State for the filter toggle

        const controlsGroup = container.createDiv('storyteller-controls-group');
        new Setting(controlsGroup)
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
                            await this.mutationRunner.runCreate({
                                action: async () => {
                                    await this.plugin.savePlotItem(item);
                                },
                                successNotice: `Item "${item.name}" created.`,
                                refreshMode: 'immediate',
                                refreshDetail: 'plot-item-created',
                            });
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });

        await this.renderItemsList(container, showPlotCriticalOnly);
        });
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
                titleEl.setCssStyles({ color: 'var(--text-accent)' });
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
                    await this.mutationRunner.runUpdate({
                        action: async () => {
                            await this.plugin.savePlotItem(updatedData);
                        },
                        successNotice: `Item "${updatedData.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'plot-item-updated',
                    });
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (item.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Are you sure you want to delete "${item.name}"?`,
                        action: async () => {
                            await this.plugin.deletePlotItem(item.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'plot-item-deleted',
                    });
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
        await this.renderWithController('maps', container, async () => {
        container.empty();
        const openMapsPanel = async () => {
            await this.plugin.activateMapView();
        };
        this.renderHeaderControls(
            container,
            'Maps',
            async (filter: string) => {
                this.currentFilter = filter;
                await this.renderMapsList(container);
            },
            () => {
                if (!this.plugin.getActiveStory()) {
                    new Notice(t('selectOrCreateStoryFirst'));
                    return;
                }
                void import('../utils/MapModalHelper').then(({ openMapModal }) => {
                    openMapModal(this.app, this.plugin, null, {
                        onSave: async () => {
                            this.mutationRunner.requestRefresh('immediate', 'map-created');
                        }
                    });
                });
            },
            t('createNew'),
            (setting) => {
                setting.addButton(button => {
                    button
                        .setIcon('panel-right-open')
                        .setTooltip('Open maps panel')
                        .onClick(() => {
                            void openMapsPanel();
                        });
                });
            },
            (menu) => {
                menu.addItem(item => {
                    item.setTitle('Open maps panel');
                    item.setIcon('panel-right-open');
                    item.onClick(() => {
                        void openMapsPanel();
                    });
                });
            }
        );

        await this.renderMapsList(container);
        });
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
            this.addOpenMapViewButton(actionsEl, map.id || map.name);
            this.addEditButton(actionsEl, () => {
                void import('../utils/MapModalHelper').then(({ openMapModal }) => {
                    openMapModal(this.app, this.plugin, map, {
                        onSave: async () => {
                            this.mutationRunner.requestRefresh('immediate', 'map-updated');
                        },
                        onDelete: async () => {
                            this.mutationRunner.requestRefresh('immediate', 'map-deleted-from-modal');
                        }
                    });
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (map.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Delete map "${map.name}"?`,
                        action: async () => {
                            await this.plugin.deleteMap(map.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'map-deleted-from-dashboard',
                    });
                }
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
        controlsContainer.setCssStyles({ marginBottom: '1rem' });
        controlsContainer.setCssStyles({ padding: '1rem' });
        controlsContainer.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        controlsContainer.setCssStyles({ borderRadius: '8px' });
        controlsContainer.setCssStyles({ display: 'flex' });
        controlsContainer.setCssStyles({ gap: '1rem' });
        controlsContainer.setCssStyles({ flexWrap: 'wrap' });
        controlsContainer.setCssStyles({ alignItems: 'center' });

        // Use class property for graph renderer persistence
        let graphRenderer: import('./NetworkGraphRenderer').NetworkGraphRenderer | null = this.networkGraphRenderer;

        // Search box
        const searchContainer = controlsContainer.createDiv();
        searchContainer.setCssStyles({ flex: '1 1 300px' });
        searchContainer.setCssStyles({ minWidth: '200px' });
        
        const searchInput = searchContainer.createEl('input', { 
            type: 'text',
            placeholder: t('searchEntities')
        });
        searchInput.setCssStyles({ width: '100%' });
        searchInput.setCssStyles({ padding: '6px 12px' });
        searchInput.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        searchInput.setCssStyles({ borderRadius: '4px' });
        searchInput.setCssStyles({ backgroundColor: 'var(--background-primary)' });
        searchInput.setCssStyles({ color: 'var(--text-normal)' });
        
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
        zoomContainer.setCssStyles({ display: 'flex' });
        zoomContainer.setCssStyles({ gap: '0.5rem' });
        
        const createControlButton = (text: string, title: string, onClick: () => void) => {
            const btn = zoomContainer.createEl('button', { text });
            btn.title = title;
            btn.setCssStyles({ padding: '6px 12px' });
            btn.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
            btn.setCssStyles({ borderRadius: '4px' });
            btn.setCssStyles({ backgroundColor: 'var(--background-primary)' });
            btn.setCssStyles({ color: 'var(--text-normal)' });
            btn.setCssStyles({ cursor: 'pointer' });
            btn.setCssStyles({ fontSize: '14px' });
            btn.setCssStyles({ fontWeight: '600' });
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.setCssStyles({ backgroundColor: 'var(--background-modifier-hover)' });
            });
            btn.addEventListener('mouseleave', () => {
                btn.setCssStyles({ backgroundColor: 'var(--background-primary)' });
            });
            return btn;
        };

        createControlButton('+', t('zoomIn'), () => graphRenderer?.zoomIn());
        createControlButton('−', t('zoomOut'), () => graphRenderer?.zoomOut());
        createControlButton('⊡', t('fitToView'), () => graphRenderer?.fitToView());

        // Layout selector
        const layoutContainer = controlsContainer.createDiv();
        layoutContainer.setCssStyles({ display: 'flex' });
        layoutContainer.setCssStyles({ alignItems: 'center' });
        layoutContainer.setCssStyles({ gap: '0.5rem' });
        
        const layoutLabel = layoutContainer.createSpan({ text: t('layout') + ':' });
        layoutLabel.setCssStyles({ fontSize: '13px' });
        layoutLabel.setCssStyles({ color: 'var(--text-muted)' });
        
        const layoutSelect = layoutContainer.createEl('select');
        layoutSelect.setCssStyles({ padding: '6px 12px' });
        layoutSelect.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        layoutSelect.setCssStyles({ borderRadius: '4px' });
        layoutSelect.setCssStyles({ backgroundColor: 'var(--background-primary)' });
        layoutSelect.setCssStyles({ color: 'var(--text-normal)' });
        layoutSelect.setCssStyles({ cursor: 'pointer' });
        
        const layouts = [
            { value: 'cose', label: t('forceDirected') },
            { value: 'circle', label: t('circle') },
            { value: 'grid', label: t('grid') },
            { value: 'concentric', label: t('concentric') }
        ];
        
        layouts.forEach(layout => {
            layoutSelect.createEl('option', { 
                text: layout.label,
                value: layout.value
            });
        });
        
        layoutSelect.addEventListener('change', () => {
            if (graphRenderer) {
                graphRenderer.changeLayout(layoutSelect.value as 'cose' | 'circle' | 'grid' | 'concentric');
            }
        });
        
        // Expand buttons - Open in Panel and Modal
        const expandContainer = controlsContainer.createDiv();
        expandContainer.setCssStyles({ display: 'flex' });
        expandContainer.setCssStyles({ gap: '0.5rem' });
        expandContainer.setCssStyles({ marginLeft: 'auto' });
        
        const createExpandButton = (text: string, title: string, onClick: () => void) => {
            const btn = expandContainer.createEl('button', { text });
            btn.title = title;
            btn.setCssStyles({ padding: '6px 12px' });
            btn.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
            btn.setCssStyles({ borderRadius: '4px' });
            btn.setCssStyles({ backgroundColor: 'var(--interactive-accent)' });
            btn.setCssStyles({ color: 'var(--text-on-accent)' });
            btn.setCssStyles({ cursor: 'pointer' });
            btn.setCssStyles({ fontSize: '13px' });
            btn.setCssStyles({ fontWeight: '500' });
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.setCssStyles({ backgroundColor: 'var(--interactive-accent-hover)' });
            });
            btn.addEventListener('mouseleave', () => {
                btn.setCssStyles({ backgroundColor: 'var(--interactive-accent)' });
            });
            return btn;
        };

        createExpandButton(t('openInPanel'), t('openInPanel'), () => { void (async () => {
            await this.openNetworkGraphInPanel();
        })(); });
        
        // Create filters container
        const filtersContainer = container.createDiv('storyteller-network-filters');
        filtersContainer.setCssStyles({ marginBottom: '1rem' });
        filtersContainer.setCssStyles({ padding: '1rem' });
        filtersContainer.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        filtersContainer.setCssStyles({ borderRadius: '8px' });

        // Filter state
        let currentFilters: GraphFilters = {
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
                    groups.forEach(g => { dropdown.addOption(g.id, g.name); });
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
        entityTypeContainer.setCssStyles({ display: 'flex' });
        entityTypeContainer.setCssStyles({ gap: '1rem' });
        entityTypeContainer.setCssStyles({ flexWrap: 'wrap' });

        const entityTypes = ['character', 'location', 'event', 'item'] as const;
        entityTypes.forEach(type => {
            const checkboxContainer = entityTypeContainer.createDiv();
            checkboxContainer.setCssStyles({ display: 'flex' });
            checkboxContainer.setCssStyles({ alignItems: 'center' });
            checkboxContainer.setCssStyles({ gap: '0.5rem' });

            const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
            checkbox.checked = true;
            checkbox.id = `entity-type-${type}`;
            checkbox.onchange = async () => {
                if (checkbox.checked) {
                    if (!(currentFilters.entityTypes ?? []).includes(type)) {
                        (currentFilters.entityTypes ??= []).push(type);
                    }
                } else {
                    currentFilters.entityTypes = (currentFilters.entityTypes ?? []).filter((t) => t !== type);
                }
                if (graphRenderer) {
                    await graphRenderer.applyFilters(currentFilters);
                }
            };

            const labelText = { character: 'Characters', location: 'Locations', event: 'Events', item: 'Items' }[type] ?? type;
            const label = checkboxContainer.createEl('label', { text: labelText });
            label.htmlFor = `entity-type-${type}`;
            label.setCssStyles({ cursor: 'pointer' });
        });

        // Timeline filters
        const timelineFilterSetting = new Setting(filtersContainer)
            .setName(t('filterByTimeline'))
            .setDesc(t('timelineStart') + t('timelineRangeSeparator') + t('timelineEnd'));

        const timelineContainer = timelineFilterSetting.controlEl.createDiv();
        timelineContainer.setCssStyles({ display: 'flex' });
        timelineContainer.setCssStyles({ gap: '0.5rem' });
        timelineContainer.setCssStyles({ alignItems: 'center' });

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
        graphContainer.setCssStyles({ marginBottom: '1rem' });

        // Initialize graph renderer (legend is now built-in to the renderer)
        try {
            graphRenderer = new NetworkGraphRenderer(graphContainer, this.plugin);
            await graphRenderer.initializeCytoscape();
            // Store renderer instance for future refreshes
            this.networkGraphRenderer = graphRenderer;
        } catch (err) {
            console.error('[Storyteller] Dashboard network graph init error:', err);
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
                this.fileInput.multiple = true;

                this.fileInput.onchange = async (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (!files || files.length === 0) {
                        return; // No file selected
                    }

                    try {
                        const { imported, failed } = await this.plugin.importGalleryUploads(Array.from(files));
                        if (imported.length === 1 && failed.length === 0) {
                            await refreshCallback();
                            new ImageDetailModal(this.app, this.plugin, imported[0], true, refreshCallback).open();
                        } else {
                            await refreshCallback();
                            if (imported.length > 0) {
                                new Notice(`Added ${imported.length} image${imported.length === 1 ? '' : 's'} to the gallery.`);
                            }
                            if (failed.length > 0) {
                                new Notice(`Failed to import ${failed.length} image${failed.length === 1 ? '' : 's'}. Check console for details.`);
                            }
                        }
                    } catch {
                        
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

        await this.plugin.syncGalleryWatchFolder();
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

    private getGroupDescriptionPreview(description: string, maxLength = 160): string {
        const plainText = description
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[#>*_~|[\]-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (plainText.length <= maxLength) {
            return plainText;
        }

        return `${plainText.substring(0, maxLength).trimEnd()}...`;
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
            emptyMsg.setCssStyles({ color: 'var(--text-muted)' });
            emptyMsg.setCssStyles({ fontStyle: 'italic' });
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
                try { img.src = this.getImageSrc(group.profileImagePath); } catch { /* ignore */ }
            }
            infoDiv.createEl('strong', { text: group.name });
            if (group.description) {
                const descEl = infoDiv.createEl('span', {
                    text: this.getGroupDescriptionPreview(group.description),
                    cls: 'storyteller-group-desc'
                });
                descEl.title = 'Open or edit the group to view the full description.';
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
                    async () => { this.queueDashboardRefresh('group-updated'); },
                    async (groupId) => {
                        await this.plugin.deleteGroup(groupId);
                        this.queueDashboardRefresh('group-deleted');
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
                            const linkPath = filePath;
                            li.classList.add('is-link');
                            li.addEventListener('click', (e) => {
                                e.stopPropagation();
                                void this.app.workspace.openLinkText(linkPath, '', false);
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
    private renderHeaderControls(container: HTMLElement, title: string, filterFn: (filter: string) => Promise<void>, addFn: () => void, addButtonText: string = t('createNew'), extendButtons?: (s: Setting) => void, extendMobileActions?: (menu: Menu) => void) {
        const controlsGroup = container.createDiv('storyteller-controls-group');
        controlsGroup.setCssStyles({ display: 'flex' });
        controlsGroup.setCssStyles({ alignItems: 'center' });
        controlsGroup.setCssStyles({ gap: '0.5em' });
        
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

        if (this.isSimplifiedMobileDashboard()) {
            controlsGroup.addClass('storyteller-controls-group--mobile');

            const searchRow = controlsGroup.createDiv('storyteller-controls-search-row');
            const searchWrap = searchRow.createDiv('storyteller-search-input-wrap');
            const searchIconEl = searchWrap.createSpan({ cls: 'storyteller-search-input-icon' });
            setIcon(searchIconEl, 'search');

            const searchInput = searchWrap.createEl('input', {
                type: 'text',
                cls: 'storyteller-dashboard-search-input',
                attr: {
                    placeholder: t('searchX', title.toLowerCase()),
                    'aria-label': `Search ${title.toLowerCase()}`
                }
            });
            searchInput.value = this.currentFilter;
            searchInput.addEventListener('input', () => {
                this.queueSearchFilter(filterFn, searchInput.value);
            });
            this.decorateSearchInput(searchInput);

            const actionRow = controlsGroup.createDiv('storyteller-controls-action-row');
            actionRow.createSpan({ cls: 'storyteller-controls-section-label', text: title });

            const actionButtons = actionRow.createDiv('storyteller-controls-action-buttons');

            const primaryButton = actionButtons.createEl('button', {
                cls: 'mod-cta storyteller-controls-primary-btn',
                text: addButtonText
            });
            primaryButton.type = 'button';
            primaryButton.addEventListener('click', () => {
                if (entityType) {
                    try { this.plugin.getEntityFolder(entityType); }
                    catch { new Notice('Select or create a story first.'); return; }
                }
                addFn();
            });
            if (!canCreate) {
                primaryButton.disabled = true;
                primaryButton.title = 'Select or create a story first.';
            }

            if (extendMobileActions) {
                const moreButton = actionButtons.createEl('button', {
                    cls: 'storyteller-controls-more-btn'
                });
                moreButton.type = 'button';
                moreButton.setAttribute('aria-label', `${title} actions`);
                setIcon(moreButton.createSpan(), 'more-horizontal');
                moreButton.addEventListener('click', (event: MouseEvent) => {
                    const menu = new Menu();
                    extendMobileActions(menu);
                    menu.showAtMouseEvent(event);
                });
            }

            return;
        }

        const headerSetting = new Setting(controlsGroup)
            .setName(t('filterX', title.toLowerCase()))
            .setDesc('')
            .addText(text => {
                const component = text
                    .setPlaceholder(t('searchX', title.toLowerCase()))
                    .onChange(async (value) => {
                        this.queueSearchFilter(filterFn, value);
                    });
                this.decorateSearchInput(component.inputEl);
                
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
        await this.renderWithController('references', container, async () => {
            container.empty();
            this.renderHeaderControls(container, 'References', async (filter: string) => {
                this.currentFilter = filter;
                await this.renderReferencesList(container);
            }, () => {
                void import('../modals/ReferenceModal').then(({ ReferenceModal }) => {
                    new ReferenceModal(this.app, this.plugin, null, async (ref) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveReference(ref);
                            },
                            successNotice: `Reference "${ref.name}" created.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'reference-created',
                        });
                    }).open();
                });
            }, t('createNew'));

            await this.renderReferencesList(container);
        });
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
                } catch {
                    pfpContainer.createSpan({ text: '?' });
                }
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: ref.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: ref.name });
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
                void import('../modals/ReferenceModal').then(({ ReferenceModal }) => {
                    new ReferenceModal(this.app, this.plugin, ref, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveReference(updated);
                            },
                            successNotice: `Reference "${updated.name}" updated.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'reference-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteReference(toDelete.filePath);
                            this.queueDashboardRefresh('reference-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (ref.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Delete reference "${ref.name}"?`,
                        action: async () => {
                            await this.plugin.deleteReference(ref.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'reference-deleted',
                    });
                }
            });
            this.addOpenFileButton(actionsEl, ref.filePath);
        });
    }

    /** Render the Writing tab — includes view mode switcher */
    async renderWritingContent(container: HTMLElement) {
        await this.renderWithController('writing', container, async () => {
        container.empty();
        this.renderWritingGoalBanner(container);

        // ── View mode switcher ─────────────────────────────────────────────
        const switcher = container.createDiv(`storyteller-writing-switcher${this.isSimplifiedMobileDashboard() ? ' storyteller-writing-switcher--mobile' : ''}`);
        const modes: Array<{ id: 'list' | 'board' | 'arc' | 'heatmap' | 'holes'; icon: string; label: string }> = [
            { id: 'list',    icon: 'list',           label: 'List'     },
            { id: 'board',   icon: 'columns-3',      label: 'Board'    },
            { id: 'arc',     icon: 'activity',       label: 'Arc'      },
            { id: 'heatmap', icon: 'grid',           label: 'Heatmap'  },
            { id: 'holes',   icon: 'shield-alert',   label: 'Holes'    },
        ];
        const renderActive = async () => {
            const existing = container.querySelector('.storyteller-writing-view-body');
            if (existing) existing.remove();
            const body = container.createDiv('storyteller-writing-view-body');
            switch (this._writingViewMode) {
                case 'list':    await this.renderChaptersWithScenesList(body); break;
                case 'board':   await this.renderKanbanBoard(body); break;
                case 'arc':     await this.renderArcChart(body); break;
                case 'heatmap': await this.renderHeatmap(body); break;
                case 'holes':   await this.renderPlotHoles(body); break;
            }
        };
        // Pop-out button — created first so updatePopOut can reference it
        const popOutBtn = switcher.createEl('button', {
            cls: 'storyteller-switcher-btn storyteller-switcher-popout',
        });

        // Updates the pop-out button to reflect the currently active view mode
        const updatePopOut = () => {
            popOutBtn.empty();
            const panelMode = this._writingViewMode === 'list' ? 'board' : this._writingViewMode;
            const modeInfo = modes.find(m => m.id === panelMode) ?? modes[1];
            setIcon(popOutBtn.createSpan(''), modeInfo.icon);
            const lbl = popOutBtn.createSpan({ cls: 'storyteller-popout-label' });
            lbl.setText(`Open ${modeInfo.label}`);
            setIcon(popOutBtn.createSpan(''), 'panel-right-open');
            popOutBtn.title = `Open ${modeInfo.label} in panel`;
        };

        if (this.isSimplifiedMobileDashboard()) {
            const modeSelect = switcher.createEl('select', {
                cls: 'storyteller-writing-mode-select',
                attr: {
                    'aria-label': 'Writing view mode'
                }
            });
            modes.forEach(mode => {
                modeSelect.createEl('option', { text: mode.label, value: mode.id });
            });
            modeSelect.value = this._writingViewMode;
            modeSelect.addEventListener('change', () => { void (async () => {
                this._writingViewMode = modeSelect.value as typeof this._writingViewMode;
                updatePopOut();
                await renderActive();
            })(); });
            switcher.prepend(modeSelect);
        } else {
            modes.forEach(m => {
                const btn = switcher.createEl('button', {
                    cls: `storyteller-switcher-btn${this._writingViewMode === m.id ? ' is-active' : ''}`
                });
                setIcon(btn.createSpan(), m.icon);
                btn.createSpan({ text: m.label });
                btn.addEventListener('click', () => { void (async () => {
                    this._writingViewMode = m.id;
                    switcher.querySelectorAll('.storyteller-switcher-btn:not(.storyteller-switcher-popout)')
                        .forEach(b => b.removeClass('is-active'));
                    btn.addClass('is-active');
                    updatePopOut();
                    await renderActive();
                })(); });
            });
        }

        updatePopOut(); // set initial state

        popOutBtn.onclick = () => {
            const mode = this._writingViewMode === 'list' ? 'board' : this._writingViewMode;
            void this.plugin.activateWritingPanelView(mode);
        };

        // ── Header controls (search + add buttons, only for list/board) ──
        this.renderHeaderControls(
            container,
            'Writing',
            async (filter: string) => {
                this.currentFilter = filter;
                await renderActive();
            },
            () => {
                void import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, null, async (ch) => {
                        await this.persistChapterFromDashboard(ch, `Chapter "${ch.name}" created.`, 'writing-chapter-created');
                    }).open();
                });
            },
            'Add Chapter',
            (s) => {
                s.addButton(btn => {
                    btn.setButtonText('Add scene').onClick(() => {
                        void import('../modals/SceneModal').then(({ SceneModal }) => {
                            new SceneModal(this.app, this.plugin, null, async (sc) => {
                                await this.persistSceneFromDashboard(sc, `Scene "${sc.name}" created.`, 'writing-scene-created');
                            }).open();
                        });
                    });
                });
                s.addButton(btn => {
                    btn.setIcon('layout-dashboard').setTooltip('Open story board canvas').onClick(async () => {
                        await this.plugin.openStoryBoard();
                    });
                });
            },
            (menu) => {
                menu.addItem(item => {
                    item.setTitle('Add scene');
                    item.setIcon('plus-circle');
                    item.onClick(() => {
                        void import('../modals/SceneModal').then(({ SceneModal }) => {
                            new SceneModal(this.app, this.plugin, null, async (sc) => {
                                await this.persistSceneFromDashboard(sc, `Scene "${sc.name}" created.`, 'writing-scene-created-menu');
                            }).open();
                        });
                    });
                });
                menu.addItem(item => {
                    item.setTitle('Open story board');
                    item.setIcon('layout-dashboard');
                    item.onClick(() => {
                        void this.plugin.openStoryBoard();
                    });
                });
            }
        );

        await renderActive();
        });
    }

    async renderChaptersContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Chapters', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderChaptersWithScenesList(container);
        }, () => {
            void import('../modals/ChapterModal').then(({ ChapterModal }) => {
                new ChapterModal(this.app, this.plugin, null, async (ch) => {
                    await this.persistChapterFromDashboard(ch, `Chapter "${ch.name}" created.`, 'chapters-tab-created');
                }).open();
            });
        }, t('createNew'));

        await this.renderChaptersWithScenesList(container);
    }

    /** Render chapters with their scenes nested underneath */
    private async renderChaptersWithScenesList(container: HTMLElement) {
        await renderWritingChapterSceneList(container, {
            app: this.app,
            plugin: this.plugin,
            currentFilter: this.currentFilter,
            chapterCollapseState: this._chapterCollapseState,
            getImageSrc: (p: string) => this.getImageSrc(p),
            addEditButton: (c: HTMLElement, fn: () => void) => this.addEditButton(c, fn),
            addDeleteButton: (c: HTMLElement, fn: () => Promise<void>) => this.addDeleteButton(c, fn),
            addOpenFileButton: (c: HTMLElement, fp: string | undefined): import('obsidian').ButtonComponent | null => { this.addOpenFileButton(c, fp); return null; },
            persistChapter: (ch, n, d) => this.persistChapterFromDashboard(ch, n, d),
            persistScene: (sc, n, d) => this.persistSceneFromDashboard(sc, n, d),
            removeChapter: (fp: string, d: string) => this.removeChapterFromDashboard(fp, d),
            removeScene: (fp: string, d: string) => this.removeSceneFromDashboard(fp, d),
            confirmDeleteChapter: (fp: string, cn: string, d: string) => this.confirmDeleteChapterFromDashboard(fp, cn, d),
            confirmDeleteScene: (fp: string, sn: string, d: string) => this.confirmDeleteSceneFromDashboard(fp, sn, d),
        });
        // The old inline renderer under this was dead weight. Leaving it live is how this file gets gross again.
        return;
        /*
        const existingListContainer = container.querySelector('.storyteller-list-container');
        existingListContainer?.remove();

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
            setIcon(toggleBtn, 'chevron-down');
            
            const pfpContainer = chapterHeader.createDiv('storyteller-list-item-pfp');
            if (ch.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    imgEl.src = this.getImageSrc(ch.profileImagePath);
                    imgEl.alt = ch.name;
                } catch {
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
            // Inline edit button — always visible on the chapter title row
            const chapterEditBtn = titleRow.createEl('button', { cls: 'storyteller-chapter-inline-edit' });
            setIcon(chapterEditBtn, 'pencil');
            chapterEditBtn.title = 'Edit chapter';
            chapterEditBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, ch, async (updated) => {
                        await this.persistChapterFromDashboard(updated, `Chapter "${updated.name}" updated.`, 'writing-inline-chapter-updated');
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.removeChapterFromDashboard(toDelete.filePath, 'writing-inline-chapter-deleted');
                        }
                    }).open();
                });
            });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${chapterScenes.length} scene${chapterScenes.length !== 1 ? 's' : ''}` });
            if (ch.bookName) {
                titleRow.createSpan({ cls: 'storyteller-meta-badge storyteller-book-badge', text: ch.bookName });
            }

            if (ch.summary) {
                const preview = ch.summary.length > 100 ? ch.summary.substring(0, 100) + '…' : ch.summary;
                infoEl.createEl('p', { text: preview, cls: 'storyteller-chapter-summary' });
            }

            const actionsEl = chapterHeader.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, ch, async (updated) => {
                        await this.persistChapterFromDashboard(updated, `Chapter "${updated.name}" updated.`, 'writing-chapter-updated');
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.removeChapterFromDashboard(toDelete.filePath, 'writing-chapter-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (ch.filePath) {
                    await this.confirmDeleteChapterFromDashboard(ch.filePath, ch.name, 'writing-chapter-deleted');
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
                        await this.persistSceneFromDashboard(sc, `Scene "${sc.name}" created in chapter "${ch.name}".`, 'writing-scene-created-in-chapter');
                    }).open();
                });
            };

            // Toggle expand/collapse — persist state across re-renders
            const chapterKey = ch.id || ch.name;
            let isExpanded = this._chapterCollapseState.has(chapterKey) ? this._chapterCollapseState.get(chapterKey)! : true;
            if (!isExpanded) {
                scenesContainer.setCssStyles({ display: 'none' });
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._chapterCollapseState.set(chapterKey, isExpanded);
                scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
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
            setIcon(toggleBtn, 'chevron-down');
            
            const pfpContainer = unassignedHeader.createDiv('storyteller-list-item-pfp');
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder storyteller-unassigned-badge', text: '?' });
            
            const infoEl = unassignedHeader.createDiv('storyteller-list-item-info');
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: 'Unassigned scenes' });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${unassignedScenes.length} scene${unassignedScenes.length !== 1 ? 's' : ''}` });

            const scenesContainer = unassignedGroup.createDiv('storyteller-chapter-scenes');
            unassignedScenes.forEach(sc => {
                this.renderSceneItem(scenesContainer, sc, true, chapters);
            });

            const unassignedKey = '__unassigned__';
            let isExpanded = this._chapterCollapseState.has(unassignedKey) ? this._chapterCollapseState.get(unassignedKey)! : true;
            if (!isExpanded) {
                scenesContainer.setCssStyles({ display: 'none' });
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._chapterCollapseState.set(unassignedKey, isExpanded);
                scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }
        */
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
                } catch {
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
                void import('../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(this.app, this.plugin, ch, async (updated) => {
                        await this.persistChapterFromDashboard(updated, `Chapter "${updated.name}" updated.`, 'chapters-tab-updated');
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.removeChapterFromDashboard(toDelete.filePath, 'chapters-tab-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (ch.filePath) {
                    await this.confirmDeleteChapterFromDashboard(ch.filePath, ch.name, 'chapters-tab-deleted');
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
            void import('../modals/SceneModal').then(({ SceneModal }) => {
                new SceneModal(this.app, this.plugin, null, async (sc) => {
                    await this.persistSceneFromDashboard(sc, `Scene "${sc.name}" created.`, 'scenes-tab-created');
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
            listContainer.createEl('p', { text: 'No scenes found.' + (this.currentFilter ? ' Matching current filter.' : '') });
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
            setIcon(toggleBtn, 'chevron-down');
            
            const infoEl = chapterHeader.createDiv('storyteller-list-item-info');
            const chapterNum = chapter?.number ?? '?';
            const chapterName = chapter?.name ?? 'Unknown Chapter';
            const title = `Chapter ${chapterNum}: ${chapterName}`;
            
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: title });
            // Inline edit button — always visible
            if (chapter) {
                const chapterEditBtn2 = titleRow.createEl('button', { cls: 'storyteller-chapter-inline-edit' });
                setIcon(chapterEditBtn2, 'pencil');
                chapterEditBtn2.title = 'Edit chapter';
                chapterEditBtn2.addEventListener('click', (e) => {
                    e.stopPropagation();
                    void import('../modals/ChapterModal').then(({ ChapterModal }) => {
                        new ChapterModal(this.app, this.plugin, chapter, async (updated) => {
                            await this.persistChapterFromDashboard(updated, `Chapter "${updated.name}" updated.`, 'scenes-grouped-chapter-updated');
                        }, async (toDelete) => {
                            if (toDelete.filePath) {
                                await this.removeChapterFromDashboard(toDelete.filePath, 'scenes-grouped-chapter-deleted');
                            }
                        }).open();
                    });
                });
            }
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
                scenesContainer.setCssStyles({ display: 'none' });
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._sceneGroupCollapseState.set(key, isExpanded);
                scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }

        // Render unassigned scenes
        const unassigned = scenesByChapter.get('__unassigned__')!.scenes;
        if (unassigned.length > 0) {
            const unassignedGroup = listContainer.createDiv('storyteller-chapter-group storyteller-unassigned-group');
            const unassignedHeader = unassignedGroup.createDiv('storyteller-chapter-header storyteller-chapter-header-compact');
            
            const toggleBtn = unassignedHeader.createDiv('storyteller-chapter-toggle');
            setIcon(toggleBtn, 'chevron-down');
            
            const infoEl = unassignedHeader.createDiv('storyteller-list-item-info');
            const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
            titleRow.createEl('strong', { text: 'Unassigned scenes' });
            titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${unassigned.length} scene${unassigned.length !== 1 ? 's' : ''}` });

            const scenesContainer = unassignedGroup.createDiv('storyteller-chapter-scenes');
            unassigned.forEach(sc => {
                this.renderSceneItem(scenesContainer, sc, false, chapters);
            });

            const sgUnassignedKey = '__unassigned__';
            let isExpanded = this._sceneGroupCollapseState.has(sgUnassignedKey) ? this._sceneGroupCollapseState.get(sgUnassignedKey)! : true;
            if (!isExpanded) {
                scenesContainer.setCssStyles({ display: 'none' });
                toggleBtn.classList.add('collapsed');
            }
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                this._sceneGroupCollapseState.set(sgUnassignedKey, isExpanded);
                scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
                toggleBtn.classList.toggle('collapsed', !isExpanded);
            };
        }
    }

    /** Helper to render a single scene item */
    private renderSceneItem(container: HTMLElement, sc: import('../types').Scene, showChapterAssign: boolean, chapters?: import('../types').Chapter[]) {
        const itemEl = container.createDiv('storyteller-list-item storyteller-scene-item');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (sc.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            try {
                imgEl.src = this.getImageSrc(sc.profileImagePath);
                imgEl.alt = sc.name;
            } catch {
                pfpContainer.createSpan({ text: '?' });
            }
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: sc.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const nameEl = infoEl.createEl('strong', { text: sc.name });
        if (sc.filePath) {
            const scFilePath = sc.filePath;
            nameEl.addClass('storyteller-scene-name-link');
            nameEl.title = 'Click to open note';
            nameEl.addEventListener('click', () => {
                const file = this.app.vault.getAbstractFileByPath(scFilePath);
                if (file instanceof TFile) void this.app.workspace.openLinkText(scFilePath, '', false);
            });
        }

        const meta = infoEl.createDiv('storyteller-list-item-extra');
        if (sc.status) {
            meta.createSpan({ cls: `storyteller-status-badge storyteller-status-${(sc.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`, text: sc.status });
        }
        if (sc.povCharacter) {
            const pov = meta.createSpan({ cls: 'storyteller-scene-pov-badge' });
            setIcon(pov.createSpan(''), 'eye');
            pov.createSpan({ text: ` ${sc.povCharacter}` });
        }
        if (sc.emotion) {
            meta.createSpan({ text: sc.emotion, cls: `storyteller-scene-emotion-chip storyteller-emotion-${sc.emotion}` });
        }
        if (sc.tags && sc.tags.length > 0) {
            meta.createSpan({ text: sc.tags.map((tag: string) => `#${tag}`).join(' ') });
        }

        if (sc.intensity !== undefined && sc.intensity !== null) {
            const barWrap = infoEl.createDiv('storyteller-intensity-bar');
            const pct = Math.round(((Number(sc.intensity) + 10) / 20) * 100);
            const fill = barWrap.createDiv('storyteller-intensity-fill');
            fill.setCssStyles({ width: `${pct}%` });
            fill.title = `Intensity: ${sc.intensity}`;
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
                        await this.persistSceneFromDashboard(sc, `Scene assigned to chapter "${selectedChapter.name}"`, 'scene-assigned-to-chapter');
                    }
                };
                assignBtn.replaceWith(select);
                select.focus();
            };
        }
        
        this.addEditButton(actionsEl, () => {
            void import('../modals/SceneModal').then(({ SceneModal }) => {
                new SceneModal(this.app, this.plugin, sc, async (updated) => {
                    await this.persistSceneFromDashboard(updated, `Scene "${updated.name}" updated.`, 'scene-item-updated');
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await this.removeSceneFromDashboard(toDelete.filePath, 'scene-item-deleted-from-modal');
                    }
                }).open();
            });
        });
        this.addDeleteButton(actionsEl, async () => {
            if (sc.filePath) {
                await this.confirmDeleteSceneFromDashboard(sc.filePath, sc.name, 'scene-item-deleted');
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
            listContainer.createEl('p', { text: 'No scenes found.' + (this.currentFilter ? ' Matching current filter.' : '') });
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
                } catch {
                    pfpContainer.createSpan({ text: '?' });
                }
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: sc.name.substring(0,1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: sc.name });
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
                                void this.app.workspace.openLinkText(chapterForScene.filePath, '', false);
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
                void import('../modals/SceneModal').then(({ SceneModal }) => {
                    new SceneModal(this.app, this.plugin, sc, async (updated) => {
                        await this.persistSceneFromDashboard(updated, `Scene "${updated.name}" updated.`, 'scenes-tab-updated');
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.removeSceneFromDashboard(toDelete.filePath, 'scenes-tab-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (sc.filePath) {
                    await this.confirmDeleteSceneFromDashboard(sc.filePath, sc.name, 'scenes-tab-deleted');
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
                const label = draft.bookId ? `${draft.name} (book)` : draft.name;
                const opt = draftSelect.createEl('option', { value: draft.id, text: label });
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
            const syncBtn = draftSelectorEl.createEl('button');
            setIcon(syncBtn, 'refresh-cw');
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
            const reorderBtn = sceneOrderActions.createEl('button');
            setIcon(reorderBtn, 'list-ordered');
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
                    const populateBtn = emptyEl.createEl('button', { cls: 'mod-cta' });
                    setIcon(populateBtn.createSpan(), 'refresh-cw');
                    populateBtn.createSpan().setText(` Add ${allScenes.length} existing scene${allScenes.length > 1 ? 's' : ''}`);
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
                    sceneEl.setCssStyles({ paddingLeft: `${(orderedScene.indentLevel + 1) * 16}px` });
                    
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
                            void this.app.workspace.openLinkText(orderedScene.scene.filePath, '', false);
                        }
                    };
                    
                    // Movement buttons
                    const actionsEl = sceneEl.createDiv('storyteller-ordered-scene-actions');
                    
                    const upBtn = actionsEl.createEl('button');
                    setIcon(upBtn, 'arrow-up');
                    upBtn.title = t('moveUp');
                    upBtn.onclick = async () => {
                        await sceneManager.moveSceneUp(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const downBtn = actionsEl.createEl('button');
                    setIcon(downBtn, 'arrow-down');
                    downBtn.title = t('moveDown');
                    downBtn.onclick = async () => {
                        await sceneManager.moveSceneDown(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const indentBtn = actionsEl.createEl('button');
                    setIcon(indentBtn, 'arrow-right');
                    indentBtn.title = t('indent');
                    indentBtn.onclick = async () => {
                        await sceneManager.indentScene(activeDraft, sceneId);
                        await this.renderCompileContent(container);
                    };
                    
                    const unindentBtn = actionsEl.createEl('button');
                    setIcon(unindentBtn, 'arrow-left');
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
        const allWorkflows = engine.getAllWorkflows();
        const customWorkflows = this.plugin.settings.compileWorkflows ?? [];
        const selectedWorkflow = engine.resolveWorkflowForDraft(activeDraft);

        const workflowSelect = workflowSelectorEl.createEl('select', { cls: 'storyteller-workflow-select' });
        allWorkflows.forEach(workflow => {
            const isCustom = customWorkflows.some(saved => saved.id === workflow.id);
            const opt = workflowSelect.createEl('option', {
                value: workflow.id,
                text: isCustom ? `${workflow.name} (Custom)` : workflow.name
            });
            if (workflow.description) {
                opt.title = workflow.description;
            }
            if (workflow.id === selectedWorkflow.id) {
                opt.selected = true;
            }
        });

        const workflowDescEl = compileActionsEl.createDiv('storyteller-workflow-description');
        const workflowControlsEl = compileActionsEl.createDiv('storyteller-workflow-controls');
        const editWorkflowBtn = workflowControlsEl.createEl('button');
        const setDefaultWorkflowBtn = workflowControlsEl.createEl('button');
        setDefaultWorkflowBtn.setText('Set default');
        const deleteWorkflowBtn = workflowControlsEl.createEl('button');
        deleteWorkflowBtn.setText('Delete workflow');
        const workflowStatusEl = compileActionsEl.createDiv('storyteller-workflow-status');

        const refreshWorkflowUi = () => {
            const currentWorkflow = engine.getWorkflowById(workflowSelect.value) || engine.resolveWorkflowForDraft(activeDraft);
            const isCustom = customWorkflows.some(saved => saved.id === currentWorkflow.id);
            workflowDescEl.setText(currentWorkflow.description || '');
            editWorkflowBtn.setText(isCustom ? 'Edit Workflow' : 'Customize Workflow');
            deleteWorkflowBtn.setCssStyles({ display: isCustom ? '' : 'none' });

            const statusBits: string[] = [isCustom ? 'Custom workflow' : 'Preset workflow'];
            if (engine.getWorkflowById(this.plugin.settings.defaultCompileWorkflow || '')?.id === currentWorkflow.id) {
                statusBits.push('Default');
            }
            if (activeDraft && engine.getWorkflowById(activeDraft.workflow || '')?.id === currentWorkflow.id) {
                statusBits.push(`Draft: ${activeDraft.name}`);
            }
            workflowStatusEl.setText(statusBits.join(' | '));
        };

        editWorkflowBtn.addEventListener('click', () => {
            const currentWorkflow = engine.getWorkflowById(workflowSelect.value) || engine.resolveWorkflowForDraft(activeDraft);
            const isCustom = customWorkflows.some(saved => saved.id === currentWorkflow.id);
            const workflowToEdit = isCustom
                ? this.cloneCompileWorkflow(currentWorkflow)
                : this.createCustomWorkflowFromSource(currentWorkflow);
            this.openCompileWorkflowModal(
                engine,
                workflowToEdit,
                isCustom ? 'edit' : 'create',
                container,
                activeDraft
            );
        });

        setDefaultWorkflowBtn.addEventListener('click', () => { void (async () => {
            this.plugin.settings.defaultCompileWorkflow = workflowSelect.value;
            await this.plugin.saveSettings();
            refreshWorkflowUi();
            new Notice('Default compile workflow updated.');
        })(); });

        deleteWorkflowBtn.addEventListener('click', () => { void (async () => {
            const currentWorkflow = engine.getWorkflowById(workflowSelect.value);
            if (!currentWorkflow) return;
            if (!customWorkflows.some(saved => saved.id === currentWorkflow.id)) return;
            if (!await this.confirmAction(`Delete compile workflow "${currentWorkflow.name}"?`)) return;

            this.plugin.settings.compileWorkflows = customWorkflows.filter(workflow => workflow.id !== currentWorkflow.id);
            if (this.plugin.settings.defaultCompileWorkflow === currentWorkflow.id) {
                this.plugin.settings.defaultCompileWorkflow = engine.createDefaultWorkflow().id;
            }
            (this.plugin.settings.storyDrafts ?? []).forEach(draft => {
                if (draft.workflow === currentWorkflow.id) {
                    draft.workflow = this.plugin.settings.defaultCompileWorkflow;
                }
            });
            await this.plugin.saveSettings();
            await this.renderCompileContent(container);
        })(); });

        workflowSelect.onchange = async () => {
            if (activeDraft) {
                activeDraft.workflow = workflowSelect.value;
                activeDraft.modified = new Date().toISOString();
                await this.plugin.saveSettings();
            }
            refreshWorkflowUi();
        };
        
        // Compile button
        const compileBtn = compileActionsEl.createEl('button', { cls: 'mod-cta' });
        setIcon(compileBtn.createSpan(), 'book-open');
        compileBtn.createSpan().setText(` ${t('compileManuscript')}`);
        compileBtn.onclick = async () => {
            if (!activeDraft) {
                new Notice(t('noDraftAvailable'));
                return;
            }
            
            const workflow = engine.resolveWorkflowForDraft(activeDraft, workflowSelect.value);
            
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
                
                new Notice(`${t('compileFailed')}: ${error}`);
            }
        };
        
        refreshWorkflowUi();

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
                } catch {
                    
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
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-char-race-badge', text: character.race });
            }
            if (character.age) {
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-char-age-badge', text: character.age });
            }
            if (character.status) {
                const statusSlug = character.status.toLowerCase().replace(/\s+/g, '-');
                extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-char-status-badge storyteller-char-status-${statusSlug}`, text: character.status });
            }
            if (character.affiliation) {
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-affiliation-badge', text: character.affiliation });
            }
            if (character.balance) {
                extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${character.balance}` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new CharacterModal(this.app, this.plugin, character, async (updatedData: Character) => {
                    await this.mutationRunner.runUpdate({
                        action: async () => {
                            await this.plugin.saveCharacter(updatedData);
                        },
                        successNotice: `Character "${updatedData.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'character-updated',
                    });
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (character.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Are you sure you want to delete "${character.name}"? This will move the file to system trash.`,
                        action: async () => {
                            await this.plugin.deleteCharacter(character.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'character-deleted',
                    });
                } else {
                    new Notice('Error: Cannot delete character without file path.');
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
                } catch {
                    
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
                const typeSlug = location.locationType.toLowerCase().replace(/\s+/g, '-');
                extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-loc-type-badge storyteller-loctype-${typeSlug}`, text: location.locationType });
            }
            if (location.region) {
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-loc-region-badge', text: location.region });
            }
            if (location.parentLocationId) {
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-loc-parent-badge', text: `↑ ${location.parentLocationId}` });
            }
            if (location.status) {
                const statusSlug = location.status.toLowerCase().replace(/\s+/g, '-');
                extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-loc-status-badge storyteller-loc-status-${statusSlug}`, text: location.status });
            }
            if (location.balance) {
                extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${location.balance}` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new LocationModal(this.app, this.plugin, location, async (updatedData) => {
                    await this.mutationRunner.runUpdate({
                        action: async () => {
                            await this.plugin.saveLocation(updatedData);
                        },
                        successNotice: `Location "${updatedData.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'location-updated',
                    });
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (location.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Are you sure you want to delete "${location.name}"?`,
                        action: async () => {
                            await this.plugin.deleteLocation(location.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'location-deleted',
                    });
                } else {
                    new Notice('Error: Cannot delete location without file path.');
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
                } catch {
                    
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
                        thumb.setCssStyles({ maxWidth: '48px' });
                        thumb.setCssStyles({ maxHeight: '48px' });
                        thumb.setCssStyles({ marginRight: '4px' });
                        thumb.setCssStyles({ cursor: 'pointer' });
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
                    } catch {
                        imagesRow.createSpan({ text: '?', title: 'Error loading image' });
                    }
                });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (event.isMilestone) {
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-event-milestone-badge', text: 'Milestone' });
            }
            if (event.status) {
                const statusSlug = event.status.toLowerCase().replace(/\s+/g, '-');
                extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-event-status-badge storyteller-event-status-${statusSlug}`, text: event.status });
            }
            if (event.location) {
                const locationName = this.resolveLocationName(event.location, locations);
                extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-event-location-badge', text: locationName });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new EventModal(this.app, this.plugin, event, async (updatedData) => {
                    await this.mutationRunner.runUpdate({
                        action: async () => {
                            await this.plugin.saveEvent(updatedData);
                        },
                        successNotice: `Event "${updatedData.name}" updated.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'event-updated',
                    });
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (event.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Are you sure you want to delete "${event.name}"?`,
                        action: async () => {
                            await this.plugin.deleteEvent(event.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'event-deleted',
                    });
                } else {
                    new Notice('Error: Cannot delete event without file path.');
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

    // Modal-based replacement for native confirm(). Native confirm() in Electron leaves
    // focus on the now-removed DOM node after re-render, which prevents typing in any
    // editor or input until the window is deactivated and reactivated.
    private confirmAction(message: string, confirmText?: string): Promise<boolean> {
        return confirmWithModal(this.app, {
            title: t('confirm') || 'Confirm',
            body: message,
            confirmText: confirmText || t('delete') || 'Delete',
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
            .setButtonText(t('delete') || 'Delete')
            .setTooltip('Delete')
            .setClass('mod-warning')
            .setClass('storyteller-list-item-delete-btn')
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
                   void this.app.workspace.openLinkText(filePath, '', false);
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
        const { VIEW_TYPE_NETWORK_GRAPH } = await import('./NetworkGraphView');
        
        // Check if a network graph view already exists
        const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_NETWORK_GRAPH);
        
        if (existingLeaves.length > 0) {
            // Reveal existing view
            void workspace.revealLeaf(existingLeaves[0]);
            return;
        }
        
        // Create new leaf for network graph view
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_NETWORK_GRAPH,
                active: true
            });
            void workspace.revealLeaf(leaf);
        }
    }
    
    // ========== Custom Compile Steps =========================================

    private cloneCompileWorkflow(workflow: CompileWorkflow): CompileWorkflow {
        return {
            ...workflow,
            steps: workflow.steps.map(step => ({
                ...step,
                options: { ...step.options }
            }))
        };
    }

    private createCustomWorkflowFromSource(source?: CompileWorkflow): CompileWorkflow {
        const fallback: CompileWorkflow = {
            id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: 'Custom Workflow',
            description: '',
            steps: []
        };

        if (!source) return fallback;

        const cloned = this.cloneCompileWorkflow(source);
        return {
            ...cloned,
            id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: `${source.name} Copy`
        };
    }

    private openCompileWorkflowModal(
        engine: CompileEngineType,
        workflow: CompileWorkflow,
        mode: 'create' | 'edit',
        refreshContainer: HTMLElement,
        activeDraft?: StoryDraft
    ): void {
        void import('../modals/CompileWorkflowModal').then(({ CompileWorkflowModal }) => {
            new CompileWorkflowModal(this.app, {
                workflow,
                availableSteps: engine.getAvailableSteps(),
                mode,
                onSave: async (savedWorkflow) => {
                    const workflows = [...(this.plugin.settings.compileWorkflows ?? [])];
                    const existingIndex = workflows.findIndex(workflow => workflow.id === savedWorkflow.id);
                    if (existingIndex >= 0) {
                        workflows[existingIndex] = savedWorkflow;
                    } else {
                        workflows.push(savedWorkflow);
                    }
                    this.plugin.settings.compileWorkflows = workflows;

                    if (activeDraft) {
                        activeDraft.workflow = savedWorkflow.id;
                        activeDraft.modified = new Date().toISOString();
                    }

                    await this.plugin.saveSettings();
                    await this.renderCompileContent(refreshContainer);
                }
            }).open();
        });
    }

    private async renderCustomCompileSteps(container: HTMLElement): Promise<void> {
        const section = container.createDiv('storyteller-compile-custom-steps');

        const header = section.createDiv('storyteller-compile-custom-header');
        header.createEl('h4', { text: 'Custom compile steps' });

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
            deleteBtn.addEventListener('click', () => { void (async () => {
                const stepTypeToRemove = `custom:${step.id}`;
                this.plugin.settings.customCompileSteps = (this.plugin.settings.customCompileSteps ?? [])
                    .filter(s => s.id !== step.id);
                this.plugin.settings.compileWorkflows = (this.plugin.settings.compileWorkflows ?? []).map(workflow => ({
                    ...workflow,
                    steps: workflow.steps.filter(savedStep => savedStep.stepType !== stepTypeToRemove)
                }));
                await this.plugin.saveSettings();
                await this.renderCompileContent(container);
            })(); });
        }
    }

    private openCustomStepModal(
        existing: import('../types').CustomCompileStepDef | null,
        refreshContainer: HTMLElement
    ): void {
        void import('../modals/CustomCompileStepModal').then(({ CustomCompileStepModal }) => {
            new CustomCompileStepModal(this.app, existing, (saved) => { void (async () => {
                const steps = [...(this.plugin.settings.customCompileSteps ?? [])];
                const idx = steps.findIndex(s => s.id === saved.id);
                if (idx >= 0) steps[idx] = saved;
                else steps.push(saved);
                this.plugin.settings.customCompileSteps = steps;
                await this.plugin.saveSettings();
                await this.renderCompileContent(refreshContainer);
            })(); }).open();
        });
    }

    // ========== Phase 2A: World-Building Entity Render Methods ==========

    async renderCulturesContent(container: HTMLElement) {
        await this.renderWithController('cultures', container, async () => {
            container.empty();
            this.renderHeaderControls(container, t('cultures'), async (filter: string) => {
                this.currentFilter = filter;
                await this.renderCulturesList(container);
            }, () => {
                void import('../modals/CultureModal').then(({ CultureModal }) => {
                    new CultureModal(this.app, this.plugin, null, async (culture) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveCulture(culture);
                            },
                            successNotice: t('cultureCreated', culture.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'culture-created',
                        });
                    }).open();
                });
            }, t('createNew'));

            await this.renderCulturesList(container);
        });
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
            if (culture.governmentType) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-gov-badge', text: culture.governmentType });
            if (culture.techLevel) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-tech-badge', text: culture.techLevel });
            if (culture.balance) meta.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${culture.balance}` });

            if (culture.values) {
                const preview = culture.values.length > 120 ? culture.values.substring(0, 120) + '…' : culture.values;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                void import('../modals/CultureModal').then(({ CultureModal }) => {
                    new CultureModal(this.app, this.plugin, culture, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveCulture(updated);
                            },
                            successNotice: t('cultureUpdated', updated.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'culture-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteCulture(toDelete.filePath);
                            this.queueDashboardRefresh('culture-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (culture.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: t('confirmDeleteCulture', culture.name),
                        action: async () => {
                            await this.plugin.deleteCulture(culture.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'culture-deleted',
                    });
                }
            });
            this.addOpenFileButton(actionsEl, culture.filePath);
        });
    }


    async renderEconomiesContent(container: HTMLElement) {
        await this.renderWithController('economies', container, async () => {
            container.empty();
            this.renderHeaderControls(container, t('economies'), async (filter: string) => {
                this.currentFilter = filter;
                await this.renderEconomiesList(container);
            }, () => {
                void import('../modals/EconomyModal').then(({ EconomyModal }) => {
                    new EconomyModal(this.app, this.plugin, null, async (economy) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveEconomy(economy);
                            },
                            successNotice: t('economyCreated', economy.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'economy-created',
                        });
                    }).open();
                });
            }, t('createNew'));

            await this.renderEconomiesList(container);
        });
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
                void import('../modals/EconomyModal').then(({ EconomyModal }) => {
                    new EconomyModal(this.app, this.plugin, economy, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveEconomy(updated);
                            },
                            successNotice: t('economyUpdated', updated.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'economy-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteEconomy(toDelete.filePath);
                            this.queueDashboardRefresh('economy-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (economy.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: t('confirmDeleteEconomy', economy.name),
                        action: async () => {
                            await this.plugin.deleteEconomy(economy.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'economy-deleted',
                    });
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
        await this.renderWithController('magicsystems', container, async () => {
            container.empty();
            this.renderHeaderControls(container, t('magicSystems'), async (filter: string) => {
                this.currentFilter = filter;
                await this.renderMagicSystemsList(container);
            }, () => {
                void import('../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                    new MagicSystemModal(this.app, this.plugin, null, async (magicSystem) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveMagicSystem(magicSystem);
                            },
                            successNotice: t('magicSystemCreated', magicSystem.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'magic-system-created',
                        });
                    }).open();
                });
            }, t('createNew'));

            await this.renderMagicSystemsList(container);
        });
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
            if (magicSystem.systemType) meta.createSpan({ cls: 'storyteller-meta-badge storyteller-magic-type-badge', text: magicSystem.systemType });
            if (magicSystem.rarity) {
                const raritySlug = magicSystem.rarity.toLowerCase();
                meta.createSpan({ cls: `storyteller-meta-badge storyteller-rarity-${raritySlug}`, text: magicSystem.rarity });
            }

            if (magicSystem.rules) {
                const preview = magicSystem.rules.length > 120 ? magicSystem.rules.substring(0, 120) + '…' : magicSystem.rules;
                infoEl.createEl('p', { text: preview });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                void import('../modals/MagicSystemModal').then(({ MagicSystemModal }) => {
                    new MagicSystemModal(this.app, this.plugin, magicSystem, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveMagicSystem(updated);
                            },
                            successNotice: t('magicSystemUpdated', updated.name),
                            refreshMode: 'immediate',
                            refreshDetail: 'magic-system-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteMagicSystem(toDelete.filePath);
                            this.queueDashboardRefresh('magic-system-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (magicSystem.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: t('confirmDeleteMagicSystem', magicSystem.name),
                        action: async () => {
                            await this.plugin.deleteMagicSystem(magicSystem.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'magic-system-deleted',
                    });
                }
            });
            this.addOpenFileButton(actionsEl, magicSystem.filePath);
        });
    }

    async renderCompendiumContent(container: HTMLElement) {
        await this.renderWithController('compendium', container, async () => {
            container.empty();
            this.renderHeaderControls(container, 'Compendium', async (filter: string) => {
                this.currentFilter = filter;
                await this.renderCompendiumList(container);
            }, () => {
                void import('../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                    new CompendiumEntryModal(this.app, this.plugin, null, async (entry) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveCompendiumEntry(entry);
                            },
                            successNotice: `Entry "${entry.name}" created.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'compendium-entry-created',
                        });
                    }).open();
                });
            }, 'New Entry');

            await this.renderCompendiumList(container);
        });
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
                void import('../modals/CompendiumEntryModal').then(({ CompendiumEntryModal }) => {
                    new CompendiumEntryModal(this.app, this.plugin, entry, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveCompendiumEntry(updated);
                            },
                            successNotice: `Entry "${updated.name}" updated.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'compendium-entry-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteCompendiumEntry(toDelete.filePath);
                            this.queueDashboardRefresh('compendium-entry-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (entry.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Delete "${entry.name}"?`,
                        action: async () => {
                            await this.plugin.deleteCompendiumEntry(entry.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'compendium-entry-deleted',
                    });
                }
            });
            this.addOpenFileButton(actionsEl, entry.filePath);
        });
    }

    // ─── Books ─────────────────────────────────────────────────────────────────

    async renderBooksContent(container: HTMLElement) {
        await this.renderWithController('books', container, async () => {
            container.empty();
            this.renderHeaderControls(container, 'Books', async (filter: string) => {
                this.currentFilter = filter;
                await this.renderBooksList(container);
            }, () => {
                void import('../modals/BookModal').then(({ BookModal }) => {
                    new BookModal(this.app, this.plugin, null, async (book) => {
                        await this.mutationRunner.runCreate({
                            action: async () => {
                                await this.plugin.saveBook(book);
                            },
                            successNotice: `Book "${book.name}" created.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'book-created',
                        });
                    }).open();
                });
            }, 'New Book');

            await this.renderBooksList(container);
        });
    }

    private async renderBooksList(container: HTMLElement) {
        const existingListContainer = container.querySelector('.storyteller-list-container');
        if (existingListContainer) existingListContainer.remove();

        const f = this.currentFilter.toLowerCase();
        const allBooks = await this.plugin.listBooks();
        const allChapters = await this.plugin.listChapters();
        const allScenes = await this.plugin.listScenes();

        const books = allBooks.filter(b =>
            b.name.toLowerCase().includes(f) ||
            (b.series || '').toLowerCase().includes(f) ||
            (b.genre || '').toLowerCase().includes(f) ||
            (b.description || '').toLowerCase().includes(f)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (books.length === 0) {
            listContainer.createEl('p', { text: 'No books found.' + (f ? ' (filter active)' : '') });
            return;
        }

        for (const book of books) {
            const bookChapters = allChapters
                .filter(c => c.bookId === book.id)
                .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
            const bookSceneCount = allScenes.filter(s =>
                bookChapters.some(c => c.id === s.chapterId)
            ).length;

            const itemEl = listContainer.createDiv('storyteller-list-item storyteller-book-card');

            // Cover image
            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (book.coverImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try { imgEl.src = this.getImageSrc(book.coverImagePath); imgEl.alt = book.name; } catch { const fb = pfpContainer.createSpan(); setIcon(fb, 'book'); }
            } else {
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: (book.bookNumber ?? '?').toString() });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');

            // Title row
            const titleRow = infoEl.createDiv('storyteller-list-item-title');
            titleRow.createEl('strong', { text: book.name, cls: 'storyteller-list-item-name' });
            if (book.series) {
                titleRow.createSpan({ cls: 'storyteller-meta-badge storyteller-book-badge', text: book.series });
            }
            if (book.bookNumber != null) {
                titleRow.createSpan({ cls: 'storyteller-meta-badge', text: `Book ${book.bookNumber}` });
            }
            if (book.status) {
                const statusSlug = book.status.toLowerCase().replace(/\s+/g, '-');
                titleRow.createSpan({ cls: `storyteller-meta-badge storyteller-book-status-${statusSlug}`, text: book.status });
            }

            // Stats
            const statsRow = infoEl.createDiv('storyteller-list-item-extra');
            statsRow.createSpan({ cls: 'storyteller-meta-badge', text: `${bookChapters.length} chapter${bookChapters.length !== 1 ? 's' : ''}` });
            statsRow.createSpan({ cls: 'storyteller-meta-badge', text: `${bookSceneCount} scene${bookSceneCount !== 1 ? 's' : ''}` });
            if (book.genre) statsRow.createSpan({ cls: 'storyteller-meta-badge', text: book.genre });

            // Description preview
            if (book.description) {
                const preview = book.description.length > 100 ? book.description.substring(0, 100) + '…' : book.description;
                infoEl.createEl('p', { text: preview, cls: 'storyteller-list-item-preview' });
            }

            // Actions
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            // Compile Book button
            const compileBtn = actionsEl.createEl('button', { cls: 'storyteller-action-btn' });
            setIcon(compileBtn, 'book-open');
            compileBtn.title = 'Compile this book into a draft';
            compileBtn.addEventListener('click', () => { void (async () => {
                const activeStory = this.plugin.settings.stories.find(s => s.id === this.plugin.settings.activeStoryId);
                if (!activeStory) {
                    new Notice('Select an active story first.');
                    return;
                }
                const { SceneOrderManager } = await import('../compile');
                const sceneManager = new SceneOrderManager(this.plugin);
                const draft = await sceneManager.createOrUpdateDraftFromBook(activeStory, book);
                if (draft.sceneOrder.length === 0) {
                    new Notice(`"${book.name}" has no scenes yet. Add chapters and scenes first.`);
                    return;
                }
                new Notice(`"${book.name}" is ready to compile (${draft.sceneOrder.length} scene${draft.sceneOrder.length !== 1 ? 's' : ''}).`);
                await this.setActiveTab('compile');
            })(); });

            this.addEditButton(actionsEl, () => {
                void import('../modals/BookModal').then(({ BookModal }) => {
                    new BookModal(this.app, this.plugin, book, async (updated) => {
                        await this.mutationRunner.runUpdate({
                            action: async () => {
                                await this.plugin.saveBook(updated);
                            },
                            successNotice: `Book "${updated.name}" saved.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'book-updated',
                        });
                    }, async (toDelete) => {
                        if (toDelete.filePath) {
                            await this.plugin.deleteBook(toDelete.filePath);
                            this.queueDashboardRefresh('book-deleted-from-modal');
                        }
                    }).open();
                });
            });
            this.addDeleteButton(actionsEl, async () => {
                if (book.filePath) {
                    await this.mutationRunner.runDelete({
                        confirmMessage: `Delete book "${book.name}"? Chapters will be unlinked.`,
                        action: async () => {
                            await this.plugin.deleteBook(book.filePath!);
                        },
                        refreshMode: 'immediate',
                        refreshDetail: 'book-deleted',
                    });
                }
            });
            this.addOpenFileButton(actionsEl, book.filePath);

            // Nested chapter list (compact, expand/collapse)
            if (bookChapters.length > 0) {
                const chaptersContainer = itemEl.createDiv('storyteller-book-chapters-list');
                for (const ch of bookChapters) {
                    const chSceneCount = allScenes.filter(s => s.chapterId === ch.id).length;
                    const chRow = chaptersContainer.createDiv('storyteller-book-chapter-row');
                    chRow.createSpan({ cls: 'storyteller-book-chapter-num', text: ch.number != null ? `Ch.${ch.number}` : '—' });
                    chRow.createSpan({ cls: 'storyteller-book-chapter-name', text: ch.name });
                    chRow.createSpan({ cls: 'storyteller-meta-badge', text: `${chSceneCount}sc` });
                }
            }
        }
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
        header.setCssStyles({ display: 'flex' });
        header.setCssStyles({ justifyContent: 'space-between' });
        header.setCssStyles({ alignItems: 'flex-start' });
        header.setCssStyles({ marginBottom: '1rem' });

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
        createTemplateBtn.setCssStyles({ flexShrink: '0' });
        createTemplateBtn.addEventListener('click', () => {
            new TemplateEditorModal(
                this.app,
                this.plugin,
                null, // null = new template
                (template) => { void (async () => {
                    new Notice(t('templateCreated', template.name));
                    await this.renderTemplatesContent(container);
                })(); }
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
        filterContainer.setCssStyles({ marginBottom: '1rem' });
        filterContainer.setCssStyles({ padding: '1rem' });
        filterContainer.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        filterContainer.setCssStyles({ borderRadius: '8px' });

        // Search row
        const searchRow = filterContainer.createDiv('storyteller-filter-row');
        searchRow.setCssStyles({ marginBottom: '0.75rem' });

        const searchLabel = searchRow.createEl('label', { text: t('searchTemplates') });
        searchLabel.setCssStyles({ display: 'block' });
        searchLabel.setCssStyles({ marginBottom: '0.25rem' });
        searchLabel.setCssStyles({ fontWeight: '500' });

        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: t('searchTemplatesPlaceholder')
        });
        searchInput.setCssStyles({ width: '100%' });
        searchInput.setCssStyles({ padding: '0.5rem' });
        searchInput.setCssStyles({ borderRadius: '4px' });
        searchInput.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        searchInput.value = this.templateFilter.searchText || '';
        searchInput.addEventListener('input', () => {
            this.templateFilter.searchText = searchInput.value || undefined;
            this.refreshTemplateList(container);
        });

        // Filter options row
        const filtersRow = filterContainer.createDiv('storyteller-filter-options');
        filtersRow.setCssStyles({ display: 'flex' });
        filtersRow.setCssStyles({ flexWrap: 'wrap' });
        filtersRow.setCssStyles({ gap: '1rem' });
        filtersRow.setCssStyles({ alignItems: 'flex-end' });

        // Genre dropdown
        const genreGroup = filtersRow.createDiv('storyteller-filter-group');
        genreGroup.createEl('label', { text: t('genre') }).setCssStyles({ display: 'block' });
        const genreSelect = genreGroup.createEl('select');
        genreSelect.setCssStyles({ padding: '0.35rem' });
        genreSelect.setCssStyles({ borderRadius: '4px' });
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
        categoryGroup.createEl('label', { text: t('templateCategory') }).setCssStyles({ display: 'block' });
        const categorySelect = categoryGroup.createEl('select');
        categorySelect.setCssStyles({ padding: '0.35rem' });
        categorySelect.setCssStyles({ borderRadius: '4px' });
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
        sortGroup.createEl('label', { text: t('sortBy') }).setCssStyles({ display: 'block' });
        const sortSelect = sortGroup.createEl('select');
        sortSelect.setCssStyles({ padding: '0.35rem' });
        sortSelect.setCssStyles({ borderRadius: '4px' });
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
        togglesRow.setCssStyles({ display: 'flex' });
        togglesRow.setCssStyles({ gap: '1.5rem' });
        togglesRow.setCssStyles({ marginTop: '0.75rem' });

        // Built-in toggle
        const builtInLabel = togglesRow.createEl('label');
        builtInLabel.setCssStyles({ display: 'flex' });
        builtInLabel.setCssStyles({ alignItems: 'center' });
        builtInLabel.setCssStyles({ gap: '0.5rem' });
        builtInLabel.setCssStyles({ cursor: 'pointer' });
        const builtInCheck = builtInLabel.createEl('input', { type: 'checkbox' });
        builtInCheck.checked = this.templateFilter.showBuiltIn !== false;
        builtInCheck.addEventListener('change', () => {
            this.templateFilter.showBuiltIn = builtInCheck.checked;
            this.refreshTemplateList(container);
        });
        builtInLabel.createEl('span', { text: t('showBuiltIn') });

        // Custom toggle
        const customLabel = togglesRow.createEl('label');
        customLabel.setCssStyles({ display: 'flex' });
        customLabel.setCssStyles({ alignItems: 'center' });
        customLabel.setCssStyles({ gap: '0.5rem' });
        customLabel.setCssStyles({ cursor: 'pointer' });
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
        const listContainer = createDiv();
        listContainer.className = 'storyteller-template-library-list';

        if (this.templatesCache.length === 0) {
            const emptyState = listContainer.createDiv('storyteller-empty-state');
            emptyState.setCssStyles({ padding: '2rem' });
            emptyState.setCssStyles({ textAlign: 'center' });
            emptyState.setCssStyles({ color: 'var(--text-muted)' });
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
        countEl.setCssStyles({ marginBottom: '0.75rem' });
        countEl.setCssStyles({ color: 'var(--text-muted)' });

        // Create template cards grid
        const cardsGrid = listContainer.createDiv('storyteller-template-cards-grid');
        cardsGrid.setCssStyles({ display: 'grid' });
        cardsGrid.setCssStyles({ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' });
        cardsGrid.setCssStyles({ gap: '1rem' });

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
        card.setCssStyles({ padding: '1rem' });
        card.setCssStyles({ backgroundColor: 'var(--background-primary)' });
        card.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        card.setCssStyles({ borderRadius: '8px' });

        // Header
        const header = card.createDiv('storyteller-template-card-header');
        header.setCssStyles({ display: 'flex' });
        header.setCssStyles({ justifyContent: 'space-between' });
        header.setCssStyles({ alignItems: 'center' });
        header.setCssStyles({ marginBottom: '0.5rem' });

        header.createEl('h4', { text: template.name }).setCssStyles({ margin: '0' });

        if (template.isBuiltIn) {
            const badge = header.createEl('span', { text: t('builtIn') });
            badge.setCssStyles({ fontSize: '0.75em' });
            badge.setCssStyles({ padding: '0.2rem 0.5rem' });
            badge.setCssStyles({ backgroundColor: 'var(--interactive-accent)' });
            badge.setCssStyles({ color: 'var(--text-on-accent)' });
            badge.setCssStyles({ borderRadius: '4px' });
        }

        // Description
        const desc = card.createEl('p', { text: template.description });
        desc.setCssStyles({ margin: '0.5rem 0' });
        desc.setCssStyles({ color: 'var(--text-muted)' });
        desc.setCssStyles({ fontSize: '0.9em' });

        // Metadata
        const meta = card.createDiv('storyteller-template-card-meta');
        meta.setCssStyles({ display: 'flex' });
        meta.setCssStyles({ flexWrap: 'wrap' });
        meta.setCssStyles({ gap: '0.5rem' });
        meta.setCssStyles({ marginBottom: '0.5rem' });
        meta.setCssStyles({ fontSize: '0.85em' });

        const genreBadge = meta.createEl('span', { text: template.genre });
        genreBadge.setCssStyles({ padding: '0.15rem 0.4rem' });
        genreBadge.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        genreBadge.setCssStyles({ borderRadius: '4px' });

        const categoryBadge = meta.createEl('span', { text: template.category });
        categoryBadge.setCssStyles({ padding: '0.15rem 0.4rem' });
        categoryBadge.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        categoryBadge.setCssStyles({ borderRadius: '4px' });

        if (template.usageCount && template.usageCount > 0) {
            const usageBadge = meta.createEl('span', { text: t('usedXTimes', template.usageCount) });
            usageBadge.setCssStyles({ padding: '0.15rem 0.4rem' });
            usageBadge.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
            usageBadge.setCssStyles({ borderRadius: '4px' });
        }

        // Entity types
        if (template.entityTypes && template.entityTypes.length > 0) {
            const entityTypesEl = card.createDiv('storyteller-template-card-entity-types');
            entityTypesEl.setCssStyles({ marginBottom: '0.5rem' });
            entityTypesEl.setCssStyles({ fontSize: '0.85em' });
            entityTypesEl.createEl('span', { text: t('contains') });
            template.entityTypes.forEach(type => {
                const typeBadge = entityTypesEl.createEl('span', { text: type });
                typeBadge.setCssStyles({ marginLeft: '0.25rem' });
                typeBadge.setCssStyles({ padding: '0.1rem 0.3rem' });
                typeBadge.setCssStyles({ backgroundColor: 'var(--interactive-accent)' });
                typeBadge.setCssStyles({ color: 'var(--text-on-accent)' });
                typeBadge.setCssStyles({ borderRadius: '3px' });
                typeBadge.setCssStyles({ fontSize: '0.85em' });
            });
        }

        // Tags
        if (template.tags && template.tags.length > 0) {
            const tagsEl = card.createDiv('storyteller-template-card-tags');
            tagsEl.setCssStyles({ display: 'flex' });
            tagsEl.setCssStyles({ flexWrap: 'wrap' });
            tagsEl.setCssStyles({ gap: '0.25rem' });
            tagsEl.setCssStyles({ marginBottom: '0.75rem' });
            template.tags.forEach(tag => {
                const tagEl = tagsEl.createEl('span', { text: tag });
                tagEl.setCssStyles({ fontSize: '0.75em' });
                tagEl.setCssStyles({ padding: '0.1rem 0.3rem' });
                tagEl.setCssStyles({ backgroundColor: 'var(--background-modifier-border)' });
                tagEl.setCssStyles({ borderRadius: '3px' });
            });
        }

        // Actions
        const actions = card.createDiv('storyteller-template-card-actions');
        actions.setCssStyles({ display: 'flex' });
        actions.setCssStyles({ flexWrap: 'wrap' });
        actions.setCssStyles({ gap: '0.5rem' });
        actions.setCssStyles({ marginTop: '0.75rem' });
        actions.setCssStyles({ paddingTop: '0.75rem' });
        actions.setCssStyles({ borderTop: '1px solid var(--background-modifier-border)' });

        const applyButton = actions.createEl('button', { text: t('applyTemplate'), cls: 'mod-cta' });
        applyButton.addEventListener('click', () => { void this.handleUseTemplate(template); });

        if (template.isEditable) {
            const editButton = actions.createEl('button', { text: t('edit') });
            editButton.addEventListener('click', () => this.handleEditTemplate(template, container));

            const deleteButton = actions.createEl('button', { text: t('delete'), cls: 'mod-warning' });
            deleteButton.addEventListener('click', () => { void this.handleDeleteTemplate(template, container); });
        }

        const duplicateButton = actions.createEl('button', { text: t('duplicate') });
        duplicateButton.addEventListener('click', () => { void this.handleDuplicateTemplate(template, container); });
    }

    /**
     * Handle using a template
     */
    private async handleUseTemplate(template: Template): Promise<void> {
        
        // Apply the template with variable collection prompt
        await this.plugin.applyTemplateWithPrompt(template);
        
    }

    /**
     * Handle editing a template
     */
    private handleEditTemplate(template: Template, container: HTMLElement): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            template,
            (updatedTemplate) => { void (async () => {
                await this.renderTemplatesContent(container);
            })(); }
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
        const isCompactMobile = this.isSimplifiedMobileDashboard();

        const tracker = this.plugin.wordTracker;
        const todayStats = tracker.getTodayStats();
        const wordsToday = todayStats?.wordsWritten ?? 0;
        const pct = Math.min(100, (wordsToday / goal) * 100);
        const met = wordsToday >= goal;
        const streak = tracker.getWritingStreak?.() ?? 0;

        const banner = container.createDiv({
            cls: `storyteller-goal-banner${met ? ' storyteller-goal-banner--met' : ''}`
        });
        if (isCompactMobile) {
            banner.addClass('storyteller-goal-banner--compact');
        }

        const top = banner.createDiv('storyteller-goal-banner-top');

        const labelEl = top.createDiv('storyteller-goal-banner-label');
        const labelIcon = labelEl.createSpan();
        setIcon(labelIcon, met ? 'check-circle' : 'target');
        labelEl.createSpan({ text: met ? (isCompactMobile ? ' Goal met' : ' Daily goal met!') : (isCompactMobile ? ' Goal' : ' Daily writing goal') });

        top.createSpan({
            text: isCompactMobile ? `${wordsToday.toLocaleString()} / ${goal.toLocaleString()}` : `${wordsToday.toLocaleString()} / ${goal.toLocaleString()} words`,
            cls: 'storyteller-goal-banner-count'
        });

        const barEl = banner.createDiv('storyteller-goal-bar');
        const fillEl = barEl.createDiv('storyteller-goal-fill');
        fillEl.setCssStyles({ width: `${pct}%` });

        if (streak > 1) {
            if (isCompactMobile) {
                const streakEl = top.createDiv('storyteller-goal-streak storyteller-goal-streak--inline');
                const streakIcon = streakEl.createSpan();
                setIcon(streakIcon, 'flame');
                streakEl.createSpan({ text: ` ${streak}d streak` });
                return;
            }
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
        header.createEl('h3', { text: 'Writing analytics' });

        container.createEl('p', {
            text: 'Track character screen time, pov distribution, writing velocity, foreshadowing, and more.',
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

            container.createEl('p', {
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
            void this.plugin.activateAnalyticsView();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Writing tab — alternate view renderers (delegates to WritingViewRenderers)
    // ─────────────────────────────────────────────────────────────────────────

    private _getWritingRenderers(): WritingViewRenderers {
        if (!this._writingRenderers) {
            this._writingRenderers = new WritingViewRenderers(this.app, this.plugin);
        }
        return this._writingRenderers;
    }

    /** Render Kanban board — delegates to WritingViewRenderers */
    private async renderKanbanBoard(container: HTMLElement) {
        await this._getWritingRenderers().renderKanbanBoard(container, this.currentFilter);
    }

    /** Render intensity/emotion arc chart — delegates to WritingViewRenderers */
    private async renderArcChart(container: HTMLElement) {
        await this._getWritingRenderers().renderArcChart(container);
    }

    /** Render character presence heatmap — delegates to WritingViewRenderers */
    private async renderHeatmap(container: HTMLElement) {
        await this._getWritingRenderers().renderHeatmap(container);
    }

    /** Detect and surface potential plot holes — delegates to WritingViewRenderers */
    private async renderPlotHoles(container: HTMLElement) {
        await this._getWritingRenderers().renderPlotHoles(container);
    }

    async onClose() {
        // Clean up file input if it exists
        this.fileInput?.remove();
        this.fileInput = null;
        this.refreshCoordinator.dispose();

        this.tabsResizeObserver?.disconnect();
        this.tabsResizeObserver = null;

        // Clean up typing timer
        if (this.typingTimer) {
            window.clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }

        // Clean up dismissal timer
        if (this.dismissalTimer) {
            window.clearTimeout(this.dismissalTimer);
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

    // ─── Campaign Tab ─────────────────────────────────────────────────────────

    async renderCampaignContent(container: HTMLElement): Promise<void> {
        await this.renderWithController('campaign', container, async () => {
            container.empty();

            this.renderHeaderControls(container, 'Campaign', async (filter: string) => {
                this.currentFilter = filter;
                await this.renderCampaignList(container);
            }, () => {
                void import('../modals/CampaignSessionModal').then(({ CampaignSessionModal }) => {
                    new CampaignSessionModal(this.app, this.plugin, () => { void (async () => {
                        this.queueDashboardRefresh('campaign-session-created-or-updated');
                    })(); }).open();
                });
            }, 'New Session');

            const headerRow = container.querySelector('.storyteller-header-controls');
            if (headerRow) {
                const graphBtn = headerRow.createEl('button', { cls: 'storyteller-header-secondary-btn', text: 'Scene graph' });
                setIcon(graphBtn.createSpan(), 'git-branch');
                graphBtn.addEventListener('click', () => {
                    void this.plugin.activateSceneGraphView();
                });
            }

            await this.renderCampaignList(container);
        });
        // Same deal here. Controller path is the real one now.
        return;
        /*
        container.empty();

        this.renderHeaderControls(container, 'Campaign', async (filter: string) => {
            this.currentFilter = filter;
            await this.renderCampaignList(container);
        }, () => {
            import('../modals/CampaignSessionModal').then(({ CampaignSessionModal }) => {
                new CampaignSessionModal(this.app, this.plugin, async (session) => {
                    this.queueDashboardRefresh('campaign-session-created-or-updated');
                }).open();
            });
        }, 'New Session');

        // Scene graph secondary button — inject into header after render
        const headerRow = container.querySelector('.storyteller-header-controls') as HTMLElement | null;
        if (headerRow) {
            const graphBtn = headerRow!.createEl('button', { cls: 'storyteller-header-secondary-btn', text: 'Scene Graph' });
            setIcon(graphBtn.createSpan(), 'git-branch');
            graphBtn.addEventListener('click', () => {
                this.plugin.activateSceneGraphView();
            });
        }

        await this.renderCampaignList(container);
        */
    }

    private async renderCampaignList(container: HTMLElement): Promise<void> {
        const existingList = container.querySelector('.storyteller-list-container');
        if (existingList) existingList.remove();

        let sessions: import('../types').CampaignSession[] = [];
        try { sessions = await this.plugin.listSessions(); } catch { /* no active story */ }

        const f = this.currentFilter.toLowerCase();
        const filtered = sessions.filter(s =>
            s.name.toLowerCase().includes(f) ||
            (s.currentSceneName ?? '').toLowerCase().includes(f)
        );

        const listContainer = container.createDiv('storyteller-list-container');

        if (filtered.length === 0) {
            listContainer.createEl('p', { text: 'No sessions found. Click "new session" to start a campaign.' });
            return;
        }

        for (const sess of filtered) {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            const iconEl = itemEl.createDiv('storyteller-list-item-pfp');
            const iconInner = iconEl.createDiv({ cls: 'storyteller-pfp-placeholder' });
            setIcon(iconInner, 'swords');

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            const titleRow = infoEl.createDiv('storyteller-list-item-title');
            titleRow.createEl('strong', { text: sess.name, cls: 'storyteller-list-item-name' });
            const statusSlug = (sess.status ?? 'active').replace(/\s+/g, '-');
            titleRow.createSpan({ cls: `storyteller-meta-badge storyteller-campaign-status-${statusSlug}`, text: sess.status ?? 'active' });

            const extraEl = infoEl.createDiv('storyteller-list-item-extra');
            if (sess.currentSceneName) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: `Scene: ${sess.currentSceneName}` });
            if (sess.partyCharacterNames?.length) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: `Party: ${sess.partyCharacterNames.join(', ')}` });
            if (sess.modified) extraEl.createSpan({ cls: 'storyteller-meta-badge', text: new Date(sess.modified).toLocaleDateString() });

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            const resumeBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn mod-cta', text: 'Resume' });
            resumeBtn.addEventListener('click', () => {
                void import('../views/CampaignView').then(({ VIEW_TYPE_CAMPAIGN }) => {
                    void this.plugin.activateCampaignView(sess);
                });
            });

            if (sess.filePath) {
                const openBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn' });
                setIcon(openBtn, 'file-text');
                openBtn.setAttribute('aria-label', 'Open session note');
                openBtn.addEventListener('click', () => {
                    const file = this.app.vault.getAbstractFileByPath(sess.filePath!);
                    if (file) void this.app.workspace.openLinkText(file.name, '', true);
                });

                const delBtn = actionsEl.createEl('button', { cls: 'storyteller-list-item-btn mod-warning' });
                setIcon(delBtn, 'trash');
                delBtn.setAttribute('aria-label', 'Delete session');
                delBtn.addEventListener('click', () => { void (async () => {
                    if (sess.filePath) {
                        await this.mutationRunner.runDelete({
                            confirmMessage: `Delete session "${sess.name}"?`,
                            action: async () => {
                                await this.plugin.deleteSession(sess.filePath!);
                            },
                            refreshMode: 'immediate',
                            refreshDetail: 'campaign-session-deleted',
                        });
                    }
                })(); });
            }
        }
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
        buttonContainer.setCssStyles({ display: 'flex' });
        buttonContainer.setCssStyles({ gap: '0.5rem' });
        buttonContainer.setCssStyles({ justifyContent: 'flex-end' });
        buttonContainer.setCssStyles({ marginTop: '1rem' });

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
