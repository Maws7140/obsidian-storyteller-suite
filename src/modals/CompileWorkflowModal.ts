import { App, Modal, Setting } from 'obsidian';
import type {
    CompileWorkflow,
    CompileStepConfig,
    CompileStepId,
    CompileStepDefinition,
    CompileStepKind,
    CompileStepOption
} from '../types';

interface CompileWorkflowModalOptions {
    workflow: CompileWorkflow;
    availableSteps: CompileStepDefinition[];
    mode: 'create' | 'edit';
    onSave: (workflow: CompileWorkflow) => Promise<void> | void;
}

export class CompileWorkflowModal extends Modal {
    private workflow: CompileWorkflow;
    private availableSteps: CompileStepDefinition[];
    private onSaveCallback: (workflow: CompileWorkflow) => Promise<void> | void;
    private mode: 'create' | 'edit';
    private addStepType: string;
    private errorEl: HTMLElement | null = null;

    constructor(app: App, options: CompileWorkflowModalOptions) {
        super(app);
        this.workflow = JSON.parse(JSON.stringify(options.workflow));
        this.availableSteps = [...options.availableSteps].sort((a, b) => a.name.localeCompare(b.name));
        this.onSaveCallback = options.onSave;
        this.mode = options.mode;
        this.addStepType = this.availableSteps[0]?.id ?? 'strip-frontmatter';
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-custom-step-modal', 'storyteller-compile-workflow-modal');

        contentEl.createEl('h2', {
            text: this.mode === 'create' ? 'New Compile Workflow' : 'Edit Compile Workflow'
        });

        const descriptionEl = contentEl.createDiv('storyteller-compile-workflow-description');
        descriptionEl.setText(
            'Build a compile pipeline by ordering scene, join, and manuscript steps. ' +
            'Custom steps appear alongside built-in ones.'
        );

        const nameRow = contentEl.createDiv('storyteller-step-form-row');
        nameRow.createEl('label', { text: 'Workflow name', cls: 'storyteller-step-label' });
        const nameInput = nameRow.createEl('input', {
            type: 'text',
            cls: 'storyteller-step-input',
            placeholder: 'My compile workflow'
        });
        nameInput.value = this.workflow.name ?? '';
        nameInput.addEventListener('input', () => {
            this.workflow.name = nameInput.value;
            this.clearError();
        });

        const descRow = contentEl.createDiv('storyteller-step-form-row');
        descRow.createEl('label', { text: 'Description', cls: 'storyteller-step-label' });
        const descInput = descRow.createEl('textarea', { cls: 'storyteller-step-code-area' });
        descInput.rows = 3;
        descInput.value = this.workflow.description ?? '';
        descInput.addEventListener('input', () => {
            this.workflow.description = descInput.value;
        });

        const addRow = contentEl.createDiv('storyteller-step-form-row');
        addRow.createEl('label', { text: 'Add compile step', cls: 'storyteller-step-label' });
        const addControls = addRow.createDiv('storyteller-compile-workflow-add-row');
        const stepSelect = addControls.createEl('select', { cls: 'storyteller-step-select' });
        this.availableSteps.forEach(step => {
            const stageLabel = this.describeKinds(step.availableKinds);
            const option = stepSelect.createEl('option', {
                value: step.id,
                text: `${step.name} (${stageLabel})`
            });
            option.title = step.description;
            if (step.id === this.addStepType) option.selected = true;
        });
        stepSelect.addEventListener('change', () => {
            this.addStepType = stepSelect.value;
        });

        const addBtn = addControls.createEl('button', {
            text: 'Add Step',
            cls: 'mod-cta storyteller-compile-workflow-add-btn'
        });
        addBtn.addEventListener('click', () => {
            this.addStep(this.addStepType);
            this.render();
        });

        const stepsContainer = contentEl.createDiv('storyteller-compile-workflow-steps');
        if (this.workflow.steps.length === 0) {
            stepsContainer.createDiv({
                text: 'No steps yet. Add at least one join or export step if you want a formatted manuscript output.',
                cls: 'storyteller-compile-custom-empty'
            });
        } else {
            this.workflow.steps.forEach((step, index) => {
                this.renderStepCard(stepsContainer, step, index);
            });
        }

        const hint = contentEl.createDiv('storyteller-step-warning');
        hint.createSpan({
            text: 'Scene-stage steps should stay before a join step. Manuscript-stage steps should stay after one.'
        });

        this.errorEl = contentEl.createDiv('storyteller-modal-error');
        this.clearError();

        const buttons = contentEl.createDiv('storyteller-step-btn-row');
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = buttons.createEl('button', { text: 'Save Workflow', cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => void this.saveWorkflow(nameInput));
    }

    private renderStepCard(container: HTMLElement, step: CompileStepConfig, index: number): void {
        const stepDef = this.availableSteps.find(def => def.id === step.stepType);
        const card = container.createDiv('storyteller-compile-workflow-step');

        const header = card.createDiv('storyteller-compile-workflow-step-header');
        const info = header.createDiv('storyteller-compile-workflow-step-info');
        info.createDiv({
            text: `${index + 1}. ${stepDef?.name ?? step.stepType}`,
            cls: 'storyteller-compile-custom-name'
        });

        const meta = info.createDiv('storyteller-compile-custom-meta');
        const kinds = stepDef?.availableKinds ?? [];
        if (kinds.length > 0) {
            kinds.forEach(kind => {
                meta.createSpan({
                    text: kind,
                    cls: `storyteller-compile-stage storyteller-compile-stage--${kind}`
                });
            });
        } else {
            meta.createSpan({
                text: 'missing',
                cls: 'storyteller-compile-stage storyteller-compile-stage--join'
            });
        }

        if (stepDef?.description) {
            info.createDiv({
                text: stepDef.description,
                cls: 'storyteller-compile-workflow-step-desc'
            });
        }

        const actions = header.createDiv('storyteller-compile-workflow-step-actions');
        const enabledToggle = actions.createEl('input', { type: 'checkbox' });
        enabledToggle.checked = step.enabled !== false;
        enabledToggle.title = 'Enable step';
        enabledToggle.addEventListener('change', () => {
            step.enabled = enabledToggle.checked;
        });

        const upBtn = actions.createEl('button', { text: 'Up' });
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => {
            this.moveStep(index, -1);
            this.render();
        });

        const downBtn = actions.createEl('button', { text: 'Down' });
        downBtn.disabled = index >= this.workflow.steps.length - 1;
        downBtn.addEventListener('click', () => {
            this.moveStep(index, 1);
            this.render();
        });

        const deleteBtn = actions.createEl('button', { text: 'Remove' });
        deleteBtn.addEventListener('click', () => {
            this.workflow.steps.splice(index, 1);
            this.render();
        });

        const optionsContainer = card.createDiv('storyteller-compile-workflow-options');
        if (!stepDef) {
            optionsContainer.createDiv({
                text: `This step type is no longer registered: ${step.stepType}`,
                cls: 'storyteller-step-warning'
            });
            return;
        }

        if (stepDef.options.length === 0) {
            optionsContainer.createDiv({
                text: 'This step has no configurable options.',
                cls: 'storyteller-compile-custom-empty'
            });
            return;
        }

        stepDef.options.forEach(option => this.renderOption(optionsContainer, step, option));
    }

    private renderOption(container: HTMLElement, step: CompileStepConfig, option: CompileStepOption): void {
        const value = step.options[option.id] ?? option.default;

        if (option.type === 'boolean') {
            new Setting(container)
                .setName(option.name)
                .setDesc(option.description)
                .addToggle(toggle => {
                    toggle.setValue(Boolean(value)).onChange(nextValue => {
                        step.options[option.id] = nextValue;
                    });
                });
            return;
        }

        if (option.type === 'select' && option.choices?.length) {
            new Setting(container)
                .setName(option.name)
                .setDesc(option.description)
                .addDropdown(dropdown => {
                    option.choices?.forEach(choice => dropdown.addOption(choice.value, choice.label));
                    dropdown.setValue(String(value)).onChange(nextValue => {
                        step.options[option.id] = nextValue;
                    });
                });
            return;
        }

        new Setting(container)
            .setName(option.name)
            .setDesc(option.description)
            .addText(text => {
                text.setValue(String(value ?? ''))
                    .onChange(nextValue => {
                        step.options[option.id] = option.type === 'number'
                            ? Number(nextValue || option.default || 0)
                            : nextValue;
                    });

                if (option.type === 'number') {
                    text.inputEl.type = 'number';
                }
            });
    }

    private addStep(stepType: string): void {
        const stepDef = this.availableSteps.find(def => def.id === stepType);
        if (!stepDef) return;

        this.workflow.steps.push({
            id: `workflow-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            stepType: stepDef.id as CompileStepId,
            enabled: true,
            options: Object.fromEntries(stepDef.options.map(option => [option.id, option.default]))
        });
    }

    private moveStep(index: number, direction: -1 | 1): void {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= this.workflow.steps.length) return;

        const [step] = this.workflow.steps.splice(index, 1);
        this.workflow.steps.splice(targetIndex, 0, step);
    }

    private describeKinds(kinds: CompileStepKind[]): string {
        if (kinds.length === 0) return 'unknown';
        if (kinds.length === 1) return kinds[0];
        return kinds.join(' / ');
    }

    private clearError(): void {
        if (!this.errorEl) return;
        this.errorEl.textContent = '';
    }

    private showError(message: string): void {
        if (!this.errorEl) return;
        this.errorEl.textContent = message;
        this.errorEl.style.color = 'var(--text-error, red)';
    }

    private async saveWorkflow(nameInput: HTMLInputElement): Promise<void> {
        const trimmedName = (this.workflow.name || '').trim();
        if (!trimmedName) {
            this.showError('Workflow name is required.');
            nameInput.focus();
            return;
        }

        this.workflow.name = trimmedName;
        this.workflow.description = (this.workflow.description || '').trim();

        await this.onSaveCallback(this.workflow);
        this.close();
    }
}
