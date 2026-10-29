import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * An unclosed block in styles.css silently swallows every rule after it.
 * This happened once when two appended sections were merged by hand.
 */
describe('styles.css', () => {
    it('opens and closes every block', () => {
        const css = readFileSync(resolve(__dirname, '../../styles.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
        let depth = 0;
        let line = 1;
        for (const ch of css) {
            if (ch === '\n') line++;
            if (ch === '{') depth++;
            if (ch === '}') depth--;
            expect(depth, `extra closing brace near line ${line}`).toBeGreaterThanOrEqual(0);
        }
        expect(depth, 'unclosed block in styles.css').toBe(0);
    });
});
