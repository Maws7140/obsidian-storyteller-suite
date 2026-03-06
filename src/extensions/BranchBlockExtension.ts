/**
 * BranchBlockExtension
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
import { App, editorLivePreviewField, setIcon } from 'obsidian';
import { parseBranches, parseEncounterTable } from '../utils/BranchParser';
import { rollEncounterTable } from '../utils/DiceRoller';
import { EncounterTable, SceneBranch } from '../types';

type SupportedBlockLanguage = 'branch' | 'encounter';

const FENCED_BLOCK_RE = /```(branch|encounter)\s*\r?\n([\s\S]*?)```/gi;

function intersectsSelection(view: EditorView, from: number, to: number): boolean {
    return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildSourceModeDecorations(view: EditorView): DecorationSet {
    if (view.state.field(editorLivePreviewField, false)) {
        return Decoration.none;
    }

    const builder = new RangeSetBuilder<Decoration>();
    const docText = view.state.doc.toString();
    FENCED_BLOCK_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = FENCED_BLOCK_RE.exec(docText)) !== null) {
        const from = match.index;
        const to = from + match[0].length;

        // Keep raw text visible while the cursor is inside the block so it can still be edited.
        if (intersectsSelection(view, from, to)) continue;

        const language = (match[1] || '').toLowerCase() as SupportedBlockLanguage;
        const source = match[2] || '';
        builder.add(
            from,
            to,
            Decoration.replace({
                block: true,
                widget: new BranchEncounterWidget(language, source)
            })
        );
    }

    return builder.finish();
}

class BranchEncounterWidget extends WidgetType {
    constructor(
        private readonly language: SupportedBlockLanguage,
        private readonly source: string
    ) {
        super();
    }

    eq(other: BranchEncounterWidget): boolean {
        return other.language === this.language && other.source === this.source;
    }

    toDOM(): HTMLElement {
        const container = document.createElement('div');
        container.className = `storyteller-codeblock-widget storyteller-codeblock-widget-${this.language}`;
        if (this.language === 'branch') {
            const branches = parseBranches(this.source);
            renderBranchWidget(container, branches);
            return container;
        }

        const table = parseEncounterTable(this.source);
        if (!table) {
            container.createDiv({ cls: 'storyteller-encounter-error', text: 'Invalid encounter table format.' });
            return container;
        }

        renderEncounterWidget(container, table);
        return container;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

const sourceModeBranchWidgetExtension = ViewPlugin.fromClass(
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

export function renderBranchWidget(container: HTMLElement, branches: SceneBranch[]): void {
    const root = container.createDiv('storyteller-branch-block');

    const header = root.createDiv('storyteller-branch-block-header');
    const iconSpan = header.createSpan();
    setIcon(iconSpan, 'git-branch');
    header.createSpan({ cls: 'storyteller-branch-block-title', text: 'Choices' });

    if (branches.length === 0) {
        root.createDiv({ cls: 'storyteller-branch-empty', text: 'No choices defined.' });
        return;
    }

    for (const branch of branches) {
        const card = root.createDiv(`storyteller-branch-choice${branch.hidden ? ' is-hidden' : ''}`);

        const labelRow = card.createDiv('storyteller-branch-choice-label-row');
        labelRow.createSpan({ cls: 'storyteller-branch-choice-label', text: branch.label });
        if (branch.target) {
            labelRow.createSpan({ cls: 'storyteller-branch-choice-target', text: `-> ${branch.target}` });
        }
        if (branch.fail) {
            const failText = branch.failMode === 'loop' ? 'x retry' : `x -> ${branch.fail}`;
            labelRow.createSpan({ cls: 'storyteller-branch-choice-fail', text: failText });
        }
        if (branch.hidden) {
            labelRow.createSpan({ cls: 'storyteller-branch-hidden-tag', text: 'hidden' });
        }

        const hasConditions = branch.dice || branch.requiresItem || branch.requiresCharacter
            || branch.requiresFlag || branch.requiresStatMin != null;
        if (hasConditions) {
            const conditions = card.createDiv('storyteller-branch-conditions');

            if (branch.dice) {
                const tag = conditions.createSpan({ cls: 'storyteller-branch-tag is-dice' });
                const statStr = branch.stat ? ` ${branch.stat.toUpperCase()}` : '';
                const thresholdStr = branch.threshold != null ? ` >=${branch.threshold}` : '';
                tag.textContent = `Roll ${branch.dice}${statStr}${thresholdStr}`;
            }
            if (branch.requiresStatMin != null && branch.stat && !branch.dice) {
                const tag = conditions.createSpan({ cls: 'storyteller-branch-tag is-stat' });
                tag.textContent = `${branch.stat.toUpperCase()} >= ${branch.requiresStatMin}`;
            }
            if (branch.requiresItem) {
                const tag = conditions.createSpan({ cls: 'storyteller-branch-tag is-item' });
                tag.textContent = `Item: ${branch.requiresItem}`;
            }
            if (branch.requiresCharacter) {
                const tag = conditions.createSpan({ cls: 'storyteller-branch-tag is-character' });
                tag.textContent = `Character: ${branch.requiresCharacter}`;
            }
            if (branch.requiresFlag) {
                const tag = conditions.createSpan({ cls: 'storyteller-branch-tag is-flag' });
                tag.textContent = `Flag: ${branch.requiresFlag}`;
            }
        }

        const hasOutcomes = branch.grantsItem || branch.removesItem || branch.grantsCharacter
            || branch.removesCharacter || branch.setsFlag || branch.triggersEvent;
        if (hasOutcomes) {
            const outcomes = card.createDiv('storyteller-branch-outcomes');

            if (branch.grantsItem) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-grant', text: `+ ${branch.grantsItem}` });
            }
            if (branch.removesItem) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-remove', text: `- ${branch.removesItem}` });
            }
            if (branch.grantsCharacter) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-grant', text: `+ ${branch.grantsCharacter} joins` });
            }
            if (branch.removesCharacter) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-remove', text: `- ${branch.removesCharacter} leaves` });
            }
            if (branch.setsFlag) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-flag', text: `Flag: ${branch.setsFlag}` });
            }
            if (branch.triggersEvent) {
                outcomes.createSpan({ cls: 'storyteller-branch-outcome is-event', text: `Event: ${branch.triggersEvent}` });
            }
        }
    }
}

export function renderEncounterWidget(container: HTMLElement, table: EncounterTable): void {
    const root = container.createDiv('storyteller-encounter-block');

    const header = root.createDiv('storyteller-encounter-header');
    const iconSpan = header.createSpan();
    setIcon(iconSpan, 'dices');
    header.createSpan({ cls: 'storyteller-encounter-title', text: `Encounter Table (${table.dice})` });
    header.createSpan({
        cls: 'storyteller-encounter-trigger',
        text: table.trigger === 'on-enter' ? 'on enter' : 'manual'
    });

    const tableEl = root.createEl('table', { cls: 'storyteller-encounter-table' });
    const thead = tableEl.createEl('thead');
    const headerRow = thead.createEl('tr');
    for (const col of ['Roll', 'Event', 'Target']) {
        headerRow.createEl('th', { text: col });
    }

    const tbody = tableEl.createEl('tbody');
    for (const row of table.rows) {
        const tr = tbody.createEl('tr', { cls: 'storyteller-encounter-row' });
        const rangeStr = row.min === row.max ? String(row.min) : `${row.min}-${row.max}`;
        tr.createEl('td', { cls: 'storyteller-encounter-range', text: rangeStr });
        tr.createEl('td', { cls: 'storyteller-encounter-label', text: row.label });
        tr.createEl('td', { cls: 'storyteller-encounter-target', text: row.target });
    }

    const resultEl = root.createDiv({ cls: 'storyteller-encounter-result', text: '' });
    const rollBtn = root.createEl('button', { cls: 'storyteller-encounter-roll-btn' });
    const btnIcon = rollBtn.createSpan();
    setIcon(btnIcon, 'dices');
    rollBtn.createSpan({ text: 'Roll' });

    rollBtn.addEventListener('click', () => {
        const hit = rollEncounterTable(table);
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row) => row.removeClass('is-active'));
        const idx = table.rows.indexOf(hit);
        if (idx >= 0 && rows[idx]) rows[idx].addClass('is-active');
        resultEl.textContent = `Result: ${hit.label} -> ${hit.target}`;
    });
}

export function createBranchViewExtension() {
    return [sourceModeBranchWidgetExtension];
}

export function registerBranchBlockProcessors(
    _app: App,
    plugin: { registerMarkdownCodeBlockProcessor: Function }
): void {
    plugin.registerMarkdownCodeBlockProcessor('branch', (source: string, el: HTMLElement) => {
        const branches = parseBranches(source);
        renderBranchWidget(el, branches);
    });

    plugin.registerMarkdownCodeBlockProcessor('encounter', (source: string, el: HTMLElement) => {
        const table = parseEncounterTable(source);
        if (!table) {
            el.createDiv({ cls: 'storyteller-encounter-error', text: 'Invalid encounter table format.' });
            return;
        }
        renderEncounterWidget(el, table);
    });
}
