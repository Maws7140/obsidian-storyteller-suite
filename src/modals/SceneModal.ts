/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Notice, Setting, TextAreaComponent, ButtonComponent, parseYaml } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { Scene } from '../types';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { SceneSuggestModal } from './SceneSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { GroupSuggestModal } from './GroupSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { getTrackedItemOwner } from '../utils/ItemOwnership';
import type { StoryMap } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

export type SceneModalSubmitCallback = (sc: Scene) => Promise<void>;
export type SceneModalDeleteCallback = (sc: Scene) => Promise<void>;

export class SceneModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;
    scene: Scene;
    onSubmit: SceneModalSubmitCallback;
    onDelete?: SceneModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, sc: Scene | null, onSubmit: SceneModalSubmitCallback, onDelete?: SceneModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = sc == null;
        this.scene = sc ? { ...sc } : { name: '', status: 'Draft', tags: [], linkedCharacters: [], linkedLocations: [], linkedEvents: [], linkedItems: [], linkedGroups: [] } as Scene;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-scene-modal');
    }

    async onOpen(): Promise<void> {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? t('createNewScene') : `${t('editScene')} ${this.scene.name}` });

        // Auto-apply default template for new scenes
        if (this.isNew && !this.scene.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['scene'];
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
                                            await this.applyTemplateToSceneWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[SceneModal] Error applying template:', error);
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
                            await this.applyTemplateToScene(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[SceneModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new scenes) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured scene template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a scene template')
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
                                                        await this.applyTemplateToSceneWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[SceneModal] Error applying template:', error);
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
                                    await this.applyTemplateToScene(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            },
                            'scene'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('sceneTitlePh'))
                .setValue(this.scene.name || '')
                .onChange(v => this.scene.name = v)
            );

        // Chapter selector
        const chapterSetting = new Setting(contentEl)
            .setName(t('chapter'))
            .setDesc(this.scene.chapterName || t('none'));
        chapterSetting.addDropdown(async dd => {
                dd.addOption('', 'Unassigned');
                const chapters = await this.plugin.listChapters();
                chapters.forEach(ch => dd.addOption(ch.id || ch.name, ch.number != null ? `${ch.number}. ${ch.name}` : ch.name));
                dd.setValue(this.scene.chapterId || '');
                dd.onChange((val) => {
                    if (!val) { this.scene.chapterId = undefined; this.scene.chapterName = undefined; }
                    else {
                        const picked = chapters.find(c => (c.id && c.id === val) || (!c.id && c.name === val));
                        this.scene.chapterId = picked?.id;
                        this.scene.chapterName = picked?.name;
                    }
                    chapterSetting.descEl.setText(this.scene.chapterName || t('none'));
                });
            });

        new Setting(contentEl)
            .setName('Date')
            .setDesc('Optional date to show this scene on the timeline (same format as events)')
            .addText(text => text
                .setPlaceholder('e.g. 2024-01-15 or Year 3, Day 12')
                .setValue(this.scene.date || '')
                .onChange(v => { this.scene.date = v.trim() || undefined; })
            );

        const campaignBoardSetting = new Setting(contentEl)
            .setName('Campaign board map')
            .setDesc('Optional image map override for Campaign mode. Leave empty to use the scene location map.');
        campaignBoardSetting.addDropdown(async dd => {
            dd.addOption('', 'Auto-detect from scene location');
            const maps = await this.plugin.listMaps().catch(() => [] as StoryMap[]);
            const imageMaps = maps
                .filter(map => (map.type ?? 'image') === 'image')
                .sort((a, b) => a.name.localeCompare(b.name));
            const updateCampaignBoardDesc = (value: string) => {
                const selected = imageMaps.find(map => (map.id || map.name) === value);
                campaignBoardSetting.descEl.setText(
                    selected
                        ? `Campaign mode will open "${selected.name}" for this scene.`
                        : 'Optional image map override for Campaign mode. Leave empty to use the scene location map.'
                );
            };
            for (const map of imageMaps) {
                const mapId = map.id || map.name;
                dd.addOption(mapId, map.name);
            }
            dd.setValue(this.scene.campaignBoardMapId || '');
            updateCampaignBoardDesc(this.scene.campaignBoardMapId || '');
            dd.onChange(value => {
                this.scene.campaignBoardMapId = value || undefined;
                updateCampaignBoardDesc(value);
            });
        });

        new Setting(contentEl)
            .setName(t('status'))
            .addDropdown(dd => dd
                .addOptions({ Draft: 'Draft', Outline: 'Outline', WIP: 'WIP', Revised: 'Revised', Final: 'Final' })
                .setValue(this.scene.status || 'Draft')
                .onChange(v => this.scene.status = v)
            );

        new Setting(contentEl)
            .setName(t('priorityInChapter'))
            .addText(text => text
                .setPlaceholder(t('priorityEg'))
                .setValue(this.scene.priority != null ? String(this.scene.priority) : '')
                .onChange(v => {
                    const n = parseInt(v, 10);
                    this.scene.priority = Number.isFinite(n) ? n : undefined;
                })
            );

        // POV character
        const povSetting = new Setting(contentEl)
            .setName('POV Character')
            .setDesc(this.scene.povCharacter || 'None');
        let setPovButton: ButtonComponent | null = null;
        let clearPovButton: ButtonComponent | null = null;
        const updatePovSetting = () => {
            povSetting.descEl.setText(this.scene.povCharacter || 'None');
            setPovButton?.setButtonText(this.scene.povCharacter ? 'Change' : 'Set POV');
            clearPovButton?.setDisabled(!this.scene.povCharacter);
        };
        povSetting
            .addButton(btn => {
                setPovButton = btn;
                btn.onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                        this.scene.povCharacter = ch.name;
                        updatePovSetting();
                    }).open();
                });
            })
            .addButton(btn => {
                clearPovButton = btn;
                btn
                    .setIcon('cross')
                    .setTooltip('Clear POV')
                    .onClick(() => {
                        this.scene.povCharacter = undefined;
                        updatePovSetting();
                    });
            });
        updatePovSetting();

        // Emotion
        new Setting(contentEl)
            .setName('Emotional tone')
            .addDropdown(dd => dd
                .addOptions({
                    '': '— none —',
                    tense: 'Tense',
                    joyful: 'Joyful',
                    sorrowful: 'Sorrowful',
                    mysterious: 'Mysterious',
                    hopeful: 'Hopeful',
                    fearful: 'Fearful',
                    angry: 'Angry',
                    romantic: 'Romantic',
                    melancholic: 'Melancholic',
                    neutral: 'Neutral',
                })
                .setValue(this.scene.emotion || '')
                .onChange(v => { this.scene.emotion = (v as any) || undefined; })
            );

        // Intensity
        new Setting(contentEl)
            .setName(`Intensity: ${this.scene.intensity ?? 0}`)
            .setDesc('Narrative intensity — calm (−10) to climactic (+10)')
            .addSlider(sl => sl
                .setLimits(-10, 10, 1)
                .setValue(this.scene.intensity ?? 0)
                .setDynamicTooltip()
                .onChange(v => {
                    this.scene.intensity = v;
                    sl.sliderEl.closest('.setting-item')?.querySelector('.setting-item-name')!
                        .setText(`Intensity: ${v}`);
                })
            );

        // Synopsis
        new Setting(contentEl)
            .setName('Synopsis')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(ta => {
                ta.setPlaceholder('One-line summary of this scene…')
                  .setValue(this.scene.synopsis || '')
                  .onChange(v => { this.scene.synopsis = v.trim() || undefined; });
                ta.inputEl.rows = 3;
            });

        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.scene.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.scene.tags = arr.length ? arr : undefined;
                })
            );

        // Image block
        let imageDescEl: HTMLElement | null = null;
        const profileImageSetting = new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: t('currentValue', this.scene.profileImagePath || t('none')) });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.scene.profileImagePath,
                onSelect: (path) => {
                    this.scene.profileImagePath = path;
                },
                descriptionEl: imageDescEl || undefined
            }
        );

        // Content
        new Setting(contentEl)
            .setName(t('content') || 'Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder(t('writeScenePh'))
                  .setValue(this.scene.content || '')
                  .onChange(v => this.scene.content = v || undefined);
                ta.inputEl.rows = 10;
            });

        // Beat sheet
        new Setting(contentEl)
            .setName(t('beatSheetOneLine'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                const value = (this.scene.beats || []).join('\n');
                ta.setPlaceholder(t('beatSheetPh'))
                  .setValue(value)
                  .onChange(v => {
                      const lines = v.split('\n').map(s => s.trim()).filter(Boolean);
                      this.scene.beats = lines.length ? lines : undefined;
                  });
                ta.inputEl.rows = 6;
            });

        // Linked entities
        contentEl.createEl('h3', { text: t('links') });

        const charactersSetting = new Setting(contentEl)
            .setName(t('characters'));
        const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(charactersListEl, this.scene.linkedCharacters, 'characters');
        charactersSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new CharacterSuggestModal(this.app, this.plugin, (ch) => {
                if (!Array.isArray(this.scene.linkedCharacters)) this.scene.linkedCharacters = [];
                if (!this.scene.linkedCharacters.includes(ch.name)) this.scene.linkedCharacters.push(ch.name);
                this.renderLinkedEntities(charactersListEl, this.scene.linkedCharacters, 'characters');
            }).open();
        }));

        const locationsSetting = new Setting(contentEl)
            .setName(t('locations'));
        const locationsListEl = locationsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(locationsListEl, this.scene.linkedLocations, 'locations');
        locationsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new LocationSuggestModal(this.app, this.plugin, (loc) => {
                if (!loc) return;
                if (!Array.isArray(this.scene.linkedLocations)) this.scene.linkedLocations = [];
                if (!this.scene.linkedLocations.includes(loc.name)) this.scene.linkedLocations.push(loc.name);
                this.renderLinkedEntities(locationsListEl, this.scene.linkedLocations, 'locations');
            }).open();
        }));

        const eventsSetting = new Setting(contentEl)
            .setName(t('events'));
        const eventsListEl = eventsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(eventsListEl, this.scene.linkedEvents, 'events');
        eventsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new EventSuggestModal(this.app, this.plugin, (evt) => {
                if (!Array.isArray(this.scene.linkedEvents)) this.scene.linkedEvents = [];
                if (!this.scene.linkedEvents.includes(evt.name)) this.scene.linkedEvents.push(evt.name);
                this.renderLinkedEntities(eventsListEl, this.scene.linkedEvents, 'events');
            }).open();
        }));

        const itemsSetting = new Setting(contentEl)
            .setName(t('items'));
        const itemsListEl = itemsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(itemsListEl, this.scene.linkedItems, 'items');
        itemsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(async () => {
            const { PlotItemSuggestModal } = await import('./PlotItemSuggestModal');
            new PlotItemSuggestModal(this.app, this.plugin, async (item) => {
                const characters = await this.plugin.listCharacters().catch(() => []);
                const trackedOwner = getTrackedItemOwner(item, characters);
                if (trackedOwner) {
                    new Notice(
                        `${item.name} is currently in ${trackedOwner}'s inventory. ` +
                        `You can still link it to this scene, but ownership remains tracked on the character.`,
                        7000
                    );
                }
                if (!Array.isArray(this.scene.linkedItems)) this.scene.linkedItems = [];
                if (!this.scene.linkedItems.includes(item.name)) this.scene.linkedItems.push(item.name);
                this.renderLinkedEntities(itemsListEl, this.scene.linkedItems, 'items');
            }).open();
        }));

        const groupsSetting = new Setting(contentEl)
            .setName(t('groups'));
        const groupsListEl = groupsSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(groupsListEl, this.scene.linkedGroups, 'groups');
        groupsSetting.addButton(btn => btn.setButtonText(t('add')).onClick(() => {
            new GroupSuggestModal(this.app, this.plugin, (g) => {
                if (!Array.isArray(this.scene.linkedGroups)) this.scene.linkedGroups = [];
                if (!this.scene.linkedGroups.includes(g.id)) this.scene.linkedGroups.push(g.id);
                this.renderLinkedEntities(groupsListEl, this.scene.linkedGroups, 'groups');
            }).open();
        }));

        // Setup / Payoff scene links
        contentEl.createEl('h3', { text: 'Setup & Payoff' });

        const setupSetting = new Setting(contentEl)
            .setName('Sets up scenes')
            .setDesc('This scene plants seeds paid off by these scenes');
        const setupListEl = setupSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(setupListEl, this.scene.setupScenes, 'setupScenes');
        setupSetting.addButton(btn => btn.setButtonText('Add').onClick(() => {
            new SceneSuggestModal(this.app, this.plugin, (sc) => {
                if (!Array.isArray(this.scene.setupScenes)) this.scene.setupScenes = [];
                if (!this.scene.setupScenes.includes(sc.name)) this.scene.setupScenes.push(sc.name);
                this.renderLinkedEntities(setupListEl, this.scene.setupScenes, 'setupScenes');
            }).open();
        }));

        const payoffSetting = new Setting(contentEl)
            .setName('Paid off by scenes')
            .setDesc('These scenes resolve what this scene foreshadows');
        const payoffListEl = payoffSetting.controlEl.createDiv('storyteller-modal-linked-entities');
        this.renderLinkedEntities(payoffListEl, this.scene.payoffScenes, 'payoffScenes');
        payoffSetting.addButton(btn => btn.setButtonText('Add').onClick(() => {
            new SceneSuggestModal(this.app, this.plugin, (sc) => {
                if (!Array.isArray(this.scene.payoffScenes)) this.scene.payoffScenes = [];
                if (!this.scene.payoffScenes.includes(sc.name)) this.scene.payoffScenes.push(sc.name);
                this.renderLinkedEntities(payoffListEl, this.scene.payoffScenes, 'payoffScenes');
            }).open();
        }));

        // --- Branches section (only shown for existing scenes that have a file) ---
        if (!this.isNew && this.scene.filePath) {
            const branchesContainer = contentEl.createDiv('storyteller-branches-section-host');
            this.renderBranchesSection(branchesContainer);
        }

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('delete'), async () => {
                if (this.scene.filePath && confirm(t('confirmDeleteScene', this.scene.name))) {
                    await this.onDelete!(this.scene);
                    this.close();
                }
            }, { warning: true });
        }
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        this.createFooterButton(footerEl, t('cancel'), () => this.close());
        this.createFooterButton(footerEl, this.isNew ? t('createSceneBtn') : t('saveChanges'), async () => {
            if (!this.scene.name || !this.scene.name.trim()) {
                new Notice(t('sceneNameRequired'));
                return;
            }
            this.scene.content = this.scene.content || '';
            this.scene.beats = this.scene.beats || [];
            await this.onSubmit(this.scene);
            this.close();
        }, { cta: true });
    }

    // Helper method to render linked entities with individual delete buttons
    renderLinkedEntities(container: HTMLElement, items: string[] | undefined, entityType: string): void {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            return;
        }
        
        items.forEach((item, index) => {
            const itemEl = container.createDiv('storyteller-modal-list-item');
            itemEl.createSpan({ text: item });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${item}`)
                .setIcon('cross')
                .onClick(() => {
                    // Remove the item from the appropriate array
                    switch (entityType) {
                        case 'characters':
                            if (this.scene.linkedCharacters) {
                                this.scene.linkedCharacters.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedCharacters, entityType);
                            }
                            break;
                        case 'locations':
                            if (this.scene.linkedLocations) {
                                this.scene.linkedLocations.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedLocations, entityType);
                            }
                            break;
                        case 'events':
                            if (this.scene.linkedEvents) {
                                this.scene.linkedEvents.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedEvents, entityType);
                            }
                            break;
                        case 'items':
                            if (this.scene.linkedItems) {
                                this.scene.linkedItems.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedItems, entityType);
                            }
                            break;
                        case 'groups':
                            if (this.scene.linkedGroups) {
                                this.scene.linkedGroups.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.linkedGroups, entityType);
                            }
                            break;
                        case 'setupScenes':
                            if (this.scene.setupScenes) {
                                this.scene.setupScenes.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.setupScenes, entityType);
                            }
                            break;
                        case 'payoffScenes':
                            if (this.scene.payoffScenes) {
                                this.scene.payoffScenes.splice(index, 1);
                                this.renderLinkedEntities(container, this.scene.payoffScenes, entityType);
                            }
                            break;
                    }
                });
        });
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.scenes?.length) entityCount += template.entities.scenes.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToScene(template: Template): Promise<void> {
        if (!template.entities.scenes || template.entities.scenes.length === 0) {
            new Notice('This template does not contain any scenes');
            return;
        }

        const templateScene = template.entities.scenes[0];
        await this.applyProcessedTemplateToScene(templateScene);
    }

    private async applyTemplateToSceneWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.scenes || template.entities.scenes.length === 0) {
            new Notice('This template does not contain any scenes');
            return;
        }

        // Get the first scene from the template
        let templateScene = template.entities.scenes[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateScene,
            variableValues,
            false // non-strict mode
        );
        templateScene = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[SceneModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToScene(templateScene);
    }

    private async applyProcessedTemplateToScene(templateScene: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, chapterId, chapterName, ...rest } = templateScene as any;

        let fields: any = { ...rest };
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[SceneModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[SceneModal] Failed to parse yamlContent:', error);
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
                if ('Content' in parsedSections) {
                    fields.content = parsedSections['Content'];
                }
                if ('Beat Sheet' in parsedSections) {
                    // Parse beat sheet as array
                    const beatText = parsedSections['Beat Sheet'];
                    if (beatText) {
                        fields.beats = beatText.split('\n').map(s => s.trim()).filter(Boolean);
                    }
                }
                console.log('[SceneModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[SceneModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k as string] = v as string; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the scene
        Object.assign(this.scene, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.scene, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        console.log('[SceneModal] Final scene after template:', this.scene);

        // Clear relationships as they reference template entities
        this.scene.linkedCharacters = [];
        this.scene.linkedLocations = [];
        this.scene.linkedEvents = [];
        this.scene.linkedItems = [];
        this.scene.linkedGroups = [];
    }

    private renderBranchesSection(container: HTMLElement): void {
        container.empty();
        const section = container.createDiv('storyteller-branches-section');
        const hdr = section.createDiv('storyteller-branches-section-header');
        const iconSpan = hdr.createSpan();
        import('obsidian').then(({ setIcon }) => setIcon(iconSpan, 'git-branch'));
        hdr.createSpan({ text: ' Branches' });

        const summaryEl = section.createDiv('storyteller-branches-summary');

        // Load branches from the scene file asynchronously
        if (this.scene.filePath) {
            const { TFile } = require('obsidian') as typeof import('obsidian');
            const file = this.app.vault.getAbstractFileByPath(this.scene.filePath);
            if (file instanceof TFile) {
                this.app.vault.cachedRead(file).then(content => {
                    import('../utils/BranchParser').then(({ extractBranchesFromMarkdown }) => {
                        const branches = extractBranchesFromMarkdown(content);
                        summaryEl.empty();
                        if (branches.length === 0) {
                            summaryEl.createEl('p', { cls: 'storyteller-modal-list-empty', text: 'No branches defined.' });
                        } else {
                            for (const b of branches) {
                                const row = summaryEl.createDiv('storyteller-branch-summary-row');
                                row.createSpan({ text: b.label });
                                if (b.target) row.createSpan({ cls: 'storyteller-branch-summary-target', text: ` → ${b.target}` });
                                if (b.dice) row.createSpan({ cls: 'storyteller-branch-dice-tag', text: ` 🎲${b.dice}` });
                                if (b.requiresItem) row.createSpan({ cls: 'storyteller-branch-item-tag', text: ` 🔑${b.requiresItem}` });
                            }
                        }
                    });
                });
            }
        }

        new Setting(section)
            .addButton(btn => btn
                .setButtonText('Edit Branches & Encounter Table')
                .setIcon('pencil')
                .onClick(() => {
                    import('./BranchEditorModal').then(({ BranchEditorModal }) => {
                        new BranchEditorModal(this.app, this.plugin, this.scene.filePath!, () => {
                            this.renderBranchesSection(container);
                        }).open();
                    });
                })
            );
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose(): void { this.contentEl.empty(); }
}


