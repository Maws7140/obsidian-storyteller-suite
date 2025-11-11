# Bug Fix: Custom Calendar Event Filtering

## Issue Description

**Problem:** When switching to a custom calendar in the Timeline view, the timeline would show the custom calendar axis labels (e.g., "kinn" for a month from "Cal 11") but **no events would appear**, or events from other calendars would incorrectly appear.

**Screenshot Evidence:** Timeline showing only custom calendar axis ("kinn") with no visible events.

## Root Cause

The `shouldIncludeEvent()` method in `TimelineRenderer.ts` did not implement calendar-based filtering. According to the Level 3 Custom Calendar documentation:

- ✅ Phase 9: Custom Time Axis - **Implemented**
- ❌ Phase 11: Multi-Calendar Event Filtering - **Not Implemented** (marked as "🚧 Framework Ready")

When a custom calendar was selected:
1. ✅ The axis correctly changed to show custom calendar month names
2. ❌ Events were not filtered by calendar
3. ❌ Events without the selected `calendarId` were still processed
4. ❌ Events may have failed to render due to missing date conversions

## Solution

### Implementation

Added calendar filtering logic to `shouldIncludeEvent()` method in `src/utils/TimelineRenderer.ts`:

```typescript
private shouldIncludeEvent(evt: Event): boolean {
    // Calendar filter (Level 3 feature)
    // When a calendar is selected, filter events by calendar
    if (this.selectedCalendarId) {
        // If calendar is selected, show events that:
        // 1. Have matching calendarId
        // 2. OR have a valid gregorianDateTime (can be converted to selected calendar)
        // 3. OR have NO calendar set (default Gregorian events with valid dateTime)
        
        const hasMatchingCalendar = evt.calendarId === this.selectedCalendarId;
        const hasGregorianFallback = !!(evt.gregorianDateTime);
        const isDefaultGregorian = !evt.calendarId && !evt.customCalendarDate && evt.dateTime;
        
        // Only show events from the selected calendar OR events with Gregorian dates that can be displayed
        if (!hasMatchingCalendar && !hasGregorianFallback && !isDefaultGregorian) {
            return false;
        }
    } else {
        // "All Calendars (Gregorian)" mode - show all events
        // No calendar-based filtering
    }
    
    // ... rest of filtering logic
}
```

### Filtering Behavior

#### When "Cal 11" is Selected:
- ✅ **Show:** Events with `calendarId: "Cal 11"`
- ✅ **Show:** Events with `gregorianDateTime` (converted events)
- ✅ **Show:** Default Gregorian events (no calendar set, has `dateTime`)
- ❌ **Hide:** Events with different `calendarId` (e.g., "Cal 10")
- ❌ **Hide:** Events with `customCalendarDate` but no `gregorianDateTime`

#### When "All Calendars (Gregorian)" is Selected:
- ✅ **Show:** All events regardless of calendar
- ✅ Events are positioned using Gregorian dates
- ✅ Custom calendar events use their `gregorianDateTime` for positioning

## Testing Steps

1. **Setup:**
   - Create events with `calendarId: "Cal 11"`
   - Create events with no calendar (Gregorian)
   - Create events with different `calendarId`

2. **Test Case 1: Select "Cal 11"**
   - Expected: Only Cal 11 events and Gregorian events appear
   - Expected: Axis shows custom calendar month names ("kinn", etc.)
   - Expected: Events from other calendars are hidden

3. **Test Case 2: Select "All Calendars (Gregorian)"**
   - Expected: All events appear
   - Expected: Axis shows Gregorian month names
   - Expected: Custom calendar events positioned via `gregorianDateTime`

4. **Test Case 3: Switch Between Calendars**
   - Expected: Events filter dynamically
   - Expected: Axis updates to show correct calendar
   - Expected: No errors in console

## Files Modified

- `src/utils/TimelineRenderer.ts` - Added calendar filtering to `shouldIncludeEvent()` method (lines 793-823)

## Version

- **Fixed in:** 1.0.0+
- **Date:** 2025-01-11
- **Related:** LEVEL3_CUSTOM_CALENDAR_TIMELINE.md (Phase 11)

## Related Issues

This fix completes **Phase 11: Multi-Calendar Event Filtering** from the Level 3 Custom Calendar Timeline feature:

- ✅ Filter events by calendar system
- ✅ Show/hide events based on selected calendar
- ✅ Support Gregorian fallback events
- 🚧 TODO: Convert and display cross-calendar events (future enhancement)

## Notes for Users

### How to Use Custom Calendars

1. **Create a custom calendar** entity with proper YAML structure
2. **Create events** with `calendarId` matching your calendar
3. **Open Timeline view**
4. **Select calendar** from dropdown in toolbar
5. Events will filter to show only events from that calendar

### Event Date Requirements

For events to appear when a custom calendar is selected:

**Option 1: Custom Calendar Event (Recommended)**
```yaml
---
name: Battle of the Five Armies
calendarId: "Cal 11"
customCalendarDate:
  year: 2941
  month: "kinn"
  day: 15
gregorianDateTime: "2941-11-23T14:00:00"  # Converted date
---
```

**Option 2: Gregorian Event (Always Visible)**
```yaml
---
name: Modern Event
dateTime: "2024-06-15T10:00:00"
---
```

### Troubleshooting

**Problem:** Events not appearing when calendar selected

**Solutions:**
1. Check event has matching `calendarId`
2. Verify `gregorianDateTime` is set for custom calendar events
3. Ensure custom calendar is properly defined in vault
4. Check browser console for conversion errors

**Problem:** Wrong events appearing

**Solution:** Verify `calendarId` matches exactly (case-sensitive)

## Future Enhancements

Potential improvements to calendar filtering:

1. **Cross-Calendar Conversion**
   - Automatically convert events between calendars
   - Show all events in selected calendar's time system

2. **Multi-Calendar View**
   - Display events from multiple calendars simultaneously
   - Color-code by calendar

3. **Calendar Selector Improvements**
   - Show event count per calendar
   - Preview calendar before switching
   - Recent calendars list

4. **Performance Optimization**
   - Cache calendar conversions
   - Lazy-load calendar definitions
   - Debounce calendar switching

## References

- [Level 3 Custom Calendar Documentation](docs/LEVEL3_CUSTOM_CALENDAR_TIMELINE.md)
- [Timeline Renderer](src/utils/TimelineRenderer.ts)
- [Calendar Converter](src/utils/CalendarConverter.ts)
- [Date Parsing Utilities](src/utils/DateParsing.ts)
