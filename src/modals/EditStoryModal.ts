/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, TextComponent, TextAreaComponent } from 'obsidian';
import { Story } from '../types';
import { t } from '../i18n/strings';
import type StorytellerSuitePlugin from '../main';

export type EditStoryModalSubmitCallback = (name: string, description?: string) => Promise<void>;

export class EditStoryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    story: Story;
    onSubmit: EditStoryModalSubmitCallback;
    existingNames: string[];

    private name = '';
    private description = '';
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
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
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
                        this.trySubmit();
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

        // Error message
        this.errorEl = contentEl.createEl('div', { cls: 'storyteller-modal-error' });
        this.clearError();

        // Action buttons
        const buttonSetting = new Setting(contentEl);
        buttonSetting.addButton((btn: any) =>
            btn.setButtonText(t('cancel'))
                .onClick(() => this.close())
        );
        buttonSetting.addButton((btn: any) =>
            btn.setButtonText(t('saveChanges'))
                .setCta()
                .onClick(() => this.trySubmit())
        );
    }

    private clearError() {
        this.errorEl.textContent = '';
    }

    private showError(msg: string) {
        this.errorEl.textContent = msg;
        this.errorEl.style.color = 'var(--text-error, red)';
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
            await this.onSubmit(this.name, this.description);
            this.close();
        } catch (e) {
            this.showError('Failed to update story.');
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
