// The timeline's look, as one table.
//
// Every colour the canvas paints comes from a `--sts-timeline-*` CSS variable.
// styles.css gives each one a default that follows the active Obsidian theme, a
// CSS snippet can override them, and a timeline theme file sets them inline on
// the timeline element, so all three are the same mechanism and nothing on the
// canvas is fixed in code. Kept free of Obsidian and the DOM so it can be read,
// and tested, without a renderer.

import type {
    TimelineBackgroundFit,
    TimelineBackgroundPosition,
    TimelineTheme,
    TimelineThemeColors,
} from '../calendar/TimelineDocuments';

export type TimelineColorRole = keyof TimelineThemeColors;

interface ColorRoleSpec {
    variable: string;
    /** Used only when neither the theme nor the stylesheet supplies a value. */
    fallback: string;
    label: string;
    description: string;
}

export const TIMELINE_COLOR_ROLES: Record<TimelineColorRole, ColorRoleSpec> = {
    background: { variable: '--sts-timeline-background', fallback: '#111827', label: 'Background', description: 'Canvas behind everything.' },
    surface: { variable: '--sts-timeline-surface', fallback: '#1f2937', label: 'Surface', description: 'Event chips, cards and the axis header.' },
    sidebar: { variable: '--sts-timeline-sidebar', fallback: '#18202d', label: 'Lane sidebar', description: 'Behind the lane names.' },
    grid: { variable: '--sts-timeline-grid', fallback: '#374151', label: 'Grid', description: 'Gridlines, borders and the axis line.' },
    gridStrong: { variable: '--sts-timeline-grid-strong', fallback: '#4b5563', label: 'Period lines', description: 'Month and year dividers in the vertical view.' },
    text: { variable: '--sts-timeline-text', fallback: '#e5e7eb', label: 'Text', description: 'Event names and labels.' },
    mutedText: { variable: '--sts-timeline-text-muted', fallback: '#9ca3af', label: 'Muted text', description: 'Axis dates and secondary details.' },
    accentText: { variable: '--sts-timeline-text-accent', fallback: '#a78bfa', label: 'Accent text', description: 'Period labels and uncoloured era names.' },
    onAccent: { variable: '--sts-timeline-text-on-accent', fallback: '#ffffff', label: 'Text on bars', description: 'Labels drawn on coloured Gantt bars.' },
    accent: { variable: '--sts-timeline-accent', fallback: '#7c3aed', label: 'Accent', description: 'Selection, edit-mode handles and the main lane.' },
    now: { variable: '--sts-timeline-now', fallback: '#ef4444', label: 'Today line', description: 'The dashed line at the current date.' },
    conflictError: { variable: '--sts-timeline-conflict-error', fallback: '#ef4444', label: 'Conflict', description: 'Labels of events with a blocking conflict.' },
    conflictWarning: { variable: '--sts-timeline-conflict-warning', fallback: '#eab308', label: 'Conflict warning', description: 'Labels of events with a possible conflict.' },
    connector: { variable: '--sts-timeline-connector', fallback: '#8b5cf6', label: 'Connectors', description: 'Dependency arrows and narrative links.' },
    flashback: { variable: '--sts-timeline-flashback', fallback: '#a78bfa', label: 'Flashback badge', description: 'Rewind badge on flashback events.' },
    flashforward: { variable: '--sts-timeline-flashforward', fallback: '#f59e0b', label: 'Flash-forward badge', description: 'Fast-forward badge on flash-forward events.' },
    era: { variable: '--sts-timeline-era', fallback: '#8b5cf6', label: 'Era band', description: 'Eras that have no colour of their own.' },
    holiday: { variable: '--sts-timeline-holiday', fallback: '#f59e0b', label: 'Holiday band', description: 'Holidays that have no colour of their own.' },
    milestone: { variable: '--sts-timeline-milestone', fallback: '#d9a520', label: 'Milestone star', description: 'Milestones without a colour of their own.' },
    milestoneEdge: { variable: '--sts-timeline-milestone-edge', fallback: '#8a6410', label: 'Milestone rim', description: 'Outline that keeps the star legible on pale backgrounds.' },
    slot: { variable: '--sts-timeline-slot', fallback: '#0b0f16', label: 'Date slots', description: 'Hollow dots you can drop an event on in edit mode.' },
};

export const TIMELINE_FONT_VARIABLE = '--sts-timeline-font';
export const TIMELINE_LANE_COUNT_VARIABLE = '--sts-timeline-lane-count';
export const DEFAULT_TIMELINE_FONT = 'sans-serif';
export const MAX_TIMELINE_PALETTE = 24;
export const DEFAULT_TIMELINE_PALETTE = ['#7c3aed', '#2563eb', '#059669', '#ca8a04', '#dc2626', '#ea580c', '#0ea5e9', '#22c55e', '#d946ef', '#f59e0b'];

/** CSS variable holding the colour of lane `index` (zero-based). */
export function laneVariable(index: number): string {
    return `--sts-timeline-lane-${index + 1}`;
}

/** Every variable a theme can set, so applying a new theme can clear the old one. */
export const TIMELINE_THEME_VARIABLES: string[] = [
    ...Object.values(TIMELINE_COLOR_ROLES).map(spec => spec.variable),
    TIMELINE_FONT_VARIABLE,
    TIMELINE_LANE_COUNT_VARIABLE,
    ...Array.from({ length: MAX_TIMELINE_PALETTE }, (_, index) => laneVariable(index)),
];

/**
 * The variables a theme sets, and nothing it leaves out. A role a theme does
 * not mention keeps the stylesheet default, which is what lets a theme change
 * one colour without freezing every other one to whatever Obsidian theme its
 * author happened to use.
 */
export function themeCssVariables(theme: TimelineTheme): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [role, spec] of Object.entries(TIMELINE_COLOR_ROLES) as Array<[TimelineColorRole, ColorRoleSpec]>) {
        const value = theme.colors?.[role];
        if (value) result[spec.variable] = value;
    }
    if (theme.font) result[TIMELINE_FONT_VARIABLE] = theme.font;
    const palette = (theme.palette || []).slice(0, MAX_TIMELINE_PALETTE);
    if (palette.length) {
        result[TIMELINE_LANE_COUNT_VARIABLE] = String(palette.length);
        palette.forEach((color, index) => { result[laneVariable(index)] = color; });
    }
    return result;
}

export interface TimelineMetrics {
    eventRadius: number;
    eventHeight: number;
    eventOpacity: number;
    laneLabelWidth: number;
    laneGap: number;
    laneMinHeight: number;
    axisDensity: number;
    connectorWidth: number;
    /** Undefined when the theme leaves the arrow style to the plugin setting. */
    dependencyStyle?: 'solid' | 'dashed' | 'dotted';
    showCycles: boolean;
    showHolidays: boolean;
}

export const DEFAULT_TIMELINE_METRICS: TimelineMetrics = {
    eventRadius: 3,
    eventHeight: 24,
    eventOpacity: 1,
    laneLabelWidth: 174,
    laneGap: 8,
    laneMinHeight: 36,
    axisDensity: 50,
    connectorWidth: 2,
    showCycles: true,
    showHolidays: true,
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** The theme's shape settings, clamped to what the layout can draw. */
export function resolveTimelineMetrics(theme: TimelineTheme): TimelineMetrics {
    const d = DEFAULT_TIMELINE_METRICS;
    return {
        eventRadius: clamp(theme.event?.radius, 0, 16, d.eventRadius),
        eventHeight: clamp(theme.event?.height, 16, 48, d.eventHeight),
        eventOpacity: clamp(theme.event?.opacity, 0.2, 1, d.eventOpacity),
        laneLabelWidth: clamp(theme.lane?.labelWidth, 80, 400, d.laneLabelWidth),
        laneGap: clamp(theme.lane?.gap, 0, 40, d.laneGap),
        laneMinHeight: clamp(theme.lane?.height, 20, 200, d.laneMinHeight),
        axisDensity: clamp(theme.axis?.density, 0, 100, d.axisDensity),
        connectorWidth: clamp(theme.connectors?.width, 0.5, 6, d.connectorWidth),
        dependencyStyle: theme.connectors?.dependencyStyle,
        showCycles: theme.axis?.showCycles !== false,
        showHolidays: theme.axis?.showHolidays !== false,
    };
}

/**
 * Pixels between axis labels. Density 50 keeps the spacing the timeline has
 * always used; 100 packs labels a third closer, 0 spreads them twice as far.
 */
export function axisLabelSpacing(density: number, base: number): number {
    return base * 100 / (clamp(density, 0, 100, 50) + 50);
}

/**
 * Height of one stacking row. `eventHeight` is the chip height at the default
 * row density; the density setting then loosens or tightens the rows around it,
 * so the two controls do not fight.
 */
export function rowHeightFor(eventHeight: number, density: number): number {
    return Math.max(eventHeight + 2, Math.round(eventHeight + 7 + (50 - clamp(density, 0, 100, 50)) * 0.16));
}

export interface ResolvedTimelineBackground {
    image: string;
    fit: TimelineBackgroundFit;
    position: TimelineBackgroundPosition;
    opacity: number;
    blur: number;
}

export function resolveTimelineBackground(theme: TimelineTheme): ResolvedTimelineBackground | null {
    const background = theme.background;
    const image = background?.image?.trim();
    if (!image) return null;
    return {
        image,
        fit: background?.fit || 'cover',
        position: background?.position || 'center',
        opacity: clamp(background?.opacity, 0, 1, 0.35),
        blur: clamp(background?.blur, 0, 24, 0),
    };
}

export interface ResolvedTimelineStyle {
    colors: Record<TimelineColorRole, string>;
    palette: string[];
    font: string;
    metrics: TimelineMetrics;
    background: ResolvedTimelineBackground | null;
}

/**
 * Everything the renderer paints with, resolved once per frame.
 *
 * `read` returns a CSS variable's computed value on the timeline element, or
 * an empty string. The theme's own values are consulted after it, which only
 * matters when there is no element to read from yet (or in tests): once the
 * theme has been applied inline, `read` already returns them.
 */
export function resolveTimelineStyle(read: (variable: string) => string, theme: TimelineTheme): ResolvedTimelineStyle {
    const colors = {} as Record<TimelineColorRole, string>;
    for (const [role, spec] of Object.entries(TIMELINE_COLOR_ROLES) as Array<[TimelineColorRole, ColorRoleSpec]>) {
        colors[role] = read(spec.variable) || theme.colors?.[role] || spec.fallback;
    }
    const themePalette = (theme.palette || []).slice(0, MAX_TIMELINE_PALETTE);
    const declaredCount = Number.parseInt(read(TIMELINE_LANE_COUNT_VARIABLE), 10);
    const count = Math.min(MAX_TIMELINE_PALETTE, Math.max(1,
        Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : themePalette.length || DEFAULT_TIMELINE_PALETTE.length));
    const palette = Array.from({ length: count }, (_, index) =>
        read(laneVariable(index)) || themePalette[index] || DEFAULT_TIMELINE_PALETTE[index % DEFAULT_TIMELINE_PALETTE.length]);
    return {
        colors,
        palette,
        font: read(TIMELINE_FONT_VARIABLE) || theme.font || DEFAULT_TIMELINE_FONT,
        metrics: resolveTimelineMetrics(theme),
        background: resolveTimelineBackground(theme),
    };
}

export interface DrawRect { x: number; y: number; width: number; height: number }

/** Most tiles a tiled background draws, so a tiny image cannot stall a frame. */
const MAX_TILES = 600;

/**
 * Where to draw a background image of the given size on a surface.
 *
 * Returns one rectangle for cover, contain and stretch, and a grid of
 * native-size rectangles for tile. `position` anchors the image the way CSS
 * `background-position` does: the overflowing axis of a cover image, or the
 * spare axis of a contained one, is aligned to that edge.
 */
export function backgroundDrawRects(
    fit: TimelineBackgroundFit,
    position: TimelineBackgroundPosition,
    surfaceWidth: number,
    surfaceHeight: number,
    imageWidth: number,
    imageHeight: number,
): DrawRect[] {
    if (surfaceWidth <= 0 || surfaceHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return [];
    if (fit === 'stretch') return [{ x: 0, y: 0, width: surfaceWidth, height: surfaceHeight }];
    if (fit === 'tile') {
        const columns = Math.ceil(surfaceWidth / imageWidth);
        const rows = Math.ceil(surfaceHeight / imageHeight);
        if (columns * rows > MAX_TILES) {
            // Scale tiles up until the count fits, rather than drawing thousands.
            const scale = Math.sqrt(columns * rows / MAX_TILES);
            return backgroundDrawRects('tile', position, surfaceWidth, surfaceHeight, imageWidth * scale, imageHeight * scale);
        }
        const rects: DrawRect[] = [];
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                rects.push({ x: column * imageWidth, y: row * imageHeight, width: imageWidth, height: imageHeight });
            }
        }
        return rects;
    }
    const scale = fit === 'cover'
        ? Math.max(surfaceWidth / imageWidth, surfaceHeight / imageHeight)
        : Math.min(surfaceWidth / imageWidth, surfaceHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    const x = position === 'left' ? 0 : position === 'right' ? surfaceWidth - width : (surfaceWidth - width) / 2;
    const y = position === 'top' ? 0 : position === 'bottom' ? surfaceHeight - height : (surfaceHeight - height) / 2;
    return [{ x, y, width, height }];
}

/** Canvas dash pattern for a connector style. */
export function dashFor(style: 'solid' | 'dashed' | 'dotted' | undefined): number[] {
    if (style === 'dashed') return [8, 5];
    if (style === 'dotted') return [2, 4];
    return [];
}
