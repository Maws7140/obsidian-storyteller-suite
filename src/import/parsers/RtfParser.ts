/**
 * RTF Parser
 * Parses Rich Text Format files
 * 
 * RTF is a proprietary document format from Microsoft.
 * This parser extracts plain text and detects chapters from formatting.
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
 * Chapter detection patterns
 */
const CHAPTER_PATTERNS = [
    /^(?:Chapter|CHAPTER|Ch\.?)\s+(\d+)(?::\s*(.+))?$/i,
    /^(?:Chapter|CHAPTER)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)(?::\s*(.+))?$/i,
    /^CHAPTER\s+(\d+)(?::\s*(.+))?$/,
    /^(?:Chapter|CHAPTER)\s+([IVXLCDM]+)(?::\s*(.+))?$/i,
];

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
 * RTF document parser
 */
export class RtfParser implements DocumentParser {
    name = 'RTF Parser';
    format: ImportFormat = 'rtf' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        if (extension === 'rtf') {
            return true;
        }
        // Check RTF signature
        return content.trim().startsWith('{\\rtf');
    }

    parse(content: string, fileName: string): ParsedDocument {
        try {
            // Extract plain text from RTF
            const plainText = this.rtfToPlainText(content);
            return this.parseText(plainText, fileName);
        } catch (error) {
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'RTF parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse RTF: ${error}`],
                format: this.format
            };
        }
    }

    /**
     * Convert RTF to plain text
     * This is a simplified RTF parser that extracts text content
     */
    private rtfToPlainText(rtf: string): string {
        // Remove RTF header and footer
        let text = rtf;

        // Track group depth
        let depth = 0;
        let result = '';
        let i = 0;
        let skipGroup = false;
        let skipGroupDepth = 0;

        while (i < text.length) {
            const char = text[i];

            if (char === '{') {
                depth++;
                // Check if this is a group to skip (like \fonttbl, \colortbl, etc.)
                const ahead = text.slice(i, i + 20);
                if (ahead.match(/^\{\\(fonttbl|colortbl|stylesheet|info|pict|object|\*)/)) {
                    skipGroup = true;
                    skipGroupDepth = depth;
                }
                i++;
                continue;
            }

            if (char === '}') {
                if (skipGroup && depth === skipGroupDepth) {
                    skipGroup = false;
                }
                depth--;
                i++;
                continue;
            }

            if (skipGroup) {
                i++;
                continue;
            }

            if (char === '\\') {
                // Handle control word or symbol
                i++;
                if (i >= text.length) break;

                const nextChar = text[i];

                // Escaped characters
                if (nextChar === '\\' || nextChar === '{' || nextChar === '}') {
                    result += nextChar;
                    i++;
                    continue;
                }

                // Line breaks
                if (nextChar === 'p' && text.slice(i, i + 4) === 'par ') {
                    result += '\n';
                    i += 4;
                    continue;
                }
                if (nextChar === 'p' && text.slice(i, i + 3) === 'par') {
                    result += '\n';
                    i += 3;
                    continue;
                }

                // Line break
                if (nextChar === '\n' || nextChar === '\r') {
                    i++;
                    continue;
                }

                // Tab
                if (nextChar === 't' && text.slice(i, i + 4) === 'tab ') {
                    result += '\t';
                    i += 4;
                    continue;
                }

                // Unicode character
                if (nextChar === 'u') {
                    const unicodeMatch = text.slice(i).match(/^u(-?\d+)/);
                    if (unicodeMatch) {
                        const codePoint = parseInt(unicodeMatch[1], 10);
                        if (codePoint >= 0) {
                            result += String.fromCharCode(codePoint);
                        }
                        i += unicodeMatch[0].length;
                        // Skip the replacement character
                        if (text[i] === '?') i++;
                        continue;
                    }
                }

                // Skip other control words
                const controlMatch = text.slice(i).match(/^[a-z]+(-?\d+)?\s?/i);
                if (controlMatch) {
                    i += controlMatch[0].length;
                    continue;
                }

                // Single character control symbol
                i++;
                continue;
            }

            // Regular character
            if (depth > 0) {
                result += char;
            }
            i++;
        }

        // Clean up the text
        return result
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Parse extracted plain text
     */
    private parseText(text: string, fileName: string): ParsedDocument {
        const lines = text.split('\n');
        const warnings: string[] = [];

        // Find chapter markers
        const chapterMatches: Array<{ lineIndex: number; title: string; number?: number }> = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            for (const pattern of CHAPTER_PATTERNS) {
                const match = line.match(pattern);
                if (match) {
                    chapterMatches.push({
                        lineIndex: i,
                        title: line,
                        number: extractChapterNumber(line)
                    });
                    break;
                }
            }
        }

        // If no chapters found, treat entire document as one chapter
        if (chapterMatches.length === 0) {
            warnings.push('No chapter markers found. Treating entire document as one chapter.');
            const scenes = this.detectScenes(text);
            return {
                metadata: {
                    title: fileName.replace(/\.rtf$/i, ''),
                    totalWords: countWords(text),
                    chapterCount: 1,
                    confidence: 50,
                    detectionMethod: 'No chapters detected'
                },
                chapters: [{
                    title: fileName.replace(/\.rtf$/i, ''),
                    number: 1,
                    content: text,
                    wordCount: countWords(text),
                    scenes: scenes.length > 1 ? scenes : undefined
                }],
                warnings,
                format: this.format
            };
        }

        // Extract chapters
        const chapters: ParsedChapter[] = [];

        for (let i = 0; i < chapterMatches.length; i++) {
            const match = chapterMatches[i];
            const nextMatch = chapterMatches[i + 1];

            const startLine = match.lineIndex + 1;
            const endLine = nextMatch ? nextMatch.lineIndex - 1 : lines.length - 1;

            const chapterLines = lines.slice(startLine, endLine + 1);
            const chapterContent = chapterLines.join('\n').trim();

            if (chapterContent.length === 0) {
                warnings.push(`Chapter "${match.title}" is empty and was skipped.`);
                continue;
            }

            const scenes = this.detectScenes(chapterContent);

            chapters.push({
                title: match.title,
                number: match.number || (i + 1),
                content: chapterContent,
                wordCount: countWords(chapterContent),
                scenes: scenes.length > 1 ? scenes : undefined
            });
        }

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

        return {
            metadata: {
                title: this.extractTitle(lines) || fileName.replace(/\.rtf$/i, ''),
                totalWords,
                chapterCount: chapters.length,
                confidence: 75,
                detectionMethod: 'Chapter markers'
            },
            chapters,
            warnings,
            format: this.format
        };
    }

    /**
     * Extract document title from first lines
     */
    private extractTitle(lines: string[]): string | undefined {
        const firstLines = lines.slice(0, 10).filter(l => l.trim().length > 0);
        
        if (firstLines.length === 0) return undefined;

        const firstLine = firstLines[0].trim();
        if (firstLine.length > 0 && firstLine.length < 100 && 
            !firstLine.match(/^(?:Chapter|CHAPTER|Ch\.)/i)) {
            return firstLine;
        }

        return undefined;
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
