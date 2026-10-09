import { App, Setting, Notice, setIcon } from 'obsidian';
import type { CompendiumEntry } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { t } from '../i18n/strings';
import { EntityCustomFieldsEditor, customFieldEditorOptions } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';
import { isModalFieldVisible } from './entity/ModalFieldVisibility';
import { createCollapsibleModalSection } from './entity/CollapsibleModalSection';
import { sanitizeCustomFieldDefinitions } from './entity/CustomFieldDefinitions';

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
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'compendiumEntry', this.entry.customFields,
            customFieldEditorOptions(this.plugin, 'compendiumEntry', () => this.entry));
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
                return (entries.find(current => (current.id || current.name) === identifier)?.groups || this.entry.groups || []);
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

    /**
     * Whether a field is turned on for this vault. A hidden field is simply not
     * rendered; its stored value rides along untouched on the object that gets
     * submitted, so turning one off never discards data.
     */
    private shows(fieldKey: string): boolean {
        return isModalFieldVisible(this.plugin.settings.hiddenModalFields, 'compendiumEntry', fieldKey);
    }

    onOpen(): void { void (async () => {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();

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
        if (this.shows('entryType')) {
            new Setting(contentEl)
                .setName('Entry type')
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
        }

        // Profile Image
        if (this.shows('profileImage')) {
            const profileImageSetting = new Setting(contentEl)
                .setName('Profile image')
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
        }

        // Description
        if (this.shows('description')) {
            new Setting(contentEl)
                .setName('Description')
                .setDesc('Appearance and overview')
                .setClass('storyteller-modal-setting-vertical')
                .addTextArea(text => {
                    text.setValue(this.entry.description || '').onChange(v => this.entry.description = v);
                    text.inputEl.rows = 4;
                    text.inputEl.setCssStyles({ width: '100%' });
                });
        }

        this.customFieldsEditor.setFields(this.entry.customFields);
        const definedFieldCount = sanitizeCustomFieldDefinitions('compendiumEntry', this.plugin.getCustomFieldDefinitions('compendiumEntry')).length;
        const yourFields = definedFieldCount > 0
            ? createCollapsibleModalSection(contentEl, {
                title: 'Your fields',
                description: 'Fields you defined for compendium entries in settings',
                icon: 'list-checks',
                open: true,
            })
            : null;
        if (yourFields) {
            this.customFieldsEditor.renderDefinedFields(yourFields);
            yourFields.querySelector(':scope > h3')?.remove();
        }

        const fieldNotes = (this.shows('behavior') || this.shows('properties') || this.shows('dimorphism') || this.shows('huntingNotes') || this.shows('rarity') || this.shows('dangerRating'))
            ? createCollapsibleModalSection(contentEl, {
                title: 'Field notes',
                description: 'Behavior, properties, hunting notes, rarity, and danger',
                icon: 'paw-print',
                open: Boolean(this.entry.behavior || this.entry.properties || this.entry.dimorphism || this.entry.huntingNotes || this.entry.rarity || this.entry.dangerRating),
            })
            : null;
        if (fieldNotes) {
            // Behavior & Ecology
            if (this.shows('behavior')) {
                new Setting(fieldNotes)
                    .setName('Behavior & ecology')
                    .setDesc('Habits, habitat, growth conditions')
                    .setClass('storyteller-modal-setting-vertical')
                    .addTextArea(text => {
                        text.setValue(this.entry.behavior || '').onChange(v => this.entry.behavior = v);
                        text.inputEl.rows = 4;
                        text.inputEl.setCssStyles({ width: '100%' });
                    });
            }

            // Properties
            if (this.shows('properties')) {
                new Setting(fieldNotes)
                    .setName('Properties')
                    .setDesc('Physical, magical, or alchemical properties')
                    .setClass('storyteller-modal-setting-vertical')
                    .addTextArea(text => {
                        text.setValue(this.entry.properties || '').onChange(v => this.entry.properties = v);
                        text.inputEl.rows = 4;
                        text.inputEl.setCssStyles({ width: '100%' });
                    });
            }

            // Dimorphism
            if (this.shows('dimorphism')) {
                new Setting(fieldNotes)
                    .setName('Dimorphism')
                    .setDesc('Male/female or subspecies differences')
                    .setClass('storyteller-modal-setting-vertical')
                    .addTextArea(text => {
                        text.setValue(this.entry.dimorphism || '').onChange(v => this.entry.dimorphism = v);
                        text.inputEl.rows = 3;
                        text.inputEl.setCssStyles({ width: '100%' });
                    });
            }

            // Hunting Notes
            if (this.shows('huntingNotes')) {
                new Setting(fieldNotes)
                    .setName('Hunting notes')
                    .setDesc('Tactics, vulnerabilities, harvest method')
                    .setClass('storyteller-modal-setting-vertical')
                    .addTextArea(text => {
                        text.setValue(this.entry.huntingNotes || '').onChange(v => this.entry.huntingNotes = v);
                        text.inputEl.rows = 3;
                        text.inputEl.setCssStyles({ width: '100%' });
                    });
            }

            // Rarity
            if (this.shows('rarity')) {
                new Setting(fieldNotes)
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
            }

            // Danger Rating
            if (this.shows('dangerRating')) {
                new Setting(fieldNotes)
                    .setName('Danger rating')
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
            }
        }

        const history = this.shows('history')
            ? createCollapsibleModalSection(contentEl, {
                title: 'History',
                description: 'World history and mythology',
                icon: 'scroll-text',
                open: Boolean(this.entry.history),
            })
            : null;
        if (history) {
            // History & Lore
            if (this.shows('history')) {
                new Setting(history)
                    .setName('History & lore')
                    .setDesc('World history and mythology')
                    .setClass('storyteller-modal-setting-vertical')
                    .addTextArea(text => {
                        text.setValue(this.entry.history || '').onChange(v => this.entry.history = v);
                        text.inputEl.rows = 3;
                        text.inputEl.setCssStyles({ width: '100%' });
                    });
            }
        }

        const connections = (this.shows('linkedLocations') || this.shows('linkedCharacters') || this.shows('linkedItems') || this.shows('linkedMagicSystems') || this.shows('linkedCultures') || this.shows('linkedEvents'))
            ? createCollapsibleModalSection(contentEl, {
                title: 'Connections',
                description: 'Linked locations, characters, items, magic, cultures, and events',
                icon: 'link',
                open: Boolean(this.entry.linkedLocations?.length || this.entry.linkedCharacters?.length || this.entry.linkedItems?.length || this.entry.linkedMagicSystems?.length || this.entry.linkedCultures?.length || this.entry.linkedEvents?.length),
            })
            : null;
        if (connections) {
            if (this.shows('linkedLocations')) {
                // --- Locations ---
                connections.createEl('h3', { text: 'Locations' });
                if (!Array.isArray(this.entry.linkedLocations)) this.entry.linkedLocations = [];
                const locChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add location').addDropdown(dd => {
                    dd.addOption('', '— select location —');
                    allLocations.forEach(l => { dd.addOption(l.name, l.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedLocations ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedLocations)) this.entry.linkedLocations = [];
                            this.entry.linkedLocations.push(val);
                            renderLocChips();
                        }
                        dd.setValue('');
                    });
                });
            }

            if (this.shows('linkedCharacters')) {
                // --- Characters ---
                connections.createEl('h3', { text: 'Characters' });
                if (!Array.isArray(this.entry.linkedCharacters)) this.entry.linkedCharacters = [];
                const charChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add character').addDropdown(dd => {
                    dd.addOption('', '— select character —');
                    allCharacters.forEach(c => { dd.addOption(c.name, c.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedCharacters ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedCharacters)) this.entry.linkedCharacters = [];
                            this.entry.linkedCharacters.push(val);
                            renderCharChips();
                        }
                        dd.setValue('');
                    });
                });
            }

            if (this.shows('linkedItems')) {
                // --- Items ---
                connections.createEl('h3', { text: 'Items' });
                if (!Array.isArray(this.entry.linkedItems)) this.entry.linkedItems = [];
                const itemChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add item').addDropdown(dd => {
                    dd.addOption('', '— select item —');
                    allItems.forEach(i => { dd.addOption(i.name, i.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedItems ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedItems)) this.entry.linkedItems = [];
                            this.entry.linkedItems.push(val);
                            renderItemChips();
                        }
                        dd.setValue('');
                    });
                });
            }

            if (this.shows('linkedMagicSystems')) {
                // --- Magic Systems ---
                connections.createEl('h3', { text: 'Magic systems' });
                if (!Array.isArray(this.entry.linkedMagicSystems)) this.entry.linkedMagicSystems = [];
                const magicChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add magic system').addDropdown(dd => {
                    dd.addOption('', '— select magic system —');
                    allMagicSystems.forEach(m => { dd.addOption(m.name, m.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedMagicSystems ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedMagicSystems)) this.entry.linkedMagicSystems = [];
                            this.entry.linkedMagicSystems.push(val);
                            renderMagicChips();
                        }
                        dd.setValue('');
                    });
                });
            }

            if (this.shows('linkedCultures')) {
                // --- Cultures ---
                connections.createEl('h3', { text: 'Cultures' });
                if (!Array.isArray(this.entry.linkedCultures)) this.entry.linkedCultures = [];
                const cultChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add culture').addDropdown(dd => {
                    dd.addOption('', '— select culture —');
                    allCultures.forEach(c => { dd.addOption(c.name, c.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedCultures ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedCultures)) this.entry.linkedCultures = [];
                            this.entry.linkedCultures.push(val);
                            renderCultChips();
                        }
                        dd.setValue('');
                    });
                });
            }

            if (this.shows('linkedEvents')) {
                // --- Events ---
                connections.createEl('h3', { text: 'Events' });
                if (!Array.isArray(this.entry.linkedEvents)) this.entry.linkedEvents = [];
                const evtChips = connections.createDiv('storyteller-linked-chips');
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
                new Setting(connections).setName('Add event').addDropdown(dd => {
                    dd.addOption('', '— select event —');
                    allEvents.forEach(e => { dd.addOption(e.name, e.name); });
                    dd.onChange(val => {
                        if (val && !(this.entry.linkedEvents ?? []).includes(val)) {
                            if (!Array.isArray(this.entry.linkedEvents)) this.entry.linkedEvents = [];
                            this.entry.linkedEvents.push(val);
                            renderEvtChips();
                        }
                        dd.setValue('');
                    });
                });
            }
        }

        const groups = this.shows('groups')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Groups',
                description: 'Factions and groups this entry belongs to',
                icon: 'users',
                open: Boolean(this.entry.groups?.length),
            })
            : null;
        if (groups) {
            if (this.shows('groups')) {
                // --- Groups ---
                const groupSelectorContainer = groups.createDiv('storyteller-group-selector-container');
                this.groupSelector.attach(groupSelectorContainer);
            }
        }

        if (this.shows('customFields')) {
            const customFieldsSection = createCollapsibleModalSection(contentEl, {
                title: 'Custom fields',
                description: 'Free-form name and value pairs',
                icon: 'list-plus',
                open: Boolean(Object.keys(this.entry.customFields || {}).length),
            });
            this.customFieldsEditor.renderFreeFormSection(customFieldsSection);
            customFieldsSection.querySelector(':scope > h3')?.remove();
        }

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('delete'), async () => {
                if (this.onDelete) {
                    await this.onDelete(this.entry);
                    this.close();
                }
            }, { warning: true });
        }
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        this.createFooterButton(footerEl, t('cancel'), () => this.close());
        this.createFooterButton(footerEl, this.isNew ? t('createCompendiumEntry') : t('saveChanges'), async () => {
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
        }, { cta: true });
    })(); }

    onClose(): void {
        this.groupSelector.dispose();
        const { contentEl } = this;
        contentEl.empty();
    }
}

