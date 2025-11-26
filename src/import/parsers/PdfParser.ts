/**
 * PDF Parser
 * Parses PDF documents using Obsidian's built-in PDF.js library
 *
 * This parser extracts text content from PDF files and attempts to detect
 * chapter boundaries based on text patterns and formatting cues.
 */

import { loadPdfJs } from 'obsidian';
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
 * Extract chapter number from text
 */
function extractChapterNumber(text: string): number | undefined {
    // Try to find a number in the heading
    const numberMatch = text.match(/(?:chapter|ch\.?)\s*(\d+)/i);
    if (numberMatch) {
        return parseInt(numberMatch[1], 10);
    }

    // Try standalone number at start of line
    const standaloneNumber = text.match(/^\s*(\d+)\s*$/);
    if (standaloneNumber) {
        return parseInt(standaloneNumber[1], 10);
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
 * Chapter heading patterns
 * These patterns identify likely chapter headings in the text
 */
const CHAPTER_PATTERNS = [
    /^chapter\s+\d+/i,
    /^chapter\s+[a-z]+/i,
    /^ch\.?\s+\d+/i,
    /^\d+\.\s+/,
    /^part\s+\d+/i,
    /^section\s+\d+/i,
];

/**
 * PDF document parser
 */
export class PdfParser implements DocumentParser {
    name = 'PDF Parser';
    format: ImportFormat = 'pdf' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'pdf';
    }

    /**
     * Synchronous parse - returns placeholder, use parseAsync for actual parsing
     */
    parse(content: string, fileName: string): ParsedDocument {
        return {
            metadata: {
                title: fileName.replace(/\.pdf$/i, ''),
                totalWords: 0,
                chapterCount: 0,
                confidence: 0,
                detectionMethod: 'PDF (use parseAsync)'
            },
            chapters: [],
            warnings: ['PDF parsing requires async method. Please use parseAsync.'],
            format: this.format
        };
    }

    /**
     * Async parse method for PDF files
     */
    async parseAsync(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
        try {
            // Load Obsidian's built-in PDF.js library
            const pdfjsLib = await loadPdfJs();

            // Load the PDF document
            const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(arrayBuffer)
            });

            const pdf = await loadingTask.promise;

            // Extract text from all pages
            const fullText: string[] = [];
            let pdfTitle = '';
            let pdfAuthor = '';

            // Try to get metadata
            try {
                const metadata = await pdf.getMetadata();
                pdfTitle = metadata?.info?.Title || fileName.replace(/\.pdf$/i, '');
                pdfAuthor = metadata?.info?.Author || undefined;
            } catch (metaError) {
                console.warn('Could not extract PDF metadata:', metaError);
                pdfTitle = fileName.replace(/\.pdf$/i, '');
            }

            // Extract text from each page
            for (let i = 1; i <= pdf.numPages; i++) {
                try {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();

                    // Combine text items into readable text
                    const pageLines: string[] = [];
                    let currentLine = '';
                    let lastY = -1;

                    for (const item of textContent.items) {
                        const textItem = item as any;

                        // Check if we've moved to a new line
                        if (lastY !== -1 && Math.abs(textItem.transform[5] - lastY) > 5) {
                            if (currentLine.trim()) {
                                pageLines.push(currentLine.trim());
                            }
                            currentLine = '';
                        }

                        currentLine += textItem.str;
                        lastY = textItem.transform[5];
                    }

                    // Add the last line
                    if (currentLine.trim()) {
                        pageLines.push(currentLine.trim());
                    }

                    // Join lines with newlines
                    const pageText = pageLines.join('\n');
                    if (pageText.trim()) {
                        fullText.push(pageText);
                    }
                } catch (pageError) {
                    console.warn(`Error extracting text from page ${i}:`, pageError);
                }
            }

            const combinedText = fullText.join('\n\n');

            // Detect chapters
            const chapters = this.detectChapters(combinedText, fileName);

            // If no chapters detected, treat entire document as one chapter
            if (chapters.length === 0) {
                const wordCount = countWords(combinedText);
                return {
                    metadata: {
                        title: pdfTitle,
                        author: pdfAuthor,
                        totalWords: wordCount,
                        chapterCount: 1,
                        confidence: 50,
                        detectionMethod: 'No chapters detected'
                    },
                    chapters: [{
                        title: fileName.replace(/\.pdf$/i, ''),
                        number: 1,
                        content: combinedText,
                        wordCount
                    }],
                    warnings: ['No chapter structure detected. Document imported as single chapter.'],
                    format: this.format
                };
            }

            const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

            // Validate chapter numbering
            const warnings: string[] = [];
            const numbers = chapters.map(c => c.number).filter((n): n is number => n !== undefined);
            if (numbers.length > 1) {
                const sequential = numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1);
                if (!sequential) {
                    warnings.push('Chapter numbering is not sequential. Please review chapter numbers.');
                }
            }

            return {
                metadata: {
                    title: pdfTitle,
                    author: pdfAuthor,
                    totalWords,
                    chapterCount: chapters.length,
                    confidence: 75,
                    detectionMethod: 'Pattern-based chapter detection'
                },
                chapters,
                warnings,
                format: this.format
            };

        } catch (error) {
            console.error('Error parsing PDF:', error);
            return {
                metadata: {
                    title: fileName.replace(/\.pdf$/i, ''),
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'PDF parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse PDF: ${error}. The PDF may be encrypted, corrupted, or password-protected.`],
                format: this.format
            };
        }
    }

    /**
     * Detect chapters in text based on heading patterns
     */
    private detectChapters(text: string, fileName: string): ParsedChapter[] {
        const chapters: ParsedChapter[] = [];
        const lines = text.split('\n');

        // Find potential chapter boundaries
        const chapterStarts: { lineIndex: number; title: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines
            if (line.length === 0) continue;

            // Check if this line matches chapter patterns
            const isChapterHeading = CHAPTER_PATTERNS.some(pattern => pattern.test(line));

            if (isChapterHeading) {
                chapterStarts.push({ lineIndex: i, title: line });
            }
        }

        // If no chapter headings found, return empty array
        if (chapterStarts.length === 0) {
            return [];
        }

        // Extract content for each chapter
        for (let i = 0; i < chapterStarts.length; i++) {
            const start = chapterStarts[i];
            const nextStart = chapterStarts[i + 1];

            // Get content between this chapter start and the next
            const startLine = start.lineIndex + 1; // Skip the heading itself
            const endLine = nextStart ? nextStart.lineIndex : lines.length;

            const chapterLines = lines.slice(startLine, endLine);
            const chapterContent = chapterLines.join('\n').trim();

            // Skip empty chapters
            if (chapterContent.length === 0) continue;

            // Detect scenes in this chapter
            const scenes = this.detectScenes(chapterContent);

            chapters.push({
                title: start.title,
                number: extractChapterNumber(start.title) || (i + 1),
                content: chapterContent,
                wordCount: countWords(chapterContent),
                scenes: scenes.length > 1 ? scenes : undefined
            });
        }

        return chapters;
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

        // Add final scene
        if (currentScene.length > 0) {
            const sceneText = currentScene.join('\n').trim();
            if (sceneText.length > 0) {
                sceneContents.push(sceneText);
            }
        }

        // Create scene objects
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
