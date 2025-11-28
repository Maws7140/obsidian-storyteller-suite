# Changelog

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
