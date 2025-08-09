import { App, Modal, Setting, Notice, ButtonComponent } from 'obsidian';
import { Group, Character, Location, Event, PlotItem } from '../types';
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PlotItemSuggestModal } from './PlotItemSuggestModal';

export type GroupModalSubmitCallback = (group: Group) => Promise<void>;
export type GroupModalDeleteCallback = (groupId: string) => Promise<void>;

export class GroupModal extends Modal {
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

    constructor(app: App, plugin: StorytellerSuitePlugin, group: Group | null, onSubmit: GroupModalSubmitCallback, onDelete?: GroupModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = group === null;
        if (group) {
            this.group = { ...group, members: [...group.members] };
        } else {
            const activeStory = this.plugin.getActiveStory();
            if (!activeStory) throw new Error('No active story selected');
            this.group = {
                id: '',
                storyId: activeStory.id,
                name: '',
                description: '',
                color: '',
                members: []
            };
        }
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-group-modal');
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create new group' : `Edit group: ${this.group.name}` });

        // --- Name ---
        new Setting(contentEl)
            .setName('Name')
            .addText(text => text
                .setPlaceholder('Enter group name')
                .setValue(this.group.name)
                .onChange(value => { this.group.name = value; })
            );

        // --- Description ---
        new Setting(contentEl)
            .setName('Description')
            .addTextArea(text => text
                .setPlaceholder('Describe this group...')
                .setValue(this.group.description || '')
                .onChange(value => { this.group.description = value; })
            );

        // --- Color ---
        new Setting(contentEl)
            .setName('Color')
            .addText(text => text
                .setPlaceholder('#RRGGBB or color name')
                .setValue(this.group.color || '')
                .onChange(value => { this.group.color = value; })
            );

        // --- Tags ---
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated tags')
            .addText(text => text
                .setPlaceholder('e.g., royal, faction, allied')
                .setValue((this.group.tags || []).join(', '))
                .onChange(value => { this.group.tags = value.split(',').map(t => t.trim()).filter(Boolean); })
            );

        // --- Profile Image ---
        let imagePathDesc: HTMLElement | null = null;
        new Setting(contentEl)
            .setName('Profile image')
            .then(s => {
                imagePathDesc = s.descEl.createEl('small', { text: `Current: ${this.group.profileImagePath || 'None'}` });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(btn => btn
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (img) => {
                        this.group.profileImagePath = img?.filePath;
                        if (imagePathDesc) imagePathDesc.setText(`Current: ${this.group.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(btn => btn
                .setButtonText('Upload')
                .setTooltip('Upload new image')
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
                            new Notice('Image uploaded');
                        } catch (e) {
                            console.error('Upload failed', e);
                            new Notice('Error uploading image');
                        }
                    };
                    input.click();
                }))
            .addButton(btn => btn
                .setIcon('cross')
                .setTooltip('Clear image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.group.profileImagePath = undefined;
                    if (imagePathDesc) imagePathDesc.setText(`Current: ${this.group.profileImagePath || 'None'}`);
                }));

        // --- Members ---
        contentEl.createEl('h3', { text: 'Members' });
        await this.loadAllEntities();
        this.renderMemberSelectors(contentEl);

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');
        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? 'Create group' : 'Save changes')
            .setCta()
            .onClick(async () => {
                if (!this.group.name.trim()) {
                    new Notice('Group name is required.');
                    return;
                }
                // Prevent duplicate group names (case-insensitive)
                const allGroups = this.plugin.getGroups();
                const nameLower = this.group.name.trim().toLowerCase();
                const duplicate = allGroups.some(g => g.name.trim().toLowerCase() === nameLower && (!this.group.id || g.id !== this.group.id));
                if (duplicate) {
                    new Notice('A group with this name already exists. Please choose a different name.');
                    return;
                }
                if (this.isNew) {
                    const newGroup = await this.plugin.createGroup(this.group.name, this.group.description, this.group.color);
                    this.group.id = newGroup.id;
                    // Immediately persist tags/image for the new group
                    await this.plugin.updateGroup(this.group.id, { description: this.group.description, color: this.group.color, name: this.group.name } as any);
                    // Manually merge non-core fields and save
                    const found = this.plugin.getGroups().find(g => g.id === this.group.id);
                    if (found) {
                        (found as any).tags = this.group.tags || [];
                        (found as any).profileImagePath = this.group.profileImagePath;
                        await this.plugin.saveSettings();
                        this.plugin.emitGroupsChanged?.();
                    }
                    // Add all members to the new group
                    for (const member of this.group.members) {
                        await this.plugin.addMemberToGroup(newGroup.id, member.type, member.id);
                    }
                } else {
                    await this.plugin.updateGroup(this.group.id, {
                        name: this.group.name,
                        description: this.group.description,
                        color: this.group.color
                    });
                    // Persist tags and image on edit
                    const found = this.plugin.getGroups().find(g => g.id === this.group.id);
                    if (found) {
                        (found as any).tags = this.group.tags || [];
                        (found as any).profileImagePath = this.group.profileImagePath;
                        await this.plugin.saveSettings();
                        this.plugin.emitGroupsChanged?.();
                    }
                    // Update members
                    await this.syncMembers();
                }
                if (this.onSubmit) await this.onSubmit(this.group);
                this.close();
            })
        );
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete group')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete group "${this.group.name}"?`)) {
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
    }

    renderMemberSelectors(container: HTMLElement) {
        const isMember = (type: 'character' | 'location' | 'event' | 'item', id: string) =>
            this.group.members.some(m => m.type === type && m.id === id);

        // --- Characters Multi-Select ---
        const charSetting = new Setting(container)
            .setName('Characters');
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
            btn.setButtonText('Add character')
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
            .setName('Locations');
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
            btn.setButtonText('Add location')
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
            .setName('Events');
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
            btn.setButtonText('Add event')
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
        const itemSetting = new Setting(container).setName('Items');
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
            btn.setButtonText('Add item').setCta().onClick(() => {
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

    onClose() {
        this.contentEl.empty();
    }
}