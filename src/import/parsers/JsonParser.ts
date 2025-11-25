/**
 * JSON Parser
 * Parses structured JSON story data
 */

import {
    ImportFormat,
    DocumentParser,
    ParsedDocument,
    ParsedChapter,
    ParsedScene,
    DocumentMetadata
} from '../ImportTypes';

/**
 * Expected JSON structure for story import
 */
interface StoryJson {
    /** Story title */
    title?: string;
    
    /** Author name */
    author?: string;
    
    /** Story description */
    description?: string;
    
    /** Array of chapters */
    chapters: ChapterJson[];
}

/**
 * Chapter structure in JSON
 */
interface ChapterJson {
    /** Chapter title */
    title: string;
    
    /** Chapter number (optional, will be auto-assigned if missing) */
    number?: number;
    
    /** Chapter summary or description */
    summary?: string;
    
    /** Chapter content */
    content: string;
    
    /** Optional scenes within chapter */
    scenes?: SceneJson[];
    
    /** Optional tags */
    tags?: string[];
}

/**
 * Scene structure in JSON
 */
interface SceneJson {
    /** Scene title */
    title?: string;
    
    /** Scene content */
    content: string;
    
    /** Scene status */
    status?: string;
    
    /** Characters in scene */
    characters?: string[];
    
    /** Location of scene */
    location?: string;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * JSON document parser
 */
export class JsonParser implements DocumentParser {
    name = 'JSON Parser';
    format: ImportFormat = 'json';

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        if (extension !== 'json') return false;

        // Try to parse and validate structure
        try {
            const data = JSON.parse(content);
            return this.isValidStoryJson(data);
        } catch {
            return false;
        }
    }

    parse(content: string, fileName: string): ParsedDocument {
        try {
            const data = JSON.parse(content) as StoryJson;
            return this.parseStoryJson(data, fileName);
        } catch (error) {
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'JSON parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse JSON: ${error}`],
                format: this.format
            };
        }
    }

    /**
     * Check if JSON data has valid story structure
     */
    private isValidStoryJson(data: unknown): boolean {
        if (!data || typeof data !== 'object') return false;
        
        const obj = data as Record<string, unknown>;
        
        // Must have chapters array
        if (!Array.isArray(obj.chapters)) return false;
        
        // Chapters must have at least title and content
        return obj.chapters.every((ch: unknown) => {
            if (!ch || typeof ch !== 'object') return false;
            const chapter = ch as Record<string, unknown>;
            return typeof chapter.title === 'string' && typeof chapter.content === 'string';
        });
    }

    /**
     * Parse validated story JSON
     */
    private parseStoryJson(data: StoryJson, fileName: string): ParsedDocument {
        const warnings: string[] = [];
        const chapters: ParsedChapter[] = [];

        // Process chapters
        for (let i = 0; i < data.chapters.length; i++) {
            const chapterData = data.chapters[i];
            
            // Combine summary and content if both exist
            let content = chapterData.content;
            if (chapterData.summary && chapterData.summary !== chapterData.content) {
                content = `${chapterData.summary}\n\n${chapterData.content}`;
            }

            // Process scenes if present
            const scenes: ParsedScene[] = [];
            if (chapterData.scenes && chapterData.scenes.length > 0) {
                for (const sceneData of chapterData.scenes) {
                    scenes.push({
                        title: sceneData.title,
                        content: sceneData.content,
                        wordCount: countWords(sceneData.content)
                    });
                }
            }

            const chapter: ParsedChapter = {
                title: chapterData.title,
                number: chapterData.number ?? (i + 1),
                content,
                wordCount: countWords(content),
                scenes: scenes.length > 0 ? scenes : undefined
            };

            chapters.push(chapter);
        }

        // Validate chapter numbering
        const numbers = chapters.map(c => c.number).filter((n): n is number => n !== undefined);
        if (numbers.length > 1) {
            const hasDuplicates = new Set(numbers).size !== numbers.length;
            if (hasDuplicates) {
                warnings.push('Duplicate chapter numbers found in JSON data.');
            }
        }

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

        return {
            metadata: {
                title: data.title || fileName.replace(/\.json$/i, ''),
                author: data.author,
                totalWords,
                chapterCount: chapters.length,
                confidence: 100,
                detectionMethod: 'JSON structure'
            },
            chapters,
            warnings,
            format: this.format
        };
    }
}

/**
 * Example JSON format for reference:
 * 
 * {
 *   "title": "My Story",
 *   "author": "Author Name",
 *   "chapters": [
 *     {
 *       "title": "Chapter One: The Beginning",
 *       "number": 1,
 *       "summary": "An introduction to our hero...",
 *       "content": "Once upon a time...",
 *       "scenes": [
 *         {
 *           "title": "Scene 1",
 *           "content": "Scene content...",
 *           "characters": ["John", "Mary"],
 *           "location": "The Castle"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

