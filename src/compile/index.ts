/**
 * Compile module exports
 * Provides manuscript compilation, scene ordering, and word tracking
 */

export { CompileEngine } from './CompileEngine';
export type { CompileStatus } from './CompileEngine';

export { SceneOrderManager } from './SceneOrderManager';
export type { OrderedScene, ChapterWithScenes, SceneDiscoveryResult } from './SceneOrderManager';

export { WordCountTracker } from './WordCountTracker';
export type { SessionStats, SceneWordCount } from './WordCountTracker';

export { builtInSteps } from './steps';
export {
    stripFrontmatterStep,
    prependSceneTitleStep,
    prependChapterTitleStep,
    removeWikilinksStep,
    removeCommentsStep,
    removeStrikethroughsStep,
    insertSeparatorStep,
    concatenateStep,
    concatenateByChapterStep,
    addTitlePageStep,
    stripSceneTitlesStep,
    cleanContentStep,
    applyTemplateStep,
    convertToPlainTextStep,
    normalizeSceneSeparatorsStep,
    exportMarkdownStep,
    exportHtmlStep,
    customRegexStep
} from './steps';
