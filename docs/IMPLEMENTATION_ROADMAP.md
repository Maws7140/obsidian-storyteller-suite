# Storyteller Suite - Implementation Roadmap

## Overview

This roadmap provides a detailed, step-by-step plan for implementing the advanced features designed for Storyteller Suite. Each phase includes specific tasks, file changes, and success criteria.

---

## Phase 1: Foundation & Infrastructure (Estimated: 2 weeks)

### Goals
- Add new entity type definitions
- Update folder resolver
- Create entity templates
- Extend settings interface

### Tasks

#### 1.1 Update Type Definitions (src/types.ts)

**Files to modify:** `src/types.ts`

**Add the following interfaces:**
```typescript
// Add to types.ts:
- Culture interface
- Economy interface (with Currency, Resource, TradeRoute sub-interfaces)
- Faction interface (with FactionMember, FactionRelationship sub-interfaces)
- MagicSystem interface (with MagicCategory, MagicAbility, ConsistencyRule sub-interfaces)
- Calendar interface (with CalendarMonth, CalendarHoliday, AstronomicalEvent, Season, CalendarDate sub-interfaces)
- TimelineFork interface (with AlteredEntity sub-interface)
- CausalityLink interface
- TimelineConflict interface (with ConflictEntity sub-interface)
- PacingAnalysis interface (with ChapterPacing, EventDensity, TensionPoint, PacingRecommendation sub-interfaces)
- WritingSession interface
- StoryAnalytics interface (with CharacterScreenTime, EventDistribution, DialogueAnalysis, POVStats, VelocityData, ForeshadowingPair sub-interfaces)
- LocationSensoryProfile interface (with AtmosphereProfile, SensoryDetails, MoodProfile, ColorPalette, SoundProfile, AmbientSound, TimeVariation, SeasonalVariation sub-interfaces)
```

**Success Criteria:**
- All new types compile without errors
- Types follow existing naming conventions
- TSDoc comments are added to all interfaces and fields

---

#### 1.2 Update Settings Interface

**Files to modify:** `src/main.ts`

**Find the `StorytellerSuiteSettings` interface and add:**
```typescript
interface StorytellerSuiteSettings {
    // ... existing settings ...

    // Timeline & Causality
    timelineForks?: TimelineFork[];
    causalityLinks?: CausalityLink[];
    timelineConflicts?: TimelineConflict[];
    enableAdvancedTimeline?: boolean;
    autoDetectConflicts?: boolean;

    // Analytics
    analyticsEnabled?: boolean;
    analyticsData?: StoryAnalytics;
    writingSessions?: WritingSession[];
    pacingAnalysis?: PacingAnalysis;
    trackWritingSessions?: boolean;

    // World-Building
    enableWorldBuilding?: boolean;
    cultureFolderPath?: string;
    economyFolderPath?: string;
    factionFolderPath?: string;
    magicSystemFolderPath?: string;
    calendarFolderPath?: string;
    activeCalendarId?: string; // For date conversions

    // Sensory Profiles
    enableSensoryProfiles?: boolean;
}
```

**Update default settings in `onload()`:**
```typescript
async loadSettings() {
    this.settings = Object.assign({}, {
        // ... existing defaults ...
        timelineForks: [],
        causalityLinks: [],
        timelineConflicts: [],
        enableAdvancedTimeline: false,
        autoDetectConflicts: true,
        analyticsEnabled: false,
        writingSessions: [],
        trackWritingSessions: false,
        enableWorldBuilding: true,
        enableSensoryProfiles: true,
    }, await this.loadData());
}
```

**Success Criteria:**
- Settings interface updated
- Default values set
- Settings persist across plugin reloads

---

#### 1.3 Extend Folder Resolver

**Files to modify:** `src/folders/FolderResolver.ts`

**Add methods for new entity types:**
```typescript
export class FolderResolver {
    // ... existing methods ...

    getCultureFolderPath(storyId: string): string {
        if (this.settings.enableCustomEntityFolders && this.settings.cultureFolderPath) {
            return this.resolvePath(this.settings.cultureFolderPath, storyId);
        }
        if (this.settings.enableOneStoryMode) {
            return `${this.settings.oneStoryModeBasePath || 'StorytellerSuite'}/Cultures`;
        }
        return `StorytellerSuite/Stories/${this.getStoryName(storyId)}/Cultures`;
    }

    getEconomyFolderPath(storyId: string): string { /* similar */ }
    getFactionFolderPath(storyId: string): string { /* similar */ }
    getMagicSystemFolderPath(storyId: string): string { /* similar */ }
    getCalendarFolderPath(storyId: string): string { /* similar */ }

    // Add to getAllEntityFolders():
    getAllEntityFolders(storyId: string): string[] {
        return [
            // ... existing folders ...
            this.getCultureFolderPath(storyId),
            this.getEconomyFolderPath(storyId),
            this.getFactionFolderPath(storyId),
            this.getMagicSystemFolderPath(storyId),
            this.getCalendarFolderPath(storyId),
        ];
    }
}
```

**Success Criteria:**
- New folder paths resolve correctly
- Paths work with all three folder modes (default, custom, one-story)
- Test with FolderResolver.test.ts

---

#### 1.4 Create Entity Templates

**Files to modify:** `src/utils/EntityTemplates.ts`

**Add template generators:**
```typescript
export function getTemplateSections(entityType: EntityType): string {
    switch (entityType) {
        // ... existing cases ...

        case 'culture':
            return `---
{{frontmatter}}
---

## Description
{{description}}

## Values
{{values}}

## Religion
{{religion}}

## Social Structure
{{socialStructure}}

## History
{{history}}

## Naming Conventions
{{namingConventions}}

## Customs
{{customs}}
`;

        case 'faction':
            return `---
{{frontmatter}}
---

## Description
{{description}}

## History
{{history}}

## Structure
{{structure}}

## Goals
{{goals}}

## Resources
{{resources}}

## Member Roster
{{members}}

## Faction Relationships
{{relationships}}
`;

        case 'economy':
            return `---
{{frontmatter}}
---

## Description
{{description}}

## Currencies
{{currencies}}

## Resources
{{resources}}

## Trade Routes
{{tradeRoutes}}

## Industries
{{industries}}

## Taxation
{{taxation}}
`;

        case 'magicSystem':
            return `---
{{frontmatter}}
---

## Description
{{description}}

## Rules
{{rules}}

## Source
{{source}}

## Costs
{{costs}}

## Limitations
{{limitations}}

## Training
{{training}}

## History
{{history}}

## Categories
{{categories}}

## Abilities
{{abilities}}
`;

        case 'calendar':
            return `---
{{frontmatter}}
---

## Description
{{description}}

## Months
{{months}}

## Holidays
{{holidays}}

## Astronomical Events
{{astronomicalEvents}}

## Seasons
{{seasons}}

## History
{{history}}
`;

        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }
}
```

**Update EntityType union:**
```typescript
export type EntityType =
    | 'character'
    | 'location'
    | 'event'
    | 'item'
    | 'reference'
    | 'chapter'
    | 'scene'
    | 'culture'
    | 'faction'
    | 'economy'
    | 'magicSystem'
    | 'calendar';
```

**Success Criteria:**
- Templates generate valid markdown
- All placeholders are supported
- Templates follow existing entity format

---

#### 1.5 Update Entity Sections Whitelist

**Files to modify:** `src/yaml/EntitySections.ts`

**Add whitelist keys:**
```typescript
export function getWhitelistKeys(entityType: EntityType): string[] {
    const baseKeys = ['id', 'name', 'filePath', 'profileImagePath', 'customFields', 'groups', 'connections'];

    switch (entityType) {
        // ... existing cases ...

        case 'culture':
            return [...baseKeys, 'languages', 'techLevel', 'governmentType', 'status',
                    'linkedLocations', 'linkedCharacters', 'linkedEvents', 'relatedCultures',
                    'parentCulture', 'population'];

        case 'faction':
            return [...baseKeys, 'factionType', 'strength', 'status', 'militaryPower',
                    'economicPower', 'politicalInfluence', 'colors', 'emblem', 'motto',
                    'members', 'territories', 'factionRelationships', 'linkedEvents',
                    'linkedCulture', 'parentFaction', 'subfactions'];

        case 'economy':
            return [...baseKeys, 'economicSystem', 'status', 'currencies', 'resources',
                    'tradeRoutes', 'linkedLocations', 'linkedFactions', 'linkedCultures',
                    'linkedEvents'];

        case 'magicSystem':
            return [...baseKeys, 'systemType', 'rarity', 'powerLevel', 'status', 'materials',
                    'categories', 'abilities', 'consistencyRules', 'linkedCharacters',
                    'linkedLocations', 'linkedCultures', 'linkedEvents', 'linkedItems'];

        case 'calendar':
            return [...baseKeys, 'calendarType', 'daysPerYear', 'daysPerWeek', 'weekdays',
                    'months', 'holidays', 'astronomicalEvents', 'seasons', 'currentDate',
                    'referenceDate', 'earthConversion', 'usage', 'linkedCultures',
                    'linkedLocations'];

        default:
            return baseKeys;
    }
}

export function getSectionKeys(entityType: EntityType): string[] {
    switch (entityType) {
        // ... existing cases ...

        case 'culture':
            return ['description', 'values', 'religion', 'socialStructure', 'history',
                    'namingConventions', 'customs'];

        case 'faction':
            return ['description', 'history', 'structure', 'goals', 'resources'];

        case 'economy':
            return ['description', 'industries', 'taxation'];

        case 'magicSystem':
            return ['description', 'rules', 'source', 'costs', 'limitations',
                    'training', 'history'];

        case 'calendar':
            return ['description', 'history'];

        default:
            return [];
    }
}
```

**Success Criteria:**
- Whitelists prevent field loss
- Section keys correctly separate frontmatter from markdown
- Test with EntitySections.test.ts

---

#### 1.6 Update Dashboard Entity Types

**Files to modify:** `src/modals/DashboardModal.ts`, `src/views/DashboardView.ts`

**Add new entity type filters:**
```typescript
// In DashboardModal or DashboardView, update entity type array:
const entityTypes = [
    'character',
    'location',
    'event',
    'item',
    'reference',
    'chapter',
    'scene',
    'culture',      // NEW
    'faction',      // NEW
    'economy',      // NEW
    'magicSystem',  // NEW
    'calendar'      // NEW
];

// Add icons for new types:
function getEntityIcon(entityType: EntityType): string {
    switch (entityType) {
        // ... existing cases ...
        case 'culture': return 'users';
        case 'faction': return 'shield';
        case 'economy': return 'coins';
        case 'magicSystem': return 'wand-sparkles';
        case 'calendar': return 'calendar';
        default: return 'file';
    }
}
```

**Success Criteria:**
- New entity types appear in dashboard filters
- Icons display correctly
- Clicking creates appropriate modal

---

### Phase 1 Deliverables

- ✅ All new types defined in types.ts
- ✅ Settings interface extended
- ✅ Folder resolver supports new entities
- ✅ Entity templates created
- ✅ Whitelist keys defined
- ✅ Dashboard recognizes new types
- ✅ All existing tests pass
- ✅ No TypeScript compilation errors

---

## Phase 2: World-Building Entities (Estimated: 3 weeks)

### Goals
- Implement CRUD operations for Culture, Faction, Economy, MagicSystem, Calendar
- Create modals for each entity type
- Add commands to command palette
- Create WorldBuildingView

---

### 2.1 Culture Entity Implementation

#### 2.1.1 Add CRUD Methods to main.ts

**Files to modify:** `src/main.ts`

```typescript
export default class StorytellerSuitePlugin extends Plugin {
    // ... existing methods ...

    /**
     * List all cultures for the active story
     */
    async listCultures(): Promise<Culture[]> {
        if (!this.settings.activeStoryId) return [];

        const folderPath = this.folderResolver.getCultureFolderPath(this.settings.activeStoryId);
        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(folderPath));

        const cultures: Culture[] = [];
        for (const file of files) {
            let culture = await this.parseFile<Culture>(file, { name: '' }, 'culture');
            culture = this.normalizeEntityCustomFields('culture', culture);
            cultures.push(culture);
        }

        return cultures.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Save a culture to disk
     */
    async saveCulture(culture: Culture): Promise<void> {
        if (!this.settings.activeStoryId) {
            new Notice('No active story selected');
            return;
        }

        const folderPath = this.folderResolver.getCultureFolderPath(this.settings.activeStoryId);
        await this.ensureFolderExists(folderPath);

        const fileName = `${culture.name.replace(/[\\:"*?<>|]+/g, '')}.md`;
        const filePath = `${folderPath}/${fileName}`;

        // Separate frontmatter and sections
        const { description, values, religion, socialStructure, history, namingConventions, customs, ...frontmatterFields } = culture;

        // Read existing file to preserve fields
        let originalFrontmatter = {};
        const existingFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
        if (existingFile) {
            const content = await this.app.vault.cachedRead(existingFile);
            originalFrontmatter = parseYaml(content);
        }

        // Build frontmatter
        const frontmatter = buildFrontmatter('culture', frontmatterFields, undefined, {
            customFieldsMode: this.settings.customFieldsMode || 'flatten',
            originalFrontmatter
        });

        // Serialize YAML
        const yaml = stringifyYamlWithLogging(frontmatter, originalFrontmatter);

        // Build markdown content
        const template = getTemplateSections('culture');
        const content = template
            .replace('{{frontmatter}}', yaml)
            .replace('{{description}}', description || '')
            .replace('{{values}}', values || '')
            .replace('{{religion}}', religion || '')
            .replace('{{socialStructure}}', socialStructure || '')
            .replace('{{history}}', history || '')
            .replace('{{namingConventions}}', namingConventions || '')
            .replace('{{customs}}', customs || '');

        // Write to vault
        if (existingFile) {
            await this.app.vault.modify(existingFile, content);
            new Notice(`Culture "${culture.name}" updated`);
        } else {
            await this.app.vault.create(filePath, content);
            new Notice(`Culture "${culture.name}" created`);
        }

        // Update filePath
        culture.filePath = filePath;
    }

    /**
     * Delete a culture
     */
    async deleteCulture(culture: Culture): Promise<void> {
        if (!culture.filePath) return;

        const file = this.app.vault.getAbstractFileByPath(culture.filePath);
        if (file) {
            await this.app.vault.delete(file);
            new Notice(`Culture "${culture.name}" deleted`);
        }
    }
}
```

**Success Criteria:**
- listCultures() returns all cultures from folder
- saveCulture() creates/updates markdown files correctly
- deleteCulture() removes files
- YAML frontmatter preserves empty fields
- Markdown sections are correctly formatted

---

#### 2.1.2 Create CultureModal

**Files to create:** `src/modals/CultureModal.ts`

```typescript
import { App, Modal, Setting, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Culture } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

export type CultureModalSubmitCallback = (culture: Culture) => Promise<void>;
export type CultureModalDeleteCallback = (culture: Culture) => Promise<void>;

export class CultureModal extends ResponsiveModal {
    culture: Culture;
    plugin: StorytellerSuitePlugin;
    onSubmit: CultureModalSubmitCallback;
    onDelete?: CultureModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        culture: Culture | null,
        onSubmit: CultureModalSubmitCallback,
        onDelete?: CultureModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.isNew = culture === null;

        this.culture = culture || {
            name: '',
            languages: [],
            techLevel: 'medieval',
            governmentType: 'monarchy',
            status: 'thriving',
            linkedLocations: [],
            linkedCharacters: [],
            linkedEvents: [],
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setupMobileAdaptations();

        contentEl.createEl('h2', { text: this.isNew ? 'Create Culture' : `Edit Culture: ${this.culture.name}` });

        // Name
        new Setting(contentEl)
            .setName('Name')
            .setDesc('Name of the culture or society')
            .addText(text => text
                .setValue(this.culture.name)
                .onChange(value => this.culture.name = value)
            );

        // Tech Level
        new Setting(contentEl)
            .setName('Technology Level')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'stone-age': 'Stone Age',
                    'bronze-age': 'Bronze Age',
                    'iron-age': 'Iron Age',
                    'medieval': 'Medieval',
                    'renaissance': 'Renaissance',
                    'industrial': 'Industrial',
                    'modern': 'Modern',
                    'futuristic': 'Futuristic',
                    'custom': 'Custom'
                })
                .setValue(this.culture.techLevel || 'medieval')
                .onChange(value => this.culture.techLevel = value)
            );

        // Government Type
        new Setting(contentEl)
            .setName('Government Type')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'monarchy': 'Monarchy',
                    'democracy': 'Democracy',
                    'republic': 'Republic',
                    'theocracy': 'Theocracy',
                    'tribal': 'Tribal',
                    'empire': 'Empire',
                    'feudal': 'Feudal',
                    'anarchy': 'Anarchy',
                    'custom': 'Custom'
                })
                .setValue(this.culture.governmentType || 'monarchy')
                .onChange(value => this.culture.governmentType = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'thriving': 'Thriving',
                    'stable': 'Stable',
                    'declining': 'Declining',
                    'extinct': 'Extinct',
                    'emerging': 'Emerging',
                    'custom': 'Custom'
                })
                .setValue(this.culture.status || 'thriving')
                .onChange(value => this.culture.status = value)
            );

        // Languages (comma-separated)
        new Setting(contentEl)
            .setName('Languages')
            .setDesc('Comma-separated list of languages (e.g., Common, Elvish)')
            .addText(text => text
                .setValue(this.culture.languages?.join(', ') || '')
                .onChange(value => {
                    this.culture.languages = value.split(',').map(s => s.trim()).filter(s => s);
                })
            );

        // Population
        new Setting(contentEl)
            .setName('Population')
            .setDesc('Estimated population size')
            .addText(text => text
                .setValue(this.culture.population || '')
                .onChange(value => this.culture.population = value)
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Overview of the culture')
            .addTextArea(text => {
                text.setValue(this.culture.description || '')
                    .onChange(value => this.culture.description = value);
                text.inputEl.rows = 4;
            });

        // Values
        new Setting(contentEl)
            .setName('Values & Beliefs')
            .setDesc('Core cultural values and worldview')
            .addTextArea(text => {
                text.setValue(this.culture.values || '')
                    .onChange(value => this.culture.values = value);
                text.inputEl.rows = 4;
            });

        // Religion
        new Setting(contentEl)
            .setName('Religion')
            .setDesc('Religious beliefs and practices')
            .addTextArea(text => {
                text.setValue(this.culture.religion || '')
                    .onChange(value => this.culture.religion = value);
                text.inputEl.rows = 4;
            });

        // Social Structure
        new Setting(contentEl)
            .setName('Social Structure')
            .setDesc('Class hierarchy and social organization')
            .addTextArea(text => {
                text.setValue(this.culture.socialStructure || '')
                    .onChange(value => this.culture.socialStructure = value);
                text.inputEl.rows = 4;
            });

        // History
        new Setting(contentEl)
            .setName('History')
            .setDesc('Origins and cultural evolution')
            .addTextArea(text => {
                text.setValue(this.culture.history || '')
                    .onChange(value => this.culture.history = value);
                text.inputEl.rows = 4;
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.culture.name) {
                    new Notice('Culture name is required');
                    return;
                }
                await this.onSubmit(this.culture);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete')
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.culture);
                        this.close();
                    }
                })
            );
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
```

**Success Criteria:**
- Modal opens and displays correctly
- All fields can be edited
- Save button creates/updates culture
- Delete button removes culture
- Modal is responsive on mobile

---

#### 2.1.3 Add Culture Commands

**Files to modify:** `src/main.ts` (registerCommands method)

```typescript
private registerCommands() {
    // ... existing commands ...

    // Create Culture
    this.addCommand({
        id: 'create-new-culture',
        name: 'Create new culture',
        callback: () => {
            if (!this.ensureActiveStoryOrGuide()) return;
            new CultureModal(this.app, this, null, async (culture) => {
                await this.saveCulture(culture);
            }).open();
        }
    });

    // View Cultures
    this.addCommand({
        id: 'view-cultures',
        name: 'View cultures',
        callback: async () => {
            if (!this.ensureActiveStoryOrGuide()) return;
            const cultures = await this.listCultures();
            // For now, open dashboard filtered to cultures
            // Later: create CultureListModal
            new Notice(`${cultures.length} cultures found`);
        }
    });
}
```

**Success Criteria:**
- Commands appear in command palette
- Commands create/view cultures correctly
- Commands respect active story context

---

### 2.2 Implement Remaining World-Building Entities

**Repeat steps 2.1.1-2.1.3 for:**
- Faction (FactionModal.ts, save/list/deleteFaction methods, commands)
- Economy (EconomyModal.ts, save/list/deleteEconomy methods, commands)
- MagicSystem (MagicSystemModal.ts, save/list/deleteMagicSystem methods, commands)
- Calendar (CalendarModal.ts, save/list/deleteCalendar methods, commands)

**Note:** These will be very similar to Culture implementation, with entity-specific fields.

---

### 2.3 Create WorldBuildingView

**Files to create:** `src/views/WorldBuildingView.ts`

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type StorytellerSuitePlugin from '../main';

export const VIEW_TYPE_WORLD_BUILDING = 'storyteller-world-building-view';

export class WorldBuildingView extends ItemView {
    plugin: StorytellerSuitePlugin;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_WORLD_BUILDING;
    }

    getDisplayText(): string {
        return 'World Building';
    }

    getIcon(): string {
        return 'globe';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('storyteller-world-building-view');

        // Toolbar
        const toolbar = container.createDiv('storyteller-wb-toolbar');
        toolbar.createEl('h2', { text: 'World Building' });

        // Tab navigation
        const tabNav = container.createDiv('storyteller-wb-tabs');
        const tabs = ['Cultures', 'Factions', 'Economies', 'Magic Systems', 'Calendars'];

        let activeTab = 'Cultures';

        tabs.forEach(tab => {
            const tabEl = tabNav.createDiv('storyteller-wb-tab');
            tabEl.textContent = tab;
            if (tab === activeTab) tabEl.addClass('active');

            tabEl.onclick = () => {
                tabNav.querySelectorAll('.storyteller-wb-tab').forEach(t => t.removeClass('active'));
                tabEl.addClass('active');
                activeTab = tab;
                this.renderTabContent(contentArea, tab);
            };
        });

        // Content area
        const contentArea = container.createDiv('storyteller-wb-content');

        // Render initial tab
        await this.renderTabContent(contentArea, activeTab);
    }

    async renderTabContent(contentArea: HTMLElement, tab: string): Promise<void> {
        contentArea.empty();

        switch (tab) {
            case 'Cultures':
                await this.renderCultures(contentArea);
                break;
            case 'Factions':
                await this.renderFactions(contentArea);
                break;
            case 'Economies':
                await this.renderEconomies(contentArea);
                break;
            case 'Magic Systems':
                await this.renderMagicSystems(contentArea);
                break;
            case 'Calendars':
                await this.renderCalendars(contentArea);
                break;
        }
    }

    async renderCultures(contentArea: HTMLElement): Promise<void> {
        const cultures = await this.plugin.listCultures();

        const header = contentArea.createDiv('storyteller-wb-header');
        header.createEl('h3', { text: 'Cultures' });

        const createBtn = header.createEl('button', { text: '+ New Culture' });
        createBtn.onclick = () => {
            new CultureModal(this.app, this.plugin, null, async (culture) => {
                await this.plugin.saveCulture(culture);
                await this.renderCultures(contentArea);
            }).open();
        };

        if (cultures.length === 0) {
            contentArea.createEl('p', { text: 'No cultures yet. Create your first culture!' });
            return;
        }

        const grid = contentArea.createDiv('storyteller-wb-grid');
        cultures.forEach(culture => {
            const card = grid.createDiv('storyteller-wb-card');

            if (culture.profileImagePath) {
                const img = card.createEl('img');
                img.src = this.app.vault.adapter.getResourcePath(culture.profileImagePath);
            }

            card.createEl('h4', { text: culture.name });
            card.createEl('p', { text: culture.description?.substring(0, 100) || 'No description' });

            const meta = card.createDiv('storyteller-wb-card-meta');
            meta.createEl('span', { text: `Tech: ${culture.techLevel || 'Unknown'}` });
            meta.createEl('span', { text: `Gov: ${culture.governmentType || 'Unknown'}` });

            card.onclick = () => {
                new CultureModal(this.app, this.plugin, culture,
                    async (updated) => {
                        await this.plugin.saveCulture(updated);
                        await this.renderCultures(contentArea);
                    },
                    async (deleted) => {
                        await this.plugin.deleteCulture(deleted);
                        await this.renderCultures(contentArea);
                    }
                ).open();
            };
        });
    }

    async renderFactions(contentArea: HTMLElement): Promise<void> {
        // Similar to renderCultures
    }

    async renderEconomies(contentArea: HTMLElement): Promise<void> {
        // Similar to renderCultures
    }

    async renderMagicSystems(contentArea: HTMLElement): Promise<void> {
        // Similar to renderCultures
    }

    async renderCalendars(contentArea: HTMLElement): Promise<void> {
        // Similar to renderCultures
    }

    async onClose(): Promise<void> {
        // Cleanup
    }
}
```

**Register view in main.ts:**
```typescript
async onload() {
    // ... existing code ...

    this.registerView(
        VIEW_TYPE_WORLD_BUILDING,
        (leaf) => new WorldBuildingView(leaf, this)
    );

    // Add command to open view
    this.addCommand({
        id: 'open-world-building-view',
        name: 'Open World Building',
        callback: () => this.activateWorldBuildingView()
    });
}

async activateWorldBuildingView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_WORLD_BUILDING)[0];
    if (!leaf) {
        leaf = workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE_WORLD_BUILDING, active: true });
    }

    workspace.revealLeaf(leaf);
}
```

**Success Criteria:**
- View opens in right panel
- Tabs switch between entity types
- Cards display entity data correctly
- Clicking card opens edit modal
- Create button opens create modal
- View updates after save/delete

---

### Phase 2 Deliverables

- ✅ All world-building entities implemented (Culture, Faction, Economy, MagicSystem, Calendar)
- ✅ Modals for all entity types
- ✅ CRUD operations working
- ✅ Commands registered
- ✅ WorldBuildingView functional
- ✅ Markdown files generated correctly
- ✅ All tests pass

---

## Phase 3: Advanced Timeline & Causality (Estimated: 3 weeks)

### Goals
- Implement timeline fork system
- Add causality link tracking
- Build conflict detection engine
- Create character age tracker
- Enhance timeline view with new features

---

### 3.1 Timeline Fork System

#### 3.1.1 Fork Management Methods

**Files to modify:** `src/main.ts`

```typescript
/**
 * Create a timeline fork
 */
createTimelineFork(name: string, divergenceEvent: string, divergenceDate: string, description: string): TimelineFork {
    const fork: TimelineFork = {
        id: Date.now().toString(),
        name,
        parentTimelineId: undefined, // Main timeline
        divergenceEvent,
        divergenceDate,
        description,
        status: 'exploring',
        forkEvents: [],
        alteredCharacters: [],
        alteredLocations: [],
        color: this.generateRandomColor(),
        created: new Date().toISOString(),
        notes: ''
    };

    this.settings.timelineForks = this.settings.timelineForks || [];
    this.settings.timelineForks.push(fork);
    this.saveSettings();

    return fork;
}

/**
 * Get all timeline forks
 */
getTimelineForks(): TimelineFork[] {
    return this.settings.timelineForks || [];
}

/**
 * Update timeline fork
 */
async updateTimelineFork(fork: TimelineFork): Promise<void> {
    const index = this.settings.timelineForks?.findIndex(f => f.id === fork.id);
    if (index !== undefined && index >= 0) {
        this.settings.timelineForks[index] = fork;
        await this.saveSettings();
    }
}

/**
 * Delete timeline fork
 */
async deleteTimelineFork(forkId: string): Promise<void> {
    this.settings.timelineForks = this.settings.timelineForks?.filter(f => f.id !== forkId);
    await this.saveSettings();
}

generateRandomColor(): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[Math.floor(Math.random() * colors.length)];
}
```

---

### 3.2 Causality Link System

**Files to modify:** `src/main.ts`

```typescript
/**
 * Create causality link between events
 */
createCausalityLink(causeEvent: string, effectEvent: string, linkType: string, description: string): CausalityLink {
    const link: CausalityLink = {
        id: `${causeEvent}-${effectEvent}-${Date.now()}`,
        causeEvent,
        effectEvent,
        linkType,
        strength: 'strong',
        description
    };

    this.settings.causalityLinks = this.settings.causalityLinks || [];
    this.settings.causalityLinks.push(link);
    this.saveSettings();

    return link;
}

/**
 * Get causality links for an event
 */
getCausalityLinksForEvent(eventId: string): { causes: CausalityLink[], effects: CausalityLink[] } {
    const links = this.settings.causalityLinks || [];

    return {
        causes: links.filter(l => l.effectEvent === eventId),
        effects: links.filter(l => l.causeEvent === eventId)
    };
}

/**
 * Delete causality link
 */
async deleteCausalityLink(linkId: string): Promise<void> {
    this.settings.causalityLinks = this.settings.causalityLinks?.filter(l => l.id !== linkId);
    await this.saveSettings();
}
```

---

### 3.3 Conflict Detection Engine

**Files to create:** `src/utils/ConflictDetection.ts`

```typescript
import type { Event, Character, Location, TimelineConflict } from '../types';
import { parseEventDate } from './DateParsing';

export class ConflictDetector {

    /**
     * Detect all timeline conflicts
     */
    static detectConflicts(
        events: Event[],
        characters: Character[],
        locations: Location[]
    ): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Detect character at multiple places simultaneously
        conflicts.push(...this.detectLocationConflicts(events, characters));

        // Detect dead characters appearing alive
        conflicts.push(...this.detectDeathConflicts(events, characters));

        // Detect age inconsistencies
        conflicts.push(...this.detectAgeConflicts(events, characters));

        // Detect causality violations (effect before cause)
        conflicts.push(...this.detectCausalityConflicts(events));

        return conflicts;
    }

    /**
     * Detect characters appearing in multiple locations at the same time
     */
    static detectLocationConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Group events by date
        const eventsByDate = new Map<string, Event[]>();
        events.forEach(event => {
            if (event.dateTime) {
                const date = event.dateTime;
                if (!eventsByDate.has(date)) {
                    eventsByDate.set(date, []);
                }
                eventsByDate.get(date)!.push(event);
            }
        });

        // Check each date for conflicts
        eventsByDate.forEach((dayEvents, date) => {
            const characterLocations = new Map<string, Set<string>>();

            dayEvents.forEach(event => {
                if (event.location && event.characters) {
                    event.characters.forEach(charName => {
                        if (!characterLocations.has(charName)) {
                            characterLocations.set(charName, new Set());
                        }
                        characterLocations.get(charName)!.add(event.location!);
                    });
                }
            });

            // Find characters at multiple locations
            characterLocations.forEach((locations, charName) => {
                if (locations.size > 1) {
                    conflicts.push({
                        id: `location-conflict-${charName}-${date}`,
                        type: 'location',
                        severity: 'critical',
                        entities: [
                            {
                                entityId: charName,
                                entityType: 'character',
                                entityName: charName,
                                conflictField: 'location',
                                conflictValue: Array.from(locations).join(', ')
                            }
                        ],
                        events: dayEvents.filter(e => e.characters?.includes(charName)).map(e => e.id || e.name),
                        description: `Character "${charName}" appears at multiple locations on ${date}: ${Array.from(locations).join(', ')}`,
                        suggestion: `Review events on ${date} and ensure ${charName} is only in one location, or add travel time between events.`,
                        dismissed: false,
                        detected: new Date().toISOString()
                    });
                }
            });
        });

        return conflicts;
    }

    /**
     * Detect characters appearing alive after death
     */
    static detectDeathConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Find characters marked as deceased
        const deceasedCharacters = characters.filter(c => c.status?.toLowerCase() === 'deceased');

        deceasedCharacters.forEach(character => {
            // Find events where they died
            const deathEvents = events.filter(e =>
                e.characters?.includes(character.name) &&
                (e.name.toLowerCase().includes('death') || e.description?.toLowerCase().includes('dies'))
            );

            if (deathEvents.length > 0) {
                const deathEvent = deathEvents[0]; // First death event
                const deathDate = parseEventDate(deathEvent.dateTime || '');

                // Find events after death where character appears
                const postDeathEvents = events.filter(e => {
                    if (!e.characters?.includes(character.name)) return false;
                    if (!e.dateTime || !deathEvent.dateTime) return false;

                    const eventDate = parseEventDate(e.dateTime);
                    return eventDate.millis > deathDate.millis;
                });

                if (postDeathEvents.length > 0) {
                    conflicts.push({
                        id: `death-conflict-${character.name}`,
                        type: 'death',
                        severity: 'critical',
                        entities: [
                            {
                                entityId: character.id || character.name,
                                entityType: 'character',
                                entityName: character.name,
                                conflictField: 'status',
                                conflictValue: 'deceased'
                            }
                        ],
                        events: [deathEvent.id || deathEvent.name, ...postDeathEvents.map(e => e.id || e.name)],
                        description: `Character "${character.name}" appears alive after death event "${deathEvent.name}"`,
                        suggestion: `Review events after ${deathEvent.dateTime} and remove ${character.name} or change their status.`,
                        dismissed: false,
                        detected: new Date().toISOString()
                    });
                }
            }
        });

        return conflicts;
    }

    /**
     * Detect age inconsistencies
     */
    static detectAgeConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // This requires birthdate information in customFields or as a field
        // For now, return empty array (to be implemented with Calendar integration)

        return conflicts;
    }

    /**
     * Detect causality violations (effect before cause)
     */
    static detectCausalityConflicts(events: Event[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Check event dependencies
        events.forEach(event => {
            if (event.dependencies && event.dependencies.length > 0) {
                const eventDate = parseEventDate(event.dateTime || '');

                event.dependencies.forEach(depName => {
                    const depEvent = events.find(e => e.name === depName || e.id === depName);
                    if (depEvent && depEvent.dateTime) {
                        const depDate = parseEventDate(depEvent.dateTime);

                        // Effect should come after cause
                        if (eventDate.millis < depDate.millis) {
                            conflicts.push({
                                id: `causality-conflict-${event.id || event.name}-${depEvent.id || depEvent.name}`,
                                type: 'causality',
                                severity: 'critical',
                                entities: [],
                                events: [event.id || event.name, depEvent.id || depEvent.name],
                                description: `Event "${event.name}" (${event.dateTime}) depends on "${depEvent.name}" (${depEvent.dateTime}), but occurs before it`,
                                suggestion: `Adjust the dates so "${depEvent.name}" occurs before "${event.name}", or remove the dependency.`,
                                dismissed: false,
                                detected: new Date().toISOString()
                            });
                        }
                    }
                });
            }
        });

        return conflicts;
    }
}
```

**Add conflict detection command:**
```typescript
// In main.ts registerCommands():
this.addCommand({
    id: 'detect-timeline-conflicts',
    name: 'Detect timeline conflicts',
    callback: async () => {
        const events = await this.listEvents();
        const characters = await this.listCharacters();
        const locations = await this.listLocations();

        const conflicts = ConflictDetector.detectConflicts(events, characters, locations);

        this.settings.timelineConflicts = conflicts;
        await this.saveSettings();

        new Notice(`Found ${conflicts.length} timeline conflicts`);

        // Open conflicts modal
        new ConflictListModal(this.app, this, conflicts).open();
    }
});
```

---

### 3.4 Enhanced Timeline View

**Files to modify:** `src/views/TimelineView.ts`

Add features:
- Fork selector dropdown
- Conflict warnings badge
- Causality arrows between events
- "Create Fork" button
- "Add Causality Link" button

```typescript
async buildToolbar() {
    const toolbar = this.toolbarEl;
    toolbar.empty();

    // Existing toolbar buttons...

    // Fork selector
    const forkSelector = toolbar.createEl('select');
    forkSelector.createEl('option', { text: 'Main Timeline', value: 'main' });

    const forks = this.plugin.getTimelineForks();
    forks.forEach(fork => {
        forkSelector.createEl('option', { text: fork.name, value: fork.id });
    });

    forkSelector.onchange = () => {
        this.currentFork = forkSelector.value;
        this.buildContent();
    };

    // Conflicts badge
    const conflicts = this.plugin.settings.timelineConflicts || [];
    if (conflicts.length > 0) {
        const conflictBadge = toolbar.createEl('button', {
            cls: 'storyteller-conflict-badge',
            text: `⚠️ ${conflicts.length} Conflicts`
        });
        conflictBadge.onclick = () => {
            new ConflictListModal(this.app, this.plugin, conflicts).open();
        };
    }

    // Create Fork button
    const createForkBtn = toolbar.createEl('button', { text: '🔀 Create Fork' });
    createForkBtn.onclick = () => {
        new TimelineForkModal(this.app, this.plugin).open();
    };
}
```

---

### Phase 3 Deliverables

- ✅ Timeline fork system functional
- ✅ Causality links trackable
- ✅ Conflict detection engine working
- ✅ Enhanced timeline view with forks and conflicts
- ✅ Modals for fork creation and conflict viewing
- ✅ Commands for conflict detection
- ✅ All tests pass

---

## Phase 4: Writing Analytics Dashboard (Estimated: 2 weeks)

*Implementation details for analytics collection, session tracking, screen time calculator, dialogue analyzer, foreshadowing tracker, and AnalyticsDashboardView*

*(Similar detailed breakdown as above)*

---

## Phase 5: Sensory World Builder (Estimated: 2 weeks)

*Implementation details for sensory profile system, color palette picker, time/seasonal variations, and sensory overlays*

*(Similar detailed breakdown as above)*

---

## Phase 6: Integration, Testing & Documentation (Estimated: 2 weeks)

### Goals
- Integrate all features
- Write comprehensive tests
- Create user documentation
- Polish UI/UX
- Performance optimization

---

## Summary Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Foundation | 2 weeks | 🔵 Not Started |
| Phase 2: World-Building | 3 weeks | 🔵 Not Started |
| Phase 3: Advanced Timeline | 3 weeks | 🔵 Not Started |
| Phase 4: Analytics Dashboard | 2 weeks | 🔵 Not Started |
| Phase 5: Sensory World Builder | 2 weeks | 🔵 Not Started |
| Phase 6: Integration & Polish | 2 weeks | 🔵 Not Started |
| **Total** | **14 weeks** | **🔵 Not Started** |

---

## Next Steps

1. **Review and approve this roadmap**
2. **Set up development environment**
3. **Begin Phase 1: Foundation**
4. **Establish testing framework**
5. **Create GitHub milestones for each phase**

---

**Roadmap Version: 1.0**
**Last Updated: 2025-11-07**
**Status: Ready for Implementation**
