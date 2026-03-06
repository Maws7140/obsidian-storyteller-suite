/**
 * LedgerEditorExtension
 *
 * - Reading mode / live preview rendering via registerMarkdownCodeBlockProcessor
 * - Source mode rendering via a CM6 decoration extension
 */

import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from '@codemirror/view';
import { App, TFile, editorLivePreviewField, setIcon } from 'obsidian';
import { parseLedger, computeBalance, formatBalance, parseLedgerLine, LedgerEntry } from '../utils/LedgerParser';

const LEDGER_FENCE_RE = /```ledger\s*\r?\n([\s\S]*?)```/gi;

function serializeEntries(entries: LedgerEntry[]): string {
    const lines = entries.map((entry) =>
        entry.date
            ? `${entry.date} | ${entry.rawAmount} | ${entry.description}`
            : `${entry.rawAmount} | ${entry.description}`
    );
    return '```ledger\n' + lines.join('\n') + '\n```';
}

function intersectsSelection(view: EditorView, from: number, to: number): boolean {
    return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildSourceModeDecorations(view: EditorView): DecorationSet {
    if (view.state.field(editorLivePreviewField, false)) {
        return Decoration.none;
    }

    const builder = new RangeSetBuilder<Decoration>();
    const docText = view.state.doc.toString();
    LEDGER_FENCE_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = LEDGER_FENCE_RE.exec(docText)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (intersectsSelection(view, from, to)) continue;

        const source = match[1] || '';
        builder.add(
            from,
            to,
            Decoration.replace({
                block: true,
                widget: new LedgerWidget(source, from, to)
            })
        );
    }

    return builder.finish();
}

class LedgerWidget extends WidgetType {
    constructor(
        private readonly source: string,
        private readonly from: number,
        private readonly to: number
    ) {
        super();
    }

    eq(other: LedgerWidget): boolean {
        return other.source === this.source && other.from === this.from && other.to === this.to;
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement('div');
        container.className = 'storyteller-codeblock-widget storyteller-codeblock-widget-ledger';

        const entries = parseLedger(this.source);
        renderLedgerWidget(container, entries, (newEntries: LedgerEntry[]) => {
            const newBlock = serializeEntries(newEntries);
            view.dispatch({
                changes: { from: this.from, to: this.to, insert: newBlock }
            });
        });

        return container;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

const sourceModeLedgerWidgetExtension = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildSourceModeDecorations(view);
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.selectionSet || update.focusChanged) {
                this.decorations = buildSourceModeDecorations(update.view);
            }
        }
    },
    {
        decorations: (instance) => instance.decorations
    }
);

/**
 * Render an interactive ledger widget into `container`.
 * `onWriteBack` is called with the full updated entry list whenever the user
 * saves a change. The caller is responsible for persisting it.
 */
export function renderLedgerWidget(
    container: HTMLElement,
    initialEntries: LedgerEntry[],
    onWriteBack: (newEntries: LedgerEntry[]) => void
): void {
    let entries = [...initialEntries];

    const root = container.createDiv('storyteller-ledger-widget');

    function rebuild(): void {
        root.empty();
        buildHeader(root);
        if (entries.length > 0) {
            buildTable(root);
        } else {
            root.createDiv({ cls: 'storyteller-ledger-empty', text: 'No transactions yet.' });
        }
        buildAddArea(root);
    }

    function buildHeader(parent: HTMLElement): void {
        const header = parent.createDiv('storyteller-ledger-header');
        header.createSpan({ cls: 'storyteller-ledger-title', text: 'Ledger' });
        const balance = computeBalance(entries);
        header.createSpan({ cls: 'storyteller-ledger-balance', text: 'Balance: ' + formatBalance(balance) });
    }

    function buildTable(parent: HTMLElement): void {
        const table = parent.createEl('table', { cls: 'storyteller-ledger-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (const col of ['Date', 'Amount', 'Description', '']) {
            headerRow.createEl('th', { text: col });
        }
        const tbody = table.createEl('tbody');
        entries.forEach((entry, index) => buildRow(tbody, entry, index));
    }

    function buildRow(tbody: HTMLElement, entry: LedgerEntry, index: number): void {
        const row = tbody.createEl('tr', { cls: 'storyteller-ledger-row' });

        row.createEl('td', { cls: 'storyteller-ledger-date', text: entry.date || '' });

        const amountClass = `storyteller-ledger-amount ${entry.cpValue >= 0 ? 'is-positive' : 'is-negative'}`;
        row.createEl('td', { cls: amountClass, text: entry.rawAmount });

        row.createEl('td', { cls: 'storyteller-ledger-desc', text: entry.description });

        const actions = row.createEl('td', { cls: 'storyteller-ledger-actions' });

        const editBtn = actions.createEl('button', { cls: 'storyteller-ledger-btn', attr: { 'aria-label': 'Edit' } });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => showEditForm(row, entry, index));

        const deleteBtn = actions.createEl('button', { cls: 'storyteller-ledger-btn', attr: { 'aria-label': 'Delete' } });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => {
            entries = entries.filter((_, i) => i !== index);
            onWriteBack(entries);
            rebuild();
        });
    }

    function showEditForm(rowEl: HTMLElement, entry: LedgerEntry, index: number): void {
        rowEl.empty();
        const cell = rowEl.createEl('td', { attr: { colspan: '4' } });
        buildForm(
            cell,
            entry.date || '',
            entry.rawAmount,
            entry.description,
            (date, rawAmount, description, errorEl) => {
                const line = date
                    ? `${date} | ${rawAmount} | ${description}`
                    : `${rawAmount} | ${description}`;
                const parsed = parseLedgerLine(line);
                if (!parsed) {
                    errorEl.textContent = 'Invalid amount - use formats like +50gp, -25sp';
                    return false;
                }

                entries = entries.map((current, i) => (i === index ? parsed : current));
                onWriteBack(entries);
                rebuild();
                return true;
            },
            () => rebuild()
        );
    }

    function buildAddArea(parent: HTMLElement): void {
        const area = parent.createDiv('storyteller-ledger-add-area');
        buildAddButton(area);
    }

    function buildAddButton(area: HTMLElement): void {
        area.empty();
        const btn = area.createEl('button', { cls: 'storyteller-ledger-add-btn' });
        const icon = btn.createSpan();
        setIcon(icon, 'plus');
        btn.createSpan({ text: ' Add transaction' });
        btn.addEventListener('click', () => showAddForm(area));
    }

    function showAddForm(area: HTMLElement): void {
        area.empty();
        const formWrap = area.createDiv('storyteller-ledger-add-form-wrap');
        buildForm(
            formWrap,
            '',
            '',
            '',
            (date, rawAmount, description, errorEl) => {
                const line = date
                    ? `${date} | ${rawAmount} | ${description}`
                    : `${rawAmount} | ${description}`;
                const parsed = parseLedgerLine(line);
                if (!parsed) {
                    errorEl.textContent = 'Invalid amount - use formats like +50gp, -25sp';
                    return false;
                }

                entries = [...entries, parsed];
                onWriteBack(entries);
                rebuild();
                return true;
            },
            () => buildAddButton(area)
        );
    }

    function buildForm(
        parent: HTMLElement,
        initialDate: string,
        initialAmount: string,
        initialDesc: string,
        onSave: (date: string, rawAmount: string, desc: string, errorEl: HTMLElement) => boolean,
        onCancel: () => void
    ): void {
        const form = parent.createDiv('storyteller-ledger-form');

        const dateInput = form.createEl('input', {
            cls: 'storyteller-ledger-input',
            attr: { type: 'text', placeholder: 'YYYY-MM-DD' }
        });
        dateInput.value = initialDate;

        const amountInput = form.createEl('input', {
            cls: 'storyteller-ledger-input',
            attr: { type: 'text', placeholder: '+50gp' }
        });
        amountInput.value = initialAmount;

        const descInput = form.createEl('input', {
            cls: 'storyteller-ledger-input',
            attr: { type: 'text', placeholder: 'Description' }
        });
        descInput.value = initialDesc;

        const actions = form.createDiv('storyteller-ledger-form-actions');
        const saveBtn = actions.createEl('button', { cls: 'storyteller-ledger-btn is-save', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'storyteller-ledger-btn is-cancel', text: 'Cancel' });

        const errorEl = form.createSpan({ cls: 'storyteller-ledger-error' });

        const doSave = () => {
            errorEl.textContent = '';
            onSave(dateInput.value.trim(), amountInput.value.trim(), descInput.value.trim(), errorEl);
        };

        saveBtn.addEventListener('click', doSave);
        cancelBtn.addEventListener('click', onCancel);

        for (const input of [dateInput, amountInput, descInput]) {
            input.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    doSave();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancel();
                }
            });
        }

        if (!initialAmount) {
            amountInput.focus();
        } else {
            dateInput.focus();
        }
    }

    rebuild();
}

export function createLedgerViewExtension(_app: App) {
    return [sourceModeLedgerWidgetExtension];
}

export function registerLedgerBlockProcessor(app: App, plugin: { registerMarkdownCodeBlockProcessor: Function }): void {
    plugin.registerMarkdownCodeBlockProcessor('ledger', (source: string, el: HTMLElement, ctx: { sourcePath: string }) => {
        const entries = parseLedger(source);

        renderLedgerWidget(el, entries, async (newEntries: LedgerEntry[]) => {
            const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (!(file instanceof TFile)) return;

            const oldBlock = '```ledger\n' + source + '```';
            const newBlock = serializeEntries(newEntries);

            await (app.vault as any).process(file, (content: string) => {
                const idx = content.indexOf(oldBlock);
                if (idx === -1) return content;
                return content.slice(0, idx) + newBlock + content.slice(idx + oldBlock.length);
            });
        });
    });
}
