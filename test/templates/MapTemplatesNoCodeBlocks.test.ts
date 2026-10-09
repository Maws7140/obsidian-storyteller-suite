import { describe, expect, it } from 'vitest';
import { MAP_TEMPLATES } from '../../src/templates/prebuilt/MapTemplates';

// Codeblock maps are no longer registered, so built-in templates must not insert storyteller-map blocks.
describe('built-in map templates', () => {
    it.each(MAP_TEMPLATES.map(t => [t.name, t] as const))('%s has no storyteller-map code block', (_name, template) => {
        expect(JSON.stringify(template)).not.toContain('```storyteller-map');
    });

    it.each(MAP_TEMPLATES.map(t => [t.name, t] as const))('%s tells the user to open the map in the Map view', (_name, template) => {
        expect(JSON.stringify(template)).toContain('Map view');
    });
});
