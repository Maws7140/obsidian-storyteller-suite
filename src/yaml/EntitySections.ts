/*
 Centralized helpers for entity YAML whitelists and markdown section parsing/serialization.
 The goal is to keep a single source of truth for:
 - which frontmatter keys are allowed per entity type
 - how sections are parsed from markdown and preserved
 - building frontmatter objects from raw entity objects safely
*/

export type EntityType =
  | 'character'
  | 'location'
  | 'event'
  | 'item'
  | 'reference'
  | 'chapter'
  | 'scene';

/** Whitelisted frontmatter keys per entity type. */
const FRONTMATTER_WHITELISTS: Record<EntityType, Set<string>> = {
  character: new Set([
    'id', 'name', 'traits', 'relationships', 'locations', 'events',
    'status', 'affiliation', 'groups', 'profileImagePath', 'customFields'
  ]),
  location: new Set([
    'id', 'name', 'locationType', 'region', 'status',
    'groups', 'profileImagePath', 'customFields'
  ]),
  event: new Set([
    'id', 'name', 'dateTime', 'characters', 'location', 'status',
    'groups', 'profileImagePath', 'customFields'
  ]),
  item: new Set([
    'id', 'name', 'isPlotCritical', 'currentOwner', 'pastOwners',
    'currentLocation', 'associatedEvents', 'groups', 'profileImagePath', 'customFields'
  ]),
  reference: new Set([
    'id', 'name', 'category', 'tags', 'profileImagePath'
  ]),
  chapter: new Set([
    'id', 'name', 'number', 'tags', 'profileImagePath',
    'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups'
  ]),
  scene: new Set([
    'id', 'name', 'chapterId', 'chapterName', 'status', 'priority', 'tags', 'profileImagePath',
    'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups'
  ])
};

export function getWhitelistKeys(entityType: EntityType): Set<string> {
  return FRONTMATTER_WHITELISTS[entityType];
}

/**
 * Build frontmatter safely by applying the entity whitelist and removing values that are unsafe for YAML scalars.
 * - filters out null/undefined
 * - removes multi-line strings (kept in sections instead)
 * - skips empty arrays and empty objects (for customFields)
 */
export function buildFrontmatter(
  entityType: EntityType,
  source: Record<string, unknown>,
  preserveKeys?: Set<string>,
  options?: { customFieldsMode?: 'flatten' | 'nested' }
): Record<string, unknown> {
  const whitelist = FRONTMATTER_WHITELISTS[entityType];
  const output: Record<string, unknown> = {};
  const mode = options?.customFieldsMode ?? 'flatten';
  const srcKeys = new Set(Object.keys(source || {}));

  // Handle customFields specially
  const cfRaw = (source as any)?.customFields;
  if (cfRaw && typeof cfRaw === 'object' && !Array.isArray(cfRaw)) {
    const cfObj = cfRaw as Record<string, unknown>;
    if (mode === 'flatten') {
      const unpromoted: Record<string, unknown> = {};
      for (const [cfKey, cfVal] of Object.entries(cfObj)) {
        // Skip if top-level already has this key (avoid collisions)
        if (cfKey === 'customFields') continue;
        if (srcKeys.has(cfKey)) { unpromoted[cfKey] = cfVal; continue; }
        if (cfVal === null || cfVal === undefined) continue;
        if (typeof cfVal === 'string' && cfVal.includes('\n')) { unpromoted[cfKey] = cfVal; continue; }
        if (Array.isArray(cfVal) && cfVal.length === 0) continue;
        if (typeof cfVal === 'object' && Object.keys(cfVal as any).length === 0) continue;
        // Promote to top-level
        output[cfKey] = cfVal;
      }
      // Preserve any unpromoted entries under the container to avoid data loss
      if (Object.keys(unpromoted).length > 0) {
        output['customFields'] = unpromoted;
      }
    } else {
      // nested map (not stringified)
      if (Object.keys(cfObj).length > 0) {
        output['customFields'] = cfObj;
      }
    }
  }

  for (const [key, value] of Object.entries(source || {})) {
    const allowKey = whitelist.has(key) || (preserveKeys?.has(key) ?? false);
    if (!allowKey) continue;
    // In flatten mode, avoid writing the customFields container when we promoted its entries
    if (key === 'customFields' && mode === 'flatten') continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      // Exclude multi-line strings from frontmatter; they belong to sections
      if (value.includes('\n')) continue;
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      output[key] = value;
      continue;
    }

    if (typeof value === 'object') {
      // Avoid emitting empty objects such as empty customFields
      if (Object.keys(value as Record<string, unknown>).length === 0) continue;
      output[key] = value;
      continue;
    }

    output[key] = value;
  }

  return output;
}

/**
 * Parse all markdown sections from a file body.
 * Returns a map of sectionName -> content (trimmed, without the heading line).
 * Robust against spacing and older formats; if no regex matches but '##' exists, falls back to a manual splitter.
 */
export function parseSectionsFromMarkdown(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  if (!content) return sections;

  // Primary regex: heading starting with `##`, capture until next heading or end.
  const primaryMatches = content.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
  for (const match of primaryMatches) {
    const sectionName = (match[1] || '').trim();
    const sectionContent = (match[2] || '').trim();
    if (sectionName && sectionContent) {
      sections[sectionName] = sectionContent;
    }
  }

  if (Object.keys(sections).length > 0) return sections;

  // Fallback splitter: tolerant parsing when regex misses
  if (content.includes('##')) {
    const lines = content.split('\n');
    let currentSection = '';
    let buffer: string[] = [];
    for (const line of lines) {
      if (line.startsWith('##')) {
        if (currentSection && buffer.length > 0) {
          const text = buffer.join('\n').trim();
          if (text) sections[currentSection] = text;
        }
        currentSection = line.replace(/^##\s*/, '').trim();
        buffer = [];
      } else if (currentSection) {
        buffer.push(line);
      }
    }
    if (currentSection && buffer.length > 0) {
      const text = buffer.join('\n').trim();
      if (text) sections[currentSection] = text;
    }
  }

  return sections;
}

/**
 * Utility to create a safe file name from an entity name.
 */
export function toSafeFileName(name: string, fallback = 'Untitled'): string {
  const base = (name && name.trim()) ? name : fallback;
  return base.replace(/[\\/:"*?<>|#^\[\]{}]+/g, '');
}
