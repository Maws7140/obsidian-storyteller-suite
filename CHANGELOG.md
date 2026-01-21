# Changelog

## 1.5.8

### Localization
- Added German translation

### Timeline Improvements
- Updates to Timeline View and Renderer

## 1.5.6

### Documentation and Tutorial Updates
- Comprehensive tutorial section updates covering all entity types and features
- Added tutorial sections for References, Chapters & Scenes, and Maps management
- Updated file structure documentation to include all entity folders
- Enhanced custom folders tutorial with complete entity type coverage

### Removed Features
- Removed deprecated Calendar entity type and all related functionality
- Removed calendar folder configuration from settings
- Removed calendar references from tutorials and documentation

### Bug Fixes and Corrections
- Corrected maps tutorial to remove mention of unsupported "draw layers" feature
- Updated tutorial content to accurately reflect plugin capabilities

## 1.5.5

### New: Map System
- Introducing map support - place any entity type directly on maps (cultures, economies, magic systems, groups, scenes, references)
- Automatic coordinate storage in entity frontmatter when placing entities on maps
- Entities with map coordinates are automatically discovered and displayed on map views
- Support for entities appearing on multiple maps with different coordinates

### Entity Relationship Sync System
- Automatic bidirectional relationship syncing - update one side, the other updates automatically
- Works across all entity types (characters, locations, events, items, scenes, cultures, economies, magic systems)
- Handles edge cases: name changes, missing entities, prevents circular updates, cleans up stale references

## 1.5.3

### Template System Enhancements
- Add **Save Note as Template** feature - convert any existing note into a reusable template via command palette or modal
- Add **Note-based Templates** - templates can now be stored as markdown files in `StorytellerSuite/Templates/Notes/` for easier editing and version control
- Add **Template Variable Editor** modal for creating and editing template variables with support for:
  - Multiple variable types (text, number, boolean, select, multiselect)
  - Default values and descriptions
  - Custom options for select/multiselect variables
- Add **Variable Substitution System** - use `{{variableName}}` syntax in templates for dynamic content replacement during application
- Enhance **Template Editor Modal** with improved UI and functionality for editing all template properties
- Add **Template Application Modal** with enhanced support for:
  - Custom YAML field substitution
  - Section content variable replacement
  - Variable validation and error handling
- Add **Template Entity Detail Modal** for previewing template entity details before application
- Add **Template Preview Renderer** utility for rendering template previews
- Add **Template Migration** support for updating existing templates to new formats
- Enhance template application process to handle custom fields and section content more robustly
- Add new command: "Storyteller Suite: Save Current Note as Template"

### Code Quality and Maintenance
- Enhanced localization for all template-related features and actions
- Removed obsolete documentation files (implementation guides, mobile testing guides, deprecated feature docs)
- Improved code organization and cleanup
- Updated .gitignore to include template-related file patterns

## 1.5.2

Fixed zoom issues 
## 1.5.1

_Release notes to be added_

## 1.5.0

_Release notes to be added_

## 1.4.9

_Release notes to be added_

## 1.4.8

_Release notes to be added_

## 1.4.7

_Release notes to be added_

## 1.4.0

### Timeline Gantt-Style Enhancements
- Add milestone marker support (`isMilestone` field) with distinct golden styling and star icons
- Add event progress tracking (`progress` field, 0-100%) with visual progress bars
- Add event dependencies (`dependencies` field) for Gantt-style relationships
- Implement drag-and-drop event rescheduling with edit mode toggle
- Add comprehensive filtering system (by character, location, group, milestones-only)
- Add character-based swimlane grouping option
- Add interactive filter chips with easy removal
- Add collapsible filter panel for better UI organization
- Enhance EventModal with milestone toggle, progress slider, and dependency selector
- Add visual indicator when edit mode is active
- Add responsive CSS for mobile timeline viewing
- **Separate Gantt Chart View** with toggle button (Timeline / Gantt with icons)
  - All events displayed as horizontal bars in Gantt mode
  - Events without end dates get default 1-day duration in Gantt view
  - Dependency arrows connecting related events using timeline-arrows library
  - Enhanced bar styling with thicker borders and better spacing
  - Alternating swimlane backgrounds for better readability
  - Preserves original timeline view - toggle between modes

### World-Building Entity System
- Add **Cultures** entity type with tech level, government, languages, values, customs, social structure
- Add **Factions** entity type with type, power level, colors, motto, goals, resources, structure
- Add **Economies** entity type with system type (barter, market, feudal), industries, trade policy
- Add **Magic Systems** entity type with type (arcane, divine, natural), rarity, power level, rules, costs, limitations
- Add **Calendars** entity type with calendar type (solar, lunar, lunisolar), days configuration, weekdays
- Add dedicated modals for each world-building entity type
- Add 10 command palette entries for creating and viewing world-building entities

### Timeline Forks and Causality System
- Add **Timeline Fork System** for managing alternate "what-if" storylines
  - Create diverging timelines from specific story events
  - Track fork status: exploring, canon, abandoned, merged
  - Color-coded fork visualization
  - Fork selector dropdown in timeline view
- Add **Causality Link System** for tracking cause-and-effect relationships
  - Link types: direct, indirect, conditional, catalyst
  - Strength levels: weak, moderate, strong, absolute
  - Bidirectional navigation (view causes or effects for any event)
- Add **Automated Conflict Detection**
  - Location conflicts (characters in multiple places simultaneously)
  - Death conflicts (dead characters appearing alive later)
  - Causality violations (effects occurring before causes)
  - Conflict warnings badge with count in timeline toolbar
  - Actionable suggestions for conflict resolution
- Add ConflictListModal for reviewing and managing conflicts
- Add TimelineForkModal and CausalityLinkModal

### Entity Template System
- Add ability to create templates from existing entities
- Add **Template Library** with search, filtering, and sorting
  - Filter by genre, category, entity type
  - Sort by name, usage count, or recently used
- Add **Built-in Character Templates**: Medieval King, Tavern Keeper, Wise Mentor, Cyberpunk Hacker, Detective
- Add usage tracking to surface most-used templates
- Add Templates tab to dashboard with show/hide settings
- Add TemplateLibraryModal, TemplatePickerModal, TemplateEditorModal
- Add CreateTemplateFromEntityModal for saving entities as templates

### Infrastructure and Quality Improvements
- Centralize YAML whitelist and section parsing in `src/yaml/EntitySections.ts`
- Add `FolderResolver` for all entity folder paths (custom, one-story, default multi-story)
- Replace `prompt/confirm` with `PromptModal`/`ConfirmModal` in group commands
- Add `allowRemoteImages` setting (default false) for security
- Pin dependencies and Node engine
- Add Vitest with unit tests for FolderResolver, YAML/sections, and DateParsing
- Add Dependabot/Renovate configs for dependency management
- Add internationalization support (27+ translation keys for new features)
- Update tutorial section with documentation for all new features
