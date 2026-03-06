import { App, Modal, ButtonComponent, Notice, setIcon } from 'obsidian';
import { CustomSheetTemplate, CUSTOM_TEMPLATE_TOKENS } from '../utils/CharacterSheetTemplates';

export class CustomSheetTemplateModal extends Modal {
    private nameInput!: HTMLInputElement;
    private descInput!: HTMLInputElement;
    private htmlArea!: HTMLTextAreaElement;

    constructor(
        app: App,
        private existing: CustomSheetTemplate | null,
        private onSave: (tpl: CustomSheetTemplate) => void
    ) {
        super(app);
    }

    onOpen() {
        const isEdit = !!this.existing;
        this.titleEl.setText(isEdit ? 'Edit Custom Template' : 'New Custom Template');
        this.modalEl.addClass('sts-custom-sheet-tpl-modal');

        const form = this.contentEl.createDiv('sts-cstpl-form');

        // Name
        const nameRow = form.createDiv('sts-cstpl-row');
        nameRow.createEl('label', { text: 'Name', cls: 'sts-cstpl-label' });
        this.nameInput = nameRow.createEl('input', { type: 'text', cls: 'sts-cstpl-input' });
        this.nameInput.placeholder = 'e.g. My Dark Theme';
        if (this.existing) this.nameInput.value = this.existing.name;

        // Description
        const descRow = form.createDiv('sts-cstpl-row');
        descRow.createEl('label', { text: 'Description', cls: 'sts-cstpl-label' });
        this.descInput = descRow.createEl('input', { type: 'text', cls: 'sts-cstpl-input' });
        this.descInput.placeholder = 'Brief description of the style';
        if (this.existing) this.descInput.value = this.existing.description;

        // HTML textarea
        const htmlRow = form.createDiv('sts-cstpl-row sts-cstpl-row-tall');
        htmlRow.createEl('label', { text: 'HTML Template', cls: 'sts-cstpl-label' });
        this.htmlArea = htmlRow.createEl('textarea', { cls: 'sts-cstpl-textarea' });
        this.htmlArea.placeholder = '<h1>{{name}}</h1>\n<p>{{description}}</p>';
        if (this.existing) this.htmlArea.value = this.existing.html;

        // Token reference (collapsible)
        const tokensWrap = form.createDiv('sts-cstpl-tokens-wrap');
        const tokensToggle = tokensWrap.createEl('button', { cls: 'sts-cstpl-tokens-toggle' });
        setIcon(tokensToggle, 'chevron-right');
        tokensToggle.appendText(' Available tokens');

        const tokensList = tokensWrap.createDiv('sts-cstpl-tokens-list');
        tokensList.style.display = 'none';
        for (const token of CUSTOM_TEMPLATE_TOKENS) {
            tokensList.createEl('code', { text: token, cls: 'sts-cstpl-token' });
        }

        tokensToggle.addEventListener('click', () => {
            const visible = tokensList.style.display !== 'none';
            tokensList.style.display = visible ? 'none' : 'flex';
            tokensToggle.empty();
            setIcon(tokensToggle, visible ? 'chevron-right' : 'chevron-down');
            tokensToggle.appendText(' Available tokens');
        });

        // Buttons
        const btnRow = form.createDiv('sts-cstpl-btn-row');
        const saveBtn = new ButtonComponent(btnRow).setButtonText('Save').setCta();
        saveBtn.onClick(() => this.handleSave());
        new ButtonComponent(btnRow).setButtonText('Cancel').onClick(() => this.close());
    }

    private handleSave() {
        const name = this.nameInput.value.trim();
        const html = this.htmlArea.value;
        if (!name) { new Notice('Template name is required.'); this.nameInput.focus(); return; }
        if (!html.trim()) { new Notice('HTML template cannot be empty.'); this.htmlArea.focus(); return; }

        const tpl: CustomSheetTemplate = {
            id:          this.existing?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            description: this.descInput.value.trim(),
            html,
        };
        this.onSave(tpl);
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}
