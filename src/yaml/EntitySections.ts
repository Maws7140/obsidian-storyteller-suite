/*
 Centralized helpers for entity YAML whitelists and markdown section parsing/serialization.
 The goal is to keep a single source of truth for:
 - which frontmatter keys are allowed per entity type
 - how sections are parsed from markdown and preserved
 - building frontmatter objects from raw entity objects safely
*/

import { parseYaml } from 'obsidian';

export type EntityType =
  | 'character'
  | 'location'
  | 'event'
  | 'item'
  | 'reference'
  | 'chapter'
  | 'scene'
  | 'map'
  | 'culture'
  | 'faction'
  | 'economy'
  | 'magicSystem'
  | 'calendar';

/** Whitelisted frontmatter keys per entity type. */
const FRONTMATTER_WHITELISTS: Record<EntityType, Set<string>> = {
  character: new Set([
    'id', 'name', 'traits', 'relationships', 'locations', 'events',
    'currentLocationId', 'locationHistory',
    'status', 'affiliation', 'groups', 'profileImagePath', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  location: new Set([
    'id', 'name', 'locationType', 'type', 'region', 'status', 'parentLocation', 'parentLocationId',
    'childLocationIds', 'mapBindings', 'entityRefs',
    'groups', 'profileImagePath', 'images', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  event: new Set([
    'id', 'name', 'dateTime', 'characters', 'location', 'status',
    'groups', 'profileImagePath', 'images', 'customFields', 'connections',
    'isMilestone', 'dependencies', 'progress', 'tags', 'narrativeMarkers', 'narrativeSequence',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  item: new Set([
    'id', 'name', 'isPlotCritical', 'currentOwner', 'pastOwners',
    'currentLocation', 'associatedEvents', 'groups', 'profileImagePath', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  reference: new Set([
    'id', 'name', 'category', 'tags', 'profileImagePath',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  chapter: new Set([
    'id', 'name', 'number', 'tags', 'profileImagePath',
    'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups'
  ]),
  scene: new Set([
    'id', 'name', 'chapterId', 'chapterName', 'status', 'priority', 'tags', 'profileImagePath',
    'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  map: new Set([
    'id', 'name', 'description', 'scale', 'parentMapId', 'childMapIds', 'correspondingLocationId', 'backgroundImagePath', 'mapData',
    'width', 'height', 'defaultZoom', 'center', 'bounds', 'markers', 'layers',
    'gridEnabled', 'gridSize', 'profileImagePath', 'linkedLocations', 'linkedCharacters', 'linkedEvents',
    'linkedItems', 'linkedGroups', 'linkedCultures', 'linkedEconomies', 'linkedMagicSystems', 'linkedScenes', 'linkedReferences',
    'groups', 'customFields', 'created', 'modified',
    'type', 'image', 'lat', 'long', 'minZoom', 'maxZoom', 'tileServer', 'darkMode',
    'geojsonFiles', 'gpxFiles', 'tileSubdomains', 'tileAttribution', 'markerFiles', 'markerFolders', 'markerTags'
  ]),
  culture: new Set([
    'id', 'name', 'profileImagePath', 'languages', 'techLevel', 'governmentType', 'status',
    'population', 'linkedLocations', 'linkedCharacters', 'linkedEvents', 'relatedCultures',
    'parentCulture', 'groups', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  faction: new Set([
    'id', 'name', 'profileImagePath', 'factionType', 'strength', 'status', 'militaryPower',
    'economicPower', 'politicalInfluence', 'colors', 'emblem', 'motto', 'members',
    'territories', 'factionRelationships', 'linkedEvents', 'linkedCulture', 'parentFaction',
    'subfactions', 'groups', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  economy: new Set([
    'id', 'name', 'profileImagePath', 'economicSystem', 'status', 'currencies', 'resources',
    'tradeRoutes', 'linkedLocations', 'linkedFactions', 'linkedCultures', 'linkedEvents',
    'groups', 'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  magicSystem: new Set([
    'id', 'name', 'profileImagePath', 'systemType', 'rarity', 'powerLevel', 'status',
    'materials', 'categories', 'abilities', 'consistencyRules', 'linkedCharacters',
    'linkedLocations', 'linkedCultures', 'linkedEvents', 'linkedItems', 'groups',
    'customFields', 'connections',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor'
  ]),
  calendar: new Set([
    'id', 'name', 'profileImagePath', 'calendarType', 'status', 'epoch', 'eras',
    'months', 'daysPerWeek', 'hoursPerDay', 'linkedEvents', 'linkedCultures',
    'groups', 'customFields', 'connections'
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
 * 
 * CRITICAL: This function NEVER deletes fields that existed in originalFrontmatter.
 * Empty values are preserved if they existed in the original file.
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
  
  // Track all keys that existed in original frontmatter - these must NEVER be deleted
  const originalKeys = originalFrontmatter ? new Set(Object.keys(originalFrontmatter)) : new Set<string>();

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
        const existedInOriginal = originalKeys.has(cfKey);
        
        // CRITICAL: If field existed in original, always preserve it regardless of value
        if (existedInOriginal) {
          output[cfKey] = cfVal;
          continue;
        }
        
        // For new fields, apply filtering logic
        if (cfVal === null || cfVal === undefined) continue;        // Skip new empty strings (they should not be preserved unless they existed in original)
        if (typeof cfVal === 'string' && cfVal === '') continue;        if (typeof cfVal === 'string' && cfVal.includes('\n')) { unpromoted[cfKey] = cfVal; continue; }
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
    
    const existedInOriginal = originalKeys.has(key);
    
    // CRITICAL: If field existed in original, always preserve it regardless of value
    if (existedInOriginal) {
      output[key] = value;
      continue;
    }
    
    // For new fields, apply filtering logic
    // Only filter out null/undefined if it didn't exist in original
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      // Skip new empty strings (do not preserve unless present in original frontmatter)
      if (!existedInOriginal && value === '') continue;
      // Exclude multi-line strings from frontmatter; they belong to sections
      if (value.includes('\n')) continue;
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      // Skip empty arrays for new fields
      if (value.length === 0) continue;
      output[key] = value;
      continue;
    }

    if (typeof value === 'object') {
      // Skip empty objects for new fields
      if (Object.keys(value as Record<string, unknown>).length === 0) continue;
      output[key] = value;
      continue;
    }

    output[key] = value;
  }

  // Preserve ALL fields from originalFrontmatter that weren't already processed
  // This ensures user-added fields are NEVER deleted, even if empty
  if (originalFrontmatter) {
    for (const [key, value] of Object.entries(originalFrontmatter)) {
      // Skip Obsidian internal fields
      if (key === 'position') continue;
      // If already in output, skip (new value takes precedence)
      if (key in output) continue;
      // CRITICAL: Preserve the original value, even if null/undefined/empty
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
 * 
 * This function works with or without YAML frontmatter - it only looks for `##` section
 * headings in the content. Callers do NOT need to inject empty frontmatter markers.
 * 
 * Robust against spacing and older formats; properly handles empty sections to prevent
 * field bleeding between sections.
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
 * Parse frontmatter directly from file content.
 * This is a fallback when Obsidian's metadata cache is stale or doesn't capture empty values.
 * 
 * @param content The full file content including frontmatter
 * @returns Parsed frontmatter object or undefined if no frontmatter found
 */
export function parseFrontmatterFromContent(content: string): Record<string, unknown> | undefined {
  if (!content || !content.startsWith('---')) return undefined;

  const frontmatterEndIndex = content.indexOf('\n---', 3);
  if (frontmatterEndIndex === -1) return undefined;

  const frontmatterContent = content.substring(3, frontmatterEndIndex).trim();
  if (!frontmatterContent) return {};

  try {
    // Try to use Obsidian's parseYaml if available for robust YAML parsing
    // This properly handles nested objects, arrays, and complex YAML structures
    try {
      if (parseYaml && typeof parseYaml === 'function') {
        const parsed = parseYaml(frontmatterContent);
        // Ensure we return a plain object
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      }
    } catch (e) {
      // parseYaml not available, fall back to simple parser
    }

    // Fallback: Use simple YAML parsing for basic cases
    // This handles empty values explicitly but has limitations with nested objects
    const lines = frontmatterContent.split('\n');
    const result: Record<string, unknown> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip indented lines (nested objects/arrays) in simple parser
      // These would need proper YAML parsing which we don't have in fallback
      if (line.startsWith('  ') || line.startsWith('\t')) {
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      if (!key) continue;

      let value = line.substring(colonIndex + 1).trim();

      // Handle arrays (value is empty and next line starts with -)
      if (value === '' && i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
        const arrayItems: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim().startsWith('-')) {
          const item = lines[i].trim().substring(1).trim();
          arrayItems.push(item);
          i++;
        }
        i--; // Adjust for loop increment
        result[key] = arrayItems;
        continue;
      }

      // Handle empty value - preserve as empty string
      if (value === '') {
        result[key] = '';
        continue;
      }

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        result[key] = value.slice(1, -1);
        continue;
      }

      // Handle booleans
      if (value === 'true') { result[key] = true; continue; }
      if (value === 'false') { result[key] = false; continue; }

      // Handle null
      if (value === 'null' || value === '~') { result[key] = null; continue; }

      // Handle numbers
      const num = Number(value);
      if (!isNaN(num) && value !== '') {
        result[key] = num;
        continue;
      }

      // Default to string
      result[key] = value;
    }

    return result;
  } catch (e) {
    console.error('[EntitySections] Failed to parse frontmatter:', e);
    return undefined;
  }
}