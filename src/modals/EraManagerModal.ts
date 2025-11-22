import { App, Modal, Setting, Notice } from 'obsidian';
import { TimelineEra, Event } from '../types';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { parseEventDate } from '../utils/DateParsing';

/**
 * Modal for managing timeline eras/periods
 * Allows creating, editing, deleting eras and organizing events into time periods
 */
export class EraManagerModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private eras: TimelineEra[];
    private onSave: (eras: TimelineEra[]) => void;
    private eraListEl: HTMLElement | null = null;
    private events: Event[] = [];

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        eras: TimelineEra[],
        onSave: (eras: TimelineEra[]) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.eras = JSON.parse(JSON.stringify(eras)); // Deep copy
        this.onSave = onSave;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-era-manager');

        // Load events for auto-assignment
        this.events = await this.plugin.listEvents();

        // Title
        contentEl.createEl('h2', { text: t('manageTimelineEras') || 'Manage Timeline Eras & Periods' });

        // Description
        contentEl.createDiv({
            text: 'Organize your timeline into eras, periods, or story arcs. Eras can be nested and events are automatically assigned based on dates.',
            cls: 'storyteller-era-manager-desc'
        });

        // Add era button
        new Setting(contentEl)
            .setName(t('addEra') || 'Add Era')
            .setDesc('Create a new timeline era or period')
            .addButton(btn => btn
                .setButtonText(t('add') || 'Add')
                .setCta()
                .onClick(() => this.addNewEra())
            );

        // Auto-assign events button
        new Setting(contentEl)
            .setName('Auto-Assign Events')
            .setDesc('Automatically assign events to eras based on their dates')
            .addButton(btn => btn
                .setButtonText('Auto-Assign')
                .onClick(() => this.autoAssignEvents())
            );

        // Era list container
        this.eraListEl = contentEl.createDiv({ cls: 'storyteller-era-list' });
        this.renderEraList();

        // Buttons
        const buttonContainer = new Setting(contentEl);
        buttonContainer.addButton(btn => btn
            .setButtonText(t('save') || 'Save')
            .setCta()
            .onClick(() => this.save())
        );
        buttonContainer.addButton(btn => btn
            .setButtonText(t('cancel') || 'Cancel')
            .onClick(() => this.close())
        );

        // Add CSS
        this.addStyles();
    }

    private addNewEra(): void {
        const newEra: TimelineEra = {
            id: `era-${Date.now()}`,
            name: `Era ${this.eras.length + 1}`,
            description: '',
            startDate: '',
            endDate: '',
            color: this.getRandomColor(),
            type: 'period',
            sortOrder: this.eras.length,
            visible: true
        };

        this.eras.push(newEra);
        this.renderEraList();
    }

    private renderEraList(): void {
        if (!this.eraListEl) return;
        this.eraListEl.empty();

        if (this.eras.length === 0) {
            this.eraListEl.createDiv({
                text: 'No eras created yet. Click "Add Era" to create your first timeline period.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Group eras by parent
        const topLevelEras = this.eras.filter(e => !e.parentEraId);
        const childEras = this.eras.filter(e => e.parentEraId);

        topLevelEras
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .forEach(era => {
                this.renderEra(era, 0);
                // Render children
                const children = childEras.filter(c => c.parentEraId === era.id);
                children
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                    .forEach(child => this.renderEra(child, 1));
            });
    }

    private renderEra(era: TimelineEra, level: number): void {
        if (!this.eraListEl) return;

        const eraEl = this.eraListEl.createDiv({ cls: 'storyteller-era-item' });
        if (level > 0) {
            eraEl.style.marginLeft = `${level * 2}em`;
        }

        // Era header
        const headerEl = eraEl.createDiv({ cls: 'storyteller-era-header' });

        // Era color indicator
        const colorIndicator = headerEl.createSpan({ cls: 'storyteller-era-color' });
        colorIndicator.style.backgroundColor = era.color || '#888888';

        // Era name (editable)
        const nameInput = headerEl.createEl('input', {
            type: 'text',
            value: era.name,
            cls: 'storyteller-era-name-input'
        });
        nameInput.addEventListener('change', () => {
            era.name = nameInput.value;
        });

        // Era date range badge
        const dateRangeBadge = headerEl.createSpan({
            cls: 'storyteller-era-date-badge'
        });
        this.updateDateBadge(era, dateRangeBadge);

        // Event count badge
        const eventCount = this.getEventCountForEra(era);
        const eventBadge = headerEl.createSpan({
            text: `${eventCount} event${eventCount !== 1 ? 's' : ''}`,
            cls: 'storyteller-era-event-badge'
        });

        // Visibility toggle
        const visibilityBtn = headerEl.createEl('button', {
            text: era.visible ? '👁' : '👁‍🗨',
            cls: 'storyteller-era-visibility-btn'
        });
        visibilityBtn.addEventListener('click', () => {
            era.visible = !era.visible;
            visibilityBtn.setText(era.visible ? '👁' : '👁‍🗨');
        });

        // Delete button
        const deleteBtn = headerEl.createEl('button', {
            text: '🗑',
            cls: 'storyteller-era-delete-btn'
        });
        deleteBtn.addEventListener('click', () => {
            this.deleteEra(era.id);
        });

        // Era details (collapsible)
        const detailsEl = eraEl.createDiv({ cls: 'storyteller-era-details' });

        // Era type
        new Setting(detailsEl)
            .setName(t('eraType') || 'Era Type')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('act', 'Act')
                    .addOption('arc', 'Story Arc')
                    .addOption('period', 'Time Period')
                    .addOption('season', 'Season')
                    .addOption('chapter', 'Chapter Group')
                    .addOption('custom', 'Custom')
                    .setValue(era.type || 'period')
                    .onChange(value => {
                        era.type = value as TimelineEra['type'];
                    });
            });

        // Start date
        new Setting(detailsEl)
            .setName(t('startDate') || 'Start Date')
            .addText(text => {
                text
                    .setValue(era.startDate)
                    .setPlaceholder('e.g., 2024-01-01, 1500 BCE')
                    .onChange(value => {
                        era.startDate = value;
                        this.updateDateBadge(era, dateRangeBadge);
                    });
            });

        // End date
        new Setting(detailsEl)
            .setName(t('endDate') || 'End Date')
            .addText(text => {
                text
                    .setValue(era.endDate)
                    .setPlaceholder('e.g., 2024-12-31, 1400 BCE')
                    .onChange(value => {
                        era.endDate = value;
                        this.updateDateBadge(era, dateRangeBadge);
                    });
            });

        // Color picker
        new Setting(detailsEl)
            .setName(t('eraColor') || 'Era Color')
            .addColorPicker(color => {
                color
                    .setValue(era.color || '#888888')
                    .onChange(value => {
                        era.color = value;
                        colorIndicator.style.backgroundColor = value;
                    });
            });

        // Description
        new Setting(detailsEl)
            .setName(t('description') || 'Description')
            .addTextArea(text => {
                text
                    .setValue(era.description || '')
                    .onChange(value => {
                        era.description = value;
                    });
                text.inputEl.rows = 2;
            });

        // Parent era (for nested eras)
        if (level === 0) {
            this.renderParentEraSelector(detailsEl, era);
        }

        // Tags
        new Setting(detailsEl)
            .setName(t('tags') || 'Tags')
            .setDesc('Filter events by tags for this era')
            .addText(text => {
                text
                    .setPlaceholder('Tags (comma-separated)')
                    .setValue((era.tags || []).join(', '))
                    .onChange(value => {
                        era.tags = value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                    });
            });
    }

    private renderParentEraSelector(containerEl: HTMLElement, era: TimelineEra): void {
        const parentOptions = this.eras.filter(e => e.id !== era.id && !e.parentEraId);

        new Setting(containerEl)
            .setName('Parent Era')
            .setDesc('Nest this era within another era')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- None (Top Level) --');
                parentOptions.forEach(parent => {
                    dropdown.addOption(parent.id, parent.name);
                });
                dropdown
                    .setValue(era.parentEraId || '')
                    .onChange(value => {
                        era.parentEraId = value || undefined;
                        this.renderEraList(); // Re-render to show nesting
                    });
            });
    }

    private updateDateBadge(era: TimelineEra, badge: HTMLElement): void {
        if (!era.startDate && !era.endDate) {
            badge.setText('No dates');
            badge.addClass('storyteller-era-date-badge-empty');
        } else {
            const start = era.startDate || '?';
            const end = era.endDate || '?';
            badge.setText(`${start} → ${end}`);
            badge.removeClass('storyteller-era-date-badge-empty');
        }
    }

    private getEventCountForEra(era: TimelineEra): number {
        if (!era.startDate || !era.endDate) return 0;

        const startParsed = parseEventDate(era.startDate);
        const endParsed = parseEventDate(era.endDate);

        if (!startParsed.start || !endParsed.start) return 0;

        const startMillis = startParsed.start.toMillis();
        const endMillis = endParsed.start.toMillis();

        return this.events.filter(event => {
            if (!event.dateTime) return false;
            const eventParsed = parseEventDate(event.dateTime);
            if (!eventParsed.start) return false;

            const eventMillis = eventParsed.start.toMillis();
            return eventMillis >= startMillis && eventMillis <= endMillis;
        }).length;
    }

    private autoAssignEvents(): void {
        let assignedCount = 0;

        this.eras.forEach(era => {
            if (!era.startDate || !era.endDate) return;

            const startParsed = parseEventDate(era.startDate);
            const endParsed = parseEventDate(era.endDate);

            if (!startParsed.start || !endParsed.start) return;

            const startMillis = startParsed.start.toMillis();
            const endMillis = endParsed.start.toMillis();

            const eraEventIds: string[] = [];

            this.events.forEach(event => {
                if (!event.dateTime) return;
                const eventParsed = parseEventDate(event.dateTime);
                if (!eventParsed.start) return;

                const eventMillis = eventParsed.start.toMillis();
                if (eventMillis >= startMillis && eventMillis <= endMillis) {
                    eraEventIds.push(event.id || event.name);
                    assignedCount++;
                }
            });

            era.events = eraEventIds;
        });

        this.renderEraList();
        new Notice(`Auto-assigned ${assignedCount} events to eras`);
    }

    private deleteEra(eraId: string): void {
        // Remove children first
        const childEras = this.eras.filter(e => e.parentEraId === eraId);
        childEras.forEach(child => {
            child.parentEraId = undefined;
        });

        this.eras = this.eras.filter(e => e.id !== eraId);

        // Update sort orders
        this.eras.forEach((e, i) => {
            e.sortOrder = i;
        });

        this.renderEraList();
    }

    private save(): void {
        // Validate dates
        for (const era of this.eras) {
            if (era.startDate) {
                const parsed = parseEventDate(era.startDate);
                if (parsed.error) {
                    new Notice(`Invalid start date for "${era.name}": ${parsed.error}`);
                    return;
                }
            }
            if (era.endDate) {
                const parsed = parseEventDate(era.endDate);
                if (parsed.error) {
                    new Notice(`Invalid end date for "${era.name}": ${parsed.error}`);
                    return;
                }
            }
        }

        this.onSave(this.eras);
        new Notice('Timeline eras saved');
        this.close();
    }

    private getRandomColor(): string {
        const colors = [
            '#FF6B6B44', '#4ECDC444', '#45B7D144', '#FFA07A44', '#98D8C844',
            '#F7B73144', '#5F27CD44', '#00D2D344', '#FF9FF344', '#54A0FF44',
            '#48DBFB44', '#1DD1A144', '#10AC8444', '#EE5A6F44', '#C4456944'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    private addStyles(): void {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .storyteller-era-manager {
                padding: 1em;
            }

            .storyteller-era-manager-desc {
                margin-bottom: 1.5em;
                color: var(--text-muted);
                font-size: 0.9em;
            }

            .storyteller-era-list {
                max-height: 60vh;
                overflow-y: auto;
                margin: 1em 0;
            }

            .storyteller-era-item {
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin-bottom: 1em;
                background: var(--background-secondary);
            }

            .storyteller-era-header {
                display: flex;
                align-items: center;
                padding: 0.75em;
                gap: 0.5em;
                background: var(--background-primary);
                border-bottom: 1px solid var(--background-modifier-border);
                border-radius: 6px 6px 0 0;
                flex-wrap: wrap;
            }

            .storyteller-era-color {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: 2px solid var(--background-modifier-border);
            }

            .storyteller-era-name-input {
                flex: 1;
                min-width: 150px;
                border: none;
                background: transparent;
                font-weight: 600;
                font-size: 1em;
                color: var(--text-normal);
            }

            .storyteller-era-name-input:focus {
                outline: none;
                background: var(--background-secondary);
                padding: 0.25em 0.5em;
                border-radius: 3px;
            }

            .storyteller-era-date-badge {
                background: var(--background-modifier-border);
                padding: 0.25em 0.5em;
                border-radius: 3px;
                font-size: 0.85em;
                color: var(--text-muted);
            }

            .storyteller-era-date-badge-empty {
                opacity: 0.5;
            }

            .storyteller-era-event-badge {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                padding: 0.25em 0.5em;
                border-radius: 3px;
                font-size: 0.85em;
            }

            .storyteller-era-visibility-btn,
            .storyteller-era-delete-btn {
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 1.1em;
                padding: 0.25em 0.5em;
                border-radius: 3px;
            }

            .storyteller-era-visibility-btn:hover,
            .storyteller-era-delete-btn:hover {
                background: var(--background-modifier-hover);
            }

            .storyteller-era-details {
                padding: 1em;
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
