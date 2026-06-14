/**
 * Template Applicator
 * Handles applying templates to stories with complete relationship mapping
 */

import { Notice, TFile, normalizePath, parseYaml } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateApplicationOptions,
    TemplateApplicationResult,
    TemplateEntity,
    TemplateEntitySelection,
    TemplateExistingEntityLink,
    TemplateVariableValue
} from './TemplateTypes';
import { getTemplateEntityPluralKey } from './TemplateEntityRegistry';
import {
    Character,
    Location,
    Event,
    PlotItem,
    Group,
    Culture,
    Economy,
    MagicSystem,
    Chapter,
    Scene,
    Reference,
    StoryMap,
    Book,
    CampaignSession,
    CompendiumEntry,
    TypedRelationship
} from '../types';
import { VariableSubstitution } from './VariableSubstitution';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';

type TemplateFieldOverrides = Map<string, Partial<Record<string, unknown>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class TemplateApplicator {
    private plugin: StorytellerSuitePlugin;
    private idMap: Map<string, string> = new Map();
    private groupIdMap: Map<string, string> = new Map();
    private nameToIdMap: Map<string, string> = new Map();
    /** Maps template entity IDs (e.g. "CHAR_001") → resolved entity name ("King Aldric") */
    private templateIdToNameMap: Map<string, string> = new Map();

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Apply template to story
     */
    async applyTemplate(
        template: Template,
        options: TemplateApplicationOptions
    ): Promise<TemplateApplicationResult> {
        

        const result: TemplateApplicationResult = {
            success: false,
            idMap: new Map(),
            created: {
                characters: [],
                locations: [],
                events: [],
                items: [],
                groups: [],
                maps: [],
                cultures: [],
                economies: [],
                magicSystems: [],
                chapters: [],
                scenes: [],
                references: [],
                compendiumEntries: [],
                books: [],
                campaignSessions: []
            },
            warnings: []
        };

        try {
            // Reset ID maps
            this.idMap.clear();
            this.groupIdMap.clear();
            this.nameToIdMap.clear();
            this.templateIdToNameMap.clear();

            // Apply user-provided entity mapping
            if (options.entityMapping) {
                options.entityMapping.forEach((realId, templateId) => {
                    this.idMap.set(templateId, realId);
                });
            }

            // Apply variable values if provided
            const variableValues = options.variableValues || {};
            

            // Substitute variables in template entities
            const substitutedTemplate = this.substituteTemplateVariables(template, variableValues);
            

            // Filter entities based on selection
            const filteredEntities = this.filterEntities(substitutedTemplate.entities, options.includeEntities);
            

            // Phase 1: Create all groups first (they need IDs for other entities)
            if (filteredEntities.groups && filteredEntities.groups.length > 0) {
                
                result.created.groups = await this.createGroups(
                    filteredEntities.groups,
                    options.storyId,
                    options.fieldOverrides
                );
            }

            // Phase 2: Create all entities without relationships
            const creationPromises: Promise<unknown>[] = [];

            if (filteredEntities.characters && filteredEntities.characters.length > 0) {
                
                creationPromises.push(
                    this.createCharacters(filteredEntities.characters, options.storyId, options.fieldOverrides)
                        .then(chars => {
                            
                            result.created.characters = chars;
                        })
                );
            }

            if (filteredEntities.locations && filteredEntities.locations.length > 0) {
                creationPromises.push(
                    this.createLocations(filteredEntities.locations, options.storyId, options.fieldOverrides)
                        .then(locs => result.created.locations = locs)
                );
            }

            if (filteredEntities.events && filteredEntities.events.length > 0) {
                creationPromises.push(
                    this.createEvents(filteredEntities.events, options.storyId, options.fieldOverrides)
                        .then(evts => result.created.events = evts)
                );
            }

            if (filteredEntities.items && filteredEntities.items.length > 0) {
                creationPromises.push(
                    this.createItems(filteredEntities.items, options.storyId, options.fieldOverrides)
                        .then(items => result.created.items = items)
                );
            }

            if (filteredEntities.maps && filteredEntities.maps.length > 0) {
                creationPromises.push(
                    this.createMaps(filteredEntities.maps, options.storyId, options.fieldOverrides)
                        .then(maps => result.created.maps = maps)
                );
            }

            if (filteredEntities.cultures && filteredEntities.cultures.length > 0) {
                creationPromises.push(
                    this.createCultures(filteredEntities.cultures, options.storyId, options.fieldOverrides)
                        .then(cults => result.created.cultures = cults)
                );
            }

            if (filteredEntities.economies && filteredEntities.economies.length > 0) {
                creationPromises.push(
                    this.createEconomies(filteredEntities.economies, options.storyId, options.fieldOverrides)
                        .then(econs => result.created.economies = econs)
                );
            }

            if (filteredEntities.magicSystems && filteredEntities.magicSystems.length > 0) {
                creationPromises.push(
                    this.createMagicSystems(filteredEntities.magicSystems, options.storyId, options.fieldOverrides)
                        .then(magic => result.created.magicSystems = magic)
                );
            }

            if (filteredEntities.chapters && filteredEntities.chapters.length > 0) {
                creationPromises.push(
                    this.createChapters(filteredEntities.chapters, options.storyId, options.fieldOverrides)
                        .then(chaps => result.created.chapters = chaps)
                );
            }

            if (filteredEntities.scenes && filteredEntities.scenes.length > 0) {
                
                creationPromises.push(
                    this.createScenes(filteredEntities.scenes, options.storyId, options.fieldOverrides)
                        .then(scenes => {
                            
                            result.created.scenes = scenes;
                        })
                );
            }

            if (filteredEntities.references && filteredEntities.references.length > 0) {
                creationPromises.push(
                    this.createReferences(filteredEntities.references, options.storyId, options.fieldOverrides)
                        .then(refs => result.created.references = refs)
                );
            }

            if (filteredEntities.compendiumEntries && filteredEntities.compendiumEntries.length > 0) {
                creationPromises.push(
                    this.createCompendiumEntries(filteredEntities.compendiumEntries, options.storyId, options.fieldOverrides)
                        .then(entries => result.created.compendiumEntries = entries)
                );
            }

            if (filteredEntities.books && filteredEntities.books.length > 0) {
                creationPromises.push(
                    this.createBooks(filteredEntities.books, options.storyId, options.fieldOverrides)
                        .then(books => result.created.books = books)
                );
            }

            if (filteredEntities.campaignSessions && filteredEntities.campaignSessions.length > 0) {
                creationPromises.push(
                    this.createCampaignSessions(filteredEntities.campaignSessions, options.storyId, options.fieldOverrides)
                        .then(sessions => result.created.campaignSessions = sessions)
                );
            }

            // Wait for all entity creation
            
            await Promise.all(creationPromises);
            

            // Phase 3: Map all relationships now that all entities exist

            await this.mapAllRelationships(result.created, options.mergeRelationships || false);

            // Phase 3.5: Attach user-selected existing vault entities to created entities.
            // Done after relationship mapping so the selected values are written verbatim
            // and not transformed by the ID/name resolution passes above.
            this.applyExistingEntityLinks(
                template,
                result.created,
                options.existingEntityLinkSelections
            );

            // Phase 4: Save all entities with mapped relationships

            await this.saveAllEntities(result.created);
            

            // Success!
            result.success = true;
            result.idMap = new Map(this.idMap);

            // Track template usage
            await this.plugin.templateManager.incrementUsageCount(template.id);

            new Notice(`Template "${template.name}" applied successfully!`);
        } catch (error) {
            result.success = false;
            result.error = error instanceof Error ? error.message : 'Unknown error occurred';
            new Notice(`Failed to apply template: ${result.error}`, 5000);
        }

        return result;
    }

    /**
     * Filter entities based on selection
     */
    private filterEntities(
        entities: Template['entities'],
        selection?: TemplateEntitySelection
    ): Template['entities'] {
        if (!selection) {
            return entities;
        }

        const filtered: Template['entities'] = {};

        if (selection.characters && entities.characters) {
            filtered.characters = entities.characters.filter(e =>
                selection.characters!.includes(e.templateId)
            );
        } else if (!selection.characters) {
            filtered.characters = entities.characters;
        }

        if (selection.locations && entities.locations) {
            filtered.locations = entities.locations.filter(e =>
                selection.locations!.includes(e.templateId)
            );
        } else if (!selection.locations) {
            filtered.locations = entities.locations;
        }

        if (selection.events && entities.events) {
            filtered.events = entities.events.filter(e =>
                selection.events!.includes(e.templateId)
            );
        } else if (!selection.events) {
            filtered.events = entities.events;
        }

        if (selection.items && entities.items) {
            filtered.items = entities.items.filter(e =>
                selection.items!.includes(e.templateId)
            );
        } else if (!selection.items) {
            filtered.items = entities.items;
        }

        if (selection.groups && entities.groups) {
            filtered.groups = entities.groups.filter(e =>
                selection.groups!.includes(e.templateId)
            );
        } else if (!selection.groups) {
            filtered.groups = entities.groups;
        }

        if (selection.maps && entities.maps) {
            filtered.maps = entities.maps.filter(e =>
                selection.maps!.includes(e.templateId)
            );
        } else if (!selection.maps) {
            filtered.maps = entities.maps;
        }

        if (selection.cultures && entities.cultures) {
            filtered.cultures = entities.cultures.filter(e =>
                selection.cultures!.includes(e.templateId)
            );
        } else if (!selection.cultures) {
            filtered.cultures = entities.cultures;
        }

        if (selection.economies && entities.economies) {
            filtered.economies = entities.economies.filter(e =>
                selection.economies!.includes(e.templateId)
            );
        } else if (!selection.economies) {
            filtered.economies = entities.economies;
        }

        if (selection.magicSystems && entities.magicSystems) {
            filtered.magicSystems = entities.magicSystems.filter(e =>
                selection.magicSystems!.includes(e.templateId)
            );
        } else if (!selection.magicSystems) {
            filtered.magicSystems = entities.magicSystems;
        }

        if (selection.chapters && entities.chapters) {
            filtered.chapters = entities.chapters.filter(e =>
                selection.chapters!.includes(e.templateId)
            );
        } else if (!selection.chapters) {
            filtered.chapters = entities.chapters;
        }

        if (selection.scenes && entities.scenes) {
            filtered.scenes = entities.scenes.filter(e =>
                selection.scenes!.includes(e.templateId)
            );
        } else if (!selection.scenes) {
            filtered.scenes = entities.scenes;
        }

        if (selection.references && entities.references) {
            filtered.references = entities.references.filter(e =>
                selection.references!.includes(e.templateId)
            );
        } else if (!selection.references) {
            filtered.references = entities.references;
        }

        if (selection.compendiumEntries && entities.compendiumEntries) {
            filtered.compendiumEntries = entities.compendiumEntries.filter(e =>
                selection.compendiumEntries!.includes(e.templateId)
            );
        } else if (!selection.compendiumEntries) {
            filtered.compendiumEntries = entities.compendiumEntries;
        }

        if (selection.books && entities.books) {
            filtered.books = entities.books.filter(e =>
                selection.books!.includes(e.templateId)
            );
        } else if (!selection.books) {
            filtered.books = entities.books;
        }

        if (selection.campaignSessions && entities.campaignSessions) {
            filtered.campaignSessions = entities.campaignSessions.filter(e =>
                selection.campaignSessions!.includes(e.templateId)
            );
        } else if (!selection.campaignSessions) {
            filtered.campaignSessions = entities.campaignSessions;
        }

        return filtered;
    }

    /**
     * Create groups (must be done first as they have IDs in settings)
     */
    private async createGroups(
        templateGroups: TemplateEntity<Group>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Group[]> {
        const groups: Group[] = [];

        for (const templateGroup of templateGroups) {
            const { templateId } = templateGroup;
            const { fields, sections } = this.processTemplateEntity(templateGroup);

            const override = overrides?.get(templateId);
            const group: Group = {
                ...fields,
                ...override,
                id: this.getOverrideId(override),
                storyId,
                members: Array.isArray(fields.members) ? fields.members as Group['members'] : []
            } as unknown as Group;

            // Apply sections to entity properties
            this.applyEntitySections(group, sections);

            // Store mapping
            this.idMap.set(templateId, group.id);
            this.groupIdMap.set(templateId, group.id);
            this.nameToIdMap.set(group.name, group.id);

            // Add to plugin settings (groups are stored in settings)
            this.plugin.settings.groups.push(group);

            groups.push(group);
        }

        await this.plugin.saveSettings();
        return groups;
    }

    /**
     * Create characters
     */
    /**
     * Process template entity to extract fields from new format (yamlContent/markdownContent) or old format
     */
    private processTemplateEntity<T>(templateEntity: TemplateEntity<T>): { fields: Record<string, unknown>; sections: Record<string, string> } {
        const templateRecord = templateEntity as Record<string, unknown>;
        const { yamlContent, markdownContent, sectionContent, customYamlFields } = templateRecord;
        
        let fields: Record<string, unknown> = { ...templateRecord };
        delete fields.templateId;
        delete fields.yamlContent;
        delete fields.markdownContent;
        delete fields.sectionContent;
        delete fields.customYamlFields;
        let sections: Record<string, string> = {};

        // Handle new format: yamlContent and markdownContent
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent) as unknown;
                if (isRecord(parsed)) {
                    fields = { ...fields, ...parsed };
                }
            } catch {
            	// intentional
                
            }
        } else if (isRecord(customYamlFields)) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(`---\n---\n\n${markdownContent}`);
                sections = parsedSections;
                
                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    (fields).description = parsedSections['Description'];
                }
                if ('Backstory' in parsedSections) {
                    (fields).backstory = parsedSections['Backstory'];
                }
            } catch {
            	// intentional
                
            }
        } else if (isRecord(sectionContent)) {
            // Old format: use sectionContent
            sections = Object.fromEntries(
                Object.entries(sectionContent).map(([key, value]) => [key, String(value ?? '')])
            );
            
            // Map section content to individual properties
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields)[propName] = content;
            }
        }

        return { fields, sections };
    }

    private async createCharacters(
        templateChars: TemplateEntity<Character>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Character[]> {
        const characters: Character[] = [];

        for (const templateChar of templateChars) {
            const { templateId } = templateChar;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateChar);

            // If a vault file for this character name already exists, reuse it rather than
            // overwriting it. This prevents duplicate files and broken links when applying
            // a template to a vault that already has some of the same characters.
            const entityName: string = (fields.name as string) || (override?.name as string) || '';
            if (entityName) {
                const safeFileName = `${entityName.replace(/[\\/:"*?<>|]+/g, '')}.md`;
                const folderPath = this.plugin.getEntityFolder('character');
                const filePath = normalizePath(`${folderPath}/${safeFileName}`);
                const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (existingFile instanceof TFile) {
                    const existing = await this.plugin.parseFile<Character>(existingFile, { name: '' }, 'character');
                    if (existing) {
                        const existingId = existing.id || this.generateId();
                        this.idMap.set(templateId, existingId);
                        this.nameToIdMap.set(entityName, existingId);
                        this.templateIdToNameMap.set(templateId, entityName);
                        characters.push(existing);
                        continue;
                    }
                }
            }

            // Default arrays first so template fields can override them
            const character: Character = {
                relationships: [],
                locations: [],
                events: [],
                groups: [],
                connections: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Character;

            // Apply sections to entity properties (for backward compatibility with save methods)
            this.applyEntitySections(character, sections);

            // Store mapping
            this.idMap.set(templateId, character.id!);
            this.nameToIdMap.set(character.name, character.id!);
            this.templateIdToNameMap.set(templateId, character.name);

            characters.push(character);
        }

        return characters;
    }

    /**
     * Resolve a template entity ID or name to the entity's display name.
     * Relationship targets in vault notes must be entity names, not generated IDs.
     */
    private resolveToName(templateIdOrName: string | undefined): string | undefined {
        if (!templateIdOrName) return undefined;
        // Direct template ID → name lookup (e.g. "CHAR_001" → "King Aldric")
        const name = this.templateIdToNameMap.get(templateIdOrName);
        if (name) return name;
        // Already a name (present in nameToIdMap)
        if (this.nameToIdMap.has(templateIdOrName)) return templateIdOrName;
        // Unresolvable — return as-is so we don't silently drop values
        return templateIdOrName;
    }

    /** Helper: apply sections to entity and store _templateSections */
    private applyEntitySections(entity: object, sections: Record<string, string>): void {
        const target = entity as Record<string, unknown>;
        for (const [sectionName, content] of Object.entries(sections)) {
            const propName = sectionName.toLowerCase().replace(/\s+/g, '');
            target[propName] = content;
        }
        if (Object.keys(sections).length > 0) {
            Object.defineProperty(entity, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
    }

    /**
     * Create locations
     */
    private async createLocations(
        templateLocs: TemplateEntity<Location>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Location[]> {
        const locations: Location[] = [];

        for (const templateLoc of templateLocs) {
            const { templateId } = templateLoc;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateLoc);

            const location: Location = {
                groups: [],
                connections: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Location;

            this.applyEntitySections(location, sections);
            this.idMap.set(templateId, location.id!);
            this.nameToIdMap.set(location.name, location.id!);
            this.templateIdToNameMap.set(templateId, location.name);
            locations.push(location);
        }

        return locations;
    }

    /**
     * Create events
     */
    private async createEvents(
        templateEvents: TemplateEntity<Event>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Event[]> {
        const events: Event[] = [];

        for (const templateEvt of templateEvents) {
            const { templateId } = templateEvt;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateEvt);

            const event: Event = {
                characters: [],
                groups: [],
                connections: [],
                dependencies: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Event;

            this.applyEntitySections(event, sections);
            this.idMap.set(templateId, event.id!);
            this.nameToIdMap.set(event.name, event.id!);
            this.templateIdToNameMap.set(templateId, event.name);
            events.push(event);
        }

        return events;
    }

    /**
     * Create items
     */
    private async createItems(
        templateItems: TemplateEntity<PlotItem>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<PlotItem[]> {
        const items: PlotItem[] = [];

        for (const templateItem of templateItems) {
            const { templateId } = templateItem;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateItem);

            const item: PlotItem = {
                isPlotCritical: false,
                associatedEvents: [],
                groups: [],
                connections: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as PlotItem;

            this.applyEntitySections(item, sections);
            this.idMap.set(templateId, item.id!);
            this.nameToIdMap.set(item.name, item.id!);
            this.templateIdToNameMap.set(templateId, item.name);
            items.push(item);
        }

        return items;
    }

    /**
     * Create cultures
     */
    private async createCultures(
        templateCultures: TemplateEntity<Culture>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Culture[]> {
        const cultures: Culture[] = [];

        for (const templateCult of templateCultures) {
            const { templateId } = templateCult;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateCult);

            const culture: Culture = {
                linkedLocations: [],
                linkedCharacters: [],
                linkedEvents: [],
                relatedCultures: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Culture;

            this.applyEntitySections(culture, sections);
            this.idMap.set(templateId, culture.id!);
            this.nameToIdMap.set(culture.name, culture.id!);
            this.templateIdToNameMap.set(templateId, culture.name);
            cultures.push(culture);
        }

        return cultures;
    }

    /**
     * Create economies
     */
    private async createEconomies(
        templateEconomies: TemplateEntity<Economy>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Economy[]> {
        const economies: Economy[] = [];

        for (const templateEcon of templateEconomies) {
            const { templateId } = templateEcon;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateEcon);

            const economy: Economy = {
                linkedLocations: [],
                linkedFactions: [],
                linkedCultures: [],
                linkedEvents: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Economy;

            this.applyEntitySections(economy, sections);
            this.idMap.set(templateId, economy.id!);
            this.nameToIdMap.set(economy.name, economy.id!);
            this.templateIdToNameMap.set(templateId, economy.name);
            economies.push(economy);
        }

        return economies;
    }

    /**
     * Create magic systems
     */
    private async createMagicSystems(
        templateMagicSystems: TemplateEntity<MagicSystem>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<MagicSystem[]> {
        const magicSystems: MagicSystem[] = [];

        for (const templateMagic of templateMagicSystems) {
            const { templateId } = templateMagic;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateMagic);

            const magicSystem: MagicSystem = {
                linkedCharacters: [],
                linkedLocations: [],
                linkedCultures: [],
                linkedEvents: [],
                linkedItems: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as MagicSystem;

            this.applyEntitySections(magicSystem, sections);
            this.idMap.set(templateId, magicSystem.id!);
            this.nameToIdMap.set(magicSystem.name, magicSystem.id!);
            this.templateIdToNameMap.set(templateId, magicSystem.name);
            magicSystems.push(magicSystem);
        }

        return magicSystems;
    }

    /**
     * Create chapters
     */
    private async createChapters(
        templateChapters: TemplateEntity<Chapter>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Chapter[]> {
        const chapters: Chapter[] = [];

        for (const templateChap of templateChapters) {
            const { templateId } = templateChap;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateChap);

            const chapter: Chapter = {
                linkedCharacters: [],
                linkedLocations: [],
                linkedEvents: [],
                linkedItems: [],
                linkedGroups: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Chapter;

            this.applyEntitySections(chapter, sections);
            this.idMap.set(templateId, chapter.id!);
            this.nameToIdMap.set(chapter.name, chapter.id!);
            this.templateIdToNameMap.set(templateId, chapter.name);
            chapters.push(chapter);
        }

        return chapters;
    }

    /**
     * Create scenes
     */
    private async createScenes(
        templateScenes: TemplateEntity<Scene>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Scene[]> {
        const scenes: Scene[] = [];

        for (const templateScene of templateScenes) {
            const { templateId } = templateScene;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateScene);

            const scene: Scene = {
                linkedCharacters: [],
                linkedLocations: [],
                linkedEvents: [],
                linkedItems: [],
                linkedGroups: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Scene;

            this.applyEntitySections(scene, sections);
            this.idMap.set(templateId, scene.id!);
            this.nameToIdMap.set(scene.name, scene.id!);
            this.templateIdToNameMap.set(templateId, scene.name);
            scenes.push(scene);
        }

        return scenes;
    }

    /**
     * Create references
     */
    private async createReferences(
        templateRefs: TemplateEntity<Reference>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Reference[]> {
        const references: Reference[] = [];

        for (const templateRef of templateRefs) {
            const { templateId } = templateRef;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateRef);

            const reference: Reference = {
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as Reference;

            this.applyEntitySections(reference, sections);
            this.idMap.set(templateId, reference.id!);
            this.nameToIdMap.set(reference.name, reference.id!);
            this.templateIdToNameMap.set(templateId, reference.name);
            references.push(reference);
        }

        return references;
    }

    private async createMaps(
        templateMaps: TemplateEntity<StoryMap>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<StoryMap[]> {
        const maps: StoryMap[] = [];

        for (const templateMap of templateMaps) {
            const { templateId } = templateMap;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateMap);

            const map: StoryMap = {
                markers: [],
                scale: 'custom',
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as StoryMap;

            this.applyEntitySections(map, sections);
            this.idMap.set(templateId, map.id!);
            this.nameToIdMap.set(map.name, map.id!);
            this.templateIdToNameMap.set(templateId, map.name);
            maps.push(map);
        }

        return maps;
    }

    private async createCompendiumEntries(
        templateEntries: TemplateEntity<CompendiumEntry>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<CompendiumEntry[]> {
        const entries: CompendiumEntry[] = [];

        for (const templateEntry of templateEntries) {
            const { templateId } = templateEntry;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateEntry);

            const entry: CompendiumEntry = {
                linkedLocations: [],
                linkedCharacters: [],
                linkedItems: [],
                linkedMagicSystems: [],
                linkedCultures: [],
                linkedEvents: [],
                groups: [],
                connections: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as CompendiumEntry;

            this.applyEntitySections(entry, sections);
            this.idMap.set(templateId, entry.id!);
            this.nameToIdMap.set(entry.name, entry.id!);
            this.templateIdToNameMap.set(templateId, entry.name);
            entries.push(entry);
        }

        return entries;
    }

    private async createBooks(
        templateBooks: TemplateEntity<Book>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<Book[]> {
        const books: Book[] = [];

        for (const templateBook of templateBooks) {
            const { templateId } = templateBook;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateBook);

            const book: Book = {
                linkedChapters: [],
                groups: [],
                connections: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as Book;

            this.applyEntitySections(book, sections);
            this.idMap.set(templateId, book.id!);
            this.nameToIdMap.set(book.name, book.id!);
            this.templateIdToNameMap.set(templateId, book.name);
            books.push(book);
        }

        return books;
    }

    private async createCampaignSessions(
        templateSessions: TemplateEntity<CampaignSession>[],
        storyId: string,
        overrides?: TemplateFieldOverrides
    ): Promise<CampaignSession[]> {
        const sessions: CampaignSession[] = [];

        for (const templateSession of templateSessions) {
            const { templateId } = templateSession;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateSession);

            const session: CampaignSession = {
                storyId,
                partyCharacterIds: [],
                partyCharacterNames: [],
                partyItems: [],
                flags: [],
                revealedCompendiumEntryIds: [],
                revealedCompendiumEntryNames: [],
                collectedBoardItemKeys: [],
                groupStandings: [],
                ...fields,
                ...override,
                id: this.getOverrideId(override),
            } as unknown as CampaignSession;

            this.applyEntitySections(session, sections);
            this.idMap.set(templateId, session.id!);
            this.nameToIdMap.set(session.name, session.id!);
            this.templateIdToNameMap.set(templateId, session.name);
            sessions.push(session);
        }

        return sessions;
    }

    /**
     * Attach existing vault entities (chosen at apply time) to the entities this
     * template created. Writes the selected reference into the configured field on
     * the matching source entity. Never creates new target entities.
     */
    private applyExistingEntityLinks(
        template: Template,
        created: TemplateApplicationResult['created'],
        selections: TemplateApplicationOptions['existingEntityLinkSelections']
    ): void {
        const links = template.existingEntityLinks;
        if (!links || links.length === 0 || !selections) {
            return;
        }

        for (const link of links) {
            const selection = selections[link.id];
            if (selection === undefined) continue;

            const values = (Array.isArray(selection) ? selection : [selection])
                .map(value => (typeof value === 'string' ? value.trim() : ''))
                .filter(value => value.length > 0);
            if (values.length === 0) continue;

            const sourceEntity = this.findCreatedSourceEntity(created, link);
            if (!sourceEntity) continue;

            this.writeLinkValues(sourceEntity, link, values);
        }
    }

    /**
     * Find the created entity that a link targets, by resolving its template ID to
     * the generated real ID and matching within the source type's created collection.
     */
    private findCreatedSourceEntity(
        created: TemplateApplicationResult['created'],
        link: TemplateExistingEntityLink
    ): Record<string, unknown> | undefined {
        const pluralKey = getTemplateEntityPluralKey(link.sourceType);
        const collection = (created as unknown as Record<string, unknown>)[pluralKey];
        if (!Array.isArray(collection)) return undefined;

        const realId = this.idMap.get(link.sourceTemplateId);
        const entities = collection as Array<Record<string, unknown>>;
        if (realId) {
            const byId = entities.find(entity => entity.id === realId);
            if (byId) return byId;
        }
        // Fall back to the only entity of that type, if unambiguous
        return entities.length === 1 ? entities[0] : undefined;
    }

    /**
     * Write selected reference values into the link's target field. Array fields
     * append without duplicates; scalar fields take the first value.
     */
    private writeLinkValues(
        entity: Record<string, unknown>,
        link: TemplateExistingEntityLink,
        values: string[]
    ): void {
        if (link.multiple) {
            const existing = Array.isArray(entity[link.targetField])
                ? (entity[link.targetField] as unknown[]).map(value => String(value))
                : [];
            const merged = [...existing];
            for (const value of values) {
                if (!merged.includes(value)) {
                    merged.push(value);
                }
            }
            entity[link.targetField] = merged;
        } else {
            entity[link.targetField] = values[0];
        }
    }

    /**
     * Map all relationships using the ID map
     */
    private async mapAllRelationships(
        created: TemplateApplicationResult['created'],
        mergeWithExisting: boolean
    ): Promise<void> {
        // Map character relationships
        for (const char of created.characters) {
            char.relationships = this.mapRelationships(char.relationships);
            char.locations = this.mapStringArray(char.locations);
            char.events = this.mapStringArray(char.events);
            char.groups = this.mapGroups(char.groups);
            char.connections = this.mapTypedRelationships(char.connections);
        }

        // Map location relationships
        for (const loc of created.locations) {
            if (loc.parentLocationId) {
                loc.parentLocationId = this.resolveToName(loc.parentLocationId) || loc.parentLocationId;
            }
            loc.groups = this.mapGroups(loc.groups);
            loc.connections = this.mapTypedRelationships(loc.connections);
        }

        // Map event relationships
        for (const evt of created.events) {
            evt.characters = this.mapStringArray(evt.characters);
            if (evt.location) {
                evt.location = this.resolveToName(evt.location) || evt.location;
            }
            evt.groups = this.mapGroups(evt.groups);
            evt.connections = this.mapTypedRelationships(evt.connections);
            evt.dependencies = this.mapStringArray(evt.dependencies);
        }

        // Map item relationships
        for (const item of created.items) {
            if (item.currentOwner) {
                item.currentOwner = this.resolveToName(item.currentOwner) || item.currentOwner;
            }
            item.pastOwners = this.mapStringArray(item.pastOwners);
            if (item.currentLocation) {
                item.currentLocation = this.resolveToName(item.currentLocation) || item.currentLocation;
            }
            item.associatedEvents = this.mapStringArray(item.associatedEvents);
            item.groups = this.mapGroups(item.groups);
            item.connections = this.mapTypedRelationships(item.connections);
        }

        // Map map relationships
        for (const map of created.maps) {
            if (map.parentMapId) {
                map.parentMapId = this.resolveId(map.parentMapId) || map.parentMapId;
            }
            if (map.correspondingLocationId) {
                map.correspondingLocationId = this.resolveId(map.correspondingLocationId) || map.correspondingLocationId;
            }
            map.childMapIds = this.mapStringArray(map.childMapIds);
            map.linkedLocations = this.mapStringArray(map.linkedLocations);
            map.linkedCharacters = this.mapStringArray(map.linkedCharacters);
            map.linkedEvents = this.mapStringArray(map.linkedEvents);
            map.linkedItems = this.mapStringArray(map.linkedItems);
            map.linkedGroups = this.mapGroups(map.linkedGroups);
            map.linkedCultures = this.mapStringArray(map.linkedCultures);
            map.linkedEconomies = this.mapStringArray(map.linkedEconomies);
            map.linkedMagicSystems = this.mapStringArray(map.linkedMagicSystems);
            map.linkedScenes = this.mapStringArray(map.linkedScenes);
            map.linkedReferences = this.mapStringArray(map.linkedReferences);
        }

        // Map group relationships
        for (const group of created.groups) {
            if (group.members) {
                group.members = group.members.map(member => ({
                    ...member,
                    name: this.resolveToName(member.name) || member.name
                }));
            }
            group.territories = this.mapStringArray(group.territories);
            group.linkedEvents = this.mapStringArray(group.linkedEvents);
            if (group.parentGroup) {
                group.parentGroup = this.resolveToName(group.parentGroup) || group.parentGroup;
            }
            group.subgroups = this.mapStringArray(group.subgroups);
            if (group.groupRelationships) {
                group.groupRelationships = group.groupRelationships.map(rel => ({
                    ...rel,
                    groupName: this.resolveToName(rel.groupName) || rel.groupName
                }));
            }
        }

        // Map culture relationships
        for (const cult of created.cultures) {
            cult.linkedLocations = this.mapStringArray(cult.linkedLocations);
            cult.linkedCharacters = this.mapStringArray(cult.linkedCharacters);
            cult.linkedEvents = this.mapStringArray(cult.linkedEvents);
            cult.relatedCultures = this.mapStringArray(cult.relatedCultures);
            if (cult.parentCulture) {
                cult.parentCulture = this.resolveToName(cult.parentCulture) || cult.parentCulture;
            }
        }

        // Map economy relationships
        for (const econ of created.economies) {
            econ.linkedLocations = this.mapStringArray(econ.linkedLocations);
            econ.linkedFactions = this.mapStringArray(econ.linkedFactions);
            econ.linkedCultures = this.mapStringArray(econ.linkedCultures);
            econ.linkedEvents = this.mapStringArray(econ.linkedEvents);
        }

        // Map magic system relationships
        for (const magic of created.magicSystems) {
            magic.linkedCharacters = this.mapStringArray(magic.linkedCharacters);
            magic.linkedLocations = this.mapStringArray(magic.linkedLocations);
            magic.linkedCultures = this.mapStringArray(magic.linkedCultures);
            magic.linkedEvents = this.mapStringArray(magic.linkedEvents);
            magic.linkedItems = this.mapStringArray(magic.linkedItems);
        }

        // Map chapter relationships
        for (const chap of created.chapters) {
            chap.linkedCharacters = this.mapStringArray(chap.linkedCharacters);
            chap.linkedLocations = this.mapStringArray(chap.linkedLocations);
            chap.linkedEvents = this.mapStringArray(chap.linkedEvents);
            chap.linkedItems = this.mapStringArray(chap.linkedItems);
            chap.linkedGroups = this.mapGroups(chap.linkedGroups);
        }

        // Map scene relationships
        for (const scene of created.scenes) {
            if (scene.chapterId) {
                // Chapter ID must remain a real ID for chapter-scene linking
                scene.chapterId = this.resolveId(scene.chapterId) || scene.chapterId;
                // Also update chapterName to the human-readable name
                scene.chapterName = this.resolveToName(scene.chapterId) || scene.chapterName;
            }
            scene.linkedCharacters = this.mapStringArray(scene.linkedCharacters);
            scene.linkedLocations = this.mapStringArray(scene.linkedLocations);
            scene.linkedEvents = this.mapStringArray(scene.linkedEvents);
            scene.linkedItems = this.mapStringArray(scene.linkedItems);
            scene.linkedGroups = this.mapGroups(scene.linkedGroups);
        }

        // Map compendium entry relationships
        for (const entry of created.compendiumEntries) {
            entry.linkedLocations = this.mapStringArray(entry.linkedLocations);
            entry.linkedCharacters = this.mapStringArray(entry.linkedCharacters);
            entry.linkedItems = this.mapStringArray(entry.linkedItems);
            entry.linkedMagicSystems = this.mapStringArray(entry.linkedMagicSystems);
            entry.linkedCultures = this.mapStringArray(entry.linkedCultures);
            entry.linkedEvents = this.mapStringArray(entry.linkedEvents);
            entry.groups = this.mapGroups(entry.groups);
            entry.connections = this.mapTypedRelationships(entry.connections);
            entry.triggeredAtLocations = this.mapStringArray(entry.triggeredAtLocations);
            if (entry.triggeredByItem) {
                entry.triggeredByItem = this.resolveToName(entry.triggeredByItem) || entry.triggeredByItem;
            }
        }

        // Map book relationships
        for (const book of created.books) {
            book.linkedChapters = this.mapStringArray(book.linkedChapters);
            book.groups = this.mapGroups(book.groups);
            book.connections = this.mapTypedRelationships(book.connections);
        }

        // Map campaign session relationships
        for (const session of created.campaignSessions) {
            if (session.currentSceneId) {
                session.currentSceneId = this.resolveId(session.currentSceneId) || session.currentSceneId;
                session.currentSceneName = this.resolveToName(session.currentSceneId) || session.currentSceneName;
            }
            if (session.activeMapId) {
                session.activeMapId = this.resolveId(session.activeMapId) || session.activeMapId;
            }
            session.partyCharacterIds = this.mapStringArray(session.partyCharacterIds);
            session.partyCharacterNames = this.mapStringArray(session.partyCharacterNames);
            session.partyItems = this.mapStringArray(session.partyItems);
            session.revealedCompendiumEntryIds = this.mapStringArray(session.revealedCompendiumEntryIds);
            session.revealedCompendiumEntryNames = this.mapStringArray(session.revealedCompendiumEntryNames);
        }
    }

    /**
     * Resolve template ID to real ID or name
     */
    private resolveId(templateId: string | undefined): string | undefined {
        if (!templateId) return undefined;
        return this.idMap.get(templateId) || this.nameToIdMap.get(templateId);
    }

    /**
     * Map array of entity references to entity names.
     * Vault notes store entity names (not generated IDs) for wiki-link compatibility.
     */
    private mapStringArray(arr: string[] | undefined): string[] {
        if (!arr) return [];
        return arr
            .map(id => this.resolveToName(id) || id)
            .filter(id => id !== undefined);
    }

    /**
     * Map group IDs (groups use actual vault IDs, not names)
     */
    private mapGroups(groups: string[] | undefined): string[] {
        if (!groups) return [];
        return groups
            .map(id => this.groupIdMap.get(id) || id)
            .filter(id => id !== undefined);
    }

    /**
     * Map typed relationships — targets become entity names for vault wiki-links
     */
    private mapTypedRelationships(
        connections: TypedRelationship[] | undefined
    ): TypedRelationship[] {
        if (!connections) return [];
        return connections.map(conn => ({
            ...conn,
            target: this.resolveToName(conn.target) || conn.target
        }));
    }

    /**
     * Map character relationships — targets become entity names for vault wiki-links
     */
    private mapRelationships(
        relationships: (string | TypedRelationship)[] | undefined
    ): (string | TypedRelationship)[] {
        if (!relationships) return [];
        return relationships.map(rel => {
            if (typeof rel === 'string') {
                return this.resolveToName(rel) || rel;
            } else {
                return {
                    ...rel,
                    target: this.resolveToName(rel.target) || rel.target
                };
            }
        });
    }

    /**
     * Save all created entities to vault
     */
    private async saveAllEntities(created: TemplateApplicationResult['created']): Promise<void> {
        const savePromises: Promise<void>[] = [];

        // Save characters
        for (const char of created.characters) {
            savePromises.push(this.plugin.saveCharacter(char));
        }

        // Save locations
        for (const loc of created.locations) {
            savePromises.push(this.plugin.saveLocation(loc));
        }

        // Save events
        for (const evt of created.events) {
            savePromises.push(this.plugin.saveEvent(evt));
        }

        // Save items
        for (const item of created.items) {
            savePromises.push(this.plugin.savePlotItem(item));
        }

        for (const map of created.maps) {
            savePromises.push(this.plugin.saveMap(map));
        }

        // Save cultures
        for (const cult of created.cultures) {
            savePromises.push(this.plugin.saveCulture(cult));
        }

        // Save economies
        for (const econ of created.economies) {
            savePromises.push(this.plugin.saveEconomy(econ));
        }

        // Save magic systems
        for (const magic of created.magicSystems) {
            savePromises.push(this.plugin.saveMagicSystem(magic));
        }

        // Save chapters
        for (const chap of created.chapters) {
            savePromises.push(this.plugin.saveChapter(chap));
        }

        // Save scenes
        for (const scene of created.scenes) {
            savePromises.push(this.plugin.saveScene(scene));
        }

        // Save references
        for (const ref of created.references) {
            savePromises.push(this.plugin.saveReference(ref));
        }

        for (const entry of created.compendiumEntries) {
            savePromises.push(this.plugin.saveCompendiumEntry(entry));
        }

        for (const book of created.books) {
            savePromises.push(this.plugin.saveBook(book));
        }

        for (const session of created.campaignSessions) {
            savePromises.push(this.plugin.saveSession(session));
        }

        // Groups were already saved in createGroups()

        // Wait for all saves
        await Promise.all(savePromises);
    }

    /**
     * Substitute template variables in all entities
     */
    private substituteTemplateVariables(
        template: Template,
        variableValues: Record<string, TemplateVariableValue>
    ): Template {
        // If no variables or no variable values, return original template
        if (!template.variables || template.variables.length === 0 || Object.keys(variableValues).length === 0) {
            return template;
        }

        // Clone the template to avoid mutations
        const clonedTemplate = JSON.parse(JSON.stringify(template)) as Template;

        // Substitute variables in all entity types
        const allWarnings: string[] = [];

        // Helper to substitute entity arrays
        const substituteEntityArray = <T>(entities: TemplateEntity<T>[] | undefined): TemplateEntity<T>[] | undefined => {
            if (!entities || entities.length === 0) return entities;

            return entities.map(entity => {
                const result = VariableSubstitution.substituteEntity(entity, variableValues, false);

                if (result.warnings.length > 0) {
                    allWarnings.push(...result.warnings);
                }

                return result.value;
            });
        };

        // Substitute in all entity types
        clonedTemplate.entities.characters = substituteEntityArray(clonedTemplate.entities.characters);
        clonedTemplate.entities.locations = substituteEntityArray(clonedTemplate.entities.locations);
        clonedTemplate.entities.events = substituteEntityArray(clonedTemplate.entities.events);
        clonedTemplate.entities.items = substituteEntityArray(clonedTemplate.entities.items);
        clonedTemplate.entities.groups = substituteEntityArray(clonedTemplate.entities.groups);
        clonedTemplate.entities.maps = substituteEntityArray(clonedTemplate.entities.maps);
        clonedTemplate.entities.cultures = substituteEntityArray(clonedTemplate.entities.cultures);
        clonedTemplate.entities.economies = substituteEntityArray(clonedTemplate.entities.economies);
        clonedTemplate.entities.magicSystems = substituteEntityArray(clonedTemplate.entities.magicSystems);
        clonedTemplate.entities.chapters = substituteEntityArray(clonedTemplate.entities.chapters);
        clonedTemplate.entities.scenes = substituteEntityArray(clonedTemplate.entities.scenes);
        clonedTemplate.entities.references = substituteEntityArray(clonedTemplate.entities.references);
        clonedTemplate.entities.compendiumEntries = substituteEntityArray(clonedTemplate.entities.compendiumEntries);
        clonedTemplate.entities.books = substituteEntityArray(clonedTemplate.entities.books);
        clonedTemplate.entities.campaignSessions = substituteEntityArray(clonedTemplate.entities.campaignSessions);

        // Log warnings if any
        if (allWarnings.length > 0) {
        	// intentional
            
        }

        return clonedTemplate;
    }

    /**
     * Generate unique ID
     */
    private getOverrideId(override: Partial<Record<string, unknown>> | undefined): string {
        return typeof override?.id === 'string' ? override.id : this.generateId();
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
}
