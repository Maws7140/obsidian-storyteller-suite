import { App, Modal, Setting, Notice, DropdownComponent } from 'obsidian';
import { TimelineTrack } from '../types';
import StorytellerSuitePlugin from '../main';
import { TimelineTrackManager } from '../utils/TimelineTrackManager';

export type TrackModalSubmitCallback = (track: TimelineTrack) => Promise<void>;
export type TrackModalDeleteCallback = (track: TimelineTrack) => Promise<void>;

export class TimelineTrackModal extends Modal {
    track: TimelineTrack;
    plugin: StorytellerSuitePlugin;
    onSubmit: TrackModalSubmitCallback;
    onDelete?: TrackModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        track: TimelineTrack | null,
        onSubmit: TrackModalSubmitCallback,
        onDelete?: TrackModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = track === null;

        // Initialize with default values for new track
        const initialTrack: TimelineTrack = track ? { ...track } : {
            id: `track-${Date.now()}`,
            name: '',
            type: 'custom',
            description: '',
            color: TimelineTrackManager.generateTrackColor(0),
            filterCriteria: {},
            sortOrder: 0,
            visible: true
        };

        this.track = initialTrack;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-track-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Timeline Track' : `Edit Track: ${this.track.name}`
        });

        // Name
        new Setting(contentEl)
            .setName('Track Name')
            .setDesc('Name of this timeline track')
            .addText(text => text
                .setPlaceholder('e.g., "Main Character", "Political Events", "Location: Castle"')
                .setValue(this.track.name)
                .onChange(value => {
                    this.track.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large'));

        // Type
        new Setting(contentEl)
            .setName('Track Type')
            .setDesc('Category of this track')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('global', 'Global (All Events)')
                    .addOption('character', 'Character-Specific')
                    .addOption('location', 'Location-Specific')
                    .addOption('group', 'Group-Specific')
                    .addOption('custom', 'Custom Filter')
                    .setValue(this.track.type || 'custom')
                    .onChange(value => {
                        this.track.type = value as TimelineTrack['type'];
                    });
            });

        // Entity ID (for character/location/group types)
        if (this.track.type && ['character', 'location', 'group'].includes(this.track.type)) {
            new Setting(contentEl)
                .setName('Entity ID')
                .setDesc(`ID of the ${this.track.type} this track is for`)
                .addText(text => text
                    .setPlaceholder('Enter entity ID')
                    .setValue(this.track.entityId || '')
                    .onChange(value => {
                        this.track.entityId = value || undefined;
                    }));
        }

        // Color
        new Setting(contentEl)
            .setName('Track Color')
            .setDesc('Color for this track (hex or CSS color)')
            .addText(text => {
                text
                    .setPlaceholder('#RRGGBB or hsl(h, s%, l%)')
                    .setValue(this.track.color || '')
                    .onChange(value => {
                        this.track.color = value || TimelineTrackManager.generateTrackColor(0);
                    });
                text.inputEl.style.width = '150px';
            })
            .addButton(button => button
                .setButtonText('Random')
                .setTooltip('Generate random color')
                .onClick(() => {
                    const randomColor = TimelineTrackManager.generateTrackColor(Math.floor(Math.random() * 10));
                    this.track.color = randomColor;
                    const inputEl = contentEl.querySelector('input[placeholder*="RRGGBB"]') as HTMLInputElement;
                    if (inputEl) {
                        inputEl.value = randomColor;
                    }
                    new Notice(`Color set to ${randomColor}`);
                }));

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('What this track shows')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('Describe what events should appear in this track...')
                    .setValue(this.track.description || '')
                    .onChange(value => {
                        this.track.description = value || undefined;
                    });
                text.inputEl.rows = 3;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // Filter Criteria Section
        contentEl.createEl('h3', { text: 'Filter Criteria' });
        contentEl.createEl('p', {
            text: 'Define which events should appear in this track. Events matching ANY of the selected criteria will be included.',
            cls: 'storyteller-modal-description'
        });

        if (!this.track.filterCriteria) {
            this.track.filterCriteria = {};
        }

        // Character filter
        new Setting(contentEl)
            .setName('Characters')
            .setDesc('Show events with these characters (comma-separated)')
            .addText(text => text
                .setPlaceholder('character1, character2')
                .setValue(this.track.filterCriteria?.characters?.join(', ') || '')
                .onChange(value => {
                    if (!this.track.filterCriteria) this.track.filterCriteria = {};
                    this.track.filterCriteria.characters = value
                        ? value.split(',').map(s => s.trim()).filter(s => s)
                        : undefined;
                }));

        // Location filter
        new Setting(contentEl)
            .setName('Locations')
            .setDesc('Show events at these locations (comma-separated)')
            .addText(text => text
                .setPlaceholder('location1, location2')
                .setValue(this.track.filterCriteria?.locations?.join(', ') || '')
                .onChange(value => {
                    if (!this.track.filterCriteria) this.track.filterCriteria = {};
                    this.track.filterCriteria.locations = value
                        ? value.split(',').map(s => s.trim()).filter(s => s)
                        : undefined;
                }));

        // Group filter
        new Setting(contentEl)
            .setName('Groups')
            .setDesc('Show events in these groups (comma-separated)')
            .addText(text => text
                .setPlaceholder('group1, group2')
                .setValue(this.track.filterCriteria?.groups?.join(', ') || '')
                .onChange(value => {
                    if (!this.track.filterCriteria) this.track.filterCriteria = {};
                    this.track.filterCriteria.groups = value
                        ? value.split(',').map(s => s.trim()).filter(s => s)
                        : undefined;
                }));

        // Tag filter
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Show events with these tags (comma-separated)')
            .addText(text => text
                .setPlaceholder('tag1, tag2')
                .setValue(this.track.filterCriteria?.tags?.join(', ') || '')
                .onChange(value => {
                    if (!this.track.filterCriteria) this.track.filterCriteria = {};
                    this.track.filterCriteria.tags = value
                        ? value.split(',').map(s => s.trim()).filter(s => s)
                        : undefined;
                }));

        // Milestones only
        new Setting(contentEl)
            .setName('Milestones Only')
            .setDesc('Show only milestone events')
            .addToggle(toggle => toggle
                .setValue(this.track.filterCriteria?.milestonesOnly || false)
                .onChange(value => {
                    if (!this.track.filterCriteria) this.track.filterCriteria = {};
                    this.track.filterCriteria.milestonesOnly = value;
                }));

        // Visible Toggle
        new Setting(contentEl)
            .setName('Visible in Track Selector')
            .setDesc('Show this track in the track selector dropdown')
            .addToggle(toggle => toggle
                .setValue(this.track.visible !== false)
                .onChange(value => {
                    this.track.visible = value;
                }));

        // Sort Order
        new Setting(contentEl)
            .setName('Sort Order')
            .setDesc('Lower numbers appear first in the track selector')
            .addText(text => text
                .setPlaceholder('0')
                .setValue(this.track.sortOrder?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.track.sortOrder = isNaN(num) ? undefined : num;
                })
                .inputEl.setAttribute('type', 'number'));

        // Action Buttons
        const buttonContainer = contentEl.createDiv('storyteller-modal-buttons');

        // Delete button (only for existing tracks)
        if (!this.isNew && this.onDelete) {
            buttonContainer.createEl('button', {
                text: 'Delete Track',
                cls: 'mod-warning'
            }, btn => {
                btn.addEventListener('click', async () => {
                    const confirm = await new Promise<boolean>(resolve => {
                        const confirmModal = new Modal(this.app);
                        confirmModal.contentEl.createEl('h3', { text: 'Delete Track?' });
                        confirmModal.contentEl.createEl('p', {
                            text: `Are you sure you want to delete "${this.track.name}"? This action cannot be undone.`
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

                    if (confirm && this.onDelete) {
                        await this.onDelete(this.track);
                        this.close();
                    }
                });
            });
        }

        // Cancel button
        buttonContainer.createEl('button', { text: 'Cancel' }, btn => {
            btn.addEventListener('click', () => {
                this.close();
            });
        });

        // Save button
        buttonContainer.createEl('button', {
            text: this.isNew ? 'Create Track' : 'Save Changes',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', async () => {
                // Validate track
                const validation = TimelineTrackManager.validateTrack(this.track);
                if (!validation.valid) {
                    new Notice(`Validation failed:\n${validation.errors.join('\n')}`);
                    return;
                }

                try {
                    await this.onSubmit(this.track);
                    new Notice(`Track "${this.track.name}" ${this.isNew ? 'created' : 'updated'} successfully`);
                    this.close();
                } catch (error) {
                    console.error('Error saving track:', error);
                    new Notice('Error saving track. Check console for details.');
                }
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
