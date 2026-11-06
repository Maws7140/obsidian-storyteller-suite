/** What a scene shows under its title in the Writing views. */
export interface ScenePreview {
    text: string;
    /** True when the text is the scene's synopsis rather than the opening of its content. */
    fromSynopsis: boolean;
}

function shorten(text: string, maxLength: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > maxLength ? `${flat.slice(0, maxLength).trimEnd()}…` : flat;
}

/**
 * The scene's synopsis when it has one, otherwise the start of its content. A
 * synopsis is written to summarise the scene, so it says more than the first
 * line of prose does (issue #145). Returns null when the scene has neither.
 */
export function scenePreview(
    scene: { synopsis?: unknown; content?: unknown },
    maxLength = 160,
    contentLength = 80,
): ScenePreview | null {
    const synopsis = typeof scene.synopsis === 'string' ? scene.synopsis.trim() : '';
    if (synopsis) return { text: shorten(synopsis, maxLength), fromSynopsis: true };
    const content = typeof scene.content === 'string' ? scene.content.trim() : '';
    if (content) return { text: shorten(content, contentLength), fromSynopsis: false };
    return null;
}

/** True when the scene's name, synopsis or content contains the (lower-case) filter text. */
export function sceneMatchesFilter(scene: { name: string; synopsis?: unknown; content?: unknown }, filter: string): boolean {
    if (!filter) return true;
    const fields = [scene.name, scene.synopsis, scene.content];
    return fields.some(field => typeof field === 'string' && field.toLowerCase().includes(filter));
}
