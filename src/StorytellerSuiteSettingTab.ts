import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';
import { FolderSuggestModal } from './modals/FolderSuggestModal';
import { CustomSheetTemplateModal } from './modals/CustomSheetTemplateModal';
import { BUILT_IN_SHEET_TEMPLATES } from './utils/CharacterSheetTemplates';
import { setLocale, t, getAvailableLanguages, getLanguageName, isLanguageAvailable } from './i18n/strings';

type TabId = 'stories' | 'dashboard' | 'folders' | 'timeline' | 'maps' | 'templates' | 'gallery' | 'help';

interface TabDef { id: TabId; icon: string; label: string; }

export class StorytellerSuiteSettingTab extends PluginSettingTab {
    plugin: StorytellerSuitePlugin;
    private activeTab: TabId = 'stories';

    private readonly TABS: TabDef[] = [
        { id: 'stories',   icon: 'book-open',       label: 'Stories'   },
        { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
        { id: 'folders',   icon: 'folder',           label: 'Folders'   },
        { id: 'timeline',  icon: 'clock',            label: 'Timeline'  },
        { id: 'maps',      icon: 'map',              label: 'Maps'      },
        { id: 'templates', icon: 'file-text',        label: 'Templates' },
        { id: 'gallery',   icon: 'image',            label: 'Gallery'   },
        { id: 'help',      icon: 'circle-help',      label: 'Help'      },
    ];

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('sts-settings-root');

        const wrapper = containerEl.createDiv('sts-settings-wrapper');
        const nav     = wrapper.createDiv('sts-settings-nav');
        const content = wrapper.createDiv('sts-settings-content');

        const tabBtns: HTMLElement[] = [];
        this.TABS.forEach(tab => {
            const btn = nav.createDiv('sts-settings-tab-btn');
            if (this.activeTab === tab.id) btn.addClass('is-active');
            setIcon(btn.createSpan('sts-tab-icon'), tab.icon);
            btn.createSpan('sts-tab-label').setText(tab.label);
            tabBtns.push(btn);
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                this.activeTab = tab.id;
                content.empty();
                this.renderTab(tab.id, content);
            });
        });

        this.renderTab(this.activeTab, content);
    }

    private renderTab(tabId: TabId, container: HTMLElement): void {
        switch (tabId) {
            case 'stories':   this.renderStoriesTab(container);   break;
            case 'dashboard': this.renderDashboardTab(container); break;
            case 'folders':   this.renderFoldersTab(container);   break;
            case 'timeline':  this.renderTimelineTab(container);  break;
            case 'maps':      this.renderMapsTab(container);      break;
            case 'templates': this.renderTemplatesTab(container); break;
            case 'gallery':   this.renderGalleryTab(container);   break;
            case 'help':      this.renderHelpTab(container);      break;
        }
    }

    // ─── Utility: inline info toggle ─────────────────────────────────────────
    private addInfoToggle(setting: Setting, infoText: string): void {
        const panel = setting.settingEl.createDiv('sts-info-panel');
        panel.setText(infoText);
        panel.addClass('is-hidden');
        setting.addExtraButton(btn => btn
            .setIcon('info')
            .setTooltip('More info')
            .onClick(() => panel.toggleClass('is-hidden', !panel.hasClass('is-hidden')))
        );
    }

    // ─── Utility: folder path setting ────────────────────────────────────────
    private addFolderPathSetting(
        container: HTMLElement,
        name: string,
        desc: string,
        getValue: () => string,
        setValue: (v: string) => void,
        placeholder = ''
    ): Setting {
        return new Setting(container)
            .setName(name)
            .setDesc(desc)
            .addText(text => {
                const comp = text
                    .setPlaceholder(placeholder)
                    .setValue(getValue())
                    .onChange(async (value) => {
                        setValue(value);
                        await this.plugin.saveSettings();
                    });
                let suppress = false;
                const openSuggest = () => {
                    if (suppress) return;
                    new FolderSuggestModal(
                        this.app,
                        async (folderPath) => {
                            setValue(folderPath);
                            comp.setValue(folderPath);
                            await this.plugin.saveSettings();
                        },
                        () => {
                            suppress = true;
                            setTimeout(() => { suppress = false; }, 300);
                            setTimeout(() => comp.inputEl.focus(), 0);
                        }
                    ).open();
                };
                comp.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === ' ')) {
                        e.preventDefault();
                        openSuggest();
                    }
                });
                comp.inputEl.addEventListener('focus', openSuggest);
                comp.inputEl.addEventListener('click', openSuggest);
                return comp;
            });
    }

    // ─── Tab: Stories ─────────────────────────────────────────────────────────
    private renderStoriesTab(container: HTMLElement): void {
        new Setting(container)
            .setName(t('language'))
            .setDesc(t('selectLanguage'))
            .addDropdown(dropdown => {
                const availableLanguages = getAvailableLanguages();
                availableLanguages.forEach(lang => dropdown.addOption(lang, getLanguageName(lang)));
                const currentLang = isLanguageAvailable(this.plugin.settings.language)
                    ? this.plugin.settings.language : 'en';
                dropdown.setValue(currentLang);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                    setLocale(value);
                    new Notice(t('languageChanged'));
                    this.display();
                });
            });

        new Setting(container).setName(t('stories')).setHeading();

        this.plugin.settings.stories.forEach(story => {
            const isActive = this.plugin.settings.activeStoryId === story.id;
            new Setting(container)
                .setName(story.name)
                .setDesc(story.description || '')
                .addButton(btn => btn
                    .setButtonText(isActive ? t('active') : t('setActive'))
                    .setCta()
                    .setDisabled(isActive)
                    .onClick(async () => {
                        await this.plugin.setActiveStory(story.id);
                        this.display();
                    })
                )
                .addExtraButton(btn => btn
                    .setIcon('pencil')
                    .setTooltip(t('editStory'))
                    .onClick(async () => {
                        const existingNames = this.plugin.settings.stories.map(s => s.name);
                        new EditStoryModal(
                            this.app, this.plugin, story, existingNames,
                            async (name: string, description?: string) => {
                                await this.plugin.updateStory(story.id, name, description);
                                this.display();
                            }
                        ).open();
                    })
                )
                .addExtraButton(btn => btn
                    .setIcon('trash')
                    .setTooltip(t('delete'))
                    .onClick(async () => {
                        if (confirm(t('confirmDeleteStory', story.name))) {
                            this.plugin.settings.stories = this.plugin.settings.stories.filter(s => s.id !== story.id);
                            if (this.plugin.settings.activeStoryId === story.id) {
                                this.plugin.settings.activeStoryId = this.plugin.settings.stories[0]?.id || '';
                            }
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    })
                );
        });

        new Setting(container)
            .addButton(btn => btn
                .setButtonText(t('createNewStory'))
                .setCta()
                .onClick(async () => {
                    const existingNames = this.plugin.settings.stories.map(s => s.name);
                    new NewStoryModal(
                        this.app, this.plugin, existingNames,
                        async (name: string, description?: string) => {
                            await this.plugin.createStory(name, description);
                            this.display();
                        }
                    ).open();
                })
            );

        new Setting(container)
            .setName(t('storyDiscovery'))
            .setDesc(t('scanVaultDesc'))
            .addButton(btn => btn
                .setButtonText(t('refreshDiscovery'))
                .setTooltip(t('scanVaultDesc'))
                .onClick(async () => {
                    btn.setDisabled(true);
                    try {
                        await this.plugin.refreshStoryDiscovery();
                    } finally {
                        btn.setDisabled(false);
                        this.display();
                    }
                })
            );
    }

    // ─── Tab: Dashboard ───────────────────────────────────────────────────────
    private renderDashboardTab(container: HTMLElement): void {
        new Setting(container).setName('Writing Goal').setHeading();

        new Setting(container)
            .setName('Daily writing goal')
            .setDesc('Number of words to write per day. Set to 0 to hide the goal banner.')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(String(this.plugin.settings.dailyWordCountGoal ?? 0))
                .onChange(async (value) => {
                    const n = parseInt(value, 10);
                    const goal = isNaN(n) || n < 0 ? 0 : n;
                    if (this.plugin.wordTracker) {
                        this.plugin.wordTracker.setDailyGoal(goal);
                    } else {
                        this.plugin.settings.dailyWordCountGoal = goal;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(container).setName(t('dashboardTabVisibility')).setHeading();
        new Setting(container).setDesc(t('dashboardTabVisibilityDesc'));

        const availableTabs = [
            { id: 'characters',   name: t('characters') },
            { id: 'locations',    name: t('locations') },
            { id: 'events',       name: t('timeline') },
            { id: 'items',        name: t('items') },
            { id: 'network',      name: t('networkGraph') },
            { id: 'gallery',      name: t('gallery') },
            { id: 'groups',       name: t('groups') },
            { id: 'references',   name: t('references') },
            { id: 'chapters',     name: t('chapters') },
            { id: 'scenes',       name: t('scenes') },
            { id: 'cultures',     name: t('cultures') },
            { id: 'economies',    name: t('economies') },
            { id: 'magicsystems', name: t('magicSystems') },
            { id: 'templates',    name: t('templates') }
        ];

        availableTabs.forEach(tab => {
            const hiddenTabs = this.plugin.settings.hiddenDashboardTabs || [];
            const isVisible = !hiddenTabs.includes(tab.id);
            new Setting(container)
                .setName(tab.name)
                .addToggle(toggle => toggle
                    .setValue(isVisible)
                    .setTooltip(isVisible ? t('tabIsVisible') : t('tabIsHidden'))
                    .onChange(async (value) => {
                        const hidden = this.plugin.settings.hiddenDashboardTabs || [];
                        if (value) {
                            this.plugin.settings.hiddenDashboardTabs = hidden.filter(id => id !== tab.id);
                        } else {
                            if (!hidden.includes(tab.id)) {
                                this.plugin.settings.hiddenDashboardTabs = [...hidden, tab.id];
                            }
                        }
                        await this.plugin.saveSettings();
                        const noticeText = value ? t('tabShown', tab.name) : t('tabHidden', tab.name);
                        new Notice(noticeText + t('refreshDashboardToSeeChanges'));
                    })
                );
        });
    }

    // ─── Tab: Folders ─────────────────────────────────────────────────────────
    private renderFoldersTab(container: HTMLElement): void {
        // ── Custom entity folders ──
        new Setting(container).setName(t('useCustomEntityFolders')).setHeading();

        const customToggleSetting = new Setting(container)
            .setName(t('useCustomEntityFolders'))
            .setDesc(t('useCustomFoldersDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCustomEntityFolders)
                .onChange(async (value) => {
                    this.plugin.settings.enableCustomEntityFolders = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        await this.plugin.autoDetectCustomEntityFolders();
                        const paths = [
                            this.plugin.settings.storyRootFolderTemplate,
                            this.plugin.settings.characterFolderPath,
                            this.plugin.settings.locationFolderPath,
                            this.plugin.settings.eventFolderPath,
                            this.plugin.settings.itemFolderPath,
                            this.plugin.settings.referenceFolderPath,
                            this.plugin.settings.chapterFolderPath,
                            this.plugin.settings.sceneFolderPath,
                            this.plugin.settings.cultureFolderPath,
                            this.plugin.settings.economyFolderPath,
                            this.plugin.settings.factionFolderPath,
                            this.plugin.settings.magicSystemFolderPath,
                            this.plugin.settings.groupFolderPath,
                        ];
                        const hasStoryPlaceholder = paths.some(p => (p || '').match(/\{story(Name|Slug|Id)\}/i));
                        if (hasStoryPlaceholder && !this.plugin.settings.activeStoryId) {
                            const banner = container.createDiv({ cls: 'mod-warning' });
                            banner.style.marginTop = '8px';
                            banner.setText(t('customFoldersPlaceholderWarning'));
                        } else {
                            await this.plugin.refreshCustomFolderDiscovery();
                        }
                    }
                    this.display();
                })
            );
        this.addInfoToggle(customToggleSetting,
            'Enable per-entity folder paths with optional {storyName}, {storySlug}, or {storyId} placeholders. ' +
            'Leave a path empty to fall back to the story root. ' +
            'Use "Preview resolved folders" to verify paths before saving content.'
        );

        if (this.plugin.settings.enableCustomEntityFolders) {
            new Setting(container)
                .setName(t('previewResolvedFolders'))
                .setDesc(t('previewFoldersDesc'))
                .addButton(btn => btn
                    .setButtonText(t('previewBtn'))
                    .onClick(() => {
                        const resolver = this.plugin.getFolderResolver() || null;
                        if (!resolver) return;
                        const results = resolver.resolveAll();
                        const table = container.createEl('pre', { cls: 'sts-folder-preview' });
                        const lines: string[] = [];
                        for (const [k, v] of Object.entries(results as Record<string, { path?: string; error?: string }>)) {
                            lines.push(`${k.padEnd(12)}: ${v.path || v.error || '—'}`);
                        }
                        table.setText(lines.join('\n'));
                    }));

            this.addFolderPathSetting(container,
                t('storyRootFolderOptional'), t('storyRootDesc'),
                () => this.plugin.settings.storyRootFolderTemplate || '',
                v => { this.plugin.settings.storyRootFolderTemplate = v; },
                t('storyRootFolderPh')
            );
            this.addFolderPathSetting(container,
                t('charactersFolder'), t('charactersFolderDesc'),
                () => this.plugin.settings.characterFolderPath || '',
                v => { this.plugin.settings.characterFolderPath = v; },
                t('charactersFolderPh')
            );
            this.addFolderPathSetting(container,
                t('locationsFolder'), t('locationsFolderDesc'),
                () => this.plugin.settings.locationFolderPath || '',
                v => { this.plugin.settings.locationFolderPath = v; },
                t('locationsFolderPh')
            );
            this.addFolderPathSetting(container,
                t('eventsFolder'), t('eventsFolderDesc'),
                () => this.plugin.settings.eventFolderPath || '',
                v => { this.plugin.settings.eventFolderPath = v; },
                t('eventsFolderPh')
            );
            this.addFolderPathSetting(container,
                t('itemsFolder'), t('itemsFolderDesc'),
                () => this.plugin.settings.itemFolderPath || '',
                v => { this.plugin.settings.itemFolderPath = v; },
                t('itemsFolderPh')
            );
            this.addFolderPathSetting(container,
                t('referencesFolder'), t('referencesFolderDesc'),
                () => this.plugin.settings.referenceFolderPath || '',
                v => { this.plugin.settings.referenceFolderPath = v; },
                t('referencesFolderPh')
            );
            this.addFolderPathSetting(container,
                t('scenesFolder'), t('scenesFolderDesc'),
                () => this.plugin.settings.sceneFolderPath || '',
                v => { this.plugin.settings.sceneFolderPath = v; },
                t('scenesFolderPh')
            );
            this.addFolderPathSetting(container,
                t('chaptersFolder'), t('chaptersFolderDesc'),
                () => this.plugin.settings.chapterFolderPath || '',
                v => { this.plugin.settings.chapterFolderPath = v; },
                t('chaptersFolderPh')
            );
            this.addFolderPathSetting(container,
                t('culturesFolder'), t('culturesFolderDesc'),
                () => this.plugin.settings.cultureFolderPath || '',
                v => { this.plugin.settings.cultureFolderPath = v; },
                t('culturesFolderPh')
            );
            this.addFolderPathSetting(container,
                t('economiesFolder'), t('economiesFolderDesc'),
                () => this.plugin.settings.economyFolderPath || '',
                v => { this.plugin.settings.economyFolderPath = v; },
                t('economiesFolderPh')
            );
            this.addFolderPathSetting(container,
                t('factionsFolder'), t('factionsFolderDesc'),
                () => this.plugin.settings.factionFolderPath || '',
                v => { this.plugin.settings.factionFolderPath = v; },
                t('factionsFolderPh')
            );
            this.addFolderPathSetting(container,
                t('magicSystemsFolder'), t('magicSystemsFolderDesc'),
                () => this.plugin.settings.magicSystemFolderPath || '',
                v => { this.plugin.settings.magicSystemFolderPath = v; },
                t('magicSystemsFolderPh')
            );
            this.addFolderPathSetting(container,
                'Groups folder',
                'Custom folder path for group vault files. Supports {storyName}, {storySlug}, {storyId}.',
                () => this.plugin.settings.groupFolderPath || '',
                v => { this.plugin.settings.groupFolderPath = v; },
                'e.g. MyWorld/Groups'
            );
        }

        // ── One Story Mode ──
        new Setting(container).setName(t('oneStoryMode')).setHeading();

        const oneStoryModeSetting = new Setting(container)
            .setName(t('oneStoryMode'))
            .setDesc(t('oneStoryModeDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableOneStoryMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableOneStoryMode = value;
                    await this.plugin.saveSettings();
                    if (value) await this.plugin.initializeOneStoryModeIfNeeded();
                    this.display();
                })
            );
        this.addInfoToggle(oneStoryModeSetting,
            'One Story Mode flattens the folder structure — all entity folders live directly under a single base folder ' +
            'instead of StorytellerSuite/Stories/{storyName}/…. Ideal if you only ever work on one project at a time.'
        );

        if (!this.plugin.settings.enableCustomEntityFolders && this.plugin.settings.enableOneStoryMode) {
            // Handled manually because of path normalization + initializeOneStoryModeIfNeeded
            new Setting(container)
                .setName(t('oneStoryBaseFolder'))
                .setDesc(t('oneStoryBaseFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('oneStoryBaseFolderPh'))
                        .setValue(this.plugin.settings.oneStoryBaseFolder || 'StorytellerSuite')
                        .onChange(async (value) => {
                            const normalized = (value && value.trim() === '/') ? '' : (value || 'StorytellerSuite');
                            this.plugin.settings.oneStoryBaseFolder = normalized;
                            await this.plugin.saveSettings();
                            await this.plugin.initializeOneStoryModeIfNeeded();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                const chosen = (!folderPath || folderPath === '/') ? '' : folderPath;
                                this.plugin.settings.oneStoryBaseFolder = chosen || 'StorytellerSuite';
                                comp.setValue(chosen);
                                await this.plugin.saveSettings();
                                await this.plugin.initializeOneStoryModeIfNeeded();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        ).open();
                    };
                    comp.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === ' ')) {
                            e.preventDefault();
                            openSuggest();
                        }
                    });
                    comp.inputEl.addEventListener('focus', openSuggest);
                    comp.inputEl.addEventListener('click', openSuggest);
                    return comp;
                });
        }
    }

    // ─── Tab: Timeline ────────────────────────────────────────────────────────
    private renderTimelineTab(container: HTMLElement): void {
        new Setting(container).setName(t('timelineAndParsing')).setHeading();

        const cfSetting = new Setting(container)
            .setName(t('customFieldsSerialization'))
            .setDesc(t('customFieldsDesc'))
            .addDropdown(dd => dd
                .addOption('flatten', t('flattenCustomFields'))
                .addOption('nested', t('nestedCustomFields'))
                .setValue(this.plugin.settings.customFieldsMode || 'flatten')
                .onChange(async (v) => {
                    this.plugin.settings.customFieldsMode = v as 'flatten' | 'nested';
                    await this.plugin.saveSettings();
                }));
        this.addInfoToggle(cfSetting,
            '"Flatten" writes custom fields directly into the frontmatter root (e.g. my-field: value) — best for Dataview queries. ' +
            '"Nested" groups them under a custom-fields: key to avoid polluting the frontmatter namespace.'
        );

        new Setting(container)
            .setName(t('forwardDateBias'))
            .setDesc(t('forwardDateBiasDesc'))
            .addToggle(toggle => toggle
                .setValue(false)
                .onChange(async (_value) => {
                    // Reserved for future persistence if we store parsing settings
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('customToday'))
            .setDesc(t('customTodayDesc'))
            .addText(text => text
                .setPlaceholder(t('customTodayPh'))
                .setValue(this.plugin.settings.customTodayISO || '')
                .onChange(async (value) => {
                    this.plugin.settings.customTodayISO = value.trim() || undefined;
                    await this.plugin.saveSettings();
                }))
            .addExtraButton(btn => btn
                .setIcon('reset')
                .setTooltip(t('clearCustomToday'))
                .onClick(async () => {
                    this.plugin.settings.customTodayISO = undefined;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // Timeline defaults
        new Setting(container).setName(t('defaultTimelineGrouping')).setHeading();

        new Setting(container)
            .setName(t('defaultTimelineGrouping'))
            .addDropdown(dd => dd
                .addOptions({ none: t('noGrouping'), location: t('byLocation'), group: t('byGroup'), character: t('byCharacter') })
                .setValue(this.plugin.settings.defaultTimelineGroupMode || 'none')
                .onChange(async (v) => {
                    this.plugin.settings.defaultTimelineGroupMode = v as 'none' | 'location' | 'group' | 'character';
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('defaultZoomPreset'))
            .addDropdown(dd => dd
                .addOptions({ none: t('noneOption'), fit: t('fitOption'), decade: t('decadeOption'), century: t('centuryOption') })
                .setValue(this.plugin.settings.defaultTimelineZoomPreset || 'none')
                .onChange(async (v) => {
                    this.plugin.settings.defaultTimelineZoomPreset = v as 'none' | 'decade' | 'century' | 'fit';
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('defaultStacking'))
            .addToggle(tg => tg
                .setValue(this.plugin.settings.defaultTimelineStack ?? true)
                .onChange(async (v) => { this.plugin.settings.defaultTimelineStack = v; await this.plugin.saveSettings(); }));

        new Setting(container)
            .setName(t('defaultDensity'))
            .addSlider(sl => sl
                .setLimits(0, 100, 5)
                .setValue(this.plugin.settings.defaultTimelineDensity ?? 50)
                .setDynamicTooltip()
                .onChange(async (v) => { this.plugin.settings.defaultTimelineDensity = v; await this.plugin.saveSettings(); }));

        new Setting(container)
            .setName(t('showLegendByDefault'))
            .addToggle(tg => tg
                .setValue(this.plugin.settings.showTimelineLegend ?? true)
                .onChange(async (v) => { this.plugin.settings.showTimelineLegend = v; await this.plugin.saveSettings(); }));

        // Gantt
        container.createEl('h3', { text: t('ganttViewSettings') });

        new Setting(container)
            .setName(t('showProgressBarsInGantt'))
            .setDesc(t('showProgressBarsInGanttDesc'))
            .addToggle(tg => tg
                .setValue(this.plugin.settings.ganttShowProgressBars ?? true)
                .onChange(async (v) => { this.plugin.settings.ganttShowProgressBars = v; await this.plugin.saveSettings(); }));

        new Setting(container)
            .setName(t('defaultGanttDuration'))
            .setDesc(t('defaultGanttDurationDesc'))
            .addText(text => text
                .setPlaceholder('1')
                .setValue(String(this.plugin.settings.ganttDefaultDuration ?? 1))
                .onChange(async (v) => {
                    const num = parseInt(v, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.ganttDefaultDuration = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(container)
            .setName(t('dependencyArrowStyle'))
            .setDesc(t('dependencyArrowStyleDesc'))
            .addDropdown(dd => dd
                .addOption('solid', t('solid'))
                .addOption('dashed', t('dashed'))
                .addOption('dotted', t('dotted'))
                .setValue(this.plugin.settings.ganttArrowStyle ?? 'solid')
                .onChange(async (v: 'solid' | 'dashed' | 'dotted') => {
                    this.plugin.settings.ganttArrowStyle = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('timelineDefaultHeight'))
            .setDesc(t('timelineHeightDesc'))
            .addText(text => text
                .setPlaceholder(t('timelineHeightPh'))
                .setValue('380px')
                .onChange(async () => { /* no-op stub; future setting */ }));

        // Vault note inclusion
        container.createEl('h3', { text: 'Vault Note Timeline Inclusion' });

        const watchPropSetting = new Setting(container)
            .setName('Timeline watch property')
            .setDesc('Frontmatter property name — any note with this property will appear on the timeline using its value as the date.')
            .addText(text => text
                .setPlaceholder('timeline-date')
                .setValue(this.plugin.settings.timelineWatchProperty || 'timeline-date')
                .onChange(async (v) => {
                    this.plugin.settings.timelineWatchProperty = v.trim() || 'timeline-date';
                    await this.plugin.saveSettings();
                }));
        this.addInfoToggle(watchPropSetting,
            'Any vault note that has this frontmatter key will appear on the timeline. ' +
            'Example: add "timeline-date: 2025-01-15" to a note to pin it to that date on your story timeline.'
        );

        const watchTagSetting = new Setting(container)
            .setName('Timeline watch tag')
            .setDesc('Tag to watch — any note with this tag AND a frontmatter "date" field will appear on the timeline.')
            .addText(text => text
                .setPlaceholder('timeline')
                .setValue(this.plugin.settings.timelineWatchTag || 'timeline')
                .onChange(async (v) => {
                    this.plugin.settings.timelineWatchTag = v.trim() || 'timeline';
                    await this.plugin.saveSettings();
                }));
        this.addInfoToggle(watchTagSetting,
            'Alternative to the watch property: tag any note with this tag (e.g. #timeline) ' +
            'and give it a "date" frontmatter field to include it on the timeline.'
        );
    }

    // ─── Tab: Maps ────────────────────────────────────────────────────────────
    private renderMapsTab(container: HTMLElement): void {
        new Setting(container).setName(t('mapSettings')).setHeading();

        new Setting(container)
            .setName(t('enableFrontmatterMarkers'))
            .setDesc(t('enableFrontmatterMarkersDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableFrontmatterMarkers)
                .onChange(async (value) => {
                    this.plugin.settings.enableFrontmatterMarkers = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('locationPinsOpenMap'))
            .setDesc(t('locationPinsOpenMapDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.locationPinsOpenMap)
                .onChange(async (value) => {
                    this.plugin.settings.locationPinsOpenMap = value;
                    await this.plugin.saveSettings();
                }));

        const leafletSetting = new Setting(container)
            .setName('Disable Leaflet global exposure')
            .setDesc('Prevents Storyteller Suite from exposing Leaflet globally. Use if you experience conflicts with the standalone Obsidian Leaflet plugin. Requires plugin reload.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.disableLeafletGlobalExposure)
                .onChange(async (value) => {
                    this.plugin.settings.disableLeafletGlobalExposure = value;
                    await this.plugin.saveSettings();
                    new Notice('Plugin reload required for this setting to take effect. Please restart Obsidian or disable/enable the plugin.');
                }));
        this.addInfoToggle(leafletSetting,
            'The standalone "Obsidian Leaflet" plugin and Storyteller Suite both bundle Leaflet. ' +
            'If you notice issues like the distance measurement tool not working, enable this toggle. ' +
            'Storyteller Suite\'s MapView will continue to work as it imports Leaflet directly.'
        );

        // Map Tile Settings
        container.createEl('h3', { text: 'Map Tile Settings' });

        new Setting(container)
            .setName('Auto-generate tiles')
            .setDesc('Automatically generate tiles for large images on upload')
            .addToggle(toggle => toggle
                .setValue((this.plugin.settings.tiling?.autoGenerateThreshold || 0) > 0)
                .onChange(async (value) => {
                    if (!this.plugin.settings.tiling) {
                        this.plugin.settings.tiling = { autoGenerateThreshold: 2000, tileSize: 256, showProgressNotifications: true };
                    }
                    this.plugin.settings.tiling.autoGenerateThreshold = value ? 2000 : -1;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName('Size threshold')
            .setDesc('Generate tiles for images larger than this (width or height in pixels)')
            .addText(text => text
                .setPlaceholder('2000')
                .setValue(String(this.plugin.settings.tiling?.autoGenerateThreshold || 2000))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        if (!this.plugin.settings.tiling) {
                            this.plugin.settings.tiling = { autoGenerateThreshold: 2000, tileSize: 256, showProgressNotifications: true };
                        }
                        this.plugin.settings.tiling.autoGenerateThreshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(container)
            .setName('Tile size')
            .setDesc('Tile dimensions in pixels (256 is standard, don\'t change unless you know what you\'re doing)')
            .addDropdown(dropdown => dropdown
                .addOption('128', '128px')
                .addOption('256', '256px (recommended)')
                .addOption('512', '512px')
                .setValue(String(this.plugin.settings.tiling?.tileSize || 256))
                .onChange(async (value) => {
                    if (!this.plugin.settings.tiling) {
                        this.plugin.settings.tiling = { autoGenerateThreshold: 2000, tileSize: 256, showProgressNotifications: true };
                    }
                    this.plugin.settings.tiling.tileSize = parseInt(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName('Show progress notifications')
            .setDesc('Display progress notifications during tile generation')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tiling?.showProgressNotifications ?? true)
                .onChange(async (value) => {
                    if (!this.plugin.settings.tiling) {
                        this.plugin.settings.tiling = { autoGenerateThreshold: 2000, tileSize: 256, showProgressNotifications: true };
                    }
                    this.plugin.settings.tiling.showProgressNotifications = value;
                    await this.plugin.saveSettings();
                }));
    }

    // ─── Tab: Templates ───────────────────────────────────────────────────────
    private renderTemplatesTab(container: HTMLElement): void {
        new Setting(container).setName(t('defaultTemplates')).setHeading();

        new Setting(container)
            .setName('Disable automatic folder creation')
            .setDesc('Prevent the plugin from creating any folders (StorytellerSuite, Templates, entity folders, etc.) on startup. Enable this if you use your own custom folder structure. Folders will still be created when you explicitly create entities. Requires plugin reload.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.disableAutoFolderCreation)
                .onChange(async (value) => {
                    this.plugin.settings.disableAutoFolderCreation = value;
                    await this.plugin.saveSettings();
                    new Notice('Plugin reload required for this setting to take effect.');
                }));

        new Setting(container).setDesc(t('defaultTemplatesDesc'));

        const entityTypesWithTemplates: Array<{ key: string; label: string }> = [
            { key: 'character',   label: t('character') },
            { key: 'location',    label: t('location') },
            { key: 'event',       label: t('event') },
            { key: 'item',        label: t('item') },
            { key: 'group',       label: t('group') },
            { key: 'culture',     label: t('cultures') },
            { key: 'economy',     label: t('economies') },
            { key: 'magicSystem', label: t('magicSystems') },
            { key: 'chapter',     label: t('chapter') },
            { key: 'scene',       label: t('scene') },
            { key: 'reference',   label: t('reference') }
        ];

        for (const entityType of entityTypesWithTemplates) {
            const templates = this.plugin.templateManager?.getTemplatesByEntityType(entityType.key as any) || [];
            const currentTemplateId = this.plugin.settings.defaultTemplates?.[entityType.key] || '';
            new Setting(container)
                .setName(t('defaultTemplateFor', entityType.label))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('noDefaultTemplate'));
                    templates.forEach(template => dropdown.addOption(template.id, template.name));
                    dropdown.setValue(currentTemplateId);
                    dropdown.onChange(async (value) => {
                        if (!this.plugin.settings.defaultTemplates) {
                            this.plugin.settings.defaultTemplates = {};
                        }
                        if (value) {
                            this.plugin.settings.defaultTemplates[entityType.key] = value;
                            const template = templates.find(tpl => tpl.id === value);
                            new Notice(t('defaultTemplateSet', entityType.label, template?.name || value));
                        } else {
                            delete this.plugin.settings.defaultTemplates[entityType.key];
                            new Notice(t('defaultTemplateCleared', entityType.label));
                        }
                        await this.plugin.saveSettings();
                    });
                });
        }

        this.renderCharacterSheetTemplatesSection(container);
    }

    // ─── Character Sheet Templates section ────────────────────────────────────

    private renderCharacterSheetTemplatesSection(container: HTMLElement): void {
        new Setting(container).setName('Character Sheet Templates').setHeading();

        // Default template picker
        new Setting(container)
            .setName('Default template')
            .setDesc('Template pre-selected when the sheet preview opens.')
            .addDropdown(drop => {
                for (const tpl of BUILT_IN_SHEET_TEMPLATES) drop.addOption(tpl.id, tpl.name);
                for (const tpl of (this.plugin.settings.characterSheetTemplates ?? [])) {
                    drop.addOption(tpl.id, `${tpl.name} (Custom)`);
                }
                drop.setValue(this.plugin.settings.defaultCharacterSheetTemplateId ?? 'classic');
                drop.onChange(async value => {
                    this.plugin.settings.defaultCharacterSheetTemplateId = value;
                    await this.plugin.saveSettings();
                });
            });

        // Built-in template cards (read-only)
        const builtInGrid = container.createDiv('sts-sheet-tpl-grid');
        for (const tpl of BUILT_IN_SHEET_TEMPLATES) {
            const card = builtInGrid.createDiv('sts-sheet-tpl-card sts-sheet-tpl-card--builtin');
            card.createEl('div', { text: tpl.name, cls: 'sts-sheet-tpl-card-name' });
            card.createEl('div', { text: tpl.description, cls: 'sts-sheet-tpl-card-desc' });
        }

        // Custom templates list
        new Setting(container)
            .setName('Custom templates')
            .setHeading();

        this.renderCustomTemplatesList(container);
    }

    private renderCustomTemplatesList(container: HTMLElement): void {
        // Remove existing list if re-rendering
        container.querySelectorAll('.sts-custom-tpl-list, .sts-custom-tpl-empty, .sts-cstpl-add-btn-row').forEach(el => el.remove());

        const customTemplates = this.plugin.settings.characterSheetTemplates ?? [];

        if (customTemplates.length === 0) {
            container.createDiv({ text: 'No custom templates yet.', cls: 'sts-custom-tpl-empty' });
        } else {
            const list = container.createDiv('sts-custom-tpl-list');
            for (const tpl of customTemplates) {
                const row = list.createDiv('sts-custom-tpl-row');
                const info = row.createDiv('sts-custom-tpl-info');
                info.createEl('span', { text: tpl.name,        cls: 'sts-custom-tpl-name' });
                info.createEl('span', { text: tpl.description, cls: 'sts-custom-tpl-desc' });

                const actions = row.createDiv('sts-custom-tpl-actions');

                const editBtn = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit' } });
                setIcon(editBtn, 'pencil');
                editBtn.addEventListener('click', () => {
                    new CustomSheetTemplateModal(this.app, tpl, async updated => {
                        const idx = (this.plugin.settings.characterSheetTemplates ?? []).findIndex(t => t.id === tpl.id);
                        if (idx !== -1 && this.plugin.settings.characterSheetTemplates) {
                            this.plugin.settings.characterSheetTemplates[idx] = updated;
                            await this.plugin.saveSettings();
                            this.renderCharacterSheetTemplatesSection_refresh(container);
                        }
                    }).open();
                });

                const delBtn = actions.createEl('button', { cls: 'clickable-icon mod-warning', attr: { 'aria-label': 'Delete' } });
                setIcon(delBtn, 'trash');
                delBtn.addEventListener('click', async () => {
                    this.plugin.settings.characterSheetTemplates = (this.plugin.settings.characterSheetTemplates ?? []).filter(t => t.id !== tpl.id);
                    if (this.plugin.settings.defaultCharacterSheetTemplateId === tpl.id) {
                        this.plugin.settings.defaultCharacterSheetTemplateId = 'classic';
                    }
                    await this.plugin.saveSettings();
                    this.renderCharacterSheetTemplatesSection_refresh(container);
                });
            }
        }

        const addRow = container.createDiv('sts-cstpl-add-btn-row');
        const addBtn = addRow.createEl('button', { text: '+ Add custom template', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            new CustomSheetTemplateModal(this.app, null, async tpl => {
                if (!this.plugin.settings.characterSheetTemplates) this.plugin.settings.characterSheetTemplates = [];
                this.plugin.settings.characterSheetTemplates.push(tpl);
                await this.plugin.saveSettings();
                this.renderCharacterSheetTemplatesSection_refresh(container);
            }).open();
        });
    }

    /** Re-render only the custom templates list + default dropdown inside the templates tab container. */
    private renderCharacterSheetTemplatesSection_refresh(container: HTMLElement): void {
        // Re-render the whole section by removing it and re-adding
        container.querySelectorAll(
            '.sts-sheet-tpl-grid, .sts-sheet-tpl-grid + *, .sts-custom-tpl-list, .sts-custom-tpl-empty, .sts-cstpl-add-btn-row'
        ).forEach(el => el.remove());
        // Find and remove the section heading + default setting
        // Simpler: re-render just the list portion
        this.renderCustomTemplatesList(container);
    }

    // ─── Tab: Gallery ─────────────────────────────────────────────────────────
    private renderGalleryTab(container: HTMLElement): void {
        new Setting(container).setName(t('gallery')).setHeading();

        this.addFolderPathSetting(container,
            t('galleryUploadFolder'), t('galleryFolderDesc'),
            () => this.plugin.settings.galleryUploadFolder,
            v => { this.plugin.settings.galleryUploadFolder = v; },
            t('galleryUploadFolderPh')
        );

        new Setting(container)
            .setName('Auto-watch folder')
            .setDesc('Images placed in this folder are automatically added to the gallery. Leave empty to disable.')
            .addText(text => text
                .setPlaceholder('e.g. StorytellerSuite/GalleryWatch')
                .setValue(this.plugin.settings.galleryWatchFolder ?? '')
                .onChange(async (value) => {
                    this.plugin.settings.galleryWatchFolder = value;
                    await this.plugin.saveSettings();
                }));
    }

    // ─── Tab: Help ────────────────────────────────────────────────────────────
    private renderHelpTab(container: HTMLElement): void {
        new Setting(container)
            .setName(t('showTutorialSection'))
            .setDesc(t('showTutorialDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTutorial)
                .onChange(async (value) => {
                    this.plugin.settings.showTutorial = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.showTutorial) {
            this.addTutorialSection(container);
        }

        new Setting(container).setName(t('support')).setHeading();

        new Setting(container)
            .setName(t('supportDevelopment'))
            .setDesc(t('supportDevDesc'))
            .addButton(button => button
                .setButtonText(t('buyMeACoffee'))
                .setTooltip('Support on Ko-fi')
                .onClick(() => window.open('https://ko-fi.com/kingmaws', '_blank'))
            );

        new Setting(container).setName(t('about')).setHeading();

        new Setting(container)
            .setName(t('pluginInformation'))
            .setDesc(t('pluginInfoDesc'))
            .addButton(button => button
                .setButtonText(t('github'))
                .setTooltip('View source code')
                .onClick(() => window.open('https://github.com/SamW7140/obsidian-storyteller-suite', '_blank'))
            );
    }

    // ─── Tutorial ─────────────────────────────────────────────────────────────
    private addTutorialSection(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('tutorialGettingStarted')).setHeading();

        const tutorialDesc = createDiv();
        tutorialDesc.innerHTML = `
            <p><strong>${t('tutorialWelcome')}</strong> ${t('tutorialWelcomeDesc')}</p>
            <p><em>${t('tutorialTip')}</em></p>
        `;
        tutorialDesc.style.marginBottom = '1em';
        tutorialDesc.style.padding = '0.75em';
        tutorialDesc.style.backgroundColor = 'var(--background-modifier-form-field)';
        tutorialDesc.style.borderRadius = '5px';
        tutorialDesc.style.borderLeft = '3px solid var(--interactive-accent)';
        containerEl.appendChild(tutorialDesc);

        this.addTutorialCollapsible(containerEl, t('tutorialDashboardTitle'),
            `<p><strong>${t('tutorialDashboardAccess')}</strong></p>
            <ul>
                <li>${t('tutorialDashboardRibbon')}</li>
                <li>${t('tutorialDashboardCommand')}</li>
                <li>${t('tutorialDashboardHub')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialStoryTitle'),
            `<p><strong>${t('tutorialStoryCreating')}</strong></p>
            <ul>
                <li>${t('tutorialStoryButton')}</li>
                <li>${t('tutorialStoryCommand')}</li>
                <li>${t('tutorialStoryName')}</li>
                <li>${t('tutorialStoryDefault')}</li>
            </ul>
            <p><strong>${t('tutorialStoryManaging')}</strong></p>
            <ul>
                <li>${t('tutorialStorySwitch')}</li>
                <li>${t('tutorialStoryEdit')}</li>
                <li>${t('tutorialStoryDelete')}</li>
            </ul>
            <p><strong>${t('tutorialStoryActivation')}</strong></p>
            <p><strong>${t('tutorialStoryOneMode')}</strong></p>`);

        this.addTutorialCollapsible(containerEl, t('tutorialCharacterTitle'),
            `<p><strong>${t('tutorialCharacterCreating')}</strong></p>
            <ul>
                <li>${t('tutorialCharacterDashboard')}</li>
                <li>${t('tutorialCharacterCommand')}</li>
                <li>${t('tutorialCharacterDetails')}</li>
                <li>${t('tutorialCharacterImages')}</li>
            </ul>
            <p><strong>${t('tutorialCharacterManaging')}</strong></p>
            <ul>
                <li>${t('tutorialCharacterView')}</li>
                <li>${t('tutorialCharacterEdit')}</li>
                <li>${t('tutorialCharacterDelete')}</li>
                <li>${t('tutorialCharacterStorage')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialLocationTitle'),
            `<p><strong>${t('tutorialLocationCreating')}</strong></p>
            <ul>
                <li>${t('tutorialLocationDashboard')}</li>
                <li>${t('tutorialLocationCommand')}</li>
                <li>${t('tutorialLocationDetails')}</li>
                <li>${t('tutorialLocationLink')}</li>
            </ul>
            <p><strong>${t('tutorialLocationManaging')}</strong></p>
            <ul>
                <li>${t('tutorialLocationView')}</li>
                <li>${t('tutorialLocationStorage')}</li>
                <li>${t('tutorialLocationEdit')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialEventTitle'),
            `<p><strong>${t('tutorialEventCreating')}</strong></p>
            <ul>
                <li>${t('tutorialEventDashboard')}</li>
                <li>${t('tutorialEventCommand')}</li>
                <li>${t('tutorialEventDetails')}</li>
                <li>${t('tutorialEventLink')}</li>
                <li>${t('tutorialEventNew')}</li>
            </ul>
            <p><strong>${t('tutorialEventTimeline')}</strong></p>
            <ul>
                <li>${t('tutorialEventTimelineDashboard')}</li>
                <li>${t('tutorialEventTimelineCommand')}</li>
                <li>${t('tutorialEventTimelineSee')}</li>
                <li>${t('tutorialEventStorage')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialGanttTitle'),
            `<p><strong>${t('tutorialGanttEnhanced')}</strong></p>
            <ul>
                <li>${t('tutorialGanttToggle')}</li>
                <li>${t('tutorialGanttMilestones')}</li>
                <li>${t('tutorialGanttProgress')}</li>
                <li>${t('tutorialGanttDependencies')}</li>
            </ul>
            <p><strong>${t('tutorialGanttDrag')}</strong></p>
            <ul>
                <li>${t('tutorialGanttLock')}</li>
                <li>${t('tutorialGanttDragEvents')}</li>
                <li>${t('tutorialGanttDisable')}</li>
            </ul>
            <p><strong>${t('tutorialGanttFiltering')}</strong></p>
            <ul>
                <li>${t('tutorialGanttFilterPanel')}</li>
                <li>${t('tutorialGanttFilterBy')}</li>
                <li>${t('tutorialGanttFilterChips')}</li>
                <li>${t('tutorialGanttSwimlanes')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialPlotTitle'),
            `<p><strong>${t('tutorialPlotManaging')}</strong></p>
            <ul>
                <li>${t('tutorialPlotCreate')}</li>
                <li>${t('tutorialPlotCritical')}</li>
                <li>${t('tutorialPlotOwnership')}</li>
                <li>${t('tutorialPlotView')}</li>
                <li>${t('tutorialPlotStorage')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialReferencesTitle'),
            `<p><strong>${t('tutorialReferencesCreating')}</strong></p>
            <ul>
                <li>${t('tutorialReferencesDashboard')}</li>
                <li>${t('tutorialReferencesCommand')}</li>
                <li>${t('tutorialReferencesDetails')}</li>
            </ul>
            <p><strong>${t('tutorialReferencesManaging')}</strong></p>
            <ul>
                <li>${t('tutorialReferencesView')}</li>
                <li>${t('tutorialReferencesStorage')}</li>
                <li>${t('tutorialReferencesUse')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialChaptersScenesTitle'),
            `<p><strong>${t('tutorialChaptersCreating')}</strong></p>
            <ul>
                <li>${t('tutorialChaptersDashboard')}</li>
                <li>${t('tutorialChaptersCommand')}</li>
                <li>${t('tutorialChaptersDetails')}</li>
                <li>${t('tutorialChaptersLink')}</li>
            </ul>
            <p><strong>${t('tutorialScenesCreating')}</strong></p>
            <ul>
                <li>${t('tutorialScenesDashboard')}</li>
                <li>${t('tutorialScenesCommand')}</li>
                <li>${t('tutorialScenesDetails')}</li>
                <li>${t('tutorialScenesLink')}</li>
            </ul>
            <p><strong>${t('tutorialScenesManaging')}</strong></p>
            <ul>
                <li>${t('tutorialChaptersView')}</li>
                <li>${t('tutorialScenesView')}</li>
                <li>${t('tutorialChaptersStorage')}</li>
                <li>${t('tutorialScenesStorage')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialMapsTitle'),
            `<p><strong>${t('tutorialMapsCreating')}</strong></p>
            <ul>
                <li>${t('tutorialMapsDashboard')}</li>
                <li>${t('tutorialMapsTypes')}</li>
                <li>${t('tutorialMapsFeatures')}</li>
            </ul>
            <p><strong>${t('tutorialMapsManaging')}</strong></p>
            <ul>
                <li>${t('tutorialMapsView')}</li>
                <li>${t('tutorialMapsStorage')}</li>
                <li>${t('tutorialMapsFrontmatter')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialGalleryTitle'),
            `<p><strong>${t('tutorialGalleryOrganization')}</strong></p>
            <ul>
                <li>${t('tutorialGalleryAccess')}</li>
                <li>${t('tutorialGalleryUpload')}</li>
                <li>${t('tutorialGalleryOrganize')}</li>
                <li>${t('tutorialGalleryLink')}</li>
                <li>${t('tutorialGalleryConfig')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialGroupsTitle'),
            `<p><strong>${t('tutorialGroupsOrganizing')}</strong></p>
            <ul>
                <li>${t('tutorialGroupsCreate')}</li>
                <li>${t('tutorialGroupsAdd')}</li>
                <li>${t('tutorialGroupsManage')}</li>
                <li>${t('tutorialGroupsUseCases')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialWorldTitle'),
            `<p><strong>${t('tutorialWorldFive')}</strong></p>
            <ul>
                <li>${t('tutorialWorldCultures')}</li>
                <li>${t('tutorialWorldFactions')}</li>
                <li>${t('tutorialWorldEconomies')}</li>
                <li>${t('tutorialWorldMagic')}</li>
            </ul>
            <p><strong>${t('tutorialWorldCreating')}</strong></p>
            <ul>
                <li>${t('tutorialWorldCommand')}</li>
                <li>${t('tutorialWorldView')}</li>
                <li>${t('tutorialWorldModals')}</li>
                <li>${t('tutorialWorldStorage')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialTimelineTitle'),
            `<p><strong>${t('tutorialTimelineAlternate')}</strong></p>
            <ul>
                <li>${t('tutorialTimelineCreateFork')}</li>
                <li>${t('tutorialTimelineDivergence')}</li>
                <li>${t('tutorialTimelineForkStatus')}</li>
                <li>${t('tutorialTimelineViewForks')}</li>
            </ul>
            <p><strong>${t('tutorialTimelineCausality')}</strong></p>
            <ul>
                <li>${t('tutorialTimelineAddLink')}</li>
                <li>${t('tutorialTimelineLinkTypes')}</li>
                <li>${t('tutorialTimelineStrength')}</li>
                <li>${t('tutorialTimelineLinksHelp')}</li>
            </ul>
            <p><strong>${t('tutorialTimelineConflict')}</strong></p>
            <ul>
                <li>${t('tutorialTimelineRunDetection')}</li>
                <li>${t('tutorialTimelineDetects')}</li>
                <li>${t('tutorialTimelineBadge')}</li>
                <li>${t('tutorialTimelineActionable')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialTemplatesTitle'),
            `<p><strong>${t('tutorialTemplatesCreate')}</strong></p>
            <ul>
                <li>${t('tutorialTemplatesSave')}</li>
                <li>${t('tutorialTemplatesLibrary')}</li>
                <li>${t('tutorialTemplatesDashboard')}</li>
            </ul>
            <p><strong>${t('tutorialTemplatesBuiltIn')}</strong></p>
            <ul>
                <li>${t('tutorialTemplatesArchetypes')}</li>
                <li>${t('tutorialTemplatesMore')}</li>
            </ul>
            <p><strong>${t('tutorialTemplatesFeatures')}</strong></p>
            <ul>
                <li>${t('tutorialTemplatesBrowse')}</li>
                <li>${t('tutorialTemplatesSort')}</li>
                <li>${t('tutorialTemplatesUsage')}</li>
                <li>${t('tutorialTemplatesCustomize')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialDiscoveryTitle'),
            `<p><strong>${t('tutorialDiscoveryAutomatic')}</strong></p>
            <ul>
                <li>${t('tutorialDiscoveryDetects')}</li>
                <li>${t('tutorialDiscoveryManual')}</li>
                <li>${t('tutorialDiscoveryImport')}</li>
                <li>${t('tutorialDiscoveryUseful')}</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, t('tutorialCustomTitle'),
            `<p><strong>${t('tutorialCustomSimple')}</strong></p>
            <ol>
                <li>${t('tutorialCustomStep1')}</li>
                <li>${t('tutorialCustomStep2')}</li>
                <li>${t('tutorialCustomStep3')}</li>
                <li>${t('tutorialCustomStep4')}</li>
            </ol>
            <p><strong>${t('tutorialCustomSwitching')}</strong></p>`);

        this.addTutorialCollapsible(containerEl, t('tutorialShortcutsTitle'),
            `<p><strong>${t('tutorialShortcutsCore')}</strong></p>
            <ul>
                <li>${t('tutorialShortcutsOpen')}</li>
                <li>${t('tutorialShortcutsNewStory')}</li>
                <li>${t('tutorialShortcutsCreate')}</li>
                <li>${t('tutorialShortcutsView')}</li>
                <li>${t('tutorialShortcutsGallery')}</li>
                <li>${t('tutorialShortcutsGroup')}</li>
                <li>${t('tutorialShortcutsRefresh')}</li>
            </ul>
            <p><strong>${t('tutorialShortcutsWorld')}</strong></p>
            <ul>
                <li>${t('tutorialShortcutsWorldCreate')}</li>
                <li>${t('tutorialShortcutsWorldView')}</li>
            </ul>
            <p><strong>${t('tutorialShortcutsTimeline')}</strong></p>
            <ul>
                <li>${t('tutorialShortcutsTimelineFork')}</li>
                <li>${t('tutorialShortcutsTimelineViewForks')}</li>
                <li>${t('tutorialShortcutsTimelineLink')}</li>
                <li>${t('tutorialShortcutsTimelineViewLinks')}</li>
                <li>${t('tutorialShortcutsTimelineDetect')}</li>
                <li>${t('tutorialShortcutsTimelineViewConflicts')}</li>
            </ul>
            <p><strong>${t('tutorialShortcutsTemplate')}</strong></p>
            <ul>
                <li>${t('tutorialShortcutsTemplateLibrary')}</li>
            </ul>
            <p><strong>${t('tutorialShortcutsTip')}</strong></p>`);

        this.addTutorialCollapsible(containerEl, t('tutorialFileTitle'),
            `<p><strong>${t('tutorialFileOrganized')}</strong></p>
            <pre><code>${t('tutorialFileDefault')}
StorytellerSuite/
├── Stories/
│   └── YourStoryName/
│       ├── Characters/     (character .md files)
│       ├── Locations/      (location .md files)
│       ├── Events/         (event .md files)
│       ├── Items/          (plot item .md files)
│       ├── Chapters/       (chapter .md files)
│       ├── Scenes/         (scene .md files)
│       ├── References/     (reference .md files)
│       ├── Cultures/       (culture .md files)
│       ├── Factions/       (faction .md files)
│       ├── Economies/      (economy .md files)
│       └── MagicSystems/   (magic system .md files)
├── GalleryUploads/         (uploaded images)
└── Templates/              (saved entity templates)

${t('tutorialFileOneMode')}
[Base]/
├── Characters/
├── Locations/
├── Events/
├── Items/
├── References/
├── Chapters/
├── Scenes/
├── Cultures/
├── Factions/
├── Economies/
└── MagicSystems/
</code></pre>
            <p><strong>${t('tutorialFileIntegration')}</strong></p>
            <ul>
                <li>${t('tutorialFileMarkdown')}</li>
                <li>${t('tutorialFileDataview')}</li>
                <li>${t('tutorialFileWikiLinks')}</li>
                <li>${t('tutorialFileReadable')}</li>
                <li>${t('tutorialFileBackup')}</li>
            </ul>
            <p><strong>${t('tutorialFileTip')}</strong></p>`);
    }

    private addTutorialCollapsible(containerEl: HTMLElement, title: string, content: string): void {
        const setting = new Setting(containerEl)
            .setName(title)
            .setClass('storyteller-tutorial-section');

        const contentEl = createDiv();
        contentEl.innerHTML = content;
        contentEl.style.display = 'none';
        contentEl.style.marginTop = '10px';
        contentEl.style.padding = '15px';
        contentEl.style.backgroundColor = 'var(--background-secondary)';
        contentEl.style.borderRadius = '5px';
        contentEl.style.fontSize = '0.9em';
        contentEl.style.lineHeight = '1.5';

        setting.settingEl.style.cursor = 'pointer';
        setting.settingEl.addEventListener('click', () => {
            const isHidden = contentEl.style.display === 'none';
            contentEl.style.display = isHidden ? 'block' : 'none';
            const nameEl = setting.nameEl;
            const currentText = nameEl.textContent || '';
            if (isHidden) {
                nameEl.textContent = '▼ ' + currentText.replace('▶ ', '').replace('▼ ', '');
            } else {
                nameEl.textContent = '▶ ' + currentText.replace('▶ ', '').replace('▼ ', '');
            }
        });

        setting.nameEl.textContent = '▶ ' + (setting.nameEl.textContent || '');
        setting.settingEl.appendChild(contentEl);
    }
}
