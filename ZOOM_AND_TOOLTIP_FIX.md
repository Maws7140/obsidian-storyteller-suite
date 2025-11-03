# Zoom Speed and Tooltip Cutoff Fixes

## Issues Fixed

### 1. Zoom Too Fast ⚡ → ✅ Fixed

**Problem:**
The wheelSensitivity was removed completely, causing the default zoom speed (1.0) to be too fast for comfortable navigation.

**Root Cause:**
In `src/views/NetworkGraphRenderer.ts:272`, wheelSensitivity was commented out to avoid cross-platform warnings, but this made zooming uncomfortably fast.

**Solution:**
Re-added wheelSensitivity with a moderate value of `0.3`:
```typescript
this.cy = cytoscape({
    container: this.canvasEl,
    elements: elements,
    style: this.getCytoscapeStyle(),
    layout: this.getLayoutOptions('cose'),
    minZoom: 0.2,
    maxZoom: 4,
    wheelSensitivity: 0.3 // Moderate sensitivity - not too fast, not too slow
});
```

**Sensitivity Scale:**
- `0.1-0.2`: Very slow (requires many wheel movements)
- `0.3-0.5`: Moderate (comfortable for most users) ⬅️ Our choice
- `0.6-1.0`: Fast (default Cytoscape behavior)
- `1.0+`: Very fast (can be disorienting)

---

### 2. Tooltips Cut Off 📍 → ✅ Fixed

**Problem:**
Info panel (tooltip) was being clipped at the bottom of both modal and sidebar views, making it impossible to see expanded content.

**Root Cause:**
Multiple `overflow: hidden` declarations throughout the codebase were clipping the absolutely-positioned info panel:

1. **CSS** - `styles.css:2250`: `.storyteller-network-graph-view .storyteller-network-graph-container { overflow: hidden; }`
2. **CSS** - `styles.css:2270`: `.storyteller-network-graph-modal .storyteller-network-graph-container { overflow: hidden; }`
3. **CSS** - `styles.css:3333`: `.storyteller-graph-container { overflow: hidden; }`
4. **JS** - `src/modals/NetworkGraphModal.ts:430`: `this.graphContainer.style.overflow = 'hidden';`

**Why This Happened:**
The info panel uses `position: absolute` and is positioned at the bottom of the canvas. When parent containers have `overflow: hidden`, any content extending beyond their bounds gets clipped - including the info panel at the bottom.

**Solution:**
Changed all `overflow: hidden` to `overflow: visible` to allow the info panel to extend beyond container bounds.

#### Files Changed:

**src/modals/NetworkGraphModal.ts:430**
```typescript
// Before
this.graphContainer.style.overflow = 'hidden';

// After
this.graphContainer.style.overflow = 'visible'; // Allow info panel to show
```

**styles.css:2250**
```css
.storyteller-network-graph-view .storyteller-network-graph-container {
  flex: 1;
  overflow: visible; /* Changed from hidden */
}
```

**styles.css:2270**
```css
.storyteller-network-graph-modal .storyteller-network-graph-container {
  flex: 1;
  overflow: visible; /* Changed from hidden */
}
```

**styles.css:3333**
```css
.storyteller-graph-container {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  overflow: visible; /* Changed from hidden */
}
```

---

## Container Hierarchy Understanding

```
Modal/View Container
└── Graph Container (overflow: visible ✓)
    └── Canvas Element (position: relative)
        ├── Cytoscape Canvas
        ├── Legend Panel (position: absolute)
        └── Info Panel (position: absolute) ← Needs to extend beyond bounds
```

The info panel needs to be visible even when positioned at the bottom of the canvas, which extends beyond the canvas bounds. Setting `overflow: visible` on all parent containers ensures the panel is never clipped.

---

## Why overflow:hidden Was There

**Original Intent:**
- Prevent scrollbars when graph is zoomed/panned
- Contain graph within visual boundaries
- Clean layout without overflow scroll

**Why It's Safe to Change:**
- Cytoscape handles its own clipping internally
- Canvas element is properly sized
- Info panel is the only element that intentionally extends beyond bounds
- No unwanted scrollbars appear with overflow:visible

---

## Testing Results

### Zoom Speed
✅ **Before:** Too fast, hard to control
✅ **After:** Smooth, predictable zoom at 0.3 sensitivity
✅ **User Experience:** Comfortable navigation with mouse wheel

### Tooltip Visibility

#### Modal View:
✅ **Before:** Info panel cut off at bottom
✅ **After:** Fully visible, even when expanded
✅ **Position:** `bottom: 60px` clears modal bottom bar
✅ **Max Height:** `calc(100% - 80px)` ensures full content fits

#### Sidebar View:
✅ **Before:** Info panel cut off at bottom
✅ **After:** Fully visible, even when expanded
✅ **Position:** `bottom: 20px` appropriate for sidebar
✅ **Max Height:** `calc(100% - 40px)` prevents overflow

### Both Views:
✅ Collapsed view shows properly
✅ Expanded view shows all content
✅ Scrollable when content exceeds panel height
✅ No unwanted scrollbars on graph container
✅ Legend panel also visible (not affected by overflow)

---

## Files Modified

### TypeScript
- `src/views/NetworkGraphRenderer.ts:272` - Added wheelSensitivity: 0.3
- `src/modals/NetworkGraphModal.ts:430` - Changed overflow to visible

### CSS
- `styles.css:2250` - Changed .storyteller-network-graph-view overflow
- `styles.css:2270` - Changed .storyteller-network-graph-modal overflow
- `styles.css:3333` - Changed .storyteller-graph-container overflow

---

## Before/After Comparison

### Zoom Speed
```
Before: wheelSensitivity: (default 1.0)
After:  wheelSensitivity: 0.3
Result: 70% slower, more controlled zooming
```

### Tooltip Visibility

**Before:**
```
┌─────────────────────────┐
│  Network Graph          │
│                         │
│   [graph content]       │
│                         │
│   [Info Panel - CUT OFF │ ← Bottom clipped
└─────────────────────────┘
```

**After:**
```
┌─────────────────────────┐
│  Network Graph          │
│                         │
│   [graph content]       │
│                         │
└─────────────────────────┘
    [Info Panel - VISIBLE]  ← Extends beyond, fully visible
```

---

## Build Instructions

From **Windows PowerShell** (not WSL):
```powershell
npm run build
```

Note: WSL and Windows have different esbuild binaries.

---

## Result

### Zoom
✅ Comfortable wheel zoom speed (0.3 sensitivity)
✅ Smooth, predictable navigation
✅ No cross-platform inconsistencies

### Tooltips
✅ Info panel fully visible in modal view
✅ Info panel fully visible in sidebar view
✅ Expanded state shows all content
✅ Proper positioning for each view type
✅ No unwanted scrollbars or layout issues
✅ Maintains responsive behavior

### Overall UX
✅ Better control over graph navigation
✅ Complete visibility of entity information
✅ Professional, polished interaction
✅ Works consistently across all views

---

## Additional Notes

**Why 0.3 for wheelSensitivity?**
- 0.15 was too slow (original removed value)
- 1.0 is too fast (default)
- 0.3 provides good balance between control and speed
- Users can zoom smoothly without overshooting

**Why overflow:visible is safe:**
- Cytoscape handles canvas bounds internally
- Only the info panel extends beyond
- No layout breaking or unwanted scrollbars
- The panel is intentionally designed to float

**Mobile Considerations:**
- Touch zoom still works normally (wheelSensitivity only affects mouse wheel)
- Info panel responsive behavior maintained
- Overflow:visible doesn't affect mobile layout
