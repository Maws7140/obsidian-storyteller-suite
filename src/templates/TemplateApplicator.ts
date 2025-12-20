/**
 * Template Applicator
 * Handles applying templates to stories with complete relationship mapping
 */

import { Notice, parseYaml } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateApplicationOptions,
    TemplateApplicationResult,
    TemplateEntity,
    TemplateEntitySelection
} from './TemplateTypes';
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
    TypedRelationship
} from '../types';
import { VariableSubstitution } from './VariableSubstitution';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';

export class TemplateApplicator {
    private plugin: StorytellerSuitePlugin;
    private idMap: Map<string, string> = new Map();
    private groupIdMap: Map<string, string> = new Map();
    private nameToIdMap: Map<string, string> = new Map();

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
        console.log('TemplateApplicator: Starting applyTemplate with:', { templateName: template.name, options });

        const result: TemplateApplicationResult = {
            success: false,
            idMap: new Map(),
            created: {
                characters: [],
                locations: [],
                events: [],
                items: [],
                groups: [],
                cultures: [],
                economies: [],
                magicSystems: [],
                chapters: [],
                scenes: [],
                references: []
            },
            warnings: []
        };

        try {
            // Reset ID maps
            this.idMap.clear();
            this.groupIdMap.clear();
            this.nameToIdMap.clear();

            // Apply user-provided entity mapping
            if (options.entityMapping) {
                options.entityMapping.forEach((realId, templateId) => {
                    this.idMap.set(templateId, realId);
                });
            }

            // Apply variable values if provided
            const variableValues = options.variableValues || {};
            console.log('TemplateApplicator: Variable values:', variableValues);

            // Substitute variables in template entities
            const substitutedTemplate = this.substituteTemplateVariables(template, variableValues);
            console.log('TemplateApplicator: Substituted template entities:', substitutedTemplate.entities);

            // Filter entities based on selection
            const filteredEntities = this.filterEntities(substitutedTemplate.entities, options.includeEntities);
            console.log('TemplateApplicator: Filtered entities:', filteredEntities);

            // Phase 1: Create all groups first (they need IDs for other entities)
            if (filteredEntities.groups && filteredEntities.groups.length > 0) {
                console.log(`TemplateApplicator: Creating ${filteredEntities.groups.length} groups`);
                result.created.groups = await this.createGroups(
                    filteredEntities.groups,
                    options.storyId,
                    options.fieldOverrides
                );
            }

            // Phase 2: Create all entities without relationships
            const creationPromises: Promise<any>[] = [];

            if (filteredEntities.characters && filteredEntities.characters.length > 0) {
                console.log(`TemplateApplicator: Creating ${filteredEntities.characters.length} characters`);
                creationPromises.push(
                    this.createCharacters(filteredEntities.characters, options.storyId, options.fieldOverrides)
                        .then(chars => {
                            console.log(`TemplateApplicator: Created ${chars.length} characters`);
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
                console.log(`TemplateApplicator: Creating ${filteredEntities.scenes.length} scenes`);
                creationPromises.push(
                    this.createScenes(filteredEntities.scenes, options.storyId, options.fieldOverrides)
                        .then(scenes => {
                            console.log(`TemplateApplicator: Created ${scenes.length} scenes`);
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

            // Wait for all entity creation
            console.log('TemplateApplicator: Waiting for all entity creation promises...');
            await Promise.all(creationPromises);
            console.log('TemplateApplicator: All entities created:', result.created);

            // Phase 3: Map all relationships now that all entities exist
            console.log('TemplateApplicator: Mapping relationships...');
            await this.mapAllRelationships(result.created, options.mergeRelationships || false);

            // Phase 4: Save all entities with mapped relationships
            console.log('TemplateApplicator: Saving all entities...');
            await this.saveAllEntities(result.created);
            console.log('TemplateApplicator: All entities saved');

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

        return filtered;
    }

    /**
     * Create groups (must be done first as they have IDs in settings)
     */
    private async createGroups(
        templateGroups: TemplateEntity<Group>[],
        storyId: string,
        overrides?: Map<string, Partial<any>>
    ): Promise<Group[]> {
        const groups: Group[] = [];

        for (const templateGroup of templateGroups) {
            const { templateId } = templateGroup;
            const { fields, sections } = this.processTemplateEntity(templateGroup);

            const override = overrides?.get(templateId);
            const group: Group = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                storyId,
                members: (fields as any).members || []
            } as Group;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (group as any)[propName] = content;
            }

            // Store mapping
            this.idMap.set(templateId, group.id!);
            this.groupIdMap.set(templateId, group.id!);
            this.nameToIdMap.set(group.name, group.id!);

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
    private processTemplateEntity<T>(templateEntity: TemplateEntity<T>): { fields: any; sections: Record<string, string> } {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, ...rest } = templateEntity as any;
        
        let fields: any = { ...rest };
        let sections: Record<string, string> = {};

        // Handle new format: yamlContent and markdownContent
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
            } catch (error) {
                console.warn('Failed to parse yamlContent:', error);
            }
        } else if (customYamlFields) {
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
                    (fields as any).description = parsedSections['Description'];
                }
                if ('Backstory' in parsedSections) {
                    (fields as any).backstory = parsedSections['Backstory'];
                }
            } catch (error) {
                console.warn('Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: use sectionContent
            sections = sectionContent;
            
            // Map section content to individual properties
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        return { fields, sections };
    }

    private async createCharacters(
        templateChars: TemplateEntity<Character>[],
        storyId: string,
        overrides?: Map<string, Partial<any>>
    ): Promise<Character[]> {
        const characters: Character[] = [];

        for (const templateChar of templateChars) {
            const { templateId } = templateChar;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateChar);

            const character: Character = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                relationships: [],
                locations: [],
                events: [],
                groups: [],
                connections: []
            } as Character;

            // Apply sections to entity properties (for backward compatibility with save methods)
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (character as any)[propName] = content;
            }

            // Store all template sections for saveCharacter to use (hidden property)
            // This preserves all sections from note-based templates, not just Description/Backstory
            Object.defineProperty(character, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, character.id!);
            this.nameToIdMap.set(character.name, character.id!);

            characters.push(character);
        }

        return characters;
    }

    /**
     * Create locations
     */
    private async createLocations(
        templateLocs: TemplateEntity<Location>[],
        storyId: string,
        overrides?: Map<string, Partial<any>>
    ): Promise<Location[]> {
        const locations: Location[] = [];

        for (const templateLoc of templateLocs) {
            const { templateId } = templateLoc;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateLoc);

            const location: Location = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                groups: [],
                connections: []
            } as Location;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (location as any)[propName] = content;
            }

            // Store all template sections for saveLocation to use (hidden property)
            Object.defineProperty(location, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, location.id!);
            this.nameToIdMap.set(location.name, location.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Event[]> {
        const events: Event[] = [];

        for (const templateEvt of templateEvents) {
            const { templateId } = templateEvt;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateEvt);

            const event: Event = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                characters: [],
                groups: [],
                connections: [],
                dependencies: []
            } as Event;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (event as any)[propName] = content;
            }

            // Store all template sections for saveEvent to use (hidden property)
            Object.defineProperty(event, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, event.id!);
            this.nameToIdMap.set(event.name, event.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<PlotItem[]> {
        const items: PlotItem[] = [];

        for (const templateItem of templateItems) {
            const { templateId } = templateItem;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateItem);

            const item: PlotItem = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                isPlotCritical: (fields as any).isPlotCritical || false,
                associatedEvents: [],
                groups: [],
                connections: []
            } as PlotItem;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (item as any)[propName] = content;
            }

            // Store all template sections for savePlotItem to use (hidden property)
            Object.defineProperty(item, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, item.id!);
            this.nameToIdMap.set(item.name, item.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Culture[]> {
        const cultures: Culture[] = [];

        for (const templateCult of templateCultures) {
            const { templateId } = templateCult;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateCult);

            const culture: Culture = {
                ...fields,
                ...override,
                id: this.generateId(),
                linkedLocations: [],
                linkedCharacters: [],
                linkedEvents: [],
                relatedCultures: []
            } as Culture;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (culture as any)[propName] = content;
            }

            // Store all template sections for saveCulture to use (hidden property)
            Object.defineProperty(culture, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, culture.id!);
            this.nameToIdMap.set(culture.name, culture.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Economy[]> {
        const economies: Economy[] = [];

        for (const templateEcon of templateEconomies) {
            const { templateId } = templateEcon;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateEcon);

            const economy: Economy = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                linkedLocations: [],
                linkedFactions: [],
                linkedCultures: [],
                linkedEvents: []
            } as Economy;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (economy as any)[propName] = content;
            }

            // Store all template sections for saveEconomy to use (hidden property)
            Object.defineProperty(economy, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, economy.id!);
            this.nameToIdMap.set(economy.name, economy.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<MagicSystem[]> {
        const magicSystems: MagicSystem[] = [];

        for (const templateMagic of templateMagicSystems) {
            const { templateId } = templateMagic;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateMagic);

            const magicSystem: MagicSystem = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                linkedCharacters: [],
                linkedLocations: [],
                linkedCultures: [],
                linkedEvents: [],
                linkedItems: []
            } as MagicSystem;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (magicSystem as any)[propName] = content;
            }

            // Store all template sections for saveMagicSystem to use (hidden property)
            Object.defineProperty(magicSystem, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, magicSystem.id!);
            this.nameToIdMap.set(magicSystem.name, magicSystem.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Chapter[]> {
        const chapters: Chapter[] = [];

        for (const templateChap of templateChapters) {
            const { templateId } = templateChap;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateChap);

            const chapter: Chapter = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                linkedCharacters: [],
                linkedLocations: [],
                linkedEvents: [],
                linkedItems: [],
                linkedGroups: []
            } as Chapter;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (chapter as any)[propName] = content;
            }

            // Store all template sections for saveChapter to use (hidden property)
            Object.defineProperty(chapter, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, chapter.id!);
            this.nameToIdMap.set(chapter.name, chapter.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Scene[]> {
        const scenes: Scene[] = [];

        for (const templateScene of templateScenes) {
            const { templateId } = templateScene;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateScene);

            const scene: Scene = {
                ...fields,
                ...override,
                id: override?.id || this.generateId(),
                linkedCharacters: [],
                linkedLocations: [],
                linkedEvents: [],
                linkedItems: [],
                linkedGroups: []
            } as Scene;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (scene as any)[propName] = content;
            }

            // Store all template sections for saveScene to use (hidden property)
            Object.defineProperty(scene, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, scene.id!);
            this.nameToIdMap.set(scene.name, scene.id!);

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
        overrides?: Map<string, Partial<any>>
    ): Promise<Reference[]> {
        const references: Reference[] = [];

        for (const templateRef of templateRefs) {
            const { templateId } = templateRef;
            const override = overrides?.get(templateId);
            const { fields, sections } = this.processTemplateEntity(templateRef);

            const reference: Reference = {
                ...fields,
                ...override,
                id: override?.id || this.generateId()
            } as Reference;

            // Apply sections to entity properties
            for (const [sectionName, content] of Object.entries(sections)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (reference as any)[propName] = content;
            }

            // Store all template sections for saveReference to use (hidden property)
            Object.defineProperty(reference, '_templateSections', {
                value: sections,
                enumerable: false,
                writable: true,
                configurable: true
            });

            // Store mapping
            this.idMap.set(templateId, reference.id!);
            this.nameToIdMap.set(reference.name, reference.id!);

            references.push(reference);
        }

        return references;
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
            if (loc.parentLocation) {
                loc.parentLocation = this.resolveId(loc.parentLocation) || loc.parentLocation;
            }
            loc.groups = this.mapGroups(loc.groups);
            loc.connections = this.mapTypedRelationships(loc.connections);
        }

        // Map event relationships
        for (const evt of created.events) {
            evt.characters = this.mapStringArray(evt.characters);
            if (evt.location) {
                evt.location = this.resolveId(evt.location) || evt.location;
            }
            evt.groups = this.mapGroups(evt.groups);
            evt.connections = this.mapTypedRelationships(evt.connections);
            evt.dependencies = this.mapStringArray(evt.dependencies);
        }

        // Map item relationships
        for (const item of created.items) {
            if (item.currentOwner) {
                item.currentOwner = this.resolveId(item.currentOwner) || item.currentOwner;
            }
            item.pastOwners = this.mapStringArray(item.pastOwners);
            if (item.currentLocation) {
                item.currentLocation = this.resolveId(item.currentLocation) || item.currentLocation;
            }
            item.associatedEvents = this.mapStringArray(item.associatedEvents);
            item.groups = this.mapGroups(item.groups);
            item.connections = this.mapTypedRelationships(item.connections);
        }

        // Map group relationships
        for (const group of created.groups) {
            if (group.members) {
                group.members = group.members.map(member => ({
                    ...member,
                    name: this.resolveId(member.name) || member.name
                }));
            }
            group.territories = this.mapStringArray(group.territories);
            group.linkedEvents = this.mapStringArray(group.linkedEvents);
            if (group.parentGroup) {
                group.parentGroup = this.resolveId(group.parentGroup) || group.parentGroup;
            }
            group.subgroups = this.mapStringArray(group.subgroups);
            if (group.groupRelationships) {
                group.groupRelationships = group.groupRelationships.map(rel => ({
                    ...rel,
                    groupName: this.resolveId(rel.groupName) || rel.groupName
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
                cult.parentCulture = this.resolveId(cult.parentCulture) || cult.parentCulture;
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
                scene.chapterId = this.resolveId(scene.chapterId) || scene.chapterId;
            }
            scene.linkedCharacters = this.mapStringArray(scene.linkedCharacters);
            scene.linkedLocations = this.mapStringArray(scene.linkedLocations);
            scene.linkedEvents = this.mapStringArray(scene.linkedEvents);
            scene.linkedItems = this.mapStringArray(scene.linkedItems);
            scene.linkedGroups = this.mapGroups(scene.linkedGroups);
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
     * Map array of string IDs
     */
    private mapStringArray(arr: string[] | undefined): string[] {
        if (!arr) return [];
        return arr
            .map(id => this.resolveId(id) || id)
            .filter(id => id !== undefined);
    }

    /**
     * Map group IDs (groups use actual IDs, not names)
     */
    private mapGroups(groups: string[] | undefined): string[] {
        if (!groups) return [];
        return groups
            .map(id => this.groupIdMap.get(id) || id)
            .filter(id => id !== undefined);
    }

    /**
     * Map typed relationships
     */
    private mapTypedRelationships(
        connections: TypedRelationship[] | undefined
    ): TypedRelationship[] {
        if (!connections) return [];
        return connections.map(conn => ({
            ...conn,
            target: this.resolveId(conn.target) || conn.target
        }));
    }

    /**
     * Map character relationships (can be string or TypedRelationship)
     */
    private mapRelationships(
        relationships: (string | TypedRelationship)[] | undefined
    ): (string | TypedRelationship)[] {
        if (!relationships) return [];
        return relationships.map(rel => {
            if (typeof rel === 'string') {
                return this.resolveId(rel) || rel;
            } else {
                return {
                    ...rel,
                    target: this.resolveId(rel.target) || rel.target
                };
            }
        });
    }

    /**
     * Save all created entities to vault
     */
    private async saveAllEntities(created: TemplateApplicationResult['created']): Promise<void> {
        const savePromises: Promise<any>[] = [];

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

        // Groups were already saved in createGroups()

        // Wait for all saves
        await Promise.all(savePromises);
    }

    /**
     * Substitute template variables in all entities
     */
    private substituteTemplateVariables(
        template: Template,
        variableValues: Record<string, any>
    ): Template {
        // If no variables or no variable values, return original template
        if (!template.variables || template.variables.length === 0 || Object.keys(variableValues).length === 0) {
            return template;
        }

        // Clone the template to avoid mutations
        const clonedTemplate: Template = JSON.parse(JSON.stringify(template));

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

                return result.value as TemplateEntity<T>;
            });
        };

        // Substitute in all entity types
        clonedTemplate.entities.characters = substituteEntityArray(clonedTemplate.entities.characters);
        clonedTemplate.entities.locations = substituteEntityArray(clonedTemplate.entities.locations);
        clonedTemplate.entities.events = substituteEntityArray(clonedTemplate.entities.events);
        clonedTemplate.entities.items = substituteEntityArray(clonedTemplate.entities.items);
        clonedTemplate.entities.groups = substituteEntityArray(clonedTemplate.entities.groups);
        clonedTemplate.entities.cultures = substituteEntityArray(clonedTemplate.entities.cultures);
        clonedTemplate.entities.economies = substituteEntityArray(clonedTemplate.entities.economies);
        clonedTemplate.entities.magicSystems = substituteEntityArray(clonedTemplate.entities.magicSystems);
        clonedTemplate.entities.chapters = substituteEntityArray(clonedTemplate.entities.chapters);
        clonedTemplate.entities.scenes = substituteEntityArray(clonedTemplate.entities.scenes);
        clonedTemplate.entities.references = substituteEntityArray(clonedTemplate.entities.references);

        // Log warnings if any
        if (allWarnings.length > 0) {
            console.warn('Template variable substitution warnings:', allWarnings);
        }

        return clonedTemplate;
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
