import { App, PluginSettingTab, Setting, Notice, TFolder, setIcon } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';
import { FolderSuggestModal } from './modals/FolderSuggestModal';
import { CustomSheetTemplateModal } from './modals/CustomSheetTemplateModal';
import { getGettingStartedGuide, renderGuideDocument } from './tutorial/StorytellerGuideContent';
import { BUILT_IN_SHEET_TEMPLATES } from './utils/CharacterSheetTemplates';
import { setLocale, t, getAvailableLanguages, getLanguageName, isLanguageAvailable } from './i18n/strings';
import { VIEW_TYPE_DASHBOARD } from './views/DashboardView';
import { confirmWithModal } from './modals/ui/ConfirmModal';
import type { TemplateEntityType } from './templates/TemplateTypes';
import { PlatformUtils } from './utils/PlatformUtils';

type TabId = 'stories' | 'dashboard' | 'folders' | 'timeline' | 'maps' | 'templates' | 'gallery' | 'help';

// Video walkthrough for the Help tab. Empty shows a coming-soon state.
const TUTORIAL_VIDEO_URL = 'https://www.youtube.com/watch?v=HL0i6bUpVn0';

interface TabDef { id: TabId; icon: string; label: string; }

interface ReopenableView {
    onOpen(): Promise<void> | void;
}

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

        // Obsidian 1.13 moves settings content into a separate window. On some
        // devices the move happens after the display() re-render loop below has
        // exhausted its time budget, leaving the migrated container empty. Use
        // Obsidian's window-migration hook so recovery runs in the target
        // window after the move has completed.
        const removeWindowMigrationListener = this.containerEl.onWindowMigrated(win => {
            win.setTimeout(() => {
                if (this.containerEl.isConnected && this.containerEl.childElementCount === 0) {
                    this.display();
                }
            }, 0);
        });
        plugin.register(removeWindowMigrationListener);
    }

    private activeRenderToken = 0;

    display(): void {
        const token = ++this.activeRenderToken;
        this.renderWithGuard();

        // Obsidian 1.13 opens Settings in a separate window and can swap in the
        // real container *after* display() first runs, discarding our initial
        // render so the pane stays blank until settings are reopened. The delay
        // before the container settles varies by device, so a fixed timer isn't
        // enough. Instead, keep re-rendering whenever the current container is
        // empty until it sticks (or we hit the time budget). This automates the
        // manual "call display() again" that reliably repopulates the pane.
        // renderSettings() empties first, so re-rendering a populated pane never
        // happens (guarded by the empty check) and this is a no-op once content
        // is present.
        const started = Date.now();
        const tick = () => {
            if (token !== this.activeRenderToken) return; // navigated away or re-displayed
            if (this.containerEl && this.containerEl.childElementCount === 0) {
                this.renderWithGuard();
            }
            if (Date.now() - started < 5000) {
                window.setTimeout(tick, 150);
            }
        };
        window.setTimeout(tick, 50);
    }

    hide(): void {
        // Invalidate any pending re-render loop so it can't repopulate the pane
        // after the user has navigated away or closed settings.
        this.activeRenderToken++;
        super.hide();
    }

    private renderWithGuard(): void {
        try {
            this.renderSettings();
        } catch (error) {
            // Never leave the pane blank: surface the failure in-place so we (and
            // the user) can see what went wrong instead of an empty window.
            const msg = error instanceof Error ? (error.stack || error.message) : String(error);
            console.error('[STS] settings display() failed:', error);
            try {
                this.containerEl.empty();
                this.containerEl.addClass('sts-settings-root');
                this.containerEl.createEl('h3', { text: 'Storyteller settings failed to render' });
                this.containerEl.createEl('pre', {
                    text: msg,
                    cls: 'setting-item-description',
                });
            } catch { /* last resort: swallow */ }
        }
    }

    private renderSettings(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('sts-settings-root');

        // Defensive: settings loaded from disk may be missing collections (older or
        // partially-migrated data). Without this guard a later `.forEach` throws and
        // the whole settings pane renders blank.
        if (!Array.isArray(this.plugin.settings.stories)) {
            this.plugin.settings.stories = [];
        }
        if (!Array.isArray(this.plugin.settings.groups)) {
            this.plugin.settings.groups = [];
        }

        const wrapper = containerEl.createDiv('sts-settings-wrapper');
        const nav     = wrapper.createDiv('sts-settings-nav');
        const content = wrapper.createDiv('sts-settings-content');

        // Obsidian 1.13 opens Settings in a separate window where the plugin's
        // styles.css is not guaranteed to be injected. Without it the layout
        // rules below are missing, the flex row collapses, and the pane renders
        // blank. Apply the essential, non-collapsing layout inline so it holds
        // regardless of whether the stylesheet reached this window.
        // These assignments are inline on purpose (see comment above): in Obsidian 1.13's
        // separate settings window the stylesheet is not guaranteed to apply, so the essential
        // non-collapsing layout has to be set directly or the pane renders blank.
        /* eslint-disable obsidianmd/no-static-styles-assignment */
        containerEl.style.minHeight = '360px';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'flex-start';
        wrapper.style.minHeight = '360px';
        wrapper.style.width = '100%';
        nav.style.flexShrink = '0';
        nav.style.display = 'flex';
        nav.style.flexDirection = 'column';
        if (!nav.style.width) nav.style.width = '160px';
        content.style.flex = '1';
        content.style.minWidth = '0';
        /* eslint-enable obsidianmd/no-static-styles-assignment */

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
        try {
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
        } catch (error) {
            // Surface a message instead of leaving the settings pane blank.
            container.empty();
            container.createEl('p', {
                text: `Could not render this settings section: ${error instanceof Error ? error.message : String(error)}`,
                cls: 'setting-item-description'
            });
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
                        (folderPath) => { void (async () => {
                            setValue(folderPath);
                            comp.setValue(folderPath);
                            await this.plugin.saveSettings();
                        })(); },
                        () => {
                            suppress = true;
                            window.setTimeout(() => { suppress = false; }, 300);
                            window.setTimeout(() => comp.inputEl.focus(), 0);
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

    // ─── Utility: all vault folder paths (sorted) ────────────────────────────
    private getVaultFolderPaths(): string[] {
        const paths = this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder)
            .map(folder => folder.path)
            .filter(path => path && path !== '/');
        return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
    }

    // ─── Utility: folder dropdown setting ────────────────────────────────────
    private addFolderDropdownSetting(
        container: HTMLElement,
        name: string,
        desc: string,
        getValue: () => string,
        setValue: (v: string) => void
    ): Setting {
        return new Setting(container)
            .setName(name)
            .setDesc(desc)
            .addDropdown(dropdown => {
                dropdown.addOption('', '— vault root —');
                const folders = this.getVaultFolderPaths();
                const current = getValue();
                // Keep the saved value selectable even if that folder no longer exists.
                if (current && !folders.includes(current)) {
                    dropdown.addOption(current, `${current} (missing)`);
                }
                folders.forEach(path => { dropdown.addOption(path, path); });
                dropdown.setValue(current ?? '');
                dropdown.onChange(async (value) => {
                    setValue(value);
                    await this.plugin.saveSettings();
                });
            });
    }

    // ─── Tab: Stories ─────────────────────────────────────────────────────────
    private renderStoriesTab(container: HTMLElement): void {
        new Setting(container)
            .setName(t('language'))
            .setDesc(t('selectLanguage'))
            .addDropdown(dropdown => {
                const availableLanguages = getAvailableLanguages();
                availableLanguages.forEach(lang => { dropdown.addOption(lang, getLanguageName(lang)); });
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
                        if (await confirmWithModal(this.app, {
                            title: t('delete'),
                            body: t('confirmDeleteStory', story.name),
                            confirmText: t('delete')
                        })) {
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
        new Setting(container).setName('Writing goal').setHeading();

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
                        await this.plugin.wordTracker.setDailyGoal(goal);
                    } else {
                        this.plugin.settings.dailyWordCountGoal = goal;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(container)
            .setName('Writing goal folders')
            .setDesc('Optional. One folder per line. When set, only Markdown files in these folders count toward the daily writing goal.')
            .addTextArea(text => {
                text
                    .setPlaceholder('Drafts\nmanuscript/scenes')
                    .setValue((this.plugin.settings.dailyWordCountGoalFolders || []).join('\n'))
                    .onChange(async (value) => {
                        const folders = value
                            .split(/\r?\n/)
                            .map(folder => folder.trim())
                            .filter(Boolean);
                        if (this.plugin.wordTracker) {
                            await this.plugin.wordTracker.setDailyGoalFolders(folders);
                        } else {
                            this.plugin.settings.dailyWordCountGoalFolders = folders;
                            await this.plugin.saveSettings();
                        }
                    });
                text.inputEl.rows = 3;
            });

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
                        const view = leaf.view as unknown as Partial<ReopenableView>;
                        if (typeof view.onOpen === 'function') {
                            await view.onOpen();
                        }
                    }));
                })
            );

        new Setting(container).setName('Interface').setHeading();

        new Setting(container)
            .setName('Interface layout')
            .setDesc('Auto-detect chooses desktop, tablet, or phone layouts from the platform. Force a layout if detection gets it wrong — e.g. touch-screen laptops flipping into tablet mode. Existing dialogs pick up the change when reopened.')
            .addDropdown(dropdown => dropdown
                .addOption('auto', 'Auto-detect')
                .addOption('desktop', 'Desktop')
                .addOption('tablet', 'Tablet')
                .addOption('phone', 'Phone')
                .setValue(this.plugin.settings.interfaceMode ?? 'auto')
                .onChange(async (value) => {
                    const mode = value as import('./utils/PlatformUtils').InterfaceLayoutOverride;
                    this.plugin.settings.interfaceMode = mode;
                    PlatformUtils.setLayoutOverride(mode);
                    await this.plugin.saveSettings();
                })
            );

        new Setting(container).setName('Compile').setHeading();

        new Setting(container)
            .setName('Enable custom JavaScript compile steps')
            .setDesc('Run the JavaScript code of your custom compile steps during compilation. Warning: this executes arbitrary JavaScript stored in plugin settings, which can sync between devices and travel with imported data. Only enable if you trust every custom step in this vault. When off, custom steps are skipped with a notice.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCustomCompileJs)
                .onChange(async (value) => {
                    this.plugin.settings.enableCustomCompileJs = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        new Notice('Custom compile steps will now execute their JavaScript. Review your steps before compiling.');
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
                            banner.setCssStyles({ marginTop: '8px' });
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
                            (folderPath) => { void (async () => {
                                const chosen = (!folderPath || folderPath === '/') ? '' : folderPath;
                                this.plugin.settings.oneStoryBaseFolder = chosen || 'StorytellerSuite';
                                comp.setValue(chosen);
                                await this.plugin.saveSettings();
                                await this.plugin.initializeOneStoryModeIfNeeded();
                            })(); },
                            () => {
                                suppress = true;
                                window.setTimeout(() => { suppress = false; }, 300);
                                window.setTimeout(() => comp.inputEl.focus(), 0);
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
        new Setting(container).setName(t('ganttViewSettings')).setHeading();

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
        new Setting(container).setName('Vault note timeline inclusion').setHeading();

        const watchPropSetting = new Setting(container)
            .setName('Timeline watch property')
            .setDesc('Frontmatter property name — any note with this property will appear on the timeline using its value as the date.')
            .addText(text => text
                .setPlaceholder('Timeline-date')
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
            .setDesc('Tag to watch — any note with this tag and a frontmatter "date" field will appear on the timeline.')
            .addText(text => text
                .setPlaceholder('Timeline')
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
            .setName('Disable leaflet global exposure')
            .setDesc('Prevents storyteller suite from exposing leaflet globally. Use if you experience conflicts with the standalone Obsidian leaflet plugin. Requires plugin reload.')
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

        // Map tiles
        new Setting(container).setName('Map tiles').setHeading();

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
                .addOption('128', '128Px')
                .addOption('256', '256Px (recommended)')
                .addOption('512', '512Px')
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
            .setDesc('Prevent the plugin from creating any folders (storytellersuite, templates, entity folders, etc.) on startup. Enable this if you use your own custom folder structure. Folders will still be created when you explicitly create entities. Requires plugin reload.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.disableAutoFolderCreation)
                .onChange(async (value) => {
                    this.plugin.settings.disableAutoFolderCreation = value;
                    await this.plugin.saveSettings();
                    new Notice('Plugin reload required for this setting to take effect.');
                }));

        new Setting(container).setDesc(t('defaultTemplatesDesc'));

        const entityTypesWithTemplates: Array<{ key: TemplateEntityType; label: string }> = [
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
            const templates = this.plugin.templateManager?.getTemplatesByEntityType(entityType.key) || [];
            const currentTemplateId = this.plugin.settings.defaultTemplates?.[entityType.key] || '';
            new Setting(container)
                .setName(t('defaultTemplateFor', entityType.label))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('noDefaultTemplate'));
                    templates.forEach(template => { dropdown.addOption(template.id, template.name); });
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
        new Setting(container).setName('Character sheet templates').setHeading();

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
                    new CustomSheetTemplateModal(this.app, tpl, updated => { void (async () => {
                        const idx = (this.plugin.settings.characterSheetTemplates ?? []).findIndex(t => t.id === tpl.id);
                        if (idx !== -1 && this.plugin.settings.characterSheetTemplates) {
                            this.plugin.settings.characterSheetTemplates[idx] = updated;
                            await this.plugin.saveSettings();
                            this.renderCharacterSheetTemplatesSection_refresh(container);
                        }
                    })(); }).open();
                });

                const delBtn = actions.createEl('button', { cls: 'clickable-icon mod-warning', attr: { 'aria-label': 'Delete' } });
                setIcon(delBtn, 'trash');
                delBtn.addEventListener('click', () => { void (async () => {
                    this.plugin.settings.characterSheetTemplates = (this.plugin.settings.characterSheetTemplates ?? []).filter(t => t.id !== tpl.id);
                    if (this.plugin.settings.defaultCharacterSheetTemplateId === tpl.id) {
                        this.plugin.settings.defaultCharacterSheetTemplateId = 'classic';
                    }
                    await this.plugin.saveSettings();
                    this.renderCharacterSheetTemplatesSection_refresh(container);
                })(); });
            }
        }

        const addRow = container.createDiv('sts-cstpl-add-btn-row');
        const addBtn = addRow.createEl('button', { text: '+ add custom template', cls: 'mod-cta' });
        addBtn.addEventListener('click', () => {
            new CustomSheetTemplateModal(this.app, null, tpl => { void (async () => {
                if (!this.plugin.settings.characterSheetTemplates) this.plugin.settings.characterSheetTemplates = [];
                this.plugin.settings.characterSheetTemplates.push(tpl);
                await this.plugin.saveSettings();
                this.renderCharacterSheetTemplatesSection_refresh(container);
            })(); }).open();
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

        new Setting(container)
            .setName('Gallery scope')
            .setDesc('Keep the existing vault-wide gallery, or scope gallery entries by story and book.')
            .addDropdown(dropdown => dropdown
                .addOption('vault', 'Vault-wide gallery')
                .addOption('book', 'Story/book scoped gallery')
                .setValue(this.plugin.settings.galleryScopeMode ?? 'vault')
                .onChange(async (value) => {
                    this.plugin.settings.galleryScopeMode = value as 'vault' | 'book';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if ((this.plugin.settings.galleryScopeMode ?? 'vault') === 'book') {
            new Setting(container)
                .setName('Shared gallery stories')
                .setDesc('Selected stories share visible gallery entries with the active story while scoped mode is enabled.')
                .setHeading();

            const sharedStoryIds = new Set(this.plugin.settings.gallerySharedStoryIds ?? []);
            for (const story of this.plugin.settings.stories) {
                const isActive = story.id === this.plugin.settings.activeStoryId;
                new Setting(container)
                    .setName(story.name)
                    .setDesc(isActive ? 'Active story is always included.' : 'Include this story in the current scoped gallery.')
                    .addToggle(toggle => toggle
                        .setValue(isActive || sharedStoryIds.has(story.id))
                        .setDisabled(isActive)
                        .onChange(async (value) => {
                            const next = new Set(this.plugin.settings.gallerySharedStoryIds ?? []);
                            if (value) next.add(story.id);
                            else next.delete(story.id);
                            next.delete(this.plugin.settings.activeStoryId);
                            this.plugin.settings.gallerySharedStoryIds = Array.from(next);
                            await this.plugin.saveSettings();
                        }));
            }
        }

        this.addFolderDropdownSetting(container,
            t('galleryUploadFolder'), t('galleryFolderDesc'),
            () => this.plugin.settings.galleryUploadFolder,
            v => { this.plugin.settings.galleryUploadFolder = v; }
        );

        new Setting(container)
            .setName('Auto-watch folder')
            .setDesc('Images placed in this folder are automatically added to the gallery. Leave empty to disable.')
            .addText(text => text
                .setPlaceholder('E.g. Storytellersuite/gallerywatch')
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

        if (TUTORIAL_VIDEO_URL) {
            new Setting(container)
                .setName('Video tutorial')
                .setDesc('Watch a full walkthrough of Storyteller Suite — stories, entities, the timeline, campaign play, and compiling.')
                .addButton(button => button
                    .setButtonText('Watch video')
                    .setCta()
                    .onClick(() => window.open(TUTORIAL_VIDEO_URL, '_blank')));
        } else {
            new Setting(container)
                .setName('Video tutorial')
                .setDesc('A full video walkthrough is on its way — it will appear here when it is published.')
                .addButton(button => button
                    .setButtonText('Coming soon')
                    .setDisabled(true));
        }

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
                .setTooltip('Support on ko-fi')
                .onClick(() => window.open('https://ko-fi.com/kingmaws', '_blank'))
            );

        new Setting(container).setName(t('about')).setHeading();

        new Setting(container)
            .setName(t('pluginInformation'))
            .setDesc(t('pluginInfoDesc'))
            .addButton(button => button
                .setButtonText(t('github'))
                .setTooltip('View source code')
                .onClick(() => window.open('https://github.com/Maws7140/obsidian-storyteller-suite', '_blank'))
            );

        new Setting(container)
            .setName('Contact')
            .setDesc('Found a bug or have a feature request? Open an issue on GitHub.')
            .addButton(button => button
                .setButtonText('Open an issue')
                .setTooltip('Report a bug or request a feature')
                .onClick(() => window.open('https://github.com/Maws7140/obsidian-storyteller-suite/issues', '_blank'))
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
