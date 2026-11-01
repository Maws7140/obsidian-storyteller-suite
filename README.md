# Storyteller Suite

Storyteller Suite is an Obsidian plugin for planning stories, worldbuilding, running campaign sessions, managing timelines, and compiling manuscripts without leaving your vault.

## Highlights

### Timeline

- Native timeline engine with Chronology (horizontal or vertical), Gantt, and Calendar views
- Custom calendars per story, with their own months, leap rules, epochs, and holidays
- Timeline themes with a live editor, background images, and `--sts-timeline-*` CSS variables
- Event icons, cover images, and a Minimal icon-node mode
- Group lanes by character, location, item, culture, magic system, group, or track
- Eras, tracks, and branches stored as notes, with branches that inherit their history
- Dependency arrows, conflict detection, a per-story "today", and live `timeline` blocks in any note

### Campaign play and D&D tools

- Virtual tabletop campaign view: the map is the board, with floating party, scene, combat, and log panels
- Player screen with fog of war for a second monitor
- Partylog session logging with a quick entry bar, session headers, interludes, and import/export
- Clocks, threads, party resources, loot, factions, and advancement tracked during play
- Encounter rolls, branching scenes, and campaigns recorded on their own timeline track
- Lorelog world logs for worldbuilding decisions and open questions

### Maps

- Map Ink drawing layer: stamps, lines, areas, shapes, text, and hand-inked brushes in layers with a legend
- Entity tokens on image and real-world maps, child locations, and child maps
- GeoJSON and GPX overlays, and PNG export of image maps

### Compile workflows

- Preset outputs for reader drafts, editor drafts, synopsis, printer-friendly export, plain text, HTML, and more
- Saved custom workflows per plugin settings and per draft
- Workflow editor for reordering, enabling, and configuring steps
- Custom JavaScript compile steps for advanced export pipelines

### Better note integration

- Groups are saved as real notes and populate like the rest of the entity system
- Relationship properties write note-linkable names instead of opaque IDs where possible
- Better graph view compatibility and cleaner frontmatter behavior
- Typed custom fields per entity type, and any modal field or section can be switched off
- Import existing notes as entities

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

## Customising the entity modals

The Character and Item modals ship with every field the plugin knows about, which
is more than most projects want. **Settings → Modals** turns individual fields
off: cultures, economies, inventory, D&D stats, physical attributes and the rest.
Hiding a field only stops it being drawn; nothing already saved is deleted, so
turning one back on brings its value with it.

The same tab sets **default custom fields** per entity type. Name a field there
and every newly created entity of that type starts with it ready to fill in.
Existing entities are left alone.

With **Custom fields mode** on its default of `flatten`, a custom field is written
as an ordinary frontmatter property — a field named `intent` becomes `intent:` on
the note, editable from Obsidian's Properties panel and queryable from Bases and
Dataview.

## Templates

Templates can be built in the UI or written as plain markdown notes dropped into
`StorytellerSuite/Templates/Notes`. See `TEMPLATES_GUIDE.md` for the note format,
the frontmatter keys, and the bulk variable importer.

## Translations

Storyteller Suite currently ships with:

- English
- Chinese

See `TRANSLATION_GUIDE.md` if you want to contribute another language.

## Support

If the plugin is useful to you, support is available here:

- Ko-fi: https://ko-fi.com/kingmaws
