/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, TextAreaComponent, parseYaml, setIcon } from 'obsidian';
import { PlotItem, Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { t } from '../i18n/strings';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PromptModal } from './ui/PromptModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

export type PlotItemModalSubmitCallback = (item: PlotItem) => Promise<void>;
export type PlotItemModalDeleteCallback = (item: PlotItem) => Promise<void>;

export class PlotItemModal extends Modal {
    item: PlotItem;
    plugin: StorytellerSuitePlugin;
    onSubmit: PlotItemModalSubmitCallback;
    onDelete?: PlotItemModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;

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

        this.item = initialItem;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-item-modal');
    }

    async onOpen() {
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
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);


        // --- Custom Fields ---
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Do not render existing custom fields in the modal to avoid duplication with note page
        if (!this.item.customFields) this.item.customFields = {};
        new Setting(contentEl)
            .addButton(b => b
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    const fields = this.item.customFields!;
                    const reserved = new Set<string>([...getWhitelistKeys('item'), 'customFields', 'filePath', 'id', 'sections']);
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: t('customFieldValueTitle'),
                            label: t('valueForX', key),
                            defaultValue: '',
                            onSubmit: (val: string) => { fields[key] = val; }
                        }).open();
                    };
                    new PromptModal(this.app, {
                        title: t('newCustomFieldTitle'),
                        label: t('fieldName'),
                        defaultValue: '',
                        validator: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed) return t('fieldNameCannotBeEmpty');
                            if (reserved.has(trimmed)) return t('thatNameIsReserved');
                            const exists = Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return t('fieldAlreadyExists');
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
                }));
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
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-tag-btn' });
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
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-tag-btn' });
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
                dd.addOption('', '— select character —');
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
                dd.addOption('', '— select magic system —');
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
                dd.addOption('', '— select economy —');
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
                dd.addOption('', '— select culture —');
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
            this.item.navigatesToScene || this.item.useRequiresLocation || this.item.useRequiresFlag
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
                dd.addOption('', '— none —');
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
                dd.addOption('', '— none —');
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

        // Navigates-to-scene dropdown
        const sceneWrap = campaignBody.createDiv();
        const allScenesForItem = await this.plugin.listScenes().catch(() => [] as import('../types').Scene[]);
        new Setting(sceneWrap)
            .setName('Navigates to scene')
            .setDesc('Open this scene when item is used (e.g. a key that unlocks a room)')
            .addDropdown(dd => {
                dd.addOption('', '— none —');
                for (const s of allScenesForItem.sort((a, b) => a.name.localeCompare(b.name))) {
                    dd.addOption(s.name, s.name);
                }
                dd.setValue(this.item.navigatesToScene ?? '');
                dd.onChange(v => { this.item.navigatesToScene = v || undefined; });
            });

        // Requires-location dropdown
        const locWrap = campaignBody.createDiv();
        const allLocsForItem = await this.plugin.listLocations().catch(() => [] as import('../types').Location[]);
        new Setting(locWrap)
            .setName('Can only be used at')
            .setDesc('Location name where this item can be used (empty = usable anywhere)')
            .addDropdown(dd => {
                dd.addOption('', '— anywhere —');
                for (const l of allLocsForItem.sort((a, b) => a.name.localeCompare(b.name))) {
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
                await this.onSubmit(this.item);
                this.close();
            }));
    }
    renderGroupSelector(container: HTMLElement) {
        container.empty();
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.item.id || this.item.name;
            const freshList = await this.plugin.listPlotItems();
            const fresh = freshList.find(i => (i.id || i.name) === identifier);
            const current = new Set((fresh?.groups || this.item.groups || []) as string[]);
            this.item.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName(t('groups'))
                .setDesc(t('assignItemToGroupsDesc'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
                    allGroups.forEach(group => dropdown.addOption(group.id, group.name));
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.item.groups = Array.from(selectedGroupIds);
                            const itemId = this.item.id || this.item.name;
                            await this.plugin.addMemberToGroup(value, 'item', itemId);
                            this.renderGroupSelector(container);
                        }
                    });
                });
            if (selectedGroupIds.size > 0) {
                const selectedDiv = container.createDiv('selected-groups');
                allGroups.filter(g => selectedGroupIds.has(g.id)).forEach(group => {
                    const tag = selectedDiv.createSpan({ text: group.name, cls: 'group-tag' });
                    const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                    removeBtn.onclick = async () => {
                        selectedGroupIds.delete(group.id);
                        this.item.groups = Array.from(selectedGroupIds);
                        const itemId = this.item.id || this.item.name;
                        await this.plugin.removeMemberFromGroup(group.id, 'item', itemId);
                        this.renderGroupSelector(container);
                    };
                });
            }
        })();
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
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}
