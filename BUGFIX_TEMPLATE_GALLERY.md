# 🐛 Bug Fixes - Template Gallery

## Issues Identified

You reported two critical errors in the console:

### **Error 1: `prompt() is not supported`**
```
Uncaught Error: prompt() is not supported.
    at window.prompt (node:electron/js2c/renderer_init:2:29989)
    at h1.selectTemplate (plugin:storyteller-suite:1765:196700)
```

**Cause**: Electron (which Obsidian runs on) doesn't support native `window.prompt()`. The template gallery was using `prompt()` to ask for the map name.

### **Error 2: `Cannot read properties of undefined (reading 'Event')`**
```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'Event')
    at hs.setupEventHandlers (plugin:storyteller-suite:1765:256258)
    at hs.initMap (plugin:storyteller-suite:1765:255666)
```

**Cause**: MapEditor was trying to access `L.Draw.Event` even when Leaflet Draw wasn't available or in read-only mode.

---

## Fixes Applied

### **Fix 1: Replace prompt() with PromptModal** ✅

**File**: `src/modals/TemplateGalleryModal.ts`

**Changed**:
```typescript
// BEFORE - Using native prompt (doesn't work in Electron)
private selectTemplate(template: MapTemplate): void {
    this.close();
    const mapName = prompt('Enter a name for your new map:', `My ${template.name}`);
    if (mapName && mapName.trim()) {
        this.onSelect(template, mapName.trim());
    }
}
```

**To**:
```typescript
// AFTER - Using PromptModal (works in Obsidian)
private selectTemplate(template: MapTemplate): void {
    this.close();

    // Prompt for map name using PromptModal
    new PromptModal(this.app, {
        title: 'Name Your Map',
        label: 'Map Name',
        defaultValue: `My ${template.name}`,
        validator: (value) => {
            if (!value || !value.trim()) {
                return 'Map name cannot be empty';
            }
            return null;
        },
        onSubmit: (mapName) => {
            this.onSelect(template, mapName.trim());
        }
    }).open();
}
```

**Benefits**:
- ✅ Works in Obsidian/Electron environment
- ✅ Better validation (can't submit empty name)
- ✅ Consistent with rest of plugin UI
- ✅ More professional appearance
- ✅ Keyboard support (Enter to submit, Escape to cancel)

---

### **Fix 2: Conditional Draw Event Handlers** ✅

**File**: `src/components/MapEditor.ts`

**Changed**:
```typescript
// BEFORE - Always trying to access L.Draw.Event
private setupEventHandlers(): void {
    if (!this.map) return;

    // Drawing created
    this.map.on(L.Draw.Event.CREATED, (event: any) => {
        // ... handler code
    });

    // Drawing edited
    this.map.on(L.Draw.Event.EDITED, (event: any) => {
        // ... handler code
    });

    // Drawing deleted
    this.map.on(L.Draw.Event.DELETED, (event: any) => {
        // ... handler code
    });

    // Map moved or zoomed
    this.map.on('moveend zoomend', () => {
        this.updateMarkerVisibility();
        this.notifyChange();
    });
}
```

**To**:
```typescript
// AFTER - Only access L.Draw when available and not read-only
private setupEventHandlers(): void {
    if (!this.map) return;

    // Only setup draw event handlers if not in read-only mode and L.Draw is available
    if (!this.readOnly && typeof L.Draw !== 'undefined' && L.Draw.Event) {
        // Drawing created
        this.map.on(L.Draw.Event.CREATED, (event: any) => {
            const layer = event.layer;
            this.drawnItems.addLayer(layer);
            this.saveToUndoStack();
            this.notifyChange();
        });

        // Drawing edited
        this.map.on(L.Draw.Event.EDITED, (event: any) => {
            this.saveToUndoStack();
            this.notifyChange();
        });

        // Drawing deleted
        this.map.on(L.Draw.Event.DELETED, (event: any) => {
            this.saveToUndoStack();
            this.notifyChange();
        });
    }

    // Map moved or zoomed (always setup, even in read-only)
    this.map.on('moveend zoomend', () => {
        this.updateMarkerVisibility();
        if (!this.readOnly) {
            this.notifyChange();
        }
    });
}
```

**Benefits**:
- ✅ No longer crashes when L.Draw isn't available
- ✅ Works in read-only mode (map viewer)
- ✅ Safer with explicit type checking
- ✅ Better separation of concerns (drawing vs viewing)
- ✅ Still updates marker visibility on zoom/move

---

## Testing

Both fixes have been:
- ✅ Implemented
- ✅ Built successfully (TypeScript compilation: 0 errors)
- ✅ Ready for testing in Obsidian

---

## How to Test

### **Test Fix 1: Template Name Prompt**
1. Reload Obsidian (`Ctrl+R`)
2. Press `Ctrl+P`
3. Type "Create new map"
4. Click any template
5. **Expected**: Professional modal appears with:
   - Title: "Name Your Map"
   - Input field with default name
   - "OK" and "Cancel" buttons
   - Validation (can't submit empty name)
6. Enter a name and press Enter or click OK
7. MapModal should open with template applied

### **Test Fix 2: Map Editor Initialization**
1. Create a new map using template gallery
2. **Expected**: No console errors
3. Switch to "Map Editor" tab
4. **Expected**: Map loads without errors
5. Try adding markers
6. **Expected**: Everything works smoothly

### **Test Read-Only Mode**
1. Open dashboard (`Ctrl+P` → "Open dashboard")
2. Click "View Maps"
3. Click any existing map
4. **Expected**: Map viewer opens without errors
5. Zoom and pan around
6. **Expected**: No console errors about L.Draw.Event

---

## Technical Details

### **Why prompt() doesn't work in Obsidian**

Obsidian runs on Electron, which disables `window.prompt()`, `window.alert()`, and `window.confirm()` for security and UX reasons. These blocking dialogs:
- Block the entire renderer process
- Can't be styled to match Obsidian's theme
- Don't support validation
- Have poor accessibility

Obsidian provides its own Modal API which is:
- Non-blocking (async)
- Themeable
- Supports validation
- Better UX
- Keyboard-friendly

### **Why L.Draw.Event check is needed**

The MapEditor is used in two contexts:
1. **Edit mode** (MapModal) - Full editing with drawing tools
2. **View mode** (MapViewerModal) - Read-only display

In view mode:
- `readOnly` flag is true
- Drawing controls aren't initialized
- `L.Draw` might not be fully loaded
- Trying to access `L.Draw.Event` causes undefined error

The fix checks:
1. `!this.readOnly` - Are we in edit mode?
2. `typeof L.Draw !== 'undefined'` - Is the library loaded?
3. `L.Draw.Event` - Does the Event object exist?

Only if all three are true, we set up draw event handlers.

---

## Files Modified

1. `src/modals/TemplateGalleryModal.ts`
   - Added import: `PromptModal`
   - Updated `selectTemplate()` method

2. `src/components/MapEditor.ts`
   - Updated `setupEventHandlers()` method
   - Added conditional checks for `L.Draw`

---

## Build Status

✅ **TypeScript Compilation**: Success (0 errors)
✅ **ESBuild**: Success (main.js generated)
✅ **Ready to Deploy**: Yes

---

## Next Steps

1. **Reload Obsidian** to load the fixed build
2. **Test the template gallery** - should work perfectly now
3. **Verify no console errors** - check DevTools console
4. **Create some maps** - use different templates
5. **Report any other issues** - we'll fix them immediately!

---

## Summary

Both critical bugs have been fixed:
- ✅ Template name prompt now uses PromptModal instead of native prompt()
- ✅ MapEditor safely handles missing L.Draw in read-only mode

**Status**: 🎉 **FIXED & READY TO USE**

**Date**: November 3, 2025
**Build**: Successful
**Errors**: 0
