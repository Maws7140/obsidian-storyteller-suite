/**
 * Type definitions for the Story Import feature
 * Phase 1: Core Import (Plain Text and Markdown)
 */

import { Chapter, Scene } from '../types';

/**
 * Supported import formats
 */
export type ImportFormat =
    | 'plaintext'
    | 'markdown'
    | 'docx'
    | 'json'
    | 'csv'
    | 'unknown';

/**
 * Draft handling strategies
 */
export type DraftStrategy =
    | 'separate-stories'
    | 'version-tags'
    | 'scene-status'
    | 'custom-metadata';

/**
 * Conflict resolution strategies
 */
export type ConflictResolution =
    | 'skip'
    | 'rename'
    | 'overwrite';

/**
 * Parsed chapter from document
 */
export interface ParsedChapter {
    /** Original title from document */
    title: string;

    /** Detected chapter number */
    number?: number;

    /** Chapter content */
    content: string;

    /** Word count */
    wordCount: number;

    /** Start line in source document */
    startLine?: number;

    /** End line in source document */
    endLine?: number;

    /** Detected scene breaks within chapter */
    scenes?: ParsedScene[];
}

/**
 * Parsed scene from document
 */
export interface ParsedScene {
    /** Scene title (may be auto-generated) */
    title?: string;

    /** Scene content */
    content: string;

    /** Word count */
    wordCount: number;
}

/**
 * Metadata extracted from document
 */
export interface DocumentMetadata {
    /** Document title (if detected) */
    title?: string;

    /** Author name (if detected) */
    author?: string;

    /** Total word count */
    totalWords: number;

    /** Number of chapters detected */
    chapterCount: number;

    /** Detection confidence (0-100) */
    confidence: number;

    /** Detection method used */
    detectionMethod: string;
}

/**
 * Complete parsed document structure
 */
export interface ParsedDocument {
    /** Document metadata */
    metadata: DocumentMetadata;

    /** Detected chapters */
    chapters: ParsedChapter[];

    /** Validation warnings */
    warnings: string[];

    /** Source format */
    format: ImportFormat;
}

/**
 * Chapter import configuration
 */
export interface ChapterImportConfig {
    /** Source title from parsed document */
    sourceTitle: string;

    /** Target name for created chapter */
    targetName: string;

    /** Target chapter number */
    targetNumber?: number;

    /** Content to import */
    content: string;

    /** Tags to apply */
    tags: string[];

    /** Whether to include this chapter in import */
    enabled: boolean;
}

/**
 * Complete import configuration
 */
export interface ImportConfiguration {
    // Source
    /** Source file name */
    sourceFileName: string;

    /** Detected format */
    format: ImportFormat;

    /** Parsed document */
    parsedDocument: ParsedDocument;

    // Target
    /** Target story name (for new story) */
    targetStoryName?: string;

    /** Target story ID (for existing story) */
    targetStoryId?: string;

    /** Create new story or add to existing */
    createNewStory: boolean;

    // Chapters
    /** Chapter configurations */
    chapters: ChapterImportConfig[];

    // Draft handling (Phase 1: only separate-stories supported)
    /** Draft strategy */
    draftStrategy: DraftStrategy;

    /** Draft version name (e.g., "Rough Draft", "Revised") */
    draftVersion?: string;

    // Import options
    /** How to handle conflicts */
    conflictResolution: ConflictResolution;

    /** Preserve original formatting */
    preserveFormatting: boolean;

    // Metadata
    /** When import was configured */
    configuredAt: string;
}

/**
 * Import execution result
 */
export interface ImportResult {
    /** Whether import succeeded */
    success: boolean;

    /** Error message if failed */
    error?: string;

    // Created entities
    /** ID of story created or used */
    storyId?: string;

    /** Chapters that were created */
    chaptersCreated: Chapter[];

    /** Scenes that were created */
    scenesCreated: Scene[];

    // Statistics
    stats: {
        /** Total chapters imported */
        totalChapters: number;

        /** Total scenes imported */
        totalScenes: number;

        /** Total words imported */
        totalWords: number;

        /** Chapters skipped due to conflicts */
        chaptersSkipped: number;

        /** Chapters renamed due to conflicts */
        chaptersRenamed: number;
    };

    /** Warnings encountered during import */
    warnings: string[];

    /** Chapters that were skipped */
    skippedChapters: string[];
}

/**
 * Import validation result
 */
export interface ImportValidation {
    /** Whether configuration is valid */
    isValid: boolean;

    /** Validation errors (blocking) */
    errors: string[];

    /** Validation warnings (non-blocking) */
    warnings: string[];
}

/**
 * Chapter detection pattern
 */
export interface ChapterPattern {
    /** Pattern name */
    name: string;

    /** Regular expression for detection */
    regex: RegExp;

    /** Confidence weight (0-100) */
    confidence: number;

    /** Extract chapter number from match */
    extractNumber: (match: RegExpMatchArray) => number | undefined;

    /** Extract chapter title from match */
    extractTitle: (match: RegExpMatchArray) => string;
}

/**
 * Document parser interface
 */
export interface DocumentParser {
    /** Parser name */
    name: string;

    /** Supported format */
    format: ImportFormat;

    /** Check if this parser can handle the file */
    canParse(content: string, fileName: string): boolean;

    /** Parse the document */
    parse(content: string, fileName: string): ParsedDocument;
}
