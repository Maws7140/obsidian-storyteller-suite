/**
 * TypeScript type definitions for Storyteller Suite plugin
 * These interfaces define the data structures used throughout the plugin
 */

/**
 * PlotItem entity representing an important object or artifact in the story.
 * These are stored as markdown files with frontmatter in the item folder.
 */
export interface PlotItem {
    /** Optional unique identifier for the item */
    id?: string;
    
    /** File system path to the item's markdown file */
    filePath?: string;

    /** Display name of the item (e.g., "The Dragon's Tooth Dagger") */
    name: string;

    /** Path to a representative image of the item within the vault */
    profileImagePath?: string;

    /** A simple boolean to flag this as plot-critical. This is the "bookmark" */
    isPlotCritical: boolean;

    /** Visual description of the item (stored in markdown body) */
    description?: string;

    /** The origin, past events, and lore associated with the item (stored in markdown body) */
    history?: string;

    /** Link to the Character who currently possesses the item */
    currentOwner?: string;

    /** Links to Characters who previously owned the item */
    pastOwners?: string[];

    /** Link to the Location where the item currently is */
    currentLocation?: string;

    /** Links to Events where this item played a significant role */
    associatedEvents?: string[];

    /** User-defined custom fields for additional item data */
    customFields?: Record<string, string>;
    
    /** Array of group ids this item belongs to */
    groups?: string[];
}

/**
 * Reference entity representing miscellaneous references for a story
 * Examples: language notes, prophecy lists, random inspiration, etc.
 * Stored as markdown files with frontmatter in the reference folder
 */
export interface Reference {
    /** Optional unique identifier for the reference */
    id?: string;

    /** File system path to the reference markdown file */
    filePath?: string;

    /** Display name of the reference (required) */
    name: string;

    /** Category of the reference (e.g., Language, Prophecy, Inspiration, Misc) */
    category?: string;

    /** Optional tags for filtering/search */
    tags?: string[];

    /** Optional representative image path within the vault */
    profileImagePath?: string;

    /** Main free-form content (stored in markdown body under `## Content`) */
    content?: string;
}

/**
 * Chapter entity representing an ordered unit in a story
 * Stores links to existing entities (characters/locations/events/items/groups)
 */
export interface Chapter {
    /** Optional unique identifier */
    id?: string;

    /** File system path to the chapter markdown file */
    filePath?: string;

    /** Display title of the chapter (required) */
    name: string;

    /** Chapter number for ordering */
    number?: number;

    /** Optional tags for filtering/search */
    tags?: string[];

    /** Optional representative image path within the vault */
    profileImagePath?: string;

    /** Short synopsis (stored under `## Summary`) */
    summary?: string;

    /** Linked entities by name (or id for groups) */
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    /** Groups are internal to settings, we link by id for stability */
    linkedGroups?: string[];
}

/**
 * Scene entity representing a granular narrative unit.
 * Can be standalone or attached to a Chapter.
 */
export interface Scene {
    id?: string;
    filePath?: string;
    name: string;
    /** Optional link to a Chapter by id (undefined when unassigned) */
    chapterId?: string;
    /** Optional mirror for display/update convenience */
    chapterName?: string;
    /** Workflow status */
    status?: string; // Draft | Outline | WIP | Revised | Final | ...
    /** Ordering within a chapter */
    priority?: number;
    tags?: string[];
    profileImagePath?: string;
    /** Main prose */
    content?: string;
    /** Optional beat list */
    beats?: string[];
    /** Linked entities by name (groups by id) */
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    linkedGroups?: string[];
}


/**
 * Character entity representing a person, creature, or significant figure in the story
 * Characters are stored as markdown files with frontmatter in the character folder
 */
export interface Character {
    /** Optional unique identifier for the character */
    id?: string;
    
    /** File system path to the character's markdown file */
    filePath?: string;
    
    /** Display name of the character (required) */
    name: string;
    
    /** Path to the character's profile image within the vault */
    profileImagePath?: string;
    
    /** Main description of the character (stored in markdown body) */
    description?: string;
    
    /** Array of character traits, personality attributes, or abilities */
    traits?: string[];
    
    /** Character's background story (stored in markdown body) */
    backstory?: string;
    
    /** Names/links of related characters (relationships, family, etc.) */
    relationships?: string[];
    
    /** Names/links of locations associated with this character */
    locations?: string[];
    
    /** Names/links of events this character was involved in */
    events?: string[];
    
    /** User-defined custom fields for additional character data */
    customFields?: Record<string, string>;
    
    /** Current status of the character (e.g., "Alive", "Deceased", "Missing") */
    status?: string;
    
    /** Character's allegiance, group, or faction (e.g., "Guild Name", "Kingdom") */
    affiliation?: string;
    
    /** Array of group ids this character belongs to */
    groups?: string[];
}

/**
 * Location entity representing a place, area, or geographical feature in the story
 * Locations are stored as markdown files with frontmatter in the location folder
 */
export interface Location {
    /** Optional unique identifier for the location */
    id?: string;
    
    /** Display name of the location (required) */
    name: string;
    
    /** Main description of the location (stored in markdown body) */
    description?: string;
    
    /** Historical information about the location (stored in markdown body) */
    history?: string;
    
    /** User-defined custom fields for additional location data */
    customFields?: Record<string, string>;
    
    /** File system path to the location's markdown file */
    filePath?: string;
    
    /** Type or category of location (e.g., "City", "Forest", "Tavern") */
    locationType?: string;
    
    /** Parent region, area, or broader geographical context */
    region?: string;
    
    /** Current state of the location (e.g., "Populated", "Abandoned", "Under Siege") */
    status?: string;
    
    /** Path to a representative image of the location within the vault */
    profileImagePath?: string;
    
    /** Array of group ids this location belongs to */
    groups?: string[];
}

/**
 * Event entity representing a significant occurrence, plot point, or happening in the story
 * Events are stored as markdown files with frontmatter in the event folder
 */
export interface Event {
    /** Optional unique identifier for the event */
    id?: string;
    
    /** Display name of the event (required) */
    name: string;
    
    /** Date and/or time when the event occurred (string format for flexibility) */
    dateTime?: string;
    
    /** Main description of what happened (stored in markdown body) */
    description?: string;
    
    /** Names/links of characters who were involved in or affected by this event */
    characters?: string[];
    
    /** Name/link of the primary location where this event took place */
    location?: string;
    
    /** Results, consequences, or resolution of the event (stored in markdown body) */
    outcome?: string;
    
    /** Paths/links to images associated with this event */
    images?: string[];
    
    /** User-defined custom fields for additional event data */
    customFields?: Record<string, string>;
    
    /** File system path to the event's markdown file */
    filePath?: string;
    
    /** Current status of the event (e.g., "Upcoming", "Completed", "Ongoing") */
    status?: string;
    
    /** Path to a representative image of the event within the vault */
    profileImagePath?: string;
    
    /** Array of group ids this event belongs to */
    groups?: string[];
}

/**
 * Group entity representing a user-defined collection of characters, events, and locations
 * Groups are specific to a story and can contain any mix of members from that story
 */
export interface Group {
    /** Unique identifier for the group */
    id: string;
    /** ID of the story this group belongs to */
    storyId: string;
    /** Display name of the group (required) */
    name: string;
    /** Optional description of the group */
    description?: string;
    /** Optional color for the group (for UI) */
    color?: string;
    /** Optional tags for filtering/search */
    tags?: string[];
    /** Optional representative image path within the vault */
    profileImagePath?: string;
    /** Array of group members, each with type and id */
    members: Array<{ type: 'character' | 'event' | 'location' | 'item'; id: string }>;
}

/**
 * Gallery image metadata stored in plugin settings
 * Represents an image file in the vault with associated storytelling metadata
 * The actual image files remain in their original vault locations
 */
export interface GalleryImage {
    /** Unique identifier for this gallery entry (generated automatically) */
    id: string;
    
    /** File system path to the actual image file within the vault */
    filePath: string;
    
    /** Display title for the image */
    title?: string;
    
    /** Short caption or subtitle for the image */
    caption?: string;
    
    /** Detailed description of the image content */
    description?: string;
    
    /** Names/links of characters depicted or associated with this image */
    linkedCharacters?: string[];
    
    /** Names/links of locations depicted or associated with this image */
    linkedLocations?: string[];
    
    /** Names/links of events depicted or associated with this image */
    linkedEvents?: string[];
    
    /** User-defined tags for categorizing and searching images */
    tags?: string[];
}

/**
 * Gallery data structure stored in plugin settings
 * Contains all gallery image metadata - not the actual image files
 */
export interface GalleryData {
    /** Array of all gallery image metadata entries */
    images: GalleryImage[];
}

/**
 * Story entity representing a collection of characters, locations, and events
 * Each story is isolated and has its own folders for entities
 */
export interface Story {
    /** Unique identifier for the story (generated automatically) */
    id: string;
    /** Display name of the story (required) */
    name: string;
    /** ISO string of creation date */
    created: string;
    /** Optional description of the story */
    description?: string;
}