import { describe, expect, it } from 'vitest';
import {
    DENSITY_CLASS,
    DOT_PX,
    TOKEN_TARGET_PX,
    densityCssVars,
    densityForZoom,
    entitiesCollapse,
    fanOffset,
    overlapDots,
    planTokenLayout,
    tokenPriority,
    type TokenAttachedInput,
    type TokenLocationInput,
} from '../../src/leaflet/ink/tokenLayout';

const FIT = -0.4;

describe('densityForZoom', () => {
    it('steps down as the map zooms out from the fit zoom', () => {
        expect(densityForZoom(FIT + 3, FIT)).toBe('z1');
        expect(densityForZoom(FIT + 1, FIT)).toBe('z2');
        expect(densityForZoom(FIT, FIT)).toBe('z3');
        expect(densityForZoom(FIT - 1, FIT)).toBe('z4');
    });

    it('includes each threshold in the closer density', () => {
        expect(densityForZoom(FIT + 1.5, FIT)).toBe('z1');
        expect(densityForZoom(FIT + 0.5, FIT)).toBe('z2');
        expect(densityForZoom(FIT - 0.5, FIT)).toBe('z3');
        expect(densityForZoom(FIT - 0.51, FIT)).toBe('z4');
    });

    it('puts a typical map view zoom of 0 in the collapsed zone', () => {
        expect(densityForZoom(0, FIT)).toBe('z3');
        expect(densityForZoom(-0.3, FIT)).toBe('z3');
    });

    it('uses full size when a zoom is not finite', () => {
        expect(densityForZoom(Number.NaN, FIT)).toBe('z1');
        expect(densityForZoom(0, Number.POSITIVE_INFINITY)).toBe('z1');
    });

    it('maps each density to its container class', () => {
        expect(DENSITY_CLASS).toEqual({
            z1: 'ink-tokens-z1',
            z2: 'ink-tokens-z2',
            z3: 'ink-tokens-z3',
            z4: 'ink-tokens-z4',
        });
    });
});

describe('entitiesCollapse', () => {
    it('collapses only at z3 and z4', () => {
        expect(entitiesCollapse('z1')).toBe(false);
        expect(entitiesCollapse('z2')).toBe(false);
        expect(entitiesCollapse('z3')).toBe(true);
        expect(entitiesCollapse('z4')).toBe(true);
    });
});

describe('TOKEN_TARGET_PX', () => {
    it('never grows a token past its full size, and shrinks each step', () => {
        expect(TOKEN_TARGET_PX.z1.location).toBe(36);
        expect(TOKEN_TARGET_PX.z1.entity).toBe(28);
        expect(TOKEN_TARGET_PX.z2.location).toBeLessThan(TOKEN_TARGET_PX.z1.location);
        expect(TOKEN_TARGET_PX.z3.location).toBeLessThan(TOKEN_TARGET_PX.z2.location);
        expect(TOKEN_TARGET_PX.z4.location).toBe(DOT_PX);
        expect(DOT_PX).toBe(10);
    });
});

describe('densityCssVars', () => {
    it('gives scale and counter scale for each role, and the counter undoes the scale', () => {
        const vars = densityCssVars('z3');
        expect(vars['--ink-scale-location']).toBe('0.6111');
        expect(vars['--ink-scale-dot']).toBe('0.2778');
        expect(Number(vars['--ink-scale-location']) * Number(vars['--ink-counter-location'])).toBeCloseTo(1, 3);
        expect(Number(vars['--ink-scale-portrait']) * Number(vars['--ink-counter-portrait'])).toBeCloseTo(1, 3);
    });

    it('is exactly 1 at z1 for location and entity', () => {
        const vars = densityCssVars('z1');
        expect(vars['--ink-scale-location']).toBe('1');
        expect(vars['--ink-scale-entity']).toBe('1');
        expect(vars['--ink-counter-location']).toBe('1');
    });
});

describe('fanOffset', () => {
    it('keeps the single-token radius of the original fan at full size', () => {
        const [x, y] = fanOffset(0, 1, 36, 28, -Math.PI / 3);
        expect(Math.hypot(x, y)).toBeCloseTo(36, 6);
        expect(x).toBeCloseTo(18, 6);
        expect(y).toBeCloseTo(-31.1769, 3);
    });

    it('uses a wider radius for several tokens', () => {
        const [x, y] = fanOffset(0, 2, 36, 28);
        expect(Math.hypot(x, y)).toBeCloseTo(38, 6);
    });

    it('spreads tokens evenly around the circle', () => {
        const points = [0, 1, 2, 3].map(i => fanOffset(i, 4, 36, 28));
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
                expect(d).toBeGreaterThan(20);
            }
        }
    });

    it('shrinks with the token sizes', () => {
        const big = fanOffset(0, 1, 36, 28);
        const small = fanOffset(0, 1, 22, 22);
        expect(Math.hypot(small[0], small[1])).toBeLessThan(Math.hypot(big[0], big[1]));
    });
});

describe('tokenPriority', () => {
    it('ranks selected above current above the rest, then by entity count', () => {
        const selected = tokenPriority({ selected: true, entityCount: 0 });
        const current = tokenPriority({ current: true, entityCount: 500 });
        const plain = tokenPriority({ entityCount: 500 });
        const busy = tokenPriority({ entityCount: 9 });
        expect(selected).toBeGreaterThan(current);
        expect(current).toBeGreaterThan(plain);
        expect(plain).toBeGreaterThan(tokenPriority({ entityCount: 2 }));
        expect(busy).toBeGreaterThan(tokenPriority({ entityCount: 2 }));
    });

    it('treats bad counts as zero', () => {
        expect(tokenPriority({ entityCount: Number.NaN })).toBe(0);
        expect(tokenPriority({ entityCount: -4 })).toBe(0);
    });
});

describe('overlapDots', () => {
    it('keeps circles that do not touch', () => {
        const dotted = overlapDots([
            { id: 'a', x: 0, y: 0, radius: 10, priority: 1 },
            { id: 'b', x: 100, y: 0, radius: 10, priority: 1 },
        ]);
        expect(dotted.size).toBe(0);
    });

    it('turns the lower-priority circle of an overlapping pair into a dot', () => {
        const dotted = overlapDots([
            { id: 'low', x: 0, y: 0, radius: 18, priority: 1 },
            { id: 'high', x: 20, y: 0, radius: 18, priority: 5 },
        ]);
        expect([...dotted]).toEqual(['low']);
    });

    it('counts the gap: circles that just touch within the gap still clash', () => {
        const circles = [
            { id: 'a', x: 0, y: 0, radius: 10, priority: 2 },
            { id: 'b', x: 21, y: 0, radius: 10, priority: 1 },
        ];
        expect(overlapDots(circles, 2).has('b')).toBe(true);
        expect(overlapDots(circles, 0).has('b')).toBe(false);
    });

    it('is deterministic and does not depend on input order', () => {
        const base = [
            { id: 'c', x: 0, y: 0, radius: 11, priority: 0 },
            { id: 'a', x: 10, y: 0, radius: 11, priority: 0 },
            { id: 'b', x: 20, y: 0, radius: 11, priority: 0 },
            { id: 'd', x: 200, y: 0, radius: 11, priority: 0 },
        ];
        const first = [...overlapDots(base)].sort();
        const second = [...overlapDots([...base].reverse())].sort();
        expect(first).toEqual(second);
        // Equal priority: ids a, b, c sort first, so a is kept and b and c are dotted.
        expect(first).toEqual(['b', 'c']);
    });

    it('lets a dot not block a later circle', () => {
        const dotted = overlapDots([
            { id: 'top', x: 0, y: 0, radius: 11, priority: 9 },
            { id: 'mid', x: 15, y: 0, radius: 11, priority: 5 },
            { id: 'far', x: 40, y: 0, radius: 11, priority: 1 },
        ]);
        expect([...dotted].sort()).toEqual(['mid']);
    });

    it('handles a cluster of 200 circles quickly and deterministically', () => {
        const circles: TokenLocationInput[] = [];
        for (let i = 0; i < 200; i++) circles.push({ key: `k${i}`, x: (i % 20) * 12, y: Math.floor(i / 20) * 12, priority: i % 7 });
        const started = Date.now();
        const dotted = overlapDots(circles.map(c => ({ id: c.key, x: c.x, y: c.y, radius: 11, priority: c.priority })));
        expect(Date.now() - started).toBeLessThan(500);
        expect(dotted.size).toBeGreaterThan(0);
        expect(dotted.size).toBeLessThan(200);
    });
});

describe('planTokenLayout', () => {
    const locations: TokenLocationInput[] = [
        { key: 'shire', x: 100, y: 100, priority: 3 },
        { key: 'bree', x: 110, y: 104, priority: 1 },
        { key: 'rivendell', x: 400, y: 300, priority: 2 },
    ];
    const attached: TokenAttachedInput[] = [
        { key: 'e1', locationKey: 'shire', kind: 'entity', portrait: false },
        { key: 'e2', locationKey: 'shire', kind: 'entity', portrait: true },
        { key: 'p1', locationKey: 'rivendell', kind: 'portal', portrait: false },
    ];

    it('shows entities fanned out at z1 and z2, with the overlap guard applied', () => {
        const close = planTokenLayout(FIT + 2, FIT, locations, attached);
        expect(close.density).toBe('z1');
        expect(close.collapsed.size).toBe(0);
        expect(close.offsets.has('e1')).toBe(true);
        expect(close.offsets.has('e2')).toBe(true);
        expect([...close.dotted]).toEqual(['bree']);
    });

    it('collapses entities but keeps portals at z3', () => {
        const far = planTokenLayout(0, FIT, locations, attached);
        expect(far.density).toBe('z3');
        expect([...far.collapsed].sort()).toEqual(['e1', 'e2']);
        expect(far.offsets.has('e1')).toBe(false);
        expect(far.offsets.has('p1')).toBe(true);
    });

    it('turns every location into a dot and hides entities at z4', () => {
        const overview = planTokenLayout(FIT - 2, FIT, locations, attached);
        expect(overview.density).toBe('z4');
        expect([...overview.dotted].sort()).toEqual(['bree', 'rivendell', 'shire']);
        expect(overview.collapsed.has('e1')).toBe(true);
    });

    it('hides the entities of a location that is a dot', () => {
        const plan = planTokenLayout(FIT + 2, FIT, locations, attached);
        expect(plan.dotted.has('bree')).toBe(true);
        const withBree: TokenAttachedInput[] = [{ key: 'e9', locationKey: 'bree', kind: 'entity', portrait: false }];
        const hidden = planTokenLayout(FIT + 2, FIT, locations, withBree);
        expect(hidden.collapsed.has('e9')).toBe(true);
        expect(hidden.offsets.has('e9')).toBe(false);
    });

    it('fans out shown tokens only, so hidden entities do not reserve a slot', () => {
        const onlyPortal: TokenAttachedInput[] = [
            { key: 'p1', locationKey: 'rivendell', kind: 'portal', portrait: false },
            { key: 'e3', locationKey: 'rivendell', kind: 'entity', portrait: false },
        ];
        const plan = planTokenLayout(FIT + 2, FIT, locations, onlyPortal);
        // Both shown at z1: a group of two, so the portal is index 0 of 2.
        expect(plan.offsets.get('p1')).toBeDefined();
        const far = planTokenLayout(FIT, FIT, locations, onlyPortal);
        const single = fanOffset(0, 1, TOKEN_TARGET_PX.z3.location, TOKEN_TARGET_PX.z3.location, -Math.PI / 4);
        expect(far.offsets.get('p1')).toEqual(single);
    });

    it('is pure: the same input gives the same plan', () => {
        const a = planTokenLayout(FIT + 1, FIT, locations, attached);
        const b = planTokenLayout(FIT + 1, FIT, [...locations].reverse(), attached);
        expect([...a.dotted].sort()).toEqual([...b.dotted].sort());
        expect(a.containerClass).toBe(b.containerClass);
    });
});
