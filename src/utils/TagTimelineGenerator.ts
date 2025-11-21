import { App, TFile, getAllTags, parseFrontMatterTags } from 'obsidian';
import { Event } from '../types';
import { parseEventDate } from './DateParsing';
import * as chrono from 'chrono-node';

/**
 * Options for tag timeline generation
 */
export interface TagTimelineOptions {
    /** Tags to filter by (if empty, scan all tags) */
    tags: string[];

    /** Date extraction strategy */
    dateStrategy: 'frontmatter' | 'content' | 'file-created' | 'file-modified' | 'auto';

    /** Frontmatter field to use for dates (default: 'date') */
    dateFrontmatterField?: string;

    /** Include note content as event description */
    includeContent?: boolean;

    /** Maximum content length for description (characters) */
    maxContentLength?: number;

    /** Regex patterns to extract dates from content */
    datePatterns?: RegExp[];

    /** Default status for generated events */
    defaultStatus?: string;
}

/**
 * Generated event preview
 */
export interface GeneratedEventPreview {
    /** Event data */
    event: Partial<Event>;

    /** Source file */
    sourceFile: TFile;

    /** Extraction method used */
    extractionMethod: string;

    /** Confidence level (0-1) */
    confidence: number;

    /** Issues or warnings */
    warnings: string[];
}

/**
 * Utility class for generating timeline events from tags in notes
 */
export class TagTimelineGenerator {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Scan vault for notes with specific tags and generate event previews
     */
    async generateFromTags(options: TagTimelineOptions): Promise<GeneratedEventPreview[]> {
        const files = this.app.vault.getMarkdownFiles();
        const previews: GeneratedEventPreview[] = [];

        for (const file of files) {
            const preview = await this.processFile(file, options);
            if (preview) {
                previews.push(preview);
            }
        }

        return previews;
    }

    /**
     * Process a single file and extract event data
     */
    private async processFile(
        file: TFile,
        options: TagTimelineOptions
    ): Promise<GeneratedEventPreview | null> {
        const content = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);

        // Check if file has any of the target tags
        const fileTags = getAllTags(cache) || [];
        const hasTargetTag = options.tags.length === 0 ||
            fileTags.some(tag => options.tags.includes(tag));

        if (!hasTargetTag) {
            return null;
        }

        const warnings: string[] = [];
        let extractedDate: string | null = null;
        let extractionMethod = '';
        let confidence = 0;

        // Extract date based on strategy
        switch (options.dateStrategy) {
            case 'frontmatter':
                const result = this.extractDateFromFrontmatter(cache, options.dateFrontmatterField);
                extractedDate = result.date;
                extractionMethod = result.method;
                confidence = result.confidence;
                if (!extractedDate) {
                    warnings.push('No date found in frontmatter');
                }
                break;

            case 'content':
                const contentResult = this.extractDateFromContent(content, options.datePatterns);
                extractedDate = contentResult.date;
                extractionMethod = contentResult.method;
                confidence = contentResult.confidence;
                if (!extractedDate) {
                    warnings.push('No date found in content');
                }
                break;

            case 'file-created':
                extractedDate = new Date(file.stat.ctime).toISOString();
                extractionMethod = 'File creation date';
                confidence = 0.7; // Lower confidence for file dates
                break;

            case 'file-modified':
                extractedDate = new Date(file.stat.mtime).toISOString();
                extractionMethod = 'File modification date';
                confidence = 0.5; // Lowest confidence
                break;

            case 'auto':
            default:
                // Try frontmatter first, then content, then file dates
                const autoResult = this.extractDateAuto(file, cache, content, options);
                extractedDate = autoResult.date;
                extractionMethod = autoResult.method;
                confidence = autoResult.confidence;
                if (!extractedDate) {
                    warnings.push('Could not extract date using any method');
                }
                break;
        }

        // Extract event name (use note name without extension)
        const eventName = file.basename;

        // Extract description from content
        let description = '';
        if (options.includeContent) {
            description = this.extractDescription(content, options.maxContentLength);
        }

        // Extract characters from frontmatter or content
        const characters = this.extractCharacters(cache, content);

        // Extract location from frontmatter or content
        const location = this.extractLocation(cache, content);

        // Build event
        const event: Partial<Event> = {
            name: eventName,
            dateTime: extractedDate || undefined,
            description,
            characters,
            location,
            tags: fileTags.map(tag => tag.replace('#', '')),
            status: options.defaultStatus || 'Generated',
        };

        return {
            event,
            sourceFile: file,
            extractionMethod,
            confidence,
            warnings
        };
    }

    /**
     * Extract date from frontmatter
     */
    private extractDateFromFrontmatter(
        cache: any,
        dateField: string = 'date'
    ): { date: string | null; method: string; confidence: number } {
        if (!cache?.frontmatter) {
            return { date: null, method: '', confidence: 0 };
        }

        const frontmatter = cache.frontmatter;

        // Try specified field
        if (frontmatter[dateField]) {
            return {
                date: frontmatter[dateField],
                method: `Frontmatter field: ${dateField}`,
                confidence: 1.0
            };
        }

        // Try common date fields
        const commonFields = ['date', 'created', 'datetime', 'time', 'when', 'eventDate'];
        for (const field of commonFields) {
            if (frontmatter[field]) {
                return {
                    date: frontmatter[field],
                    method: `Frontmatter field: ${field}`,
                    confidence: 0.9
                };
            }
        }

        return { date: null, method: '', confidence: 0 };
    }

    /**
     * Extract date from note content using patterns and NLP
     */
    private extractDateFromContent(
        content: string,
        customPatterns?: RegExp[]
    ): { date: string | null; method: string; confidence: number } {
        // Try custom patterns first
        if (customPatterns && customPatterns.length > 0) {
            for (const pattern of customPatterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                    return {
                        date: match[1],
                        method: `Custom pattern: ${pattern.source}`,
                        confidence: 0.8
                    };
                }
            }
        }

        // Try common date patterns
        const patterns = [
            /Date:\s*(.+)/i,
            /When:\s*(.+)/i,
            /On\s+(.+?),/i,
            /(\d{4}-\d{2}-\d{2})/,
            /(\d{1,2}\/\d{1,2}\/\d{4})/
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
                return {
                    date: match[1].trim(),
                    method: `Content pattern: ${pattern.source}`,
                    confidence: 0.7
                };
            }
        }

        // Try chrono-node for natural language dates
        try {
            const parsed = chrono.parse(content, new Date(), { forwardDate: true });
            if (parsed.length > 0) {
                const firstDate = parsed[0];
                return {
                    date: firstDate.start.date().toISOString(),
                    method: `Natural language parsing: "${firstDate.text}"`,
                    confidence: 0.6
                };
            }
        } catch (error) {
            // Chrono parsing failed, continue
        }

        return { date: null, method: '', confidence: 0 };
    }

    /**
     * Automatically extract date using multiple strategies
     */
    private extractDateAuto(
        file: TFile,
        cache: any,
        content: string,
        options: TagTimelineOptions
    ): { date: string | null; method: string; confidence: number } {
        // Try frontmatter first (highest confidence)
        const frontmatterResult = this.extractDateFromFrontmatter(cache, options.dateFrontmatterField);
        if (frontmatterResult.date) {
            return frontmatterResult;
        }

        // Try content patterns (medium confidence)
        const contentResult = this.extractDateFromContent(content, options.datePatterns);
        if (contentResult.date) {
            return contentResult;
        }

        // Fall back to file creation date (lower confidence)
        return {
            date: new Date(file.stat.ctime).toISOString(),
            method: 'File creation date (fallback)',
            confidence: 0.4
        };
    }

    /**
     * Extract description from content
     */
    private extractDescription(content: string, maxLength: number = 500): string {
        // Remove frontmatter
        let cleaned = content.replace(/^---[\s\S]*?---\s*/m, '');

        // Remove headings
        cleaned = cleaned.replace(/^#+\s+.+$/gm, '');

        // Take first paragraph or up to maxLength
        cleaned = cleaned.trim().substring(0, maxLength);

        if (content.length > maxLength) {
            cleaned += '...';
        }

        return cleaned.trim();
    }

    /**
     * Extract characters from frontmatter or content
     */
    private extractCharacters(cache: any, content: string): string[] | undefined {
        // Check frontmatter
        if (cache?.frontmatter?.characters) {
            if (Array.isArray(cache.frontmatter.characters)) {
                return cache.frontmatter.characters;
            }
            if (typeof cache.frontmatter.characters === 'string') {
                return cache.frontmatter.characters.split(',').map(s => s.trim());
            }
        }

        // Look for character links in content [[Character Name]]
        const characterPattern = /\[\[([^\]]+)\]\]/g;
        const matches = content.matchAll(characterPattern);
        const characters = new Set<string>();

        for (const match of matches) {
            // Simple heuristic: if link starts with capital letter, might be a character
            const name = match[1];
            if (name && name[0] === name[0].toUpperCase()) {
                characters.add(name);
            }
        }

        return characters.size > 0 ? Array.from(characters) : undefined;
    }

    /**
     * Extract location from frontmatter or content
     */
    private extractLocation(cache: any, content: string): string | undefined {
        // Check frontmatter
        if (cache?.frontmatter?.location) {
            return cache.frontmatter.location;
        }

        // Look for location patterns in content
        const locationPattern = /(?:Location|Place|Where):\s*(.+)/i;
        const match = content.match(locationPattern);
        if (match && match[1]) {
            return match[1].trim();
        }

        return undefined;
    }

    /**
     * Validate generated events
     */
    static validateGeneratedEvents(previews: GeneratedEventPreview[]): {
        valid: GeneratedEventPreview[];
        invalid: Array<{ preview: GeneratedEventPreview; errors: string[] }>;
    } {
        const valid: GeneratedEventPreview[] = [];
        const invalid: Array<{ preview: GeneratedEventPreview; errors: string[] }> = [];

        for (const preview of previews) {
            const errors: string[] = [];

            // Check required fields
            if (!preview.event.name || preview.event.name.trim() === '') {
                errors.push('Event name is required');
            }

            // Validate date if present
            if (preview.event.dateTime) {
                const parsed = parseEventDate(preview.event.dateTime);
                if (parsed.error) {
                    errors.push(`Invalid date: ${parsed.error}`);
                }
            }

            if (errors.length > 0) {
                invalid.push({ preview, errors });
            } else {
                valid.push(preview);
            }
        }

        return { valid, invalid };
    }

    /**
     * Get unique tags from all notes
     */
    async getAllTags(): Promise<string[]> {
        const files = this.app.vault.getMarkdownFiles();
        const allTags = new Set<string>();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = getAllTags(cache) || [];
            tags.forEach(tag => allTags.add(tag));
        }

        return Array.from(allTags).sort();
    }

    /**
     * Get statistics about tag usage
     */
    async getTagStatistics(): Promise<Map<string, number>> {
        const files = this.app.vault.getMarkdownFiles();
        const tagCounts = new Map<string, number>();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const tags = getAllTags(cache) || [];
            tags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        }

        return tagCounts;
    }
}
