/**
 * Strip Obsidian wiki-link syntax from a value, returning just the canonical
 * entity name. Handles aliases (`[[Real|Display]]` → `Real`) and section
 * anchors (`[[Name#Section]]` → `Name`). Returns `undefined` for empty input
 * so callers can chain with `??`.
 */
export function stripWikiLink(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const match = trimmed.match(/^\[\[(.*)\]\]$/);
    let inner = (match ? match[1] : trimmed).trim();
    const pipe = inner.indexOf('|');
    if (pipe !== -1) inner = inner.substring(0, pipe).trim();
    const hash = inner.indexOf('#');
    if (hash !== -1) inner = inner.substring(0, hash).trim();
    return inner || undefined;
}

/**
 * String-returning variant for callers that want `''` instead of `undefined`
 * for empty input. Useful when the result is immediately concatenated or
 * compared with `===`.
 */
export function stripWikiLinkToString(value: string | null | undefined): string {
    return stripWikiLink(value) ?? '';
}
