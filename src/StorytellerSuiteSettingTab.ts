import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';
import { FolderSuggestModal } from './modals/FolderSuggestModal';
import { setLocale, t } from './i18n/strings';

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
                dropdown
                    .addOption('en', t('english'))
                    .addOption('zh', t('chinese'))
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value) => {
                        this.plugin.settings.language = value as 'en' | 'zh';
                        await this.plugin.saveSettings();
                        setLocale(value as 'en' | 'zh');
                        new Notice(t('languageChanged'));
                    });
            });

        // --- Dashboard Tab Visibility ---
        new Setting(containerEl)
            .setName('Dashboard Tab Visibility')
            .setHeading();

        new Setting(containerEl)
            .setDesc('Choose which tabs to show in the dashboard sidebar. Hidden tabs will not appear in the tab bar.');

        // Define all available tabs with their display names
        const availableTabs = [
            { id: 'characters', name: 'Characters' },
            { id: 'locations', name: 'Locations' },
            { id: 'events', name: 'Timeline/Events' },
            { id: 'items', name: 'Plot Items' },
            { id: 'network', name: 'Network Graph' },
            { id: 'gallery', name: 'Gallery' },
            { id: 'groups', name: 'Groups' },
            { id: 'references', name: 'References' },
            { id: 'chapters', name: 'Chapters' },
            { id: 'scenes', name: 'Scenes' },
            { id: 'cultures', name: 'Cultures' },
            { id: 'economies', name: 'Economies' },
            { id: 'magicsystems', name: 'Magic Systems' }
        ];

        // Create a toggle for each tab
        availableTabs.forEach(tab => {
            const hiddenTabs = this.plugin.settings.hiddenDashboardTabs || [];
            const isVisible = !hiddenTabs.includes(tab.id);

            new Setting(containerEl)
                .setName(tab.name)
                .addToggle(toggle => toggle
                    .setValue(isVisible)
                    .setTooltip(isVisible ? 'Tab is visible' : 'Tab is hidden')
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
                        new Notice(`${tab.name} tab ${value ? 'shown' : 'hidden'}. Refresh the dashboard to see changes.`);
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
                .setValue((this.plugin.settings as any).customFieldsMode || 'flatten')
                .onChange(async (v) => {
                    (this.plugin.settings as any).customFieldsMode = (v as any);
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
                .onChange(async (v) => { this.plugin.settings.defaultTimelineGroupMode = v as any; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName(t('defaultZoomPreset'))
            .addDropdown(dd => dd
                .addOptions({ none: t('noneOption'), fit: t('fitOption'), decade: t('decadeOption'), century: t('centuryOption') })
                .setValue(this.plugin.settings.defaultTimelineZoomPreset || 'none')
                .onChange(async (v) => { this.plugin.settings.defaultTimelineZoomPreset = v as any; await this.plugin.saveSettings(); }));

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
        containerEl.createEl('h3', { text: 'Gantt View Settings' });

        new Setting(containerEl)
            .setName('Show progress bars in Gantt view')
            .setDesc('Display progress bar overlays on Gantt bars to visualize event completion.')
            .addToggle(t => t
                .setValue(this.plugin.settings.ganttShowProgressBars ?? true)
                .onChange(async (v) => { this.plugin.settings.ganttShowProgressBars = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Default Gantt duration (days)')
            .setDesc('Default duration in days for events without an end date when shown in Gantt view.')
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
            .setName('Dependency arrow style')
            .setDesc('Visual style for dependency arrows between events in Gantt view.')
            .addDropdown(dd => dd
                .addOption('solid', 'Solid')
                .addOption('dashed', 'Dashed')
                .addOption('dotted', 'Dotted')
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
                        const resolver = (this.plugin as any).buildResolver?.() || null;
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
            .setName('Map Settings')
            .setHeading();

        new Setting(containerEl)
            .setName('Enable frontmatter markers')
            .setDesc('Auto-generate markers from notes with location or mapmarkers in frontmatter')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableFrontmatterMarkers)
                .onChange(async (value) => {
                    this.plugin.settings.enableFrontmatterMarkers = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Enable DataView markers')
            .setDesc('Auto-generate markers from DataView queries (requires DataView plugin)')
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
            <p><strong>Welcome to Storyteller Suite!</strong> This plugin helps you organize and manage all aspects of your stories. Here's how to get started:</p>
            <p><em>Tip: Click any section below to expand detailed instructions and examples.</em></p>
        `;
        tutorialDesc.style.marginBottom = '1em';
        tutorialDesc.style.padding = '0.75em';
        tutorialDesc.style.backgroundColor = 'var(--background-modifier-form-field)';
        tutorialDesc.style.borderRadius = '5px';
        tutorialDesc.style.borderLeft = '3px solid var(--interactive-accent)';
        containerEl.appendChild(tutorialDesc);

        // Collapsible sections for different topics
        this.addTutorialCollapsible(containerEl, 'Dashboard and ribbon icon', 
            `<p><strong>Access the Dashboard:</strong></p>
            <ul>
                <li>Click the <strong>book-open icon</strong> in the left ribbon (sidebar)</li>
                <li>Use Command Palette: <kbd>Ctrl/Cmd + P</kbd> → "Storyteller: Open dashboard"</li>
                <li>The dashboard is your central hub for managing all story elements</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Story management', 
            `<p><strong>Creating Your First Story:</strong></p>
            <ul>
                <li>Use the <strong>"Create New Story"</strong> button below (hidden when <em>One Story Mode</em> is enabled)</li>
                <li>Or from Command Palette: "Storyteller: Create New Story"</li>
                <li>Give your story a name and description</li>
                <li>By default, the plugin creates folders at <code>StorytellerSuite/Stories/YourStoryName/</code></li>
            </ul>
            <p><strong>Managing Stories:</strong></p>
            <ul>
                <li>Switch between stories using the <strong>"Set Active"</strong> button</li>
                <li>Edit story details with the pencil icon</li>
                <li>Delete stories with the trash icon (this only removes from plugin, not your files)</li>
            </ul>
            <p><strong>Immediate activation tip:</strong> Creating a story from <em>Settings</em> updates the settings list immediately, but the dashboard's story dropdown may not refresh until you reopen the dashboard. For instant activation and UI refresh, use the dashboard/command palette action <em>"Storyteller: Create New Story"</em>, or close/reopen the dashboard via <em>"Storyteller: Open dashboard"</em>.</p>
            <p><strong>One Story Mode:</strong> When enabled in settings, the interface is simplified to a single-story layout and the <em>New story</em> button is hidden. Content is organized under a single base folder.</p>`);

        this.addTutorialCollapsible(containerEl, 'Character management', 
            `<p><strong>Creating Characters:</strong></p>
            <ul>
                <li><strong>Dashboard:</strong> Click "Create Character" button</li>
                <li><strong>Command Palette:</strong> "Storyteller: Create new character"</li>
                <li>Fill in character details, backstory, relationships</li>
                <li>Add profile images from your vault</li>
            </ul>
            <p><strong>Managing Characters:</strong></p>
            <ul>
                <li><strong>View All:</strong> Dashboard → "View Characters" or Command Palette → "Storyteller: View characters"</li>
                <li><strong>Edit:</strong> Click character name in dashboard or character list</li>
                <li><strong>Delete:</strong> Use the trash icon (moves to Obsidian trash)</li>
                <li>Characters are stored as markdown files in <code>Characters/</code> folder</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Location management', 
            `<p><strong>Creating Locations:</strong></p>
            <ul>
                <li><strong>Dashboard:</strong> Click "Create Location" button</li>
                <li><strong>Command Palette:</strong> "Storyteller: Create new location"</li>
                <li>Add descriptions, history, region, location type</li>
                <li>Link to related characters and events</li>
            </ul>
            <p><strong>Managing Locations:</strong></p>
            <ul>
                <li><strong>View All:</strong> Dashboard → "View Locations" or Command Palette → "Storyteller: View locations"</li>
                <li>Locations are stored in <code>Locations/</code> folder as markdown files</li>
                <li>Edit by clicking location name, delete with trash icon</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Event and timeline management', 
            `<p><strong>Creating Events:</strong></p>
            <ul>
                <li><strong>Dashboard:</strong> Click "Create Event" button</li>
                <li><strong>Command Palette:</strong> "Storyteller: Create new event"</li>
                <li>Set date/time, add descriptions, outcomes</li>
                <li>Link to involved characters and locations</li>
            </ul>
            <p><strong>Timeline View:</strong></p>
            <ul>
                <li><strong>Dashboard:</strong> Click "View Timeline" button</li>
                <li><strong>Command Palette:</strong> "Storyteller: View timeline"</li>
                <li>See all events chronologically ordered</li>
                <li>Events stored in <code>Events/</code> folder</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Plot items management', 
            `<p><strong>Managing Important Objects:</strong></p>
            <ul>
                <li><strong>Create:</strong> Dashboard → "Create Plot Item" or Command Palette → "Storyteller: Create new plot item"</li>
                <li><strong>Mark Critical:</strong> Use the "Plot Critical" checkbox for key story items</li>
                <li><strong>Track Ownership:</strong> Link current owner, past owners, and location</li>
                <li><strong>View All:</strong> Dashboard → "View Plot Items" or Command Palette → "Storyteller: View plot items"</li>
                <li>Items stored in <code>Items/</code> folder</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Gallery management', 
            `<p><strong>Image Organization:</strong></p>
            <ul>
                <li><strong>Access:</strong> Dashboard → "Gallery" button or Command Palette → "Storyteller: Open gallery"</li>
                <li><strong>Upload:</strong> Drag & drop images directly into the gallery</li>
                <li><strong>Organize:</strong> Add tags, categories, descriptions to images</li>
                <li><strong>Link:</strong> Easily reference gallery images in character/location profiles</li>
                <li>Configure upload folder below (default: <code>StorytellerSuite/GalleryUploads</code>)</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Groups and organization', 
            `<p><strong>Organizing with Groups:</strong></p>
            <ul>
                <li><strong>Create Groups:</strong> Command Palette → "Storyteller: Create group"</li>
                <li><strong>Add Members:</strong> Characters, locations, events, and items can be grouped</li>
                <li><strong>Manage:</strong> Rename with "Storyteller: Rename group", delete with "Storyteller: Delete group"</li>
                <li><strong>Use Cases:</strong> Royal family, specific kingdoms, plot arcs, etc.</li>
            </ul>`);

        this.addTutorialCollapsible(containerEl, 'Story discovery and import', 
            `<p><strong>Automatic Discovery:</strong></p>
            <ul>
                <li>Plugin automatically detects existing <code>StorytellerSuite/Stories/</code> folders</li>
                <li><strong>Manual Refresh:</strong> Command Palette → "Storyteller: Refresh story discovery"</li>
                <li>Import existing story folders without losing data</li>
                <li>Useful when moving stories between vaults</li>
            </ul>`);

        // New: Recommended workflow for custom folders
        this.addTutorialCollapsible(containerEl, 'Custom folders: recommended manual workflow',
            `<p><strong>Simple, reliable setup for custom folders:</strong></p>
            <ol>
                <li><strong>Create your story folder and subfolders manually</strong> in your vault (e.g., <code>Creative/Writing/My_Story/Characters</code>, <code>Locations</code>, <code>Events</code>, etc.).</li>
                <li>In Settings → Storyteller Suite → enable <strong>Use custom entity folders</strong>. Optionally set a <strong>Story root folder</strong> template for convenience.</li>
                <li>Open the dashboard and use <strong>"Create new story"</strong>. After creation, <strong>refresh/activate</strong> the dashboard. The plugin will recognize your manual story folder as the active story.</li>
                <li>Use <strong>Preview resolved folders</strong> in settings to confirm the exact paths the plugin will use.</li>
            </ol>
            <p><strong>Switching stories in custom-folder mode:</strong> Use the <em>story dropdown at the top of the dashboard</em> to change the active story. Then go to <em>Settings → Storyteller Suite</em> and <strong>manually assign per‑entity folders</strong> for that story . Sorry I know this is a bit janky.</p>
            `);

        this.addTutorialCollapsible(containerEl, 'Keyboard shortcuts and commands', 
            `<p><strong>All Available Commands (via Ctrl/Cmd + P):</strong></p>
            <ul>
                <li><strong>Storyteller: Open dashboard</strong> - Main interface</li>
                <li><strong>Storyteller: Create New Story</strong> - Start a new story project</li>
                <li><strong>Storyteller: Create new character/location/event/plot item</strong></li>
                <li><strong>Storyteller: View characters/locations/timeline/plot items</strong></li>
                <li><strong>Storyteller: Open gallery</strong> - Image management</li>
                <li><strong>Storyteller: Create/Rename/Delete group</strong> - Organization</li>
                <li><strong>Storyteller: Refresh story discovery</strong> - Import existing folders</li>
            </ul>
            <p><strong>Tip:</strong> You can assign custom hotkeys to any of these commands in Obsidian's Hotkeys settings!</p>`);

        this.addTutorialCollapsible(containerEl, 'File structure and integration', 
            `<p><strong>How Your Files Are Organized:</strong></p>
            <pre><code>Default (multi-story):
StorytellerSuite/
├── Stories/
│   └── YourStoryName/
│       ├── Characters/     (character .md files)
│       ├── Locations/      (location .md files)
│       ├── Events/         (event .md files)
│       └── Items/          (plot item .md files)
└── GalleryUploads/         (uploaded images)

One Story Mode (flattened):
[Base]/
├── Characters/
├── Locations/
├── Events/
└── Items/

Custom Folders:
Characters: [your path]
Locations:  [your path]
Events:     [your path]
Items:      [your path]
</code></pre>
            <p><strong>Obsidian Integration:</strong></p>
            <ul>
                <li>All data stored as <strong>markdown files</strong> with frontmatter</li>
                <li>Fully compatible with <strong>Dataview plugin</strong> for custom queries</li>
                <li>Use <strong>[[wiki links]]</strong> to connect characters, locations, events</li>
                <li>Files are <strong>readable and editable</strong> even without the plugin</li>
                <li><strong>Backup safe:</strong> Your data is never locked in a proprietary format</li>
            </ul>
            <p><strong>Tip:</strong> Configure these modes in Settings → Storyteller Suite under <em>Use custom entity folders</em> and <em>One Story Mode</em>. The <em>New story</em> button is hidden automatically in One Story Mode.</p>`);
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