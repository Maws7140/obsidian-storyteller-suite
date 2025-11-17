import { parseYaml } from 'obsidian';
import type { BlockParameters } from '../types';

/**
 * Parse YAML parameters from code block source
 * Handles Obsidian links specially to preserve them during parsing
 *
 * Based on Leaflet plugin implementation:
 * 1. Extract all Obsidian links and replace with placeholders
 * 2. Parse YAML (or fallback to simple key:value parsing)
 * 3. Restore links from placeholders
 */
export function parseBlockParameters(source: string): BlockParameters {
    if (!source || source.trim().length === 0) {
        return {};
    }

    // Step 1: Extract and replace links
    // Match both [[wiki links]] and [markdown](links)
    const linkPattern = /(?:\[.*?\]\(|\[\[)[^\[\]]*?(?:\)|\]\])/g;
    const links = source.match(linkPattern) ?? [];

    let processedSource = source;
    links.forEach((link, index) => {
        processedSource = processedSource.replace(
            link,
            `LEAFLET_INTERNAL_LINK_${index}`
        );
    });

    // Step 2: Parse YAML
    let params: BlockParameters;
    try {
        // Try parsing as YAML
        params = parseYaml(processedSource) as BlockParameters;
    } catch (e) {
        // Fallback to simple key:value parsing
        params = parseSimpleKeyValue(processedSource);
    }

    // Step 3: Restore links
    if (links.length > 0) {
        restoreLinks(params, links);
    }

    // Post-process parameters
    return normalizeParameters(params);
}

/**
 * Fallback parser for simple key:value format
 * Used when YAML parsing fails
 */
function parseSimpleKeyValue(source: string): BlockParameters {
    const params: BlockParameters = {};

    const lines = source.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue; // Skip empty lines and comments
        }

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) {
            continue; // Skip lines without colons
        }

        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (key && value) {
            params[key] = value;
        }
    }

    return params;
}

/**
 * Recursively restore links in parameter object
 */
function restoreLinks(obj: any, links: string[]): void {
    if (!obj || typeof obj !== 'object') {
        return;
    }

    for (const key in obj) {
        const value = obj[key];

        if (typeof value === 'string') {
            // Check if this string contains a link placeholder
            let restored = value;
            links.forEach((link, index) => {
                restored = restored.replace(
                    `LEAFLET_INTERNAL_LINK_${index}`,
                    link
                );
            });
            obj[key] = restored;
        } else if (Array.isArray(value)) {
            // Process array elements
            for (let i = 0; i < value.length; i++) {
                if (typeof value[i] === 'string') {
                    let restored = value[i];
                    links.forEach((link, index) => {
                        restored = restored.replace(
                            `LEAFLET_INTERNAL_LINK_${index}`,
                            link
                        );
                    });
                    value[i] = restored;
                } else if (typeof value[i] === 'object') {
                    restoreLinks(value[i], links);
                }
            }
        } else if (typeof value === 'object') {
            // Recursively process nested objects
            restoreLinks(value, links);
        }
    }
}

/**
 * Normalize and validate parameters
 */
function normalizeParameters(params: BlockParameters): BlockParameters {
    // Normalize type
    if (params.type) {
        params.type = params.type.toLowerCase() as 'image' | 'real';
    } else if (params.image) {
        params.type = 'image';
    } else {
        params.type = 'real';
    }

    // Convert numeric strings to numbers
    if (params.lat && typeof params.lat === 'string') {
        params.lat = parseFloat(params.lat);
    }
    if (params.long && typeof params.long === 'string') {
        params.long = parseFloat(params.long);
    }
    if (params.defaultZoom && typeof params.defaultZoom === 'string') {
        params.defaultZoom = parseInt(params.defaultZoom, 10);
    }
    if (params.minZoom && typeof params.minZoom === 'string') {
        params.minZoom = parseInt(params.minZoom, 10);
    }
    if (params.maxZoom && typeof params.maxZoom === 'string') {
        params.maxZoom = parseInt(params.maxZoom, 10);
    }
    if (params.scale && typeof params.scale === 'string') {
        params.scale = parseFloat(params.scale);
    }

    // Convert boolean strings
    if (typeof (params as any).darkMode === 'string') {
        params.darkMode = ((params as any).darkMode as string).toLowerCase() === 'true';
    }
    if (typeof (params as any).draw === 'string') {
        params.draw = ((params as any).draw as string).toLowerCase() === 'true';
    }

    // Normalize arrays
    if (params.marker && typeof params.marker === 'string') {
        params.marker = [params.marker];
    }
    if (params.markerFile && typeof params.markerFile === 'string') {
        params.markerFile = [params.markerFile];
    }
    if (params.markerTag && typeof params.markerTag === 'string') {
        params.markerTag = [params.markerTag];
    }
    if (params.geojson && typeof params.geojson === 'string') {
        params.geojson = [params.geojson];
    }
    if (params.gpx && typeof params.gpx === 'string') {
        params.gpx = [params.gpx];
    }

    return params;
}

/**
 * Parse individual marker definition string
 * Format: [lat, long, link, description, icon]
 * Or: lat,long|link|description|icon
 */
export function parseMarkerString(markerStr: string): Partial<import('../types').MarkerDefinition> {
    // Remove brackets if present
    let cleaned = markerStr.trim();
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // Split by comma or pipe
    const parts = cleaned.includes('|')
        ? cleaned.split('|').map(p => p.trim())
        : cleaned.split(',').map(p => p.trim());

    if (parts.length < 2) {
        console.warn('Invalid marker definition:', markerStr);
        return {};
    }

    const marker: Partial<import('../types').MarkerDefinition> = {
        type: 'default'
    };

    // Parse coordinates
    const lat = parseFloat(parts[0]);
    const long = parseFloat(parts[1]);

    if (!isNaN(lat) && !isNaN(long)) {
        marker.loc = [lat, long];
    } else {
        // Could be percentage for image maps
        marker.loc = [parts[0], parts[1]];
        marker.percent = true;
    }

    // Parse optional fields
    if (parts.length > 2 && parts[2]) {
        marker.link = parts[2];
    }
    if (parts.length > 3 && parts[3]) {
        marker.description = parts[3];
    }
    if (parts.length > 4 && parts[4]) {
        marker.icon = parts[4];
    }

    return marker;
}

/**
 * Extract link from Obsidian link syntax
 * Handles both [[wiki]] and [markdown](path) links
 */
export function extractLinkPath(linkStr: string): string {
    // Wiki link: [[Page]] or [[Page|Alias]]
    const wikiMatch = linkStr.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (wikiMatch) {
        return wikiMatch[1];
    }

    // Markdown link: [text](path)
    const mdMatch = linkStr.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (mdMatch) {
        return mdMatch[2];
    }

    // Return as-is if no match
    return linkStr;
}

/**
 * Convert percentage-based coordinates to pixel coordinates
 */
export function percentToPixel(
    percent: [string | number, string | number],
    width: number,
    height: number
): [number, number] {
    const xPercent = typeof percent[0] === 'string'
        ? parseFloat(percent[0].replace('%', ''))
        : percent[0];
    const yPercent = typeof percent[1] === 'string'
        ? parseFloat(percent[1].replace('%', ''))
        : percent[1];

    return [
        (xPercent / 100) * width,
        (yPercent / 100) * height
    ];
}

/**
 * Convert pixel coordinates to percentage-based coordinates
 */
export function pixelToPercent(
    pixel: [number, number],
    width: number,
    height: number
): [string, string] {
    return [
        `${((pixel[0] / width) * 100).toFixed(2)}%`,
        `${((pixel[1] / height) * 100).toFixed(2)}%`
    ];
}
