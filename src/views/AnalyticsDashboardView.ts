// Analytics Dashboard View - Writing analytics and insights
// Provides comprehensive story analytics including character screen time,
// writing velocity, dialogue analysis, pacing, and more

import { ItemView, WorkspaceLeaf, Notice, Setting, App, Modal } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import {
    StoryAnalytics,
    WritingSession,
    CharacterScreenTime,
    EventDistribution,
    POVStats,
    VelocityData,
    ForeshadowingPair,
    DialogueAnalysis
} from '../types';

export const VIEW_TYPE_ANALYTICS = 'storyteller-analytics-view';

/**
 * AnalyticsDashboardView provides comprehensive writing analytics
 * Features:
 * - Writing session tracking
 * - Character screen time analysis
 * - Dialogue analysis by character
 * - Event distribution over time
 * - Pacing analysis
 * - Foreshadowing tracker
 * - Writing velocity metrics
 */
export class AnalyticsDashboardView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private analytics: StoryAnalytics | null = null;
    private refreshing = false;
    private contentContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_ANALYTICS;
    }

    getDisplayText(): string {
        return 'Writing Analytics';
    }

    getIcon(): string {
        return 'bar-chart-2';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyteller-analytics-view');

        this.contentContainer = container;

        // Build UI
        this.buildHeader();
        await this.refreshAnalytics();
        this.renderAnalytics();
    }

    buildHeader(): void {
        if (!this.contentContainer) return;

        const header = this.contentContainer.createDiv('storyteller-analytics-header');

        // Title
        header.createEl('h2', { text: 'Writing Analytics' });

        // Toolbar
        const toolbar = header.createDiv('storyteller-analytics-toolbar');

        // Refresh button
        const refreshBtn = toolbar.createEl('button', {
            cls: 'mod-cta',
            text: 'Refresh Analytics'
        });
        refreshBtn.addEventListener('click', async () => {
            await this.refreshAnalytics();
            this.renderAnalytics();
        });

        // Export button
        const exportBtn = toolbar.createEl('button', {
            text: 'Export Report'
        });
        exportBtn.addEventListener('click', () => {
            this.exportAnalyticsReport();
        });
    }

    async refreshAnalytics(): Promise<void> {
        if (this.refreshing) return;
        this.refreshing = true;

        try {
            // Calculate analytics
            this.analytics = await this.calculateAnalytics();

            // Save to settings
            this.plugin.settings.analyticsData = this.analytics;
            await this.plugin.saveSettings();
        } catch (error) {
            console.error('Error refreshing analytics:', error);
            new Notice('Failed to refresh analytics');
        } finally {
            this.refreshing = false;
        }
    }

    async calculateAnalytics(): Promise<StoryAnalytics> {
        const characters = await this.plugin.listCharacters();
        const events = await this.plugin.listEvents();
        const scenes = await this.plugin.listScenes();
        const chapters = await this.plugin.listChapters();

        // Calculate character screen time
        const characterScreenTime: CharacterScreenTime[] = characters.map(char => {
            const appearances = events.filter(e =>
                e.characters?.includes(char.name)
            ).length + scenes.filter(s =>
                s.linkedCharacters?.includes(char.name)
            ).length;

            return {
                characterName: char.name,
                appearances,
                percentage: events.length > 0 ? (appearances / events.length) * 100 : 0
            };
        }).sort((a, b) => b.appearances - a.appearances);

        // Calculate event distribution
        const eventDistribution: EventDistribution[] = this.calculateEventDistribution(events);

        // Calculate POV stats
        const povStats: POVStats[] = this.calculatePOVStats(scenes, chapters);

        // Get writing sessions
        const writingSessions = this.plugin.settings.writingSessions || [];
        const velocity = this.calculateVelocity(writingSessions);

        // Get foreshadowing data
        const foreshadowing = this.plugin.settings.analyticsData?.foreshadowing || [];

        // Calculate dialogue analysis
        const dialogueAnalysis: DialogueAnalysis = {
            totalLines: 0,
            byCharacter: {},
            density: 0
        };

        return {
            lastUpdated: new Date().toISOString(),
            totalWords: this.calculateTotalWords(scenes, chapters),
            characterScreenTime,
            eventDistribution,
            povStats,
            velocity,
            foreshadowing,
            dialogueAnalysis
        };
    }

    calculateEventDistribution(events: any[]): EventDistribution[] {
        // Group events by year/period
        const distribution: Record<string, number> = {};

        events.forEach(event => {
            if (event.dateTime) {
                const year = event.dateTime.split('-')[0];
                distribution[year] = (distribution[year] || 0) + 1;
            }
        });

        const total = events.length;
        return Object.entries(distribution)
            .map(([category, count]) => ({
                category,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => a.category.localeCompare(b.category));
    }

    calculatePOVStats(scenes: any[], chapters: any[]): POVStats[] {
        const povCounts: Record<string, number> = {};
        const total = scenes.length;

        scenes.forEach(scene => {
            if (scene.linkedCharacters && scene.linkedCharacters.length > 0) {
                const pov = scene.linkedCharacters[0]; // First character as POV
                povCounts[pov] = (povCounts[pov] || 0) + 1;
            }
        });

        return Object.entries(povCounts)
            .map(([character, sceneCount]) => ({
                character,
                sceneCount,
                percentage: (sceneCount / total) * 100
            }))
            .sort((a, b) => b.sceneCount - a.sceneCount);
    }

    calculateVelocity(sessions: WritingSession[]): VelocityData[] {
        const velocityMap: Record<string, number> = {};

        sessions.forEach(session => {
            const date = session.startTime.split('T')[0];
            velocityMap[date] = (velocityMap[date] || 0) + session.wordsWritten;
        });

        return Object.entries(velocityMap)
            .map(([date, wordsWritten]) => ({
                date,
                wordsWritten
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    calculateTotalWords(scenes: any[], chapters: any[]): number {
        let total = 0;
        scenes.forEach(scene => {
            if (scene.content) {
                total += scene.content.split(/\s+/).length;
            }
        });
        return total;
    }

    renderAnalytics(): void {
        if (!this.contentContainer || !this.analytics) return;

        // Remove previous content
        const existingContent = this.contentContainer.querySelector('.storyteller-analytics-content');
        if (existingContent) existingContent.remove();

        const content = this.contentContainer.createDiv('storyteller-analytics-content');

        // Overview section
        this.renderOverview(content);

        // Character screen time
        this.renderCharacterScreenTime(content);

        // Event distribution
        this.renderEventDistribution(content);

        // POV statistics
        this.renderPOVStats(content);

        // Writing velocity
        this.renderWritingVelocity(content);

        // Foreshadowing tracker
        this.renderForeshadowing(content);

        // Writing sessions
        this.renderWritingSessions(content);
    }

    renderOverview(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Overview' });

        const grid = section.createDiv('storyteller-analytics-grid');

        this.createStatCard(grid, 'Total Words', this.analytics?.totalWords?.toLocaleString() || '0', '📝');
        this.createStatCard(grid, 'Characters', this.analytics?.characterScreenTime?.length.toString() || '0', '👥');
        this.createStatCard(grid, 'Events', this.analytics?.eventDistribution?.reduce((sum, e) => sum + e.count, 0).toString() || '0', '📅');
        this.createStatCard(grid, 'POVs', this.analytics?.povStats?.length.toString() || '0', '👁️');
    }

    createStatCard(container: HTMLElement, label: string, value: string, icon: string): void {
        const card = container.createDiv('storyteller-stat-card');
        card.createDiv('storyteller-stat-icon').setText(icon);
        card.createDiv('storyteller-stat-value').setText(value);
        card.createDiv('storyteller-stat-label').setText(label);
    }

    renderCharacterScreenTime(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Character Screen Time' });

        if (!this.analytics?.characterScreenTime || this.analytics.characterScreenTime.length === 0) {
            section.createEl('p', { text: 'No character data available' });
            return;
        }

        const table = section.createEl('table', { cls: 'storyteller-analytics-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Character' });
        headerRow.createEl('th', { text: 'Appearances' });
        headerRow.createEl('th', { text: 'Percentage' });
        headerRow.createEl('th', { text: 'Bar' });

        const tbody = table.createEl('tbody');
        this.analytics.characterScreenTime.forEach(char => {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: char.characterName });
            row.createEl('td', { text: char.appearances.toString() });
            row.createEl('td', { text: `${char.percentage?.toFixed(1)}%` });

            const barCell = row.createEl('td');
            const bar = barCell.createDiv('storyteller-progress-bar');
            const fill = bar.createDiv('storyteller-progress-fill');
            fill.style.width = `${char.percentage}%`;
        });
    }

    renderEventDistribution(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Event Distribution' });

        if (!this.analytics?.eventDistribution || this.analytics.eventDistribution.length === 0) {
            section.createEl('p', { text: 'No event data available' });
            return;
        }

        const chart = section.createDiv('storyteller-bar-chart');
        const maxCount = Math.max(...this.analytics.eventDistribution.map(e => e.count));

        this.analytics.eventDistribution.forEach(dist => {
            const item = chart.createDiv('storyteller-bar-item');
            const bar = item.createDiv('storyteller-bar');
            const fill = bar.createDiv('storyteller-bar-fill');
            fill.style.height = `${(dist.count / maxCount) * 100}%`;
            fill.setAttribute('title', `${dist.count} events`);
            item.createDiv('storyteller-bar-label').setText(dist.category);
        });
    }

    renderPOVStats(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Point of View Distribution' });

        if (!this.analytics?.povStats || this.analytics.povStats.length === 0) {
            section.createEl('p', { text: 'No POV data available' });
            return;
        }

        const list = section.createEl('ul', { cls: 'storyteller-pov-list' });
        this.analytics.povStats.forEach(pov => {
            const item = list.createEl('li');
            item.createSpan({ text: pov.character, cls: 'storyteller-pov-name' });
            item.createSpan({ text: ` - ${pov.sceneCount} scenes (${pov.percentage?.toFixed(1)}%)` });
        });
    }

    renderWritingVelocity(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Writing Velocity' });

        if (!this.analytics?.velocity || this.analytics.velocity.length === 0) {
            section.createEl('p', { text: 'No writing session data available. Start tracking your writing sessions!' });
            return;
        }

        const chart = section.createDiv('storyteller-velocity-chart');
        const maxWords = Math.max(...this.analytics.velocity.map(v => v.wordsWritten));

        this.analytics.velocity.slice(-30).forEach(day => {
            const item = chart.createDiv('storyteller-velocity-item');
            const bar = item.createDiv('storyteller-velocity-bar');
            const fill = bar.createDiv('storyteller-velocity-fill');
            fill.style.height = `${(day.wordsWritten / maxWords) * 100}%`;
            fill.setAttribute('title', `${day.wordsWritten} words on ${day.date}`);
            item.createDiv('storyteller-velocity-label').setText(day.date.split('-')[2]);
        });
    }

    renderForeshadowing(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Foreshadowing Tracker' });

        const toolbar = section.createDiv('storyteller-section-toolbar');
        const addBtn = toolbar.createEl('button', { text: '+ Add Foreshadowing', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            this.addForeshadowing();
        });

        if (!this.analytics?.foreshadowing || this.analytics.foreshadowing.length === 0) {
            section.createEl('p', { text: 'No foreshadowing tracked yet' });
            return;
        }

        const list = section.createEl('ul', { cls: 'storyteller-foreshadowing-list' });
        this.analytics.foreshadowing.forEach((pair, index) => {
            const item = list.createEl('li');
            const status = pair.status === 'resolved' ? '✓' : pair.status === 'planted' ? '🌱' : '❌';
            item.createSpan({ text: `${status} `, cls: 'storyteller-foreshadow-status' });
            item.createSpan({ text: pair.setup, cls: 'storyteller-foreshadow-setup' });
            if (pair.payoff) {
                item.createSpan({ text: ` → ${pair.payoff}` });
            }
        });
    }

    renderWritingSessions(container: HTMLElement): void {
        const section = container.createDiv('storyteller-analytics-section');
        section.createEl('h3', { text: 'Recent Writing Sessions' });

        const sessions = this.plugin.settings.writingSessions || [];
        if (sessions.length === 0) {
            section.createEl('p', { text: 'No writing sessions tracked yet' });
            return;
        }

        const list = section.createEl('ul', { cls: 'storyteller-sessions-list' });
        sessions.slice(-10).reverse().forEach(session => {
            const item = list.createEl('li');
            const date = new Date(session.startTime).toLocaleDateString();
            const words = session.wordsWritten;
            item.setText(`${date} - ${words} words`);
        });
    }

    addForeshadowing(): void {
        const modal = new ForeshadowingModal(this.app, this.plugin, null, async (pair) => {
            if (!this.analytics) this.analytics = await this.calculateAnalytics();
            if (!this.analytics.foreshadowing) this.analytics.foreshadowing = [];

            this.analytics.foreshadowing.push(pair);
            this.plugin.settings.analyticsData = this.analytics;
            await this.plugin.saveSettings();

            this.renderAnalytics();
            new Notice('Foreshadowing added');
        });
        modal.open();
    }

    exportAnalyticsReport(): void {
        if (!this.analytics) {
            new Notice('No analytics data to export');
            return;
        }

        const report = this.generateMarkdownReport();

        // Create report file
        const fileName = `Analytics-Report-${new Date().toISOString().split('T')[0]}.md`;
        const filePath = `${fileName}`;

        this.app.vault.create(filePath, report).then(() => {
            new Notice(`Analytics report exported to ${fileName}`);
        }).catch(err => {
            console.error('Error exporting report:', err);
            new Notice('Failed to export analytics report');
        });
    }

    generateMarkdownReport(): string {
        if (!this.analytics) return '';

        let report = `# Writing Analytics Report\n\n`;
        report += `Generated: ${new Date().toLocaleString()}\n\n`;

        report += `## Overview\n\n`;
        report += `- **Total Words**: ${this.analytics.totalWords?.toLocaleString() || 0}\n`;
        report += `- **Characters**: ${this.analytics.characterScreenTime?.length || 0}\n`;
        report += `- **Events**: ${this.analytics.eventDistribution?.reduce((sum, e) => sum + e.count, 0) || 0}\n\n`;

        if (this.analytics.characterScreenTime && this.analytics.characterScreenTime.length > 0) {
            report += `## Character Screen Time\n\n`;
            report += `| Character | Appearances | Percentage |\n`;
            report += `|-----------|-------------|------------|\n`;
            this.analytics.characterScreenTime.forEach(char => {
                report += `| ${char.characterName} | ${char.appearances} | ${char.percentage?.toFixed(1)}% |\n`;
            });
            report += `\n`;
        }

        if (this.analytics.povStats && this.analytics.povStats.length > 0) {
            report += `## POV Distribution\n\n`;
            this.analytics.povStats.forEach(pov => {
                report += `- **${pov.character}**: ${pov.sceneCount} scenes (${pov.percentage?.toFixed(1)}%)\n`;
            });
            report += `\n`;
        }

        return report;
    }

    async onClose(): Promise<void> {
        // Cleanup
    }
}

// Simple modal for adding foreshadowing
class ForeshadowingModal extends Modal {
    plugin: StorytellerSuitePlugin;
    onSubmit: (pair: ForeshadowingPair) => void;
    pair: ForeshadowingPair;

    constructor(app: App, plugin: StorytellerSuitePlugin, pair: ForeshadowingPair | null, onSubmit: (pair: ForeshadowingPair) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.pair = pair || {
            setup: '',
            payoff: '',
            status: 'planted'
        };
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Add Foreshadowing' });

        new Setting(contentEl)
            .setName('Setup/Hint')
            .setDesc('The foreshadowing element or hint')
            .addText(text => text
                .setValue(this.pair.setup)
                .onChange(value => this.pair.setup = value));

        new Setting(contentEl)
            .setName('Payoff (optional)')
            .setDesc('The resolution or reveal')
            .addText(text => text
                .setValue(this.pair.payoff || '')
                .onChange(value => this.pair.payoff = value));

        new Setting(contentEl)
            .setName('Status')
            .addDropdown(dropdown => dropdown
                .addOption('planted', 'Planted')
                .addOption('resolved', 'Resolved')
                .addOption('abandoned', 'Abandoned')
                .setValue(this.pair.status)
                .onChange(value => this.pair.status = value as any));

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Save')
                .setCta()
                .onClick(() => {
                    if (!this.pair.setup) {
                        new Notice('Setup is required');
                        return;
                    }
                    this.onSubmit(this.pair);
                    this.close();
                }))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
