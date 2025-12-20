/**
 * Template Variable Editor Modal
 * Detailed editor for individual template variables
 * Allows editing name, label, type, default value, options, and description
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import { TemplateVariable } from '../templates/TemplateTypes';

export class TemplateVariableEditorModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private variable: TemplateVariable;
    private onSave: (variable: TemplateVariable) => void;
    private isNewVariable: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        variable: TemplateVariable | null,
        onSave: (variable: TemplateVariable) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
        this.isNewVariable = variable === null;

        // Clone variable to avoid mutations, or create new one
        this.variable = variable ? { ...variable } : this.createEmptyVariable();

        this.modalEl.addClass('storyteller-variable-editor-modal');
    }

    private createEmptyVariable(): TemplateVariable {
        return {
            name: 'newVariable',
            label: 'New Variable',
            type: 'text',
            defaultValue: '',
            description: ''
        };
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.addClass('variable-editor');

        // Header
        this.renderHeader(contentEl);

        // Form
        const formContainer = contentEl.createDiv('variable-editor-form');
        this.renderForm(formContainer);

        // Footer
        this.renderFooter(contentEl);
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('variable-editor-header');
        header.createEl('h2', {
            text: this.isNewVariable ? 'Create New Variable' : `Edit Variable: {{${this.variable.name}}}`
        });
        header.createEl('p', {
            text: 'Define a variable that users can customize when applying this template. Use {{variableName}} in entity fields and content.',
            cls: 'variable-editor-subtitle'
        });
    }

    private renderForm(container: HTMLElement): void {
        // Variable Name
        new Setting(container)
            .setName('Variable Name')
            .setDesc('Internal name used in {{variableName}} syntax. Use camelCase, no spaces.')
            .addText(text => {
                text.setPlaceholder('e.g., characterName, kingdomAge')
                    .setValue(this.variable.name);
                
                const inputEl = text.inputEl;
                
                // Format on blur (when user leaves the field) to avoid interrupting typing
                inputEl.addEventListener('blur', () => {
                    const currentValue = inputEl.value;
                    const formatted = currentValue
                        .trim()
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .replace(/^[0-9]/, ''); // Can't start with number
                    
                    if (formatted !== currentValue) {
                        this.variable.name = formatted;
                        text.setValue(formatted);
                    }
                });
                
                // Also update the variable name on change (but don't reformat the input while typing)
                text.onChange(value => {
                    // Store the raw value while typing, format on blur
                    // This allows continuous typing without interruption
                    const tempFormatted = value
                        .trim()
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .replace(/^[0-9]/, '');
                    this.variable.name = tempFormatted;
                });
            });

        // Variable Label
        new Setting(container)
            .setName('Display Label')
            .setDesc('User-friendly label shown in the template application UI')
            .addText(text => text
                .setPlaceholder('e.g., Character Name, Kingdom Age')
                .setValue(this.variable.label)
                .onChange(value => {
                    this.variable.label = value;
                })
            );

        // Variable Type
        const typeSetting = new Setting(container)
            .setName('Variable Type')
            .setDesc('Data type for this variable')
            .addDropdown(dropdown => dropdown
                .addOption('text', 'Text - Single line text input')
                .addOption('number', 'Number - Numeric input')
                .addOption('boolean', 'Boolean - True/False toggle')
                .addOption('select', 'Select - Dropdown with predefined options')
                .addOption('date', 'Date - Date picker')
                .setValue(this.variable.type)
                .onChange(value => {
                    this.variable.type = value as TemplateVariable['type'];
                    this.onOpen(); // Re-render to show/hide options field
                })
            );

        // Default Value
        this.renderDefaultValueField(container);

        // Options (only for select type)
        if (this.variable.type === 'select') {
            this.renderOptionsField(container);
        }

        // Description
        new Setting(container)
            .setName('Description')
            .setDesc('Help text explaining what this variable controls')
            .addTextArea(text => {
                text
                    .setPlaceholder('e.g., The name of the main character in your story')
                    .setValue(this.variable.description || '')
                    .onChange(value => {
                        this.variable.description = value;
                    });
                text.inputEl.rows = 3;
                text.inputEl.cols = 50;
            });

        // Usage Information (read-only)
        if (this.variable.usedIn && this.variable.usedIn.length > 0) {
            this.renderUsageInfo(container);
        } else {
            container.createDiv('variable-usage-empty').createEl('p', {
                text: '💡 Tip: After saving, use {{' + this.variable.name + '}} in your entity fields and section content.',
                cls: 'setting-item-description'
            });
        }

        // Example Preview
        this.renderExamplePreview(container);
    }

    private renderDefaultValueField(container: HTMLElement): void {
        const setting = new Setting(container)
            .setName('Default Value')
            .setDesc('Default value for this variable (optional)');

        switch (this.variable.type) {
            case 'text':
            case 'date':
                setting.addText(text => text
                    .setPlaceholder(this.variable.type === 'date' ? 'YYYY-MM-DD' : 'Enter default value')
                    .setValue(this.variable.defaultValue?.toString() || '')
                    .onChange(value => {
                        this.variable.defaultValue = value;
                    })
                );
                break;

            case 'number':
                setting.addText(text => text
                    .setPlaceholder('Enter default number')
                    .setValue(this.variable.defaultValue?.toString() || '')
                    .onChange(value => {
                        const num = parseFloat(value);
                        this.variable.defaultValue = isNaN(num) ? '' : num;
                    })
                );
                break;

            case 'boolean':
                setting.addToggle(toggle => toggle
                    .setValue(this.variable.defaultValue === true)
                    .onChange(value => {
                        this.variable.defaultValue = value;
                    })
                );
                break;

            case 'select':
                // For select, default value should be one of the options
                setting.addText(text => text
                    .setPlaceholder('Enter default selection (must match an option)')
                    .setValue(this.variable.defaultValue?.toString() || '')
                    .onChange(value => {
                        this.variable.defaultValue = value;
                    })
                );
                break;
        }
    }

    private renderOptionsField(container: HTMLElement): void {
        const optionsContainer = container.createDiv('variable-options-section');

        optionsContainer.createEl('h4', { text: 'Select Options' });
        optionsContainer.createEl('p', {
            text: 'Enter options one per line. Users will choose from these values.',
            cls: 'setting-item-description'
        });

        const textarea = optionsContainer.createEl('textarea', {
            placeholder: 'Option 1\nOption 2\nOption 3',
            value: (this.variable.options || []).join('\n')
        });
        textarea.rows = 6;
        textarea.addClass('variable-options-textarea');

        textarea.addEventListener('change', () => {
            const options = textarea.value
                .split('\n')
                .map(opt => opt.trim())
                .filter(opt => opt.length > 0);
            this.variable.options = options.length > 0 ? options : undefined;
        });
    }

    private renderUsageInfo(container: HTMLElement): void {
        const usageSection = container.createDiv('variable-usage-section');

        usageSection.createEl('h4', { text: 'Variable Usage' });
        usageSection.createEl('p', {
            text: `This variable is used in ${this.variable.usedIn!.length} location(s):`,
            cls: 'setting-item-description'
        });

        const usageList = usageSection.createDiv('variable-usage-list');

        this.variable.usedIn!.forEach(usage => {
            const usageItem = usageList.createDiv('variable-usage-item');
            usageItem.createEl('span', {
                text: `📍 ${this.getEntityTypeLabel(usage.entityType)} → ${usage.field}`,
                cls: 'variable-usage-location'
            });
        });
    }

    private renderExamplePreview(container: HTMLElement): void {
        const previewSection = container.createDiv('variable-example-preview');

        previewSection.createEl('h4', { text: 'Example Usage' });

        const exampleCode = previewSection.createEl('code', {
            cls: 'variable-example-code'
        });

        // Show example based on type
        let exampleText = '';
        switch (this.variable.type) {
            case 'text':
                exampleText = `name: "{{${this.variable.name}}}"  # User enters: "John Smith"`;
                break;
            case 'number':
                exampleText = `age: {{${this.variable.name}}}  # User enters: 25`;
                break;
            case 'boolean':
                exampleText = `isAlive: {{${this.variable.name}}}  # User toggles: true/false`;
                break;
            case 'select':
                exampleText = `rank: "{{${this.variable.name}}}"  # User selects from: [${(this.variable.options || []).join(', ')}]`;
                break;
            case 'date':
                exampleText = `birthdate: "{{${this.variable.name}}}"  # User picks: 2024-01-15`;
                break;
        }

        exampleCode.textContent = exampleText;

        previewSection.createEl('p', {
            text: 'When applying the template, users will be prompted to provide a value for this variable.',
            cls: 'setting-item-description'
        });
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('variable-editor-footer');

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', {
            text: this.isNewVariable ? 'Create Variable' : 'Save Changes',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => this.handleSave());
    }

    private handleSave(): void {
        // Validation
        if (!this.variable.name || this.variable.name.trim() === '') {
            new Notice('Please enter a variable name');
            return;
        }

        // Validate name format (alphanumeric only, no spaces)
        if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(this.variable.name)) {
            new Notice('Variable name must start with a letter and contain only letters and numbers');
            return;
        }

        if (!this.variable.label || this.variable.label.trim() === '') {
            new Notice('Please enter a display label');
            return;
        }

        // Validate select type has options
        if (this.variable.type === 'select') {
            if (!this.variable.options || this.variable.options.length === 0) {
                new Notice('Select type variables must have at least one option');
                return;
            }

            // Validate default value is one of the options
            if (this.variable.defaultValue && !this.variable.options.includes(this.variable.defaultValue as string)) {
                new Notice('Default value must be one of the provided options');
                return;
            }
        }

        // Validate date format if type is date and has default value
        if (this.variable.type === 'date' && this.variable.defaultValue) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(this.variable.defaultValue as string)) {
                new Notice('Date default value must be in YYYY-MM-DD format');
                return;
            }
        }

        // Call onSave callback
        this.onSave(this.variable);

        new Notice(`Variable {{${this.variable.name}}} ${this.isNewVariable ? 'created' : 'updated'} successfully!`);
        this.close();
    }

    private getEntityTypeLabel(entityType: string): string {
        const labelMap: Record<string, string> = {
            character: 'Character',
            location: 'Location',
            event: 'Event',
            item: 'Item',
            group: 'Group',
            culture: 'Culture',
            economy: 'Economy',
            magicSystem: 'Magic System',
            chapter: 'Chapter',
            scene: 'Scene',
            reference: 'Reference'
        };
        return labelMap[entityType] || entityType;
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
