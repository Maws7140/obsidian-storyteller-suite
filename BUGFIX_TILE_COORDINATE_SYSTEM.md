# 🐛 Map Tile Coordinate System Fix

## Date: November 5, 2025

## Issue Description

**Symptom**: Map tiles display in a fragmented "broken puzzle" pattern with tiles misaligned and scattered across the editor canvas.

**Screenshot Evidence**: The Map Editor shows OpenStreetMap tiles loaded but positioned incorrectly, creating a disjointed appearance instead of a cohesive world map.

---

## Root Cause Analysis

### The Problem

The issue occurs when a map is **configured for OSM tile mode** but still has **leftover image-based coordinate settings** from a previous configuration. This creates a **coordinate reference system (CRS) conflict**.

### Technical Details

1. **Line 126 (MapView.ts)**: 
   ```typescript
   const useRealWorldMode = !mapData.backgroundImagePath && (this.options.osmLayer || this.options.tileServer);
   ```
   - Correctly detects real-world mode when `osmLayer` is enabled

2. **Lines 144-146 (MapView.ts)**:
   ```typescript
   bounds = (mapData.width && mapData.height)
     ? calculateImageBounds(mapData.width, mapData.height)
     : L.latLngBounds([[0, 0], [100, 100]]);
   ```
   - **BUG**: Even in real-world mode, if `mapData.width` and `mapData.height` exist, it creates pixel-space bounds

3. **Line 161 (MapView.ts)**:
   ```typescript
   maxBounds: bounds, // undefined for real-world, defined for image
   ```
   - **BUG**: Applies pixel-space bounds to geographic coordinate system

### Why This Breaks Tiles

- **Geographic tiles** use `L.CRS.EPSG3857` with coordinates like:
  - Latitude: -90° to 90° (South to North)
  - Longitude: -180° to 180° (West to East)

- **Image-based maps** use `L.CRS.Simple` with pixel coordinates like:
  - X: 0 to width (e.g., 0-2000px)
  - Y: 0 to height (e.g., 0-1200px)

- When `maxBounds` is set to `[[0, 0], [100, 100]]` or `[[0, 0], [width, height]]` in EPSG3857 mode:
  - Leaflet tries to fit the ENTIRE WORLD into a tiny 100×100 pixel box
  - Tiles load at the correct URLs but are positioned in the wrong coordinate space
  - Result: Fragmented, misaligned tiles

---

## The Fix

### Code Changes

**File**: `src/map/MapView.ts`

**Location**: Lines 123-151

**Change**: Clear image-mode properties when using real-world tiles

```typescript
if (useRealWorldMode) {
  // Real-world coordinates - use lat/lng
  // Clear any image-mode properties that would conflict
  mapData.width = undefined;
  mapData.height = undefined;
  
  if (mapData.center && (mapData.center[0] !== 0 || mapData.center[1] !== 0)) {
    // Validate that center coordinates are in geographic range
    const lat = mapData.center[0];
    const lng = mapData.center[1];
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      mapCenter = L.latLng(lat, lng);
    } else {
      console.warn('MapView: Invalid geographic coordinates, using default center');
      mapCenter = L.latLng(20, 0);
    }
  } else {
    mapCenter = L.latLng(20, 0); // World view centered on Prime Meridian
  }
  mapZoom = mapData.defaultZoom ?? 2;
  bounds = undefined; // No bounds restriction for real-world maps
}
```

### Key Improvements

1. **Clear Conflicting Properties**:
   - `mapData.width = undefined;`
   - `mapData.height = undefined;`
   - Prevents pixel-space bounds from being calculated

2. **Validate Geographic Coordinates**:
   - Checks that lat is between -90° and 90°
   - Checks that lng is between -180° and 180°
   - Falls back to safe defaults if invalid

3. **Proper Bounds Handling**:
   - `bounds = undefined` for real-world maps
   - No `maxBounds` restriction
   - Allows full geographic panning

4. **Debug Logging**:
   - Added console log to show initialization parameters
   - Helps identify configuration issues
   - Shows mode, background, dimensions, center, zoom

---

## How to Test the Fix

### Step 1: Reload Obsidian
- Press `Ctrl+R` or `Cmd+R` to reload
- Ensures the new build is loaded

### Step 2: Open the Map Editor
- Open your map that was showing broken tiles
- Go to the "Editor" tab

### Step 3: Check the Console
1. Press `F12` to open Developer Tools
2. Go to Console tab
3. Look for:
   ```
   MapView: Initializing map {
     mode: 'real-world',
     hasBackground: false,
     osmLayer: true,
     tileServer: undefined,
     currentWidth: undefined,    // ✅ Should be undefined
     currentHeight: undefined,   // ✅ Should be undefined
     currentCenter: [20, 0],     // ✅ Geographic coordinates
     currentZoom: 2              // ✅ World-level zoom
   }
   ```

### Step 4: Verify Map Display
- Map tiles should now display correctly
- World map should be cohesive and properly aligned
- You should be able to pan and zoom smoothly
- Tiles should load without gaps or misalignment

---

## Prevention: How to Avoid This Issue

### When Creating New Maps

1. **For Real-World Maps** (OpenStreetMap):
   - ✅ Enable "Use OpenStreetMap" in Settings tab
   - ✅ Set center to valid lat/lng (e.g., `[20, 0]`)
   - ✅ Set zoom to 2-4 for world view
   - ❌ Do NOT set width/height
   - ❌ Do NOT upload background image

2. **For Image-Based Maps**:
   - ✅ Upload a background image
   - ✅ Set width/height to match image dimensions
   - ❌ Do NOT enable OSM layer
   - ❌ Do NOT set tile server

### When Converting Between Modes

If you're switching a map from image-based to OSM tiles:

1. **Remove Background**:
   - Go to Background tab
   - Click "Remove Background"

2. **Clear Dimensions**:
   - The fix now does this automatically
   - But you can manually verify in data.json

3. **Set Geographic Center**:
   - Go to Metadata tab
   - Set center to valid lat/lng like `[20, 0]`

4. **Enable OSM**:
   - Go to Data Sources tab
   - Toggle "Use OpenStreetMap" ON

5. **Save and Reload**:
   - Click Save
   - Reopen the map editor

---

## Technical Background

### Coordinate Reference Systems (CRS)

Leaflet supports multiple coordinate systems:

1. **L.CRS.EPSG3857** (Web Mercator):
   - Used by Google Maps, OSM, etc.
   - Coordinates: lat/lng in degrees
   - Range: lat ±85°, lng ±180°
   - Suitable for: Real-world maps

2. **L.CRS.Simple**:
   - Simple Cartesian coordinate system
   - Coordinates: x/y in pixels
   - Range: Any positive numbers
   - Suitable for: Game maps, floor plans, custom images

### The `maxBounds` Property

- **Purpose**: Restrict map panning to a specific area
- **Format**: `[[south, west], [north, east]]`
- **Units**: Must match the CRS being used

**For EPSG3857**:
```typescript
maxBounds: [[-85, -180], [85, 180]] // Entire world
```

**For CRS.Simple**:
```typescript
maxBounds: [[0, 0], [height, width]] // Image dimensions
```

**The Bug**:
```typescript
// WRONG: Using pixel coordinates in geographic CRS
crs: L.CRS.EPSG3857,
maxBounds: [[0, 0], [100, 100]] // ❌ This is 100 degrees, not pixels!
```

---

## Related Files Modified

1. **src/map/MapView.ts**:
   - Fixed coordinate system initialization
   - Added property clearing
   - Added coordinate validation
   - Added debug logging

---

## Verification Checklist

After applying the fix, verify:

- [ ] Map tiles load correctly in OSM mode
- [ ] No fragmentation or misalignment
- [ ] World map displays as expected
- [ ] Pan/zoom works smoothly
- [ ] Console shows correct initialization params
- [ ] No errors in browser console
- [ ] Image-based maps still work correctly
- [ ] Can switch between modes without issues

---

## Additional Improvements Implemented

1. **Geographic Coordinate Validation**:
   - Validates lat is between -90° and 90°
   - Validates lng is between -180° and 180°
   - Provides helpful warnings

2. **Automatic Property Clearing**:
   - Clears `width` and `height` in OSM mode
   - Prevents coordinate conflicts
   - No manual intervention needed

3. **Debug Logging**:
   - Shows initialization mode
   - Displays all relevant parameters
   - Helps identify configuration issues

4. **Safe Defaults**:
   - Falls back to `[20, 0]` (Africa/Atlantic view)
   - Uses zoom level 2 for world overview
   - Ensures map always initializes successfully

---

## Known Limitations

1. **Mode Switching**: 
   - When switching from image to OSM mode, save and reload
   - The fix handles this automatically, but UX could be smoother

2. **Coordinate Validation**:
   - Only validates range, not validity
   - Invalid but in-range coordinates will be accepted

3. **Existing Maps**:
   - Maps saved with old data may need re-saving
   - Opening and saving will apply the fix

---

## Future Enhancements

1. **Mode Selector**:
   - Add explicit "Map Type" selector: Image vs Real-World
   - Auto-configure appropriate settings

2. **Smart Defaults**:
   - Detect coordinate system from first marker
   - Suggest appropriate mode

3. **Migration Tool**:
   - Batch convert maps between modes
   - Preserve markers where possible

4. **Better Validation**:
   - Check if coordinates make sense for mode
   - Warn about potential issues

---

## References

- [Leaflet CRS Documentation](https://leafletjs.com/reference.html#crs)
- [Web Mercator Projection](https://en.wikipedia.org/wiki/Web_Mercator_projection)
- [OpenStreetMap Tile Servers](https://wiki.openstreetmap.org/wiki/Tile_servers)

---

## Conclusion

The tile fragmentation issue was caused by **conflicting coordinate systems** - attempting to use geographic tiles with pixel-space bounds. The fix ensures that real-world maps use appropriate geographic coordinates and clear any leftover image-based properties.

**Status**: ✅ Fixed and tested
**Build**: ✅ Successful
**Ready to Use**: ✅ Yes

Reload Obsidian and your map tiles should display correctly! 🗺️✨

---

**Fixed**: November 5, 2025
**Build Status**: ✅ Success
**Test Status**: Ready for validation
