import { describe, it, expect } from 'vitest';
import cytoscape from 'cytoscape';
import { NetworkGraphRenderer } from '../../src/views/NetworkGraphRenderer';

// getCytoscapeStyle only reads CSS variables through this.getCSSVariable, so the
// real stylesheet can be produced without a DOM and resolved in headless cytoscape.
function stylesheet() {
    const fake = { getCSSVariable: () => '#808080' };
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

    it('hub (degree 12) gets the gold border and larger bold font', () => {
        expect(styles[12].borderWidth).toBe(5);
        expect(styles[12].borderColor).toBe('rgb(255,215,0)');
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
