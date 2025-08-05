import { App, PluginSettingTab, Setting } from 'obsidian';
import StorytellerSuitePlugin from './main';
import { NewStoryModal } from './modals/NewStoryModal';
import { EditStoryModal } from './modals/EditStoryModal';

export class StorytellerSuiteSettingTab extends PluginSettingTab {
    plugin: StorytellerSuitePlugin;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // --- Story Management Section ---
        new Setting(containerEl)
            .setName('Stories')
            .setHeading();

        // List all stories and allow selection
        this.plugin.settings.stories.forEach(story => {
            const isActive = this.plugin.settings.activeStoryId === story.id;
            new Setting(containerEl)
                .setName(story.name)
                .setDesc(story.description || '')
                .addButton(btn => btn
                    .setButtonText(isActive ? 'Active' : 'Set Active')
                    .setCta()
                    .setDisabled(isActive)
                    .onClick(async () => {
                        await this.plugin.setActiveStory(story.id);
                        this.display();
                    })
                )
                .addExtraButton(btn => btn
                    .setIcon('pencil')
                    .setTooltip('Edit Story')
                    .onClick(async () => {
                        const existingNames = this.plugin.settings.stories.map(s => s.name);
                        new EditStoryModal(
                            this.app,
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
                    .setTooltip('Delete')
                    .onClick(async () => {
                        if (confirm(`Delete story "${story.name}"? This cannot be undone.`)) {
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
                .setButtonText('Create New Story')
                .setCta()
                .onClick(async () => {
                    const existingNames = this.plugin.settings.stories.map(s => s.name);
                    new NewStoryModal(
                        this.app, 
                        existingNames, 
                        async (name: string, description?: string) => {
                            await this.plugin.createStory(name, description);
                            this.display();
                        }
                    ).open();
                })
            );

        // --- Gallery Upload Folder ---
        new Setting(containerEl)
            .setName('Gallery upload folder')
            .setDesc('Folder where uploaded gallery images will be stored')
            .addText(text => text
                .setPlaceholder('StorytellerSuite/GalleryUploads')
                .setValue(this.plugin.settings.galleryUploadFolder)
                .onChange(async (value) => {
                    this.plugin.settings.galleryUploadFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Support')
            .setHeading();

        new Setting(containerEl)
            .setName('Support development')
            .setDesc('If you find this plugin helpful, consider supporting its development')
            .addButton(button => button
                .setButtonText('Buy me a coffee')
                .setTooltip('Support on Ko-fi')
                .onClick(() => {
                    window.open('https://ko-fi.com/kingmaws', '_blank');
                })
            );

        new Setting(containerEl)
            .setName('About')
            .setHeading();

        new Setting(containerEl)
            .setName('Plugin information')
            .setDesc('Storyteller Suite - A comprehensive suite for managing characters, locations, events, and galleries for your stories.')
            .addButton(button => button
                .setButtonText('GitHub')
                .setTooltip('View source code')
                .onClick(() => {
                    window.open('https://github.com/SamW7140/obsidian-storyteller-suite', '_blank');
                })
            );
    }
} 