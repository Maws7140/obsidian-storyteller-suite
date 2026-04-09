/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, parseYaml, setIcon } from 'obsidian';
import {
    CampaignEffectTarget,
    CampaignItemEffect,
    CampaignItemEffectType,
    Character,
    CompendiumEntry,
    Group,
    Location,
    PlotItem,
    Scene,
} from '../types';
import StorytellerSuitePlugin from '../main';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { t } from '../i18n/strings';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';
import { EntityGroupSelector } from './entity/EntityGroupSelector';
import { ResponsiveModal } from './ResponsiveModal';

export type PlotItemModalSubmitCallback = (item: PlotItem) => Promise<void>;
export type PlotItemModalDeleteCallback = (item: PlotItem) => Promise<void>;

export class PlotItemModal extends ResponsiveModal {
    item: PlotItem;
    plugin: StorytellerSuitePlugin;
    onSubmit: PlotItemModalSubmitCallback;
    onDelete?: PlotItemModalDeleteCallback;
    isNew: boolean;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;
    private readonly groupSelector: EntityGroupSelector;

    constructor(app: App, plugin: StorytellerSuitePlugin, item: PlotItem | null, onSubmit: PlotItemModalSubmitCallback, onDelete?: PlotItemModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = item === null;
        
        const initialItem: PlotItem = item ? { ...item } : {
            id: '',
            filePath: '',
            name: '',
            isPlotCritical: false,
            pastOwners: [],
            associatedEvents: [],
            customFields: {}
        };

        if (!Array.isArray(initialItem.pastOwners)) initialItem.pastOwners = [];
        if (!Array.isArray(initialItem.associatedEvents)) initialItem.associatedEvents = [];
        if (!initialItem.customFields) initialItem.customFields = {};
        if (!Array.isArray(initialItem.groups)) initialItem.groups = []; // Ensure groups array is initialized
        if (!Array.isArray(initialItem.magicSystems)) initialItem.magicSystems = [];
        if (!Array.isArray(initialItem.linkedCharacters)) initialItem.linkedCharacters = [];
        if (!Array.isArray(initialItem.linkedEconomies)) initialItem.linkedEconomies = [];
        if (!Array.isArray(initialItem.linkedCultures)) initialItem.linkedCultures = [];
        if (!Array.isArray(initialItem.campaignItemEffects)) initialItem.campaignItemEffects = [];
        initialItem.campaignItemEffects = initialItem.campaignItemEffects.map(effect => ({
            ...effect,
            id: effect.id || this.createCampaignEffectId(),
        }));

        this.item = initialItem;
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'item', this.item.customFields);
        this.groupSelector = new EntityGroupSelector({
            plugin: this.plugin,
            description: t('assignItemToGroupsDesc'),
            getSelectedGroupIds: () => this.item.groups,
            setSelectedGroupIds: groupIds => {
                this.item.groups = groupIds;
            },
            loadSelectedGroupIds: async () => {
                const identifier = this.item.id || this.item.name;
                const items = await this.plugin.listPlotItems();
                return (items.find(item => (item.id || item.name) === identifier)?.groups || this.item.groups || []) as string[];
            },
            persistAdd: async groupId => {
                const itemId = this.item.id || this.item.name;
                await this.plugin.addMemberToGroup(groupId, 'item', itemId);
            },
            persistRemove: async groupId => {
                const itemId = this.item.id || this.item.name;
                await this.plugin.removeMemberFromGroup(groupId, 'item', itemId);
            }
        });
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-item-modal');
    }

    async onOpen() {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createItem') : `${t('edit')} ${this.item.name}` });

        // Auto-apply default template for new items
        if (this.isNew && !this.item.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['item'];
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
                                            await this.applyTemplateToItemWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[PlotItemModal] Error applying template:', error);
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
                            await this.applyTemplateToItem(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[PlotItemModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new items) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured item template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select an item template')
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
                                                        await this.applyTemplateToItemWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[PlotItemModal] Error applying template:', error);
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
                                    await this.applyTemplateToItem(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            },
                            'item'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterItemName'))
                .setValue(this.item.name)
                .onChange(value => this.item.name = value)
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName(t('plotCritical'))
            .setDesc(t('plotCritical'))
            .addToggle(toggle => toggle
                .setValue(this.item.isPlotCritical)
                .onChange(value => this.item.isPlotCritical = value)
            );
        
        const profileImageSetting = new Setting(contentEl)
            .setName(t('itemImage'))
            .setDesc('')
            .then(setting => {
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        const imagePathDesc = profileImageSetting.descEl.createEl('small', { 
            text: t('currentValue', this.item.profileImagePath || t('none')) 
        });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.item.profileImagePath,
                onSelect: (path) => {
                    this.item.profileImagePath = path;
                },
                descriptionEl: imagePathDesc
            }
        );

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('itemDescriptionPh'))
                    .setValue(this.item.description || '')
                    .onChange(value => this.item.description = value || undefined);
                text.inputEl.rows = 4;
            });
        
        new Setting(contentEl)
            .setName(t('history'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('itemHistoryPh'))
                    .setValue(this.item.history || '')
                    .onChange(value => this.item.history = value || undefined);
                text.inputEl.rows = 6;
            });
        
        contentEl.createEl('h3', { text: t('relationships') });
        if (this.item.currentOwner && this.item.currentLocation) {
            contentEl.createEl('p', {
                cls: 'storyteller-modal-hint storyteller-item-owner-location-warning',
                text: `This item has both an owner (${this.item.currentOwner}) and a location (${this.item.currentLocation}).`,
            });
        }

        new Setting(contentEl)
            .setName(t('currentOwner'))
            .setDesc(`${t('currentOwner')}: ${this.item.currentOwner || t('none')}`)
            .addButton(btn => btn
                .setButtonText(t('selectOwner'))
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (char) => {
                        if (this.item.currentLocation) {
                            new Notice(
                                `${this.item.name || 'This item'} is currently at ${this.item.currentLocation}. ` +
                                `Assigning an owner may conflict with location tracking.`,
                                7000
                            );
                        }
                        this.item.currentOwner = char.name;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
        // --- Groups ---
        contentEl.createEl('h3', { text: t('groups') });
        const groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.groupSelector.attach(groupSelectorContainer);


        // --- Custom Fields ---
        this.customFieldsEditor.setFields(this.item.customFields);
        this.customFieldsEditor.renderSection(contentEl);
        new Setting(contentEl)
            .setName(t('currentLocation'))
            .setDesc(`${t('currentLocation')}: ${this.item.currentLocation || t('none')}`)
            .addButton(btn => btn
                .setButtonText(t('selectLocation'))
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, (loc) => {
                        if (this.item.currentOwner && loc) {
                            new Notice(
                                `${this.item.name || 'This item'} is currently owned by ${this.item.currentOwner}. ` +
                                `Assigning a location may conflict with ownership tracking.`,
                                7000
                            );
                        }
                        this.item.currentLocation = loc ? loc.name : undefined;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
            

        // --- Past Owners ---
        contentEl.createEl('h3', { text: t('pastOwners') });
        const pastOwnersContainer = contentEl.createDiv('storyteller-past-owners-container');
        const renderPastOwners = () => {
            pastOwnersContainer.empty();
            if (this.item.pastOwners && this.item.pastOwners.length > 0) {
                const listDiv = pastOwnersContainer.createDiv('storyteller-tags-list');
                this.item.pastOwners.forEach((owner, idx) => {
                    const tag = listDiv.createSpan({ text: owner, cls: 'storyteller-tag' });
                    const removeBtn = tag.createSpan({ text: ' Ã—', cls: 'remove-tag-btn' });
                    removeBtn.onclick = () => {
                        this.item.pastOwners!.splice(idx, 1);
                        renderPastOwners();
                    };
                });
            }
            new Setting(pastOwnersContainer)
                .addButton(btn => btn
                    .setButtonText(t('addPastOwner'))
                    .setIcon('user-plus')
                    .onClick(() => {
                        new CharacterSuggestModal(this.app, this.plugin, (char) => {
                            if (!Array.isArray(this.item.pastOwners)) this.item.pastOwners = [];
                            if (!this.item.pastOwners.includes(char.name)) {
                                this.item.pastOwners.push(char.name);
                            }
                            renderPastOwners();
                        }).open();
                    })
                );
        };
        renderPastOwners();

        // --- Associated Events ---
        contentEl.createEl('h3', { text: t('associatedEvents') });
        const assocEventsContainer = contentEl.createDiv('storyteller-assoc-events-container');
        const renderAssocEvents = () => {
            assocEventsContainer.empty();
            if (this.item.associatedEvents && this.item.associatedEvents.length > 0) {
                const listDiv = assocEventsContainer.createDiv('storyteller-tags-list');
                this.item.associatedEvents.forEach((eventName, idx) => {
                    const tag = listDiv.createSpan({ text: eventName, cls: 'storyteller-tag' });
                    const removeBtn = tag.createSpan({ text: ' Ã—', cls: 'remove-tag-btn' });
                    removeBtn.onclick = () => {
                        this.item.associatedEvents!.splice(idx, 1);
                        renderAssocEvents();
                    };
                });
            }
            new Setting(assocEventsContainer)
                .addButton(btn => btn
                    .setButtonText(t('addAssociatedEvent'))
                    .setIcon('calendar-plus')
                    .onClick(() => {
                        new EventSuggestModal(this.app, this.plugin, (evt) => {
                            if (!Array.isArray(this.item.associatedEvents)) this.item.associatedEvents = [];
                            if (!this.item.associatedEvents.includes(evt.name)) {
                                this.item.associatedEvents.push(evt.name);
                            }
                            renderAssocEvents();
                        }).open();
                    })
                );
        };
        renderAssocEvents();

        // --- Associated Characters (multiple owners/associations) ---
        contentEl.createEl('h3', { text: 'Associated Characters' });
        contentEl.createEl('p', {
            cls: 'storyteller-modal-hint',
            text: 'Characters with a claim or connection to this item beyond the primary bearer.'
        });
        if (!Array.isArray(this.item.linkedCharacters)) this.item.linkedCharacters = [];
        const charChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCharChips = () => {
            charChips.empty();
            for (const name of (this.item.linkedCharacters ?? [])) {
                const chip = charChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.item.linkedCharacters = this.item.linkedCharacters!.filter(n => n !== name);
                    renderCharChips();
                });
            }
        };
        renderCharChips();
        const allCharsForItem = await this.plugin.listCharacters();
        new Setting(contentEl)
            .setName('Add associated character')
            .addDropdown(dd => {
                dd.addOption('', 'â€” select character â€”');
                allCharsForItem.forEach(c => dd.addOption(c.name, c.name));
                dd.onChange(val => {
                    if (val && !(this.item.linkedCharacters ?? []).includes(val)) {
                        if (!Array.isArray(this.item.linkedCharacters)) this.item.linkedCharacters = [];
                        this.item.linkedCharacters.push(val);
                        renderCharChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Magic Systems ---
        contentEl.createEl('h3', { text: 'Magic Systems' });
        if (!Array.isArray(this.item.magicSystems)) this.item.magicSystems = [];
        const magicChips = contentEl.createDiv('storyteller-linked-chips');
        const renderMagicChips = () => {
            magicChips.empty();
            for (const name of (this.item.magicSystems ?? [])) {
                const chip = magicChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.item.magicSystems = this.item.magicSystems!.filter(n => n !== name);
                    renderMagicChips();
                });
            }
        };
        renderMagicChips();
        const allMagicSystems = await this.plugin.listMagicSystems();
        new Setting(contentEl)
            .setName('Add magic system')
            .addDropdown(dd => {
                dd.addOption('', 'â€” select magic system â€”');
                allMagicSystems.forEach(m => dd.addOption(m.name, m.name));
                dd.onChange(val => {
                    if (val && !(this.item.magicSystems ?? []).includes(val)) {
                        if (!Array.isArray(this.item.magicSystems)) this.item.magicSystems = [];
                        this.item.magicSystems.push(val);
                        renderMagicChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Magic Properties ---
        new Setting(contentEl)
            .setName('Magic properties')
            .setDesc('Magical effects, abilities, and lore of this item')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.item.magicProperties || '')
                    .onChange(value => { this.item.magicProperties = value || undefined; });
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // --- Economic Value ---
        contentEl.createEl('h3', { text: 'Economic Value' });
        new Setting(contentEl)
            .setName('Value')
            .setDesc('Monetary or trade value (e.g. "500gp", "priceless", "worthless")')
            .addText(text => {
                text.setValue(this.item.economicValue || '')
                    .onChange(value => { this.item.economicValue = value || undefined; });
                text.inputEl.placeholder = '500gp';
            });
        if (!Array.isArray(this.item.linkedEconomies)) this.item.linkedEconomies = [];
        const econChips = contentEl.createDiv('storyteller-linked-chips');
        const renderEconChips = () => {
            econChips.empty();
            for (const name of (this.item.linkedEconomies ?? [])) {
                const chip = econChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.item.linkedEconomies = this.item.linkedEconomies!.filter(n => n !== name);
                    renderEconChips();
                });
            }
        };
        renderEconChips();
        const allEconomies = await this.plugin.listEconomies();
        new Setting(contentEl)
            .setName('Traded in economy')
            .addDropdown(dd => {
                dd.addOption('', 'â€” select economy â€”');
                allEconomies.forEach(e => dd.addOption(e.name, e.name));
                dd.onChange(val => {
                    if (val && !(this.item.linkedEconomies ?? []).includes(val)) {
                        if (!Array.isArray(this.item.linkedEconomies)) this.item.linkedEconomies = [];
                        this.item.linkedEconomies.push(val);
                        renderEconChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Cultural Significance ---
        contentEl.createEl('h3', { text: 'Cultural Significance' });
        new Setting(contentEl)
            .setName('Significance')
            .setDesc('Cultural importance, symbolism, and meaning')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.item.culturalSignificance || '')
                    .onChange(value => { this.item.culturalSignificance = value || undefined; });
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });
        if (!Array.isArray(this.item.linkedCultures)) this.item.linkedCultures = [];
        const cultChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCultChips = () => {
            cultChips.empty();
            for (const name of (this.item.linkedCultures ?? [])) {
                const chip = cultChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.item.linkedCultures = this.item.linkedCultures!.filter(n => n !== name);
                    renderCultChips();
                });
            }
        };
        renderCultChips();
        const allCultures = await this.plugin.listCultures();
        new Setting(contentEl)
            .setName('Significant to culture')
            .addDropdown(dd => {
                dd.addOption('', 'â€” select culture â€”');
                allCultures.forEach(c => dd.addOption(c.name, c.name));
                dd.onChange(val => {
                    if (val && !(this.item.linkedCultures ?? []).includes(val)) {
                        if (!Array.isArray(this.item.linkedCultures)) this.item.linkedCultures = [];
                        this.item.linkedCultures.push(val);
                        renderCultChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Campaign Use ---
        const campaignHdr = contentEl.createDiv('storyteller-campaign-use-header');
        campaignHdr.createEl('h3', { text: 'Campaign Use' });
        const campaignToggle = campaignHdr.createEl('button', { cls: 'storyteller-campaign-use-toggle' });
        const campaignBody = contentEl.createDiv('storyteller-campaign-use-body');
        const isCampaignExpanded = !!(
            this.item.itemType || this.item.itemRarity || this.item.consumedOnUse ||
            this.item.campaignEffect || this.item.grantsFlag ||
            this.item.navigatesToScene || this.item.useRequiresLocation || this.item.useRequiresFlag ||
            (this.item.campaignItemEffects?.length ?? 0) > 0
        );
        if (!isCampaignExpanded) campaignBody.hide();
        campaignToggle.textContent = isCampaignExpanded ? 'Hide' : 'Show';
        campaignToggle.addEventListener('click', () => {
            if (campaignBody.isShown()) { campaignBody.hide(); campaignToggle.textContent = 'Show'; }
            else { campaignBody.show(); campaignToggle.textContent = 'Hide'; }
        });

        contentEl.createEl('p', {
            cls: 'storyteller-modal-hint',
            text: 'Define what happens when this item is used during a campaign session.',
        });

        new Setting(campaignBody)
            .setName('Item type')
            .setDesc('D&D item category')
            .addDropdown(dd => {
                dd.addOption('', '- none -');
                for (const t of ['weapon', 'armor', 'consumable', 'tool', 'key', 'treasure', 'other']) {
                    dd.addOption(t, t.charAt(0).toUpperCase() + t.slice(1));
                }
                dd.setValue(this.item.itemType ?? '');
                dd.onChange(v => { this.item.itemType = (v || undefined) as any; });
            });

        new Setting(campaignBody)
            .setName('Rarity')
            .setDesc('D&D rarity tier')
            .addDropdown(dd => {
                dd.addOption('', '- none -');
                for (const r of ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']) {
                    dd.addOption(r, r.charAt(0).toUpperCase() + r.slice(1));
                }
                dd.setValue(this.item.itemRarity ?? '');
                dd.onChange(v => { this.item.itemRarity = (v || undefined) as any; });
            });

        new Setting(campaignBody)
            .setName('Consumed on use')
            .setDesc('Remove from party inventory when used')
            .addToggle(t => t.setValue(this.item.consumedOnUse ?? false).onChange(v => { this.item.consumedOnUse = v; }));

        new Setting(campaignBody)
            .setName('Use effect')
            .setDesc('DM description shown when this item is used')
            .addTextArea(ta => {
                ta.setValue(this.item.campaignEffect ?? '')
                    .onChange(v => { this.item.campaignEffect = v || undefined; });
                ta.inputEl.rows = 3;
                ta.inputEl.style.width = '100%';
            });

        new Setting(campaignBody)
            .setName('Sets flag on use')
            .setDesc('Session flag to set when item is used (e.g. "bribed-barkeep")')
            .addText(t => {
                t.setPlaceholder('flag-name')
                    .setValue(this.item.grantsFlag ?? '')
                    .onChange(v => { this.item.grantsFlag = v.trim() || undefined; });
            });

        const [allScenesForItem, allLocsForItem, allCampaignChars, allItemsForEffects, allCompendiumEntries] = await Promise.all([
            this.plugin.listScenes().catch(() => [] as Scene[]),
            this.plugin.listLocations().catch(() => [] as Location[]),
            this.plugin.listCharacters().catch(() => [] as Character[]),
            this.plugin.listPlotItems().catch(() => [] as PlotItem[]),
            this.plugin.listCompendiumEntries().catch(() => [] as CompendiumEntry[]),
        ]);
        const allGroupsForEffects = this.plugin.getGroups().slice();
        allScenesForItem.sort((a, b) => a.name.localeCompare(b.name));
        allLocsForItem.sort((a, b) => a.name.localeCompare(b.name));
        allCampaignChars.sort((a, b) => a.name.localeCompare(b.name));
        allItemsForEffects.sort((a, b) => a.name.localeCompare(b.name));
        allCompendiumEntries.sort((a, b) => a.name.localeCompare(b.name));
        allGroupsForEffects.sort((a, b) => a.name.localeCompare(b.name));

        const sceneWrap = campaignBody.createDiv();
        new Setting(sceneWrap)
            .setName('Navigates to scene')
            .setDesc('Open this scene when item is used (e.g. a key that unlocks a room)')
            .addDropdown(dd => {
                dd.addOption('', '- none -');
                for (const s of allScenesForItem) {
                    dd.addOption(s.name, s.name);
                }
                dd.setValue(this.item.navigatesToScene ?? '');
                dd.onChange(v => { this.item.navigatesToScene = v || undefined; });
            });

        const locWrap = campaignBody.createDiv();
        new Setting(locWrap)
            .setName('Can only be used at')
            .setDesc('Location name where this item can be used (empty = usable anywhere)')
            .addDropdown(dd => {
                dd.addOption('', '- anywhere -');
                for (const l of allLocsForItem) {
                    dd.addOption(l.name, l.name);
                }
                dd.setValue(this.item.useRequiresLocation ?? '');
                dd.onChange(v => { this.item.useRequiresLocation = v || undefined; });
            });

        new Setting(campaignBody)
            .setName('Requires flag to use')
            .setDesc('Session flag that must be set before this item can be used')
            .addText(t => {
                t.setPlaceholder('flag-name')
                    .setValue(this.item.useRequiresFlag ?? '')
                    .onChange(v => { this.item.useRequiresFlag = v.trim() || undefined; });
            });

        campaignBody.createEl('h4', { text: 'Advanced effects' });
        campaignBody.createEl('p', {
            cls: 'storyteller-modal-hint',
            text: 'Chain item effects into party state, faction standing, compendium reveals, scene jumps, and inventory changes.',
        });
        this.renderCampaignItemEffectsEditor(campaignBody, {
            scenes: allScenesForItem,
            characters: allCampaignChars,
            items: allItemsForEffects,
            groups: allGroupsForEffects,
            compendiumEntries: allCompendiumEntries,
        });

        // --- Action Buttons at bottom ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteItem'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteItem', this.item.name))) {
                        await this.onDelete!(this.item);
                        this.close();
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        
        buttonsSetting.addButton(btn => btn
            .setButtonText(t('cancel'))
            .onClick(() => this.close()));
            
        buttonsSetting.addButton(btn => btn
            .setButtonText(this.isNew ? t('createItem') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.item.name.trim()) {
                    new Notice(t('itemNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.item.description = this.item.description || '';
                this.item.history = this.item.history || '';
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.item.customFields = customFields;
                await this.onSubmit(this.item);
                this.close();
            }));
    }
    private createCampaignEffectId(): string {
        return `itemfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private ensureCampaignItemEffects(): CampaignItemEffect[] {
        if (!Array.isArray(this.item.campaignItemEffects)) {
            this.item.campaignItemEffects = [];
        }
        return this.item.campaignItemEffects;
    }

    private applyCampaignEffectDefaults(effect: CampaignItemEffect): void {
        if (!effect.id) effect.id = this.createCampaignEffectId();
        switch (effect.type) {
            case 'changeHp':
                effect.target ??= 'activeActor';
                effect.hpMode ??= 'heal';
                effect.amount ??= 1;
                break;
            case 'applyCondition':
                effect.target ??= 'activeActor';
                effect.conditionMode ??= 'add';
                break;
            case 'changeGroupStanding':
                effect.standingMode ??= 'adjust';
                effect.standingAmount ??= 1;
                break;
        }
    }

    private renderCampaignItemEffectsEditor(
        container: HTMLElement,
        options: {
            scenes: Scene[];
            characters: Character[];
            items: PlotItem[];
            groups: Group[];
            compendiumEntries: CompendiumEntry[];
        }
    ): void {
        const effects = this.ensureCampaignItemEffects();
        const list = container.createDiv('storyteller-campaign-effect-list');
        const footer = container.createDiv('storyteller-campaign-effect-footer');
        const addBtn = footer.createEl('button', { cls: 'mod-cta', text: 'Add effect' });
        addBtn.addEventListener('click', () => {
            effects.push({ id: this.createCampaignEffectId(), type: 'setFlag', flag: '' });
            render();
        });

        const render = () => {
            list.empty();
            if (effects.length === 0) {
                list.createDiv({
                    cls: 'storyteller-modal-hint storyteller-campaign-effect-empty',
                    text: 'No advanced effects yet. These stack with the simple campaign fields above.',
                });
                return;
            }

            effects.forEach((effect, index) => {
                this.applyCampaignEffectDefaults(effect);
                this.renderCampaignItemEffectRow(list, effect, index, effects, options, render);
            });
        };

        render();
    }

    private renderCampaignItemEffectRow(
        container: HTMLElement,
        effect: CampaignItemEffect,
        index: number,
        effects: CampaignItemEffect[],
        options: {
            scenes: Scene[];
            characters: Character[];
            items: PlotItem[];
            groups: Group[];
            compendiumEntries: CompendiumEntry[];
        },
        rerender: () => void
    ): void {
        const row = container.createDiv('storyteller-campaign-effect-row');
        const header = row.createDiv('storyteller-campaign-effect-header');
        header.createSpan({ cls: 'storyteller-campaign-effect-title', text: `Effect ${index + 1}` });

        const headerActions = header.createDiv('storyteller-campaign-effect-header-actions');
        const upBtn = headerActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Move effect up' } });
        setIcon(upBtn, 'arrow-up');
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => {
            if (index === 0) return;
            [effects[index - 1], effects[index]] = [effects[index], effects[index - 1]];
            rerender();
        });

        const downBtn = headerActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Move effect down' } });
        setIcon(downBtn, 'arrow-down');
        downBtn.disabled = index >= (effects.length - 1);
        downBtn.addEventListener('click', () => {
            if (index >= (effects.length - 1)) return;
            [effects[index], effects[index + 1]] = [effects[index + 1], effects[index]];
            rerender();
        });

        const deleteBtn = headerActions.createEl('button', { cls: 'clickable-icon mod-warning', attr: { 'aria-label': 'Delete effect' } });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => {
            effects.splice(index, 1);
            rerender();
        });

        new Setting(row)
            .setName('Effect type')
            .addDropdown(dd => {
                const effectTypes: Array<{ value: CampaignItemEffectType; label: string }> = [
                    { value: 'setFlag', label: 'Set flag' },
                    { value: 'clearFlag', label: 'Clear flag' },
                    { value: 'addItem', label: 'Add item' },
                    { value: 'removeItem', label: 'Remove item' },
                    { value: 'navigateScene', label: 'Navigate to scene' },
                    { value: 'changeHp', label: 'Change HP' },
                    { value: 'applyCondition', label: 'Apply condition' },
                    { value: 'revealCompendium', label: 'Reveal compendium' },
                    { value: 'changeGroupStanding', label: 'Change group standing' }
                ];
                effectTypes.forEach(item => dd.addOption(item.value, item.label));
                dd.setValue(effect.type);
                dd.onChange(value => {
                    effect.type = value as CampaignItemEffectType;
                    this.applyCampaignEffectDefaults(effect);
                    rerender();
                });
            });

        switch (effect.type) {
            case 'setFlag':
            case 'clearFlag':
                new Setting(row)
                    .setName('Flag')
                    .setDesc('Session flag name')
                    .addText(text => {
                        text.setPlaceholder('flag-name')
                            .setValue(effect.flag ?? '')
                            .onChange(value => {
                                effect.flag = value.trim() || undefined;
                            });
                    });
                break;
            case 'addItem':
            case 'removeItem':
                new Setting(row)
                    .setName('Item')
                    .setDesc('Inventory item to add or remove')
                    .addDropdown(dd => {
                        dd.addOption('', '— select item —');
                        options.items.forEach(item => dd.addOption(item.id || item.name, item.name));
                        dd.setValue(effect.itemId ?? effect.itemName ?? '');
                        dd.onChange(value => {
                            const selected = options.items.find(item => (item.id || item.name) === value);
                            effect.itemId = selected?.id || undefined;
                            effect.itemName = selected?.name || undefined;
                        });
                    });
                break;
            case 'navigateScene':
                new Setting(row)
                    .setName('Scene')
                    .setDesc('Scene to open when this effect runs')
                    .addDropdown(dd => {
                        dd.addOption('', '— select scene —');
                        options.scenes.forEach(scene => dd.addOption(scene.id || scene.name, scene.name));
                        dd.setValue(effect.sceneId ?? effect.sceneName ?? '');
                        dd.onChange(value => {
                            const selected = options.scenes.find(scene => (scene.id || scene.name) === value);
                            effect.sceneId = selected?.id || undefined;
                            effect.sceneName = selected?.name || undefined;
                        });
                    });
                break;
            case 'changeHp':
                new Setting(row)
                    .setName('Target')
                    .setDesc('Who this HP change applies to')
                    .addDropdown(dd => {
                        const targets: Array<{ value: CampaignEffectTarget; label: string }> = [
                            { value: 'activeActor', label: 'Active actor' },
                            { value: 'itemOwner', label: 'Item owner' },
                            { value: 'allParty', label: 'All party members' },
                            { value: 'specificCharacter', label: 'Specific character' }
                        ];
                        targets.forEach(target => dd.addOption(target.value, target.label));
                        dd.setValue(effect.target ?? 'activeActor');
                        dd.onChange(value => {
                            effect.target = value as CampaignEffectTarget;
                            rerender();
                        });
                    })
                    .addDropdown(dd => {
                        dd.addOption('heal', 'Heal');
                        dd.addOption('damage', 'Damage');
                        dd.addOption('set', 'Set HP');
                        dd.setValue(effect.hpMode ?? 'heal');
                        dd.onChange(value => {
                            effect.hpMode = value as CampaignItemEffect['hpMode'];
                        });
                    })
                    .addText(text => {
                        text.inputEl.type = 'number';
                        text.setPlaceholder('1')
                            .setValue(String(effect.amount ?? 1))
                            .onChange(value => {
                                const parsed = Number(value);
                                effect.amount = Number.isFinite(parsed) ? parsed : undefined;
                            });
                    });
                if (effect.target === 'specificCharacter') {
                    new Setting(row)
                        .setName('Character')
                        .addDropdown(dd => {
                            dd.addOption('', '— select character —');
                            options.characters.forEach(character => dd.addOption(character.id || character.name, character.name));
                            dd.setValue(effect.characterId ?? effect.characterName ?? '');
                            dd.onChange(value => {
                                const selected = options.characters.find(character => (character.id || character.name) === value);
                                effect.characterId = selected?.id || undefined;
                                effect.characterName = selected?.name || undefined;
                            });
                        });
                }
                break;
            case 'applyCondition':
                new Setting(row)
                    .setName('Target')
                    .setDesc('Who this condition change applies to')
                    .addDropdown(dd => {
                        const targets: Array<{ value: CampaignEffectTarget; label: string }> = [
                            { value: 'activeActor', label: 'Active actor' },
                            { value: 'itemOwner', label: 'Item owner' },
                            { value: 'allParty', label: 'All party members' },
                            { value: 'specificCharacter', label: 'Specific character' }
                        ];
                        targets.forEach(target => dd.addOption(target.value, target.label));
                        dd.setValue(effect.target ?? 'activeActor');
                        dd.onChange(value => {
                            effect.target = value as CampaignEffectTarget;
                            rerender();
                        });
                    })
                    .addDropdown(dd => {
                        dd.addOption('add', 'Add');
                        dd.addOption('remove', 'Remove');
                        dd.setValue(effect.conditionMode ?? 'add');
                        dd.onChange(value => {
                            effect.conditionMode = value as CampaignItemEffect['conditionMode'];
                        });
                    })
                    .addText(text => {
                        text.setPlaceholder('Condition')
                            .setValue(effect.condition ?? '')
                            .onChange(value => {
                                effect.condition = value.trim() || undefined;
                            });
                    });
                if (effect.target === 'specificCharacter') {
                    new Setting(row)
                        .setName('Character')
                        .addDropdown(dd => {
                            dd.addOption('', '— select character —');
                            options.characters.forEach(character => dd.addOption(character.id || character.name, character.name));
                            dd.setValue(effect.characterId ?? effect.characterName ?? '');
                            dd.onChange(value => {
                                const selected = options.characters.find(character => (character.id || character.name) === value);
                                effect.characterId = selected?.id || undefined;
                                effect.characterName = selected?.name || undefined;
                            });
                        });
                }
                break;
            case 'revealCompendium':
                new Setting(row)
                    .setName('Entry')
                    .setDesc('Compendium entry to reveal in Campaign lore')
                    .addDropdown(dd => {
                        dd.addOption('', '— select entry —');
                        options.compendiumEntries.forEach(entry => dd.addOption(entry.id || entry.name, entry.name));
                        dd.setValue(effect.compendiumEntryId ?? effect.compendiumEntryName ?? '');
                        dd.onChange(value => {
                            const selected = options.compendiumEntries.find(entry => (entry.id || entry.name) === value);
                            effect.compendiumEntryId = selected?.id || undefined;
                            effect.compendiumEntryName = selected?.name || undefined;
                        });
                    });
                break;
            case 'changeGroupStanding':
                new Setting(row)
                    .setName('Group')
                    .setDesc('Faction or group affected by this item')
                    .addDropdown(dd => {
                        dd.addOption('', '— select group —');
                        options.groups.forEach(group => dd.addOption(group.id || group.name, group.name));
                        dd.setValue(effect.groupId ?? effect.groupName ?? '');
                        dd.onChange(value => {
                            const selected = options.groups.find(group => (group.id || group.name) === value);
                            effect.groupId = selected?.id || undefined;
                            effect.groupName = selected?.name || undefined;
                        });
                    });
                new Setting(row)
                    .setName('Standing change')
                    .setDesc('Adjust relative to the current value or set an exact value')
                    .addDropdown(dd => {
                        dd.addOption('adjust', 'Adjust');
                        dd.addOption('set', 'Set exact value');
                        dd.setValue(effect.standingMode ?? 'adjust');
                        dd.onChange(value => {
                            effect.standingMode = value as CampaignItemEffect['standingMode'];
                        });
                    })
                    .addText(text => {
                        text.inputEl.type = 'number';
                        text.setPlaceholder('1')
                            .setValue(String(effect.standingAmount ?? 1))
                            .onChange(value => {
                                const parsed = Number(value);
                                effect.standingAmount = Number.isFinite(parsed) ? parsed : undefined;
                            });
                    });
                break;
        }
    }
    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToItem(template: Template): Promise<void> {
        if (!template.entities.items || template.entities.items.length === 0) {
            new Notice('This template does not contain any items');
            return;
        }

        const templateItem = template.entities.items[0];
        await this.applyProcessedTemplateToItem(templateItem);
    }

    private async applyTemplateToItemWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.items || template.entities.items.length === 0) {
            new Notice('This template does not contain any items');
            return;
        }

        // Get the first item from the template
        let templateItem = template.entities.items[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateItem,
            variableValues,
            false // non-strict mode
        );
        templateItem = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[PlotItemModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToItem(templateItem);
    }

    private async applyProcessedTemplateToItem(templateItem: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateItem as any;

        let fields: any = { ...rest };
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[PlotItemModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[PlotItemModal] Failed to parse yamlContent:', error);
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
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }
                if ('Cultural Significance' in parsedSections) {
                    fields.culturalSignificance = parsedSections['Cultural Significance'];
                }
                if ('Magic Properties' in parsedSections) {
                    fields.magicProperties = parsedSections['Magic Properties'];
                }

                console.log('[PlotItemModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[PlotItemModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k as string] = v as string; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the item
        Object.assign(this.item, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.item, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        console.log('[PlotItemModal] Final item after template:', this.item);

        // Clear relationships as they reference template entities
        this.item.currentOwner = undefined;
        this.item.pastOwners = [];
        this.item.currentLocation = undefined;
        this.item.associatedEvents = [];
        this.item.groups = [];
        this.item.connections = [];
        this.item.magicSystems = [];
        this.item.linkedCharacters = [];
        this.item.linkedEconomies = [];
        this.item.linkedCultures = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose() {
        this.groupSelector.dispose();
        this.contentEl.empty();
    }
}





