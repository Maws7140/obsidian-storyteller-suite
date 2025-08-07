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

        // --- Tutorial Section ---
        if (this.plugin.settings.showTutorial) {
            this.addTutorialSection(containerEl);
        }

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

        // --- Custom Folders & One Story Mode ---
        new Setting(containerEl)
            .setName('Use custom entity folders')
            .setDesc('When enabled, use the folder paths below for Characters, Locations, Events, and Items instead of auto-generated story folders.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCustomEntityFolders)
                .onChange(async (value) => {
                    this.plugin.settings.enableCustomEntityFolders = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (this.plugin.settings.enableCustomEntityFolders) {
            new Setting(containerEl)
                .setName('Characters folder')
                .setDesc('Path for character markdown files')
                .addText(text => text
                    .setPlaceholder('MyStory/Characters')
                    .setValue(this.plugin.settings.characterFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.characterFolderPath = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName('Locations folder')
                .setDesc('Path for location markdown files')
                .addText(text => text
                    .setPlaceholder('MyStory/Locations')
                    .setValue(this.plugin.settings.locationFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.locationFolderPath = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName('Events folder')
                .setDesc('Path for event markdown files')
                .addText(text => text
                    .setPlaceholder('MyStory/Events')
                    .setValue(this.plugin.settings.eventFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.eventFolderPath = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName('Items folder')
                .setDesc('Path for item markdown files')
                .addText(text => text
                    .setPlaceholder('MyStory/Items')
                    .setValue(this.plugin.settings.itemFolderPath || '')
                    .onChange(async (value) => {
                        this.plugin.settings.itemFolderPath = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        new Setting(containerEl)
            .setName('One Story Mode')
            .setDesc('Flatten the folder structure to a single story. When enabled (and custom folders disabled), content goes under a single base folder without Stories/StoryName.')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableOneStoryMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableOneStoryMode = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (!this.plugin.settings.enableCustomEntityFolders && this.plugin.settings.enableOneStoryMode) {
            new Setting(containerEl)
                .setName('One Story base folder')
                .setDesc('Base folder for Characters/Locations/Events/Items')
                .addText(text => text
                    .setPlaceholder('StorytellerSuite')
                    .setValue(this.plugin.settings.oneStoryBaseFolder || 'StorytellerSuite')
                    .onChange(async (value) => {
                        this.plugin.settings.oneStoryBaseFolder = value || 'StorytellerSuite';
                        await this.plugin.saveSettings();
                    })
                );
        }

        // --- Tutorial Settings ---
        new Setting(containerEl)
            .setName('Show tutorial section')
            .setDesc('Display the tutorial and getting started section in settings')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTutorial)
                .onChange(async (value) => {
                    this.plugin.settings.showTutorial = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh the settings display
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

    /**
     * Add tutorial section to help new users understand the plugin features
     */
    private addTutorialSection(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Tutorial and getting started')
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
                <li>Use the <strong>"Create New Story"</strong> button below</li>
                <li>Or from Command Palette: "Storyteller: Create New Story"</li>
                <li>Give your story a name and description</li>
                <li>The plugin automatically creates folder structure: <code>StorytellerSuite/Stories/YourStoryName/</code></li>
            </ul>
            <p><strong>Managing Stories:</strong></p>
            <ul>
                <li>Switch between stories using the <strong>"Set Active"</strong> button</li>
                <li>Edit story details with the pencil icon</li>
                <li>Delete stories with the trash icon (this only removes from plugin, not your files)</li>
            </ul>`);

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
            <pre><code>StorytellerSuite/
├── Stories/
│   └── YourStoryName/
│       ├── Characters/     (character .md files)
│       ├── Locations/      (location .md files)
│       ├── Events/         (event .md files)
│       └── Items/          (plot item .md files)
└── GalleryUploads/         (uploaded images)
</code></pre>
            <p><strong>Obsidian Integration:</strong></p>
            <ul>
                <li>All data stored as <strong>markdown files</strong> with frontmatter</li>
                <li>Fully compatible with <strong>Dataview plugin</strong> for custom queries</li>
                <li>Use <strong>[[wiki links]]</strong> to connect characters, locations, events</li>
                <li>Files are <strong>readable and editable</strong> even without the plugin</li>
                <li><strong>Backup safe:</strong> Your data is never locked in a proprietary format</li>
            </ul>`);
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