import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';
import { FolderSuggestModal } from './modals/FolderSuggestModal';
import { CustomSheetTemplateModal } from './modals/CustomSheetTemplateModal';
import { getGettingStartedGuide, renderGuideDocument } from './tutorial/StorytellerGuideContent';
import { BUILT_IN_SHEET_TEMPLATES } from './utils/CharacterSheetTemplates';
import { setLocale, t, getAvailableLanguages, getLanguageName, isLanguageAvailable } from './i18n/strings';
import { VIEW_TYPE_DASHBOARD } from './views/DashboardView';

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

        new Setting(container)
            .setName('Show dashboard accent borders')
            .setDesc('Enable the colored top border and entity card accent strips in the dashboard.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.dashboardAccentBorders)
                .onChange(async (value) => {
                    this.plugin.settings.dashboardAccentBorders = value;
                    await this.plugin.saveSettings();
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
                    await Promise.all(leaves.map(async (leaf) => {
                        const view = leaf.view as any;
                        if (view && typeof view.onOpen === 'function') {
                            await view.onOpen();
                        }
                    }));
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
            { id: 'compendium',   name: 'Compendium' },
            { id: 'books',        name: 'Books' },
            { id: 'campaign',     name: 'Campaign' },
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
                            this.plugin.settings.bookFolderPath,
                            this.plugin.settings.sessionsFolderPath,
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
                'Books folder',
                'Custom folder path for book vault files. Supports {storyName}, {storySlug}, {storyId}. Tip: set Chapters to MyWorld/{storyName}/{bookName}/Chapters and Scenes to MyWorld/{storyName}/{bookName}/Scenes to automatically organise story assets per book.',
                () => this.plugin.settings.bookFolderPath || '',
                v => { this.plugin.settings.bookFolderPath = v; },
                'e.g. MyWorld/Stories/{storyName}/Books'
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
            this.addFolderPathSetting(container,
                'Sessions folder',
                'Custom folder path for campaign session files. Supports {storyName}, {storySlug}, {storyId}.',
                () => this.plugin.settings.sessionsFolderPath || '',
                v => { this.plugin.settings.sessionsFolderPath = v; },
                'e.g. MyWorld/Stories/{storyName}/Sessions'
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
    // Help tab
    private renderHelpTab(container: HTMLElement): void {
        new Setting(container)
            .setName('Guides')
            .setHeading();

        new Setting(container)
            .setName('Open getting started guide')
            .setDesc('Open the first-run guide that explains setup, stories, books, timeline, maps, campaign play, and compile.')
            .addButton(button => button
                .setButtonText('Open guide')
                .setCta()
                .onClick(() => this.plugin.openGettingStartedGuide()));

        new Setting(container)
            .setName('Open update highlights')
            .setDesc(`Open the latest feature summary for v${this.plugin.manifest.version}.`)
            .addButton(button => button
                .setButtonText('Open highlights')
                .onClick(() => this.plugin.openWhatsNewGuide()));

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

    private addTutorialSection(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Getting started').setHeading();
        renderGuideDocument(containerEl, getGettingStartedGuide(this.plugin.manifest.version), {
            collapsible: true,
            openFirstCount: 1,
            hideTitle: true,
        });
    }
}
