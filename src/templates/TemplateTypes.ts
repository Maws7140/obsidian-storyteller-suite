/**
 * Template system type definitions
 * Supports pre-built and user-created templates with full entity relationship mapping
 */

import {
    Character,
    Location,
    Event,
    PlotItem,
    Group,
    Culture,
    Economy,
    MagicSystem,
    Chapter,
    Scene,
    Reference,
    StoryMap,
    Book,
    CampaignSession,
    CompendiumEntry
} from '../types';

/**
 * Genre categories for templates
 */
export type TemplateGenre =
    | 'fantasy'
    | 'scifi'
    | 'mystery'
    | 'horror'
    | 'romance'
    | 'historical'
    | 'western'
    | 'thriller'
    | 'custom';

/**
 * Template categories based on scope
 */
export type TemplateCategory =
    | 'full-world'      // Complete story world with all entity types
    | 'entity-set'      // Themed collection (e.g., "Medieval Castle Setting")
    | 'single-entity';  // Individual archetype (e.g., "Wise Mentor Character")

/**
 * Entity types that can be included in templates
 */
export type TemplateEntityType =
    | 'character'
    | 'location'
    | 'event'
    | 'item'
    | 'group'
    | 'map'
    | 'culture'
    | 'economy'
    | 'magicSystem'
    | 'chapter'
    | 'scene'
    | 'reference'
    | 'compendiumEntry'
    | 'book'
    | 'campaignSession';

export type TemplateVariableValue = string | number | boolean;

/**
 * Whether a link writes the selected existing entity's ID or its display name
 * into the target field. Some fields store IDs (e.g. currentLocationId, groups),
 * others store names (e.g. locations, event.characters).
 */
export type TemplateLinkValueKind = 'id' | 'name';

/**
 * Declares that an entity created by this template should be linked to an
 * existing vault entity (chosen at apply time) by writing the chosen entity's
 * reference into one of the created entity's fields.
 *
 * No new target entity is created — the link only attaches an existing one.
 */
export interface TemplateExistingEntityLink {
    /** Unique identifier for this link (keys the user's selection at apply time) */
    id: string;

    /** templateId of the entity inside this template that receives the link (e.g. "CHAR_1") */
    sourceTemplateId: string;

    /** Entity type of the source template entity */
    sourceType: TemplateEntityType;

    /** Existing vault entity type the user chooses from */
    targetType: TemplateEntityType;

    /** Field on the created source entity to write the selected reference into */
    targetField: string;

    /** Label shown in the apply modal */
    label: string;

    /** Whether the user must provide a selection */
    required: boolean;

    /** Whether the field holds multiple references (array) or a single value */
    multiple: boolean;

    /** Whether to write the selected entity's ID or display name */
    valueKind: TemplateLinkValueKind;
}

/**
 * User selections for existing-entity links, keyed by link ID.
 * Single links store a string; multiple links store a string array.
 */
export type ExistingEntityLinkSelections = Record<string, string | string[]>;

/**
 * Template entity - includes templateId for relationship mapping
 * and optional section content and custom YAML fields
 */
export type TemplateEntity<T> = Partial<T> & {
    /** Temporary ID used within template for relationship mapping */
    templateId: string;

    /**
     * Raw YAML frontmatter content as a string
     * This is the preferred format for new templates
     * Example: "name: {{characterName}}\nstatus: Alive\ntraits: [Brave, Loyal]"
     */
    yamlContent?: string;

    /**
     * Raw markdown body content as a string
     * This is the preferred format for new templates
     * Example: "## Description\nA brave knight...\n\n## Backstory\nBorn in..."
     */
    markdownContent?: string;

    /**
     * Section content for markdown body (e.g., Description, Backstory, History)
     * Maps section names to their content
     * Example: { "Description": "A brave knight...", "Backstory": "Born in..." }
     */
    sectionContent?: Record<string, string>;

    /**
     * Custom YAML fields not in the core entity structure
     * Allows templates to define arbitrary frontmatter fields
     * Example: { "customRating": 5, "customTags": ["tag1", "tag2"] }
     */
    customYamlFields?: Record<string, unknown>;
};

/**
 * Complete template definition
 */
export interface Template {
    /** Unique identifier for the template */
    id: string;

    /** Display name of the template */
    name: string;

    /** Detailed description of what the template provides */
    description: string;

    /** Genre/setting classification */
    genre: TemplateGenre;

    /** Scope/category of the template */
    category: TemplateCategory;

    /** Version string (semantic versioning) */
    version: string;

    /** Author name ('built-in' for shipped templates, or user name) */
    author: string;

    /** Whether this is a built-in template */
    isBuiltIn: boolean;

    /** Whether this template can be edited (built-in templates are read-only) */
    isEditable: boolean;

    /** ISO date string when template was created */
    created: string;

    /** ISO date string when template was last modified */
    modified: string;

    /** Tags for searching/filtering */
    tags: string[];

    /** Path to preview/thumbnail image */
    thumbnail?: string;

    /** Template entities organized by type */
    entities: TemplateEntities;

    /** Metadata about the template */
    metadata?: TemplateMetadata;

    /** Which entity types this template provides (for filtering) */
    entityTypes?: TemplateEntityType[];

    /** Number of times this template has been used */
    usageCount?: number;

    /** ISO date string when template was last used */
    lastUsed?: string;

    /** Field-level customization and placeholders */
    placeholders?: TemplatePlaceholder[];

    /** Whether to show in quick-apply menus */
    quickApplyEnabled?: boolean;

    /** Parent template ID if this is derived from another template */
    parentTemplateId?: string;

    /** Template variables for advanced customization */
    variables?: TemplateVariable[];

    /** Whether this template is backed by a markdown note */
    isNoteBased?: boolean;

    /** Source markdown file path for note-based templates */
    noteFilePath?: string;

    /** Links from template-created entities to existing vault entities (chosen at apply time) */
    existingEntityLinks?: TemplateExistingEntityLink[];
}

/**
 * Container for all entity types in a template
 */
export interface TemplateEntities {
    characters?: TemplateEntity<Character>[];
    locations?: TemplateEntity<Location>[];
    events?: TemplateEntity<Event>[];
    items?: TemplateEntity<PlotItem>[];
    groups?: TemplateEntity<Group>[];
    maps?: TemplateEntity<StoryMap>[];
    cultures?: TemplateEntity<Culture>[];
    economies?: TemplateEntity<Economy>[];
    magicSystems?: TemplateEntity<MagicSystem>[];
    chapters?: TemplateEntity<Chapter>[];
    scenes?: TemplateEntity<Scene>[];
    references?: TemplateEntity<Reference>[];
    compendiumEntries?: TemplateEntity<CompendiumEntry>[];
    books?: TemplateEntity<Book>[];
    campaignSessions?: TemplateEntity<CampaignSession>[];
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
    /** Required plugins for full functionality */
    requiredPlugins?: string[];

    /** Recommended settings for best experience */
    recommendedSettings?: Record<string, unknown>;

    /** Setup instructions or tips for users */
    setupInstructions?: string;

    /** Total entity counts for quick reference */
    entityCounts?: Partial<Record<TemplateEntityType, number>>;

    /** Preview/showcase images */
    showcaseImages?: string[];

    /** License information for custom templates */
    license?: string;

    /** External URL for more information */
    sourceUrl?: string;

    /** Help text for specific fields */
    fieldInstructions?: Record<string, string>;

    /** Which custom fields are required for this template */
    requiredCustomFields?: string[];

    /** Suggested relationship types to add */
    suggestedRelationships?: string[];
}

/**
 * Template placeholder for field-level customization
 */
export interface TemplatePlaceholder {
    /** Entity type this placeholder applies to */
    entityType: TemplateEntityType;

    /** Template ID of the specific entity */
    entityTemplateId: string;

    /** Field name to apply placeholder to */
    field: string;

    /** Placeholder text to show in UI */
    placeholderText: string;

    /** Default value for the field */
    defaultValue?: string;

    /** Whether this field is required */
    isRequired: boolean;

    /** Validation rule (regex pattern or validation type) */
    validationRule?: string;

    /** Help text for this field */
    helpText?: string;
}

/**
 * Template variable for advanced customization (Phase 5)
 */
export interface TemplateVariable {
    /** Variable name (e.g., "kingdomName", "characterAge") */
    name: string;

    /** Display label for UI */
    label: string;

    /** Variable type */
    type: 'text' | 'number' | 'boolean' | 'select' | 'date';

    /** Default value */
    defaultValue?: string | number | boolean;

    /** For select type, the available options */
    options?: string[];

    /** Description/help text */
    description?: string;

    /** Where this variable is used (for dependency tracking) */
    usedIn?: {
        entityType: TemplateEntityType;
        entityTemplateId: string;
        field: string;
    }[];
}

/**
 * Template application options
 */
export interface TemplateApplicationOptions {
    /** Target story ID */
    storyId: string;

    /** Whether to merge with existing story or replace */
    mode: 'merge' | 'replace';

    /** Entity IDs to include (if not provided, include all) */
    includeEntities?: TemplateEntitySelection;

    /** Mapping of template entity IDs to existing entity IDs */
    entityMapping?: Map<string, string>;

    /** Whether to create relationships between template and existing entities */
    mergeRelationships?: boolean;

    /** Custom field overrides before applying */
    fieldOverrides?: Map<string, Partial<Record<string, unknown>>>;

    /** Whether to prompt for customization before applying */
    promptForCustomization?: boolean;

    /** Auto-prefix entity names (e.g., "Copy of ") */
    namePrefix?: string;

    /** Keep template IDs or generate new ones */
    preserveOriginalIds?: boolean;

    /** Override default entity folder */
    targetFolder?: string;

    /** Create entities without relationships */
    skipRelationships?: boolean;

    /** Template variable values (for Phase 5) */
    variableValues?: Record<string, TemplateVariableValue>;

    /** Selected existing vault entities for the template's existingEntityLinks, keyed by link ID */
    existingEntityLinkSelections?: ExistingEntityLinkSelections;
}

/**
 * Entity selection for template application
 */
export interface TemplateEntitySelection {
    characters?: string[];  // templateIds to include
    locations?: string[];
    events?: string[];
    items?: string[];
    groups?: string[];
    maps?: string[];
    cultures?: string[];
    economies?: string[];
    magicSystems?: string[];
    chapters?: string[];
    scenes?: string[];
    references?: string[];
    compendiumEntries?: string[];
    books?: string[];
    campaignSessions?: string[];
}

/**
 * Template application result
 */
export interface TemplateApplicationResult {
    /** Whether application succeeded */
    success: boolean;

    /** Error message if failed */
    error?: string;

    /** Map of template IDs to created entity IDs */
    idMap: Map<string, string>;

    /** Entities that were created */
    created: {
        characters: Character[];
        locations: Location[];
        events: Event[];
        items: PlotItem[];
        groups: Group[];
        maps: StoryMap[];
        cultures: Culture[];
        economies: Economy[];
        magicSystems: MagicSystem[];
        chapters: Chapter[];
        scenes: Scene[];
        references: Reference[];
        compendiumEntries: CompendiumEntry[];
        books: Book[];
        campaignSessions: CampaignSession[];
    };

    /** Warnings or issues encountered */
    warnings?: string[];
}

/**
 * Template validation result
 */
export interface TemplateValidationResult {
    /** Whether template is valid */
    isValid: boolean;

    /** Validation errors */
    errors: string[];

    /** Validation warnings (non-fatal issues) */
    warnings: string[];

    /** Broken references (templateIds that don't exist) */
    brokenReferences: {
        entityType: TemplateEntityType;
        entityId: string;
        referenceType: string;
        targetId: string;
    }[];
}

/**
 * Template export format
 */
export interface TemplateExportData {
    /** Template metadata */
    template: Template;

    /** Export format version */
    exportVersion: string;

    /** Export timestamp */
    exportedAt: string;

    /** Optional bundled images (base64 encoded) */
    bundledImages?: {
        path: string;
        data: string;
        mimeType: string;
    }[];
}

/**
 * Shareable package format for exchanging templates between vaults/users.
 * This wraps existing Template objects instead of replacing the internal
 * template JSON shape used by the plugin.
 */
export interface SharedTemplatePackage {
    packageVersion: string;
    exportedAt: string;
    appVersion?: string;
    manifest: {
        name: string;
        description?: string;
        author?: string;
        tags?: string[];
        entityTypes?: TemplateEntityType[];
        license?: string;
        sourceUrl?: string;
    };
    templates: Template[];
}

/**
 * Template filter criteria for searching
 */
export interface TemplateFilter {
    /** Genre filter */
    genre?: TemplateGenre[];

    /** Category filter */
    category?: TemplateCategory[];

    /** Entity type filter (templates that contain these entity types) */
    entityTypes?: TemplateEntityType[];

    /** Search text (name, description, tags) */
    searchText?: string;

    /** Author filter */
    author?: string[];

    /** Show built-in templates */
    showBuiltIn?: boolean;

    /** Show user templates */
    showCustom?: boolean;

    /** Minimum entity count */
    minEntities?: number;

    /** Maximum entity count */
    maxEntities?: number;

    /** Sort by usage count */
    sortByUsage?: boolean;

    /** Sort by recently used */
    sortByRecent?: boolean;
}

/**
 * Template statistics for display
 */
export interface TemplateStats {
    /** Total entities in template */
    totalEntities: number;

    /** Entity counts by type */
    entityCounts: Record<TemplateEntityType, number>;

    /** Total relationships */
    totalRelationships: number;

    /** Estimated file size */
    estimatedSize?: string;
}
