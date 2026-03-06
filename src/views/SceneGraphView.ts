/**
 * SceneGraphView — interactive Cytoscape flowchart of scene branches.
 *
 * Nodes represent scenes; edges represent branches between them.
 * Node colours:
 *   - green border: entry scene (no incoming edges)
 *   - orange: has an encounter table
 *   - red: dead end (no outgoing edges from branches)
 *   - default: normal scene
 *
 * Edge labels: "always" | "🎲 d20 DEX ≥14" | "🔑 Gold Coin"
 *
 * Click node → open scene note in new leaf
 * Double-click → open BranchEditorModal for that scene
 * "Run from here" toolbar button → activateCampaignView starting at that scene
 */

import { ItemView, WorkspaceLeaf, setIcon, TFile, Notice } from 'obsidian';
import cytoscape, { Core } from 'cytoscape';
import StorytellerSuitePlugin from '../main';
import { extractBranchesFromMarkdown, extractEncounterTableFromMarkdown } from '../utils/BranchParser';
import { Scene } from '../types';

export const VIEW_TYPE_SCENE_GRAPH = 'storyteller-scene-graph';

export class SceneGraphView extends ItemView {
    private plugin: StorytellerSuitePlugin;
    private cy: Core | null = null;
    private selectedSceneId: string | null = null;
    private containerEl2: HTMLElement | null = null;
    private layoutDirection: 'left-to-right' | 'top-to-bottom' = 'left-to-right';

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_SCENE_GRAPH; }
    getDisplayText(): string { return 'Scene Graph'; }
    getIcon(): string { return 'git-branch'; }

    async onOpen(): Promise<void> {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('storyteller-scene-graph-view');

        // Toolbar
        const toolbar = root.createDiv({
            cls: 'storyteller-scene-graph-toolbar storyteller-timeline-toolbar',
        });

        const refreshBtn = toolbar.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Refresh' },
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.buildGraph());

        const fitBtn = toolbar.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Fit to screen' },
        });
        setIcon(fitBtn, 'maximize');
        fitBtn.addEventListener('click', () => this.cy?.fit(undefined, 40));

        const layoutToggleBtn = toolbar.createEl('button', {
            cls: 'storyteller-scene-graph-layout-btn storyteller-toolbar-btn',
            attr: { 'aria-label': 'Toggle layout direction' },
        });
        this.updateLayoutToggleButton(layoutToggleBtn);
        layoutToggleBtn.addEventListener('click', () => {
            this.layoutDirection = this.layoutDirection === 'left-to-right'
                ? 'top-to-bottom'
                : 'left-to-right';
            this.updateLayoutToggleButton(layoutToggleBtn);
            this.cy?.layout(this.getLayoutOptions()).run();
        });

        toolbar.createDiv({ cls: 'storyteller-scene-graph-toolbar-spacer' });

        const runBtn = toolbar.createEl('button', {
            cls: 'storyteller-scene-graph-run-btn storyteller-toolbar-btn',
            text: 'Run from here',
        });
        setIcon(runBtn.createSpan({ cls: 'storyteller-scene-graph-run-icon' }), 'swords');
        runBtn.disabled = true;
        runBtn.addEventListener('click', () => {
            if (!this.selectedSceneId) return;
            const scene = this._scenes.find(s => s.id === this.selectedSceneId || s.name === this.selectedSceneId);
            if (scene) this.plugin.activateCampaignView(undefined, scene);
        });

        // Graph container
        this.containerEl2 = root.createDiv({
            cls: 'storyteller-scene-graph-container storyteller-timeline-container',
        });

        await this.buildGraph();

        // Update run button on selection
        if (this.cy) {
            this.cy.on('select', 'node', (e) => {
                this.selectedSceneId = e.target.id();
                runBtn.disabled = false;
            });
            this.cy.on('unselect', 'node', () => {
                this.selectedSceneId = null;
                runBtn.disabled = true;
            });
        }
    }

    private _scenes: Scene[] = [];

    async buildGraph(): Promise<void> {
        if (!this.containerEl2) return;

        let scenes: Scene[] = [];
        try {
            scenes = await this.plugin.listScenes();
        } catch {
            this.containerEl2.empty();
            this.containerEl2.createEl('p', { text: 'No active story selected.' });
            return;
        }
        this._scenes = scenes;

        // Parse branches from each scene file
        const sceneData: Array<{
            scene: Scene;
            branches: import('../types').SceneBranch[];
            hasEncounter: boolean;
        }> = [];

        for (const scene of scenes) {
            if (!scene.filePath) { sceneData.push({ scene, branches: [], hasEncounter: false }); continue; }
            const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
            if (!(file instanceof TFile)) { sceneData.push({ scene, branches: [], hasEncounter: false }); continue; }
            const content = await this.plugin.app.vault.cachedRead(file);
            const branches = extractBranchesFromMarkdown(content);
            const hasEncounter = extractEncounterTableFromMarkdown(content) !== null;
            sceneData.push({ scene, branches, hasEncounter });
        }

        // Build node/edge sets
        const incomingSet = new Set<string>();
        const outgoingSet = new Set<string>();

        const elements: cytoscape.ElementDefinition[] = [];

        // Edges first (to determine entry/dead-end)
        const edges: cytoscape.ElementDefinition[] = [];
        for (const { scene, branches } of sceneData) {
            const srcId = scene.id ?? scene.name;
            for (const branch of branches) {
                if (!branch.target) continue;
                // Try to match target scene by name
                const targetScene = sceneData.find(d => d.scene.name === branch.target);
                const tgtId = targetScene ? (targetScene.scene.id ?? targetScene.scene.name) : branch.target;

                const parts: string[] = [];
                if (branch.dice) {
                    const stat = branch.stat ? ` ${branch.stat.toUpperCase()}` : '';
                    const threshold = branch.threshold != null ? ` ≥${branch.threshold}` : '';
                    parts.push(`🎲 ${branch.dice}${stat}${threshold}`);
                } else if (branch.requiresStatMin != null && branch.stat) {
                    parts.push(`${branch.stat.toUpperCase()} ≥${branch.requiresStatMin}`);
                }
                if (branch.requiresItem)      parts.push(`🔑 ${branch.requiresItem}`);
                if (branch.requiresCharacter) parts.push(`👤 ${branch.requiresCharacter}`);
                if (branch.requiresFlag)      parts.push(`🏳 ${branch.requiresFlag}`);
                const label = parts.length > 0 ? parts.join(' · ') : 'always';

                outgoingSet.add(srcId);
                incomingSet.add(tgtId);
                edges.push({
                    data: {
                        id: `${srcId}->${tgtId}`,
                        source: srcId,
                        target: tgtId,
                        label: this.truncateLabel(label, 48),
                        hasCondition: !!(branch.dice || branch.requiresItem || branch.requiresCharacter || branch.requiresFlag || branch.requiresStatMin != null),
                    }
                });

                // Fail target
                if (branch.fail && branch.failMode === 'scene') {
                    const failScene = sceneData.find(d => d.scene.name === branch.fail);
                    const fId = failScene ? (failScene.scene.id ?? failScene.scene.name) : branch.fail;
                    incomingSet.add(fId);
                    outgoingSet.add(srcId);
                    edges.push({
                        data: {
                            id: `${srcId}->fail-${fId}`,
                            source: srcId,
                            target: fId,
                            label: 'Fail',
                            hasCondition: true,
                        }
                    });
                }
            }
        }

        // Nodes
        for (const { scene, hasEncounter } of sceneData) {
            const id = scene.id ?? scene.name;
            const isEntry = !incomingSet.has(id);
            const isDeadEnd = !outgoingSet.has(id);
            elements.push({
                data: {
                    id,
                    label: scene.name,
                    filePath: scene.filePath ?? '',
                    sceneName: scene.name,
                    isEntry,
                    isDeadEnd,
                    hasEncounter,
                }
            });
        }

        elements.push(...edges);

        // Mount Cytoscape
        if (this.cy) { this.cy.destroy(); this.cy = null; }
        this.containerEl2.empty();
        const theme = this.getGraphTheme();

        try {
            this.cy = cytoscape({
                container: this.containerEl2,
                elements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'text-justification': 'center',
                            'text-margin-x': 0,
                            'text-wrap': 'ellipsis',
                            'text-max-width': '238px',
                            'width': 256,
                            'height': 36,
                            'shape': 'round-rectangle',
                            'background-color': theme.nodeBackground,
                            'border-width': 1.5,
                            'border-color': theme.nodeBorder,
                            'color': theme.nodeText,
                            'font-size': '12px',
                            'font-weight': 600,
                            'line-height': 1.15,
                            'overlay-opacity': 0,
                            'shadow-color': theme.nodeShadow,
                            'shadow-opacity': 0.2,
                            'shadow-blur': 9,
                            'shadow-offset-x': 0,
                            'shadow-offset-y': 2,
                        } as any
                    },
                    {
                        selector: 'node[?isEntry]',
                        style: { 'border-color': theme.entryBorder, 'border-width': 2.5 } as any
                    },
                    {
                        selector: 'node[?isDeadEnd]',
                        style: { 'border-color': theme.deadEndBorder, 'border-width': 2.5 } as any
                    },
                    {
                        selector: 'node[?hasEncounter]',
                        style: { 'border-color': theme.encounterBorder, 'border-width': 2.5 } as any
                    },
                    {
                        selector: 'node:selected',
                        style: {
                            'background-color': theme.selectedBackground,
                            'border-width': 2.5,
                            'border-color': theme.selectedBorder,
                        } as any
                    },
                    {
                        selector: 'edge',
                        style: {
                            'label': 'data(label)',
                            'width': 2,
                            'line-color': theme.edge,
                            'target-arrow-color': theme.edge,
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'taxi',
                            'taxi-direction': 'horizontal',
                            'font-size': '10px',
                            'font-weight': 500,
                            'color': theme.edgeText,
                            'text-wrap': 'ellipsis',
                            'text-max-width': '160px',
                            'text-background-opacity': 1,
                            'text-background-color': theme.edgeLabelBackground,
                            'text-background-padding': '3px',
                            'text-rotation': 'none',
                            'arrow-scale': 0.9,
                            'line-style': 'solid',
                        } as any
                    },
                    {
                        selector: 'edge[?hasCondition]',
                        style: { 'line-color': theme.conditionEdge, 'target-arrow-color': theme.conditionEdge } as any
                    },
                ],
                layout: this.getLayoutOptions(),
            });

            // Click → open note
            this.cy.on('tap', 'node', async (e: any) => {
                const fp = e.target.data('filePath') as string;
                if (fp) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(fp);
                    if (file) await this.plugin.app.workspace.openLinkText(file.name, '', true);
                }
            });

            // Double-click → BranchEditorModal
            this.cy.on('dblclick', 'node', async (e: any) => {
                const fp = e.target.data('filePath') as string;
                if (!fp) return;
                const { BranchEditorModal } = await import('../modals/BranchEditorModal');
                new BranchEditorModal(this.plugin.app, this.plugin, fp, () => {
                    this.buildGraph();
                }).open();
            });

        } catch (err) {
            new Notice('Failed to render scene graph. Check console for details.');
            console.error('[SceneGraphView]', err);
        }
    }

    private updateLayoutToggleButton(button: HTMLButtonElement): void {
        button.empty();
        setIcon(button.createSpan({ cls: 'storyteller-scene-graph-layout-icon' }), 'panel-left');
        button.createSpan({
            text: this.layoutDirection === 'left-to-right'
                ? ' Left to right'
                : ' Top to bottom',
        });
    }

    private getLayoutOptions(): any {
        const horizontal = this.layoutDirection === 'left-to-right';
        return {
            name: 'breadthfirst',
            directed: true,
            padding: 44,
            spacingFactor: 1.44,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
            animate: false,
            transform: (_node: any, pos: { x: number; y: number }) =>
                horizontal ? { x: pos.y, y: pos.x } : pos,
        };
    }

    private getGraphTheme(): {
        nodeBackground: string;
        nodeBorder: string;
        nodeText: string;
        selectedBackground: string;
        selectedBorder: string;
        nodeShadow: string;
        edge: string;
        edgeText: string;
        edgeLabelBackground: string;
        conditionEdge: string;
        entryBorder: string;
        deadEndBorder: string;
        encounterBorder: string;
    } {
        const styles = getComputedStyle(document.body);
        const color = (name: string, fallback: string): string => {
            const value = styles.getPropertyValue(name).trim();
            return value || fallback;
        };

        return {
            nodeBackground: color('--background-secondary', '#2a2f3a'),
            nodeBorder: color('--background-modifier-border', '#4a5263'),
            nodeText: color('--text-normal', '#d7dce5'),
            selectedBackground: color('--background-secondary-alt', '#343b48'),
            selectedBorder: color('--interactive-accent', '#6ba8ff'),
            nodeShadow: color('--background-modifier-box-shadow', 'rgba(0, 0, 0, 0.34)'),
            edge: color('--background-modifier-border-focus', '#73819b'),
            edgeText: color('--text-muted', '#a8b0c2'),
            edgeLabelBackground: color('--background-primary', '#1e222b'),
            conditionEdge: color('--color-orange', '#d9922e'),
            entryBorder: color('--color-green', '#2fb779'),
            deadEndBorder: color('--color-red', '#e65757'),
            encounterBorder: color('--color-orange', '#d9922e'),
        };
    }

    private truncateLabel(value: string, maxLength: number): string {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
    }

    async onClose(): Promise<void> {
        if (this.cy) { this.cy.destroy(); this.cy = null; }
    }
}
