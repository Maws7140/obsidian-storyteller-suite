import type StorytellerSuitePlugin from '../main';
import type { CalendarSystem } from './types';
import { GREGORIAN_CALENDAR } from './builtins';
import { PRESET_CALENDARS } from './presets';
import {
  OBSIDIAN_NATIVE_THEME,
  type CalendarDocument,
  type PortableTimelineDocument,
  type TimelineTheme,
  type TimelineThemeDocument,
  decodeShareCode,
  parsePortableDocument,
} from './TimelineDocuments';

export class CalendarRegistry {
  constructor(private readonly plugin: StorytellerSuitePlugin) {}

  listCalendars(): CalendarSystem[] {
    const all = [GREGORIAN_CALENDAR, ...PRESET_CALENDARS, ...(this.plugin.settings.calendarSystems || [])];
    return uniqueById(all);
  }

  listThemes(): TimelineTheme[] {
    return uniqueById([OBSIDIAN_NATIVE_THEME, ...(this.plugin.settings.timelineThemes || [])]);
  }

  getActiveCalendar(): CalendarSystem {
    const id = this.plugin.getActiveStory()?.activeCalendarId;
    return this.listCalendars().find(calendar => calendar.id === id) || GREGORIAN_CALENDAR;
  }

  getActiveTheme(): TimelineTheme {
    const id = this.plugin.getActiveStory()?.activeTimelineThemeId;
    return this.listThemes().find(theme => theme.id === id) || OBSIDIAN_NATIVE_THEME;
  }

  isBuiltInCalendar(id: string): boolean {
    return [GREGORIAN_CALENDAR, ...PRESET_CALENDARS].some(calendar => calendar.id === id);
  }

  async saveCalendar(calendar: CalendarSystem): Promise<void> {
    if (this.isBuiltInCalendar(calendar.id)) throw new Error('Built-in calendars cannot be overwritten. Duplicate it first.');
    const values = [...(this.plugin.settings.calendarSystems || [])];
    const saved = structuredCloneSafe(calendar);
    const index = values.findIndex(value => value.id === saved.id);
    if (index >= 0) values[index] = saved;
    else values.push(saved);
    this.plugin.settings.calendarSystems = values;
    await this.plugin.saveSettings();
  }

  async deleteCalendar(id: string): Promise<void> {
    if (this.isBuiltInCalendar(id)) throw new Error('Built-in calendars cannot be deleted.');
    this.plugin.settings.calendarSystems = (this.plugin.settings.calendarSystems || [])
      .filter(calendar => calendar.id !== id);
    const story = this.plugin.getActiveStory();
    if (story?.activeCalendarId === id) story.activeCalendarId = GREGORIAN_CALENDAR.id;
    await this.plugin.saveSettings();
  }

  async setActiveCalendar(id: string): Promise<void> {
    const story = this.requireStory();
    if (!this.listCalendars().some(calendar => calendar.id === id)) throw new Error('Calendar not found.');
    story.activeCalendarId = id;
    await this.plugin.saveSettings();
  }

  async setActiveTheme(id: string): Promise<void> {
    const story = this.requireStory();
    if (!this.listThemes().some(theme => theme.id === id)) throw new Error('Timeline theme not found.');
    story.activeTimelineThemeId = id;
    await this.plugin.saveSettings();
  }

  async importText(text: string, collision: 'replace' | 'copy' = 'copy'): Promise<PortableTimelineDocument> {
    const document = text.trim().startsWith('storyteller:') ? decodeShareCode(text) : parsePortableDocument(text);
    if (document.kind === 'storyteller-calendar') await this.installCalendar(document, collision);
    else await this.installTheme(document, collision);
    return document;
  }

  private async installCalendar(document: CalendarDocument, collision: 'replace' | 'copy'): Promise<void> {
    const values = [...(this.plugin.settings.calendarSystems || [])];
    const calendar = structuredCloneSafe(document.calendar);
    const index = values.findIndex(value => value.id === calendar.id);
    if (index >= 0 && collision === 'replace') values[index] = calendar;
    else {
      if (this.listCalendars().some(value => value.id === calendar.id)) calendar.id = `${calendar.id}-${Date.now().toString(36)}`;
      values.push(calendar);
    }
    this.plugin.settings.calendarSystems = values;
    await this.plugin.saveSettings();
  }

  private async installTheme(document: TimelineThemeDocument, collision: 'replace' | 'copy'): Promise<void> {
    const values = [...(this.plugin.settings.timelineThemes || [])];
    const theme = structuredCloneSafe(document.theme);
    const index = values.findIndex(value => value.id === theme.id);
    if (index >= 0 && collision === 'replace') values[index] = theme;
    else {
      if (this.listThemes().some(value => value.id === theme.id)) theme.id = `${theme.id}-${Date.now().toString(36)}`;
      values.push(theme);
    }
    this.plugin.settings.timelineThemes = values;
    await this.plugin.saveSettings();
  }

  private requireStory() {
    const story = this.plugin.getActiveStory();
    if (!story) throw new Error('Select a story before changing its dating system.');
    return story;
  }
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter(value => !seen.has(value.id) && !!seen.add(value.id));
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
