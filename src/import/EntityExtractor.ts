/**
 * Entity Extractor
 * Extracts character names and location names from text using pattern matching
 */

import { Character, Location } from '../types';

/**
 * Extracted entity from text
 */
export interface ExtractedEntity {
    /** The extracted name */
    name: string;

    /** Type of entity */
    type: 'character' | 'location';

    /** Number of times this entity appears */
    occurrences: number;

    /** Confidence level of the extraction */
    confidence: 'high' | 'medium' | 'low';

    /** Sample contexts where the entity was found */
    contexts: string[];
}

/**
 * Match between extracted entity and existing entity
 */
export interface EntityMatch {
    /** The extracted name from text */
    extractedName: string;

    /** The existing entity it might match (if any) */
    existingEntity?: Character | Location;

    /** Match confidence */
    matchConfidence: 'high' | 'medium' | 'low';

    /** Entity type */
    type: 'character' | 'location';
}

/**
 * Entity mapping action
 */
export type EntityMappingAction = 'create' | 'link' | 'ignore';

/**
 * Entity mapping configuration
 */
export interface EntityMappingConfig {
    /** Extracted entity name */
    extractedName: string;

    /** Entity type */
    type: 'character' | 'location';

    /** Action to take */
    action: EntityMappingAction;

    /** ID of existing entity to link to (if action is 'link') */
    linkedEntityId?: string;

    /** Name for new entity (if action is 'create') */
    newEntityName?: string;
}

/**
 * Common words to exclude from character detection
 */
const COMMON_WORDS = new Set([
    // Articles and pronouns
    'the', 'a', 'an', 'i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they',
    'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
    // Common nouns often capitalized at sentence start
    'chapter', 'part', 'book', 'story', 'scene', 'act', 'section', 'prologue', 'epilogue',
    // Time-related
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 
    'september', 'october', 'november', 'december',
    'morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year',
    // Common titles that aren't names
    'mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'lord', 'lady', 'king', 'queen', 'prince', 'princess',
    // Common sentence starters
    'then', 'now', 'there', 'here', 'when', 'where', 'what', 'who', 'why', 'how',
    'after', 'before', 'during', 'while', 'until', 'since', 'although', 'because',
    'however', 'therefore', 'meanwhile', 'suddenly', 'finally', 'perhaps', 'maybe',
    // Other common words
    'yes', 'no', 'okay', 'ok', 'well', 'just', 'only', 'also', 'still', 'even',
    'but', 'and', 'or', 'not', 'if', 'so', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'with',
    // Place type words
    'city', 'town', 'village', 'kingdom', 'empire', 'country', 'land', 'world',
    'castle', 'palace', 'tower', 'house', 'home', 'room', 'hall', 'chamber',
    'forest', 'mountain', 'river', 'lake', 'sea', 'ocean', 'island', 'valley',
    'road', 'street', 'path', 'bridge', 'gate', 'door', 'window',
    // Generic titles
    'chapter', 'section', 'part', 'book', 'volume', 'episode'
]);

/**
 * Location indicator prepositions
 */
const LOCATION_PREPOSITIONS = ['in', 'at', 'to', 'from', 'near', 'by', 'through', 'into', 'onto', 'toward', 'towards'];

/**
 * Dialogue attribution verbs
 */
const DIALOGUE_VERBS = [
    'said', 'asked', 'replied', 'answered', 'whispered', 'shouted', 'yelled',
    'screamed', 'muttered', 'murmured', 'declared', 'exclaimed', 'demanded',
    'inquired', 'responded', 'called', 'cried', 'laughed', 'sighed', 'groaned',
    'agreed', 'argued', 'added', 'continued', 'began', 'finished', 'interrupted',
    'suggested', 'warned', 'promised', 'admitted', 'confessed', 'explained',
    'announced', 'stated', 'remarked', 'noted', 'observed', 'commented'
];

/**
 * Entity Extractor class
 */
export class EntityExtractor {
    /**
     * Extract all entities from text
     */
    extractEntities(text: string): { characters: ExtractedEntity[]; locations: ExtractedEntity[] } {
        const characters = this.extractCharacterNames(text);
        const locations = this.extractLocationNames(text);

        // Filter out locations that might be characters and vice versa
        const characterNames = new Set(characters.map(c => c.name.toLowerCase()));
        const filteredLocations = locations.filter(loc => !characterNames.has(loc.name.toLowerCase()));

        return {
            characters,
            locations: filteredLocations
        };
    }

    /**
     * Extract character names from text
     */
    extractCharacterNames(text: string): ExtractedEntity[] {
        const candidates = new Map<string, { count: number; contexts: string[] }>();

        // Pattern 1: Dialogue attribution - "said John", "John said", etc.
        const dialoguePatterns = DIALOGUE_VERBS.map(verb => [
            new RegExp(`${verb}\\s+([A-Z][a-z]+)(?:[,.]|\\s|$)`, 'g'),
            new RegExp(`([A-Z][a-z]+)\\s+${verb}`, 'g')
        ]).flat();

        for (const pattern of dialoguePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const name = match[1];
                if (this.isValidCharacterName(name)) {
                    this.addCandidate(candidates, name, this.getContext(text, match.index), 3);
                }
            }
        }

        // Pattern 2: Possessive forms - "John's"
        const possessivePattern = /\b([A-Z][a-z]+)'s\b/g;
        let match;
        while ((match = possessivePattern.exec(text)) !== null) {
            const name = match[1];
            if (this.isValidCharacterName(name)) {
                this.addCandidate(candidates, name, this.getContext(text, match.index), 2);
            }
        }

        // Pattern 3: Capitalized words appearing frequently
        const capitalizedPattern = /\b([A-Z][a-z]+)\b/g;
        const frequencyMap = new Map<string, number>();
        while ((match = capitalizedPattern.exec(text)) !== null) {
            const name = match[1];
            if (this.isValidCharacterName(name)) {
                frequencyMap.set(name, (frequencyMap.get(name) || 0) + 1);
            }
        }

        // Add frequent capitalized words (appearing 3+ times)
        for (const [name, count] of frequencyMap) {
            if (count >= 3) {
                const idx = text.indexOf(name);
                this.addCandidate(candidates, name, this.getContext(text, idx), 1);
            }
        }

        // Convert to ExtractedEntity array
        return this.buildExtractedEntities(candidates, 'character');
    }

    /**
     * Extract location names from text
     */
    extractLocationNames(text: string): ExtractedEntity[] {
        const candidates = new Map<string, { count: number; contexts: string[] }>();

        // Pattern 1: Preposition + "the" + capitalized word(s)
        // e.g., "in the Castle", "at the Dark Forest"
        for (const prep of LOCATION_PREPOSITIONS) {
            const pattern = new RegExp(`${prep}\\s+(?:the\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`, 'gi');
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const location = match[1];
                if (this.isValidLocationName(location)) {
                    this.addCandidate(candidates, location, this.getContext(text, match.index), 2);
                }
            }
        }

        // Pattern 2: Multi-word proper nouns (e.g., "Dark Forest", "Crystal Palace")
        const multiWordPattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
        let match;
        while ((match = multiWordPattern.exec(text)) !== null) {
            const location = match[1];
            // Check if it looks like a location (has location-type words)
            if (this.looksLikeLocation(location)) {
                this.addCandidate(candidates, location, this.getContext(text, match.index), 1);
            }
        }

        // Pattern 3: Scene headers (screenplay-style)
        const scenePattern = /^(?:INT|EXT|INTERIOR|EXTERIOR)[\.\s]+([A-Z][^\n-]+)/gim;
        while ((match = scenePattern.exec(text)) !== null) {
            const location = match[1].trim();
            if (location.length > 2 && location.length < 50) {
                this.addCandidate(candidates, location, this.getContext(text, match.index), 3);
            }
        }

        return this.buildExtractedEntities(candidates, 'location');
    }

    /**
     * Match extracted entities to existing entities
     */
    matchExistingEntities(
        extracted: ExtractedEntity[],
        existingCharacters: Character[],
        existingLocations: Location[]
    ): EntityMatch[] {
        const matches: EntityMatch[] = [];

        for (const entity of extracted) {
            const existing = entity.type === 'character'
                ? this.findMatchingCharacter(entity.name, existingCharacters)
                : this.findMatchingLocation(entity.name, existingLocations);

            matches.push({
                extractedName: entity.name,
                existingEntity: existing?.entity,
                matchConfidence: existing?.confidence || 'low',
                type: entity.type
            });
        }

        return matches;
    }

    /**
     * Find matching character
     */
    private findMatchingCharacter(
        name: string,
        characters: Character[]
    ): { entity: Character; confidence: 'high' | 'medium' | 'low' } | null {
        const lowerName = name.toLowerCase();

        for (const char of characters) {
            const charName = (char.name || '').toLowerCase();

            // Exact match
            if (charName === lowerName) {
                return { entity: char, confidence: 'high' };
            }

            // First name match (if character has full name)
            const charFirstName = charName.split(' ')[0];
            if (charFirstName === lowerName) {
                return { entity: char, confidence: 'medium' };
            }

            // Check if name appears in character's traits (might contain aliases)
            if (char.traits) {
                const traitMatch = char.traits.some(trait => 
                    trait.toLowerCase().includes(lowerName)
                );
                if (traitMatch) {
                    return { entity: char, confidence: 'medium' };
                }
            }
        }

        return null;
    }

    /**
     * Find matching location
     */
    private findMatchingLocation(
        name: string,
        locations: Location[]
    ): { entity: Location; confidence: 'high' | 'medium' | 'low' } | null {
        const lowerName = name.toLowerCase();

        for (const loc of locations) {
            const locName = (loc.name || '').toLowerCase();

            // Exact match
            if (locName === lowerName) {
                return { entity: loc, confidence: 'high' };
            }

            // Partial match (location name contains extracted name or vice versa)
            if (locName.includes(lowerName) || lowerName.includes(locName)) {
                return { entity: loc, confidence: 'medium' };
            }
        }

        return null;
    }

    /**
     * Check if a word is a valid character name candidate
     */
    private isValidCharacterName(name: string): boolean {
        if (!name || name.length < 2 || name.length > 30) return false;
        if (COMMON_WORDS.has(name.toLowerCase())) return false;
        // Must start with uppercase
        if (!/^[A-Z]/.test(name)) return false;
        // Should not be all uppercase (likely an acronym)
        if (name === name.toUpperCase()) return false;
        return true;
    }

    /**
     * Check if a phrase is a valid location name candidate
     */
    private isValidLocationName(name: string): boolean {
        if (!name || name.length < 2 || name.length > 50) return false;
        const words = name.toLowerCase().split(/\s+/);
        // At least one word should not be a common word
        return words.some(word => !COMMON_WORDS.has(word));
    }

    /**
     * Check if a phrase looks like a location name
     */
    private looksLikeLocation(phrase: string): boolean {
        const locationWords = [
            'castle', 'palace', 'tower', 'fortress', 'citadel',
            'forest', 'woods', 'mountain', 'peak', 'valley', 'river', 'lake', 'sea', 'ocean',
            'city', 'town', 'village', 'kingdom', 'empire', 'realm',
            'inn', 'tavern', 'shop', 'market', 'square', 'plaza',
            'temple', 'church', 'cathedral', 'shrine', 'monastery',
            'cave', 'cavern', 'dungeon', 'crypt', 'tomb',
            'bridge', 'road', 'path', 'street', 'gate', 'wall',
            'garden', 'park', 'field', 'farm', 'mill',
            'harbor', 'port', 'dock', 'bay', 'cove',
            'island', 'isle', 'peninsula', 'coast', 'shore',
            'mansion', 'manor', 'estate', 'hall', 'house'
        ];

        const lowerPhrase = phrase.toLowerCase();
        return locationWords.some(word => lowerPhrase.includes(word));
    }

    /**
     * Add a candidate to the map
     */
    private addCandidate(
        candidates: Map<string, { count: number; contexts: string[] }>,
        name: string,
        context: string,
        weight: number
    ): void {
        const existing = candidates.get(name);
        if (existing) {
            existing.count += weight;
            if (existing.contexts.length < 3 && !existing.contexts.includes(context)) {
                existing.contexts.push(context);
            }
        } else {
            candidates.set(name, { count: weight, contexts: [context] });
        }
    }

    /**
     * Get context snippet around a position
     */
    private getContext(text: string, position: number): string {
        const start = Math.max(0, position - 30);
        const end = Math.min(text.length, position + 50);
        let context = text.slice(start, end).replace(/\n/g, ' ').trim();
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';
        return context;
    }

    /**
     * Build ExtractedEntity array from candidates
     */
    private buildExtractedEntities(
        candidates: Map<string, { count: number; contexts: string[] }>,
        type: 'character' | 'location'
    ): ExtractedEntity[] {
        const entities: ExtractedEntity[] = [];

        for (const [name, data] of candidates) {
            // Determine confidence based on count
            let confidence: 'high' | 'medium' | 'low';
            if (data.count >= 5) {
                confidence = 'high';
            } else if (data.count >= 3) {
                confidence = 'medium';
            } else {
                confidence = 'low';
            }

            entities.push({
                name,
                type,
                occurrences: data.count,
                confidence,
                contexts: data.contexts
            });
        }

        // Sort by occurrences descending
        entities.sort((a, b) => b.occurrences - a.occurrences);

        return entities;
    }
}

