import { describe, expect, it } from 'vitest';
import {
  bounds,
  distanceToPolyline,
  nearestVertex,
  offsetPolyline,
  pointInPolygon,
  pointNearPolyline,
  polylinePath,
  railwaySegments,
  rectsIntersect,
  rotatePoint,
  simplify,
  smoothPath,
  tickSegments,
  wavePath,
  wavePoints,
} from '../../src/leaflet/ink/geometry';

describe('simplify', () => {
  it('removes near-collinear points and keeps the ends', () => {
    const out = simplify([{ x: 0, y: 0 }, { x: 1, y: 0.01 }, { x: 2, y: 0 }, { x: 3, y: 0 }], 0.1);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
  });

  it('keeps corners farther than the tolerance', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    expect(simplify(pts, 1)).toHaveLength(3);
  });

  it('returns copies, does not mutate, and keeps everything at tolerance 0', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    const snapshot = JSON.stringify(pts);
    const out = simplify(pts, 0);
    expect(out).toEqual(pts);
    expect(out[0]).not.toBe(pts[0]);
    expect(JSON.stringify(pts)).toBe(snapshot);
  });
});

describe('smoothPath', () => {
  it('returns empty string for no points and a move for one', () => {
    expect(smoothPath([], false)).toBe('');
    expect(smoothPath([{ x: 3, y: 4 }], false)).toBe('M3 4');
  });

  it('draws one cubic segment per gap on an open path', () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }], false);
    expect(d.startsWith('M0 0 C')).toBe(true);
    expect(d.split('C')).toHaveLength(4);
    expect(d.endsWith('Z')).toBe(false);
    expect(d.endsWith('30 10')).toBe(true);
  });

  it('closes a closed path with Z and one segment per point', () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], true);
    expect(d.split('C')).toHaveLength(4);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('polylinePath', () => {
  it('builds M then L commands', () => {
    expect(polylinePath([{ x: 0, y: 0 }, { x: 1, y: 2 }])).toBe('M0 0 L1 2');
    expect(polylinePath([])).toBe('');
  });
});

describe('offsetPolyline', () => {
  it('pushes a horizontal line to a fixed side', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2);
    for (const p of out) expect(p.y).toBeCloseTo(2);
    expect(out.map(p => p.x)).toEqual([0, 10]);
  });

  it('keeps a bent line parallel at the corner', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 1);
    expect(out[1].x).toBeCloseTo(9);
    expect(out[1].y).toBeCloseTo(1);
  });
});

describe('waves', () => {
  it('stays on the line with zero amplitude', () => {
    for (const p of wavePoints([{ x: 0, y: 0 }, { x: 20, y: 0 }], 0, 5)) expect(p.y).toBeCloseTo(0);
  });

  it('swings within the amplitude and returns path data', () => {
    const pts = wavePoints([{ x: 0, y: 0 }, { x: 40, y: 0 }], 2, 10);
    const maxY = Math.max(...pts.map(p => Math.abs(p.y)));
    expect(maxY).toBeLessThanOrEqual(2 + 1e-9);
    expect(maxY).toBeGreaterThan(1);
    expect(wavePath([{ x: 0, y: 0 }, { x: 40, y: 0 }], 2, 10).startsWith('M')).toBe(true);
  });
});

describe('tickSegments and railwaySegments', () => {
  it('places ticks every spacing pixels including both ends', () => {
    const ticks = tickSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, 4, 'both');
    expect(ticks).toHaveLength(6);
    expect(ticks[0][0].y).toBeCloseTo(-2);
    expect(ticks[0][1].y).toBeCloseTo(2);
    expect(ticks[0][0].x).toBeCloseTo(0);
  });

  it('draws one-sided ticks from the line', () => {
    const ticks = tickSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5, 3, 'left');
    expect(ticks).toHaveLength(3);
    expect(ticks[0][0]).toEqual({ x: 0, y: 0 });
    expect(ticks[0][1].y).toBeCloseTo(3);
  });

  it('railway ties match both-sided ticks', () => {
    const line = [{ x: 0, y: 0 }, { x: 30, y: 0 }];
    expect(railwaySegments(line, 6, 5)).toEqual(tickSegments(line, 6, 5, 'both'));
  });

  it('returns nothing for degenerate input', () => {
    expect(tickSegments([{ x: 0, y: 0 }], 2, 2, 'both')).toEqual([]);
    expect(tickSegments([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0, 2, 'both')).toEqual([]);
  });
});

describe('bounds', () => {
  it('returns null for no points', () => {
    expect(bounds([])).toBeNull();
  });

  it('returns the box around the points', () => {
    expect(bounds([{ x: 1, y: 5 }, { x: -2, y: 3 }, { x: 4, y: -1 }])).toEqual({ minX: -2, minY: -1, maxX: 4, maxY: 5 });
  });
});

describe('hit tests', () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];

  it('measures distance to a segment, not its infinite line', () => {
    expect(distanceToPolyline({ x: 15, y: 0 }, line)).toBeCloseTo(5);
    expect(distanceToPolyline({ x: 5, y: 3 }, line)).toBeCloseTo(3);
  });

  it('checks pointNearPolyline against a tolerance', () => {
    expect(pointNearPolyline({ x: 5, y: 1 }, line, 1.5)).toBe(true);
    expect(pointNearPolyline({ x: 5, y: 3 }, line, 1.5)).toBe(false);
  });

  it('finds points inside a polygon', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
  });

  it('checks rectangle overlap, including touching edges', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(rectsIntersect(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
    expect(rectsIntersect(a, { minX: 20, minY: 0, maxX: 30, maxY: 10 })).toBe(false);
    expect(rectsIntersect(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true);
  });

  it('finds the nearest vertex within a limit', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const hit = nearestVertex({ x: 9, y: 1 }, pts);
    expect(hit?.index).toBe(1);
    expect(hit?.distance).toBeCloseTo(Math.SQRT2);
    expect(nearestVertex({ x: 9, y: 1 }, pts, 0.5)).toBeUndefined();
    expect(nearestVertex({ x: 0, y: 0 }, [])).toBeUndefined();
  });
});

describe('rotatePoint', () => {
  it('rotates clockwise on screen around a centre', () => {
    const out = rotatePoint({ x: 11, y: 10 }, { x: 10, y: 10 }, 90);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(11);
  });

  it('leaves the centre fixed', () => {
    expect(rotatePoint({ x: 3, y: 4 }, { x: 3, y: 4 }, 123)).toEqual({ x: 3, y: 4 });
  });

  it('distance from the centre is unchanged', () => {
    const out = rotatePoint({ x: 7, y: 2 }, { x: 1, y: 1 }, 37);
    expect(Math.hypot(out.x - 1, out.y - 1)).toBeCloseTo(Math.hypot(6, 1));
  });
});
