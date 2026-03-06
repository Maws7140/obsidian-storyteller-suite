import { normalizePath, TFolder } from 'obsidian';
import StorytellerSuitePlugin from '../main';

export type EntityFolderType = 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'map' | 'culture' | 'faction' | 'economy' | 'magicSystem' | 'group' | 'compendiumEntry' | 'book' | 'campaignSession';

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
  groupFolderPath?: string | undefined;
  compendiumFolderPath?: string | undefined;
  bookFolderPath?: string | undefined;
  sessionsFolderPath?: string | undefined;
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

  private getConfiguredEntityPaths(): Array<string | undefined> {
    const o = this.opts;
    return [
      o.characterFolderPath,
      o.locationFolderPath,
      o.eventFolderPath,
      o.itemFolderPath,
      o.referenceFolderPath,
      o.chapterFolderPath,
      o.sceneFolderPath,
      o.mapFolderPath,
      o.cultureFolderPath,
      o.factionFolderPath,
      o.economyFolderPath,
      o.magicSystemFolderPath,
      o.groupFolderPath,
      o.compendiumFolderPath,
      o.bookFolderPath,
      o.sessionsFolderPath,
    ];
  }

  /** Replace placeholders in templates using the current active story and optional entity context. */
  private resolveTemplatePath(template: string, context?: { bookName?: string }): string {
    const story = this.getActiveStory();
    const requiresStory = template.includes('{storyName}') || template.includes('{storySlug}') || template.includes('{storyId}');
    if (requiresStory && !story) throw new Error('No active story selected for template resolution.');
    const storyName = story?.name ?? '';
    const storyId = story?.id ?? '';
    const storySlug = this.slugifyFolderName(storyName);
    const bookName = context?.bookName ?? '';
    let resolved = template.split('{storyName}').join(storyName);
    resolved = resolved.split('{storyId}').join(storyId);
    resolved = resolved.split('{storySlug}').join(storySlug);
    resolved = resolved.split('{bookName}').join(bookName);
    return normalizePath(resolved);
  }

  /**
   * Returns true if the configured folder path for the given type contains a {bookName} placeholder.
   * When true, listChapters / listScenes must scan one folder per book + one unassigned folder.
   */
  usesBookName(type: EntityFolderType): boolean {
    const o = this.opts;
    if (!o.enableCustomEntityFolders) return false;
    const pathMap: Partial<Record<EntityFolderType, string | undefined>> = {
      character:      o.characterFolderPath,
      location:       o.locationFolderPath,
      event:          o.eventFolderPath,
      item:           o.itemFolderPath,
      reference:      o.referenceFolderPath,
      chapter:        o.chapterFolderPath,
      scene:          o.sceneFolderPath,
      map:            o.mapFolderPath,
      culture:        o.cultureFolderPath,
      faction:        o.factionFolderPath,
      economy:        o.economyFolderPath,
      magicSystem:    o.magicSystemFolderPath,
      group:          o.groupFolderPath,
      compendiumEntry: o.compendiumFolderPath,
      book:           o.bookFolderPath,
      campaignSession: o.sessionsFolderPath,
    };
    const specificPath = pathMap[type];
    if (specificPath && specificPath.includes('{bookName}')) return true;
    // If no specific path is set, the root template fallback is used — check that too
    if (!specificPath && o.storyRootFolderTemplate && o.storyRootFolderTemplate.includes('{bookName}')) return true;
    return false;
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

  private getCommonParentPath(paths: string[]): string {
    const normalized = paths
      .map(path => normalizePath(path).replace(/\/+$/, ''))
      .filter(path => path.length > 0);

    if (normalized.length === 0) return '';
    if (normalized.length === 1) {
      const first = normalized[0];
      const idx = first.lastIndexOf('/');
      return idx === -1 ? first : first.slice(0, idx);
    }

    const segments = normalized.map(path => path.split('/').filter(Boolean));
    const common: string[] = [];
    const shortestLength = Math.min(...segments.map(parts => parts.length));

    for (let index = 0; index < shortestLength; index++) {
      const part = segments[0][index];
      if (segments.every(parts => parts[index] === part)) {
        common.push(part);
      } else {
        break;
      }
    }

    return common.join('/');
  }

  getStoryRootFolder(): string {
    const o = this.opts;

    if (o.enableCustomEntityFolders) {
      if (o.storyRootFolderTemplate && o.storyRootFolderTemplate.trim()) {
        return this.resolveTemplatePath(o.storyRootFolderTemplate);
      }

      const configuredPaths = this.getConfiguredEntityPaths()
        .filter((path): path is string => Boolean(path && path.trim()))
        .map(path => this.resolveTemplatePath(path, { bookName: '' }));

      const commonRoot = this.getCommonParentPath(configuredPaths);
      if (commonRoot) return commonRoot;
    }

    if (o.enableOneStoryMode) {
      return this.sanitizeBaseFolderPath(o.oneStoryBaseFolder || 'StorytellerSuite');
    }

    const story = this.getActiveStory();
    if (!story) throw new Error('No active story selected.');
    return `StorytellerSuite/Stories/${story.name}`;
  }

  getEntityFolder(type: EntityFolderType, context?: { bookName?: string }): string {
    const o = this.opts;

    if (o.enableCustomEntityFolders) {
      const root = o.storyRootFolderTemplate ? this.resolveTemplatePath(o.storyRootFolderTemplate, context) : '';
      const prefer = (path?: string, fallbackLeaf?: string): string | undefined => {
        if (path && path.trim()) return this.resolveTemplatePath(path, context);
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
      else if (type === 'group')       result = prefer(o.groupFolderPath,       'Groups');
      else if (type === 'compendiumEntry') result = prefer(o.compendiumFolderPath, 'Compendium');
      else if (type === 'book')        result = prefer(o.bookFolderPath,        'Books');
      else if (type === 'campaignSession') result = prefer(o.sessionsFolderPath, 'Sessions');

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
      if (type === 'group')       return `${prefix}Groups`;
      if (type === 'compendiumEntry') return `${prefix}Compendium`;
      if (type === 'book')       return `${prefix}Books`;
      if (type === 'campaignSession') return `${prefix}Sessions`;
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
    if (type === 'group')       return `${base}/Groups`;
    if (type === 'compendiumEntry') return `${base}/Compendium`;
    if (type === 'book')       return `${base}/Books`;
    if (type === 'campaignSession') return `${base}/Sessions`;
    throw new Error('Unknown entity type');
  }

  /** Non-throwing resolution: returns either a path or an error string. */
  tryGetEntityFolder(type: EntityFolderType, context?: { bookName?: string }): { path?: string; error?: string } {
    try {
      const path = this.getEntityFolder(type, context);
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
      'culture', 'faction', 'economy', 'magicSystem', 'group', 'compendiumEntry', 'book', 'campaignSession'
    ];
    const out = {} as Record<EntityFolderType, { path?: string; error?: string }>;
    for (const t of types) out[t] = this.tryGetEntityFolder(t);
    return out;
  }
}
