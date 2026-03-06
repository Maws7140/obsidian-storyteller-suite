import { App, Modal, Setting, TextComponent, DropdownComponent, Notice, setIcon } from 'obsidian';
import { TimelineTrack, Character, Location, Group } from '../types';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';

/**
 * Modal for managing timeline tracks
 * Allows creating, editing, deleting, and reordering tracks
 */
export class TrackManagerModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private tracks: TimelineTrack[];
    private onSave: (tracks: TimelineTrack[]) => void;
    private trackListEl: HTMLElement | null = null;
    private characters: Character[] = [];
    private locations: Location[] = [];
    private groups: Group[] = [];

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        tracks: TimelineTrack[],
        onSave: (tracks: TimelineTrack[]) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.tracks = JSON.parse(JSON.stringify(tracks)); // Deep copy
        this.onSave = onSave;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-track-manager');

        // Load entities for filters (story-specific)
        this.characters = await this.plugin.listCharacters();
        this.locations = await this.plugin.listLocations();
        this.groups = this.plugin.getGroups();

        // Title
        contentEl.createEl('h2', { text: t('manageTimelineTracks') || 'Manage Timeline Tracks' });

        // Description
        contentEl.createDiv({
            text: 'Timeline tracks allow you to view multiple filtered timelines simultaneously. Each track can show events for specific characters, locations, or custom criteria.',
            cls: 'storyteller-track-manager-desc'
        });

        // Add track button
        new Setting(contentEl)
            .setName(t('addTrack') || 'Add Track')
            .setDesc('Create a new timeline track')
            .addButton(btn => btn
                .setButtonText(t('add') || 'Add')
                .setCta()
                .onClick(() => this.addNewTrack())
            );

        // Track list container
        this.trackListEl = contentEl.createDiv({ cls: 'storyteller-track-list' });
        this.renderTrackList();

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
    }

    private addNewTrack(): void {
        const newTrack: TimelineTrack = {
            id: `track-${Date.now()}`,
            name: `Track ${this.tracks.length + 1}`,
            type: 'custom',
            description: '',
            color: this.getRandomColor(),
            filterCriteria: {},
            sortOrder: this.tracks.length,
            visible: true
        };

        this.tracks.push(newTrack);
        this.renderTrackList();
    }

    private renderTrackList(): void {
        if (!this.trackListEl) return;
        this.trackListEl.empty();

        if (this.tracks.length === 0) {
            this.trackListEl.createDiv({
                text: 'No tracks created yet. Click "Add Track" to create your first timeline track.',
                cls: 'storyteller-empty-state'
            });
            return;
        }

        this.tracks
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .forEach((track, index) => {
                this.renderTrack(track, index);
            });
    }

    private renderTrack(track: TimelineTrack, index: number): void {
        if (!this.trackListEl) return;

        const trackEl = this.trackListEl.createDiv({ cls: 'storyteller-track-item' });

        // Track header with drag handle
        const headerEl = trackEl.createDiv({ cls: 'storyteller-track-header' });

        // Drag handle
        const dragHandle = headerEl.createSpan({ cls: 'storyteller-track-drag-handle' });
        setIcon(dragHandle, 'grip-vertical');
        dragHandle.setAttribute('draggable', 'true');
        this.setupDragAndDrop(trackEl, track, index);

        // Track color indicator
        const colorIndicator = headerEl.createSpan({ cls: 'storyteller-track-color' });
        colorIndicator.style.backgroundColor = track.color || '#888888';

        // Track name (editable)
        const nameInput = headerEl.createEl('input', {
            type: 'text',
            value: track.name,
            cls: 'storyteller-track-name-input'
        });
        nameInput.addEventListener('change', () => {
            track.name = nameInput.value;
        });

        // Visibility toggle
        const visibilityBtn = headerEl.createEl('button', {
            cls: 'storyteller-track-visibility-btn'
        });
        setIcon(visibilityBtn, track.visible ? 'eye' : 'eye-off');
        visibilityBtn.addEventListener('click', () => {
            track.visible = !track.visible;
            setIcon(visibilityBtn, track.visible ? 'eye' : 'eye-off');
        });

        // Delete button
        const deleteBtn = headerEl.createEl('button', {
            cls: 'storyteller-track-delete-btn'
        });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => {
            this.deleteTrack(index);
        });

        // Track details (collapsible)
        const detailsEl = trackEl.createDiv({ cls: 'storyteller-track-details' });

        // Track type
        new Setting(detailsEl)
            .setName(t('trackType') || 'Track Type')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('global', 'Global (All Events)')
                    .addOption('character', 'Character-based')
                    .addOption('location', 'Location-based')
                    .addOption('group', 'Group-based')
                    .addOption('custom', 'Custom Filter')
                    .setValue(track.type)
                    .onChange(value => {
                        track.type = value as TimelineTrack['type'];
                        this.renderTrackList(); // Re-render to show/hide filters
                    });
            });

        // Entity ID (for character/location/group tracks)
        if (track.type === 'character' || track.type === 'location' || track.type === 'group') {
            this.renderEntitySelector(detailsEl, track);
        }

        // Color picker
        new Setting(detailsEl)
            .setName(t('trackColor') || 'Track Color')
            .addColorPicker(color => {
                color
                    .setValue(track.color || '#888888')
                    .onChange(value => {
                        track.color = value;
                        colorIndicator.style.backgroundColor = value;
                    });
            });

        // Description
        new Setting(detailsEl)
            .setName(t('description') || 'Description')
            .addTextArea(text => {
                text
                    .setValue(track.description || '')
                    .onChange(value => {
                        track.description = value;
                    });
                text.inputEl.rows = 2;
            });

        // Filter criteria (for custom tracks)
        if (track.type === 'custom') {
            this.renderFilterCriteria(detailsEl, track);
        }
    }

    private renderEntitySelector(containerEl: HTMLElement, track: TimelineTrack): void {
        let options: { value: string; label: string }[] = [];
        let currentValue = track.entityId || '';

        if (track.type === 'character') {
            options = this.characters.map(c => ({ value: c.id || c.name, label: c.name }));
        } else if (track.type === 'location') {
            options = this.locations.map(l => ({ value: l.id || l.name, label: l.name }));
        } else if (track.type === 'group') {
            options = this.groups.map(g => ({ value: g.id, label: g.name }));
        }

        new Setting(containerEl)
            .setName(track.type.charAt(0).toUpperCase() + track.type.slice(1))
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- Select --');
                options.forEach(opt => {
                    dropdown.addOption(opt.value, opt.label);
                });
                dropdown
                    .setValue(currentValue)
                    .onChange(value => {
                        track.entityId = value;
                    });
            });
    }

    private renderFilterCriteria(containerEl: HTMLElement, track: TimelineTrack): void {
        if (!track.filterCriteria) {
            track.filterCriteria = {};
        }

        containerEl.createEl('h4', { text: 'Filter Criteria' });

        // Characters filter
        new Setting(containerEl)
            .setName(t('characters') || 'Characters')
            .setDesc('Filter events by characters')
            .addText(text => {
                text
                    .setPlaceholder('Character names (comma-separated)')
                    .setValue((track.filterCriteria?.characters || []).join(', '))
                    .onChange(value => {
                        if (!track.filterCriteria) track.filterCriteria = {};
                        track.filterCriteria.characters = value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                    });
            });

        // Locations filter
        new Setting(containerEl)
            .setName(t('locations') || 'Locations')
            .setDesc('Filter events by locations')
            .addText(text => {
                text
                    .setPlaceholder('Location names (comma-separated)')
                    .setValue((track.filterCriteria?.locations || []).join(', '))
                    .onChange(value => {
                        if (!track.filterCriteria) track.filterCriteria = {};
                        track.filterCriteria.locations = value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                    });
            });

        // Tags filter
        new Setting(containerEl)
            .setName(t('tags') || 'Tags')
            .setDesc('Filter events by tags')
            .addText(text => {
                text
                    .setPlaceholder('Tags (comma-separated)')
                    .setValue((track.filterCriteria?.tags || []).join(', '))
                    .onChange(value => {
                        if (!track.filterCriteria) track.filterCriteria = {};
                        track.filterCriteria.tags = value
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                    });
            });

        // Milestones only
        new Setting(containerEl)
            .setName(t('milestonesOnly') || 'Milestones Only')
            .addToggle(toggle => {
                toggle
                    .setValue(track.filterCriteria?.milestonesOnly || false)
                    .onChange(value => {
                        if (!track.filterCriteria) track.filterCriteria = {};
                        track.filterCriteria.milestonesOnly = value;
                    });
            });
    }

    private setupDragAndDrop(trackEl: HTMLElement, track: TimelineTrack, index: number): void {
        trackEl.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', index.toString());
            trackEl.addClass('dragging');
        });

        trackEl.addEventListener('dragend', () => {
            trackEl.removeClass('dragging');
        });

        trackEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            trackEl.addClass('drag-over');
        });

        trackEl.addEventListener('dragleave', () => {
            trackEl.removeClass('drag-over');
        });

        trackEl.addEventListener('drop', (e) => {
            e.preventDefault();
            trackEl.removeClass('drag-over');

            const fromIndex = parseInt(e.dataTransfer?.getData('text/plain') || '-1');
            if (fromIndex === -1 || fromIndex === index) return;

            // Reorder tracks
            const [movedTrack] = this.tracks.splice(fromIndex, 1);
            this.tracks.splice(index, 0, movedTrack);

            // Update sort orders
            this.tracks.forEach((t, i) => {
                t.sortOrder = i;
            });

            this.renderTrackList();
        });
    }

    private deleteTrack(index: number): void {
        this.tracks.splice(index, 1);
        // Update sort orders
        this.tracks.forEach((t, i) => {
            t.sortOrder = i;
        });
        this.renderTrackList();
    }

    private save(): void {
        this.onSave(this.tracks);
        new Notice('Timeline tracks saved');
        this.close();
    }

    private getRandomColor(): string {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
            '#F7B731', '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF',
            '#48DBFB', '#1DD1A1', '#10AC84', '#EE5A6F', '#C44569'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
