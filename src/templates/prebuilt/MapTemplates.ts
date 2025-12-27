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

\`\`\`storyteller-map
type: real
lat: 40.7128
long: -74.0060
defaultZoom: 13
minZoom: 1
maxZoom: 18
\`\`\`

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

\`\`\`storyteller-map
type: image
image: [[your-world-map.png]]
width: 1200
height: 800
defaultZoom: 2
minZoom: 1
maxZoom: 5
marker: [50%, 30%, [[Capital City]], The grand capital of the realm]
marker: [70%, 60%, [[Dark Forest]], Ancient and mysterious woods]
marker: [20%, 40%, [[Port Town]], Busy harbor city]
\`\`\`

## Usage Instructions

1. Upload your world map image to your vault
2. Replace "your-world-map.png" with your image filename
3. Add markers using percentage coordinates [x%, y%, [[Location]], description]
4. Percentage coordinates are relative to image dimensions (0% to 100%)

## Sample Markers

\`\`\`
marker: [50%, 50%, [[Location]], Description]
marker: [25%, 75%, [[Another Place]], More details]
\`\`\``
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

\`\`\`storyteller-map
type: image
image: [[region-map.png]]
width: 1000
height: 800
defaultZoom: 3
minZoom: 2
maxZoom: 6
marker: [50%, 20%, [[Royal Castle]], Seat of power]
marker: [30%, 50%, [[Market Town]], Trading hub]
marker: [70%, 70%, [[Border Fort]], Military outpost]
marker: [50%, 80%, [[Sacred Grove]], Ancient religious site]
\`\`\`

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

\`\`\`storyteller-map
type: image
image: [[city-map.png]]
width: 1200
height: 1200
defaultZoom: 4
minZoom: 3
maxZoom: 7
marker: [50%, 30%, [[City Hall]], Government center]
marker: [60%, 50%, [[Market District]], Shops and vendors]
marker: [40%, 60%, [[Temple Quarter]], Religious district]
marker: [30%, 40%, [[Noble District]], Wealthy residences]
marker: [70%, 70%, [[Docks]], Harbor and warehouses]
marker: [20%, 80%, [[Slums]], Poor quarter]
\`\`\`

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

\`\`\`storyteller-map
type: image
image: [[dungeon-map.png]]
width: 800
height: 800
defaultZoom: 5
minZoom: 4
maxZoom: 8
marker: [50%, 10%, [[Entrance Hall]], Main entry]
marker: [30%, 30%, [[Guard Room]], Armed guards]
marker: [70%, 30%, [[Armory]], Weapons and armor]
marker: [50%, 50%, [[Throne Room]], Boss encounter]
marker: [50%, 70%, [[Treasure Room]], Loot storage]
marker: [30%, 90%, [[Prison]], Captives held here]
marker: [70%, 90%, [[Secret Passage]], Hidden exit]
\`\`\`

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

\`\`\`storyteller-map
type: image
image: [[your-map-image.png]]
\`\`\`

## Instructions

1. Choose map type: \`image\` or \`real\`
2. For image maps: Set image, width, height, zoom levels
3. For real maps: Set lat, long, zoom levels
4. Add markers using the format: \`marker: [x%, y%, [[Location]], Description]\``
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
