/**
 * Rewriting a group note without losing what the plugin does not own.
 *
 * A group note is shared with the user. The plugin owns a fixed set of
 * frontmatter keys and five body sections; everything else (unknown keys such
 * as aliases or cssclasses, and hand-written `##` sections) must survive a save.
 * These helpers merge the plugin's values into the existing note.
 */

import { stringifyYaml } from 'obsidian';
import { parseFrontmatterFromContent } from '../yaml/EntitySections';

/** Frontmatter keys saveGroupToFile writes. A key here that is absent from a save is removed. */
export const GROUP_OWNED_FRONTMATTER_KEYS: readonly string[] = [
    'storyteller-type',
    'storyteller-id',
    'storyteller-story-id',
    'name',
    'color',
    'group-type',
    'tags',
    'profile-image',
    'strength',
    'status',
    'emblem',
    'motto',
    'military-power',
    'economic-power',
    'political-influence',
    'colors',
    'territories',
    'linked-events',
    'linked-culture',
    'parent-group',
    'subgroups',
    'members',
    'group-relationships',
    'connections',
    'custom-fields',
];

export interface NoteSplit {
    frontmatter: Record<string, unknown>;
    body: string;
}

/**
 * Split a note into its frontmatter and body. Returns null when the note starts
 * with a frontmatter block that cannot be read, so the caller can refuse to
 * overwrite it.
 */
export function splitNoteContent(content: string): NoteSplit | null {
    const text = content.replace(/^\uFEFF/, '');
    if (!text.startsWith('---')) return { frontmatter: {}, body: text };
    const end = text.indexOf('\n---', 3);
    if (end === -1) return null;
    const frontmatter = parseFrontmatterFromContent(text);
    if (!frontmatter) return null;
    const rest = text.slice(end + 4).replace(/^[ \t]*\r?\n/, '');
    return { frontmatter, body: rest };
}

/**
 * Merge the plugin's frontmatter into the existing frontmatter. Owned keys take
 * the new value, or are dropped when the save has none. Every other key is kept
 * with its value and position.
 */
export function mergeOwnedFrontmatter(
    existing: Record<string, unknown>,
    owned: Record<string, unknown>,
    ownedKeys: readonly string[]
): Record<string, unknown> {
    const owns = new Set(ownedKeys);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
        if (!owns.has(key)) {
            out[key] = value;
        } else if (key in owned) {
            out[key] = owned[key];
        }
    }
    for (const [key, value] of Object.entries(owned)) {
        if (!(key in out)) out[key] = value;
    }
    return out;
}

interface NoteBlock {
    /** Heading text for a `##` section, or null for the text before the first one. */
    heading: string | null;
    lines: string[];
}

/** Split a body at level-2 headings. Headings inside code fences do not count. */
function splitBlocks(body: string): NoteBlock[] {
    const blocks: NoteBlock[] = [{ heading: null, lines: [] }];
    let inFence = false;
    for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
        const match = inFence ? null : line.match(/^##\s+(.+?)\s*$/);
        if (match) {
            blocks.push({ heading: match[1].trim(), lines: [line] });
        } else {
            blocks[blocks.length - 1].lines.push(line);
        }
    }
    return blocks;
}

function blockText(lines: string[]): string {
    return lines.join('\n').trim();
}

/**
 * Replace the plugin-owned sections of a body and keep everything else.
 * An owned section keeps its place in the note; a repeated copy is dropped; a
 * section with no value is removed. Owned sections that are not in the note
 * yet are appended in the order given. Unknown sections are copied verbatim.
 */
export function replaceOwnedSections(
    body: string,
    owned: ReadonlyArray<{ heading: string; value?: string }>
): string {
    const values = new Map(owned.map(entry => [entry.heading, entry.value?.trim() ? entry.value : undefined]));
    const seen = new Set<string>();
    const chunks: string[] = [];

    for (const block of splitBlocks(body)) {
        if (block.heading === null) {
            const text = blockText(block.lines);
            if (text) chunks.push(text);
            continue;
        }
        if (values.has(block.heading)) {
            if (seen.has(block.heading)) continue;
            seen.add(block.heading);
            const value = values.get(block.heading);
            if (value !== undefined) chunks.push(`## ${block.heading}\n\n${value}`);
            continue;
        }
        const text = blockText(block.lines);
        if (text) chunks.push(text);
    }

    for (const entry of owned) {
        if (seen.has(entry.heading)) continue;
        const value = values.get(entry.heading);
        if (value !== undefined) chunks.push(`## ${entry.heading}\n\n${value}`);
    }

    return chunks.join('\n\n');
}

/** Assemble a note from its frontmatter and body. */
export function composeNote(frontmatter: Record<string, unknown>, body: string): string {
    const fm = stringifyYaml(frontmatter).trim();
    const text = body.trim();
    return `---\n${fm}\n---\n` + (text ? `\n${text}\n` : '');
}
