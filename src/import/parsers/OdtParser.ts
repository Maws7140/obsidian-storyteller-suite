/**
 * ODT Parser
 * Parses OpenDocument Text files (LibreOffice/OpenOffice)
 * 
 * ODT files are ZIP archives containing XML content.
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
 * ODT document parser
 */
export class OdtParser implements DocumentParser {
    name = 'ODT Parser';
    format: ImportFormat = 'odt' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'odt';
    }

    /**
     * Synchronous parse - returns placeholder, use parseAsync for actual parsing
     */
    parse(content: string, fileName: string): ParsedDocument {
        return {
            metadata: {
                title: fileName.replace(/\.odt$/i, ''),
                totalWords: 0,
                chapterCount: 0,
                confidence: 0,
                detectionMethod: 'ODT (use parseAsync)'
            },
            chapters: [],
            warnings: ['ODT parsing requires async method. Please use parseAsync.'],
            format: this.format
        };
    }

    /**
     * Async parse method for ODT files
     */
    async parseAsync(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
        try {
            // Use JSZip to extract ODT contents
            // @ts-ignore - JSZip may not have types
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Read content.xml
            const contentXml = await zip.file('content.xml')?.async('string');
            if (!contentXml) {
                throw new Error('Invalid ODT: Missing content.xml');
            }

            // Read meta.xml for title
            const metaXml = await zip.file('meta.xml')?.async('string');
            let title = fileName.replace(/\.odt$/i, '');
            let author: string | undefined;

            if (metaXml) {
                const metaDoc = new DOMParser().parseFromString(metaXml, 'text/xml');
                const titleEl = metaDoc.querySelector('title');
                const authorEl = metaDoc.querySelector('creator, initial-creator');
                if (titleEl?.textContent) {
                    title = titleEl.textContent;
                }
                if (authorEl?.textContent) {
                    author = authorEl.textContent;
                }
            }

            // Parse content.xml
            const contentDoc = new DOMParser().parseFromString(contentXml, 'text/xml');
            
            // Extract text content with structure
            const textContent = this.extractStructuredContent(contentDoc);
            
            // Parse into chapters
            return this.parseStructuredContent(textContent, title, author, fileName);

        } catch (error) {
            console.error('Error parsing ODT:', error);
            return {
                metadata: {
                    title: fileName.replace(/\.odt$/i, ''),
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'ODT parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse ODT: ${error}. Make sure jszip is installed.`],
                format: this.format
            };
        }
    }

    /**
     * Extract structured content from ODT XML
     */
    private extractStructuredContent(doc: Document): Array<{ type: 'heading' | 'paragraph'; level?: number; text: string }> {
        const content: Array<{ type: 'heading' | 'paragraph'; level?: number; text: string }> = [];
        
        // ODT uses text:h for headings and text:p for paragraphs
        const body = doc.querySelector('office\\:body, body');
        if (!body) return content;

        const textContent = body.querySelector('office\\:text, text');
        if (!textContent) return content;

        // Process all child elements
        const processNode = (node: Element) => {
            const localName = node.localName || node.nodeName.split(':').pop();
            
            if (localName === 'h') {
                // Heading
                const outlineLevel = node.getAttribute('text:outline-level') || '1';
                const text = node.textContent?.trim() || '';
                if (text) {
                    content.push({
                        type: 'heading',
                        level: parseInt(outlineLevel, 10),
                        text
                    });
                }
            } else if (localName === 'p') {
                // Paragraph
                const text = node.textContent?.trim() || '';
                if (text) {
                    content.push({
                        type: 'paragraph',
                        text
                    });
                }
            } else if (localName === 'list') {
                // List - process list items
                node.querySelectorAll('list-item').forEach(item => {
                    const text = item.textContent?.trim() || '';
                    if (text) {
                        content.push({
                            type: 'paragraph',
                            text: '- ' + text
                        });
                    }
                });
            }
        };

        // Get all direct children and process them
        const children = textContent.children;
        for (let i = 0; i < children.length; i++) {
            processNode(children[i]);
        }

        return content;
    }

    /**
     * Parse structured content into chapters
     */
    private parseStructuredContent(
        content: Array<{ type: 'heading' | 'paragraph'; level?: number; text: string }>,
        title: string,
        author: string | undefined,
        fileName: string
    ): ParsedDocument {
        const warnings: string[] = [];

        // Find headings
        const headings = content.filter(c => c.type === 'heading');
        
        if (headings.length === 0) {
            // No headings, treat as single chapter
            const fullText = content.map(c => c.text).join('\n\n');
            const scenes = this.detectScenes(fullText);
            
            return {
                metadata: {
                    title,
                    author,
                    totalWords: countWords(fullText),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No headings found'
                },
                chapters: [{
                    title,
                    number: 1,
                    content: fullText,
                    wordCount: countWords(fullText),
                    scenes: scenes.length > 1 ? scenes : undefined
                }],
                warnings: ['No heading structure found. Document imported as single chapter.'],
                format: this.format
            };
        }

        // Determine chapter heading level (use the most common level)
        const levelCounts = new Map<number, number>();
        headings.forEach(h => {
            const level = h.level || 1;
            levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
        });

        let chapterLevel = 1;
        let maxCount = 0;
        for (const [level, count] of levelCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                chapterLevel = level;
            }
        }

        // Extract chapters
        const chapters: ParsedChapter[] = [];
        let currentChapter: { title: string; content: string[] } | null = null;

        for (const item of content) {
            if (item.type === 'heading' && item.level === chapterLevel) {
                // Save previous chapter
                if (currentChapter && currentChapter.content.length > 0) {
                    const chapterContent = currentChapter.content.join('\n\n');
                    const scenes = this.detectScenes(chapterContent);
                    
                    chapters.push({
                        title: currentChapter.title,
                        number: extractChapterNumber(currentChapter.title) || chapters.length + 1,
                        content: chapterContent,
                        wordCount: countWords(chapterContent),
                        scenes: scenes.length > 1 ? scenes : undefined
                    });
                }
                
                // Start new chapter
                currentChapter = {
                    title: item.text,
                    content: []
                };
            } else if (currentChapter) {
                // Add content to current chapter
                currentChapter.content.push(item.text);
            }
        }

        // Don't forget the last chapter
        if (currentChapter && currentChapter.content.length > 0) {
            const chapterContent = currentChapter.content.join('\n\n');
            const scenes = this.detectScenes(chapterContent);
            
            chapters.push({
                title: currentChapter.title,
                number: extractChapterNumber(currentChapter.title) || chapters.length + 1,
                content: chapterContent,
                wordCount: countWords(chapterContent),
                scenes: scenes.length > 1 ? scenes : undefined
            });
        }

        if (chapters.length === 0) {
            const fullText = content.map(c => c.text).join('\n\n');
            warnings.push('No chapters could be extracted.');
            
            return {
                metadata: {
                    title,
                    author,
                    totalWords: countWords(fullText),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No chapters extracted'
                },
                chapters: [{
                    title,
                    number: 1,
                    content: fullText,
                    wordCount: countWords(fullText)
                }],
                warnings,
                format: this.format
            };
        }

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

        return {
            metadata: {
                title,
                author,
                totalWords,
                chapterCount: chapters.length,
                confidence: 85,
                detectionMethod: `Heading level ${chapterLevel}`
            },
            chapters,
            warnings,
            format: this.format
        };
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

