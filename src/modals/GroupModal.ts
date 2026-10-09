import { App, Setting, Notice, parseYaml } from 'obsidian';
import { t } from '../i18n/strings';
import { Group, Character, Location, Event, PlotItem, Culture } from '../types';
import type { TemplateEntity } from '../templates/TemplateTypes';
import type { TemplateVariableValues } from './TemplateApplicationModal';
import StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PlotItemSuggestModal } from './PlotItemSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { EntityCustomFieldsEditor, customFieldEditorOptions } from './entity/EntityCustomFieldsEditor';
import { confirmWithModal } from './ui/ConfirmModal';
import { isModalFieldVisible } from './entity/ModalFieldVisibility';
import { createCollapsibleModalSection } from './entity/CollapsibleModalSection';

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
    private readonly customFieldsEditor: EntityCustomFieldsEditor;

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
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'faction', this.group.customFields,
            customFieldEditorOptions(this.plugin, 'faction', () => this.group));
        this.modalEl.addClass('storyteller-group-modal');
    }

    /**
     * Whether a field is turned on for this vault. A hidden field is simply not
     * rendered; its stored value rides along untouched on the object that gets
     * submitted, so turning one off never discards data.
     */
    private shows(fieldKey: string): boolean {
        return isModalFieldVisible(this.plugin.settings.hiddenModalFields, 'faction', fieldKey);
    }

    /**
     * The "Your fields" section. Only exists when the vault defines typed fields
     * for groups: the editor renders nothing otherwise, and the empty section is
     * then removed.
     */
    private renderDefinedFieldsSection(contentEl: HTMLElement): void {
        const body = createCollapsibleModalSection(contentEl, {
            title: 'Your fields',
            description: 'Typed fields you defined in settings for groups',
            icon: 'list-checks',
            open: true,
        });
        this.customFieldsEditor.renderDefinedFields(body);
        // The editor adds its own heading; the section title already names it.
        body.querySelectorAll(':scope > h3').forEach(heading => heading.remove());
        if (!body.hasChildNodes()) body.parentElement?.remove();
    }

    onOpen() { void (async () => {
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
                            void import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                new TemplateApplicationModal(
                                    this.app,
                                    this.plugin,
                                    defaultTemplate,
                                    (variableValues, entityFileNames) => { void (async () => {
                                        try {
                                            await this.applyTemplateToGroupWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch {
                                            
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    })(); }
                                ).open();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToGroup(defaultTemplate);
                            new Notice('Default template applied');
                        } catch {
                            
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

        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewGroup') : `${t('editGroup')}: ${this.group.name}` });

        // --- Template Selector (for new groups) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from template')
                .setDesc('Optionally start with a pre-configured group template')
                .addButton(button => button
                    .setButtonText('Choose template')
                    .setTooltip('Select a group template')
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
                                                        await this.applyTemplateToGroupWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch {
                                                        
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                })(); }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToGroup(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            })(); },
                            'group'
                        ).open();
                    })
                );
        }

        // Load all entities for dropdowns
        await this.loadAllEntities();

        // Name
        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterGroupName'))
                .setValue(this.group.name)
                .onChange(value => { this.group.name = value; })
            );

        // Profile Image
        if (this.shows('profileImage')) {
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
        }

        // Description
        if (this.shows('description')) {
            new Setting(contentEl)
                .setName(t('description'))
                .addTextArea(text => {
                    text.setPlaceholder(t('describeGroupPh'))
                        .setValue(this.group.description || '')
                        .onChange(value => { this.group.description = value; });
                    text.inputEl.rows = 4;
                });
        }

        // Group Type
        new Setting(contentEl)
            .setName('Group type')
            .setDesc('Type of group or organization')
            .addDropdown(dropdown => dropdown
                .addOption('collection', 'Simple collection')
                .addOption('faction', 'Faction')
                .addOption('organization', 'Organization')
                .addOption('guild', 'Guild')
                .addOption('political', 'Political')
                .addOption('military', 'Military')
                .addOption('religious', 'Religious')
                .addOption('custom', 'Custom')
                .setValue(this.group.groupType || 'collection')
                .onChange(value => {
                    this.group.groupType = value as Group['groupType'];
                    // Re-render modal to show/hide faction-enhanced sections
                    void this.onOpen();
                })
            );

        // Defined fields always render, for collection groups too.
        this.renderDefinedFieldsSection(contentEl);

        const colorTagsVisible = this.shows('color') || this.shows('tags');
        const colorTagsBody = colorTagsVisible
            ? createCollapsibleModalSection(contentEl, {
                title: 'Color and tags',
                description: 'The group color and the tags used to find it',
                icon: 'tags',
                open: Boolean(this.group.color || this.group.tags?.length),
            })
            : null;

        // Color
        if (colorTagsBody && this.shows('color')) {
            new Setting(colorTagsBody)
                .setName(t('color'))
                .addText(text => text
                    .setPlaceholder(t('colorPlaceholder'))
                    .setValue(this.group.color || '')
                    .onChange(value => { this.group.color = value; })
                );
        }

        // Tags
        if (colorTagsBody && this.shows('tags')) {
            new Setting(colorTagsBody)
                .setName(t('tags') || 'Tags')
                .setDesc('Comma-separated tags')
                .addText(text => text
                    .setPlaceholder(t('tagsPh'))
                    .setValue((this.group.tags || []).join(', '))
                    .onChange(value => { this.group.tags = value.split(',').map(t => t.trim()).filter(Boolean); })
                );
        }

        // === MEMBERS ===
        const membersVisible = ['memberCharacters', 'memberLocations', 'memberEvents', 'memberItems'].some(k => this.shows(k));
        const membersBody = membersVisible
            ? createCollapsibleModalSection(contentEl, {
                title: 'Members',
                description: 'Characters, locations, events, and items in this group',
                icon: 'users',
                open: this.group.members.length > 0,
            })
            : null;
        if (membersBody) this.renderMemberSelectors(membersBody.createDiv('storyteller-group-members-section'));

        // === FACTION DETAILS === (only show if not collection type)
        if (this.group.groupType && this.group.groupType !== 'collection') {
            const factionVisible = ['history', 'structure', 'goals', 'resources', 'strength', 'status'].some(k => this.shows(k));
            const factionBody = factionVisible
                ? createCollapsibleModalSection(contentEl, {
                    title: 'Faction details',
                    description: 'Origin, structure, goals, resources, and strength',
                    icon: 'scroll-text',
                    open: Boolean(this.group.history || this.group.structure || this.group.goals || this.group.resources || this.group.strength || this.group.status),
                })
                : null;

            // History
            if (factionBody && this.shows('history')) {
                new Setting(factionBody)
                    .setName('History')
                    .setDesc('Origin and historical background')
                    .addTextArea(text => {
                        text.setValue(this.group.history || '')
                            .onChange(value => { this.group.history = value; });
                        text.inputEl.rows = 4;
                    });
            }

            // Structure
            if (factionBody && this.shows('structure')) {
                new Setting(factionBody)
                    .setName('Structure')
                    .setDesc('Organizational hierarchy and leadership')
                    .addTextArea(text => {
                        text.setValue(this.group.structure || '')
                            .onChange(value => { this.group.structure = value; });
                        text.inputEl.rows = 4;
                    });
            }

            // Goals
            if (factionBody && this.shows('goals')) {
                new Setting(factionBody)
                    .setName('Goals')
                    .setDesc('Objectives and motivations')
                    .addTextArea(text => {
                        text.setValue(this.group.goals || '')
                            .onChange(value => { this.group.goals = value; });
                        text.inputEl.rows = 4;
                    });
            }

            // Resources
            if (factionBody && this.shows('resources')) {
                new Setting(factionBody)
                    .setName('Resources')
                    .setDesc('Available assets and capabilities')
                    .addTextArea(text => {
                        text.setValue(this.group.resources || '')
                            .onChange(value => { this.group.resources = value; });
                        text.inputEl.rows = 4;
                    });
            }

            // Strength
            if (factionBody && this.shows('strength')) {
                new Setting(factionBody)
                    .setName('Strength')
                    .setDesc('Overall power level or description')
                    .addText(text => text
                        .setValue(this.group.strength || '')
                        .onChange(value => { this.group.strength = value; })
                    );
            }

            // Status
            if (factionBody && this.shows('status')) {
                new Setting(factionBody)
                    .setName('Status')
                    .setDesc('Current state (active, dormant, disbanded, etc.)')
                    .addText(text => text
                        .setValue(this.group.status || '')
                        .onChange(value => { this.group.status = value; })
                    );
            }

            if (this.shows('powerInfluence')) {
                const powerBody = createCollapsibleModalSection(contentEl, {
                    title: 'Power and influence',
                    description: 'Military, economic, and political strength on a 0 to 100 scale',
                    icon: 'swords',
                    open: this.group.militaryPower !== undefined || this.group.economicPower !== undefined || this.group.politicalInfluence !== undefined,
                });

                // Military Power
                new Setting(powerBody)
                    .setName('Military power')
                    .setDesc('Military strength (0-100)')
                    .addSlider(slider => slider
                        .setLimits(0, 100, 1)
                        .setValue(this.group.militaryPower || 50)
                        .setDynamicTooltip()
                        .onChange(value => { this.group.militaryPower = value; })
                    );

                // Economic Power
                new Setting(powerBody)
                    .setName('Economic power')
                    .setDesc('Economic influence (0-100)')
                    .addSlider(slider => slider
                        .setLimits(0, 100, 1)
                        .setValue(this.group.economicPower || 50)
                        .setDynamicTooltip()
                        .onChange(value => { this.group.economicPower = value; })
                    );

                // Political Influence
                new Setting(powerBody)
                    .setName('Political influence')
                    .setDesc('Political power (0-100)')
                    .addSlider(slider => slider
                        .setLimits(0, 100, 1)
                        .setValue(this.group.politicalInfluence || 50)
                        .setDynamicTooltip()
                        .onChange(value => { this.group.politicalInfluence = value; })
                    );
            }

            if (this.shows('identity')) {
                const identityBody = createCollapsibleModalSection(contentEl, {
                    title: 'Identity and symbols',
                    description: 'Colors, emblem, motto, and territories',
                    icon: 'sparkles',
                    open: Boolean(this.group.colors?.length || this.group.emblem || this.group.motto || this.group.territories?.length),
                });

                // Colors
                new Setting(identityBody)
                    .setName('Colors')
                    .setDesc('Faction colors (comma-separated)')
                    .addText(text => text
                        .setValue((this.group.colors || []).join(', '))
                        .onChange(value => {
                            this.group.colors = value.split(',').map(c => c.trim()).filter(Boolean);
                        })
                    );

                // Emblem
                new Setting(identityBody)
                    .setName('Emblem')
                    .setDesc('Symbol or emblem description')
                    .addText(text => text
                        .setValue(this.group.emblem || '')
                        .onChange(value => { this.group.emblem = value; })
                    );

                // Motto
                new Setting(identityBody)
                    .setName('Motto')
                    .setDesc('Slogan or motto')
                    .addText(text => text
                        .setValue(this.group.motto || '')
                        .onChange(value => { this.group.motto = value; })
                    );

                // Territories
                new Setting(identityBody)
                    .setName('Territories')
                    .setDesc('Controlled territories (comma-separated)')
                    .addTextArea(text => {
                        text.setValue((this.group.territories || []).join(', '))
                            .onChange(value => {
                                this.group.territories = value.split(',').map(t => t.trim()).filter(Boolean);
                            });
                        text.inputEl.rows = 3;
                    });
            }

            // === RELATIONSHIPS ===
            const relationshipsVisible = ['groupRelationships', 'linkedCulture', 'parentGroup', 'subgroups'].some(k => this.shows(k));
            const relationshipsBody = relationshipsVisible
                ? createCollapsibleModalSection(contentEl, {
                    title: 'Relationships',
                    description: 'Inter-group ties, the culture, parent group, and subgroups',
                    icon: 'link',
                    open: Boolean(this.group.groupRelationships?.length || this.group.linkedCulture || this.group.parentGroup || this.group.subgroups?.length),
                })
                : null;

            if (relationshipsBody && this.shows('groupRelationships')) {
                // Group Relationships
                if (!this.group.groupRelationships) {
                    this.group.groupRelationships = [];
                }
                const relationshipEditorEl = relationshipsBody.createDiv('storyteller-group-relationship-editor');
                this.renderGroupRelationshipEditor(relationshipEditorEl);
            }

            // Linked Culture
            if (relationshipsBody && this.shows('linkedCulture')) {
                new Setting(relationshipsBody)
                    .setName('Linked culture')
                    .setDesc('Associated culture')
                    .addDropdown(dropdown => {
                        dropdown.addOption('', 'None');
                        this.allCultures.forEach(c => { dropdown.addOption(c.name, c.name); });
                        dropdown.setValue(this.group.linkedCulture || '')
                            .onChange(value => { this.group.linkedCulture = value || undefined; });
                    });
            }

            // Parent Group
            if (relationshipsBody && this.shows('parentGroup')) {
                new Setting(relationshipsBody)
                    .setName('Parent group')
                    .setDesc('Larger organization this group belongs to')
                    .addDropdown(dropdown => {
                        dropdown.addOption('', 'None');
                        this.allGroups
                            .filter(g => g.id !== this.group.id)
                            .forEach(g => { dropdown.addOption(g.name, g.name); });
                        dropdown.setValue(this.group.parentGroup || '')
                            .onChange(value => { this.group.parentGroup = value || undefined; });
                    });
            }

            // Subgroups
            if (relationshipsBody && this.shows('subgroups')) {
                new Setting(relationshipsBody)
                    .setName('Subgroups')
                    .setDesc('Smaller groups within this organization (comma-separated)')
                    .addTextArea(text => {
                        text.setValue((this.group.subgroups || []).join(', '))
                            .onChange(value => {
                                this.group.subgroups = value.split(',').map(s => s.trim()).filter(Boolean);
                            });
                        text.inputEl.rows = 2;
                    });
            }

        }

        // Only the free-form rows follow the Custom fields switch.
        if (this.shows('customFields')) {
            const customFieldsBody = createCollapsibleModalSection(contentEl, {
                title: 'Custom fields',
                description: 'Additional properties specific to this project',
                icon: 'list-plus',
                open: Boolean(Object.keys(this.group.customFields || {}).length),
            });
            this.customFieldsEditor.renderFreeFormSection(customFieldsBody);
            customFieldsBody.querySelectorAll(':scope > h3').forEach(heading => heading.remove());
        }

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('deleteGroup'), async () => {
                if (await confirmWithModal(this.app, {
                    title: t('confirm') || 'Confirm',
                    body: t('confirmDeleteGroup', this.group.name),
                    confirmText: t('delete') || 'Delete',
                })) {
                    await this.onDelete!(this.group.id);
                    this.close();
                }
            }, { warning: true });
        }
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer', attr: { 'aria-hidden': 'true' } });
        this.createFooterButton(footerEl, t('cancel'), () => this.close());
        this.createFooterButton(footerEl, this.isNew ? t('createGroupBtn') : t('saveChanges'), async () => {
            const customFields = this.customFieldsEditor.getFields();
            if (customFields === null) {
                return;
            }
            this.group.customFields = customFields;
            if (!this.group.name.trim()) {
                new Notice(t('groupNameRequired'));
                return;
            }
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
                await this.plugin.saveGroupFull(this.group);
                for (const member of this.group.members) {
                    await this.plugin.addMemberToGroup(newGroup.id, member.type, member.id);
                }
                for (const member of this.group.members) {
                    await this.plugin.addGroupIdToEntity?.(member.type, member.id, this.group.id);
                }
            } else {
                await this.plugin.saveGroupFull(this.group);
                await this.syncMembers();
                for (const member of this.group.members) {
                    await this.plugin.addGroupIdToEntity?.(member.type, member.id, this.group.id);
                }
            }
            if (this.onSubmit) await this.onSubmit(this.group);
            this.close();
        }, { cta: true });
    })(); }

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

        type GroupMemberEntity = Character | Location | Event | PlotItem;
        for (const member of [...this.group.members]) {
            let found = false;
            let entity: GroupMemberEntity | undefined;
            let newId: string | undefined;

            // Get the entity list based on type
            let entityList: GroupMemberEntity[] = [];
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
            await this.plugin.updateGroup(this.group.id, this.group);
            await this.plugin.saveSettings();
        }

        // Notify user of repairs and broken links
        if (repairedLinks.length > 0) {
            new Notice(`Repaired ${repairedLinks.length} entity link(s) in group "${this.group.name}"`);
            
        }

        if (brokenLinks.length > 0) {
            new Notice(
                `Removed ${brokenLinks.length} broken link(s) from group "${this.group.name}". ` +
                `Check console for details.`,
                5000
            );
            
        }
    }

    private renderGroupRelationshipEditor(container: HTMLElement): void {
        container.empty();
        container.createEl('h4', { text: 'Inter-group relationships', cls: 'storyteller-subsection-header' });

        if (!this.group.groupRelationships || this.group.groupRelationships.length === 0) {
            container.createEl('p', {
                text: 'No inter-group relationships yet.',
                cls: 'storyteller-modal-list-empty'
            });
        } else {
            this.group.groupRelationships.forEach((rel, index) => {
                new Setting(container)
                    .setName(`Relationship ${index + 1}`)
                    .addDropdown(dropdown => {
                        dropdown.addOption('', 'Select group...');
                        this.allGroups
                            .filter(g => g.id !== this.group.id)
                            .forEach(g => { dropdown.addOption(g.name, g.name); });
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
                            .addOption('at-war', 'At war')
                            .setValue(rel.relationshipType || 'neutral')
                            .onChange(value => { rel.relationshipType = value as 'allied' | 'friendly' | 'neutral' | 'rival' | 'hostile' | 'at-war'; });
                    })
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Remove')
                        .onClick(() => {
                            this.group.groupRelationships = this.group.groupRelationships!.filter((_, i) => i !== index);
                            this.renderGroupRelationshipEditor(container);
                        }));
            });
        }

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Add group relationship')
                .onClick(() => {
                    if (!this.group.groupRelationships) this.group.groupRelationships = [];
                    this.group.groupRelationships.push({
                        groupName: '',
                        relationshipType: 'neutral'
                    });
                    this.renderGroupRelationshipEditor(container);
                }));
    }

    renderMemberSelectors(container: HTMLElement) {
        container.empty();

        const isMember = (type: 'character' | 'location' | 'event' | 'item', id: string) =>
            this.group.members.some(m => m.type === type && m.id === id);

        if (this.shows('memberCharacters')) {
            // --- Characters Multi-Select ---
            const charSetting = new Setting(container)
                .setName(t('characters'));
            const charTagContainer = charSetting.controlEl.createDiv('group-tag-list');
            this.group.members.filter(m => m.type === 'character').forEach(member => {
                const char = this.allCharacters.find(c => (c.id || c.name) === member.id);
                if (char) {
                    const tag = charTagContainer.createSpan({ cls: 'group-tag' });
                    const nameLink = tag.createEl('a', { text: char.name, cls: 'group-member-link' });
                    nameLink.onclick = async (e) => {
                        e.preventDefault();
                        const { CharacterModal } = await import('./CharacterModal');
                        new CharacterModal(this.app, this.plugin, char, async () => {}).open();
                    };
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        this.group.members = this.group.members.filter(m => !(m.type === 'character' && m.id === member.id));
                        if (!this.isNew && this.group.id) {
                            await this.plugin.removeMemberFromGroup(this.group.id, 'character', member.id);
                        }
                        this.renderMemberSelectors(container);
                    };
                }
            });
            charSetting.addButton(btn => {
                btn.setButtonText(t('add'))
                    .setCta()
                    .onClick(() => {
                        new CharacterSuggestModal(this.app, this.plugin, (selectedChar) => { void (async () => {
                            if (selectedChar && !isMember('character', selectedChar.id || selectedChar.name)) {
                                this.group.members.push({ type: 'character', id: selectedChar.id || selectedChar.name, name: selectedChar.name });
                                // Only update in settings if group already exists (not new)
                                if (!this.isNew && this.group.id) {
                                    await this.plugin.addMemberToGroup(this.group.id, 'character', selectedChar.id || selectedChar.name);
                                }
                                this.renderMemberSelectors(container);
                            }
                        })(); }).open();
                    });
            });
        }

        if (this.shows('memberLocations')) {
            // --- Locations Multi-Select ---
            const locSetting = new Setting(container)
                .setName(t('locations'));
            const locTagContainer = locSetting.controlEl.createDiv('group-tag-list');
            this.group.members.filter(m => m.type === 'location').forEach(member => {
                const loc = this.allLocations.find(l => (l.id || l.name) === member.id);
                if (loc) {
                    const tag = locTagContainer.createSpan({ cls: 'group-tag' });
                    const nameLink = tag.createEl('a', { text: loc.name, cls: 'group-member-link' });
                    nameLink.onclick = async (e) => {
                        e.preventDefault();
                        const { LocationModal } = await import('./LocationModal');
                        new LocationModal(this.app, this.plugin, loc, async () => {}).open();
                    };
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        this.group.members = this.group.members.filter(m => !(m.type === 'location' && m.id === member.id));
                        if (!this.isNew && this.group.id) {
                            await this.plugin.removeMemberFromGroup(this.group.id, 'location', member.id);
                        }
                        this.renderMemberSelectors(container);
                    };
                }
            });
            locSetting.addButton(btn => {
                btn.setButtonText(t('add'))
                    .setCta()
                    .onClick(() => {
                        new LocationSuggestModal(this.app, this.plugin, (selectedLoc) => { void (async () => {
                            if (selectedLoc && !isMember('location', selectedLoc.id || selectedLoc.name)) {
                                this.group.members.push({ type: 'location', id: selectedLoc.id || selectedLoc.name, name: selectedLoc.name });
                                // Only update in settings if group already exists (not new)
                                if (!this.isNew && this.group.id) {
                                    await this.plugin.addMemberToGroup(this.group.id, 'location', selectedLoc.id || selectedLoc.name);
                                }
                                this.renderMemberSelectors(container);
                            }
                        })(); }).open();
                    });
            });
        }

        if (this.shows('memberEvents')) {
            // --- Events Multi-Select ---
            const evtSetting = new Setting(container)
                .setName(t('events'));
            const evtTagContainer = evtSetting.controlEl.createDiv('group-tag-list');
            this.group.members.filter(m => m.type === 'event').forEach(member => {
                const evt = this.allEvents.find(e => (e.id || e.name) === member.id);
                if (evt) {
                    const tag = evtTagContainer.createSpan({ cls: 'group-tag' });
                    const nameLink = tag.createEl('a', { text: evt.name, cls: 'group-member-link' });
                    nameLink.onclick = async (e) => {
                        e.preventDefault();
                        const { EventModal } = await import('./EventModal');
                        new EventModal(this.app, this.plugin, evt, async updated => {
                            await this.plugin.saveEvent(updated);
                            const index = this.allEvents.findIndex(event => (event.id || event.name) === (updated.id || updated.name));
                            if (index >= 0) this.allEvents[index] = updated;
                            this.renderMemberSelectors(container);
                        }).open();
                    };
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        this.group.members = this.group.members.filter(m => !(m.type === 'event' && m.id === member.id));
                        if (!this.isNew && this.group.id) {
                            await this.plugin.removeMemberFromGroup(this.group.id, 'event', member.id);
                        }
                        this.renderMemberSelectors(container);
                    };
                }
            });
            evtSetting.addButton(btn => {
                btn.setButtonText(t('add'))
                    .setCta()
                    .onClick(() => {
                        new EventSuggestModal(this.app, this.plugin, (selectedEvt) => { void (async () => {
                            if (selectedEvt && !isMember('event', selectedEvt.id || selectedEvt.name)) {
                                this.group.members.push({ type: 'event', id: selectedEvt.id || selectedEvt.name, name: selectedEvt.name });
                                // Only update in settings if group already exists (not new)
                                if (!this.isNew && this.group.id) {
                                    await this.plugin.addMemberToGroup(this.group.id, 'event', selectedEvt.id || selectedEvt.name);
                                }
                                this.renderMemberSelectors(container);
                            }
                        })(); }).open();
                    });
            });
        }

        if (this.shows('memberItems')) {
            // --- Items Multi-Select ---
            const itemSetting = new Setting(container).setName(t('items'));
            const itemTagContainer = itemSetting.controlEl.createDiv('group-tag-list');
            this.group.members.filter(m => m.type === 'item').forEach(member => {
                const item = this.allPlotItems.find(i => (i.id || i.name) === member.id);
                if (item) {
                    const tag = itemTagContainer.createSpan({ cls: 'group-tag' });
                    const nameLink = tag.createEl('a', { text: item.name, cls: 'group-member-link' });
                    nameLink.onclick = async (e) => {
                        e.preventDefault();
                        const { PlotItemModal } = await import('./PlotItemModal');
                        new PlotItemModal(this.app, this.plugin, item, async () => {}).open();
                    };
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        this.group.members = this.group.members.filter(m => !(m.type === 'item' && m.id === member.id));
                        if (!this.isNew && this.group.id) {
                            await this.plugin.removeMemberFromGroup(this.group.id, 'item', member.id);
                        }
                        this.renderMemberSelectors(container);
                    };
                }
            });
            itemSetting.addButton(btn => {
                btn.setButtonText(t('add')).setCta().onClick(() => {
                    new PlotItemSuggestModal(this.app, this.plugin, (selectedItem) => { void (async () => {
                        const itemId = selectedItem.id || selectedItem.name;
                        if (selectedItem && !this.group.members.some(m => m.type === 'item' && m.id === itemId)) {
                            this.group.members.push({ type: 'item', id: itemId, name: selectedItem.name });
                            // Only update in settings if group already exists (not new)
                            if (!this.isNew && this.group.id) {
                                await this.plugin.addMemberToGroup(this.group.id, 'item', itemId);
                            }
                            this.renderMemberSelectors(container);
                        }
                    })(); }).open();
                });
            });
        }
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

    private async applyTemplateToGroupWithVariables(template: Template, variableValues: TemplateVariableValues): Promise<void> {
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
        	// intentional
            
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToGroup(templateGroup);
    }

    private async applyProcessedTemplateToGroup(templateGroup: TemplateEntity<Group>): Promise<void> {
        const { yamlContent, markdownContent, sectionContent, customYamlFields } = templateGroup;

        let fields: Record<string, unknown> = { ...(templateGroup as Record<string, unknown>) };
        delete fields.templateId;
        delete fields.yamlContent;
        delete fields.markdownContent;
        delete fields.sectionContent;
        delete fields.customYamlFields;
        delete fields.id;
        delete fields.filePath;
        delete fields.storyId;
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
                if (parsed && typeof parsed === 'object') {
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

        // Apply all fields to the group
        Object.assign(this.group, fields);
        this.customFieldsEditor.setFields(this.group.customFields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.group, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        

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
