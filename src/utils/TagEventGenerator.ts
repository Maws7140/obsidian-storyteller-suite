import type { Event, Scene, Chapter, Reference } from '../types';

/**
 * Tagged entity that can be converted to a timeline event
 */
export interface TaggedEntity {
    /** Type of entity */
    type: 'event' | 'scene' | 'chapter' | 'reference';
    /** The actual entity */
    entity: Event | Scene | Chapter | Reference;
    /** Tags found on this entity */
    tags: string[];
    /** Extracted date (if found) */
    extractedDate?: string;
}

/**
 * Options for tag-based event generation
 */
export interface TagGenerationOptions {
    /** Tags to search for (match any) */
    tags: string[];
    /** Entity types to scan */
    entityTypes: Array<'scene' | 'chapter' | 'reference'>;
    /** Date field names to check (in order of priority) */
    dateFields?: string[];
    /** Name template for generated events */
    nameTemplate?: string;
    /** Whether to extract dates from content */
    extractDatesFromContent?: boolean;
    /** Prefix for generated event IDs */
    idPrefix?: string;
}

/**
 * Utility class for generating timeline events from tagged entities
 */
export class TagEventGenerator {
    /**
     * Find all entities that have any of the specified tags
     */
    static findEntitiesWithTags(
        scenes: Scene[],
        chapters: Chapter[],
        references: Reference[],
        tags: string[],
        entityTypes: Array<'scene' | 'chapter' | 'reference'>
    ): TaggedEntity[] {
        const taggedEntities: TaggedEntity[] = [];
        const tagSet = new Set(tags.map(t => t.toLowerCase()));

        // Scan scenes
        if (entityTypes.includes('scene')) {
            for (const scene of scenes) {
                if (!scene.tags || scene.tags.length === 0) continue;

                const matchingTags = scene.tags.filter(tag =>
                    tagSet.has(tag.toLowerCase())
                );

                if (matchingTags.length > 0) {
                    taggedEntities.push({
                        type: 'scene',
                        entity: scene,
                        tags: matchingTags
                    });
                }
            }
        }

        // Scan chapters
        if (entityTypes.includes('chapter')) {
            for (const chapter of chapters) {
                if (!chapter.tags || chapter.tags.length === 0) continue;

                const matchingTags = chapter.tags.filter(tag =>
                    tagSet.has(tag.toLowerCase())
                );

                if (matchingTags.length > 0) {
                    taggedEntities.push({
                        type: 'chapter',
                        entity: chapter,
                        tags: matchingTags
                    });
                }
            }
        }

        // Scan references
        if (entityTypes.includes('reference')) {
            for (const reference of references) {
                if (!reference.tags || reference.tags.length === 0) continue;

                const matchingTags = reference.tags.filter(tag =>
                    tagSet.has(tag.toLowerCase())
                );

                if (matchingTags.length > 0) {
                    taggedEntities.push({
                        type: 'reference',
                        entity: reference,
                        tags: matchingTags
                    });
                }
            }
        }

        return taggedEntities;
    }

    /**
     * Extract date from entity metadata
     */
    static extractDateFromEntity(
        entity: Scene | Chapter | Reference,
        dateFields: string[] = ['date', 'dateTime', 'created', 'modified']
    ): string | undefined {
        for (const field of dateFields) {
            const value = (entity as any)[field];
            if (value && typeof value === 'string' && value.trim() !== '') {
                return value.trim();
            }
        }

        // Try to extract from content (basic patterns)
        const content = (entity as any).content || (entity as any).description || '';
        if (content && typeof content === 'string') {
            const dateMatch = this.extractDateFromContent(content);
            if (dateMatch) {
                return dateMatch;
            }
        }

        return undefined;
    }

    /**
     * Extract date from content using simple patterns
     */
    private static extractDateFromContent(content: string): string | undefined {
        // Look for common date patterns
        const patterns = [
            /\b(\d{4}-\d{2}-\d{2})\b/, // ISO date: 2024-03-15
            /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/, // US date: 3/15/2024
            /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i, // March 15, 2024
            /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i // 15 March 2024
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return undefined;
    }

    /**
     * Generate event from tagged entity
     */
    static generateEventFromEntity(
        taggedEntity: TaggedEntity,
        options: TagGenerationOptions
    ): Event {
        const entity = taggedEntity.entity;
        const nameTemplate = options.nameTemplate || '[{type}] {name}';

        // Generate name from template
        const eventName = nameTemplate
            .replace('{type}', taggedEntity.type.charAt(0).toUpperCase() + taggedEntity.type.slice(1))
            .replace('{name}', entity.name || 'Untitled');

        // Extract date
        let dateTime: string | undefined = taggedEntity.extractedDate;
        if (!dateTime && options.dateFields) {
            dateTime = this.extractDateFromEntity(entity, options.dateFields);
        }

        // Build event
        const event: Event = {
            id: options.idPrefix
                ? `${options.idPrefix}-${taggedEntity.type}-${entity.id || entity.name}`
                : undefined,
            name: eventName,
            dateTime: dateTime,
            description: this.getEntityDescription(taggedEntity),
            tags: [...taggedEntity.tags],
            customFields: {
                sourceEntityType: taggedEntity.type,
                sourceEntityId: entity.id || entity.name,
                generatedFromTags: 'true'
            }
        };

        // Add character/location links if available
        if ('linkedCharacters' in entity && entity.linkedCharacters) {
            event.characters = entity.linkedCharacters;
        }
        if ('linkedLocations' in entity && Array.isArray(entity.linkedLocations) && entity.linkedLocations.length > 0) {
            event.location = entity.linkedLocations[0];
        }
        if ('linkedEvents' in entity && entity.linkedEvents) {
            // Could link to these events as dependencies
            event.customFields = event.customFields || {};
            event.customFields.relatedEvents = entity.linkedEvents.join(', ');
        }

        return event;
    }

    /**
     * Get description from entity
     */
    private static getEntityDescription(taggedEntity: TaggedEntity): string {
        const entity = taggedEntity.entity;

        if ('description' in entity && entity.description) {
            return entity.description;
        }

        if ('content' in entity && entity.content) {
            return entity.content;
        }

        if ('summary' in entity && (entity as any).summary) {
            return (entity as any).summary;
        }

        return `Generated from ${taggedEntity.type}: ${entity.name}`;
    }

    /**
     * Generate multiple events from tagged entities
     */
    static generateEvents(
        scenes: Scene[],
        chapters: Chapter[],
        references: Reference[],
        options: TagGenerationOptions
    ): Event[] {
        // Find tagged entities
        const taggedEntities = this.findEntitiesWithTags(
            scenes,
            chapters,
            references,
            options.tags,
            options.entityTypes
        );

        // Extract dates if requested
        if (options.extractDatesFromContent || options.dateFields) {
            for (const taggedEntity of taggedEntities) {
                taggedEntity.extractedDate = this.extractDateFromEntity(
                    taggedEntity.entity,
                    options.dateFields
                );
            }
        }

        // Generate events
        return taggedEntities.map(taggedEntity =>
            this.generateEventFromEntity(taggedEntity, options)
        );
    }

    /**
     * Get all unique tags from entities
     */
    static getAllTags(
        scenes: Scene[],
        chapters: Chapter[],
        references: Reference[]
    ): string[] {
        const tagSet = new Set<string>();

        for (const scene of scenes) {
            if (scene.tags) {
                scene.tags.forEach(tag => tagSet.add(tag));
            }
        }

        for (const chapter of chapters) {
            if (chapter.tags) {
                chapter.tags.forEach(tag => tagSet.add(tag));
            }
        }

        for (const reference of references) {
            if (reference.tags) {
                reference.tags.forEach(tag => tagSet.add(tag));
            }
        }

        return Array.from(tagSet).sort();
    }

    /**
     * Preview events without creating them
     */
    static previewEvents(
        scenes: Scene[],
        chapters: Chapter[],
        references: Reference[],
        options: TagGenerationOptions
    ): Array<{
        event: Event;
        source: TaggedEntity;
        warnings: string[];
    }> {
        const events = this.generateEvents(scenes, chapters, references, options);
        const taggedEntities = this.findEntitiesWithTags(
            scenes,
            chapters,
            references,
            options.tags,
            options.entityTypes
        );

        return events.map((event, index) => {
            const warnings: string[] = [];

            if (!event.dateTime) {
                warnings.push('No date found - event will appear at default position');
            }

            if (!event.description || event.description.trim() === '') {
                warnings.push('No description available');
            }

            if (!event.characters || event.characters.length === 0) {
                warnings.push('No characters linked');
            }

            return {
                event,
                source: taggedEntities[index],
                warnings
            };
        });
    }
}
