import { normalizePath } from 'obsidian';

export type EntityFolderType = 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'map' | 'culture' | 'faction' | 'economy' | 'magicSystem' | 'group' | 'compendiumEntry' | 'book' | 'campaignSession' | 'timelineEra' | 'timelineTrack' | 'timelineBranch';

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
  eraFolderPath?: string | undefined;
  trackFolderPath?: string | undefined;
  branchFolderPath?: string | undefined;
  enableOneStoryMode?: boolean | undefined;
  oneStoryBaseFolder?: string | undefined;
}

/**
 * Folder settings a single story can override. Every key is optional and a
 * blank value means "inherit", never "use the built-in default" — an override
 * that read back as empty would silently relocate a story's entities.
 */
export type StoryFolderOverrides = Pick<
  FolderResolverOptions,
  | 'storyRootFolderTemplate'
  | 'characterFolderPath'
  | 'locationFolderPath'
  | 'eventFolderPath'
  | 'itemFolderPath'
  | 'referenceFolderPath'
  | 'chapterFolderPath'
  | 'sceneFolderPath'
  | 'mapFolderPath'
  | 'cultureFolderPath'
  | 'factionFolderPath'
  | 'economyFolderPath'
  | 'magicSystemFolderPath'
  | 'groupFolderPath'
  | 'compendiumFolderPath'
  | 'bookFolderPath'
  | 'sessionsFolderPath'
  | 'eraFolderPath'
  | 'trackFolderPath'
  | 'branchFolderPath'
>;

export interface StoryMinimal { id: string; name: string; folderOverrides?: StoryFolderOverrides; }

/**
 * FolderResolver centralizes entity folder path rules for:
 * - custom per-entity folders with {storyName|storySlug|storyId}
 * - one-story flattened mode
 * - default multi-story structure under StorytellerSuite/Stories/{storyName}
 */
export class FolderResolver {
  constructor(private opts: FolderResolverOptions, private getActiveStory: () => StoryMinimal | undefined) {}

  /**
   * Read a folder path, preferring the active story's override.
   *
   * A blank or missing override inherits the plugin-wide value. That direction
   * matters: treating an empty override as "no path configured" would send the
   * resolver to the built-in default leaf and every existing entity of that
   * story would appear to vanish from its real folder.
   */
  private path(key: keyof StoryFolderOverrides): string | undefined {
    const override = this.getActiveStory()?.folderOverrides?.[key];
    if (override && override.trim()) return override;
    return this.opts[key];
  }

  private getConfiguredEntityPaths(): Array<string | undefined> {
    return [
      this.path('characterFolderPath'),
      this.path('locationFolderPath'),
      this.path('eventFolderPath'),
      this.path('itemFolderPath'),
      this.path('referenceFolderPath'),
      this.path('chapterFolderPath'),
      this.path('sceneFolderPath'),
      this.path('mapFolderPath'),
      this.path('cultureFolderPath'),
      this.path('factionFolderPath'),
      this.path('economyFolderPath'),
      this.path('magicSystemFolderPath'),
      this.path('groupFolderPath'),
      this.path('compendiumFolderPath'),
      this.path('bookFolderPath'),
      this.path('sessionsFolderPath'),
      this.path('eraFolderPath'),
      this.path('trackFolderPath'),
      this.path('branchFolderPath'),
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
    if (!this.opts.enableCustomEntityFolders) return false;
    const specificPath = this.path(this.overrideKeyFor(type));
    if (specificPath && specificPath.includes('{bookName}')) return true;
    // If no specific path is set, the root template fallback is used — check that too
    const rootTemplate = this.path('storyRootFolderTemplate');
    if (!specificPath && rootTemplate && rootTemplate.includes('{bookName}')) return true;
    return false;
  }

  /** The folder-path setting that governs a given entity type. */
  private overrideKeyFor(type: EntityFolderType): keyof StoryFolderOverrides {
    const keys: Record<EntityFolderType, keyof StoryFolderOverrides> = {
      character:       'characterFolderPath',
      location:        'locationFolderPath',
      event:           'eventFolderPath',
      item:            'itemFolderPath',
      reference:       'referenceFolderPath',
      chapter:         'chapterFolderPath',
      scene:           'sceneFolderPath',
      map:             'mapFolderPath',
      culture:         'cultureFolderPath',
      faction:         'factionFolderPath',
      economy:         'economyFolderPath',
      magicSystem:     'magicSystemFolderPath',
      group:           'groupFolderPath',
      compendiumEntry: 'compendiumFolderPath',
      book:            'bookFolderPath',
      campaignSession: 'sessionsFolderPath',
      timelineEra:     'eraFolderPath',
      timelineTrack:   'trackFolderPath',
      timelineBranch:  'branchFolderPath',
    };
    return keys[type];
  }

  /** Default subfolder name used under the story root when no path is configured. */
  private defaultLeafFor(type: EntityFolderType): string {
    const leaves: Record<EntityFolderType, string> = {
      character:       'Characters',
      location:        'Locations',
      event:           'Events',
      item:            'Items',
      reference:       'References',
      chapter:         'Chapters',
      scene:           'Scenes',
      map:             'Maps',
      culture:         'Cultures',
      faction:         'Factions',
      economy:         'Economies',
      magicSystem:     'MagicSystems',
      group:           'Groups',
      compendiumEntry: 'Compendium',
      book:            'Books',
      campaignSession: 'Sessions',
      timelineEra:     'Eras',
      timelineTrack:   'Tracks',
      timelineBranch:  'Branches',
    };
    return leaves[type];
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
      .replace(/[\\/:"*?<>|#^[]{}]+/g, '')
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
      const rootTemplate = this.path('storyRootFolderTemplate');
      if (rootTemplate && rootTemplate.trim()) {
        return this.resolveTemplatePath(rootTemplate);
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
      const rootTemplate = this.path('storyRootFolderTemplate');
      const root = rootTemplate ? this.resolveTemplatePath(rootTemplate, context) : '';
      const configured = this.path(this.overrideKeyFor(type));

      let result: string | undefined;
      if (configured && configured.trim()) result = this.resolveTemplatePath(configured, context);
      else if (root) result = normalizePath(`${root}/${this.defaultLeafFor(type)}`);

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
      if (type === 'timelineEra')    return `${prefix}Eras`;
      if (type === 'timelineTrack')  return `${prefix}Tracks`;
      if (type === 'timelineBranch') return `${prefix}Branches`;
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
    if (type === 'timelineEra')    return `${base}/Eras`;
    if (type === 'timelineTrack')  return `${base}/Tracks`;
    if (type === 'timelineBranch') return `${base}/Branches`;
    throw new Error('Unknown entity type');
  }

  /** Non-throwing resolution: returns either a path or an error string. */
  tryGetEntityFolder(type: EntityFolderType, context?: { bookName?: string }): { path?: string; error?: string } {
    try {
      const path = this.getEntityFolder(type, context);
      return { path };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error resolving folder';
      return { error: msg };
    }
  }

  /** Resolve all entity folders at once. */
  resolveAll(): Record<EntityFolderType, { path?: string; error?: string }> {
    const types: EntityFolderType[] = [
      'character', 'location', 'event', 'item', 'reference', 'chapter', 'scene', 'map',
      'culture', 'faction', 'economy', 'magicSystem', 'group', 'compendiumEntry', 'book', 'campaignSession',
      'timelineEra', 'timelineTrack', 'timelineBranch'
    ];
    const out = {} as Record<EntityFolderType, { path?: string; error?: string }>;
    for (const t of types) out[t] = this.tryGetEntityFolder(t);
    return out;
  }
}
