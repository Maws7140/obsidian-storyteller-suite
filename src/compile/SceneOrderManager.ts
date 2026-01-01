/**
 * SceneOrderManager - Manages scene ordering and indentation for drafts
 * Provides functionality similar to Longform's scene ordering system
 */

import { TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Scene, Story, StoryDraft, IndentedSceneRef, Chapter } from '../types';

/**
 * Represents a scene with its ordering metadata
 */
export interface OrderedScene {
    scene: Scene;
    index: number;
    indentLevel: number;
    chapterName?: string;
    chapter?: Chapter;
}

/**
 * Represents a chapter with its scenes for hierarchical display
 */
export interface ChapterWithScenes {
    chapter: Chapter;
    scenes: Scene[];
}

/**
 * Scene discovery result when syncing with existing files
 */
export interface SceneDiscoveryResult {
    added: Scene[];
    removed: string[];
    existing: Scene[];
}

/**
 * Manages scene ordering for manuscripts
 */
export class SceneOrderManager {
    private plugin: StorytellerSuitePlugin;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Get story drafts array (handles optional)
     */
    private getStoryDrafts(): StoryDraft[] {
        return this.plugin.settings.storyDrafts || [];
    }

    /**
     * Get the current active draft for a story
     */
    getActiveDraft(story: Story): StoryDraft | undefined {
        const storyDrafts = this.getStoryDrafts().filter(
            d => d.storyId === story.id
        );
        
        // First check for explicitly active draft
        const active = storyDrafts.find(
            d => d.id === this.plugin.settings.activeDraftId
        );
        if (active) return active;

        // Otherwise return the first draft for this story
        return storyDrafts[0];
    }

    /**
     * Get all drafts for a story
     */
    getDraftsForStory(storyId: string): StoryDraft[] {
        return this.getStoryDrafts().filter(d => d.storyId === storyId);
    }

    /**
     * Create a new draft for a story
     */
    async createDraft(story: Story, name: string, copyFromDraftId?: string): Promise<StoryDraft> {
        // Get existing drafts to calculate draft number
        const existingDrafts = this.getDraftsForStory(story.id);
        const maxDraftNumber = existingDrafts.reduce((max, d) => Math.max(max, d.draftNumber || 0), 0);

        const now = new Date().toISOString();
        const newDraft: StoryDraft = {
            id: this.generateId(),
            storyId: story.id,
            name,
            draftNumber: maxDraftNumber + 1,
            sceneOrder: [],
            created: now,
            modified: now
        };

        // Copy scene order from existing draft or create from chapters/scenes
        if (copyFromDraftId) {
            const sourceDraft = this.getStoryDrafts().find(d => d.id === copyFromDraftId);
            if (sourceDraft) {
                newDraft.sceneOrder = JSON.parse(JSON.stringify(sourceDraft.sceneOrder));
            }
        } else {
            // Build scene order from existing chapters and scenes
            newDraft.sceneOrder = await this.buildSceneOrderFromStory(story);
        }

        // Ensure storyDrafts array exists
        if (!this.plugin.settings.storyDrafts) {
            this.plugin.settings.storyDrafts = [];
        }
        
        this.plugin.settings.storyDrafts.push(newDraft);
        this.plugin.settings.activeDraftId = newDraft.id;
        await this.plugin.saveSettings();

        return newDraft;
    }

    /**
     * Build scene order from a story's chapters and scenes
     */
    private async buildSceneOrderFromStory(story: Story): Promise<IndentedSceneRef[]> {
        const order: IndentedSceneRef[] = [];
        
        // Get chapters and scenes from plugin methods
        const chapters = await this.plugin.listChapters();
        const scenes = await this.plugin.listScenes();

        // Sort chapters by number
        const sortedChapters = chapters.sort((a, b) => (a.number || 0) - (b.number || 0));

        for (const chapter of sortedChapters) {
            // Get scenes for this chapter, sorted by priority
            const chapterScenes = scenes
                .filter(s => s.chapterId === chapter.id)
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));

            for (const scene of chapterScenes) {
                if (scene.id) {
                    order.push({
                        sceneId: scene.id,
                        indent: 0,
                        includeInCompile: scene.includeInCompile !== false
                    });
                }
            }
        }

        // Add any scenes without chapters
        const unassignedScenes = scenes
            .filter(s => !s.chapterId)
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));

        for (const scene of unassignedScenes) {
            if (scene.id) {
                order.push({
                    sceneId: scene.id,
                    indent: 0,
                    includeInCompile: scene.includeInCompile !== false
                });
            }
        }

        return order;
    }

    /**
     * Get ordered scenes for a draft
     */
    async getOrderedScenes(draft: StoryDraft): Promise<OrderedScene[]> {
        const result: OrderedScene[] = [];
        const scenes = await this.plugin.listScenes();
        const chapters = await this.plugin.listChapters();

        for (let i = 0; i < draft.sceneOrder.length; i++) {
            const ref = draft.sceneOrder[i];
            const scene = scenes.find(s => s.id === ref.sceneId || s.name === ref.sceneId);
            
            if (scene) {
                const chapter = scene.chapterId 
                    ? chapters.find(c => c.id === scene.chapterId)
                    : undefined;

                result.push({
                    scene,
                    index: i,
                    indentLevel: ref.indent,
                    chapterName: chapter?.name,
                    chapter
                });
            }
        }

        return result;
    }

    /**
     * Get all chapters with their associated scenes
     */
    async getChaptersWithScenes(): Promise<ChapterWithScenes[]> {
        const chapters = await this.plugin.listChapters();
        const scenes = await this.plugin.listScenes();
        
        // Sort chapters by number
        const sortedChapters = chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
        
        const result: ChapterWithScenes[] = [];
        for (const chapter of sortedChapters) {
            const chapterScenes = scenes
                .filter(s => s.chapterId === chapter.id)
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));
            
            result.push({
                chapter,
                scenes: chapterScenes
            });
        }
        
        return result;
    }

    /**
     * Get all scenes organized by chapter (including unassigned)
     */
    async getAllScenesOrganized(): Promise<{ chaptered: ChapterWithScenes[], unassigned: Scene[] }> {
        const chapters = await this.plugin.listChapters();
        const scenes = await this.plugin.listScenes();
        
        // Sort chapters by number
        const sortedChapters = chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
        
        const chaptered: ChapterWithScenes[] = [];
        const assignedSceneIds = new Set<string>();
        
        for (const chapter of sortedChapters) {
            const chapterScenes = scenes
                .filter(s => s.chapterId === chapter.id)
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));
            
            chapterScenes.forEach(s => {
                if (s.id) assignedSceneIds.add(s.id);
            });
            
            chaptered.push({
                chapter,
                scenes: chapterScenes
            });
        }
        
        // Get unassigned scenes
        const unassigned = scenes
            .filter(s => !s.chapterId || !chapters.some(c => c.id === s.chapterId))
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));
        
        return { chaptered, unassigned };
    }

    /**
     * Discover new scenes and sync with draft
     * Returns scenes that were added or removed
     */
    async syncDraftWithScenes(draft: StoryDraft): Promise<SceneDiscoveryResult> {
        const scenes = await this.plugin.listScenes();
        const existingIds = new Set(draft.sceneOrder.map(r => r.sceneId));
        const currentSceneIds = new Set<string>();
        
        const added: Scene[] = [];
        const existing: Scene[] = [];
        
        // Find new and existing scenes
        for (const scene of scenes) {
            const sceneId = scene.id || scene.name;
            currentSceneIds.add(sceneId);
            
            if (existingIds.has(sceneId)) {
                existing.push(scene);
            } else {
                added.push(scene);
            }
        }
        
        // Find removed scenes (in draft but no longer exist)
        const removed: string[] = [];
        for (const ref of draft.sceneOrder) {
            if (!currentSceneIds.has(ref.sceneId)) {
                removed.push(ref.sceneId);
            }
        }
        
        // Add new scenes to the draft (at appropriate position based on chapter)
        if (added.length > 0) {
            for (const scene of added) {
                const sceneId = scene.id || scene.name;
                const insertPosition = await this.findInsertPosition(draft, scene);
                
                const newRef: IndentedSceneRef = {
                    sceneId,
                    indent: 0,
                    includeInCompile: scene.includeInCompile !== false
                };
                
                if (insertPosition >= 0) {
                    draft.sceneOrder.splice(insertPosition, 0, newRef);
                } else {
                    draft.sceneOrder.push(newRef);
                }
            }
        }
        
        // Remove deleted scenes from draft
        if (removed.length > 0) {
            draft.sceneOrder = draft.sceneOrder.filter(r => !removed.includes(r.sceneId));
        }
        
        if (added.length > 0 || removed.length > 0) {
            draft.modified = new Date().toISOString();
            await this.plugin.saveSettings();
        }
        
        return { added, removed, existing };
    }

    /**
     * Find the appropriate position to insert a scene based on its chapter
     */
    private async findInsertPosition(draft: StoryDraft, scene: Scene): Promise<number> {
        if (!scene.chapterId) {
            // Unassigned scenes go at the end
            return -1;
        }
        
        const scenes = await this.plugin.listScenes();
        const chapters = await this.plugin.listChapters();
        const chapter = chapters.find(c => c.id === scene.chapterId);
        
        if (!chapter) return -1;
        
        // Find the last scene in this chapter that's already in the draft
        let lastChapterSceneIndex = -1;
        for (let i = 0; i < draft.sceneOrder.length; i++) {
            const ref = draft.sceneOrder[i];
            const existingScene = scenes.find(s => s.id === ref.sceneId || s.name === ref.sceneId);
            if (existingScene?.chapterId === scene.chapterId) {
                lastChapterSceneIndex = i;
            }
        }
        
        if (lastChapterSceneIndex >= 0) {
            // Insert after the last scene in this chapter
            return lastChapterSceneIndex + 1;
        }
        
        // Find where this chapter should go based on chapter order
        const sortedChapters = chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
        const chapterIndex = sortedChapters.findIndex(c => c.id === chapter.id);
        
        // Find the first scene from a later chapter
        for (let i = 0; i < draft.sceneOrder.length; i++) {
            const ref = draft.sceneOrder[i];
            const existingScene = scenes.find(s => s.id === ref.sceneId || s.name === ref.sceneId);
            if (existingScene?.chapterId) {
                const existingChapter = chapters.find(c => c.id === existingScene.chapterId);
                if (existingChapter) {
                    const existingChapterIndex = sortedChapters.findIndex(c => c.id === existingChapter.id);
                    if (existingChapterIndex > chapterIndex) {
                        return i;
                    }
                }
            }
        }
        
        return -1; // Append at end
    }

    /**
     * Auto-populate a draft from existing chapters and scenes
     */
    async autoPopulateDraft(draft: StoryDraft): Promise<void> {
        draft.sceneOrder = await this.buildSceneOrderFromStory({
            id: draft.storyId,
            name: '',
        } as Story);
        
        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
    }

    /**
     * Get scene by ID or name
     */
    async getSceneById(sceneId: string): Promise<Scene | undefined> {
        const scenes = await this.plugin.listScenes();
        return scenes.find(s => s.id === sceneId || s.name === sceneId);
    }

    /**
     * Get chapter by ID
     */
    async getChapterById(chapterId: string): Promise<Chapter | undefined> {
        const chapters = await this.plugin.listChapters();
        return chapters.find(c => c.id === chapterId);
    }

    /**
     * Get all scenes for a specific chapter
     */
    async getScenesForChapter(chapterId: string): Promise<Scene[]> {
        const scenes = await this.plugin.listScenes();
        return scenes
            .filter(s => s.chapterId === chapterId)
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    /**
     * Move a scene up in the order
     */
    async moveSceneUp(draft: StoryDraft, sceneId: string): Promise<boolean> {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        if (index <= 0) return false;

        // Swap with previous
        const temp = draft.sceneOrder[index];
        draft.sceneOrder[index] = draft.sceneOrder[index - 1];
        draft.sceneOrder[index - 1] = temp;

        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
        return true;
    }

    /**
     * Move a scene down in the order
     */
    async moveSceneDown(draft: StoryDraft, sceneId: string): Promise<boolean> {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        if (index < 0 || index >= draft.sceneOrder.length - 1) return false;

        // Swap with next
        const temp = draft.sceneOrder[index];
        draft.sceneOrder[index] = draft.sceneOrder[index + 1];
        draft.sceneOrder[index + 1] = temp;

        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
        return true;
    }

    /**
     * Indent a scene (make it a child of the previous scene)
     */
    async indentScene(draft: StoryDraft, sceneId: string): Promise<boolean> {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        if (index <= 0) return false;

        const prevIndent = draft.sceneOrder[index - 1].indent;
        const currentIndent = draft.sceneOrder[index].indent;

        // Can only indent if not already more indented than previous
        if (currentIndent <= prevIndent) {
            draft.sceneOrder[index].indent = currentIndent + 1;
            draft.modified = new Date().toISOString();
            await this.plugin.saveSettings();
            return true;
        }

        return false;
    }

    /**
     * Unindent a scene (move it up a level)
     */
    async unindentScene(draft: StoryDraft, sceneId: string): Promise<boolean> {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        if (index < 0) return false;

        const currentIndent = draft.sceneOrder[index].indent;
        if (currentIndent <= 0) return false;

        draft.sceneOrder[index].indent = currentIndent - 1;
        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
        return true;
    }

    /**
     * Toggle whether a scene is included in compilation
     */
    async toggleSceneInCompile(draft: StoryDraft, sceneId: string): Promise<boolean> {
        const ref = draft.sceneOrder.find(s => s.sceneId === sceneId);
        if (!ref) return false;

        ref.includeInCompile = !ref.includeInCompile;
        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
        return true;
    }

    /**
     * Add a scene to the draft at a specific position
     */
    async addSceneToDraft(draft: StoryDraft, sceneId: string, afterSceneId?: string): Promise<void> {
        const newRef: IndentedSceneRef = {
            sceneId,
            indent: 0,
            includeInCompile: true
        };

        if (afterSceneId) {
            const afterIndex = draft.sceneOrder.findIndex(s => s.sceneId === afterSceneId);
            if (afterIndex >= 0) {
                // Match the indent level of the scene we're adding after
                newRef.indent = draft.sceneOrder[afterIndex].indent;
                draft.sceneOrder.splice(afterIndex + 1, 0, newRef);
            } else {
                draft.sceneOrder.push(newRef);
            }
        } else {
            draft.sceneOrder.push(newRef);
        }

        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
    }

    /**
     * Remove a scene from the draft
     */
    async removeSceneFromDraft(draft: StoryDraft, sceneId: string): Promise<void> {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        if (index >= 0) {
            draft.sceneOrder.splice(index, 1);
            draft.modified = new Date().toISOString();
            await this.plugin.saveSettings();
        }
    }

    /**
     * Reorder scenes by dragging (set new order completely)
     */
    async setSceneOrder(draft: StoryDraft, newOrder: IndentedSceneRef[]): Promise<void> {
        draft.sceneOrder = newOrder;
        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
    }

    /**
     * Delete a draft
     */
    async deleteDraft(draftId: string): Promise<void> {
        const drafts = this.getStoryDrafts();
        const index = drafts.findIndex(d => d.id === draftId);
        if (index >= 0) {
            drafts.splice(index, 1);
            this.plugin.settings.storyDrafts = drafts;
            
            // If this was the active draft, clear it
            if (this.plugin.settings.activeDraftId === draftId) {
                this.plugin.settings.activeDraftId = undefined;
            }
            
            await this.plugin.saveSettings();
        }
    }

    /**
     * Rename a draft
     */
    async renameDraft(draftId: string, newName: string): Promise<void> {
        const draft = this.getStoryDrafts().find(d => d.id === draftId);
        if (draft) {
            draft.name = newName;
            draft.modified = new Date().toISOString();
            await this.plugin.saveSettings();
        }
    }

    /**
     * Set the active draft
     */
    async setActiveDraft(draftId: string): Promise<void> {
        this.plugin.settings.activeDraftId = draftId;
        await this.plugin.saveSettings();
    }

    /**
     * Get the current scene based on the active file
     */
    async getCurrentScene(): Promise<Scene | undefined> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return undefined;

        const scenes = await this.plugin.listScenes();
        return scenes.find(s => s.filePath === activeFile.path);
    }

    /**
     * Get the story for a scene
     */
    getStoryForScene(scene: Scene): Story | undefined {
        // Scene doesn't have storyId directly - we need to infer it from the file path
        // or check chapter association
        const stories = this.plugin.settings.stories;
        
        // For now, return the active story
        return stories.find(s => s.id === this.plugin.settings.activeStoryId);
    }

    /**
     * Navigate to the next scene in the draft order
     */
    async navigateToNextScene(): Promise<boolean> {
        const currentScene = await this.getCurrentScene();
        if (!currentScene || !currentScene.id) return false;

        const story = this.getStoryForScene(currentScene);
        if (!story) return false;

        const draft = this.getActiveDraft(story);
        if (!draft) return false;

        const currentIndex = draft.sceneOrder.findIndex(s => s.sceneId === currentScene.id);
        if (currentIndex < 0 || currentIndex >= draft.sceneOrder.length - 1) return false;

        const nextRef = draft.sceneOrder[currentIndex + 1];
        const scenes = await this.plugin.listScenes();
        const nextScene = scenes.find(s => s.id === nextRef.sceneId);
        
        if (nextScene?.filePath) {
            await this.plugin.app.workspace.openLinkText(nextScene.filePath, '', false);
            return true;
        }

        return false;
    }

    /**
     * Navigate to the previous scene in the draft order
     */
    async navigateToPreviousScene(): Promise<boolean> {
        const currentScene = await this.getCurrentScene();
        if (!currentScene || !currentScene.id) return false;

        const story = this.getStoryForScene(currentScene);
        if (!story) return false;

        const draft = this.getActiveDraft(story);
        if (!draft) return false;

        const currentIndex = draft.sceneOrder.findIndex(s => s.sceneId === currentScene.id);
        if (currentIndex <= 0) return false;

        const prevRef = draft.sceneOrder[currentIndex - 1];
        const scenes = await this.plugin.listScenes();
        const prevScene = scenes.find(s => s.id === prevRef.sceneId);
        
        if (prevScene?.filePath) {
            await this.plugin.app.workspace.openLinkText(prevScene.filePath, '', false);
            return true;
        }

        return false;
    }

    /**
     * Jump to a specific scene by number
     */
    async jumpToScene(storyId: string, sceneNumber: number): Promise<boolean> {
        const story = this.plugin.settings.stories.find(s => s.id === storyId);
        if (!story) return false;

        const draft = this.getActiveDraft(story);
        if (!draft) return false;

        // Scene numbers are 1-indexed for user-friendliness
        const index = sceneNumber - 1;
        if (index < 0 || index >= draft.sceneOrder.length) return false;

        const ref = draft.sceneOrder[index];
        const scenes = await this.plugin.listScenes();
        const scene = scenes.find(s => s.id === ref.sceneId);
        
        if (scene?.filePath) {
            await this.plugin.app.workspace.openLinkText(scene.filePath, '', false);
            return true;
        }

        return false;
    }

    /**
     * Get scene number in the draft
     */
    getSceneNumber(draft: StoryDraft, sceneId: string): number | undefined {
        const index = draft.sceneOrder.findIndex(s => s.sceneId === sceneId);
        return index >= 0 ? index + 1 : undefined;
    }

    /**
     * Calculate total word count for the draft
     */
    async calculateDraftWordCount(draft: StoryDraft): Promise<number> {
        let totalWords = 0;
        const scenes = await this.plugin.listScenes();

        for (const ref of draft.sceneOrder) {
            if (!ref.includeInCompile) continue;

            const scene = scenes.find(s => s.id === ref.sceneId || s.name === ref.sceneId);
            if (!scene?.filePath) continue;

            const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
            if (file instanceof TFile) {
                const content = await this.plugin.app.vault.cachedRead(file);
                const words = content.split(/\s+/).filter(w => w.length > 0).length;
                totalWords += words;
            }
        }

        return totalWords;
    }

    /**
     * Calculate word count per chapter
     */
    async calculateChapterWordCounts(draft: StoryDraft): Promise<Map<string, number>> {
        const chapterWords = new Map<string, number>();
        const scenes = await this.plugin.listScenes();

        for (const ref of draft.sceneOrder) {
            if (!ref.includeInCompile) continue;

            const scene = scenes.find(s => s.id === ref.sceneId || s.name === ref.sceneId);
            if (!scene?.filePath) continue;

            const chapterId = scene.chapterId || 'unassigned';
            const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
            if (file instanceof TFile) {
                const content = await this.plugin.app.vault.cachedRead(file);
                const words = content.split(/\s+/).filter(w => w.length > 0).length;
                chapterWords.set(chapterId, (chapterWords.get(chapterId) || 0) + words);
            }
        }

        return chapterWords;
    }

    /**
     * Get draft statistics
     */
    async getDraftStatistics(draft: StoryDraft): Promise<{
        totalScenes: number;
        includedScenes: number;
        excludedScenes: number;
        totalWords: number;
        chapterCount: number;
        unassignedScenes: number;
    }> {
        const scenes = await this.plugin.listScenes();
        const orderedScenes = await this.getOrderedScenes(draft);
        
        const chapterIds = new Set<string>();
        let unassignedCount = 0;
        
        for (const os of orderedScenes) {
            if (os.chapter) {
                chapterIds.add(os.chapter.id || '');
            } else {
                unassignedCount++;
            }
        }

        const totalWords = await this.calculateDraftWordCount(draft);
        const includedScenes = draft.sceneOrder.filter(r => r.includeInCompile).length;

        return {
            totalScenes: draft.sceneOrder.length,
            includedScenes,
            excludedScenes: draft.sceneOrder.length - includedScenes,
            totalWords,
            chapterCount: chapterIds.size,
            unassignedScenes: unassignedCount
        };
    }

    /**
     * Reorder scenes by chapter - groups scenes by their chapter
     */
    async reorderByChapter(draft: StoryDraft): Promise<void> {
        const organized = await this.getAllScenesOrganized();
        const newOrder: IndentedSceneRef[] = [];
        
        // Keep existing indent/include settings
        const existingSettings = new Map<string, { indent: number; includeInCompile: boolean }>();
        for (const ref of draft.sceneOrder) {
            existingSettings.set(ref.sceneId, {
                indent: ref.indent,
                includeInCompile: ref.includeInCompile
            });
        }
        
        // Add chaptered scenes first
        for (const chapterGroup of organized.chaptered) {
            for (const scene of chapterGroup.scenes) {
                const sceneId = scene.id || scene.name;
                const existing = existingSettings.get(sceneId);
                newOrder.push({
                    sceneId,
                    indent: existing?.indent || 0,
                    includeInCompile: existing?.includeInCompile ?? (scene.includeInCompile !== false)
                });
            }
        }
        
        // Add unassigned scenes
        for (const scene of organized.unassigned) {
            const sceneId = scene.id || scene.name;
            const existing = existingSettings.get(sceneId);
            newOrder.push({
                sceneId,
                indent: existing?.indent || 0,
                includeInCompile: existing?.includeInCompile ?? (scene.includeInCompile !== false)
            });
        }
        
        draft.sceneOrder = newOrder;
        draft.modified = new Date().toISOString();
        await this.plugin.saveSettings();
    }

    /**
     * Assign a scene to a chapter and update draft order if needed
     */
    async assignSceneToChapter(draft: StoryDraft, sceneId: string, chapterId: string | undefined): Promise<void> {
        const scene = await this.getSceneById(sceneId);
        if (!scene || !scene.filePath) return;
        
        // Update the scene's chapter assignment
        scene.chapterId = chapterId;
        if (chapterId) {
            const chapter = await this.getChapterById(chapterId);
            scene.chapterName = chapter?.name;
        } else {
            scene.chapterName = undefined;
        }
        
        // Save the scene with updated chapter
        await this.plugin.saveScene(scene);
    }

    /**
     * Generate a unique ID
     */
    private generateId(): string {
        return `draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}

export default SceneOrderManager;
