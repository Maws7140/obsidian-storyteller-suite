import { describe, it, expect, vi } from 'vitest';
import StorytellerSuitePlugin from '../../src/main';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  class Notice { constructor(_message: string) {} }
  const overrides: Record<string, unknown> = { Notice };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * A chapter's bookId is the link the other side reads (the book modal offers
 * only unassigned chapters, and deleting a book unlinks by bookId). Saving a
 * book must persist that link on the chapters it adds or removes.
 */
function makePlugin(chapters: any[]) {
  const saved: any[] = [];
  const plugin: any = Object.create((StorytellerSuitePlugin as any).prototype);
  Object.assign(plugin, {
    settings: { customFieldsMode: 'flatten', sectionFieldsInFrontmatter: {}, sectionFieldsReleasedToBody: {}, groups: [] },
    ensureBookFolder: async () => {},
    getEntityFolder: () => 'Stories/S/Books',
    getCustomFieldDefinitions: () => [],
    invalidateFrontmatterReferenceIndexes: () => {},
    listChapters: async () => chapters,
    saveChapter: async (ch: any) => { saved.push({ id: ch.id, bookId: ch.bookId, bookName: ch.bookName, skip: ch._skipSync }); },
    app: {
      vault: {
        getAbstractFileByPath: () => null,
        create: async () => {},
        modify: async () => {},
      },
      metadataCache: { getFileCache: () => null, trigger: () => {} },
    },
  });
  return { plugin, saved };
}

const chapter = (id: string, name: string, bookId?: string) => ({
  id, name, bookId, bookName: bookId ? 'Book A' : undefined, filePath: `Stories/S/Books/Book A/${name}.md`,
});

describe('saving a book persists its chapter membership', () => {
  it('sets bookId on a chapter added to the book', async () => {
    const ch3 = chapter('c3', 'Ch 3');
    const { plugin, saved } = makePlugin([ch3]);
    const book: any = { id: 'b1', name: 'Book A', linkedChapters: ['Ch 3'] };
    await plugin.saveBook(book);
    expect(saved).toEqual([{ id: 'c3', bookId: 'b1', bookName: 'Book A', skip: true }]);
  });

  it('clears bookId on a chapter removed from the book', async () => {
    const ch3 = chapter('c3', 'Ch 3', 'b1');
    const { plugin, saved } = makePlugin([ch3]);
    const book: any = { id: 'b1', name: 'Book A', linkedChapters: [] };
    await plugin.saveBook(book);
    expect(saved).toEqual([{ id: 'c3', bookId: undefined, bookName: undefined, skip: true }]);
  });

  it('leaves a chapter that belongs to another book alone', async () => {
    const ch9 = chapter('c9', 'Ch 9', 'b2');
    const { plugin, saved } = makePlugin([ch9]);
    const book: any = { id: 'b1', name: 'Book A', linkedChapters: ['Ch 9'] };
    await plugin.saveBook(book);
    expect(saved).toEqual([]);
  });

  it('does not write chapters while a chapter-side sync is in progress', async () => {
    const ch3 = chapter('c3', 'Ch 3');
    const { plugin, saved } = makePlugin([ch3]);
    const book: any = { id: 'b1', name: 'Book A', linkedChapters: ['Ch 3'], _skipSync: true };
    await plugin.saveBook(book);
    expect(saved).toEqual([]);
  });
});
