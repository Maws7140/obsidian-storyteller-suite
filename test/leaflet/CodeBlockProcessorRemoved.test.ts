/*
 * Codeblock maps are no longer supported (the map is the Map view). The old code block processor
 * and the block parser only it used must be gone, and nothing may refer to them.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const selfName = basename(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx|js|mjs|cjs)$/.test(name) ? [path] : [];
    });
}

describe('codeblock map processor is removed', () => {
    it('src/leaflet/processor.ts no longer exists', () => {
        expect(existsSync(join(root, 'src/leaflet/processor.ts'))).toBe(false);
    });

    it('nothing in src or test refers to the processor', () => {
        // Built from parts so this file does not match its own pattern.
        const pattern = new RegExp(['LeafletCode', 'BlockProcessor', '|leaflet/processor[\'"]'].join(''));
        const hits = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'test'))]
            .filter(path => basename(path) !== selfName)
            .filter(path => pattern.test(readFileSync(path, 'utf8')))
            .map(path => path.slice(root.length));
        expect(hits).toEqual([]);
    });

    it('the block parser used only by the processor is gone', () => {
        expect(readFileSync(join(root, 'src/leaflet/utils/parser.ts'), 'utf8')).not.toContain('parseBlockParameters');
    });
});
