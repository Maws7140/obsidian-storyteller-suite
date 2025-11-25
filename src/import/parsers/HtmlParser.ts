/**
 * HTML Parser
 * Parses HTML files containing story content
 * 
 * Detects chapters from heading structure (H1, H2, etc.)
 */

import {
    ImportFormat,
    DocumentParser,
    ParsedDocument,
    ParsedChapter,
    ParsedScene
} from '../ImportTypes';

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Extract chapter number from title
 */
function extractChapterNumber(text: string): number | undefined {
    const numberMatch = text.match(/(\d+)/);
    if (numberMatch) {
        return parseInt(numberMatch[1], 10);
    }

    const wordNumbers: Record<string, number> = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15
    };

    const lowerText = text.toLowerCase();
    for (const [word, num] of Object.entries(wordNumbers)) {
        if (lowerText.includes(word)) {
            return num;
        }
    }

    return undefined;
}

/**
 * Scene break patterns
 */
const SCENE_BREAK_PATTERNS = [
    /^\s*\*\s*\*\s*\*\s*$/,
    /^\s*\*{3,}\s*$/,
    /^\s*-{3,}\s*$/,
    /^\s*~{3,}\s*$/,
    /^\s*#{3,}\s*$/,
];

/**
 * HTML document parser
 */
export class HtmlParser implements DocumentParser {
    name = 'HTML Parser';
    format: ImportFormat = 'html' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        if (extension === 'html' || extension === 'htm') {
            return true;
        }
        // Also check if content looks like HTML
        return content.trim().startsWith('<!DOCTYPE') || 
               content.trim().startsWith('<html') ||
               content.includes('<body');
    }

    parse(content: string, fileName: string): ParsedDocument {
        try {
            const doc = new DOMParser().parseFromString(content, 'text/html');
            return this.parseHtmlDocument(doc, fileName);
        } catch (error) {
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'HTML parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse HTML: ${error}`],
                format: this.format
            };
        }
    }

    /**
     * Parse HTML document
     */
    private parseHtmlDocument(doc: Document, fileName: string): ParsedDocument {
        const warnings: string[] = [];

        // Try to get title
        const titleEl = doc.querySelector('title');
        const h1El = doc.querySelector('h1');
        const title = titleEl?.textContent?.trim() || 
                     h1El?.textContent?.trim() || 
                     fileName.replace(/\.(html|htm)$/i, '');

        // Get body content
        const body = doc.body;
        if (!body) {
            return {
                metadata: {
                    title,
                    totalWords: 0,
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No body found'
                },
                chapters: [{
                    title: fileName.replace(/\.(html|htm)$/i, ''),
                    number: 1,
                    content: doc.documentElement?.textContent || '',
                    wordCount: countWords(doc.documentElement?.textContent || '')
                }],
                warnings: ['No body element found in HTML.'],
                format: this.format
            };
        }

        // Find all headings
        const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        if (headings.length === 0) {
            // No headings, treat entire document as one chapter
            const textContent = this.extractTextContent(body);
            return {
                metadata: {
                    title,
                    totalWords: countWords(textContent),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No headings found'
                },
                chapters: [{
                    title: title,
                    number: 1,
                    content: textContent,
                    wordCount: countWords(textContent),
                    scenes: this.detectScenes(textContent).length > 1 
                        ? this.detectScenes(textContent) 
                        : undefined
                }],
                warnings: ['No heading structure found. Document imported as single chapter.'],
                format: this.format
            };
        }

        // Determine chapter heading level
        const chapterLevel = this.determineChapterLevel(headings);
        
        // Extract chapters
        const chapters = this.extractChapters(body, headings, chapterLevel);

        if (chapters.length === 0) {
            const textContent = this.extractTextContent(body);
            warnings.push('No chapters could be extracted from heading structure.');
            return {
                metadata: {
                    title,
                    totalWords: countWords(textContent),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No chapters extracted'
                },
                chapters: [{
                    title: title,
                    number: 1,
                    content: textContent,
                    wordCount: countWords(textContent)
                }],
                warnings,
                format: this.format
            };
        }

        // Validate chapter numbering
        const numbers = chapters.map(c => c.number).filter((n): n is number => n !== undefined);
        if (numbers.length > 1) {
            const sequential = numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1);
            if (!sequential) {
                warnings.push('Chapter numbering is not sequential.');
            }
        }

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

        return {
            metadata: {
                title,
                totalWords,
                chapterCount: chapters.length,
                confidence: 85,
                detectionMethod: `H${chapterLevel} as chapters`
            },
            chapters,
            warnings,
            format: this.format
        };
    }

    /**
     * Determine which heading level represents chapters
     */
    private determineChapterLevel(headings: NodeListOf<Element>): number {
        const levelCounts = new Map<number, number>();

        headings.forEach(heading => {
            const level = parseInt(heading.tagName[1], 10);
            levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
        });

        // Prefer H1 if there are multiple H1s
        if ((levelCounts.get(1) || 0) > 1) {
            return 1;
        }

        // If only one H1, use H2 for chapters
        if ((levelCounts.get(1) || 0) === 1 && (levelCounts.get(2) || 0) > 0) {
            return 2;
        }

        // Otherwise, use the most common heading level
        let maxCount = 0;
        let maxLevel = 1;

        for (const [level, count] of levelCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                maxLevel = level;
            }
        }

        return maxLevel;
    }

    /**
     * Extract chapters from document
     */
    private extractChapters(
        body: HTMLElement,
        headings: NodeListOf<Element>,
        chapterLevel: number
    ): ParsedChapter[] {
        const chapters: ParsedChapter[] = [];
        const chapterHeadings = Array.from(headings).filter(
            h => parseInt(h.tagName[1], 10) === chapterLevel
        );

        for (let i = 0; i < chapterHeadings.length; i++) {
            const heading = chapterHeadings[i];
            const nextHeading = chapterHeadings[i + 1];

            const headingText = heading.textContent?.trim() || '';
            
            // Collect content between this heading and the next
            const contentParts: string[] = [];
            let currentElement = heading.nextElementSibling;

            while (currentElement && currentElement !== nextHeading) {
                if (currentElement.tagName.match(/^H[1-6]$/) && 
                    parseInt(currentElement.tagName[1], 10) === chapterLevel) {
                    break;
                }

                const text = currentElement.textContent?.trim();
                if (text) {
                    contentParts.push(this.normalizeWhitespace(text));
                }
                currentElement = currentElement.nextElementSibling;
            }

            const chapterContent = contentParts.join('\n\n');

            if (chapterContent.length === 0) {
                continue;
            }

            // Detect scenes
            const scenes = this.detectScenes(chapterContent);

            chapters.push({
                title: headingText,
                number: extractChapterNumber(headingText),
                content: chapterContent,
                wordCount: countWords(chapterContent),
                scenes: scenes.length > 1 ? scenes : undefined
            });
        }

        return chapters;
    }

    /**
     * Extract text content from element
     */
    private extractTextContent(element: Element): string {
        const paragraphs: string[] = [];
        const blocks = element.querySelectorAll('p, div, blockquote, li');
        
        if (blocks.length === 0) {
            return this.normalizeWhitespace(element.textContent || '');
        }

        blocks.forEach(block => {
            const text = block.textContent?.trim();
            if (text) {
                paragraphs.push(this.normalizeWhitespace(text));
            }
        });

        return paragraphs.join('\n\n');
    }

    /**
     * Normalize excessive whitespace in text
     */
    private normalizeWhitespace(text: string): string {
        return text
            .replace(/\t/g, ' ')
            .replace(/ {2,}/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .split('\n')
            .map(line => line.trim())
            .join('\n')
            .trim();
    }

    /**
     * Detect scene breaks
     */
    private detectScenes(content: string): ParsedScene[] {
        const lines = content.split('\n');
        const scenes: ParsedScene[] = [];
        const sceneContents: string[] = [];
        let currentScene: string[] = [];

        for (const line of lines) {
            const isSceneBreak = SCENE_BREAK_PATTERNS.some(pattern => pattern.test(line));

            if (isSceneBreak) {
                if (currentScene.length > 0) {
                    const sceneText = currentScene.join('\n').trim();
                    if (sceneText.length > 0) {
                        sceneContents.push(sceneText);
                    }
                }
                currentScene = [];
            } else {
                currentScene.push(line);
            }
        }

        if (currentScene.length > 0) {
            const sceneText = currentScene.join('\n').trim();
            if (sceneText.length > 0) {
                sceneContents.push(sceneText);
            }
        }

        for (let i = 0; i < sceneContents.length; i++) {
            scenes.push({
                title: `Scene ${i + 1}`,
                content: sceneContents[i],
                wordCount: countWords(sceneContents[i])
            });
        }

        return scenes;
    }
}
