import type { CalendarSystem } from './types';
import { CALENDAR_SCHEMA_VERSION } from './types';

export const TIMELINE_THEME_SCHEMA_VERSION = 1;

export interface PortableDocumentMetadata {
  author?: string;
  description?: string;
  homepage?: string;
  license?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalendarDocument {
  kind: 'storyteller-calendar';
  schemaVersion: number;
  metadata?: PortableDocumentMetadata;
  calendar: CalendarSystem;
}

export interface TimelineTheme {
  id: string;
  name: string;
  description?: string;
  colors?: {
    background?: string;
    surface?: string;
    grid?: string;
    text?: string;
    mutedText?: string;
    accent?: string;
    now?: string;
  };
  event?: { radius?: number; height?: number; opacity?: number };
  lane?: { height?: number; gap?: number; labelWidth?: number };
  axis?: { density?: number; showCycles?: boolean; showHolidays?: boolean };
  connectors?: { width?: number; dependencyStyle?: 'solid' | 'dashed' | 'dotted' };
}

export interface TimelineThemeDocument {
  kind: 'storyteller-timeline-theme';
  schemaVersion: number;
  metadata?: PortableDocumentMetadata;
  theme: TimelineTheme;
}

export type PortableTimelineDocument = CalendarDocument | TimelineThemeDocument;

export const OBSIDIAN_NATIVE_THEME: TimelineTheme = {
  id: 'builtin:obsidian-native',
  name: 'Obsidian native',
  description: 'Inherits colors and typography from the active Obsidian theme.',
  event: { radius: 3, height: 24, opacity: 1 },
  lane: { height: 36, gap: 8, labelWidth: 174 },
  axis: { density: 50, showCycles: true, showHolidays: true },
  connectors: { width: 2, dependencyStyle: 'solid' },
};

export function makeCalendarDocument(calendar: CalendarSystem, metadata?: PortableDocumentMetadata): CalendarDocument {
  return { kind: 'storyteller-calendar', schemaVersion: CALENDAR_SCHEMA_VERSION, metadata, calendar };
}

export function makeThemeDocument(theme: TimelineTheme, metadata?: PortableDocumentMetadata): TimelineThemeDocument {
  return { kind: 'storyteller-timeline-theme', schemaVersion: TIMELINE_THEME_SCHEMA_VERSION, metadata, theme };
}

export function parsePortableDocument(input: unknown): PortableTimelineDocument {
  const value = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  if (!isRecord(value)) throw new Error('The imported file must contain a JSON object.');
  if (value.kind === 'storyteller-calendar') return validateCalendarDocument(value);
  if (value.kind === 'storyteller-timeline-theme') return validateThemeDocument(value);
  throw new Error('Unsupported Storyteller document kind.');
}

export function encodeShareCode(document: PortableTimelineDocument): string {
  const json = JSON.stringify(document);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `storyteller:${document.kind === 'storyteller-calendar' ? 'cal' : 'theme'}:1:${btoa(binary)}`;
}

export function decodeShareCode(code: string): PortableTimelineDocument {
  const match = code.trim().match(/^storyteller:(cal|theme):1:([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Invalid Storyteller share code.');
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return parsePortableDocument(new TextDecoder().decode(bytes));
}

function validateCalendarDocument(value: Record<string, unknown>): CalendarDocument {
  if (value.schemaVersion !== CALENDAR_SCHEMA_VERSION) throw new Error(`Unsupported calendar schema version: ${String(value.schemaVersion)}.`);
  if (!isRecord(value.calendar)) throw new Error('Calendar payload is missing.');
  const calendar = value.calendar as unknown as CalendarSystem;
  if (!calendar.id?.trim() || !calendar.name?.trim()) throw new Error('Calendar id and name are required.');
  if (calendar.baseUnit !== 'day' && calendar.baseUnit !== 'minute') throw new Error('Calendar baseUnit must be day or minute.');
  if (!Number.isFinite(calendar.unitsPerDay) || calendar.unitsPerDay <= 0) throw new Error('Calendar unitsPerDay must be positive.');
  if (!Array.isArray(calendar.months) || calendar.months.length === 0) throw new Error('Calendar must define at least one month.');
  calendar.months.forEach((month, index) => {
    if (!month?.name?.trim() || !Number.isInteger(month.days) || month.days <= 0) throw new Error(`Month ${index + 1} requires a name and positive whole-day length.`);
  });
  return value as unknown as CalendarDocument;
}

function validateThemeDocument(value: Record<string, unknown>): TimelineThemeDocument {
  if (value.schemaVersion !== TIMELINE_THEME_SCHEMA_VERSION) throw new Error(`Unsupported timeline theme schema version: ${String(value.schemaVersion)}.`);
  if (!isRecord(value.theme)) throw new Error('Timeline theme payload is missing.');
  const theme = value.theme as unknown as TimelineTheme;
  if (!theme.id?.trim() || !theme.name?.trim()) throw new Error('Timeline theme id and name are required.');
  return value as unknown as TimelineThemeDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
