 
import { App, ButtonComponent, Modal, Setting, TextComponent, TextAreaComponent, setIcon } from 'obsidian';
import { Story } from '../types';
import { t } from '../i18n/strings';
import type StorytellerSuitePlugin from '../main';
import type { StoryFolderOverrides } from '../folders/FolderResolver';

export type EditStoryModalSubmitCallback = (name: string, description?: string, folderOverrides?: StoryFolderOverrides) => Promise<void>;

/** The folder settings a story can override, in the order they are shown. */
const FOLDER_OVERRIDE_FIELDS: Array<{ key: keyof StoryFolderOverrides; label: string; defaultLeaf?: string }> = [
    { key: 'storyRootFolderTemplate', label: 'Story root' },
    { key: 'characterFolderPath', label: 'Characters', defaultLeaf: 'Characters' },
    { key: 'locationFolderPath', label: 'Locations', defaultLeaf: 'Locations' },
    { key: 'eventFolderPath', label: 'Events', defaultLeaf: 'Events' },
    { key: 'itemFolderPath', label: 'Items', defaultLeaf: 'Items' },
    { key: 'referenceFolderPath', label: 'References', defaultLeaf: 'References' },
    { key: 'chapterFolderPath', label: 'Chapters', defaultLeaf: 'Chapters' },
    { key: 'sceneFolderPath', label: 'Scenes', defaultLeaf: 'Scenes' },
    { key: 'mapFolderPath', label: 'Maps', defaultLeaf: 'Maps' },
    { key: 'cultureFolderPath', label: 'Cultures', defaultLeaf: 'Cultures' },
    { key: 'factionFolderPath', label: 'Factions', defaultLeaf: 'Factions' },
    { key: 'economyFolderPath', label: 'Economies', defaultLeaf: 'Economies' },
    { key: 'magicSystemFolderPath', label: 'Magic systems', defaultLeaf: 'MagicSystems' },
    { key: 'groupFolderPath', label: 'Groups', defaultLeaf: 'Groups' },
    { key: 'compendiumFolderPath', label: 'Compendium', defaultLeaf: 'Compendium' },
    { key: 'bookFolderPath', label: 'Books', defaultLeaf: 'Books' },
    { key: 'sessionsFolderPath', label: 'Sessions', defaultLeaf: 'Sessions' },
    { key: 'eraFolderPath', label: 'Eras', defaultLeaf: 'Eras' },
    { key: 'trackFolderPath', label: 'Tracks', defaultLeaf: 'Tracks' },
    { key: 'branchFolderPath', label: 'Branches', defaultLeaf: 'Branches' },
];

export class EditStoryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    story: Story;
    onSubmit: EditStoryModalSubmitCallback;
    existingNames: string[];

    private name = '';
    private description = '';
    private folderOverrides: StoryFolderOverrides = {};
    private nameInput!: TextComponent;
    private descInput!: TextAreaComponent;
    private errorEl!: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin, story: Story, existingNames: string[], onSubmit: EditStoryModalSubmitCallback) {
        super(app);
        this.plugin = plugin;
        this.story = story;
        this.onSubmit = onSubmit;
        this.existingNames = existingNames.filter(n => n !== story.name).map(n => n.toLowerCase());
        this.name = story.name;
        this.description = story.description || '';
        this.folderOverrides = { ...(story.folderOverrides || {}) };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('storyteller-modal-scroll');
        contentEl.createEl('h2', { text: t('editStory') });

        // Name input
        new Setting(contentEl)
            .setName(t('storyNameField'))
            .setDesc(t('storyNameDesc'))
            .addText((text: TextComponent) => {
                this.nameInput = text;
                text.setPlaceholder(t('enterStoryNamePh'))
                    .setValue(this.name)
                    .onChange((value: string) => {
                        this.name = value.trim();
                        this.clearError();
                    });
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        void this.trySubmit();
                    }
                });
                text.inputEl.focus();
            });

        // Description input
        new Setting(contentEl)
            .setName(t('descriptionField'))
            .setDesc(t('descriptionOptionalDesc'))
            .addTextArea((text: TextAreaComponent) => {
                this.descInput = text;
                text.setPlaceholder(t('describeStoryPh'))
                    .setValue(this.description)
                    .onChange((value: string) => {
                        this.description = value;
                    });
                text.inputEl.rows = 3;
            });

        this.renderFolderOverrides(contentEl);

        // Error message
        this.errorEl = contentEl.createEl('div', { cls: 'storyteller-modal-error' });
        this.clearError();

        // Action buttons
        const buttonSetting = new Setting(contentEl);
        buttonSetting.addButton((btn: ButtonComponent) =>
            btn.setButtonText(t('cancel'))
                .onClick(() => this.close())
        );
        buttonSetting.addButton((btn: ButtonComponent) =>
            btn.setButtonText(t('saveChanges'))
                .setCta()
                .onClick(() => this.trySubmit())
        );
    }

    /**
     * Per-story folder overrides. Every field is optional: leaving one blank
     * inherits the plugin-wide setting, which is what a story that has never
     * been customized does, so existing notes stay where they are.
     */
    private renderFolderOverrides(contentEl: HTMLElement) {
        const header = new Setting(contentEl)
            .setName('Folders')
            .setDesc('Override where this story keeps its notes. Leave a field blank to use the vault-wide setting. Changing a path points the plugin at the new folder; it does not move notes that are already filed, so move them yourself if the folder already has contents.')
            .setHeading();

        const body = contentEl.createDiv('storyteller-story-folder-overrides');
        body.hide();

        const toggle = header.controlEl.createEl('button', { cls: 'clickable-icon' });
        setIcon(toggle, 'chevron-down');
        toggle.addEventListener('click', () => {
            const showing = body.isShown();
            if (showing) body.hide(); else body.show();
            setIcon(toggle, showing ? 'chevron-down' : 'chevron-up');
        });

        if (!this.plugin.settings.enableCustomEntityFolders) {
            body.createEl('p', {
                cls: 'setting-item-description',
                text: 'Custom entity folders are off, so these overrides are saved but not applied. Turn on "Enable custom entity folders" in the Folders tab to use them.',
            });
        }

        for (const field of FOLDER_OVERRIDE_FIELDS) {
            const inherited = this.inheritedValueFor(field);
            new Setting(body)
                .setName(field.label)
                .setDesc(`Inherits: ${inherited}`)
                .addText(text => {
                    text.setPlaceholder(inherited)
                        .setValue(this.folderOverrides[field.key] || '')
                        .onChange(value => {
                            const trimmed = value.trim();
                            // Blank means inherit, so drop the key rather than
                            // storing an empty string the resolver would have
                            // to interpret.
                            if (trimmed) this.folderOverrides[field.key] = trimmed;
                            else delete this.folderOverrides[field.key];
                        });
                });
        }
    }

    /** What this field resolves to today if the story does not override it. */
    private inheritedValueFor(field: { key: keyof StoryFolderOverrides; defaultLeaf?: string }): string {
        const global = this.plugin.settings[field.key];
        if (typeof global === 'string' && global.trim()) return global;
        const root = this.plugin.settings.storyRootFolderTemplate;
        if (field.defaultLeaf && root && root.trim()) return `${root}/${field.defaultLeaf}`;
        if (field.defaultLeaf) return `StorytellerSuite/Stories/{storyName}/${field.defaultLeaf}`;
        return 'StorytellerSuite/Stories/{storyName}';
    }

    private clearError() {
        this.errorEl.textContent = '';
    }

    private showError(msg: string) {
        this.errorEl.textContent = msg;
        this.errorEl.setCssStyles({ color: 'var(--text-error, red)' });
    }

    private async trySubmit() {
        if (!this.name) {
            this.showError('Story name is required.');
            this.nameInput.inputEl.focus();
            return;
        }
        if (this.existingNames.includes(this.name.toLowerCase())) {
            this.showError('A story with this name already exists.');
            this.nameInput.inputEl.focus();
            return;
        }
        try {
            await this.onSubmit(this.name, this.description, this.folderOverrides);
            this.close();
        } catch {
            this.showError('Failed to update story.');
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
