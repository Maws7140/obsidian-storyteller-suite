/**
 * TemplateBackgrounds - Generate SVG backgrounds for map templates
 * These are embedded SVG patterns that provide visual context for each template type
 */

/**
 * Generate a world map style background (continents)
 */
export function generateWorldMapSVG(width: number, height: number): string {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Ocean background -->
        <rect width="${width}" height="${height}" fill="#d4e4f7"/>

        <!-- Continents (landmasses) -->
        <path d="M 200,300 Q 400,250 600,300 L 650,500 Q 500,550 350,500 Z"
              fill="#e8d6b0" stroke="#c4b098" stroke-width="2"/>
        <path d="M 800,200 Q 1000,180 1200,220 L 1300,450 Q 1100,480 900,450 Z"
              fill="#e8d6b0" stroke="#c4b098" stroke-width="2"/>
        <path d="M 1400,600 Q 1600,550 1800,600 L 1850,900 Q 1650,950 1450,900 Z"
              fill="#e8d6b0" stroke="#c4b098" stroke-width="2"/>

        <!-- Grid lines (longitude/latitude) -->
        <line x1="0" y1="300" x2="${width}" y2="300" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>
        <line x1="0" y1="600" x2="${width}" y2="600" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>
        <line x1="0" y1="900" x2="${width}" y2="900" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>
        <line x1="500" y1="0" x2="500" y2="${height}" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>
        <line x1="1000" y1="0" x2="1000" y2="${height}" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>
        <line x1="1500" y1="0" x2="1500" y2="${height}" stroke="#b0c4de" stroke-width="1" opacity="0.4"/>

        <!-- Mountains -->
        <path d="M 400,350 L 430,300 L 460,350 Z" fill="#b08060" stroke="#907050" stroke-width="1"/>
        <path d="M 500,370 L 540,310 L 580,370 Z" fill="#b08060" stroke="#907050" stroke-width="1"/>
    </svg>`;
}

/**
 * Generate a regional map style background
 */
export function generateRegionalMapSVG(width: number, height: number): string {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#f5f3e8"/>

        <!-- Terrain regions -->
        <ellipse cx="400" cy="400" rx="300" ry="250" fill="#d8e6d0" opacity="0.6"/>
        <ellipse cx="1200" cy="700" rx="400" ry="300" fill="#e6d6c8" opacity="0.5"/>
        <ellipse cx="900" cy="300" rx="250" ry="200" fill="#d0d8e6" opacity="0.4"/>

        <!-- Roads/paths -->
        <path d="M 100,100 Q 600,400 1000,300" stroke="#c8b8a0" stroke-width="6" fill="none" opacity="0.7"/>
        <path d="M 1000,300 L 1500,800" stroke="#c8b8a0" stroke-width="6" fill="none" opacity="0.7"/>
        <path d="M 600,1000 Q 900,700 1200,900" stroke="#c8b8a0" stroke-width="6" fill="none" opacity="0.7"/>

        <!-- Forests -->
        <circle cx="500" cy="500" r="80" fill="#90b070" opacity="0.6"/>
        <circle cx="1100" cy="600" r="100" fill="#90b070" opacity="0.6"/>

        <!-- Border -->
        <rect x="10" y="10" width="${width-20}" height="${height-20}" fill="none"
              stroke="#a0a0a0" stroke-width="4" stroke-dasharray="20,10"/>
    </svg>`;
}

/**
 * Generate a city map style background
 */
export function generateCityMapSVG(width: number, height: number): string {
    const gridSize = 80;
    let streets = '';

    // Generate street grid
    for (let x = 100; x < width; x += gridSize) {
        streets += `<line x1="${x}" y1="50" x2="${x}" y2="${height-50}" stroke="#d0d0d0" stroke-width="4"/>`;
    }
    for (let y = 100; y < height; y += gridSize) {
        streets += `<line x1="50" y1="${y}" x2="${width-50}" y2="${y}" stroke="#d0d0d0" stroke-width="4"/>`;
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#f8f8f0"/>

        <!-- Streets -->
        ${streets}

        <!-- Main roads (thicker) -->
        <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="#b0b0b0" stroke-width="8"/>
        <line x1="${width/2}" y1="0" x2="${width/2}" y2="${height}" stroke="#b0b0b0" stroke-width="8"/>

        <!-- City blocks (buildings) -->
        <rect x="120" y="120" width="140" height="140" fill="#e0d8d0" stroke="#b0a8a0" stroke-width="1"/>
        <rect x="280" y="120" width="140" height="140" fill="#d8d0c8" stroke="#a8a098" stroke-width="1"/>
        <rect x="120" y="280" width="140" height="140" fill="#d0c8c0" stroke="#a09890" stroke-width="1"/>

        <!-- Park/green space -->
        <rect x="900" y="200" width="250" height="200" fill="#b8d8a8" stroke="#98b888" stroke-width="2"/>

        <!-- Water feature -->
        <ellipse cx="1300" cy="900" rx="150" ry="100" fill="#b0d0e8" stroke="#90b0c8" stroke-width="2"/>
    </svg>`;
}

/**
 * Generate a building/dungeon floor plan background
 */
export function generateBuildingFloorPlanSVG(width: number, height: number): string {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#f5f5f0"/>

        <!-- Grid (floor tiles) -->
        <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="none" stroke="#e0e0d8" stroke-width="1"/>
            </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grid)"/>

        <!-- Outer walls -->
        <rect x="100" y="100" width="1000" height="1000" fill="none" stroke="#404040" stroke-width="8"/>

        <!-- Rooms -->
        <rect x="100" y="100" width="400" height="400" fill="none" stroke="#606060" stroke-width="4"/>
        <rect x="500" y="100" width="300" height="400" fill="none" stroke="#606060" stroke-width="4"/>
        <rect x="800" y="100" width="300" height="400" fill="none" stroke="#606060" stroke-width="4"/>
        <rect x="100" y="500" width="500" height="600" fill="none" stroke="#606060" stroke-width="4"/>
        <rect x="600" y="500" width="500" height="600" fill="none" stroke="#606060" stroke-width="4"/>

        <!-- Doorways (gaps in walls) -->
        <line x1="500" y1="250" x2="500" y2="350" stroke="#f5f5f0" stroke-width="12"/>
        <line x1="800" y1="250" x2="800" y2="350" stroke="#f5f5f0" stroke-width="12"/>
        <line x1="300" y1="500" x2="400" y2="500" stroke="#f5f5f0" stroke-width="12"/>

        <!-- Furniture (simple boxes) -->
        <rect x="150" y="150" width="80" height="40" fill="#c8c0b8" stroke="#a8a098"/>
        <rect x="950" y="150" width="60" height="120" fill="#c8c0b8" stroke="#a8a098"/>
    </svg>`;
}

/**
 * Generate a dungeon map background
 */
export function generateDungeonMapSVG(width: number, height: number): string {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background (stone) -->
        <rect width="${width}" height="${height}" fill="#3a3a38"/>

        <!-- Grid (dungeon tiles) -->
        <defs>
            <pattern id="dungeonGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                <rect width="50" height="50" fill="none" stroke="#505050" stroke-width="1"/>
            </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#dungeonGrid)"/>

        <!-- Chambers -->
        <rect x="200" y="200" width="400" height="400" fill="#2a2a28" stroke="#606060" stroke-width="6"/>
        <circle cx="1000" cy="400" r="250" fill="#2a2a28" stroke="#606060" stroke-width="6"/>
        <rect x="900" y="900" width="500" height="450" fill="#2a2a28" stroke="#606060" stroke-width="6"/>

        <!-- Corridors -->
        <rect x="600" y="350" width="300" height="100" fill="#2a2a28" stroke="#606060" stroke-width="6"/>
        <rect x="1100" y="650" width="100" height="250" fill="#2a2a28" stroke="#606060" stroke-width="6"/>

        <!-- Pillars -->
        <rect x="300" y="300" width="40" height="40" fill="#505050" stroke="#707070" stroke-width="2"/>
        <rect x="500" y="300" width="40" height="40" fill="#505050" stroke="#707070" stroke-width="2"/>
        <rect x="300" y="500" width="40" height="40" fill="#505050" stroke="#707070" stroke-width="2"/>
        <rect x="500" y="500" width="40" height="40" fill="#505050" stroke="#707070" stroke-width="2"/>
    </svg>`;
}

/**
 * Generate a battle map background (tactical grid)
 */
export function generateBattleMapSVG(width: number, height: number): string {
    const gridSize = 60;
    let hexGrid = '';

    // Simple square grid for battle map
    for (let x = 0; x <= width; x += gridSize) {
        hexGrid += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#d0d0d0" stroke-width="2"/>`;
    }
    for (let y = 0; y <= height; y += gridSize) {
        hexGrid += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#d0d0d0" stroke-width="2"/>`;
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#f0f8f0"/>

        <!-- Grid -->
        ${hexGrid}

        <!-- Terrain features -->
        <rect x="300" y="300" width="180" height="180" fill="#d0c0a0" stroke="#b0a080" stroke-width="2"/>
        <circle cx="800" cy="600" r="120" fill="#c0d0c8" stroke="#a0b0a8" stroke-width="2"/>

        <!-- Elevation indicators -->
        <text x="350" y="400" font-size="24" fill="#999" opacity="0.5">↑ Hill</text>
        <text x="750" y="620" font-size="24" fill="#999" opacity="0.5">Water</text>
    </svg>`;
}

/**
 * Convert SVG string to data URI
 */
export function svgToDataUri(svg: string): string {
    const encoded = encodeURIComponent(svg)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
    return `data:image/svg+xml,${encoded}`;
}

/**
 * Get background for a template category
 */
export function getTemplateBackground(category: string, width: number, height: number): string {
    let svg: string;

    switch (category) {
        case 'world':
            svg = generateWorldMapSVG(width, height);
            break;
        case 'region':
            svg = generateRegionalMapSVG(width, height);
            break;
        case 'city':
            svg = generateCityMapSVG(width, height);
            break;
        case 'building':
            svg = generateBuildingFloorPlanSVG(width, height);
            break;
        case 'dungeon':
            svg = generateDungeonMapSVG(width, height);
            break;
        case 'battle':
            svg = generateBattleMapSVG(width, height);
            break;
        default:
            // Blank with subtle grid
            svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <rect width="${width}" height="${height}" fill="#fafafa"/>
                <defs>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <rect width="50" height="50" fill="none" stroke="#e8e8e8" stroke-width="1"/>
                    </pattern>
                </defs>
                <rect width="${width}" height="${height}" fill="url(#grid)"/>
            </svg>`;
    }

    return svgToDataUri(svg);
}
