import { normalizePath, TFolder } from 'obsidian';
import StorytellerSuitePlugin from '../main';

export type EntityFolderType = 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'map' | 'culture' | 'faction' | 'economy' | 'magicSystem';

export interface FolderResolverOptions {
  enableCustomEntityFolders: boolean | undefined;
  storyRootFolderTemplate?: string | undefined;
  characterFolderPath?: string | undefined;
  locationFolderPath?: string | undefined;
  eventFolderPath?: string | undefined;
  itemFolderPath?: string | undefined;
  referenceFolderPath?: string | undefined;
  chapterFolderPath?: string | undefined;
  sceneFolderPath?: string | undefined;
  mapFolderPath?: string | undefined;
  cultureFolderPath?: string | undefined;
  factionFolderPath?: string | undefined;
  economyFolderPath?: string | undefined;
  magicSystemFolderPath?: string | undefined;
  enableOneStoryMode?: boolean | undefined;
  oneStoryBaseFolder?: string | undefined;
}

export interface StoryMinimal { id: string; name: string; }

/**
 * FolderResolver centralizes entity folder path rules for:
 * - custom per-entity folders with {storyName|storySlug|storyId}
 * - one-story flattened mode
 * - default multi-story structure under StorytellerSuite/Stories/{storyName}
 */
export class FolderResolver {
  constructor(private opts: FolderResolverOptions, private getActiveStory: () => StoryMinimal | undefined) {}

  /** Replace placeholders in templates using the current active story. */
  private resolveTemplatePath(template: string): string {
    const story = this.getActiveStory();
    const requiresStory = template.includes('{storyName}') || template.includes('{storySlug}') || template.includes('{storyId}');
    if (requiresStory && !story) throw new Error('No active story selected for template resolution.');
    const storyName = story?.name ?? '';
    const storyId = story?.id ?? '';
    const storySlug = this.slugifyFolderName(storyName);
    let resolved = template.split('{storyName}').join(storyName);
    resolved = resolved.split('{storyId}').join(storyId);
    resolved = resolved.split('{storySlug}').join(storySlug);
    return normalizePath(resolved);
  }

  /** Sanitize the one-story base folder so it is vault-relative and never a leading slash. */
  private sanitizeBaseFolderPath(input?: string): string {
    if (!input) return '';
    const raw = input.trim();
    if (raw === '/' || raw === '\\') return '';
    // Strip leading/trailing slashes and backslashes, then normalize
    const stripped = raw.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '');
    if (!stripped) return '';
    return normalizePath(stripped);
  }

  private slugifyFolderName(name: string): string {
    if (!name) return '';
    return name
      .replace(/[\\/:"*?<>|#^\[\]{}]+/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s/g, '_');
  }

  getEntityFolder(type: EntityFolderType): string {
    const o = this.opts;

    if (o.enableCustomEntityFolders) {
      const root = o.storyRootFolderTemplate ? this.resolveTemplatePath(o.storyRootFolderTemplate) : '';
      const prefer = (path?: string, fallbackLeaf?: string): string | undefined => {
        if (path && path.trim()) return this.resolveTemplatePath(path);
        if (root && fallbackLeaf) return normalizePath(`${root}/${fallbackLeaf}`);
        return undefined;
      };

      let result: string | undefined;
      if (type === 'character')   result = prefer(o.characterFolderPath,   'Characters');
      else if (type === 'location')    result = prefer(o.locationFolderPath,    'Locations');
      else if (type === 'event')       result = prefer(o.eventFolderPath,       'Events');
      else if (type === 'item')        result = prefer(o.itemFolderPath,        'Items');
      else if (type === 'reference')   result = prefer(o.referenceFolderPath,   'References');
      else if (type === 'chapter')     result = prefer(o.chapterFolderPath,     'Chapters');
      else if (type === 'scene')       result = prefer(o.sceneFolderPath,       'Scenes');
      else if (type === 'map')         result = prefer(o.mapFolderPath,         'Maps');
      else if (type === 'culture')     result = prefer(o.cultureFolderPath,     'Cultures');
      else if (type === 'faction')     result = prefer(o.factionFolderPath,     'Factions');
      else if (type === 'economy')     result = prefer(o.economyFolderPath,     'Economies');
      else if (type === 'magicSystem') result = prefer(o.magicSystemFolderPath, 'MagicSystems');

      // If custom folders are enabled but no path is configured, fall through to default behavior
      if (result) return result;
      // Otherwise continue to One Story Mode or Default Mode below
    }

    if (o.enableOneStoryMode) {
      const baseSanitized = this.sanitizeBaseFolderPath(o.oneStoryBaseFolder || 'StorytellerSuite');
      const prefix = baseSanitized ? `${baseSanitized}/` : '';
      if (type === 'character')   return `${prefix}Characters`;
      if (type === 'location')    return `${prefix}Locations`;
      if (type === 'event')       return `${prefix}Events`;
      if (type === 'item')        return `${prefix}Items`;
      if (type === 'reference')   return `${prefix}References`;
      if (type === 'chapter')     return `${prefix}Chapters`;
      if (type === 'scene')       return `${prefix}Scenes`;
      if (type === 'map')         return `${prefix}Maps`;
      if (type === 'culture')     return `${prefix}Cultures`;
      if (type === 'faction')     return `${prefix}Factions`;
      if (type === 'economy')     return `${prefix}Economies`;
      if (type === 'magicSystem') return `${prefix}MagicSystems`;
    }

    const story = this.getActiveStory();
    if (!story) throw new Error('No active story selected.');
    const base = `StorytellerSuite/Stories/${story.name}`;
    if (type === 'character')   return `${base}/Characters`;
    if (type === 'location')    return `${base}/Locations`;
    if (type === 'event')       return `${base}/Events`;
    if (type === 'item')        return `${base}/Items`;
    if (type === 'reference')   return `${base}/References`;
    if (type === 'chapter')     return `${base}/Chapters`;
    if (type === 'scene')       return `${base}/Scenes`;
    if (type === 'map')         return `${base}/Maps`;
    if (type === 'culture')     return `${base}/Cultures`;
    if (type === 'faction')     return `${base}/Factions`;
    if (type === 'economy')     return `${base}/Economies`;
    if (type === 'magicSystem') return `${base}/MagicSystems`;
    throw new Error('Unknown entity type');
  }

  /** Non-throwing resolution: returns either a path or an error string. */
  tryGetEntityFolder(type: EntityFolderType): { path?: string; error?: string } {
    try {
      const path = this.getEntityFolder(type);
      return { path };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error resolving folder';
      return { error: msg };
    }
  }

  /** Resolve all entity folders at once. */
  resolveAll(): Record<EntityFolderType, { path?: string; error?: string }> {
    const types: EntityFolderType[] = [
      'character', 'location', 'event', 'item', 'reference', 'chapter', 'scene', 'map',
      'culture', 'faction', 'economy', 'magicSystem'
    ];
    const out = {} as Record<EntityFolderType, { path?: string; error?: string }>;
    for (const t of types) out[t] = this.tryGetEntityFolder(t);
    return out;
  }
}
