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
  }
};

/**
 * Get template sections for an entity type, merging with provided data.
 * @param type Entity type
 * @param providedSections Optional sections from modal (overrides template)
 * @returns Map of sectionName -> content (with all standard sections present, even if empty)
 */
export function getTemplateSections(
  type: EntityType,
  providedSections: Record<string, string> = {}
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


