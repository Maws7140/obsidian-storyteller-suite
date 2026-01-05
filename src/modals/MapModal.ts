/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent, DropdownComponent, Modal, parseYaml } from 'obsidian';
import { StoryMap as Map } from '../types';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { ResponsiveModal } from './ResponsiveModal';
import { PromptModal } from './ui/PromptModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { LocationSuggestModal } from './LocationSuggestModal';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';

export type MapModalSubmitCallback = (map: Map) => Promise<void>;
export type MapModalDeleteCallback = (map: Map) => Promise<void>;

export class MapModal extends ResponsiveModal {
    map: Map;
    plugin: StorytellerSuitePlugin;
    onSubmit: MapModalSubmitCallback;
    onDelete?: MapModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;
    private hierarchyManager: MapHierarchyManager;
    private hasAutoAppliedTemplate = false;

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
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-map-modal');
    }

    async onOpen() {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();
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
                                    async (variableValues, entityFileNames) => {
                                        try {
                                            await this.applyTemplateToMapWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            // Ensure map has a name before refresh to prevent re-triggering
                                            if (!this.map.name) {
                                                this.map.name = 'Untitled Map';
                                            }
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[MapModal] Error applying template:', error);
                                            new Notice('Error applying default template');
                                        }
                                        safeResolve();
                                    }
                                );
                                // Attach onClose handler to resolve when modal is dismissed/cancelled
                                const originalOnClose = modal.onClose.bind(modal);
                                modal.onClose = () => {
                                    originalOnClose();
                                    safeResolve();
                                };
                                modal.open();
                            }).catch((error) => {
                                console.error('[MapModal] Error loading TemplateApplicationModal:', error);
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
                            console.error('[MapModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // Template Selector (for new maps)
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured map template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a map template')
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
                                                        await this.applyTemplateToMapWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[MapModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToMap(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            },
                            'map' as any
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
            .setName('Map Type')
            .setDesc('Image-based maps use custom images, real-world maps use tile servers')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('image', 'Image Map')
                    .addOption('real', 'Real-World Map')
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
                    .onChange((value: any) => {
                        this.map.scale = value;
                    });
            });

        // Corresponding Location
        contentEl.createEl('h3', { text: 'Corresponding Location' });
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
                    .setButtonText('Select Location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        new LocationSuggestModal(this.app, this.plugin, async (selectedLocation) => {
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
                        }).open();
                    });
            });

        // Image Map Configuration
        if (this.map.type === 'image') {
            contentEl.createEl('h3', { text: 'Image Map Settings' });

            const backgroundImageSetting = new Setting(contentEl)
                .setName('Background Image')
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
            contentEl.createEl('h3', { text: 'Real-World Map Settings' });

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
                .setName('Default Zoom')
                .setDesc('Initial zoom level')
                .addText(text => text
                    .setValue(this.map.defaultZoom?.toString() || '13')
                    .onChange(value => {
                        const num = parseInt(value);
                        this.map.defaultZoom = isNaN(num) ? 13 : num;
                    }));

            new Setting(contentEl)
                .setName('Tile Server')
                .setDesc('Custom tile server URL (optional)')
                .addText(text => text
                    .setValue(this.map.tileServer || '')
                    .onChange(value => {
                        this.map.tileServer = value || undefined;
                    }));

            new Setting(contentEl)
                .setName('Dark Mode')
                .setDesc('Use dark mode tiles')
                .addToggle(toggle => toggle
                    .setValue(this.map.darkMode || false)
                    .onChange(value => {
                        this.map.darkMode = value;
                    }));
        }

        // Common Map Settings
        contentEl.createEl('h3', { text: 'Map Settings' });

        new Setting(contentEl)
            .setName('Min Zoom')
            .setDesc('Minimum zoom level')
            .addText(text => text
                .setValue(this.map.minZoom?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.map.minZoom = isNaN(num) ? undefined : num;
                }));

        new Setting(contentEl)
            .setName('Max Zoom')
            .setDesc('Maximum zoom level')
            .addText(text => text
                .setValue(this.map.maxZoom?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.map.maxZoom = isNaN(num) ? undefined : num;
                }));

        // Profile Image
        const profileImageSetting = new Setting(contentEl)
            .setName('Thumbnail Image')
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
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        if (!this.map.customFields) this.map.customFields = {};
        this.renderCustomFields(customFieldsContainer, this.map.customFields);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    if (!this.map.customFields) this.map.customFields = {};
                    const fields = this.map.customFields;
                    const reserved = new Set<string>([...getWhitelistKeys('map'), 'customFields', 'filePath', 'id', 'sections']);
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

        // Groups
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

        // Action Buttons
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('delete'))
                .setCta()
                .setClass('mod-warning')
                .onClick(async () => {
                    if (await this.confirmDelete()) {
                        await this.onDelete!(this.map);
                        this.close();
                    }
                }));
        }

        buttonsSetting.addButton(button => button
            .setButtonText(t('cancel'))
            .onClick(() => this.close()));

        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? t('create') : t('save'))
            .setCta()
            .onClick(async () => {
                try {
                    if (!this.map.name.trim()) {
                        new Notice('Map name is required');
                        return;
                    }

                    console.log('MapModal: Starting save process for map:', this.map.name);

                    // Auto-link map and location before saving (non-blocking)
                    try {
                        await this.autoLinkMapAndLocation();
                        console.log('MapModal: Auto-linking completed');
                    } catch (linkError) {
                        console.error('MapModal: Auto-linking error (non-blocking):', linkError);
                        // Continue with save even if auto-linking fails
                    }

                    console.log('MapModal: Calling onSubmit');
                    await this.onSubmit(this.map);
                    console.log('MapModal: Save completed, closing modal');
                    this.close();
                } catch (error) {
                    console.error('MapModal: Error during save:', error);
                    new Notice(`Error saving map: ${error.message || 'Unknown error'}`);
                }
            }));
    }

    onClose() {
        if (this._groupRefreshInterval) {
            window.clearInterval(this._groupRefreshInterval);
            this._groupRefreshInterval = null;
        }
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
                console.warn(`Corresponding location not found: ${this.map.correspondingLocationId}`);
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
                        console.log(`Auto-linked parent map: ${parentLocation.correspondingMapId}`);
                    }
                }
            } else {
                // If location has no parent, this map should have no parent either
                if (this.map.parentMapId) {
                    this.map.parentMapId = undefined;
                    console.log('Cleared parent map (location has no parent)');
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
                    console.log(`Auto-linked ${childMapIds.length} child map(s)`);
                }
            } else {
                // No child locations, so no child maps
                if (this.map.childMapIds && this.map.childMapIds.length > 0) {
                    this.map.childMapIds = [];
                    console.log('Cleared child maps (location has no children)');
                }
            }

            // Save the location if it was updated
            if (locationUpdated) {
                await this.plugin.saveLocation(location);
                console.log(`Updated location ${location.name} with map reference`);
            }

            // Validate the hierarchy
            const validation = await this.hierarchyManager.validateHierarchy(mapId);
            if (!validation.valid) {
                console.warn('Map hierarchy validation warnings:', validation.errors);
                // Show warnings to user but don't block save
                new Notice(`Warning: ${validation.errors[0]} (map will still be saved)`, 5000);
            }

        } catch (error) {
            console.error('Error auto-linking map and location:', error);
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

    private async applyTemplateToMapWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
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
            console.warn('[MapModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToMap(templateMap);
    }

    private async applyProcessedTemplateToMap(templateMap: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateMap as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[MapModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[MapModal] Failed to parse yamlContent:', error);
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

                console.log('[MapModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[MapModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the map
        Object.assign(this.map, fields);
        console.log('[MapModal] Final map after template:', this.map);

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

    private renderCustomFields(container: HTMLElement, fields: Record<string, string>): void {
        container.empty();
        const entries = Object.entries(fields);
        if (entries.length === 0) {
            container.createEl('p', { text: 'No custom fields' });
            return;
        }

        entries.forEach(([key, value]) => {
            const fieldEl = container.createDiv('storyteller-custom-field');
            fieldEl.createEl('strong', { text: `${key}: ` });
            fieldEl.createSpan({ text: value });
            const deleteBtn = fieldEl.createEl('button', { text: '×', cls: 'storyteller-custom-field-delete' });
            deleteBtn.onclick = () => {
                delete fields[key];
                this.renderCustomFields(container, fields);
            };
        });
    }

    private renderGroupSelector(container: HTMLElement): void {
        container.empty();
        const groups = this.plugin.settings.groups || [];
        if (!this.map.groups) this.map.groups = [];

        if (groups.length === 0) {
            container.createEl('p', { text: 'No groups available. Create groups in the Groups section.' });
            return;
        }

        groups.forEach(group => {
            const isSelected = this.map.groups?.includes(group.id || '');
            const groupEl = container.createDiv('storyteller-group-item');
            const checkbox = groupEl.createEl('input', { type: 'checkbox' });
            checkbox.checked = !!isSelected;
            checkbox.onchange = () => {
                if (!this.map.groups) this.map.groups = [];
                if (checkbox.checked) {
                    if (group.id && !this.map.groups.includes(group.id)) {
                        this.map.groups.push(group.id);
                    }
                } else {
                    if (group.id) {
                        this.map.groups = this.map.groups.filter(g => g !== group.id);
                    }
                }
            };
            groupEl.createSpan({ text: group.name });
        });
    }

    private async confirmDelete(): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.setTitle('Confirm Delete');
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
        this.onOpen();
    }
}

