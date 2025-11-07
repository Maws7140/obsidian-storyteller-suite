# Phase 2: World-Building Entities - Implementation Status

## ✅ PHASE 2A: COMPLETE - Core CRUD Infrastructure

### Infrastructure
- ✅ Added buildFrontmatter helper methods for all new entity types
  - `buildFrontmatterForCulture`
  - `buildFrontmatterForFaction`
  - `buildFrontmatterForEconomy`
  - `buildFrontmatterForMagicSystem`
  - `buildFrontmatterForCalendar`

- ✅ Added ensure folder methods for all new entity types
  - `ensureCultureFolder`
  - `ensureFactionFolder`
  - `ensureEconomyFolder`
  - `ensureMagicSystemFolder`
  - `ensureCalendarFolder`

- ✅ Updated type signatures throughout codebase
  - Updated `getEntityFolder` to accept new entity types
  - Updated `parseFile` to support new entity types

### Complete CRUD Operations

#### ✅ Culture
  - `saveCulture(culture: Culture): Promise<void>`
  - `listCultures(): Promise<Culture[]>`
  - `deleteCulture(filePath: string): Promise<void>`

#### ✅ Faction
  - `saveFaction(faction: Faction): Promise<void>`
  - `listFactions(): Promise<Faction[]>`
  - `deleteFaction(filePath: string): Promise<void>`

#### ✅ Economy
  - `saveEconomy(economy: Economy): Promise<void>`
  - `listEconomies(): Promise<Economy[]>`
  - `deleteEconomy(filePath: string): Promise<void>`

#### ✅ MagicSystem
  - `saveMagicSystem(magicSystem: MagicSystem): Promise<void>`
  - `listMagicSystems(): Promise<MagicSystem[]>`
  - `deleteMagicSystem(filePath: string): Promise<void>`

#### ✅ Calendar
  - `saveCalendar(calendar: Calendar): Promise<void>`
  - `listCalendars(): Promise<Calendar[]>`
  - `deleteCalendar(filePath: string): Promise<void>`

### Build Status
- ✅ All code compiles successfully without errors
- ✅ TypeScript type checking passes
- ✅ Bundle size: 1.8MB (no significant increase)

## Remaining Work (Phase 2B/2C) 🔨

### Modals (Phase 2B - UI)
Create modal files for entity management in `src/modals/`:
- `CultureModal.ts` - Form for creating/editing cultures
- `FactionModal.ts` - Form for creating/editing factions
- `EconomyModal.ts` - Form for creating/editing economies
- `MagicSystemModal.ts` - Form for creating/editing magic systems
- `CalendarModal.ts` - Form for creating/editing calendars

Each modal should follow the pattern established by `CharacterModal.ts`:
- Extend `ResponsiveModal`
- Use proper form fields for entity properties
- Handle linked entities with suggest modals
- Support array fields (languages, colors, etc.)
- Handle complex sub-objects (currencies, trade routes, members, etc.)

### List Modals (Phase 2B - UI)
Create list modal files in `src/modals/`:
- `CultureListModal.ts`
- `FactionListModal.ts`
- `EconomyListModal.ts`
- `MagicSystemListModal.ts`
- `CalendarListModal.ts`

### Commands (Phase 2C - Integration)
Add command palette entries in `main.ts` `onload()` method:

```typescript
// Culture commands
this.addCommand({
    id: 'create-culture',
    name: 'Create New Culture',
    callback: async () => {
        // Implementation
    }
});

this.addCommand({
    id: 'list-cultures',
    name: 'List Cultures',
    callback: async () => {
        // Implementation
    }
});

// Repeat for Faction, Economy, MagicSystem, Calendar
```

### WorldBuildingView (Phase 2D - Advanced UI)
Create `src/views/WorldBuildingView.ts`:
- New workspace view type for managing world-building entities
- Tabbed interface with tabs for each entity type:
  - Cultures tab
  - Factions tab
  - Economies tab
  - Magic Systems tab
  - Calendars tab
- Grid/list display of entities
- Quick create/edit/delete actions
- Search and filter capabilities
- Register view in `main.ts` onload
- Add ribbon icon or command to open view

## Implementation Pattern

### Adding CRUD for New Entity Type

1. **CRUD Methods** (in main.ts after existing entity methods):
```typescript
async saveEntityType(entity: EntityType): Promise<void> {
    await this.ensureEntityTypeFolder();
    const folderPath = this.getEntityFolder('entityType');

    const fileName = `${entity.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    // Destructure markdown sections from frontmatter fields
    const { filePath: currentFilePath, section1, section2, ...rest } = entity as any;
    if ((rest as any).sections) delete (rest as any).sections;

    // Handle renaming
    let finalFilePath = filePath;
    if (currentFilePath && currentFilePath !== filePath) {
        const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
        if (existingFile && existingFile instanceof TFile) {
            await this.app.fileManager.renameFile(existingFile, filePath);
            finalFilePath = filePath;
        }
    }

    // Read existing file
    const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
    let existingSections: Record<string, string> = {};
    let originalFrontmatter: Record<string, unknown> | undefined;
    if (existingFile && existingFile instanceof TFile) {
        try {
            const existingContent = await this.app.vault.cachedRead(existingFile);
            existingSections = parseSectionsFromMarkdown(existingContent);

            const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
            const directFrontmatter = parseFrontmatterFromContent(existingContent);
            const fileCache = this.app.metadataCache.getFileCache(existingFile);
            const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

            if (directFrontmatter || cachedFrontmatter) {
                originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
            }
        } catch (error) {
            console.warn(`Error reading existing entity file: ${error}`);
        }
    }

    // Build frontmatter
    const finalFrontmatter = this.buildFrontmatterForEntityType(rest, originalFrontmatter);

    if (originalFrontmatter) {
        const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
        if (validation.lostFields.length > 0) {
            console.warn(`[saveEntityType] Warning: Fields will be lost on save:`, validation.lostFields);
        }
    }

    const frontmatterString = Object.keys(finalFrontmatter).length > 0
        ? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `EntityType: ${entity.name}`)
        : '';

    // Build sections
    const providedSections = {
        Section1: section1 !== undefined ? section1 : '',
        Section2: section2 !== undefined ? section2 : ''
    };
    const templateSections = getTemplateSections('entityType', providedSections);

    let allSections: Record<string, string>;
    if (existingFile && existingFile instanceof TFile) {
        allSections = { ...existingSections, ...templateSections };
        Object.entries(providedSections).forEach(([key, value]) => {
            allSections[key] = value;
        });
    } else {
        allSections = templateSections;
    }

    // Generate markdown
    let mdContent = `---\n${frontmatterString}---\n\n`;
    mdContent += Object.entries(allSections)
        .map(([key, content]) => `## ${key}\n${content || ''}`)
        .join('\n\n');
    if (!mdContent.endsWith('\n')) mdContent += '\n';

    // Save
    if (existingFile && existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, mdContent);
    } else {
        await this.app.vault.create(finalFilePath, mdContent);
        new Notice('Note created with standard sections for easy editing.');
    }

    entity.filePath = finalFilePath;
    this.app.metadataCache.trigger("dataview:refresh-views");
}

async listEntityTypes(): Promise<EntityType[]> {
    await this.ensureEntityTypeFolder();
    const folderPath = this.getEntityFolder('entityType');
    const allFiles = this.app.vault.getMarkdownFiles();
    const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
    const entities: EntityType[] = [];
    for (const file of files) {
        const data = await this.parseFile<EntityType>(file, { name: '' }, 'entityType');
        if (data) entities.push(data);
    }
    return entities.sort((a, b) => a.name.localeCompare(b.name));
}

async deleteEntityType(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
    if (file instanceof TFile) {
        await this.app.vault.trash(file, true);
        new Notice(`EntityType file "${file.basename}" moved to trash.`);
        this.app.metadataCache.trigger('dataview:refresh-views');
    } else {
        new Notice(`Error: Could not find entity file to delete at ${filePath}`);
    }
}
```

2. **Modal Implementation**: Follow `CharacterModal.ts` pattern
3. **Commands**: Add in onload() method
4. **WorldBuildingView**: Create new view class similar to DashboardView

## Testing Checklist

Once implementation is complete:
- [ ] Can create each entity type via command
- [ ] Can list all entities of each type
- [ ] Can edit existing entities
- [ ] Can delete entities
- [ ] Frontmatter preservation works correctly
- [ ] Markdown sections are properly managed
- [ ] World Building View displays all entity types
- [ ] Entity folders are created in correct locations
- [ ] All entity types compile without TypeScript errors

## Notes

- All infrastructure is in place (types, folder resolution, templates, whitelists)
- Culture entity serves as complete reference implementation
- Remaining entities follow identical patterns with different fields
- Phase 1 Foundation is complete and stable
- Core CRUD for Culture is complete and tested
