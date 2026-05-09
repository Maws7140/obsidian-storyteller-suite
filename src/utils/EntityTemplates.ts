import { EntityType } from '../yaml/EntitySections';

/**
 * Templates for standard Markdown sections per entity type.
 * Used to generate skeleton files on creation, even if modal fields are empty.
 * Keys are section names (for "## SectionName"); values are default content.
 */
export const ENTITY_TEMPLATES: Record<EntityType, Record<string, string>> = {
  character: {
    Description: '',
    Backstory: '',
    // Add more if needed, e.g., Traits: '- \n- ' (for bullet list)
  },
  location: {
    Description: '',
    History: '',
  },
  event: {
    Description: '',
    Outcome: '',
  },
  item: {
    Description: '',
    History: '', // Or "Lore" if preferred
  },
  reference: {
    Content: '', // Single main section for references
  },
  chapter: {
    Summary: '',
    // No body content typically; add if needed
  },
  scene: {
    Content: '',
    Beats: '', // Empty; user can add lines like "- Beat 1\n- Beat 2"
  },
  map: {
    Description: '',
    // Maps store most data in frontmatter (markers, layers, etc.)
    // Description section is for overview/notes
  },
  culture: {
    Description: '',
    Values: '',
    Religion: '',
    'Social Structure': '',
    History: '',
    'Naming Conventions': '',
    Customs: '',
  },
  faction: {
    Description: '',
    History: '',
    Structure: '',
    Goals: '',
    Resources: '',
  },
  economy: {
    Description: '',
    Industries: '',
    Taxation: '',
  },
  magicSystem: {
    Description: '',
    Rules: '',
    Source: '',
    Costs: '',
    Limitations: '',
    Training: '',
    History: '',
  },
  compendiumEntry: {
    Description: '',
    'Behavior & Ecology': '',
    Properties: '',
    'History & Lore': '',
    Dimorphism: '',
    'Hunting Notes': '',
  },
  book: {
    Description: '',
    Synopsis: '',
  },
  campaignSession: {
    'Session Log': '',
  }
};

/**
 * Map of body markdown section names to entity field names per type.
 * Used by parseFile to read body sections back into entity properties.
 *
 * The first listed section name for a given field is the canonical one (matching the save side);
 * subsequent entries that target the same field act as legacy fallbacks read only when the
 * canonical section is missing or empty.
 */
export const BODY_SECTION_FIELD_MAP: Record<EntityType, Record<string, string>> = {
  character: {
    Description: 'description',
    Backstory: 'backstory',
  },
  location: {
    Description: 'description',
    History: 'history',
  },
  event: {
    Description: 'description',
    Outcome: 'outcome',
  },
  item: {
    Description: 'description',
    History: 'history',
    'History / Lore': 'history', // legacy fallback
    'Cultural Significance': 'culturalSignificance',
    'Magic Properties': 'magicProperties',
  },
  reference: {
    Content: 'content',
  },
  chapter: {
    Summary: 'summary',
  },
  scene: {
    Content: 'content',
    Beats: 'beats',
    'Beat Sheet': 'beats', // legacy fallback for older notes
  },
  map: {
    Description: 'description',
  },
  culture: {
    Description: 'description',
    Values: 'values',
    Religion: 'religion',
    'Social Structure': 'socialStructure',
    History: 'history',
    'Naming Conventions': 'namingConventions',
    Customs: 'customs',
  },
  faction: {
    Description: 'description',
    History: 'history',
    Structure: 'structure',
    Goals: 'goals',
    Resources: 'resources',
  },
  economy: {
    Description: 'description',
    Industries: 'industries',
    Taxation: 'taxation',
  },
  magicSystem: {
    Description: 'description',
    Rules: 'rules',
    Source: 'source',
    Costs: 'costs',
    Limitations: 'limitations',
    Training: 'training',
    History: 'history',
  },
  compendiumEntry: {
    Description: 'description',
    'Behavior & Ecology': 'behavior',
    Properties: 'properties',
    'History & Lore': 'history',
    Dimorphism: 'dimorphism',
    'Hunting Notes': 'huntingNotes',
  },
  book: {
    Description: 'description',
    Synopsis: 'synopsis',
  },
  campaignSession: {
    // 'Session Log' is read by appendToSessionLog / loadSessionLog directly, not via parseFile
  },
};

/**
 * Get template sections for an entity type, merging with provided data.
 * @param type Entity type
 * @param providedSections Optional sections from modal (overrides template)
 * @returns Map of sectionName -> content (with all standard sections present, even if empty)
 */
export function getTemplateSections(
  type: EntityType,
  providedSections: Record<string, string | undefined> = {}
): Record<string, string> {
  const template = { ...ENTITY_TEMPLATES[type] };
  // Override template with provided sections (including empty ones)
  // This allows users to clear fields and have them saved as empty
  Object.entries(providedSections).forEach(([key, value]) => {
    if (typeof value === 'string') { // Accept all string values, including empty strings
      template[key] = value;
    }
  });
  // Ensure all template keys are present (even if empty)
  Object.keys(ENTITY_TEMPLATES[type]).forEach(key => {
    if (!(key in template)) template[key] = '';
  });
  return template;
}


