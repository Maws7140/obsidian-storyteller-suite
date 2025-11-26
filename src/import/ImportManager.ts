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
    ChapterImportConfig,
    ImportProgressCallback
} from './ImportTypes';
import { PlainTextParser } from './parsers/PlainTextParser';
import { MarkdownParser } from './parsers/MarkdownParser';
import { DocxParser } from './parsers/DocxParser';
import { JsonParser } from './parsers/JsonParser';
import { EpubParser } from './parsers/EpubParser';
import { HtmlParser } from './parsers/HtmlParser';
import { RtfParser } from './parsers/RtfParser';
import { OdtParser } from './parsers/OdtParser';
import { FountainParser } from './parsers/FountainParser';
import { PdfParser } from './parsers/PdfParser';
import { Chapter, Scene, Character, Location } from '../types';

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
            new MarkdownParser(),
            new DocxParser(),
            new JsonParser(),
            new EpubParser(),
            new HtmlParser(),
            new RtfParser(),
            new OdtParser(),
            new FountainParser(),
            new PdfParser()
        ];
    }

    /**
     * Get DOCX parser for async parsing
     */
    getDocxParser(): DocxParser | undefined {
        return this.parsers.find(p => p.format === 'docx') as DocxParser | undefined;
    }

    /**
     * Get EPUB parser for async parsing
     */
    getEpubParser(): EpubParser | undefined {
        return this.parsers.find(p => p.format === 'epub') as EpubParser | undefined;
    }

    /**
     * Get ODT parser for async parsing
     */
    getOdtParser(): OdtParser | undefined {
        return this.parsers.find(p => p.format === 'odt') as OdtParser | undefined;
    }

    /**
     * Get PDF parser for async parsing
     */
    getPdfParser(): PdfParser | undefined {
        return this.parsers.find(p => p.format === 'pdf') as PdfParser | undefined;
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
     * Execute import with optional progress callback
     */
    async executeImport(
        config: ImportConfiguration, 
        onProgress?: ImportProgressCallback
    ): Promise<ImportResult> {
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
            // Report initial progress
            onProgress?.({
                currentStep: 'Preparing import...',
                currentItem: '',
                processed: 0,
                total: config.chapters.filter(c => c.enabled).length,
                percentage: 0
            });

            // Get or create story
            let storyId: string | undefined;
            if (config.createNewStory) {
                onProgress?.({
                    currentStep: 'Creating story...',
                    currentItem: config.targetStoryName || '',
                    processed: 0,
                    total: config.chapters.filter(c => c.enabled).length,
                    percentage: 5
                });
                storyId = await this.createStory(config.targetStoryName!);
            } else {
                storyId = config.targetStoryId;
            }

            if (!storyId) {
                throw new Error('Failed to get or create story.');
            }

            // Create entities if entity extraction is enabled
            let createdEntities: { characters: Character[]; locations: Location[] } = {
                characters: [],
                locations: []
            };
            
            if (config.entityExtractionEnabled && config.entityMappings.length > 0) {
                onProgress?.({
                    currentStep: 'Creating entities...',
                    currentItem: '',
                    processed: 0,
                    total: config.chapters.filter(c => c.enabled).length,
                    percentage: 8
                });
                createdEntities = await this.createEntitiesFromMappings(config);
            }

            // Import chapters with progress
            const result = await this.importChapters(storyId, config, onProgress, createdEntities);

            const scenesMsg = result.stats.totalScenes > 0 
                ? `, ${result.stats.totalScenes} scenes` 
                : '';
            const entitiesMsg = (createdEntities.characters.length + createdEntities.locations.length) > 0
                ? `, ${createdEntities.characters.length} characters, ${createdEntities.locations.length} locations`
                : '';
            new Notice(`Import complete: ${result.stats.totalChapters} chapters${scenesMsg}${entitiesMsg} created`);

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
     * Create entities from entity mappings
     */
    private async createEntitiesFromMappings(
        config: ImportConfiguration
    ): Promise<{ characters: Character[]; locations: Location[] }> {
        const createdCharacters: Character[] = [];
        const createdLocations: Location[] = [];

        for (const mapping of config.entityMappings) {
            if (mapping.action !== 'create') continue;

            const entityName = mapping.newEntityName || mapping.extractedName;

            if (mapping.type === 'character') {
                const character: Character = {
                    name: entityName,
                    traits: ['imported'],
                    events: [],
                    locations: [],
                    groups: []
                };

                try {
                    await this.plugin.saveCharacter(character);
                    createdCharacters.push(character);
                } catch (error) {
                    console.warn(`Failed to create character "${entityName}":`, error);
                }
            } else if (mapping.type === 'location') {
                const location: Location = {
                    name: entityName,
                    groups: []
                };

                try {
                    await this.plugin.saveLocation(location);
                    createdLocations.push(location);
                } catch (error) {
                    console.warn(`Failed to create location "${entityName}":`, error);
                }
            }
        }

        return { characters: createdCharacters, locations: createdLocations };
    }

    /**
     * Build entity name to ID mapping for linking
     */
    private buildEntityNameToIdMap(
        config: ImportConfiguration,
        createdEntities: { characters: Character[]; locations: Location[] }
    ): { characterMap: Map<string, string>; locationMap: Map<string, string> } {
        const characterMap = new Map<string, string>();
        const locationMap = new Map<string, string>();

        for (const mapping of config.entityMappings) {
            if (mapping.action === 'ignore') continue;

            const extractedName = mapping.extractedName.toLowerCase();

            if (mapping.action === 'link' && mapping.linkedEntityId) {
                if (mapping.type === 'character') {
                    characterMap.set(extractedName, mapping.linkedEntityId);
                } else {
                    locationMap.set(extractedName, mapping.linkedEntityId);
                }
            } else if (mapping.action === 'create') {
                // Find the created entity
                const entityName = (mapping.newEntityName || mapping.extractedName).toLowerCase();
                if (mapping.type === 'character') {
                    const created = createdEntities.characters.find(
                        c => c.name.toLowerCase() === entityName
                    );
                    if (created?.id) {
                        characterMap.set(extractedName, created.id);
                    }
                } else {
                    const created = createdEntities.locations.find(
                        l => l.name.toLowerCase() === entityName
                    );
                    if (created?.id) {
                        locationMap.set(extractedName, created.id);
                    }
                }
            }
        }

        return { characterMap, locationMap };
    }

    /**
     * Find entity mentions in text and return IDs
     */
    private findEntityMentions(
        content: string,
        characterMap: Map<string, string>,
        locationMap: Map<string, string>
    ): { characterIds: string[]; locationIds: string[] } {
        const foundCharacterIds = new Set<string>();
        const foundLocationIds = new Set<string>();
        const lowerContent = content.toLowerCase();

        for (const [name, id] of characterMap) {
            if (lowerContent.includes(name)) {
                foundCharacterIds.add(id);
            }
        }

        for (const [name, id] of locationMap) {
            if (lowerContent.includes(name)) {
                foundLocationIds.add(id);
            }
        }

        return {
            characterIds: Array.from(foundCharacterIds),
            locationIds: Array.from(foundLocationIds)
        };
    }

    /**
     * Import chapters to story
     */
    private async importChapters(
        storyId: string, 
        config: ImportConfiguration,
        onProgress?: ImportProgressCallback,
        createdEntities?: { characters: Character[]; locations: Location[] }
    ): Promise<ImportResult> {
        const chaptersCreated: Chapter[] = [];
        const scenesCreated: Scene[] = [];
        const warnings: string[] = [...config.parsedDocument.warnings];
        const skippedChapters: string[] = [];
        let totalWords = 0;
        let chaptersSkipped = 0;
        let chaptersRenamed = 0;

        const enabledChapters = config.chapters.filter(c => c.enabled);
        const totalToProcess = enabledChapters.length;
        let processed = 0;

        // Ensure the story is active
        const previousStoryId = this.plugin.settings.activeStoryId;
        this.plugin.settings.activeStoryId = storyId;
        await this.plugin.saveSettings();

        // Build entity name to ID maps for linking
        const { characterMap, locationMap } = this.buildEntityNameToIdMap(
            config,
            createdEntities || { characters: [], locations: [] }
        );

        try {
            // Get existing chapters for conflict detection
            const existingChapters = await this.plugin.listChapters();
            const existingNames = new Set(existingChapters.map(c => c.name));
            const existingScenes = await this.plugin.listScenes();
            const existingSceneNames = new Set(existingScenes.map(s => s.name));

            for (const chapterConfig of config.chapters) {
                if (!chapterConfig.enabled) {
                    continue;
                }

                // Report progress
                onProgress?.({
                    currentStep: 'Creating chapter...',
                    currentItem: chapterConfig.targetName,
                    processed,
                    total: totalToProcess,
                    percentage: Math.round(10 + (processed / totalToProcess) * 85)
                });

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

                // Find entity mentions in chapter content for linking
                const { characterIds, locationIds } = config.entityExtractionEnabled
                    ? this.findEntityMentions(chapterConfig.content, characterMap, locationMap)
                    : { characterIds: [], locationIds: [] };

                // Build tags based on draft strategy
                let chapterTags = chapterConfig.tags.length > 0 ? [...chapterConfig.tags] : [];
                
                // Apply draft strategy tags
                if (config.draftStrategy === 'version-tags' && config.draftVersion) {
                    const versionTag = config.draftVersion
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-]/g, '');
                    if (versionTag && !chapterTags.includes(versionTag)) {
                        chapterTags.push(versionTag);
                    }
                }

                // Create chapter
                const chapter: Chapter = {
                    name: finalName,
                    number: chapterConfig.targetNumber,
                    tags: chapterTags.length > 0 ? chapterTags : undefined,
                    // Only put content in summary if using chapter-summary placement
                    summary: config.contentPlacement === 'chapter-summary' ? chapterConfig.content : undefined,
                    linkedCharacters: characterIds,
                    linkedLocations: locationIds,
                    linkedEvents: [],
                    linkedItems: [],
                    linkedGroups: []
                };

                // Add custom metadata for draftVersion if using custom-metadata strategy
                if (config.draftStrategy === 'custom-metadata' && config.draftVersion) {
                    (chapter as any).draftVersion = config.draftVersion;
                }

                try {
                    await this.plugin.saveChapter(chapter);
                    chaptersCreated.push(chapter);
                    totalWords += chapterConfig.content.split(/\s+/).length;
                    existingNames.add(finalName);

                    // If using scene-files placement, create scene(s) for the chapter content
                    if (config.contentPlacement === 'scene-files') {
                        // Check if we have parsed scenes from the document
                        const parsedChapter = config.parsedDocument.chapters.find(
                            pc => pc.title === chapterConfig.sourceTitle
                        );
                        const parsedScenes = parsedChapter?.scenes;

                        if (parsedScenes && parsedScenes.length > 1) {
                            // Create multiple scenes based on detected scene breaks
                            for (let sceneIdx = 0; sceneIdx < parsedScenes.length; sceneIdx++) {
                                const parsedScene = parsedScenes[sceneIdx];
                                
                                onProgress?.({
                                    currentStep: 'Creating scene...',
                                    currentItem: `${finalName} - ${parsedScene.title || `Scene ${sceneIdx + 1}`}`,
                                    processed,
                                    total: totalToProcess,
                                    percentage: Math.round(10 + (processed / totalToProcess) * 85)
                                });

                                const sceneName = `${finalName} - ${parsedScene.title || `Scene ${sceneIdx + 1}`}`;
                                let finalSceneName = sceneName;
                                
                                if (existingSceneNames.has(finalSceneName)) {
                                    let counter = 2;
                                    while (existingSceneNames.has(`${sceneName} (${counter})`)) {
                                        counter++;
                                    }
                                    finalSceneName = `${sceneName} (${counter})`;
                                }

                                // Find entity mentions in this specific scene's content
                                const sceneEntities = config.entityExtractionEnabled
                                    ? this.findEntityMentions(parsedScene.content, characterMap, locationMap)
                                    : { characterIds: [], locationIds: [] };

                                // Determine scene status based on draft strategy
                                let sceneStatus = 'Draft';
                                if (config.draftStrategy === 'scene-status' && config.draftVersion) {
                                    // Map common draft version names to status
                                    const versionLower = config.draftVersion.toLowerCase();
                                    if (versionLower.includes('final') || versionLower.includes('complete')) {
                                        sceneStatus = 'Final';
                                    } else if (versionLower.includes('revis') || versionLower.includes('edit')) {
                                        sceneStatus = 'Revised';
                                    } else if (versionLower.includes('wip') || versionLower.includes('progress')) {
                                        sceneStatus = 'WIP';
                                    } else if (versionLower.includes('outline')) {
                                        sceneStatus = 'Outline';
                                    }
                                    // Otherwise keep as 'Draft'
                                }

                                // Build scene tags
                                let sceneTags = chapterConfig.tags.length > 0 ? [...chapterConfig.tags] : [];
                                if (config.draftStrategy === 'version-tags' && config.draftVersion) {
                                    const versionTag = config.draftVersion
                                        .toLowerCase()
                                        .replace(/\s+/g, '-')
                                        .replace(/[^a-z0-9-]/g, '');
                                    if (versionTag && !sceneTags.includes(versionTag)) {
                                        sceneTags.push(versionTag);
                                    }
                                }

                                const scene: Scene = {
                                    name: finalSceneName,
                                    chapterId: chapter.id,
                                    chapterName: finalName,
                                    status: sceneStatus,
                                    priority: sceneIdx + 1,
                                    content: parsedScene.content,
                                    tags: sceneTags.length > 0 ? sceneTags : undefined,
                                    linkedCharacters: sceneEntities.characterIds,
                                    linkedLocations: sceneEntities.locationIds,
                                    linkedEvents: [],
                                    linkedItems: [],
                                    linkedGroups: []
                                };

                                // Add custom metadata for draftVersion if using custom-metadata strategy
                                if (config.draftStrategy === 'custom-metadata' && config.draftVersion) {
                                    (scene as any).draftVersion = config.draftVersion;
                                }

                                try {
                                    await this.plugin.saveScene(scene);
                                    scenesCreated.push(scene);
                                    existingSceneNames.add(finalSceneName);
                                } catch (sceneError) {
                                    warnings.push(`Failed to create scene "${finalSceneName}": ${sceneError}`);
                                }
                            }
                        } else {
                            // No scene breaks detected, create single scene for chapter
                            onProgress?.({
                                currentStep: 'Creating scene...',
                                currentItem: `${finalName} - Content`,
                                processed,
                                total: totalToProcess,
                                percentage: Math.round(10 + (processed / totalToProcess) * 85)
                            });

                            const sceneName = `${finalName} - Content`;
                            let finalSceneName = sceneName;
                            
                            if (existingSceneNames.has(finalSceneName)) {
                                let counter = 2;
                                while (existingSceneNames.has(`${sceneName} (${counter})`)) {
                                    counter++;
                                }
                                finalSceneName = `${sceneName} (${counter})`;
                            }

                            // Determine scene status based on draft strategy
                            let singleSceneStatus = 'Draft';
                            if (config.draftStrategy === 'scene-status' && config.draftVersion) {
                                const versionLower = config.draftVersion.toLowerCase();
                                if (versionLower.includes('final') || versionLower.includes('complete')) {
                                    singleSceneStatus = 'Final';
                                } else if (versionLower.includes('revis') || versionLower.includes('edit')) {
                                    singleSceneStatus = 'Revised';
                                } else if (versionLower.includes('wip') || versionLower.includes('progress')) {
                                    singleSceneStatus = 'WIP';
                                } else if (versionLower.includes('outline')) {
                                    singleSceneStatus = 'Outline';
                                }
                            }

                            // Build scene tags
                            let singleSceneTags = chapterConfig.tags.length > 0 ? [...chapterConfig.tags] : [];
                            if (config.draftStrategy === 'version-tags' && config.draftVersion) {
                                const versionTag = config.draftVersion
                                    .toLowerCase()
                                    .replace(/\s+/g, '-')
                                    .replace(/[^a-z0-9-]/g, '');
                                if (versionTag && !singleSceneTags.includes(versionTag)) {
                                    singleSceneTags.push(versionTag);
                                }
                            }

                            const scene: Scene = {
                                name: finalSceneName,
                                chapterId: chapter.id,
                                chapterName: finalName,
                                status: singleSceneStatus,
                                content: chapterConfig.content,
                                tags: singleSceneTags.length > 0 ? singleSceneTags : undefined,
                                linkedCharacters: characterIds,
                                linkedLocations: locationIds,
                                linkedEvents: [],
                                linkedItems: [],
                                linkedGroups: []
                            };

                            // Add custom metadata for draftVersion if using custom-metadata strategy
                            if (config.draftStrategy === 'custom-metadata' && config.draftVersion) {
                                (scene as any).draftVersion = config.draftVersion;
                            }

                            try {
                                await this.plugin.saveScene(scene);
                                scenesCreated.push(scene);
                                existingSceneNames.add(finalSceneName);
                            } catch (sceneError) {
                                warnings.push(`Failed to create scene for chapter "${finalName}": ${sceneError}`);
                            }
                        }
                    }

                    processed++;
                } catch (error) {
                    warnings.push(`Failed to create chapter "${finalName}": ${error}`);
                    skippedChapters.push(finalName);
                    chaptersSkipped++;
                    processed++;
                }
            }

            // Final progress report
            onProgress?.({
                currentStep: 'Import complete!',
                currentItem: '',
                processed: totalToProcess,
                total: totalToProcess,
                percentage: 100
            });

            return {
                success: true,
                storyId,
                chaptersCreated,
                scenesCreated,
                stats: {
                    totalChapters: chaptersCreated.length,
                    totalScenes: scenesCreated.length,
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
            targetStoryName: targetStoryName || fileName.replace(/\.(txt|md|docx|json|csv|epub|html|htm|rtf|odt|fountain|pdf)$/i, ''),
            createNewStory: true,
            chapters,
            draftStrategy: 'separate-stories',
            conflictResolution: 'rename',
            preserveFormatting: true,
            contentPlacement: 'chapter-summary',
            entityExtractionEnabled: false,
            entityMappings: [],
            configuredAt: new Date().toISOString()
        };
    }
}
