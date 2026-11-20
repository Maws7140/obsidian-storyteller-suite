import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
describe('edge tile rasterization', () => {
    it('keeps source and destination scale identical on partial edge tiles', () => {
        const source = readFileSync('src/leaflet/TileGenerator.ts', 'utf8');
        expect(source).toContain('0, 0, tileSize, tileSize');
        expect(source).not.toContain('0, 0, destW, destH');
    });
});
