import { describe, it, expect } from 'vitest';
import { FolderResolver } from '../../src/folders/FolderResolver';

describe('FolderResolver', () => {
  const story = { id: 's1', name: 'My Story' };

  it('default multi-story paths', () => {
    const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: false }, () => story);
    expect(r.getEntityFolder('character')).toBe('StorytellerSuite/Stories/My Story/Characters');
    expect(r.getEntityFolder('event')).toBe('StorytellerSuite/Stories/My Story/Events');
  });

  it('one-story mode', () => {
    const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: true, oneStoryBaseFolder: 'Base' }, () => story);
    expect(r.getEntityFolder('character')).toBe('Base/Characters');
    expect(r.getEntityFolder('reference')).toBe('Base/References');
  });

  it('custom folders with placeholders', () => {
    const r = new FolderResolver({
      enableCustomEntityFolders: true,
      storyRootFolderTemplate: 'Root/{storySlug}',
      characterFolderPath: 'Root/{storySlug}/Chars',
    }, () => story);
    expect(r.getEntityFolder('character')).toBe('Root/My_Story/Chars');
    // falls back to root + default leaf
    expect(r.getEntityFolder('location')).toBe('Root/My_Story/Locations');
  });
});
