import { App, Modal, Notice, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import { CALENDAR_SCHEMA_VERSION, type CalendarSystem, type MonthDef } from '../calendar/types';
import { daysInYear, monthsInYear } from '../calendar/CalendarEngine';

type Done = () => void;

export class CalendarManagerModal extends Modal {
    private readonly registry: CalendarRegistry;

    constructor(app: App, private readonly plugin: StorytellerSuitePlugin, private readonly onChange?: Done) {
        super(app);
        this.registry = new CalendarRegistry(plugin);
    }

    onOpen(): void {
        this.modalEl.addClass('storyteller-modal-scroll');
        this.modalEl.setCssStyles({ width: 'min(760px, 92vw)' });
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Dating systems' });
        contentEl.createEl('p', {
            text: 'Build calendars from months, leap patterns, intercalary months, seasonal cycles, and holidays.',
        });

        new Setting(contentEl)
            .setName('New dating system')
            .setDesc('Start with a simple editable calendar.')
            .addButton(button => button.setButtonText('Create').setCta().onClick(() => {
                this.openEditor(newCalendar());
            }));

        const activeId = this.registry.getActiveCalendar().id;
        for (const calendar of this.registry.listCalendars()) {
            const builtIn = this.registry.isBuiltInCalendar(calendar.id);
            const detail = [
                builtIn ? 'Built in' : 'Custom',
                `${calendar.months.length} base months`,
                `${daysInYear(calendar, 1)} days in year 1`,
                calendar.id === activeId ? 'Active' : '',
            ].filter(Boolean).join(' · ');
            const row = new Setting(contentEl).setName(calendar.name).setDesc(detail);
            if (calendar.id !== activeId) {
                row.addButton(button => button.setButtonText('Use').onClick(async () => {
                    await this.registry.setActiveCalendar(calendar.id);
                    this.onChange?.();
                    this.render();
                }));
            }
            row.addExtraButton(button => button.setIcon('copy').setTooltip('Duplicate').onClick(() => {
                const copy = clone(calendar);
                copy.id = uniqueCalendarId(`${calendar.id}-copy`, this.registry.listCalendars());
                copy.name = `${calendar.name} copy`;
                this.openEditor(copy);
            }));
            if (!builtIn) {
                row.addExtraButton(button => button.setIcon('pencil').setTooltip('Edit').onClick(() => {
                    this.openEditor(clone(calendar));
                }));
                row.addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete').onClick(async () => {
                    await this.registry.deleteCalendar(calendar.id);
                    this.onChange?.();
                    this.render();
                }));
            }
        }
    }

    private openEditor(calendar: CalendarSystem): void {
        new CalendarEditorModal(this.app, this.plugin, calendar, () => {
            this.onChange?.();
            this.render();
        }).open();
    }
}

class CalendarEditorModal extends Modal {
    private readonly registry: CalendarRegistry;
    private draft: CalendarSystem;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        calendar: CalendarSystem,
        private readonly onSave: Done,
    ) {
        super(app);
        this.registry = new CalendarRegistry(plugin);
        this.draft = clone(calendar);
    }

    onOpen(): void {
        this.modalEl.addClass('storyteller-modal-scroll');
        this.modalEl.setCssStyles({ width: 'min(920px, 94vw)' });
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Calendar designer' });
        this.section('Identity');
        new Setting(contentEl).setName('Name').addText(text => text.setValue(this.draft.name).onChange(value => {
            this.draft.name = value;
        }));
        new Setting(contentEl).setName('Description').addTextArea(text => {
            text.setValue(this.draft.description || '').onChange(value => { this.draft.description = value; });
            text.inputEl.rows = 2;
        });
        new Setting(contentEl).setName('Calendar kind').addDropdown(dropdown => dropdown
            .addOption('custom', 'Custom')
            .addOption('solar', 'Solar')
            .addOption('lunar', 'Lunar')
            .addOption('lunisolar', 'Lunisolar')
            .setValue(this.draft.calendarKind || 'custom')
            .onChange(value => { this.draft.calendarKind = value as CalendarSystem['calendarKind']; }));
        new Setting(contentEl).setName('Era label').setDesc('Shown after formatted years, such as AH or CE.')
            .addText(text => text.setValue(this.draft.epochLabel || '').onChange(value => { this.draft.epochLabel = value; }));
        new Setting(contentEl).setName('Epoch absolute day')
            .setDesc('Where year 1, month 1, day 1 falls on Storyteller’s shared timeline. Gregorian 0001-01-01 is 0.')
            .addText(text => text.setValue(String(this.draft.epochAbsoluteDay)).onChange(value => {
                this.draft.epochAbsoluteDay = integer(value, 0);
            }));

        this.section('Months');
        this.draft.months.forEach((month, index) => this.renderMonth(month, index));
        new Setting(contentEl).addButton(button => button.setButtonText('Add month').onClick(() => {
            this.draft.months.push({ name: `Month ${this.draft.months.length + 1}`, days: 30 });
            this.render();
        }));

        this.section('Week');
        new Setting(contentEl).setName('Weekday names').setDesc('Comma-separated; leave blank for no week cycle.')
            .addTextArea(text => {
                text.setValue(this.draft.week?.days.join(', ') || '').onChange(value => {
                    const days = csv(value);
                    this.draft.week = days.length ? { days } : undefined;
                });
                text.inputEl.rows = 2;
            });

        this.renderLeapRule();
        this.renderIntercalaryMonths();
        this.renderCycles();
        this.renderHolidays();
        this.renderYearOverrides();

        this.section('Preview');
        const previewYears = [1, 2, 3, 4, 5].map(year =>
            `Year ${year}: ${monthsInYear(this.draft, year).length} months, ${daysInYear(this.draft, year)} days`,
        );
        contentEl.createEl('p', { text: previewYears.join('  ·  ') });

        const actions = new Setting(contentEl);
        actions.addButton(button => button.setButtonText('Save calendar').setCta().onClick(async () => {
            const error = validateCalendar(this.draft);
            if (error) {
                new Notice(error);
                return;
            }
            await this.registry.saveCalendar(this.draft);
            this.onSave();
            this.close();
            new Notice(`${this.draft.name} saved`);
        }));
        actions.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }

    private section(title: string): void {
        new Setting(this.contentEl).setName(title).setHeading();
    }

    private renderMonth(month: MonthDef, index: number): void {
        new Setting(this.contentEl)
            .setName(`Month ${index + 1}`)
            .addText(text => text.setPlaceholder('Name').setValue(month.name).onChange(value => { month.name = value; }))
            .addText(text => text.setPlaceholder('Abbreviation').setValue(month.abbr || '').onChange(value => { month.abbr = value || undefined; }))
            .addText(text => text.setPlaceholder('Days').setValue(String(month.days)).onChange(value => { month.days = positive(value, 1); }))
            .addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete month').onClick(() => {
                this.draft.months.splice(index, 1);
                this.render();
            }));
    }

    private renderLeapRule(): void {
        this.section('Leap rule');
        const rule = this.draft.leapRule;
        const mode = rule?.cycleYears ? 'pattern' : rule?.everyYears ? 'periodic' : 'none';
        new Setting(this.contentEl).setName('Rule type').addDropdown(dropdown => dropdown
            .addOption('none', 'None')
            .addOption('periodic', 'Every N years')
            .addOption('pattern', 'Patterned cycle')
            .setValue(mode)
            .onChange(value => {
                if (value === 'none') this.draft.leapRule = undefined;
                else if (value === 'periodic') this.draft.leapRule = { everyYears: 4, extraDays: 1 };
                else this.draft.leapRule = { cycleYears: 30, leapYears: [2, 5, 7], extraDays: 1 };
                this.render();
            }));
        if (!rule) return;
        if (mode === 'periodic') {
            new Setting(this.contentEl).setName('Every N years').addText(text => text.setValue(String(rule.everyYears || 4)).onChange(value => {
                rule.everyYears = positive(value, 1);
            }));
        } else {
            new Setting(this.contentEl).setName('Cycle length in years').addText(text => text.setValue(String(rule.cycleYears || 1)).onChange(value => {
                rule.cycleYears = positive(value, 1);
            }));
            new Setting(this.contentEl).setName('Leap years in cycle').setDesc('Comma-separated, 1-based positions.')
                .addText(text => text.setValue((rule.leapYears || []).join(', ')).onChange(value => {
                    rule.leapYears = integerCsv(value);
                }));
        }
        new Setting(this.contentEl).setName('Extra days').addText(text => text.setValue(String(rule.extraDays)).onChange(value => {
            rule.extraDays = positive(value, 1);
        }));
        new Setting(this.contentEl).setName('Month receiving extra days').addDropdown(dropdown => {
            this.draft.months.forEach((month, index) => dropdown.addOption(String(index), month.name));
            dropdown.setValue(String(rule.monthIndex ?? Math.max(0, this.draft.months.length - 1))).onChange(value => {
                rule.monthIndex = integer(value, 0);
            });
        });
    }

    private renderIntercalaryMonths(): void {
        this.section('Intercalary months');
        for (const [index, month] of (this.draft.intercalaryMonths || []).entries()) {
            const row = new Setting(this.contentEl).setName(`Inserted month ${index + 1}`)
                .addText(text => text.setPlaceholder('Name').setValue(month.name).onChange(value => { month.name = value; }))
                .addText(text => text.setPlaceholder('Days').setValue(String(month.days)).onChange(value => { month.days = positive(value, 1); }))
                .addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete').onClick(() => {
                    this.draft.intercalaryMonths?.splice(index, 1);
                    this.render();
                }));
            row.addDropdown(dropdown => {
                dropdown.addOption('-1', 'Before first month');
                this.draft.months.forEach((base, baseIndex) => dropdown.addOption(String(baseIndex), `After ${base.name}`));
                dropdown.setValue(String(month.afterMonth)).onChange(value => { month.afterMonth = integer(value, -1); });
            });
            new Setting(this.contentEl).setName(`${month.name} recurrence`)
                .setDesc('Cycle length and 1-based years in that cycle.')
                .addText(text => text.setPlaceholder('Cycle years').setValue(String(month.cycleYears)).onChange(value => { month.cycleYears = positive(value, 1); }))
                .addText(text => text.setPlaceholder('Years, e.g. 3, 6').setValue(month.years.join(', ')).onChange(value => { month.years = integerCsv(value); }));
        }
        new Setting(this.contentEl).addButton(button => button.setButtonText('Add intercalary month').onClick(() => {
            (this.draft.intercalaryMonths ||= []).push({ name: 'Intercalary month', days: 30, afterMonth: this.draft.months.length - 1, cycleYears: 3, years: [3] });
            this.render();
        }));
    }

    private renderCycles(): void {
        this.section('Seasonal and named cycles');
        for (const [index, cycle] of (this.draft.cycles || []).entries()) {
            new Setting(this.contentEl).setName(`Cycle ${index + 1}`)
                .addText(text => text.setPlaceholder('Name').setValue(cycle.name).onChange(value => { cycle.name = value; }))
                .addColorPicker(picker => picker.setValue(cycle.color || '#3b82f6').onChange(value => { cycle.color = value; }))
                .addDropdown(dropdown => {
                    dropdown.addOption('', 'No parent');
                    (this.draft.cycles || []).filter(other => other !== cycle).forEach(other => dropdown.addOption(other.name, `Inside ${other.name}`));
                    dropdown.setValue(cycle.parentCycle || '').onChange(value => { cycle.parentCycle = value || undefined; });
                })
                .addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete').onClick(() => {
                    this.draft.cycles?.splice(index, 1);
                    this.render();
                }));
            new Setting(this.contentEl).setName(`${cycle.name} entries`)
                .setDesc('One per line: Name | zero-based start day of year.')
                .addTextArea(text => {
                    text.setValue(cycle.entries.map(entry => `${entry.name} | ${entry.startDayOfYear}`).join('\n')).onChange(value => {
                        cycle.entries = value.split(/\r?\n/).map(line => {
                            const [name, start] = line.split('|');
                            return { name: (name || '').trim(), startDayOfYear: integer(start, 0) };
                        }).filter(entry => entry.name).sort((a, b) => a.startDayOfYear - b.startDayOfYear);
                    });
                    text.inputEl.rows = Math.min(8, Math.max(3, cycle.entries.length));
                });
        }
        new Setting(this.contentEl).addButton(button => button.setButtonText('Add cycle').onClick(() => {
            (this.draft.cycles ||= []).push({ name: `Cycle ${(this.draft.cycles?.length || 0) + 1}`, color: '#3b82f6', entries: [{ name: 'First period', startDayOfYear: 0 }] });
            this.render();
        }));
    }

    private renderHolidays(): void {
        this.section('Holidays and observances');
        for (const [index, holiday] of (this.draft.holidays || []).entries()) {
            new Setting(this.contentEl).setName(`Holiday ${index + 1}`)
                .addText(text => text.setPlaceholder('Name').setValue(holiday.name).onChange(value => { holiday.name = value; }))
                .addDropdown(dropdown => {
                    this.draft.months.forEach((month, monthIndex) => dropdown.addOption(String(monthIndex), month.name));
                    dropdown.setValue(String(holiday.month)).onChange(value => { holiday.month = integer(value, 0); });
                })
                .addText(text => text.setPlaceholder('Day').setValue(String(holiday.day)).onChange(value => { holiday.day = positive(value, 1); }))
                .addText(text => text.setPlaceholder('Duration').setValue(String(holiday.length || 1)).onChange(value => { holiday.length = positive(value, 1); }))
                .addColorPicker(picker => picker.setValue(holiday.color || '#f59e0b').onChange(value => { holiday.color = value; }))
                .addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete').onClick(() => {
                    this.draft.holidays?.splice(index, 1);
                    this.render();
                }));
        }
        new Setting(this.contentEl).addButton(button => button.setButtonText('Add holiday').onClick(() => {
            (this.draft.holidays ||= []).push({ name: 'Holiday', month: 0, day: 1, length: 1, color: '#f59e0b' });
            this.render();
        }));
    }

    private renderYearOverrides(): void {
        this.section('Exceptional years');
        new Setting(this.contentEl)
            .setName('Year overrides')
            .setDesc('One per line: YEAR | Month=days, Month=days. Replaces that year’s month layout.')
            .addTextArea(text => {
                text.setValue(formatOverrides(this.draft)).onChange(value => { this.draft.yearOverrides = parseOverrides(value); });
                text.inputEl.rows = Math.max(3, Math.min(8, (this.draft.yearOverrides?.length || 0) + 2));
            });
    }
}

function newCalendar(): CalendarSystem {
    const id = `calendar-${Date.now().toString(36)}`;
    return {
        schemaVersion: CALENDAR_SCHEMA_VERSION,
        id,
        name: 'New calendar',
        description: '',
        calendarKind: 'custom',
        baseUnit: 'day',
        unitsPerDay: 1,
        epochAbsoluteDay: 0,
        months: Array.from({ length: 12 }, (_, index) => ({ name: `Month ${index + 1}`, days: 30 })),
        week: { days: ['Firstday', 'Secondday', 'Thirdday', 'Fourthday', 'Fifthday', 'Sixthday', 'Seventhday'] },
    };
}

function validateCalendar(calendar: CalendarSystem): string | null {
    if (!calendar.name.trim()) return 'Give the calendar a name.';
    if (!calendar.months.length) return 'Add at least one month.';
    if (calendar.months.some(month => !month.name.trim() || month.days < 1)) return 'Every month needs a name and at least one day.';
    if (calendar.cycles?.some(cycle => !cycle.name.trim() || !cycle.entries.length || cycle.entries[0].startDayOfYear !== 0)) {
        return 'Every cycle needs a name and an entry beginning on day 0.';
    }
    return null;
}

function parseOverrides(value: string): CalendarSystem['yearOverrides'] {
    return value.split(/\r?\n/).map(line => {
        const [yearText, monthsText] = line.split('|');
        const months = (monthsText || '').split(',').map(part => {
            const [name, days] = part.split('=');
            return { name: (name || '').trim(), days: positive(days, 0) };
        }).filter(month => month.name && month.days > 0);
        return { year: integer(yearText, Number.NaN), months };
    }).filter(override => Number.isFinite(override.year) && override.months.length);
}

function formatOverrides(calendar: CalendarSystem): string {
    return (calendar.yearOverrides || []).map(override =>
        `${override.year} | ${override.months.map(month => `${month.name}=${month.days}`).join(', ')}`,
    ).join('\n');
}

function uniqueCalendarId(base: string, calendars: CalendarSystem[]): string {
    const used = new Set(calendars.map(calendar => calendar.id));
    let value = base;
    let suffix = 2;
    while (used.has(value)) value = `${base}-${suffix++}`;
    return value;
}

function csv(value: string): string[] {
    return value.split(',').map(part => part.trim()).filter(Boolean);
}

function integerCsv(value: string): number[] {
    return csv(value).map(part => integer(part, Number.NaN)).filter(Number.isFinite);
}

function integer(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value: string | undefined, fallback: number): number {
    return Math.max(1, integer(value, fallback));
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
