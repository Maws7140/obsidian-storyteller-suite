/**
 * Map Templates
 * Pre-built map templates for different scales and purposes
 */

import { Template } from '../TemplateTypes';

/**
 * Real-world map template using OpenStreetMap tiles
 */
export const REAL_WORLD_MAP_TEMPLATE: Template = {
    id: 'builtin-real-world-map-v1',
    name: 'Real-World Map',
    description: 'Interactive map using OpenStreetMap tiles. Perfect for modern settings, historical fiction, or real-world locations.',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'real-world', 'openstreetmap', 'modern'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|World Map}}"
type: real
scale: world
lat: 40.7128
long: -74.0060
defaultZoom: 13
minZoom: 1
maxZoom: 18
darkMode: false
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

An interactive real-world map using OpenStreetMap tiles. Zoom in and out, pan around, and add markers to locations.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## Usage Notes

- Click to add markers at specific coordinates
- Link markers to location notes using [[Location Name]]
- Change lat/long values to center on different locations
- Adjust zoom levels for different viewing scales`
            }
        ]
    }
};

/**
 * Fantasy world map template for image-based maps
 */
export const FANTASY_WORLD_MAP_TEMPLATE: Template = {
    id: 'builtin-fantasy-world-map-v1',
    name: 'Fantasy World Map',
    description: 'Image-based map perfect for fantasy worlds, continents, and large-scale regions. Upload your own map image.',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'fantasy', 'world', 'image-based'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|Fantasy World}}"
type: image
scale: world
width: 1200
height: 800
defaultZoom: 2
minZoom: 1
maxZoom: 5
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

A comprehensive map of the fantasy world. Use percentage-based coordinates to place markers that scale with the image.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## Usage Instructions

1. Upload your world map image to your vault
2. Open the map with Edit map in the Map view and set the image to your file name
3. In the Map view, click Add location and then click the map where the place is to put its marker
4. Use the Maplog palette to mark doors, roads, walls and areas on the map
5. Turn on the Grid button to show square cells for measuring distances

## Placing Markers

Markers stay on the same spot of the image as you zoom in and out, so click the map where each place belongs and link the marker to its location note.`
            }
        ]
    }
};

/**
 * Regional map template for kingdoms, provinces, or medium-scale areas
 */
export const REGION_MAP_TEMPLATE: Template = {
    id: 'builtin-region-map-v1',
    name: 'Region/Kingdom Map',
    description: 'Medium-scale map for kingdoms, provinces, or regional areas. Perfect for focusing on specific parts of your world.',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'region', 'kingdom', 'province'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|Kingdom Map}}"
type: image
scale: region
width: 1000
height: 800
defaultZoom: 3
minZoom: 2
maxZoom: 6
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

A detailed regional map showing cities, towns, roads, and geographical features within a kingdom or province.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## Region Features

- **Scale**: Kingdom or province level
- **Details**: Cities, towns, castles, roads, forests, mountains
- **Zoom Range**: Medium detail, can show paths between locations`
            }
        ]
    }
};

/**
 * City map template for urban areas and towns
 */
export const CITY_MAP_TEMPLATE: Template = {
    id: 'builtin-city-map-v1',
    name: 'City/Town Map',
    description: 'Detailed city or town map with districts, buildings, and points of interest. Great for urban adventures.',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'city', 'urban', 'town'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|City Map}}"
type: image
scale: city
width: 1200
height: 1200
defaultZoom: 4
minZoom: 3
maxZoom: 7
gridEnabled: false
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

A detailed city map showing districts, major buildings, streets, and points of interest.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## City Features

- **Districts**: Mark different neighborhoods and quarters
- **Buildings**: Temples, guildhalls, inns, shops, government buildings
- **Infrastructure**: Streets, walls, gates, waterways
- **Points of Interest**: Quest locations, character homes, meeting spots`
            }
        ]
    }
};

/**
 * Building/Dungeon map template for indoor layouts
 */
export const DUNGEON_MAP_TEMPLATE: Template = {
    id: 'builtin-dungeon-map-v1',
    name: 'Dungeon/Building Map',
    description: 'Indoor floor plan for dungeons, buildings, castles, or any interior space. Includes optional grid overlay.',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'dungeon', 'building', 'interior', 'floor-plan'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|Dungeon Map}}"
type: image
scale: building
width: 800
height: 800
defaultZoom: 5
minZoom: 4
maxZoom: 8
gridEnabled: true
gridSize: 40
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

An indoor map showing room layouts, corridors, doors, and important features. Perfect for dungeons, castles, buildings, or encounter locations.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## Map Features

- **Grid**: Optional grid overlay for tactical combat
- **Rooms**: Mark each room/chamber with function and contents
- **Hazards**: Traps, locked doors, magical barriers
- **Encounters**: Monster locations, NPC positions
- **Treasures**: Loot locations, quest items
- **Secrets**: Hidden passages, concealed doors`
            }
        ]
    }
};

/**
 * Blank map template for custom uses
 */
export const BLANK_MAP_TEMPLATE: Template = {
    id: 'builtin-blank-map-v1',
    name: 'Blank Map',
    description: 'Start from scratch with a minimal map configuration. Choose image-based or real-world type.',
    genre: 'custom',
    category: 'single-entity',
    version: '1.0.0',
    author: 'built-in',
    isBuiltIn: true,
    isEditable: false,
    created: '2025-01-15T00:00:00.000Z',
    modified: '2025-01-15T00:00:00.000Z',
    tags: ['map', 'blank', 'custom'],

    entities: {
        maps: [
            {
                templateId: 'MAP_001',
                yamlContent: `name: "{{mapName|New Map}}"
type: image
scale: custom
markers: []
linkedLocations: []
linkedCharacters: []
linkedEvents: []
linkedItems: []
linkedGroups: []`,
                markdownContent: `## Description

A blank map ready for customization.

## Map

Open this map in the Map view to set its image or coordinates, zoom levels and markers.

## Instructions

1. In Edit map, choose the map type: an image map for your own picture, or a real-world map that uses OpenStreetMap tiles
2. For an image map, set the image file, width, height and zoom levels. For a real-world map, set the latitude, longitude and zoom levels
3. In the Map view, use an Add button such as Add location, then click the map to place a marker
4. Use the Maplog palette to draw doors, walls, roads and areas, and the Grid button for square cells`
            }
        ]
    }
};

/**
 * Export all map templates
 */
export const MAP_TEMPLATES = [
    REAL_WORLD_MAP_TEMPLATE,
    FANTASY_WORLD_MAP_TEMPLATE,
    REGION_MAP_TEMPLATE,
    CITY_MAP_TEMPLATE,
    DUNGEON_MAP_TEMPLATE,
    BLANK_MAP_TEMPLATE
];
