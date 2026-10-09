 
import { App, Setting, Notice, ButtonComponent, parseYaml } from 'obsidian';
import { Event } from '../types';

/** Colours the picker opens on when the event has made no choice of its own. */
const DEFAULT_EVENT_COLOR = '#7c3aed';
const MILESTONE_GOLD = '#d9a520';
import StorytellerSuitePlugin from '../main';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { PromptModal } from './ui/PromptModal';
import { EntityCustomFieldsEditor, customFieldEditorOptions } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';
import { ResponsiveModal } from './ResponsiveModal';
// Import the new suggesters
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import type { Template, TemplateEntity, TemplateVariableValue } from '../templates/TemplateTypes';
// Remove placeholder import for multi-image
// import { MultiGalleryImageSuggestModal } from './MultiGalleryImageSuggestModal';
import { parseTimelineDate } from '../utils/DateParsing';
import { createCollapsibleModalSection } from './entity/CollapsibleModalSection';
import { cloneEventDraft, changedMemberships } from './entity/EventDraft';
import { isModalFieldVisible, seedDefaultCustomFields } from './entity/ModalFieldVisibility';
import { setNarrativeDirection } from '../utils/NarrativeTimeline';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import { GREGORIAN_CALENDAR } from '../calendar/builtins';
import { parseToAbsoluteDay } from '../calendar/CalendarDateText';
import { isEventLinkedToFork } from '../utils/ForkVisibility';

export type EventModalSubmitCallback = (event: Event) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class EventModal extends ResponsiveModal {
    event: Event;
    plugin: StorytellerSuitePlugin;
    onSubmit: EventModalSubmitCallback;
    isNew: boolean;
    private forkSelectorContainer: HTMLElement | null = null;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;
    private readonly groupSelector: EntityGroupSelector;
    private readonly originalGroupIds: string[];

    // Elements to update dynamically
    charactersListEl: HTMLElement;
    imagesListEl: HTMLElement;
    locationSetting: Setting; // Store the setting itself
    selectLocationButton: ButtonComponent; // Store the select button

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        event: Event | null,
        onSubmit: EventModalSubmitCallback,
        newEventSeed?: Event,
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = event === null;
        const initialEvent = event
            ? cloneEventDraft(event)
            : newEventSeed
                ? cloneEventDraft(newEventSeed)
                : {
                    name: '', dateTime: '', description: '', outcome: '',
                    status: undefined, profileImagePath: undefined, location: undefined,
                    characters: [], images: [], customFields: {}, groups: [],
                    isMilestone: false, dependencies: [], dependencyNames: [], progress: 0,
                };
        if (!initialEvent.customFields) initialEvent.customFields = {};
        // Ensure link arrays are initialized
        if (!initialEvent.characters) initialEvent.characters = [];
        if (!initialEvent.images) initialEvent.images = [];
        if (!initialEvent.groups) initialEvent.groups = [];
        if (!initialEvent.dependencies) initialEvent.dependencies = [];
        if (!initialEvent.dependencyNames) initialEvent.dependencyNames = [...initialEvent.dependencies];
        if (initialEvent.isMilestone === undefined) initialEvent.isMilestone = false;
        if (initialEvent.progress === undefined) initialEvent.progress = 0;

        if (this.isNew) {
            initialEvent.customFields = seedDefaultCustomFields(
                initialEvent.customFields,
                this.plugin.getSeedableDefaultCustomFields('event')
            );
        }

        this.event = initialEvent;
        this.originalGroupIds = [...(initialEvent.groups || [])];
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'event', this.event.customFields,
            customFieldEditorOptions(this.plugin, 'event', () => this.event));
        this.groupSelector = new EntityGroupSelector({
            plugin: this.plugin,
            description: t('assignEventToGroupsDesc'),
            getSelectedGroupIds: () => this.event.groups,
            setSelectedGroupIds: groupIds => {
                this.event.groups = groupIds;
            },
            loadSelectedGroupIds: async () => this.event.groups || [],
        });
        this.onSubmit = onSubmit;
        this.modalEl.addClass('storyteller-event-modal');
    }

    private getDependencyLabel(depRef: string, index: number): string {
        const display = this.event.dependencyNames?.[index];
        return typeof display === 'string' && display.trim() ? display.trim() : depRef;
    }

    private removeDependency(index: number): void {
        this.event.dependencies?.splice(index, 1);
        this.event.dependencyNames?.splice(index, 1);
    }

    onOpen() { void (async () => {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();
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
                                    (variableValues, entityFileNames) => { void (async () => {
                                        try {
                                            await this.applyTemplateToEventWithVariables(defaultTemplate, variableValues);
                                            new Notice(t('defaultTemplateApplied'));
                                            this.refresh(); // Refresh to show applied values
                                        } catch {
                                            
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    })(); },
                                    resolve
                                ).open();
                            }).catch((error) => {
                                
                                new Notice('Failed to load template application dialog');
                                resolve();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToEvent(defaultTemplate);
                            new Notice(t('defaultTemplateApplied'));
                        } catch {
                            
                            new Notice(t('errorApplyingDefaultTemplate'));
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new events) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from template')
                .setDesc('Optionally start with a pre-configured event template')
                .addButton(button => button
                    .setButtonText('Choose template')
                    .setTooltip('Select an event template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            (template: Template) => { void (async () => {
                                // Check if template has variables or multiple entities
                                if ((template.variables && template.variables.length > 0) ||
                                    this.hasMultipleEntities(template)) {
                                    // Use TemplateApplicationModal for variable collection
                                    await new Promise<void>((resolve) => {
                                        void import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                            new TemplateApplicationModal(
                                                this.app,
                                                this.plugin,
                                                template,
                                                (variableValues, entityFileNames) => { void (async () => {
                                                    try {
                                                        await this.applyTemplateToEventWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch {
                                                        
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                })(); },
                                                resolve
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToEvent(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            })(); },
                            'event' // Filter to event templates only
                        ).open();
                    })
                );
        }

        // --- Standard Fields (Name, DateTime, Description, etc.) ---
        const isVisible = (field: string) => isModalFieldVisible(
            this.plugin.settings.hiddenModalFields,
            'event',
            field
        );
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterEventName'))
                .setValue(this.event.name)
                .onChange(value => { this.event.name = value; })
                .inputEl.addClass('storyteller-modal-input-large'));

        if (isVisible('dateTime')) {
            const dateSetting = new Setting(contentEl)
                .setName('Date or range')
                .setDesc('When the event actually occurred. Use the narrative section for when it is revealed.')
                .addText(text => text
                    .setPlaceholder(t('enterDateTime'))
                    .setValue(this.event.dateTime || '')
                    .onChange(value => {
                        this.event.dateTime = value || undefined;
                        this.updateDateValidation(dateSetting, value, false);
                    }));
            this.updateDateValidation(dateSetting, this.event.dateTime || '', false);
        }

        if (isVisible('description')) {
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
        }

        if (isVisible('outcome')) {
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
        }

        if (isVisible('status')) {
            new Setting(contentEl)
                .setName(t('status'))
                .setDesc('A short project-specific state such as planned, occurred, or disputed')
                .addText(text => text
                    .setValue(this.event.status || '')
                    .onChange(value => { this.event.status = value || undefined; }));
        }

        // --- Gantt-style Fields ---
        const timelineSection = isVisible('timeline')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Timeline options',
                description: 'Milestone styling, progress, and prerequisite events',
                icon: 'git-commit-horizontal',
            })
            : null;
        if (timelineSection) new Setting(timelineSection)
            .setName('Milestone')
            .setDesc('Mark this event as a key story moment')
            .addToggle(toggle => toggle
                .setValue(this.event.isMilestone || false)
                .onChange(value => { this.event.isMilestone = value; }));

        // Left unset, the event takes its lane's colour, or the milestone gold.
        // Clearing it has to be possible, hence the reset button: a colour
        // picker alone has no way back to "no choice made".
        if (timelineSection) {
        const colorSetting = new Setting(timelineSection)
            .setName('Timeline colour')
            .setDesc('Overrides the lane colour, and the milestone gold, on the timeline')
            .addColorPicker(picker => picker
                // Opens on whatever the event would have drawn as anyway, so
                // the picker starts from the current appearance.
                .setValue(this.event.color || (this.event.isMilestone ? MILESTONE_GOLD : DEFAULT_EVENT_COLOR))
                .onChange(value => { this.event.color = value; }));
        colorSetting.addExtraButton(button => button
            .setIcon('rotate-ccw')
            .setTooltip('Use the default colour')
            .onClick(() => {
                this.event.color = undefined;
                this.onOpen();
            }));

        new Setting(timelineSection)
            .setName('Progress')
            .setDesc('Completion percentage (0-100)')
            .addSlider(slider => slider
                .setLimits(0, 100, 5)
                .setValue(this.event.progress || 0)
                .onChange(value => { this.event.progress = value; }));

        // Dependencies (stored as stable event IDs with resolved display names)
        const dependenciesSetting = new Setting(timelineSection)
            .setName('Dependencies')
            .setDesc('Events that must occur before this one');
        const dependenciesListEl = dependenciesSetting.controlEl.createDiv('storyteller-modal-list');
        const renderDependenciesList = () => {
            dependenciesListEl.empty();
            if (!this.event.dependencies || this.event.dependencies.length === 0) {
                dependenciesListEl.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            } else {
                this.event.dependencies.forEach((dep, index) => {
                    const depLabel = this.getDependencyLabel(dep, index);
                    const itemEl = dependenciesListEl.createDiv('storyteller-modal-list-item');
                    itemEl.createSpan({ text: depLabel });
                    new ButtonComponent(itemEl)
                        .setClass('storyteller-modal-list-remove')
                        .setTooltip(`Remove ${depLabel}`)
                        .setIcon('cross')
                        .onClick(() => {
                            this.removeDependency(index);
                            renderDependenciesList();
                        });
                });
            }
        };
        renderDependenciesList();
        dependenciesSetting.addButton(button => button
            .setButtonText('Add dependency')
            .setTooltip('Add event dependency')
            .setCta()
            .onClick(() => {
                // Use EventSuggestModal (we'll need to create this or reuse existing suggest pattern)
                new EventSuggestModal(this.app, this.plugin, (selectedEvent) => {
                    if (selectedEvent && selectedEvent.name) {
                        const selectedId = selectedEvent.id || selectedEvent.name;
                        const currentId = this.event.id || this.event.name;
                        if (selectedId === currentId) {
                            new Notice('An event cannot depend on itself.');
                            return;
                        }
                        if (!this.event.dependencies) {
                            this.event.dependencies = [];
                        }
                        if (!this.event.dependencyNames) {
                            this.event.dependencyNames = [];
                        }
                        if (!this.event.dependencies.includes(selectedId)) {
                            this.event.dependencies.push(selectedId);
                            this.event.dependencyNames.push(selectedEvent.name);
                            renderDependenciesList();
                        } else {
                            new Notice(`Dependency "${selectedEvent.name}" already added.`);
                        }
                    }
                }).open();
            }));
        }

        // --- Narrative Markers (for non-linear storytelling) ---
        if (!this.event.narrativeMarkers) {
            this.event.narrativeMarkers = {};
        }

        const hasNarrative = Boolean(
            this.event.narrativeSequence !== undefined
            || this.event.narrativeMarkers?.isFlashback
            || this.event.narrativeMarkers?.isFlashforward
            || this.event.narrativeMarkers?.narrativeDate
            || this.event.narrativeMarkers?.targetEvent
            || this.event.narrativeMarkers?.narrativeContext
        );
        const narrativeSection = isVisible('narrative')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Narrative',
                description: 'Control when and how this event is revealed',
                icon: 'between-horizontal-start',
                open: hasNarrative,
            })
            : null;
        if (narrativeSection) {
        let flashForwardToggle: { setValue(value: boolean): unknown } | undefined;
        let flashbackToggle: { setValue(value: boolean): unknown } | undefined;
        new Setting(narrativeSection)
            .setName('Flashback')
            .setDesc('Mark this event as a flashback (occurs earlier than narrated)')
            .addToggle(toggle => {
                flashbackToggle = toggle;
                return toggle
                .setValue(this.event.narrativeMarkers?.isFlashback || false)
                .onChange(value => {
                    setNarrativeDirection(this.event, 'flashback', value);
                    if (value) flashForwardToggle?.setValue(false);
                });
            });

        new Setting(narrativeSection)
            .setName('Flash-forward')
            .setDesc('Mark this event as a flash-forward (occurs later than narrated)')
            .addToggle(toggle => {
                flashForwardToggle = toggle;
                return toggle
                .setValue(this.event.narrativeMarkers?.isFlashforward || false)
                .onChange(value => {
                    setNarrativeDirection(this.event, 'flashforward', value);
                    if (value) flashbackToggle?.setValue(false);
                });
            });

        new Setting(narrativeSection)
            .setName('Narrative sequence')
            .setDesc('Optional reading-order number used when several events share a narrative date')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.setValue(this.event.narrativeSequence !== undefined ? String(this.event.narrativeSequence) : '')
                    .onChange(value => {
                        const parsed = Number(value);
                        this.event.narrativeSequence = value.trim() && Number.isFinite(parsed) ? parsed : undefined;
                    });
            });

        const narrativeDateSetting = new Setting(narrativeSection)
            .setName('Narrative date')
            .setDesc('When this event is revealed or narrated; Narrative order positions it here')
            .addText(text => text
                .setValue(this.event.narrativeMarkers?.narrativeDate || '')
                .setPlaceholder('E.g., 2024-01-15')
                .onChange(value => {
                    if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                    this.event.narrativeMarkers.narrativeDate = value || undefined;
                    this.updateDateValidation(narrativeDateSetting, value, true);
                }));
        this.updateDateValidation(narrativeDateSetting, this.event.narrativeMarkers?.narrativeDate || '', true);

        const targetEventSetting = new Setting(narrativeSection)
            .setName('Frame event')
            .setDesc('The event from which this flashback/flash-forward is told');
        const targetEventDisplay = targetEventSetting.controlEl.createSpan({
            text: this.event.narrativeMarkers?.targetEvent || 'None',
            cls: 'storyteller-modal-target-event'
        });
        const targetRef = this.event.narrativeMarkers?.targetEvent;
        if (targetRef) {
            void this.plugin.listEvents().then(events => {
                const target = events.find(candidate => candidate.id === targetRef || candidate.name === targetRef);
                if (target) targetEventDisplay.setText(target.name);
            });
        }
        targetEventSetting.addButton(button => button
            .setButtonText('Select event')
            .onClick(() => {
                new EventSuggestModal(this.app, this.plugin, (selectedEvent) => {
                    if (selectedEvent && selectedEvent.name) {
                        if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                        this.event.narrativeMarkers.targetEvent = selectedEvent.id || selectedEvent.name;
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

        new Setting(narrativeSection)
            .setName('Narrative context')
            .setDesc('Description of how this event is narrated or framed in the story')
            .addTextArea(text => {
                text
                    .setValue(this.event.narrativeMarkers?.narrativeContext || '')
                    .setPlaceholder('E.g., "told by the protagonist in a fever dream"')
                    .onChange(value => {
                        if (!this.event.narrativeMarkers) this.event.narrativeMarkers = {};
                        this.event.narrativeMarkers.narrativeContext = value || undefined;
                    });
                text.inputEl.rows = 3;
            });
        }

        // --- Provenance: how solid this event is, and who says so ---
        //
        // A rumour, a legend and a death three people watched are all events.
        // Drawing them identically claims a certainty the story does not have,
        // so the timeline needs somewhere to read that from.
        const provenanceSection = isVisible('provenance')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Provenance',
                description: 'Certainty, sources, claims, and disputes',
                icon: 'scan-search',
                open: Boolean(this.event.certainty || this.event.sources?.length || this.event.claimedBy?.length || this.event.disputedBy?.length),
            })
            : null;

        if (provenanceSection) {
        new Setting(provenanceSection)
            .setName('Certainty')
            .setDesc('How firmly this event is established. Anything less than established draws faded on the timeline.')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    established: 'Established',
                    reported: 'Reported',
                    disputed: 'Disputed',
                    legendary: 'Legendary'
                })
                .setValue(this.event.certainty || 'established')
                .onChange(value => {
                    // Established is the absence of a claim rather than a claim
                    // of its own, so it is stored as nothing at all. Otherwise
                    // every event ever written gains a field on its next save.
                    this.event.certainty = value === 'established' ? undefined : value as Event['certainty'];
                }));

        new Setting(provenanceSection)
            .setName('Sources')
            .setDesc('Where the account of this event comes from, one per line')
            .addTextArea(text => {
                text
                    .setValue((this.event.sources || []).join('\n'))
                    .setPlaceholder('E.g., the abbey chronicle')
                    .onChange(value => {
                        const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
                        this.event.sources = lines.length ? lines : undefined;
                    });
                text.inputEl.rows = 3;
            });

        const claimList = (label: string, description: string, read: () => string[], write: (names: string[]) => void) => {
            const setting = new Setting(provenanceSection).setName(label).setDesc(description);
            const display = setting.controlEl.createSpan({ text: read().join(', ') || 'None' });
            setting.addButton(button => button
                .setButtonText('Add character')
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (character) => {
                        if (!character?.name) return;
                        const names = read();
                        if (names.includes(character.name)) return;
                        write([...names, character.name]);
                        display.setText(read().join(', ') || 'None');
                    }).open();
                }))
                .addButton(button => button
                    .setButtonText('Clear')
                    .onClick(() => {
                        write([]);
                        display.setText('None');
                    }));
        };

        claimList(
            'Claimed by',
            'Characters who say this happened. Not the same as who was there.',
            () => this.event.claimedBy || [],
            names => { this.event.claimedBy = names.length ? names : undefined; }
        );

        claimList(
            'Disputed by',
            'Characters who say this did not happen',
            () => this.event.disputedBy || [],
            names => { this.event.disputedBy = names.length ? names : undefined; }
        );
        }

        const mediaSection = isVisible('media')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Media',
                description: 'Cover image and associated gallery images',
                icon: 'images',
                open: Boolean(this.event.profileImagePath || this.event.images?.length),
            })
            : null;
        if (mediaSection) {
        const profileImageSetting = new Setting(mediaSection)
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
        }

        // --- Links ---
        const relationshipsSection = isVisible('characters') || isVisible('location')
            ? createCollapsibleModalSection(contentEl, {
                title: 'People and place',
                description: 'Who was involved and where it happened',
                icon: 'map-pin',
                open: Boolean(this.event.characters?.length || this.event.location),
            })
            : null;

        // --- Characters ---
        if (relationshipsSection && isVisible('characters')) {
        const charactersSetting = new Setting(relationshipsSection)
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
        } else {
            this.charactersListEl = contentEl.ownerDocument.createElement('div');
        }

        // --- Location ---
        // Store the setting itself for later updates
        if (relationshipsSection && isVisible('location')) {
        this.locationSetting = new Setting(relationshipsSection)
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
        }

        // --- Associated Images ---
        if (mediaSection) {
        const imagesSetting = new Setting(mediaSection)
            .setName(t('associatedImages'))
            .setDesc(t('imageGallery'));
        // Store the list container element
        this.imagesListEl = imagesSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(this.imagesListEl, this.event.images || [], 'image'); // Initial render
        // Gallery selection button
        imagesSetting.addButton(button => button
            .setButtonText(t('select'))
            .setTooltip(t('selectFromGallery'))
            .setCta()
            .onClick(() => {
                new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                    if (selectedImage && selectedImage.filePath) {
                        const imagePath = selectedImage.filePath;
                        if (!this.event.images) {
                            this.event.images = [];
                        }
                        if (!this.event.images.includes(imagePath)) {
                            this.event.images.push(imagePath);
                            this.renderList(this.imagesListEl, this.event.images, 'image');
                        }
                    }
                }).open();
            }));
        // Upload button
        imagesSetting.addButton(button => button
            .setButtonText(t('upload'))
            .setTooltip(t('uploadImage'))
            .onClick(async () => {
                const fileInput = createEl('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = async () => {
                    const file = fileInput.files?.[0];
                    if (file) {
                        try {
                            await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);
                            const timestamp = Date.now();
                            const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                            const fileName = `${timestamp}_${sanitizedName}`;
                            const filePath = `${this.plugin.settings.galleryUploadFolder}/${fileName}`;
                            const arrayBuffer = await file.arrayBuffer();
                            await this.app.vault.createBinary(filePath, arrayBuffer);
                            if (!this.event.images) {
                                this.event.images = [];
                            }
                            if (!this.event.images.includes(filePath)) {
                                this.event.images.push(filePath);
                                this.renderList(this.imagesListEl, this.event.images, 'image');
                            }
                            new Notice(t('imageUploaded', fileName));
                        } catch {
                            
                            new Notice(t('errorUploadingImage'));
                        }
                    }
                };
                fileInput.click();
            }));
        } else {
            this.imagesListEl = contentEl.ownerDocument.createElement('div');
        }

        // --- Tags ---
        const organizationSection = isVisible('organization')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Organization',
                description: 'Tags, groups, and timeline branches',
                icon: 'tags',
                open: Boolean(this.event.tags?.length || this.event.groups?.length || this.event.branches?.length),
            })
            : null;
        if (organizationSection) {
        const tagsSetting = new Setting(organizationSection)
            .setName('Event tags')
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
            .setButtonText('Add tag')
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

        // --- Groups ---
        const groupSelectorContainer = organizationSection.createDiv('storyteller-group-selector-container');
        this.groupSelector.attach(groupSelectorContainer);

        // --- Timeline Forks ---
        const forks = this.plugin.getTimelineForks();
        if (forks.length > 0) {
            organizationSection.createEl('p', {
                text: 'Assign this event to alternate timeline forks',
                cls: 'storyteller-modal-description'
            });
            this.forkSelectorContainer = organizationSection.createDiv('storyteller-fork-selector-container');
            this.renderForkSelector(this.forkSelectorContainer);
        }
        }

        // --- Custom Fields ---
        // Defined fields always render. Only the free-form rows follow the switch.
        this.customFieldsEditor.setFields(this.event.customFields);
        this.customFieldsEditor.renderDefinedFields(contentEl);
        if (isVisible('customFields')) {
            const customFieldsSection = createCollapsibleModalSection(contentEl, {
                title: 'Custom fields',
                description: 'Additional properties specific to this project',
                icon: 'list-plus',
                open: Boolean(Object.keys(this.event.customFields || {}).length),
            });
            this.customFieldsEditor.renderFreeFormSection(customFieldsSection, { heading: false });
        }

        // --- Action Buttons ---
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        this.createFooterButton(footerEl, t('cancel'), () => {
            this.close();
        });
        this.createFooterButton(footerEl, this.isNew ? t('createNewEvent') : t('saveChanges'), async () => {
            if (!this.event.name?.trim()) {
                new Notice(t('eventNameRequired'));
                return;
            }
            if (isVisible('dateTime') && !this.validateDateForSave(this.event.dateTime, 'event date')) return;
            if (isVisible('narrative') && !this.validateDateForSave(this.event.narrativeMarkers?.narrativeDate, 'narrative date')) return;
            if (isVisible('narrative') && !this.validateNarrativeTiming()) return;
            this.event.description = this.event.description || '';
            this.event.outcome = this.event.outcome || '';
            try {
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.event.customFields = customFields;
                await this.onSubmit(this.event);
                await this.persistGroupMembershipChanges();
                this.close();
            } catch {
                
                new Notice(t('workspaceLeafRevealError'));
            }
        }, { cta: true });
    })(); }

    private updateDateValidation(setting: Setting, value: string, optional: boolean): void {
        const trimmed = value.trim();
        setting.settingEl.toggleClass('storyteller-setting-invalid', Boolean(trimmed) && !this.isValidDate(trimmed));
        if (!trimmed) {
            setting.setDesc(optional ? 'Optional' : 'Undated events are saved but do not appear on the timeline.');
            return;
        }
        const parsed = parseTimelineDate(trimmed);
        setting.setDesc(this.isValidDate(trimmed)
            ? (parsed.approximate ? 'Recognized as an approximate date.' : 'Recognized date.')
            : `This date cannot be placed on the active timeline: ${parsed.error || 'unrecognized date'}`);
    }

    private isValidDate(value: string): boolean {
        const calendar = new CalendarRegistry(this.plugin).getActiveCalendar();
        const parts = value.split(/\s+(?:to|through|until)\s+/i).filter(Boolean);
        if (calendar.id === GREGORIAN_CALENDAR.id) {
            return parts.every(part => Boolean(parseTimelineDate(part).start));
        }
        return parts.every(part => Number.isFinite(parseToAbsoluteDay(part, calendar)));
    }

    private datePosition(value: string): number | undefined {
        const first = value.split(/\s+(?:to|through|until)\s+/i)[0];
        const calendar = new CalendarRegistry(this.plugin).getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) {
            const day = parseToAbsoluteDay(first, calendar);
            return typeof day === 'number' && Number.isFinite(day) ? day : undefined;
        }
        const parsed = parseTimelineDate(first).start;
        return parsed?.toMillis();
    }

    private validateDateForSave(value: string | undefined, label: string): boolean {
        const trimmed = value?.trim();
        if (!trimmed || this.isValidDate(trimmed)) return true;
        new Notice(`Fix the ${label} before saving. Storyteller cannot place "${trimmed}" on the timeline.`);
        return false;
    }

    private validateNarrativeTiming(): boolean {
        const markers = this.event.narrativeMarkers;
        const direction = markers?.isFlashback ? 'flashback' : markers?.isFlashforward ? 'flash-forward' : null;
        if (!direction) return true;
        if (!markers?.narrativeDate?.trim()) {
            new Notice(`Add a narrative date so the ${direction} has a real position in Narrative order.`);
            return false;
        }
        if (!this.event.dateTime?.trim()) {
            new Notice(`Add the event's chronological date so Storyteller can determine the ${direction} direction.`);
            return false;
        }
        const occurred = this.datePosition(this.event.dateTime);
        const narrated = this.datePosition(markers.narrativeDate);
        if (occurred === undefined || narrated === undefined) return true;
        if (markers.isFlashback && occurred >= narrated) {
            new Notice('A flashback must occur before its narrative date. Adjust one of the dates before saving.');
            return false;
        }
        if (markers.isFlashforward && occurred <= narrated) {
            new Notice('A flash-forward must occur after its narrative date. Adjust one of the dates before saving.');
            return false;
        }
        return true;
    }

    /**
     * Group membership is intentionally committed only after the Event note is
     * saved and has a stable id. Cancel therefore has no external side effects.
     */
    private async persistGroupMembershipChanges(): Promise<void> {
        const eventKey = this.event.id || this.event.name;
        if (!eventKey) return;
        const changes = changedMemberships(this.originalGroupIds, this.event.groups || []);
        for (const groupId of changes.added) {
            await this.plugin.addMemberToGroup(groupId, 'event', eventKey);
        }
        for (const groupId of changes.removed) {
            await this.plugin.removeMemberFromGroup(groupId, 'event', eventKey);
        }
    }

    // Updated Helper to add/remove the location clear button dynamically
    updateLocationClearButton() {
        // Ensure the setting container exists
        if (this.locationSetting === undefined || !this.locationSetting.controlEl) return;

        const controlEl = this.locationSetting.controlEl;
        const existingClearButton = controlEl.querySelector('.storyteller-clear-location-button');

        // Update Select/Change button text
        if (this.selectLocationButton !== undefined) {
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


   renderForkSelector(container: HTMLElement) {
        container.empty();
        const allForks = this.plugin.getTimelineForks();
        // Work only on the draft. saveEvent's Event <-> Branch sync commits the
        // relationship after Save; Cancel leaves both notes untouched.
        const eventIdentifiers = Array.from(new Set([this.event.id, this.event.name].filter((key): key is string => Boolean(key))));
        const selectedBranchNames = new Set([
            ...(this.event.branches || []),
            ...allForks
                .filter(fork => isEventLinkedToFork(eventIdentifiers, fork))
                .map(fork => fork.name),
        ]);
        const selectedForkIds = new Set(
            allForks.filter(fork => selectedBranchNames.has(fork.name)).map(fork => fork.id)
        );

        new Setting(container)
            .setName('Timeline forks')
            .setDesc('Add this event to alternate timelines')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- select a fork --');
                allForks.forEach(fork => {
                    // Only show forks that don't already contain this event
                    if (!selectedForkIds.has(fork.id)) {
                        dropdown.addOption(fork.id, fork.name);
                    }
                });
                dropdown.setValue('');
                dropdown.onChange((forkId) => {
                    if (forkId) {
                        const fork = allForks.find(candidate => candidate.id === forkId);
                        if (!fork) return;
                        selectedBranchNames.add(fork.name);
                        this.event.branches = Array.from(selectedBranchNames);
                        this.renderForkSelector(container);
                    }
                });
            });

        // Show selected forks as removable tags
        if (selectedForkIds.size > 0) {
            const selectedDiv = container.createDiv('selected-forks');
            selectedDiv.setCssStyles({ marginTop: '8px' });
            allForks.filter(f => selectedForkIds.has(f.id)).forEach(fork => {
                const tag = selectedDiv.createSpan({ cls: 'fork-tag' });
                tag.setCssStyles({ display: 'inline-flex' });
                tag.setCssStyles({ alignItems: 'center' });
                tag.setCssStyles({ padding: '2px 8px' });
                tag.setCssStyles({ marginRight: '4px' });
                tag.setCssStyles({ marginBottom: '4px' });
                tag.setCssStyles({ borderRadius: '4px' });
                tag.setCssStyles({ backgroundColor: fork.color || '#666' });
                tag.setCssStyles({ color: '#fff' });
                tag.setCssStyles({ fontSize: '12px' });

                tag.createSpan({ text: fork.name });

                const removeBtn = tag.createSpan({ text: ' x', cls: 'remove-fork-btn' });
                removeBtn.setCssStyles({ cursor: 'pointer' });
                removeBtn.setCssStyles({ marginLeft: '4px' });
                removeBtn.setCssStyles({ fontWeight: 'bold' });
                removeBtn.onclick = () => {
                    selectedBranchNames.delete(fork.name);
                    this.event.branches = Array.from(selectedBranchNames);
                    this.renderForkSelector(container);
                };
            });
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        if (template.entities.scenes?.length) entityCount += template.entities.scenes.length;
        return entityCount > 1;
    }

    private async applyTemplateToEventWithVariables(template: Template, variableValues: Record<string, TemplateVariableValue>): Promise<void> {
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
        	// intentional
            
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

    private async applyProcessedTemplateToEvent(templateEvt: TemplateEntity<Event>): Promise<void> {

        const { yamlContent, markdownContent, sectionContent, customYamlFields } = templateEvt;

        let fields: Record<string, unknown> = { ...templateEvt };
        delete fields.templateId;
        delete fields.yamlContent;
        delete fields.markdownContent;
        delete fields.sectionContent;
        delete fields.customYamlFields;
        delete fields.id;
        delete fields.filePath;
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent) as unknown;
                if (isRecord(parsed)) {
                    fields = { ...fields, ...parsed };
                }
                
            } catch {
            	// intentional
                
            }
        } else if (customYamlFields) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent (parse sections)
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(`---\n---\n\n${markdownContent}`);
                allTemplateSections = parsedSections;

                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    fields.description = parsedSections['Description'];
                }
                if ('Outcome' in parsedSections) {
                    fields.outcome = parsedSections['Outcome'];
                }
                
            } catch {
            	// intentional
                
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k] = v; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                fields[propName] = content;
            }
        }

        // Apply all fields to the event
        Object.assign(this.event, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.event, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        

        // Clear relationships as they reference template entities
        this.event.characters = [];
        this.event.connections = [];
        this.event.groups = [];
        this.event.dependencies = [];
        this.event.dependencyNames = [];
    }

    private refresh(): void {
        // Refresh the modal by reopening it
        void this.onOpen();
    }

    onClose() {
        this.groupSelector.dispose();
        this.contentEl.empty();
    }
}

