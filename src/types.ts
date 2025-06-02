/**
 * TypeScript type definitions for Storyteller Suite plugin
 * These interfaces define the data structures used throughout the plugin
 */

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
}

/**
 * Location entity representing a place, area, or geographical feature in the story
 * Locations are stored as markdown files with frontmatter in the location folder
 */
export interface Location {
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
}

/**
 * Event entity representing a significant occurrence, plot point, or happening in the story
 * Events are stored as markdown files with frontmatter in the event folder
 */
export interface Event {
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