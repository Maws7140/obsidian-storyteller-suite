import { describe, expect, it } from 'vitest';
import {
    BAR_ICON_INSET,
    BAR_ICON_SIZE,
    barIconLabelOffset,
    barShowsIcon,
    cardHeightWithImage,
    cardImageStripHeight,
    cardShowsImageStrip,
    defaultTimelineIconMode,
    markerIconRoom,
    parseTimelineIconMode
} from '../../src/utils/TimelineIconLayout';
import { placeAlternatingTimelineCards, verticalCardWidth } from '../../src/utils/TimelineCardLayout';

describe('parseTimelineIconMode', () => {
    it('accepts the three modes, ignoring case and spaces', () => {
        expect(parseTimelineIconMode('off')).toBe('off');
        expect(parseTimelineIconMode(' Icons ')).toBe('icons');
        expect(parseTimelineIconMode('IMAGES')).toBe('images');
    });

    it('returns undefined for anything else', () => {
        expect(parseTimelineIconMode('on')).toBeUndefined();
        expect(parseTimelineIconMode('')).toBeUndefined();
        expect(parseTimelineIconMode(undefined)).toBeUndefined();
        expect(parseTimelineIconMode(true)).toBeUndefined();
    });
});

describe('defaultTimelineIconMode', () => {
    it('follows the timelineShowIcons setting', () => {
        expect(defaultTimelineIconMode(false)).toBe('off');
        expect(defaultTimelineIconMode(true)).toBe('icons');
        expect(defaultTimelineIconMode(undefined)).toBe('icons');
    });
});

describe('markerIconRoom', () => {
    it('gives every marker room when the axis is spread out', () => {
        expect(markerIconRoom([10, 40, 90])).toEqual([true, true, true]);
    });

    it('keeps a dot where a neighbour is closer than 12 px centre to centre', () => {
        // 0 and 11 are too close; 40 has room.
        expect(markerIconRoom([0, 11, 40])).toEqual([false, false, true]);
    });

    it('measures the nearest neighbour on either side', () => {
        expect(markerIconRoom([0, 20, 25])).toEqual([true, false, false]);
    });

    it('judges markers in the same pixel column together', () => {
        // Two markers share x=50 and form one column; the lone marker at 80 is 30 px away.
        expect(markerIconRoom([50, 50, 80])).toEqual([true, true, true]);
        // The shared column is 6 px from its neighbour, so both members keep dots.
        expect(markerIconRoom([50, 50, 56])).toEqual([false, false, false]);
    });

    it('respects a custom minimum pitch', () => {
        expect(markerIconRoom([0, 15], 20)).toEqual([false, false]);
    });

    it('returns an empty list for no markers', () => {
        expect(markerIconRoom([])).toEqual([]);
    });
});

describe('bar icons', () => {
    it('needs at least 14 px of height and 40 px of width', () => {
        expect(barShowsIcon(40, 14)).toBe(true);
        expect(barShowsIcon(39, 20)).toBe(false);
        expect(barShowsIcon(200, 13)).toBe(false);
    });

    it('shifts the label past the inset, icon and gap', () => {
        expect(barIconLabelOffset()).toBe(BAR_ICON_INSET + BAR_ICON_SIZE + BAR_ICON_INSET);
        expect(barIconLabelOffset()).toBe(22);
    });
});

describe('card heights with an image strip', () => {
    it('keeps the text height for cards without an image', () => {
        expect(cardHeightWithImage(180, false)).toBe(42);
    });

    it('adds a 16:9 strip below the text', () => {
        expect(cardImageStripHeight(160)).toBe(90);
        expect(cardHeightWithImage(160, true)).toBe(42 + 90);
        expect(cardHeightWithImage(210, true)).toBe(42 + 118);
    });

    it('gives no strip for a card with no width', () => {
        expect(cardImageStripHeight(0)).toBe(0);
        expect(cardImageStripHeight(Number.NaN)).toBe(0);
    });

    it('shows the strip only in images mode with a cover path', () => {
        expect(cardShowsImageStrip('images', 'Img/hero.png')).toBe(true);
        expect(cardShowsImageStrip('icons', 'Img/hero.png')).toBe(false);
        expect(cardShowsImageStrip('off', 'Img/hero.png')).toBe(false);
        expect(cardShowsImageStrip('images', '   ')).toBe(false);
        expect(cardShowsImageStrip('images', undefined)).toBe(false);
    });
});

describe('vertical placement with per-card extents', () => {
    it('lets a taller photo card take its own tier without overlapping a text card', () => {
        const points = [
            { value: 'photo', position: 100 },
            { value: 'text', position: 130 }
        ];
        // Text cards are 42 px tall; the photo card is 140 px tall, so the text card
        // (starting at 130 - 21 = 109) cannot share its column (which ends at 170).
        const extent = (value: string) => value === 'photo' ? 140 : 42;
        const placed = placeAlternatingTimelineCards(points, 0, 400, extent, 8, false);
        expect(placed.find(p => p.value === 'photo')?.tier).toBe(0);
        expect(placed.find(p => p.value === 'text')?.tier).toBe(1);
    });

    it('still packs text cards into one column when they are far apart', () => {
        const points = [
            { value: 'a', position: 0 },
            { value: 'b', position: 200 }
        ];
        const placed = placeAlternatingTimelineCards(points, 0, 400, () => 42, 8, false);
        expect(placed.map(p => p.tier)).toEqual([0, 0]);
    });

    it('keeps the numeric form working for text-only layouts', () => {
        const points = [{ value: 'a', position: 0 }, { value: 'b', position: 10 }];
        const placed = placeAlternatingTimelineCards(points, 0, 400, 42, 8, false);
        expect(placed.map(p => p.tier)).toEqual([0, 1]);
    });
});

describe('verticalCardWidth for photo card heights', () => {
    it('narrows the photo strip as more columns share a side', () => {
        const one = cardHeightWithImage(verticalCardWidth(400, 1), true);
        const three = cardHeightWithImage(verticalCardWidth(400, 3), true);
        expect(one).toBeGreaterThan(three);
    });
});

import { NODE_GAP, NODE_SIZE, nodeGlyphSize, placeIconNodes } from '../../src/utils/TimelineIconLayout';

describe('icon nodes mode', () => {
    it('parses nodes', () => {
        expect(parseTimelineIconMode('Nodes')).toBe('nodes');
    });

    it('keeps spread out nodes on the axis', () => {
        expect(placeIconNodes([0, 100, 200])).toEqual([0, 0, 0]);
    });

    it('moves crowded nodes off the axis, alternating sides', () => {
        expect(placeIconNodes([0, 5, 10, 15])).toEqual([0, -1, 1, -2]);
    });

    it('reuses a tier once the previous node there is a pitch away', () => {
        const pitch = NODE_SIZE + NODE_GAP;
        expect(placeIconNodes([0, 5, pitch, pitch + 5])).toEqual([0, -1, 0, -1]);
    });

    it('handles positions in any order', () => {
        expect(placeIconNodes([10, 0])).toEqual([-1, 0]);
    });

    it('uses one side only when asked', () => {
        expect(placeIconNodes([0, 1, 2], 36, 4, false)).toEqual([0, 1, 2]);
    });

    it('overlaps in the tier that frees up first when every tier is full', () => {
        expect(placeIconNodes([0, 1, 2, 3], 36, 1)).toEqual([0, -1, 1, 0]);
    });

    it('sizes the glyph inside a node', () => {
        expect(nodeGlyphSize(30)).toBe(18);
    });
});
