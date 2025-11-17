import { App, Modal, Setting, Notice, DropdownComponent } from 'obsidian';
import { TimelineEra } from '../types';
import StorytellerSuitePlugin from '../main';
import { EraManager } from '../utils/EraManager';
import { t } from '../i18n/strings';

export type EraModalSubmitCallback = (era: TimelineEra) => Promise<void>;
export type EraModalDeleteCallback = (era: TimelineEra) => Promise<void>;

export class EraModal extends Modal {
    era: TimelineEra;
    plugin: StorytellerSuitePlugin;
    onSubmit: EraModalSubmitCallback;
    onDelete?: EraModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        era: TimelineEra | null,
        onSubmit: EraModalSubmitCallback,
        onDelete?: EraModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = era === null;

        // Initialize with default values for new era
        const initialEra: TimelineEra = era ? { ...era } : {
            id: `era-${Date.now()}`,
            name: '',
            description: '',
            startDate: '',
            endDate: '',
            color: EraManager.generateEraColor(),
            type: 'custom',
            visible: true,
            sortOrder: 0,
            events: [],
            tags: []
        };

        this.era = initialEra;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-era-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Timeline Era' : `Edit Era: ${this.era.name}`
        });

        // Name
        new Setting(contentEl)
            .setName('Era Name')
            .setDesc('Name of this period, arc, or act')
            .addText(text => text
                .setPlaceholder('e.g., "Act I: Rising Action", "Medieval Period"')
                .setValue(this.era.name)
                .onChange(value => {
                    this.era.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large'));

        // Start Date
        new Setting(contentEl)
            .setName('Start Date')
            .setDesc('When this era begins (supports flexible formats like events)')
            .addText(text => text
                .setPlaceholder('e.g., "1200-01-01", "January 1200", "500 BCE"')
                .setValue(this.era.startDate)
                .onChange(value => {
                    this.era.startDate = value;
                }));

        // End Date
        new Setting(contentEl)
            .setName('End Date')
            .setDesc('When this era ends')
            .addText(text => text
                .setPlaceholder('e.g., "1300-12-31", "December 1300"')
                .setValue(this.era.endDate)
                .onChange(value => {
                    this.era.endDate = value;
                }));

        // Type
        new Setting(contentEl)
            .setName('Era Type')
            .setDesc('Category of this era')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('custom', 'Custom')
                    .addOption('act', 'Act')
                    .addOption('arc', 'Story Arc')
                    .addOption('period', 'Historical Period')
                    .addOption('season', 'Season')
                    .addOption('chapter', 'Chapter Range')
                    .setValue(this.era.type || 'custom')
                    .onChange(value => {
                        this.era.type = value as TimelineEra['type'];
                    });
            });

        // Color
        new Setting(contentEl)
            .setName('Background Color')
            .setDesc('Color for timeline visualization (hex or CSS color)')
            .addText(text => {
                text
                    .setPlaceholder('#RRGGBB or hsl(h, s%, l%)')
                    .setValue(this.era.color || '')
                    .onChange(value => {
                        this.era.color = value || EraManager.generateEraColor();
                    });
                text.inputEl.style.width = '150px';
            })
            .addButton(button => button
                .setButtonText('Random')
                .setTooltip('Generate random color')
                .onClick(() => {
                    const randomColor = EraManager.generateEraColor();
                    this.era.color = randomColor;
                    // Update the input field
                    const inputEl = contentEl.querySelector('input[placeholder*="RRGGBB"]') as HTMLInputElement;
                    if (inputEl) {
                        inputEl.value = randomColor;
                    }
                    new Notice(`Color set to ${randomColor}`);
                }));

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('What defines this era or period')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('Describe what happens during this era...')
                    .setValue(this.era.description || '')
                    .onChange(value => {
                        this.era.description = value || undefined;
                    });
                text.inputEl.rows = 3;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // Visible Toggle
        new Setting(contentEl)
            .setName('Visible on Timeline')
            .setDesc('Show this era on the timeline')
            .addToggle(toggle => toggle
                .setValue(this.era.visible !== false)
                .onChange(value => {
                    this.era.visible = value;
                }));

        // Sort Order
        new Setting(contentEl)
            .setName('Sort Order')
            .setDesc('Lower numbers appear first (optional, defaults to start date)')
            .addText(text => text
                .setPlaceholder('0')
                .setValue(this.era.sortOrder?.toString() || '')
                .onChange(value => {
                    const num = parseInt(value);
                    this.era.sortOrder = isNaN(num) ? undefined : num;
                })
                .inputEl.setAttribute('type', 'number'));

        // Show duration preview if both dates are set
        if (this.era.startDate && this.era.endDate) {
            const validation = EraManager.validateEra(this.era);
            if (validation.valid) {
                const duration = EraManager.getEraDuration(this.era);
                contentEl.createDiv('storyteller-era-duration', div => {
                    div.createEl('strong', { text: 'Duration: ' });
                    div.createSpan({ text: duration });
                });
            }
        }

        // Action Buttons
        const buttonContainer = contentEl.createDiv('storyteller-modal-buttons');

        // Delete button (only for existing eras)
        if (!this.isNew && this.onDelete) {
            buttonContainer.createEl('button', {
                text: 'Delete Era',
                cls: 'mod-warning'
            }, btn => {
                btn.addEventListener('click', async () => {
                    const confirm = await new Promise<boolean>(resolve => {
                        const confirmModal = new Modal(this.app);
                        confirmModal.contentEl.createEl('h3', { text: 'Delete Era?' });
                        confirmModal.contentEl.createEl('p', {
                            text: `Are you sure you want to delete "${this.era.name}"? This action cannot be undone.`
                        });

                        const btnContainer = confirmModal.contentEl.createDiv('modal-button-container');
                        btnContainer.createEl('button', { text: 'Cancel' }, cancelBtn => {
                            cancelBtn.addEventListener('click', () => {
                                resolve(false);
                                confirmModal.close();
                            });
                        });
                        btnContainer.createEl('button', {
                            text: 'Delete',
                            cls: 'mod-warning'
                        }, deleteBtn => {
                            deleteBtn.addEventListener('click', () => {
                                resolve(true);
                                confirmModal.close();
                            });
                        });

                        confirmModal.open();
                    });

                    if (confirm && this.onDelete) {
                        await this.onDelete(this.era);
                        this.close();
                    }
                });
            });
        }

        // Cancel button
        buttonContainer.createEl('button', { text: 'Cancel' }, btn => {
            btn.addEventListener('click', () => {
                this.close();
            });
        });

        // Save button
        buttonContainer.createEl('button', {
            text: this.isNew ? 'Create Era' : 'Save Changes',
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', async () => {
                // Validate era
                const validation = EraManager.validateEra(this.era);
                if (!validation.valid) {
                    new Notice(`Validation failed:\n${validation.errors.join('\n')}`);
                    return;
                }

                try {
                    await this.onSubmit(this.era);
                    new Notice(`Era "${this.era.name}" ${this.isNew ? 'created' : 'updated'} successfully`);
                    this.close();
                } catch (error) {
                    console.error('Error saving era:', error);
                    new Notice('Error saving era. Check console for details.');
                }
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
