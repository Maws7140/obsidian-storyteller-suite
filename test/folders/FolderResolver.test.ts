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

  // World-building entity folder tests
  describe('world-building entity folders', () => {
    it('default multi-story paths for world-building entities', () => {
      const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: false }, () => story);
      expect(r.getEntityFolder('culture')).toBe('StorytellerSuite/Stories/My Story/Cultures');
      expect(r.getEntityFolder('economy')).toBe('StorytellerSuite/Stories/My Story/Economies');
      expect(r.getEntityFolder('faction')).toBe('StorytellerSuite/Stories/My Story/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('StorytellerSuite/Stories/My Story/MagicSystems');
    });

    it('one-story mode for world-building entities', () => {
      const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: true, oneStoryBaseFolder: 'Base' }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Base/Cultures');
      expect(r.getEntityFolder('economy')).toBe('Base/Economies');
      expect(r.getEntityFolder('faction')).toBe('Base/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('Base/MagicSystems');
    });

    it('custom folders with placeholders for world-building entities', () => {
      const r = new FolderResolver({
        enableCustomEntityFolders: true,
        storyRootFolderTemplate: 'Root/{storySlug}',
        cultureFolderPath: 'Root/{storySlug}/MyCultures',
        economyFolderPath: 'Root/{storySlug}/MyEconomies',
        factionFolderPath: 'Root/{storySlug}/MyFactions',
        magicSystemFolderPath: 'Root/{storySlug}/MyMagic',
      }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Root/My_Story/MyCultures');
      expect(r.getEntityFolder('economy')).toBe('Root/My_Story/MyEconomies');
      expect(r.getEntityFolder('faction')).toBe('Root/My_Story/MyFactions');
      expect(r.getEntityFolder('magicSystem')).toBe('Root/My_Story/MyMagic');
    });

    it('world-building entities fallback to root + default leaf when custom path not set', () => {
      const r = new FolderResolver({
        enableCustomEntityFolders: true,
        storyRootFolderTemplate: 'Root/{storySlug}',
        // no specific paths set for world-building entities
      }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Root/My_Story/Cultures');
      expect(r.getEntityFolder('economy')).toBe('Root/My_Story/Economies');
      expect(r.getEntityFolder('faction')).toBe('Root/My_Story/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('Root/My_Story/MagicSystems');
    });
  });
});
