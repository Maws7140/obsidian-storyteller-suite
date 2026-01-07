import { App, TFile, normalizePath } from 'obsidian';
import { MarkerDefinition } from './types';
import type StorytellerSuitePlugin from '../main';
import { StoryMap as Map } from '../types';
import { buildFrontmatter, getWhitelistKeys } from '../yaml/EntitySections';
import { stringifyYamlWithLogging } from '../utils/YamlSerializer';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';

/**
 * Entity Linker
 * Manages bidirectional linking between maps and entities
 */
export class EntityLinker {
    constructor(
        private app: App,
        private plugin: StorytellerSuitePlugin
    ) {}

    /**
     * Link an entity to a map by updating entity frontmatter
     * Supports all entity types uniformly
     */
    async linkEntityToMap(
        entityType: 'character' | 'location' | 'event' | 'item' | 'group' | 'culture' | 'scene' | 'economy' | 'magicsystem' | 'reference',
        entityName: string,
        mapId: string,
        markerId: string,
        coordinates?: [number, number]
    ): Promise<void> {
        const entity = await this.findEntity(entityType, entityName);
        if (!entity || !entity.filePath) return;

        const file = this.app.vault.getAbstractFileByPath(entity.filePath);
        if (!(file instanceof TFile)) return;

        // Read existing content
        const content = await this.app.vault.read(file);
        const sections = parseSectionsFromMarkdown(content);
        const { parseFrontmatterFromContent } = await import('../yaml/EntitySections');
        const existingFrontmatter = parseFrontmatterFromContent(content) || {};

        // Update frontmatter
        const updatedFrontmatter: Record<string, unknown> = {
            ...existingFrontmatter,
            mapId: mapId,
            markerId: markerId,
            relatedMapIds: this.addToArray(existingFrontmatter.relatedMapIds as string[] | undefined, mapId)
        };

        // Add coordinates if provided
        if (coordinates) {
            updatedFrontmatter.mapCoordinates = coordinates;
        }

        // Build frontmatter using whitelist
        // Note: 'group' is not a standard entity type - groups are stored in settings
        const entityTypeForWhitelist = entityType === 'group' ? 'faction' : entityType;
        const whitelist = getWhitelistKeys(entityTypeForWhitelist as any);
        const finalFrontmatter = buildFrontmatter(entityTypeForWhitelist as any, updatedFrontmatter, whitelist, {
            customFieldsMode: 'flatten',
            originalFrontmatter: existingFrontmatter
        });

        // Serialize and save
        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, existingFrontmatter, `${entityType}: ${entityName}`)
            : '';

        const mdContent = `---\n${frontmatterString}---\n\n` +
            Object.entries(sections)
                .map(([key, value]) => `## ${key}\n${value || ''}`)
                .join('\n\n') + '\n';

        await this.app.vault.modify(file, mdContent);
        this.app.metadataCache.trigger("dataview:refresh-views");
    }

    /**
     * Unlink an entity from a map
     * Supports all entity types uniformly
     */
    async unlinkEntityFromMap(
        entityType: 'character' | 'location' | 'event' | 'item' | 'group' | 'culture' | 'scene' | 'economy' | 'magicsystem' | 'reference',
        entityName: string,
        mapId: string
    ): Promise<void> {
        const entity = await this.findEntity(entityType, entityName);
        if (!entity || !entity.filePath) return;

        const file = this.app.vault.getAbstractFileByPath(entity.filePath);
        if (!(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const sections = parseSectionsFromMarkdown(content);
        const { parseFrontmatterFromContent } = await import('../yaml/EntitySections');
        const existingFrontmatter = parseFrontmatterFromContent(content) || {};

        // Remove mapId if it matches
        if (existingFrontmatter.mapId === mapId) {
            delete existingFrontmatter.mapId;
            delete existingFrontmatter.markerId;
        }

        // Remove from relatedMapIds
        if (Array.isArray(existingFrontmatter.relatedMapIds)) {
            const filtered = (existingFrontmatter.relatedMapIds as string[]).filter(id => id !== mapId);
            if (filtered.length === 0) {
                delete existingFrontmatter.relatedMapIds;
            } else {
                existingFrontmatter.relatedMapIds = filtered;
            }
        }

        // Build and save
        // Note: 'group' is not a standard entity type - groups are stored in settings
        const entityTypeForWhitelist = entityType === 'group' ? 'faction' : entityType;
        const whitelist = getWhitelistKeys(entityTypeForWhitelist as any);
        const finalFrontmatter = buildFrontmatter(entityTypeForWhitelist as any, existingFrontmatter, whitelist, {
            customFieldsMode: 'flatten',
            originalFrontmatter: existingFrontmatter
        });

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, existingFrontmatter, `${entityType}: ${entityName}`)
            : '';

        const mdContent = `---\n${frontmatterString}---\n\n` +
            Object.entries(sections)
                .map(([key, value]) => `## ${key}\n${value || ''}`)
                .join('\n\n') + '\n';

        await this.app.vault.modify(file, mdContent);
        this.app.metadataCache.trigger("dataview:refresh-views");
    }

    /**
     * Update map's linked entities list
     * Now supports all entity types uniformly
     */
    async updateMapLinkedEntities(map: Map, markers: MarkerDefinition[]): Promise<void> {
        if (!map.filePath) return;

        const file = this.app.vault.getAbstractFileByPath(map.filePath);
        if (!(file instanceof TFile)) return;

        // Extract entity names from markers - now tracking all entity types
        const linkedLocations: string[] = [];
        const linkedCharacters: string[] = [];
        const linkedEvents: string[] = [];
        const linkedItems: string[] = [];
        const linkedGroups: string[] = [];
        const linkedCultures: string[] = [];
        const linkedEconomies: string[] = [];
        const linkedMagicSystems: string[] = [];
        const linkedScenes: string[] = [];
        const linkedReferences: string[] = [];

        for (const marker of markers) {
            if (!marker.link) continue;
            const linkPath = marker.link.replace(/[\[\]]/g, '');
            const entityFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, map.filePath);
            if (!entityFile) continue;

            // Try to determine entity type from file path
            const folderPath = normalizePath(entityFile.path.substring(0, entityFile.path.lastIndexOf('/')));
            const entityFolder = this.plugin.getEntityFolder('location');
            if (folderPath === normalizePath(entityFolder)) {
                linkedLocations.push(linkPath);
            } else {
                // Update based on marker type - now handling all entity types
                switch (marker.type) {
                    case 'location':
                        linkedLocations.push(linkPath);
                        break;
                    case 'character':
                        linkedCharacters.push(linkPath);
                        break;
                    case 'event':
                        linkedEvents.push(linkPath);
                        break;
                    case 'item':
                        linkedItems.push(linkPath);
                        break;
                    case 'group':
                        linkedGroups.push(linkPath);
                        break;
                    case 'culture':
                        linkedCultures.push(linkPath);
                        break;
                    case 'economy':
                        linkedEconomies.push(linkPath);
                        break;
                    case 'magicsystem':
                        linkedMagicSystems.push(linkPath);
                        break;
                    case 'scene':
                        linkedScenes.push(linkPath);
                        break;
                    case 'reference':
                        linkedReferences.push(linkPath);
                        break;
                }
            }
        }

        // Read existing content
        const content = await this.app.vault.read(file);
        const sections = parseSectionsFromMarkdown(content);
        const { parseFrontmatterFromContent } = await import('../yaml/EntitySections');
        const existingFrontmatter = parseFrontmatterFromContent(content) || {};

        // Update linked entities - now including all entity types
        const updatedFrontmatter = {
            ...existingFrontmatter,
            linkedLocations: linkedLocations.length > 0 ? linkedLocations : undefined,
            linkedCharacters: linkedCharacters.length > 0 ? linkedCharacters : undefined,
            linkedEvents: linkedEvents.length > 0 ? linkedEvents : undefined,
            linkedItems: linkedItems.length > 0 ? linkedItems : undefined,
            linkedGroups: linkedGroups.length > 0 ? linkedGroups : undefined,
            linkedCultures: linkedCultures.length > 0 ? linkedCultures : undefined,
            linkedEconomies: linkedEconomies.length > 0 ? linkedEconomies : undefined,
            linkedMagicSystems: linkedMagicSystems.length > 0 ? linkedMagicSystems : undefined,
            linkedScenes: linkedScenes.length > 0 ? linkedScenes : undefined,
            linkedReferences: linkedReferences.length > 0 ? linkedReferences : undefined
        };

        // Build and save
        const whitelist = getWhitelistKeys('map');
        const finalFrontmatter = buildFrontmatter('map', updatedFrontmatter, whitelist, {
            customFieldsMode: 'flatten',
            originalFrontmatter: existingFrontmatter
        });

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, existingFrontmatter, `Map: ${map.name}`)
            : '';

        const mdContent = `---\n${frontmatterString}---\n\n` +
            Object.entries(sections)
                .map(([key, value]) => `## ${key}\n${value || ''}`)
                .join('\n\n') + '\n';

        await this.app.vault.modify(file, mdContent);
        this.app.metadataCache.trigger("dataview:refresh-views");
    }

    /**
     * Find an entity by name
     */
    /**
     * Find entity by type and name - supports all entity types uniformly
     */
    private async findEntity(
        entityType: 'character' | 'location' | 'event' | 'item' | 'group' | 'culture' | 'scene' | 'economy' | 'magicsystem' | 'reference',
        entityName: string
    ): Promise<any | null> {
        switch (entityType) {
            case 'character': {
                const chars = await this.plugin.listCharacters();
                return chars.find(c => c.name === entityName) || null;
            }
            case 'location': {
                const locs = await this.plugin.listLocations();
                return locs.find(l => l.name === entityName) || null;
            }
            case 'event': {
                const events = await this.plugin.listEvents();
                return events.find(e => e.name === entityName) || null;
            }
            case 'item': {
                const items = await this.plugin.listPlotItems();
                return items.find(i => i.name === entityName) || null;
            }
            case 'group': {
                const groups = this.plugin.getGroups(); // Use getGroups for consistency
                return groups.find(g => g.name === entityName) || null;
            }
            case 'culture': {
                const cultures = await this.plugin.listCultures();
                return cultures.find(c => c.name === entityName) || null;
            }
            case 'scene': {
                const scenes = await this.plugin.listScenes();
                return scenes.find(s => s.name === entityName) || null;
            }
            case 'economy': {
                const economies = await this.plugin.listEconomies();
                return economies.find(e => e.name === entityName) || null;
            }
            case 'magicsystem': {
                const magicSystems = await this.plugin.listMagicSystems();
                return magicSystems.find(m => m.name === entityName) || null;
            }
            case 'reference': {
                const references = await this.plugin.listReferences();
                return references.find(r => r.name === entityName) || null;
            }
            default:
                return null;
        }
    }

    /**
     * Add value to array, creating array if needed
     */
    private addToArray(arr: string[] | undefined, value: string): string[] {
        if (!arr) return [value];
        if (arr.includes(value)) return arr;
        return [...arr, value];
    }
}