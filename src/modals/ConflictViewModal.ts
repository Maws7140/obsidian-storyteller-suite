import { App, Modal, Setting, Notice } from 'obsidian';
import { DetectedConflict, ConflictDetector } from '../utils/ConflictDetector';
import { Event } from '../types';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';

/**
 * Modal for viewing and managing timeline conflicts
 * Shows detected conflicts grouped by type and severity
 */
export class ConflictViewModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private conflicts: DetectedConflict[];
    private filteredConflicts: DetectedConflict[];
    private selectedSeverity: 'all' | 'error' | 'warning' | 'info' = 'all';
    private selectedType: 'all' | 'location' | 'character' | 'temporal' | 'dependency' = 'all';
    private conflictListEl: HTMLElement | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        conflicts: DetectedConflict[]
    ) {
        super(app);
        this.plugin = plugin;
        this.conflicts = conflicts;
        this.filteredConflicts = conflicts;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-conflict-viewer');

        // Title
        contentEl.createEl('h2', { text: 'Timeline Conflicts' });

        // Summary stats
        this.renderSummary(contentEl);

        // Filters
        this.renderFilters(contentEl);

        // Export button
        new Setting(contentEl)
            .setName('Export Report')
            .setDesc('Generate a markdown report of all conflicts')
            .addButton(btn => btn
                .setButtonText('Export')
                .onClick(() => this.exportReport())
            );

        // Conflict list container
        this.conflictListEl = contentEl.createDiv({ cls: 'storyteller-conflict-list' });
        this.renderConflictList();

        // Close button
        const buttonContainer = new Setting(contentEl);
        buttonContainer.addButton(btn => btn
            .setButtonText(t('close') || 'Close')
            .onClick(() => this.close())
        );

        // Add CSS
        this.addStyles();
    }

    private renderSummary(containerEl: HTMLElement): void {
        const summaryEl = containerEl.createDiv({ cls: 'storyteller-conflict-summary' });

        const errors = this.conflicts.filter(c => c.severity === 'error');
        const warnings = this.conflicts.filter(c => c.severity === 'warning');
        const info = this.conflicts.filter(c => c.severity === 'info');

        summaryEl.createEl('div', {
            text: `Total: ${this.conflicts.length}`,
            cls: 'storyteller-conflict-stat'
        });

        if (errors.length > 0) {
            summaryEl.createEl('div', {
                text: `Errors: ${errors.length}`,
                cls: 'storyteller-conflict-stat storyteller-conflict-error'
            });
        }

        if (warnings.length > 0) {
            summaryEl.createEl('div', {
                text: `Warnings: ${warnings.length}`,
                cls: 'storyteller-conflict-stat storyteller-conflict-warning'
            });
        }

        if (info.length > 0) {
            summaryEl.createEl('div', {
                text: `Info: ${info.length}`,
                cls: 'storyteller-conflict-stat storyteller-conflict-info'
            });
        }

        if (this.conflicts.length === 0) {
            summaryEl.createEl('div', {
                text: '✓ No conflicts detected',
                cls: 'storyteller-conflict-none'
            });
        }
    }

    private renderFilters(containerEl: HTMLElement): void {
        const filtersEl = containerEl.createDiv({ cls: 'storyteller-conflict-filters' });

        // Severity filter
        new Setting(filtersEl)
            .setName('Filter by Severity')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('all', 'All')
                    .addOption('error', 'Errors Only')
                    .addOption('warning', 'Warnings Only')
                    .addOption('info', 'Info Only')
                    .setValue(this.selectedSeverity)
                    .onChange(value => {
                        this.selectedSeverity = value as any;
                        this.applyFilters();
                    });
            });

        // Type filter
        new Setting(filtersEl)
            .setName('Filter by Type')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('all', 'All Types')
                    .addOption('location', 'Location Conflicts')
                    .addOption('character', 'Character Conflicts')
                    .addOption('temporal', 'Temporal Conflicts')
                    .addOption('dependency', 'Dependency Conflicts')
                    .setValue(this.selectedType)
                    .onChange(value => {
                        this.selectedType = value as any;
                        this.applyFilters();
                    });
            });
    }

    private applyFilters(): void {
        let filtered = this.conflicts;

        // Apply severity filter
        if (this.selectedSeverity !== 'all') {
            filtered = ConflictDetector.getConflictsBySeverity(this.selectedSeverity, filtered);
        }

        // Apply type filter
        if (this.selectedType !== 'all') {
            filtered = ConflictDetector.getConflictsByType(this.selectedType, filtered);
        }

        this.filteredConflicts = filtered;
        this.renderConflictList();
    }

    private renderConflictList(): void {
        if (!this.conflictListEl) return;
        this.conflictListEl.empty();

        if (this.filteredConflicts.length === 0) {
            this.conflictListEl.createDiv({
                text: 'No conflicts match the selected filters.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Group by type
        const grouped = this.groupConflictsByType(this.filteredConflicts);

        for (const [type, typeConflicts] of Object.entries(grouped)) {
            if (typeConflicts.length === 0) continue;

            const typeSection = this.conflictListEl.createDiv({
                cls: 'storyteller-conflict-type-section'
            });

            typeSection.createEl('h3', {
                text: `${this.capitalize(type)} Conflicts (${typeConflicts.length})`
            });

            typeConflicts.forEach(conflict => {
                this.renderConflict(typeSection, conflict);
            });
        }
    }

    private renderConflict(containerEl: HTMLElement, conflict: DetectedConflict): void {
        const conflictEl = containerEl.createDiv({
            cls: `storyteller-conflict-item storyteller-conflict-${conflict.severity}`
        });

        // Header with severity badge
        const headerEl = conflictEl.createDiv({ cls: 'storyteller-conflict-header' });

        const severityBadge = headerEl.createSpan({
            text: conflict.severity.toUpperCase(),
            cls: `storyteller-conflict-badge storyteller-conflict-badge-${conflict.severity}`
        });

        const messageEl = headerEl.createSpan({
            text: conflict.message,
            cls: 'storyteller-conflict-message'
        });

        // Details
        const detailsEl = conflictEl.createDiv({ cls: 'storyteller-conflict-details' });

        if (conflict.character) {
            detailsEl.createEl('div', {
                text: `Character: ${conflict.character}`,
                cls: 'storyteller-conflict-detail'
            });
        }

        if (conflict.details.description) {
            detailsEl.createEl('div', {
                text: conflict.details.description,
                cls: 'storyteller-conflict-description'
            });
        }

        // Involved events
        if (conflict.events.length > 0) {
            const eventsEl = detailsEl.createDiv({ cls: 'storyteller-conflict-events' });
            eventsEl.createEl('strong', { text: 'Involved Events:' });

            const eventList = eventsEl.createEl('ul');
            conflict.events.forEach(event => {
                const eventItem = eventList.createEl('li');
                const eventLink = eventItem.createEl('a', {
                    text: event.name,
                    cls: 'storyteller-conflict-event-link'
                });
                eventLink.addEventListener('click', () => {
                    this.openEvent(event);
                });

                if (event.dateTime) {
                    eventItem.createSpan({
                        text: ` (${event.dateTime})`,
                        cls: 'storyteller-conflict-event-date'
                    });
                }

                if (event.location) {
                    eventItem.createSpan({
                        text: ` @ ${event.location}`,
                        cls: 'storyteller-conflict-event-location'
                    });
                }
            });
        }

        // Time overlap details
        if (conflict.details.timeOverlap) {
            const overlap = conflict.details.timeOverlap;
            detailsEl.createEl('div', {
                text: `Overlap: ${overlap.start.toLocaleString()} - ${overlap.end.toLocaleString()}`,
                cls: 'storyteller-conflict-overlap'
            });
        }

        // Locations (for location conflicts)
        if (conflict.details.locations && conflict.details.locations.length > 0) {
            detailsEl.createEl('div', {
                text: `Locations: ${conflict.details.locations.join(', ')}`,
                cls: 'storyteller-conflict-locations'
            });
        }
    }

    private groupConflictsByType(conflicts: DetectedConflict[]): Record<string, DetectedConflict[]> {
        return {
            location: conflicts.filter(c => c.type === 'location'),
            character: conflicts.filter(c => c.type === 'character'),
            temporal: conflicts.filter(c => c.type === 'temporal'),
            dependency: conflicts.filter(c => c.type === 'dependency')
        };
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    private async openEvent(event: Event): Promise<void> {
        // Close this modal
        this.close();

        // Find and open the event file
        const file = this.app.vault.getAbstractFileByPath(event.filePath || '');
        if (file) {
            await this.app.workspace.openLinkText(event.filePath || '', '', false);
        } else {
            new Notice(`Could not find file for event: ${event.name}`);
        }
    }

    private async exportReport(): Promise<void> {
        const report = ConflictDetector.generateConflictReport(this.conflicts);

        // Create a new note with the report
        const fileName = `Timeline Conflict Report ${new Date().toISOString().split('T')[0]}.md`;
        const filePath = `${fileName}`;

        try {
            await this.app.vault.create(filePath, report);
            new Notice(`Conflict report exported to ${fileName}`);
        } catch (error) {
            new Notice(`Failed to export report: ${error}`);
        }
    }

    private addStyles(): void {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .storyteller-conflict-viewer {
                padding: 1em;
                max-width: 800px;
            }

            .storyteller-conflict-summary {
                display: flex;
                gap: 1em;
                margin-bottom: 1.5em;
                padding: 1em;
                background: var(--background-secondary);
                border-radius: 6px;
                flex-wrap: wrap;
            }

            .storyteller-conflict-stat {
                padding: 0.5em 1em;
                border-radius: 4px;
                background: var(--background-primary);
                font-weight: 600;
            }

            .storyteller-conflict-error {
                color: var(--text-error);
                border-left: 3px solid var(--text-error);
            }

            .storyteller-conflict-warning {
                color: var(--text-warning);
                border-left: 3px solid var(--text-warning);
            }

            .storyteller-conflict-info {
                color: var(--text-accent);
                border-left: 3px solid var(--text-accent);
            }

            .storyteller-conflict-none {
                color: var(--text-success);
                font-weight: 600;
                width: 100%;
                text-align: center;
                padding: 1em;
            }

            .storyteller-conflict-filters {
                margin-bottom: 1.5em;
            }

            .storyteller-conflict-list {
                max-height: 60vh;
                overflow-y: auto;
            }

            .storyteller-conflict-type-section {
                margin-bottom: 2em;
            }

            .storyteller-conflict-type-section h3 {
                margin-bottom: 1em;
                color: var(--text-accent);
            }

            .storyteller-conflict-item {
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin-bottom: 1em;
                padding: 1em;
                background: var(--background-secondary);
            }

            .storyteller-conflict-item.storyteller-conflict-error {
                border-left: 4px solid var(--text-error);
            }

            .storyteller-conflict-item.storyteller-conflict-warning {
                border-left: 4px solid var(--text-warning);
            }

            .storyteller-conflict-item.storyteller-conflict-info {
                border-left: 4px solid var(--text-accent);
            }

            .storyteller-conflict-header {
                display: flex;
                align-items: center;
                gap: 0.75em;
                margin-bottom: 0.75em;
            }

            .storyteller-conflict-badge {
                padding: 0.25em 0.5em;
                border-radius: 3px;
                font-size: 0.75em;
                font-weight: 700;
                letter-spacing: 0.5px;
            }

            .storyteller-conflict-badge-error {
                background: var(--text-error);
                color: white;
            }

            .storyteller-conflict-badge-warning {
                background: var(--text-warning);
                color: var(--text-on-accent);
            }

            .storyteller-conflict-badge-info {
                background: var(--text-accent);
                color: var(--text-on-accent);
            }

            .storyteller-conflict-message {
                font-weight: 600;
                flex: 1;
            }

            .storyteller-conflict-details {
                margin-left: 0.5em;
                color: var(--text-muted);
            }

            .storyteller-conflict-detail,
            .storyteller-conflict-description,
            .storyteller-conflict-overlap,
            .storyteller-conflict-locations {
                margin-bottom: 0.5em;
                font-size: 0.9em;
            }

            .storyteller-conflict-events {
                margin-top: 0.75em;
            }

            .storyteller-conflict-events ul {
                margin-top: 0.5em;
                margin-left: 1.5em;
            }

            .storyteller-conflict-events li {
                margin-bottom: 0.25em;
            }

            .storyteller-conflict-event-link {
                cursor: pointer;
                color: var(--link-color);
                text-decoration: none;
            }

            .storyteller-conflict-event-link:hover {
                text-decoration: underline;
            }

            .storyteller-conflict-event-date,
            .storyteller-conflict-event-location {
                font-size: 0.85em;
                color: var(--text-muted);
            }

            .storyteller-empty-state {
                text-align: center;
                padding: 3em;
                color: var(--text-muted);
                font-style: italic;
            }
        `;
        this.contentEl.appendChild(styleEl);
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
