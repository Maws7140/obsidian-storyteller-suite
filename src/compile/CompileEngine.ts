/**
 * CompileEngine - Core compilation orchestrator for manuscript generation
 * Inspired by Obsidian Longform plugin's compile system
 */

import { App, TFile, Notice, normalizePath } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type {
    StoryDraft,
    CompileWorkflow,
    CompileStepConfig,
    CompileContext,
    CompileResult,
    SceneCompileInput,
    ManuscriptCompileInput,
    CompileStepKind,
    CompileStepDefinition,
    Scene,
    Story
} from '../types';
import { builtInSteps } from './steps';

/**
 * Status callback for compile progress updates
 */
export interface CompileStatus {
    kind: 'started' | 'step' | 'completed' | 'error';
    stepIndex?: number;
    totalSteps?: number;
    stepName?: string;
    message?: string;
}

/**
 * Main compile engine that orchestrates the compilation pipeline
 */
export class CompileEngine {
    private app: App;
    private plugin: StorytellerSuitePlugin;
    private stepRegistry: Map<string, CompileStepDefinition>;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        this.app = app;
        this.plugin = plugin;
        this.stepRegistry = new Map();
        
        // Register built-in steps
        this.registerBuiltInSteps();
    }

    /**
     * Register all built-in compile steps
     */
    private registerBuiltInSteps(): void {
        for (const step of builtInSteps) {
            this.stepRegistry.set(step.id, step);
        }
    }

    /**
     * Register a custom/user compile step
     */
    public registerStep(step: CompileStepDefinition): void {
        this.stepRegistry.set(step.id, step);
    }

    /**
     * Get all registered step definitions
     */
    public getAvailableSteps(): CompileStepDefinition[] {
        return Array.from(this.stepRegistry.values());
    }

    /**
     * Get a step definition by ID
     */
    public getStepDefinition(stepType: string): CompileStepDefinition | undefined {
        return this.stepRegistry.get(stepType);
    }

    /**
     * Compile a draft using the specified workflow
     */
    public async compile(
        draft: StoryDraft,
        workflow: CompileWorkflow,
        statusCallback?: (status: CompileStatus) => void
    ): Promise<CompileResult> {
        const startTime = Date.now();
        
        try {
            statusCallback?.({ kind: 'started', message: 'Starting compilation...' });

            // Get the story
            const story = this.plugin.getActiveStory();
            if (!story) {
                throw new Error('No active story selected');
            }

            // Load all scenes in order
            const scenes = await this.loadScenesInOrder(draft);
            if (scenes.length === 0) {
                throw new Error('No scenes found in draft');
            }

            // Build initial scene inputs
            let sceneInputs: SceneCompileInput[] = await this.buildSceneInputs(scenes, draft);
            let manuscriptInput: ManuscriptCompileInput | null = null;

            // Determine step kinds based on workflow order
            const stepKinds = this.calculateStepKinds(workflow.steps);

            // Process each enabled step
            const enabledSteps = workflow.steps.filter(s => s.enabled);
            for (let i = 0; i < enabledSteps.length; i++) {
                const stepConfig = enabledSteps[i];
                const stepDef = this.stepRegistry.get(stepConfig.stepType);
                
                if (!stepDef) {
                    console.warn(`[Compile] Unknown step type: ${stepConfig.stepType}`);
                    continue;
                }

                const kind = stepKinds.get(stepConfig.id) || 'scene';
                
                statusCallback?.({
                    kind: 'step',
                    stepIndex: i,
                    totalSteps: enabledSteps.length,
                    stepName: stepDef.name,
                    message: `Running: ${stepDef.name}`
                });

                // Build context for this step
                const context: CompileContext = {
                    kind,
                    optionValues: stepConfig.options,
                    projectPath: this.plugin.getEntityFolder('scene'),
                    draft,
                    story,
                    app: this.app
                };

                // Execute step based on kind
                if (kind === 'scene' && sceneInputs.length > 0) {
                    sceneInputs = await stepDef.compile(sceneInputs, context) as SceneCompileInput[];
                } else if (kind === 'join' && sceneInputs.length > 0) {
                    manuscriptInput = await stepDef.compile(sceneInputs, context) as ManuscriptCompileInput;
                    sceneInputs = []; // Clear scenes after join
                } else if (kind === 'manuscript' && manuscriptInput) {
                    manuscriptInput = await stepDef.compile(manuscriptInput, context) as ManuscriptCompileInput;
                }
            }

            // Calculate final statistics
            const finalContent = manuscriptInput?.contents || sceneInputs.map(s => s.contents).join('\n\n');
            const wordCount = this.countWords(finalContent);
            const charCount = finalContent.length;

            const result: CompileResult = {
                success: true,
                manuscript: finalContent,
                stats: {
                    sceneCount: scenes.length,
                    wordCount,
                    characterCount: charCount,
                    compileDuration: Date.now() - startTime
                }
            };

            statusCallback?.({
                kind: 'completed',
                message: `Compilation complete: ${wordCount} words`
            });

            return result;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            statusCallback?.({
                kind: 'error',
                message: errorMessage
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Load scenes in the order specified by the draft
     */
    private async loadScenesInOrder(draft: StoryDraft): Promise<Scene[]> {
        const allScenes = await this.plugin.listScenes();
        const sceneMap = new Map<string, Scene>();
        
        // Build lookup map by ID and name
        for (const scene of allScenes) {
            if (scene.id) sceneMap.set(scene.id, scene);
            sceneMap.set(scene.name, scene);
        }

        // Return scenes in draft order, filtered by includeInCompile
        const orderedScenes: Scene[] = [];
        for (const ref of draft.sceneOrder) {
            if (!ref.includeInCompile) continue;
            
            const scene = sceneMap.get(ref.sceneId);
            if (scene) {
                orderedScenes.push(scene);
            }
        }

        return orderedScenes;
    }

    /**
     * Build scene inputs from loaded scenes
     */
    private async buildSceneInputs(scenes: Scene[], draft: StoryDraft): Promise<SceneCompileInput[]> {
        const inputs: SceneCompileInput[] = [];
        
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let contents = '';

            // Read scene content from file if available
            if (scene.filePath) {
                const file = this.app.vault.getAbstractFileByPath(scene.filePath);
                if (file instanceof TFile) {
                    contents = await this.app.vault.read(file);
                }
            } else if (scene.content) {
                contents = scene.content;
            }

            // Find the scene reference for indent info
            const sceneRef = draft.sceneOrder.find(r => 
                r.sceneId === scene.id || r.sceneId === scene.name
            );
            const indentLevel = sceneRef?.indent || 0;

            inputs.push({
                path: scene.filePath || '',
                name: scene.name,
                contents,
                indentLevel,
                index: i,
                chapterName: scene.chapterName,
                sceneNumber: this.calculateSceneNumber(i, indentLevel, draft)
            });
        }

        return inputs;
    }

    /**
     * Calculate scene numbers based on position and indentation
     */
    private calculateSceneNumber(index: number, indent: number, draft: StoryDraft): string {
        // Simple implementation - can be enhanced for nested numbering
        const numbers: number[] = [];
        let currentLevel = 0;
        let counters: number[] = [0];

        for (let i = 0; i <= index; i++) {
            const ref = draft.sceneOrder[i];
            if (!ref || !ref.includeInCompile) continue;

            const refIndent = ref.indent;
            
            if (refIndent > currentLevel) {
                // Going deeper
                counters.push(1);
            } else if (refIndent < currentLevel) {
                // Going up
                while (counters.length > refIndent + 1) {
                    counters.pop();
                }
                counters[counters.length - 1]++;
            } else {
                // Same level
                counters[counters.length - 1]++;
            }
            
            currentLevel = refIndent;
            
            if (i === index) {
                return counters.join('.');
            }
        }

        return String(index + 1);
    }

    /**
     * Calculate the kind (scene/join/manuscript) for each step
     */
    private calculateStepKinds(steps: CompileStepConfig[]): Map<string, CompileStepKind> {
        const kinds = new Map<string, CompileStepKind>();
        let hasJoined = false;

        for (const step of steps) {
            if (!step.enabled) continue;

            const def = this.stepRegistry.get(step.stepType);
            if (!def) continue;

            if (def.availableKinds.includes('join')) {
                kinds.set(step.id, 'join');
                hasJoined = true;
            } else if (hasJoined && def.availableKinds.includes('manuscript')) {
                kinds.set(step.id, 'manuscript');
            } else if (!hasJoined && def.availableKinds.includes('scene')) {
                kinds.set(step.id, 'scene');
            } else if (def.availableKinds.includes('manuscript')) {
                // Fallback for manuscript-only steps before join
                kinds.set(step.id, 'manuscript');
            } else {
                kinds.set(step.id, def.availableKinds[0]);
            }
        }

        return kinds;
    }

    /**
     * Count words in text
     */
    private countWords(text: string): number {
        if (!text) return 0;
        // Remove markdown syntax and count words
        const cleaned = text
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]+`/g, '') // Remove inline code
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
            .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1') // Convert wikilinks to text
            .replace(/[#*_~`]/g, '') // Remove markdown symbols
            .replace(/---+/g, '') // Remove horizontal rules
            .trim();
        
        if (!cleaned) return 0;
        return cleaned.split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Create default workflow
     */
    public createDefaultWorkflow(): CompileWorkflow {
        return {
            id: 'default-workflow',
            name: 'Default Workflow',
            description: 'Standard manuscript compilation with formatting',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'prepend-scene-title',
                    enabled: true,
                    options: {
                        format: '## $1',
                        separator: '\n\n'
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'concatenate',
                    enabled: true,
                    options: {
                        separator: '\n\n---\n\n'
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: 'manuscript.md',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Get all preset workflows for common export formats
     */
    public getPresetWorkflows(): CompileWorkflow[] {
        return [
            this.createDefaultWorkflow(),
            this.createChapterOnlyWorkflow(),
            this.createNovelSubmissionWorkflow(),
            this.createBeatSheetWorkflow(),
            this.createCleanProseWorkflow(),
            this.createPlainTextWorkflow(),
            this.createHtmlExportWorkflow()
        ];
    }

    /**
     * Create chapter-only workflow - exports with just chapter headers and prose
     * Perfect for: Chapter number → Chapter name → Chapter content
     */
    public createChapterOnlyWorkflow(): CompileWorkflow {
        return {
            id: 'chapter-only-workflow',
            name: 'Chapter Only',
            description: 'Exports with chapter headers only - no scene titles. Format: Chapter Number, Chapter Name, Content',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'clean-content',
                    enabled: true,
                    options: {
                        removeCallouts: true,
                        removeCodeBlocks: true,
                        removeTags: true,
                        removeBlockIds: true,
                        normalizeWhitespace: true
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true,
                        removeExternalLinks: false
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: '# Chapter $number: $name',
                        numberStyle: 'arabic',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n---\n\n',
                        includeUnassigned: false
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: '$1-chapters.md',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Create novel submission workflow - clean, professional format
     * Extracts ONLY the Content section from scenes, removing Beats/Beat Sheet/Notes
     * Result: Chapter Number → Chapter Name → Scene Content (like a real book)
     */
    public createNovelSubmissionWorkflow(): CompileWorkflow {
        return {
            id: 'novel-submission-workflow',
            name: 'Novel (Book Format)',
            description: 'Clean book format: extracts only Content sections, organized by chapter. Removes Beats, Beat Sheet, and notes.',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'extract-content-section',
                    enabled: true,
                    options: {
                        contentHeaders: 'Content',
                        excludeHeaders: 'Beats,Beat Sheet,Notes,Outline,Summary,Synopsis,Research',
                        headerLevel: 2,
                        fallbackToAll: true
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'clean-content',
                    enabled: true,
                    options: {
                        removeCallouts: true,
                        removeCodeBlocks: true,
                        removeTags: true,
                        removeBlockIds: true,
                        normalizeWhitespace: true
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true,
                        removeExternalLinks: true
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'remove-comments',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-6',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: '# Chapter $number: $name',
                        numberStyle: 'arabic',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n---\n\n',
                        includeUnassigned: false
                    }
                },
                {
                    id: 'step-7',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: '$1-novel.md',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Create beat sheet workflow - compiles all beat sheets and story beats
     * Great for reviewing story structure and planning
     */
    public createBeatSheetWorkflow(): CompileWorkflow {
        return {
            id: 'beat-sheet-workflow',
            name: 'Beat Sheet / Outline',
            description: 'Compiles Beat Sheet and Beats sections from all scenes, organized by chapter. Perfect for reviewing story structure.',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'extract-beat-sheet',
                    enabled: true,
                    options: {
                        beatHeaders: 'Beat Sheet,Beats,Outline,Story Beats',
                        headerLevel: 2,
                        includeSceneName: true,
                        sceneNameFormat: '### $name',
                        emptyBeatText: ''
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true,
                        removeExternalLinks: false
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: '## Chapter $number: $name',
                        numberStyle: 'arabic',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n---\n\n',
                        includeUnassigned: true,
                        unassignedLabel: '## Unassigned Scenes'
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'add-title-page',
                    enabled: true,
                    options: {
                        format: '# $title - Beat Sheet\n\n*Story outline compiled on $date*\n\n---\n\n',
                        includeWordCount: false
                    }
                },
                {
                    id: 'step-6',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: '$1-beats.md',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Create clean prose workflow - minimal formatting, just prose with chapter headers
     */
    public createCleanProseWorkflow(): CompileWorkflow {
        return {
            id: 'clean-prose-workflow',
            name: 'Clean Prose',
            description: 'Minimal formatting - chapter headers and clean prose text only',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'clean-content',
                    enabled: true,
                    options: {
                        removeCallouts: true,
                        removeCodeBlocks: true,
                        removeTags: true,
                        removeBlockIds: true,
                        normalizeWhitespace: true
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'remove-comments',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-5',
                    stepType: 'remove-strikethroughs',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-6',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: '# $name',
                        numberStyle: 'none',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n---\n\n',
                        includeUnassigned: true,
                        unassignedLabel: '# Extras'
                    }
                },
                {
                    id: 'step-7',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: '$1-clean.md',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Create plain text workflow - no markdown, just text
     */
    public createPlainTextWorkflow(): CompileWorkflow {
        return {
            id: 'plain-text-workflow',
            name: 'Plain Text',
            description: 'Exports as plain text with no markdown formatting',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'clean-content',
                    enabled: true,
                    options: {
                        removeCallouts: true,
                        removeCodeBlocks: true,
                        removeTags: true,
                        removeBlockIds: true,
                        normalizeWhitespace: true
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true,
                        removeExternalLinks: true
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: 'CHAPTER $number: $name',
                        numberStyle: 'arabic',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n\n',
                        includeUnassigned: true
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'convert-to-plain-text',
                    enabled: true,
                    options: {
                        preserveHeaders: true,
                        preserveParagraphs: true,
                        indentParagraphs: true
                    }
                },
                {
                    id: 'step-6',
                    stepType: 'export-markdown',
                    enabled: true,
                    options: {
                        outputPath: '$1.txt',
                        openAfterExport: true
                    }
                }
            ]
        };
    }

    /**
     * Create HTML export workflow
     */
    public createHtmlExportWorkflow(): CompileWorkflow {
        return {
            id: 'html-export-workflow',
            name: 'HTML Export',
            description: 'Exports as a styled HTML document for web viewing or conversion',
            steps: [
                {
                    id: 'step-1',
                    stepType: 'strip-frontmatter',
                    enabled: true,
                    options: {}
                },
                {
                    id: 'step-2',
                    stepType: 'clean-content',
                    enabled: true,
                    options: {
                        removeCallouts: true,
                        removeCodeBlocks: false,
                        removeTags: true,
                        removeBlockIds: true,
                        normalizeWhitespace: true
                    }
                },
                {
                    id: 'step-3',
                    stepType: 'remove-wikilinks',
                    enabled: true,
                    options: {
                        keepLinkText: true
                    }
                },
                {
                    id: 'step-4',
                    stepType: 'concatenate-by-chapter',
                    enabled: true,
                    options: {
                        chapterFormat: '# Chapter $number: $name',
                        numberStyle: 'arabic',
                        sceneSeparator: '\n\n',
                        chapterSeparator: '\n\n---\n\n',
                        includeUnassigned: true
                    }
                },
                {
                    id: 'step-5',
                    stepType: 'add-title-page',
                    enabled: true,
                    options: {
                        format: '# $title\n\n*Compiled on $date*\n\n---\n\n',
                        includeWordCount: true
                    }
                },
                {
                    id: 'step-6',
                    stepType: 'export-html',
                    enabled: true,
                    options: {
                        outputPath: '$1.html',
                        includeStyles: true,
                        wrapInDocument: true
                    }
                }
            ]
        };
    }

    /**
     * Get workflow by ID
     */
    public getWorkflowById(workflowId: string): CompileWorkflow | undefined {
        const presets = this.getPresetWorkflows();
        return presets.find(w => w.id === workflowId);
    }
}
