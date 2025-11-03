# Cytoscape.js Styling Fixes

## Issues Fixed

### 1. Invalid CSS Custom Properties ❌ → ✅

**Problem:**
Cytoscape.js was displaying errors for CSS custom properties (CSS variables) like:
- `var(--background-modifier-border)`
- `var(--interactive-accent)`
- `var(--interactive-accent-hover)`
- `var(--font-interface)`

Cytoscape.js doesn't support CSS variables natively and requires computed color values.

**Solution:**
- Added `getCSSVariable()` helper method to resolve CSS variables to actual colors at runtime
- Updated `getCytoscapeStyle()` to compute all CSS variables before creating styles
- Added fallback colors for cases where CSS variables aren't found

**Files Changed:**
- `src/views/NetworkGraphRenderer.ts:39-52` - Added CSS variable resolver
- `src/views/NetworkGraphRenderer.ts:363-633` - Updated all style definitions

### 2. Invalid box-shadow Properties ❌ → ✅

**Problem:**
Cytoscape.js doesn't support `box-shadow` property:
```javascript
'box-shadow': '0 0 30px rgba(255, 215, 0, 0.6)'  // Not supported
```

**Solution:**
Removed all `box-shadow` declarations from Cytoscape styles. These visual effects don't work in canvas-based rendering.

### 3. Invalid Selector with Spaces ❌ → ✅

**Problem:**
Using `neighborhood(\`#${nodeId}\`)` created invalid selectors when nodeId contained spaces:
```javascript
neighborhood('#Location 2')  // Invalid selector
```

**Solution:**
Changed to use proper Cytoscape API for neighbor detection:
```javascript
// Before (broken with spaces in IDs)
n.neighborhood(`#${nodeId}`).length > 0

// After (correct API usage)
const neighbors = node.neighborhood('node');
neighbors.contains(n)
```

This approach:
- Uses the Cytoscape `neighborhood()` method to get all connected nodes
- Uses `contains()` to check if a node is in the collection
- Works regardless of node ID format (spaces, special characters, etc.)

### 4. Wheel Sensitivity Warning ⚠️ → ✅

**Problem:**
Custom `wheelSensitivity: 0.15` triggered warning about non-standard behavior across platforms:
```
You have set a custom wheel sensitivity. This will make your app zoom
unnaturally when using mainstream mice.
```

**Solution:**
Removed custom `wheelSensitivity` setting to use Cytoscape's default value, ensuring consistent behavior across all platforms and devices.

## Summary of Changes

### NetworkGraphRenderer.ts

**New Method:**
```typescript
private getCSSVariable(varName: string): string {
    const style = getComputedStyle(document.body);
    const value = style.getPropertyValue(varName).trim();
    const fallbacks: Record<string, string> = {
        '--background-modifier-border': '#3e3e3e',
        '--interactive-accent': '#7952b3',
        '--interactive-accent-hover': '#9a7bcc',
        '--font-interface': 'sans-serif'
    };
    return value || fallbacks[varName] || '#808080';
}
```

**Updated getCytoscapeStyle():**
```typescript
private getCytoscapeStyle(): any[] {
    // Compute CSS variables at runtime
    const borderColor = this.getCSSVariable('--background-modifier-border');
    const accentColor = this.getCSSVariable('--interactive-accent');
    const accentHoverColor = this.getCSSVariable('--interactive-accent-hover');
    const fontFamily = this.getCSSVariable('--font-interface');

    return [
        // Use computed values instead of var()
        {
            selector: 'node',
            style: {
                'border-color': borderColor,  // Not 'var(--background-modifier-border)'
                'background-color': accentColor,
                'font-family': fontFamily
            }
        },
        // ... rest of styles
    ];
}
```

**Updated setupEventListeners():**
```typescript
this.cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;

    // Get all neighbors of the hovered node (correct API usage)
    const neighbors = node.neighborhood('node');

    // Use node comparison instead of selector strings
    this.cy?.nodes().forEach(n => {
        if (n.id() === node.id()) {
            n.addClass('highlighted');
        } else if (neighbors.contains(n)) {
            // Connected node - don't dim it
        } else {
            n.addClass('dimmed');
        }
    });

    this.cy?.edges().forEach(e => {
        if (e.source().id() === node.id() || e.target().id() === node.id()) {
            e.addClass('highlighted');
        } else {
            e.addClass('dimmed');
        }
    });
});
```

**Updated initializeCytoscape():**
```typescript
this.cy = cytoscape({
    container: this.canvasEl,
    elements: elements,
    style: this.getCytoscapeStyle(),
    layout: this.getLayoutOptions('cose'),
    minZoom: 0.2,
    maxZoom: 4
    // wheelSensitivity removed
});
```

## Testing

✅ TypeScript compilation passes with no errors
✅ All CSS variables are properly computed
✅ No console warnings or errors
✅ Network graph renders correctly
✅ Theme colors adapt to Obsidian theme

## Before/After

### Before (Console Errors):
```
The style property `border-color: var(--background-modifier-border)` is invalid
The style property `box-shadow: 0 0 30px rgba(255, 215, 0, 0.6)` is invalid
The style property `line-color: var(--background-modifier-border)` is invalid
The style property `font-family: var(--font-interface)` is invalid
The selector `#Location 2` is invalid
You have set a custom wheel sensitivity...
```

### After:
```
✅ No errors or warnings
✅ Clean console output
✅ Network graph renders perfectly
```

## Benefits

1. **No Console Pollution** - Clean console logs for better debugging
2. **Theme Integration** - Colors properly adapt to Obsidian themes
3. **Cross-Platform** - Standard wheel/zoom behavior works everywhere
4. **Robust Selectors** - Node selection works with any ID format
5. **Performance** - No invalid style warnings slowing down rendering

## Files Modified

- `src/views/NetworkGraphRenderer.ts`

## Backward Compatibility

✅ Fully backward compatible
✅ No changes to plugin API
✅ No changes to saved data
✅ Works with existing network graphs

## Migration Notes

No user action required. The fixes are entirely internal to how Cytoscape.js processes styles. Users will simply see cleaner console logs and the same (or better) visual rendering.
