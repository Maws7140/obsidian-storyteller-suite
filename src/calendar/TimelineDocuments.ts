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

/**
 * Colour roles a timeline theme can set. Each one maps onto a
 * `--sts-timeline-*` CSS variable (see `utils/TimelineStyle.ts`), so a theme
 * file and a CSS snippet restyle exactly the same things. Any role left out
 * keeps the stylesheet default, which follows the active Obsidian theme.
 */
export interface TimelineThemeColors {
  background?: string;
  surface?: string;
  sidebar?: string;
  grid?: string;
  gridStrong?: string;
  text?: string;
  mutedText?: string;
  accentText?: string;
  onAccent?: string;
  accent?: string;
  now?: string;
  conflictError?: string;
  conflictWarning?: string;
  connector?: string;
  flashback?: string;
  flashforward?: string;
  era?: string;
  holiday?: string;
  milestone?: string;
  milestoneEdge?: string;
  slot?: string;
}

/** Every colour role, in the order the theme editor lists them. */
export const TIMELINE_THEME_COLOR_KEYS: Array<keyof TimelineThemeColors> = [
  'background', 'surface', 'sidebar', 'grid', 'gridStrong',
  'text', 'mutedText', 'accentText', 'onAccent', 'accent',
  'now', 'conflictError', 'conflictWarning', 'connector',
  'flashback', 'flashforward', 'era', 'holiday',
  'milestone', 'milestoneEdge', 'slot',
];

export type TimelineBackgroundFit = 'cover' | 'contain' | 'stretch' | 'tile';
export type TimelineBackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

/**
 * An image drawn behind the timeline.
 *
 * `image` is a vault path (or `[[wikilink]]`), an `https://` URL, or a
 * `data:image/...` URI. Only the last two travel in a share code; a vault path
 * names a file on the author's machine.
 */
export interface TimelineThemeBackground {
  image?: string;
  fit?: TimelineBackgroundFit;
  position?: TimelineBackgroundPosition;
  /** 0 to 1. How strongly the image shows through the background colour. */
  opacity?: number;
  /** Blur radius in pixels, 0 to 24. */
  blur?: number;
}

export interface TimelineTheme {
  id: string;
  name: string;
  description?: string;
  colors?: TimelineThemeColors;
  /** Colours handed out to lanes, characters, locations and cycles in turn. */
  palette?: string[];
  /** CSS font-family for every label on the canvas. */
  font?: string;
  background?: TimelineThemeBackground;
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
  // No dependencyStyle: left unset, the arrow style setting decides.
  connectors: { width: 2 },
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
  if (typeof theme.id !== 'string' || !theme.id.trim() || typeof theme.name !== 'string' || !theme.name.trim()) {
    throw new Error('Timeline theme id and name are required.');
  }
  return { ...(value as unknown as TimelineThemeDocument), theme: sanitizeTheme(theme) };
}

const COLOR_PATTERN = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\)|[a-z]{3,20})$/i;
const FONT_PATTERN = /^[\w\s,"'-]{1,120}$/;
const FITS: TimelineBackgroundFit[] = ['cover', 'contain', 'stretch', 'tile'];
const POSITIONS: TimelineBackgroundPosition[] = ['center', 'top', 'bottom', 'left', 'right'];
const ARROW_STYLES = ['solid', 'dashed', 'dotted'] as const;

/** A colour a canvas can use and a CSS variable can hold, or undefined. */
export function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return COLOR_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Where a background image may come from. Vault paths, https URLs and inline
 * image data only: a theme arriving as a share code is somebody else's file,
 * and `http:`, `file:` or `javascript:` sources have no business in it.
 */
export function sanitizeImageSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4_000_000) return undefined;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
  if (/^https:\/\/[^\s"'<>]+$/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
  if (/[<>"]/.test(trimmed)) return undefined;
  return trimmed;
}

function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Drop undefined keys, and the object itself when nothing is left. */
function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length ? Object.fromEntries(entries) as T : undefined;
}

/**
 * A theme with every field checked and clamped.
 *
 * Imported themes are other people's JSON. Anything malformed is dropped
 * rather than rejected outright, so one bad colour does not cost the user the
 * rest of a theme they wanted, and nothing unchecked reaches a CSS variable or
 * the canvas.
 */
export function sanitizeTheme(theme: TimelineTheme): TimelineTheme {
  const source = theme as unknown as Record<string, unknown>;
  const colorsIn = isRecord(source.colors) ? source.colors : {};
  const colors: TimelineThemeColors = {};
  for (const key of TIMELINE_THEME_COLOR_KEYS) {
    const color = sanitizeColor(colorsIn[key]);
    if (color) colors[key] = color;
  }
  const palette = Array.isArray(source.palette)
    ? source.palette.map(sanitizeColor).filter((entry): entry is string => !!entry).slice(0, 24)
    : [];
  const font = typeof source.font === 'string' && FONT_PATTERN.test(source.font.trim()) ? source.font.trim() : undefined;
  const backgroundIn = isRecord(source.background) ? source.background : {};
  const eventIn = isRecord(source.event) ? source.event : {};
  const laneIn = isRecord(source.lane) ? source.lane : {};
  const axisIn = isRecord(source.axis) ? source.axis : {};
  const connectorsIn = isRecord(source.connectors) ? source.connectors : {};
  const result: TimelineTheme = {
    id: String(theme.id).trim(),
    name: String(theme.name).trim(),
    description: typeof theme.description === 'string' ? theme.description : undefined,
    colors: compact(colors),
    palette: palette.length ? palette : undefined,
    font,
    background: compact({
      image: sanitizeImageSource(backgroundIn.image),
      fit: FITS.find(fit => fit === backgroundIn.fit),
      position: POSITIONS.find(position => position === backgroundIn.position),
      opacity: finite(backgroundIn.opacity, 0, 1),
      blur: finite(backgroundIn.blur, 0, 24),
    }),
    event: compact({
      radius: finite(eventIn.radius, 0, 16),
      height: finite(eventIn.height, 16, 48),
      opacity: finite(eventIn.opacity, 0.2, 1),
    }),
    lane: compact({
      height: finite(laneIn.height, 20, 200),
      gap: finite(laneIn.gap, 0, 40),
      labelWidth: finite(laneIn.labelWidth, 80, 400),
    }),
    axis: compact({
      density: finite(axisIn.density, 0, 100),
      showCycles: bool(axisIn.showCycles),
      showHolidays: bool(axisIn.showHolidays),
    }),
    connectors: compact({
      width: finite(connectorsIn.width, 0.5, 6),
      dependencyStyle: ARROW_STYLES.find(style => style === connectorsIn.dependencyStyle),
    }),
  };
  return compact(result) as TimelineTheme;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
