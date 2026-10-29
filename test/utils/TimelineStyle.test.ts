import { describe, expect, it } from 'vitest';
import { OBSIDIAN_NATIVE_THEME, type TimelineTheme } from '../../src/calendar/TimelineDocuments';
import { BUILTIN_TIMELINE_THEMES, PARCHMENT_THEME } from '../../src/calendar/themes';
import {
    DEFAULT_TIMELINE_METRICS,
    DEFAULT_TIMELINE_PALETTE,
    TIMELINE_COLOR_ROLES,
    TIMELINE_THEME_VARIABLES,
    axisLabelSpacing,
    backgroundDrawRects,
    dashFor,
    laneVariable,
    resolveTimelineBackground,
    resolveTimelineMetrics,
    resolveTimelineStyle,
    rowHeightFor,
    themeCssVariables,
} from '../../src/utils/TimelineStyle';

/** A stand-in for getComputedStyle: the stylesheet, then inline theme values on top. */
function cascade(stylesheet: Record<string, string>, theme: TimelineTheme): (name: string) => string {
    const inline = themeCssVariables(theme);
    return name => inline[name] ?? stylesheet[name] ?? '';
}

describe('timeline theme variables', () => {
    it('sets nothing for the native theme, so Obsidian and snippets decide', () => {
        expect(themeCssVariables(OBSIDIAN_NATIVE_THEME)).toEqual({});
    });

    it('maps each colour a theme sets onto its variable, and only those', () => {
        const variables = themeCssVariables({ id: 't', name: 'T', colors: { accent: '#ff0000', era: 'teal' } });
        expect(variables).toEqual({
            '--sts-timeline-accent': '#ff0000',
            '--sts-timeline-era': 'teal',
        });
    });

    it('writes the palette as numbered lane variables with a count', () => {
        const variables = themeCssVariables({ id: 't', name: 'T', palette: ['#111111', '#222222', '#333333'] });
        expect(variables['--sts-timeline-lane-count']).toBe('3');
        expect(variables[laneVariable(0)]).toBe('#111111');
        expect(variables[laneVariable(2)]).toBe('#333333');
        expect(variables[laneVariable(3)]).toBeUndefined();
    });

    it('lists every variable a theme can set, so switching themes can clear them', () => {
        const all = new Set(TIMELINE_THEME_VARIABLES);
        for (const theme of BUILTIN_TIMELINE_THEMES) {
            for (const name of Object.keys(themeCssVariables(theme))) expect(all.has(name)).toBe(true);
        }
    });

    it('gives every colour role a distinct variable', () => {
        const names = Object.values(TIMELINE_COLOR_ROLES).map(spec => spec.variable);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('resolving the style the canvas paints with', () => {
    it('reads the stylesheet when the theme sets nothing', () => {
        const style = resolveTimelineStyle(cascade({ '--sts-timeline-background': '#202020' }, OBSIDIAN_NATIVE_THEME), OBSIDIAN_NATIVE_THEME);
        expect(style.colors.background).toBe('#202020');
    });

    it('lets a theme colour win over the stylesheet, as an inline variable does', () => {
        const theme: TimelineTheme = { id: 't', name: 'T', colors: { background: '#fafafa' } };
        const style = resolveTimelineStyle(cascade({ '--sts-timeline-background': '#202020' }, theme), theme);
        expect(style.colors.background).toBe('#fafafa');
    });

    it('falls back to the theme, then to fixed defaults, with nothing to read', () => {
        const theme: TimelineTheme = { id: 't', name: 'T', colors: { text: '#123456' } };
        const style = resolveTimelineStyle(() => '', theme);
        expect(style.colors.text).toBe('#123456');
        expect(style.colors.background).toBe(TIMELINE_COLOR_ROLES.background.fallback);
        expect(style.font).toBe('sans-serif');
    });

    it('uses a theme palette of any length', () => {
        const theme: TimelineTheme = { id: 't', name: 'T', palette: ['#010101', '#020202'] };
        expect(resolveTimelineStyle(cascade({}, theme), theme).palette).toEqual(['#010101', '#020202']);
        expect(resolveTimelineStyle(() => '', theme).palette).toEqual(['#010101', '#020202']);
    });

    it('reads a snippet palette through the lane count', () => {
        const sheet = { '--sts-timeline-lane-count': '2', [laneVariable(0)]: '#aa0000', [laneVariable(1)]: '#00aa00' };
        expect(resolveTimelineStyle(cascade(sheet, OBSIDIAN_NATIVE_THEME), OBSIDIAN_NATIVE_THEME).palette).toEqual(['#aa0000', '#00aa00']);
    });

    it('defaults to the ten-colour palette', () => {
        expect(resolveTimelineStyle(() => '', OBSIDIAN_NATIVE_THEME).palette).toEqual(DEFAULT_TIMELINE_PALETTE);
    });

    it('takes the label font from the theme', () => {
        expect(resolveTimelineStyle(cascade({}, PARCHMENT_THEME), PARCHMENT_THEME).font).toContain('Georgia');
    });
});

describe('theme shape settings', () => {
    it('keeps the timeline exactly as it was for the native theme', () => {
        const metrics = resolveTimelineMetrics(OBSIDIAN_NATIVE_THEME);
        expect(metrics).toEqual({ ...DEFAULT_TIMELINE_METRICS, dependencyStyle: undefined });
        expect(metrics.laneLabelWidth).toBe(174);
    });

    it('clamps values the layout cannot draw', () => {
        const metrics = resolveTimelineMetrics({
            id: 't', name: 'T',
            event: { radius: -4, height: 500, opacity: 0 },
            lane: { labelWidth: 9000, gap: -1, height: 1 },
            connectors: { width: 100 },
        });
        expect(metrics.eventRadius).toBe(0);
        expect(metrics.eventHeight).toBe(48);
        expect(metrics.eventOpacity).toBe(0.2);
        expect(metrics.laneLabelWidth).toBe(400);
        expect(metrics.laneGap).toBe(0);
        expect(metrics.laneMinHeight).toBe(20);
        expect(metrics.connectorWidth).toBe(6);
    });

    it('leaves the arrow style to the setting unless the theme names one', () => {
        expect(resolveTimelineMetrics(OBSIDIAN_NATIVE_THEME).dependencyStyle).toBeUndefined();
        expect(resolveTimelineMetrics(PARCHMENT_THEME).dependencyStyle).toBe('dashed');
    });

    it('keeps the old axis spacing at the default density', () => {
        expect(axisLabelSpacing(50, 120)).toBe(120);
        expect(axisLabelSpacing(100, 120)).toBe(80);
        expect(axisLabelSpacing(0, 120)).toBe(240);
    });

    it('grows rows with the chip height and loosens them as density drops', () => {
        expect(rowHeightFor(24, 50)).toBe(31);
        expect(rowHeightFor(36, 50)).toBe(43);
        expect(rowHeightFor(24, 0)).toBeGreaterThan(rowHeightFor(24, 100));
        // Never tighter than the chip itself.
        expect(rowHeightFor(24, 100)).toBeGreaterThanOrEqual(26);
    });

    it('maps arrow styles to dash patterns', () => {
        expect(dashFor('solid')).toEqual([]);
        expect(dashFor(undefined)).toEqual([]);
        expect(dashFor('dashed')).toEqual([8, 5]);
        expect(dashFor('dotted')).toEqual([2, 4]);
    });
});

describe('background image', () => {
    it('is off without an image', () => {
        expect(resolveTimelineBackground(OBSIDIAN_NATIVE_THEME)).toBeNull();
        expect(resolveTimelineBackground({ id: 't', name: 'T', background: { image: '  ' } })).toBeNull();
    });

    it('defaults to a faint, centred cover', () => {
        expect(resolveTimelineBackground({ id: 't', name: 'T', background: { image: 'maps/world.png' } })).toEqual({
            image: 'maps/world.png', fit: 'cover', position: 'center', opacity: 0.35, blur: 0,
        });
    });

    it('covers the surface, cropping the overflowing axis evenly', () => {
        const [rect] = backgroundDrawRects('cover', 'center', 400, 200, 100, 100);
        expect(rect).toEqual({ x: 0, y: -100, width: 400, height: 400 });
    });

    it('anchors a cover image to the requested edge', () => {
        expect(backgroundDrawRects('cover', 'top', 400, 200, 100, 100)[0].y).toBe(0);
        expect(backgroundDrawRects('cover', 'bottom', 400, 200, 100, 100)[0].y).toBe(-200);
    });

    it('contains the image inside the surface', () => {
        const [rect] = backgroundDrawRects('contain', 'center', 400, 200, 100, 100);
        expect(rect).toEqual({ x: 100, y: 0, width: 200, height: 200 });
        expect(backgroundDrawRects('contain', 'left', 400, 200, 100, 100)[0].x).toBe(0);
        expect(backgroundDrawRects('contain', 'right', 400, 200, 100, 100)[0].x).toBe(200);
    });

    it('stretches over the whole surface', () => {
        expect(backgroundDrawRects('stretch', 'center', 300, 120, 50, 80)).toEqual([{ x: 0, y: 0, width: 300, height: 120 }]);
    });

    it('tiles at native size, and caps the tile count for tiny images', () => {
        expect(backgroundDrawRects('tile', 'center', 250, 100, 100, 100)).toHaveLength(3);
        const tiny = backgroundDrawRects('tile', 'center', 4000, 4000, 1, 1);
        expect(tiny.length).toBeLessThanOrEqual(600);
        expect(tiny.length).toBeGreaterThan(0);
    });

    it('draws nothing onto an empty surface or from an empty image', () => {
        expect(backgroundDrawRects('cover', 'center', 0, 100, 10, 10)).toEqual([]);
        expect(backgroundDrawRects('cover', 'center', 100, 100, 0, 10)).toEqual([]);
    });
});
