import { App, Modal, Setting, Notice, TextComponent } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { CausalityLink, Event } from '../types';
import { EventSuggestModal } from './EventSuggestModal';

export type CausalityLinkModalSubmitCallback = (link: CausalityLink) => Promise<void>;
export type CausalityLinkModalDeleteCallback = (link: CausalityLink) => Promise<void>;

/**
 * Modal for creating and editing causality links between events
 */
export class CausalityLinkModal extends Modal {
    link: CausalityLink;
    plugin: StorytellerSuitePlugin;
    onSubmit: CausalityLinkModalSubmitCallback;
    onDelete?: CausalityLinkModalDeleteCallback;
    isNew: boolean;

    private causeEventSetting: Setting | null = null;
    private effectEventSetting: Setting | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        link: CausalityLink | null,
        onSubmit: CausalityLinkModalSubmitCallback,
        onDelete?: CausalityLinkModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.isNew = link === null;

        this.link = link || {
            id: `causality-${Date.now()}`,
            causeEvent: '',
            effectEvent: '',
            linkType: 'direct',
            strength: 'strong',
            description: ''
        };

        this.modalEl.addClass('storyteller-causality-link-modal', 'storyteller-modal-scroll');
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Causality Link' : 'Edit Causality Link'
        });

        contentEl.createEl('p', {
            text: 'Define a cause-and-effect relationship between two events.',
            cls: 'storyteller-modal-subtitle'
        });

        // Cause Event
        this.causeEventSetting = new Setting(contentEl)
            .setName('Cause event')
            .setDesc('The event that causes the effect');

        this.causeEventSetting.addText(text => text
            .setPlaceholder('Select the cause event...')
            .setValue(this.link.causeEvent)
            .onChange(value => this.link.causeEvent = value)
        );

        this.causeEventSetting.addButton(button => button
            .setButtonText('Select')
            .onClick(async () => {
                new EventSuggestModal(
                    this.app,
                    this.plugin,
                    (selectedEvent: Event) => {
                        this.link.causeEvent = selectedEvent.id || selectedEvent.name;
                        this.updateEventDisplay(this.causeEventSetting!, selectedEvent.name);
                    }
                ).open();
            })
        );

        // Arrow indicator
        contentEl.createDiv('storyteller-causality-arrow', (div) => {
            div.createDiv({ cls: 'storyteller-causality-arrow-icon', text: 'v' });
        });

        // Effect Event
        this.effectEventSetting = new Setting(contentEl)
            .setName('Effect event')
            .setDesc('The event that is caused');

        this.effectEventSetting.addText(text => text
            .setPlaceholder('Select the effect event...')
            .setValue(this.link.effectEvent)
            .onChange(value => this.link.effectEvent = value)
        );

        this.effectEventSetting.addButton(button => button
            .setButtonText('Select')
            .onClick(async () => {
                new EventSuggestModal(
                    this.app,
                    this.plugin,
                    (selectedEvent: Event) => {
                        this.link.effectEvent = selectedEvent.id || selectedEvent.name;
                        this.updateEventDisplay(this.effectEventSetting!, selectedEvent.name);
                    }
                ).open();
            })
        );

        // Link Type
        new Setting(contentEl)
            .setName('Link type')
            .setDesc('The nature of the causal relationship')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'direct': 'Direct - Event A directly causes Event B',
                    'indirect': 'Indirect - Event A leads to Event B through intermediary steps',
                    'conditional': 'Conditional - Event A enables Event B under certain conditions',
                    'catalyst': 'Catalyst - Event A triggers or accelerates Event B'
                })
                .setValue(this.link.linkType)
                .onChange(value => this.link.linkType = value as 'direct' | 'indirect' | 'conditional' | 'catalyst')
            );

        // Strength
        new Setting(contentEl)
            .setName('Causal strength')
            .setDesc('How strong is the causal relationship?')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'weak': 'Weak - Minor influence',
                    'moderate': 'Moderate - Significant influence',
                    'strong': 'Strong - Major influence',
                    'absolute': 'Absolute - Event B cannot occur without Event A'
                })
                .setValue(this.link.strength || 'strong')
                .onChange(value => this.link.strength = value as 'weak' | 'moderate' | 'strong' | 'absolute')
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Describe how the cause event leads to the effect event')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.link.description || '')
                    .onChange(value => this.link.description = value);
                text.inputEl.rows = 4;
                text.inputEl.setCssStyles({ width: '100%' });
            });

        // Preview of the relationship
        const previewDiv = contentEl.createDiv('storyteller-causality-preview');
        this.updatePreview(previewDiv);

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.link.causeEvent) {
                    new Notice('Cause event is required');
                    return;
                }
                if (!this.link.effectEvent) {
                    new Notice('Effect event is required');
                    return;
                }
                if (this.link.causeEvent === this.link.effectEvent) {
                    new Notice('Cause and effect events must be different');
                    return;
                }
                await this.onSubmit(this.link);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete')
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.link);
                        this.close();
                    }
                })
            );
        }
    }

    /**
     * Update the event display text field
     */
    private updateEventDisplay(setting: Setting, eventName: string): void {
        const textInput = setting.components.find((component): component is TextComponent => (
            'inputEl' in component && 'setValue' in component
        ));
        if (textInput) {
            textInput.setValue(eventName);
        }
    }

    /**
     * Update the preview of the causality relationship
     */
    private updatePreview(previewDiv: HTMLElement): void {
        previewDiv.empty();
        previewDiv.createEl('h4', { text: 'Relationship preview:' });

        const previewText = previewDiv.createEl('div', { cls: 'storyteller-causality-preview-text' });

        const strengthEmoji = {
            weak: '▫️',
            moderate: '▪️',
            strong: '🔵',
            absolute: '🔴'
        };

        const typeDesc = {
            direct: '→',
            indirect: '⇢',
            conditional: '⤷',
            catalyst: '⚡→'
        };

        const previewCard = previewText.createDiv({ cls: 'storyteller-causality-preview-card' });
        previewCard.createEl('strong', { text: this.link.causeEvent || '[Cause Event]' });
        previewCard.createDiv({
            cls: 'storyteller-causality-preview-arrow',
            text: `${strengthEmoji[this.link.strength || 'strong']} ${typeDesc[this.link.linkType]} ${strengthEmoji[this.link.strength || 'strong']}`
        });
        previewCard.createEl('strong', { text: this.link.effectEvent || '[Effect Event]' });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
