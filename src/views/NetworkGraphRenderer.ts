// Network Graph Renderer using Cytoscape.js
// Visualizes relationships between story entities

import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';
import StorytellerSuitePlugin from '../main';
import { GraphFilters, GraphNode, GraphEdge, Character, Location, Event, PlotItem } from '../types';
import { 
    extractAllRelationships, 
    buildBidirectionalEdges, 
    getRelationshipColor, 
    getEntityShape 
} from '../utils/GraphUtils';
import { TFile } from 'obsidian';

export class NetworkGraphRenderer {
    private containerEl: HTMLElement;
    private plugin: StorytellerSuitePlugin;
    private cy: Core | null = null;
    private canvasEl: HTMLElement | null = null;
    private currentFilters: GraphFilters = {
        entityTypes: ['character', 'location', 'event', 'item']
    };
    private infoPanelEl: HTMLElement | null = null; // Fixed info panel instead of tooltip
    private pinnedNodes: Set<string> = new Set();
    private currentLayout: 'cose' | 'circle' | 'grid' | 'concentric' = 'cose';
    private showAllEdgeLabels = false; // Toggle for showing all edge labels
    private infoPanelTimeout: NodeJS.Timeout | null = null; // Delay before updating info panel
    private saveViewportTimeout: NodeJS.Timeout | null = null; // Debounce for saving viewport state
    private legendVisible = false; // Toggle for showing/hiding legend
    private legendPanelEl: HTMLElement | null = null; // Reference to legend panel element
    private legendToggleButtonEl: HTMLElement | null = null; // Floating button to show legend
    private infoPanelExpanded = false; // Toggle for expanded/collapsed info panel
    private isModal: boolean; // Whether this renderer is in a modal context

    constructor(containerEl: HTMLElement, plugin: StorytellerSuitePlugin, isModal = false) {
        this.containerEl = containerEl;
        this.plugin = plugin;
        this.isModal = isModal;
    }

    // Resolve CSS custom property to actual color value
    // Cytoscape.js doesn't support CSS variables, so we need to compute them
    private getCSSVariable(varName: string): string {
        const style = getComputedStyle(document.body);
        const value = style.getPropertyValue(varName).trim();
        // Fallback colors if CSS variable is not found
        const fallbacks: Record<string, string> = {
            '--background-modifier-border': '#3e3e3e',
            '--interactive-accent': '#7952b3',
            '--interactive-accent-hover': '#9a7bcc',
            '--font-interface': 'sans-serif'
        };
        return value || fallbacks[varName] || '#808080';
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

        // Apply filters
        const filteredData = this.applyFiltersToEntities(
            characters,
            locations,
            events,
            items
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
            }))
        ];

        // Extract all relationships and build edges
        let edges = extractAllRelationships(
            filteredData.characters,
            filteredData.locations,
            filteredData.events,
            filteredData.items
        );

        // Build bidirectional edges for certain relationship types
        edges = buildBidirectionalEdges(edges);

        return { nodes, edges };
    }

    // Apply filters to entities
    private applyFiltersToEntities(
        characters: Character[],
        locations: Location[],
        events: Event[],
        items: PlotItem[]
    ): { characters: Character[], locations: Location[], events: Event[], items: PlotItem[] } {
        let filteredChars = characters;
        let filteredLocs = locations;
        let filteredEvts = events;
        let filteredItems = items;

        // Filter by entity types
        // If entityTypes is defined (even if empty array), apply filtering
        if (this.currentFilters.entityTypes !== undefined) {
            if (!this.currentFilters.entityTypes.includes('character')) {
                filteredChars = [];
            }
            if (!this.currentFilters.entityTypes.includes('location')) {
                filteredLocs = [];
            }
            if (!this.currentFilters.entityTypes.includes('event')) {
                filteredEvts = [];
            }
            if (!this.currentFilters.entityTypes.includes('item')) {
                filteredItems = [];
            }
        }

        // Filter by groups
        if (this.currentFilters.groups && this.currentFilters.groups.length > 0) {
            filteredChars = filteredChars.filter(c => 
                c.groups && c.groups.some(g => this.currentFilters.groups?.includes(g))
            );
            filteredLocs = filteredLocs.filter(l => 
                l.groups && l.groups.some(g => this.currentFilters.groups?.includes(g))
            );
            filteredEvts = filteredEvts.filter(e => 
                e.groups && e.groups.some(g => this.currentFilters.groups?.includes(g))
            );
            filteredItems = filteredItems.filter(i => 
                i.groups && i.groups.some(g => this.currentFilters.groups?.includes(g))
            );
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
            items: filteredItems
        };
    }

    // Initialize Cytoscape instance with Obsidian-themed styling
    async initializeCytoscape(): Promise<void> {
        // Show loading state
        const loadingEl = this.containerEl.createDiv('storyteller-network-loading');
        loadingEl.textContent = 'Loading graph...';

        // Create canvas container
        this.canvasEl = this.containerEl.createDiv('storyteller-network-canvas');
        this.canvasEl.style.width = '100%';
        // Responsive height: use viewport height for better space utilization
        const minHeight = window.innerWidth <= 768 ? '400px' : '500px';
        const maxHeight = 'calc(90vh - 250px)'; // Account for filters and controls
        this.canvasEl.style.height = maxHeight;
        this.canvasEl.style.minHeight = minHeight;
        this.canvasEl.style.backgroundColor = 'var(--background-primary)';
        this.canvasEl.style.border = '1px solid var(--background-modifier-border)';
        this.canvasEl.style.borderRadius = '8px';
        this.canvasEl.style.position = 'relative';

        // Build graph data
        const { nodes, edges } = await this.buildGraphData();

        // Remove loading state
        loadingEl.remove();

        // Check for empty state
        if (nodes.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate node degrees for dynamic sizing and visual hierarchy
        const nodeDegrees = new Map<string, number>();
        nodes.forEach(node => nodeDegrees.set(node.id, 0));
        edges.forEach(edge => {
            nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
            nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
        });

        // Convert to cytoscape format with degree data
        const elements = [
            ...nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    entityData: node.data,
                    imageUrl: node.imageUrl,
                    degree: nodeDegrees.get(node.id) || 0
                }
            })),
            ...edges.map(edge => ({
                data: {
                    id: `${edge.source}-${edge.target}`,
                    source: edge.source,
                    target: edge.target,
                    relationshipType: edge.relationshipType,
                    label: edge.label
                }
            }))
        ];

        // Initialize cytoscape
        this.cy = cytoscape({
            container: this.canvasEl,
            elements: elements,
            style: this.getCytoscapeStyle(),
            layout: this.getLayoutOptions('cose'),
            minZoom: 0.2,
            maxZoom: 4,
            wheelSensitivity: 0.3 // Moderate sensitivity - not too fast, not too slow
        });

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
        
        // Add event listeners (after panels are created)
        this.setupEventListeners();
    }

    // Get layout configuration options based on selected layout type
    private getLayoutOptions(layoutName: 'cose' | 'circle' | 'grid' | 'concentric'): any {
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
                    nodeRepulsion: 25000, // Increased from 15000 for better spacing
                    idealEdgeLength: 200, // Increased from 150 for more space
                    edgeElasticity: 100,
                    nestingFactor: 5,
                    gravity: 30, // Reduced from 50 for more spread
                    numIter: 1000,
                    initialTemp: 200,
                    coolingFactor: 0.95,
                    minTemp: 1.0,
                    componentSpacing: 150, // NEW: space between disconnected components
                    nodeOverlap: 20, // NEW: prevent node overlap
                    nodeDimensionsIncludeLabels: true // Prevent label overlap
                };
            case 'circle':
                return {
                    ...baseOptions,
                    name: 'circle',
                    radius: undefined, // Auto-calculate
                    spacingFactor: 1.5
                };
            case 'grid':
                return {
                    ...baseOptions,
                    name: 'grid',
                    rows: undefined, // Auto-calculate
                    cols: undefined,
                    spacingFactor: 1.5
                };
            case 'concentric':
                return {
                    ...baseOptions,
                    name: 'concentric',
                    minNodeSpacing: 100,
                    concentric: (node: any) => node.data('degree') || 0,
                    levelWidth: () => 2
                };
            default:
                return baseOptions;
        }
    }

    // Get Cytoscape stylesheet with Obsidian theme integration
    private getCytoscapeStyle(): any[] {
        // Compute CSS variables at runtime (Cytoscape doesn't support CSS vars)
        const borderColor = this.getCSSVariable('--background-modifier-border');
        const accentColor = this.getCSSVariable('--interactive-accent');
        const accentHoverColor = this.getCSSVariable('--interactive-accent-hover');
        const fontFamily = this.getCSSVariable('--font-interface');

        return [
            // Node styles - Dynamic sizing based on connections
            {
                selector: 'node',
                style: {
                    'label': (node: any) => {
                        const label = node.data('label');
                        // Truncate long labels with ellipsis
                        return label && label.length > 15 ? label.substring(0, 15) + '...' : label;
                    },
                    'text-valign': 'center', // Center labels on nodes for better readability
                    'text-halign': 'center',
                    'font-size': '14px', // Increased for accessibility (min 14px)
                    'font-family': fontFamily,
                    'color': '#ffffff', // White text for contrast
                    // Label background for better readability
                    'text-background-color': 'rgba(0, 0, 0, 0.75)',
                    'text-background-opacity': 0.85,
                    'text-background-padding': '4px',
                    'text-background-shape': 'roundrectangle',
                    'text-outline-color': 'transparent', // Remove outline, background is enough
                    'text-outline-width': 0,
                    'background-color': accentColor,
                    'border-width': 2,
                    'border-color': borderColor,
                    // Enhanced dynamic sizing based on degree (connections)
                    'width': (node: any) => {
                        const degree = node.data('degree') || 0;
                        return Math.max(40, Math.min(120, 40 + degree * 8)); // More pronounced: 40-120px
                    },
                    'height': (node: any) => {
                        const degree = node.data('degree') || 0;
                        return Math.max(40, Math.min(120, 40 + degree * 8));
                    },
                    'text-wrap': 'wrap',
                    'text-max-width': '100px'
                }
            },
            // Nodes with images - use image as background
            {
                selector: 'node[imageUrl]',
                style: {
                    'background-image': 'data(imageUrl)',
                    'background-fit': 'cover',
                    'background-clip': 'node',
                    'background-color': '#ffffff'
                }
            },
            // Character nodes (circles) - Color-blind friendly rose/pink
            {
                selector: 'node[type="character"]',
                style: {
                    'shape': 'ellipse',
                    'background-color': '#CC6677' // Tol muted palette - rose
                }
            },
            // Location nodes (squares) - Color-blind friendly teal
            {
                selector: 'node[type="location"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': '#44AA99' // Tol muted palette - teal
                }
            },
            // Event nodes (diamonds) - Color-blind friendly sand/gold
            {
                selector: 'node[type="event"]',
                style: {
                    'shape': 'diamond',
                    'background-color': '#DDCC77' // Tol muted palette - sand
                }
            },
            // Item nodes (hexagons) - Color-blind friendly cyan
            {
                selector: 'node[type="item"]',
                style: {
                    'shape': 'hexagon',
                    'background-color': '#88CCEE' // Tol muted palette - cyan
                }
            },
            // Visual hierarchy: Hub nodes (degree > 10) - Major characters/locations
            {
                selector: 'node[[degree > 10]]',
                style: {
                    'border-width': 5,
                    'border-color': '#FFD700',
                    'z-index': 200,
                    'font-size': '16px',
                    'font-weight': 'bold'
                }
            },
            // Visual hierarchy: Highly connected nodes (degree 6-10) - Important entities
            {
                selector: 'node[[degree > 5]][[degree <= 10]]',
                style: {
                    'border-width': 4,
                    'z-index': 150,
                    'font-size': '15px',
                    'font-weight': '600'
                }
            },
            // Visual hierarchy: Moderately connected nodes (degree 3-5) - Regular entities
            {
                selector: 'node[[degree > 2]][[degree <= 5]]',
                style: {
                    'border-width': 3,
                    'z-index': 100,
                    'opacity': 1
                }
            },
            // Visual hierarchy: Less connected nodes (degree 1-2) - Minor entities
            {
                selector: 'node[[degree > 0]][[degree <= 2]]',
                style: {
                    'opacity': 0.8,
                    'border-width': 2,
                    'font-size': '13px'
                }
            },
            // Visual hierarchy: Isolated nodes (degree = 0) - Orphaned entities
            {
                selector: 'node[[degree = 0]]',
                style: {
                    'opacity': 0.5,
                    'border-style': 'dashed',
                    'border-width': 2,
                    'font-size': '12px'
                }
            },
            // Edge styles - Labels hidden by default, shown on hover
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': borderColor,
                    'target-arrow-color': borderColor,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.2,
                    'label': '', // Hide labels by default
                    'font-size': '11px', // Increased from 10px for accessibility
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10,
                    'color': '#ffffff',
                    'text-background-color': 'rgba(0, 0, 0, 0.8)', // Background for edge labels too
                    'text-background-opacity': 0.85,
                    'text-background-padding': '3px',
                    'text-background-shape': 'roundrectangle',
                    'text-outline-color': 'transparent',
                    'text-outline-width': 0,
                    'font-family': fontFamily
                }
            },
            // Relationship type colors
            {
                selector: 'edge[relationshipType="ally"]',
                style: {
                    'line-color': '#4ade80',
                    'target-arrow-color': '#4ade80'
                }
            },
            {
                selector: 'edge[relationshipType="enemy"]',
                style: {
                    'line-color': '#ef4444',
                    'target-arrow-color': '#ef4444'
                }
            },
            {
                selector: 'edge[relationshipType="family"]',
                style: {
                    'line-color': '#3b82f6',
                    'target-arrow-color': '#3b82f6'
                }
            },
            {
                selector: 'edge[relationshipType="rival"]',
                style: {
                    'line-color': '#f97316',
                    'target-arrow-color': '#f97316'
                }
            },
            {
                selector: 'edge[relationshipType="romantic"]',
                style: {
                    'line-color': '#ec4899',
                    'target-arrow-color': '#ec4899'
                }
            },
            {
                selector: 'edge[relationshipType="mentor"]',
                style: {
                    'line-color': '#a855f7',
                    'target-arrow-color': '#a855f7'
                }
            },
            {
                selector: 'edge[relationshipType="acquaintance"]',
                style: {
                    'line-color': '#94a3b8',
                    'target-arrow-color': '#94a3b8'
                }
            },
            // Hover/selection states
            {
                selector: 'node:selected',
                style: {
                    'border-width': 4,
                    'border-color': accentHoverColor,
                    'z-index': 999
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 4
                }
            },
            // Dimmed state for non-highlighted nodes
            {
                selector: 'node.dimmed',
                style: {
                    'opacity': 0.3
                }
            },
            {
                selector: 'edge.dimmed',
                style: {
                    'opacity': 0.2
                }
            },
            // Highlighted state
            {
                selector: 'node.highlighted',
                style: {
                    'border-width': 4,
                    'border-color': accentColor,
                    'z-index': 999
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 3,
                    'z-index': 999,
                    'font-size': '11px',
                    'label': 'data(label)', // Show label when highlighted
                    // Enhanced visibility with background
                    'text-background-color': 'rgba(0, 0, 0, 0.85)',
                    'text-background-opacity': 0.95
                }
            },
            // Pinned nodes
            {
                selector: 'node.pinned',
                style: {
                    'border-width': 3,
                    'border-style': 'double',
                    'border-color': accentHoverColor
                }
            }
        ];
    }

    // Setup event listeners for graph interactions
    private setupEventListeners(): void {
        if (!this.cy) return;

        // Click on node to navigate to entity
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            this.handleNodeClick(node);
        });

        // Enhanced hover effects with highlighting and info panel update
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;

            // Clear any pending hide timeout from previous node
            if (this.infoPanelTimeout) {
                clearTimeout(this.infoPanelTimeout);
                this.infoPanelTimeout = null;
            }

            // Immediately clear all previous highlighting before applying new
            this.cy?.elements().removeClass('highlighted dimmed');

            // Get all neighbors of the hovered node (nodes connected to it)
            const neighbors = node.neighborhood('node');

            // Highlight the node and its connections
            this.cy?.nodes().forEach(n => {
                if (n.id() === node.id()) {
                    // The hovered node itself
                    n.addClass('highlighted');
                } else if (neighbors.contains(n)) {
                    // This node is a neighbor of the hovered node
                    // Don't dim it, but don't highlight it either (or optionally highlight it)
                    // For now, we'll leave it normal (not dimmed)
                } else {
                    // This node is not connected
                    n.addClass('dimmed');
                }
            });

            this.cy?.edges().forEach(e => {
                if (e.source().id() === node.id() || e.target().id() === node.id()) {
                    e.addClass('highlighted');
                } else {
                    e.addClass('dimmed');
                }
            });

            // Update info panel with slight delay for smooth UX
            this.infoPanelTimeout = setTimeout(() => {
                this.updateInfoPanel(node);
            }, 50); // 50ms delay - responsive hover feedback
        });

        this.cy.on('mouseout', 'node', (evt) => {
            // Don't immediately hide - give time for user to move to info panel
            if (this.infoPanelTimeout) {
                clearTimeout(this.infoPanelTimeout);
                this.infoPanelTimeout = null;
            }
            
            // Delay hiding to allow moving to info panel
            this.infoPanelTimeout = setTimeout(() => {
                // Remove all highlighting
                this.cy?.elements().removeClass('highlighted dimmed');
                this.hideInfoPanel();
            }, 500); // 500ms grace period
        });
        
        // Keep info panel visible when hovering over it
        if (this.infoPanelEl) {
            this.infoPanelEl.addEventListener('mouseenter', () => {
                // Cancel any pending hide
                if (this.infoPanelTimeout) {
                    clearTimeout(this.infoPanelTimeout);
                    this.infoPanelTimeout = null;
                }
            });
            
            this.infoPanelEl.addEventListener('mouseleave', () => {
                // Hide when leaving the panel
                this.cy?.elements().removeClass('highlighted dimmed');
                this.hideInfoPanel();
            });
        }

        // Right-click to pin/unpin nodes
        this.cy.on('cxttap', 'node', (evt) => {
            evt.preventDefault();
            const node = evt.target;
            this.toggleNodePin(node);
        });

        // Update tooltip position when panning/zooming and save viewport state
        this.cy.on('pan zoom', () => {
            this.hideInfoPanel();
            this.saveViewportState(); // Save user's zoom/pan position
        });
    }

    // Handle node click - navigate to entity file
    private handleNodeClick(node: NodeSingular): void {
        const entityData = node.data('entityData');
        if (entityData && entityData.filePath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(entityData.filePath);
            if (file instanceof TFile) {
                this.plugin.app.workspace.getLeaf(false).openFile(file);
            }
        }
    }

    // Create fixed info panel in bottom-right corner
    private createInfoPanel(): void {
        if (!this.canvasEl) return;

        this.infoPanelEl = document.createElement('div');
        this.infoPanelEl.className = 'storyteller-network-info-panel';
        this.infoPanelEl.style.position = 'absolute'; // Absolute to canvas container

        // Different positioning for modal vs sidebar view
        if (this.isModal) {
            // Modal: higher bottom position to avoid modal's bottom bar
            this.infoPanelEl.style.bottom = '60px';
            this.infoPanelEl.style.maxHeight = 'calc(100% - 80px)'; // More room in modal
        } else {
            // Sidebar view: standard position
            this.infoPanelEl.style.bottom = '20px';
            this.infoPanelEl.style.maxHeight = 'calc(100% - 40px)'; // Ensure it fits
        }

        this.infoPanelEl.style.right = '16px';
        this.infoPanelEl.style.backgroundColor = 'var(--background-secondary)';
        this.infoPanelEl.style.border = '2px solid var(--background-modifier-border)';
        this.infoPanelEl.style.borderRadius = '12px';
        this.infoPanelEl.style.padding = '0';
        this.infoPanelEl.style.pointerEvents = 'auto';
        this.infoPanelEl.style.zIndex = '1000'; // High within canvas context
        this.infoPanelEl.style.minWidth = '140px';
        this.infoPanelEl.style.maxWidth = '140px';
        this.infoPanelEl.style.overflowY = 'auto'; // Allow scrolling if content is too tall
        this.infoPanelEl.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'; // Stronger shadow for visibility
        this.infoPanelEl.style.cursor = 'pointer';
        this.infoPanelEl.style.opacity = '0';
        this.infoPanelEl.style.transform = 'translateY(10px)';
        this.infoPanelEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-width 0.3s ease';

        // Initial hidden state message with icon
        this.infoPanelEl.innerHTML = `
            <div style="text-align: center; padding: 12px 8px; color: var(--text-muted);">
                <div style="font-size: 18px; opacity: 0.5;">🎯</div>
                <div style="font-size: 9px; margin-top: 4px;">Hover node</div>
            </div>
        `;

        // Append to canvas element
        this.canvasEl.appendChild(this.infoPanelEl);
    }

    // Update info panel with node information
    private updateInfoPanel(node: NodeSingular): void {
        if (!this.infoPanelEl) return;

        const entityData = node.data('entityData');
        const type = node.data('type');
        const label = node.data('label');
        
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
            'item': '🎁'
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
            
            this.infoPanelEl.innerHTML = content;
            this.infoPanelEl.style.maxWidth = '140px';
            
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
            this.infoPanelEl.style.opacity = '1';
            this.infoPanelEl.style.transform = 'translateY(0)';
            return;
        }
        
        // Expanded view - full details
        this.infoPanelEl.style.maxWidth = '280px';
        
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
                const nodeType = n.data('type');
                typeCounts[nodeType] = (typeCounts[nodeType] || 0) + 1;
            });
            
            // Count relationship types
            const connectedEdges = node.connectedEdges();
            connectedEdges.forEach((e: EdgeSingular) => {
                const relType = e.data('relationshipType') || 'unknown';
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
                { key: 'item', icon: '🎁', label: 'Items', color: '#88CCEE' }
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
                
                const relColors: Record<string, string> = {
                    'ally': '#4ade80',
                    'enemy': '#ef4444',
                    'family': '#3b82f6',
                    'rival': '#f97316',
                    'romantic': '#ec4899',
                    'mentor': '#a855f7',
                    'acquaintance': '#94a3b8'
                };
                
                topRelationships.forEach(([relType, count]) => {
                    const color = relColors[relType] || 'var(--text-muted)';
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

        this.infoPanelEl.innerHTML = content;
        
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
        this.infoPanelEl.style.opacity = '1';
        this.infoPanelEl.style.transform = 'translateY(0)';
    }

    // Hide info panel
    private hideInfoPanel(): void {
        if (!this.infoPanelEl) return;
        
        // Reset to collapsed state when hiding
        this.infoPanelExpanded = false;
        
        // Fade out animation
        this.infoPanelEl.style.opacity = '0';
        this.infoPanelEl.style.transform = 'translateY(10px)';
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
    
    // Create interactive legend panel
    private createLegendPanel(): void {
        if (!this.canvasEl) return;
        
        const legendPanel = document.createElement('div');
        legendPanel.className = 'storyteller-network-legend-panel';
        legendPanel.style.position = 'absolute';
        legendPanel.style.top = '16px';
        legendPanel.style.left = '16px';
        legendPanel.style.backgroundColor = 'var(--background-secondary)';
        legendPanel.style.border = '2px solid var(--background-modifier-border)';
        legendPanel.style.borderRadius = '12px';
        legendPanel.style.padding = '0';
        legendPanel.style.zIndex = '999'; // Just below info panel but above canvas
        legendPanel.style.minWidth = '200px';
        legendPanel.style.maxWidth = '280px';
        legendPanel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
        legendPanel.style.maxHeight = 'calc(100% - 32px)'; // Stay within canvas bounds
        legendPanel.style.overflowY = 'auto';
        legendPanel.style.opacity = '0';
        legendPanel.style.transform = 'translateX(-100%)';
        legendPanel.style.pointerEvents = 'none';
        legendPanel.style.display = 'none'; // Start completely hidden
        
        let content = `
            <div style="background: linear-gradient(135deg, var(--background-secondary-alt) 0%, var(--background-secondary) 100%); padding: 12px 16px; border-bottom: 2px solid var(--background-modifier-border); position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; font-size: 14px; color: var(--text-normal);">🗺️ Graph Legend</div>
                <button class="legend-toggle-btn" style="background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: var(--text-muted); font-size: 16px;" title="Hide legend">✕</button>
            </div>
            
            <div style="padding: 12px 16px;">
                <!-- Node Types -->
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-normal); margin-bottom: 8px;">Node Types</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: #CC6677; border: 2px solid var(--background-modifier-border);"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">👤 Characters</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 20px; height: 20px; border-radius: 4px; background: #44AA99; border: 2px solid var(--background-modifier-border);"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">📍 Locations</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 20px; height: 20px; background: #DDCC77; border: 2px solid var(--background-modifier-border); transform: rotate(45deg);"></div>
                            <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">⚡ Events</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 20px; height: 20px; background: #88CCEE; border: 2px solid var(--background-modifier-border); clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">🎁 Items</span>
                        </div>
                    </div>
                </div>
                
                <!-- Importance Hierarchy -->
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-normal); margin-bottom: 8px;">Importance Level</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; color: #FFD700;">★★★</span>
                            <span style="font-size: 11px; color: var(--text-muted);">Hub (10+ connections)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; color: var(--text-success);">★★</span>
                            <span style="font-size: 11px; color: var(--text-muted);">Major (6-10 connections)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; color: var(--text-accent);">★</span>
                            <span style="font-size: 11px; color: var(--text-muted);">Moderate (3-5 connections)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; color: var(--text-muted);">○</span>
                            <span style="font-size: 11px; color: var(--text-muted);">Minor (1-2 connections)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; color: var(--text-faint);">⊝</span>
                            <span style="font-size: 11px; color: var(--text-muted);">Isolated (0 connections)</span>
                        </div>
                    </div>
                </div>
                
                <!-- Relationship Types -->
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-normal); margin-bottom: 8px;">Relationships</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #4ade80; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Ally</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #ef4444; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Enemy</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #3b82f6; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Family</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #ec4899; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Romantic</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #a855f7; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Mentor</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 3px; background: #f97316; border-radius: 2px;"></div>
                            <span style="font-size: 11px; color: var(--text-muted);">Rival</span>
                        </div>
                    </div>
                </div>
                
                <!-- Quick Tips -->
                <div style="background: var(--background-primary); padding: 10px; border-radius: 8px; border: 1px solid var(--background-modifier-border);">
                    <div style="font-size: 11px; font-weight: 600; color: var(--text-normal); margin-bottom: 6px;">💡 Quick Tips</div>
                    <div style="font-size: 10px; color: var(--text-muted); line-height: 1.6;">
                        • Hover nodes to see details<br>
                        • Click to open entity<br>
                        • Right-click to pin nodes<br>
                        • Scroll to zoom in/out<br>
                        • Drag background to pan
                    </div>
                </div>
            </div>
        `;
        
        legendPanel.innerHTML = content;
        this.canvasEl.appendChild(legendPanel);
        this.legendPanelEl = legendPanel;
        
        // Add transition after DOM is ready to prevent flash
        setTimeout(() => {
            if (this.legendPanelEl) {
                this.legendPanelEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            }
        }, 0);
        
        // Add toggle button click handler
        const toggleBtn = legendPanel.querySelector('.legend-toggle-btn') as HTMLElement;
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleLegend();
            });
        }
        
        // Create floating show legend button (initially visible)
        this.createLegendToggleButton();
    }
    
    // Create floating button to show legend when hidden
    private createLegendToggleButton(): void {
        if (!this.canvasEl) return;
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'storyteller-legend-toggle-btn';
        toggleButton.title = 'Show Legend';
        toggleButton.innerHTML = '🗺️';
        toggleButton.style.position = 'absolute';
        toggleButton.style.top = '16px';
        toggleButton.style.left = '16px';
        toggleButton.style.width = '40px';
        toggleButton.style.height = '40px';
        toggleButton.style.borderRadius = '50%';
        toggleButton.style.backgroundColor = 'var(--background-secondary)';
        toggleButton.style.border = '2px solid var(--background-modifier-border)';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.display = 'flex';
        toggleButton.style.alignItems = 'center';
        toggleButton.style.justifyContent = 'center';
        toggleButton.style.fontSize = '18px';
        toggleButton.style.zIndex = '998'; // Below legend panel but above canvas
        toggleButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        toggleButton.style.opacity = '1';
        toggleButton.style.pointerEvents = 'auto';
        toggleButton.style.transition = 'opacity 0.3s ease, transform 0.2s ease';
        
        toggleButton.addEventListener('mouseenter', () => {
            if (!this.legendVisible) {
                toggleButton.style.transform = 'scale(1.1)';
            }
        });
        
        toggleButton.addEventListener('mouseleave', () => {
            toggleButton.style.transform = 'scale(1)';
        });
        
        toggleButton.addEventListener('click', () => {
            this.toggleLegend();
        });
        
        this.canvasEl.appendChild(toggleButton);
        this.legendToggleButtonEl = toggleButton;
    }
    
    // Toggle legend visibility
    private toggleLegend(): void {
        this.legendVisible = !this.legendVisible;
        if (this.legendPanelEl) {
            if (this.legendVisible) {
                this.legendPanelEl.style.display = 'block';
                // Force reflow before animating
                this.legendPanelEl.offsetHeight;
                this.legendPanelEl.style.opacity = '1';
                this.legendPanelEl.style.transform = 'translateX(0)';
                this.legendPanelEl.style.pointerEvents = 'auto';
            } else {
                this.legendPanelEl.style.opacity = '0';
                this.legendPanelEl.style.transform = 'translateX(-100%)';
                this.legendPanelEl.style.pointerEvents = 'none';
                // Hide after animation
                setTimeout(() => {
                    if (this.legendPanelEl && !this.legendVisible) {
                        this.legendPanelEl.style.display = 'none';
                    }
                }, 300);
            }
        }
        
        // Toggle floating button visibility
        if (this.legendToggleButtonEl) {
            if (this.legendVisible) {
                this.legendToggleButtonEl.style.opacity = '0';
                this.legendToggleButtonEl.style.pointerEvents = 'none';
            } else {
                this.legendToggleButtonEl.style.opacity = '1';
                this.legendToggleButtonEl.style.pointerEvents = 'auto';
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

    // Render empty state message
    private renderEmptyState(): void {
        if (!this.canvasEl) return;
        
        const emptyState = this.canvasEl.createDiv('storyteller-network-empty-state');
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;">📊</div>
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">No entities to display</div>
                <div style="margin-bottom: 1rem;">Create characters, locations, events, or items to see them in the network graph.</div>
                <div style="font-size: 0.9rem; color: var(--text-faint);">
                    Add relationships between entities to see connections visualized here.
                </div>
            </div>
        `;
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
            const label = node.data('label').toLowerCase();
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
        if (!this.cy) return;
        
        this.showAllEdgeLabels = !this.showAllEdgeLabels;
        
        if (this.showAllEdgeLabels) {
            // Show all edge labels
            this.cy.style()
                .selector('edge')
                .style({
                    'label': 'data(label)'
                })
                .update();
        } else {
            // Hide edge labels (only show on highlighted)
            this.cy.style()
                .selector('edge')
                .style({
                    'label': ''
                })
                .update();
        }
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
            clearTimeout(this.saveViewportTimeout);
        }

        // Debounce the save operation (wait 500ms after last change)
        this.saveViewportTimeout = setTimeout(() => {
            if (!this.cy) return;
            const zoom = this.cy.zoom();
            const pan = this.cy.pan();

            this.plugin.settings.networkGraphZoom = zoom;
            this.plugin.settings.networkGraphPan = { x: pan.x, y: pan.y };
            this.plugin.saveSettings();
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
    changeLayout(layoutName: 'cose' | 'circle' | 'grid' | 'concentric'): void {
        if (!this.cy) return;
        
        this.currentLayout = layoutName;
        const layout = this.cy.layout(this.getLayoutOptions(layoutName));
        layout.run();
    }

    // Apply filters and refresh graph
    async applyFilters(filters: GraphFilters): Promise<void> {
        this.currentFilters = filters;
        await this.refresh();
    }

    // Refresh the graph
    async refresh(): Promise<void> {
        if (!this.cy) return;

        const { nodes, edges } = await this.buildGraphData();

        // Calculate node degrees for dynamic sizing
        const nodeDegrees = new Map<string, number>();
        nodes.forEach(node => nodeDegrees.set(node.id, 0));
        edges.forEach(edge => {
            nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
            nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
        });

        // Convert to cytoscape format with degree data
        const elements = [
            ...nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    entityData: node.data,
                    imageUrl: node.imageUrl,
                    degree: nodeDegrees.get(node.id) || 0
                }
            })),
            ...edges.map(edge => ({
                data: {
                    id: `${edge.source}-${edge.target}`,
                    source: edge.source,
                    target: edge.target,
                    relationshipType: edge.relationshipType,
                    label: edge.label
                }
            }))
        ];

        // Store positions of pinned nodes
        const pinnedPositions = new Map<string, any>();
        this.pinnedNodes.forEach(nodeId => {
            const node = this.cy?.getElementById(nodeId);
            if (node) {
                pinnedPositions.set(nodeId, node.position());
            }
        });

        // Update graph
        this.cy.elements().remove();
        this.cy.add(elements);

        // Restore pinned nodes
        this.pinnedNodes.forEach(nodeId => {
            const node = this.cy?.getElementById(nodeId);
            if (node && pinnedPositions.has(nodeId)) {
                node.position(pinnedPositions.get(nodeId));
                node.addClass('pinned');
                node.lock();
            }
        });

        // Run layout with current layout type
        this.cy.layout(this.getLayoutOptions(this.currentLayout)).run();
    }

    // Export graph as image
    async exportAsImage(format: 'png' | 'jpg' = 'png'): Promise<void> {
        if (!this.cy) return;

        const dataUrl = this.cy.png({
            output: 'blob',
            bg: getComputedStyle(document.body).getPropertyValue('--background-primary') || '#ffffff',
            full: true,
            scale: 2
        });

        // Create download link
        const link = document.createElement('a');
        link.download = `network-graph-${Date.now()}.${format}`;
        link.href = URL.createObjectURL(dataUrl as Blob);
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
            clearTimeout(this.infoPanelTimeout);
            this.infoPanelTimeout = null;
        }

        // Clear viewport save timeout to prevent memory leaks
        if (this.saveViewportTimeout) {
            clearTimeout(this.saveViewportTimeout);
            this.saveViewportTimeout = null;
        }

        // Clean up info panel
        if (this.infoPanelEl) {
            this.infoPanelEl.remove();
            this.infoPanelEl = null;
        }

        // Clean up legend panel elements
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

