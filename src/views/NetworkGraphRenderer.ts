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

    constructor(containerEl: HTMLElement, plugin: StorytellerSuitePlugin) {
        this.containerEl = containerEl;
        this.plugin = plugin;
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

        // Convert to cytoscape format
        const elements = [
            ...nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    entityData: node.data,
                    imageUrl: node.imageUrl
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
            wheelSensitivity: 0.15
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

        // Add event listeners
        this.setupEventListeners();

        // Create fixed info panel
        this.createInfoPanel();
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
                    'font-family': 'var(--font-interface)',
                    'color': '#ffffff', // White text for contrast
                    // Label background for better readability
                    'text-background-color': 'rgba(0, 0, 0, 0.75)',
                    'text-background-opacity': 0.85,
                    'text-background-padding': '4px',
                    'text-background-shape': 'roundrectangle',
                    'text-outline-color': 'transparent', // Remove outline, background is enough
                    'text-outline-width': 0,
                    'background-color': 'var(--interactive-accent)',
                    'border-width': 2,
                    'border-color': 'var(--background-modifier-border)',
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
            // Visual hierarchy: Highly connected nodes (degree > 5) - Add glow effect
            {
                selector: 'node[[degree > 5]]',
                style: {
                    'border-width': 3,
                    'box-shadow': '0 0 20px var(--interactive-accent)',
                    'z-index': 100
                }
            },
            // Visual hierarchy: Less connected nodes (degree < 2) - Dim slightly
            {
                selector: 'node[[degree < 2]]',
                style: {
                    'opacity': 0.7
                }
            },
            // Visual hierarchy: Isolated nodes (degree = 0) - Most dimmed
            {
                selector: 'node[[degree = 0]]',
                style: {
                    'opacity': 0.5,
                    'border-style': 'dashed'
                }
            },
            // Edge styles - Labels hidden by default, shown on hover
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': 'var(--background-modifier-border)',
                    'target-arrow-color': 'var(--background-modifier-border)',
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
                    'font-family': 'var(--font-interface)'
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
                    'border-color': 'var(--interactive-accent-hover)',
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
                    'border-color': 'var(--interactive-accent)',
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
                    'border-color': 'var(--interactive-accent-hover)'
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
            const nodeId = node.id();
            
            // Highlight the node and its connections
            this.cy?.nodes().forEach(n => {
                if (n.id() === nodeId) {
                    n.addClass('highlighted');
                } else if (n.neighborhood(`#${nodeId}`).length > 0) {
                    // Connected node
                } else {
                    n.addClass('dimmed');
                }
            });

            this.cy?.edges().forEach(e => {
                if (e.source().id() === nodeId || e.target().id() === nodeId) {
                    e.addClass('highlighted');
                } else {
                    e.addClass('dimmed');
                }
            });

            // Update info panel with slight delay for smooth UX
            if (this.infoPanelTimeout) {
                clearTimeout(this.infoPanelTimeout);
            }
            this.infoPanelTimeout = setTimeout(() => {
                this.updateInfoPanel(node);
            }, 150); // 150ms delay - faster than tooltip since it's less intrusive
        });

        this.cy.on('mouseout', 'node', (evt) => {
            // Clear any pending info panel update
            if (this.infoPanelTimeout) {
                clearTimeout(this.infoPanelTimeout);
                this.infoPanelTimeout = null;
            }
            
            // Remove all highlighting
            this.cy?.elements().removeClass('highlighted dimmed');
            this.hideInfoPanel();
        });

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
        this.infoPanelEl.style.position = 'absolute';
        this.infoPanelEl.style.bottom = '16px';
        this.infoPanelEl.style.right = '16px';
        this.infoPanelEl.style.backgroundColor = 'var(--background-secondary)';
        this.infoPanelEl.style.border = '1px solid var(--background-modifier-border)';
        this.infoPanelEl.style.borderRadius = '8px';
        this.infoPanelEl.style.padding = '12px 16px';
        this.infoPanelEl.style.pointerEvents = 'none';
        this.infoPanelEl.style.zIndex = '100';
        this.infoPanelEl.style.minWidth = '200px';
        this.infoPanelEl.style.maxWidth = '280px';
        this.infoPanelEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        this.infoPanelEl.style.opacity = '0';
        this.infoPanelEl.style.transform = 'translateY(10px)';
        this.infoPanelEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        
        // Initial hidden state message
        this.infoPanelEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-style: italic; font-size: 11px;">
                Hover over a node to see details
            </div>
        `;
        
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
        
        // Get type icon
        const typeIcons: Record<string, string> = {
            'character': '👤',
            'location': '📍',
            'event': '⚡',
            'item': '🎁'
        };
        const icon = typeIcons[type] || '●';
        
        let content = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px;">
                <span style="font-size: 20px;">${icon}</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-normal);">${label}</div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: capitalize;">${type}</div>
                </div>
            </div>
        `;
        
        // Connection count with visual indicator
        const connectionColor = degree > 5 ? 'var(--text-success)' : degree > 2 ? 'var(--text-accent)' : 'var(--text-muted)';
        content += `
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="font-size: 11px; color: var(--text-muted);">Connections:</span>
                <span style="font-weight: 600; color: ${connectionColor};">${degree}</span>
            </div>
        `;
        
        // Show breakdown of connected entity types
        if (degree > 0) {
            const connectedNodes = node.neighborhood('node');
            const typeCounts: Record<string, number> = {};
            
            connectedNodes.forEach((n: NodeSingular) => {
                const nodeType = n.data('type');
                typeCounts[nodeType] = (typeCounts[nodeType] || 0) + 1;
            });
            
            const typeLabels: Record<string, string> = {
                'character': '👤 Characters',
                'location': '📍 Locations',
                'event': '⚡ Events',
                'item': '🎁 Items'
            };
            
            const breakdown = Object.entries(typeCounts)
                .map(([t, count]) => `<span style="font-size: 11px; color: var(--text-muted);">${typeLabels[t] || t}: <strong>${count}</strong></span>`)
                .join('<span style="color: var(--background-modifier-border); margin: 0 4px;">•</span>');
            
            if (breakdown) {
                content += `
                    <div style="font-size: 11px; line-height: 1.6; padding: 6px 0; border-top: 1px solid var(--background-modifier-border);">
                        ${breakdown}
                    </div>
                `;
            }
        }
        
        // Description if available
        if (entityData?.description) {
            const desc = entityData.description.substring(0, 120);
            content += `
                <div style="font-size: 11px; line-height: 1.4; color: var(--text-muted); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--background-modifier-border);">
                    ${desc}${entityData.description.length > 120 ? '...' : ''}
                </div>
            `;
        }
        
        content += `
            <div style="font-size: 10px; margin-top: 8px; color: var(--text-faint); font-style: italic; text-align: center;">
                Click to open • Right-click to pin
            </div>
        `;

        this.infoPanelEl.innerHTML = content;
        
        // Show with animation
        this.infoPanelEl.style.opacity = '1';
        this.infoPanelEl.style.transform = 'translateY(0)';
    }

    // Hide info panel
    private hideInfoPanel(): void {
        if (!this.infoPanelEl) return;
        
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
        
        if (this.infoPanelEl) {
            this.infoPanelEl.remove();
            this.infoPanelEl = null;
        }
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
        if (this.canvasEl) {
            this.canvasEl.remove();
            this.canvasEl = null;
        }
        this.pinnedNodes.clear();
    }
}

