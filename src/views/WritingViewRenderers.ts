/**
 * WritingViewRenderers — shared render logic for the Board / Arc / Heatmap / Holes
 * writing analysis views. Used by both DashboardView (inline) and WritingPanelView
 * (standalone panel). The class holds per-instance state (kanban grouping) so
 * each view maintains its own preferences independently.
 */

import { App, TFile, Notice, setIcon } from 'obsidian';
import StorytellerSuitePlugin from '../main';

export type KanbanGroupBy = 'status' | 'chapter' | 'pov';
export type WritingPanelMode = 'board' | 'arc' | 'heatmap' | 'holes';

const EMOTION_COLORS: Record<string, string> = {
    tense: '#ef5350', joyful: '#fdd835', sorrowful: '#5c6bc0',
    mysterious: '#ab47bc', hopeful: '#66bb6a', fearful: '#8d6e63',
    angry: '#f4511e', romantic: '#ec407a', melancholic: '#78909c', neutral: '#90a4ae',
};

const STATUS_CLASS: Record<string, string> = {
    Outline: 'sts-outline', Draft: 'sts-draft', WIP: 'sts-wip',
    Revised: 'sts-revised', Final: 'sts-final',
};

export class WritingViewRenderers {
    private app: App;
    private plugin: StorytellerSuitePlugin;
    kanbanGroupBy: KanbanGroupBy = 'status';

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    // ── Kanban Board ──────────────────────────────────────────────────────────

    async renderKanbanBoard(container: HTMLElement, filter: string) {
        const chapters = await this.plugin.listChapters();
        const filterFn = (sc: any) =>
            !filter ||
            sc.name.toLowerCase().includes(filter) ||
            (sc.chapterName || '').toLowerCase().includes(filter) ||
            (sc.povCharacter || '').toLowerCase().includes(filter);

        const controls = container.createDiv('storyteller-kanban-controls');
        controls.createSpan({ text: 'Group by:', cls: 'storyteller-kanban-label' });

        const groupByOptions: Array<{ id: KanbanGroupBy; label: string }> = [
            { id: 'status',  label: 'Status'  },
            { id: 'chapter', label: 'Chapter' },
            { id: 'pov',     label: 'POV'     },
        ];

        let boardEl: HTMLElement | null = null;

        const reloadBoard = async () => {
            const freshScenes = (await this.plugin.listScenes()).filter(filterFn);
            boardEl?.remove();
            boardEl = container.createDiv('storyteller-kanban-board');
            this._renderKanbanColumns(boardEl, freshScenes, chapters, this.kanbanGroupBy, reloadBoard);
        };

        groupByOptions.forEach(opt => {
            const btn = controls.createEl('button', {
                text: opt.label,
                cls: `storyteller-kanban-group-btn${this.kanbanGroupBy === opt.id ? ' is-active' : ''}`,
            });
            btn.onclick = () => {
                this.kanbanGroupBy = opt.id;
                controls.querySelectorAll('.storyteller-kanban-group-btn').forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                reloadBoard();
            };
        });

        await reloadBoard();
    }

    private _renderKanbanColumns(
        board: HTMLElement,
        scenes: any[],
        chapters: any[],
        groupBy: KanbanGroupBy,
        rerender?: () => void,
    ) {
        board.empty();
        const groups = new Map<string, any[]>();

        if (groupBy === 'status') {
            ['Outline', 'Draft', 'WIP', 'Revised', 'Final', '(none)'].forEach(s => groups.set(s, []));
            scenes.forEach(sc => {
                const key = sc.status || '(none)';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(sc);
            });
        } else if (groupBy === 'chapter') {
            [...chapters].sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
                .forEach(ch => groups.set(ch.name || ch.id, []));
            groups.set('(unassigned)', []);
            scenes.forEach(sc => {
                const key = sc.chapterName || '(unassigned)';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(sc);
            });
        } else {
            groups.set('(no POV)', []);
            scenes.forEach(sc => {
                const key = sc.povCharacter || '(no POV)';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(sc);
            });
        }

        const chapterByName = new Map<string, any>(chapters.map(ch => [ch.name || ch.id, ch]));

        groups.forEach((groupScenes, groupName) => {
            if (groupScenes.length === 0 && groupBy !== 'status') return;

            const col = board.createDiv('storyteller-kanban-col');

            // Apply status color class to column
            if (groupBy === 'status' && groupName !== '(none)') {
                const sc = STATUS_CLASS[groupName];
                if (sc) col.addClass(`storyteller-kanban-col-${sc}`);
            }

            const hdr = col.createDiv('storyteller-kanban-col-header');
            hdr.createSpan({ text: groupName, cls: 'storyteller-kanban-col-title' });
            hdr.createSpan({ text: String(groupScenes.length), cls: 'storyteller-kanban-col-count' });

            if (groupBy === 'chapter' && chapterByName.has(groupName)) {
                const ch = chapterByName.get(groupName)!;
                const editBtn = hdr.createEl('button', { cls: 'storyteller-kanban-col-edit-btn' });
                setIcon(editBtn, 'pencil');
                editBtn.title = `Edit chapter "${groupName}"`;
                editBtn.onclick = () => {
                    import('../modals/ChapterModal').then(({ ChapterModal }) => {
                        new ChapterModal(this.app, this.plugin, ch, async (updated: any) => {
                            await this.plugin.saveChapter(updated);
                            new Notice(`Chapter "${updated.name}" updated.`);
                        }, async (toDelete: any) => {
                            if (toDelete.filePath) await this.plugin.deleteChapter(toDelete.filePath);
                        }).open();
                    });
                };
            }

            const body = col.createDiv('storyteller-kanban-col-body');
            body.setAttr('data-group', groupName);

            // Drop-zone handlers
            body.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });
            body.addEventListener('dragenter', (e) => {
                e.preventDefault();
                body.addClass('storyteller-kanban-drop-over');
            });
            body.addEventListener('dragleave', (e) => {
                if (!body.contains(e.relatedTarget as Node)) {
                    body.removeClass('storyteller-kanban-drop-over');
                }
            });
            body.addEventListener('drop', async (e) => {
                e.preventDefault();
                body.removeClass('storyteller-kanban-drop-over');
                try {
                    const raw = e.dataTransfer?.getData('text/plain');
                    if (!raw) return;
                    const data = JSON.parse(raw);
                    const sc = scenes.find((s: any) => s.filePath === data.filePath);
                    if (!sc) return;
                    const updated = { ...sc };
                    if (groupBy === 'status') {
                        updated.status = groupName !== '(none)' ? groupName : undefined;
                    } else if (groupBy === 'chapter') {
                        const ch = chapterByName.get(groupName);
                        if (ch) {
                            updated.chapterId = ch.id;
                            updated.chapterName = ch.name;
                        } else {
                            updated.chapterId = undefined;
                            updated.chapterName = undefined;
                        }
                    } else {
                        updated.povCharacter = groupName !== '(no POV)' ? groupName : undefined;
                    }
                    await this.plugin.saveScene(updated);
                    if (rerender) rerender();
                } catch { /* ignore parse/save errors */ }
            });

            if (groupScenes.length === 0) {
                body.createDiv({ cls: 'storyteller-kanban-empty', text: 'No scenes' });
            } else {
                groupScenes.forEach(sc => this._renderKanbanCard(body, sc, groupBy));
            }
        });
    }

    private _renderKanbanCard(col: HTMLElement, sc: any, groupBy?: KanbanGroupBy) {
        const card = col.createDiv('storyteller-kanban-card');

        // Status color on card border-left
        const statusKey = sc.status && STATUS_CLASS[sc.status] ? `storyteller-kanban-card-${STATUS_CLASS[sc.status]}` : null;
        if (statusKey) card.addClass(statusKey);

        // Drag and drop
        card.setAttr('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', JSON.stringify({ filePath: sc.filePath }));
                e.dataTransfer.effectAllowed = 'move';
            }
            card.addClass('storyteller-kanban-card-dragging');
        });
        card.addEventListener('dragend', () => {
            card.removeClass('storyteller-kanban-card-dragging');
        });

        const title = card.createEl('strong', { text: sc.name, cls: 'storyteller-kanban-card-title' });
        title.addEventListener('click', () => {
            if (sc.filePath) {
                const f = this.app.vault.getAbstractFileByPath(sc.filePath);
                if (f instanceof TFile) this.app.workspace.openLinkText(sc.filePath, '', false);
            }
        });

        const meta = card.createDiv('storyteller-kanban-card-meta');
        if (sc.chapterName && groupBy !== 'chapter') {
            meta.createSpan({ text: sc.chapterName, cls: 'storyteller-kanban-chapter-label' });
        }
        if (sc.povCharacter && groupBy !== 'pov') {
            const pov = meta.createSpan({ cls: 'storyteller-scene-pov-badge' });
            setIcon(pov.createSpan(''), 'eye');
            pov.createSpan({ text: ` ${sc.povCharacter}` });
        }
        if (sc.emotion) {
            meta.createSpan({ text: sc.emotion, cls: `storyteller-scene-emotion-chip storyteller-emotion-${sc.emotion}` });
        }

        if (sc.intensity !== undefined && sc.intensity !== null) {
            const barWrap = card.createDiv('storyteller-intensity-mini');
            const fill = barWrap.createDiv('storyteller-intensity-fill');
            fill.style.width = `${Math.round(((Number(sc.intensity) + 10) / 20) * 100)}%`;
            fill.title = `Intensity: ${sc.intensity}`;
        }

        const actions = card.createDiv('storyteller-kanban-card-actions');

        const editBtn = actions.createEl('button', { cls: 'storyteller-kanban-action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.title = 'Edit scene';
        editBtn.onclick = () => {
            import('../modals/SceneModal').then(({ SceneModal }) => {
                new SceneModal(this.app, this.plugin, sc, async (updated) => {
                    await this.plugin.saveScene(updated);
                    new Notice(`Scene "${updated.name}" updated.`);
                }, async (toDelete) => {
                    if (toDelete.filePath) await this.plugin.deleteScene(toDelete.filePath);
                }).open();
            });
        };

        const openBtn = actions.createEl('button', { cls: 'storyteller-kanban-action-btn' });
        setIcon(openBtn, 'file-text');
        openBtn.title = 'Open note';
        openBtn.onclick = () => {
            if (sc.filePath) {
                const f = this.app.vault.getAbstractFileByPath(sc.filePath);
                if (f instanceof TFile) this.app.workspace.openLinkText(sc.filePath, '', false);
            }
        };
    }

    // ── Arc Chart ─────────────────────────────────────────────────────────────

    async renderArcChart(container: HTMLElement) {
        const allScenes = await this.plugin.listScenes();
        const chapters = (await this.plugin.listChapters()).sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

        if (allScenes.length === 0) {
            container.createEl('p', { text: 'No scenes yet — create some to see the arc.', cls: 'u-muted' });
            return;
        }

        const chapterOrder = new Map(chapters.map(ch => [ch.id || ch.name, ch.number ?? 999]));
        const sorted = [...allScenes].sort((a, b) => {
            const ao = chapterOrder.get(a.chapterId || a.chapterName || '') ?? 999;
            const bo = chapterOrder.get(b.chapterId || b.chapterName || '') ?? 999;
            if (ao !== bo) return ao - bo;
            return (a.name || '').localeCompare(b.name || '');
        });

        const W = 720, H = 280;
        const PAD = { top: 28, right: 28, bottom: 52, left: 42 };
        const iW = W - PAD.left - PAD.right;
        const iH = H - PAD.top - PAD.bottom;
        const n = sorted.length;
        const svgNS = 'http://www.w3.org/2000/svg';

        const wrapper = container.createDiv('storyteller-arc-wrapper');
        wrapper.createEl('h4', { text: 'Intensity Arc', cls: 'storyteller-arc-title' });

        const svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(H));
        svg.classList.add('storyteller-arc-svg');
        wrapper.appendChild(svg);

        // ── Defs: gradient ──
        const defs = document.createElementNS(svgNS, 'defs');
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.setAttribute('id', 'sts-arc-area-grad');
        grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
        const stop1 = document.createElementNS(svgNS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', 'var(--interactive-accent)');
        stop1.setAttribute('stop-opacity', '0.28');
        const stop2 = document.createElementNS(svgNS, 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', 'var(--interactive-accent)');
        stop2.setAttribute('stop-opacity', '0');
        grad.appendChild(stop1); grad.appendChild(stop2);
        defs.appendChild(grad);
        svg.appendChild(defs);

        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('transform', `translate(${PAD.left},${PAD.top})`);
        svg.appendChild(g);

        const zeroY = iH / 2;

        const makeLine = (x1: number, y1: number, x2: number, y2: number, stroke: string, dash?: string, opacity?: number) => {
            const l = document.createElementNS(svgNS, 'line');
            l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
            l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
            l.setAttribute('stroke', stroke);
            if (dash) l.setAttribute('stroke-dasharray', dash);
            if (opacity !== undefined) l.setAttribute('opacity', String(opacity));
            return l;
        };

        // ── Chapter bands (alternating background) ──
        chapters.forEach((ch, ci) => {
            const chScenes = sorted.filter(sc => sc.chapterId === ch.id || sc.chapterName === ch.name);
            if (chScenes.length === 0) return;
            const firstIdx = sorted.indexOf(chScenes[0]);
            const lastIdx = sorted.indexOf(chScenes[chScenes.length - 1]);
            const x1 = n <= 1 ? 0 : (firstIdx / (n - 1)) * iW;
            const rawX2 = n <= 1 ? iW : (lastIdx / (n - 1)) * iW + (n > 1 ? iW / (n - 1) : iW);
            const x2 = Math.min(rawX2, iW);
            if (ci % 2 === 1) {
                const band = document.createElementNS(svgNS, 'rect');
                band.setAttribute('x', x1.toFixed(1));
                band.setAttribute('y', '0');
                band.setAttribute('width', Math.max(0, x2 - x1).toFixed(1));
                band.setAttribute('height', String(iH));
                band.setAttribute('fill', 'rgba(255,255,255,0.035)');
                g.appendChild(band);
            }
        });

        // ── Grid lines ──
        g.appendChild(makeLine(0, zeroY, iW, zeroY, 'var(--background-modifier-border)', '4,3'));
        [-5, 5].forEach(val => {
            const y = iH / 2 - (val / 10) * (iH / 2);
            g.appendChild(makeLine(0, y, iW, y, 'var(--background-modifier-border)', '2,4', 0.5));
        });

        // ── Y-axis labels ──
        [10, 5, 0, -5, -10].forEach(val => {
            const y = iH / 2 - (val / 10) * (iH / 2);
            const t = document.createElementNS(svgNS, 'text');
            t.setAttribute('x', '-6'); t.setAttribute('y', String(y + 4));
            t.setAttribute('text-anchor', 'end');
            t.setAttribute('font-size', '9');
            t.setAttribute('fill', 'var(--text-muted)');
            t.textContent = String(val);
            g.appendChild(t);
        });

        const pts = sorted.map((sc, i) => {
            const x = n <= 1 ? iW / 2 : (i / (n - 1)) * iW;
            const iv = sc.intensity !== undefined && sc.intensity !== null ? Number(sc.intensity) : 0;
            const y = iH / 2 - (iv / 10) * (iH / 2);
            return { x, y, sc };
        });

        // ── Catmull-Rom bezier path ──
        const catmullRomPath = (points: { x: number; y: number }[]) => {
            if (points.length < 2) return '';
            const parts = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[Math.max(i - 1, 0)];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[Math.min(i + 2, points.length - 1)];
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                parts.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
            }
            return parts.join(' ');
        };

        if (pts.length > 1) {
            const curvePath = catmullRomPath(pts);
            const first = pts[0], last = pts[pts.length - 1];

            // Area fill (gradient)
            const areaPath = document.createElementNS(svgNS, 'path');
            areaPath.setAttribute('d', `${curvePath} L ${last.x.toFixed(1)} ${zeroY} L ${first.x.toFixed(1)} ${zeroY} Z`);
            areaPath.setAttribute('fill', 'url(#sts-arc-area-grad)');
            areaPath.setAttribute('stroke', 'none');
            g.appendChild(areaPath);

            // Line
            const linePath = document.createElementNS(svgNS, 'path');
            linePath.setAttribute('d', curvePath);
            linePath.setAttribute('fill', 'none');
            linePath.setAttribute('stroke', 'var(--interactive-accent)');
            linePath.setAttribute('stroke-width', '2.5');
            linePath.setAttribute('opacity', '0.75');
            g.appendChild(linePath);
        }

        // ── Chapter tick marks ──
        chapters.forEach(ch => {
            const chScenes = sorted.filter(sc => sc.chapterId === ch.id || sc.chapterName === ch.name);
            if (chScenes.length === 0) return;
            const firstIdx = sorted.indexOf(chScenes[0]);
            const x = n <= 1 ? iW / 2 : (firstIdx / (n - 1)) * iW;
            g.appendChild(makeLine(x, iH + 2, x, iH + 8, 'var(--text-muted)'));
            const lbl = document.createElementNS(svgNS, 'text');
            lbl.setAttribute('x', x.toFixed(1));
            lbl.setAttribute('y', String(iH + 20));
            lbl.setAttribute('text-anchor', 'middle');
            lbl.setAttribute('font-size', '9');
            lbl.setAttribute('fill', 'var(--text-muted)');
            lbl.textContent = `Ch.${ch.number ?? '?'}`;
            g.appendChild(lbl);
        });

        // ── Data points (on top, after area fill) ──
        pts.forEach(({ x, y, sc }) => {
            const color = sc.emotion ? (EMOTION_COLORS[sc.emotion] || '#90a4ae') : 'var(--text-muted)';
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', x.toFixed(1));
            circle.setAttribute('cy', y.toFixed(1));
            circle.setAttribute('r', '7');
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', 'var(--background-primary)');
            circle.setAttribute('stroke-width', '2');
            if (sc.emotion) {
                circle.setAttribute('filter', `drop-shadow(0 0 4px ${color})`);
            }
            circle.classList.add('storyteller-arc-dot');
            const tip = document.createElementNS(svgNS, 'title');
            tip.textContent = sc.name +
                (sc.intensity !== undefined ? ` · intensity ${sc.intensity}` : '') +
                (sc.emotion ? ` · ${sc.emotion}` : '');
            circle.appendChild(tip);
            g.appendChild(circle);
        });

        // ── Emotion stats row ──
        const emotionCounts: Record<string, number> = {};
        sorted.forEach(sc => { if (sc.emotion) emotionCounts[sc.emotion] = (emotionCounts[sc.emotion] || 0) + 1; });
        if (Object.keys(emotionCounts).length > 0) {
            const statsRow = wrapper.createDiv('storyteller-arc-stats');
            Object.entries(emotionCounts).sort(([, a], [, b]) => b - a).forEach(([emotion, count]) => {
                const color = EMOTION_COLORS[emotion] || '#90a4ae';
                const chip = statsRow.createSpan({ cls: 'storyteller-arc-stat-chip' });
                chip.style.background = color + '22';
                chip.style.color = color;
                const dot = chip.createSpan({ cls: 'storyteller-arc-stat-dot' });
                dot.style.background = color;
                chip.createSpan({ text: `${emotion} ×${count}` });
            });
        }

        // ── Legend ──
        const legend = wrapper.createDiv('storyteller-arc-legend');
        Object.entries(EMOTION_COLORS).forEach(([emotion, color]) => {
            const item = legend.createDiv('storyteller-arc-legend-item');
            const dot = item.createSpan({ cls: 'storyteller-arc-legend-dot' });
            dot.style.background = color;
            item.createSpan({ text: emotion, cls: 'storyteller-arc-legend-label' });
        });
    }

    // ── Heatmap ───────────────────────────────────────────────────────────────

    async renderHeatmap(container: HTMLElement) {
        const scenes = await this.plugin.listScenes();
        const chapters = (await this.plugin.listChapters()).sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
        const characters = await this.plugin.listCharacters();

        if (scenes.length === 0 || characters.length === 0) {
            container.createEl('p', { text: 'Need scenes with linked characters to generate heatmap.', cls: 'u-muted' });
            return;
        }

        const appearsInScenes = new Set<string>();
        scenes.forEach(sc => (sc.linkedCharacters || []).forEach((n: string) => appearsInScenes.add(n)));
        const activeChars = characters.map(c => c.name).filter(n => n && appearsInScenes.has(n)).slice(0, 20);

        if (activeChars.length === 0) {
            container.createEl('p', { text: 'No character links found in scenes yet.', cls: 'u-muted' });
            return;
        }

        const heat = new Map<string, Map<string, number>>();
        activeChars.forEach(n => heat.set(n, new Map()));
        scenes.forEach(sc => {
            const chKey = sc.chapterName || sc.chapterId || '(unassigned)';
            (sc.linkedCharacters || []).forEach((n: string) => {
                if (!heat.has(n)) return;
                const row = heat.get(n)!;
                row.set(chKey, (row.get(chKey) || 0) + 1);
            });
        });

        const colKeys = chapters.map(ch => ch.name);
        if (scenes.some(sc => !sc.chapterName && !sc.chapterId)) colKeys.push('(unassigned)');

        let maxCount = 1;
        heat.forEach(row => row.forEach(v => { if (v > maxCount) maxCount = v; }));

        const wrapper = container.createDiv('storyteller-heatmap-wrapper');
        wrapper.createEl('h4', { text: 'Character Presence', cls: 'storyteller-heatmap-title' });

        const scroll = wrapper.createDiv('storyteller-heatmap-scroll');
        const table = scroll.createEl('table', { cls: 'storyteller-heatmap-table' });

        const thead = table.createEl('thead');
        const hrow = thead.createEl('tr');
        hrow.createEl('th', { text: 'Character', cls: 'storyteller-heatmap-char-header' });
        colKeys.forEach((key, i) => {
            const ch = chapters[i];
            const th = hrow.createEl('th', { cls: 'storyteller-heatmap-chapter-header' });
            th.title = key;
            th.textContent = ch ? `Ch.${ch.number ?? i + 1}` : key;
        });

        const tbody = table.createEl('tbody');
        activeChars.forEach(charName => {
            const tr = tbody.createEl('tr');
            tr.createEl('td', { text: charName, cls: 'storyteller-heatmap-char-label' });
            colKeys.forEach(key => {
                const count = heat.get(charName)?.get(key) || 0;
                const td = tr.createEl('td', { cls: 'storyteller-heatmap-cell' });
                if (count > 0) {
                    const alpha = (0.18 + (count / maxCount) * 0.72).toFixed(2);
                    // Green heatmap cells
                    td.style.background = `rgba(74,222,128,${alpha})`;
                    td.style.color = Number(alpha) > 0.55 ? '#0a2a14' : 'rgba(255,255,255,0.9)';
                    td.title = `${charName} · ${key}: ${count} scene${count !== 1 ? 's' : ''}`;
                    td.textContent = String(count);
                }
            });
        });
    }

    // ── Plot Holes ────────────────────────────────────────────────────────────

    async renderPlotHoles(container: HTMLElement) {
        const scenes = await this.plugin.listScenes();
        const characters = await this.plugin.listCharacters();
        const charNames = new Set(characters.map(c => c.name).filter(Boolean));

        const issues: Array<{ severity: 'warning' | 'info'; title: string; detail: string }> = [];

        const unassigned = scenes.filter(sc => !sc.chapterId && !sc.chapterName);
        if (unassigned.length > 0) {
            issues.push({ severity: 'warning',
                title: `${unassigned.length} scene${unassigned.length !== 1 ? 's' : ''} not assigned to a chapter`,
                detail: unassigned.map(sc => sc.name).join(', ') });
        }

        const setupNoPayoff = scenes.filter(sc =>
            (sc.setupScenes || []).length > 0 && (sc.payoffScenes || []).length === 0);
        if (setupNoPayoff.length > 0) {
            issues.push({ severity: 'warning',
                title: `${setupNoPayoff.length} scene${setupNoPayoff.length !== 1 ? 's' : ''} foreshadow other scenes but have no recorded payoff`,
                detail: setupNoPayoff.map((sc: any) => sc.name).join(', ') });
        }

        const payoffNoSetup = scenes.filter(sc =>
            (sc.payoffScenes || []).length > 0 && (sc.setupScenes || []).length === 0);
        if (payoffNoSetup.length > 0) {
            issues.push({ severity: 'info',
                title: `${payoffNoSetup.length} scene${payoffNoSetup.length !== 1 ? 's' : ''} pay off other scenes without any foreshadowing`,
                detail: payoffNoSetup.map((sc: any) => sc.name).join(', ') });
        }

        const unknownRefs: string[] = [];
        scenes.forEach((sc: any) => {
            (sc.linkedCharacters || []).forEach((n: string) => {
                const entry = `"${n}" in "${sc.name}"`;
                if (!charNames.has(n) && !unknownRefs.includes(entry)) unknownRefs.push(entry);
            });
        });
        if (unknownRefs.length > 0) {
            issues.push({ severity: 'warning',
                title: `${unknownRefs.length} character reference${unknownRefs.length !== 1 ? 's' : ''} in scenes don't match any character file`,
                detail: unknownRefs.join('; ') });
        }

        const noLocation = scenes.filter((sc: any) => (sc.linkedLocations || []).length === 0);
        if (noLocation.length > 0) {
            issues.push({ severity: 'info',
                title: `${noLocation.length} scene${noLocation.length !== 1 ? 's' : ''} have no linked location`,
                detail: noLocation.map(sc => sc.name).join(', ') });
        }

        const emptyContent = scenes.filter(sc => !sc.content?.trim());
        if (emptyContent.length > 0) {
            issues.push({ severity: 'info',
                title: `${emptyContent.length} scene${emptyContent.length !== 1 ? 's' : ''} have no written content`,
                detail: emptyContent.map(sc => sc.name).join(', ') });
        }

        const hdr = container.createDiv('storyteller-holes-header');
        hdr.createEl('h4', { text: 'Plot Hole Detector', cls: 'storyteller-holes-title' });

        if (issues.length === 0) {
            hdr.remove();
            const clear = container.createDiv('storyteller-holes-clear');
            setIcon(clear.createSpan({ cls: 'storyteller-holes-clear-icon' }), 'check-circle');
            clear.createSpan({ text: 'No issues detected — your plot looks airtight!' });
            return;
        }

        hdr.createSpan({ text: `${issues.length} issue${issues.length !== 1 ? 's' : ''} detected`, cls: 'storyteller-holes-count' });

        const list = container.createDiv('storyteller-holes-list');
        issues.forEach(issue => {
            const card = list.createDiv(`storyteller-holes-card storyteller-holes-${issue.severity}`);
            const titleRow = card.createDiv('storyteller-holes-card-title');
            setIcon(titleRow.createSpan({ cls: 'storyteller-holes-icon' }), issue.severity === 'warning' ? 'alert-triangle' : 'info');
            titleRow.createSpan({ text: issue.title });
            card.createEl('p', { text: issue.detail, cls: 'storyteller-holes-detail' });
        });
    }
}
