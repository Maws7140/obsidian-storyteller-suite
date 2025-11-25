/**
 * EPUB Parser
 * Parses EPUB e-book files
 * 
 * EPUB files are ZIP archives containing XHTML content.
 * This parser extracts chapter content from the spine order.
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
 * EPUB document parser
 */
export class EpubParser implements DocumentParser {
    name = 'EPUB Parser';
    format: ImportFormat = 'epub' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'epub';
    }

    /**
     * Synchronous parse - returns placeholder, use parseAsync for actual parsing
     */
    parse(content: string, fileName: string): ParsedDocument {
        return {
            metadata: {
                title: fileName.replace(/\.epub$/i, ''),
                totalWords: 0,
                chapterCount: 0,
                confidence: 0,
                detectionMethod: 'EPUB (use parseAsync)'
            },
            chapters: [],
            warnings: ['EPUB parsing requires async method. Please use parseAsync.'],
            format: this.format
        };
    }

    /**
     * Async parse method for EPUB files
     */
    async parseAsync(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
        try {
            // Use JSZip to extract EPUB contents
            // @ts-ignore - JSZip may not have types
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Read container.xml to find the content.opf location
            const containerXml = await zip.file('META-INF/container.xml')?.async('string');
            if (!containerXml) {
                throw new Error('Invalid EPUB: Missing container.xml');
            }

            // Parse container to find OPF path
            const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
            const rootfileEl = containerDoc.querySelector('rootfile');
            const opfPath = rootfileEl?.getAttribute('full-path');
            
            if (!opfPath) {
                throw new Error('Invalid EPUB: Cannot find OPF file path');
            }

            // Read the OPF file
            const opfContent = await zip.file(opfPath)?.async('string');
            if (!opfContent) {
                throw new Error('Invalid EPUB: Cannot read OPF file');
            }

            const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
            const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

            // Get metadata
            const titleEl = opfDoc.querySelector('metadata title, dc\\:title');
            const authorEl = opfDoc.querySelector('metadata creator, dc\\:creator');
            const bookTitle = titleEl?.textContent || fileName.replace(/\.epub$/i, '');
            const author = authorEl?.textContent || undefined;

            // Get manifest items
            const manifestItems = new Map<string, string>();
            opfDoc.querySelectorAll('manifest item').forEach(item => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                if (id && href) {
                    manifestItems.set(id, href);
                }
            });

            // Get spine order (reading order)
            const spineItems: string[] = [];
            opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
                const idref = itemref.getAttribute('idref');
                if (idref && manifestItems.has(idref)) {
                    spineItems.push(manifestItems.get(idref)!);
                }
            });

            // Read each content file in spine order
            const chapters: ParsedChapter[] = [];
            let chapterIndex = 0;

            for (const href of spineItems) {
                const filePath = opfDir + href;
                const content = await zip.file(filePath)?.async('string');
                
                if (!content) continue;

                // Parse XHTML content
                const doc = new DOMParser().parseFromString(content, 'text/html');
                const body = doc.body;
                
                if (!body) continue;

                // Try to find chapter title from headings
                const heading = body.querySelector('h1, h2, h3');
                let chapterTitle = heading?.textContent?.trim() || '';
                
                // Get text content
                const textContent = this.extractTextContent(body);
                
                if (textContent.trim().length === 0) continue;

                // Skip very short content (likely navigation pages)
                if (countWords(textContent) < 50) continue;

                chapterIndex++;
                
                // If no title found, generate one
                if (!chapterTitle) {
                    chapterTitle = `Chapter ${chapterIndex}`;
                }

                // Detect scenes
                const scenes = this.detectScenes(textContent);

                chapters.push({
                    title: chapterTitle,
                    number: extractChapterNumber(chapterTitle) || chapterIndex,
                    content: textContent,
                    wordCount: countWords(textContent),
                    scenes: scenes.length > 1 ? scenes : undefined
                });
            }

            const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

            return {
                metadata: {
                    title: bookTitle,
                    author,
                    totalWords,
                    chapterCount: chapters.length,
                    confidence: 85,
                    detectionMethod: 'EPUB spine order'
                },
                chapters,
                warnings: chapters.length === 0 ? ['No chapters could be extracted from EPUB.'] : [],
                format: this.format
            };

        } catch (error) {
            console.error('Error parsing EPUB:', error);
            return {
                metadata: {
                    title: fileName.replace(/\.epub$/i, ''),
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'EPUB parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse EPUB: ${error}. Make sure jszip is installed.`],
                format: this.format
            };
        }
    }

    /**
     * Extract text content from HTML element, preserving paragraphs
     */
    private extractTextContent(element: Element): string {
        const paragraphs: string[] = [];
        
        // Get all block-level elements
        const blocks = element.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, blockquote, li');
        
        if (blocks.length === 0) {
            // Fallback to raw text
            return this.normalizeWhitespace(element.textContent || '');
        }

        blocks.forEach(block => {
            const text = block.textContent?.trim();
            if (text) {
                // Normalize whitespace within the paragraph
                paragraphs.push(this.normalizeWhitespace(text));
            }
        });

        return paragraphs.join('\n\n');
    }

    /**
     * Normalize excessive whitespace in text
     * Collapses multiple spaces/tabs to single space, preserves intentional line breaks
     */
    private normalizeWhitespace(text: string): string {
        return text
            // Replace tabs with spaces
            .replace(/\t/g, ' ')
            // Collapse multiple spaces to single space
            .replace(/ {2,}/g, ' ')
            // Normalize line breaks - collapse multiple blank lines to double newline
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            // Remove leading/trailing whitespace from lines
            .split('\n')
            .map(line => line.trim())
            .join('\n')
            .trim();
    }

    /**
     * Detect scene breaks in content
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
