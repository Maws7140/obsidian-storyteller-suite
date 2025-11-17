import { App, Modal, Setting, Notice } from 'obsidian';
import { TimelineTrack } from '../types';
import StorytellerSuitePlugin from '../main';
import { TimelineTrackModal } from './TimelineTrackModal';
import { TimelineTrackManager } from '../utils/TimelineTrackManager';

export class TrackListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    private tracks: TimelineTrack[];
    private listContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.tracks = plugin.settings.timelineTracks || [];
        this.modalEl.addClass('storyteller-track-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Timeline Tracks' });

        contentEl.createEl('p', {
            text: 'Create custom timeline views filtered to specific characters, locations, or criteria. Switch between tracks using the track selector in the timeline toolbar.',
            cls: 'storyteller-modal-description'
        });

        // Create New Track Button
        const headerContainer = contentEl.createDiv('storyteller-list-header');
        headerContainer.createEl('button', {
            text: '+ Create New Track',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', () => {
                this.openTrackModal(null);
            });
        });

        // Track count
        headerContainer.createEl('span', {
            text: `${this.tracks.length} track${this.tracks.length !== 1 ? 's' : ''}`,
            cls: 'storyteller-list-count'
        });

        // List Container
        this.listContainer = contentEl.createDiv('storyteller-track-list');
        this.renderTrackList();

        // Close button
        const buttonContainer = contentEl.createDiv('storyteller-modal-buttons');
        buttonContainer.createEl('button', { text: 'Close' }, btn => {
            btn.addEventListener('click', () => {
                this.close();
            });
        });
    }

    private renderTrackList() {
        this.listContainer.empty();

        if (this.tracks.length === 0) {
            this.listContainer.createEl('p', {
                text: 'No tracks created yet. Click "Create New Track" to get started.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        // Sort tracks by sort order and name
        const sortedTracks = [...this.tracks].sort((a, b) => {
            const orderA = a.sortOrder ?? 999;
            const orderB = b.sortOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
        });

        for (const track of sortedTracks) {
            const trackCard = this.listContainer.createDiv('storyteller-track-card');

            // Color indicator
            const colorBar = trackCard.createDiv('storyteller-track-color-bar');
            if (track.color) {
                colorBar.style.backgroundColor = track.color;
            }

            // Track content
            const trackContent = trackCard.createDiv('storyteller-track-content');

            // Header row
            const headerRow = trackContent.createDiv('storyteller-track-header');
            headerRow.createEl('h3', { text: track.name });

            if (!track.visible) {
                headerRow.createEl('span', {
                    text: '(Hidden)',
                    cls: 'storyteller-track-hidden-badge'
                });
            }

            if (track.type && track.type !== 'custom') {
                headerRow.createEl('span', {
                    text: track.type.charAt(0).toUpperCase() + track.type.slice(1),
                    cls: 'storyteller-track-type-badge'
                });
            }

            // Description (if present)
            if (track.description) {
                trackContent.createDiv('storyteller-track-description', div => {
                    const desc = track.description!.length > 100
                        ? track.description!.slice(0, 100) + '...'
                        : track.description!;
                    div.createSpan({ text: desc });
                });
            }

            // Filter criteria summary
            if (track.filterCriteria) {
                const criteriaDiv = trackContent.createDiv('storyteller-track-criteria');
                criteriaDiv.createEl('strong', { text: 'Filters: ' });

                const criteria: string[] = [];
                if (track.filterCriteria.characters && track.filterCriteria.characters.length > 0) {
                    criteria.push(`Characters: ${track.filterCriteria.characters.join(', ')}`);
                }
                if (track.filterCriteria.locations && track.filterCriteria.locations.length > 0) {
                    criteria.push(`Locations: ${track.filterCriteria.locations.join(', ')}`);
                }
                if (track.filterCriteria.groups && track.filterCriteria.groups.length > 0) {
                    criteria.push(`Groups: ${track.filterCriteria.groups.join(', ')}`);
                }
                if (track.filterCriteria.tags && track.filterCriteria.tags.length > 0) {
                    criteria.push(`Tags: ${track.filterCriteria.tags.join(', ')}`);
                }
                if (track.filterCriteria.milestonesOnly) {
                    criteria.push('Milestones only');
                }

                if (criteria.length > 0) {
                    criteriaDiv.createSpan({ text: criteria.join(' • ') });
                } else {
                    criteriaDiv.createSpan({ text: 'No filters (shows all events)', cls: 'storyteller-track-no-filters' });
                }
            }

            // Event count (async)
            const validation = TimelineTrackManager.validateTrack(track);
            if (validation.valid) {
                const events = this.plugin.listEvents ? (async () => {
                    const allEvents = await this.plugin.listEvents();
                    return TimelineTrackManager.getEventsForTrack(track, allEvents);
                })() : Promise.resolve([]);

                events.then(eventsInTrack => {
                    trackContent.createDiv('storyteller-track-events', div => {
                        div.createEl('strong', { text: 'Events: ' });
                        div.createSpan({ text: eventsInTrack.length.toString() });
                    });
                });
            } else {
                trackContent.createDiv('storyteller-track-error', div => {
                    div.createEl('strong', { text: '⚠️ Invalid: ' });
                    div.createSpan({ text: validation.errors.join(', ') });
                });
            }

            // Action buttons
            const actionRow = trackContent.createDiv('storyteller-track-actions');

            actionRow.createEl('button', {
                text: 'Edit',
                cls: 'storyteller-track-action-btn'
            }, btn => {
                btn.addEventListener('click', () => {
                    this.openTrackModal(track);
                });
            });

            actionRow.createEl('button', {
                text: track.visible === false ? 'Show' : 'Hide',
                cls: 'storyteller-track-action-btn'
            }, btn => {
                btn.addEventListener('click', async () => {
                    track.visible = track.visible === false ? true : false;
                    await this.plugin.updateTimelineTrack(track);
                    this.renderTrackList();
                });
            });

            actionRow.createEl('button', {
                text: 'Delete',
                cls: 'storyteller-track-action-btn mod-warning'
            }, btn => {
                btn.addEventListener('click', async () => {
                    const confirm = await this.confirmDelete(track.name);
                    if (confirm) {
                        await this.plugin.deleteTimelineTrack(track.id);
                        this.tracks = this.plugin.settings.timelineTracks || [];
                        this.renderTrackList();
                    }
                });
            });
        }
    }

    private openTrackModal(track: TimelineTrack | null) {
        const modal = new TimelineTrackModal(
            this.app,
            this.plugin,
            track,
            async (updatedTrack) => {
                if (track) {
                    // Update existing track
                    await this.plugin.updateTimelineTrack(updatedTrack);
                } else {
                    // Create new track
                    await this.plugin.createTimelineTrack(updatedTrack);
                }
                // Refresh the list
                this.tracks = this.plugin.settings.timelineTracks || [];
                this.renderTrackList();
            },
            async (trackToDelete) => {
                await this.plugin.deleteTimelineTrack(trackToDelete.id);
                this.tracks = this.plugin.settings.timelineTracks || [];
                this.renderTrackList();
            }
        );
        modal.open();
    }

    private async confirmDelete(trackName: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const confirmModal = new Modal(this.app);
            confirmModal.contentEl.createEl('h3', { text: 'Delete Track?' });
            confirmModal.contentEl.createEl('p', {
                text: `Are you sure you want to delete "${trackName}"? This action cannot be undone.`
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
