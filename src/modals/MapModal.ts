 
import { App, Setting, Notice, DropdownComponent, Modal, parseYaml } from 'obsidian';
import { StoryMap as Map } from '../types';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { ResponsiveModal } from './ResponsiveModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import type { Template, TemplateEntity, TemplateVariableValue } from '../templates/TemplateTypes';
import { LocationSuggestModal } from './LocationSuggestModal';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';

export type MapModalSubmitCallback = (map: Map) => Promise<void>;
export type MapModalDeleteCallback = (map: Map) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class MapModal extends ResponsiveModal {
    map: Map;
    plugin: StorytellerSuitePlugin;
    onSubmit: MapModalSubmitCallback;
    onDelete?: MapModalDeleteCallback;
    isNew: boolean;
    private hierarchyManager: MapHierarchyManager;
    private hasAutoAppliedTemplate = false;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;
    private readonly groupSelector: EntityGroupSelector;

    constructor(app: App, plugin: StorytellerSuitePlugin, map: Map | null, onSubmit: MapModalSubmitCallback, onDelete?: MapModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.hierarchyManager = new MapHierarchyManager(app, plugin);
        this.isNew = map === null;
        const initialMap = map ? { ...map } : {
            name: '',
            description: '',
            scale: 'custom' as const,
            type: 'image' as const,
            markers: [],
            customFields: {},
            filePath: undefined,
            linkedLocations: [],
            linkedCharacters: [],
            linkedEvents: [],
            linkedItems: [],
            linkedGroups: []
        };
        if (!initialMap.customFields) initialMap.customFields = {};
        if (!initialMap.markers) initialMap.markers = [];
        if (!initialMap.linkedLocations) initialMap.linkedLocations = [];
        if (!initialMap.linkedCharacters) initialMap.linkedCharacters = [];
        if (!initialMap.linkedEvents) initialMap.linkedEvents = [];
        if (!initialMap.linkedItems) initialMap.linkedItems = [];
        if (!initialMap.linkedGroups) initialMap.linkedGroups = [];
        if (map && map.filePath) initialMap.filePath = map.filePath;

        this.map = initialMap;
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'map', this.map.customFields);
        this.groupSelector = new EntityGroupSelector({
            plugin: this.plugin,
            description: 'Organize this map with groups.',
            getSelectedGroupIds: () => this.map.groups,
            setSelectedGroupIds: groupIds => {
                this.map.groups = groupIds;
            }
        });
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-map-modal');
    }

    onOpen() { void (async () => {
        super.onOpen();

        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? 'Create New Map' : `Edit ${this.map.name}` });

        // Auto-apply default template for new maps (guarded to prevent infinite loops)
        if (this.isNew && !this.map.name && !this.hasAutoAppliedTemplate) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['map'];
            if (defaultTemplateId) {
                const defaultTemplate = this.plugin.templateManager?.getTemplate(defaultTemplateId);
                if (defaultTemplate) {
                    this.hasAutoAppliedTemplate = true;
                    // If template has variables, use TemplateApplicationModal for user input
                    if (defaultTemplate.variables && defaultTemplate.variables.length > 0) {
                        await new Promise<void>((resolve) => {
                            let resolved = false;
                            const safeResolve = () => {
                                if (!resolved) {
                                    resolved = true;
                                    resolve();
                                }
                            };
                            import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                const modal = new TemplateApplicationModal(
                                    this.app,
                                    this.plugin,
                                    defaultTemplate,
                                    (variableValues, entityFileNames) => { void (async () => {
                                        try {
                                            await this.applyTemplateToMapWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            // Ensure map has a name before refresh to prevent re-triggering
                                            if (!this.map.name) {
                                                this.map.name = 'Untitled Map';
                                            }
                                            this.refresh();
                                        } catch (error) {
                                            
                                            new Notice('Error applying default template');
                                        }
                                        safeResolve();
                                    })(); }
                                ) as { onClose: () => void; open: () => void };
                                // Attach onClose handler to resolve when modal is dismissed/cancelled
                                const originalOnClose = modal.onClose;
                                modal.onClose = () => {
                                    originalOnClose.call(modal);
                                    safeResolve();
                                };
                                modal.open();
                            }).catch((error) => {
                                
                                safeResolve();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToMap(defaultTemplate);
                            new Notice('Default template applied');
                            // Ensure map has a name to prevent re-triggering
                            if (!this.map.name) {
                                this.map.name = 'Untitled Map';
                            }
                        } catch (error) {
                            
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // Template Selector (for new maps)
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from template')
                .setDesc('Optionally start with a pre-configured map template')
                .addButton(button => button
                    .setButtonText('Choose template')
                    .setTooltip('Select a map template')
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
                                                        await this.applyTemplateToMapWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                })(); }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToMap(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            })(); },
                            'map'
                        ).open();
                    })
                );
        }

        // Basic Fields
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc('Map name')
            .addText(text => text
                .setPlaceholder('Enter map name')
                .setValue(this.map.name)
                .onChange(value => {
                    this.map.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('Map description')
                    .setValue(this.map.description || '')
                    .onChange(value => {
                        this.map.description = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // Map Type
        new Setting(contentEl)
            .setName('Map type')
            .setDesc('Image-based maps use custom images, real-world maps use tile servers')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('image', 'Image map')
                    .addOption('real', 'Real-world map')
                    .setValue(this.map.type || 'image')
                    .onChange((value: 'image' | 'real') => {
                        this.map.type = value;
                        this.refresh();
                    });
            });

        // Map Scale
        new Setting(contentEl)
            .setName('Scale')
            .setDesc('Map scale/hierarchy level')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('world', 'World')
                    .addOption('region', 'Region')
                    .addOption('city', 'City')
                    .addOption('building', 'Building')
                    .addOption('custom', 'Custom')
                    .setValue(this.map.scale || 'custom')
                    .onChange((value) => {
                        this.map.scale = value as Map['scale'];
                    });
            });

        // Corresponding Location
        contentEl.createEl('h3', { text: 'Corresponding location' });
        const locationService = new (await import('../services/LocationService')).LocationService(this.plugin);
        
        // Get current location name for display
        let currentLocationName = 'None';
        if (this.map.correspondingLocationId) {
            const currentLocation = await locationService.getLocation(this.map.correspondingLocationId);
            if (currentLocation) {
                currentLocationName = currentLocation.name;
            }
        }
        
        const locationSetting = new Setting(contentEl)
            .setName('Location')
            .setDesc(`Every map has a corresponding location. This location represents the area shown on the map. Current: ${currentLocationName}`)
            .addButton(button => {
                button
                    .setButtonText('Select location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        new LocationSuggestModal(this.app, this.plugin, (selectedLocation) => { void (async () => {
                            if (selectedLocation) {
                                this.map.correspondingLocationId = selectedLocation.id || selectedLocation.name;
                                locationSetting.setDesc(`Every map has a corresponding location. This location represents the area shown on the map. Current: ${selectedLocation.name}`);
                                new Notice(`Selected "${selectedLocation.name}" as corresponding location`);
                            } else {
                                // Clear selection if null (Shift+Enter)
                                this.map.correspondingLocationId = undefined;
                                locationSetting.setDesc(`Every map has a corresponding location. This location represents the area shown on the map. Current: None`);
                                new Notice('Corresponding location cleared');
                            }
                        })(); }).open();
                    });
            });

        // Image Map Configuration
        if (this.map.type === 'image') {
            contentEl.createEl('h3', { text: 'Image map settings' });

            const backgroundImageSetting = new Setting(contentEl)
                .setName('Background image')
                .setDesc('')
                .then(setting => {
                    setting.descEl.addClass('storyteller-modal-setting-vertical');
                });
            
            const imagePathDesc = backgroundImageSetting.descEl.createEl('small', {
                text: `Current: ${this.map.backgroundImagePath || this.map.image || 'None'}`
            });
            
            // Add image selection buttons (Gallery, Upload, Vault, Clear)
            addImageSelectionButtons(
                backgroundImageSetting,
                this.app,
                this.plugin,
                {
                    currentPath: this.map.backgroundImagePath || this.map.image,
                    onSelect: (path) => {
                        this.map.backgroundImagePath = path;
                        this.map.image = path;
                    },
                    descriptionEl: imagePathDesc,
                    enableTileGeneration: true
                }
            );

            new Setting(contentEl)
                .setName('Width')
                .setDesc('Map width in pixels or percentage')
                .addText(text => text
                    .setValue(this.map.width?.toString() || '')
                    .onChange(value => {
                        const num = parseInt(value);
                        this.map.width = isNaN(num) ? undefined : num;
                    }));

            new Setting(contentEl)
                .setName('Height')
                .setDesc('Map height in pixels or percentage')
                .addText(text => text
                    .setValue(this.map.height?.toString() || '')
                    .onChange(value => {
                        const num = parseInt(value);
                        this.map.height = isNaN(num) ? undefined : num;
                    }));
        }

        // Real-World Map Configuration
        if (this.map.type === 'real') {
            contentEl.createEl('h3', { text: 'Real-world map settings' });

            new Setting(contentEl)
                .setName('Latitude')
                .setDesc('Initial latitude (center point)')
                .addText(text => text
                    .setValue(this.map.lat?.toString() || '')
                    .onChange(value => {
                        const num = parseFloat(value);
                        this.map.lat = isNaN(num) ? undefined : num;
                    }));

            new Setting(contentEl)
                .setName('Longitude')
                .setDesc('Initial longitude (center point)')
                .addText(text => text
                    .setValue(this.map.long?.toString() || '')
                    .onChange(value => {
                        const num = parseFloat(value);
                        this.map.long = isNaN(num) ? undefined : num;
                    }));

            new Setting(contentEl)
                .setName('Default zoom')
                .setDesc('Initial zoom level')
                .addText(text => text
                    .setValue(this.map.defaultZoom?.toString() || '13')
                    .onChange(value => {
                        const num = parseInt(value);
                        this.map.defaultZoom = isNaN(num) ? 13 : num;
                    }));

            new Setting(contentEl)
                .setName('Tile server')
                .setDesc('Custom tile server URL (optional)')
                .addText(text => text
                    .setValue(this.map.tileServer || '')
                    .onChange(value => {
                        this.map.tileServer = value || undefined;
                    }));

            new Setting(contentEl)
                .setName('Dark mode')
                .setDesc('Use dark mode tiles')
                .addToggle(toggle => toggle
                    .setValue(this.map.darkMode || false)
                    .onChange(value => {
                        this.map.darkMode = value;
                    }));
        }

        // Common Map Settings
        contentEl.createEl('h3', { text: 'Map settings' });

        new Setting(contentEl)
            .setName('Min zoom')
            .setDesc('Minimum zoom level')
            .addText(text => text
                .setValue(this.map.minZoom?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.map.minZoom = isNaN(num) ? undefined : num;
                }));

        new Setting(contentEl)
            .setName('Max zoom')
            .setDesc('Maximum zoom level')
            .addText(text => text
                .setValue(this.map.maxZoom?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.map.maxZoom = isNaN(num) ? undefined : num;
                }));

        // Profile Image
        const profileImageSetting = new Setting(contentEl)
            .setName('Thumbnail image')
            .setDesc('')
            .then(setting => {
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        const profileImageDesc = profileImageSetting.descEl.createEl('small', {
            text: `Current: ${this.map.profileImagePath || 'None'}`
        });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.map.profileImagePath,
                onSelect: (path) => {
                    this.map.profileImagePath = path;
                },
                descriptionEl: profileImageDesc
            }
        );

        // Custom Fields
        this.customFieldsEditor.setFields(this.map.customFields);
        this.customFieldsEditor.renderSection(contentEl);

        // Groups
        const groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.groupSelector.attach(groupSelectorContainer);

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('delete'), async () => {
                if (await this.confirmDelete()) {
                    await this.onDelete!(this.map);
                    this.close();
                }
            }, { warning: true });
        }

        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer', attr: { 'aria-hidden': 'true' } });

        this.createFooterButton(footerEl, t('cancel'), () => this.close());

        this.createFooterButton(footerEl, this.isNew ? t('create') : t('save'), async () => {
            try {
                if (!this.map.name.trim()) {
                    new Notice('Map name is required');
                    return;
                }

                
                try {
                    await this.autoLinkMapAndLocation();
                    
                } catch (linkError) {
                    
                }

                
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.map.customFields = customFields;
                await this.onSubmit(this.map);
                
                this.close();
            } catch (error) {
                
                const message = error instanceof Error ? error.message : 'Unknown error';
                new Notice(`Error saving map: ${message}`);
            }
        }, { cta: true });
    })(); }

    onClose() {
        this.groupSelector.dispose();
        super.onClose();
    }

    /**
     * Auto-link map and location hierarchies
     * Syncs map hierarchy with location hierarchy for seamless nested navigation
     */
    private async autoLinkMapAndLocation(): Promise<void> {
        if (!this.map.correspondingLocationId) {
            return; // No location to link to
        }

        try {
            const { LocationService } = await import('../services/LocationService');
            const locationService = new LocationService(this.plugin);

            // Get the corresponding location
            const location = await locationService.getLocation(this.map.correspondingLocationId);
            if (!location) {
                
                return;
            }

            // Update location's correspondingMapId to point back to this map
            const mapId = this.map.id || this.map.name;
            let locationUpdated = false;

            if (location.correspondingMapId !== mapId) {
                location.correspondingMapId = mapId;
                locationUpdated = true;
            }

            // Sync parent map based on parent location's map
            if (location.parentLocationId) {
                const parentLocation = await locationService.getLocation(location.parentLocationId);
                if (parentLocation && parentLocation.correspondingMapId) {
                    // Set this map's parent to the parent location's map
                    if (this.map.parentMapId !== parentLocation.correspondingMapId) {
                        this.map.parentMapId = parentLocation.correspondingMapId;
                        
                    }
                }
            } else {
                // If location has no parent, this map should have no parent either
                if (this.map.parentMapId) {
                    this.map.parentMapId = undefined;
                    
                }
            }

            // Sync child maps based on child locations' maps
            if (location.childLocationIds && location.childLocationIds.length > 0) {
                const childMapIds: string[] = [];

                for (const childLocId of location.childLocationIds) {
                    const childLoc = await locationService.getLocation(childLocId);
                    if (childLoc && childLoc.correspondingMapId) {
                        childMapIds.push(childLoc.correspondingMapId);
                    }
                }

                // Update childMapIds if changed
                const currentChildIds = this.map.childMapIds || [];
                const childIdsChanged = JSON.stringify(currentChildIds.sort()) !== JSON.stringify(childMapIds.sort());

                if (childIdsChanged) {
                    this.map.childMapIds = childMapIds;
                    
                }
            } else {
                // No child locations, so no child maps
                if (this.map.childMapIds && this.map.childMapIds.length > 0) {
                    this.map.childMapIds = [];
                    
                }
            }

            // Save the location if it was updated
            if (locationUpdated) {
                await this.plugin.saveLocation(location);
                
            }

            // Validate the hierarchy
            const validation = await this.hierarchyManager.validateHierarchy(mapId);
            if (!validation.valid) {
                
                // Show warnings to user but don't block save
                new Notice(`Warning: ${validation.errors[0]} (map will still be saved)`, 5000);
            }

        } catch (error) {
            
            // Don't block save on auto-link errors
            new Notice('Note: Could not auto-link all hierarchies. Map will still be saved.', 4000);
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.maps?.length) entityCount += template.entities.maps.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToMap(template: Template): Promise<void> {
        if (!template.entities.maps || template.entities.maps.length === 0) {
            new Notice('This template does not contain any maps');
            return;
        }

        const templateMap = template.entities.maps[0];
        await this.applyProcessedTemplateToMap(templateMap);
    }

    private async applyTemplateToMapWithVariables(template: Template, variableValues: Record<string, TemplateVariableValue>): Promise<void> {
        if (!template.entities.maps || template.entities.maps.length === 0) {
            new Notice('This template does not contain any maps');
            return;
        }

        // Get the first map from the template
        let templateMap = template.entities.maps[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateMap,
            variableValues,
            false // non-strict mode
        );
        templateMap = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToMap(templateMap);
    }

    private async applyProcessedTemplateToMap(templateMap: TemplateEntity<Map>): Promise<void> {
        const { yamlContent, markdownContent, sectionContent, customYamlFields } = templateMap;

        let fields: Record<string, unknown> = { ...templateMap };
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
                
            } catch (error) {
                
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

                
            } catch (error) {
                
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k] = v; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                fields[propName] = content;
            }
        }

        // Apply all fields to the map
        Object.assign(this.map, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.map, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        

        // Clear entity links as they reference template entities
        this.map.linkedLocations = [];
        this.map.linkedCharacters = [];
        this.map.linkedEvents = [];
        this.map.linkedItems = [];
        this.map.linkedGroups = [];

        // Ensure markers array exists
        if (!this.map.markers) {
            this.map.markers = [];
        }
    }


   private async confirmDelete(): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.setTitle('Confirm delete');
            modal.contentEl.createEl('p', {
                text: `Are you sure you want to delete "${this.map.name}"? This action cannot be undone.`
            });
            modal.contentEl.createEl('br');
            const buttons = new Setting(modal.contentEl);
            buttons.addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => {
                    modal.close();
                    resolve(false);
                }));
            buttons.addButton(button => button
                .setButtonText('Delete')
                .setCta()
                .setClass('mod-warning')
                .onClick(() => {
                    modal.close();
                    resolve(true);
                }));
            modal.open();
        });
    }

    refresh(): void {
        this.onClose();
        void this.onOpen();
    }
}


