/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, TextComponent, TextAreaComponent } from 'obsidian';
import { Story } from '../types';

export type EditStoryModalSubmitCallback = (name: string, description?: string) => Promise<void>;

export class EditStoryModal extends Modal {
    story: Story;
    onSubmit: EditStoryModalSubmitCallback;
    existingNames: string[];

    private name = '';
    private description = '';
    private nameInput!: TextComponent;
    private descInput!: TextAreaComponent;
    private errorEl!: HTMLElement;

    constructor(app: App, story: Story, existingNames: string[], onSubmit: EditStoryModalSubmitCallback) {
        super(app);
        this.story = story;
        this.onSubmit = onSubmit;
        this.existingNames = existingNames.filter(n => n !== story.name).map(n => n.toLowerCase());
        this.name = story.name;
        this.description = story.description || '';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Edit Story' });

        // Name input
        new Setting(contentEl)
            .setName('Story Name')
            .setDesc('Required. Must be unique.')
            .addText((text: TextComponent) => {
                this.nameInput = text;
                text.setPlaceholder('Enter story name')
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
            .setName('Description')
            .setDesc('Optional')
            .addTextArea((text: TextAreaComponent) => {
                this.descInput = text;
                text.setPlaceholder('Describe your story (optional)')
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
            btn.setButtonText('Cancel')
                .onClick(() => this.close())
        );
        buttonSetting.addButton((btn: any) =>
            btn.setButtonText('Save Changes')
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
