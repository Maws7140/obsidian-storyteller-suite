import { describe, expect, it } from 'vitest';
import { maxVerticalCardTiers, placeAlternatingTimelineCards, verticalCardWidth } from '../../src/utils/TimelineCardLayout';

describe('placeAlternatingTimelineCards', () => {
  it('alternates chronological cards above and below the axis', () => {
    const placed = placeAlternatingTimelineCards(
      [10, 20, 30, 40].map(value => ({ value, position: value })),
      0,
      100,
      20,
    );
    expect(placed.map(item => item.above)).toEqual([true, false, true, false]);
  });

  it('puts colliding cards in perpendicular tiers without moving their dates', () => {
    const placed = placeAlternatingTimelineCards(
      [50, 51, 52, 53].map(value => ({ value, position: value })),
      0,
      120,
      30,
      10,
    );
    const above = placed.filter(item => item.above);
    const below = placed.filter(item => !item.above);
    expect(above.map(item => item.placedPosition)).toEqual([50, 52]);
    expect(below.map(item => item.placedPosition)).toEqual([51, 53]);
    expect(above.map(item => item.tier)).toEqual([0, 1]);
    expect(below.map(item => item.tier)).toEqual([0, 1]);
    expect(placed.map(item => item.value)).toEqual([50, 51, 52, 53]);
  });

  it('does not pin cards to viewport edges while their markers pan', () => {
    const placed = placeAlternatingTimelineCards(
      [-20, 120].map(value => ({ value, position: value })),
      0,
      100,
      20,
    );
    expect(placed[0].placedPosition).toBe(-20);
    expect(placed[1].placedPosition).toBe(120);
  });

  it('can keep all cards on one side for a narrow vertical view', () => {
    const placed = placeAlternatingTimelineCards(
      [40, 41, 42].map(value => ({ value, position: value })),
      0,
      100,
      20,
      8,
      false,
    );
    expect(placed.every(item => item.above)).toBe(true);
    expect(placed.map(item => item.tier)).toEqual([0, 1, 2]);
  });
});

describe('vertical card columns', () => {
  it('fits only as many readable columns as the side width allows', () => {
    expect(maxVerticalCardTiers(150)).toBe(1);
    expect(maxVerticalCardTiers(412)).toBe(2);
    expect(maxVerticalCardTiers(712)).toBe(4);
    expect(maxVerticalCardTiers(0)).toBe(1);
  });

  it('gives a lone card up to 220 px and shares the side between columns', () => {
    expect(verticalCardWidth(712, 1)).toBe(220);
    expect(verticalCardWidth(412, 2)).toBe(200);
  });

  it('never narrows below the degenerate floor on a tiny canvas', () => {
    expect(verticalCardWidth(40, 1)).toBe(88);
  });
});
