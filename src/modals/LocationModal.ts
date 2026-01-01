/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Location } from '../types'; // Assumes Location type no longer has charactersPresent, eventsHere, subLocations
import { getWhitelistKeys } from '../yaml/EntitySections';
import { Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { LocationSuggestModal } from './LocationSuggestModal';
import { LocationPicker } from '../components/LocationPicker';
import { LocationService } from '../services/LocationService';
import { AddEntityToLocationModal } from './AddEntityToLocationModal';
// TODO: Maps feature - MapSuggestModal to be reimplemented
// import { MapSuggestModal } from './MapSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
import { PromptModal } from './ui/PromptModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
// Placeholder imports for suggesters -
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';

export type LocationModalSubmitCallback = (location: Location) => Promise<void>;
export type LocationModalDeleteCallback = (location: Location) => Promise<void>;

export class LocationModal extends ResponsiveModal {
    location: Location;
    plugin: StorytellerSuitePlugin;
    onSubmit: LocationModalSubmitCallback;
    onDelete?: LocationModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, location: Location | null, onSubmit: LocationModalSubmitCallback, onDelete?: LocationModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = location === null;
        // Remove charactersPresent, eventsHere, subLocations from initialization
        const initialLocation = location ? { ...location } : {
            name: '', description: '', history: '', locationType: undefined, region: undefined, status: undefined, profileImagePath: undefined,
            parentLocation: undefined,
            customFields: {},
            filePath: undefined,
            mapId: undefined,
            relatedMapIds: [],
            markerIds: []
        };
        if (!initialLocation.customFields) initialLocation.customFields = {};
        if (!initialLocation.relatedMapIds) initialLocation.relatedMapIds = [];
        if (!initialLocation.markerIds) initialLocation.markerIds = [];
        // Preserve filePath if editing
        if (location && location.filePath) initialLocation.filePath = location.filePath;
        // REMOVED: Check for subLocations removed
        // if (!initialLocation.subLocations) initialLocation.subLocations = [];

        this.location = initialLocation;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-location-modal');
    }

    async onOpen() {
        super.onOpen(); // Call ResponsiveModal's mobile optimizations

        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewLocation') : `${t('edit')} ${this.location.name}` });

        // Load entity lists for name resolution
        const [maps, characters, events, plotItems] = await Promise.all([
            this.plugin.listMaps(),
            this.plugin.listCharacters(),
            this.plugin.listEvents(),
            this.plugin.listPlotItems()
        ]);

        // Helper to resolve map ID to name
        const getMapName = (mapId: string): string => {
            const map = maps.find(m => m.id === mapId || m.name === mapId);
            return map?.name || mapId;
        };

        // Helper to resolve entity ID to name based on type
        const getEntityName = (entityId: string, entityType: string): string => {
            switch (entityType) {
                case 'character': {
                    const char = characters.find(c => c.id === entityId || c.name === entityId);
                    return char?.name || entityId;
                }
                case 'event': {
                    const event = events.find(e => e.id === entityId || e.name === entityId);
                    return event?.name || entityId;
                }
                case 'item': {
                    const item = plotItems.find(i => i.id === entityId || i.name === entityId);
                    return item?.name || entityId;
                }
                default:
                    return entityId;
            }
        };

        // --- Template Selector (for new locations) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured location template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a location template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToLocation(template);
                                this.refresh(); // Refresh the modal to show template values
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'location' // Filter to location templates only
                        ).open();
                    })
                );
        }

        // --- Basic Fields ---
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('locationNameDesc'))
            .addText(text => text
                .setPlaceholder(t('enterLocationName'))
                .setValue(this.location.name)
                .onChange(value => {
                    this.location.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('locationDescriptionPh'))
                    .setValue(this.location.description || '')
                    .onChange(value => {
                        this.location.description = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('history'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('locationHistoryPh'))
                    .setValue(this.location.history || '')
                    .onChange(value => {
                        this.location.history = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('type'))
            .setDesc(t('locationTypeDesc'))
            .addText(text => text
                .setValue(this.location.locationType || '')
                .onChange(value => { this.location.locationType = value || undefined; }));

        // --- Hierarchical Location Type ---
        new Setting(contentEl)
            .setName('Hierarchy Type')
            .setDesc('Type in the location hierarchy (world, continent, city, building, etc.)')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('', 'None')
                    .addOption('world', 'World')
                    .addOption('continent', 'Continent')
                    .addOption('region', 'Region')
                    .addOption('city', 'City')
                    .addOption('district', 'District')
                    .addOption('building', 'Building')
                    .addOption('room', 'Room')
                    .addOption('custom', 'Custom')
                    .setValue(this.location.type || '')
                    .onChange(value => {
                        this.location.type = (value || undefined) as Location['type'];
                    });
            });

        new Setting(contentEl)
            .setName(t('region'))
            .setDesc(t('locationRegionDesc'))
            .addText(text => text
                .setValue(this.location.region || '')
                .onChange(value => { this.location.region = value || undefined; }));

        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('locationStatusDesc'))
            .addText(text => text
                .setValue(this.location.status || '')
                .onChange(value => { this.location.status = value || undefined; }));

        // --- Parent Location (Hierarchical) ---
        contentEl.createEl('h3', { text: 'Parent Location' });
        const parentLocationContainer = contentEl.createDiv('storyteller-location-picker-container');
        const locationService = new LocationService(this.plugin);
        new LocationPicker(
            this.plugin,
            parentLocationContainer,
            this.location.parentLocationId,
            async (locationId: string) => {
                if (locationId) {
                    // Check for circular reference
                    if (await this.wouldCreateCircularReferenceById(locationId)) {
                        new Notice('Cannot set parent to a descendant location (would create circular reference)');
                        return;
                    }
                }
                this.location.parentLocationId = locationId || undefined;
                // Also update legacy parentLocation for backward compatibility
                if (locationId) {
                    const parent = await locationService.getLocation(locationId);
                    this.location.parentLocation = parent?.name;
                } else {
                    this.location.parentLocation = undefined;
                }
            }
        );

        // --- Profile Image ---
        const profileImageSetting = new Setting(contentEl)
            .setName(t('image'))
            .setDesc('')
            .then(setting => {
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        const imagePathDesc = profileImageSetting.descEl.createEl('small', { 
            text: t('currentValue', this.location.profileImagePath || t('none')) 
        });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.location.profileImagePath,
                onSelect: (path) => {
                    this.location.profileImagePath = path;
                },
                descriptionEl: imagePathDesc
            }
        );

        // --- Map Bindings ---
        contentEl.createEl('h3', { text: 'Map Bindings' });
        const mapBindingsContainer = contentEl.createDiv('storyteller-map-bindings');
        
        if (this.location.mapBindings && this.location.mapBindings.length > 0) {
            const bindingsList = mapBindingsContainer.createEl('ul', { cls: 'storyteller-map-bindings-list' });
            for (const binding of this.location.mapBindings) {
                const li = bindingsList.createEl('li');
                const mapName = getMapName(binding.mapId);
                li.innerHTML = `
                    <span class="map-id">${mapName}</span>
                    <span class="map-coords">[${binding.coordinates[0]}, ${binding.coordinates[1]}]</span>
                    <button class="remove-binding-btn">Remove</button>
                `;
                li.querySelector('.remove-binding-btn')?.addEventListener('click', async () => {
                    await locationService.removeMapBinding(this.location.id || this.location.name, binding.mapId);
                    this.refresh();
                });
            }
        } else {
            mapBindingsContainer.createDiv({ text: 'No map bindings', cls: 'no-bindings' });
        }
        
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add Map Binding')
                .setIcon('plus')
                .onClick(() => {
                    new Notice('Add map binding functionality - select map and coordinates');
                    // TODO: Implement map binding modal
                }));

        // --- Entities at Location ---
        contentEl.createEl('h3', { text: 'Entities Here' });
        const entitiesContainer = contentEl.createDiv('storyteller-location-entities');
        
        if (this.location.entityRefs && this.location.entityRefs.length > 0) {
            const entitiesList = entitiesContainer.createEl('ul', { cls: 'storyteller-entities-list' });
            for (const entityRef of this.location.entityRefs) {
                const li = entitiesList.createEl('li');
                const entityName = getEntityName(entityRef.entityId, entityRef.entityType);
                const supportedTypes = ['character', 'event', 'item'];
                const isSupportedType = supportedTypes.includes(entityRef.entityType);
                
                li.innerHTML = `
                    <span class="entity-type">${entityRef.entityType}</span>
                    <span class="entity-name">${entityName}</span>
                    ${entityRef.relationship ? `<span class="entity-rel">(${entityRef.relationship})</span>` : ''}
                    ${isSupportedType ? '<button class="remove-entity-btn">Remove</button>' : ''}
                `;
                
                if (isSupportedType) {
                    li.querySelector('.remove-entity-btn')?.addEventListener('click', async () => {
                        // Use comprehensive removal that also clears entity's location reference
                        await this.plugin.removeEntityFromMap(
                            entityRef.entityId,
                            entityRef.entityType as 'character' | 'event' | 'item',
                            this.location.id || this.location.name
                        );
                        this.refresh();
                    });
                }
            }
        } else {
            entitiesContainer.createDiv({ text: 'No entities at this location', cls: 'no-entities' });
        }
        
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add Character')
                .setIcon('user')
                .onClick(() => {
                    new AddEntityToLocationModal(
                        this.app,
                        this.plugin,
                        this.location,
                        'character',
                        async (entityId, relationship) => {
                            await locationService.addEntityToLocation(
                                this.location.id || this.location.name,
                                { entityId, entityType: 'character', relationship }
                            );
                            this.refresh();
                        }
                    ).open();
                }))
            .addButton(button => button
                .setButtonText('Add Event')
                .setIcon('calendar')
                .onClick(() => {
                    new AddEntityToLocationModal(
                        this.app,
                        this.plugin,
                        this.location,
                        'event',
                        async (entityId, relationship) => {
                            await locationService.addEntityToLocation(
                                this.location.id || this.location.name,
                                { entityId, entityType: 'event', relationship }
                            );
                            this.refresh();
                        }
                    ).open();
                }))
            .addButton(button => button
                .setButtonText('Add Item')
                .setIcon('box')
                .onClick(() => {
                    new AddEntityToLocationModal(
                        this.app,
                        this.plugin,
                        this.location,
                        'item',
                        async (entityId, relationship) => {
                            await locationService.addEntityToLocation(
                                this.location.id || this.location.name,
                                { entityId, entityType: 'item', relationship }
                            );
                            this.refresh();
                        }
                    ).open();
                }));

        // --- Child Locations ---
        contentEl.createEl('h3', { text: 'Child Locations' });
        const childLocationsContainer = contentEl.createDiv('storyteller-child-locations');
        
        if (this.location.childLocationIds && this.location.childLocationIds.length > 0) {
            const childrenList = childLocationsContainer.createEl('ul', { cls: 'storyteller-children-list' });
            // Load all child locations in parallel
            const childPromises = this.location.childLocationIds.map(childId => 
                locationService.getLocation(childId)
            );
            const children = await Promise.all(childPromises);
            
            for (const child of children) {
                if (child) {
                    const li = childrenList.createEl('li');
                    li.innerHTML = `<span class="child-name">${child.name}</span>`;
                    li.addEventListener('click', () => {
                        // Open child location modal
                        new LocationModal(
                            this.app,
                            this.plugin,
                            child,
                            async (updated) => await this.plugin.saveLocation(updated)
                        ).open();
                    });
                }
            }
        } else {
            childLocationsContainer.createDiv({ text: 'No child locations', cls: 'no-children' });
        }

        // --- Maps Section (Legacy) ---
        // TODO: Maps feature - to be reimplemented
        // contentEl.createEl('h3', { text: 'Maps' });

        // // Primary Map Selector
        // let primaryMapDesc: HTMLElement;
        // new Setting(contentEl)
        //     .setName('Primary Map')
        //     .setDesc('')
        //     .then(setting => {
        //         primaryMapDesc = setting.descEl.createEl('small', {
        //             text: `Current: ${this.location.mapId || 'None'}`
        //         });
        //         setting.descEl.addClass('storyteller-modal-setting-vertical');
        //     })
        //     .addButton(button => button
        //         .setButtonText('Select Map')
        //         .setTooltip('Choose the main map where this location appears')
        //         .onClick(() => {
        //             // Maps feature to be implemented
        //         }))
        //     .addButton(button => button
        //         .setIcon('cross')
        //         .setTooltip('Clear primary map')
        //         .setClass('mod-warning')
        //         .onClick(() => {
        //             this.location.mapId = undefined;
        //             // primaryMapDesc.setText(`Current: None`);
        //         }));

        // // Related Maps List
        // const relatedMapsContainer = contentEl.createDiv('storyteller-modal-linked-entities');
        // this.renderRelatedMapsList(relatedMapsContainer);

        // new Setting(contentEl)
        //     .addButton(button => button
        //         .setButtonText('Add Related Map')
        //         .setIcon('plus')
        //         .onClick(() => {
        //             // Maps feature to be implemented
        //         }));

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Render existing custom fields so users can see and edit them
        if (!this.location.customFields) this.location.customFields = {};
        this.renderCustomFields(customFieldsContainer, this.location.customFields);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    if (!this.location.customFields) this.location.customFields = {};
                    const fields = this.location.customFields;
                    const reserved = new Set<string>([...getWhitelistKeys('location'), 'customFields', 'filePath', 'id', 'sections']);
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
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteLocation'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteLocation', this.location.name))) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.location);
                                new Notice(t('locationDeleted', this.location.name));
                                this.close();
                            } catch (error) {
                                console.error("Error deleting location:", error);
                                new Notice(t('failedToDelete', t('location')));
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
            .setButtonText(this.isNew ? 'Create location' : 'Save changes')
            .setCta()
            .onClick(async () => {
                if (!this.location.name?.trim()) {
                    new Notice(t('locationNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.location.description = this.location.description || '';
                this.location.history = this.location.history || '';
                try {
                    await this.onSubmit(this.location);
                    this.close();
                } catch (error) {
                    console.error("Error saving location:", error);
                    new Notice(t('failedToSave', t('location')));
                }
            }));
    }

    


    renderCustomFields(container: HTMLElement, fields: Record<string, string>) {
        container.empty();
        fields = fields || {};
        const keys = Object.keys(fields);

        if (keys.length === 0) {
            container.createEl('p', { text: t('noCustomFields'), cls: 'storyteller-modal-list-empty' });
            return;
        }

        const reserved = new Set<string>([...getWhitelistKeys('location'), 'customFields', 'filePath', 'id', 'sections']);
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
                            text.setValue(currentKey);
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
        });
    }

    renderRelatedMapsList(container: HTMLElement) {
        container.empty();
        const relatedMapIds = this.location.relatedMapIds || [];

        if (relatedMapIds.length === 0) {
            container.createEl('p', { 
                text: 'No related maps', 
                cls: 'storyteller-modal-list-empty' 
            });
            return;
        }

        relatedMapIds.forEach((mapId, index) => {
            const item = container.createDiv('storyteller-modal-list-item');
            const infoSpan = item.createSpan();
            infoSpan.setText(mapId);

            new ButtonComponent(item)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${mapId}`)
                .setIcon('cross')
                .onClick(() => {
                    this.location.relatedMapIds?.splice(index, 1);
                    this.renderRelatedMapsList(container);
                });
        });
    }

    renderGroupSelector(container: HTMLElement) {
        container.empty();
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.location.id || this.location.name;
            const freshList = await this.plugin.listLocations();
            const fresh = freshList.find(l => (l.id || l.name) === identifier);
            const current = new Set((fresh?.groups || this.location.groups || []) as string[]);
            this.location.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName(t('groups'))
                .setDesc(t('assignToGroupsDesc'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
                    allGroups.forEach(group => {
                        dropdown.addOption(group.id, group.name);
                    });
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.location.groups = Array.from(selectedGroupIds);
                            await this.plugin.addMemberToGroup(value, 'location', this.location.id || this.location.name);
                            this.renderGroupSelector(container);
                        }
                    });
                });
            if (selectedGroupIds.size > 0) {
                const selectedDiv = container.createDiv('selected-groups');
                allGroups.filter(g => selectedGroupIds.has(g.id)).forEach(group => {
                    const tag = selectedDiv.createSpan({ text: group.name, cls: 'group-tag' });
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        selectedGroupIds.delete(group.id);
                        this.location.groups = Array.from(selectedGroupIds);
                        await this.plugin.removeMemberFromGroup(group.id, 'location', this.location.id || this.location.name);
                        this.renderGroupSelector(container);
                    };
                });
            }
        })();
    }

    /**
     * Check if setting a parent location by ID would create a circular reference
     */
    private async wouldCreateCircularReferenceById(locationId: string): Promise<boolean> {
        const locationService = new LocationService(this.plugin);
        const currentId = this.location.id || this.location.name;
        if (locationId === currentId) {
            return true;
        }
        const descendants = await locationService.getLocationDescendants(currentId);
        return descendants.some(d => (d.id || d.name) === locationId);
    }

    /**
     * Check if setting the given location as parent would create a circular reference
     */
    private async wouldCreateCircularReference(parentLocationName: string): Promise<boolean> {
        // If trying to set self as parent, that's circular
        if (parentLocationName === this.location.name) {
            return true;
        }

        // Get all locations to check the hierarchy
        const allLocations = await this.plugin.listLocations();
        const locationMap = new Map<string, Location>();
        
        // Create a map for quick lookup
        allLocations.forEach(loc => {
            locationMap.set(loc.name, loc);
        });

        // Check if the proposed parent has this location as an ancestor
        let currentLocation = locationMap.get(parentLocationName);
        const visited = new Set<string>();
        
        while (currentLocation && currentLocation.parentLocation) {
            // If we've seen this location before, there's already a cycle
            if (visited.has(currentLocation.name)) {
                return true;
            }
            visited.add(currentLocation.name);
            
            // If the parent's ancestor is this location, it would create a cycle
            if (currentLocation.parentLocation === this.location.name) {
                return true;
            }
            
            // Move up the hierarchy
            currentLocation = locationMap.get(currentLocation.parentLocation);
        }

        return false;
    }

    private async applyTemplateToLocation(template: Template): Promise<void> {
        if (!template.entities.locations || template.entities.locations.length === 0) {
            new Notice('This template does not contain any locations');
            return;
        }

        // Get the first location from the template
        const templateLoc = template.entities.locations[0];

        // Extract template-specific fields
        const { templateId, sectionContent, customYamlFields, id, filePath, ...locData } = templateLoc as any;

        // Apply base location fields
        Object.assign(this.location, locData);

        // Apply custom YAML fields if they exist
        if (customYamlFields) {
            Object.assign(this.location, customYamlFields);
        }

        // Apply section content if it exists (map section names to lowercase properties)
        if (sectionContent) {
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (this.location as any)[propName] = content;
            }
        }

        // Clear relationships as they reference template entities
        this.location.connections = [];
        this.location.groups = [];
    }

    private refresh(): void {
        // Refresh the modal by reopening it
        this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}