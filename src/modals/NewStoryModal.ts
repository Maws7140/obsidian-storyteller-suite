import { App, Modal, Setting, TextComponent, TextAreaComponent } from 'obsidian';
import { t } from '../i18n/strings';
import type StorytellerSuitePlugin from '../main';

export type NewStoryModalSubmitCallback = (name: string, description?: string) => Promise<void>;

export class NewStoryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    onSubmit: NewStoryModalSubmitCallback;
    existingNames: string[];

    private name = '';
    private description = '';
    private nameInput!: TextComponent;
    private descInput!: TextAreaComponent;
    private errorEl!: HTMLElement;

    constructor(app: App, plugin: StorytellerSuitePlugin, existingNames: string[], onSubmit: NewStoryModalSubmitCallback) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.existingNames = existingNames.map(n => n.toLowerCase());
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('createNewStory') });

        // Name input
        new Setting(contentEl)
            .setName(t('storyName'))
            .setDesc('Required. Must be unique.')
            .addText(text => {
                this.nameInput = text;
                text.setPlaceholder(t('enterStoryNamePh'))
                    .onChange(value => {
                        this.name = value.trim();
                        this.clearError();
                    });
                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.trySubmit();
                    }
                });
                text.inputEl.focus();
            });

        // Description input
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc('Optional')
            .addTextArea(text => {
                this.descInput = text;
                text.setPlaceholder(t('describeStoryPh'))
                    .onChange(value => {
                        this.description = value;
                    });
                text.inputEl.rows = 3;
            });

        // Error message
        this.errorEl = contentEl.createEl('div', { cls: 'storyteller-modal-error' });
        this.clearError();

        // Action buttons
        const buttonSetting = new Setting(contentEl);
        buttonSetting.addButton(btn =>
            btn.setButtonText(t('cancel'))
                .onClick(() => this.close())
        );
        buttonSetting.addButton(btn =>
            btn.setButtonText(t('create'))
                .setCta()
                .onClick(() => this.trySubmit())
        );
    }

    private clearError() {
        this.errorEl.setText('');
    }

    private showError(msg: string) {
        this.errorEl.setText(msg);
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
            this.showError('Failed to create story.');
        }
    }

    onClose() {
        this.contentEl.empty();
    }
} 