import { defaultInkDoc, normalizeInk } from '../ink/model';
import type { InkDoc } from '../ink/model';
import { hasMaplogData, migrateMaplog } from '../ink/migrateMaplog';

/**
 * The drawing a map note holds. Reads `mapInk` when present; otherwise migrates
 * the old Maplog keys; otherwise an empty drawing. Pass the note's frontmatter or
 * a StoryMap, which carries the same keys.
 */
export function inkDocOf(frontmatter: unknown): InkDoc {
    const raw = frontmatter as { mapInk?: unknown } | null | undefined;
    if (raw?.mapInk) return normalizeInk(raw.mapInk);
    if (hasMaplogData(frontmatter)) return migrateMaplog(frontmatter);
    return defaultInkDoc();
}
