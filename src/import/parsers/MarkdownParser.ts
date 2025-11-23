/**
 * Markdown Parser
 * Detects chapters in markdown files using heading hierarchy
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
 * Heading structure
 */
interface Heading {
    level: number;
    text: string;
    lineIndex: number;
    content: string;
}

/**
 * Markdown document parser
 */
export class MarkdownParser implements DocumentParser {
    name = 'Markdown Parser';
    format: ImportFormat = 'markdown';

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'md' || extension === 'markdown';
    }

    parse(content: string, fileName: string): ParsedDocument {
        const lines = content.split('\n');

        // Find all headings
        const headings = this.extractHeadings(lines);

        if (headings.length === 0) {
            // No headings, treat as plain text
            return this.parseAsPlainText(content, fileName);
        }

        // Determine chapter heading level
        const chapterLevel = this.determineChapterLevel(headings);

        // Extract chapters
        const chapters = this.extractChapters(headings, chapterLevel, lines);

        const warnings: string[] = [];

        if (chapters.length === 0) {
            warnings.push('No chapters found. Document structure may not follow expected heading hierarchy.');
            return this.parseAsPlainText(content, fileName);
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
                title: this.extractDocumentTitle(headings),
                totalWords,
                chapterCount: chapters.length,
                confidence: 90,
                detectionMethod: `Heading ${chapterLevel} as chapters`
            },
            chapters,
            warnings,
            format: this.format
        };
    }

    /**
     * Extract all headings from document
     */
    private extractHeadings(lines: string[]): Heading[] {
        const headings: Heading[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headingMatch) {
                const level = headingMatch[1].length;
                const text = headingMatch[2].trim();

                // Find content until next heading
                let j = i + 1;
                const contentLines: string[] = [];

                while (j < lines.length && !lines[j].match(/^#{1,6}\s+/)) {
                    contentLines.push(lines[j]);
                    j++;
                }

                headings.push({
                    level,
                    text,
                    lineIndex: i,
                    content: contentLines.join('\n').trim()
                });
            }
        }

        return headings;
    }

    /**
     * Determine which heading level represents chapters
     */
    private determineChapterLevel(headings: Heading[]): number {
        // Count headings by level
        const levelCounts = new Map<number, number>();

        for (const heading of headings) {
            levelCounts.set(heading.level, (levelCounts.get(heading.level) || 0) + 1);
        }

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
     * Extract chapters from headings
     */
    private extractChapters(headings: Heading[], chapterLevel: number, lines: string[]): ParsedChapter[] {
        const chapterHeadings = headings.filter(h => h.level === chapterLevel);
        const chapters: ParsedChapter[] = [];

        for (let i = 0; i < chapterHeadings.length; i++) {
            const heading = chapterHeadings[i];
            const nextHeading = chapterHeadings[i + 1];

            const startLine = heading.lineIndex + 1;
            const endLine = nextHeading ? nextHeading.lineIndex - 1 : lines.length - 1;

            const chapterLines = lines.slice(startLine, endLine + 1);
            const chapterContent = chapterLines.join('\n').trim();

            // Skip empty chapters
            if (chapterContent.length === 0) {
                continue;
            }

            // Remove sub-headings from content for word count (optional)
            // We'll keep them for now to preserve structure

            chapters.push({
                title: heading.text,
                number: extractChapterNumber(heading.text),
                content: chapterContent,
                wordCount: countWords(chapterContent),
                startLine,
                endLine
            });
        }

        return chapters;
    }

    /**
     * Extract document title (if H1 at top)
     */
    private extractDocumentTitle(headings: Heading[]): string | undefined {
        if (headings.length > 0 && headings[0].level === 1) {
            // If first heading is H1 and there are other H1s, it's likely a title
            const h1Count = headings.filter(h => h.level === 1).length;
            if (h1Count === 1) {
                return headings[0].text;
            }
        }
        return undefined;
    }

    /**
     * Fallback: parse as plain text
     */
    private parseAsPlainText(content: string, fileName: string): ParsedDocument {
        const chapter: ParsedChapter = {
            title: fileName.replace(/\.(md|markdown)$/i, ''),
            number: 1,
            content: content,
            wordCount: countWords(content),
            startLine: 0,
            endLine: content.split('\n').length - 1
        };

        return {
            metadata: {
                title: fileName,
                totalWords: countWords(content),
                chapterCount: 1,
                confidence: 50,
                detectionMethod: 'No structure detected'
            },
            chapters: [chapter],
            warnings: ['No markdown headings found. Treating entire document as one chapter.'],
            format: this.format
        };
    }
}
