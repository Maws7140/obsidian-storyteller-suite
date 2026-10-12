/**
 * Map Ink token layout: how entity and location tokens change with the map zoom.
 *
 * The zoom is read relative to the fit zoom (the zoom at which the whole image fits the view).
 * Four densities step down as the map zooms out:
 *   z1  close: full-size tokens, entities fanned out around their location
 *   z2  medium: smaller tokens, entities still fanned out
 *   z3  far: small tokens, attached entities collapsed into the location's count pill
 *   z4  overview: every location is a dot, attached entities hidden
 * Locations that would overlap a larger, higher-priority location at the current zoom become dots too.
 *
 * Everything here is in screen pixels. Callers turn the plan into classes, CSS variables and
 * marker positions. The module does no DOM or Leaflet work, so it is unit-tested with vitest and
 * reused by the browser harness.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no imports from outside this folder.
 */

import { TOKEN_SIZES } from './tokens';

export type TokenDensity = 'z1' | 'z2' | 'z3' | 'z4';

/** Class set on the map container for each density. */
export const DENSITY_CLASS: Readonly<Record<TokenDensity, string>> = {
    z1: 'ink-tokens-z1',
    z2: 'ink-tokens-z2',
    z3: 'ink-tokens-z3',
    z4: 'ink-tokens-z4',
};

/** Diameter of a location dot in screen pixels. */
export const DOT_PX = 10;

/**
 * Smallest (zoom - fitZoom) for each density, checked from z1 down. Below the z3 step a location is a dot.
 * With the fit zoom at about -0.4 on a typical map view, zoom 0 falls in z3 and zoom 1 in z2.
 */
export const DENSITY_STEPS: Readonly<Record<Exclude<TokenDensity, 'z4'>, number>> = {
    z1: 1.5,
    z2: 0.5,
    z3: -0.5,
};

/** Target diameter in screen pixels per role and density. Roles: location, entity, portrait (entity with an image). */
export const TOKEN_TARGET_PX: Readonly<Record<TokenDensity, { location: number; entity: number; portrait: number }>> = {
    z1: { location: 36, entity: 28, portrait: 36 },
    z2: { location: 28, entity: 22, portrait: 28 },
    z3: { location: 22, entity: 22, portrait: 22 },
    z4: { location: DOT_PX, entity: 22, portrait: 22 },
};

/** The density for a zoom, given the zoom where the image fits. Unknown inputs use full size. */
export function densityForZoom(zoom: number, fitZoom: number): TokenDensity {
    if (!Number.isFinite(zoom) || !Number.isFinite(fitZoom)) return 'z1';
    const step = zoom - fitZoom;
    if (step >= DENSITY_STEPS.z1) return 'z1';
    if (step >= DENSITY_STEPS.z2) return 'z2';
    if (step >= DENSITY_STEPS.z3) return 'z3';
    return 'z4';
}

/** True when attached entity tokens are folded into their location's count pill. */
export function entitiesCollapse(density: TokenDensity): boolean {
    return density === 'z3' || density === 'z4';
}

/**
 * Screen offset of the index-th of total tokens fanned around a location.
 * A single token sits at singleAngle. Several tokens start at the top and spread evenly.
 * The radius clears a location token and an item token, with a little more room for a fan.
 */
export function fanOffset(
    index: number,
    total: number,
    locationPx: number,
    itemPx: number,
    singleAngle: number = -Math.PI / 3,
): [number, number] {
    const count = Math.max(total, 1);
    const radius = (locationPx + itemPx) / 2 + 4 + (total > 1 ? 2 : 0);
    const start = total <= 1 ? singleAngle : -Math.PI / 2;
    const angle = start + ((2 * Math.PI) / count) * index;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export interface TokenPriorityInput {
    current?: boolean;
    selected?: boolean;
    entityCount: number;
}

/**
 * Sort key for the overlap guard: a higher number keeps its full token. Selected beats current,
 * current beats the rest, and within a tier more attached entities win.
 */
export function tokenPriority(input: TokenPriorityInput): number {
    const tier = input.selected ? 2 : input.current ? 1 : 0;
    const count = Math.min(Math.max(Math.floor(input.entityCount) || 0, 0), 999_999);
    return tier * 1_000_000 + count;
}

export interface TokenCircle {
    id: string;
    x: number;
    y: number;
    radius: number;
    priority: number;
}

/**
 * Greedy overlap guard. Circles are taken in priority order (highest first, ties by id). A circle
 * that overlaps an already kept circle (with a gap) becomes a dot. Dots do not block others, so the
 * result depends only on the input, never on the order of the array.
 */
export function overlapDots(circles: readonly TokenCircle[], gap: number = 2): Set<string> {
    const order = [...circles].sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const kept: TokenCircle[] = [];
    const dotted = new Set<string>();
    for (const circle of order) {
        const clash = kept.some(k => {
            const dx = circle.x - k.x;
            const dy = circle.y - k.y;
            const reach = circle.radius + k.radius + gap;
            return dx * dx + dy * dy < reach * reach;
        });
        if (clash) dotted.add(circle.id);
        else kept.push(circle);
    }
    return dotted;
}

export interface TokenLocationInput {
    key: string;
    x: number;
    y: number;
    priority: number;
}

export interface TokenAttachedInput {
    key: string;
    locationKey: string;
    kind: 'entity' | 'portal';
    /** True for an entity whose token shows a portrait image. */
    portrait: boolean;
}

export interface TokenLayoutPlan {
    density: TokenDensity;
    containerClass: string;
    /** CSS variables for the map container: scale and counter-scale per role. */
    cssVars: Record<string, string>;
    /** Location keys drawn as dots. */
    dotted: Set<string>;
    /** Attached entity keys that are hidden (collapsed, or their location is a dot). */
    collapsed: Set<string>;
    /** Screen offset from the location point for each shown attached token. */
    offsets: Map<string, [number, number]>;
}

function formatScale(value: number): string {
    return (Math.round(value * 10_000) / 10_000).toString();
}

/**
 * CSS variables for one density. A token is drawn at its designed size (36, 28 or 10 px); the scale
 * shrinks it to the target. The counter scale keeps count pills at their own size.
 */
export function densityCssVars(density: TokenDensity): Record<string, string> {
    const target = TOKEN_TARGET_PX[density];
    const scales: Record<string, number> = {
        location: target.location / TOKEN_SIZES.lg,
        dot: DOT_PX / TOKEN_SIZES.lg,
        entity: target.entity / TOKEN_SIZES.md,
        portrait: target.portrait / TOKEN_SIZES.lg,
    };
    const vars: Record<string, string> = {};
    for (const role of Object.keys(scales)) {
        const scale = scales[role];
        vars[`--ink-scale-${role}`] = formatScale(scale);
        vars[`--ink-counter-${role}`] = formatScale(1 / scale);
    }
    return vars;
}

/**
 * The full layout for one zoom. Pure: give it the zoom, the fit zoom, the location points in screen
 * pixels (any shared origin works, since only distances matter) and the attached tokens.
 */
export function planTokenLayout(
    zoom: number,
    fitZoom: number,
    locations: readonly TokenLocationInput[],
    attached: readonly TokenAttachedInput[],
): TokenLayoutPlan {
    const density = densityForZoom(zoom, fitZoom);
    const target = TOKEN_TARGET_PX[density];

    const dotted = density === 'z4'
        ? new Set(locations.map(l => l.key))
        : overlapDots(locations.map(l => ({
            id: l.key,
            x: l.x,
            y: l.y,
            radius: target.location / 2,
            priority: l.priority,
        })));

    const collapsed = new Set<string>();
    const groups = new Map<string, Array<{ key: string; input: TokenAttachedInput }>>();
    for (const input of attached) {
        const hidden = input.kind === 'entity' && (entitiesCollapse(density) || dotted.has(input.locationKey));
        if (hidden) {
            collapsed.add(input.key);
            continue;
        }
        const group = groups.get(input.locationKey) ?? [];
        group.push({ key: input.key, input });
        groups.set(input.locationKey, group);
    }

    const offsets = new Map<string, [number, number]>();
    for (const [locationKey, group] of groups) {
        const locationPx = dotted.has(locationKey) ? DOT_PX : target.location;
        group.forEach(({ key, input }, index) => {
            const itemPx = input.kind === 'portal'
                ? target.location
                : input.portrait ? target.portrait : target.entity;
            const singleAngle = input.kind === 'portal' ? -Math.PI / 4 : -Math.PI / 3;
            offsets.set(key, fanOffset(index, group.length, locationPx, itemPx, singleAngle));
        });
    }

    return {
        density,
        containerClass: DENSITY_CLASS[density],
        cssVars: densityCssVars(density),
        dotted,
        collapsed,
        offsets,
    };
}
