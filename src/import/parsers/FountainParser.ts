/**
 * Fountain Parser
 * Parses Fountain screenplay format files (.fountain, .spmd)
 * 
 * Fountain is a plain text markup format for screenwriting.
 * Reference: https://fountain.io/syntax
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
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Fountain document parser
 */
export class FountainParser implements DocumentParser {
    name = 'Fountain Parser';
    format: ImportFormat = 'fountain' as ImportFormat;

    canParse(content: string, fileName: string): boolean {
        const extension = fileName.toLowerCase().split('.').pop();
        if (extension === 'fountain' || extension === 'spmd') return true;
        
        // Check for Fountain markers in content
        // Scene headings typically start with INT. or EXT.
        if (content.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/im)) {
            return true;
        }
        
        return false;
    }

    parse(content: string, fileName: string): ParsedDocument {
        try {
            // Parse title page if present
            const { titlePage, body } = this.parseTitlePage(content);
            
            // Parse the screenplay body
            const scenes = this.parseScenes(body);
            
            if (scenes.length === 0) {
                // Treat as single scene
                return {
                    metadata: {
                        title: titlePage.title || fileName.replace(/\.(fountain|spmd)$/i, ''),
                        author: titlePage.author,
                        totalWords: countWords(content),
                        chapterCount: 1,
                        confidence: 60,
                        detectionMethod: 'No scenes detected'
                    },
                    chapters: [{
                        title: titlePage.title || 'Script',
                        number: 1,
                        content: body,
                        wordCount: countWords(body)
                    }],
                    warnings: ['No scene headings found. Document imported as single chapter.'],
                    format: this.format
                };
            }

            // Group scenes into acts/sequences if detected
            const chapters = this.groupScenesIntoChapters(scenes);
            const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

            return {
                metadata: {
                    title: titlePage.title || fileName.replace(/\.(fountain|spmd)$/i, ''),
                    author: titlePage.author,
                    totalWords,
                    chapterCount: chapters.length,
                    confidence: 85,
                    detectionMethod: 'Fountain scene headings'
                },
                chapters,
                warnings: [],
                format: this.format
            };
        } catch (error) {
            return {
                metadata: {
                    title: fileName,
                    totalWords: 0,
                    chapterCount: 0,
                    confidence: 0,
                    detectionMethod: 'Fountain parse failed'
                },
                chapters: [],
                warnings: [`Failed to parse Fountain file: ${error}`],
                format: this.format
            };
        }
    }

    /**
     * Parse the title page (if present)
     * Title pages are separated from the body by a blank line
     */
    private parseTitlePage(content: string): {
        titlePage: { title?: string; author?: string; };
        body: string;
    } {
        const titlePage: { title?: string; author?: string } = {};
        
        // Title page entries are in format "Key: Value"
        const lines = content.split('\n');
        let bodyStartIndex = 0;
        let inTitlePage = true;
        let foundTitlePageEntry = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for title page entry (Key: Value format)
            const entryMatch = line.match(/^(Title|Author|Credit|Source|Draft date|Contact|Copyright):\s*(.+)$/i);
            
            if (entryMatch) {
                foundTitlePageEntry = true;
                const key = entryMatch[1].toLowerCase();
                const value = entryMatch[2].trim();
                
                if (key === 'title') titlePage.title = value;
                if (key === 'author' || key === 'credit') titlePage.author = value;
            } else if (foundTitlePageEntry && line.trim() === '') {
                // Empty line after title page entries marks end of title page
                bodyStartIndex = i + 1;
                break;
            } else if (!foundTitlePageEntry && line.trim() !== '') {
                // No title page, content starts immediately
                break;
            }
        }

        const body = lines.slice(bodyStartIndex).join('\n').trim();
        return { titlePage, body };
    }

    /**
     * Parse scenes from the screenplay body
     */
    private parseScenes(body: string): Array<{
        heading: string;
        location: string;
        timeOfDay?: string;
        content: string;
        wordCount: number;
    }> {
        const scenes: Array<{
            heading: string;
            location: string;
            timeOfDay?: string;
            content: string;
            wordCount: number;
        }> = [];

        // Scene heading pattern
        // Matches: INT. LOCATION - DAY, EXT. LOCATION - NIGHT, etc.
        const sceneHeadingPattern = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|\.)\s*(.+?)(?:\s*[-–—]\s*(.+))?$/gim;

        const lines = body.split('\n');
        let currentScene: { heading: string; location: string; timeOfDay?: string; lines: string[] } | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Check if this is a scene heading
            const headingMatch = trimmedLine.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|\.)\s*(.+?)(?:\s*[-–—]\s*(.+))?$/i);
            
            if (headingMatch) {
                // Save previous scene
                if (currentScene) {
                    const content = currentScene.lines.join('\n').trim();
                    if (content.length > 0) {
                        scenes.push({
                            heading: currentScene.heading,
                            location: currentScene.location,
                            timeOfDay: currentScene.timeOfDay,
                            content,
                            wordCount: countWords(content)
                        });
                    }
                }

                // Start new scene
                const prefix = headingMatch[1].toUpperCase().replace('.', '');
                const location = headingMatch[2].trim();
                const timeOfDay = headingMatch[3]?.trim();

                currentScene = {
                    heading: trimmedLine,
                    location: `${prefix} ${location}`,
                    timeOfDay,
                    lines: []
                };
            } else if (currentScene) {
                // Add line to current scene
                currentScene.lines.push(line);
            }
        }

        // Don't forget the last scene
        if (currentScene) {
            const content = currentScene.lines.join('\n').trim();
            if (content.length > 0) {
                scenes.push({
                    heading: currentScene.heading,
                    location: currentScene.location,
                    timeOfDay: currentScene.timeOfDay,
                    content,
                    wordCount: countWords(content)
                });
            }
        }

        return scenes;
    }

    /**
     * Group scenes into chapters (acts or sequences)
     * Each scene becomes a ParsedScene within a chapter
     */
    private groupScenesIntoChapters(
        scenes: Array<{
            heading: string;
            location: string;
            timeOfDay?: string;
            content: string;
            wordCount: number;
        }>
    ): ParsedChapter[] {
        // For screenplays, we'll group every N scenes into an "Act" or keep as individual scenes
        // If there are act breaks in the content, use those
        
        const chapters: ParsedChapter[] = [];
        
        // Check for act breaks in content
        const actScenes: Map<string, typeof scenes> = new Map();
        let currentAct = 'Act 1';
        
        for (const scene of scenes) {
            // Check for act indicators
            const actMatch = scene.content.match(/^ACT\s+(ONE|TWO|THREE|FOUR|FIVE|I{1,3}V?|[1-5])/im);
            if (actMatch) {
                currentAct = `Act ${actMatch[1]}`;
            }
            
            if (!actScenes.has(currentAct)) {
                actScenes.set(currentAct, []);
            }
            actScenes.get(currentAct)!.push(scene);
        }

        // If we only have one act with many scenes, split into acts of ~10-15 scenes
        if (actScenes.size === 1 && scenes.length > 15) {
            const scenesPerAct = Math.ceil(scenes.length / 3);
            actScenes.clear();
            
            for (let i = 0; i < scenes.length; i++) {
                const actNum = Math.floor(i / scenesPerAct) + 1;
                const actName = `Act ${actNum}`;
                
                if (!actScenes.has(actName)) {
                    actScenes.set(actName, []);
                }
                actScenes.get(actName)!.push(scenes[i]);
            }
        }

        // Convert to ParsedChapters
        let actNumber = 1;
        for (const [actName, actScenesArray] of actScenes) {
            const combinedContent = actScenesArray.map(s => 
                `${s.heading}\n\n${s.content}`
            ).join('\n\n---\n\n');

            const parsedScenes: ParsedScene[] = actScenesArray.map((s, idx) => ({
                title: s.location,
                content: `${s.heading}\n\n${s.content}`,
                wordCount: s.wordCount
            }));

            chapters.push({
                title: actName,
                number: actNumber,
                content: combinedContent,
                wordCount: actScenesArray.reduce((sum, s) => sum + s.wordCount, 0),
                scenes: parsedScenes.length > 1 ? parsedScenes : undefined
            });
            
            actNumber++;
        }

        return chapters;
    }
}

