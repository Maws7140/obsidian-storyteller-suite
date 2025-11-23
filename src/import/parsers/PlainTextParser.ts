/**
 * Plain Text Parser
 * Detects chapters in plain text files using common patterns
 */

import {
    ImportFormat,
    DocumentParser,
    ParsedDocument,
    ParsedChapter,
    DocumentMetadata,
    ChapterPattern
} from '../ImportTypes';

/**
 * Converts word numbers to digits
 */
const WORD_TO_NUMBER: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
};

/**
 * Chapter detection patterns, ordered by confidence
 */
const CHAPTER_PATTERNS: ChapterPattern[] = [
    // Pattern 1: "Chapter 1: Title" or "Chapter 1"
    {
        name: 'Chapter [number]: [title]',
        regex: /^(?:Chapter|CHAPTER|Ch\.?)\s+(\d+)(?::\s*(.+))?$/i,
        confidence: 95,
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // Pattern 2: "Chapter One" or "Chapter One: Title"
    {
        name: 'Chapter [word number]',
        regex: /^(?:Chapter|CHAPTER)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?::\s*(.+))?$/i,
        confidence: 90,
        extractNumber: (match) => WORD_TO_NUMBER[match[1].toLowerCase()],
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // Pattern 3: "--- Chapter 1 ---"
    {
        name: '--- Chapter [number] ---',
        regex: /^[-=]+\s*(?:Chapter|CHAPTER)\s+(\d+)(?::\s*(.+))?\s*[-=]+$/i,
        confidence: 85,
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // Pattern 4: All caps "CHAPTER 1"
    {
        name: 'CHAPTER [number]',
        regex: /^CHAPTER\s+(\d+)(?::\s*(.+))?$/,
        confidence: 80,
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // Pattern 5: Roman numerals "Chapter I", "Chapter II"
    {
        name: 'Chapter [Roman]',
        regex: /^(?:Chapter|CHAPTER)\s+([IVXLCDM]+)(?::\s*(.+))?$/i,
        confidence: 75,
        extractNumber: (match) => romanToNumber(match[1]),
        extractTitle: (match) => match[2]?.trim() || ''
    }
];

/**
 * Convert Roman numerals to numbers (basic implementation)
 */
function romanToNumber(roman: string): number {
    const romanMap: Record<string, number> = {
        'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
    };

    let result = 0;
    const upper = roman.toUpperCase();

    for (let i = 0; i < upper.length; i++) {
        const current = romanMap[upper[i]];
        const next = romanMap[upper[i + 1]];

        if (next && current < next) {
            result -= current;
        } else {
            result += current;
        }
    }

    return result;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Plain text document parser
 */
export class PlainTextParser implements DocumentParser {
    name = 'Plain Text Parser';
    format: ImportFormat = 'plaintext';

    canParse(content: string, fileName: string): boolean {
        // Can parse any text file
        const extension = fileName.toLowerCase().split('.').pop();
        return extension === 'txt' || !extension;
    }

    parse(content: string, fileName: string): ParsedDocument {
        const lines = content.split('\n');

        // Try each pattern and score them
        const patternScores = CHAPTER_PATTERNS.map(pattern => ({
            pattern,
            matches: this.findChapterMatches(lines, pattern)
        }));

        // Find best pattern (most matches with highest confidence)
        let bestPattern = patternScores[0];
        let bestScore = bestPattern.matches.length * bestPattern.pattern.confidence;

        for (const ps of patternScores) {
            const score = ps.matches.length * ps.pattern.confidence;
            if (score > bestScore && ps.matches.length >= 2) {
                bestPattern = ps;
                bestScore = score;
            }
        }

        const matches = bestPattern.matches;
        const warnings: string[] = [];

        // If no chapters found, treat entire document as one chapter
        if (matches.length === 0) {
            warnings.push('No chapter markers found. Treating entire document as one chapter.');
            const chapter: ParsedChapter = {
                title: fileName.replace(/\.(txt|md)$/i, ''),
                number: 1,
                content: content,
                wordCount: countWords(content),
                startLine: 0,
                endLine: lines.length - 1
            };

            return {
                metadata: {
                    title: fileName,
                    totalWords: countWords(content),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No chapters detected'
                },
                chapters: [chapter],
                warnings,
                format: this.format
            };
        }

        // Extract chapters
        const chapters: ParsedChapter[] = [];

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const nextMatch = matches[i + 1];

            const startLine = match.lineIndex + 1; // Skip the chapter marker line
            const endLine = nextMatch ? nextMatch.lineIndex - 1 : lines.length - 1;

            const chapterLines = lines.slice(startLine, endLine + 1);
            const chapterContent = chapterLines.join('\n').trim();

            // Skip empty chapters
            if (chapterContent.length === 0) {
                warnings.push(`Chapter ${match.number} is empty and was skipped.`);
                continue;
            }

            chapters.push({
                title: match.title || `Chapter ${match.number}`,
                number: match.number,
                content: chapterContent,
                wordCount: countWords(chapterContent),
                startLine,
                endLine
            });
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
                title: this.extractTitle(lines),
                totalWords,
                chapterCount: chapters.length,
                confidence: bestPattern.pattern.confidence,
                detectionMethod: bestPattern.pattern.name
            },
            chapters,
            warnings,
            format: this.format
        };
    }

    /**
     * Find all chapter matches using a pattern
     */
    private findChapterMatches(lines: string[], pattern: ChapterPattern): Array<{
        lineIndex: number;
        number: number | undefined;
        title: string;
    }> {
        const matches: Array<{ lineIndex: number; number: number | undefined; title: string }> = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(pattern.regex);

            if (match) {
                matches.push({
                    lineIndex: i,
                    number: pattern.extractNumber(match),
                    title: pattern.extractTitle(match)
                });
            }
        }

        return matches;
    }

    /**
     * Try to extract document title from first few lines
     */
    private extractTitle(lines: string[]): string | undefined {
        // Look at first 10 non-empty lines
        const firstLines = lines.slice(0, 10).filter(l => l.trim().length > 0);

        if (firstLines.length === 0) return undefined;

        // If first line looks like a title (short, capitalized, no chapter marker)
        const firstLine = firstLines[0].trim();
        if (firstLine.length > 0 && firstLine.length < 100 && !firstLine.match(/^(?:Chapter|CHAPTER|Ch\.)/i)) {
            return firstLine;
        }

        return undefined;
    }
}
