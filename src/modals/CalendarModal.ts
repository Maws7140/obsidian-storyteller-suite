import { App, Setting, Notice } from 'obsidian';
import type { Calendar } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';

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

        // Note about complex fields
        contentEl.createEl('div', {
            text: 'Note: Month, holiday, season, and astronomical event details can be added by editing the calendar file directly.',
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
