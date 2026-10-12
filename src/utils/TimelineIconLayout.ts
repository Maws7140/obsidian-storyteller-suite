/**
 * Pure layout rules for icons on the timeline: the display mode, marker pitch,
 * bar and card sizes. No canvas or Obsidian access, so the decisions can be
 * unit tested. NativeTimelineRenderer applies them while it draws.
 */

/** off: plain dots and bars. icons: icons on markers, bars and cards. images: also cover image strips on cards. */
export type TimelineIconMode = 'off' | 'icons' | 'images';

/** Parse a stored or block-supplied mode. Returns undefined for anything else. */
export function parseTimelineIconMode(value: unknown): TimelineIconMode | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase();
    if (v === 'off' || v === 'icons' || v === 'images') return v;
    return undefined;
}

/**
 * The mode when a view has none saved: follows the plugin setting that turns
 * icons on or off for the whole timeline.
 */
export function defaultTimelineIconMode(showIcons: boolean | undefined): TimelineIconMode {
    return showIcons === false ? 'off' : 'icons';
}

/** Centre-to-centre distance, in pixels, below which an axis marker keeps its plain dot. */
export const MARKER_ICON_MIN_PITCH = 12;

/**
 * For each marker position along an axis, whether it has room for an icon disc.
 *
 * Markers that round to the same pixel share one column and are judged together,
 * since a column stands for one spot on the axis. A column may draw an icon only
 * when the nearest other column is at least MARKER_ICON_MIN_PITCH away.
 */
export function markerIconRoom(positions: readonly number[], minPitch = MARKER_ICON_MIN_PITCH): boolean[] {
    const columns = Array.from(new Set(positions.map(p => Math.round(p)))).sort((a, b) => a - b);
    const roomy = new Map<number, boolean>();
    columns.forEach((column, index) => {
        const before = index > 0 ? column - columns[index - 1] : Number.POSITIVE_INFINITY;
        const after = index < columns.length - 1 ? columns[index + 1] - column : Number.POSITIVE_INFINITY;
        roomy.set(column, Math.min(before, after) >= minPitch);
    });
    return positions.map(p => roomy.get(Math.round(p)) === true);
}

/** Icon disc diameter on a marker, in pixels. */
export const MARKER_DISC_SIZE = 18;
/** Glyph size inside a disc. */
export const MARKER_GLYPH_SIZE = 13;

/** Bars must be at least this tall and this wide to carry an icon. */
export const BAR_ICON_MIN_HEIGHT = 14;
export const BAR_ICON_MIN_WIDTH = 40;
export const BAR_ICON_SIZE = 14;
export const BAR_ICON_INSET = 4;

/** Whether a bar of this size gets an icon at its start. */
export function barShowsIcon(width: number, height: number): boolean {
    return height >= BAR_ICON_MIN_HEIGHT && width >= BAR_ICON_MIN_WIDTH;
}

/** Horizontal room the bar icon takes, so its label starts after it. */
export function barIconLabelOffset(): number {
    return BAR_ICON_INSET + BAR_ICON_SIZE + BAR_ICON_INSET;
}

/** Height of a card's title and detail area, before any image strip. */
export const CARD_TEXT_HEIGHT = 42;
/** Icon size left of a card title. */
export const CARD_ICON_SIZE = 20;
/** Horizontal space from the card edge to its text when an icon is shown. */
export const CARD_TEXT_INSET_WITH_ICON = 36;
/** Horizontal space from the card edge to its text without an icon. */
export const CARD_TEXT_INSET = 10;

/** Height of a 16:9 strip for a card of this width. */
export function cardImageStripHeight(cardWidth: number): number {
    if (!Number.isFinite(cardWidth) || cardWidth <= 0) return 0;
    return Math.round(cardWidth * 9 / 16);
}

/**
 * Whole card height. Cards without an image keep the text height, so only
 * photo cards grow.
 */
export function cardHeightWithImage(cardWidth: number, hasImageStrip: boolean, textHeight = CARD_TEXT_HEIGHT): number {
    return hasImageStrip ? textHeight + cardImageStripHeight(cardWidth) : textHeight;
}

/** The image strip shows only in "Icons and images" mode, and only for a note with a cover image. */
export function cardShowsImageStrip(mode: TimelineIconMode, coverPath: string | undefined): boolean {
    return mode === 'images' && typeof coverPath === 'string' && coverPath.trim() !== '';
}
