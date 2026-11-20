import { describe, it, expect } from 'vitest';
import cytoscape from 'cytoscape';
import { NetworkGraphRenderer } from '../../src/views/NetworkGraphRenderer';
import { sanitizeGraphDisplay } from '../../src/utils/GraphAppearance';
import { DEFAULT_TIMELINE_METRICS } from '../../src/utils/TimelineStyle';

// getCytoscapeStyle reads the resolved theme through themeColor/themeAlpha/themeFont and the
// display options, so the real stylesheet can be produced without a DOM and resolved in
// headless cytoscape. The hub rim is the theme's milestone gold.
const MILESTONE = '#d9a520';
function stylesheet() {
    const fake = {
        display: sanitizeGraphDisplay(undefined),
        style: { metrics: DEFAULT_TIMELINE_METRICS },
        themeColor: (role: string) => role === 'milestone' ? MILESTONE : '#808080',
        themeAlpha: () => 1,
        themeFont: () => 'sans-serif',
    };
    const getStyle = (NetworkGraphRenderer.prototype as unknown as { getCytoscapeStyle: () => cytoscape.StylesheetStyle[] }).getCytoscapeStyle;
    return getStyle.call(fake);
}

function resolve(degrees: number[]) {
    const cy = cytoscape({
        headless: true,
        styleEnabled: true,
        style: stylesheet(),
        elements: degrees.map(d => ({ data: { id: `d${d}`, label: `d${d}`, type: 'character', degree: d, deceased: false } })),
    });
    return Object.fromEntries(degrees.map(d => {
        const n = cy.getElementById(`d${d}`);
        return [d, {
            opacity: Number(n.style('opacity')),
            borderWidth: parseFloat(n.style('border-width')),
            borderStyle: n.style('border-style'),
            fontSize: parseFloat(n.style('font-size')),
            borderColor: n.style('border-color'),
        }];
    }));
}

describe('R-Map degree tier styles resolve in cytoscape', () => {
    const styles = resolve([0, 1, 4, 8, 12]);

    it('isolated node (degree 0) gets the faded dashed style', () => {
        expect(styles[0]).toEqual(expect.objectContaining({ opacity: 0.5, borderWidth: 2, borderStyle: 'dashed', fontSize: 12 }));
    });

    it('hub (degree 12) gets the theme\'s gold milestone border and larger bold font', () => {
        expect(styles[12].borderWidth).toBe(5);
        expect(styles[12].borderColor).toBe('rgb(217,165,32)');
        expect(styles[12].fontSize).toBe(16);
        expect(styles[12].borderStyle).not.toBe('dashed');
        expect(styles[12].opacity).toBe(1);
    });

    it('a degree 12 hub is not faded like an isolated node', () => {
        expect(styles[12].opacity).not.toBe(0.5);
    });

    it('mid-tier nodes take their tier border widths', () => {
        expect(styles[1]).toEqual(expect.objectContaining({ opacity: 0.8, borderWidth: 2, fontSize: 13 }));
        expect(styles[4]).toEqual(expect.objectContaining({ opacity: 1, borderWidth: 3 }));
        expect(styles[8]).toEqual(expect.objectContaining({ borderWidth: 4, fontSize: 15 }));
    });
});

describe('size by connections off', () => {
    it('drops the tier styles, so every node is drawn alike', () => {
        const fake = {
            display: { ...sanitizeGraphDisplay(undefined), sizeByConnections: false },
            style: { metrics: DEFAULT_TIMELINE_METRICS },
            themeColor: () => '#808080',
            themeAlpha: () => 1,
            themeFont: () => 'sans-serif',
        };
        const getStyle = (NetworkGraphRenderer.prototype as unknown as { getCytoscapeStyle: () => cytoscape.StylesheetStyle[] }).getCytoscapeStyle;
        const cy = cytoscape({
            headless: true,
            styleEnabled: true,
            style: getStyle.call(fake),
            elements: [0, 12].map(d => ({ data: { id: `d${d}`, label: `d${d}`, type: 'character', degree: d, deceased: false } })),
        });
        const isolated = cy.getElementById('d0');
        const hub = cy.getElementById('d12');
        expect(parseFloat(hub.style('width'))).toBe(parseFloat(isolated.style('width')));
        expect(hub.style('border-width')).toBe(isolated.style('border-width'));
        expect(Number(isolated.style('opacity'))).toBe(1);
    });
});
