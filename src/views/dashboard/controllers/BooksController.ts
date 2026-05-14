import { Notice, setIcon } from 'obsidian';
import type { IndentedSceneRef, StoryDraft } from '../../../types';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const booksController: DashboardTabController = {
    id: 'books',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, 'Books', async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderBooksList(container, context);
        }, () => {
            void import('../../../modals/BookModal').then(({ BookModal }) => {
                new BookModal(context.app, context.plugin, null, async (book) => {
                    await context.mutationRunner.runCreate({
                        action: async () => {
                            await context.plugin.saveBook(book);
                        },
                        successNotice: `Book "${book.name}" created.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'book-created',
                    });
                }).open();
            });
        }, 'New Book');

        await renderBooksList(container, context);
    },
};

async function renderBooksList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter().toLowerCase();
    const allBooks = await context.plugin.listBooks();
    const allChapters = await context.plugin.listChapters();
    const allScenes = await context.plugin.listScenes();

    const books = allBooks.filter(book =>
        book.name.toLowerCase().includes(filter) ||
        (book.series || '').toLowerCase().includes(filter) ||
        (book.genre || '').toLowerCase().includes(filter) ||
        (book.description || '').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (books.length === 0) {
        listContainer.createEl('p', { text: 'No books found.' + (filter ? ' (filter active)' : '') });
        return;
    }

    for (const book of books) {
        const bookChapters = allChapters
            .filter(chapter => chapter.bookId === book.id)
            .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
        const bookSceneCount = allScenes.filter(scene =>
            bookChapters.some(chapter => chapter.id === scene.chapterId)
        ).length;

        const itemEl = listContainer.createDiv('storyteller-list-item storyteller-book-card');

        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (book.coverImagePath) {
            const imgEl = pfpContainer.createEl('img');
            try {
                imgEl.src = context.getImageSrc(book.coverImagePath);
                imgEl.alt = book.name;
            } catch {
                pfpContainer.createSpan({ text: '📖' });
            }
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: (book.bookNumber ?? '?').toString() });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const titleRow = infoEl.createDiv('storyteller-list-item-title');
        titleRow.createEl('strong', { text: book.name, cls: 'storyteller-list-item-name' });
        if (book.series) titleRow.createSpan({ cls: 'storyteller-meta-badge storyteller-book-badge', text: book.series });
        if (book.bookNumber != null) titleRow.createSpan({ cls: 'storyteller-meta-badge', text: `Book ${book.bookNumber}` });
        if (book.status) {
            const statusSlug = book.status.toLowerCase().replace(/\s+/g, '-');
            titleRow.createSpan({ cls: `storyteller-meta-badge storyteller-book-status-${statusSlug}`, text: book.status });
        }

        const statsRow = infoEl.createDiv('storyteller-list-item-extra');
        statsRow.createSpan({ cls: 'storyteller-meta-badge', text: `${bookChapters.length} chapter${bookChapters.length !== 1 ? 's' : ''}` });
        statsRow.createSpan({ cls: 'storyteller-meta-badge', text: `${bookSceneCount} scene${bookSceneCount !== 1 ? 's' : ''}` });
        if (book.genre) statsRow.createSpan({ cls: 'storyteller-meta-badge', text: book.genre });

        if (book.description) {
            const preview = book.description.length > 100 ? book.description.substring(0, 100) + '...' : book.description;
            infoEl.createEl('p', { text: preview, cls: 'storyteller-list-item-preview' });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

        const compileBtn = actionsEl.createEl('button', { cls: 'storyteller-action-btn' });
        setIcon(compileBtn, 'book-open');
        compileBtn.title = 'Compile this book into a draft';
        compileBtn.addEventListener('click', () => { void (async () => {
            const sceneRefs: IndentedSceneRef[] = [];
            for (const chapter of bookChapters) {
                const chapterScenes = allScenes
                    .filter(scene => scene.chapterId === chapter.id)
                    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
                for (const scene of chapterScenes) {
                    sceneRefs.push({ sceneId: scene.id ?? scene.name, indent: 0, includeInCompile: scene.includeInCompile ?? true });
                }
            }
            if (sceneRefs.length === 0) {
                new Notice(`No scenes found for "${book.name}". Add chapters and scenes first.`);
                return;
            }
            const now = new Date().toISOString();
            const draft: StoryDraft = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                storyId: context.plugin.settings.activeStoryId ?? 'default',
                name: `${book.name} — Draft`,
                draftNumber: Date.now(),
                sceneOrder: sceneRefs,
                created: now,
                modified: now,
            };
            if (!context.plugin.settings.storyDrafts) context.plugin.settings.storyDrafts = [];
            context.plugin.settings.storyDrafts.push(draft);
            await context.plugin.saveSettings();
            new Notice(`Draft created for "${book.name}" with ${sceneRefs.length} scenes. Switch to the Compile tab.`);
        })(); });

        context.addEditButton(actionsEl, () => {
            void import('../../../modals/BookModal').then(({ BookModal }) => {
                new BookModal(context.app, context.plugin, book, async (updated) => {
                    await context.mutationRunner.runUpdate({
                        action: async () => {
                            await context.plugin.saveBook(updated);
                        },
                        successNotice: `Book "${updated.name}" saved.`,
                        refreshMode: 'immediate',
                        refreshDetail: 'book-updated',
                    });
                }, async (toDelete) => {
                    if (toDelete.filePath) {
                        await context.plugin.deleteBook(toDelete.filePath);
                        context.queueDashboardRefresh('book-deleted-from-modal');
                    }
                }).open();
            });
        });
        context.addDeleteButton(actionsEl, async () => {
            if (book.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Delete book "${book.name}"? Chapters will be unlinked.`,
                    action: async () => {
                        await context.plugin.deleteBook(book.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'book-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, book.filePath);

        if (bookChapters.length > 0) {
            const chaptersContainer = itemEl.createDiv('storyteller-book-chapters-list');
            for (const chapter of bookChapters) {
                const chapterSceneCount = allScenes.filter(scene => scene.chapterId === chapter.id).length;
                const chRow = chaptersContainer.createDiv('storyteller-book-chapter-row');
                chRow.createSpan({ cls: 'storyteller-book-chapter-num', text: chapter.number != null ? `Ch.${chapter.number}` : '—' });
                chRow.createSpan({ cls: 'storyteller-book-chapter-name', text: chapter.name });
                chRow.createSpan({ cls: 'storyteller-meta-badge', text: `${chapterSceneCount}sc` });
            }
        }
    }
}
