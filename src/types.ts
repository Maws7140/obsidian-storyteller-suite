/**
 * TypeScript type definitions for Storyteller Suite plugin
 * These interfaces define the data structures used throughout the plugin
 */

/**
 * Relationship types for network graph visualization
 */
export type RelationshipType = 
    | 'ally' 
    | 'enemy' 
    | 'family' 
    | 'rival' 
    | 'romantic' 
    | 'mentor' 
    | 'acquaintance' 
    | 'neutral' 
    | 'custom';

/**
 * Typed relationship for network graph connections
 * Supports both simple string references and detailed typed relationships
 */
export interface TypedRelationship {
    /** Target entity name or ID */
    target: string;
    /** Type of relationship for color-coding */
    type: RelationshipType;
    /** Optional descriptive label */
    label?: string;
}

/**
 * Filters for network graph visualization
 */
export interface GraphFilters {
    /** Filter by specific group IDs */
    groups?: string[];
    /** Filter events after this date */
    timelineStart?: string;
    /** Filter events before this date */
    timelineEnd?: string;
    /** Filter by entity types to show */
    entityTypes?: ('character' | 'location' | 'event' | 'item')[];
}

/**
 * Node in the network graph
 */
export interface GraphNode {
    /** Unique identifier */
    id: string;
    /** Display label */
    label: string;
    /** Entity type for styling */
    type: 'character' | 'location' | 'event' | 'item';
    /** Full entity data */
    data: Character | Location | Event | PlotItem;
    /** Optional image URL for node background */
    imageUrl?: string;
}

/**
 * Edge in the network graph
 */
export interface GraphEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Relationship type for color-coding */
    relationshipType: RelationshipType;
    /** Optional label */
    label?: string;
}

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
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
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
    
    /** Names/links of related characters (relationships, family, etc.) - supports both string[] and TypedRelationship[] for backward compatibility */
    relationships?: (string | TypedRelationship)[];
    
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
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
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
    
    /** Name or identifier of the parent location that contains this location */
    parentLocation?: string;
    
    /** Array of group ids this location belongs to */
    groups?: string[];
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
    
    /** Primary map ID where this location is featured
     * @deprecated Map functionality has been deprecated */
    mapId?: string;
    
    /** Additional maps where this location appears
     * @deprecated Map functionality has been deprecated */
    relatedMapIds?: string[];
    
    /** Marker IDs representing this location on various maps
     * @deprecated Map functionality has been deprecated */
    markerIds?: string[];
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
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
    
    /** Flag to mark this event as a milestone (key story moment) */
    isMilestone?: boolean;
    
    /** Array of event names/ids that this event depends on (for Gantt-style dependencies) */
    dependencies?: string[];

    /** Completion progress (0-100) for tracking event status */
    progress?: number;

    /** ID of the map where this event is primarily displayed
     * @deprecated Map functionality has been deprecated */
    mapId?: string;

    /** IDs of markers representing this event on various maps
     * @deprecated Map functionality has been deprecated */
    markerIds?: string[];
}

/**
 * Group entity representing a user-defined collection of characters, events, and locations
 * Groups are specific to a story and can contain any mix of members from that story
 */
/**
 * Enhanced member interface for faction-type groups
 */
export interface GroupMemberDetails {
    /** Entity type and ID */
    type: 'character' | 'event' | 'location' | 'item';
    id: string;

    /** Character name (for display) */
    name?: string;

    /** Member's rank or position (faction-type groups) */
    rank?: string;

    /** Join date (faction-type groups) */
    joinDate?: string;

    /** Loyalty level (faction-type groups) */
    loyalty?: 'devoted' | 'loyal' | 'neutral' | 'wavering' | 'traitor';
}

/**
 * Group relationship for faction-type groups
 */
export interface GroupRelationship {
    /** Target group name or ID */
    groupName: string;

    /** Nature of the relationship */
    relationshipType: 'allied' | 'friendly' | 'neutral' | 'rival' | 'hostile' | 'at-war';

    /** Additional context */
    notes?: string;
}

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

    /** Type of group: simple collection or faction-like organization */
    groupType?: 'collection' | 'faction' | 'organization' | 'guild' | 'political' | 'military' | 'religious' | 'custom';

    /** Array of group members with optional detailed information */
    members: GroupMemberDetails[];

    // Faction-enhanced fields (optional, used when groupType is faction-like)

    /** Faction's origin and history */
    history?: string;

    /** Organizational structure */
    structure?: string;

    /** Faction's objectives and motivations */
    goals?: string;

    /** Available resources */
    resources?: string;

    /** Overall strength/influence level */
    strength?: string;

    /** Current status */
    status?: string;

    /** Military power rating (0-100) */
    militaryPower?: number;

    /** Economic power rating (0-100) */
    economicPower?: number;

    /** Political influence rating (0-100) */
    politicalInfluence?: number;

    /** Group/faction colors */
    colors?: string[];

    /** Emblem or symbol description */
    emblem?: string;

    /** Motto or slogan */
    motto?: string;

    /** Territories controlled */
    territories?: string[];

    /** Relationships with other groups/factions */
    groupRelationships?: GroupRelationship[];

    /** Links to significant events */
    linkedEvents?: string[];

    /** Link to associated culture */
    linkedCulture?: string;

    /** Parent group (if sub-group) */
    parentGroup?: string;

    /** Sub-groups under this group */
    subgroups?: string[];

    /** User-defined custom fields */
    customFields?: Record<string, string>;

    /** Typed connections to other entities */
    connections?: TypedRelationship[];
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

/**
 * Map marker representing a location or point of interest on a map
 * Used for pinning locations, events, or custom points on interactive maps
 * @deprecated Map functionality has been deprecated and will be removed in a future version
 */
export interface MapMarker {
    /** Unique identifier for this marker */
    id: string;

    /** Type of entity this marker represents */
    markerType?: 'location' | 'event' | 'childMap';

    /** Name or identifier of linked location entity */
    locationName?: string;

    /** Name or identifier of linked event entity */
    eventName?: string;

    /** ID of child map this marker links to (for map portals) */
    childMapId?: string;

    /** Latitude coordinate (or Y for image-based maps) */
    lat: number;

    /** Longitude coordinate (or X for image-based maps) */
    lng: number;

    /** Icon identifier or path to custom icon image */
    icon?: string;

    /** Marker color for visual distinction */
    color?: string;

    /** Display label for the marker */
    label?: string;

    /** Marker description or notes */
    description?: string;

    /** Scale/size multiplier for the marker icon */
    scale?: number;

    /** Whether marker is currently visible */
    visible?: boolean;

    /** Minimum zoom level at which marker appears */
    minZoom?: number;

    /** Maximum zoom level at which marker appears */
    maxZoom?: number;
}

/**
 * Map layer containing a collection of related map objects
 * Enables organization and selective visibility of map elements
 * @deprecated Map functionality has been deprecated and will be removed in a future version
 */
export interface MapLayer {
    /** Unique identifier for this layer */
    id: string;
    
    /** Display name of the layer */
    name: string;
    
    /** Whether layer is currently visible */
    visible: boolean;
    
    /** Whether layer is locked from editing */
    locked?: boolean;
    
    /** Layer opacity (0-1) */
    opacity?: number;
    
    /** GeoJSON or Leaflet objects in this layer */
    objects?: any[];
    
    /** Z-index for layer ordering */
    zIndex?: number;
}

/**
 * Map entity representing an interactive geographical or spatial map
 * Maps can display locations, support custom drawings, and organize hierarchically
 * Stored as markdown files with frontmatter and JSON data
 * @deprecated Map functionality has been deprecated and will be removed in a future version
 */
export interface Map {
    /** Unique identifier for the map */
    id?: string;
    
    /** Display name of the map (required) */
    name: string;
    
    /** Detailed description of the map */
    description?: string;
    
    /** Map scale/hierarchy level */
    scale: 'world' | 'region' | 'city' | 'building' | 'custom';
    
    /** ID of parent map in hierarchy */
    parentMapId?: string;
    
    /** IDs of child maps at smaller scales */
    childMapIds?: string[];
    
    /** Path to background image file for the map */
    backgroundImagePath?: string;
    
    /** Serialized Leaflet map state (layers, drawings, etc.) */
    mapData?: string;
    
    /** Map dimensions in pixels (for image-based maps) */
    width?: number;
    height?: number;
    
    /** Default zoom level for the map */
    defaultZoom?: number;
    
    /** Center coordinates [lat, lng] for the map */
    center?: [number, number];
    
    /** Bounds for image overlay [[south, west], [north, east]] */
    bounds?: [[number, number], [number, number]];
    
    /** Array of markers placed on this map */
    markers: MapMarker[];
    
    /** Layer organization for map objects */
    layers?: MapLayer[];
    
    /** Whether grid overlay is enabled */
    gridEnabled?: boolean;
    
    /** Grid cell size in pixels or map units */
    gridSize?: number;
    
    /** GeoJSON file paths to load as layers */
    geojsonFiles?: string[];
    
    /** GPX file paths to load as tracks/waypoints */
    gpxFiles?: string[];
    
    /** Custom tile server URL template (e.g., https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png) */
    tileServer?: string;
    
    /** Enable OpenStreetMap tile layer for real-world maps */
    osmLayer?: boolean;
    
    /** Tile server subdomains (comma-separated, e.g., "a,b,c") */
    tileSubdomains?: string;
    
    /** Attribution text for the tile server (supports HTML) */
    tileAttribution?: string;
    
    /** File paths to scan for frontmatter markers */
    markerFiles?: string[];
    
    /** Folder paths to scan for frontmatter markers */
    markerFolders?: string[];
    
    /** Tags to filter markers by (requires DataView) */
    markerTags?: string[];
    
    /** File system path to the map's markdown file */
    filePath?: string;
    
    /** Path to thumbnail image for map browser */
    profileImagePath?: string;
    
    /** Names of locations featured on this map */
    linkedLocations?: string[];
    
    /** Array of group ids this map belongs to */
    groups?: string[];
    
    /** User-defined custom fields */
    customFields?: Record<string, string>;
    
    /** ISO string of creation date */
    created?: string;
    
    /** ISO string of last modification date */
    modified?: string;
}

/**
 * Map Template - Pre-configured map layouts and styles
 * Templates provide starting points for creating new maps with common configurations
 * @deprecated Map functionality has been deprecated and will be removed in a future version
 */
export interface MapTemplate {
    /** Unique identifier for the template */
    id: string;

    /** Display name of the template */
    name: string;

    /** Description of what this template is for */
    description: string;

    /** Category for organizing templates */
    category: 'world' | 'region' | 'city' | 'building' | 'dungeon' | 'battle' | 'custom';

    /** Tags for searching/filtering templates */
    tags?: string[];

    /** Path to preview/thumbnail image */
    thumbnailPath?: string;

    /** Base64 encoded preview image (for embedded templates) */
    thumbnailData?: string;

    /** Map scale this template is designed for */
    scale: 'world' | 'region' | 'city' | 'building' | 'custom';

    /** Default map dimensions */
    width?: number;
    height?: number;

    /** Default zoom level */
    defaultZoom?: number;

    /** Default center coordinates */
    center?: [number, number];

    /** Pre-configured markers */
    markers?: Partial<MapMarker>[];

    /** Grid configuration */
    gridEnabled?: boolean;
    gridSize?: number;

    /** Background image (optional - can be placeholder or actual asset) */
    backgroundImagePath?: string;
    backgroundImageData?: string; // Base64 for embedded templates

    /** Template metadata */
    author?: string;
    version?: string;
    createdDate?: string;

    /** Whether this is a built-in or user-created template */
    isBuiltIn?: boolean;

    /** Custom instructions or tips for using this template */
    usageNotes?: string;
}

/**
 * Culture entity representing a society, civilization, or cultural group in the story world
 * Cultures define languages, values, social structures, and traditions
 */
export interface Culture {
    /** Optional unique identifier */
    id?: string;

    /** File system path to the culture's markdown file */
    filePath?: string;

    /** Display name of the culture (required) */
    name: string;

    /** Path to a representative image within the vault */
    profileImagePath?: string;

    /** Overview of the culture (stored in markdown body) */
    description?: string;

    /** Core cultural values and worldview (stored in markdown body) */
    values?: string;

    /** Religious beliefs and practices (stored in markdown body) */
    religion?: string;

    /** Class hierarchy and social organization (stored in markdown body) */
    socialStructure?: string;

    /** Origins and cultural evolution (stored in markdown body) */
    history?: string;

    /** Naming patterns and traditions (stored in markdown body) */
    namingConventions?: string;

    /** Cultural customs and practices (stored in markdown body) */
    customs?: string;

    /** Languages spoken by this culture */
    languages?: string[];

    /** Technology level of the culture */
    techLevel?: string;

    /** Type of government system */
    governmentType?: string;

    /** Current status of the culture */
    status?: string;

    /** Estimated population size */
    population?: string;

    /** Links to locations where this culture is prevalent */
    linkedLocations?: string[];

    /** Links to characters of this culture */
    linkedCharacters?: string[];

    /** Links to events significant to this culture */
    linkedEvents?: string[];

    /** Related or neighboring cultures */
    relatedCultures?: string[];

    /** Parent culture (if derived from another) */
    parentCulture?: string;

    /** User-defined custom fields */
    customFields?: Record<string, string>;

    /** Array of group ids this culture belongs to */
    groups?: string[];

    /** Typed connections to other entities */
    connections?: TypedRelationship[];
}

/**
 * Currency sub-interface for Economy
 */
export interface Currency {
    /** Name of the currency */
    name: string;

    /** Exchange rate relative to a base currency */
    exchangeRate?: number;

    /** Visual description of the currency */
    description?: string;
}

/**
 * Resource sub-interface for Economy
 */
export interface Resource {
    /** Name of the resource */
    name: string;

    /** How common or rare the resource is */
    availability: 'abundant' | 'common' | 'uncommon' | 'rare' | 'legendary';

    /** Average market value */
    value?: string;

    /** Description of the resource */
    description?: string;
}

/**
 * Trade route sub-interface for Economy
 */
export interface TradeRoute {
    /** Name or identifier of the trade route */
    name: string;

    /** Origin location */
    origin: string;

    /** Destination location */
    destination: string;

    /** Primary goods traded */
    goods?: string[];

    /** Status of the route */
    status?: string;
}

/**
 * Economy entity representing an economic system in the story world
 * Defines currencies, resources, trade routes, and economic relationships
 */
export interface Economy {
    /** Optional unique identifier */
    id?: string;

    /** File system path to the economy's markdown file */
    filePath?: string;

    /** Display name of the economy (required) */
    name: string;

    /** Path to a representative image within the vault */
    profileImagePath?: string;

    /** Overview of the economic system (stored in markdown body) */
    description?: string;

    /** Industries and production information (stored in markdown body) */
    industries?: string;

    /** Tax systems and policies (stored in markdown body) */
    taxation?: string;

    /** Type of economic system */
    economicSystem?: string;

    /** Current economic status */
    status?: string;

    /** Currencies used in this economy */
    currencies?: Currency[];

    /** Available resources */
    resources?: Resource[];

    /** Active trade routes */
    tradeRoutes?: TradeRoute[];

    /** Links to locations using this economy */
    linkedLocations?: string[];

    /** Links to factions controlling this economy */
    linkedFactions?: string[];

    /** Links to cultures participating in this economy */
    linkedCultures?: string[];

    /** Links to economic events */
    linkedEvents?: string[];

    /** User-defined custom fields */
    customFields?: Record<string, string>;

    /** Array of group ids this economy belongs to */
    groups?: string[];

    /** Typed connections to other entities */
    connections?: TypedRelationship[];
}

/**
 * Faction member sub-interface
 */
// Faction entity has been merged into Group entity
// Use Group with groupType='faction' for faction-like organizations

/**
 * Magic category sub-interface
 */
export interface MagicCategory {
    /** Name of the category */
    name: string;

    /** Description of this type of magic */
    description?: string;

    /** Difficulty level */
    difficulty?: 'trivial' | 'easy' | 'moderate' | 'hard' | 'master' | 'forbidden';
}

/**
 * Magic ability sub-interface
 */
export interface MagicAbility {
    /** Name of the ability or spell */
    name: string;

    /** Category this ability belongs to */
    category?: string;

    /** Power level */
    powerLevel?: number;

    /** Cost or resource requirement */
    cost?: string;

    /** Description of what the ability does */
    description?: string;
}

/**
 * Consistency rule sub-interface for magic systems
 */
export interface ConsistencyRule {
    /** Rule name or title */
    name: string;

    /** Detailed explanation of the rule */
    description: string;

    /** Importance level */
    priority?: 'critical' | 'important' | 'optional';
}

/**
 * MagicSystem entity representing a system of magic or supernatural powers
 * Defines rules, costs, limitations, and abilities available in the world
 */
export interface MagicSystem {
    /** Optional unique identifier */
    id?: string;

    /** File system path to the magic system's markdown file */
    filePath?: string;

    /** Display name of the magic system (required) */
    name: string;

    /** Path to a representative image within the vault */
    profileImagePath?: string;

    /** Overview of the magic system (stored in markdown body) */
    description?: string;

    /** Core rules and mechanics (stored in markdown body) */
    rules?: string;

    /** Source of magical power (stored in markdown body) */
    source?: string;

    /** Costs and consequences of using magic (stored in markdown body) */
    costs?: string;

    /** Limitations and restrictions (stored in markdown body) */
    limitations?: string;

    /** How practitioners learn magic (stored in markdown body) */
    training?: string;

    /** History and origins of the magic system (stored in markdown body) */
    history?: string;

    /** Type of magic system */
    systemType?: string;

    /** How common magic users are */
    rarity?: string;

    /** Overall power level */
    powerLevel?: string;

    /** Current status */
    status?: string;

    /** Required materials or components */
    materials?: string[];

    /** Categories of magic */
    categories?: MagicCategory[];

    /** Specific abilities or spells */
    abilities?: MagicAbility[];

    /** Internal consistency rules */
    consistencyRules?: ConsistencyRule[];

    /** Links to characters who use this magic */
    linkedCharacters?: string[];

    /** Links to locations where this magic is practiced */
    linkedLocations?: string[];

    /** Links to cultures that use this magic */
    linkedCultures?: string[];

    /** Links to events involving this magic */
    linkedEvents?: string[];

    /** Links to magical items */
    linkedItems?: string[];

    /** User-defined custom fields */
    customFields?: Record<string, string>;

    /** Array of group ids this magic system belongs to */
    groups?: string[];

    /** Typed connections to other entities */
    connections?: TypedRelationship[];
}


/**
 * Altered entity in a timeline fork
 */
export interface AlteredEntity {
    /** Entity ID or name */
    entityId: string;

    /** Type of entity */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** What changed about this entity */
    changes: string;
}

/**
 * TimelineFork entity representing an alternate timeline or "what-if" scenario
 * Allows tracking divergent story paths from a key decision point
 */
export interface TimelineFork {
    /** Unique identifier */
    id: string;

    /** Display name of the fork */
    name: string;

    /** Parent timeline ID (undefined for main timeline) */
    parentTimelineId?: string;

    /** Event where timeline diverged */
    divergenceEvent: string;

    /** Date of divergence */
    divergenceDate: string;

    /** Description of what changed */
    description?: string;

    /** Current status */
    status: 'exploring' | 'canon' | 'abandoned' | 'merged';

    /** Events unique to this fork */
    forkEvents?: string[];

    /** Characters altered in this fork */
    alteredCharacters?: AlteredEntity[];

    /** Locations altered in this fork */
    alteredLocations?: AlteredEntity[];

    /** Color for visualization */
    color?: string;

    /** Creation timestamp */
    created: string;

    /** Additional notes */
    notes?: string;
}

/**
 * CausalityLink representing cause-and-effect relationships between events
 */
export interface CausalityLink {
    /** Unique identifier */
    id: string;

    /** ID or name of the cause event */
    causeEvent: string;

    /** ID or name of the effect event */
    effectEvent: string;

    /** Type of causal relationship */
    linkType: string;

    /** Strength of the causal connection */
    strength?: 'weak' | 'moderate' | 'strong' | 'absolute';

    /** Description of how the cause led to the effect */
    description?: string;
}

/**
 * Conflict entity in timeline conflict detection
 */
export interface ConflictEntity {
    /** Entity ID or name */
    entityId: string;

    /** Type of entity */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** Display name */
    entityName: string;

    /** Which field has the conflict */
    conflictField?: string;

    /** Conflicting value */
    conflictValue?: string;
}

/**
 * TimelineConflict representing detected inconsistencies in the timeline
 */
export interface TimelineConflict {
    /** Unique identifier */
    id: string;

    /** Type of conflict */
    type: 'location' | 'death' | 'age' | 'causality' | 'custom';

    /** Severity level */
    severity: 'minor' | 'moderate' | 'critical';

    /** Entities involved in the conflict */
    entities: ConflictEntity[];

    /** Events involved in the conflict */
    events: string[];

    /** Description of the conflict */
    description: string;

    /** Suggested resolution */
    suggestion?: string;

    /** Whether user has dismissed this conflict */
    dismissed: boolean;

    /** When the conflict was detected */
    detected: string;
}

/**
 * Chapter pacing information
 */
export interface ChapterPacing {
    /** Chapter name or number */
    chapterName: string;

    /** Word count */
    wordCount: number;

    /** Event count in chapter */
    eventCount: number;

    /** Estimated reading time in minutes */
    readingTime?: number;

    /** Pacing rating */
    pacing?: 'slow' | 'moderate' | 'fast' | 'intense';
}

/**
 * Event density analysis
 */
export interface EventDensity {
    /** Time period */
    period: string;

    /** Number of events in period */
    eventCount: number;

    /** Density rating */
    density?: 'sparse' | 'balanced' | 'crowded';
}

/**
 * Tension point in the story
 */
export interface TensionPoint {
    /** Location in story */
    location: string;

    /** Tension level */
    tensionLevel: number;

    /** Type of tension */
    tensionType?: string;
}

/**
 * Pacing recommendation
 */
export interface PacingRecommendation {
    /** Area of concern */
    area: string;

    /** Type of recommendation */
    type: 'warning' | 'suggestion' | 'success';

    /** Recommendation message */
    message: string;
}

/**
 * PacingAnalysis entity for analyzing story pacing and structure
 */
export interface PacingAnalysis {
    /** Unique identifier */
    id?: string;

    /** When analysis was performed */
    analyzedDate: string;

    /** Chapter-by-chapter pacing */
    chapterPacing?: ChapterPacing[];

    /** Event density over time */
    eventDensity?: EventDensity[];

    /** Tension points */
    tensionPoints?: TensionPoint[];

    /** Recommendations for improvement */
    recommendations?: PacingRecommendation[];

    /** Overall pacing score */
    overallScore?: number;
}

/**
 * WritingSession tracking individual writing sessions
 */
export interface WritingSession {
    /** Unique identifier */
    id: string;

    /** Session start time */
    startTime: string;

    /** Session end time */
    endTime?: string;

    /** Words written in session */
    wordsWritten: number;

    /** Files edited */
    filesEdited?: string[];

    /** Session notes */
    notes?: string;
}

/**
 * Character screen time analysis
 */
export interface CharacterScreenTime {
    /** Character name */
    characterName: string;

    /** Number of scenes/events */
    appearances: number;

    /** Estimated word count featuring character */
    wordCount?: number;

    /** Percentage of total story */
    percentage?: number;
}

/**
 * Event distribution analysis
 */
export interface EventDistribution {
    /** Time period or category */
    category: string;

    /** Event count */
    count: number;

    /** Percentage of total */
    percentage?: number;
}

/**
 * Dialogue analysis
 */
export interface DialogueAnalysis {
    /** Total dialogue count */
    totalLines?: number;

    /** Dialogue per character */
    byCharacter?: Record<string, number>;

    /** Dialogue density */
    density?: number;
}

/**
 * Point of view statistics
 */
export interface POVStats {
    /** POV character name */
    character: string;

    /** Scene/chapter count from this POV */
    sceneCount: number;

    /** Percentage of story */
    percentage?: number;
}

/**
 * Writing velocity data
 */
export interface VelocityData {
    /** Date */
    date: string;

    /** Words written */
    wordsWritten: number;

    /** Time spent writing */
    timeSpent?: number;
}

/**
 * Foreshadowing pair tracking setup and payoff
 */
export interface ForeshadowingPair {
    /** Setup event or hint */
    setup: string;

    /** Payoff event or resolution */
    payoff?: string;

    /** Status */
    status: 'planted' | 'resolved' | 'abandoned';

    /** Distance between setup and payoff */
    distance?: string;
}

/**
 * StoryAnalytics entity for comprehensive story analysis
 */
export interface StoryAnalytics {
    /** Last update timestamp */
    lastUpdated: string;

    /** Total word count */
    totalWords?: number;

    /** Character screen time breakdown */
    characterScreenTime?: CharacterScreenTime[];

    /** Event distribution */
    eventDistribution?: EventDistribution[];

    /** Dialogue analysis */
    dialogueAnalysis?: DialogueAnalysis;

    /** POV statistics */
    povStats?: POVStats[];

    /** Writing velocity over time */
    velocity?: VelocityData[];

    /** Foreshadowing tracking */
    foreshadowing?: ForeshadowingPair[];
}

/**
 * Atmosphere profile for sensory details
 */
export interface AtmosphereProfile {
    /** Overall mood */
    mood: string;

    /** Dominant emotion */
    emotion?: string;

    /** Intensity level */
    intensity?: number;
}

/**
 * Sensory details breakdown
 */
export interface SensoryDetails {
    /** Visual details */
    sight?: string;

    /** Auditory details */
    sound?: string;

    /** Olfactory details */
    smell?: string;

    /** Tactile details */
    touch?: string;

    /** Taste details */
    taste?: string;
}

/**
 * Mood profile
 */
export interface MoodProfile {
    /** Primary mood */
    primary: string;

    /** Secondary mood */
    secondary?: string;

    /** Mood intensity */
    intensity?: number;
}

/**
 * Color palette
 */
export interface ColorPalette {
    /** Dominant colors */
    dominant?: string[];

    /** Accent colors */
    accent?: string[];

    /** Color temperature */
    temperature?: 'warm' | 'cool' | 'neutral';
}

/**
 * Ambient sound
 */
export interface AmbientSound {
    /** Sound name or description */
    name: string;

    /** Sound volume/prominence */
    volume?: 'quiet' | 'moderate' | 'loud';

    /** Sound frequency */
    frequency?: 'constant' | 'intermittent' | 'rare';
}

/**
 * Sound profile
 */
export interface SoundProfile {
    /** Background/ambient sounds */
    ambient?: AmbientSound[];

    /** Overall sound level */
    soundLevel?: 'silent' | 'quiet' | 'moderate' | 'noisy' | 'deafening';
}

/**
 * Time-based variations
 */
export interface TimeVariation {
    /** Time of day */
    timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'dusk' | 'night' | 'midnight';

    /** Sensory changes at this time */
    changes?: SensoryDetails;

    /** Mood changes */
    mood?: string;
}

/**
 * Seasonal variations
 */
export interface SeasonalVariation {
    /** Season name */
    season: string;

    /** Sensory changes in this season */
    changes?: SensoryDetails;

    /** Mood changes */
    mood?: string;
}

/**
 * LocationSensoryProfile entity for rich sensory descriptions of locations
 */
export interface LocationSensoryProfile {
    /** Location ID or name this profile is for */
    locationId: string;

    /** Location name for reference */
    locationName?: string;

    /** Atmosphere profile */
    atmosphere?: AtmosphereProfile;

    /** Base sensory details */
    sensoryDetails?: SensoryDetails;

    /** Mood profile */
    mood?: MoodProfile;

    /** Color palette */
    colors?: ColorPalette;

    /** Sound profile */
    sounds?: SoundProfile;

    /** Time-of-day variations */
    timeVariations?: TimeVariation[];

    /** Seasonal variations */
    seasonalVariations?: SeasonalVariation[];

    /** Additional notes */
    notes?: string;
}

