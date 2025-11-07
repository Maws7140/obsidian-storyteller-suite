# Tile Attribution Fix

## Summary

Fixed hardcoded tile layer attribution in `RealMap.ts` to support custom tile servers with proper attribution.

## Changes Made

### 1. Added `tileAttribution` to Type Definitions

**File: `src/map/types.ts`**
- Added optional `tileAttribution?: string` field to `TileLayerOptions` interface
- This allows attribution to be passed through the configuration chain

**File: `src/types.ts`**
- Added optional `tileAttribution?: string` field to the `Map` interface
- Allows map configurations to store custom attribution text

### 2. Updated RealMap.ts Attribution Logic

**File: `src/map/core/RealMap.ts`**

Added three new private methods:

#### `sanitizeAttribution(attribution: string): string`
- Safely encodes HTML to prevent XSS attacks
- Preserves common HTML entities like `&copy;`
- Allows safe anchor tags with proper security attributes (`target="_blank" rel="noopener noreferrer"`)
- Returns empty string for null/undefined input

#### `isOpenStreetMapUrl(url: string): boolean`
- Detects if the tile server URL is from OpenStreetMap
- Uses case-insensitive matching

#### `resolveAttribution(url: string): string`
- **Priority 1**: Uses explicit `tileAttribution` from context if provided
- **Priority 2**: Auto-detects OpenStreetMap URLs and applies proper OSM attribution with clickable link
- **Priority 3**: Defaults to empty string for custom tile servers (to avoid misattribution)

### 3. Updated Tile Layer Creation

Changed from:
```typescript
this.tileLayer = L.tileLayer(url, {
  maxZoom: 19,
  subdomains,
  attribution: '© OpenStreetMap contributors'  // Hardcoded!
});
```

To:
```typescript
const attribution = this.resolveAttribution(url);

this.tileLayer = L.tileLayer(url, {
  maxZoom: 19,
  subdomains,
  attribution  // Dynamic based on configuration and URL
});
```

## Behavior

### Default OpenStreetMap
When using the default OSM tile server or any URL containing "openstreetmap.org":
- **Attribution**: `© OpenStreetMap contributors` (with link to copyright page)

### Custom Tile Server (No Attribution Specified)
When using a custom tile server without specifying `tileAttribution`:
- **Attribution**: Empty string (no misattribution)

### Custom Tile Server (With Attribution)
When providing `tileAttribution` in configuration:
- **Attribution**: The provided text (sanitized for security)

## Security

- All attribution text is HTML-escaped to prevent XSS attacks
- Only safe HTML elements (anchor tags with security attributes) are allowed
- Attribution links open in new tab with `rel="noopener noreferrer"` for security

## Usage Examples

### Example 1: Using Custom Tile Server with Attribution
```typescript
const context: MapViewContext = {
  tileServer: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '© <a href="https://carto.com/attributions">CARTO</a>',
  // ... other options
};
```

### Example 2: Using OpenStreetMap (Auto-detected)
```typescript
const context: MapViewContext = {
  osmLayer: true,  // Uses default OSM URL
  // Attribution automatically set to "© OpenStreetMap contributors"
};
```

### Example 3: Custom Tile Server Without Attribution
```typescript
const context: MapViewContext = {
  tileServer: 'https://example.com/tiles/{z}/{x}/{y}.png',
  // No tileAttribution specified
  // Attribution will be empty string
};
```

## Benefits

1. **Accurate Attribution**: Custom tile servers no longer incorrectly show OSM attribution
2. **Flexible**: Supports any attribution text including HTML links
3. **Secure**: Sanitizes input to prevent XSS vulnerabilities
4. **Smart Defaults**: Auto-detects OSM and applies correct attribution
5. **Backward Compatible**: Existing OSM usage continues to work correctly
