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
     * Check if two nodes overlap
     */
    private nodesOverlap(node1: CanvasNode, node2: CanvasNode, padding: number = 20): boolean {
        const left1 = node1.x - padding;
        const right1 = node1.x + node1.width + padding;
        const top1 = node1.y - padding;
        const bottom1 = node1.y + node1.height + padding;

        const left2 = node2.x - padding;
        const right2 = node2.x + node2.width + padding;
        const top2 = node2.y - padding;
        const bottom2 = node2.y + node2.height + padding;

        return !(right1 < left2 || left1 > right2 || bottom1 < top2 || top1 > bottom2);
    }

    /**
     * Find a non-overlapping position for a new node
     * Tries positions in a spiral pattern around the initial position
     */
    private findNonOverlappingPosition(
        node: CanvasNode,
        existingNodes: CanvasNode[],
        maxAttempts: number = 100
    ): { x: number; y: number } {
        // Start with the node's current position
        let testNode = { ...node };

        // Check if current position is already fine
        const hasOverlap = existingNodes.some(existing => this.nodesOverlap(testNode, existing));
        if (!hasOverlap) {
            return { x: node.x, y: node.y };
        }

        // Try positions in a spiral pattern
        const step = 100; // Distance to move in each direction
        let radius = 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Try positions in a square spiral around the original position
            for (let angle = 0; angle < 360; angle += 45) {
                const offsetX = Math.cos((angle * Math.PI) / 180) * radius * step;
                const offsetY = Math.sin((angle * Math.PI) / 180) * radius * step;

                testNode.x = node.x + offsetX;
                testNode.y = node.y + offsetY;

                const overlaps = existingNodes.some(existing => this.nodesOverlap(testNode, existing));
                if (!overlaps) {
                    return { x: testNode.x, y: testNode.y };
                }
            }

            radius++;
        }

        // If we couldn't find a non-overlapping position, place it far to the right
        const maxX = existingNodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
        return { x: maxX + this.HORIZONTAL_GAP, y: node.y };    }

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

    /**
     * Detect if a scene should be repositioned due to data changes
     * - Chapter layout: scene's chapter changed (different column)
     * - Status layout: scene's status changed (different column)
     * - Timeline layout: scene's date changed (different position)
     */
    private shouldReposition(
        existingNode: CanvasNode,
        freshNode: CanvasNode,
        layout: StoryBoardLayout
    ): boolean {
        const columnWidth = this.CARD_WIDTH + this.HORIZONTAL_GAP;
        const xDiff = Math.abs(existingNode.x - freshNode.x);
        const yDiff = Math.abs(existingNode.y - freshNode.y);

        switch (layout) {
            case 'chapters':
            case 'status':
                // For column-based layouts, check if X position changed significantly
                // This indicates the scene moved to a different column (chapter or status)
                return xDiff > columnWidth / 2;

            case 'timeline':
                // For timeline layout, check both X (timeline position) and Y (lane)
                // Reposit if either changed significantly
                const significantXChange = xDiff > 100; // Date changed
                const significantYChange = yDiff > 100; // Lane changed
                return significantXChange || significantYChange;

            default:
                return false;
        }
    }

    /**
     * Update existing canvas data with new scenes
     * Preserves manual user edits while adding/removing/updating scenes
     * Automatically repositions scenes when their organizing data changes:
     * - Chapter layout: moves scenes to new chapter column when chapterId changes
     * - Status layout: moves scenes to new status column when status changes
     * - Timeline layout: repositions scenes when dates change
     */
    updateCanvas(
        existingCanvas: CanvasData,
        scenes: Scene[],
        chapters: Chapter[],
        options: StoryBoardOptions
    ): CanvasData {
        // Generate fresh canvas data
        const freshCanvas = this.generateCanvas(scenes, chapters, options);

        // Create maps for quick lookup
        const existingNodesMap = new Map<string, CanvasNode>();
        const freshNodesMap = new Map<string, CanvasNode>();
        const sceneFilePaths = new Set<string>();

        // Map existing nodes by their file path (for scene nodes) or id (for headers)
        existingCanvas.nodes.forEach(node => {
            if (node.type === 'file' && node.file) {
                existingNodesMap.set(node.file, node);
                sceneFilePaths.add(node.file);
            } else if (node.type === 'text') {
                existingNodesMap.set(node.id, node);
            }
        });

        // Map fresh nodes for comparison
        freshCanvas.nodes.forEach(node => {
            if (node.type === 'file' && node.file) {
                freshNodesMap.set(node.file, node);
            }
        });

        // Create updated nodes list
        const updatedNodes: CanvasNode[] = [];

        // Process fresh nodes
        freshCanvas.nodes.forEach(freshNode => {
            if (freshNode.type === 'file' && freshNode.file) {
                // Scene node
                const existingNode = existingNodesMap.get(freshNode.file);
                if (existingNode) {
                    // Scene exists - check if it should be repositioned due to data changes
                    const needsReposition = this.shouldReposition(existingNode, freshNode, options.layout);

                    if (needsReposition) {
                        // Data changed (chapter/status/date) - reposition but avoid overlaps
                        const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                        updatedNodes.push({
                            ...freshNode,
                            x: newPosition.x,
                            y: newPosition.y,
                            color: freshNode.color,
                            width: freshNode.width,
                            height: freshNode.height
                        });
                    } else {
                        // Same chapter - preserve user's position but update color
                        updatedNodes.push({
                            ...existingNode,
                            color: freshNode.color, // Update color in case status changed
                            width: freshNode.width, // Update dimensions in case settings changed
                            height: freshNode.height
                        });
                    }
                    sceneFilePaths.delete(freshNode.file); // Mark as processed
                } else {
                    // New scene - find non-overlapping position
                    const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                    updatedNodes.push({
                        ...freshNode,
                        x: newPosition.x,
                        y: newPosition.y
                    });
                }
            } else if (freshNode.type === 'text') {
                // Chapter header
                const existingHeader = existingNodesMap.get(freshNode.id);
                if (existingHeader) {
                    // Header exists - merge updated properties while preserving position
                    const updatedHeader = {
                        ...freshNode,
                        x: existingHeader.x,
                        y: existingHeader.y
                    };
                    updatedNodes.push(updatedHeader);
                } else {
                    // New header - find non-overlapping position
                    const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                    updatedNodes.push({
                        ...freshNode,
                        x: newPosition.x,
                        y: newPosition.y
                    });
                }
            }
        });

        // Note: Deleted scenes (remaining in sceneFilePaths) are automatically removed
        // by not being included in updatedNodes

        return {
            nodes: updatedNodes,
            edges: freshCanvas.edges // Always regenerate edges based on current scene order
        };
    }

    /**
     * Merge existing canvas with fresh data, intelligently preserving manual edits
     * This is a more advanced update that:
     * 1. Detects when scenes need repositioning due to data changes (chapter/status/date)
     * 2. Distinguishes between manual positioning and automatic layout changes
     * 3. Repositions scenes when organizing data changes, even if manually positioned
     * 4. Preserves manual positioning when data hasn't changed
     */
    smartUpdateCanvas(
        existingCanvas: CanvasData,
        scenes: Scene[],
        chapters: Chapter[],
        options: StoryBoardOptions
    ): CanvasData {
        // Generate fresh canvas for reference
        const freshCanvas = this.generateCanvas(scenes, chapters, options);

        // Build maps for comparison
        const existingSceneNodes = new Map<string, CanvasNode>();
        const freshSceneNodes = new Map<string, CanvasNode>();
        const existingHeaderNodes = new Map<string, CanvasNode>();
        const freshHeaderNodes = new Map<string, CanvasNode>();

        existingCanvas.nodes.forEach(node => {
            if (node.type === 'file' && node.file) {
                existingSceneNodes.set(node.file, node);
            } else if (node.type === 'text') {
                existingHeaderNodes.set(node.id, node);
            }
        });

        freshCanvas.nodes.forEach(node => {
            if (node.type === 'file' && node.file) {
                freshSceneNodes.set(node.file, node);
            } else if (node.type === 'text') {
                freshHeaderNodes.set(node.id, node);
            }
        });

        // Detect which nodes were manually moved vs need repositioning
        const manuallyMovedNodes = new Set<string>();
        const needsRepositioning = new Set<string>();

        existingSceneNodes.forEach((existingNode, filePath) => {
            const freshNode = freshSceneNodes.get(filePath);
            if (freshNode) {
                // First check if data changed requiring repositioning
                if (this.shouldReposition(existingNode, freshNode, options.layout)) {
                    needsRepositioning.add(filePath);
                } else {
                    // Check if position differs (manual move) only when data didn't change
                    const positionDiff = Math.abs(existingNode.x - freshNode.x) + Math.abs(existingNode.y - freshNode.y);
                    if (positionDiff > 20) {
                        manuallyMovedNodes.add(filePath);
                    }
                }
            }
        });

        // Build updated nodes list
        const updatedNodes: CanvasNode[] = [];
        const processedFiles = new Set<string>();

        // First, add nodes that need repositioning due to data changes
        needsRepositioning.forEach(filePath => {
            const freshNode = freshSceneNodes.get(filePath);
            if (freshNode) {
                const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                updatedNodes.push({
                    ...freshNode,
                    x: newPosition.x,
                    y: newPosition.y
                });
                processedFiles.add(filePath);
            }
        });

        // Second, add all manually positioned nodes (preserve their position)
        manuallyMovedNodes.forEach(filePath => {
            const existingNode = existingSceneNodes.get(filePath);
            const freshNode = freshSceneNodes.get(filePath);
            if (existingNode && freshNode) {
                updatedNodes.push({
                    ...existingNode,
                    color: freshNode.color, // Update color
                    width: freshNode.width,
                    height: freshNode.height
                });
                processedFiles.add(filePath);
            }
        });

        // Then add all other nodes from fresh canvas
        freshCanvas.nodes.forEach(freshNode => {
            if (freshNode.type === 'file' && freshNode.file) {
                if (!processedFiles.has(freshNode.file)) {
                    // Check if this is a new node or an existing auto-positioned node
                    const existingNode = existingSceneNodes.get(freshNode.file);
                    if (existingNode) {
                        // Existing auto-positioned node - use fresh position
                        updatedNodes.push(freshNode);
                    } else {
                        // New node - find non-overlapping position
                        const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                        updatedNodes.push({
                            ...freshNode,
                            x: newPosition.x,
                            y: newPosition.y
                        });
                    }
                    processedFiles.add(freshNode.file);
                }
            } else if (freshNode.type === 'text') {
                // Header node - check if it exists and can be preserved
                const existingHeader = existingHeaderNodes.get(freshNode.id);
                if (existingHeader) {
                    // Check if content and position are unchanged
                    const contentChanged = existingHeader.text !== freshNode.text || 
                                         existingHeader.color !== freshNode.color;
                    const positionChanged = Math.abs(existingHeader.x - freshNode.x) > 20 || 
                                          Math.abs(existingHeader.y - freshNode.y) > 20;
                    
                    if (!contentChanged && !positionChanged) {
                        // Header unchanged - preserve existing position
                        updatedNodes.push(existingHeader);
                    } else if (!positionChanged) {
                        // Content changed but position same - update content, keep position
                        updatedNodes.push({
                            ...freshNode,
                            x: existingHeader.x,
                            y: existingHeader.y
                        });
                    } else {
                        // Position changed or needs repositioning - find non-overlapping position
                        const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                        updatedNodes.push({
                            ...freshNode,
                            x: newPosition.x,
                            y: newPosition.y
                        });
                    }
                } else {
                    // New header - find non-overlapping position
                    const newPosition = this.findNonOverlappingPosition(freshNode, updatedNodes);
                    updatedNodes.push({
                        ...freshNode,
                        x: newPosition.x,
                        y: newPosition.y
                    });
                }
            }
        });

        return {
            nodes: updatedNodes,
            edges: freshCanvas.edges
        };
    }
}
