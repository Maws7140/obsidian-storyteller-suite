// Network Graph Renderer using Cytoscape.js
// Visualizes relationships between story entities

import cytoscape, { Core, NodeSingular, EdgeSingular, LayoutOptions } from 'cytoscape';
import StorytellerSuitePlugin from '../main';
import { GraphFilters, GraphNode, GraphEdge, Character, Location, Event, PlotItem, Culture, Economy, MagicSystem, Group, RelationshipType } from '../types';

type NodeEntityData = Character | Location | Event | PlotItem | Culture | Economy | MagicSystem;
import { 
    extractAllRelationships, 
    buildBidirectionalEdges,
    filterRedundantReciprocalEdges,
    withImpliedInverseEdges,
    buildCytoscapeElements,
    getRelationshipColor,
    GROUP_MEMBERSHIP_LABEL
} from '../utils/GraphUtils';
import { RELATIONSHIP_KINDS } from '../utils/RelationshipKinds';
import { EventRef, TFile, setIcon } from 'obsidian';
import { CalendarRegistry, onTimelineThemeChange } from '../calendar/CalendarRegistry';
import {
    TIMELINE_THEME_VARIABLES,
    resolveTimelineStyle,
    splitColorAlpha,
    themeCssVariables,
} from '../utils/TimelineStyle';
import type { ResolvedTimelineStyle, TimelineColorRole } from '../utils/TimelineStyle';
import {
    GRAPH_DECEASED_COLOR,
    GRAPH_TYPE_STYLES,
    buildGraphLegend,
    graphColorKey,
    sanitizeGraphDisplay,
    spacingFor,
} from '../utils/GraphAppearance';
import type { GraphColorContext, GraphDisplayOptions, GraphEntityFields, GraphLayoutName, GraphLegendEntry } from '../utils/GraphAppearance';
import type { CytoscapeElement } from '../utils/GraphUtils';

/** Display options whose change means the elements themselves must be rebuilt. */
const DATA_OPTIONS: Array<keyof GraphDisplayOptions> = ['showImages', 'showEnded', 'showImplied', 'showMembership', 'showIsolated'];

export class NetworkGraphRenderer {
    private containerEl: HTMLElement;
    private plugin: StorytellerSuitePlugin;
    private cy: Core | null = null;
    private canvasEl: HTMLElement | null = null;
    private currentFilters: GraphFilters = {
        entityTypes: ['character', 'location', 'event', 'item', 'culture', 'economy', 'magicsystem', 'group']
    };
    private infoPanelEl: HTMLElement | null = null; // Fixed info panel instead of tooltip
    private pinnedNodes: Set<string> = new Set();
    private display: GraphDisplayOptions;
    private style: ResolvedTimelineStyle = resolveTimelineStyle(() => '', { id: 'none', name: 'none' });
    private palette: string[] = [];
    private appliedThemeVariables = '';
    private backdropEl: HTMLElement | null = null;
    private colorProbe: CanvasRenderingContext2D | null = null;
    private lookups: Omit<GraphColorContext, 'palette'> = {
        group: () => undefined,
        locationName: value => value,
        cultureName: value => value,
    };
    /** Legend entries the user clicked to hide. Hidden with a class, so nothing is rebuilt. */
    private hiddenLegendKeys: Set<string> = new Set();
    private legendBodyEl: HTMLElement | null = null;
    private unsubscribeTheme: (() => void) | null = null;
    private cssChangeRef: EventRef | null = null;
    private infoPanelTimeout: number | null = null; // Delay before updating info panel
    private saveViewportTimeout: number | null = null; // Debounce for saving viewport state
    private legendVisible = false; // Toggle for showing/hiding legend
    private legendPanelEl: HTMLElement | null = null; // Reference to legend panel element
    private legendToggleButtonEl: HTMLElement | null = null; // Floating button to show legend
    private infoPanelExpanded = false; // Toggle for expanded/collapsed info panel
    private isModal: boolean; // Whether this renderer is in a modal context
    private allowWheelZoom: boolean;

    constructor(containerEl: HTMLElement, plugin: StorytellerSuitePlugin, isModal = false, allowWheelZoom = true) {
        this.containerEl = containerEl;
        this.plugin = plugin;
        this.isModal = isModal;
        this.allowWheelZoom = allowWheelZoom;
        this.display = sanitizeGraphDisplay(plugin.settings.networkGraphDisplay);
    }

    private setParsedHtml(container: HTMLElement, html: string): void {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script').forEach(script => script.remove());
        container.empty();
        for (const node of Array.from(parsed.body.childNodes)) {
            container.appendChild(activeDocument.importNode(node, true));
        }
    }

    // Convert vault image path to usable URL for display
    // Handles external URLs, data URIs, and vault paths
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
                    // Block: return empty string so image won't load
                    return '';
                }
            }
            return imagePath;
        }
        // Otherwise, treat it as a vault path
        return this.plugin.app.vault.adapter.getResourcePath(imagePath);
    }

    // Build graph data from all entities
    async buildGraphData(): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
        const characters = await this.plugin.listCharacters();
        const locations = await this.plugin.listLocations();
        const events = await this.plugin.listEvents();
        const items = await this.plugin.listPlotItems();
        const cultures = await this.plugin.listCultures();
        const economies = await this.plugin.listEconomies();
        const magicSystems = await this.plugin.listMagicSystems();
        const showGroups = !this.currentFilters.entityTypes || this.currentFilters.entityTypes.includes('group');
        const allGroups = this.plugin.getGroups();
        const groups: Group[] = showGroups ? allGroups : [];
        this.lookups = this.buildLookups(allGroups, locations, cultures);

        // Apply filters
        const filteredData = this.applyFiltersToEntities(
            characters,
            locations,
            events,
            items,
            cultures,
            economies,
            magicSystems
        );

        // Build nodes
        const nodes: GraphNode[] = [
            ...filteredData.characters.map(c => ({
                id: c.id || c.name,
                label: c.name,
                type: 'character' as const,
                data: c,
                imageUrl: c.profileImagePath ? this.getImageSrc(c.profileImagePath) : undefined
            })),
            ...filteredData.locations.map(l => ({
                id: l.id || l.name,
                label: l.name,
                type: 'location' as const,
                data: l,
                imageUrl: l.profileImagePath ? this.getImageSrc(l.profileImagePath) : undefined
            })),
            ...filteredData.events.map(e => ({
                id: e.id || e.name,
                label: e.name,
                type: 'event' as const,
                data: e,
                imageUrl: e.profileImagePath ? this.getImageSrc(e.profileImagePath) : undefined
            })),
            ...filteredData.items.map(i => ({
                id: i.id || i.name,
                label: i.name,
                type: 'item' as const,
                data: i,
                imageUrl: i.profileImagePath ? this.getImageSrc(i.profileImagePath) : undefined
            })),
            ...filteredData.cultures.map(c => ({
                id: c.id || c.name,
                label: c.name,
                type: 'culture' as const,
                data: c,
                imageUrl: c.profileImagePath ? this.getImageSrc(c.profileImagePath) : undefined
            })),
            ...filteredData.economies.map(e => ({
                id: e.id || e.name,
                label: e.name,
                type: 'economy' as const,
                data: e,
                imageUrl: e.profileImagePath ? this.getImageSrc(e.profileImagePath) : undefined
            })),
            ...filteredData.magicSystems.map(m => ({
                id: m.id || m.name,
                label: m.name,
                type: 'magicsystem' as const,
                data: m,
                imageUrl: m.profileImagePath ? this.getImageSrc(m.profileImagePath) : undefined
            })),
            ...groups.map(g => ({
                id: g.id || g.name,
                label: g.name,
                type: 'group' as const,
                data: g,
                imageUrl: g.profileImagePath ? this.getImageSrc(g.profileImagePath) : undefined
            }))
        ];

        // With images off every node shows its colour, so "Colour by" reads on portraits too
        if (!this.display.showImages) nodes.forEach(node => { node.imageUrl = undefined; });

        // Extract all relationships and build edges
        let edges = extractAllRelationships(
            filteredData.characters,
            filteredData.locations,
            filteredData.events,
            filteredData.items,
            filteredData.cultures,
            filteredData.economies,
            filteredData.magicSystems,
            groups
        );

        // Build bidirectional edges for certain relationship types
        edges = buildBidirectionalEdges(edges);

        // Build entity map for filtering redundant reciprocal edges
        const entityMap = new Map<string, GraphNode>();
        nodes.forEach(node => {
            entityMap.set(node.id, node);
        });

        // Filter out redundant reciprocal edges (e.g., "owns"/"owned by", "involved"/"involved")
        edges = filterRedundantReciprocalEdges(edges, entityMap);

        // Draw the inverse of stored parent/child relationships (dotted, marked implied)
        edges = withImpliedInverseEdges(edges);

        // Final deduplication pass to ensure no duplicates
        const edgeMap = new Map<string, GraphEdge>();
        edges.forEach(edge => {
            const edgeKey = `${edge.source}|${edge.target}|${edge.relationshipType}|${edge.label || ''}|${edge.ended ? 'ended' : ''}|${edge.implied ? 'implied' : ''}`;
            if (!edgeMap.has(edgeKey)) {
                edgeMap.set(edgeKey, edge);
            }
        });
        edges = Array.from(edgeMap.values());

        return { nodes, edges };
    }

    /** Name and colour lookups for "Colour by", indexed by id and by name. */
    private buildLookups(groups: Group[], locations: Location[], cultures: Culture[]): Omit<GraphColorContext, 'palette'> {
        const index = <T extends { id?: string; name: string }>(values: T[]) => {
            const map = new Map<string, T>();
            values.forEach(value => {
                map.set(value.name, value);
                if (value.id) map.set(value.id, value);
            });
            return map;
        };
        const groupIndex = index(groups);
        const locationIndex = index(locations);
        const cultureIndex = index(cultures);
        return {
            group: value => groupIndex.get(value),
            locationName: value => locationIndex.get(value)?.name || value,
            cultureName: value => cultureIndex.get(value)?.name || value,
        };
    }

    /**
     * Cytoscape elements for the nodes and edges, with the display options
     * applied: hidden kinds of line dropped, unconnected entities dropped
     * when asked, and every node given the colour its "Colour by" key has.
     */
    private toElements(nodes: GraphNode[], edges: GraphEdge[]): CytoscapeElement[] {
        const d = this.display;
        const shownEdges = edges.filter(edge =>
            (d.showEnded || !edge.ended)
            && (d.showImplied || !edge.implied)
            && (d.showMembership || edge.label !== GROUP_MEMBERSHIP_LABEL));
        let elements = buildCytoscapeElements(nodes, shownEdges);
        if (!d.showIsolated) {
            elements = elements.filter(element => element.data.source !== undefined || ((element.data.degree as number) || 0) > 0);
        }
        elements.forEach(element => {
            if (element.data.source === undefined) Object.assign(element.data, this.nodeColor(element.data));
        });
        return elements;
    }

    private nodeColor(data: Record<string, unknown>): Record<string, unknown> {
        const key = graphColorKey({
            id: data.id as string,
            label: (data.label as string) || '',
            type: data.type as GraphNode['type'],
            degree: (data.degree as number) || 0,
            data: data.entityData || {},
        }, this.display.colorMode, { ...this.lookups, palette: this.palette });
        return { color: key.color, colorKey: key.key, colorLabel: key.label, colorOrder: key.order ?? 0 };
    }

    /** Re-colour the nodes on screen in place, without a new layout. */
    private recolorNodes(): void {
        if (!this.cy) return;
        this.cy.batch(() => {
            this.cy!.nodes().forEach(node => { node.data(this.nodeColor(node.data() as Record<string, unknown>)); });
        });
    }

    // Apply filters to entities
    private applyFiltersToEntities(
        characters: Character[],
        locations: Location[],
        events: Event[],
        items: PlotItem[],
        cultures: Culture[],
        economies: Economy[],
        magicSystems: MagicSystem[]
    ): { characters: Character[], locations: Location[], events: Event[], items: PlotItem[], cultures: Culture[], economies: Economy[], magicSystems: MagicSystem[] } {
        let filteredChars = characters;
        let filteredLocs = locations;
        let filteredEvts = events;
        let filteredItems = items;
        let filteredCultures = cultures;
        let filteredEconomies = economies;
        let filteredMagic = magicSystems;

        // Filter by entity types
        // If entityTypes is defined (even if empty array), apply filtering
        if (this.currentFilters.entityTypes !== undefined) {
            if (!this.currentFilters.entityTypes.includes('character')) filteredChars = [];
            if (!this.currentFilters.entityTypes.includes('location')) filteredLocs = [];
            if (!this.currentFilters.entityTypes.includes('event')) filteredEvts = [];
            if (!this.currentFilters.entityTypes.includes('item')) filteredItems = [];
            if (!this.currentFilters.entityTypes.includes('culture')) filteredCultures = [];
            if (!this.currentFilters.entityTypes.includes('economy')) filteredEconomies = [];
            if (!this.currentFilters.entityTypes.includes('magicsystem')) filteredMagic = [];
        }

        // Filter by groups
        if (this.currentFilters.groups && this.currentFilters.groups.length > 0) {
            filteredChars = filteredChars.filter(c => c.groups && c.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredLocs = filteredLocs.filter(l => l.groups && l.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredEvts = filteredEvts.filter(e => e.groups && e.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredItems = filteredItems.filter(i => i.groups && i.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredCultures = filteredCultures.filter(c => c.groups && c.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredEconomies = filteredEconomies.filter(e => e.groups && e.groups.some(g => this.currentFilters.groups?.includes(g)));
            filteredMagic = filteredMagic.filter(m => m.groups && m.groups.some(g => this.currentFilters.groups?.includes(g)));
        }

        // Filter by timeline (events only)
        if (this.currentFilters.timelineStart || this.currentFilters.timelineEnd) {
            filteredEvts = filteredEvts.filter(e => {
                if (!e.dateTime) return true; // Keep events without dates
                const eventDate = new Date(e.dateTime);
                if (this.currentFilters.timelineStart) {
                    const start = new Date(this.currentFilters.timelineStart);
                    if (eventDate < start) return false;
                }
                if (this.currentFilters.timelineEnd) {
                    const end = new Date(this.currentFilters.timelineEnd);
                    if (eventDate > end) return false;
                }
                return true;
            });
        }

        return {
            characters: filteredChars,
            locations: filteredLocs,
            events: filteredEvts,
            items: filteredItems,
            cultures: filteredCultures,
            economies: filteredEconomies,
            magicSystems: filteredMagic
        };
    }

    // Initialize Cytoscape instance with Obsidian-themed styling
    async initializeCytoscape(): Promise<void> {
        // Show loading state
        const loadingEl = this.containerEl.createDiv('storyteller-network-loading');
        loadingEl.textContent = 'Loading graph...';

        // Create canvas container
        this.canvasEl = this.containerEl.createDiv('storyteller-network-canvas');
        this.canvasEl.setCssStyles({ width: '100%' });
        // Responsive height: use viewport height for better space utilization
        const minHeight = window.innerWidth <= 768 ? '400px' : '500px';
        const maxHeight = 'calc(90vh - 250px)'; // Account for filters and controls
        this.canvasEl.setCssStyles({ height: maxHeight });
        this.canvasEl.setCssStyles({ minHeight: minHeight });
        this.canvasEl.setCssStyles({ borderRadius: '8px' });
        this.canvasEl.setCssStyles({ position: 'relative' });
        // Under Cytoscape's own layer, so the theme's background image sits behind the graph
        this.backdropEl = this.canvasEl.createDiv('storyteller-network-backdrop');

        // The story's timeline theme: colours, palette, font and background
        this.refreshStyle();

        // Build graph data
        const { nodes, edges } = await this.buildGraphData();

        // Remove loading state
        loadingEl.remove();

        // Degrees, R-Map flags, ids and colours are computed in one place for initial render and refresh
        const elements = this.toElements(nodes, edges);

        // Initialize cytoscape
        this.cy = cytoscape({
            container: this.canvasEl,
            elements: elements,
            style: this.getCytoscapeStyle() as unknown as cytoscape.StylesheetStyle[],
            layout: this.getLayoutOptions(this.display.layout),
            minZoom: 0.2,
            maxZoom: 4,
            userZoomingEnabled: this.allowWheelZoom
        });

        if (!this.allowWheelZoom) {
            this.cy.userZoomingEnabled(false);
        }

        // The instance always exists so that refresh() can draw nodes added later;
        // the empty-state message sits over it while there is nothing to draw.
        if (nodes.length === 0) {
            this.renderEmptyState();
        }

        // Apply initial zoom adjustment after layout completes
        this.cy.one('layoutstop', () => {
            if (!this.cy) return;

            // Try to restore saved viewport state first
            const restored = this.restoreViewportState();

            if (!restored) {
                // No saved state - apply default zoom adjustment
                // Get the current zoom level after fit
                const currentZoom = this.cy.zoom();

                // If zoom is too small (nodes appear tiny), zoom in a bit
                // Typically fit creates zoom levels between 0.3-0.8 for medium/large graphs
                if (currentZoom < 0.7) {
                    this.cy.zoom({
                        level: Math.min(currentZoom * 1.4, 1.0), // Zoom in by 40%, max 1.0
                        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 }
                    });
                }
                // Save the initial zoom as the user's preference
                this.saveViewportState();
            }
        });

        // Create fixed info panel
        this.createInfoPanel();
        
        // Create legend panel
        this.createLegendPanel();
        this.renderLegend();
        if (this.display.legendVisible) this.showLegend();

        // Add event listeners (after panels are created)
        this.setupEventListeners();

        // Restyle when the story's theme changes, or Obsidian switches light and dark
        this.unsubscribeTheme = onTimelineThemeChange(() => this.restyle());
        this.cssChangeRef = this.plugin.app.workspace.on('css-change', () => this.restyle());
    }

    /**
     * Resolve the colours the graph paints with, the timeline's way: the
     * active theme's values go onto the canvas as inline `--sts-timeline-*`
     * variables and are read back through the cascade, so a theme, a CSS
     * snippet and the Obsidian theme all reach the graph by the same path.
     */
    private refreshStyle(): void {
        const theme = new CalendarRegistry(this.plugin).getActiveTheme();
        const root = this.canvasEl;
        if (!root) {
            this.style = resolveTimelineStyle(() => '', theme);
        } else {
            const variables = themeCssVariables(theme);
            const signature = JSON.stringify(variables);
            if (signature !== this.appliedThemeVariables) {
                TIMELINE_THEME_VARIABLES.forEach(name => root.style.removeProperty(name));
                Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
                this.appliedThemeVariables = signature;
            }
            const computed = getComputedStyle(root);
            this.style = resolveTimelineStyle(name => computed.getPropertyValue(name).trim(), theme);
        }
        this.palette = this.style.palette.map(color => this.normalizeColor(color, '#7c3aed').hex);
        this.applyBackdrop();
    }

    /**
     * A colour Cytoscape can read. Theme values can be any CSS colour, or an
     * Obsidian variable that resolves to hsl() with calc() inside, and
     * Cytoscape only takes plain forms, so the browser normalises it first.
     */
    private normalizeColor(value: string, fallback: string): { hex: string; alpha: number } {
        const parse = (input: string) => {
            if (!input) return null;
            if (!this.colorProbe) this.colorProbe = activeDocument.createElement('canvas').getContext('2d');
            const probe = this.colorProbe;
            if (!probe) return splitColorAlpha(input);
            const sentinel = '#010203';
            probe.fillStyle = sentinel;
            probe.fillStyle = input;
            const out = String(probe.fillStyle);
            if (out === sentinel && input.trim().toLowerCase() !== sentinel) return null;
            return splitColorAlpha(out);
        };
        return parse(value) || parse(fallback) || { hex: '#808080', alpha: 1 };
    }

    private themeColor(role: TimelineColorRole): string {
        return this.normalizeColor(this.style.colors[role], this.fallbackColor(role)).hex;
    }

    private themeAlpha(role: TimelineColorRole): number {
        return this.normalizeColor(this.style.colors[role], this.fallbackColor(role)).alpha;
    }

    private fallbackColor(role: TimelineColorRole): string {
        return resolveTimelineStyle(() => '', { id: 'none', name: 'none' }).colors[role];
    }

    /** The theme's font, with the stray characters some Obsidian themes leave in the stack removed. */
    private themeFont(): string {
        const value = (this.style.font || '')
            .replace(/['"]?\?\?['"]?/g, '')
            .replace(/,\s*,/g, ',')
            .replace(/^,\s*/, '')
            .replace(/\s*,\s*$/, '')
            .trim();
        return value && value !== ',' ? value : 'sans-serif';
    }

    /** The theme's background image, drawn by CSS on a layer under the graph. */
    private applyBackdrop(): void {
        const backdrop = this.backdropEl;
        if (!backdrop) return;
        const background = this.style.background;
        const url = background ? this.backdropUrl(background.image) : '';
        if (!background || !url || background.opacity <= 0) {
            backdrop.setCssStyles({ display: 'none', backgroundImage: '' });
            return;
        }
        const size = background.fit === 'stretch' ? '100% 100%' : background.fit === 'tile' ? 'auto' : background.fit;
        backdrop.setCssStyles({
            display: 'block',
            backgroundImage: `url("${url.replace(/"/g, '%22')}")`,
            backgroundSize: size,
            backgroundRepeat: background.fit === 'tile' ? 'repeat' : 'no-repeat',
            backgroundPosition: background.position,
            opacity: String(background.opacity),
            filter: background.blur > 0 ? `blur(${background.blur}px)` : '',
        });
    }

    private backdropUrl(source: string): string {
        if (/^(data:|https:\/\/)/i.test(source)) return source;
        const link = source.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
        const file = this.plugin.app.vault.getAbstractFileByPath(link) || this.plugin.app.metadataCache.getFirstLinkpathDest(link, '');
        return file instanceof TFile ? this.plugin.app.vault.getResourcePath(file) : '';
    }

    /** New theme or Obsidian colours: re-resolve, re-colour and redraw, keeping the layout. */
    private restyle(): void {
        if (!this.cy || !this.canvasEl?.isConnected) return;
        this.refreshStyle();
        this.recolorNodes();
        this.cy.style(this.getCytoscapeStyle() as unknown as cytoscape.StylesheetStyle[]);
        this.renderLegend();
    }

    // Get layout configuration options based on selected layout type
    private getLayoutOptions(layoutName: GraphLayoutName): LayoutOptions {
        const spacing = spacingFor(this.display.spacing);
        const baseOptions = {
            animate: true,
            animationDuration: 500,
            fit: true,
            padding: 80 // Increased from 50 for better initial zoom
        };

        switch (layoutName) {
            case 'cose':
                return {
                    ...baseOptions,
                    name: 'cose',
                    nodeRepulsion: spacing.nodeRepulsion,
                    idealEdgeLength: spacing.idealEdgeLength,
                    edgeElasticity: 100,
                    nestingFactor: 5,
                    gravity: 30,
                    numIter: 1000,
                    initialTemp: 200,
                    coolingFactor: 0.95,
                    minTemp: 1.0,
                    componentSpacing: 150,
                    nodeOverlap: 20,
                    nodeDimensionsIncludeLabels: true
                };
            case 'circle':
                return {
                    ...baseOptions,
                    name: 'circle',
                    radius: undefined,
                    spacingFactor: spacing.spacingFactor
                };
            case 'grid':
                return {
                    ...baseOptions,
                    name: 'grid',
                    rows: undefined,
                    cols: undefined,
                    spacingFactor: spacing.spacingFactor
                };
            case 'concentric':
                return {
                    ...baseOptions,
                    name: 'concentric',
                    minNodeSpacing: spacing.minNodeSpacing,
                    concentric: (node: NodeSingular) => (node.data('degree') as number) || 0,
                    levelWidth: () => 2
                };
            default:
                return { ...baseOptions, name: 'cose' };
        }
    }

    /**
     * The Cytoscape stylesheet, from the resolved theme and the display
     * options. Rebuilt whenever either changes; Cytoscape reads no CSS
     * variables, so every colour here is already a plain value.
     */
    private getCytoscapeStyle() {
        const d = this.display;
        const text = this.themeColor('text');
        const surface = this.themeColor('surface');
        const surfaceOpacity = 0.85 * this.themeAlpha('surface');
        const grid = this.themeColor('grid');
        const accent = this.themeColor('accent');
        const accentText = this.themeColor('accentText');
        const hub = this.themeColor('milestone');
        const fontFamily = this.themeFont();
        const metrics = this.style.metrics;
        const edgeWidth = metrics.connectorWidth;
        const sizeFor = (node: NodeSingular) => {
            if (!d.sizeByConnections) return 50;
            const degree = (node.data('degree') as number) || 0;
            return Math.max(40, Math.min(120, 40 + degree * 8));
        };

        // Visual hierarchy by connections: only when "Size by connections" is on
        const hierarchy = d.sizeByConnections ? [
            // Hub nodes (degree > 10): major characters and places
            { selector: 'node[degree > 10]', style: { 'border-width': 5, 'border-color': hub, 'z-index': 200, 'font-size': '16px', 'font-weight': 'bold' } },
            // Highly connected (6-10)
            { selector: 'node[degree > 5][degree <= 10]', style: { 'border-width': 4, 'z-index': 150, 'font-size': '15px', 'font-weight': '600' } },
            // Moderately connected (3-5)
            { selector: 'node[degree > 2][degree <= 5]', style: { 'border-width': 3, 'z-index': 100 } },
            // Minor (1-2)
            { selector: 'node[degree > 0][degree <= 2]', style: { 'opacity': 0.8, 'border-width': 2, 'font-size': '13px' } },
            // Unconnected
            { selector: 'node[degree = 0]', style: { 'opacity': 0.5, 'border-style': 'dashed', 'border-width': 2, 'font-size': '12px' } },
        ] : [];

        return [
            {
                selector: 'node',
                style: {
                    'label': (node: NodeSingular) => {
                        const label = node.data('label') as string;
                        const name = label && label.length > 15 ? label.substring(0, 15) + '...' : label;
                        // R-Map minimum notation: age and gender under the name; the dead get a cross
                        const subtitle = node.data('subtitle') as string | undefined;
                        const deceased = node.data('deceased') === true;
                        return (deceased ? '✝ ' : '') + name + (subtitle ? `\n${subtitle}` : '');
                    },
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '14px', // Accessibility minimum
                    'font-family': fontFamily,
                    'color': text,
                    // Label plate in the theme's surface colour, so labels read on any background
                    'text-background-color': surface,
                    'text-background-opacity': surfaceOpacity,
                    'text-background-padding': '4px',
                    'text-background-shape': 'roundrectangle',
                    'text-outline-width': 0,
                    'background-color': accent,
                    'background-opacity': metrics.eventOpacity,
                    'border-width': 2,
                    'border-color': grid,
                    'width': sizeFor,
                    'height': sizeFor,
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'transition-property': 'opacity, border-width, border-color',
                    'transition-duration': '150ms',
                    'transition-timing-function': 'ease-out'
                }
            },
            // Shape always tells the entity type, so colouring by something else loses nothing
            ...(Object.entries(GRAPH_TYPE_STYLES)).map(([type, style]) => ({
                selector: `node[type="${type}"]`,
                style: { 'shape': style.shape }
            })),
            // The "Colour by" colour, worked out per node
            {
                selector: 'node[color]',
                style: { 'background-color': 'data(color)' }
            },
            // Nodes with images: the image fills the node and the rim carries the colour
            {
                selector: 'node[imageUrl]',
                style: {
                    'background-image': 'data(imageUrl)',
                    'background-fit': 'cover',
                    'background-clip': 'node',
                    'background-color': '#ffffff',
                    'background-opacity': 1,
                    'border-width': 4,
                    'border-color': 'data(color)'
                }
            },
            // Dead characters stay on the map, faded and dashed, with their links as history.
            // Grey by type; under another colour mode they keep that colour so it still reads.
            {
                selector: 'node[?deceased]',
                style: {
                    'opacity': 0.5,
                    'border-style': 'dashed',
                    ...(d.colorMode === 'type' ? { 'background-color': GRAPH_DECEASED_COLOR } : {})
                }
            },
            ...hierarchy,
            {
                selector: 'edge',
                style: {
                    'width': edgeWidth,
                    'line-color': grid,
                    'target-arrow-color': grid,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.2,
                    'label': d.showEdgeLabels ? 'data(label)' : '',
                    'font-size': '11px',
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10,
                    'color': text,
                    'text-background-color': surface,
                    'text-background-opacity': surfaceOpacity,
                    'text-background-padding': '3px',
                    'text-background-shape': 'roundrectangle',
                    'text-outline-width': 0,
                    'font-family': fontFamily,
                    'transition-property': 'opacity, width',
                    'transition-duration': '150ms',
                    'transition-timing-function': 'ease-out'
                }
            },
            // Mutual relationships are one plain line; one-way ones keep the arrow
            {
                selector: 'edge[direction = "mutual"]',
                style: { 'target-arrow-shape': 'none' }
            },
            // Ended (severed) relationships: dashed and faded, label kept
            {
                selector: 'edge[?ended]',
                style: { 'line-style': 'dashed', 'opacity': 0.6 }
            },
            // Implied inverses (e.g. child implied by a stored parent): dotted
            {
                selector: 'edge[?implied]',
                style: { 'line-style': 'dotted' }
            },
            // Group membership: thin, so factions read as context rather than as relationships
            {
                selector: `edge[label = "${GROUP_MEMBERSHIP_LABEL}"]`,
                style: { 'width': Math.max(0.5, edgeWidth / 2), 'target-arrow-shape': 'none', 'line-style': 'solid' }
            },
            // Relationship kind colours, one per kind (neutral and custom keep the default line)
            ...RELATIONSHIP_KINDS
                .filter(kind => kind !== 'neutral' && kind !== 'custom')
                .map(kind => ({
                    selector: `edge[relationshipType="${kind}"]`,
                    style: {
                        'line-color': getRelationshipColor(kind),
                        'target-arrow-color': getRelationshipColor(kind)
                    }
                })),
            {
                selector: 'node:selected',
                style: { 'border-width': 4, 'border-color': accentText, 'z-index': 999 }
            },
            {
                selector: 'edge:selected',
                style: { 'width': edgeWidth + 2 }
            },
            // Dimmed: everything outside a hover, a search or a legend entry
            {
                selector: 'node.dimmed',
                style: { 'opacity': 0.3 }
            },
            {
                selector: 'edge.dimmed',
                style: { 'opacity': 0.2 }
            },
            {
                selector: 'node.highlighted',
                style: { 'border-width': 4, 'border-color': accent, 'z-index': 999 }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': edgeWidth + 1,
                    'z-index': 999,
                    'label': 'data(label)',
                    'text-background-opacity': Math.min(1, surfaceOpacity + 0.1)
                }
            },
            {
                selector: 'node.pinned',
                style: { 'border-width': 3, 'border-style': 'double', 'border-color': accentText }
            },
            // Legend entries switched off. Hiding a node hides its lines with it.
            {
                selector: '.legend-hidden',
                style: { 'display': 'none' }
            }
        ];
    }

    // Track currently hovered node to prevent redundant updates and race conditions
    private currentHoveredNode: NodeSingular | null = null;
    private panZoomTimeout: number | null = null;

    // Setup event listeners for graph interactions
    private setupEventListeners(): void {
        if (!this.cy) return;

        // Click on node to navigate to entity
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target as NodeSingular;
            this.handleNodeClick(node);
        });

        // Enhanced hover effects with highlighting and info panel update
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target as NodeSingular;

            // Skip if already hovering this node - prevents redundant updates
            if (this.currentHoveredNode && this.currentHoveredNode.id() === node.id()) {
                return;
            }
            this.currentHoveredNode = node;

            // Cancel any pending hide operation
            if (this.infoPanelTimeout) {
                window.clearTimeout(this.infoPanelTimeout);
                this.infoPanelTimeout = null;
            }

            // Immediately highlight node and neighbors using batched updates
            this.highlightNodeAndNeighbors(node);

            // Update info panel immediately (no delay for responsive feedback)
            this.updateInfoPanel(node);
        });

        this.cy.on('mouseout', 'node', () => {
            // Don't immediately hide - give time for user to move to info panel or adjacent node
            if (this.infoPanelTimeout) {
                window.clearTimeout(this.infoPanelTimeout);
                this.infoPanelTimeout = null;
            }
            
            // Short delay before clearing - allows moving between adjacent nodes smoothly
            this.infoPanelTimeout = window.setTimeout(() => {
                if (this.currentHoveredNode) {
                    this.currentHoveredNode = null;
                    this.cy?.elements().removeClass('highlighted dimmed');
                    this.hideInfoPanel();
                }
            }, 150); // Reduced from 500ms to 150ms - responsive but forgiving
        });
        
        // Keep info panel visible when hovering over it
        if (this.infoPanelEl) {
            this.infoPanelEl.addEventListener('mouseenter', () => {
                // Cancel any pending hide
                if (this.infoPanelTimeout) {
                    window.clearTimeout(this.infoPanelTimeout);
                    this.infoPanelTimeout = null;
                }
            });
            
            this.infoPanelEl.addEventListener('mouseleave', () => {
                // Only hide if not hovering a node - prevents flicker when moving back
                if (!this.currentHoveredNode) {
                    this.cy?.elements().removeClass('highlighted dimmed');
                    this.hideInfoPanel();
                }
            });
        }

        // Right-click to pin/unpin nodes
        this.cy.on('cxttap', 'node', (evt) => {
            evt.preventDefault();
            const node = evt.target as NodeSingular;
            this.toggleNodePin(node);
        });

        // Debounced pan/zoom handler - don't immediately clear highlights
        this.cy.on('pan zoom', () => {
            // Save viewport state (already debounced internally)
            this.saveViewportState();
            
            // Only clear highlights after pan/zoom settles
            if (this.panZoomTimeout) {
                window.clearTimeout(this.panZoomTimeout);
            }
            this.panZoomTimeout = window.setTimeout(() => {
                // Only clear if we're not currently hovering a node
                if (!this.currentHoveredNode) {
                    this.cy?.elements().removeClass('highlighted dimmed');
                    this.hideInfoPanel();
                }
            }, 300); // Wait for pan/zoom to settle
        });
    }

    // Efficiently highlight a node and its neighbors using batched updates
    private highlightNodeAndNeighbors(node: NodeSingular): void {
        if (!this.cy) return;

        // Use Cytoscape's batch API to minimize redraws
        this.cy.batch(() => {
            // First, dim everything
            this.cy!.elements().addClass('dimmed').removeClass('highlighted');
            
            // Then highlight the node and its neighborhood
            node.removeClass('dimmed').addClass('highlighted');
            node.neighborhood().removeClass('dimmed');
            node.connectedEdges().removeClass('dimmed').addClass('highlighted');
        });
    }

    // Handle node click - navigate to entity file
    private handleNodeClick(node: NodeSingular): void {
        const entityData = node.data('entityData') as NodeEntityData | undefined;
        if (entityData?.filePath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(entityData.filePath);
            if (file instanceof TFile) {
                void this.plugin.app.workspace.getLeaf(false).openFile(file);
            }
        }
    }

    // Create fixed info panel in bottom-right corner
    private createInfoPanel(): void {
        if (!this.canvasEl) return;

        this.infoPanelEl = createDiv();
        this.infoPanelEl.className = 'storyteller-network-info-panel';
        this.infoPanelEl.setCssStyles({ position: 'absolute' }); // Absolute to canvas container

        // Different positioning for modal vs sidebar view
        if (this.isModal) {
            // Modal: higher bottom position to avoid modal's bottom bar
            this.infoPanelEl.setCssStyles({ bottom: '60px' });
            this.infoPanelEl.setCssStyles({ maxHeight: 'calc(100% - 80px)' }); // More room in modal
        } else {
            // Sidebar view: standard position
            this.infoPanelEl.setCssStyles({ bottom: '20px' });
            this.infoPanelEl.setCssStyles({ maxHeight: 'calc(100% - 40px)' }); // Ensure it fits
        }

        this.infoPanelEl.setCssStyles({ right: '16px' });
        this.infoPanelEl.setCssStyles({ backgroundColor: 'var(--background-secondary)' });
        this.infoPanelEl.setCssStyles({ border: '2px solid var(--background-modifier-border)' });
        this.infoPanelEl.setCssStyles({ borderRadius: '12px' });
        this.infoPanelEl.setCssStyles({ padding: '0' });
        this.infoPanelEl.setCssStyles({ pointerEvents: 'auto' });
        this.infoPanelEl.setCssStyles({ zIndex: '1000' }); // High within canvas context
        this.infoPanelEl.setCssStyles({ minWidth: '140px' });
        this.infoPanelEl.setCssStyles({ maxWidth: '140px' });
        this.infoPanelEl.setCssStyles({ overflowY: 'auto' }); // Allow scrolling if content is too tall
        this.infoPanelEl.setCssStyles({ boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }); // Stronger shadow for visibility
        this.infoPanelEl.setCssStyles({ cursor: 'pointer' });
        this.infoPanelEl.setCssStyles({ opacity: '0' });
        this.infoPanelEl.setCssStyles({ transform: 'translateY(10px)' });
        this.infoPanelEl.setCssStyles({ transition: 'opacity 0.3s ease, transform 0.3s ease, max-width 0.3s ease' });

        // Initial hidden state message with icon
        this.setParsedHtml(this.infoPanelEl, `
            <div style="text-align: center; padding: 12px 8px; color: var(--text-muted);">
                <div style="font-size: 18px; opacity: 0.5;">🎯</div>
                <div style="font-size: 9px; margin-top: 4px;">Hover node</div>
            </div>
        `);

        // Append to canvas element
        this.canvasEl.appendChild(this.infoPanelEl);
    }

    // Update info panel with node information
    private updateInfoPanel(node: NodeSingular): void {
        if (!this.infoPanelEl) return;

        const entityData = node.data('entityData') as NodeEntityData | undefined;
        const type = node.data('type') as string;
        const label = node.data('label') as string;
        
        // Calculate actual degree by counting connected edges
        const degree = node.degree(false); // false = count each edge once (undirected)
        
        // Determine importance level
        let importanceLevel = 'Minor';
        let importanceColor = 'var(--text-muted)';
        let importanceIcon = '○';
        
        if (degree > 10) {
            importanceLevel = 'Hub';
            importanceColor = '#FFD700';
            importanceIcon = '★★★';
        } else if (degree > 5) {
            importanceLevel = 'Major';
            importanceColor = 'var(--text-success)';
            importanceIcon = '★★';
        } else if (degree > 2) {
            importanceLevel = 'Moderate';
            importanceColor = 'var(--text-accent)';
            importanceIcon = '★';
        }
        
        // Get type icon
        const typeIcons: Record<string, string> = {
            'character': '👤',
            'location': '📍',
            'event': '⚡',
            'item': '🎁',
            'culture': '🎭',
            'economy': '💰',
            'magicsystem': '✨',
            'group': '⚑'
        };
        const icon = typeIcons[type] || '●';
        
        let content = '';
        
        // Collapsed view - minimal display
        if (!this.infoPanelExpanded) {
            content = `
                <div style="padding: 8px; text-align: center; position: relative;">
                    <div style="font-size: 24px; margin-bottom: 4px;">${icon}</div>
                    <div style="font-size: 9px; font-weight: 600; color: var(--text-normal); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${label}</div>
                    <div style="font-size: 8px; color: ${importanceColor}; margin-bottom: 4px;">${importanceIcon}</div>
                    <div style="font-size: 11px; font-weight: 700; color: ${importanceColor};">${degree}</div>
                    <button style="position: absolute; top: 4px; right: 4px; background: transparent; border: none; cursor: pointer; color: var(--text-muted); font-size: 12px; padding: 2px; line-height: 1;" title="Expand">⤢</button>
                </div>
            `;
            
            this.setParsedHtml(this.infoPanelEl, content);
            this.infoPanelEl.setCssStyles({ maxWidth: '140px' });
            
            // Add click handler for expand button
            const expandBtn = this.infoPanelEl.querySelector('button');
            if (expandBtn) {
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.infoPanelExpanded = true;
                    this.updateInfoPanel(node);
                });
            }
            
            // Show with animation
            this.infoPanelEl.setCssStyles({ opacity: '1' });
            this.infoPanelEl.setCssStyles({ transform: 'translateY(0)' });
            return;
        }
        
        // Expanded view - full details
        this.infoPanelEl.setCssStyles({ maxWidth: '280px' });
        
        // Header with gradient background
        content = `
            <div style="background: linear-gradient(135deg, var(--background-secondary-alt) 0%, var(--background-secondary) 100%); padding: 8px 12px; border-radius: 12px 12px 0 0; border-bottom: 2px solid var(--background-modifier-border); position: relative;">
                <button style="position: absolute; top: 8px; right: 8px; background: transparent; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; padding: 2px; line-height: 1;" title="Collapse">⤡</button>
                <div style="display: flex; align-items: flex-start; gap: 8px; padding-right: 24px;">
                    <span style="font-size: 20px; line-height: 1;">${icon}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 13px; color: var(--text-normal); margin-bottom: 3px; word-wrap: break-word;">${label}</div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 10px; color: var(--text-muted); text-transform: capitalize; padding: 2px 6px; background: var(--background-primary); border-radius: 10px;">${type}</span>
                            <span style="font-size: 10px; font-weight: 600; color: ${importanceColor}; padding: 2px 6px; background: rgba(0,0,0,0.2); border-radius: 10px;">${importanceIcon} ${importanceLevel}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Content area with stats
        content += `<div style="padding: 8px 12px;">`;
        
        // Connection count with progress bar
        const maxConnections = 20; // For visualization
        const connectionPercent = Math.min((degree / maxConnections) * 100, 100);
        content += `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--text-normal);">Connections</span>
                    <span style="font-size: 13px; font-weight: 700; color: ${importanceColor};">${degree}</span>
                </div>
                <div style="height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${connectionPercent}%; background: linear-gradient(90deg, ${importanceColor}, var(--interactive-accent)); transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
        
        // Show breakdown of connected entity types with visual grid
        if (degree > 0) {
            const connectedNodes = node.neighborhood('node');
            const typeCounts: Record<string, number> = {};
            const relationshipTypes: Record<string, number> = {};
            
            connectedNodes.forEach((n: NodeSingular) => {
                const nodeType = n.data('type') as string;
                typeCounts[nodeType] = (typeCounts[nodeType] || 0) + 1;
            });

            // Count relationship types
            const connectedEdges = node.connectedEdges();
            connectedEdges.forEach((e: EdgeSingular) => {
                const relType = (e.data('relationshipType') as string | undefined) || 'unknown';
                relationshipTypes[relType] = (relationshipTypes[relType] || 0) + 1;
            });
            
            // Entity type breakdown with visual cards
            content += `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; font-weight: 600; color: var(--text-normal); margin-bottom: 6px;">Connected To</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
            `;
            
            const typeInfo = [
                { key: 'character', icon: '👤', label: 'Characters', color: '#CC6677' },
                { key: 'location', icon: '📍', label: 'Locations', color: '#44AA99' },
                { key: 'event', icon: '⚡', label: 'Events', color: '#DDCC77' },
                { key: 'item', icon: '🎁', label: 'Items', color: '#88CCEE' },
                { key: 'culture', icon: '🎭', label: 'Cultures', color: '#AA4499' },
                { key: 'economy', icon: '💰', label: 'Economies', color: '#117733' },
                { key: 'magicsystem', icon: '✨', label: 'Magic', color: '#332288' },
                { key: 'group', icon: '⚑', label: 'Groups', color: '#D55E00' }
            ];
            
            typeInfo.forEach(({ key, icon, label, color }) => {
                const count = typeCounts[key] || 0;
                const opacity = count > 0 ? 1 : 0.3;
                content += `
                    <div style="background: var(--background-primary); padding: 6px; border-radius: 4px; border-left: 2px solid ${color}; opacity: ${opacity};">
                        <div style="font-size: 14px; margin-bottom: 1px;">${icon}</div>
                        <div style="font-size: 12px; font-weight: 700; color: var(--text-normal);">${count}</div>
                        <div style="font-size: 9px; color: var(--text-muted);">${label}</div>
                    </div>
                `;
            });
            
            content += `</div></div>`;
            
            // Relationship strength breakdown
            const topRelationships = Object.entries(relationshipTypes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            
            if (topRelationships.length > 0) {
                content += `
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 11px; font-weight: 600; color: var(--text-normal); margin-bottom: 4px;">Top Relationships</div>
                `;
                
                topRelationships.forEach(([relType, count]) => {
                    const color = relType === 'unknown' ? 'var(--text-muted)' : getRelationshipColor(relType as RelationshipType);
                    const percent = (count / degree) * 100;
                    content += `
                        <div style="margin-bottom: 3px;">
                            <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
                                <span style="color: var(--text-muted); text-transform: capitalize;">${relType}</span>
                                <span style="font-weight: 600; color: ${color};">${count}</span>
                            </div>
                            <div style="height: 3px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden;">
                                <div style="height: 100%; width: ${percent}%; background: ${color};"></div>
                            </div>
                        </div>
                    `;
                });
                
                content += `</div>`;
            }
        }
        
        // Description if available
        if (entityData?.description) {
            const desc = entityData.description.substring(0, 100);
            content += `
                <div style="font-size: 10px; line-height: 1.4; color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--background-modifier-border);">
                    ${desc}${entityData.description.length > 100 ? '...' : ''}
                </div>
            `;
        }
        
        content += `</div>`; // Close content padding div
        
        // Footer with quick actions
        content += `
            <div style="background: var(--background-primary); padding: 6px 12px; border-radius: 0 0 12px 12px; border-top: 1px solid var(--background-modifier-border);">
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 9px; color: var(--text-muted);">
                    <div style="display: flex; align-items: center; gap: 3px;">
                        <span style="font-weight: 600; color: var(--text-accent);">Click</span>
                        <span>to open</span>
                    </div>
                    <span style="color: var(--background-modifier-border);">•</span>
                    <div style="display: flex; align-items: center; gap: 3px;">
                        <span style="font-weight: 600; color: var(--text-accent);">Right-click</span>
                        <span>to pin</span>
                    </div>
                </div>
            </div>
        `;

        this.setParsedHtml(this.infoPanelEl, content);
        
        // Add click handler for collapse button
        const collapseBtn = this.infoPanelEl.querySelector('button');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.infoPanelExpanded = false;
                this.updateInfoPanel(node);
            });
        }
        
        // Show with animation
        this.infoPanelEl.setCssStyles({ opacity: '1' });
        this.infoPanelEl.setCssStyles({ transform: 'translateY(0)' });
    }

    // Hide info panel
    private hideInfoPanel(): void {
        if (!this.infoPanelEl) return;
        
        // Reset to collapsed state when hiding
        this.infoPanelExpanded = false;
        
        // Fade out animation
        this.infoPanelEl.setCssStyles({ opacity: '0' });
        this.infoPanelEl.setCssStyles({ transform: 'translateY(10px)' });
    }

    // Toggle node pin state
    private toggleNodePin(node: NodeSingular): void {
        const nodeId = node.id();
        
        if (this.pinnedNodes.has(nodeId)) {
            this.pinnedNodes.delete(nodeId);
            node.removeClass('pinned');
            node.unlock();
        } else {
            this.pinnedNodes.add(nodeId);
            node.addClass('pinned');
            node.lock();
        }
    }
    
    /**
     * The legend panel's frame: a header with a close button and a body that
     * renderLegend() fills from what is on screen.
     */
    private createLegendPanel(): void {
        if (!this.canvasEl) return;

        const legendPanel = this.canvasEl.createDiv('storyteller-network-legend-panel');
        // Starts hidden; toggleLegend() animates these
        legendPanel.setCssStyles({ display: 'none', opacity: '0', transform: 'translateX(-100%)', pointerEvents: 'none' });

        const header = legendPanel.createDiv('storyteller-network-legend-header');
        header.createDiv({ cls: 'storyteller-network-legend-title', text: 'Legend' });
        const closeBtn = header.createEl('button', {
            cls: 'clickable-icon storyteller-network-legend-close',
            attr: { 'aria-label': 'Hide legend', title: 'Hide legend' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.toggleLegend());

        this.legendBodyEl = legendPanel.createDiv('storyteller-network-legend-body');
        this.legendPanelEl = legendPanel;

        // Add transition after DOM is ready to prevent flash
        window.setTimeout(() => {
            this.legendPanelEl?.setCssStyles({ transition: 'opacity 0.3s ease, transform 0.3s ease' });
        }, 0);

        this.createLegendToggleButton();
    }

    /**
     * Fill the legend from the nodes and edges on screen now. Called after
     * every refresh, filter, colour mode or theme change, so it only lists
     * what the graph is showing, with counts. Entries hidden from the legend
     * stay listed, struck through, so they can be brought back.
     */
    private renderLegend(): void {
        const body = this.legendBodyEl;
        if (!body || !this.cy) return;
        body.empty();

        const nodes = this.cy.nodes().map(node => ({
            id: node.id(),
            label: (node.data('label') as string) || '',
            type: node.data('type') as GraphNode['type'],
            degree: (node.data('degree') as number) || 0,
            data: (node.data('entityData') || {}) as GraphEntityFields,
            deceased: node.data('deceased') === true,
            colorKey: {
                key: node.data('colorKey') as string,
                label: node.data('colorLabel') as string,
                color: node.data('color') as string,
                order: node.data('colorOrder') as number,
            },
        }));
        const edges = this.cy.edges().map(edge => ({
            relationshipType: edge.data('relationshipType') as RelationshipType,
            direction: edge.data('direction') as GraphEdge['direction'],
            ended: edge.data('ended') === true,
            implied: edge.data('implied') === true,
            label: edge.data('label') as string | undefined,
        }));
        const legend = buildGraphLegend(nodes, edges, this.display.colorMode);

        // A key that no longer matches anything (new colour mode, filtered out) is forgotten
        const present = new Set<string>([
            ...legend.colors, ...legend.shapes, ...legend.relationships, ...legend.lines
        ].map(entry => entry.key));
        if (legend.deceased) present.add('deceased');
        this.hiddenLegendKeys.forEach(key => { if (!present.has(key)) this.hiddenLegendKeys.delete(key); });
        this.applyLegendHidden();

        if (nodes.length === 0) {
            body.createDiv({ cls: 'storyteller-network-legend-empty', text: 'Nothing on screen to describe.' });
            return;
        }

        this.renderLegendSection(body, legend.colorTitle, legend.colors, 'swatch');
        if (legend.deceased) {
            // Grey when colouring by type; otherwise the dead keep their colour, so the swatch is just the dashed rim
            const color = this.display.colorMode === 'type' ? GRAPH_DECEASED_COLOR : 'transparent';
            this.renderLegendSection(body, '', [{ key: 'deceased', label: 'Deceased (✝, faded, dashed)', color, count: legend.deceased }], 'swatch');
        }
        if (legend.shapes.length) this.renderLegendSection(body, 'Shape: entity type', legend.shapes, 'shape');
        if (legend.relationships.length) this.renderLegendSection(body, 'Relationships', legend.relationships, 'line');
        if (legend.lines.length) this.renderLegendSection(body, 'Lines', legend.lines, 'line');
        if (this.display.sizeByConnections) {
            body.createDiv({ cls: 'storyteller-network-legend-note', text: 'Bigger nodes have more connections; a gold rim marks a hub (10+).' });
        }

        const footer = body.createDiv('storyteller-network-legend-footer');
        if (this.hiddenLegendKeys.size) {
            const showAll = footer.createEl('button', { cls: 'storyteller-network-legend-showall', text: `Show all (${this.hiddenLegendKeys.size} hidden)` });
            showAll.addEventListener('click', () => {
                this.hiddenLegendKeys.clear();
                this.applyLegendHidden();
                this.renderLegend();
            });
        }
        footer.createDiv({
            cls: 'storyteller-network-legend-tip',
            text: 'Hover an entry to find it, click to hide it. Hover a node for details, click to open, right-click to pin.'
        });
    }

    private renderLegendSection(parent: HTMLElement, title: string, entries: GraphLegendEntry[], kind: 'swatch' | 'shape' | 'line'): void {
        if (!entries.length) return;
        const section = parent.createDiv('storyteller-network-legend-section');
        if (title) section.createDiv({ cls: 'storyteller-network-legend-heading', text: title });
        const list = section.createDiv('storyteller-network-legend-list');
        entries.forEach(entry => {
            const hidden = this.hiddenLegendKeys.has(entry.key);
            const row = list.createEl('button', {
                cls: 'storyteller-network-legend-row',
                attr: {
                    'aria-pressed': hidden ? 'false' : 'true',
                    title: hidden ? `Show ${entry.label}` : `Hide ${entry.label}`
                }
            });
            row.toggleClass('is-hidden', hidden);
            const swatch = row.createSpan('storyteller-network-legend-swatch');
            if (kind === 'line') {
                swatch.addClass('is-line', `is-${entry.line || 'solid'}`);
                if (entry.key.startsWith('rel:')) swatch.setCssStyles({ color: entry.color });
            } else {
                swatch.addClass(`shape-${entry.shape || 'ellipse'}`);
                if (kind === 'swatch') swatch.setCssStyles({ backgroundColor: entry.color });
            }
            if (entry.key === 'deceased') swatch.addClass('is-deceased');
            row.createSpan({ cls: 'storyteller-network-legend-label', text: entry.label });
            row.createSpan({ cls: 'storyteller-network-legend-count', text: String(entry.count) });

            row.addEventListener('mouseenter', () => this.focusLegendKey(entry.key));
            row.addEventListener('mouseleave', () => this.cy?.elements().removeClass('highlighted dimmed'));
            row.addEventListener('click', () => {
                if (this.hiddenLegendKeys.has(entry.key)) this.hiddenLegendKeys.delete(entry.key);
                else this.hiddenLegendKeys.add(entry.key);
                this.cy?.elements().removeClass('highlighted dimmed');
                this.applyLegendHidden();
                this.renderLegend();
            });
        });
    }

    /** The elements a legend entry stands for. */
    private elementsForLegendKey(key: string): cytoscape.CollectionReturnValue | null {
        if (!this.cy) return null;
        const membership = (edge: EdgeSingular) => edge.data('label') === GROUP_MEMBERSHIP_LABEL;
        if (key === 'deceased') return this.cy.nodes().filter(node => node.data('deceased') === true);
        // Entity type: the colour entries when colouring by type, the shape entries otherwise
        if (key.startsWith('type:')) {
            const type = key.slice(5);
            return this.cy.nodes().filter(node => node.data('type') === type);
        }
        if (key.startsWith('rel:')) {
            const kind = key.slice(4);
            return this.cy.edges().filter(edge => edge.data('relationshipType') === kind && !membership(edge));
        }
        if (key.startsWith('line:')) {
            const line = key.slice(5);
            return this.cy.edges().filter(edge => {
                if (line === 'membership') return membership(edge);
                if (membership(edge)) return false;
                if (line === 'mutual') return edge.data('direction') === 'mutual';
                if (line === 'arrow') return edge.data('direction') !== 'mutual';
                if (line === 'ended') return edge.data('ended') === true;
                if (line === 'implied') return edge.data('implied') === true;
                return false;
            });
        }
        return this.cy.nodes().filter(node => node.data('colorKey') === key);
    }

    /** Dim everything but what a legend entry stands for, and the lines between it. */
    private focusLegendKey(key: string): void {
        if (!this.cy) return;
        const matched = this.elementsForLegendKey(key);
        if (!matched) return;
        const focus = matched.union(matched.edges().connectedNodes()).union(matched.nodes().edgesWith(matched.nodes()));
        this.cy.batch(() => {
            this.cy!.elements().addClass('dimmed').removeClass('highlighted');
            focus.removeClass('dimmed').addClass('highlighted');
        });
    }

    private applyLegendHidden(): void {
        if (!this.cy) return;
        this.cy.batch(() => {
            this.cy!.elements().removeClass('legend-hidden');
            this.hiddenLegendKeys.forEach(key => { this.elementsForLegendKey(key)?.addClass('legend-hidden'); });
        });
    }

    // Floating button that brings the legend back
    private createLegendToggleButton(): void {
        if (!this.canvasEl) return;

        const toggleButton = this.canvasEl.createEl('button', {
            cls: 'storyteller-legend-toggle-btn',
            attr: { 'aria-label': 'Show legend', title: 'Show legend' }
        });
        setIcon(toggleButton, 'list');
        toggleButton.addEventListener('click', () => this.toggleLegend());
        this.legendToggleButtonEl = toggleButton;
    }

    // Toggle legend visibility
    private toggleLegend(): void {
        this.legendVisible = !this.legendVisible;
        if (this.display.legendVisible !== this.legendVisible) {
            this.display = { ...this.display, legendVisible: this.legendVisible };
            this.saveDisplay();
        }
        if (this.legendPanelEl) {
            if (this.legendVisible) {
                this.legendPanelEl.setCssStyles({ display: 'block' });
                // Force reflow before animating
                void this.legendPanelEl.offsetHeight;
                this.legendPanelEl.setCssStyles({ opacity: '1' });
                this.legendPanelEl.setCssStyles({ transform: 'translateX(0)' });
                this.legendPanelEl.setCssStyles({ pointerEvents: 'auto' });
            } else {
                this.legendPanelEl.setCssStyles({ opacity: '0' });
                this.legendPanelEl.setCssStyles({ transform: 'translateX(-100%)' });
                this.legendPanelEl.setCssStyles({ pointerEvents: 'none' });
                // Hide after animation
                window.setTimeout(() => {
                    if (this.legendPanelEl && !this.legendVisible) {
                        this.legendPanelEl.setCssStyles({ display: 'none' });
                    }
                }, 300);
            }
        }
        
        // Toggle floating button visibility
        if (this.legendToggleButtonEl) {
            if (this.legendVisible) {
                this.legendToggleButtonEl.setCssStyles({ opacity: '0' });
                this.legendToggleButtonEl.setCssStyles({ pointerEvents: 'none' });
            } else {
                this.legendToggleButtonEl.setCssStyles({ opacity: '1' });
                this.legendToggleButtonEl.setCssStyles({ pointerEvents: 'auto' });
            }
        }
    }
    
    // Show legend
    public showLegend(): void {
        if (!this.legendVisible) {
            this.toggleLegend();
        }
    }
    
    // Hide legend
    public hideLegend(): void {
        if (this.legendVisible) {
            this.toggleLegend();
        }
    }

    // Render empty state message over the (empty) canvas
    private renderEmptyState(): void {
        if (!this.canvasEl) return;

        this.clearEmptyState();
        const emptyState = this.canvasEl.createDiv('storyteller-network-empty-state');
        this.setParsedHtml(emptyState, `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;">📊</div>
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">No entities to display</div>
                <div style="margin-bottom: 1rem;">Create characters, locations, events, or items to see them in the network graph.</div>
                <div style="font-size: 0.9rem; color: var(--text-faint);">
                    Add relationships between entities to see connections visualized here.
                </div>
            </div>
        `);
    }

    private clearEmptyState(): void {
        this.canvasEl?.querySelectorAll(':scope > .storyteller-network-empty-state').forEach(el => el.remove());
    }

    // Search and highlight nodes
    searchAndHighlight(searchTerm: string): void {
        if (!this.cy) return;

        // Clear previous search
        this.cy.elements().removeClass('highlighted dimmed');

        if (!searchTerm) return;

        const term = searchTerm.toLowerCase();
        let found = false;

        this.cy.nodes().forEach(node => {
            const label = (node.data('label') as string).toLowerCase();
            if (label.includes(term)) {
                node.addClass('highlighted');
                found = true;
            } else {
                node.addClass('dimmed');
            }
        });

        this.cy.edges().forEach(edge => {
            const source = edge.source();
            const target = edge.target();
            if (source.hasClass('highlighted') && target.hasClass('highlighted')) {
                edge.addClass('highlighted');
            } else {
                edge.addClass('dimmed');
            }
        });

        // Fit to highlighted nodes
        if (found) {
            const highlighted = this.cy.nodes('.highlighted');
            this.cy.fit(highlighted, 50);
        }
    }

    // Clear search highlighting
    clearSearch(): void {
        if (!this.cy) return;
        this.cy.elements().removeClass('highlighted dimmed');
    }

    // Toggle edge labels visibility
    toggleEdgeLabels(): void {
        void this.setDisplay({ showEdgeLabels: !this.display.showEdgeLabels });
    }

    // Zoom controls
    zoomIn(): void {
        if (!this.cy) return;
        const currentZoom = this.cy.zoom();
        this.cy.zoom({
            level: currentZoom * 1.2,
            renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 }
        });
        this.saveViewportState(); // Save after zoom
    }

    zoomOut(): void {
        if (!this.cy) return;
        const currentZoom = this.cy.zoom();
        this.cy.zoom({
            level: currentZoom * 0.8,
            renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 }
        });
        this.saveViewportState(); // Save after zoom
    }

    fitToView(): void {
        if (!this.cy) return;
        this.cy.fit(undefined, 80); // Increased from 50 to match layout padding
        this.saveViewportState(); // Save after fit
    }

    // Resize the graph canvas without changing zoom/pan
    resize(): void {
        if (!this.cy) return;
        this.cy.resize();
    }

    // Save current zoom and pan position to settings (debounced)
    private saveViewportState(): void {
        if (!this.cy) return;

        // Clear existing timeout
        if (this.saveViewportTimeout) {
            window.clearTimeout(this.saveViewportTimeout);
        }

        // Debounce the save operation (wait 500ms after last change)
        this.saveViewportTimeout = window.setTimeout(() => {
            if (!this.cy) return;
            const zoom = this.cy.zoom();
            const pan = this.cy.pan();

            this.plugin.settings.networkGraphZoom = zoom;
            this.plugin.settings.networkGraphPan = { x: pan.x, y: pan.y };
            void this.plugin.saveSettings();
        }, 500);
    }

    // Restore saved zoom and pan position from settings
    private restoreViewportState(): boolean {
        if (!this.cy) return false;

        const savedZoom = this.plugin.settings.networkGraphZoom;
        const savedPan = this.plugin.settings.networkGraphPan;

        if (savedZoom !== undefined && savedPan !== undefined) {
            this.cy.zoom(savedZoom);
            this.cy.pan(savedPan);
            return true;
        }

        return false;
    }

    // Change layout algorithm
    changeLayout(layoutName: GraphLayoutName): void {
        void this.setDisplay({ layout: layoutName });
    }

    getDisplay(): GraphDisplayOptions {
        return { ...this.display };
    }

    /**
     * Change display options, save them, and redraw only as much as they need:
     * a colour or styling change restyles in place, a layout or spacing change
     * re-runs the layout, and a change to which lines or nodes are drawn
     * rebuilds the elements.
     */
    async setDisplay(patch: Partial<GraphDisplayOptions>): Promise<void> {
        const previous = this.display;
        this.display = sanitizeGraphDisplay({ ...previous, ...patch });
        this.saveDisplay();
        const changed = (Object.keys(patch) as Array<keyof GraphDisplayOptions>).filter(key => previous[key] !== this.display[key]);
        if (!changed.length || !this.cy) return;

        if (changed.includes('legendVisible')) {
            if (this.display.legendVisible) this.showLegend();
            else this.hideLegend();
        }
        if (changed.some(key => DATA_OPTIONS.includes(key))) {
            await this.refresh();
            return;
        }
        if (changed.includes('colorMode')) this.recolorNodes();
        if (changed.some(key => key === 'colorMode' || key === 'showEdgeLabels' || key === 'sizeByConnections')) {
            this.cy.style(this.getCytoscapeStyle() as unknown as cytoscape.StylesheetStyle[]);
            this.renderLegend();
        }
        if (changed.includes('layout') || changed.includes('spacing')) {
            this.cy.layout(this.getLayoutOptions(this.display.layout)).run();
        }
    }

    private saveDisplay(): void {
        this.plugin.settings.networkGraphDisplay = { ...this.display };
        void this.plugin.saveSettings();
    }

    // Apply filters and refresh graph
    async applyFilters(filters: GraphFilters): Promise<void> {
        this.currentFilters = filters;
        await this.refresh();
    }

    // Refresh the graph
    async refresh(): Promise<void> {
        if (!this.cy) return;

        // Ensure container is valid and has dimensions
        if (!this.canvasEl || !this.canvasEl.isConnected) {
            throw new Error('Canvas element is not attached to DOM');
        }

        // Get container dimensions
        const width = this.canvasEl.offsetWidth;
        const height = this.canvasEl.offsetHeight;

        // Validate dimensions before proceeding
        if (width === 0 || height === 0) {
            return;
        }

        // Resize cytoscape to match current container dimensions
        this.cy.resize();

        const { nodes, edges } = await this.buildGraphData();

        const elements = this.toElements(nodes, edges);

        // Store positions of pinned nodes
        const pinnedPositions = new Map<string, { x: number; y: number }>();
        this.pinnedNodes.forEach(nodeId => {
            const node = this.cy?.getElementById(nodeId);
            if (node) {
                pinnedPositions.set(nodeId, node.position());
            }
        });

        // Update graph
        this.cy.elements().remove();
        this.cy.add(elements);
        if (nodes.length === 0) {
            this.renderEmptyState();
        } else {
            this.clearEmptyState();
        }

        // Restore pinned nodes
        this.pinnedNodes.forEach(nodeId => {
            const node = this.cy?.getElementById(nodeId);
            if (node && pinnedPositions.has(nodeId)) {
                node.position(pinnedPositions.get(nodeId)!);
                node.addClass('pinned');
                node.lock();
            }
        });

        // Legend entries the user hid stay hidden, and the legend describes the new contents
        this.applyLegendHidden();
        this.renderLegend();

        // Run layout with current layout type
        this.cy.layout(this.getLayoutOptions(this.display.layout)).run();
    }

    // Export graph as image
    async exportAsImage(format: 'png' | 'jpg' = 'png'): Promise<void> {
        if (!this.cy) return;

        const dataUrl = this.cy.png({
            output: 'blob',
            bg: this.themeColor('background'),
            full: true,
            scale: 2
        });

        // Create download link
        const link = createEl('a');
        link.download = `network-graph-${Date.now()}.${format}`;
        link.href = URL.createObjectURL(dataUrl);
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // Get node count for status display
    getNodeCount(): number {
        return this.cy?.nodes().length || 0;
    }

    // Get edge count for status display
    getEdgeCount(): number {
        return this.cy?.edges().length || 0;
    }

    // Cleanup
    destroy(): void {
        // Clear any pending info panel timeout
        if (this.infoPanelTimeout) {
            window.clearTimeout(this.infoPanelTimeout);
            this.infoPanelTimeout = null;
        }

        // Clear viewport save timeout to prevent memory leaks
        if (this.saveViewportTimeout) {
            window.clearTimeout(this.saveViewportTimeout);
            this.saveViewportTimeout = null;
        }

        // Clean up info panel
        if (this.infoPanelEl) {
            this.infoPanelEl.remove();
            this.infoPanelEl = null;
        }

        this.unsubscribeTheme?.();
        this.unsubscribeTheme = null;
        if (this.cssChangeRef) {
            this.plugin.app.workspace.offref(this.cssChangeRef);
            this.cssChangeRef = null;
        }

        // Clean up legend panel elements
        this.legendBodyEl = null;
        this.backdropEl = null;
        if (this.legendPanelEl) {
            this.legendPanelEl.remove();
            this.legendPanelEl = null;
        }

        if (this.legendToggleButtonEl) {
            this.legendToggleButtonEl.remove();
            this.legendToggleButtonEl = null;
        }

        // Clean up Cytoscape instance
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }

        // Clean up canvas element
        if (this.canvasEl) {
            this.canvasEl.remove();
            this.canvasEl = null;
        }

        this.pinnedNodes.clear();
    }
}
