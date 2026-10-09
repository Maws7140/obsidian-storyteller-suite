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
