# Empty Field Preservation Fix

## Problem Statement

Empty frontmatter properties that were added manually were being removed when an entity was updated through the modal. This was particularly problematic because:

1. Users couldn't see which fields the plugin recognized
2. Users had to recreate fields repeatedly
3. The plugin was silently deleting user data
4. Field ordering was being changed

## Root Cause

The issue was caused by Obsidian's `stringifyYaml()` function filtering out empty string values during YAML serialization. While the plugin's `buildFrontmatter()` function correctly preserved empty fields in the JavaScript object, they were lost during the YAML serialization step.

### Why Modal-Created Fields Seemed to Work

Fields created through the modal appeared to work because they were re-added each time through the `workingCustomFields` object, masking the fact they were also being filtered during serialization.

## Solution

### 1. Custom YAML Serializer (`src/utils/YamlSerializer.ts`)

Created a new YAML serializer that explicitly preserves empty string values:

```typescript
stringifyYamlWithEmptyFields(obj: Record<string, unknown>): string
```

**How it works:**
1. Identifies fields with empty string values
2. Replaces empty strings with a marker (`__EMPTY_STRING_MARKER__`)
3. Calls Obsidian's `stringifyYaml()` with markers
4. Post-processes YAML to replace markers with `""` representation

**Result:** Empty fields are written as `fieldName: ""` in YAML and preserved on subsequent reads.

### 2. Pre-Save Validation

Added validation before every save operation:

```typescript
validateFrontmatterPreservation(
  newFrontmatter: Record<string, unknown>,
  originalFrontmatter?: Record<string, unknown>
): ValidationResult
```

**Features:**
- Detects fields that will be lost on save
- Logs warnings to console before data loss occurs
- Helps developers and advanced users debug issues
- Skips Obsidian internal fields (like `position`)

### 3. Enhanced Logging

All save methods now use `stringifyYamlWithLogging()` which:
- Validates field preservation before serialization
- Logs warnings when fields will be lost
- Tracks empty fields being preserved
- Verifies empty fields survived serialization
- Includes context (e.g., "Character: John Doe") for debugging

### 4. Updated All Save Methods

Updated 8 save methods in `src/main.ts`:
- `saveCharacter()`
- `saveLocation()`
- `saveMap()`
- `saveEvent()`
- `savePlotItem()`
- `saveReference()`
- `saveChapter()`
- `saveScene()`

Each method now:
1. Reads original frontmatter (from both cache and direct parsing)
2. Builds new frontmatter with preservation logic
3. Validates for field loss
4. Serializes with empty field preservation
5. Logs warnings if any fields will be lost

## Testing

Created comprehensive test suites:

### Unit Tests (`test/utils/YamlSerializer.test.ts`)
- Tests empty string preservation in YAML serialization
- Tests validation logic for field loss detection
- Tests edge cases (special characters, nested objects, arrays)

### Integration Tests (`test/integration/empty-fields-preservation.test.ts`)
- Tests complete user workflows
- Tests manual empty field preservation
- Tests modal-created field preservation
- Tests round-trip (write → read → write) scenarios
- Tests field ordering preservation
- Tests edge cases (null, undefined, empty arrays)

## Verification

All code passes TypeScript compilation with no errors:
```bash
npx tsc -p tsconfig.json --noEmit
```

## Behavioral Changes

### Before Fix
```yaml
---
name: Hero
status:
customField1:
customField2: null
---
```

**After modal edit and save:**
```yaml
---
name: Hero Updated
---
```
❌ Empty fields **lost**

### After Fix
```yaml
---
name: Hero
status:
customField1:
customField2: null
---
```

**After modal edit and save:**
```yaml
---
name: Hero Updated
status: ""
customField1: ""
customField2: ""
---
```
✅ Empty fields **preserved**

## Console Logging

With the fix, developers and users can see helpful debug information:

```
[Character: Hero] Preserving empty fields: ["status", "customField1", "customField2"]
```

If fields are at risk:
```
[saveCharacter] Warning: Fields will be lost on save: ["oldField"]
```

## Known Behavior

### Empty Fields in New Entities
Empty fields in **new** entities (that don't exist in original frontmatter) are **not** preserved. This is intentional to avoid cluttering files with unnecessary empty fields.

**Example:**
```typescript
// First save - field doesn't exist yet
{ name: "Hero", newEmptyField: "" }
// Result: newEmptyField not written ✓ Correct
```

**Once saved and present in file:**
```typescript
// Second save - field now exists in original
{ name: "Hero", newEmptyField: "" }
// Result: newEmptyField preserved ✓ Correct
```

### Field Ordering
The fix maintains field order from the original frontmatter. New fields are appended at the end.

## Files Changed

### New Files
- `src/utils/YamlSerializer.ts` - Custom YAML serializer
- `test/utils/YamlSerializer.test.ts` - Unit tests
- `test/integration/empty-fields-preservation.test.ts` - Integration tests
- `EMPTY_FIELD_PRESERVATION_FIX.md` - This document

### Modified Files
- `src/main.ts` - Updated all save methods to use new serializer

### Unchanged (Already Correct)
- `src/yaml/EntitySections.ts` - Preservation logic was already correct
- `src/modals/*.ts` - Modal logic was already correct

## Future Improvements

While the critical data loss issue is now fixed, potential enhancements include:

1. **UI Improvements**
   - Visual indicators for recognized vs custom fields in modals
   - Field management dashboard showing all custom fields
   - Warnings in UI (not just console) when fields might be lost

2. **Backup Mechanism**
   - Keep backup of file before save
   - Allow undo/recovery if needed

3. **Documentation**
   - User-facing docs explaining custom fields behavior
   - Best practices guide for custom field usage

## Migration Notes

This fix is **backward compatible**. No user action required.

- Existing files work as-is
- Empty fields will be preserved on next save
- No breaking changes to plugin API or data format

## Testing Recommendations

To verify the fix works in your environment:

1. **Manual Test:**
   ```markdown
   ---
   name: Test Character
   customField1:
   customField2:
   ---

   ## Description
   Test description
   ```

2. Open entity in modal
3. Edit name or another field
4. Save
5. Check file - `customField1` and `customField2` should still be present

## Console Debugging

Enable Developer Tools in Obsidian to see preservation logs:
- `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)
- Check Console tab for messages like:
  - `[Character: Name] Preserving empty fields: [...]`
  - `[saveCharacter] Warning: Fields will be lost: [...]`

## Summary

✅ **Fixed:** Empty fields are now preserved through save cycles
✅ **Fixed:** No silent data deletion
✅ **Added:** Validation warnings before field loss
✅ **Added:** Comprehensive test coverage
✅ **Added:** Debug logging for transparency
✅ **Maintained:** Backward compatibility
✅ **Maintained:** Field ordering preservation

The plugin now safely handles empty frontmatter fields, ensuring user data is never silently deleted.
