import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
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
        this.eras = structuredClone(eras);
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
            .setName('Auto-assign events')
            .setDesc('Automatically assign events to eras based on their dates')
            .addButton(btn => btn
                .setButtonText('Auto-assign')
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
        // Styles are loaded from styles.css.
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
            eraEl.setCssStyles({ marginLeft: `${level * 2}em` });
        }

        // Era header
        const headerEl = eraEl.createDiv({ cls: 'storyteller-era-header' });

        // Era color indicator
        const colorIndicator = headerEl.createSpan({ cls: 'storyteller-era-color' });
        colorIndicator.setCssStyles({ backgroundColor: era.color || '#888888' });

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
        headerEl.createSpan({
            text: `${eventCount} event${eventCount !== 1 ? 's' : ''}`,
            cls: 'storyteller-era-event-badge'
        });

        // Visibility toggle
        const visibilityBtn = headerEl.createEl('button', {
            cls: 'storyteller-era-visibility-btn'
        });
        setIcon(visibilityBtn, era.visible ? 'eye' : 'eye-off');
        visibilityBtn.addEventListener('click', () => {
            era.visible = !era.visible;
            setIcon(visibilityBtn, era.visible ? 'eye' : 'eye-off');
        });

        // Delete button
        const deleteBtn = headerEl.createEl('button', {
            cls: 'storyteller-era-delete-btn'
        });
        setIcon(deleteBtn, 'trash');
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
                    .addOption('arc', 'Story arc')
                    .addOption('period', 'Time period')
                    .addOption('season', 'Season')
                    .addOption('chapter', 'Chapter group')
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
                    .setPlaceholder('E.g., 2024-01-01, 1500 bce')
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
                    .setPlaceholder('E.g., 2024-12-31, 1400 bce')
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
                        colorIndicator.setCssStyles({ backgroundColor: value });
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
            .setName('Parent era')
            .setDesc('Nest this era within another era')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- none (top level) --');
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
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
