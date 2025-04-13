export interface Character {
    id?: string; // Optional unique ID
    filePath?: string; // Path to the markdown file
    name: string;
    profileImagePath?: string; // Path to profile image in vault
    description?: string;
    traits?: string[];
    backstory?: string;
    relationships?: string[]; // Links/Names of related character notes
    locations?: string[]; // Links/Names of related location notes
    events?: string[]; // Links/Names of related event notes
    customFields?: Record<string, string>;
    status?: string; // e.g., Alive, Deceased, Missing
    affiliation?: string; // e.g., Guild Name, Kingdom, Faction
}

export interface Location {
    name: string;
    description?: string;
    history?: string;
    // REMOVED: characters?: string[]; // Links/Names of characters present
    // REMOVED: events?: string[]; // Links/Names of events that occurred here
    // REMOVED: subLocations?: string[]; // Links/Names of sub-location notes
    customFields?: Record<string, string>;
    filePath?: string;
    locationType?: string; // e.g., City, Forest, Tavern
    region?: string; // Parent region/area
    status?: string; // e.g., Populated, Abandoned
    profileImagePath?: string; // Path to representative image in vault
}

export interface Event {
    name: string;
    dateTime?: string; // Date/Time string (consider using a library later for complex sorting)
    description?: string;
    characters?: string[]; // Links/Names of characters involved
    location?: string; // Link/Name of the location
    outcome?: string;
    images?: string[]; // Links/Paths to associated images
    customFields?: Record<string, string>;
    filePath?: string;
    status?: string; // e.g., Upcoming, Completed, Ongoing
    profileImagePath?: string; // Path to representative image in vault
}

// Using a simpler structure for Gallery, stored in plugin data (JSON)
export interface GalleryImage {
    id: string; // Unique ID (e.g., timestamp or UUID)
    filePath: string; // Path to the image file within the vault
    title?: string;
    caption?: string;
    description?: string;
    linkedCharacters?: string[]; // Links/Names
    linkedLocations?: string[]; // Links/Names
    linkedEvents?: string[]; // Links/Names
    tags?: string[];
}

export interface GalleryData {
    images: GalleryImage[];
}