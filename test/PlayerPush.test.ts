/*
 * splitNoteSections: how a note is cut into the sections the DM can push.
 */
import { describe, expect, it } from 'vitest';
import { splitNoteSections } from '../src/campaign/PlayerPush';

describe('splitNoteSections', () => {
    it('skips frontmatter', () => {
        const note = '---\ntitle: Camp\ntags: [scene]\n---\n## Read-aloud\nFires crackle.';
        expect(splitNoteSections(note)).toEqual([
            { heading: 'Read-aloud', level: 2, markdown: 'Fires crackle.' },
        ]);
    });

    it('ignores # lines inside a code fence', () => {
        const note = [
            '## Setup',
            'Before the fence.',
            '```',
            '# not a header',
            '```',
            '~~~',
            '## also not a header',
            '~~~',
            '## After',
            'Tail.',
        ].join('\n');
        const sections = splitNoteSections(note);
        expect(sections.map(s => s.heading)).toEqual(['Setup', 'After']);
        expect(sections[0].markdown).toContain('# not a header');
        expect(sections[0].markdown).toContain('## also not a header');
    });

    it('includes ### children in their ## section', () => {
        const note = [
            '## Room',
            'Intro.',
            '### Door',
            'Locked.',
            '#### Lock',
            'Rusted.',
            '## Hall',
            'Next.',
        ].join('\n');
        const sections = splitNoteSections(note);
        expect(sections).toEqual([
            { heading: 'Room', level: 2, markdown: 'Intro.\n### Door\nLocked.\n#### Lock\nRusted.' },
            { heading: 'Door', level: 3, markdown: 'Locked.\n#### Lock\nRusted.' },
            { heading: 'Lock', level: 4, markdown: 'Rusted.' },
            { heading: 'Hall', level: 2, markdown: 'Next.' },
        ]);
    });

    it('returns nothing for empty input', () => {
        expect(splitNoteSections('')).toEqual([]);
    });

    it('drops text before the first header', () => {
        const sections = splitNoteSections('Preamble.\n## First\nBody.');
        expect(sections).toEqual([{ heading: 'First', level: 2, markdown: 'Body.' }]);
    });
});
