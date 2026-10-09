import { describe, it, expect } from 'vitest';
import { chooseConnectorEnds, ConnectorRect } from '../../src/utils/ConnectorGeometry';

const ROW_HEIGHT = 32;
const BAR_HEIGHT = 25;

const bar = (x: number, width: number, row: number): ConnectorRect =>
    ({ x, y: 7 + row * ROW_HEIGHT, width, height: BAR_HEIGHT });

describe('chooseConnectorEnds', () => {
    it('goes right edge to left edge when the target is later on screen', () => {
        const ends = chooseConnectorEnds(bar(100, 40, 0), bar(300, 40, 0));

        expect(ends.x1).toBe(140);
        expect(ends.x2).toBe(300);
    });

    /**
     * The bug this file exists for. A point event still draws a chip at least
     * 88px wide, so at a wide zoom two events five days apart overlap almost
     * completely on screen and the old right-to-left rule sent the arrow
     * backwards across both bars.
     */
    it('does not run backwards when the bars overlap on different rows', () => {
        const source = bar(400, 88, 0);
        const target = bar(401, 88, 1);

        const ends = chooseConnectorEnds(source, target);

        expect(ends.x2).toBeGreaterThanOrEqual(source.x);
        expect(ends.x2).toBeLessThanOrEqual(source.x + source.width);
        // Straight down between the rows, not sideways across the bars.
        expect(ends.x1).toBe(ends.x2);
        expect(ends.y1).toBe(source.y + source.height);
        expect(ends.y2).toBe(target.y);
    });

    it('points up when the target sits on an earlier row', () => {
        const ends = chooseConnectorEnds(bar(400, 88, 2), bar(401, 88, 1));

        expect(ends.y1).toBe(bar(400, 88, 2).y);
        expect(ends.y2).toBe(bar(401, 88, 1).y + BAR_HEIGHT);
    });

    it('leaves the left edge when the target is earlier on screen', () => {
        const ends = chooseConnectorEnds(bar(300, 40, 0), bar(100, 40, 1));

        expect(ends.x1).toBe(300);
        expect(ends.x2).toBe(140);
    });

    it('falls back to edge to edge for bars drawn on top of each other', () => {
        const ends = chooseConnectorEnds(bar(400, 88, 0), bar(410, 88, 0));

        expect(ends.x1).toBe(488);
        expect(ends.x2).toBe(410);
        expect(ends.y1).toBe(ends.y2);
    });

    it('treats bars that touch as clearly separated', () => {
        const ends = chooseConnectorEnds(bar(100, 40, 0), bar(140, 40, 1));

        expect(ends.x1).toBe(140);
        expect(ends.x2).toBe(140);
        expect(ends.y1).not.toBe(ends.y2);
    });
});
