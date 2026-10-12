import { restoreMapMembership } from '../services/MapMembershipService';
import { GridController } from '../leaflet/grid/GridController';
// Map View - Full workspace view for interactive map visualization
// Provides a dedicated panel for viewing and interacting with story maps

import { ItemView, WorkspaceLeaf, setIcon, Menu, DropdownComponent, Notice, TFile, FuzzySuggestModal, App } from 'obsidian';
import * as L from 'leaflet';
import StorytellerSuitePlugin from '../main';
import { Location, StoryMap, MapBinding } from '../types';
import { t } from '../i18n/strings';
import { LeafletRenderer } from '../leaflet/renderer';
import { buildMapExportFileName, uniqueExportPath } from '../leaflet/utils/MapImageExport';
import { mapToBlockParams } from '../leaflet/utils/MapBlockParams';
import { LocationService, LocationLevel } from '../services/LocationService';
import { LocationSuggestModal } from '../modals/LocationSuggestModal';
import { LocationSelectionModal } from '../modals/LocationSelectionModal';
import { CharacterSuggestModal } from '../modals/CharacterSuggestModal';
import { EventSuggestModal } from '../modals/EventSuggestModal';
import { PlotItemSuggestModal } from '../modals/PlotItemSuggestModal';
import { openMapModal } from '../utils/MapModalHelper';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';
import { createPlacementOverlay } from '../leaflet/placementOverlay';
import { InkEditor } from '../leaflet/ink/InkEditor';
import type { InkLayer } from '../leaflet/ink/InkLayer';
import type { InkLegend } from '../leaflet/ink/InkLegend';
import { ObsidianInkHost } from '../leaflet/ink/obsidian/ObsidianInkHost';
import { INK_FRONTMATTER_KEY, inkFrontmatter, normalizeInk, type InkDoc } from '../leaflet/ink/model';
import { MAPLOG_KEYS } from '../leaflet/ink/migrateMaplog';
import { inkDocOf } from '../leaflet/utils/mapInk';
import { LatestToken } from '../utils/LatestToken';

export const VIEW_TYPE_MAP = 'storyteller-map-view';

/** Minimal shape for any entity that has a name + optional id/filePath. */
type NamedEntity = { id?: string; name: string; filePath?: string };

/** Internal shape for Leaflet tile layer private APIs we call. */
interface LeafletTileLayerInternal {
    _url?: string;
    getTileUrl?: (coords: unknown) => string;
    redraw?: () => void;
    _update?: () => void;
    _resetView?: () => void;
    getContainer?: () => HTMLElement | undefined;
}

/** Saved map view state shape returned by getState() / consumed by setState(). */
interface MapViewState extends Record<string, unknown> {
    mapId?: string;
    zoom?: number;
    center?: { lat: number; lng: number } | L.LatLng | null;
}

/**
 * MapView provides a full-screen dedicated view for interactive maps
 * Users can open this in any workspace leaf for a larger, persistent visualization
 *
 * UI Structure:
 * - Toolbar: Zoom controls, fullscreen, refresh
 * - Map Selector: Dropdown to select which map to display
 * - Map Container: Flex-grow to fill remaining space with Leaflet map
 * - Status Footer: Map info (type, scale, marker count)
 */
/** What one drawing save changed: the drawing before it and the drawing it asked for. */
interface InkChange {
    before: InkDoc;
    after: InkDoc;
}

/**
 * Undo one save's changes to a list of layers or items. Entries the save added are removed and
 * entries it changed or removed get their old version back. An entry that a later save changed
 * again is left alone, so that later edit is kept.
 */
function undoListChange<T extends { id: string }>(current: T[], before: T[], after: T[]): T[] {
    const same = (a: T, b: T | undefined): boolean => b !== undefined && JSON.stringify(a) === JSON.stringify(b);
    const beforeById = new Map(before.map(item => [item.id, item]));
    const afterById = new Map(after.map(item => [item.id, item]));
    const currentIds = new Set(current.map(item => item.id));
    const result: T[] = [];
    for (const item of current) {
        const written = afterById.get(item.id);
        if (!written || !same(item, written)) {
            result.push(item);
            continue;
        }
        const previous = beforeById.get(item.id);
        if (previous) result.push(previous);
    }
    for (const [id, item] of beforeById) {
        if (!afterById.has(id) && !currentIds.has(id)) result.push(item);
    }
    return result;
}

export class MapView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private currentMap: StoryMap | null = null;
    private leafletRenderer: LeafletRenderer | null = null;
    private hierarchyManager: MapHierarchyManager;

    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private mapSelectorEl: HTMLElement | null = null;
    private breadcrumbEl: HTMLElement | null = null;
    private mapContainer: HTMLElement | null = null;
    private entityBarEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private footerStatusEl: HTMLElement | null = null;

    // Controls
    private mapDropdown: DropdownComponent | null = null;
    private locationLevelDropdown: DropdownComponent | null = null;

    // State
    private resizeObserver: ResizeObserver | null = null;
    private hasRegisteredWorkspaceResizeListener = false;
    private currentZoom = 2;
    private locationLevelMode: LocationLevel = 'auto';
    private gridController: GridController | null = null;
    /** The Map Ink editor for the open map. Null while the map is loading or closed. */
    private inkEditor: InkEditor | null = null;
    /** The Draw toolbar button, so its pressed state follows the editor. Null when the toolbar has none. */
    private inkButton: HTMLButtonElement | null = null;
    private inkSaveQueue: Promise<void> = Promise.resolve();
    /** Drawing writes queued or running; while any are, the in-memory drawing is newer than the note. */
    private inkWritesPending = 0;
    private mapRenderToken = 0;
    /** Last map requested by loadMap. Older loads that finish late are dropped. */
    private mapLoadToken = new LatestToken();
    private placementMode: { type: 'location' | 'character' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem' | 'group' | 'scene' | 'reference' | null } = { type: null };
    private placementClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
    private placementOverlay: HTMLElement | null = null;
    private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
    private _savedCenter: { lat: number; lng: number } | null = null;
    private _wheelHandler: ((ev: WheelEvent) => void) | null = null;
    private _touchMoveHandler: ((ev: TouchEvent) => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hierarchyManager = new MapHierarchyManager(this.app, this.plugin);
    }

    getViewType(): string {
        return VIEW_TYPE_MAP;
    }

    getDisplayText(): string {
        return this.currentMap ? this.currentMap.name : 'Map';
    }

    getIcon(): string {
        return 'map';
    }

    async onOpen(): Promise<void> {
        let mapRefreshTimer: number | null = null;
        const queueMapRefresh = () => {
            if (mapRefreshTimer !== null) window.clearTimeout(mapRefreshTimer);
            mapRefreshTimer = window.setTimeout(() => { void this.refreshMapMembership().catch(error => new Notice(`Map refresh failed: ${String(error)}`)); }, 200);
        };
        this.registerEvent(this.app.metadataCache.on('changed', queueMapRefresh));
        this.registerEvent(this.app.vault.on('delete', queueMapRefresh));
        this.registerEvent(this.app.vault.on('rename', queueMapRefresh));
        this.register(() => { if (mapRefreshTimer !== null) window.clearTimeout(mapRefreshTimer); });
        const container = this.contentEl;
        container.empty();
        container.addClass('storyteller-map-view');
        
        // Ensure container has proper base styles
        container.setCssStyles({ display: 'flex' });
        container.setCssStyles({ flexDirection: 'column' });
        container.setCssStyles({ flex: '1 1 0', height: 'auto', minHeight: '0', minWidth: '0' });
        container.setCssStyles({ overflow: 'hidden' });

        // Create main sections with flex layout
        this.toolbarEl = container.createDiv('storyteller-map-toolbar');
        this.mapSelectorEl = container.createDiv('storyteller-map-selector');
        this.breadcrumbEl = container.createDiv('storyteller-map-breadcrumb');
        this.mapContainer = container.createDiv('storyteller-map-container');
        this.entityBarEl = container.createDiv('storyteller-map-entity-bar');
        this.footerEl = container.createDiv('storyteller-map-footer');
        
        // CRITICAL: Set map container positioning for Leaflet
        this.mapContainer.setCssStyles({ flex: '1' });
        this.mapContainer.setCssStyles({ position: 'relative' });
        this.mapContainer.setCssStyles({ overflow: 'hidden' });
        this.mapContainer.setCssStyles({ minHeight: '0', minWidth: '0' });

        // Build each section
        await this.buildToolbar();
        await this.buildMapSelector();
        await this.buildBreadcrumb();
        this.buildEntityBar();
        this.buildFooter();

        // Setup resize observer for responsive layout
        this.setupResizeObserver();

        // Load map from state if provided
        const state = this.getState();
        if (state.mapId) {
            await this.loadMap(state.mapId);
        }
    }

    /**
     * Build toolbar with map controls
     */
    private async buildToolbar(): Promise<void> {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();

        // Back to Parent Map button (only show if map has parent)
        if (this.currentMap?.parentMapId) {
            const parentMap = await this.hierarchyManager.getMapPath(
                this.currentMap.id || this.currentMap.name
            );
            const parentMapInfo = parentMap.length > 1 ? parentMap[parentMap.length - 2] : null;

            if (parentMapInfo) {
                const backBtn = this.toolbarEl.createEl('button', {
                    cls: 'clickable-icon storyteller-toolbar-btn storyteller-back-btn',
                    attr: {
                        'aria-label': `Back to ${parentMapInfo.name}`,
                        'title': `Back to ${parentMapInfo.name}`
                    }
                });
                setIcon(backBtn, 'arrow-left');
                backBtn.createSpan({
                    text: ` ${parentMapInfo.name}`,
                    cls: 'storyteller-back-btn-text'
                });
                backBtn.onclick = async () => {
                    const parentId = parentMapInfo.id || parentMapInfo.name;
                    await this.loadMap(parentId);
                    // Briefly highlight the current map marker on parent map (future enhancement)
                    new Notice(`Navigated to ${parentMapInfo.name}`);
                };

                // Add separator
                this.toolbarEl.createDiv('storyteller-toolbar-separator');
            }
        }

        // Open Map Note button (opens the map file in editor)
        if (this.currentMap && this.currentMap.filePath) {
            const editNoteBtn = this.toolbarEl.createEl('button', {
                cls: 'clickable-icon storyteller-toolbar-btn',
                attr: {
                    'aria-label': 'Edit map note',
                    'title': 'Edit map note'
                }
            });
            setIcon(editNoteBtn, 'file-edit');
            editNoteBtn.onclick = async () => {
                if (this.currentMap && this.currentMap.filePath) {
                    const file = this.app.vault.getAbstractFileByPath(this.currentMap.filePath);
                    if (file instanceof TFile) {
                        await this.app.workspace.getLeaf(false).openFile(file);
                    }
                }
            };
        }

        // Spacer
        this.toolbarEl.createDiv('storyteller-toolbar-spacer');

        // Draw: opens the Map Ink editor (drawing tools, inspector and layers)
        this.inkButton = null;
        if (this.currentMap) {
            const drawBtn = this.toolbarEl.createEl('button', {
                cls: 'clickable-icon storyteller-toolbar-btn',
                attr: {
                    'aria-label': 'Draw on map',
                    'title': 'Draw on map',
                    'aria-pressed': 'false'
                }
            });
            setIcon(drawBtn, 'pen-tool');
            drawBtn.onclick = () => { void this.toggleInk(); };
            this.inkButton = drawBtn;
            this.syncInkButton();
        }

        // Refresh button
        const refreshBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('refresh'),
                'title': t('refresh')
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => this.refresh();

        // More options menu
        const moreBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'More options',
                'title': 'More options'
            }
        });
        setIcon(moreBtn, 'more-vertical');
        moreBtn.onclick = (event) => this.showMoreMenu(event);
    }

    /**
     * Build map selector dropdown
     */
    private async buildMapSelector(): Promise<void> {
        if (!this.mapSelectorEl) return;
        this.mapSelectorEl.empty();

        // Load all maps
        const maps = await this.plugin.listMaps();

        // Create label
        this.mapSelectorEl.createEl('label', {
            text: 'Select map: ',
            cls: 'storyteller-map-selector-label'
        });

        // Create dropdown
        const dropdownContainer = this.mapSelectorEl.createDiv('storyteller-map-selector-dropdown');

        this.mapDropdown = new DropdownComponent(dropdownContainer);

        if (maps.length === 0) {
            this.mapDropdown.addOption('', 'No maps available');
            this.mapDropdown.setDisabled(true);
        } else {
            this.mapDropdown.addOption('', 'Select a map...');
            maps.forEach(map => {
                const mapId = map.id || map.name;
                this.mapDropdown!.addOption(mapId, map.name);
            });

            this.mapDropdown.onChange(async (value) => {
                if (value) {
                    await this.loadMap(value);
                }
            });
        }


        // Set current map if exists
        if (this.currentMap) {
            const mapId = this.currentMap.id || this.currentMap.name;
            this.mapDropdown.setValue(mapId);
        }
    }

    /**
     * Build breadcrumb navigation showing map hierarchy
     */
    private async buildBreadcrumb(): Promise<void> {
        if (!this.breadcrumbEl) return;
        this.breadcrumbEl.empty();

        // Only show if a map is loaded
        if (!this.currentMap || !this.currentMap.id) {
            this.breadcrumbEl.setCssStyles({ display: 'none' });
            return;
        }

        this.breadcrumbEl.setCssStyles({ display: 'flex' });
        this.breadcrumbEl.setCssStyles({ flexShrink: '0' });
        this.breadcrumbEl.addClass('storyteller-map-breadcrumb');

        // Get breadcrumb path
        const breadcrumbPath = await this.hierarchyManager.getBreadcrumbPath(
            this.currentMap.id || this.currentMap.name
        );

        // Only show if there's more than one map in the hierarchy (has parent)
        if (breadcrumbPath.length <= 1) {
            this.breadcrumbEl.setCssStyles({ display: 'none' });
            return;
        }

        // Crumbs: each has a Lucide icon for its scale. Ancestors are buttons, the current map is plain text.
        breadcrumbPath.forEach((mapInfo, index) => {
            const isCurrent = index === breadcrumbPath.length - 1;

            if (index > 0) {
                const separator = this.breadcrumbEl!.createSpan('breadcrumb-separator');
                setIcon(separator, 'chevron-right');
                separator.setAttribute('aria-hidden', 'true');
            }

            const crumb = isCurrent
                ? this.breadcrumbEl!.createSpan({ cls: 'breadcrumb-item breadcrumb-item-current' })
                : this.breadcrumbEl!.createEl('button', {
                    cls: 'breadcrumb-item breadcrumb-item-clickable',
                    attr: { type: 'button', title: `Open ${mapInfo.name}` }
                });
            if (isCurrent) crumb.setAttribute('aria-current', 'page');

            const icon = crumb.createSpan({ cls: 'breadcrumb-item-icon' });
            setIcon(icon, this.getScaleIcon(mapInfo.scale));
            crumb.createSpan({ cls: 'breadcrumb-item-label', text: mapInfo.name });

            if (!isCurrent) {
                crumb.onclick = async () => {
                    await this.loadMap(mapInfo.id);
                };
            }
        });
    }

    /**
     * Lucide icon name for a map scale (plugin UI uses Lucide icons, not emoji).
     */
    private getScaleIcon(scale: StoryMap['scale']): string {
        const scaleIcons: Record<string, string> = {
            'world': 'globe',
            'region': 'crown',
            'city': 'castle',
            'building': 'landmark',
            'custom': 'map-pin'
        };
        return scaleIcons[scale || 'custom'] || 'map-pin';
    }

    /**
     * Build entity bar for adding entities to the map
     */
    private buildEntityBar(): void {
        if (!this.entityBarEl) return;
        this.entityBarEl.empty();
        this.entityBarEl.addClass('storyteller-map-entity-bar');

        // Only show if a map is loaded
        if (!this.currentMap) {
            this.entityBarEl.setCssStyles({ display: 'none' });
            return;
        }

        this.entityBarEl.setCssStyles({ display: 'flex' });
        this.entityBarEl.setCssStyles({ flexShrink: '0' });

        // Label
        const label = this.entityBarEl.createDiv('entity-bar-label');
        label.textContent = 'Add to map:';

        // Add Location button
        const addLocationBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add location',
                'title': 'Add a location to this map'
            }
        });
        setIcon(addLocationBtn, 'map-pin');
        addLocationBtn.createSpan({ text: 'Location' });
        addLocationBtn.onclick = () => this.showAddLocationModal();

        // Add Character button
        const addCharacterBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add character',
                'title': 'Add a character to this map'
            }
        });
        setIcon(addCharacterBtn, 'user');
        addCharacterBtn.createSpan({ text: 'Character' });
        addCharacterBtn.onclick = () => this.showAddCharacterModal();

        // Add Event button
        const addEventBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add event',
                'title': 'Add an event to this map'
            }
        });
        setIcon(addEventBtn, 'calendar');
        addEventBtn.createSpan({ text: 'Event' });
        addEventBtn.onclick = () => this.showAddEventModal();

        // Add Item button
        const addItemBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add item',
                'title': 'Add an item to this map'
            }
        });
        setIcon(addItemBtn, 'box');
        addItemBtn.createSpan({ text: 'Item' });
        addItemBtn.onclick = () => this.showAddItemModal();

        // Add Culture button
        const addCultureBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add culture',
                'title': 'Add a culture to this map'
            }
        });
        setIcon(addCultureBtn, 'theater');
        addCultureBtn.createSpan({ text: 'Culture' });
        addCultureBtn.onclick = () => this.showAddEntityModal('culture');

        // Add Economy button
        const addEconomyBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add economy',
                'title': 'Add an economy to this map'
            }
        });
        setIcon(addEconomyBtn, 'dollar-sign');
        addEconomyBtn.createSpan({ text: 'Economy' });
        addEconomyBtn.onclick = () => this.showAddEntityModal('economy');

        // Add Magic System button
        const addMagicSystemBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add magic system',
                'title': 'Add a magic system to this map'
            }
        });
        setIcon(addMagicSystemBtn, 'sparkles');
        addMagicSystemBtn.createSpan({ text: 'Magic' });
        addMagicSystemBtn.onclick = () => this.showAddEntityModal('magicsystem');

        // Add Group button
        const addGroupBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add group',
                'title': 'Add a group to this map'
            }
        });
        setIcon(addGroupBtn, 'users');
        addGroupBtn.createSpan({ text: 'Group' });
        addGroupBtn.onclick = () => this.showAddEntityModal('group');

        // Add Scene button
        const addSceneBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add scene',
                'title': 'Add a scene to this map'
            }
        });
        setIcon(addSceneBtn, 'clapperboard');
        addSceneBtn.createSpan({ text: 'Scene' });
        addSceneBtn.onclick = () => this.showAddEntityModal('scene');

        // Add Reference button
        const addReferenceBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add reference',
                'title': 'Add a reference to this map'
            }
        });
        setIcon(addReferenceBtn, 'book-open');
        addReferenceBtn.createSpan({ text: 'Reference' });
        addReferenceBtn.onclick = () => this.showAddEntityModal('reference');

        // Location Level dropdown (only for real-world maps)
        const isRealWorldMap = this.currentMap && (
            this.currentMap.type === 'real' ||
            this.currentMap.osmLayer === true ||
            this.currentMap.tileServer?.includes('openstreetmap') ||
            this.currentMap.tileServer?.includes('tile')
        );

        if (isRealWorldMap) {
            // Separator
            this.entityBarEl.createDiv('entity-bar-separator');

            // Location level container
            const levelContainer = this.entityBarEl.createDiv('entity-bar-level-container');
            
            const levelLabel = levelContainer.createEl('label', {
                cls: 'entity-bar-level-label',
                attr: { title: 'Control the granularity of auto-created locations' }
            });
            setIcon(levelLabel, 'layers');
            levelLabel.createSpan({ text: ' Level:' });

            const dropdownContainer = levelContainer.createDiv('entity-bar-level-dropdown');
            this.locationLevelDropdown = new DropdownComponent(dropdownContainer);
            
            // Add options
            this.locationLevelDropdown.addOption('auto', '🔍 Auto (by zoom)');
            this.locationLevelDropdown.addOption('building', '🏛️ building');
            this.locationLevelDropdown.addOption('neighborhood', '🏘️ neighborhood');
            this.locationLevelDropdown.addOption('city', '🏙️ city');
            this.locationLevelDropdown.addOption('region', '🗺️ region/state');
            this.locationLevelDropdown.addOption('country', '🏳️ country');
            this.locationLevelDropdown.addOption('continent', '🌍 Continent');

            this.locationLevelDropdown.setValue(this.locationLevelMode);
            this.locationLevelDropdown.onChange((value) => {
                this.locationLevelMode = value as LocationLevel;
                
                // Update footer and dropdown label to reflect new selection
                this.updateFooterStatus();
                this.updateLocationLevelDropdownLabel();
            });

            // Initial label update
            window.setTimeout(() => this.updateLocationLevelDropdownLabel(), 100);
        }

        // Spacer
        this.entityBarEl.createDiv('entity-bar-spacer');

        // Quick actions
        const quickActions = this.entityBarEl.createDiv('entity-bar-quick-actions');
        this.gridController?.mountToolbar(quickActions);
        
        // Edit map button
        const editMapBtn = quickActions.createEl('button', {
            cls: 'entity-bar-btn entity-bar-btn-small',
            attr: {
                'aria-label': 'Edit map',
                'title': 'Edit map settings'
            }
        });
        setIcon(editMapBtn, 'edit');
        editMapBtn.onclick = () => this.showEditMapModal();
        
        // Refresh entities button
        const refreshBtn = quickActions.createEl('button', {
            cls: 'entity-bar-btn entity-bar-btn-small',
            attr: {
                'aria-label': 'Refresh entities',
                'title': 'Refresh entities on map'
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => this.refresh();
    }

    /**
     * Get the effective location level based on current zoom
     * Used for auto mode to determine what granularity to use
     */
    private getEffectiveLevelForZoom(zoom: number): LocationLevel {
        if (zoom >= 16) return 'building';
        if (zoom >= 14) return 'neighborhood';
        if (zoom >= 10) return 'city';
        if (zoom >= 6) return 'region';
        if (zoom >= 3) return 'country';
        return 'continent';
    }

    /**
     * Get display label for a location level
     */
    private getLevelDisplayLabel(level: LocationLevel, includeEmoji = true): string {
        const labels: Record<LocationLevel, { emoji: string; text: string }> = {
            'auto': { emoji: '🔍', text: 'Auto' },
            'building': { emoji: '🏛️', text: 'Building' },
            'neighborhood': { emoji: '🏘️', text: 'Neighborhood' },
            'city': { emoji: '🏙️', text: 'City' },
            'region': { emoji: '🗺️', text: 'Region' },
            'country': { emoji: '🏳️', text: 'Country' },
            'continent': { emoji: '🌍', text: 'Continent' }
        };
        const l = labels[level];
        return includeEmoji ? `${l.emoji} ${l.text}` : l.text;
    }

    /**
     * Update the location level dropdown label to show effective level when in Auto mode
     * Called on zoom changes to give real-time feedback
     */
    private updateLocationLevelDropdownLabel(): void {
        if (!this.locationLevelDropdown) return;
        
        const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
        
        // Update footer status with zoom info
        this.updateFooterStatus();

        // If in auto mode, update the dropdown to show effective level
        if (this.locationLevelMode === 'auto') {
            const effectiveLevel = this.getEffectiveLevelForZoom(currentZoom);
            const effectiveLabel = this.getLevelDisplayLabel(effectiveLevel, false);
            
            // Update the 'auto' option text to show current effective level
            const selectEl = this.locationLevelDropdown.selectEl;
            if (selectEl) {
                const autoOption = selectEl.querySelector('option[value="auto"]');
                if (autoOption) {
                    autoOption.textContent = `🔍 Auto → ${effectiveLabel} (z${Math.round(currentZoom)})`;
                }
            }
        }
    }

    /**
     * Open or close the Map Ink editor. Opening first ends any grid painting and
     * disarms entity placement, so only one of them is armed at a time.
     */
    private async toggleInk(): Promise<void> {
        const editor = this.inkEditor;
        if (!editor) {
            new Notice('The map is still loading. Try again in a moment.');
            return;
        }
        if (editor.isOpen()) {
            const closing = editor.close();
            this.syncInkButton();
            await closing;
            return;
        }
        if (this.gridController && !await this.gridController.endEditing()) return;
        this.disablePlacementMode();
        editor.open();
        this.syncInkButton();
    }

    /** Close the Map Ink editor when another tool arms. The drawing stays on the map. */
    private closeInk(): void {
        void this.inkEditor?.close();
        this.syncInkButton();
    }

    /** Save the open Map Ink editor and remove it. Its pending save runs first, against the note it was made for. */
    private async destroyInkEditor(): Promise<void> {
        const editor = this.inkEditor;
        this.inkEditor = null;
        this.syncInkButton();
        if (editor) await editor.destroy();
    }

    /** Show the Draw button as pressed exactly while the Map Ink editor is open. */
    private syncInkButton(): void {
        const btn = this.inkButton;
        if (!btn) return;
        const open = this.inkEditor?.isOpen() === true;
        btn.classList.toggle('is-active', open);
        btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    }

    /**
     * Build the Map Ink editor on the renderer's drawing layer and legend. The host saves to the
     * note that was open when the editor was built, so a later map switch cannot redirect a write.
     */
    private createInkEditor(map: L.Map, layer: InkLayer, legend: InkLegend | null): InkEditor {
        const current = this.currentMap;
        const filePath = current?.filePath;
        const host = new ObsidianInkHost({
            plugin: this.plugin,
            load: () => inkDocOf(this.currentMap ?? {}),
            save: doc => this.saveInk(doc, filePath),
            snapPoint: latlng => this.gridController?.snapPoint(latlng) ?? latlng,
        });
        return new InkEditor({
            L,
            map,
            host,
            container: map.getContainer(),
            doc: inkDocOf(current ?? {}),
            layer,
            legend: legend ?? undefined,
        });
    }

    /**
     * Write the drawing to the map note's `mapInk` key. Writes run one after another. The open
     * map is updated first, so a second change builds on this one. In the same write the old
     * Maplog keys are removed, so they cannot come back over the new drawing.
     */
    private saveInk(doc: InkDoc, filePath: string | undefined = this.currentMap?.filePath): Promise<void> {
        const file = filePath ? this.app.vault.getAbstractFileByPath(filePath) : null;
        if (!filePath || !(file instanceof TFile)) return Promise.reject(new Error('Save the map note before drawing on the map.'));
        // Round-trip through the frontmatter shape, so the in-memory state equals what the note will hold.
        const clean = inkDocOf({ mapInk: inkFrontmatter(normalizeInk(doc)) });
        const map = this.currentMap;
        const isOpen = map?.filePath === filePath;
        const change: InkChange = { before: isOpen && map ? inkDocOf(map) : clean, after: clean };
        let optimistic: StoryMap | null = null;
        if (isOpen && map) {
            optimistic = { ...map, mapInk: inkFrontmatter(clean) };
            this.currentMap = optimistic;
        }
        this.inkWritesPending++;
        const run = async (): Promise<void> => {
            // Write the drawing as it is now, not as it was when this save was made: a later save may
            // already be in memory, and an earlier save may have been rolled back while this one waited.
            const latest = isOpen && this.currentMap?.filePath === filePath ? inkDocOf(this.currentMap) : clean;
            const patch = inkFrontmatter(latest);
            try {
                // processFrontMatter keeps the rest of the note and writes in one operation.
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    fm[INK_FRONTMATTER_KEY] = patch;
                    for (const key of MAPLOG_KEYS) Reflect.deleteProperty(fm, key);
                });
            } catch (error) {
                // Undo this write before the next queued run starts, so that run does not write it.
                if (optimistic && map) this.rollbackInk(map, optimistic, change);
                throw error;
            }
        };
        const queued = this.inkSaveQueue.then(run, run).finally(() => { this.inkWritesPending--; });
        this.inkSaveQueue = queued.catch(() => undefined);
        return queued;
    }

    /**
     * Take back one rejected write from the in-memory map. Only that write's own changes are
     * undone: a later save that was built on top of it keeps its edits. The open editor keeps
     * its drawing, so the next change saves it again.
     */
    private rollbackInk(map: StoryMap, optimistic: StoryMap, change: InkChange): void {
        // Nothing has changed since the write, so the map state from before it is restored as it was.
        if (this.currentMap === optimistic) {
            this.currentMap = map;
            return;
        }
        // The open map has changed since the write, so its state is not this note's.
        if (!this.currentMap || this.currentMap.filePath !== map.filePath) return;
        const current = inkDocOf(this.currentMap);
        const restored: InkDoc = {
            version: 1,
            layers: undoListChange(current.layers, change.before.layers, change.after.layers),
            items: undoListChange(current.items, change.before.items, change.after.items),
        };
        this.currentMap = { ...this.currentMap, mapInk: inkFrontmatter(restored) };
    }

    /**
     * Enable placement mode for clicking on map to place entities
     */
    private async enablePlacementMode(
        entityType: 'location' | 'character' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem' | 'group' | 'scene' | 'reference',
        onPlaceCoordinates: (coordinates: [number, number]) => void
    ): Promise<void> {
        if (this.gridController && !await this.gridController.endEditing()) return;
        this.closeInk();
        // Disable any existing placement mode first
        this.disablePlacementMode();

        this.placementMode.type = entityType;
        this.gridController?.setPlacement(true);

        // Create instruction overlay
        if (this.mapContainer) {
            const entityTypeText = entityType.charAt(0).toUpperCase() + entityType.slice(1);
            this.placementOverlay = createPlacementOverlay(this.mapContainer, {
                text: `Click map to place ${entityTypeText}`,
                hint: 'Press ESC to cancel',
                decorate: instruction => {
                    const placementIcon = instruction.createDiv('placement-icon');
                    setIcon(placementIcon, 'map-pin');
                },
                // Touch users have no Esc key, so the bar carries its own Cancel button.
                onCancel: () => {
                    this.disablePlacementMode();
                    new Notice('Placement cancelled');
                },
            });
        }

        // Change cursor to crosshair
        if (this.mapContainer) {
            this.mapContainer.setCssStyles({ cursor: 'crosshair' });
        }

        // Get the Leaflet map instance
        const leafletMap = this.leafletRenderer?.getMap();
        if (!leafletMap) {
            new Notice('Map not initialized. Please wait.');
            this.disablePlacementMode();
            return;
        }

        // Add click handler to map
        this.placementClickHandler = (e: L.LeafletMouseEvent) => {
            const raw: [number, number] = [e.latlng.lat, e.latlng.lng];
            const coordinates = this.gridController?.snapPoint(raw) ?? raw;

            // Disable placement mode
            this.disablePlacementMode();

            // Call callback with coordinates
            onPlaceCoordinates(coordinates);
        };

        leafletMap.on('click', this.placementClickHandler);

        // Add ESC key handler to cancel
        this.escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.disablePlacementMode();
                new Notice('Placement cancelled');
            }
        };
        activeDocument.addEventListener('keydown', this.escapeHandler);
    }

    /**
     * Disable placement mode
     */
    private disablePlacementMode(): void {
        // Remove overlay
        if (this.placementOverlay) {
            this.placementOverlay.remove();
            this.placementOverlay = null;
        }

        // Reset cursor
        if (this.mapContainer) {
            this.mapContainer.setCssStyles({ cursor: '' });
        }

        // Remove click handler
        const leafletMap = this.leafletRenderer?.getMap();
        if (leafletMap && this.placementClickHandler) {
            leafletMap.off('click', this.placementClickHandler);
            this.placementClickHandler = null;
        }

        // Remove ESC handler
        if (this.escapeHandler) {
            activeDocument.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }

        // Reset placement mode
        this.placementMode.type = null;
        this.gridController?.setPlacement(false);
    }

    /**
     * Show map editing modal
     */
    private showEditMapModal(): void {
        if (!this.currentMap) return;

        openMapModal(
            this.app,
            this.plugin,
            this.currentMap,
            {
                refreshMapView: true,
                onSave: async (updatedMap) => {
                    // Reload the map to reflect changes
                    const mapId = updatedMap.id || updatedMap.name;
                    await this.loadMap(mapId);
                },
                onDelete: async () => {
                    // The map is going away: leave placement, grid and the drawing editor with it.
                    this.disablePlacementMode();
                    this.gridController?.destroy();
                    this.gridController = null;
                    await this.destroyInkEditor();
                    // Clear current map and refresh selector
                    this.currentMap = null;
                    await this.buildMapSelector();
                    this.buildEntityBar();
                    this.updateFooterStatus();
                    
                    if (this.mapContainer) {
                        this.mapContainer.empty();
                    }
                    if (this.leafletRenderer) {
                        this.leafletRenderer.unload();
                        this.leafletRenderer = null;
                    }
                }
            }
        );
    }

    /**
     * Show modal to add a location to the map
     */
    private showAddLocationModal(): void {
        if (!this.currentMap) return;

        // First, select the location
        new LocationSuggestModal(this.app, this.plugin, (selectedLocation) => { void (async () => {
            if (!selectedLocation) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('location', (coordinates) => { void (async () => {
                try {
                    await locationService.addMapBinding(
                        selectedLocation.id || selectedLocation.name,
                        mapId,
                        coordinates
                    );

                    new Notice(`Added ${selectedLocation.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    await this.refresh();
                } catch {
                    
                    new Notice('Error adding location to map');
                }
            })(); });

            new Notice(`Click map to place ${selectedLocation.name}`);
        })(); }).open();
    }

    /**
     * Show modal to add a character to the map
     */
    private async ensureLocationMapBinding(service: LocationService, id: string, mapId: string, coordinates: [number, number]): Promise<void> {
        const location = await service.getLocation(id);
        if (location?.mapBindings?.some(b => b.mapId === mapId)) return;
        // Area-only locations are rendered through the native marker adapter.
        if (this.currentMap?.placementGrid?.areas.some(a => a.locationId === location?.id && a.cells.length)) return;
        await service.addMapBinding(id, mapId, coordinates);
    }

    private showAddCharacterModal(): void {
        if (!this.currentMap) return;

        // First, select the character
        new CharacterSuggestModal(this.app, this.plugin, (selectedCharacter) => { void (async () => {
            if (!selectedCharacter) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if character has a current location
            let characterLocation: Location | null = null;
            if (selectedCharacter.currentLocationId) {
                characterLocation = await locationService.getLocation(selectedCharacter.currentLocationId);

                // Check if location is already on this map
                if (characterLocation) {
                    const binding = characterLocation.mapBindings?.find((b: MapBinding) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Character "${selectedCharacter.name}" is already on the map at their current location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('character', (coordinates) => { void (async () => {
                try {
                    if (characterLocation) {
                        // Character has existing location - place it at coordinates
                        await this.ensureLocationMapBinding(locationService,
                            characterLocation.id || characterLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            characterLocation.id || characterLocation.name,
                            {
                                entityId: selectedCharacter.id || selectedCharacter.name,
                                entityType: 'character',
                                relationship: 'located here'
                            }
                        );
                        new Notice(`Added ${selectedCharacter.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Character has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: Location;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            
                            
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'character', name: selectedCharacter.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<Location | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalClose = modal.onClose.bind(modal) as () => void;
                                    modal.onClose = () => {
                                        originalClose();
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedCharacter.name}'s Location`,
                                        description: `Auto-created location for ${selectedCharacter.name} at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await this.ensureLocationMapBinding(locationService,
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedCharacter.name}'s Location`,
                                    description: `Auto-created location for ${selectedCharacter.name} at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation);
                                isNewLocation = true;
                            }
                        }

                        // Assign character to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedCharacter.currentLocationId = locationId;
                        await this.plugin.saveCharacter(selectedCharacter);

                        // Add character to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedCharacter.id || selectedCharacter.name,
                                entityType: 'character',
                                relationship: 'located here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedCharacter.name}`);
                        } else {
                            new Notice(`Character placed at existing location "${targetLocation.name}"`);
                        }
                    }

                    this.gridController?.refreshEntities();
                    // Refresh entities on the map
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch {
                    
                    new Notice('Error adding character to map');
                }
            })(); });

            new Notice(`Click map to place ${selectedCharacter.name}`);
        })(); }).open();
    }

    /**
     * Show modal to add an event to the map
     */
    private showAddEventModal(): void {
        if (!this.currentMap) return;

        // First, select the event
        new EventSuggestModal(this.app, this.plugin, (selectedEvent) => { void (async () => {
            if (!selectedEvent) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if event has a location
            let eventLocation: Location | null = null;
            if (selectedEvent.location) {
                eventLocation = await locationService.getLocation(selectedEvent.location);

                // Check if location is already on this map
                if (eventLocation) {
                    const binding = eventLocation.mapBindings?.find((b: MapBinding) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Event "${selectedEvent.name}" is already on the map at its location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('event', (coordinates) => { void (async () => {
                try {
                    // If event has a location, bind that location to the map at these coordinates
                    if (eventLocation) {
                        await this.ensureLocationMapBinding(locationService,
                            eventLocation.id || eventLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            eventLocation.id || eventLocation.name,
                            {
                                entityId: selectedEvent.id || selectedEvent.name,
                                entityType: 'event',
                                relationship: 'occurred here'
                            }
                        );
                        new Notice(`Added ${selectedEvent.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Event has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: Location;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            
                            
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'event', name: selectedEvent.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<Location | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalClose = modal.onClose.bind(modal) as () => void;
                                    modal.onClose = () => {
                                        originalClose();
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedEvent.name} Location`,
                                        description: `Auto-created location for event "${selectedEvent.name}" at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await this.ensureLocationMapBinding(locationService,
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedEvent.name} Location`,
                                    description: `Auto-created location for event "${selectedEvent.name}" at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation);
                                isNewLocation = true;
                            }
                        }

                        // Assign event to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedEvent.location = locationId;
                        await this.plugin.saveEvent(selectedEvent);

                        // Add event to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedEvent.id || selectedEvent.name,
                                entityType: 'event',
                                relationship: 'occurred here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedEvent.name}`);
                        } else {
                            new Notice(`Event placed at existing location "${targetLocation.name}"`);
                        }
                    }

                    this.gridController?.refreshEntities();
                    // Refresh entities on the map (preserves zoom/pan state)
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch {
                    
                    new Notice('Error adding event to map');
                }
            })(); });

            new Notice(`Click map to place ${selectedEvent.name}`);
        })(); }).open();
    }

    /**
     * Show modal to add an item to the map
     */
    private showAddItemModal(): void {
        if (!this.currentMap) return;

        // First, select the item
        new PlotItemSuggestModal(this.app, this.plugin, (selectedItem) => { void (async () => {
            if (!selectedItem) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if item has a current location
            let itemLocation: Location | null = null;
            if (selectedItem.currentLocation) {
                itemLocation = await locationService.getLocation(selectedItem.currentLocation);

                // Check if location is already on this map
                if (itemLocation) {
                    const binding = itemLocation.mapBindings?.find((b: MapBinding) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Item "${selectedItem.name}" is already on the map at its current location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('item', (coordinates) => { void (async () => {
                try {
                    // If item has a location, bind that location to the map at these coordinates
                    if (itemLocation) {
                        await this.ensureLocationMapBinding(locationService,
                            itemLocation.id || itemLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            itemLocation.id || itemLocation.name,
                            {
                                entityId: selectedItem.id || selectedItem.name,
                                entityType: 'item',
                                relationship: 'located here'
                            }
                        );
                        new Notice(`Added ${selectedItem.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Item has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: Location;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            
                            
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'item', name: selectedItem.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<Location | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalClose = modal.onClose.bind(modal) as () => void;
                                    modal.onClose = () => {
                                        originalClose();
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedItem.name} Location`,
                                        description: `Auto-created location for item "${selectedItem.name}" at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await this.ensureLocationMapBinding(locationService,
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedItem.name} Location`,
                                    description: `Auto-created location for item "${selectedItem.name}" at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation);
                                isNewLocation = true;
                            }
                        }

                        // Assign item to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedItem.currentLocation = locationId;
                        await this.plugin.savePlotItem(selectedItem);

                        // Add item to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedItem.id || selectedItem.name,
                                entityType: 'item',
                                relationship: 'located here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedItem.name}`);
                        } else {
                            new Notice(`Item placed at existing location "${targetLocation.name}"`);
                        }
                    }

                    this.gridController?.refreshEntities();
                    // Refresh entities on the map (preserves zoom/pan state)
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch {
                    
                    new Notice('Error adding item to map');
                }
            })(); });

            new Notice(`Click map to place ${selectedItem.name}`);
        })(); }).open();
    }

    /**
     * Generic method to add any entity type to map
     * Handles culture, economy, magicsystem, group, scene, reference uniformly
     */
    private async showAddEntityModal(entityType: 'culture' | 'economy' | 'magicsystem' | 'group' | 'scene' | 'reference'): Promise<void> {
        if (!this.currentMap) return;

        const mapId = this.currentMap.id || this.currentMap.name;
        const locationService = new LocationService(this.plugin);

        // Get all entities of the specified type
        let entities: NamedEntity[] = [];
        let entityTypeName = '';

        switch (entityType) {
            case 'culture':
                entities = await this.plugin.listCultures();
                entityTypeName = 'Culture';
                break;
            case 'economy':
                entities = await this.plugin.listEconomies();
                entityTypeName = 'Economy';
                break;
            case 'magicsystem':
                entities = await this.plugin.listMagicSystems();
                entityTypeName = 'Magic System';
                break;
            case 'group':
                entities = this.plugin.getGroups();
                entityTypeName = 'Group';
                break;
            case 'scene':
                entities = await this.plugin.listScenes();
                entityTypeName = 'Scene';
                break;
            case 'reference':
                entities = await this.plugin.listReferences();
                entityTypeName = 'Reference';
                break;
        }

        if (entities.length === 0) {
            new Notice(`No ${entityTypeName.toLowerCase()}s found. Create one first.`);
            return;
        }

        // Create a simple selection modal
        class EntitySelectionModal extends FuzzySuggestModal<NamedEntity> {
            constructor(
                app: App,
                private entities: NamedEntity[],
                private onChoose: (entity: NamedEntity) => void
            ) {
                super(app);
            }

            getItems(): NamedEntity[] {
                return this.entities;
            }

            getItemText(entity: NamedEntity): string {
                return entity.name || entity.id || 'Unnamed';
            }

            onChooseItem(entity: NamedEntity, evt: MouseEvent | KeyboardEvent): void {
                void evt;
                this.onChoose(entity);
            }
        }

        new EntitySelectionModal(this.app, entities, (selectedEntity) => { void (async () => {
            if (!selectedEntity) return;

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode(entityType, (coordinates) => { void (async () => {
                try {
                    // Find or create location at coordinates
                    let targetLocation: Location | null = null;
                    let isNewLocation = false;

                    // Detect if this is a real-world map
                    const isRealWorldMap = this.currentMap && (
                        this.currentMap.type === 'real' ||
                        this.currentMap.osmLayer === true ||
                        this.currentMap.tileServer?.includes('openstreetmap') ||
                        this.currentMap.tileServer?.includes('tile')
                    );

                    // Use proximity-based matching for all maps
                    const nearbyLocations = await locationService.findLocationsAtCoordinates(
                        mapId,
                        coordinates,
                        this.getCoordinateTolerance()
                    );

                    if (nearbyLocations.length > 0) {
                        if (isRealWorldMap) {
                            // Real-world maps: automatically use closest location (no modal)
                            targetLocation = nearbyLocations[0];
                            isNewLocation = false;

                            // Only add binding if this location doesn't already have one for this map
                            // This prevents updating coordinates and moving existing pins
                            const hasBinding = targetLocation.mapBindings?.some((b: MapBinding) => b.mapId === mapId);
                            if (!hasBinding) {
                                await this.ensureLocationMapBinding(locationService,
                                    targetLocation.id || targetLocation.name,
                                    mapId,
                                    coordinates
                                );
                            }
                        } else {
                            // Image maps: show selection modal to let user choose
                            const result = await new Promise<Location | 'create-new' | null>((resolve) => {
                                let selected = false;
                                const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                    selected = true;
                                    resolve(res);
                                });
                                const originalClose = modal.onClose.bind(modal) as () => void;
                                modal.onClose = () => {
                                    originalClose();
                                    if (!selected) resolve(null);
                                };
                                modal.open();
                            });

                            if (!result) return; // User cancelled

                            if (result === 'create-new') {
                                // User chose to create new location
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedEntity.name} Location`,
                                    description: `Auto-created location for ${entityTypeName.toLowerCase()} "${selectedEntity.name}" at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation);
                                isNewLocation = true;
                            } else {
                                // User selected existing location
                                targetLocation = result;
                                isNewLocation = false;
                                // Add map binding for existing location
                                await this.ensureLocationMapBinding(locationService,
                                    result.id || result.name,
                                    mapId,
                                    coordinates
                                );
                            }
                        }
                    } else {
                        // No nearby location - create new one
                        const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                        const locationId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                        // For real-world maps, try to get location name from reverse geocoding
                        let locationName = `${selectedEntity.name} Location`;
                        let locationDescription = `Auto-created location for ${entityTypeName.toLowerCase()} "${selectedEntity.name}" at coordinates [${coordText}]`;

                        if (isRealWorldMap) {
                            try {
                                const geoName = await locationService.reverseGeocode(coordinates[0], coordinates[1]);
                                if (geoName) {
                                    locationName = geoName;
                                    locationDescription = `${geoName} - Auto-created for ${entityTypeName.toLowerCase()} "${selectedEntity.name}"`;
                                }
                            } catch {
                            	// intentional
                                
                            }
                        }

                        targetLocation = {
                            id: locationId,
                            name: locationName,
                            description: locationDescription,
                            type: 'custom',
                            mapBindings: [{
                                mapId: mapId,
                                coordinates: coordinates
                            }]
                        };

                        await this.plugin.saveLocation(targetLocation);
                        isNewLocation = true;
                    }

                    // Add entity to location
                    const entityId = selectedEntity.id || selectedEntity.name;
                    const locationId = targetLocation.id || targetLocation.name;

                    // Add entity to location's entityRefs
                    await locationService.addEntityToLocation(locationId, {
                        entityId: entityId,
                        entityType: entityType,
                        relationship: 'located here'
                    });

                    // CRITICAL FIX: Also update the entity's frontmatter with map coordinates
                    // This allows EntityMarkerDiscovery to find and render the entity directly on the map
                    await this.updateEntityMapBinding(selectedEntity, entityType, mapId, coordinates);
                    this.gridController?.refreshEntities();

                    if (isNewLocation) {
                        new Notice(`${entityTypeName} "${selectedEntity.name}" added to new location on map`);
                    } else {
                        new Notice(`${entityTypeName} "${selectedEntity.name}" added to ${targetLocation.name}`);
                    }

                    // Refresh entities on the map
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch {
                    
                    new Notice(`Error adding ${entityTypeName.toLowerCase()} to map`);
                }
            })(); });

            new Notice(`Click map to place ${selectedEntity.name}`);
        })(); }).open();
    }

    /**
     * Update entity's frontmatter with map binding information
     * This ensures EntityMarkerDiscovery can find and render the entity directly on the map
     */
    private async updateEntityMapBinding(
        entity: NamedEntity,
        entityType: 'character' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem' | 'group' | 'scene' | 'reference',
        mapId: string,
        coordinates: [number, number]
    ): Promise<void> {
        await restoreMapMembership(this.plugin, mapId, entityType, entity.id || entity.name);
        // Get the entity's file path
        const groupFile = entityType === 'group' ? this.app.vault.getMarkdownFiles().find(file => {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            return fm?.['storyteller-type'] === 'group' && fm?.['storyteller-id'] === entity.id;
        }) : undefined;
        const filePath = entity.filePath || groupFile?.path;
        if (!filePath) {
            
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            
            return;
        }

        try {
            // Update the entity's frontmatter with map coordinates
            await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                // Coordinates belong to one map, never reuse them through relatedMapIds.
                frontmatter['mapId'] = mapId;

                // Set map coordinates
                frontmatter['mapCoordinates'] = coordinates;

                // Generate a marker ID if not present
                if (!frontmatter['markerId']) {
                    frontmatter['markerId'] = `${entityType}-${entity.id || entity.name}-${Date.now()}`;
                }
            });

            
        } catch {
        	// intentional
            
        }
    }

    /**
     * Build footer with map information
     */
    private buildFooter(): void {
        if (!this.footerEl) return;
        this.footerEl.empty();

        this.footerStatusEl = this.footerEl.createDiv('storyteller-map-footer-status');
        this.updateFooterStatus();
    }

    /**
     * Update footer status text
     */
    private updateFooterStatus(): void {
        if (!this.footerStatusEl) return;

        if (!this.currentMap) {
            this.footerStatusEl.setText('No map selected');
            return;
        }

        const parts: string[] = [];

        // Map type
        const isRealWorldMap = this.currentMap.type === 'real' ||
            this.currentMap.osmLayer === true ||
            this.currentMap.tileServer?.includes('openstreetmap') ||
            this.currentMap.tileServer?.includes('tile');
        
        const type = isRealWorldMap ? 'Real-world' : 'Image-based';
        parts.push(type);

        // For real-world maps, show zoom level and effective location level
        if (isRealWorldMap) {
            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
            parts.push(`Zoom: ${Math.round(currentZoom)}`);
            
            if (this.locationLevelMode === 'auto') {
                const effectiveLevel = this.getEffectiveLevelForZoom(currentZoom);
                const levelLabel = this.getLevelDisplayLabel(effectiveLevel, false);
                parts.push(`Level: ${levelLabel}`);
            } else {
                const levelLabel = this.getLevelDisplayLabel(this.locationLevelMode, false);
                parts.push(`Level: ${levelLabel}`);
            }
        }

        // Scale
        if (this.currentMap.scale) {
            const scaleText = this.currentMap.scale.charAt(0).toUpperCase() + this.currentMap.scale.slice(1);
            parts.push(scaleText);
        }

        // Marker count
        const markerCount = this.currentMap.markers?.length || 0;
        parts.push(`${markerCount} marker${markerCount !== 1 ? 's' : ''}`);

        this.footerStatusEl.setText(parts.join(' • '));
    }

    /**
     * Get coordinate tolerance for proximity matching based on map type
     * Calculates tolerance dynamically based on current zoom level to ensure
     * a consistent screen-pixel click area (approx 400px radius)
     * @returns Distance tolerance in map units (pixels for image maps, degrees for real-world maps)
     */
    private getCoordinateTolerance(): number {
        const map = this.leafletRenderer?.getMap();
        
        // Fallback if map not ready
        if (!this.currentMap || !map) {
            return this.currentMap?.type === 'real' ? 0.001 : 400;
        }

        // Target tolerance in screen pixels (radius)
        // Increased to 400px to ensure easy selection even on large/tiled maps
        const screenPixels = 400;

        try {
            // Calculate how many map units correspond to 'screenPixels' at current zoom
            const center = map.getCenter();
            const centerPoint = map.latLngToContainerPoint(center);
            
            // Point 'screenPixels' away to the right
            const offsetPoint = L.point(centerPoint.x + screenPixels, centerPoint.y);
            const offsetLatLng = map.containerPointToLatLng(offsetPoint);
            
            if (this.currentMap.type === 'real') {
                // For real-world maps, calculate distance in degrees
                const dLat = offsetLatLng.lat - center.lat;
                const dLng = offsetLatLng.lng - center.lng;
                return Math.sqrt(dLat*dLat + dLng*dLng);
            } else {
                // For image maps (CRS.Simple), calculate distance in map pixels
                // Note: In CRS.Simple, lat is y, lng is x
                const dx = offsetLatLng.lng - center.lng;
                const dy = offsetLatLng.lat - center.lat;
                return Math.sqrt(dx*dx + dy*dy);
            }
        } catch {
            
            return this.currentMap.type === 'real' ? 0.001 : 400;
        }
    }

    /**
     * Load a specific map by ID or name
     */
    async loadMap(mapIdOrName: string): Promise<void> {
        // Last request wins. Every await below can be overtaken by a newer switch (dropdown, breadcrumb,
        // back button), so each one re-checks the token before touching the view.
        const token = this.mapLoadToken.begin();
        if (this.gridController && !await this.gridController.canLeave()) return;
        if (!this.mapLoadToken.isCurrent(token)) return;
        try {
            // Try to find map by ID first, then by name
            const maps = await this.plugin.listMaps();
            if (!this.mapLoadToken.isCurrent(token)) return;
            const map = maps.find(m => m.id === mapIdOrName || m.name === mapIdOrName);

            if (!map) {
                new Notice(`Map not found: ${mapIdOrName}`);
                return;
            }

            // The open drawing is saved before the map changes, so it lands in its own note.
            await this.destroyInkEditor();
            if (!this.mapLoadToken.isCurrent(token)) return;
            this.currentMap = map;

            // Update dropdown
            if (this.mapDropdown) {
                const mapId = map.id || map.name;
                this.mapDropdown.setValue(mapId);
            }

            // Render the map
            await this.renderMap();
            if (!this.mapLoadToken.isCurrent(token)) return;

            // Update toolbar, footer, breadcrumb, and entity bar
            await this.buildToolbar();
            if (!this.mapLoadToken.isCurrent(token)) return;
            this.updateFooterStatus();
            await this.buildBreadcrumb();
            if (!this.mapLoadToken.isCurrent(token)) return;
            this.buildEntityBar();

        } catch {
            if (!this.mapLoadToken.isCurrent(token)) return;
            new Notice('Error loading map. See console for details.');
        }
    }

    /**
     * Render the Leaflet map
     */
    private async renderMap(): Promise<void> {
        if (!this.mapContainer || !this.currentMap) return;
        // Each render gets a token. A render that is overtaken by a newer one (map switch while waiting)
        // must not create a renderer that nothing will ever unload.
        const token = ++this.mapRenderToken;

        this.disablePlacementMode();
        this.gridController?.destroy();
        this.gridController = null;
        await this.destroyInkEditor();
        this.removeDocumentMapListeners();
        // Clean up existing renderer before creating new one
        if (this.leafletRenderer) {
            try {
                this.leafletRenderer.onunload();
            } catch {
            	// intentional
                
            }
            this.leafletRenderer = null;
        }

        this.mapContainer.empty();

        // CRITICAL FIX: Wait for container to have non-zero dimensions
        // Without this, Leaflet initializes with 0x0 size and tiles don't render
        await this.waitForContainerDimensions(this.mapContainer);
        if (token !== this.mapRenderToken) return;

        // CRITICAL FIX: Parent container must have position:relative for absolute children
        // Without this, tiles will scatter across the viewport
        this.mapContainer.setCssStyles({ position: 'relative' });
        this.mapContainer.setCssStyles({ overflow: 'hidden' });

        // Get actual dimensions from parent container
        const containerRect = this.mapContainer.getBoundingClientRect();
        const containerWidth = containerRect.width > 0 ? containerRect.width : 800;
        const containerHeight = containerRect.height > 0 ? containerRect.height : 500;

        // Create Leaflet container with EXPLICIT PIXEL dimensions
        // Using percentages with absolute positioning can cause 0x0 dimensions
        const leafletContainer = this.mapContainer.createDiv('leaflet-map-container');
        
        // CRITICAL: Set explicit PIXEL dimensions - not percentages!
        // Leaflet needs real pixel values to calculate which tiles to load
        leafletContainer.setCssStyles({ position: 'absolute' });
        leafletContainer.setCssStyles({ top: '0' });
        leafletContainer.setCssStyles({ left: '0' });
        leafletContainer.setCssStyles({ width: `${containerWidth}px` });
        leafletContainer.setCssStyles({ height: `${containerHeight}px` });
        leafletContainer.setCssStyles({ minHeight: '0' });
        leafletContainer.setCssStyles({ minWidth: '0' });

        // Use transparent background for image maps, grey for real-world maps
        const isImageMap = this.currentMap.type === 'image' || this.currentMap.image;
        leafletContainer.setCssStyles({
            backgroundColor: isImageMap ? 'transparent' : 'var(--background-secondary)'
        });

        // CRITICAL: Add inline style tag to override Obsidian's global img styles
        // This is essential because Obsidian themes apply max-width, object-fit, etc.
        // to all img elements which breaks Leaflet tile positioning
        // Leaflet override CSS is loaded from styles.css.

        // Use stable ID based on map ID only (no Date.now() - causes issues)
        const mapId = this.currentMap.id || this.currentMap.name;
        leafletContainer.id = `map-view-${mapId.replace(/[^a-zA-Z0-9]/g, '-')}`;

        // Convert map entity to block parameters
        const params = mapToBlockParams(this.currentMap);
        params.id = mapId; // Use map ID so MapEntityRenderer can find map bindings
        params.mapId = mapId; // Also set mapId parameter for entity rendering

        try {
            // Create mock context for renderer that supports Component lifecycle
            const mockContext = {
                sourcePath: this.currentMap.filePath || '',
                addChild: (component: { onload?: () => void }) => {
                    // Trigger onload() lifecycle method after container is in DOM
                    // This matches the code block processor pattern
                    window.requestAnimationFrame(() => {
                        if (component.onload) {
                            component.onload();
                        }
                    });
                },
                getSectionInfo: () => null
            } as unknown as import('obsidian').MarkdownPostProcessorContext;

            // Create renderer
            const renderer = new LeafletRenderer(
                this.plugin,
                leafletContainer,
                params,
                mockContext
            );
            this.leafletRenderer = renderer;

            // Register as child component to trigger lifecycle (like code block processor)
            mockContext.addChild(renderer);
            await renderer.initialize();
            if (token !== this.mapRenderToken) {
                // A newer render started while this one was initialising; release this renderer.
                if (this.leafletRenderer === renderer) this.leafletRenderer = null;
                renderer.onunload();
                return;
            }
            const imageBounds = this.leafletRenderer.getImageBounds();
            const initializedMap = this.leafletRenderer.getMap();
            if (imageBounds && initializedMap) {
                this.buildEntityBar();
                try {
                    this.gridController = new GridController(this.plugin, initializedMap, this.currentMap, imageBounds, this.entityBarEl!.querySelector<HTMLElement>('.entity-bar-quick-actions')!);
                    // Painting the grid disarms the drawing editor, so its clicks cannot reach the map tools.
                    this.gridController.onEditStart = () => this.closeInk();
                }
                catch (error) { new Notice(`Grid unavailable: ${error instanceof Error ? error.message : String(error)}`); }
                initializedMap.on('storyteller:area-saved', () => { void this.leafletRenderer?.refreshEntities(); });
            }

            // Map Ink: the drawing editor works on the renderer's own layer and legend.
            const inkLayer = this.leafletRenderer.getInkLayer();
            if (inkLayer && initializedMap) {
                this.inkEditor = this.createInkEditor(initializedMap, inkLayer, this.leafletRenderer.getInkLegend());
            }

            // CRITICAL: Prevent Obsidian from intercepting events when using the map
            // 
            // Key insight from esm7 (Obsidian Map View author):
            // Leaflet 1.8+ listens for events at a higher level (activeDocument), so calling
            // stopPropagation on the map element blocks Leaflet itself from receiving events.
            // 
            // Solution: Add event listener at DOCUMENT level, check if event is on map,
            // then stopPropagation. This lets Leaflet handle the event first, then
            // prevents Obsidian from also handling it.
            // 
            // Reference: https://github.com/Leaflet/Leaflet/discussions/8972

            // Leaflet alone owns wheel zoom; do not race it with delayed setView.
            this.removeDocumentMapListeners();
            const wheelHandler = (ev: WheelEvent) => {
                if (leafletContainer.contains(ev.target as Node)) {
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            };
            activeDocument.addEventListener('wheel', wheelHandler, { passive: false });

            // Touch events for mobile panning
            const touchMoveHandler = (ev: TouchEvent) => {
                const targetNode = ev.target as Node;
                const isEventOnMap = ev.target === leafletContainer || leafletContainer.contains(targetNode);
                if (isEventOnMap) {
                    ev.stopPropagation();
                }
            };
            activeDocument.addEventListener('touchmove', touchMoveHandler);

            // Store handlers for cleanup
            this._wheelHandler = wheelHandler;
            this._touchMoveHandler = touchMoveHandler;

            // Make container focusable for keyboard navigation
            leafletContainer.tabIndex = 0;

            // Add zoom/pan event handlers after a short delay
            window.setTimeout(() => {
                // Bind to this render's renderer only. A map switched away from within 100ms must not
                // feed its view into the newly selected map's saved state.
                if (this.leafletRenderer !== renderer) return;
                const map = renderer.getMap();
                if (map) {
                    map.on('zoomend', () => {
                        this.saveMapViewState(map);
                        this.updateLocationLevelDropdownLabel();
                    });

                    map.on('moveend', () => {
                        this.saveMapViewState(map);
                    });

                    this.updateLocationLevelDropdownLabel();
                }
            }, 100);

            // CRITICAL FIX: Force invalidateSize after layout completes WITH tile layer updates
            // Multiple delays handle different layout completion scenarios
            // IMPORTANT: Must also update tile layers, not just invalidateSize, or tiles disappear
            const forceMapUpdate = () => {
                if (this.leafletRenderer !== renderer) return;
                const map = renderer.getMap();
                if (map) {
                    map.invalidateSize({ animate: false });

                    // Force tile layers to update after invalidateSize
                    const tileLayers: LeafletTileLayerInternal[] = [];
                    map.eachLayer((layer: L.Layer) => {
                        const tl = layer as unknown as LeafletTileLayerInternal;
                        if (tl._url || tl.getTileUrl) {
                            tileLayers.push(tl);
                        }
                    });

                    tileLayers.forEach(tileLayer => {
                        if (tileLayer.redraw) {
                            tileLayer.redraw();
                        }
                        if (tileLayer._update) {
                            tileLayer._update();
                        }
                    });
                }
            };

            window.setTimeout(forceMapUpdate, 150);
            window.setTimeout(forceMapUpdate, 300);
            window.setTimeout(forceMapUpdate, 500);

        } catch {
            if (token !== this.mapRenderToken) return;
            leafletContainer.empty();
            leafletContainer.createEl('div', {
                text: 'Error rendering map. Check console for details.',
                cls: 'storyteller-map-error'
            });
        }
    }

    /**
     * Save the map as it is currently framed to StorytellerSuite/Exports.
     * Only image maps have a single base image to draw; tile maps get a notice.
     */
    private async exportMapAsImage(): Promise<void> {
        if (!this.currentMap || !this.leafletRenderer) {
            new Notice('Open a map before exporting');
            return;
        }
        try {
            const blob = await this.leafletRenderer.renderViewAsPng();
            if (!blob) {
                new Notice('Map export is only supported for image maps');
                return;
            }
            const folder = 'StorytellerSuite/Exports';
            await this.plugin.ensureFolder(folder);
            const path = uniqueExportPath(
                folder,
                buildMapExportFileName(this.currentMap.name, new Date()),
                candidate => this.app.vault.getAbstractFileByPath(candidate) !== null
            );
            await this.app.vault.createBinary(path, await blob.arrayBuffer());
            new Notice(`Map exported to ${path}`);
        } catch (error) {
            new Notice(`Map export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Show more options menu
     */
    private showMoreMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item
                .setTitle('Edit map')
                .setIcon('edit')
                .onClick(() => {
                    if (this.currentMap) {
                        this.showEditMapModal();
                    }
                });
        });

        menu.addItem((item) => {
            item
                .setTitle('Export as image')
                .setIcon('image')
                .onClick(() => { void this.exportMapAsImage(); });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item
                .setTitle('Open map note')
                .setIcon('file-text')
                .onClick(async () => {
                    if (this.currentMap?.filePath) {
                        const file = this.app.vault.getAbstractFileByPath(this.currentMap.filePath);
                        if (file instanceof TFile) {
                            await this.app.workspace.getLeaf('tab').openFile(file);
                        }
                    }
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Refresh the current map
     */
    private membershipRefreshBusy = false;
    private membershipRefreshPending = false;
    private async refreshMapMembership(): Promise<void> {
        if (this.membershipRefreshBusy) { this.membershipRefreshPending = true; return; }
        if (!this.currentMap || !this.leafletRenderer) return;
        this.membershipRefreshBusy = true;
        try {
            const current = (await this.plugin.listMaps()).find(m => (m.id || m.name) === (this.currentMap!.id || this.currentMap!.name));
            if (current) {
                const previous = this.currentMap;
                this.currentMap = this.inkWritesPending > 0 && previous
                    ? { ...current, mapInk: previous.mapInk }
                    : current;
                // A drawing edited in the note itself replaces the open one, but only when nothing of ours is unsaved.
                const changedInNote = JSON.stringify(previous?.mapInk ?? null) !== JSON.stringify(current.mapInk ?? null);
                if (changedInNote && this.inkWritesPending === 0) this.inkEditor?.setDoc(inkDocOf(current));
            }
            await this.gridController?.refreshFromVault(current);
            await this.leafletRenderer.refreshEntities();
        } finally {
            this.membershipRefreshBusy = false;
            if (this.membershipRefreshPending) { this.membershipRefreshPending = false; void this.refreshMapMembership(); }
        }
    }

    async refresh(): Promise<void> {
        if (this.currentMap) {
            const mapId = this.currentMap.id || this.currentMap.name;
            await this.loadMap(mapId);
        }
    }

    /**
     * Wait for container to have non-zero dimensions
     * Critical for Leaflet initialization - it needs real pixel dimensions
     */
    private async waitForContainerDimensions(container: HTMLElement, maxAttempts = 50): Promise<void> {
        let attempts = 0;

        while (attempts < maxAttempts) {
            const rect = container.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
                
                return;
            }

            // Wait a bit and try again
            await new Promise(resolve => window.setTimeout(resolve, 20));
            attempts++;
        }

        
    }

    /**
     * Setup resize observer for responsive layout
     * Uses debouncing to prevent rapid invalidateSize calls
     * Also listens to Obsidian workspace resize events as fallback
     */
    private setupResizeObserver(): void {
        if (!this.mapContainer) return;
        this.resizeObserver?.disconnect();

        let resizeTimeout: number | null = null;

        const handleResize = () => {
            // Update leaflet container dimensions to match parent
            const leafletContainer = this.mapContainer?.querySelector('.leaflet-map-container') as HTMLElement;
            if (leafletContainer && this.mapContainer) {
                const rect = this.mapContainer.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    leafletContainer.setCssStyles({ width: `${rect.width}px` });
                    leafletContainer.setCssStyles({ height: `${rect.height}px` });
                }
            }

            const map = this.leafletRenderer?.getMap();
            if (map) {
                
                // Use requestAnimationFrame to ensure DOM has updated
                window.requestAnimationFrame(() => {
                    if (map) {
                        map.invalidateSize({ animate: false });

                        // CRITICAL FIX: After resize invalidateSize, force tile layers to update
                        // Without this, tiles can disappear after initial load or sidebar toggle
                        const tileLayers: LeafletTileLayerInternal[] = [];
                        map.eachLayer((layer: L.Layer) => {
                            const tl = layer as unknown as LeafletTileLayerInternal;
                            if (tl._url || tl.getTileUrl) {
                                tileLayers.push(tl);
                            }
                        });

                        tileLayers.forEach(tileLayer => {
                            // No redraw(): removing every tile on each resize made the map
                            // flicker when a sidebar opened. _update adds what the new size needs.
                            if (tileLayer._update) {
                                tileLayer._update();
                            }
                            if (tileLayer._resetView) {
                                tileLayer._resetView();
                            }

                            // Force visibility on tile container
                            const container = tileLayer.getContainer?.();
                            if (container) {
                                container.setCssStyles({ opacity: '1' });
                                container.setCssStyles({ visibility: 'visible' });
                                container.setCssStyles({ display: 'block' });
                            }
                        });

                        // Force tile pane visibility
                        const tilePane = map.getPane('tilePane');
                        if (tilePane) {
                            tilePane.setCssStyles({ opacity: '1' });
                            tilePane.setCssStyles({ visibility: 'visible' });
                            tilePane.setCssStyles({ display: 'block' });
                        }

                        // Fire events to trigger Leaflet's internal tile loading
                        map.fire('moveend');
                        map.fire('zoomend');

                        
                    }
                });
            }
        };

        this.resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize events to prevent excessive invalidateSize calls
            if (resizeTimeout) {
                window.clearTimeout(resizeTimeout);
            }

            resizeTimeout = window.setTimeout(() => {
                handleResize();
            }, 150); // 150ms debounce
        });

        this.resizeObserver.observe(this.mapContainer);

        // CRITICAL FIX: Also listen to Obsidian workspace resize events
        // This catches sidebar open/close events that ResizeObserver might miss
        if (!this.hasRegisteredWorkspaceResizeListener) {
            this.registerEvent(this.app.workspace.on('resize', () => {
                // Delay slightly to let Obsidian finish its layout update
                window.setTimeout(() => {
                    if (resizeTimeout) {
                        window.clearTimeout(resizeTimeout);
                    }
                    resizeTimeout = window.setTimeout(() => {
                        handleResize();
                    }, 150);
                }, 100);
            }));
            this.hasRegisteredWorkspaceResizeListener = true;
        }
    }

    /** Remove the document-level wheel and touchmove handlers installed by the last render. */
    private removeDocumentMapListeners(): void {
        if (this._wheelHandler) {
            activeDocument.removeEventListener('wheel', this._wheelHandler);
            this._wheelHandler = null;
        }
        if (this._touchMoveHandler) {
            activeDocument.removeEventListener('touchmove', this._touchMoveHandler);
            this._touchMoveHandler = null;
        }
    }

    async onClose(): Promise<void> {
        this.gridController?.destroy();
        this.gridController = null;
        // Clean up placement mode and the drawing editor (its drawing stays in the note)
        this.disablePlacementMode();
        await this.destroyInkEditor();

        // Clean up debounce timer for view state persistence
        // Save any pending view state now (the debounce timer would otherwise be lost with the view)
        this.flushPendingViewState();

        // Clean up activeDocument-level event handlers
        this.removeDocumentMapListeners();

        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up Leaflet renderer
        if (this.leafletRenderer) {
            this.leafletRenderer.unload();
            this.leafletRenderer = null;
        }
    }

    /**
     * Save current map view state (zoom and center position)
     * Called automatically when user zooms or pans the map
     * 
     * NOTE: We only update instance variables, NOT Obsidian's view state.
     * Calling setViewState() triggers setState() which calls loadMap(),
     * creating an infinite re-initialization loop.
     * 
     * Also persists to plugin settings so position is remembered across sessions.
     */
    private saveMapViewState(liveMap?: L.Map): void {
        const map = liveMap ?? this.leafletRenderer?.getMap();
        if (!map) return;

        const zoom = map.getZoom();
        const center = map.getCenter();

        // Update instance variables only - don't call setViewState()
        this.currentZoom = zoom;
        
        // Store in a private variable for later use in getState()
        this._savedCenter = { lat: center.lat, lng: center.lng };

        // Persist to plugin settings (debounced via the plugin method)
        const mapId = this.currentMap?.id || this.currentMap?.name;
        if (mapId) {
            // Use debouncing to avoid excessive writes during rapid pan/zoom
            this.debouncedPersistViewState(mapId, zoom, this._savedCenter);
        }
    }

    /** Debounce timer for persisting view state */
    private _persistViewStateTimeout: number | null = null;

    /**
     * Debounced persistence of view state to avoid excessive writes
     */
    private debouncedPersistViewState(mapId: string, zoom: number, center: { lat: number; lng: number }): void {
        // A pending save for a different map must not be dropped by this one; write it now.
        if (this.pendingViewSave && this.pendingViewSave.mapId !== mapId) {
            this.flushPendingViewState();
        }
        if (this._persistViewStateTimeout) {
            window.clearTimeout(this._persistViewStateTimeout);
        }
        this.pendingViewSave = { mapId, zoom, center };
        this._persistViewStateTimeout = window.setTimeout(() => {
            this.flushPendingViewState();
        }, 500); // 500ms debounce
    }

    private pendingViewSave: { mapId: string; zoom: number; center: { lat: number; lng: number } } | null = null;

    /** Write the pending view state now, if any, and cancel its timer. */
    private flushPendingViewState(): void {
        if (this._persistViewStateTimeout) {
            window.clearTimeout(this._persistViewStateTimeout);
            this._persistViewStateTimeout = null;
        }
        const pending = this.pendingViewSave;
        this.pendingViewSave = null;
        if (pending) void this.plugin.saveMapViewState(pending.mapId, pending.zoom, pending.center);
    }

    /**
     * Get state for persistence
     */
    getState(): MapViewState {
        return {
            mapId: this.currentMap?.id || this.currentMap?.name,
            zoom: this.currentZoom,
            center: this._savedCenter || this.leafletRenderer?.getMap()?.getCenter()
        };
    }

    /**
     * Set state from persistence
     */
    async setState(state: unknown, result: import('obsidian').ViewStateResult): Promise<void> {
        void result;
        const s = state as MapViewState;
        // Guard: Don't reload if we already have this map loaded
        const currentMapId = this.currentMap?.id || this.currentMap?.name;
        if (s.mapId && s.mapId !== currentMapId) {
            await this.loadMap(s.mapId);
        }

        // Restore zoom and position after map loads (or if same map)
        if (s.zoom !== undefined) {
            const restoredRenderer = this.leafletRenderer;
            window.setTimeout(() => {
                if (!restoredRenderer || this.leafletRenderer !== restoredRenderer) return;
                const map = restoredRenderer.getMap();
                if (map) {
                    const center = s.center;
                    map.setView(
                        center ? center : map.getCenter(),
                        s.zoom ?? 0,
                        { animate: false }  // Instant restore
                    );
                    this.currentZoom = s.zoom ?? 0;
                    this._savedCenter = (s.center && 'lat' in s.center) ? { lat: s.center.lat, lng: s.center.lng } : null;
                }
            }, 200);  // Small delay to ensure map is fully initialized
        }
    }
}
