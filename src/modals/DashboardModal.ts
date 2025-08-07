import { App, Setting, Notice } from 'obsidian'; // Import Notice
import StorytellerSuitePlugin from '../main'; // Import the plugin class
import { Character, Location, Event } from '../types'; // Import types
import { ResponsiveModal } from './ResponsiveModal';
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
        contentEl.createEl('h2', { text: 'Storyteller Suite dashboard' });

        new Setting(contentEl)
            .setName('Characters')
            .setDesc('Manage your story characters.')
            .addButton(button => button
                .setButtonText('View characters')
                .setCta()
                .onClick(async () => {
                    this.close();
                    const characters = await this.plugin.listCharacters();
                    new (await import('./CharacterListModal')).CharacterListModal(this.app, this.plugin, characters).open();
                }))
            .addButton(button => button
                .setButtonText('Create new')
                .onClick(async () => {
                    this.close();
                    new (await import('./CharacterModal')).CharacterModal(this.app, this.plugin, null, async (char: Character) => {
                        await this.plugin.saveCharacter(char);
                        new Notice(`Character "${char.name}" created.`);
                    }).open();
                }));

        new Setting(contentEl)
            .setName('Locations')
            .setDesc('Manage your story locations.')
            .addButton(button => button
                .setButtonText('View locations')
                .setCta()
                .onClick(async () => {
                    this.close();
                    const locations = await this.plugin.listLocations();
                    new (await import('./LocationListModal')).LocationListModal(this.app, this.plugin, locations).open();
                }))
            .addButton(button => button
                .setButtonText('Create new')
                .onClick(async () => {
                    this.close();
                    new (await import('./LocationModal')).LocationModal(this.app, this.plugin, null, async (loc: Location) => {
                        await this.plugin.saveLocation(loc);
                        new Notice(`Location "${loc.name}" created.`);
                    }).open();
                }));

        new Setting(contentEl)
            .setName('Events/timeline')
            .setDesc('Manage your story events.')
            .addButton(button => button
                .setButtonText('View timeline')
                .setCta()
                .onClick(async () => {
                    this.close();
                    const events = await this.plugin.listEvents();
                    new (await import('./TimelineModal')).TimelineModal(this.app, this.plugin, events).open();
                }))
            .addButton(button => button
                .setButtonText('Create new')
                .onClick(async () => {
                    this.close();
                    new (await import('./EventModal')).EventModal(this.app, this.plugin, null, async (evt: Event) => {
                        await this.plugin.saveEvent(evt);
                        new Notice(`Event "${evt.name}" created.`);
                    }).open();
                }));

        new Setting(contentEl)
            .setName('Gallery')
            .setDesc('Manage your story images.')
            .addButton(button => button
                .setButtonText('Open gallery')
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
