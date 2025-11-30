import { App, Setting, Notice } from 'obsidian'; // Import Notice
import StorytellerSuitePlugin from '../main'; // Import the plugin class
import { Character, Location, Event, Map as StoryMap } from '../types'; // Import types
import { ResponsiveModal } from './ResponsiveModal';
import { t } from '../i18n/strings';
import { PlatformUtils } from '../utils/PlatformUtils';

export class DashboardModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;
    private currentTab: string = 'characters';
    private tabContainer: HTMLElement;
    private contentContainer: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.modalEl.addClass('storyteller-dashboard-modal');
    }

    onOpen() {
        super.onOpen(); // Call ResponsiveModal's mobile optimizations

        const { contentEl } = this;
        contentEl.empty();

        // Create header
        contentEl.createEl('h2', { text: t('dashboardTitle') });

        // Create scrollable tab container
        this.tabContainer = contentEl.createEl('div', {
            cls: 'storyteller-tab-container'
        });

        // Create content container
        this.contentContainer = contentEl.createEl('div', {
            cls: 'storyteller-content-container'
        });

        // Define tabs with icons
        const tabs = [
            { id: 'characters', label: t('characters'), icon: '👤' },
            { id: 'locations', label: t('locations'), icon: '📍' },
            { id: 'events', label: t('events'), icon: '📅' },
            { id: 'gallery', label: t('gallery'), icon: '🖼️' }
        ];

        // Create tab buttons
        tabs.forEach(tab => {
            const tabBtn = this.tabContainer.createEl('button', {
                cls: 'storyteller-tab-button',
                text: `${tab.icon} ${tab.label}`
            });

            // Mark first tab as active
            if (tab.id === this.currentTab) {
                tabBtn.addClass('is-active');
            }

            tabBtn.addEventListener('click', () => {
                this.switchToTab(tab.id);

                // Update active states
                this.tabContainer.querySelectorAll('.storyteller-tab-button').forEach(btn => {
                    btn.removeClass('is-active');
                });
                tabBtn.addClass('is-active');

                // Trigger haptic feedback on mobile
                this.triggerHapticFeedback('light');
            });
        });

        // Load first tab by default
        this.switchToTab(this.currentTab);
    }

    private switchToTab(tabId: string) {
        this.currentTab = tabId;
        this.contentContainer.empty();

        switch (tabId) {
            case 'characters':
                this.renderCharactersTab();
                break;
            case 'locations':
                this.renderLocationsTab();
                break;
            case 'events':
                this.renderEventsTab();
                break;
            case 'gallery':
                this.renderGalleryTab();
                break;
        }
    }

    private renderCharactersTab() {
        new Setting(this.contentContainer)
            .setName(t('characters'))
            .setDesc(t('manageCharactersDesc'))
            .addButton(button => button
                .setButtonText(t('viewCharacters'))
                .setCta()
                .onClick(async () => {
                    this.close();
                    const characters = await this.plugin.listCharacters();
                    new (await import('./CharacterListModal')).CharacterListModal(this.app, this.plugin, characters).open();
                }))
            .addButton(button => button
                .setButtonText(t('createNew'))
                .onClick(async () => {
                    this.close();
                    new (await import('./CharacterModal')).CharacterModal(this.app, this.plugin, null, async (char: Character) => {
                        await this.plugin.saveCharacter(char);
                        new Notice(t('created', t('character'), char.name));
                        new Notice(t('noteCreatedWithSections'));
                    }).open();
                }));
    }

    private renderLocationsTab() {
        new Setting(this.contentContainer)
            .setName(t('locations'))
            .setDesc(t('manageLocationsDesc'))
            .addButton(button => button
                .setButtonText(t('viewLocations'))
                .setCta()
                .onClick(async () => {
                    this.close();
                    const locations = await this.plugin.listLocations();
                    new (await import('./LocationListModal')).LocationListModal(this.app, this.plugin, locations).open();
                }))
            .addButton(button => button
                .setButtonText(t('createNew'))
                .onClick(async () => {
                    this.close();
                    new (await import('./LocationModal')).LocationModal(this.app, this.plugin, null, async (loc: Location) => {
                        await this.plugin.saveLocation(loc);
                        new Notice(t('created', t('location'), loc.name));
                        new Notice(t('noteCreatedWithSections'));
                    }).open();
                }));
    }

    private renderEventsTab() {
        new Setting(this.contentContainer)
            .setName(t('events'))
            .setDesc(t('manageEventsDesc'))
            .addButton(button => button
                .setButtonText(t('viewTimeline'))
                .setCta()
                .onClick(async () => {
                    this.close();
                    const events = await this.plugin.listEvents();
                    new (await import('./TimelineModal')).TimelineModal(this.app, this.plugin, events).open();
                }))
            .addButton(button => button
                .setButtonText(t('createNew'))
                .onClick(async () => {
                    this.close();
                    new (await import('./EventModal')).EventModal(this.app, this.plugin, null, async (evt: Event) => {
                        await this.plugin.saveEvent(evt);
                        new Notice(t('created', t('event'), evt.name));
                        new Notice(t('noteCreatedWithSections'));
                    }).open();
                }));
    }

    private renderGalleryTab() {
        new Setting(this.contentContainer)
            .setName(t('gallery'))
            .setDesc(t('manageImagesDesc'))
            .addButton(button => button
                .setButtonText(t('viewGallery'))
                .setCta()
                .onClick(async () => {
                    this.close();
                    new (await import('./GalleryModal')).GalleryModal(this.app, this.plugin).open();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
