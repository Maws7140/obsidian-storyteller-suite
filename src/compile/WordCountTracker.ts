/**
 * WordCountTracker - Manages word count goals and daily writing statistics
 * Inspired by Longform's word count goal system
 */

import { TFile, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { DailyWritingStats, Scene, Story } from '../types';

/**
 * Session writing statistics
 */
export interface SessionStats {
    wordsWritten: number;
    wordsDeleted: number;
    netWords: number;
    startTime: number;
    duration: number; // in milliseconds
}

/**
 * Word count result for a scene
 */
export interface SceneWordCount {
    sceneId: string;
    sceneName: string;
    wordCount: number;
    targetWordCount?: number;
    percentComplete: number;
}

/**
 * Manages word count tracking and goals
 */
export class WordCountTracker {
    private plugin: StorytellerSuitePlugin;
    private sessionStartWordCount: number = 0;
    private sessionStartTime: number = 0;
    private lastKnownWordCount: number = 0;
    private wordsDeleted: number = 0;
    private isTracking: boolean = false;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Get daily writing stats as a record (handles the array-based or record-based storage)
     */
    private getDailyStats(): Record<string, DailyWritingStats> {
        const stats = this.plugin.settings.dailyWritingStats;
        if (!stats) return {};
        
        // Handle both array and record formats
        if (Array.isArray(stats)) {
            const record: Record<string, DailyWritingStats> = {};
            for (const stat of stats) {
                record[stat.date] = stat;
            }
            return record;
        }
        return stats as unknown as Record<string, DailyWritingStats>;
    }

    /**
     * Save daily stats back to settings
     */
    private async saveDailyStats(stats: Record<string, DailyWritingStats>): Promise<void> {
        // Store as array for consistency
        this.plugin.settings.dailyWritingStats = Object.values(stats);
        await this.plugin.saveSettings();
    }

    /**
     * Start a writing session
     */
    startSession(): void {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile) {
            this.sessionStartTime = Date.now();
            this.getFileWordCount(activeFile).then(count => {
                this.sessionStartWordCount = count;
                this.lastKnownWordCount = count;
                this.wordsDeleted = 0;
                this.isTracking = true;
            });
        }
    }

    /**
     * End the writing session and record stats
     */
    async endSession(): Promise<SessionStats> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        const currentCount = activeFile ? await this.getFileWordCount(activeFile) : this.lastKnownWordCount;
        
        const netWords = currentCount - this.sessionStartWordCount;
        const wordsWritten = Math.max(0, netWords + this.wordsDeleted);
        
        const stats: SessionStats = {
            wordsWritten,
            wordsDeleted: this.wordsDeleted,
            netWords,
            startTime: this.sessionStartTime,
            duration: Date.now() - this.sessionStartTime
        };

        this.isTracking = false;
        
        // Record to daily stats
        await this.recordDailyStats(netWords);

        return stats;
    }

    /**
     * Track word count changes (call on document change)
     */
    async onDocumentChange(file: TFile): Promise<void> {
        if (!this.isTracking) return;

        const currentCount = await this.getFileWordCount(file);
        const diff = currentCount - this.lastKnownWordCount;

        // Track deletions separately if configured
        if (diff < 0 && this.plugin.settings.countDeletionsForGoal) {
            this.wordsDeleted += Math.abs(diff);
        }

        this.lastKnownWordCount = currentCount;
    }

    /**
     * Get word count for a file
     */
    async getFileWordCount(file: TFile): Promise<number> {
        const content = await this.plugin.app.vault.cachedRead(file);
        return this.countWords(content);
    }

    /**
     * Count words in text
     */
    countWords(text: string): number {
        // Strip frontmatter
        const contentWithoutFm = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
        
        // Strip code blocks
        const contentWithoutCode = contentWithoutFm.replace(/```[\s\S]*?```/g, '');
        
        // Split by whitespace and filter empty strings
        const words = contentWithoutCode.split(/\s+/).filter(w => w.length > 0);
        
        return words.length;
    }

    /**
     * Record words to daily statistics
     */
    async recordDailyStats(netWords: number): Promise<void> {
        const today = this.getTodayKey();
        const stats = this.getDailyStats();
        const existingStats = stats[today];

        if (existingStats) {
            existingStats.wordsWritten += Math.max(0, netWords);
            existingStats.netWords += netWords;
            if (netWords < 0) {
                existingStats.wordsDeleted += Math.abs(netWords);
            }
        } else {
            stats[today] = {
                date: today,
                wordsWritten: Math.max(0, netWords),
                wordsDeleted: netWords < 0 ? Math.abs(netWords) : 0,
                netWords: netWords,
                timeSpent: 0,
                scenesEdited: [],
                goalMet: false
            };
        }

        // Check if goal is met
        const dailyGoal = this.plugin.settings.dailyWordCountGoal || 0;
        if (dailyGoal > 0 && stats[today].wordsWritten >= dailyGoal) {
            stats[today].goalMet = true;
        }

        await this.saveDailyStats(stats);
        
        // Check if goal reached
        this.checkDailyGoal();
    }

    /**
     * Get today's stats
     */
    getTodayStats(): DailyWritingStats | undefined {
        return this.getDailyStats()[this.getTodayKey()];
    }

    /**
     * Get stats for a date range
     */
    getStatsForRange(startDate: Date, endDate: Date): DailyWritingStats[] {
        const allStats = this.getDailyStats();
        const stats: DailyWritingStats[] = [];
        const current = new Date(startDate);

        while (current <= endDate) {
            const key = this.getDateKey(current);
            const dayStat = allStats[key];
            if (dayStat) {
                stats.push(dayStat);
            }
            current.setDate(current.getDate() + 1);
        }

        return stats;
    }

    /**
     * Get weekly stats (last 7 days)
     */
    getWeeklyStats(): DailyWritingStats[] {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        return this.getStatsForRange(startDate, endDate);
    }

    /**
     * Get monthly stats
     */
    getMonthlyStats(): DailyWritingStats[] {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 29);
        return this.getStatsForRange(startDate, endDate);
    }

    /**
     * Check if daily goal is reached and notify
     */
    private checkDailyGoal(): void {
        if (!this.plugin.settings.notifyOnGoalReached) return;
        if (!this.plugin.settings.dailyWordCountGoal) return;

        const todayStats = this.getTodayStats();
        if (!todayStats) return;

        if (todayStats.wordsWritten >= this.plugin.settings.dailyWordCountGoal) {
            new Notice(`🎉 Daily writing goal reached! ${todayStats.wordsWritten} words written today.`);
        }
    }

    /**
     * Get progress towards daily goal as a percentage
     */
    getDailyGoalProgress(): number {
        if (!this.plugin.settings.dailyWordCountGoal) return 0;
        
        const todayStats = this.getTodayStats();
        if (!todayStats) return 0;

        return Math.min(100, (todayStats.wordsWritten / this.plugin.settings.dailyWordCountGoal) * 100);
    }

    /**
     * Get word counts for all scenes in a story
     */
    async getSceneWordCounts(story: Story): Promise<SceneWordCount[]> {
        const scenes = await this.plugin.listScenes();
        const results: SceneWordCount[] = [];

        for (const scene of scenes) {
            let wordCount = 0;

            if (scene.filePath) {
                const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
                if (file instanceof TFile) {
                    wordCount = await this.getFileWordCount(file);
                }
            }

            const targetWordCount = scene.targetWordCount;
            const percentComplete = targetWordCount 
                ? Math.min(100, (wordCount / targetWordCount) * 100)
                : 0;

            results.push({
                sceneId: scene.id || '',
                sceneName: scene.name,
                wordCount,
                targetWordCount,
                percentComplete
            });
        }

        return results;
    }

    /**
     * Get total word count for a story
     */
    async getStoryWordCount(story: Story): Promise<number> {
        const sceneCounts = await this.getSceneWordCounts(story);
        return sceneCounts.reduce((total, sc) => total + sc.wordCount, 0);
    }

    /**
     * Get today's date key
     */
    private getTodayKey(): string {
        return this.getDateKey(new Date());
    }

    /**
     * Get date key for a date
     */
    private getDateKey(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    /**
     * Get writing streak (consecutive days)
     */
    getWritingStreak(): number {
        const allStats = this.getDailyStats();
        let streak = 0;
        const today = new Date();
        const current = new Date(today);

        // Check if we wrote today
        const todayKey = this.getDateKey(today);
        const todayStats = allStats[todayKey];
        
        // If we haven't written today, start checking from yesterday
        if (!todayStats || todayStats.wordsWritten === 0) {
            current.setDate(current.getDate() - 1);
        }

        // Count consecutive days
        while (true) {
            const key = this.getDateKey(current);
            const stats = allStats[key];
            
            if (stats && stats.wordsWritten > 0) {
                streak++;
                current.setDate(current.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * Get average words per day (last 30 days)
     */
    getAverageWordsPerDay(): number {
        const monthlyStats = this.getMonthlyStats();
        if (monthlyStats.length === 0) return 0;

        const total = monthlyStats.reduce((sum, s) => sum + s.wordsWritten, 0);
        return Math.round(total / monthlyStats.length);
    }

    /**
     * Set daily word count goal
     */
    async setDailyGoal(goal: number): Promise<void> {
        this.plugin.settings.dailyWordCountGoal = goal;
        await this.plugin.saveSettings();
    }

    /**
     * Set target word count for a scene
     * Note: This updates the scene's frontmatter, so it needs to re-save the scene file
     */
    async setSceneTargetWordCount(sceneId: string, target: number): Promise<void> {
        const scenes = await this.plugin.listScenes();
        const scene = scenes.find(s => s.id === sceneId);
        if (scene) {
            scene.targetWordCount = target;
            await this.plugin.saveScene(scene);
        }
    }

    /**
     * Update scene's cached word count
     */
    async updateSceneWordCount(sceneId: string): Promise<number> {
        const scenes = await this.plugin.listScenes();
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene || !scene.filePath) return 0;

        const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
        if (!(file instanceof TFile)) return 0;

        const wordCount = await this.getFileWordCount(file);
        scene.wordCount = wordCount;
        await this.plugin.saveScene(scene);

        return wordCount;
    }

    /**
     * Format word count for display
     */
    formatWordCount(count: number): string {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }

    /**
     * Format duration for display
     */
    formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        }
        return `${seconds}s`;
    }
}

export default WordCountTracker;
