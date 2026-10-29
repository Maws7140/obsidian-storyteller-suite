/**
 * Locating the `## Session Log` section of a campaign session note.
 *
 * Partylog writes its own level-two headings into the log (`## Session 7`,
 * `## Interlude: One week, coast road`). Those belong to the log, so they must
 * not be read as the start of the next note section.
 */

export const SESSION_LOG_HEADER = '## Session Log';

const PARTYLOG_LOG_HEADING = /^##\s+(?:Session\s+\d|Interlude\b)/i;

export interface SessionLogSection {
    /** Offset of the first character after the `## Session Log` line. */
    start: number;
    /** Offset where the next unrelated `##` section begins, or the content length. */
    end: number;
}

/** Bounds of the session log body, or null when the note has no log section. */
export function findSessionLogSection(content: string): SessionLogSection | null {
    const idx = content.indexOf(SESSION_LOG_HEADER);
    if (idx === -1) return null;
    const afterHeader = content.indexOf('\n', idx);
    const start = afterHeader !== -1 ? afterHeader + 1 : content.length;
    const sectionRegex = /^##\s+.*$/gm;
    sectionRegex.lastIndex = start;
    let match: RegExpExecArray | null;
    while ((match = sectionRegex.exec(content)) !== null) {
        if (!PARTYLOG_LOG_HEADING.test(match[0])) return { start, end: match.index };
    }
    return { start, end: content.length };
}

/** The session log body text (without its heading), or '' when absent. */
export function readSessionLogBody(content: string): string {
    const section = findSessionLogSection(content);
    return section ? content.slice(section.start, section.end).replace(/\s+$/, '') : '';
}
