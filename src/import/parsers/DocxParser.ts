/**
 * DOCX Parser
 * Parses Microsoft Word documents using mammoth.js
 * Note: Requires mammoth package to be installed: npm install mammoth
 */

import {
    ImportFormat,
    DocumentParser,
    ParsedDocument,
    ParsedChapter,
    DocumentMetadata
} from '../ImportTypes';

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Extract chapter number from heading text
 */
function extractChapterNumber(text: string): number | undefined {
    // Try to find a number in the heading
    const numberMatch = text.match(/(\d+)/);
    if (numberMatch) {
        return parseInt(numberMatch[1], 10);
    }

    // Try word numbers
    const wordNumbers: Record<string, number> = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
        'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
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
 * DOCX document parser
 * 
 * This parser converts DOCX to HTML using mammoth, then extracts chapters
 * based on heading structure (H1 tags typically become chapters).
 */
export class DocxParser implements DocumentParser {
    name = 'DOCX Parser';
    format: ImportFormat = 'docx';

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'docx';
    }

    /**
     * Parse a DOCX document
     * 
     * Note: This method expects the content to be base64-encoded binary data
     * or a raw ArrayBuffer converted to string. In the browser context,
     * the file should be read as ArrayBuffer.
     */
    parse(content: string, fileName: string): ParsedDocument {
        // Since we can't synchronously parse DOCX (mammoth is async),
        // this parser needs special handling. We'll return a placeholder
        // and the actual parsing happens in parseAsync.
        return this.parseFromHtml('', fileName);
    }

    /**
     * Async parse method for DOCX files
     * This is the main entry point for DOCX parsing
     */
    async parseAsync(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
        try {
            // Dynamically import mammoth to avoid bundling issues
            // @ts-ignore - mammoth may not have types
            const mammoth = await import('mammoth');
            
            const result = await mammoth.convertToHtml({ arrayBuffer });
            const html = result.value;
            const messages = result.messages;

            // Log any conversion warnings
            if (messages.length > 0) {
                console.log('DOCX conversion messages:', messages);
            }

            return this.parseFromHtml(html, fileName);
        } catch (error) {
            console.error('Error parsing DOCX:', error);
            
            // Return a document with error warning
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'DOCX parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse DOCX file: ${error}. Make sure mammoth is installed.`],
                format: this.format
            };
        }
    }

    /**
     * Parse extracted HTML content
     */
    private parseFromHtml(html: string, fileName: string): ParsedDocument {
        if (!html || html.trim().length === 0) {
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'Empty document'
                },
                chapters: [{
                    title: fileName.replace(/\.docx$/i, ''),
                    number: 1,
                    content: '',
                    wordCount: 0
                }],
                warnings: ['Document appears to be empty or could not be parsed.'],
                format: this.format
            };
        }

        // Parse HTML to extract structure
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Find all headings
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        if (headings.length === 0) {
            // No headings, treat entire document as one chapter
            const textContent = doc.body.textContent || '';
            return {
                metadata: {
                    title: fileName,
                    totalWords: countWords(textContent),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No headings found'
                },
                chapters: [{
                    title: fileName.replace(/\.docx$/i, ''),
                    number: 1,
                    content: textContent,
                    wordCount: countWords(textContent)
                }],
                warnings: ['No heading structure found. Document imported as single chapter.'],
                format: this.format
            };
        }

        // Determine chapter heading level
        const chapterLevel = this.determineChapterLevel(headings);
        
        // Extract chapters
        const chapters = this.extractChapters(doc, headings, chapterLevel);

        const warnings: string[] = [];

        if (chapters.length === 0) {
            warnings.push('No chapters could be extracted from document structure.');
            const textContent = doc.body.textContent || '';
            return {
                metadata: {
                    title: fileName,
                    totalWords: countWords(textContent),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No chapters extracted'
                },
                chapters: [{
                    title: fileName.replace(/\.docx$/i, ''),
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
                warnings.push('Chapter numbering is not sequential. Please review chapter numbers.');
            }
        }

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

        return {
            metadata: {
                title: this.extractDocumentTitle(doc) || fileName.replace(/\.docx$/i, ''),
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
        // Count headings by level
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
        doc: Document,
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

            const headingText = heading.textContent || '';
            
            // Collect content between this heading and the next
            const contentParts: string[] = [];
            let currentElement = heading.nextElementSibling;

            while (currentElement && currentElement !== nextHeading) {
                // Skip if it's the next chapter heading
                if (currentElement.tagName.match(/^H[1-6]$/) && 
                    parseInt(currentElement.tagName[1], 10) === chapterLevel) {
                    break;
                }

                const text = currentElement.textContent?.trim();
                if (text) {
                    contentParts.push(text);
                }
                currentElement = currentElement.nextElementSibling;
            }

            const chapterContent = contentParts.join('\n\n');

            // Skip empty chapters
            if (chapterContent.length === 0) {
                continue;
            }

            chapters.push({
                title: headingText.trim(),
                number: extractChapterNumber(headingText),
                content: chapterContent,
                wordCount: countWords(chapterContent)
            });
        }

        return chapters;
    }

    /**
     * Extract document title from first H1 if it's unique
     */
    private extractDocumentTitle(doc: Document): string | undefined {
        const h1s = doc.querySelectorAll('h1');
        if (h1s.length === 1) {
            return h1s[0].textContent?.trim();
        }
        return undefined;
    }
}

