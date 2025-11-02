// Story Board Generator - Creates Obsidian Canvas files from scenes
// Provides visual arrangement of scenes organized by chapters

import { Scene, Chapter } from '../types';

/**
 * Canvas node representing an element on the canvas
 */
export interface CanvasNode {
    id: string;
    type: 'file' | 'text';
    file?: string;
    text?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
}

/**
 * Canvas edge representing a connection between nodes
 */
export interface CanvasEdge {
    id: string;
    fromNode: string;
    fromSide: 'top' | 'bottom' | 'left' | 'right';
    toNode: string;
    toSide: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Complete canvas data structure (Obsidian .canvas format)
 */
export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
}

/**
 * Layout type for organizing scenes on the canvas
 */
export type StoryBoardLayout = 'chapters' | 'timeline' | 'status';

/**
 * Options for customizing the story board appearance
 */
export interface StoryBoardOptions {
    layout: StoryBoardLayout;
    cardWidth?: number;
    cardHeight?: number;
    colorBy?: 'status' | 'chapter' | 'none';
    showChapterHeaders?: boolean;
    showEdges?: boolean;
}

/**
 * Story Board Generator
 * Creates Obsidian Canvas files with scenes arranged in various layouts
 */
export class StoryBoardGenerator {
    // Layout constants
    private readonly CARD_WIDTH: number;
    private readonly CARD_HEIGHT: number;
    private readonly HORIZONTAL_GAP = 80;
    private readonly VERTICAL_GAP = 40;
    private readonly CHAPTER_HEADER_HEIGHT = 80;
    private readonly COLUMN_OFFSET = 50;

    // Color schemes
    private readonly STATUS_COLORS: Record<string, string> = {
        'Draft': '4',      // Gray
        'Outline': '5',    // Purple
        'WIP': '3',        // Yellow
        'Revised': '2',    // Orange
        'Final': '1'       // Red
    };

    private readonly CHAPTER_COLORS = ['1', '2', '3', '4', '5', '6'];

    constructor(options?: Partial<StoryBoardOptions>) {
        this.CARD_WIDTH = options?.cardWidth || 400;
        this.CARD_HEIGHT = options?.cardHeight || 300;
    }

    /**
     * Generate canvas data from scenes and chapters
     */
    generateCanvas(scenes: Scene[], chapters: Chapter[], options: StoryBoardOptions): CanvasData {
        switch (options.layout) {
            case 'chapters':
                return this.generateChapterLayout(scenes, chapters, options);
            case 'status':
                return this.generateStatusLayout(scenes, options);
            case 'timeline':
                return this.generateTimelineLayout(scenes, options);
            default:
                return this.generateChapterLayout(scenes, chapters, options);
        }
    }

    /**
     * Generate chapter-based column layout
     * Organizes scenes into vertical columns by chapter
     */
    private generateChapterLayout(scenes: Scene[], chapters: Chapter[], options: StoryBoardOptions): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // Sort chapters by number
        const sortedChapters = [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0));

        // Create a map of chapterId to column index
        const chapterIndexMap = new Map<string, number>();
        sortedChapters.forEach((chapter, index) => {
            chapterIndexMap.set(chapter.id!, index);
        });

        // Add column for unassigned scenes
        const unassignedColumnIndex = sortedChapters.length;

        // Group scenes by chapter
        const scenesByChapter = new Map<string, Scene[]>();
        const unassignedScenes: Scene[] = [];

        scenes.forEach(scene => {
            if (scene.chapterId && chapterIndexMap.has(scene.chapterId)) {
                const chapterId = scene.chapterId;
                if (!scenesByChapter.has(chapterId)) {
                    scenesByChapter.set(chapterId, []);
                }
                scenesByChapter.get(chapterId)!.push(scene);
            } else {
                unassignedScenes.push(scene);
            }
        });

        // Sort scenes within each chapter by priority
        scenesByChapter.forEach(chapterScenes => {
            chapterScenes.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        });
        unassignedScenes.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // Generate chapter header nodes and scene nodes
        sortedChapters.forEach((chapter, columnIndex) => {
            const x = this.COLUMN_OFFSET + columnIndex * (this.CARD_WIDTH + this.HORIZONTAL_GAP);

            // Add chapter header if enabled
            if (options.showChapterHeaders !== false) {
                const headerNode: CanvasNode = {
                    id: `chapter-header-${chapter.id}`,
                    type: 'text',
                    text: `# ${chapter.name}`,
                    x: x,
                    y: 0,
                    width: this.CARD_WIDTH,
                    height: this.CHAPTER_HEADER_HEIGHT,
                    color: this.getChapterColor(columnIndex, options)
                };
                nodes.push(headerNode);
            }

            // Add scene nodes for this chapter
            const chapterScenes = scenesByChapter.get(chapter.id!) || [];
            chapterScenes.forEach((scene, sceneIndex) => {
                const y = (options.showChapterHeaders !== false ? this.CHAPTER_HEADER_HEIGHT + this.VERTICAL_GAP : 0)
                    + sceneIndex * (this.CARD_HEIGHT + this.VERTICAL_GAP);

                const sceneNode: CanvasNode = {
                    id: `scene-${scene.id || scene.name}`,
                    type: 'file',
                    file: scene.filePath!,
                    x: x,
                    y: y,
                    width: this.CARD_WIDTH,
                    height: this.CARD_HEIGHT,
                    color: this.getSceneColor(scene, columnIndex, options)
                };
                nodes.push(sceneNode);

                // Add edge to next scene if showEdges is enabled
                if (options.showEdges && sceneIndex < chapterScenes.length - 1) {
                    const nextScene = chapterScenes[sceneIndex + 1];
                    edges.push({
                        id: `edge-${scene.id}-${nextScene.id}`,
                        fromNode: sceneNode.id,
                        fromSide: 'bottom',
                        toNode: `scene-${nextScene.id || nextScene.name}`,
                        toSide: 'top'
                    });
                }
            });
        });

        // Add unassigned scenes column
        if (unassignedScenes.length > 0) {
            const x = this.COLUMN_OFFSET + unassignedColumnIndex * (this.CARD_WIDTH + this.HORIZONTAL_GAP);

            // Add header for unassigned scenes
            if (options.showChapterHeaders !== false) {
                const headerNode: CanvasNode = {
                    id: 'chapter-header-unassigned',
                    type: 'text',
                    text: '# Unassigned Scenes',
                    x: x,
                    y: 0,
                    width: this.CARD_WIDTH,
                    height: this.CHAPTER_HEADER_HEIGHT,
                    color: '4' // Gray
                };
                nodes.push(headerNode);
            }

            // Add unassigned scene nodes
            unassignedScenes.forEach((scene, sceneIndex) => {
                const y = (options.showChapterHeaders !== false ? this.CHAPTER_HEADER_HEIGHT + this.VERTICAL_GAP : 0)
                    + sceneIndex * (this.CARD_HEIGHT + this.VERTICAL_GAP);

                const sceneNode: CanvasNode = {
                    id: `scene-${scene.id || scene.name}`,
                    type: 'file',
                    file: scene.filePath!,
                    x: x,
                    y: y,
                    width: this.CARD_WIDTH,
                    height: this.CARD_HEIGHT,
                    color: this.getSceneColor(scene, unassignedColumnIndex, options)
                };
                nodes.push(sceneNode);
            });
        }

        return { nodes, edges };
    }

    /**
     * Generate status-based kanban layout
     * Organizes scenes into columns by status (Draft, WIP, Revised, Final)
     */
    private generateStatusLayout(scenes: Scene[], options: StoryBoardOptions): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        const statusColumns = ['Draft', 'Outline', 'WIP', 'Revised', 'Final'];
        const scenesByStatus = new Map<string, Scene[]>();

        // Group scenes by status
        scenes.forEach(scene => {
            const status = scene.status || 'Draft';
            if (!scenesByStatus.has(status)) {
                scenesByStatus.set(status, []);
            }
            scenesByStatus.get(status)!.push(scene);
        });

        // Sort scenes within each status by priority
        scenesByStatus.forEach(statusScenes => {
            statusScenes.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        });

        // Generate status column headers and scene nodes
        statusColumns.forEach((status, columnIndex) => {
            const x = this.COLUMN_OFFSET + columnIndex * (this.CARD_WIDTH + this.HORIZONTAL_GAP);

            // Add status header
            if (options.showChapterHeaders !== false) {
                const headerNode: CanvasNode = {
                    id: `status-header-${status}`,
                    type: 'text',
                    text: `# ${status}`,
                    x: x,
                    y: 0,
                    width: this.CARD_WIDTH,
                    height: this.CHAPTER_HEADER_HEIGHT,
                    color: this.STATUS_COLORS[status] || '4'
                };
                nodes.push(headerNode);
            }

            // Add scene nodes for this status
            const statusScenes = scenesByStatus.get(status) || [];
            statusScenes.forEach((scene, sceneIndex) => {
                const y = (options.showChapterHeaders !== false ? this.CHAPTER_HEADER_HEIGHT + this.VERTICAL_GAP : 0)
                    + sceneIndex * (this.CARD_HEIGHT + this.VERTICAL_GAP);

                const sceneNode: CanvasNode = {
                    id: `scene-${scene.id || scene.name}`,
                    type: 'file',
                    file: scene.filePath!,
                    x: x,
                    y: y,
                    width: this.CARD_WIDTH,
                    height: this.CARD_HEIGHT,
                    color: this.STATUS_COLORS[status] || '4'
                };
                nodes.push(sceneNode);
            });
        });

        return { nodes, edges };
    }

    /**
     * Generate timeline-based layout
     * Arranges scenes horizontally based on priority/order
     */
    private generateTimelineLayout(scenes: Scene[], options: StoryBoardOptions): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // Sort scenes by priority
        const sortedScenes = [...scenes].sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // Arrange scenes horizontally
        sortedScenes.forEach((scene, index) => {
            const x = this.COLUMN_OFFSET + index * (this.CARD_WIDTH + this.HORIZONTAL_GAP);
            const y = 100;

            const sceneNode: CanvasNode = {
                id: `scene-${scene.id || scene.name}`,
                type: 'file',
                file: scene.filePath!,
                x: x,
                y: y,
                width: this.CARD_WIDTH,
                height: this.CARD_HEIGHT,
                color: this.getSceneColor(scene, index, options)
            };
            nodes.push(sceneNode);

            // Add edge to next scene if showEdges is enabled
            if (options.showEdges && index < sortedScenes.length - 1) {
                const nextScene = sortedScenes[index + 1];
                edges.push({
                    id: `edge-${scene.id}-${nextScene.id}`,
                    fromNode: sceneNode.id,
                    fromSide: 'right',
                    toNode: `scene-${nextScene.id || nextScene.name}`,
                    toSide: 'left'
                });
            }
        });

        return { nodes, edges };
    }

    /**
     * Get color for a scene based on colorBy option
     */
    private getSceneColor(scene: Scene, columnIndex: number, options: StoryBoardOptions): string | undefined {
        if (options.colorBy === 'none') {
            return undefined;
        }

        if (options.colorBy === 'status') {
            return this.STATUS_COLORS[scene.status || 'Draft'] || '4';
        }

        if (options.colorBy === 'chapter') {
            return this.CHAPTER_COLORS[columnIndex % this.CHAPTER_COLORS.length];
        }

        // Default: color by status
        return this.STATUS_COLORS[scene.status || 'Draft'] || '4';
    }

    /**
     * Get color for a chapter header
     */
    private getChapterColor(columnIndex: number, options: StoryBoardOptions): string {
        if (options.colorBy === 'chapter') {
            return this.CHAPTER_COLORS[columnIndex % this.CHAPTER_COLORS.length];
        }
        return '2'; // Default orange for headers
    }
}
