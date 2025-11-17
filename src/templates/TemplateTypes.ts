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
    Reference
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
    | 'culture'
    | 'economy'
    | 'magicSystem'
    | 'chapter'
    | 'scene'
    | 'reference';

/**
 * Template entity - includes templateId for relationship mapping
 */
export interface TemplateEntity<T> extends Partial<T> {
    /** Temporary ID used within template for relationship mapping */
    templateId: string;
}

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
    cultures?: TemplateEntity<Culture>[];
    economies?: TemplateEntity<Economy>[];
    magicSystems?: TemplateEntity<MagicSystem>[];
    chapters?: TemplateEntity<Chapter>[];
    scenes?: TemplateEntity<Scene>[];
    references?: TemplateEntity<Reference>[];
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
    /** Required plugins for full functionality */
    requiredPlugins?: string[];

    /** Recommended settings for best experience */
    recommendedSettings?: Record<string, any>;

    /** Setup instructions or tips for users */
    setupInstructions?: string;

    /** Total entity counts for quick reference */
    entityCounts?: Record<TemplateEntityType, number>;

    /** Preview/showcase images */
    showcaseImages?: string[];

    /** License information for custom templates */
    license?: string;

    /** External URL for more information */
    sourceUrl?: string;
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
    fieldOverrides?: Map<string, Partial<any>>;
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
    cultures?: string[];
    economies?: string[];
    magicSystems?: string[];
    chapters?: string[];
    scenes?: string[];
    references?: string[];
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
        cultures: Culture[];
        economies: Economy[];
        magicSystems: MagicSystem[];
        chapters: Chapter[];
        scenes: Scene[];
        references: Reference[];
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
 * Template filter criteria for searching
 */
export interface TemplateFilter {
    /** Genre filter */
    genre?: TemplateGenre[];

    /** Category filter */
    category?: TemplateCategory[];

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
