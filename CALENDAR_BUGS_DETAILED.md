# Custom Calendar Implementation - Comprehensive Bug Report

## Executive Summary

The custom calendar system has **critical bugs** in date conversion that cause events to appear at incorrect positions on the timeline. The root cause is that `CalendarConverter` doesn't use the `epochGregorianDate` field to anchor custom calendars to the Gregorian/Unix timeline.

---

## Critical Bugs

### 🔴 BUG #1: toUnixTimestamp() doesn't account for custom calendar epoch
**Location**: `src/utils/CalendarConverter.ts:472-479`
**Severity**: CRITICAL
**Status**: ❌ Unfixed

**Problem**:
```typescript
private static toUnixTimestamp(absoluteDate: AbsoluteDate): number {
    const dayMs = absoluteDate.dayOffset * this.MS_PER_GREGORIAN_DAY;
    const totalMs = dayMs + absoluteDate.timeOfDay;
    return totalMs;
}
```

`absoluteDate.dayOffset` is relative to the **custom calendar's epoch**, but this treats it as Unix-epoch-relative.

**Example Failure**:
- Custom calendar epoch: Year 1492 Hammer 1
- Event date: Year 1493 Hammer 1 (1 year after epoch)
- `dayOffset`: 365
- **Wrong**: `365 * MS_PER_DAY = 31,536,000,000ms = Jan 1971`
- **Correct**: Should be Jan 1493!

**Impact**: All custom calendar events appear at completely wrong times (typically in 1970-1971 instead of their actual years).

**Root Cause**: The Calendar type has `epochGregorianDate` field to specify what Gregorian date the custom calendar's epoch corresponds to, but `CalendarConverter` **never uses this field**.

---

### 🔴 BUG #2: Epoch conversion flow is fundamentally broken
**Location**: `src/utils/CalendarConverter.ts:71-106` (convert method)
**Severity**: CRITICAL
**Status**: ❌ Unfixed

**Problem**: The conversion flow:
1. Custom date → `toAbsoluteDate()` → dayOffset (relative to custom epoch)
2. `toUnixTimestamp(absoluteDate)` → **WRONG: treats dayOffset as Unix-relative**
3. Result: Events positioned at (dayOffset * MS_PER_DAY) from Unix epoch

**Should be**:
1. Custom date → dayOffset relative to custom epoch
2. Convert custom epoch to Unix timestamp using `epochGregorianDate`
3. Final timestamp = customEpochTimestamp + (dayOffset * MS_PER_DAY)

---

### 🟡 BUG #3: calculateDayOffset() doesn't handle dates before epoch
**Location**: `src/utils/CalendarConverter.ts:163-165`
**Severity**: MEDIUM
**Status**: ❌ Unfixed

**Problem**:
```typescript
for (let y = epochYear; y < date.year; y++) {
    totalDays += this.getDaysInYear(y, calendar);
}
```

If `date.year < epochYear`, loop doesn't execute. Result: `totalDays = 0` for historical dates.

**Impact**: Cannot represent dates before the calendar's reference year.

---

### 🟡 BUG #4: fromUnixTimestamp() uses approximation instead of exact calculation
**Location**: `src/utils/CalendarConverter.ts:485-511` (my recent "fix")
**Severity**: MEDIUM
**Status**: ⚠️  Partially fixed but still wrong

**Problem**:
```typescript
const yearDiff = unixEpochYear - calendarEpochYear;
const approxDayDiff = yearDiff * (calendar.daysPerYear || 365);
```

This ignores leap years and accumulates error. For a calendar with epoch in year 1500, this is off by ~122 days (1970-1500 = 470 years, ~117 leap years).

---

### 🟡 BUG #5: convertCustomToGregorian() creates incorrect Gregorian calendar
**Location**: `src/utils/CalendarConverter.ts:728-776`
**Severity**: MEDIUM
**Status**: ❌ Unfixed

**Problem**: Creates a Gregorian calendar definition with:
- February always has 28 days
- Leap year rules defined but not actually used in day counting
- Ignores actual historical leap years

**Impact**: Conversion to JavaScript Date is off by accumulated leap days.

---

### 🟠 BUG #6: epochGregorianDate is never used
**Location**: Throughout `CalendarConverter.ts`
**Severity**: HIGH
**Status**: ❌ Unfixed

**Problem**: The Calendar type has `epochGregorianDate?: string` field (line 1336 in types.ts) to specify what Gregorian date corresponds to the custom calendar's epoch, but **no code uses this field**.

**Impact**: Without using this anchor, there's no way to correctly position custom calendar events on a Gregorian timeline.

---

### 🔵 MISSING FEATURE #7: EventModal doesn't support custom calendar dates
**Location**: `src/modals/EventModal.ts`
**Severity**: HIGH
**Status**: ❌ Missing

**Problem**: The EventModal has no UI for:
- Selecting a calendar
- Entering custom calendar dates (year/month/day in custom calendar)
- Viewing Gregorian conversion
- Auto-populating `customCalendarDate` and `gregorianDateTime` fields

**Impact**: Users cannot create custom calendar events through the UI. They must manually edit YAML files.

---

## Comprehensive Fix Strategy

### Phase 1: Fix Core Conversion Logic

#### Fix 1.1: Make toUnixTimestamp() use epochGregorianDate

```typescript
private static toUnixTimestamp(absoluteDate: AbsoluteDate): number {
    const calendar = absoluteDate.calendar;

    // Get the Unix timestamp for the calendar's epoch
    const epochTimestamp = this.getEpochTimestamp(calendar);

    // dayOffset is relative to calendar epoch, so add it to epoch timestamp
    const dayMs = absoluteDate.dayOffset * this.MS_PER_GREGORIAN_DAY;
    return epochTimestamp + dayMs + absoluteDate.timeOfDay;
}

/**
 * Get Unix timestamp for a calendar's epoch
 */
private static getEpochTimestamp(calendar: Calendar): number {
    // Use epochGregorianDate if available
    if (calendar.epochGregorianDate) {
        try {
            const epochDate = new Date(calendar.epochGregorianDate);
            if (!isNaN(epochDate.getTime())) {
                return epochDate.getTime();
            }
        } catch (error) {
            console.warn('Invalid epochGregorianDate:', calendar.epochGregorianDate);
        }
    }

    // Fallback to Unix epoch if not specified
    console.warn(`Calendar "${calendar.name}" missing epochGregorianDate. Defaulting to Unix epoch (1970-01-01). This will likely produce incorrect results.`);
    return 0;
}
```

#### Fix 1.2: Support negative day offsets (dates before epoch)

```typescript
private static calculateDayOffset(date: CalendarDate, calendar: Calendar): number {
    const epochYear = calendar.referenceDate?.year || 0;
    let totalDays = 0;

    if (date.year >= epochYear) {
        // Date is at or after epoch - count forward
        for (let y = epochYear; y < date.year; y++) {
            totalDays += this.getDaysInYear(y, calendar);
        }
    } else {
        // Date is before epoch - count backward (negative offset)
        for (let y = epochYear - 1; y >= date.year; y--) {
            totalDays -= this.getDaysInYear(y, calendar);
        }
    }

    // Add days for months in the current year
    if (typeof date.month === 'number' && date.month > 0) {
        for (let m = 1; m < date.month; m++) {
            totalDays += this.getDaysInMonth(m, date.year, calendar);
        }
    } else if (typeof date.month === 'string' && calendar.months) {
        const monthIndex = calendar.months.findIndex(m => m.name === date.month);
        if (monthIndex >= 0) {
            for (let m = 0; m < monthIndex; m++) {
                totalDays += calendar.months[m].days;
            }
        }
    }

    // Add days in the current month
    if (date.day > 0) {
        totalDays += date.day - 1; // -1 because day 1 is the first day
    }

    return totalDays;
}
```

#### Fix 1.3: Fix fromUnixTimestamp() to use exact calculation

```typescript
static fromUnixTimestamp(timestamp: number, calendar: Calendar): CalendarDate {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
        console.error('CalendarConverter: Invalid timestamp:', timestamp);
        return { year: 0, month: 0, day: 0 };
    }

    // Get the timestamp of the calendar's epoch
    const epochTimestamp = this.getEpochTimestamp(calendar);

    // Calculate day offset from calendar's epoch
    const msSinceEpoch = timestamp - epochTimestamp;
    const dayOffset = Math.floor(msSinceEpoch / this.MS_PER_GREGORIAN_DAY);
    const timeOfDay = msSinceEpoch % this.MS_PER_GREGORIAN_DAY;

    return this.calculateDateFromOffset(dayOffset, calendar, timeOfDay);
}
```

---

### Phase 2: Enhanced Validation

Update `validateCalendar()` to check for `epochGregorianDate`:

```typescript
static validateCalendar(calendar: Calendar): string[] {
    const warnings: string[] = [];

    // ... existing validations ...

    if (!calendar.epochGregorianDate) {
        warnings.push('Calendar is missing epochGregorianDate - timeline positioning will be incorrect. Please specify the Gregorian date that corresponds to this calendar\'s epoch.');
    } else {
        // Validate it's a parseable date
        const testDate = new Date(calendar.epochGregorianDate);
        if (isNaN(testDate.getTime())) {
            warnings.push(`Calendar has invalid epochGregorianDate: "${calendar.epochGregorianDate}". Must be a valid ISO date string (e.g., "1492-01-01").`);
        }
    }

    return warnings;
}
```

---

### Phase 3: UI Integration (Optional Enhancement)

Add custom calendar support to EventModal:
1. Add calendar selector dropdown
2. Add CustomCalendarDatePicker integration
3. Auto-calculate `gregorianDateTime` when custom date is entered
4. Show dual display (custom calendar date + Gregorian equivalent)

---

## Testing Requirements

### Unit Tests Needed:

1. **Basic conversion**: Custom calendar date → Unix timestamp → back to custom date
2. **Epoch anchoring**: Verify events appear at correct times when epoch is far from 1970
3. **Negative offsets**: Dates before calendar epoch
4. **Leap years**: Ensure accuracy over long time periods
5. **Month edge cases**: Last day of month, first day of month
6. **Multiple calendars**: Convert between two custom calendars

### Test Data:

```yaml
---
name: Test Calendar
daysPerYear: 360
months:
  - name: Month1
    days: 30
  - name: Month2
    days: 30
  # ... 10 more months of 30 days each
referenceDate:
  year: 1
  month: Month1
  day: 1
epochGregorianDate: "1492-01-01"  # ← Critical field!
---
```

---

## Migration Guide

### For Users:

All existing custom calendars MUST be updated to include `epochGregorianDate`:

```yaml
---
name: My Calendar
# ... other fields ...
referenceDate:
  year: 1
  month: Hammer
  day: 1
# ADD THIS LINE - what Gregorian date does your calendar's epoch correspond to?
epochGregorianDate: "1492-01-01"
---
```

### For Developers:

1. Update all calendar creation code to require `epochGregorianDate`
2. Add migration tool to help users add this field to existing calendars
3. Show clear error message when calendar lacks this field

---

## Priority

1. **Immediate**: Fix #1 (toUnixTimestamp) - This breaks all custom calendar timelines
2. **High**: Fix #2 (epoch conversion flow) - Same root cause as #1
3. **High**: Fix #6 (use epochGregorianDate) - Required for #1 and #2
4. **Medium**: Fix #3 (negative dates) - Needed for historical calendars
5. **Medium**: Fix #4 (exact calculations) - Needed for accuracy
6. **Low**: Fix #7 (UI integration) - Quality of life, not blocking

---

## Estimated Impact

Without these fixes:
- ❌ Custom calendar events appear at wrong times (usually 1970-1971)
- ❌ Timeline axis shows "55" instead of proper month names (partially fixed)
- ❌ Cannot represent historical dates before calendar epoch
- ❌ Users must manually edit YAML (no UI support)

With these fixes:
- ✅ Custom calendar events appear at correct Gregorian timeline positions
- ✅ Timeline axis shows proper custom calendar dates
- ✅ Support for dates before calendar epoch
- ✅ Accurate conversions over long time periods
- ✅ (Optional) UI support for custom calendar date entry
