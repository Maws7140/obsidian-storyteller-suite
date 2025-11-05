import { App, Setting, Notice } from 'obsidian'; // Import Notice
import StorytellerSuitePlugin from '../main'; // Import the plugin class
import { Character, Location, Event, Map as StoryMap } from '../types'; // Import types
import { ResponsiveModal } from './ResponsiveModal';
import { t } from '../i18n/strings';
import { PlatformUtils } from '../utils/PlatformUtils';

export class DashboardModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
        this.modalEl.addClass('storyteller-dashboard-modal');
    }

    onOpen() {
        super.onOpen(); // Call ResponsiveModal's mobile optimizations
        
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('dashboardTitle') });

        new Setting(contentEl)
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

        new Setting(contentEl)
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

        new Setting(contentEl)
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

        new Setting(contentEl)
            .setName('Maps')
            .setDesc('Create and manage interactive maps for your story')
            .addButton(button => button
                .setButtonText('View Maps')
                .setCta()
                .onClick(async () => {
                    this.close();
                    const maps = await this.plugin.listMaps();
                    new (await import('./MapListModal')).MapListModal(this.app, this.plugin, maps).open();
                }))
            .addButton(button => button
                .setButtonText(t('createNew'))
                .onClick(async () => {
                    this.close();
                    await this.plugin.openMapEditor();
                }));

        new Setting(contentEl)
            .setName(t('gallery'))
            .setDesc(t('manageImagesDesc'))
            .addButton(button => button
                .setButtonText(t('viewGallery'))
                .setCta()
                .onClick(async () => {
                    this.close();
                    new (await import('./GalleryModal')).GalleryModal(this.app, this.plugin).open();
                }));
            // Add Image button might be better suited inside the gallery view itself

    }

    onClose() {
        this.contentEl.empty();
    }
}
