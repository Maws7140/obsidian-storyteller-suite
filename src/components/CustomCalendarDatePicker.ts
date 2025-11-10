import { Setting } from 'obsidian';
import { Calendar, CalendarDate } from '../types';
import { CalendarConverter } from '../utils/CalendarConverter';
import { DateTime } from 'luxon';
import StorytellerSuitePlugin from '../main';

/**
 * Custom calendar date picker component
 * Provides dropdowns for year, month, and day based on calendar structure
 */
export class CustomCalendarDatePicker {
    private plugin: StorytellerSuitePlugin;
    private calendar: Calendar;
    private value: CalendarDate;
    private onChange: (date: CalendarDate) => void;
    private container: HTMLElement;

    private yearInput: HTMLInputElement | null = null;
    private monthDropdown: HTMLSelectElement | null = null;
    private dayDropdown: HTMLSelectElement | null = null;
    private gregorianPreview: HTMLElement | null = null;

    constructor(
        plugin: StorytellerSuitePlugin,
        calendar: Calendar,
        initialValue: CalendarDate | null,
        onChange: (date: CalendarDate) => void
    ) {
        this.plugin = plugin;
        this.calendar = calendar;
        this.onChange = onChange;

        // Initialize with current value or defaults
        this.value = initialValue || this.getDefaultDate();
    }

    /**
     * Render the date picker into a container
     */
    render(container: HTMLElement): void {
        this.container = container;
        container.empty();

        // Create a container for the date picker
        const pickerContainer = container.createDiv('custom-calendar-date-picker');

        // Year input
        new Setting(pickerContainer)
            .setName('Year')
            .addText(text => {
                this.yearInput = text.inputEl;
                text.setValue(String(this.value.year))
                    .setPlaceholder('Year')
                    .onChange(value => {
                        const year = parseInt(value);
                        if (!isNaN(year)) {
                            this.value.year = year;
                            this.updateGregorianPreview();
                            this.onChange(this.value);
                        }
                    });
                text.inputEl.type = 'number';
            });

        // Month dropdown
        new Setting(pickerContainer)
            .setName('Month')
            .addDropdown(dropdown => {
                this.monthDropdown = dropdown.selectEl;

                // Populate with months from calendar
                if (this.calendar.months && this.calendar.months.length > 0) {
                    this.calendar.months.forEach((month, index) => {
                        dropdown.addOption(month.name, month.name);
                    });
                } else {
                    // Fallback to generic months
                    for (let i = 1; i <= 12; i++) {
                        dropdown.addOption(String(i), `Month ${i}`);
                    }
                }

                // Set initial value
                const currentMonth = typeof this.value.month === 'string'
                    ? this.value.month
                    : String(this.value.month);
                dropdown.setValue(currentMonth);

                dropdown.onChange(value => {
                    this.value.month = value;
                    this.updateDayDropdown();
                    this.updateGregorianPreview();
                    this.onChange(this.value);
                });
            });

        // Day dropdown
        new Setting(pickerContainer)
            .setName('Day')
            .addDropdown(dropdown => {
                this.dayDropdown = dropdown.selectEl;
                this.populateDayDropdown(dropdown);

                dropdown.onChange(value => {
                    this.value.day = parseInt(value);
                    this.updateGregorianPreview();
                    this.onChange(this.value);
                });
            });

        // Gregorian preview (read-only)
        const previewSetting = new Setting(pickerContainer)
            .setName('Gregorian Equivalent')
            .setDesc('Automatically calculated');

        this.gregorianPreview = previewSetting.descEl.createDiv('calendar-gregorian-preview');
        this.updateGregorianPreview();
    }

    /**
     * Populate day dropdown based on selected month
     */
    private populateDayDropdown(dropdown: any): void {
        if (!this.dayDropdown) return;

        // Get the selected month
        const monthName = this.value.month;
        const monthIndex = typeof monthName === 'string'
            ? (this.calendar.months?.findIndex(m => m.name === monthName) ?? -1)
            : (monthName as number);

        // Convert 0-based index to 1-based month number for getDaysInMonth
        const monthNumber = typeof monthName === 'string'
            ? (monthIndex >= 0 ? monthIndex + 1 : 1)
            : monthIndex;

        const daysInMonth = CalendarConverter.getDaysInMonth(monthNumber, this.value.year, this.calendar);

        // Clear existing options using standard DOM methods
        while (this.dayDropdown.options.length > 0) {
            this.dayDropdown.remove(0);
        }

        // Add day options
        for (let day = 1; day <= daysInMonth; day++) {
            dropdown.addOption(String(day), String(day));
        }

        // Set current value or default to 1
        const currentDay = Math.min(this.value.day, daysInMonth);
        this.value.day = currentDay;
        dropdown.setValue(String(currentDay));
    }

    /**
     * Update day dropdown when month changes
     */
    private updateDayDropdown(): void {
        if (!this.dayDropdown) return;

        const monthName = this.value.month;
        const monthIndex = typeof monthName === 'string'
            ? (this.calendar.months?.findIndex(m => m.name === monthName) ?? -1)
            : (monthName as number);

        // Convert 0-based index to 1-based month number for getDaysInMonth
        const monthNumber = typeof monthName === 'string'
            ? (monthIndex >= 0 ? monthIndex + 1 : 1)
            : monthIndex;

        const daysInMonth = CalendarConverter.getDaysInMonth(monthNumber, this.value.year, this.calendar);

        // Clear and repopulate using standard DOM methods
        while (this.dayDropdown.options.length > 0) {
            this.dayDropdown.remove(0);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const option = document.createElement('option');
            option.value = String(day);
            option.text = String(day);
            this.dayDropdown.add(option);
        }

        // Ensure current day is valid
        if (this.value.day > daysInMonth) {
            this.value.day = daysInMonth;
        }

        this.dayDropdown.value = String(this.value.day);
    }

    /**
     * Update the Gregorian preview display
     */
    private updateGregorianPreview(): void {
        if (!this.gregorianPreview) return;

        try {
            // Validate the date first
            if (!CalendarConverter.validateCustomDate(this.value, this.calendar)) {
                this.gregorianPreview.setText('Invalid date');
                this.gregorianPreview.addClass('error');
                return;
            }

            // Convert to Gregorian
            const gregorianDate = CalendarConverter.convertCustomToGregorian(this.value, this.calendar);

            if (gregorianDate) {
                const formatted = DateTime.fromJSDate(gregorianDate).toLocaleString(DateTime.DATE_FULL);
                this.gregorianPreview.setText(formatted);
                this.gregorianPreview.removeClass('error');
            } else {
                this.gregorianPreview.setText('Conversion not available');
                this.gregorianPreview.removeClass('error');
            }
        } catch (error) {
            console.error('Error updating Gregorian preview:', error);
            this.gregorianPreview.setText('Conversion error');
            this.gregorianPreview.addClass('error');
        }
    }

    /**
     * Get default date for the calendar
     */
    private getDefaultDate(): CalendarDate {
        // Use calendar's current date if available
        if (this.calendar.currentDate) {
            return { ...this.calendar.currentDate };
        }

        // Use reference date if available
        if (this.calendar.referenceDate) {
            return { ...this.calendar.referenceDate };
        }

        // Create a default date
        const firstMonth = this.calendar.months && this.calendar.months.length > 0
            ? this.calendar.months[0].name
            : 1;

        return {
            year: this.calendar.epochYear || 0,
            month: firstMonth,
            day: 1
        };
    }

    /**
     * Get the current value
     */
    getValue(): CalendarDate {
        return { ...this.value };
    }

    /**
     * Set the value programmatically
     */
    setValue(date: CalendarDate): void {
        this.value = { ...date };

        // Update UI elements if they exist
        if (this.yearInput) {
            this.yearInput.value = String(date.year);
        }

        if (this.monthDropdown) {
            const monthValue = typeof date.month === 'string' ? date.month : String(date.month);
            this.monthDropdown.value = monthValue;
        }

        if (this.dayDropdown) {
            this.updateDayDropdown();
        }

        this.updateGregorianPreview();
    }

    /**
     * Static helper to create and render a date picker
     */
    static create(
        container: HTMLElement,
        plugin: StorytellerSuitePlugin,
        calendar: Calendar,
        initialValue: CalendarDate | null,
        onChange: (date: CalendarDate) => void
    ): CustomCalendarDatePicker {
        const picker = new CustomCalendarDatePicker(plugin, calendar, initialValue, onChange);
        picker.render(container);
        return picker;
    }
}
