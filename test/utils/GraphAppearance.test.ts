import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GRAPH_DISPLAY,
    GRAPH_TYPE_STYLES,
    GRAPH_UNSET_COLOR,
    activeGraphLayers,
    buildGraphLegend,
    connectionTier,
    graphColorKey,
    relationshipLabel,
    sanitizeGraphDisplay,
    spacingFor,
} from '../../src/utils/GraphAppearance';
import type { GraphColorContext, GraphColorNode } from '../../src/utils/GraphAppearance';
import { paletteColorFor } from '../../src/utils/TimelineStyle';

const palette = ['#111111', '#222222', '#333333', '#444444', '#555555'];

const context: GraphColorContext = {
    palette,
    group: value => [
        { id: 'g-red', name: 'Red Hand', color: '#ff0000' },
        { id: 'g-plain', name: 'Plain Guild' },
    ].find(group => group.id === value || group.name === value),
    locationName: value => ({ 'loc-1': 'Valewood' } as Record<string, string>)[value] || value,
    cultureName: value => ({ 'cul-1': 'Elves' } as Record<string, string>)[value] || value,
};

function node(partial: Partial<GraphColorNode> & Pick<GraphColorNode, 'type'>): GraphColorNode {
    return { id: partial.id || 'n', label: partial.label || 'Node', degree: 0, data: {}, ...partial };
}

describe('graph display options', () => {
    it('fills in defaults and drops values it does not know', () => {
        expect(sanitizeGraphDisplay(undefined)).toEqual(DEFAULT_GRAPH_DISPLAY);
        const saved = sanitizeGraphDisplay({ colorMode: 'group', layout: 'spiral', spacing: 'compact', showImages: false, showEnded: 'yes' });
        expect(saved.colorMode).toBe('group');
        expect(saved.layout).toBe('cose');
        expect(saved.spacing).toBe('compact');
        expect(saved.showImages).toBe(false);
        expect(saved.showEnded).toBe(true);
    });

    it('counts drawn layers, not arrangement, for the Show badge', () => {
        const none = { ...DEFAULT_GRAPH_DISPLAY, showImages: false, showEnded: false, showImplied: false, showMembership: false, showIsolated: false };
        expect(activeGraphLayers(none)).toEqual([]);
        expect(activeGraphLayers({ ...none, sizeByConnections: false, spacing: 'spacious' })).toEqual([]);
        expect(activeGraphLayers({ ...none, showEdgeLabels: true })).toEqual(['Relationship labels']);
    });

    it('spreads layouts further apart as spacing grows', () => {
        expect(spacingFor('compact').idealEdgeLength).toBeLessThan(spacingFor('balanced').idealEdgeLength);
        expect(spacingFor('balanced').idealEdgeLength).toBeLessThan(spacingFor('spacious').idealEdgeLength);
        // Balanced keeps the graph's long-standing force layout settings
        expect(spacingFor('balanced')).toMatchObject({ idealEdgeLength: 200, nodeRepulsion: 25000 });
    });
});

describe('graph colour keys', () => {
    it('colours by entity type with the fixed type colours', () => {
        const key = graphColorKey(node({ type: 'location' }), 'type', context);
        expect(key).toMatchObject({ key: 'type:location', label: 'Locations', color: GRAPH_TYPE_STYLES.location.color });
    });

    it('uses a group\'s own colour, else the palette entry its id hashes to, like the timeline lanes', () => {
        expect(graphColorKey(node({ type: 'character', data: { groups: ['g-red'] } }), 'group', context))
            .toMatchObject({ key: 'group:g-red', label: 'Red Hand', color: '#ff0000' });
        expect(graphColorKey(node({ type: 'character', data: { groups: ['g-plain'] } }), 'group', context))
            .toMatchObject({ key: 'group:g-plain', label: 'Plain Guild', color: paletteColorFor('g-plain', palette) });
        // A group node is coloured as itself, so a faction and its members match
        expect(graphColorKey(node({ type: 'group', id: 'g-red', label: 'Red Hand', data: { id: 'g-red' } as never }), 'group', context))
            .toMatchObject({ key: 'group:g-red', color: '#ff0000' });
    });

    it('resolves location ids to names, and a location node matches the things in it', () => {
        const resident = graphColorKey(node({ type: 'character', data: { currentLocationId: 'loc-1' } }), 'location', context);
        const place = graphColorKey(node({ type: 'location', label: 'Valewood' }), 'location', context);
        const event = graphColorKey(node({ type: 'event', data: { location: 'Valewood' } }), 'location', context);
        expect(resident).toMatchObject({ key: 'location:Valewood', label: 'Valewood', color: paletteColorFor('Valewood', palette) });
        expect(place.key).toBe(resident.key);
        expect(event.color).toBe(resident.color);
    });

    it('reads cultures from whichever field the entity type has', () => {
        expect(graphColorKey(node({ type: 'character', data: { cultures: ['cul-1'] } }), 'culture', context).label).toBe('Elves');
        expect(graphColorKey(node({ type: 'item', data: { linkedCultures: ['Elves'] } }), 'culture', context).label).toBe('Elves');
        expect(graphColorKey(node({ type: 'group', data: { linkedCulture: 'Elves' } }), 'culture', context).label).toBe('Elves');
    });

    it('gives missing values one grey "none" entry, sorted last', () => {
        for (const mode of ['group', 'location', 'culture', 'status'] as const) {
            const key = graphColorKey(node({ type: 'character' }), mode, context);
            expect(key.color).toBe(GRAPH_UNSET_COLOR);
            expect(key.key).toBe(`${mode}:none`);
            expect(key.order).toBeGreaterThan(1000);
        }
    });

    it('groups statuses case-insensitively', () => {
        const a = graphColorKey(node({ type: 'character', data: { status: 'Alive' } }), 'status', context);
        const b = graphColorKey(node({ type: 'character', data: { status: 'alive' } }), 'status', context);
        expect(a.key).toBe(b.key);
        expect(a.color).toBe(b.color);
    });

    it('colours connection tiers in order, unconnected in grey', () => {
        expect(connectionTier(12).key).toBe('hub');
        expect(connectionTier(6).key).toBe('major');
        expect(connectionTier(3).key).toBe('moderate');
        expect(connectionTier(1).key).toBe('minor');
        expect(connectionTier(0).key).toBe('isolated');
        expect(graphColorKey(node({ type: 'character', degree: 12 }), 'connections', context).color).toBe(palette[0]);
        expect(graphColorKey(node({ type: 'character', degree: 0 }), 'connections', context).color).toBe(GRAPH_UNSET_COLOR);
    });
});

describe('graph legend', () => {
    const withKey = (n: GraphColorNode, mode: Parameters<typeof graphColorKey>[1], deceased = false) =>
        ({ ...n, colorKey: graphColorKey(n, mode, context), deceased });

    it('lists only what is on screen, with counts, biggest first and "none" last', () => {
        const nodes = [
            node({ id: 'a', type: 'character', data: { groups: ['g-red'] } }),
            node({ id: 'b', type: 'character', data: { groups: ['g-red'] } }),
            node({ id: 'c', type: 'location', data: {} }),
            node({ id: 'd', type: 'character', data: { groups: ['g-plain'] } }),
        ].map(n => withKey(n, 'group'));
        const legend = buildGraphLegend(nodes, [], 'group');
        expect(legend.colorTitle).toBe('Colour: group');
        expect(legend.colors.map(entry => [entry.label, entry.count])).toEqual([['Red Hand', 2], ['Plain Guild', 1], ['No group', 1]]);
        // Shapes are listed separately when colour no longer tells the type
        expect(legend.shapes.map(entry => [entry.label, entry.count])).toEqual([['Characters', 3], ['Locations', 1]]);
    });

    it('folds shapes into the colour entries when colouring by type', () => {
        const nodes = [node({ type: 'character' }), node({ type: 'event' })].map(n => withKey(n, 'type'));
        const legend = buildGraphLegend(nodes, [], 'type');
        expect(legend.shapes).toEqual([]);
        expect(legend.colors.map(entry => entry.shape)).toEqual(['ellipse', 'diamond']);
    });

    it('describes only the relationship kinds and line styles in use', () => {
        const legend = buildGraphLegend([], [
            { relationshipType: 'ally', direction: 'mutual' },
            { relationshipType: 'ally', direction: 'mutual', ended: true },
            { relationshipType: 'parent', direction: 'outgoing', implied: true },
            { relationshipType: 'neutral', label: 'member of' },
        ], 'type');
        expect(legend.relationships.map(entry => [entry.label, entry.count])).toEqual([['Ally', 2], ['Parent', 1]]);
        expect(legend.lines.map(entry => entry.key)).toEqual(['line:arrow', 'line:mutual', 'line:ended', 'line:implied', 'line:membership']);
        expect(buildGraphLegend([], [{ relationshipType: 'enemy', direction: 'mutual' }], 'type').lines.map(entry => entry.key)).toEqual(['line:mutual']);
    });

    it('counts the dead', () => {
        const nodes = [withKey(node({ type: 'character' }), 'type', true), withKey(node({ type: 'character' }), 'type')];
        expect(buildGraphLegend(nodes, [], 'type').deceased).toBe(1);
    });

    it('writes relationship kinds as words', () => {
        expect(relationshipLabel('loyal-to')).toBe('Loyal to');
    });
});
