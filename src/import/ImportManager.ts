/**
 * Import Manager
 * Central orchestrator for story and chapter imports
 */

import { Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import {
    ImportFormat,
    DocumentParser,
    ParsedDocument,
    ImportConfiguration,
    ImportResult,
    ImportValidation,
    ChapterImportConfig
} from './ImportTypes';
import { PlainTextParser } from './parsers/PlainTextParser';
import { MarkdownParser } from './parsers/MarkdownParser';
import { Chapter } from '../types';

/**
 * Import Manager class
 */
export class ImportManager {
    private plugin: StorytellerSuitePlugin;
    private parsers: DocumentParser[];

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;

        // Register parsers
        this.parsers = [
            new PlainTextParser(),
            new MarkdownParser()
        ];
    }

    /**
     * Detect file format from content and filename
     */
    detectFormat(content: string, fileName: string): ImportFormat {
        for (const parser of this.parsers) {
            if (parser.canParse(content, fileName)) {
                return parser.format;
            }
        }
        return 'unknown';
    }

    /**
     * Parse document using appropriate parser
     */
    parseDocument(content: string, fileName: string): ParsedDocument | null {
        const format = this.detectFormat(content, fileName);

        if (format === 'unknown') {
            new Notice('Unknown file format. Please use .txt or .md files.');
            return null;
        }

        const parser = this.parsers.find(p => p.format === format);
        if (!parser) {
            new Notice('No parser available for this format.');
            return null;
        }

        try {
            const parsed = parser.parse(content, fileName);
            return parsed;
        } catch (error) {
            console.error('Error parsing document:', error);
            new Notice(`Error parsing document: ${error}`);
            return null;
        }
    }

    /**
     * Validate import configuration
     */
    validateImport(config: ImportConfiguration): ImportValidation {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check story name or ID
        if (config.createNewStory) {
            if (!config.targetStoryName || config.targetStoryName.trim().length === 0) {
                errors.push('Story name is required when creating a new story.');
            }
        } else {
            if (!config.targetStoryId) {
                errors.push('Story ID is required when adding to existing story.');
            }
        }

        // Check chapters
        const enabledChapters = config.chapters.filter(c => c.enabled);
        if (enabledChapters.length === 0) {
            errors.push('At least one chapter must be enabled for import.');
        }

        // Check for duplicate chapter names
        const chapterNames = enabledChapters.map(c => c.targetName);
        const duplicates = chapterNames.filter((name, index) => chapterNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            warnings.push(`Duplicate chapter names found: ${duplicates.join(', ')}`);
        }

        // Check for duplicate chapter numbers
        const chapterNumbers = enabledChapters
            .map(c => c.targetNumber)
            .filter((n): n is number => n !== undefined);
        const duplicateNumbers = chapterNumbers.filter((num, index) => chapterNumbers.indexOf(num) !== index);
        if (duplicateNumbers.length > 0) {
            warnings.push(`Duplicate chapter numbers found: ${duplicateNumbers.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Execute import
     */
    async executeImport(config: ImportConfiguration): Promise<ImportResult> {
        // Validate first
        const validation = this.validateImport(config);
        if (!validation.isValid) {
            return {
                success: false,
                error: validation.errors.join('\n'),
                chaptersCreated: [],
                scenesCreated: [],
                stats: {
                    totalChapters: 0,
                    totalScenes: 0,
                    totalWords: 0,
                    chaptersSkipped: 0,
                    chaptersRenamed: 0
                },
                warnings: validation.warnings,
                skippedChapters: []
            };
        }

        try {
            // Get or create story
            let storyId: string | undefined;
            if (config.createNewStory) {
                storyId = await this.createStory(config.targetStoryName!);
            } else {
                storyId = config.targetStoryId;
            }

            if (!storyId) {
                throw new Error('Failed to get or create story.');
            }

            // Import chapters
            const result = await this.importChapters(storyId, config);

            new Notice(`Import complete: ${result.stats.totalChapters} chapters created`);

            return result;

        } catch (error) {
            console.error('Import error:', error);
            return {
                success: false,
                error: `Import failed: ${error}`,
                chaptersCreated: [],
                scenesCreated: [],
                stats: {
                    totalChapters: 0,
                    totalScenes: 0,
                    totalWords: 0,
                    chaptersSkipped: 0,
                    chaptersRenamed: 0
                },
                warnings: [],
                skippedChapters: []
            };
        }
    }

    /**
     * Create a new story
     */
    private async createStory(storyName: string): Promise<string> {
        // In the current plugin architecture, stories are managed via settings
        // We'll create a new story entry in settings
        const storyId = `story-${Date.now()}`;

        // Add story to plugin settings
        this.plugin.settings.stories = this.plugin.settings.stories || [];
        this.plugin.settings.stories.push({
            id: storyId,
            name: storyName,
            created: new Date().toISOString()
        });

        // Set as active story
        this.plugin.settings.activeStoryId = storyId;

        await this.plugin.saveSettings();

        return storyId;
    }

    /**
     * Import chapters to story
     */
    private async importChapters(storyId: string, config: ImportConfiguration): Promise<ImportResult> {
        const chaptersCreated: Chapter[] = [];
        const warnings: string[] = [...config.parsedDocument.warnings];
        const skippedChapters: string[] = [];
        let totalWords = 0;
        let chaptersSkipped = 0;
        let chaptersRenamed = 0;

        // Ensure the story is active
        const previousStoryId = this.plugin.settings.activeStoryId;
        this.plugin.settings.activeStoryId = storyId;
        await this.plugin.saveSettings();

        try {
            // Get existing chapters for conflict detection
            const existingChapters = await this.plugin.listChapters();
            const existingNames = new Set(existingChapters.map(c => c.name));

            for (const chapterConfig of config.chapters) {
                if (!chapterConfig.enabled) {
                    continue;
                }

                let finalName = chapterConfig.targetName;

                // Handle conflicts
                if (existingNames.has(finalName)) {
                    if (config.conflictResolution === 'skip') {
                        skippedChapters.push(finalName);
                        chaptersSkipped++;
                        continue;
                    } else if (config.conflictResolution === 'rename') {
                        let counter = 2;
                        let newName = `${finalName} (${counter})`;
                        while (existingNames.has(newName)) {
                            counter++;
                            newName = `${finalName} (${counter})`;
                        }
                        finalName = newName;
                        chaptersRenamed++;
                    } else if (config.conflictResolution === 'overwrite') {
                        // Find and delete existing chapter
                        const existing = existingChapters.find(c => c.name === finalName);
                        if (existing && existing.filePath) {
                            const fileToDelete = this.plugin.app.vault.getAbstractFileByPath(existing.filePath);
                            if (fileToDelete) {
                                await this.plugin.app.vault.delete(fileToDelete);
                            }
                        }
                    }
                }

                // Create chapter
                // The content goes in the summary field, which will be stored in ## Summary section
                const chapter: Chapter = {
                    name: finalName,
                    number: chapterConfig.targetNumber,
                    tags: chapterConfig.tags.length > 0 ? chapterConfig.tags : undefined,
                    summary: chapterConfig.content, // Chapter content goes in summary
                    linkedCharacters: [],
                    linkedLocations: [],
                    linkedEvents: [],
                    linkedItems: [],
                    linkedGroups: []
                };

                try {
                    await this.plugin.saveChapter(chapter);
                    chaptersCreated.push(chapter);
                    totalWords += chapterConfig.content.split(/\s+/).length;
                    existingNames.add(finalName);
                } catch (error) {
                    warnings.push(`Failed to create chapter "${finalName}": ${error}`);
                    skippedChapters.push(finalName);
                    chaptersSkipped++;
                }
            }

            return {
                success: true,
                storyId,
                chaptersCreated,
                scenesCreated: [],
                stats: {
                    totalChapters: chaptersCreated.length,
                    totalScenes: 0,
                    totalWords,
                    chaptersSkipped,
                    chaptersRenamed
                },
                warnings,
                skippedChapters
            };
        } finally {
            // Restore previous active story
            if (previousStoryId) {
                this.plugin.settings.activeStoryId = previousStoryId;
                await this.plugin.saveSettings();
            }
        }
    }

    /**
     * Create default import configuration from parsed document
     */
    createDefaultConfiguration(
        parsed: ParsedDocument,
        fileName: string,
        targetStoryName?: string
    ): ImportConfiguration {
        // Create chapter configs
        const chapters: ChapterImportConfig[] = parsed.chapters.map((chapter, index) => ({
            sourceTitle: chapter.title,
            targetName: chapter.title,
            targetNumber: chapter.number ?? (index + 1),
            content: chapter.content,
            tags: [],
            enabled: true
        }));

        return {
            sourceFileName: fileName,
            format: parsed.format,
            parsedDocument: parsed,
            targetStoryName: targetStoryName || fileName.replace(/\.(txt|md)$/i, ''),
            createNewStory: true,
            chapters,
            draftStrategy: 'separate-stories',
            conflictResolution: 'rename',
            preserveFormatting: true,
            configuredAt: new Date().toISOString()
        };
    }
}
