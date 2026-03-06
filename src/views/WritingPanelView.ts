/**
 * WritingPanelView — standalone panel for the Board / Arc / Heatmap / Holes
 * writing analysis views. Can be opened from the Writing tab pop-out button or
 * from the command palette. Supports an initial mode via setState.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { WritingViewRenderers, WritingPanelMode } from './WritingViewRenderers';

export const VIEW_TYPE_WRITING_PANEL = 'storyteller-writing-panel-view';

const MODES: Array<{ id: WritingPanelMode; icon: string; label: string }> = [
    { id: 'board',   icon: 'columns-3',    label: 'Board'   },
    { id: 'arc',     icon: 'activity',     label: 'Arc'     },
    { id: 'heatmap', icon: 'grid',         label: 'Heatmap' },
    { id: 'holes',   icon: 'shield-alert', label: 'Holes'   },
];

export class WritingPanelView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private renderers: WritingViewRenderers;
    private _mode: WritingPanelMode = 'board';
    private _filter: string = '';
    private _bodyEl: HTMLElement | null = null;
    private _switcherEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.renderers = new WritingViewRenderers(this.app, plugin);
    }

    getViewType(): string { return VIEW_TYPE_WRITING_PANEL; }
    getDisplayText(): string { return `Writing — ${this._mode.charAt(0).toUpperCase() + this._mode.slice(1)}`; }
    getIcon(): string { return 'columns-3'; }

    async onOpen(): Promise<void> {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('storyteller-writing-panel-view');

        // ── Mode switcher bar ─────────────────────────────────────────────────
        this._switcherEl = root.createDiv('storyteller-writing-switcher');

        const renderActive = async () => {
            this._bodyEl?.remove();
            this._bodyEl = root.createDiv('storyteller-writing-panel-body');

            // Filter input only shown for Board view
            if (this._mode === 'board') {
                const searchRow = this._bodyEl.createDiv('storyteller-panel-search-row');
                const input = searchRow.createEl('input', {
                    type: 'text',
                    placeholder: 'Filter scenes…',
                    cls: 'storyteller-panel-search-input',
                });
                input.value = this._filter;
                input.addEventListener('input', () => {
                    this._filter = input.value.toLowerCase();
                    this.renderers.renderKanbanBoard(this._bodyEl!.createDiv(), this._filter);
                });
            }

            const content = this._bodyEl.createDiv('storyteller-writing-panel-content');
            switch (this._mode) {
                case 'board':   await this.renderers.renderKanbanBoard(content, this._filter); break;
                case 'arc':     await this.renderers.renderArcChart(content); break;
                case 'heatmap': await this.renderers.renderHeatmap(content); break;
                case 'holes':   await this.renderers.renderPlotHoles(content); break;
            }

        };

        MODES.forEach(m => {
            const btn = this._switcherEl!.createEl('button', {
                cls: `storyteller-switcher-btn${this._mode === m.id ? ' is-active' : ''}`,
            });
            setIcon(btn.createSpan(), m.icon);
            btn.createSpan({ text: m.label });
            btn.onclick = async () => {
                this._mode = m.id;
                this._switcherEl!.querySelectorAll('.storyteller-switcher-btn')
                    .forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                await renderActive();
            };
        });

        // Refresh button
        const refreshBtn = this._switcherEl.createEl('button', {
            cls: 'storyteller-switcher-btn storyteller-switcher-refresh',
            title: 'Refresh',
        });
        setIcon(refreshBtn.createSpan(), 'refresh-cw');
        refreshBtn.onclick = () => renderActive();

        await renderActive();
    }

    /** Set the active mode and re-render. Called by activateWritingPanelView. */
    async setMode(mode: WritingPanelMode): Promise<void> {
        this._mode = mode;
        // Update switcher active state if already rendered
        if (this._switcherEl) {
            this._switcherEl.querySelectorAll('.storyteller-switcher-btn')
                .forEach((btn, i) => {
                    if (i < MODES.length) {
                        btn.toggleClass('is-active', MODES[i].id === mode);
                    }
                });
        }
        this._bodyEl?.remove();
        this._bodyEl = null;
        // Re-trigger onOpen to rebuild with new mode
        await this.onOpen();
    }

    getState(): Record<string, unknown> {
        return { mode: this._mode };
    }

    async setState(state: Record<string, unknown>, _result: import('obsidian').ViewStateResult): Promise<void> {
        if (state.mode && MODES.some(m => m.id === state.mode)) {
            this._mode = state.mode as WritingPanelMode;
        }
        await this.onOpen();
    }

    async onClose(): Promise<void> {
        this._bodyEl = null;
        this._switcherEl = null;
    }
}
