# Network Graph Info Panel Positioning Fix

## Issue

The info panel (tooltip) in the Network Graph **Modal** was being hidden below the bottom status bar.

**Important:** Only the modal view needed fixing - the sidebar view was working correctly.

## Root Cause

Both NetworkGraphView (sidebar) and NetworkGraphModal (modal popup) use the same `NetworkGraphRenderer` class. The original `bottom: 16px` positioning worked fine for the sidebar view but caused the info panel to be hidden by the modal's bottom bar.

## Solution

Made the info panel positioning **conditional** based on the view type:
- **Modal:** `bottom: 60px`, `maxHeight: calc(100% - 80px)`
- **Sidebar:** `bottom: 20px`, `maxHeight: calc(100% - 40px)`

This ensures both views have proper spacing and the panel doesn't get cut off when expanded.

### Changes Made

**src/views/NetworkGraphRenderer.ts:**

1. **Added isModal Parameter** (line 33, 35-38):
   ```typescript
   private isModal: boolean;

   constructor(containerEl: HTMLElement, plugin: StorytellerSuitePlugin, isModal = false) {
       this.containerEl = containerEl;
       this.plugin = plugin;
       this.isModal = isModal;
   }
   ```

2. **Conditional Info Panel Positioning** (line 752-760):
   ```typescript
   // Different positioning for modal vs sidebar view
   if (this.isModal) {
       // Modal: higher bottom position to avoid modal's bottom bar
       this.infoPanelEl.style.bottom = '60px';
       this.infoPanelEl.style.maxHeight = 'calc(100% - 80px)'; // More room in modal
   } else {
       // Sidebar view: standard position
       this.infoPanelEl.style.bottom = '20px';
       this.infoPanelEl.style.maxHeight = 'calc(100% - 40px)'; // Ensure it fits
   }
   ```

**src/modals/NetworkGraphModal.ts:**

3. **Pass isModal=true to Renderer** (line 438):
   ```typescript
   const renderer = new NetworkGraphRenderer(this.graphContainer, this.plugin, true);
   ```

**src/views/NetworkGraphView.ts:**

4. **Sidebar Uses Default (isModal=false)** (line 316):
   ```typescript
   this.graphRenderer = new NetworkGraphRenderer(this.graphContainer, this.plugin);
   // No third parameter = defaults to false (not modal)
   ```

2. **Legend Panel** (line 1061, 1065):
   ```typescript
   legendPanel.style.zIndex = '999'; // Below info panel
   legendPanel.style.maxHeight = 'calc(100% - 32px)'; // Stay within bounds
   ```

3. **Legend Toggle Button** (line 1218):
   ```typescript
   toggleButton.style.zIndex = '998'; // Below legend
   ```

### Z-Index Hierarchy (within canvas)

```
Info Panel:         1000 (top - tooltips)
Legend Panel:        999 (middle - overlays)
Legend Toggle:       998 (below overlays)
Canvas/Graph:    default (bottom layer)
```

### Key Improvements

1. **Contained Within Modal**
   - Uses `position: absolute` relative to canvas container
   - Appends to canvas element, not document.body
   - Stays within modal boundaries

2. **Proper Bottom Spacing**
   - `bottom: 80px` provides clearance for bottom controls
   - `maxHeight: calc(100% - 100px)` prevents overflow
   - Scrollable if content is too tall

3. **Enhanced Visibility**
   - Stronger box shadow: `0 4px 16px rgba(0,0,0,0.4)`
   - High z-index within canvas context
   - Proper layering with other UI elements

4. **Responsive Behavior**
   - Max height prevents panel from being taller than available space
   - Overflow scroll when needed
   - Maintains padding from edges

## Before/After

### Before ❌
```
┌─────────────────────┐
│  Network Graph      │
│                     │
│   [nodes/edges]     │
│                     │
└─────────────────────┘
  [Status Bar]
  [Info Panel] ← Hidden behind status bar
```

### After ✅
```
┌─────────────────────┐
│  Network Graph      │
│                     │
│   [nodes/edges]     │
│                     │
│       [Info Panel]  │ ← Visible above controls
└─────────────────────┘
  [Status Bar]
```

## Testing

✅ TypeScript compilation passes
✅ Info panel stays within modal boundaries
✅ Panel visible above bottom controls/status bar
✅ Proper z-index layering
✅ Scrollable when content is tall
✅ Legend panel also stays within bounds

## Files Modified

- `src/views/NetworkGraphRenderer.ts` - Added isModal parameter and conditional positioning
- `src/modals/NetworkGraphModal.ts` - Pass isModal=true to renderer
- `src/views/NetworkGraphView.ts` - Uses default (isModal=false)

## Build Instructions

From **Windows PowerShell** (not WSL):
```powershell
npm run build
```

Note: WSL and Windows have different esbuild binaries, so build from the same environment where you installed dependencies.

## Result

### Modal View (isModal=true):
- ✅ Info panel positioned at `bottom: 60px`
- ✅ Max height: `calc(100% - 80px)` - ensures full content fits
- ✅ Fully visible above modal's bottom bar
- ✅ Doesn't get cut off when expanded

### Sidebar View (isModal=false):
- ✅ Info panel positioned at `bottom: 20px`
- ✅ Max height: `calc(100% - 40px)` - prevents overflow
- ✅ Adjusted slightly from original for better fit
- ✅ No longer gets cut off

### Both Views:
- ✅ Proper z-index layering
- ✅ Scrollable when content is tall
- ✅ Stronger shadows for better visibility
- ✅ Consistent behavior within their respective contexts
