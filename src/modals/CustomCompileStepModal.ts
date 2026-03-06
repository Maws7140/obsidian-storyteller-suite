import { App, Modal, setIcon } from 'obsidian';
import type { CustomCompileStepDef, CompileStepKind } from '../types';

const STEP_API_DOCS: Record<CompileStepKind, string> = {
    scene: `// Scene step: called once per scene before joining.
// \`input\` is SceneCompileInput[] — an array of scene objects.
// Each scene has: { path, name, contents, indentLevel, index, chapterName? }
// Modify scene.contents and return the array.
//
// Example — wrap each scene in a divider:
for (const scene of input) {
    scene.contents = '---\\n\\n' + scene.contents + '\\n\\n---';
}
return input;`,
    join: `// Join step: receives all scenes and joins them into a single string.
// \`input\` is SceneCompileInput[].
// Must return ManuscriptCompileInput: { contents: string }
//
// Example — join with blank lines:
const joined = input.map(s => s.contents).join('\\n\\n');
return { contents: joined };`,
    manuscript: `// Manuscript step: called on the final combined text.
// \`input\` is ManuscriptCompileInput: { contents: string }
// Modify input.contents and return it.
//
// Example — convert smart quotes:
input.contents = input.contents
    .replace(/[\\u2018\\u2019]/g, "'")
    .replace(/[\\u201C\\u201D]/g, '"');
return input;`,
};

export class CustomCompileStepModal extends Modal {
    private def: Partial<CustomCompileStepDef>;
    private onSave: (def: CustomCompileStepDef) => void;

    constructor(
        app: App,
        existing: Partial<CustomCompileStepDef> | null,
        onSave: (def: CustomCompileStepDef) => void
    ) {
        super(app);
        this.def = existing ? { ...existing } : {
            id: `step-${Date.now()}`,
            name: '',
            description: '',
            context: 'scene',
            code: '',
        };
        this.onSave = onSave;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('storyteller-custom-step-modal');

        contentEl.createEl('h2', { text: this.def.id?.startsWith('step-') && !this.def.name ? 'New Custom Compile Step' : 'Edit Compile Step' });

        // Name
        const nameRow = contentEl.createDiv('storyteller-step-form-row');
        nameRow.createEl('label', { text: 'Name', cls: 'storyteller-step-label' });
        const nameInput = nameRow.createEl('input', { type: 'text', cls: 'storyteller-step-input', placeholder: 'My custom step' });
        nameInput.value = this.def.name ?? '';

        // Description
        const descRow = contentEl.createDiv('storyteller-step-form-row');
        descRow.createEl('label', { text: 'Description', cls: 'storyteller-step-label' });
        const descInput = descRow.createEl('input', { type: 'text', cls: 'storyteller-step-input', placeholder: 'What does this step do?' });
        descInput.value = this.def.description ?? '';

        // Context (stage)
        const ctxRow = contentEl.createDiv('storyteller-step-form-row');
        ctxRow.createEl('label', { text: 'Pipeline stage', cls: 'storyteller-step-label' });
        const ctxSelect = ctxRow.createEl('select', { cls: 'storyteller-step-select' });
        (['scene', 'join', 'manuscript'] as CompileStepKind[]).forEach(k => {
            const opt = ctxSelect.createEl('option', { value: k, text: k.charAt(0).toUpperCase() + k.slice(1) });
            if (k === (this.def.context ?? 'scene')) opt.selected = true;
        });

        // Code editor
        const codeRow = contentEl.createDiv('storyteller-step-form-row storyteller-step-code-row');
        const codeLabelRow = codeRow.createDiv('storyteller-step-code-label-row');
        codeLabelRow.createEl('label', { text: 'JavaScript', cls: 'storyteller-step-label' });
        const docsBtn = codeLabelRow.createEl('button', { cls: 'storyteller-step-docs-btn' });
        const docsIcon = docsBtn.createSpan();
        setIcon(docsIcon, 'info');
        docsBtn.createSpan({ text: ' Show example' });

        const codeArea = codeRow.createEl('textarea', { cls: 'storyteller-step-code-area' });
        codeArea.rows = 12;
        codeArea.spellcheck = false;
        codeArea.placeholder = '// Click "Show example" to load a template for the selected stage.';
        codeArea.value = this.def.code ?? '';

        // Update example when stage changes
        ctxSelect.addEventListener('change', () => {
            const ctx = ctxSelect.value as CompileStepKind;
            if (codeArea.value === STEP_API_DOCS[this.def.context as CompileStepKind ?? 'scene'] ||
                codeArea.value.trim() === '') {
                codeArea.value = STEP_API_DOCS[ctx];
            }
            this.def.context = ctx;
        });

        docsBtn.addEventListener('click', () => {
            codeArea.value = STEP_API_DOCS[ctxSelect.value as CompileStepKind];
        });

        // Warning
        const warn = contentEl.createDiv('storyteller-step-warning');
        const warnIcon = warn.createSpan();
        setIcon(warnIcon, 'alert-triangle');
        warn.createSpan({ text: ' Custom steps run arbitrary JavaScript. Only add steps you trust.' });

        // Buttons
        const btnRow = contentEl.createDiv('storyteller-step-btn-row');

        const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = btnRow.createEl('button', { text: 'Save Step', cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.classList.add('storyteller-input-error');
                nameInput.focus();
                return;
            }
            const code = codeArea.value.trim();
            if (!code) {
                codeArea.classList.add('storyteller-input-error');
                codeArea.focus();
                return;
            }

            this.onSave({
                id: this.def.id ?? `step-${Date.now()}`,
                name,
                description: descInput.value.trim(),
                context: ctxSelect.value as CompileStepKind,
                code,
            });
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
