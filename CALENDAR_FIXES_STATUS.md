# Custom Calendar Fixes - Status Update

## ✅ FIXED Bugs

### 🟢 Bug #1: toUnixTimestamp() epoch conversion (CRITICAL)
**Status**: ✅ **FIXED** in commit `0543bd8`

**What was wrong**: Day offsets were treated as Unix-epoch-relative when they're actually custom-calendar-epoch-relative.

**What's fixed**:
- Added `getEpochTimestamp()` method that reads `epochGregorianDate` field
- `toUnixTimestamp()` now correctly converts custom epoch offsets to Unix timestamps
- Proper logging shows which epoch is being used

**Impact**: Custom calendar events now appear at the correct timeline positions! 🎉

---

### 🟢 Bug #2: epochGregorianDate field not used (CRITICAL)
**Status**: ✅ **FIXED** in commit `0543bd8`

**What was wrong**: Calendar type had `epochGregorianDate` field but no code used it.

**What's fixed**: New `getEpochTimestamp()` method reads and uses this field for all conversions.

**Impact**: The anchor between custom calendars and Gregorian timeline now works correctly.

---

### 🟢 Bug #3: Cannot handle historical dates (MEDIUM)
**Status**: ✅ **FIXED** in commit `0543bd8`

**What was wrong**: `calculateDayOffset()` only handled dates after epoch (loop never executed for earlier dates).

**What's fixed**:
- Added conditional logic to count backward for dates before epoch
- Negative offsets now work correctly
- `calculateDateFromOffset()` also supports negative offsets

**Impact**: Can now represent events before the calendar's reference year.

---

### 🟢 Bug #4: fromUnixTimestamp() inconsistency (MEDIUM)
**Status**: ✅ **FIXED** in commit `0543bd8`

**What was wrong**: Used approximation that ignored actual calendar epoch.

**What's fixed**: Now uses same `getEpochTimestamp()` method for consistency.

**Impact**: Timeline axis labels show correct custom calendar dates.

---

## ⚠️ Partially Fixed

### 🟡 Bug #5: Simplified Gregorian calendar in convertCustomToGregorian()
**Status**: ⚠️ **Partially addressed**

**Remaining issue**: The hard-coded Gregorian calendar still doesn't account for variable February length in leap years.

**Why not critical**: This affects the date picker preview, not the timeline positioning. Timeline uses `epochGregorianDate` now.

**Future improvement**: Could use a proper Gregorian calendar library or implement full leap year logic.

---

## 📋 Still TODO

### 🔵 Missing Feature: EventModal UI for custom calendars
**Status**: ❌ **Not implemented**

**What's missing**:
- Calendar selector dropdown in EventModal
- CustomCalendarDatePicker integration
- Auto-calculation of `gregorianDateTime`
- Dual display (custom + Gregorian dates)

**Workaround**: Users can manually edit event YAML files to add:
```yaml
calendarId: "Your Calendar Name"
customCalendarDate:
  year: 1493
  month: Hammer
  day: 15
gregorianDateTime: "1493-01-15"  # Calculate manually for now
```

**Priority**: Medium (quality of life, not blocking)

---

## 🎯 What You Need to Do

### For Existing Calendars: Add epochGregorianDate

All custom calendars **MUST** be updated to include `epochGregorianDate` for correct timeline positioning:

```yaml
---
name: Harptos Calendar
daysPerYear: 365
months:
  - name: Hammer
    days: 30
  - name: Alturiak
    days: 30
  # ... more months ...
referenceDate:
  year: 1
  month: Hammer
  day: 1
# ADD THIS LINE ↓ (what Gregorian date equals your calendar's year 1, month 1, day 1?)
epochGregorianDate: "1492-01-01"
---
```

**How to choose epochGregorianDate**:
1. Decide what Gregorian date corresponds to your calendar's `referenceDate`
2. For fantasy calendars, pick a date that makes sense for your story (e.g., 1492 for D&D Forgotten Realms)
3. Use ISO format: `"YYYY-MM-DD"`

### Validation Warnings

When you open a timeline with a custom calendar, check the browser console (F12):

- ✅ **Green log**: `Using epochGregorianDate for MyCalendar: "1492-01-01"`
- ⚠️  **Orange warning**: `Calendar missing epochGregorianDate. Using approximation.`
- 🔴 **Red error**: `Calendar has no epochGregorianDate or referenceDate. Timeline positioning INCORRECT.`

If you see warnings/errors, update your calendar YAML!

---

## 📊 Before vs After

### Before These Fixes
```
Custom calendar epoch: Year 1492
Event: Year 1493 Hammer 15
Timeline position: January 1971 ❌ (completely wrong!)
Axis labels: "55" instead of month names ❌
```

### After These Fixes
```
Custom calendar epoch: Year 1492
epochGregorianDate: "1492-01-01"
Event: Year 1493 Hammer 15
Timeline position: January 1493 ✅ (correct!)
Axis labels: "Hammer 1493" ✅ (correct!)
```

---

## 🧪 Testing Your Calendar

1. Add `epochGregorianDate` to your calendar YAML
2. Create a test event with a known date
3. Open the timeline view
4. Select your custom calendar from the dropdown
5. Check browser console for validation messages
6. Verify the event appears at the expected position
7. Check axis labels show correct month names and years

---

## 🔗 Related Files

- **CalendarConverter.ts**: Core conversion logic (FIXED)
- **CustomTimeAxis.ts**: Timeline axis formatting (previously fixed)
- **CALENDAR_BUGS_DETAILED.md**: Full bug analysis
- **This file**: Status and migration guide

---

## 📈 Progress Summary

| Bug | Severity | Status |
|-----|----------|--------|
| #1: toUnixTimestamp epoch | CRITICAL | ✅ Fixed |
| #2: epochGregorianDate unused | CRITICAL | ✅ Fixed |
| #3: Historical dates | MEDIUM | ✅ Fixed |
| #4: fromUnixTimestamp | MEDIUM | ✅ Fixed |
| #5: Gregorian calendar | MEDIUM | ⚠️  Partial |
| #6: EventModal UI | MEDIUM | ❌ TODO |

**Overall**: Core timeline positioning bugs are **FIXED**! ✅

The custom calendar system now works correctly for timeline display. The remaining issues are quality-of-life improvements, not blocking bugs.
