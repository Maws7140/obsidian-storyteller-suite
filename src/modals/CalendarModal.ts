import { App, Setting, Notice } from 'obsidian';
import type { Calendar, CalendarDate, CalendarLookupEntry } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { CalendarConverter } from '../utils/CalendarConverter';

export type CalendarModalSubmitCallback = (calendar: Calendar) => Promise<void>;
export type CalendarModalDeleteCallback = (calendar: Calendar) => Promise<void>;

/**
 * Modal for creating and editing calendar systems
 */
export class CalendarModal extends ResponsiveModal {
    calendar: Calendar;
    plugin: StorytellerSuitePlugin;
    onSubmit: CalendarModalSubmitCallback;
    onDelete?: CalendarModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        calendar: Calendar | null,
        onSubmit: CalendarModalSubmitCallback,
        onDelete?: CalendarModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = calendar === null;

        this.calendar = calendar || {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
            name: '',
            calendarType: 'solar',
            daysPerYear: 365,
            daysPerWeek: 7,
            weekdays: [],
            months: [],
            holidays: [],
            astronomicalEvents: [],
            seasons: [],
            linkedCultures: [],
            linkedLocations: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.calendar.customFields) this.calendar.customFields = {};
        if (!this.calendar.weekdays) this.calendar.weekdays = [];
        if (!this.calendar.months) this.calendar.months = [];
        if (!this.calendar.holidays) this.calendar.holidays = [];
        if (!this.calendar.astronomicalEvents) this.calendar.astronomicalEvents = [];
        if (!this.calendar.seasons) this.calendar.seasons = [];
        if (!this.calendar.linkedCultures) this.calendar.linkedCultures = [];
        if (!this.calendar.linkedLocations) this.calendar.linkedLocations = [];
        if (!this.calendar.groups) this.calendar.groups = [];
        if (!this.calendar.connections) this.calendar.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-calendar-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Calendar' : `Edit Calendar: ${this.calendar.name}`
        });

        // Name (Required)
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the calendar system (e.g., "Gregorian", "Faerun Calendar")')
            .addText(text => {
                text.setValue(this.calendar.name)
                    .onChange(value => this.calendar.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Representative Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: `Current: ${this.calendar.profileImagePath || 'None'}`
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.calendar.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.calendar.profileImagePath || 'None'}`);
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    this.calendar.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                })
            );

        // Calendar Type
        new Setting(contentEl)
            .setName('Calendar Type')
            .setDesc('Astronomical basis of the calendar')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'solar': 'Solar (Sun-based)',
                    'lunar': 'Lunar (Moon-based)',
                    'lunisolar': 'Lunisolar (Both)',
                    'custom': 'Custom'
                })
                .setValue(this.calendar.calendarType || 'solar')
                .onChange(value => this.calendar.calendarType = value)
            );

        // Days Per Year
        new Setting(contentEl)
            .setName('Days Per Year')
            .setDesc('Total days in one year')
            .addText(text => text
                .setValue(String(this.calendar.daysPerYear || 365))
                .onChange(value => this.calendar.daysPerYear = parseInt(value) || 365)
            );

        // Days Per Week
        new Setting(contentEl)
            .setName('Days Per Week')
            .setDesc('Number of days in a week')
            .addText(text => text
                .setValue(String(this.calendar.daysPerWeek || 7))
                .onChange(value => this.calendar.daysPerWeek = parseInt(value) || 7)
            );

        // Weekdays (comma-separated)
        new Setting(contentEl)
            .setName('Weekdays')
            .setDesc('Comma-separated day names (e.g., "Monday, Tuesday, Wednesday")')
            .addText(text => text
                .setValue(this.calendar.weekdays?.join(', ') || '')
                .onChange(value => {
                    this.calendar.weekdays = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s);
                })
            );

        // === MONTHS SECTION ===
        contentEl.createEl('h3', {
            text: 'Months',
            cls: 'storyteller-section-header'
        }).style.cssText = 'margin-top: 20px; margin-bottom: 10px;';

        contentEl.createEl('p', {
            text: 'Define the months in your calendar. Each month needs a name and number of days.',
            cls: 'storyteller-months-desc'
        }).style.cssText = 'opacity: 0.8; font-size: 13px; margin-bottom: 15px;';

        // Display existing months
        if (!this.calendar.months) this.calendar.months = [];

        this.calendar.months.forEach((month, index) => {
            const monthContainer = contentEl.createDiv('storyteller-month-entry');
            monthContainer.style.cssText = 'padding: 10px; margin-bottom: 10px; background: var(--background-secondary); border-radius: 5px;';

            const monthSetting = new Setting(monthContainer)
                .setName(`Month ${index + 1}`)
                .addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Remove')
                    .onClick(() => {
                        if (this.calendar.months) {
                            this.calendar.months.splice(index, 1);
                            this.onOpen(); // Re-render
                        }
                    })
                );

            // Month name and days
            new Setting(monthContainer)
                .setName('Month Details')
                .addText(text => text
                    .setPlaceholder('Month name (e.g., "January")')
                    .setValue(month.name)
                    .onChange(value => {
                        month.name = value;
                    })
                )
                .addText(text => text
                    .setPlaceholder('Days')
                    .setValue(String(month.days))
                    .onChange(value => {
                        month.days = parseInt(value) || 30;
                    })
                );
        });

        // Add new month button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add Month')
                .onClick(() => {
                    if (!this.calendar.months) {
                        this.calendar.months = [];
                    }
                    this.calendar.months.push({
                        name: '',
                        days: 30
                    });
                    this.onOpen(); // Re-render
                })
            );

        // Usage
        new Setting(contentEl)
            .setName('Usage')
            .setDesc('Who uses this calendar? (e.g., "Universal", "Kingdom of Eldoria only")')
            .addText(text => text
                .setValue(this.calendar.usage || '')
                .onChange(value => this.calendar.usage = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of the calendar system and how it works')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.calendar.description || '')
                    .onChange(value => this.calendar.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName('History')
            .setDesc('Origins and adoption of this calendar')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.calendar.history || '')
                    .onChange(value => this.calendar.history = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // === DATE CONVERSION CONFIGURATION (for Timeline Integration) ===
        contentEl.createEl('h3', {
            text: 'Timeline Integration',
            cls: 'storyteller-section-header'
        }).style.cssText = 'margin-top: 20px; margin-bottom: 10px;';

        contentEl.createEl('p', {
            text: 'Configure how dates in this calendar convert to Gregorian dates for timeline display.',
            cls: 'storyteller-conversion-desc'
        }).style.cssText = 'opacity: 0.8; font-size: 13px; margin-bottom: 15px;';

        // Conversion Type
        new Setting(contentEl)
            .setName('Conversion Method')
            .setDesc('How to convert dates to Gregorian for timeline')
            .addDropdown(dropdown => dropdown
                .addOption('none', 'None (No conversion)')
                .addOption('linear', 'Linear Formula')
                .addOption('lookup', 'Lookup Table')
                .setValue(this.calendar.conversionType || 'none')
                .onChange(value => {
                    this.calendar.conversionType = value as any;
                    this.onOpen(); // Re-render to show/hide configuration
                })
            );

        // === LINEAR CONVERSION CONFIGURATION ===
        if (this.calendar.conversionType === 'linear') {
            contentEl.createEl('h4', {
                text: 'Linear Conversion Settings',
                cls: 'storyteller-subsection-header'
            }).style.cssText = 'margin-top: 15px; margin-bottom: 10px; font-size: 14px;';

            // Initialize linearConversion if not exists
            if (!this.calendar.linearConversion) {
                this.calendar.linearConversion = {
                    daysPerYear: this.calendar.daysPerYear || 365,
                    epochYear: 0,
                    epochGregorianDate: '2000-01-01'
                };
            }

            // Days Per Year (auto-populate from calendar.daysPerYear)
            new Setting(contentEl)
                .setName('Days Per Year')
                .setDesc('Number of days in one year')
                .addText(text => text
                    .setValue(String(this.calendar.linearConversion!.daysPerYear))
                    .onChange(value => {
                        if (this.calendar.linearConversion) {
                            this.calendar.linearConversion.daysPerYear = parseInt(value) || 365;
                        }
                    })
                );

            // Epoch Year
            new Setting(contentEl)
                .setName('Epoch Year (Year 0)')
                .setDesc('The "year zero" in your calendar system')
                .addText(text => text
                    .setValue(String(this.calendar.linearConversion!.epochYear))
                    .onChange(value => {
                        if (this.calendar.linearConversion) {
                            this.calendar.linearConversion.epochYear = parseInt(value) || 0;
                        }
                    })
                );

            // Epoch Gregorian Date
            new Setting(contentEl)
                .setName('Epoch Gregorian Date')
                .setDesc('What Gregorian date corresponds to your Year 0?')
                .addText(text => text
                    .setPlaceholder('2000-01-01')
                    .setValue(this.calendar.linearConversion!.epochGregorianDate)
                    .onChange(value => {
                        if (this.calendar.linearConversion) {
                            this.calendar.linearConversion.epochGregorianDate = value;
                        }
                    })
                );

            // Leap Years
            new Setting(contentEl)
                .setName('Use Leap Years')
                .setDesc('Does this calendar have leap years?')
                .addToggle(toggle => toggle
                    .setValue(this.calendar.linearConversion!.useLeapYears || false)
                    .onChange(value => {
                        if (this.calendar.linearConversion) {
                            this.calendar.linearConversion.useLeapYears = value;
                        }
                    })
                );

            // Leap Year Frequency (conditional)
            if (this.calendar.linearConversion.useLeapYears) {
                new Setting(contentEl)
                    .setName('Leap Year Frequency')
                    .setDesc('How often do leap years occur? (e.g., 4 = every 4 years)')
                    .addText(text => text
                        .setValue(String(this.calendar.linearConversion!.leapYearFrequency || 4))
                        .onChange(value => {
                            if (this.calendar.linearConversion) {
                                this.calendar.linearConversion.leapYearFrequency = parseInt(value) || 4;
                            }
                        })
                    );
            }
        }

        // === LOOKUP TABLE CONFIGURATION ===
        if (this.calendar.conversionType === 'lookup') {
            contentEl.createEl('h4', {
                text: 'Lookup Table',
                cls: 'storyteller-subsection-header'
            }).style.cssText = 'margin-top: 15px; margin-bottom: 10px; font-size: 14px;';

            contentEl.createEl('p', {
                text: 'Map specific custom calendar dates to Gregorian dates. System will interpolate between entries.',
                cls: 'storyteller-lookup-desc'
            }).style.cssText = 'opacity: 0.7; font-size: 12px; margin-bottom: 10px;';

            // Initialize lookup table if not exists
            if (!this.calendar.lookupTable) {
                this.calendar.lookupTable = [];
            }

            // Display existing entries
            this.calendar.lookupTable.forEach((entry, index) => {
                const entryContainer = contentEl.createDiv('storyteller-lookup-entry');
                entryContainer.style.cssText = 'padding: 10px; margin-bottom: 10px; background: var(--background-secondary); border-radius: 5px;';

                const entrySetting = new Setting(entryContainer)
                    .setName(`Entry ${index + 1}`)
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Remove')
                        .onClick(() => {
                            if (this.calendar.lookupTable) {
                                this.calendar.lookupTable.splice(index, 1);
                                this.onOpen(); // Re-render
                            }
                        })
                    );

                // Custom date inputs
                new Setting(entryContainer)
                    .setName('Custom Date')
                    .setDesc('Year, Month, Day in your calendar')
                    .addText(text => text
                        .setPlaceholder('Year')
                        .setValue(String(entry.customDate.year))
                        .onChange(value => {
                            entry.customDate.year = parseInt(value) || 0;
                        })
                    )
                    .addText(text => text
                        .setPlaceholder('Month')
                        .setValue(String(entry.customDate.month))
                        .onChange(value => {
                            entry.customDate.month = value;
                        })
                    )
                    .addText(text => text
                        .setPlaceholder('Day')
                        .setValue(String(entry.customDate.day))
                        .onChange(value => {
                            entry.customDate.day = parseInt(value) || 1;
                        })
                    );

                // Gregorian date
                new Setting(entryContainer)
                    .setName('Gregorian Equivalent')
                    .addText(text => text
                        .setPlaceholder('YYYY-MM-DD')
                        .setValue(entry.gregorianDate)
                        .onChange(value => {
                            entry.gregorianDate = value;
                        })
                    );
            });

            // Add new entry button
            new Setting(contentEl)
                .addButton(btn => btn
                    .setButtonText('Add Lookup Entry')
                    .onClick(() => {
                        if (!this.calendar.lookupTable) {
                            this.calendar.lookupTable = [];
                        }
                        this.calendar.lookupTable.push({
                            customDate: { year: 0, month: 1, day: 1 },
                            gregorianDate: '2000-01-01'
                        });
                        this.onOpen(); // Re-render
                    })
                );
        }

        // Note about complex fields
        contentEl.createEl('div', {
            text: 'Note: Holiday, season, and astronomical event details can be added by editing the calendar file directly.',
            cls: 'storyteller-calendar-note'
        }).style.cssText = 'padding: 10px; margin: 10px 0; background: var(--background-secondary); border-radius: 5px; font-size: 12px; opacity: 0.8;';

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.calendar.name) {
                    new Notice('Calendar name is required');
                    return;
                }
                await this.onSubmit(this.calendar);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete')
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.calendar);
                        this.close();
                    }
                })
            );
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
