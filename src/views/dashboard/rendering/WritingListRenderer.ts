import { App, ButtonComponent, TFile, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../../../main';

interface WritingListRendererContext {
    app: App;
    plugin: StorytellerSuitePlugin;
    currentFilter: string;
    chapterCollapseState: Map<string, boolean>;
    getImageSrc(imagePath: string): string;
    addEditButton(container: HTMLElement, onClick: () => void): void;
    addDeleteButton(container: HTMLElement, onClick: () => Promise<void>): void;
    addOpenFileButton(container: HTMLElement, filePath: string | undefined): ButtonComponent | null;
    persistChapter(chapter: any, successNotice: string, detail: string): Promise<void>;
    persistScene(scene: any, successNotice: string, detail: string): Promise<void>;
    removeChapter(filePath: string, detail: string): Promise<void>;
    removeScene(filePath: string, detail: string): Promise<void>;
    confirmDeleteChapter(filePath: string, chapterName: string, detail: string): Promise<void>;
    confirmDeleteScene(filePath: string, sceneName: string, detail: string): Promise<void>;
}

export async function renderWritingChapterSceneList(container: HTMLElement, context: WritingListRendererContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) {
        existingListContainer.remove();
    }

    const chapters = (await context.plugin.listChapters()).filter(ch =>
        ch.name.toLowerCase().includes(context.currentFilter) ||
        (`${ch.number ?? ''}`).toLowerCase().includes(context.currentFilter) ||
        (ch.summary || '').toLowerCase().includes(context.currentFilter) ||
        (ch.tags || []).join(' ').toLowerCase().includes(context.currentFilter)
    );

    const allScenes = await context.plugin.listScenes();

    const listContainer = container.createDiv('storyteller-list-container');
    if (chapters.length === 0) {
        listContainer.createEl('p', { text: `No chapters found.${context.currentFilter ? ' Matching current filter.' : ''}` });
        return;
    }

    chapters.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

    chapters.forEach(chapter => {
        const chapterGroup = listContainer.createDiv('storyteller-chapter-group');
        const chapterHeader = chapterGroup.createDiv('storyteller-chapter-header');

        const toggleButton = chapterHeader.createDiv('storyteller-chapter-toggle');
        setIcon(toggleButton, 'chevron-down');

        const pfpContainer = chapterHeader.createDiv('storyteller-list-item-pfp');
        if (chapter.profileImagePath) {
            const image = pfpContainer.createEl('img');
            try {
                image.src = context.getImageSrc(chapter.profileImagePath);
                image.alt = chapter.name;
            } catch {
                pfpContainer.createSpan({ text: '?' });
            }
        } else {
            const badge = pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: (chapter.number ?? '?').toString() });
            badge.title = 'Chapter number';
        }

        const infoEl = chapterHeader.createDiv('storyteller-list-item-info');
        const title = chapter.number != null ? `Chapter ${chapter.number}: ${chapter.name}` : chapter.name;
        const chapterScenes = allScenes.filter(scene => scene.chapterId === chapter.id || scene.chapterName === chapter.name);

        const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
        const chapterTitle = titleRow.createEl('strong', { text: title });
        if (chapter.filePath) {
            chapterTitle.addClass('storyteller-chapter-name-link');
            chapterTitle.title = 'Click to open note';
            chapterTitle.addEventListener('click', event => {
                event.stopPropagation();
                const file = context.app.vault.getAbstractFileByPath(chapter.filePath!);
                if (file instanceof TFile) {
                    void context.app.workspace.openLinkText(chapter.filePath!, '', false);
                }
            });
        }

        const inlineEditButton = titleRow.createEl('button', { cls: 'storyteller-chapter-inline-edit' });
        setIcon(inlineEditButton, 'pencil');
        inlineEditButton.title = 'Edit chapter';
        inlineEditButton.addEventListener('click', event => {
            event.stopPropagation();
            void import('../../../modals/ChapterModal').then(({ ChapterModal }) => {
                new ChapterModal(context.app, context.plugin, chapter, async (updated) => {
                    await context.persistChapter(updated, `Chapter "${updated.name}" updated.`, 'writing-inline-chapter-updated');
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.removeChapter(toDelete.filePath, 'writing-inline-chapter-deleted');
                    }
                }).open();
            });
        });

        titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${chapterScenes.length} scene${chapterScenes.length !== 1 ? 's' : ''}` });
        if (chapter.bookName) {
            titleRow.createSpan({ cls: 'storyteller-meta-badge storyteller-book-badge', text: chapter.bookName });
        }

        if (chapter.summary) {
            const preview = chapter.summary.length > 100 ? `${chapter.summary.substring(0, 100)}...` : chapter.summary;
            infoEl.createEl('p', { text: preview, cls: 'storyteller-chapter-summary' });
        }

        const actionsEl = chapterHeader.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            void import('../../../modals/ChapterModal').then(({ ChapterModal }) => {
                new ChapterModal(context.app, context.plugin, chapter, async (updated) => {
                    await context.persistChapter(updated, `Chapter "${updated.name}" updated.`, 'writing-chapter-updated');
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.removeChapter(toDelete.filePath, 'writing-chapter-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (chapter.filePath) {
                await context.confirmDeleteChapter(chapter.filePath, chapter.name, 'writing-chapter-deleted');
            }
        });
        context.addOpenFileButton(actionsEl, chapter.filePath);

        const scenesContainer = chapterGroup.createDiv('storyteller-chapter-scenes');
        if (chapterScenes.length === 0) {
            scenesContainer.createEl('p', { cls: 'storyteller-no-scenes', text: 'No scenes in this chapter' });
        } else {
            chapterScenes.forEach(scene => {
                renderWritingSceneItem(scenesContainer, scene, true, context);
            });
        }

        const addSceneButton = scenesContainer.createDiv('storyteller-add-scene-btn');
        setIcon(addSceneButton.createSpan(), 'plus');
        addSceneButton.createSpan({ text: ' Add scene to this chapter' });
        addSceneButton.onclick = () => {
            void import('../../../modals/SceneModal').then(({ SceneModal }) => {
                const newScene = { chapterId: chapter.id, chapterName: chapter.name } as any;
                new SceneModal(context.app, context.plugin, newScene, async (scene) => {
                    scene.chapterId = chapter.id;
                    scene.chapterName = chapter.name;
                    await context.persistScene(scene, `Scene "${scene.name}" created in chapter "${chapter.name}".`, 'writing-scene-created-in-chapter');
                }).open();
            });
        };

        const chapterKey = chapter.id || chapter.name;
        let isExpanded = context.chapterCollapseState.has(chapterKey) ? context.chapterCollapseState.get(chapterKey)! : true;
        if (!isExpanded) {
            scenesContainer.setCssStyles({ display: 'none' });
            toggleButton.classList.add('collapsed');
        }
        toggleButton.onclick = event => {
            event.stopPropagation();
            isExpanded = !isExpanded;
            context.chapterCollapseState.set(chapterKey, isExpanded);
            scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
            toggleButton.classList.toggle('collapsed', !isExpanded);
        };
    });

    const unassignedScenes = allScenes
        .filter(scene => !scene.chapterId && !scene.chapterName)
        .filter(scene =>
            scene.name.toLowerCase().includes(context.currentFilter) ||
            (scene.content || '').toLowerCase().includes(context.currentFilter)
        );

    if (unassignedScenes.length > 0) {
        const unassignedGroup = listContainer.createDiv('storyteller-chapter-group storyteller-unassigned-group');
        const unassignedHeader = unassignedGroup.createDiv('storyteller-chapter-header');

        const toggleButton = unassignedHeader.createDiv('storyteller-chapter-toggle');
        setIcon(toggleButton, 'chevron-down');

        const pfpContainer = unassignedHeader.createDiv('storyteller-list-item-pfp');
        pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder storyteller-unassigned-badge', text: '?' });

        const infoEl = unassignedHeader.createDiv('storyteller-list-item-info');
        const titleRow = infoEl.createDiv('storyteller-chapter-title-row');
        titleRow.createEl('strong', { text: 'Unassigned scenes' });
        titleRow.createSpan({ cls: 'storyteller-chapter-scene-count', text: `${unassignedScenes.length} scene${unassignedScenes.length !== 1 ? 's' : ''}` });

        const scenesContainer = unassignedGroup.createDiv('storyteller-chapter-scenes');
        unassignedScenes.forEach(scene => {
            renderWritingSceneItem(scenesContainer, scene, true, context, chapters);
        });

        const unassignedKey = '__unassigned__';
        let isExpanded = context.chapterCollapseState.has(unassignedKey) ? context.chapterCollapseState.get(unassignedKey)! : true;
        if (!isExpanded) {
            scenesContainer.setCssStyles({ display: 'none' });
            toggleButton.classList.add('collapsed');
        }
        toggleButton.onclick = event => {
            event.stopPropagation();
            isExpanded = !isExpanded;
            context.chapterCollapseState.set(unassignedKey, isExpanded);
            scenesContainer.setCssStyles({ display: isExpanded ? 'block' : 'none' });
            toggleButton.classList.toggle('collapsed', !isExpanded);
        };
    }
}

function renderWritingSceneItem(
    container: HTMLElement,
    scene: any,
    showChapterAssign: boolean,
    context: WritingListRendererContext,
    chapters?: any[],
): void {
    const itemEl = container.createDiv('storyteller-list-item storyteller-scene-item');

    const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
    if (scene.profileImagePath) {
        const image = pfpContainer.createEl('img');
        try {
            image.src = context.getImageSrc(scene.profileImagePath);
            image.alt = scene.name;
        } catch {
            pfpContainer.createSpan({ text: '?' });
        }
    } else {
        pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: scene.name.substring(0, 1) });
    }

    const infoEl = itemEl.createDiv('storyteller-list-item-info');
    const nameEl = infoEl.createEl('strong', { text: scene.name });
    if (scene.filePath) {
        nameEl.addClass('storyteller-scene-name-link');
        nameEl.title = 'Click to open note';
        nameEl.addEventListener('click', () => {
            const file = context.app.vault.getAbstractFileByPath(scene.filePath);
            if (file instanceof TFile) {
                void context.app.workspace.openLinkText(scene.filePath, '', false);
            }
        });
    }

    const meta = infoEl.createDiv('storyteller-list-item-extra');
    if (scene.status) {
        meta.createSpan({ cls: `storyteller-status-badge storyteller-status-${(scene.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`, text: scene.status });
    }
    if (scene.povCharacter) {
        const pov = meta.createSpan({ cls: 'storyteller-scene-pov-badge' });
        setIcon(pov.createSpan(''), 'eye');
        pov.createSpan({ text: ` ${scene.povCharacter}` });
    }
    if (scene.emotion) {
        meta.createSpan({ text: scene.emotion, cls: `storyteller-scene-emotion-chip storyteller-emotion-${scene.emotion}` });
    }
    if (scene.tags && scene.tags.length > 0) {
        meta.createSpan({ text: scene.tags.map((tag: string) => `#${tag}`).join(' ') });
    }

    if (scene.intensity !== undefined && scene.intensity !== null) {
        const barWrap = infoEl.createDiv('storyteller-intensity-bar');
        const pct = Math.round(((Number(scene.intensity) + 10) / 20) * 100);
        const fill = barWrap.createDiv('storyteller-intensity-fill');
        fill.setCssStyles({ width: `${pct}%` });
        fill.title = `Intensity: ${scene.intensity}`;
    }

    if (scene.content) {
        const preview = scene.content.length > 80 ? `${scene.content.substring(0, 80)}...` : scene.content;
        infoEl.createEl('p', { cls: 'storyteller-scene-preview', text: preview });
    }

    const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
    if (showChapterAssign && chapters && !scene.chapterId && !scene.chapterName) {
        const assignButton = actionsEl.createEl('button', { cls: 'storyteller-assign-chapter-btn', text: 'Assign' });
        assignButton.onclick = async () => {
            const select = container.createEl('select', { cls: 'storyteller-chapter-assign-select' });
            select.createEl('option', { value: '', text: 'Select chapter...' });
            chapters.forEach(chapter => {
                select.createEl('option', { value: chapter.id || chapter.name, text: `${chapter.number ?? '?'}. ${chapter.name}` });
            });
            select.onchange = async () => {
                const selectedChapter = chapters.find(chapter => (chapter.id || chapter.name) === select.value);
                if (selectedChapter) {
                    scene.chapterId = selectedChapter.id;
                    scene.chapterName = selectedChapter.name;
                    await context.persistScene(scene, `Scene assigned to chapter "${selectedChapter.name}"`, 'scene-assigned-to-chapter');
                }
            };
            assignButton.replaceWith(select);
            select.focus();
        };
    }

    context.addEditButton(actionsEl, () => {
        void import('../../../modals/SceneModal').then(({ SceneModal }) => {
            new SceneModal(context.app, context.plugin, scene, async (updated) => {
                await context.persistScene(updated, `Scene "${updated.name}" updated.`, 'scene-item-updated');
            }, async (toDelete) => {
                if (toDelete.filePath) {
                    await context.removeScene(toDelete.filePath, 'scene-item-deleted-from-modal');
                }
            }).open();
        });
    });
    context.addDeleteButton(actionsEl, async () => {
        if (scene.filePath) {
            await context.confirmDeleteScene(scene.filePath, scene.name, 'scene-item-deleted');
        }
    });
    context.addOpenFileButton(actionsEl, scene.filePath);
}
