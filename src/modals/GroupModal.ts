import { App, Setting, Notice, ButtonComponent } from 'obsidian';
import { t } from '../i18n/strings';
import { Group, Character, Location, Event, PlotItem, GroupMemberDetails, GroupRelationship, Culture } from '../types';
import StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
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
                                await this.applyTemplateToGroup(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
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
                    this.onOpen();
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
        new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imagePathDesc = s.descEl.createEl('small', { text: `Current: ${this.group.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText(t('select'))
                .setTooltip(t('selectFromGallery'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.group.profileImagePath = img?.filePath;
                        if (imagePathDesc) imagePathDesc.setText(`Current: ${this.group.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(btn => btn
                .setButtonText(t('upload'))
                .setTooltip(t('uploadImage'))
                .onClick(async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        try {
                            await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);
                            const name = file.name.replace(/[\\/:"*?<>|#^[\]]+/g, '').replace(/\s+/g, '_');
                            const filePath = `${this.plugin.settings.galleryUploadFolder}/${Date.now()}_${name}`;
                            const buf = await file.arrayBuffer();
                            await this.app.vault.createBinary(filePath, buf);
                            this.group.profileImagePath = filePath;
                            if (imagePathDesc) imagePathDesc.setText(`Current: ${filePath}`);
                            new Notice(t('imageUploaded', name));
                        } catch (e) {
                            console.error('Upload failed', e);
                            new Notice(t('errorUploadingImage'));
                        }
                    };
                    input.click();
                }))
            .addButton(btn => btn
                .setIcon('cross')
                .setTooltip(t('clearImage'))
                .setClass('mod-warning')
                .onClick(() => {
                    this.group.profileImagePath = undefined;
                    if (imagePathDesc) imagePathDesc.setText(`Current: None`);
                }));

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
                            this.onOpen();
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
                        this.onOpen();
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
                            this.onOpen();
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
                        this.onOpen();
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
                const tag = charTagContainer.createSpan({ text: char.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'character' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'character', member.id);
                    this.onOpen();
                };
            }
        });
        charSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (selectedChar) => {
                        if (selectedChar && !isMember('character', selectedChar.id || selectedChar.name)) {
                            this.group.members.push({ type: 'character', id: selectedChar.id || selectedChar.name });
                            this.plugin.addMemberToGroup(this.group.id, 'character', selectedChar.id || selectedChar.name);
                            this.onOpen();
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
                const tag = locTagContainer.createSpan({ text: loc.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'location' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'location', member.id);
                    this.onOpen();
                };
            }
        });
        locSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, (selectedLoc) => {
                        if (selectedLoc && !isMember('location', selectedLoc.id || selectedLoc.name)) {
                            this.group.members.push({ type: 'location', id: selectedLoc.id || selectedLoc.name });
                            this.plugin.addMemberToGroup(this.group.id, 'location', selectedLoc.id || selectedLoc.name);
                            this.onOpen();
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
                const tag = evtTagContainer.createSpan({ text: evt.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'event' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'event', member.id);
                    this.onOpen();
                };
            }
        });
        evtSetting.addButton(btn => {
            btn.setButtonText(t('add'))
                .setCta()
                .onClick(() => {
                    new EventSuggestModal(this.app, this.plugin, (selectedEvt) => {
                        if (selectedEvt && !isMember('event', selectedEvt.id || selectedEvt.name)) {
                            this.group.members.push({ type: 'event', id: selectedEvt.id || selectedEvt.name });
                            this.plugin.addMemberToGroup(this.group.id, 'event', selectedEvt.id || selectedEvt.name);
                            this.onOpen();
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
                const tag = itemTagContainer.createSpan({ text: item.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    this.group.members = this.group.members.filter(m => !(m.type === 'item' && m.id === member.id));
                    await this.plugin.removeMemberFromGroup(this.group.id, 'item', member.id);
                    this.onOpen();
                };
            }
        });
        itemSetting.addButton(btn => {
            btn.setButtonText(t('add')).setCta().onClick(() => {
                new PlotItemSuggestModal(this.app, this.plugin, (selectedItem) => {
                    const itemId = selectedItem.id || selectedItem.name;
                    if (selectedItem && !this.group.members.some(m => m.type === 'item' && m.id === itemId)) {
                        this.group.members.push({ type: 'item', id: itemId });
                        this.plugin.addMemberToGroup(this.group.id, 'item', itemId);
                        this.onOpen();
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

    private async applyTemplateToGroup(template: Template): Promise<void> {
        if (!template.entities.groups || template.entities.groups.length === 0) {
            new Notice('This template does not contain any groups');
            return;
        }

        const templateGroup = template.entities.groups[0];

        Object.keys(templateGroup).forEach(key => {
            if (key !== 'templateId' && key !== 'id' && key !== 'filePath' && key !== 'storyId') {
                (this.group as any)[key] = (templateGroup as any)[key];
            }
        });

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
        this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
    }
}