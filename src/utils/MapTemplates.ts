/**
 * MapTemplates - Built-in map templates and template management
 * Provides pre-configured templates for common map types
 */

import { MapTemplate, Map as StoryMap } from '../types';
import { generateMarkerId } from './MapUtils';

/**
 * Built-in map templates
 * These provide starting points for common map scenarios
 */
export const BUILTIN_TEMPLATES: MapTemplate[] = [
    // World Map Template
    {
        id: 'world-map',
        name: 'World Map',
        description: 'Large-scale world or continent map with regional markers',
        category: 'world',
        tags: ['world', 'continent', 'large-scale'],
        scale: 'world',
        width: 2000,
        height: 1200,
        defaultZoom: 0,
        center: [600, 1000],
        gridEnabled: false,
        markers: [
            {
                lat: 600,
                lng: 500,
                markerType: 'location',
                label: 'Northern Kingdom',
                description: 'Click to add location details',
                color: '#3388ff'
            },
            {
                lat: 600,
                lng: 1500,
                markerType: 'location',
                label: 'Southern Lands',
                description: 'Click to add location details',
                color: '#3388ff'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Perfect for creating high-level world maps. Add regions, continents, and major landmarks.'
    },

    // City Map Template
    {
        id: 'city-map',
        name: 'City Map',
        description: 'Urban area with districts, landmarks, and points of interest',
        category: 'city',
        tags: ['city', 'urban', 'districts'],
        scale: 'city',
        width: 1600,
        height: 1200,
        defaultZoom: 1,
        center: [600, 800],
        gridEnabled: false,
        markers: [
            {
                lat: 400,
                lng: 800,
                markerType: 'location',
                label: 'Market District',
                description: 'Central marketplace',
                color: '#3388ff'
            },
            {
                lat: 600,
                lng: 600,
                markerType: 'location',
                label: 'Castle',
                description: 'Royal palace',
                color: '#3388ff'
            },
            {
                lat: 700,
                lng: 1000,
                markerType: 'location',
                label: 'Harbor',
                description: 'Shipping docks',
                color: '#3388ff'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Ideal for mapping cities, towns, and urban areas. Mark districts, buildings, and landmarks.'
    },

    // Building Interior Template
    {
        id: 'building-interior',
        name: 'Building Floor Plan',
        description: 'Interior layout for castles, taverns, mansions, etc.',
        category: 'building',
        tags: ['building', 'interior', 'floor-plan'],
        scale: 'building',
        width: 1200,
        height: 1200,
        defaultZoom: 2,
        center: [600, 600],
        gridEnabled: true,
        gridSize: 40,
        markers: [
            {
                lat: 300,
                lng: 600,
                markerType: 'location',
                label: 'Entrance',
                description: 'Main door',
                color: '#3388ff'
            },
            {
                lat: 600,
                lng: 600,
                markerType: 'location',
                label: 'Main Hall',
                description: 'Central room',
                color: '#3388ff'
            },
            {
                lat: 900,
                lng: 600,
                markerType: 'location',
                label: 'Back Room',
                description: 'Private area',
                color: '#3388ff'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Great for interior maps. Grid enabled for precise room layouts. Add your floor plan as background.'
    },

    // Dungeon Template
    {
        id: 'dungeon-map',
        name: 'Dungeon Crawler',
        description: 'Underground complex with rooms, corridors, and encounters',
        category: 'dungeon',
        tags: ['dungeon', 'underground', 'exploration'],
        scale: 'building',
        width: 1600,
        height: 1600,
        defaultZoom: 1,
        center: [800, 800],
        gridEnabled: true,
        gridSize: 50,
        markers: [
            {
                lat: 200,
                lng: 800,
                markerType: 'location',
                label: 'Entrance Chamber',
                description: 'Start here',
                color: '#3388ff'
            },
            {
                lat: 800,
                lng: 800,
                markerType: 'event',
                label: 'Trap!',
                description: 'Hidden mechanism',
                color: '#ff6b6b'
            },
            {
                lat: 1400,
                lng: 800,
                markerType: 'location',
                label: 'Boss Room',
                description: 'Final encounter',
                color: '#ff6b6b'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Perfect for dungeons and underground areas. Mix location and event markers for encounters.'
    },

    // Battle Map Template
    {
        id: 'battle-map',
        name: 'Battle Map',
        description: 'Tactical combat map with grid for positioning',
        category: 'battle',
        tags: ['battle', 'combat', 'tactical'],
        scale: 'custom',
        width: 1200,
        height: 1200,
        defaultZoom: 2,
        center: [600, 600],
        gridEnabled: true,
        gridSize: 60,
        markers: [
            {
                lat: 300,
                lng: 300,
                markerType: 'event',
                label: 'Ally Position',
                description: 'Starting position',
                color: '#3388ff'
            },
            {
                lat: 900,
                lng: 900,
                markerType: 'event',
                label: 'Enemy Position',
                description: 'Opposition',
                color: '#ff6b6b'
            },
            {
                lat: 600,
                lng: 600,
                markerType: 'location',
                label: 'Objective',
                description: 'Key location',
                color: '#ffd700'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Tactical battle maps with grid for movement. Mark unit positions and objectives.'
    },

    // Region Map Template
    {
        id: 'region-map',
        name: 'Regional Map',
        description: 'Mid-scale region with cities, roads, and terrain features',
        category: 'region',
        tags: ['region', 'territory', 'kingdom'],
        scale: 'region',
        width: 1800,
        height: 1400,
        defaultZoom: 0,
        center: [700, 900],
        gridEnabled: false,
        markers: [
            {
                lat: 400,
                lng: 900,
                markerType: 'location',
                label: 'Capital City',
                description: 'Main settlement',
                color: '#3388ff'
            },
            {
                lat: 700,
                lng: 600,
                markerType: 'location',
                label: 'Mountain Pass',
                description: 'Trade route',
                color: '#3388ff'
            },
            {
                lat: 1000,
                lng: 1200,
                markerType: 'location',
                label: 'Border Fort',
                description: 'Defensive position',
                color: '#3388ff'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Regional maps for kingdoms, territories, or provinces. Connect to world maps above and city maps below.'
    },

    // Blank Canvas Template
    {
        id: 'blank-canvas',
        name: 'Blank Canvas',
        description: 'Empty map to start from scratch',
        category: 'custom',
        tags: ['blank', 'custom', 'empty'],
        scale: 'custom',
        width: 1400,
        height: 1000,
        defaultZoom: 1,
        center: [500, 700],
        gridEnabled: false,
        markers: [],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Start with a completely blank map and build exactly what you need.'
    },

    // Travel Map Template
    {
        id: 'travel-map',
        name: 'Journey Map',
        description: 'Plot routes, waypoints, and travel events',
        category: 'region',
        tags: ['travel', 'journey', 'quest'],
        scale: 'region',
        width: 2000,
        height: 1000,
        defaultZoom: 0,
        center: [500, 1000],
        gridEnabled: false,
        markers: [
            {
                lat: 500,
                lng: 200,
                markerType: 'event',
                label: 'Journey Start',
                description: 'Beginning of the quest',
                color: '#3388ff'
            },
            {
                lat: 500,
                lng: 1000,
                markerType: 'location',
                label: 'Waypoint',
                description: 'Rest stop',
                color: '#ffd700'
            },
            {
                lat: 500,
                lng: 1800,
                markerType: 'event',
                label: 'Destination',
                description: 'End of journey',
                color: '#ff6b6b'
            }
        ],
        isBuiltIn: true,
        author: 'Storyteller Suite',
        version: '1.0.0',
        usageNotes: 'Track character journeys, trade routes, or quest paths. Use event markers for encounters along the way.'
    }
];

/**
 * Get all available templates
 */
export function getAllTemplates(): MapTemplate[] {
    return [...BUILTIN_TEMPLATES];
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: MapTemplate['category']): MapTemplate[] {
    return BUILTIN_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): MapTemplate | undefined {
    return BUILTIN_TEMPLATES.find(t => t.id === id);
}

/**
 * Apply a template to create a new map
 */
export function applyTemplate(template: MapTemplate, mapName: string): Partial<StoryMap> {
    return {
        name: mapName,
        description: template.description,
        scale: template.scale,
        width: template.width,
        height: template.height,
        defaultZoom: template.defaultZoom,
        center: template.center,
        gridEnabled: template.gridEnabled,
        gridSize: template.gridSize,
        markers: template.markers ? template.markers.map(m => ({
            id: generateMarkerId(),
            lat: m.lat || 0,
            lng: m.lng || 0,
            markerType: m.markerType || 'location',
            label: m.label,
            description: m.description,
            color: m.color,
            visible: true
        })) : []
    };
}

/**
 * Get template categories for filtering
 */
export function getTemplateCategories(): Array<{ id: MapTemplate['category']; label: string; icon: string }> {
    return [
        { id: 'world', label: 'World Maps', icon: 'globe' },
        { id: 'region', label: 'Regional Maps', icon: 'map' },
        { id: 'city', label: 'City Maps', icon: 'building' },
        { id: 'building', label: 'Building Interiors', icon: 'home' },
        { id: 'dungeon', label: 'Dungeons', icon: 'dungeon' },
        { id: 'battle', label: 'Battle Maps', icon: 'crossed-swords' },
        { id: 'custom', label: 'Custom', icon: 'settings' }
    ];
}
