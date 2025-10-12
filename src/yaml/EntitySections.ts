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
    'status', 'affiliation', 'groups', 'profileImagePath', 'customFields', 'connections'
  ]),
  location: new Set([
    'id', 'name', 'locationType', 'region', 'status', 'parentLocation',
    'groups', 'profileImagePath', 'customFields', 'connections'
  ]),
  event: new Set([
    'id', 'name', 'dateTime', 'characters', 'location', 'status',
    'groups', 'profileImagePath', 'customFields', 'connections',
    'isMilestone', 'dependencies', 'progress'
  ]),
  item: new Set([
    'id', 'name', 'isPlotCritical', 'currentOwner', 'pastOwners',
    'currentLocation', 'associatedEvents', 'groups', 'profileImagePath', 'customFields', 'connections'
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
 * - filters out null/undefined (unless they existed in original frontmatter)
 * - removes multi-line strings (kept in sections instead)
 * - skips empty arrays and empty objects (unless they existed in original frontmatter)
 * - preserves all keys from originalFrontmatter, even if not in whitelist
 * - maintains field order from originalFrontmatter where possible
 */
export function buildFrontmatter(
  entityType: EntityType,
  source: Record<string, unknown>,
  preserveKeys?: Set<string>,
  options?: { customFieldsMode?: 'flatten' | 'nested'; originalFrontmatter?: Record<string, unknown> }
): Record<string, unknown> {
  const whitelist = FRONTMATTER_WHITELISTS[entityType];
  const output: Record<string, unknown> = {};
  const mode = options?.customFieldsMode ?? 'flatten';
  const srcKeys = new Set(Object.keys(source || {}));
  const originalFrontmatter = options?.originalFrontmatter;

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
        const existedInOriginal = originalFrontmatter && cfKey in originalFrontmatter;
        if (!existedInOriginal && (cfVal === null || cfVal === undefined)) continue;
        if (!existedInOriginal && typeof cfVal === 'string' && cfVal.includes('\n')) { unpromoted[cfKey] = cfVal; continue; }
        if (!existedInOriginal && Array.isArray(cfVal) && cfVal.length === 0) continue;
        if (!existedInOriginal && typeof cfVal === 'object' && Object.keys(cfVal as any).length === 0) continue;
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
    
    const existedInOriginal = originalFrontmatter && key in originalFrontmatter;
    
    // Only filter out null/undefined if it didn't exist in original
    if (!existedInOriginal && (value === null || value === undefined)) continue;

    if (typeof value === 'string') {
      // Exclude multi-line strings from frontmatter; they belong to sections
      if (value.includes('\n')) continue;
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      // Preserve empty arrays if they existed in original
      if (!existedInOriginal && value.length === 0) continue;
      output[key] = value;
      continue;
    }

    if (typeof value === 'object') {
      // Preserve empty objects if they existed in original
      if (!existedInOriginal && Object.keys(value as Record<string, unknown>).length === 0) continue;
      output[key] = value;
      continue;
    }

    output[key] = value;
  }

  // Preserve all fields from originalFrontmatter that weren't already added
  // This ensures user-added fields are never deleted
  if (originalFrontmatter) {
    for (const [key, value] of Object.entries(originalFrontmatter)) {
      // Skip Obsidian internal fields
      if (key === 'position') continue;
      // If already in output, skip (new value takes precedence)
      if (key in output) continue;
      // Preserve the original value
      output[key] = value;
    }
  }

  // Preserve field order: rebuild with original keys first, then new keys
  if (originalFrontmatter) {
    const orderedOutput: Record<string, unknown> = {};
    // First, add all original keys in their original order
    for (const key of Object.keys(originalFrontmatter)) {
      if (key === 'position') continue; // Skip Obsidian internal field
      if (key in output) {
        orderedOutput[key] = output[key];
      }
    }
    // Then add any new keys
    for (const [key, value] of Object.entries(output)) {
      if (!(key in orderedOutput)) {
        orderedOutput[key] = value;
      }
    }
    return orderedOutput;
  }

  return output;
}

/**
 * Parse all markdown sections from a file body.
 * Returns a map of sectionName -> content (trimmed, without the heading line).
 * Robust against spacing and older formats; if no regex matches but '##' exists, falls back to a manual splitter.
 * Now properly handles empty sections to prevent field bleeding.
 */
export function parseSectionsFromMarkdown(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  if (!content) return sections;

  // Use the fallback splitter approach as primary method for better handling of empty sections
  if (content.includes('##')) {
    const lines = content.split('\n');
    let currentSection = '';
    let buffer: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('##')) {
        // Save previous section if it exists
        if (currentSection) {
          const text = buffer.join('\n').trim();
          // Always store the section, even if empty - this prevents field bleeding
          sections[currentSection] = text;
        }
        // Start new section
        currentSection = line.replace(/^##\s*/, '').trim();
        buffer = [];
      } else if (currentSection) {
        buffer.push(line);
      }
    }
    
    // Save the last section
    if (currentSection) {
      const text = buffer.join('\n').trim();
      // Always store the section, even if empty - this prevents field bleeding
      sections[currentSection] = text;
    }
  }

  if (Object.keys(sections).length > 0) return sections;

  return sections;
}

/**
 * Utility to create a safe file name from an entity name.
 */
export function toSafeFileName(name: string, fallback = 'Untitled'): string {
  const base = (name && name.trim()) ? name : fallback;
  return base.replace(/[\\/:"*?<>|#^\[\]{}]+/g, '');
}
