import { App, Modal, Setting, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { TimelineConflict } from '../types';
import { ConflictDetector } from '../utils/ConflictDetector';

/**
 * Modal for displaying and managing detected timeline conflicts
 */
export class ConflictListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    conflicts: TimelineConflict[];
    private onRefresh?: () => Promise<void>;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        conflicts: TimelineConflict[],
        onRefresh?: () => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.conflicts = conflicts;
        this.onRefresh = onRefresh;
        this.modalEl.addClass('storyteller-conflict-list-modal', 'storyteller-modal-scroll');
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const headerDiv = contentEl.createDiv('storyteller-conflict-header');
        headerDiv.createEl('h2', { text: 'Timeline conflicts' });

        // Summary stats
        const statsDiv = headerDiv.createDiv('storyteller-conflict-stats');
        const criticalCount = this.conflicts.filter(c => c.severity === 'critical').length;
        const moderateCount = this.conflicts.filter(c => c.severity === 'moderate').length;
        const minorCount = this.conflicts.filter(c => c.severity === 'minor').length;

        const statsGrid = statsDiv.createDiv({ cls: 'storyteller-conflict-stats-grid' });
        this.renderStat(statsGrid, criticalCount, 'Critical', 'critical');
        this.renderStat(statsGrid, moderateCount, 'Moderate', 'moderate');
        this.renderStat(statsGrid, minorCount, 'Minor', 'minor');

        // Toolbar
        const toolbarDiv = contentEl.createDiv('storyteller-conflict-toolbar');
        const toolbarSetting = new Setting(toolbarDiv);

        toolbarSetting.addButton(button => button
            .setButtonText('Re-scan for conflicts')
            .setIcon('refresh-cw')
            .onClick(async () => {
                new Notice('Scanning for conflicts...');
                if (this.onRefresh) {
                    await this.onRefresh();
                }
                this.close();
            })
        );

        toolbarSetting.addButton(button => button
            .setButtonText('Dismiss all')
            .setWarning()
            .onClick(async () => {
                this.conflicts.forEach(c => c.dismissed = true);
                this.plugin.settings.timelineConflicts = this.conflicts;
                await this.plugin.saveSettings();
                new Notice('All conflicts dismissed');
                this.renderConflicts(contentEl);
            })
        );

        // If no conflicts
        if (this.conflicts.length === 0) {
            contentEl.createEl('div', {
                text: 'No timeline conflicts detected! Your narrative is consistent.',
                cls: 'storyteller-no-conflicts'
            }).setCssStyles({
                textAlign: 'center',
                padding: '40px',
                fontSize: '16px',
                color: 'var(--text-success)'
            });
            return;
        }

        // Render conflicts
        this.renderConflicts(contentEl);
    }

    private renderConflicts(contentEl: HTMLElement): void {
        // Remove existing conflicts container if present
        const existingContainer = contentEl.querySelector('.storyteller-conflicts-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const conflictsContainer = contentEl.createDiv('storyteller-conflicts-container');

        // Group conflicts by severity
        const criticalConflicts = this.conflicts.filter(c => c.severity === 'critical' && !c.dismissed);
        const moderateConflicts = this.conflicts.filter(c => c.severity === 'moderate' && !c.dismissed);
        const minorConflicts = this.conflicts.filter(c => c.severity === 'minor' && !c.dismissed);

        // Render each group
        if (criticalConflicts.length > 0) {
            this.renderConflictGroup(conflictsContainer, 'Critical Issues', criticalConflicts, 'critical');
        }
        if (moderateConflicts.length > 0) {
            this.renderConflictGroup(conflictsContainer, 'Moderate Issues', moderateConflicts, 'moderate');
        }
        if (minorConflicts.length > 0) {
            this.renderConflictGroup(conflictsContainer, 'Minor Issues', minorConflicts, 'minor');
        }

        // Show dismissed conflicts count
        const dismissedCount = this.conflicts.filter(c => c.dismissed).length;
        if (dismissedCount > 0) {
            conflictsContainer.createEl('div', {
                text: `${dismissedCount} conflict(s) dismissed`,
                cls: 'storyteller-dismissed-count'
            }).setCssStyles({
                textAlign: 'center',
                padding: '10px',
                opacity: '0.5',
                fontSize: '12px'
            });
        }
    }

    private renderConflictGroup(
        container: HTMLElement,
        title: string,
        conflicts: TimelineConflict[],
        severity: 'critical' | 'moderate' | 'minor'
    ): void {
        const groupDiv = container.createDiv('storyteller-conflict-group');
        groupDiv.createEl('h3', { text: title });

        conflicts.forEach(conflict => {
            this.renderConflict(groupDiv, conflict, severity);
        });
    }

    private renderConflict(
        container: HTMLElement,
        conflict: TimelineConflict,
        severity: 'critical' | 'moderate' | 'minor'
    ): void {
        const conflictDiv = container.createDiv('storyteller-conflict-card');
        conflictDiv.addClass(`storyteller-conflict-${severity}`);

        // Header with icon and type
        const headerDiv = conflictDiv.createDiv('storyteller-conflict-card-header');
        const icon = ConflictDetector.getConflictIcon(conflict.type);
        headerDiv.createSpan({ cls: 'storyteller-conflict-icon', text: icon });
        headerDiv.createEl('strong', { text: `${conflict.type.charAt(0).toUpperCase() + conflict.type.slice(1)} Conflict` });

        // Description
        conflictDiv.createEl('p', {
            text: conflict.description,
            cls: 'storyteller-conflict-description'
        });

        // Affected entities
        if (conflict.entities && conflict.entities.length > 0) {
            const entitiesDiv = conflictDiv.createDiv('storyteller-conflict-entities');
            entitiesDiv.createEl('strong', { text: 'Affected: ' });
            const entityNames = conflict.entities.map(e => e.entityName).join(', ');
            entitiesDiv.createSpan({ text: entityNames });
        }

        // Involved events
        if (conflict.events && conflict.events.length > 0) {
            const eventsDiv = conflictDiv.createDiv('storyteller-conflict-events');
            eventsDiv.createEl('strong', { text: 'Events: ' });
            const eventsList = eventsDiv.createEl('ul');
            eventsList.setCssStyles({ marginLeft: '20px' });
            conflict.events.forEach(eventId => {
                eventsList.createEl('li', { text: eventId });
            });
        }

        // Suggestion
        if (conflict.suggestion) {
            const suggestionDiv = conflictDiv.createDiv('storyteller-conflict-suggestion');
            const suggestionCard = suggestionDiv.createDiv({ cls: 'storyteller-conflict-suggestion-card' });
            suggestionCard.createEl('strong', { text: 'Suggestion:' });
            suggestionCard.createEl('br');
            suggestionCard.createSpan({ text: conflict.suggestion });
        }

        // Actions
        const actionsDiv = conflictDiv.createDiv('storyteller-conflict-actions');
        const actionsSetting = new Setting(actionsDiv);

        actionsSetting.addButton(button => button
            .setButtonText('Dismiss')
            .setClass('mod-warning')
            .onClick(async () => {
                conflict.dismissed = true;
                this.plugin.settings.timelineConflicts = this.conflicts;
                await this.plugin.saveSettings();
                new Notice('Conflict dismissed');
                this.renderConflicts(this.contentEl);
            })
        );

        actionsSetting.addButton(button => button
            .setButtonText('View events')
            .onClick(async () => {
                // Open timeline view filtered to these events
                new Notice('Opening timeline view...');
                // This would require integration with TimelineView
                // For now, just show a notice
                new Notice(`Events: ${conflict.events.join(', ')}`);
            })
        );

        // Timestamp
        const timestamp = conflictDiv.createDiv('storyteller-conflict-timestamp');
        const detectedDate = new Date(conflict.detected);
        timestamp.createDiv({ cls: 'storyteller-conflict-detected-date', text: `Detected: ${detectedDate.toLocaleString()}` });
    }


    private renderStat(container: HTMLElement, count: number, label: string, severity: 'critical' | 'moderate' | 'minor'): void {
        const item = container.createDiv({ cls: 'storyteller-conflict-stat-item' });
        item.createDiv({ cls: `storyteller-conflict-stat-count storyteller-conflict-stat-${severity}`, text: String(count) });
        item.createDiv({ cls: 'storyteller-conflict-stat-label', text: label });
    }
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
