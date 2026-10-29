import { describe, expect, it } from 'vitest';
import { findSessionLogSection, readSessionLogBody } from '../../src/campaign/SessionLogSection';

const note = [
    '---', 'name: Session 01', '---', '', '## Session Log',
    '## Session 7', '*Date: 2025-11-15*', '',
    '### S18 *Sewer tunnels*', '@(Kael) Pick the lock', '',
    '## Interlude: One week, coast road', '[Party:Rations-7]', '',
    '## GM Notes', 'Private.',
].join('\n');

describe('session log section', () => {
    it('keeps Partylog session and interlude headings inside the log', () => {
        const body = readSessionLogBody(note);
        expect(body).toContain('## Session 7');
        expect(body).toContain('@(Kael) Pick the lock');
        expect(body).toContain('[Party:Rations-7]');
        expect(body).not.toContain('Private.');
    });

    it('ends at the next unrelated section', () => {
        const section = findSessionLogSection(note);
        expect(section).not.toBeNull();
        expect(note.slice(section!.end)).toMatch(/^## GM Notes/);
    });

    it('runs to the end of the note when nothing follows', () => {
        const short = '## Session Log\n## Session 1\n@ Look around\n';
        expect(readSessionLogBody(short)).toBe('## Session 1\n@ Look around');
    });

    it('returns null without a log section', () => {
        expect(findSessionLogSection('# Notes\ntext')).toBeNull();
        expect(readSessionLogBody('# Notes\ntext')).toBe('');
    });
});
