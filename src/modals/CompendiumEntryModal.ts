import { App, Setting, Notice, setIcon } from 'obsidian';
import type { CompendiumEntry } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { t } from '../i18n/strings';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';

export type CompendiumEntryModalSubmitCallback = (entry: CompendiumEntry) => Promise<void>;
export type CompendiumEntryModalDeleteCallback = (entry: CompendiumEntry) => Promise<void>;

export class CompendiumEntryModal extends ResponsiveModal {
    entry: CompendiumEntry;
    plugin: StorytellerSuitePlugin;
    onSubmit: CompendiumEntryModalSubmitCallback;
    onDelete?: CompendiumEntryModalDeleteCallback;
    isNew: boolean;

    private readonly customFieldsEditor: EntityCustomFieldsEditor;
    private readonly groupSelector: EntityGroupSelector;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        entry: CompendiumEntry | null,
        onSubmit: CompendiumEntryModalSubmitCallback,
        onDelete?: CompendiumEntryModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = entry === null;

        this.entry = entry || {
            name: '',
            entryType: 'other',
            linkedLocations: [],
            linkedCharacters: [],
            linkedItems: [],
            linkedMagicSystems: [],
            linkedCultures: [],
            linkedEvents: [],
            groups: [],
            customFields: {},
            connections: []
        };

        if (!Array.isArray(this.entry.linkedLocations)) this.entry.linkedLocations = [];
        if (!Array.isArray(this.entry.linkedCharacters)) this.entry.linkedCharacters = [];
        if (!Array.isArray(this.entry.linkedItems)) this.entry.linkedItems = [];
        if (!Array.isArray(this.entry.linkedMagicSystems)) this.entry.linkedMagicSystems = [];
        if (!Array.isArray(this.entry.linkedCultures)) this.entry.linkedCultures = [];
        if (!Array.isArray(this.entry.linkedEvents)) this.entry.linkedEvents = [];
        if (!Array.isArray(this.entry.groups)) this.entry.groups = [];
        if (!Array.isArray(this.entry.connections)) this.entry.connections = [];
        if (!this.entry.customFields) this.entry.customFields = {};
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'compendiumEntry', this.entry.customFields);
        this.groupSelector = new EntityGroupSelector({
            plugin: this.plugin,
            description: t('assignItemToGroupsDesc'),
            getSelectedGroupIds: () => this.entry.groups,
            setSelectedGroupIds: groupIds => {
                this.entry.groups = groupIds;
            },
            loadSelectedGroupIds: async () => {
                const identifier = this.entry.id || this.entry.name;
                const entries = await this.plugin.listCompendiumEntries();
                return (entries.find(current => (current.id || current.name) === identifier)?.groups || this.entry.groups || []) as string[];
            },
            persistAdd: async groupId => {
                const entryId = this.entry.id || this.entry.name;
                await this.plugin.addMemberToGroup(groupId, 'compendiumEntry', entryId);
            },
            persistRemove: async groupId => {
                const entryId = this.entry.id || this.entry.name;
                await this.plugin.removeMemberFromGroup(groupId, 'compendiumEntry', entryId);
            }
        });

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-compendium-modal');
    }

    async onOpen(): Promise<void> {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'New Compendium Entry' : `Edit: ${this.entry.name}`
        });

        // Name
        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => {
                text.setValue(this.entry.name).onChange(v => this.entry.name = v);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Entry Type
        new Setting(contentEl)
            .setName('Entry Type')
            .addDropdown(dd => dd
                .addOptions({
                    'creature': 'Creature / Beast',
                    'plant': 'Plant / Flora',
                    'material': 'Material / Ore',
                    'potion': 'Potion / Substance',
                    'phenomenon': 'Phenomenon',
                    'other': 'Other / Misc'
                })
                .setValue(this.entry.entryType || 'other')
                .onChange(v => this.entry.entryType = v as CompendiumEntry['entryType'])
            );

        // Rarity
        new Setting(contentEl)
            .setName('Rarity')
            .addDropdown(dd => dd
                .addOptions({
                    '': '— none —',
                    'common': 'Common',
                    'uncommon': 'Uncommon',
                    'rare': 'Rare',
                    'legendary': 'Legendary',
                    'mythical': 'Mythical'
                })
                .setValue(this.entry.rarity || '')
                .onChange(v => this.entry.rarity = (v || undefined) as CompendiumEntry['rarity'])
            );

        // Danger Rating
        new Setting(contentEl)
            .setName('Danger Rating')
            .addDropdown(dd => dd
                .addOptions({
                    '': '— none —',
                    'none': 'None',
                    'low': 'Low',
                    'medium': 'Medium',
                    'high': 'High',
                    'deadly': 'Deadly'
                })
                .setValue(this.entry.dangerRating || '')
                .onChange(v => this.entry.dangerRating = (v || undefined) as CompendiumEntry['dangerRating'])
            );

        // Profile Image
        const profileImageSetting = new Setting(contentEl)
            .setName('Profile Image')
            .setDesc('');
        const imagePathDesc = profileImageSetting.descEl.createEl('small', {
            text: `Current: ${this.entry.profileImagePath || 'none'}`
        });
        addImageSelectionButtons(profileImageSetting, this.app, this.plugin, {
            currentPath: this.entry.profileImagePath,
            onSelect: (path) => {
                this.entry.profileImagePath = path;
                imagePathDesc.setText(`Current: ${path || 'none'}`);
            },
            descriptionEl: imagePathDesc
        });

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Appearance and overview')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.description || '').onChange(v => this.entry.description = v);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Behavior & Ecology
        new Setting(contentEl)
            .setName('Behavior & Ecology')
            .setDesc('Habits, habitat, growth conditions')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.behavior || '').onChange(v => this.entry.behavior = v);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Properties
        new Setting(contentEl)
            .setName('Properties')
            .setDesc('Physical, magical, or alchemical properties')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.properties || '').onChange(v => this.entry.properties = v);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History & Lore
        new Setting(contentEl)
            .setName('History & Lore')
            .setDesc('World history and mythology')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.history || '').onChange(v => this.entry.history = v);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Dimorphism
        new Setting(contentEl)
            .setName('Dimorphism')
            .setDesc('Male/female or subspecies differences')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.dimorphism || '').onChange(v => this.entry.dimorphism = v);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Hunting Notes
        new Setting(contentEl)
            .setName('Hunting Notes')
            .setDesc('Tactics, vulnerabilities, harvest method')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.entry.huntingNotes || '').onChange(v => this.entry.huntingNotes = v);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // --- Locations ---
        contentEl.createEl('h3', { text: 'Locations' });
        if (!Array.isArray(this.entry.linkedLocations)) this.entry.linkedLocations = [];
        const locChips = contentEl.createDiv('storyteller-linked-chips');
        const renderLocChips = () => {
            locChips.empty();
            for (const name of (this.entry.linkedLocations ?? [])) {
                const chip = locChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedLocations = this.entry.linkedLocations!.filter(n => n !== name);
                    renderLocChips();
                });
            }
        };
        renderLocChips();
        const allLocations = await this.plugin.listLocations();
        new Setting(contentEl).setName('Add location').addDropdown(dd => {
            dd.addOption('', '— select location —');
            allLocations.forEach(l => dd.addOption(l.name, l.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedLocations ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedLocations)) this.entry.linkedLocations = [];
                    this.entry.linkedLocations.push(val);
                    renderLocChips();
                }
                dd.setValue('');
            });
        });

        // --- Characters ---
        contentEl.createEl('h3', { text: 'Characters' });
        if (!Array.isArray(this.entry.linkedCharacters)) this.entry.linkedCharacters = [];
        const charChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCharChips = () => {
            charChips.empty();
            for (const name of (this.entry.linkedCharacters ?? [])) {
                const chip = charChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedCharacters = this.entry.linkedCharacters!.filter(n => n !== name);
                    renderCharChips();
                });
            }
        };
        renderCharChips();
        const allCharacters = await this.plugin.listCharacters();
        new Setting(contentEl).setName('Add character').addDropdown(dd => {
            dd.addOption('', '— select character —');
            allCharacters.forEach(c => dd.addOption(c.name, c.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedCharacters ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedCharacters)) this.entry.linkedCharacters = [];
                    this.entry.linkedCharacters.push(val);
                    renderCharChips();
                }
                dd.setValue('');
            });
        });

        // --- Items ---
        contentEl.createEl('h3', { text: 'Items' });
        if (!Array.isArray(this.entry.linkedItems)) this.entry.linkedItems = [];
        const itemChips = contentEl.createDiv('storyteller-linked-chips');
        const renderItemChips = () => {
            itemChips.empty();
            for (const name of (this.entry.linkedItems ?? [])) {
                const chip = itemChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedItems = this.entry.linkedItems!.filter(n => n !== name);
                    renderItemChips();
                });
            }
        };
        renderItemChips();
        const allItems = await this.plugin.listPlotItems();
        new Setting(contentEl).setName('Add item').addDropdown(dd => {
            dd.addOption('', '— select item —');
            allItems.forEach(i => dd.addOption(i.name, i.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedItems ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedItems)) this.entry.linkedItems = [];
                    this.entry.linkedItems.push(val);
                    renderItemChips();
                }
                dd.setValue('');
            });
        });

        // --- Magic Systems ---
        contentEl.createEl('h3', { text: 'Magic Systems' });
        if (!Array.isArray(this.entry.linkedMagicSystems)) this.entry.linkedMagicSystems = [];
        const magicChips = contentEl.createDiv('storyteller-linked-chips');
        const renderMagicChips = () => {
            magicChips.empty();
            for (const name of (this.entry.linkedMagicSystems ?? [])) {
                const chip = magicChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedMagicSystems = this.entry.linkedMagicSystems!.filter(n => n !== name);
                    renderMagicChips();
                });
            }
        };
        renderMagicChips();
        const allMagicSystems = await this.plugin.listMagicSystems();
        new Setting(contentEl).setName('Add magic system').addDropdown(dd => {
            dd.addOption('', '— select magic system —');
            allMagicSystems.forEach(m => dd.addOption(m.name, m.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedMagicSystems ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedMagicSystems)) this.entry.linkedMagicSystems = [];
                    this.entry.linkedMagicSystems.push(val);
                    renderMagicChips();
                }
                dd.setValue('');
            });
        });

        // --- Cultures ---
        contentEl.createEl('h3', { text: 'Cultures' });
        if (!Array.isArray(this.entry.linkedCultures)) this.entry.linkedCultures = [];
        const cultChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCultChips = () => {
            cultChips.empty();
            for (const name of (this.entry.linkedCultures ?? [])) {
                const chip = cultChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedCultures = this.entry.linkedCultures!.filter(n => n !== name);
                    renderCultChips();
                });
            }
        };
        renderCultChips();
        const allCultures = await this.plugin.listCultures();
        new Setting(contentEl).setName('Add culture').addDropdown(dd => {
            dd.addOption('', '— select culture —');
            allCultures.forEach(c => dd.addOption(c.name, c.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedCultures ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedCultures)) this.entry.linkedCultures = [];
                    this.entry.linkedCultures.push(val);
                    renderCultChips();
                }
                dd.setValue('');
            });
        });

        // --- Events ---
        contentEl.createEl('h3', { text: 'Events' });
        if (!Array.isArray(this.entry.linkedEvents)) this.entry.linkedEvents = [];
        const evtChips = contentEl.createDiv('storyteller-linked-chips');
        const renderEvtChips = () => {
            evtChips.empty();
            for (const name of (this.entry.linkedEvents ?? [])) {
                const chip = evtChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.entry.linkedEvents = this.entry.linkedEvents!.filter(n => n !== name);
                    renderEvtChips();
                });
            }
        };
        renderEvtChips();
        const allEvents = await this.plugin.listEvents();
        new Setting(contentEl).setName('Add event').addDropdown(dd => {
            dd.addOption('', '— select event —');
            allEvents.forEach(e => dd.addOption(e.name, e.name));
            dd.onChange(val => {
                if (val && !(this.entry.linkedEvents ?? []).includes(val)) {
                    if (!Array.isArray(this.entry.linkedEvents)) this.entry.linkedEvents = [];
                    this.entry.linkedEvents.push(val);
                    renderEvtChips();
                }
                dd.setValue('');
            });
        });

        // --- Groups ---
        contentEl.createEl('h3', { text: t('groups') });
        const groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.groupSelector.attach(groupSelectorContainer);

        // --- Custom Fields ---
        this.customFieldsEditor.setFields(this.entry.customFields);
        this.customFieldsEditor.renderSection(contentEl);

        // Buttons
        const buttonsSetting = new Setting(contentEl);
        buttonsSetting.addButton(btn => btn
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.entry.name.trim()) {
                    new Notice('Entry name is required.');
                    return;
                }
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.entry.customFields = customFields;
                await this.onSubmit(this.entry);
                this.close();
            })
        );
        buttonsSetting.addButton(btn => btn
            .setButtonText(t('cancel'))
            .onClick(() => this.close())
        );
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(btn => btn
                .setButtonText(t('delete'))
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.entry);
                        this.close();
                    }
                })
            );
        }
    }

    onClose(): void {
        this.groupSelector.dispose();
        const { contentEl } = this;
        contentEl.empty();
    }
}

