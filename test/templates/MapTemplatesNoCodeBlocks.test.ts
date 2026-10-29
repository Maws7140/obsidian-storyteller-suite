import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_TEMPLATES } from '../../src/templates/prebuilt/MapTemplates';

const templatesDir = fileURLToPath(new URL('../../src/templates', import.meta.url));

function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

// Codeblock maps are no longer registered, so built-in templates must not insert storyteller-map blocks.
describe('built-in map templates', () => {
    it.each(MAP_TEMPLATES.map(t => [t.name, t] as const))('%s has no storyteller-map code block', (_name, template) => {
        expect(JSON.stringify(template)).not.toContain('```storyteller-map');
    });

    it.each(MAP_TEMPLATES.map(t => [t.name, t] as const))('%s tells the user to open the map in the Map view', (_name, template) => {
        expect(JSON.stringify(template)).toContain('Map view');
    });

    it.each(MAP_TEMPLATES.map(t => [t.name, t] as const))('%s describes the Map view, not the marker syntax', (_name, template) => {
        const text = JSON.stringify(template);
        expect(text).not.toMatch(/marker:\s*\[/);
        expect(text).not.toContain('storyteller-map');
        expect(text).not.toContain('\u2014');
    });

    it('no template source file mentions storyteller-map', () => {
        const hits = filesUnder(templatesDir).filter(path => readFileSync(path, 'utf8').includes('storyteller-map'));
        expect(hits).toEqual([]);
    });
});
