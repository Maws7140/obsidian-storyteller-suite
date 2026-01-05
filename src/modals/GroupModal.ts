import { App, Setting, Notice, ButtonComponent, parseYaml } from 'obsidian';
import { t } from '../i18n/strings';
import { Group, Character, Location, Event, PlotItem, GroupMemberDetails, GroupRelationship, Culture } from '../types';
import StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PlotItemSuggestModal } from './PlotItemSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type GroupModalSubmitCallback = (group: Group) => Promise<void>;
export type GroupModalDeleteCallback = (groupId: string) => Promise<void>;

export class GroupModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;
    group: Group;
    isNew: boolean;
    onSubmit: GroupModalSubmitCallback;
    onDelete?: GroupModalDeleteCallback;

    // For member selection
    allCharacters: Character[] = [];
    allLocations: Location[] = [];
    allEvents: Event[] = [];
    allPlotItems: PlotItem[] = [];
    allGroups: Group[] = [];
    allCultures: Culture[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, group: Group | null, onSubmit: GroupModalSubmitCallback, onDelete?: GroupModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = group === null;
        if (group) {
            this.group = {
                ...group,
                members: group.members.map(m => ({ ...m })),
                groupRelationships: group.groupRelationships ? [...group.groupRelationships] : [],
                territories: group.territories ? [...group.territories] : [],
                colors: group.colors ? [...group.colors] : [],
                linkedEvents: group.linkedEvents ? [...group.linkedEvents] : [],
                subgroups: group.subgroups ? [...group.subgroups] : [],
                customFields: group.customFields ? { ...group.customFields } : {}
            };
        } else {
            const activeStory = this.plugin.getActiveStory();
            if (!activeStory) throw new Error('No active story selected');
            this.group = {
                id: '',
                storyId: activeStory.id,
                name: '',
                description: '',
                color: '',
                members: [],
                groupType: 'collection',
                groupRelationships: [],
                territories: [],
                colors: [],
                linkedEvents: [],
                subgroups: [],
                customFields: {}
            };
        }
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-group-modal');
    }

    async onOpen() {
        super.onOpen();

        // Auto-apply default template for new groups
        if (this.isNew && !this.group.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['group'];
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
                                            await this.applyTemplateToGroupWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[GroupModal] Error applying template:', error);
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    }
                                ).open();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToGroup(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[GroupModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // Load all entities first for link repair
        await this.loadAllEntities();

        // Repair broken entity links if this is an existing group
        if (!this.isNew) {
            await this.repairEntityLinks();
        }

        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewGroup') : `${t('editGroup')}: ${this.group.name}` });

        // --- Template Selector (for new groups) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured group template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a group template')
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
                                                        await this.applyTemplateToGroupWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[GroupModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToGroup(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            },
                            'group'
                        ).open();
                    })
                );
        }

        // Load all entities for dropdowns
        await this.loadAllEntities();

        // === BASIC INFORMATION ===
        contentEl.createEl('h3', { text: 'Basic Information' });

        // Name
        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterGroupName'))
                .setValue(this.group.name)
                .onChange(value => { this.group.name = value; })
            );

        // Description
        new Setting(contentEl)
            .setName(t('description'))
            .addTextArea(text => {
                text.setPlaceholder(t('describeGroupPh'))
                    .setValue(this.group.description || '')
                    .onChange(value => { this.group.description = value; });
                text.inputEl.rows = 4;
            });

        // Group Type
        new Setting(contentEl)
            .setName('Group Type')
            .setDesc('Type of group or organization')
            .addDropdown(dropdown => dropdown
                .addOption('collection', 'Simple Collection')
                .addOption('faction', 'Faction')
                .addOption('organization', 'Organization')
                .addOption('guild', 'Guild')
                .addOption('political', 'Political')
                .addOption('military', 'Military')
                .addOption('religious', 'Religious')
                .addOption('custom', 'Custom')
                .setValue(this.group.groupType || 'collection')
                .onChange(value => {
                    this.group.groupType = value as any;
                    // Re-render modal to show/hide faction-enhanced sections
                    void this.onOpen();
                })
            );

        // Color
        new Setting(contentEl)
            .setName(t('color'))
            .addText(text => text
                .setPlaceholder(t('colorPlaceholder'))
                .setValue(this.group.color || '')
                .onChange(value => { this.group.color = value; })
            );

        // Tags
        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .setDesc('Comma-separated tags')
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.group.tags || []).join(', '))
                .onChange(value => { this.group.tags = value.split(',').map(t => t.trim()).filter(Boolean); })
            );

        // Profile Image
        let imagePathDesc: HTMLElement | null = null;
        const profileImageSetting = new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imagePathDesc = s.descEl.createEl('small', { text: `Current: ${this.group.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.group.profileImagePath,
                onSelect: (path) => {
                    this.group.profileImagePath = path;
                },
                descriptionEl: imagePathDesc || undefined
            }
        );

        // === MEMBERS ===
        contentEl.createEl('h3', { text: t('members') });
        this.renderMemberSelectors(contentEl);

        // === FACTION DETAILS === (only show if not collection type)
        if (this.group.groupType && this.group.groupType !== 'collection') {
            contentEl.createEl('h3', { text: 'Faction Details' });

            // History
            new Setting(contentEl)
                .setName('History')
                .setDesc('Origin and historical background')
                .addTextArea(text => {
                    text.setValue(this.group.history || '')
                        .onChange(value => { this.group.history = value; });
                    text.inputEl.rows = 4;
                });

            // Structure
            new Setting(contentEl)
                .setName('Structure')
                .setDesc('Organizational hierarchy and leadership')
                .addTextArea(text => {
                    text.setValue(this.group.structure || '')
                        .onChange(value => { this.group.structure = value; });
                    text.inputEl.rows = 4;
                });

            // Goals
            new Setting(contentEl)
                .setName('Goals')
                .setDesc('Objectives and motivations')
                .addTextArea(text => {
                    text.setValue(this.group.goals || '')
                        .onChange(value => { this.group.goals = value; });
                    text.inputEl.rows = 4;
                });

            // Resources
            new Setting(contentEl)
                .setName('Resources')
                .setDesc('Available assets and capabilities')
                .addTextArea(text => {
                    text.setValue(this.group.resources || '')
                        .onChange(value => { this.group.resources = value; });
                    text.inputEl.rows = 4;
                });

            // Strength
            new Setting(contentEl)
                .setName('Strength')
                .setDesc('Overall power level or description')
                .addText(text => text
                    .setValue(this.group.strength || '')
                    .onChange(value => { this.group.strength = value; })
                );

            // Status
            new Setting(contentEl)
                .setName('Status')
                .setDesc('Current state (active, dormant, disbanded, etc.)')
                .addText(text => text
                    .setValue(this.group.status || '')
                    .onChange(value => { this.group.status = value; })
                );

            // === POWER & INFLUENCE ===
            contentEl.createEl('h3', { text: 'Power & Influence' });

            // Military Power
            new Setting(contentEl)
                .setName('Military Power')
                .setDesc('Military strength (0-100)')
                .addSlider(slider => slider
                    .setLimits(0, 100, 1)
                    .setValue(this.group.militaryPower || 50)
                    .setDynamicTooltip()
                    .onChange(value => { this.group.militaryPower = value; })
                );

            // Economic Power
            new Setting(contentEl)
                .setName('Economic Power')
                .setDesc('Economic influence (0-100)')
                .addSlider(slider => slider
                    .setLimits(0, 100, 1)
                    .setValue(this.group.economicPower || 50)
                    .setDynamicTooltip()
                    .onChange(value => { this.group.economicPower = value; })
                );

            // Political Influence
            new Setting(contentEl)
                .setName('Political Influence')
                .setDesc('Political power (0-100)')
                .addSlider(slider => slider
                    .setLimits(0, 100, 1)
                    .setValue(this.group.politicalInfluence || 50)
                    .setDynamicTooltip()
                    .onChange(value => { this.group.politicalInfluence = value; })
                );

            // === IDENTITY & SYMBOLS ===
            contentEl.createEl('h3', { text: 'Identity & Symbols' });

            // Colors
            new Setting(contentEl)
                .setName('Colors')
                .setDesc('Faction colors (comma-separated)')
                .addText(text => text
                    .setValue((this.group.colors || []).join(', '))
                    .onChange(value => {
                        this.group.colors = value.split(',').map(c => c.trim()).filter(Boolean);
                    })
                );

            // Emblem
            new Setting(contentEl)
                .setName('Emblem')
                .setDesc('Symbol or emblem description')
                .addText(text => text
                    .setValue(this.group.emblem || '')
                    .onChange(value => { this.group.emblem = value; })
                );

            // Motto
            new Setting(contentEl)
                .setName('Motto')
                .setDesc('Slogan or motto')
                .addText(text => text
                    .setValue(this.group.motto || '')
                    .onChange(value => { this.group.motto = value; })
                );

            // Territories
            new Setting(contentEl)
                .setName('Territories')
                .setDesc('Controlled territories (comma-separated)')
                .addTextArea(text => {
                    text.setValue((this.group.territories || []).join(', '))
                        .onChange(value => {
                            this.group.territories = value.split(',').map(t => t.trim()).filter(Boolean);
                        });
                    text.inputEl.rows = 3;
                });

            // === RELATIONSHIPS ===
            contentEl.createEl('h3', { text: 'Relationships' });

            // Group Relationships
            if (!this.group.groupRelationships) {
                this.group.groupRelationships = [];
            }

            contentEl.createEl('h4', { text: 'Inter-Group Relationships', cls: 'storyteller-subsection-header' });

            this.group.groupRelationships.forEach((rel, index) => {
                const relSetting = new Setting(contentEl)
                    .setName(`Relationship ${index + 1}`)
                    .addDropdown(dropdown => {
                        dropdown.addOption('', 'Select group...');
                        this.allGroups
                            .filter(g => g.id !== this.group.id)
                            .forEach(g => dropdown.addOption(g.name, g.name));
                        dropdown.setValue(rel.groupName || '')
                            .onChange(value => { rel.groupName = value; });
                    })
                    .addDropdown(dropdown => {
                        dropdown
                            .addOption('allied', 'Allied')
                            .addOption('friendly', 'Friendly')
                            .addOption('neutral', 'Neutral')
                            .addOption('rival', 'Rival')
                            .addOption('hostile', 'Hostile')
                            .addOption('at-war', 'At War')
                            .setValue(rel.relationshipType || 'neutral')
                            .onChange(value => { rel.relationshipType = value as any; });
                    })
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Remove')
                        .onClick(() => {
                            this.group.groupRelationships = this.group.groupRelationships!.filter((_, i) => i !== index);
                            void this.onOpen();
                        })
                    );
            });

            new Setting(contentEl)
                .addButton(btn => btn
                    .setButtonText('Add Group Relationship')
                    .onClick(() => {
                        if (!this.group.groupRelationships) this.group.groupRelationships = [];
                        this.group.groupRelationships.push({
                            groupName: '',
                            relationshipType: 'neutral'
                        });
                        void this.onOpen();
                    })
                );

            // Linked Culture
            new Setting(contentEl)
                .setName('Linked Culture')
                .setDesc('Associated culture')
                .addDropdown(dropdown => {
                    dropdown.addOption('', 'None');
                    this.allCultures.forEach(c => dropdown.addOption(c.name, c.name));
                    dropdown.setValue(this.group.linkedCulture || '')
                        .onChange(value => { this.group.linkedCulture = value || undefined; });
                });

            // Parent Group
            new Setting(contentEl)
                .setName('Parent Group')
                .setDesc('Larger organization this group belongs to')
                .addDropdown(dropdown => {
                    dropdown.addOption('', 'None');
                    this.allGroups
                        .filter(g => g.id !== this.group.id)
                        .forEach(g => dropdown.addOption(g.name, g.name));
                    dropdown.setValue(this.group.parentGroup || '')
                        .onChange(value => { this.group.parentGroup = value || undefined; });
                });

            // Subgroups
            new Setting(contentEl)
                .setName('Subgroups')
                .setDesc('Smaller groups within this organization (comma-separated)')
                .addTextArea(text => {
                    text.setValue((this.group.subgroups || []).join(', '))
                        .onChange(value => {
                            this.group.subgroups = value.split(',').map(s => s.trim()).filter(Boolean);
                        });
                    text.inputEl.rows = 2;
                });

            // === CUSTOM FIELDS ===
            contentEl.createEl('h3', { text: 'Custom Fields' });

            if (!this.group.customFields) {
                this.group.customFields = {};
            }

            Object.entries(this.group.customFields).forEach(([key, value]) => {
                new Setting(contentEl)
                    .setName('Field')
                    .addText(text => {
                        const oldKey = key;
                        text.setValue(key)
                            .setPlaceholder('Field name')
                            .onChange(newKey => {
                                if (newKey && newKey !== oldKey) {
                                    const val = this.group.customFields![oldKey];
                                    delete this.group.customFields![oldKey];
                                    this.group.customFields![newKey] = val;
                                }
                            });
                    })
                    .addText(text => text
                        .setValue(value)
                        .setPlaceholder('Field value')
                        .onChange(newValue => { this.group.customFields![key] = newValue; })
                    )
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Remove field')
                        .onClick(() => {
                            delete this.group.customFields![key];
                            void this.onOpen();
                        })
                    );
            });

            new Setting(contentEl)
                .addButton(btn => btn
                    .setButtonText('Add Custom Field')
                    .onClick(() => {
                        if (!this.group.customFields) this.group.customFields = {};
                        const fieldNum = Object.keys(this.group.customFields).length + 1;
                        this.group.customFields[`field${fieldNum}`] = '';
                        void this.onOpen();
                    })
                );
        }

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');
        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? t('createGroupBtn') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.group.name.trim()) {
                    new Notice(t('groupNameRequired'));
                    return;
                }
                // Prevent duplicate group names (case-insensitive)
                const allGroups = this.plugin.getGroups();
                const nameLower = this.group.name.trim().toLowerCase();
                const duplicate = allGroups.some(g => g.name.trim().toLowerCase() === nameLower && (!this.group.id || g.id !== this.group.id));
                if (duplicate) {
                    new Notice(t('groupNameExists'));
                    return;
                }
                if (this.isNew) {
                    const newGroup = await this.plugin.createGroup(this.group.name, this.group.description, this.group.color);
                    this.group.id = newGroup.id;
                    // Immediately persist all fields for the new group
                    await this.plugin.updateGroup(this.group.id, { description: this.group.description, color: this.group.color, name: this.group.name } as any);
                    // Manually merge all fields including faction-enhanced ones
                    const found = this.plugin.getGroups().find(g => g.id === this.group.id);
                    if (found) {
                        Object.assign(found, this.group);
                        await this.plugin.saveSettings();
                        this.plugin.emitGroupsChanged?.();
                    }
                    // Add all members to the new group
                    for (const member of this.group.members) {
                        await this.plugin.addMemberToGroup(newGroup.id, member.type, member.id);
                    }
                    // Idempotent repair: ensure entity YAML contains the new group id
                    for (const member of this.group.members) {
                        await this.plugin.addGroupIdToEntity?.(member.type as any, member.id, this.group.id);
                    }
                } else {
                    await this.plugin.updateGroup(this.group.id, {
                        name: this.group.name,
                        description: this.group.description,
                        color: this.group.color
                    });
                    // Persist all fields including faction-enhanced ones on edit
                    const found = this.plugin.getGroups().find(g => g.id === this.group.id);
                    if (found) {
                        Object.assign(found, this.group);
                        await this.plugin.saveSettings();
                        this.plugin.emitGroupsChanged?.();
                    }
                    // Update members
                    await this.syncMembers();
                    // Idempotent repair: re-assert group id on all current members in case YAML was missing
                    for (const member of this.group.members) {
                        await this.plugin.addGroupIdToEntity?.(member.type as any, member.id, this.group.id);
                    }
                }
                if (this.onSubmit) await this.onSubmit(this.group);
                this.close();
            })
        );
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteGroup'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteGroup', this.group.name))) {
                        await this.onDelete!(this.group.id);
                        this.close();
                    }
                })
            );
        }
    }

    async loadAllEntities() {
        this.allCharacters = await this.plugin.listCharacters();
        this.allLocations = await this.plugin.listLocations();
        this.allEvents = await this.plugin.listEvents();
        this.allPlotItems = await this.plugin.listPlotItems();
        this.allGroups = this.plugin.getGroups();
        this.allCultures = await this.plugin.listCultures();
    }

    /**
     * Repair broken entity links with backwards compatibility
     * Try multiple matching strategies to reconnect entities
     */
    async repairEntityLinks() {
        const brokenLinks: string[] = [];
        const repairedLinks: string[] = [];
        const membersToRemove: typeof this.group.members = [];
        let needsSave = false;

        for (const member of [...this.group.members]) {
            let found = false;
            let entity: any = null;
            let newId: string | undefined;

            // Get the entity list based on type
            let entityList: any[] = [];
            switch (member.type) {
                case 'character':
                    entityList = this.allCharacters;
                    break;
                case 'location':
                    entityList = this.allLocations;
                    break;
                case 'event':
                    entityList = this.allEvents;
                    break;
                case 'item':
                    entityList = this.allPlotItems;
                    break;
            }

            // Strategy 1: Exact ID or name match
            entity = entityList.find(e => (e.id || e.name) === member.id);
            if (entity) {
                found = true;
                // Update to use ID if we were using name
                if (!entity.id || member.id === entity.name) {
                    const correctId = entity.id || entity.name;
                    if (correctId !== member.id) {
                        member.id = correctId;
                        needsSave = true;
                        repairedLinks.push(`${member.type}: "${entity.name}" (updated reference)`);
                    }
                }
            }

            // Strategy 2: Case-insensitive name match
            if (!found) {
                const lowerMemberId = member.id.toLowerCase();
                entity = entityList.find(e =>
                    (e.name && e.name.toLowerCase() === lowerMemberId) ||
                    (e.id && e.id.toLowerCase() === lowerMemberId)
                );
                if (entity) {
                    found = true;
                    newId = entity.id || entity.name;
                    if (newId) {
                        member.id = newId;
                        needsSave = true;
                        repairedLinks.push(`${member.type}: "${entity.name}" (case mismatch fixed)`);
                    }
                }
            }

            // Strategy 3: Fuzzy name match (trim whitespace, remove special chars)
            if (!found) {
                const normalizedMemberId = member.id.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                entity = entityList.find(e => {
                    const normalizedName = (e.name || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const normalizedId = (e.id || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    return normalizedName === normalizedMemberId || normalizedId === normalizedMemberId;
                });
                if (entity) {
                    found = true;
                    newId = entity.id || entity.name;
                    if (newId) {
                        member.id = newId;
                        needsSave = true;
                        repairedLinks.push(`${member.type}: "${entity.name}" (name normalized)`);
                    }
                }
            }

            // If still not found, mark for removal
            if (!found) {
                brokenLinks.push(`${member.type}: "${member.id}"`);
                membersToRemove.push(member);
                needsSave = true;
            }
        }

        // Remove broken links
        if (membersToRemove.length > 0) {
            this.group.members = this.group.members.filter(m =>
                !membersToRemove.some(broken =>
                    broken.type === m.type && broken.id === m.id
                )
            );
        }

        // Save changes if needed
        if (needsSave && this.group.id) {
            await this.plugin.updateGroup(this.group.id, this.group as any);
            await this.plugin.saveSettings();
        }

        // Notify user of repairs and broken links
        if (repairedLinks.length > 0) {
            new Notice(`Repaired ${repairedLinks.length} entity link(s) in group "${this.group.name}"`);
            console.log('Repaired entity links:', repairedLinks);
        }

        if (brokenLinks.length > 0) {
            new Notice(
                `Removed ${brokenLinks.length} broken link(s) from group "${this.group.name}". ` +
                `Check console for details.`,
                5000
            );
            console.warn(
                `Broken entity links removed from group "${this.group.name}":`,
                brokenLinks
            );
        }
    }

    renderMemberSelectors(container: HTMLElement) {
        const isMember = (type: 'character' | 'location' | 'event' | 'item', id: string) =>
            this.group.members.some(m => m.type === type && m.id === id);

        // --- Characters Multi-Select ---
        const charSetting = new Setting(container)
            .setName(t('characters'));
        const charTagContainer = charSetting.controlEl.createDiv('group-tag-list');
        this.group.members.filter(m => m.type === 'character').forEach(member => {
            const char = this.allCharacters.find(c => (c.id || c.name) === member.id);
            if (char) {
                const tag = charTagContainer.createSpan({ cls: 'group-tag' });
                const nameLink = tag.createEl('a', { text: char.name, cls: 'group-member-link' });
                nameLink.onclick = (e) => {
                    e.preventDefault();
                    const { CharacterModal } = require('./CharacterModal');
                    new CharacterModal(this.app, this.plugin, char, async () => {}).open();
                };
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'character' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'character', member.id);
                    void this.onOpen();
                };
            }
        });
        charSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, async (selectedChar) => {
                        if (selectedChar && !isMember('character', selectedChar.id || selectedChar.name)) {
                            this.group.members.push({ type: 'character', id: selectedChar.id || selectedChar.name });
                            // Only update in settings if group already exists (not new)
                            if (!this.isNew && this.group.id) {
                                await this.plugin.addMemberToGroup(this.group.id, 'character', selectedChar.id || selectedChar.name);
                            }
                            void this.onOpen();
                        }
                    }).open();
                });
        });

        // --- Locations Multi-Select ---
        const locSetting = new Setting(container)
            .setName(t('locations'));
        const locTagContainer = locSetting.controlEl.createDiv('group-tag-list');
        this.group.members.filter(m => m.type === 'location').forEach(member => {
            const loc = this.allLocations.find(l => (l.id || l.name) === member.id);
            if (loc) {
                const tag = locTagContainer.createSpan({ cls: 'group-tag' });
                const nameLink = tag.createEl('a', { text: loc.name, cls: 'group-member-link' });
                nameLink.onclick = (e) => {
                    e.preventDefault();
                    const { LocationModal } = require('./LocationModal');
                    new LocationModal(this.app, this.plugin, loc, async () => {}).open();
                };
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'location' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'location', member.id);
                    void this.onOpen();
                };
            }
        });
        locSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, async (selectedLoc) => {
                        if (selectedLoc && !isMember('location', selectedLoc.id || selectedLoc.name)) {
                            this.group.members.push({ type: 'location', id: selectedLoc.id || selectedLoc.name });
                            // Only update in settings if group already exists (not new)
                            if (!this.isNew && this.group.id) {
                                await this.plugin.addMemberToGroup(this.group.id, 'location', selectedLoc.id || selectedLoc.name);
                            }
                            void this.onOpen();
                        }
                    }).open();
                });
        });

        // --- Events Multi-Select ---
        const evtSetting = new Setting(container)
            .setName(t('events'));
        const evtTagContainer = evtSetting.controlEl.createDiv('group-tag-list');
        this.group.members.filter(m => m.type === 'event').forEach(member => {
            const evt = this.allEvents.find(e => (e.id || e.name) === member.id);
            if (evt) {
                const tag = evtTagContainer.createSpan({ cls: 'group-tag' });
                const nameLink = tag.createEl('a', { text: evt.name, cls: 'group-member-link' });
                nameLink.onclick = (e) => {
                    e.preventDefault();
                    const { EventModal } = require('./EventModal');
                    new EventModal(this.app, this.plugin, evt, async () => {}).open();
                };
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'event' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'event', member.id);
                    void this.onOpen();
                };
            }
        });
        evtSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new EventSuggestModal(this.app, this.plugin, async (selectedEvt) => {
                        if (selectedEvt && !isMember('event', selectedEvt.id || selectedEvt.name)) {
                            this.group.members.push({ type: 'event', id: selectedEvt.id || selectedEvt.name });
                            // Only update in settings if group already exists (not new)
                            if (!this.isNew && this.group.id) {
                                await this.plugin.addMemberToGroup(this.group.id, 'event', selectedEvt.id || selectedEvt.name);
                            }
                            void this.onOpen();
                        }
                    }).open();
                });
        });

        // --- Items Multi-Select ---
        const itemSetting = new Setting(container).setName(t('items'));
        const itemTagContainer = itemSetting.controlEl.createDiv('group-tag-list');
        this.group.members.filter(m => m.type === 'item').forEach(member => {
            const item = this.allPlotItems.find(i => (i.id || i.name) === member.id);
            if (item) {
                const tag = itemTagContainer.createSpan({ cls: 'group-tag' });
                const nameLink = tag.createEl('a', { text: item.name, cls: 'group-member-link' });
                nameLink.onclick = (e) => {
                    e.preventDefault();
                    const { PlotItemModal } = require('./PlotItemModal');
                    new PlotItemModal(this.app, this.plugin, item, async () => {}).open();
                };
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'item' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'item', member.id);
                    void this.onOpen();
                };
            }
        });
        itemSetting.addButton(btn => {
            btn.setButtonText(t('add')).setCta().onClick(() => {
                new PlotItemSuggestModal(this.app, this.plugin, async (selectedItem) => {
                    const itemId = selectedItem.id || selectedItem.name;
                    if (selectedItem && !this.group.members.some(m => m.type === 'item' && m.id === itemId)) {
                        this.group.members.push({ type: 'item', id: itemId });
                        // Only update in settings if group already exists (not new)
                        if (!this.isNew && this.group.id) {
                            await this.plugin.addMemberToGroup(this.group.id, 'item', itemId);
                        }
                        void this.onOpen();
                    }
                }).open();
            });
        });
    }

    // THIS is where the extra '}' was, which I removed.

    async syncMembers() {
        // Ensure plugin group members match modal state
        const group = this.plugin.getGroups().find(g => g.id === this.group.id);
        if (!group) return;
        // Remove members not in this.group.members
        for (const member of group.members) {
            if (!this.group.members.some(m => m.type === member.type && m.id === member.id)) {
                await this.plugin.removeMemberFromGroup(group.id, member.type, member.id);
            }
        }
        // Add members in this.group.members not in group.members
        for (const member of this.group.members) {
            if (!group.members.some(m => m.type === member.type && m.id === member.id)) {
                await this.plugin.addMemberToGroup(group.id, member.type, member.id);
            }
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        return entityCount > 1;
    }

    private async applyTemplateToGroup(template: Template): Promise<void> {
        if (!template.entities.groups || template.entities.groups.length === 0) {
            new Notice('This template does not contain any groups');
            return;
        }

        const templateGroup = template.entities.groups[0];
        await this.applyProcessedTemplateToGroup(templateGroup);
    }

    private async applyTemplateToGroupWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.groups || template.entities.groups.length === 0) {
            new Notice('This template does not contain any groups');
            return;
        }

        // Get the first group from the template
        let templateGroup = template.entities.groups[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateGroup,
            variableValues,
            false // non-strict mode
        );
        templateGroup = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[GroupModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToGroup(templateGroup);
    }

    private async applyProcessedTemplateToGroup(templateGroup: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, storyId, ...rest } = templateGroup as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[GroupModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[GroupModal] Failed to parse yamlContent:', error);
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
                if ('Purpose' in parsedSections) {
                    fields.purpose = parsedSections['Purpose'];
                }
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }
                if ('Structure' in parsedSections) {
                    fields.structure = parsedSections['Structure'];
                }
                if ('Goals' in parsedSections) {
                    fields.goals = parsedSections['Goals'];
                }

                console.log('[GroupModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[GroupModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the group
        Object.assign(this.group, fields);
        console.log('[GroupModal] Final group after template:', this.group);

        // Clear relationships as they reference template entities
        this.group.members = [];
        this.group.territories = [];
        this.group.linkedEvents = [];
        this.group.parentGroup = undefined;
        this.group.subgroups = [];
        this.group.groupRelationships = [];
        this.group.linkedCulture = undefined;
        this.group.connections = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
    }
}