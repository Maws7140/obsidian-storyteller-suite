import { App, Modal, Setting, Notice } from 'obsidian';
import { TimelineEra } from '../types';
import StorytellerSuitePlugin from '../main';
import { EraModal } from './EraModal';
import { EraManager } from '../utils/EraManager';

export class EraListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    private eras: TimelineEra[];
    private listContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.eras = plugin.settings.timelineEras || [];
        this.modalEl.addClass('storyteller-era-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Timeline Eras & Periods' });

        contentEl.createEl('p', {
            text: 'Organize your timeline into acts, arcs, or historical periods. Eras display as colored backgrounds on the timeline.',
            cls: 'storyteller-modal-description'
        });

        // Create New Era Button
        const headerContainer = contentEl.createDiv('storyteller-list-header');
        headerContainer.createEl('button', {
            text: '+ Create New Era',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', () => {
                this.openEraModal(null);
            });
        });

        // Era count
        headerContainer.createEl('span', {
            text: `${this.eras.length} era${this.eras.length !== 1 ? 's' : ''}`,
            cls: 'storyteller-list-count'
        });

        // List Container
        this.listContainer = contentEl.createDiv('storyteller-era-list');
        this.renderEraList();

        // Close button
        const buttonContainer = contentEl.createDiv('storyteller-modal-buttons');
        buttonContainer.createEl('button', { text: 'Close' }, btn => {
            btn.addEventListener('click', () => {
                this.close();
            });
        });
    }

    private renderEraList() {
        this.listContainer.empty();

        if (this.eras.length === 0) {
            this.listContainer.createEl('p', {
                text: 'No eras created yet. Click "Create New Era" to get started.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Sort eras by start date
        const sortedEras = EraManager.getVisibleEras([...this.eras, ...this.eras.filter(e => e.visible === false)]);

        for (const era of sortedEras) {
            const eraCard = this.listContainer.createDiv('storyteller-era-card');

            // Color indicator
            const colorBar = eraCard.createDiv('storyteller-era-color-bar');
            if (era.color) {
                colorBar.style.backgroundColor = era.color;
            }

            // Era content
            const eraContent = eraCard.createDiv('storyteller-era-content');

            // Header row
            const headerRow = eraContent.createDiv('storyteller-era-header');
            headerRow.createEl('h3', { text: era.name });

            if (!era.visible) {
                headerRow.createEl('span', {
                    text: '(Hidden)',
                    cls: 'storyteller-era-hidden-badge'
                });
            }

            if (era.type && era.type !== 'custom') {
                headerRow.createEl('span', {
                    text: era.type.charAt(0).toUpperCase() + era.type.slice(1),
                    cls: 'storyteller-era-type-badge'
                });
            }

            // Date range
            eraContent.createDiv('storyteller-era-dates', div => {
                div.createEl('strong', { text: 'Period: ' });
                div.createSpan({ text: `${era.startDate} → ${era.endDate}` });
            });

            // Duration
            const validation = EraManager.validateEra(era);
            if (validation.valid) {
                eraContent.createDiv('storyteller-era-duration', div => {
                    div.createEl('strong', { text: 'Duration: ' });
                    div.createSpan({ text: EraManager.getEraDuration(era) });
                });
            } else {
                eraContent.createDiv('storyteller-era-error', div => {
                    div.createEl('strong', { text: '⚠️ Invalid: ' });
                    div.createSpan({ text: validation.errors.join(', ') });
                });
            }

            // Description (if present)
            if (era.description) {
                eraContent.createDiv('storyteller-era-description', div => {
                    const desc = era.description && era.description.length > 100
                        ? era.description.slice(0, 100) + '...'
                        : era.description || '';
                    div.createSpan({ text: desc });
                });
            }

            // Event count
            const events = this.plugin.listEvents ? (async () => {
                const allEvents = await this.plugin.listEvents();
                return EraManager.getEventsInEra(era, allEvents);
            })() : Promise.resolve([]);

            events.then(eventsInEra => {
                eraContent.createDiv('storyteller-era-events', div => {
                    div.createEl('strong', { text: 'Events: ' });
                    div.createSpan({ text: eventsInEra.length.toString() });
                });
            });

            // Action buttons
            const actionRow = eraContent.createDiv('storyteller-era-actions');

            actionRow.createEl('button', {
                text: 'Edit',
                cls: 'storyteller-era-action-btn'
            }, btn => {
                btn.addEventListener('click', () => {
                    this.openEraModal(era);
                });
            });

            actionRow.createEl('button', {
                text: era.visible === false ? 'Show' : 'Hide',
                cls: 'storyteller-era-action-btn'
            }, btn => {
                btn.addEventListener('click', async () => {
                    era.visible = era.visible === false ? true : false;
                    await this.plugin.updateTimelineEra(era);
                    this.renderEraList();
                });
            });

            actionRow.createEl('button', {
                text: 'Delete',
                cls: 'storyteller-era-action-btn mod-warning'
            }, btn => {
                btn.addEventListener('click', async () => {
                    const confirm = await this.confirmDelete(era.name);
                    if (confirm) {
                        await this.plugin.deleteTimelineEra(era.id);
                        this.eras = this.plugin.settings.timelineEras || [];
                        this.renderEraList();
                    }
                });
            });
        }
    }

    private openEraModal(era: TimelineEra | null) {
        const modal = new EraModal(
            this.app,
            this.plugin,
            era,
            async (updatedEra) => {
                if (era) {
                    // Update existing era
                    await this.plugin.updateTimelineEra(updatedEra);
                } else {
                    // Create new era
                    await this.plugin.createTimelineEra(updatedEra);
                }
                // Refresh the list
                this.eras = this.plugin.settings.timelineEras || [];
                this.renderEraList();
            },
            async (eraToDelete) => {
                await this.plugin.deleteTimelineEra(eraToDelete.id);
                this.eras = this.plugin.settings.timelineEras || [];
                this.renderEraList();
            }
        );
        modal.open();
    }

    private async confirmDelete(eraName: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const confirmModal = new Modal(this.app);
            confirmModal.contentEl.createEl('h3', { text: 'Delete Era?' });
            confirmModal.contentEl.createEl('p', {
                text: `Are you sure you want to delete "${eraName}"? This action cannot be undone.`
            });

            const btnContainer = confirmModal.contentEl.createDiv('modal-button-container');
            btnContainer.createEl('button', { text: 'Cancel' }, cancelBtn => {
                cancelBtn.addEventListener('click', () => {
                    resolve(false);
                    confirmModal.close();
                });
            });
            btnContainer.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning'
            }, deleteBtn => {
                deleteBtn.addEventListener('click', () => {
                    resolve(true);
                    confirmModal.close();
                });
            });

            confirmModal.open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
