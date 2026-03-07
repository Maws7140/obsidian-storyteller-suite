# Storyteller Suite

Storyteller Suite is an Obsidian plugin for planning stories, worldbuilding, running campaign sessions, managing timelines, and compiling manuscripts without leaving your vault.

## Highlights

### Timeline redesign

- Reworked timeline modal and persistent panel view
- Standard timeline and Gantt modes
- Group by character, location, group, or custom track
- Dependency arrows, progress overlays, milestone filtering, and event search
- Timeline tracks, eras, forks, and conflict detection
- Watch regular notes on the timeline through a property or tag

### Campaign play and D&D tools

- Dedicated Campaign view with session notes stored in your story
- Party tracker with HP controls, active actor selection, and conditions
- Shared inventory with item ownership and use effects
- Scene running with branch-aware progression and scene graph support
- Lore surfacing, session log, and campaign commands in the command palette

### Compile workflows

- Preset outputs for reader drafts, editor drafts, synopsis, printer-friendly export, plain text, HTML, and more
- Saved custom workflows per plugin settings and per draft
- Workflow editor for reordering, enabling, and configuring steps
- Custom JavaScript compile steps for advanced export pipelines

### Better note integration

- Groups are saved as real notes and populate like the rest of the entity system
- Relationship properties write note-linkable names instead of opaque IDs where possible
- Better graph view compatibility and cleaner frontmatter behavior
- Shared custom-field editing patterns across entity modals

### Worldbuilding and story structure

- Characters, locations, events, items, references, chapters, scenes, and books
- Compendium, cultures, economies, magic systems, and groups
- Story board, network graph, gallery, analytics, and map tooling
- Multi-story support, custom folders, and One Story Mode

## Screenshots

### Campaign play

![Campaign play session view](https://i.ibb.co/Fb3QVNgd/a086488103f6.png)

*Run scenes, track party state, manage shared inventory, and keep a live session log in one place.*

![Scene graph and campaign tools](https://i.ibb.co/cSB4h426/9a6e271d6622.png)

*Use the scene graph to move through branching scenes and jump directly into campaign play.*

### Writing and story structure

![Story board writing view](https://i.ibb.co/CK23v8B4/851fd3ed9ec5.png)

*Organize scenes visually with the story board while keeping the writing dashboard in sync.*

### Groups and graph-aware worldbuilding

![Groups and network graph](https://i.ibb.co/qFCQwY2h/073c396b6682.png)

*Groups are first-class notes and connect cleanly into the network graph alongside the rest of your story data.*

### Maps

![Fantasy world map with entity markers](https://i.ibb.co/5hcxV2rv/04c0d160200a.png)

*Place characters, locations, events, items, and other entities directly on image-based maps.*

![Drill-down map hierarchy](https://i.ibb.co/0yz8jPQ0/2b8aae06203f.png)

*Build a full map hierarchy from world to city to district to room using portal markers and breadcrumbs.*

## Feature Breakdown

### Timeline and Gantt

The timeline system is built for more than date plotting. Use it as a chronology view, a dependency-aware Gantt board, or a filtered track-based planning surface.

- Character, location, group, and track grouping
- Dependencies between events with configurable arrow styles
- Progress bars for in-flight tasks and story production tracking
- Milestone-only filtering and quick event search
- Timeline forks for alternate continuities
- Eras and background ranges for historical periods
- Conflict detection for overlapping or contradictory events
- Note watching via a chosen frontmatter property or tag

### Campaign mode

Campaign mode is the D&D-facing side of Storyteller Suite. It lets a DM move through scene notes while tracking the live state of the party.

- Session manager backed by markdown notes in a `Sessions` folder
- Party roster with HP tracking and condition display
- Shared inventory with owner assignment and item-use actions
- Scene actions, branch jumps, and scene graph support
- Lore surfacing based on location and inventory state
- Command palette actions for opening the campaign view, resuming sessions, running from the current scene, opening the active session note, and adding log entries

### Compile and export

The compile system is designed around reusable workflows instead of a single hardcoded export path.

- Preset workflows for common manuscript and planning outputs
- Draft-level workflow selection
- Saved custom workflows in plugin settings
- Custom compile steps written in JavaScript
- Workflow editor for ordering, toggling, and configuring steps

### Maps

Storyteller Suite includes a Leaflet-based map system that works with both vault images and real-world tiles.

- Image maps for fantasy worlds, city plans, and dungeon layouts
- OpenStreetMap tile mode for real-world settings
- Recursive map hierarchies with portal navigation
- Marker support for locations, characters, events, items, cultures, economies, magic systems, groups, scenes, and references

### Entity system

Everything is stored as markdown files with YAML frontmatter and built to stay usable from both the plugin and vanilla Obsidian.

- Linkable entity notes for groups and other story objects
- Two-way relationship syncing across entities
- Better graph view and properties integration
- Custom fields across entity types
- Circular linking between characters, locations, events, items, groups, cultures, economies, magic systems, maps, chapters, scenes, books, and compendium entries

## Getting Started

1. Download the latest release.
2. Extract the plugin into your Obsidian plugins folder.
3. Enable Storyteller Suite in Community Plugins.
4. Open the dashboard from the ribbon or command palette.
5. Check the built-in tutorial in plugin settings if you want a guided walkthrough.

## Data Structure

By default in multi-story mode, files are stored under:

- `StorytellerSuite/Stories/[StoryName]/Characters/`
- `StorytellerSuite/Stories/[StoryName]/Locations/`
- `StorytellerSuite/Stories/[StoryName]/Events/`
- `StorytellerSuite/Stories/[StoryName]/Items/`
- `StorytellerSuite/Stories/[StoryName]/Groups/`
- `StorytellerSuite/Stories/[StoryName]/References/`
- `StorytellerSuite/Stories/[StoryName]/Chapters/`
- `StorytellerSuite/Stories/[StoryName]/Scenes/`
- `StorytellerSuite/Stories/[StoryName]/Books/`
- `StorytellerSuite/Stories/[StoryName]/Maps/`
- `StorytellerSuite/Stories/[StoryName]/Compendium/`
- `StorytellerSuite/Stories/[StoryName]/Cultures/`
- `StorytellerSuite/Stories/[StoryName]/Economies/`
- `StorytellerSuite/Stories/[StoryName]/MagicSystems/`
- `StorytellerSuite/Stories/[StoryName]/Sessions/`

Images are stored in a user-defined upload folder. The default is `StorytellerSuite/GalleryUploads`.

You can also work in One Story Mode or point entity types at custom folders from plugin settings.

Note: in One Story Mode, the dashboard intentionally hides the `New story` button because the vault is operating as a single-story setup.

## Translations

Storyteller Suite currently ships with:

- English
- Chinese

See `TRANSLATION_GUIDE.md` if you want to contribute another language.

## Support

If the plugin is useful to you, support is available here:

- Ko-fi: https://ko-fi.com/kingmaws
