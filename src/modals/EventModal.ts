/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent, parseYaml } from 'obsidian';
import { Event, GalleryImage, Character, Location, Group } from '../types'; // Added Character, Location, Group
import StorytellerSuitePlugin from '../main';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { PromptModal } from './ui/PromptModal';
// Import the new suggesters
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
// Remove placeholder import for multi-image
// import { MultiGalleryImageSuggestModal } from './MultiGalleryImageSuggestModal';

export type EventModalSubmitCallback = (event: Event) => Promise<void>;
export type EventModalDeleteCallback = (event: Event) => Promise<void>;

export class EventModal extends Modal {
    event: Event;
    plugin: StorytellerSuitePlugin;
    onSubmit: EventModalSubmitCallback;
    onDelete?: EventModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;
    private forkSelectorContainer: HTMLElement | null = null;

    // Elements to update dynamically
    charactersListEl: HTMLElement;
    imagesListEl: HTMLElement;
    locationSetting: Setting; // Store the setting itself
    selectLocationButton: ButtonComponent; // Store the select button

    constructor(app: App, plugin: StorytellerSuitePlugin, event: Event | null, onSubmit: EventModalSubmitCallback, onDelete?: EventModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = event === null;
        const initialEvent = event ? { ...event } : { name: '', dateTime: '', description: '', outcome: '', status: undefined, profileImagePath: undefined, characters: [], location: undefined, images: [], customFields: {}, groups: [], isMilestone: false, dependencies: [], progress: 0 };
        if (!initialEvent.customFields) initialEvent.customFields = {};
        // Ensure link arrays are initialized
        if (!initialEvent.characters) initialEvent.characters = [];
        if (!initialEvent.images) initialEvent.images = [];
        if (!initialEvent.groups) initialEvent.groups = [];
        if (!initialEvent.dependencies) initialEvent.dependencies = [];
        if (initialEvent.isMilestone === undefined) initialEvent.isMilestone = false;
        if (initialEvent.progress === undefined) initialEvent.progress = 0;

        this.event = initialEvent;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-event-modal');
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewEvent') : `${t('edit')} ${this.event.name}` });

        // Auto-apply default template for new events
        if (this.isNew && !this.event.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['event'];
            if (defaultTemplateId) {
                const defaultTemplate = this.plugin.templateManager?.getTemplate(defaultTemplateId);
                if (defaultTemplate) {
                    // If template has variables or multiple entities, use TemplateApplicationModal
                    if ((defaultTemplate.variables && defaultTemplate.variables.length > 0) ||
                        this.hasMultipleEntities(defaultTemplate)) {
                        await new Promise<void>((resolve) => {
                            import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                new TemplateApplicationModal(
                                    this.app,
                                    this.plugin,
                                    defaultTemplate,
                                    async (variableValues, entityFileNames) => {
                                        try {
                                            await this.applyTemplateToEventWithVariables(defaultTemplate, variableValues);
                                            new Notice(t('defaultTemplateApplied'));
                                            this.refresh(); // Refresh to show applied values
                                        } catch (error) {
                                            console.error('[EventModal] Error applying template:', error);
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    }
                                ).open();
                            }).catch((error) => {
                                console.error('[EventModal] Failed to load TemplateApplicationModal:', error);
                                new Notice('Failed to load template application dialog');
                                resolve();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToEvent(defaultTemplate);
                            new Notice(t('defaultTemplateApplied'));
                        } catch (error) {
                            console.error('[EventModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new events) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured event template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select an event template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToEvent(template);
                                this.refresh(); // Refresh the modal to show template values
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'event' // Filter to event templates only
                        ).open();
                    })
                );
        }

        // --- Standard Fields (Name, DateTime, Description, etc.) ---
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterEventName'))
                .setValue(this.event.name)
                .onChange(value => { this.event.name = value; })
                .inputEl.addClass('storyteller-modal-input-large'));

        const dateTimeSetting = new Setting(contentEl)
            .setName(t('dateTime'))
            .setDesc(t('statusPlaceholderEvent'))
            .addText(text => text
                .setPlaceholder(t('enterDateTime'))
                .setValue(this.event.dateTime || '')
                .onChange(value => { this.event.dateTime = value || undefined; }));

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('eventDescriptionPh'))
                    .setValue(this.event.description || '')
                    .onChange(value => { this.event.description = value || undefined; });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('outcome'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('eventOutcomePh'))
                    .setValue(this.event.outcome || '')
                    .onChange(value => { this.event.outcome = value || undefined; });
                text.inputEl.rows = 3;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('statusPlaceholderEvent'))
            .addText(text => text
                .setValue(this.event.status || '')
                .onChange(value => { this.event.status = value || undefined; }));

        // --- Gantt-style Fields ---
        new Setting(contentEl)
            .setName('Milestone')
            .setDesc('Mark this event as a key story moment')
            .addToggle(toggle => toggle
                .setValue(this.event.isMilestone || false)
                .onChange(value => { this.event.isMilestone = value; }));

        new Setting(contentEl)
            .setName('Progress')
            .setDesc('Completion percentage (0-100)')
            .addSlider(slider => slider
                .setLimits(0, 100, 5)
                .setValue(this.event.progress || 0)
                .setDynamicTooltip()
                .onChange(value => { this.event.progress = value; }));

        // Dependencies (event names this event depends on)
        const dependenciesSetting = new Setting(contentEl)
            .setName('Dependencies')
            .setDesc('Events that must occur before this one');
        const dependenciesListEl = dependenciesSetting.controlEl.createDiv('storyteller-modal-list');
        const renderDependenciesList = () => {
            dependenciesListEl.empty();
            if (!this.event.dependencies || this.event.dependencies.length === 0) {
                dependenciesListEl.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            } else {
                this.event.dependencies.forEach((dep, index) => {
                    const itemEl = dependenciesListEl.createDiv('storyteller-modal-list-item');
                    itemEl.createSpan({ text: dep });
                    new ButtonComponent(itemEl)
                        .setClass('storyteller-modal-list-remove')
                        .setTooltip(`Remove ${dep}`)
                        .setIcon('cross')
                        .onClick(() => {
                            this.event.dependencies?.splice(index, 1);
                            renderDependenciesList();
                        });
                });
            }
        };
        renderDependenciesList();
        dependenciesSetting.addButton(button => button
            .setButtonText('Add Dependency')
            .setTooltip('Add event dependency')
            .setCta()
            .onClick(() => {
                // Use EventSuggestModal (we'll need to create this or reuse existing suggest pattern)
                new EventSuggestModal(this.app, this.plugin, (selectedEvent) => {
                    if (selectedEvent && selectedEvent.name) {
                        if (!this.event.dependencies) {
                            this.event.dependencies = [];
                        }
                        if (!this.event.dependencies.includes(selectedEvent.name)) {
                            this.event.dependencies.push(selectedEvent.name);
                            renderDependenciesList();
                        } else {
                            new Notice(`Dependency "${selectedEvent.name}" already added.`);
                        }
                    }
                }).open();
            }));

        // --- Narrative Markers (for non-linear storytelling) ---
        if (!this.event.narrativeMarkers) {
            this.event.narrativeMarkers = {};
        }

        new Setting(contentEl)
            .setName('Flashback')
            .setDesc('Mark this event as a flashback (occurs earlier than narrated)')
            .addToggle(toggle => toggle
                .setValue(this.event.narrativeMarkers?.isFlashback || false)
                .onChange(value => {
                    if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                    this.event.narrativeMarkers.isFlashback = value;
                }));

        new Setting(contentEl)
            .setName('Flash-forward')
            .setDesc('Mark this event as a flash-forward (occurs later than narrated)')
            .addToggle(toggle => toggle
                .setValue(this.event.narrativeMarkers?.isFlashforward || false)
                .onChange(value => {
                    if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                    this.event.narrativeMarkers.isFlashforward = value;
                }));

        new Setting(contentEl)
            .setName('Narrative Date')
            .setDesc('When this event is narrated in the story (if different from chronological date)')
            .addText(text => text
                .setValue(this.event.narrativeMarkers?.narrativeDate || '')
                .setPlaceholder('e.g., 2024-01-15')
                .onChange(value => {
                    if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                    this.event.narrativeMarkers.narrativeDate = value || undefined;
                }));

        const targetEventSetting = new Setting(contentEl)
            .setName('Frame Event')
            .setDesc('The event from which this flashback/flash-forward is told');
        const targetEventDisplay = targetEventSetting.controlEl.createSpan({
            text: this.event.narrativeMarkers?.targetEvent || 'None',
            cls: 'storyteller-modal-target-event'
        });
        targetEventSetting.addButton(button => button
            .setButtonText('Select Event')
            .onClick(() => {
                new EventSuggestModal(this.app, this.plugin, (selectedEvent) => {
                    if (selectedEvent && selectedEvent.name) {
                        if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                        this.event.narrativeMarkers.targetEvent = selectedEvent.name;
                        targetEventDisplay.setText(selectedEvent.name);
                    }
                }).open();
            }))
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(() => {
                    if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                    this.event.narrativeMarkers.targetEvent = undefined;
                    targetEventDisplay.setText('None');
                }));

        new Setting(contentEl)
            .setName('Narrative Context')
            .setDesc('Description of how this event is narrated or framed in the story')
            .addTextArea(text => {
                text
                    .setValue(this.event.narrativeMarkers?.narrativeContext || '')
                    .setPlaceholder('e.g., "Told by the protagonist in a fever dream"')
                    .onChange(value => {
                        if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                        this.event.narrativeMarkers.narrativeContext = value || undefined;
                    });
                text.inputEl.rows = 3;
            });

        const profileImageSetting = new Setting(contentEl)
            .setName(t('image'))
            .setDesc('')
            .then(setting => {
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        const imagePathDesc = profileImageSetting.descEl.createEl('small', { 
            text: t('currentValue', this.event.profileImagePath || t('none')) 
        });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.event.profileImagePath,
                onSelect: (path) => {
                    this.event.profileImagePath = path;
                },
                descriptionEl: imagePathDesc
            }
        );

        // --- Links ---
        contentEl.createEl('h3', { text: t('links') });

        // --- Characters ---
        const charactersSetting = new Setting(contentEl)
            .setName(t('charactersInvolved'))
            .setDesc(t('characters'));
        // Store the list container element
        this.charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(this.charactersListEl, this.event.characters || [], 'character'); // Initial render
        charactersSetting.addButton(button => button
                .setButtonText(t('addCharacter'))
            .setTooltip(t('addCharacter'))
            .setCta()
            .onClick(() => { // Removed async as suggester handles await internally
                // Use the new CharacterSuggestModal
                new CharacterSuggestModal(this.app, this.plugin, (selectedCharacter) => {
                    if (selectedCharacter && selectedCharacter.name) {
                        // Ensure characters array exists
                        if (!this.event.characters) {
                            this.event.characters = [];
                        }
                        // Add character if not already present (using name as identifier for simplicity)
                        if (!this.event.characters.includes(selectedCharacter.name)) {
                            this.event.characters.push(selectedCharacter.name);
                            // Re-render the list in the modal
                            this.renderList(this.charactersListEl, this.event.characters, 'character');
                        } else {
                            new Notice(t('characterLinkedAlready', selectedCharacter.name));
                        }
                    }
                }).open();
            }));

        // --- Location ---
        // Store the setting itself for later updates
        this.locationSetting = new Setting(contentEl)
            .setName(t('location'))
            .setDesc(t('currentValue', this.event.location || t('none'))); // Initial description

        // Assign the button component inside the callback
        this.locationSetting.addButton(button => {
            // Store the button component reference
            this.selectLocationButton = button;

            // Configure the button
            button
                .setTooltip(t('selectLocation'))
                .onClick(() => { // Removed async
                    // Use the new LocationSuggestModal
                    new LocationSuggestModal(this.app, this.plugin, (selectedLocation) => {
                        // selectedLocation can be Location object or null
                        const locationName = selectedLocation ? selectedLocation.name : undefined;
                        this.event.location = locationName;

                        // Update the location display
                        this.locationSetting.setDesc(`${t('current')}: ${this.event.location || t('none')}`);
                        this.updateLocationClearButton(); // Update location buttons

                        // ADD THIS LINE: Explicitly re-render the character list
                        this.renderList(this.charactersListEl, this.event.characters || [], 'character');

                    }).open();
                });
        }); // End of addButton configuration

        // Call this AFTER the button has been created and assigned
        this.updateLocationClearButton(); // Initial setup/update of buttons

        // --- Associated Images ---
        const imagesSetting = new Setting(contentEl)
            .setName(t('associatedImages'))
            .setDesc(t('imageGallery'));
        // Store the list container element
        this.imagesListEl = imagesSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(this.imagesListEl, this.event.images || [], 'image'); // Initial render
        imagesSetting.addButton(button => button
            .setButtonText(t('addImage'))
            .setTooltip(t('selectFromGallery'))
            .setCta()
            .onClick(() => {
                // Use the existing GalleryImageSuggestModal
                new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                    if (selectedImage && selectedImage.filePath) {
                        // Use filePath as the identifier/link
                        const imagePath = selectedImage.filePath;
                        // Ensure images array exists
                        if (!this.event.images) {
                            this.event.images = [];
                        }
                        // Add image path if not already present
                        if (!this.event.images.includes(imagePath)) {
                            this.event.images.push(imagePath);
                            this.renderList(this.imagesListEl, this.event.images, 'image'); // Re-render list
                        }
                    }
                    // No action needed if selectedImage is null (Shift+Enter)
                }).open();
            }));

        // --- Tags ---
        contentEl.createEl('h3', { text: 'Tags' });
        const tagsSetting = new Setting(contentEl)
            .setName('Event Tags')
            .setDesc('Tags for categorization and filtering');
        const tagsListEl = tagsSetting.controlEl.createDiv('storyteller-modal-list');
        const renderTagsList = () => {
            tagsListEl.empty();
            if (!this.event.tags || this.event.tags.length === 0) {
                tagsListEl.createEl('span', { text: 'No tags', cls: 'storyteller-modal-list-empty' });
            } else {
                this.event.tags.forEach((tag, index) => {
                    const itemEl = tagsListEl.createDiv('storyteller-modal-list-item');
                    itemEl.createSpan({ text: tag });
                    new ButtonComponent(itemEl)
                        .setClass('storyteller-modal-list-remove')
                        .setTooltip(`Remove tag: ${tag}`)
                        .setIcon('cross')
                        .onClick(() => {
                            this.event.tags?.splice(index, 1);
                            renderTagsList();
                        });
                });
            }
        };
        renderTagsList();
        tagsSetting.addButton(button => button
            .setButtonText('Add Tag')
            .setTooltip('Add a tag to this event')
            .setCta()
            .onClick(() => {
                new PromptModal(this.app, {
                    title: 'Add Tag',
                    label: 'Tag name',
                    defaultValue: '',
                    onSubmit: (tagName: string) => {
                        const trimmed = tagName.trim();
                        if (trimmed) {
                            if (!this.event.tags) {
                                this.event.tags = [];
                            }
                            if (!this.event.tags.includes(trimmed)) {
                                this.event.tags.push(trimmed);
                                renderTagsList();
                            } else {
                                new Notice(`Tag "${trimmed}" already added.`);
                            }
                        }
                    }
                }).open();
            }));

        // --- Era Membership ---
        contentEl.createEl('h3', { text: 'Timeline Eras' });
        const eras = this.plugin.settings.timelineEras || [];
        if (eras.length > 0) {
            contentEl.createEl('p', {
                text: 'This event belongs to the following timeline eras based on its date:',
                cls: 'storyteller-modal-description'
            });

            const eraBadgesContainer = contentEl.createDiv('storyteller-era-badges-container');

            // Import EraManager to find eras for this event
            import('../utils/EraManager').then(({ EraManager }) => {
                const eventEras = EraManager.findErasForEvent(this.event, eras);

                if (eventEras.length === 0) {
                    eraBadgesContainer.createEl('span', {
                        text: 'None (event date does not fall within any era)',
                        cls: 'storyteller-era-no-match'
                    });
                } else {
                    for (const era of eventEras) {
                        const badge = eraBadgesContainer.createDiv('storyteller-era-badge');
                        if (era.color) {
                            badge.style.borderLeftColor = era.color;
                        }
                        badge.createEl('strong', { text: era.name });
                        badge.createEl('span', {
                            text: ` (${era.startDate} → ${era.endDate})`,
                            cls: 'storyteller-era-badge-dates'
                        });
                    }
                }
            });
        } else {
            contentEl.createEl('p', {
                text: 'No timeline eras have been created yet. Use the "Manage timeline eras" command to create eras.',
                cls: 'storyteller-modal-description storyteller-era-empty-state'
            });
        }

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Render existing custom fields so users can see and edit them
        if (!this.event.customFields) this.event.customFields = {};
        this.renderCustomFields(customFieldsContainer, this.event.customFields);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    if (!this.event.customFields) this.event.customFields = {};
                    const fields = this.event.customFields;
                    const reserved = new Set<string>([...getWhitelistKeys('event'), 'customFields', 'filePath', 'id', 'sections']);
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: 'Custom field value',
                            label: `Value for "${key}"`,
                            defaultValue: '',
                            onSubmit: (val: string) => { fields[key] = val; }
                        }).open();
                    };
                    new PromptModal(this.app, {
                        title: 'New custom field',
                        label: 'Field name',
                        defaultValue: '',
                        validator: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed) return 'Field name cannot be empty';
                            if (reserved.has(trimmed)) return 'That name is reserved';
                            const exists = Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return 'A field with that name already exists';
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
                }));

        // --- Groups ---
        contentEl.createEl('h3', { text: t('groups') });
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

        // --- Timeline Forks ---
        const forks = this.plugin.getTimelineForks();
        if (forks.length > 0) {
            contentEl.createEl('h3', { text: 'Timeline Forks' });
            contentEl.createEl('p', {
                text: 'Assign this event to alternate timeline forks',
                cls: 'storyteller-modal-description'
            });
            this.forkSelectorContainer = contentEl.createDiv('storyteller-fork-selector-container');
            this.renderForkSelector(this.forkSelectorContainer);
        }

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteEvent'))
                .setClass('mod-warning')
                .onClick(async () => {
                    // Added confirmation dialog
                    if (confirm(t('confirmDeleteEvent', this.event.name))) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.event);
                                // Notice is now handled within the callback if provided, or here if not
                                // new Notice(`Event "${this.event.name}" deleted.`);
                                this.close();
                            } catch (error) {
                                console.error("Error deleting event:", error);
                                new Notice(t('workspaceLeafCreateError'));
                            }
                        }
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });

        buttonsSetting.addButton(button => button
            .setButtonText(t('cancel'))
            .onClick(() => {
                this.close();
            }));

        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? t('createNewEvent') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.event.name?.trim()) {
                    new Notice(t('eventNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.event.description = this.event.description || '';
                this.event.outcome = this.event.outcome || '';
                try {
                    await this.onSubmit(this.event);
                    // Notice is handled by the onSubmit callback provided by the caller
                    this.close();
                } catch (error) {
                    console.error("Error saving event:", error);
                    new Notice(t('workspaceLeafRevealError'));
                }
            }));
    }

    // Updated Helper to add/remove the location clear button dynamically
    updateLocationClearButton() {
        // Ensure the setting container exists
        if (!this.locationSetting || !this.locationSetting.controlEl) return;

        const controlEl = this.locationSetting.controlEl;
        const existingClearButton = controlEl.querySelector('.storyteller-clear-location-button');

        // Update Select/Change button text
        if (this.selectLocationButton) {
            this.selectLocationButton.setButtonText(this.event.location ? 'Change location' : 'Select location');
        }

        // Add clear button if location is set and button doesn't exist
        if (this.event.location && !existingClearButton) {
            this.locationSetting.addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear location (set to none)')
                .setClass('mod-warning')
                .setClass('storyteller-clear-location-button') // Add class for identification
                .onClick(() => {
                    this.event.location = undefined;
                    this.locationSetting.setDesc(t('currentValue', this.event.location || t('none')));
                    this.updateLocationClearButton(); // Re-run to remove button and update text
                }));
        }
        // Remove clear button if location is not set and button exists
        else if (!this.event.location && existingClearButton) {
            existingClearButton.remove();
        }
    }

    // Helper to render lists (Characters, Images)
    // Using string (name/path) as item identifier for simplicity
    renderList(container: HTMLElement, items: string[], type: 'character' | 'image') {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            return;
        }
        items.forEach((item, index) => {
            const itemEl = container.createDiv('storyteller-modal-list-item');
            // Display the item (character name or image path)
            itemEl.createSpan({ text: item });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${item}`)
                .setIcon('cross')
                .onClick(() => {
                    if (type === 'character' && this.event.characters) {
                        this.event.characters.splice(index, 1);
                    } else if (type === 'image' && this.event.images) {
                        this.event.images.splice(index, 1);
                    }
                    // Re-render the specific list that was modified
                    this.renderList(container, items, type);
                });
        });
    }

    // Helper to render custom fields with safe renaming
    renderCustomFields(container: HTMLElement, fields: { [key: string]: any }) {
        container.empty();
        fields = fields || {};
        const keys = Object.keys(fields);

        if (keys.length === 0) {
            container.createEl('p', { text: t('noCustomFields'), cls: 'storyteller-modal-list-empty' });
            return;
        }

        const reserved = new Set<string>([...getWhitelistKeys('event'), 'customFields', 'filePath', 'id', 'sections']);
        keys.forEach(key => {
            let currentKey = key;
            const fieldSetting = new Setting(container)
                .addText(text => text
                    .setValue(currentKey)
                    .setPlaceholder(t('fieldNamePh'))
                    .onChange(newKey => {
                        const trimmed = newKey.trim();
                        const isUniqueCaseInsensitive = !Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                        const isReserved = reserved.has(trimmed);
                        if (trimmed && trimmed !== currentKey && isUniqueCaseInsensitive && !isReserved) {
                            fields[trimmed] = fields[currentKey];
                            delete fields[currentKey];
                            currentKey = trimmed;
                        } else if (trimmed !== currentKey) {
                            text.setValue(currentKey); // Revert change
                            new Notice(t('customFieldError'));
                        }
                    }))
                .addText(text => text
                    .setValue(fields[currentKey]?.toString() || '')
                    .setPlaceholder(t('fieldValuePh'))
                    .onChange(value => {
                        fields[currentKey] = value;
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip(`Remove field "${currentKey}"`)
                    .setClass('mod-warning')
                    .onClick(() => {
                        delete fields[currentKey];
                        this.renderCustomFields(container, fields); // Re-render after deletion
                    }));
            fieldSetting.controlEl.addClass('storyteller-custom-field-row');
            fieldSetting.infoEl.addClass('storyteller-custom-field-key'); // Should maybe target nameEl instead
        });
    }

    renderGroupSelector(container: HTMLElement) {
        container.empty();
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.event.id || this.event.name;
            const freshList = await this.plugin.listEvents();
            const fresh = freshList.find(e => (e.id || e.name) === identifier);
            const current = new Set((fresh?.groups || this.event.groups || []) as string[]);
            this.event.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName(t('groups'))
                .setDesc(t('assignEventToGroupsDesc'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
                    allGroups.forEach(group => {
                        dropdown.addOption(group.id, group.name);
                    });
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.event.groups = Array.from(selectedGroupIds);
                            await this.plugin.addMemberToGroup(value, 'event', this.event.id || this.event.name);
                            this.renderGroupSelector(container);
                        }
                    });
                });
            if (selectedGroupIds.size > 0) {
                const selectedDiv = container.createDiv('selected-groups');
                allGroups.filter(g => selectedGroupIds.has(g.id)).forEach(group => {
                    const tag = selectedDiv.createSpan({ text: group.name, cls: 'group-tag' });
                    const removeBtn = tag.createSpan({ text: ' ├ù', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        selectedGroupIds.delete(group.id);
                        this.event.groups = Array.from(selectedGroupIds);
                        await this.plugin.removeMemberFromGroup(group.id, 'event', this.event.id || this.event.name);
                        this.renderGroupSelector(container);
                    };
                });
            }
        })();
    }

    renderForkSelector(container: HTMLElement) {
        container.empty();
        const allForks = this.plugin.getTimelineForks();
        const eventIdentifier = this.event.id || this.event.name;

        // Get forks that already contain this event
        const selectedForkIds = new Set<string>();
        allForks.forEach(fork => {
            if (fork.forkEvents?.includes(eventIdentifier)) {
                selectedForkIds.add(fork.id);
            }
        });

        new Setting(container)
            .setName('Timeline Forks')
            .setDesc('Add this event to alternate timelines')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- Select a fork --');
                allForks.forEach(fork => {
                    // Only show forks that don't already contain this event
                    if (!selectedForkIds.has(fork.id)) {
                        dropdown.addOption(fork.id, fork.name);
                    }
                });
                dropdown.setValue('');
                dropdown.onChange(async (forkId) => {
                    if (forkId) {
                        await this.plugin.addEventToFork(forkId, eventIdentifier);
                        selectedForkIds.add(forkId);
                        this.renderForkSelector(container);
                    }
                });
            });

        // Show selected forks as removable tags
        if (selectedForkIds.size > 0) {
            const selectedDiv = container.createDiv('selected-forks');
            selectedDiv.style.marginTop = '8px';
            allForks.filter(f => selectedForkIds.has(f.id)).forEach(fork => {
                const tag = selectedDiv.createSpan({ cls: 'fork-tag' });
                tag.style.display = 'inline-flex';
                tag.style.alignItems = 'center';
                tag.style.padding = '2px 8px';
                tag.style.marginRight = '4px';
                tag.style.marginBottom = '4px';
                tag.style.borderRadius = '4px';
                tag.style.backgroundColor = fork.color || '#666';
                tag.style.color = '#fff';
                tag.style.fontSize = '12px';

                tag.createSpan({ text: fork.name });

                const removeBtn = tag.createSpan({ text: ' x', cls: 'remove-fork-btn' });
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.marginLeft = '4px';
                removeBtn.style.fontWeight = 'bold';
                removeBtn.onclick = async () => {
                    await this.plugin.removeEventFromFork(fork.id, eventIdentifier);
                    selectedForkIds.delete(fork.id);
                    this.renderForkSelector(container);
                };
            });
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        const entityCount = Object.values(template.entities).reduce((count, entities) => {
            return count + (Array.isArray(entities) ? entities.length : 0);
        }, 0);
        return entityCount > 1;
    }

    private async applyTemplateToEventWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.events || template.entities.events.length === 0) {
            new Notice('This template does not contain any events');
            return;
        }

        // Get the first event from the template
        let templateEvt = template.entities.events[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateEvt,
            variableValues,
            false // non-strict mode
        );
        templateEvt = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[EventModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToEvent(templateEvt);
    }

    private async applyTemplateToEvent(template: Template): Promise<void> {
        if (!template.entities.events || template.entities.events.length === 0) {
            new Notice('This template does not contain any events');
            return;
        }

        // Get the first event from the template (no variable substitution)
        const templateEvt = template.entities.events[0];
        await this.applyProcessedTemplateToEvent(templateEvt);
    }

    private async applyProcessedTemplateToEvent(templateEvt: any): Promise<void> {

        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateEvt as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[EventModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[EventModal] Failed to parse yamlContent:', error);
            }
        } else if (customYamlFields) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent (parse sections)
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(`---\n---\n\n${markdownContent}`);

                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    fields.description = parsedSections['Description'];
                }
                if ('Outcome' in parsedSections) {
                    fields.outcome = parsedSections['Outcome'];
                }
                console.log('[EventModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[EventModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the event
        Object.assign(this.event, fields);
        console.log('[EventModal] Final event after template:', this.event);

        // Clear relationships as they reference template entities
        this.event.characters = [];
        this.event.connections = [];
        this.event.groups = [];
        this.event.dependencies = [];
    }

    private refresh(): void {
        // Refresh the modal by reopening it
        void this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}
