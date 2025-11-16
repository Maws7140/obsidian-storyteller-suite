# Investigation: CustomTimeAxis Date Type Errors & Calendar Reference Issues

## Overview

This investigation examines two related error patterns in the Storyteller Suite custom calendar timeline system:

1. **CustomTimeAxis**: `Received unexpected type for date: object`
2. **CalendarConverter**: `Calendar has no epochGregorianDate or referenceDate. Defaulting to Unix epoch (1970-01-01). Timeline positioning will be INCORRECT.`

---

## Issue 1: CustomTimeAxis Date Type Validation Error

### Location
**File**: `/home/user/obsidian-storyteller-suite/src/utils/CustomTimeAxis.ts`
**Lines**: 300-325 (createFormatFunction method)
**Error Line**: 320

### What's Happening

The `createFormatFunction` method is the format function passed to vis-timeline for axis label rendering:

```typescript
static createFormatFunction(calendar: Calendar) {
    return (date: Date | number | undefined, scale: string, step: number) => {
        let timestamp: number;

        if (date == null) {
            console.warn('CustomTimeAxis: Received null/undefined date, using current time');
            timestamp = Date.now();
        } else if (typeof date === 'number') {
            timestamp = date;
        } else if (date instanceof Date) {
            timestamp = date.getTime();
            if (isNaN(timestamp)) {
                console.warn('CustomTimeAxis: Received invalid Date object, using current time');
                timestamp = Date.now();
            }
        } else {
            // Unknown type - try to coerce to number
            console.warn('CustomTimeAxis: Received unexpected type for date:', typeof date, date);
            timestamp = Date.now();  // ← Falls back to current time
        }
        
        // ... rest of formatting logic
    };
}
```

### Expected vs. Actual

**Expected types from vis-timeline**:
- `Date` object (JavaScript Date)
- `number` (Unix timestamp in milliseconds)
- `null` or `undefined`

**Actual types being received** (causing the warning):
- `object` (some other type of object, not a Date)
- Likely: Plain objects, custom date objects, or dates from vis-timeline's internal date handling

### Why This Happens

Vis-timeline can pass various date formats depending on:
1. **Timeline configuration** - Different rendering modes may use different date formats
2. **Item data format** - If timeline items use custom date objects instead of JavaScript Dates
3. **Browser compatibility** - Different JavaScript engines may handle dates differently
4. **Vis-timeline version** - The library may internally convert dates to other formats

### The Fallback Behavior

When an unexpected type is detected, the code **falls back to `Date.now()`**:
- This causes axis labels to show **current time** instead of the intended timeline scale
- The event positioning remains correct (handled elsewhere)
- Only the axis labels are affected

### Code Flow for Axis Labels

1. TimelineRenderer calls `CustomTimeAxis.createFormatFunction(calendar)` during initialization
2. This returns a function that vis-timeline calls repeatedly for each axis position
3. Vis-timeline passes the timestamp for that axis position
4. If the timestamp arrives as an unexpected type, it logs a warning and uses current time

---

## Issue 2: Calendar Reference Date & epochGregorianDate Issues

### Location
**Files**:
- `/home/user/obsidian-storyteller-suite/src/utils/CalendarConverter.ts`
- `/home/user/obsidian-storyteller-suite/src/types.ts` (Calendar interface definition)

**Key Methods**:
- `getEpochTimestamp()` - lines 505-535
- `toUnixTimestamp()` - lines 488-499
- `validateCalendar()` - lines 679-731

### What's Happening

The error message appears when:

```typescript
// CalendarConverter.ts, line 533
console.error(`[CalendarConverter] Calendar "${calendar.name}" has no epochGregorianDate or referenceDate. 
              Defaulting to Unix epoch (1970-01-01). Timeline positioning will be INCORRECT.`);
```

This occurs in the `getEpochTimestamp()` method, which is responsible for finding the Unix timestamp equivalent of a custom calendar's epoch:

```typescript
private static getEpochTimestamp(calendar: Calendar): number {
    // Prefer epochGregorianDate if available (most accurate)
    if (calendar.epochGregorianDate) {
        try {
            const epochDate = new Date(calendar.epochGregorianDate);
            if (!isNaN(epochDate.getTime())) {
                return epochDate.getTime();  // ← Returns correct Unix timestamp
            }
        } catch (error) {
            console.warn(`[CalendarConverter] Error parsing epochGregorianDate...`);
        }
    }

    // Fallback: use referenceDate year with approximation
    if (calendar.referenceDate && calendar.referenceDate.year) {
        const refYear = calendar.referenceDate.year;
        console.warn(`[CalendarConverter] Calendar missing epochGregorianDate...`);
        const yearDiff = refYear - 1970;
        return yearDiff * 365.25 * this.MS_PER_GREGORIAN_DAY;  // ← Approximate
    }

    // Last resort: assume Unix epoch
    console.error(`[CalendarConverter] Calendar has no epochGregorianDate or referenceDate...`);
    return 0;  // ← Returns Unix epoch (1970-01-01)
}
```

### The Three Fallback Levels

#### Level 1: Using epochGregorianDate (CORRECT)
- **Requirement**: Calendar must have `epochGregorianDate` field set to a valid ISO date string
- **Example**: `epochGregorianDate: "1492-01-01"`
- **Result**: Accurate timeline positioning
- **Status**: Works correctly when field is present

#### Level 2: Using referenceDate.year (APPROXIMATE)
- **Requirement**: Calendar has `referenceDate.year` but no `epochGregorianDate`
- **Logic**: Calculates approximate year difference from 1970
- **Accuracy**: Off by ~117 leap days for calendars with epoch far from 1970
- **Result**: Events positioned roughly correctly but with cumulative error
- **Status**: Logs warning, works partially

#### Level 3: Default to Unix Epoch (INCORRECT)
- **Requirement**: Calendar missing both `epochGregorianDate` AND `referenceDate`
- **Result**: Events positioned at 1970 instead of correct year (CRITICAL ERROR)
- **Status**: Logs error, timeline "positioning will be INCORRECT"

### Calendar Type Definition

From `src/types.ts` (lines 1274-1385), the Calendar interface requires:

**REQUIRED for correct positioning**:
```typescript
interface Calendar {
    name: string;
    daysPerYear?: number;
    months?: CalendarMonth[];
    referenceDate?: CalendarDate;        // Year 1, Month 1, Day 1 of your calendar
    
    // CRITICAL: This field MUST be set for accurate timeline positioning
    epochGregorianDate?: string;         // What Gregorian date = your calendar's epoch?
                                         // Format: "YYYY-MM-DD" (e.g., "1492-01-01")
}

interface CalendarDate {
    year: number;
    month: string | number;
    day: number;
    time?: string;
}
```

### Current Validation Logic

The `validateCalendar()` method checks for these issues and returns warning messages:

```typescript
static validateCalendar(calendar: Calendar): string[] {
    const warnings: string[] = [];

    // Checks if referenceDate exists and has year/month/day
    if (!calendar.referenceDate) {
        warnings.push('Calendar is missing referenceDate - timeline display may be incorrect');
    }

    // CRITICAL: Checks for epochGregorianDate
    if (!calendar.epochGregorianDate) {
        warnings.push('⚠️  CRITICAL: Calendar is missing epochGregorianDate. ' +
                     'Timeline positioning will be INCORRECT. ' +
                     'Add epochGregorianDate (e.g., "1492-01-01") to specify ' +
                     'what Gregorian date corresponds to your calendar\'s epoch.');
    }

    return warnings;
}
```

### How Calendars Are Loaded

From `src/main.ts`, the `listCalendars()` method:

```typescript
async listCalendars(): Promise<Calendar[]> {
    await this.ensureCalendarFolder();
    const folderPath = this.getEntityFolder('calendar');
    const allFiles = this.app.vault.getMarkdownFiles();
    const files = allFiles.filter(f => f.path.startsWith(folderPath + '/'));
    
    const calendars: Calendar[] = [];
    for (const file of files) {
        // Parses YAML frontmatter from markdown file
        const data = await this.parseFile<Calendar>(file, { name: '' }, 'calendar');
        if (data) calendars.push(data);
    }
    
    return calendars.sort((a, b) => a.name.localeCompare(b.name));
}
```

**Key Point**: Calendars are loaded directly from markdown files in the vault. If a calendar file's YAML frontmatter doesn't include `epochGregorianDate`, the field will be `undefined`.

### Where the Error Gets Logged

The error/warning about missing `epochGregorianDate` appears when:

1. **During Timeline Initialization** (TimelineRenderer.ts, line 396-403):
   ```typescript
   if (selectedCalendar) {
       const formatFunction = CustomTimeAxis.createFormatFunction(selectedCalendar);
       timelineOptions.format = {
           minorLabels: formatFunction,
           majorLabels: formatFunction
       };
   }
   ```

2. **During Axis Application** (CustomTimeAxis.ts, line 415):
   ```typescript
   const warnings = CalendarConverter.validateCalendar(calendar);
   if (warnings.length > 0) {
       console.warn('[CustomTimeAxis] Calendar validation warnings:', warnings);
   }
   ```

3. **During Date Conversion** (CalendarConverter.ts, line 505+):
   ```typescript
   const epochTimestamp = this.getEpochTimestamp(calendar);
   // This method logs the error if epochGregorianDate is missing
   ```

---

## Data Flow Diagram

### Correct Flow (with epochGregorianDate):
```
Calendar YAML File
    ↓
    ├─ name: "My Calendar"
    ├─ months: [...]
    ├─ referenceDate: {year: 1, month: 1, day: 1}
    └─ epochGregorianDate: "1492-01-01"  ← CRITICAL FIELD
         ↓
    listCalendars() loads all calendars
         ↓
    TimelineRenderer.setCalendar(calendarId)
         ↓
    CustomTimeAxis.createFormatFunction(calendar)
         ↓
    CalendarConverter.getEpochTimestamp(calendar)
         ├─ Reads epochGregorianDate
         ├─ Converts to Unix timestamp: 707,745,600,000 ms
         └─ Returns accurate epoch timestamp
         ↓
    toUnixTimestamp() for each event
         ├─ Event: Year 1493, Month 1, Day 1
         ├─ dayOffset: 365 days from epoch
         └─ timestamp = 707,745,600,000 + (365 * 86,400,000)
            = 739,281,600,000 ms = January 1493
         ↓
    Timeline displays event at correct position!
```

### Incorrect Flow (without epochGregorianDate):
```
Calendar YAML File
    ↓
    ├─ name: "Cal 11"
    ├─ months: [...]
    ├─ referenceDate: {year: 1, month: 1, day: 1}
    └─ epochGregorianDate: [MISSING]
         ↓
    listCalendars() loads calendar with undefined epochGregorianDate
         ↓
    CalendarConverter.getEpochTimestamp(calendar)
         ├─ Check epochGregorianDate → undefined
         ├─ Check referenceDate → found
         ├─ Use approximation: (1 - 1970) * 365.25 * MS_PER_DAY
         └─ Return: -30,682,320,000,000 ms (very wrong!)
                    OR if both missing → 0 (Unix epoch)
         ↓
    toUnixTimestamp() for each event
         ├─ Event: Year 1493, Month 1, Day 1
         ├─ dayOffset: 1 (just first day)
         └─ timestamp = 0 + (1 * 86,400,000)
            = 86,400,000 ms = January 1, 1970!
         ↓
    Timeline displays event at wrong position (1970)
    Axis shows: [Error logged]
```

---

## Recent Fixes Applied

According to `CALENDAR_FIXES_STATUS.md`, critical bugs were fixed in commit `0543bd8`:

### ✅ Fixed Issues:

1. **toUnixTimestamp() now uses epochGregorianDate**
   - Previously: Treated dayOffset as Unix-epoch-relative
   - Now: Adds dayOffset to calendar's epoch timestamp

2. **getEpochTimestamp() method added**
   - New method that properly reads `epochGregorianDate` field
   - Falls back to referenceDate year with warning
   - Falls back to Unix epoch (1970) with error

3. **Support for historical dates**
   - calculateDayOffset() now handles dates before epoch
   - Supports negative day offsets

4. **Validation warnings added**
   - validateCalendar() checks for epochGregorianDate
   - Logs CRITICAL warning if missing

### ⚠️ Remaining Issues:

1. **No EventModal UI for custom calendars**
   - Users must manually edit YAML to add epochGregorianDate
   - No calendar selector in event creation UI

2. **Calendar loading doesn't enforce epochGregorianDate**
   - Calendars can be loaded without this critical field
   - Error only appears when timeline is opened

3. **Date type validation in CustomTimeAxis**
   - Unknown date types fall back to current time
   - This is more of a graceful degradation than a bug

---

## Expected Calendar YAML Structure

A properly configured custom calendar should include:

```yaml
---
name: "Harptos Calendar"
daysPerYear: 365
daysPerWeek: 7

months:
  - name: "Hammer"
    days: 30
  - name: "Alturiak"
    days: 30
  # ... 10 more months ...

referenceDate:
  year: 1492
  month: "Hammer"
  day: 1

# CRITICAL: Must specify what Gregorian date = your calendar's epoch
epochGregorianDate: "1492-01-01"

# Optional: Helpful for context
description: |
  The Harptos calendar used in the Forgotten Realms...
---
```

---

## Root Causes Summary

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| **CustomTimeAxis "unexpected type"** | Vis-timeline passes date in unexpected format (object instead of Date/number) | Axis labels show current time instead of correct scale |
| **Calendar missing epochGregorianDate** | Calendar YAML files don't include this field | Events positioned at 1970 instead of correct year |
| **Calendar missing referenceDate** | Calendar YAML files don't include epoch definition | Fallback to year 0, compound errors |
| **No EventModal UI** | Feature not implemented | Users must manually edit YAML files |
| **No migration tool** | Tool not built | Users must manually add epochGregorianDate to existing calendars |

---

## What's Expected vs. What's Being Received

### CustomTimeAxis Format Function

**Expected**:
- `date: Date` - JavaScript Date object
- `date: number` - Unix timestamp in milliseconds  
- `date: null | undefined` - No date

**Being Received**:
- `date: object` - Some other object type (needs investigation)
- Log message: `CustomTimeAxis: Received unexpected type for date: object [object Object]`

### Calendar Configuration

**Expected**:
```typescript
{
    name: string;
    daysPerYear: number;
    months: CalendarMonth[];
    referenceDate: CalendarDate;           // ← Must have
    epochGregorianDate: "YYYY-MM-DD";     // ← CRITICAL, currently missing
}
```

**Being Received** (causing errors):
```typescript
{
    name: string;
    daysPerYear: number;
    months: CalendarMonth[];
    referenceDate: CalendarDate;           // Present
    epochGregorianDate: undefined;        // ← MISSING
}
```

**Result**: Falls back to Unix epoch (1970-01-01) for timeline positioning.

---

## Validation & Logging

### When Warnings Appear

1. **Browser Console**: F12 → Console tab
2. **Timing**: When timeline is opened and calendar is selected
3. **Format**:
   ```
   ✅ [CalendarConverter] Using epochGregorianDate for MyCalendar: "1492-01-01" → 707745600000
   ⚠️  [CalendarConverter] Calendar "Cal 11" missing epochGregorianDate. Using approximation...
   🔴 [CalendarConverter] Calendar "Cal 11" has no epochGregorianDate or referenceDate...
   ```

### Validation Check Output

When CustomTimeAxis.applyToTimeline() is called:

```typescript
const warnings = CalendarConverter.validateCalendar(calendar);
if (warnings.length > 0) {
    console.warn('[CustomTimeAxis] Calendar validation warnings:', warnings);
    console.warn('[CustomTimeAxis] Calendar name:', calendar.name);
    console.warn('[CustomTimeAxis] These issues may cause incorrect date display...');
}
```

Expected warnings for calendar without epochGregorianDate:
```
[CustomTimeAxis] Calendar validation warnings: [
    "⚠️  CRITICAL: Calendar is missing epochGregorianDate...",
    "Calendar referenceDate is missing month",  // if referenceDate incomplete
    ...
]
```

