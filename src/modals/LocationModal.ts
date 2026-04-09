/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent, parseYaml, setIcon } from 'obsidian';
import { Location } from '../types'; // Assumes Location type no longer has charactersPresent, eventsHere, subLocations
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { LocationSuggestModal } from './LocationSuggestModal';
import { LocationPicker } from '../components/LocationPicker';
import { LocationService } from '../services/LocationService';
import { AddEntityToLocationModal } from './AddEntityToLocationModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// TODO: Maps feature - MapSuggestModal to be reimplemented
// import { MapSuggestModal } from './MapSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';
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
    private imagesListEl!: HTMLElement;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;
    private readonly groupSelector: EntityGroupSelector;

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
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'location', this.location.customFields);
        this.groupSelector = new EntityGroupSelector({
            plugin: this.plugin,
            description: t('assignToGroupsDesc'),
            getSelectedGroupIds: () => this.location.groups,
            setSelectedGroupIds: groupIds => {
                this.location.groups = groupIds;
            },
            loadSelectedGroupIds: async () => {
                const identifier = this.location.id || this.location.name;
                const locations = await this.plugin.listLocations();
                return (locations.find(current => (current.id || current.name) === identifier)?.groups || this.location.groups || []) as string[];
            },
            persistAdd: async groupId => {
                await this.plugin.addMemberToGroup(groupId, 'location', this.location.id || this.location.name);
            },
            persistRemove: async groupId => {
                await this.plugin.removeMemberFromGroup(groupId, 'location', this.location.id || this.location.name);
            }
        });
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-location-modal');
    }

    async onOpen() {
        super.onOpen(); // Call ResponsiveModal's mobile optimizations

        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewLocation') : `${t('edit')} ${this.location.name}` });

        // Auto-apply default template for new locations
        if (this.isNew && !this.location.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['location'];
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
                                            await this.applyTemplateToLocationWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[LocationModal] Error applying template:', error);
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    },
                                    resolve
                                ).open();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToLocation(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[LocationModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

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
                                // Check if template has variables or multiple entities
                                if ((template.variables && template.variables.length > 0) ||
                                    this.hasMultipleEntities(template)) {
                                    // Use TemplateApplicationModal for variable collection
                                    await new Promise<void>((resolve) => {
                                        import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                            new TemplateApplicationModal(
                                                this.app,
                                                this.plugin,
                                                template,
                                                async (variableValues, entityFileNames) => {
                                                    try {
                                                        await this.applyTemplateToLocationWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[LocationModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                },
                                                resolve
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToLocation(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
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

        // --- Associated Images ---
        const imagesSetting = new Setting(contentEl)
            .setName(t('associatedImages'))
            .setDesc(t('imageGallery'));
        // Store the list container element
        this.imagesListEl = imagesSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderImagesList(this.imagesListEl, this.location.images || []); // Initial render

        // Gallery selection button
        imagesSetting.addButton(button => button
            .setButtonText(t('select'))
            .setTooltip(t('selectFromGallery'))
            .setCta()
            .onClick(() => {
                new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                    if (selectedImage && selectedImage.filePath) {
                        const imagePath = selectedImage.filePath;
                        if (!this.location.images) {
                            this.location.images = [];
                        }
                        if (!this.location.images.includes(imagePath)) {
                            this.location.images.push(imagePath);
                            this.renderImagesList(this.imagesListEl, this.location.images);
                        }
                    }
                }).open();
            }));

        // Upload button
        imagesSetting.addButton(button => button
            .setButtonText(t('upload'))
            .setTooltip(t('uploadImage'))
            .onClick(async () => {
                const fileInput = document.createElement('input');
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
                            if (!this.location.images) {
                                this.location.images = [];
                            }
                            if (!this.location.images.includes(filePath)) {
                                this.location.images.push(filePath);
                                this.renderImagesList(this.imagesListEl, this.location.images);
                            }
                            new Notice(t('imageUploaded', fileName));
                        } catch (error) {
                            console.error('Error uploading image:', error);
                            new Notice(t('errorUploadingImage'));
                        }
                    }
                };
                fileInput.click();
            }));

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
                        // Reload location from plugin to get updated entityRefs
                        const updatedLocation = await locationService.getLocation(
                            this.location.id || this.location.name
                        );
                        if (updatedLocation) {
                            this.location = updatedLocation;
                        }
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
                            // Reload location from plugin to get updated entityRefs
                            const updatedLocation = await locationService.getLocation(
                                this.location.id || this.location.name
                            );
                            if (updatedLocation) {
                                this.location = updatedLocation;
                            }
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
                            // Reload location from plugin to get updated entityRefs
                            const updatedLocation = await locationService.getLocation(
                                this.location.id || this.location.name
                            );
                            if (updatedLocation) {
                                this.location = updatedLocation;
                            }
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
                            // Reload location from plugin to get updated entityRefs
                            const updatedLocation = await locationService.getLocation(
                                this.location.id || this.location.name
                            );
                            if (updatedLocation) {
                                this.location = updatedLocation;
                            }
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

        // --- Cultures ---
        contentEl.createEl('h3', { text: 'Cultures' });
        if (!Array.isArray(this.location.cultures)) this.location.cultures = [];
        const locCultureChips = contentEl.createDiv('storyteller-linked-chips');
        const renderLocCultureChips = () => {
            locCultureChips.empty();
            for (const name of this.location.cultures!) {
                const chip = locCultureChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.location.cultures = this.location.cultures!.filter(n => n !== name);
                    renderLocCultureChips();
                });
            }
        };
        renderLocCultureChips();
        const allCulturesForLoc = await this.plugin.listCultures();
        new Setting(contentEl)
            .setName('Add culture')
            .addDropdown(dd => {
                dd.addOption('', '— select culture —');
                allCulturesForLoc.forEach(c => dd.addOption(c.name, c.name));
                dd.onChange(val => {
                    if (val && !this.location.cultures!.includes(val)) {
                        this.location.cultures!.push(val);
                        renderLocCultureChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Finances ---
        contentEl.createEl('h3', { text: 'Finances' });
        new Setting(contentEl)
            .setName('Treasury / Balance')
            .setDesc('Economic wealth of this location (e.g. "5000gp 200sp"). Auto-computed from ledger blocks if present.')
            .addText(text => text
                .setValue(this.location.balance || '')
                .onChange(val => { this.location.balance = val.trim() || undefined; })
            );
        if (this.location.ledger && this.location.ledger.length > 0) {
            contentEl.createDiv('storyteller-ledger-preview').createEl('p', {
                cls: 'storyteller-ledger-note',
                text: `${this.location.ledger.length} transaction(s) in note`
            });
        }

        // --- Linked Economies ---
        contentEl.createEl('h3', { text: 'Economies' });
        if (!Array.isArray(this.location.linkedEconomies)) this.location.linkedEconomies = [];
        const locEconChips = contentEl.createDiv('storyteller-linked-chips');
        const renderLocEconChips = () => {
            locEconChips.empty();
            for (const name of (this.location.linkedEconomies ?? [])) {
                const chip = locEconChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.location.linkedEconomies = this.location.linkedEconomies!.filter(n => n !== name);
                    renderLocEconChips();
                });
            }
        };
        renderLocEconChips();
        const allEconomiesForLoc = await this.plugin.listEconomies();
        new Setting(contentEl)
            .setName('Add economy')
            .addDropdown(dd => {
                dd.addOption('', '— select economy —');
                allEconomiesForLoc.forEach(e => dd.addOption(e.name, e.name));
                dd.onChange(val => {
                    if (val && !(this.location.linkedEconomies ?? []).includes(val)) {
                        if (!Array.isArray(this.location.linkedEconomies)) this.location.linkedEconomies = [];
                        this.location.linkedEconomies.push(val);
                        renderLocEconChips();
                    }
                    dd.setValue('');
                });
            });

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
        this.customFieldsEditor.setFields(this.location.customFields);
        this.customFieldsEditor.renderSection(contentEl);

        // --- Groups ---
        const groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.groupSelector.attach(groupSelectorContainer);

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('deleteLocation'), async () => {
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
            }, { warning: true });
        }

        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer', attr: { 'aria-hidden': 'true' } });

        this.createFooterButton(footerEl, t('cancel'), () => {
            this.close();
        });

        this.createFooterButton(footerEl, this.isNew ? 'Create location' : 'Save changes', async () => {
            if (!this.location.name?.trim()) {
                new Notice(t('locationNameRequired'));
                return;
            }
            this.location.description = this.location.description || '';
            this.location.history = this.location.history || '';
            try {
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.location.customFields = customFields;
                await this.onSubmit(this.location);
                this.close();
            } catch (error) {
                console.error("Error saving location:", error);
                new Notice(t('failedToSave', t('location')));
            }
        }, { cta: true });
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

    private hasMultipleEntities(template: Template): boolean {
        if (!template.entities) return false;
        
        let entityCount = 0;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToLocation(template: Template): Promise<void> {
        if (!template.entities.locations || template.entities.locations.length === 0) {
            new Notice('This template does not contain any locations');
            return;
        }

        const templateLoc = template.entities.locations[0];
        await this.applyProcessedTemplateToLocation(templateLoc);
    }

    private async applyTemplateToLocationWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.locations || template.entities.locations.length === 0) {
            new Notice('This template does not contain any locations');
            return;
        }

        // Get the first location from the template
        let templateLoc = template.entities.locations[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateLoc,
            variableValues,
            false // non-strict mode
        );
        templateLoc = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[LocationModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToLocation(templateLoc);
    }

    private async applyProcessedTemplateToLocation(templateLoc: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateLoc as any;

        let fields: any = { ...rest };
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[LocationModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[LocationModal] Failed to parse yamlContent:', error);
            }
        } else if (customYamlFields) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent (parse sections)
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(markdownContent);
                allTemplateSections = parsedSections;

                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    fields.description = parsedSections['Description'];
                }
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }

                console.log('[LocationModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[LocationModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k as string] = v as string; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the location
        Object.assign(this.location, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.location, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        console.log('[LocationModal] Final location after template:', this.location);

        // Clear relationships as they reference template entities
        this.location.connections = [];
        this.location.groups = [];
    }

    private refresh(): void {
        // Refresh the modal by reopening it
        void this.onOpen();
    }

    /**
     * Render the list of associated images
     */
    private renderImagesList(container: HTMLElement, images: string[]): void {
        container.empty();
        if (!images || images.length === 0) {
            container.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            return;
        }
        images.forEach((imagePath, index) => {
            const itemEl = container.createDiv('storyteller-modal-list-item');
            itemEl.createSpan({ text: imagePath });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${imagePath}`)
                .setIcon('cross')
                .onClick(() => {
                    if (this.location.images) {
                        this.location.images.splice(index, 1);
                        this.renderImagesList(container, this.location.images);
                    }
                });
        });
    }

    onClose() {
        this.groupSelector.dispose();
        this.contentEl.empty();
    }
}

