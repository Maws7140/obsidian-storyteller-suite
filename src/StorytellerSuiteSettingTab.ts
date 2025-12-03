import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';
import { FolderSuggestModal } from './modals/FolderSuggestModal';
import { setLocale, t, getAvailableLanguages, getLanguageName, isLanguageAvailable } from './i18n/strings';

export class StorytellerSuiteSettingTab extends PluginSettingTab {
    plugin: StorytellerSuitePlugin;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // --- Tutorial Section ---
        if (this.plugin.settings.showTutorial) {
            this.addTutorialSection(containerEl);
        }

        // --- Language Setting ---
        new Setting(containerEl)
            .setName(t('language'))
            .setDesc(t('selectLanguage'))
            .addDropdown(dropdown => {
                // Add all available languages dynamically
                const availableLanguages = getAvailableLanguages();
                availableLanguages.forEach(lang => {
                    dropdown.addOption(lang, getLanguageName(lang));
                });
                
                // Set current value, defaulting to 'en' if current language is not available
                const currentLang = isLanguageAvailable(this.plugin.settings.language) 
                    ? this.plugin.settings.language 
                    : 'en';
                dropdown.setValue(currentLang);
                
                dropdown.onChange(async (value) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                    setLocale(value);
                    new Notice(t('languageChanged'));
                    // Refresh the settings tab to show updated language
                    this.display();
                });
            });

        // --- Dashboard Tab Visibility ---
        new Setting(containerEl)
            .setName(t('dashboardTabVisibility'))
            .setHeading();

        new Setting(containerEl)
            .setDesc(t('dashboardTabVisibilityDesc'));

        // Define all available tabs with their display names
        const availableTabs = [
            { id: 'characters', name: t('characters') },
            { id: 'locations', name: t('locations') },
            { id: 'events', name: t('timeline') },
            { id: 'items', name: t('items') },
            { id: 'network', name: t('networkGraph') },
            { id: 'gallery', name: t('gallery') },
            { id: 'groups', name: t('groups') },
            { id: 'references', name: t('references') },
            { id: 'chapters', name: t('chapters') },
            { id: 'scenes', name: t('scenes') },
            { id: 'cultures', name: t('cultures') },
            { id: 'economies', name: t('economies') },
            { id: 'magicsystems', name: t('magicSystems') },
            { id: 'templates', name: t('templates') }
        ];

        // Create a toggle for each tab
        availableTabs.forEach(tab => {
            const hiddenTabs = this.plugin.settings.hiddenDashboardTabs || [];
            const isVisible = !hiddenTabs.includes(tab.id);

            new Setting(containerEl)
                .setName(tab.name)
                .addToggle(toggle => toggle
                    .setValue(isVisible)
                    .setTooltip(isVisible ? t('tabIsVisible') : t('tabIsHidden'))
                    .onChange(async (value) => {
                        const hidden = this.plugin.settings.hiddenDashboardTabs || [];

                        if (value) {
                            // Show tab - remove from hidden list
                            this.plugin.settings.hiddenDashboardTabs = hidden.filter(id => id !== tab.id);
                        } else {
                            // Hide tab - add to hidden list
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

        // --- Story Management Section ---
        new Setting(containerEl)
            .setName(t('stories'))
            .setHeading();

        // List all stories and allow selection
        this.plugin.settings.stories.forEach(story => {
            const isActive = this.plugin.settings.activeStoryId === story.id;
            new Setting(containerEl)
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
                            this.app,
                            this.plugin,
                            story,
                            existingNames,
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

        // Button to create a new story
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText(t('createNewStory'))
                .setCta()
                .onClick(async () => {
                    const existingNames = this.plugin.settings.stories.map(s => s.name);
                    new NewStoryModal(
                        this.app,
                        this.plugin,
                        existingNames,
                        async (name: string, description?: string) => {
                            await this.plugin.createStory(name, description);
                            this.display();
                        }
                    ).open();
                })
            );

        // Manual story discovery refresh
        new Setting(containerEl)
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
                        // Refresh the settings pane in case the stories list changed
                        this.display();
                    }
                })
            );

        // --- Gallery Upload Folder ---
        new Setting(containerEl)
            .setName(t('galleryUploadFolder'))
            .setDesc(t('galleryFolderDesc'))
            .addText(text => {
                const comp = text
                    .setPlaceholder(t('galleryUploadFolderPh'))
                    .setValue(this.plugin.settings.galleryUploadFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.galleryUploadFolder = value;
                        await this.plugin.saveSettings();
                    });
                let suppress = false;
                const openSuggest = () => {
                    if (suppress) return;
                    // open suggester deliberately; do not re-render settings while open
                    const modal = new FolderSuggestModal(
                        this.app,
                        async (folderPath) => {
                            this.plugin.settings.galleryUploadFolder = folderPath;
                            comp.setValue(folderPath);
                            await this.plugin.saveSettings();
                        },
                        () => {
                            // restore focus after close
                            suppress = true;
                            setTimeout(() => { suppress = false; }, 300);
                            setTimeout(() => comp.inputEl.focus(), 0);
                        }
                    );
                    modal.open();
                };
                // Open suggester on explicit intent only
                comp.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === ' ')) {
                        e.preventDefault();
                        openSuggest();
                    }
                });
                // Also open on click/focus for convenience
                comp.inputEl.addEventListener('focus', openSuggest);
                comp.inputEl.addEventListener('click', openSuggest);
                return comp;
            });

        // --- Timeline & Parsing ---
        new Setting(containerEl)
            .setName(t('timelineAndParsing'))
            .setHeading();

        // --- Custom fields serialization ---
        new Setting(containerEl)
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

        new Setting(containerEl)
            .setName(t('forwardDateBias'))
            .setDesc(t('forwardDateBiasDesc'))
            .addToggle(toggle => toggle
                .setValue(false)
                .onChange(async (value) => {
                    // Reserved for future persistence if we store parsing settings
                    // this.plugin.settings.forwardDate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('customToday'))
            .setDesc(t('customTodayDesc'))
            .addText(text => text
                .setPlaceholder(t('customTodayPh'))
                .setValue(this.plugin.settings.customTodayISO || '')
                .onChange(async (value) => {
                    const trimmed = value.trim();
                    this.plugin.settings.customTodayISO = trimmed || undefined;
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
        new Setting(containerEl)
            .setName(t('defaultTimelineGrouping'))
            .addDropdown(dd => dd
                .addOptions({ none: t('noGrouping'), location: t('byLocation'), group: t('byGroup') })
                .setValue(this.plugin.settings.defaultTimelineGroupMode || 'none')
                .onChange(async (v) => { this.plugin.settings.defaultTimelineGroupMode = v as 'none' | 'location' | 'group'; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName(t('defaultZoomPreset'))
            .addDropdown(dd => dd
                .addOptions({ none: t('noneOption'), fit: t('fitOption'), decade: t('decadeOption'), century: t('centuryOption') })
                .setValue(this.plugin.settings.defaultTimelineZoomPreset || 'none')
                .onChange(async (v) => { this.plugin.settings.defaultTimelineZoomPreset = v as 'none' | 'decade' | 'century' | 'fit'; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName(t('defaultStacking'))
            .addToggle(t => t
                .setValue(this.plugin.settings.defaultTimelineStack ?? true)
                .onChange(async (v) => { this.plugin.settings.defaultTimelineStack = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName(t('defaultDensity'))
            .addSlider(sl => sl
                .setLimits(0, 100, 5)
                .setValue(this.plugin.settings.defaultTimelineDensity ?? 50)
                .setDynamicTooltip()
                .onChange(async (v) => { this.plugin.settings.defaultTimelineDensity = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName(t('showLegendByDefault'))
            .addToggle(t => t
                .setValue(this.plugin.settings.showTimelineLegend ?? true)
                .onChange(async (v) => { this.plugin.settings.showTimelineLegend = v; await this.plugin.saveSettings(); }));

        // Gantt View Settings
        containerEl.createEl('h3', { text: t('ganttViewSettings') });

        new Setting(containerEl)
            .setName(t('showProgressBarsInGantt'))
            .setDesc(t('showProgressBarsInGanttDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.ganttShowProgressBars ?? true)
                .onChange(async (v) => { this.plugin.settings.ganttShowProgressBars = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
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

        new Setting(containerEl)
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

        new Setting(containerEl)
            .setName(t('timelineDefaultHeight'))
            .setDesc(t('timelineHeightDesc'))
            .addText(text => text
                .setPlaceholder(t('timelineHeightPh'))
                .setValue('380px')
                .onChange(async () => { /* no-op stub; future setting */ }));

        // --- Custom Folders & One Story Mode ---
        new Setting(containerEl)
            .setName(t('useCustomEntityFolders'))
            .setDesc(t('useCustomFoldersDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCustomEntityFolders)
                .onChange(async (value) => {
                    this.plugin.settings.enableCustomEntityFolders = value;
                    await this.plugin.saveSettings();
                    // When toggled on, ensure and scan configured custom folders
                    if (value) {
                        // Offer auto-detection first to smooth migration
                        await this.plugin.autoDetectCustomEntityFolders();
                        // If any template contains {story*} and no active story, guide the user
                        const hasStoryPlaceholder =
                            (this.plugin.settings.storyRootFolderTemplate || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.characterFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.locationFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.eventFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.itemFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.referenceFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.chapterFolderPath || '').match(/\{story(Name|Slug|Id)\}/i) ||
                            (this.plugin.settings.sceneFolderPath || '').match(/\{story(Name|Slug|Id)\}/i);
                        if (hasStoryPlaceholder && !this.plugin.settings.activeStoryId) {
                            const banner = containerEl.createDiv({ cls: 'mod-warning' });
                            banner.style.marginTop = '8px';
                            banner.setText(t('customFoldersPlaceholderWarning'));
                        } else {
                            await this.plugin.refreshCustomFolderDiscovery();
                        }
                    }
                    this.display();
                })
            );

        if (this.plugin.settings.enableCustomEntityFolders) {
            // Preview resolved folders
            new Setting(containerEl)
                .setName(t('previewResolvedFolders'))
                .setDesc(t('previewFoldersDesc'))
                .addButton(btn => btn
                    .setButtonText(t('previewBtn'))
                    .onClick(async () => {
                        const resolver = this.plugin.getFolderResolver() || null;
                        if (!resolver) return;
                        const results = resolver.resolveAll();
                        const table = containerEl.createEl('pre');
                        const lines: string[] = [];
                        for (const [k, v] of Object.entries(results as Record<string, { path?: string; error?: string }>)) {
                            const val = v.path || v.error || '—';
                            lines.push(`${k.padEnd(10)}: ${val}`);
                        }
                        table.setText(lines.join('\n'));
                    }));
            // Optional story root template
            new Setting(containerEl)
                .setName(t('storyRootFolderOptional'))
                .setDesc(t('storyRootDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('storyRootFolderPh'))
                        .setValue(this.plugin.settings.storyRootFolderTemplate || '')
                        .onChange(async (value) => {
                            this.plugin.settings.storyRootFolderTemplate = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.storyRootFolderTemplate = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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
            // NOTE: The explicit "Rescan custom folders" control is intentionally hidden.
            // Custom folders are ensured lazily when needed, and users can use the preview below to validate paths.

            // NOTE: The explicit "Detect folders" control is intentionally hidden to avoid disrupting manual setups.
            new Setting(containerEl)
                .setName(t('charactersFolder'))
                .setDesc(t('charactersFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('charactersFolderPh'))
                        .setValue(this.plugin.settings.characterFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.characterFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.characterFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

            new Setting(containerEl)
                .setName(t('locationsFolder'))
                .setDesc(t('locationsFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('locationsFolderPh'))
                        .setValue(this.plugin.settings.locationFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.locationFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.locationFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

            new Setting(containerEl)
                .setName(t('eventsFolder'))
                .setDesc(t('eventsFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('eventsFolderPh'))
                        .setValue(this.plugin.settings.eventFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.eventFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.eventFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

            new Setting(containerEl)
                .setName(t('itemsFolder'))
                .setDesc(t('itemsFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('itemsFolderPh'))
                        .setValue(this.plugin.settings.itemFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.itemFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.itemFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

            new Setting(containerEl)
                .setName(t('referencesFolder'))
                .setDesc(t('referencesFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('referencesFolderPh'))
                        .setValue(this.plugin.settings.referenceFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.referenceFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.referenceFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

            new Setting(containerEl)
                .setName(t('scenesFolder'))
                .setDesc(t('scenesFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('scenesFolderPh'))
                        .setValue(this.plugin.settings.sceneFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.sceneFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.sceneFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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
            new Setting(containerEl)
                .setName(t('chaptersFolder'))
                .setDesc(t('chaptersFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('chaptersFolderPh'))
                        .setValue(this.plugin.settings.chapterFolderPath || '')
                        .onChange(async (value) => {
                            this.plugin.settings.chapterFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
                            this.app,
                            async (folderPath) => {
                                this.plugin.settings.chapterFolderPath = folderPath;
                                comp.setValue(folderPath);
                                await this.plugin.saveSettings();
                            },
                            () => {
                                suppress = true;
                                setTimeout(() => { suppress = false; }, 300);
                                setTimeout(() => comp.inputEl.focus(), 0);
                            }
                        );
                        modal.open();
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

        // --- Map Settings Section ---
        new Setting(containerEl)
            .setName(t('mapSettings'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('enableFrontmatterMarkers'))
            .setDesc(t('enableFrontmatterMarkersDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableFrontmatterMarkers)
                .onChange(async (value) => {
                    this.plugin.settings.enableFrontmatterMarkers = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t('enableDataViewMarkers'))
            .setDesc(t('enableDataViewMarkersDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableDataViewMarkers)
                .onChange(async (value) => {
                    this.plugin.settings.enableDataViewMarkers = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t('oneStoryMode'))
            .setDesc(t('oneStoryModeDesc'))
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableOneStoryMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableOneStoryMode = value;
                    await this.plugin.saveSettings();
                    // Immediately initialize one-story mode so the UI and folders are ready
                    if (value) {
                        await this.plugin.initializeOneStoryModeIfNeeded();
                    }
                    this.display();
                })
            );

        if (!this.plugin.settings.enableCustomEntityFolders && this.plugin.settings.enableOneStoryMode) {
            new Setting(containerEl)
                .setName(t('oneStoryBaseFolder'))
                .setDesc(t('oneStoryBaseFolderDesc'))
                .addText(text => {
                    const comp = text
                        .setPlaceholder(t('oneStoryBaseFolderPh'))
                        .setValue(this.plugin.settings.oneStoryBaseFolder || 'StorytellerSuite')
                        .onChange(async (value) => {
                            // Normalize root selections like '/' to empty (vault root)
                            const normalized = (value && value.trim() === '/') ? '' : (value || 'StorytellerSuite');
                            this.plugin.settings.oneStoryBaseFolder = normalized;
                            await this.plugin.saveSettings();
                            // Ensure folders exist if user changes base
                            await this.plugin.initializeOneStoryModeIfNeeded();
                        });
                    let suppress = false;
                    const openSuggest = () => {
                        if (suppress) return;
                        const modal = new FolderSuggestModal(
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
                        );
                        modal.open();
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

        // --- Tutorial Settings ---
        new Setting(containerEl)
            .setName(t('showTutorialSection'))
            .setDesc(t('showTutorialDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTutorial)
                .onChange(async (value) => {
                    this.plugin.settings.showTutorial = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh the settings display
                })
            );

        // Privacy / Remote images
        // NOTE: Remote images are enabled by default and this toggle is intentionally hidden to reduce settings noise.

        new Setting(containerEl)
            .setName(t('support'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('supportDevelopment'))
            .setDesc(t('supportDevDesc'))
            .addButton(button => button
                .setButtonText(t('buyMeACoffee'))
                .setTooltip('Support on Ko-fi')
                .onClick(() => {
                    window.open('https://ko-fi.com/kingmaws', '_blank');
                })
            );

        new Setting(containerEl)
            .setName(t('about'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('pluginInformation'))
            .setDesc(t('pluginInfoDesc'))
            .addButton(button => button
                .setButtonText(t('github'))
                .setTooltip('View source code')
                .onClick(() => {
                    window.open('https://github.com/SamW7140/obsidian-storyteller-suite', '_blank');
                })
            );
    }

    /**
     * Add tutorial section to help new users understand the plugin features
     */
    private addTutorialSection(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(t('tutorialGettingStarted'))
            .setHeading();

        // Tutorial introduction
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

        // Collapsible sections for different topics
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
                <li>${t('tutorialWorldCalendars')}</li>
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

        // New: Recommended workflow for custom folders
        this.addTutorialCollapsible(containerEl, t('tutorialCustomTitle'),
            `<p><strong>${t('tutorialCustomSimple')}</strong></p>
            <ol>
                <li>${t('tutorialCustomStep1')}</li>
                <li>${t('tutorialCustomStep2')}</li>
                <li>${t('tutorialCustomStep3')}</li>
                <li>${t('tutorialCustomStep4')}</li>
            </ol>
            <p><strong>${t('tutorialCustomSwitching')}</strong></p>
            `);

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
│       ├── MagicSystems/   (magic system .md files)
│       └── Calendars/      (calendar .md files)
├── GalleryUploads/         (uploaded images)
└── Templates/              (saved entity templates)

${t('tutorialFileOneMode')}
[Base]/
├── Characters/
├── Locations/
├── Events/
├── Items/
├── Cultures/
├── Factions/
└── ... (all entity folders)
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

    /**
     * Helper method to create collapsible tutorial sections
     */
    private addTutorialCollapsible(containerEl: HTMLElement, title: string, content: string): void {
        const setting = new Setting(containerEl)
            .setName(title)
            .setClass('storyteller-tutorial-section');

        // Create collapsible content
        const contentEl = createDiv();
        contentEl.innerHTML = content;
        contentEl.style.display = 'none';
        contentEl.style.marginTop = '10px';
        contentEl.style.padding = '15px';
        contentEl.style.backgroundColor = 'var(--background-secondary)';
        contentEl.style.borderRadius = '5px';
        contentEl.style.fontSize = '0.9em';
        contentEl.style.lineHeight = '1.5';

        // Add click handler to toggle visibility
        setting.settingEl.style.cursor = 'pointer';
        setting.settingEl.addEventListener('click', () => {
            const isHidden = contentEl.style.display === 'none';
            contentEl.style.display = isHidden ? 'block' : 'none';
            
            // Add/remove arrow indicator
            const nameEl = setting.nameEl;
            const currentText = nameEl.textContent || '';
            if (isHidden) {
                nameEl.textContent = currentText.replace('▶ ', '').replace('▼ ', '') ;
                nameEl.textContent = '▼ ' + nameEl.textContent;
            } else {
                nameEl.textContent = currentText.replace('▶ ', '').replace('▼ ', '');
                nameEl.textContent = '▶ ' + nameEl.textContent;
            }
        });

        // Set initial arrow
        setting.nameEl.textContent = '▶ ' + (setting.nameEl.textContent || '');

        // Add content after the setting
        setting.settingEl.appendChild(contentEl);
    }
} 