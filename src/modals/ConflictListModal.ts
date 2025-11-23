import { App, Modal, Setting, Notice, ButtonComponent } from 'obsidian';
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
        this.modalEl.addClass('storyteller-conflict-list-modal');
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const headerDiv = contentEl.createDiv('storyteller-conflict-header');
        headerDiv.createEl('h2', { text: 'Timeline Conflicts' });

        // Summary stats
        const statsDiv = headerDiv.createDiv('storyteller-conflict-stats');
        const criticalCount = this.conflicts.filter(c => c.severity === 'critical').length;
        const moderateCount = this.conflicts.filter(c => c.severity === 'moderate').length;
        const minorCount = this.conflicts.filter(c => c.severity === 'minor').length;

        statsDiv.innerHTML = `
            <div style="display: flex; gap: 15px; margin: 10px 0; padding: 10px; background: var(--background-secondary); border-radius: 5px;">
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: var(--text-error);">${criticalCount}</div>
                    <div style="font-size: 12px; opacity: 0.7;">Critical</div>
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: var(--text-warning);">${moderateCount}</div>
                    <div style="font-size: 12px; opacity: 0.7;">Moderate</div>
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: var(--text-muted);">${minorCount}</div>
                    <div style="font-size: 12px; opacity: 0.7;">Minor</div>
                </div>
            </div>
        `;

        // Toolbar
        const toolbarDiv = contentEl.createDiv('storyteller-conflict-toolbar');
        const toolbarSetting = new Setting(toolbarDiv);

        toolbarSetting.addButton(button => button
            .setButtonText('Re-scan for Conflicts')
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
            .setButtonText('Dismiss All')
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
                text: '✅ No timeline conflicts detected! Your narrative is consistent.',
                cls: 'storyteller-no-conflicts'
            }).style.cssText = 'text-align: center; padding: 40px; font-size: 16px; color: var(--text-success);';
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
            }).style.cssText = 'text-align: center; padding: 10px; opacity: 0.5; font-size: 12px;';
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
        headerDiv.innerHTML = `
            <span style="font-size: 20px; margin-right: 10px;">${icon}</span>
            <strong>${conflict.type.charAt(0).toUpperCase() + conflict.type.slice(1)} Conflict</strong>
        `;

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
            eventsList.style.marginLeft = '20px';
            conflict.events.forEach(eventId => {
                eventsList.createEl('li', { text: eventId });
            });
        }

        // Suggestion
        if (conflict.suggestion) {
            const suggestionDiv = conflictDiv.createDiv('storyteller-conflict-suggestion');
            suggestionDiv.innerHTML = `
                <div style="background: var(--background-secondary); padding: 10px; border-radius: 5px; margin-top: 10px;">
                    <strong>💡 Suggestion:</strong><br>
                    ${conflict.suggestion}
                </div>
            `;
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
            .setButtonText('View Events')
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
        timestamp.innerHTML = `
            <div style="font-size: 11px; opacity: 0.5; margin-top: 5px;">
                Detected: ${detectedDate.toLocaleString()}
            </div>
        `;
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
