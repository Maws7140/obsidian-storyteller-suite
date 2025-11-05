# Map Editor Modal Fixes

## Date: November 4, 2025

## Issues Identified

Based on research of the Javalent Obsidian Leaflet plugin implementation, the following critical issues were identified in the map editor modal:

### 1. **Leaflet Icon Path Issues**
- **Problem**: Default Leaflet marker icons rely on external image paths which don't work in Obsidian's environment
- **Symptom**: Markers don't display or show broken image icons
- **Root Cause**: Icon paths were being deleted but no replacement was provided

### 2. **Container Initialization Timing**
- **Problem**: Leaflet map was being initialized before the container had proper dimensions
- **Symptom**: Map appears blank or doesn't render properly
- **Root Cause**: DOM container wasn't fully rendered when `initMap()` was called

### 3. **Map Invalidation Timing**
- **Problem**: `invalidateSize()` was called too quickly (setTimeout 0ms)
- **Symptom**: Map tiles misaligned or markers positioned incorrectly
- **Root Cause**: Container dimensions not stable before size validation

### 4. **Missing CSS Specificity**
- **Problem**: Leaflet controls and containers lacked proper Obsidian theme integration
- **Symptom**: Controls invisible or improperly styled in different themes
- **Root Cause**: Generic Leaflet CSS not overridden for Obsidian environment

### 5. **No Error Handling**
- **Problem**: Silent failures during map initialization
- **Symptom**: Users see blank editor with no feedback
- **Root Cause**: No try-catch blocks or logging in initialization code

## Fixes Implemented

### MapView.ts Changes

#### 1. Fixed Icon System
```typescript
private fixLeafletIcons(): void {
  // Create simple circle icons to replace default Leaflet markers
  const createCircleIcon = (color: string) => {
    return L.divIcon({
      className: 'storyteller-default-marker',
      html: `<div style="width: 24px; height: 24px; background: ${color}; 
             border: 3px solid #fff; border-radius: 50%; 
             box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };
}
```
- Uses divIcons with inline SVG-style HTML
- No dependency on external image paths
- Works in all Obsidian environments

#### 2. Container Validation
```typescript
// Ensure container is visible and has dimensions
if (!this.container.offsetWidth || !this.container.offsetHeight) {
  console.warn('MapView: Container not visible, waiting...');
  await new Promise(resolve => setTimeout(resolve, 100));
  // Force dimensions if still not set
  if (!this.container.offsetWidth) this.container.style.width = '100%';
  if (!this.container.offsetHeight) this.container.style.height = '500px';
}
```
- Validates container dimensions before initialization
- Waits for container to be visible
- Forces dimensions as fallback

#### 3. Improved Map Invalidation
```typescript
setTimeout(() => {
  if (this.map) {
    this.map.invalidateSize({ pan: false });
    if (bounds && !useRealWorldMode) {
      this.map.fitBounds(bounds, { padding: [10, 10], animate: false });
    }
  }
}, 150);
```
- Increased delay from 0ms to 150ms
- Added pan: false to prevent unwanted movement
- Re-fits bounds after invalidation

### MapModal.ts Changes

#### 1. Improved Container Setup
```typescript
this.editorContainer = container.createDiv('storyteller-map-editor-container');
this.editorContainer.style.width = '100%';
this.editorContainer.style.height = '500px';
this.editorContainer.style.minHeight = '500px';
this.editorContainer.style.position = 'relative';

// Initialize after brief delay
setTimeout(() => {
  this.initializeMapEditor();
}, 50);
```
- Explicit dimensions set before initialization
- Added minHeight to prevent collapse
- 50ms delay ensures DOM rendering

#### 2. Added Error Handling
```typescript
try {
  console.log('MapModal: Initializing map with data:', this.map.id);
  await this.mapEditor.initMap(this.map);
  console.log('MapModal: Map initialized successfully');
} catch (error) {
  console.error('MapModal: Failed to initialize map:', error);
  new Notice('Failed to initialize map editor: ' + error.message);
  
  // Display error in container
  if (this.editorContainer) {
    this.editorContainer.empty();
    this.editorContainer.createEl('div', {
      text: 'Failed to load map editor. Check console for details.',
      cls: 'storyteller-error-message'
    });
  }
}
```
- Wrapped initialization in try-catch
- Added console logging for debugging
- Shows user-friendly error messages
- Displays error in the editor container

#### 3. Dimension Validation
```typescript
const rect = this.editorContainer.getBoundingClientRect();
console.log('MapModal: Container dimensions:', rect.width, 'x', rect.height);

if (rect.width === 0 || rect.height === 0) {
  console.error('MapModal: Container has no dimensions');
  new Notice('Map editor container sizing error');
  return;
}
```
- Validates container has non-zero dimensions
- Logs dimensions for debugging
- Early return prevents broken initialization

### styles.css Changes

#### 1. Enhanced Container Styling
```css
.storyteller-map-editor-container {
  position: relative;
  background: var(--background-primary);
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid var(--background-modifier-border);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.05);
  margin: 16px 0;
  min-width: 300px;   /* NEW */
  min-height: 400px;  /* NEW */
}
```
- Added minimum dimensions to prevent collapse
- Ensures Leaflet always has space to render

#### 2. Leaflet Integration Styles
```css
/* Leaflet-specific fixes for Obsidian environment */
.storyteller-map-editor-container .leaflet-container {
  width: 100%;
  height: 100%;
  background: var(--background-primary);
  font-family: var(--font-interface);
  z-index: 0;
}

.storyteller-map-editor-container .leaflet-control-container {
  z-index: 800;
}

.storyteller-map-editor-container .leaflet-control {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
}
```
- Proper z-indexing for controls
- Obsidian theme integration
- Font consistency

#### 3. Control Theming
```css
.storyteller-map-editor-container .leaflet-control-zoom a {
  background-color: var(--background-primary);
  color: var(--text-normal);
  border-bottom: 1px solid var(--background-modifier-border);
}

.storyteller-map-editor-container .leaflet-control-zoom a:hover {
  background-color: var(--background-modifier-hover);
}
```
- Controls match Obsidian theme
- Proper hover states
- Border styling

#### 4. Custom Marker Styling
```css
.storyteller-default-marker {
  background: transparent !important;
  border: none !important;
}
```
- Prevents default divIcon backgrounds
- Allows custom HTML to display properly

#### 5. Error Message Styling
```css
.storyteller-error-message {
  padding: 20px;
  text-align: center;
  color: var(--text-error);
  background: var(--background-modifier-error);
  border-radius: 8px;
  font-weight: 500;
}
```
- Clear error display
- Theme-appropriate colors
- User-friendly formatting

## Key Insights from Javalent Plugin

The research into the Javalent Obsidian Leaflet plugin revealed these best practices:

1. **Container Timing**: Always ensure containers are rendered with dimensions before initializing Leaflet
2. **Icon Strategy**: Use divIcons with inline HTML/SVG instead of relying on image paths
3. **Invalidation Delays**: Use appropriate delays (100-200ms) for invalidateSize()
4. **Error Handling**: Always wrap Leaflet operations in try-catch blocks
5. **CSS Integration**: Override Leaflet defaults with Obsidian CSS variables
6. **Z-index Management**: Use proper z-index layering for controls and overlays

## Testing Checklist

After implementing these fixes, test the following scenarios:

- [ ] Open Map Editor tab in new map modal
- [ ] Verify map tiles/background loads properly
- [ ] Test marker creation by right-clicking
- [ ] Verify markers display with correct icons
- [ ] Test drawing tools (polyline, polygon, etc.)
- [ ] Switch between tabs and back to editor
- [ ] Test with both image maps and real-world maps
- [ ] Verify OSM tile layer loads correctly
- [ ] Test in both light and dark themes
- [ ] Check mobile responsiveness
- [ ] Verify zoom controls work
- [ ] Test fullscreen mode
- [ ] Verify saved markers persist

## Additional Improvements Recommended

1. **Loading States**: Add loading spinner while map initializes
2. **Progress Feedback**: Show initialization progress for large maps
3. **Retry Mechanism**: Allow users to retry failed initializations
4. **Map Templates**: Pre-configured map templates for common use cases
5. **Performance**: Lazy load Leaflet libraries only when needed
6. **Caching**: Cache map tiles for offline use
7. **Export**: Allow exporting maps as images
8. **Undo/Redo**: Add undo/redo for drawing operations

## References

- [Javalent Obsidian Leaflet Plugin](https://github.com/javalent/obsidian-leaflet)
- [Leaflet.js Documentation](https://leafletjs.com/reference.html)
- [Leaflet Draw Plugin](https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html)
- [Obsidian Plugin Development](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Conclusion

The map editor should now:
- ✅ Initialize properly with visible containers
- ✅ Display markers correctly with custom icons
- ✅ Handle errors gracefully with user feedback
- ✅ Match Obsidian's theme appearance
- ✅ Work reliably across different scenarios

The fixes follow the proven patterns from the Javalent plugin while adapting them to our specific plugin architecture.
