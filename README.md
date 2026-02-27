# Storyteller Suite

A comprehensive suite for managing storytelling elements including characters, locations, events, and more.

## Features

- **Character Management**: Create and manage detailed character profiles with descriptions, backstories, traits, physical attributes (race, gender, age, height, quirks), relationships, custom fields, and profile images

- **Location Tracking**: Organize locations with descriptions, history, custom metadata, tags, and profile images

- **Event Timeline**: Track events with dates, outcomes, involvement, tags, and profile images; open a timeline view from the command palette

- **Plot Items**: Track items/artifacts with owners (including past owners and multiple associated characters), locations, associated events, custom fields, profile images, and a plot-critical bookmark flag

- **Maps**: An interactive Leaflet-based map viewer — place entity markers on any vault image (world maps, city plans, dungeon layouts), link maps together with portal navigation, and drill down through a map hierarchy from world to district to room

- **Compendium / Bestiary**: A world-knowledge database for creatures, plants, materials, potions, phenomena, and other world elements — with rarity, danger rating, ecology notes, hunting notes, and circular links to characters, locations, items, magic systems, cultures, and events

- **Magic Systems**: Define and manage the magic systems of your world with types, abilities, consistency rules, linked characters, locations, cultures, and events

- **Cultures**: Capture civilizations with tech level, government, languages, values, and relationships to locations, characters, events, and economies

- **Economies**: Model trade networks and economic systems with currencies, resources, trade routes, and linked entities

- **References**: Maintain miscellaneous notes with categories, tags, and optional profile images; quick create/view from the command palette

- **Chapters & Scenes**: Structure your narrative with chapters (number, summary, tags, image) and scenes (status, priority, beats, tags, image). Link chapters/scenes to characters, locations, events, items, and groups

- **Gallery System**: Manage images with titles, captions, descriptions, tags; link images to entities; upload via drag-and-drop or file picker; use images as profile pictures for entities

- **Groups**: Create groups with color, description, tags, and a profile image. Groups can include characters, locations, events, and items. Each group is saved as a linkable vault note

- **Dashboard Interface**: Unified view for all entities with filtering/search across names, tags, and key fields. Tabs are **drag-and-drop reorderable** — arrange them however fits your workflow

- **Circular Entity Linking**: Every relationship is two-way. Link a character to a magic system and the magic system's file automatically back-links to the character. No manual maintenance needed.

- **Command Palette Actions**: Create and view commands available for every entity type, plus story utilities (open dashboard, refresh story discovery)

- **Multi-Story Support**: Manage multiple stories with isolated data folders

- **Custom Folders & One Story Mode**: Use your own folder structure for characters/locations/events/items/references/chapters/scenes, or enable a flat, single-story layout

### Getting Started

1. Download the latest release
2. Extract the files to your Obsidian plugins folder
3. Enable the plugin in Obsidian settings
4. Access via the ribbon icon or command palette

New to the plugin? Check out the **built-in tutorial** in the plugin settings! It provides a comprehensive guide covering:

- How to access the dashboard and use the ribbon icon
- Story management and folder structure
- Character creation and management
- Location tracking and organization  
- Event timeline management
- Plot item tracking
- Gallery and image management
- Group organization features
- All available keyboard shortcuts and commands
- File structure and Obsidian integration tips

**To access the tutorial:** Go to Settings → Community Plugins → Storyteller Suite → Configure

You can hide the tutorial section at any time using the "Show tutorial section" toggle in the settings.


![Screenshot 1](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot1.png)

![Screenshot 2](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot2.png)

![Screenshot 3](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot3.png)

## Maps

Storyteller Suite includes a full interactive map system built on Leaflet. Use any image in your vault as a map — hand-drawn world maps, city plans, dungeon layouts, AI-generated art — or pull in real-world tiles via OpenStreetMap.

### Image-based maps

Drop any vault image in as a map and start pinning your world to it. Characters, locations, events, items, cultures, economies, magic systems, groups, scenes, and references can all be placed as markers directly on the canvas.

![Fantasy world map with entity markers](https://i.ibb.co/5hcxV2rv/04c0d160200a.png)

*The Dragon Prince world map with entity markers placed across regions.*

![Fireland volcanic map](https://i.ibb.co/JwKjFgL5/27e6435ebbf1.png)

*A custom Fireland map — markers link back to the full entity records in the dashboard.*

### Map hierarchy — drill down through your world

Maps can link to other maps. Set a marker as a portal and clicking it loads the child map, with a breadcrumb trail so you always know where you are. Build a full hierarchy: world → region → city → district → building → room.

![Dockspire city map drill-down](https://i.ibb.co/0yz8jPQ0/2b8aae06203f.png)

*Drilling down from the Fireland world map into Dockspire — Skyland Aerial Port. The breadcrumb at the top shows the path back.*

### Real-world tile maps

Not every story is set in a fantasy world. Switch to tile mode and get a full OpenStreetMap base layer with zoom levels and region control. Pin your characters and locations to actual geography.

![Real-world tile map with markers](https://i.ibb.co/BV86NSRB/c8fe93f1cc23.png)

*A real-world map with entity markers. Zoom level, tile layer, and region auto-detection all work out of the box.*

### What you can place on any map

| Entity type | Button label |
|---|---|
| Location | Location |
| Character | Character |
| Event | Event |
| Plot Item | Item |
| Culture | Culture |
| Economy | Economy |
| Magic System | Magic |
| Group | Group |
| Scene | Scene |
| Reference | Reference |

All markers link back to their entity files — clicking a marker opens the full record. Markers show profile images when available.

---

## Data Structure

All data is stored as markdown files with YAML frontmatter. By default (multi-story):

- Characters: `StorytellerSuite/Stories/[StoryName]/Characters/`
- Locations: `StorytellerSuite/Stories/[StoryName]/Locations/`
- Events: `StorytellerSuite/Stories/[StoryName]/Events/`
- Items: `StorytellerSuite/Stories/[StoryName]/Items/`
- Compendium: `StorytellerSuite/Stories/[StoryName]/Compendium/`
- Cultures: `StorytellerSuite/Stories/[StoryName]/Cultures/`
- Magic Systems: `StorytellerSuite/Stories/[StoryName]/MagicSystems/`
- Economies: `StorytellerSuite/Stories/[StoryName]/Economies/`
- Groups: `StorytellerSuite/Stories/[StoryName]/Groups/`
- References: `StorytellerSuite/Stories/[StoryName]/References/`
- Chapters: `StorytellerSuite/Stories/[StoryName]/Chapters/`
- Scenes: `StorytellerSuite/Stories/[StoryName]/Scenes/`
- Maps: `StorytellerSuite/Stories/[StoryName]/Maps/`
- Images: User-defined upload folder (default `StorytellerSuite/GalleryUploads`)

You can customize this behavior in Settings → Storyteller Suite:

- Enable “Use custom entity folders” to specify your own folders for characters, locations, events, items, references, chapters, and scenes (no automatic story nesting).
- Enable “One Story Mode” to flatten the structure under a single base folder (default `StorytellerSuite`):
  - Characters: `[Base]/Characters/`
  - Locations: `[Base]/Locations/`
  - Events: `[Base]/Events/`
  - Items: `[Base]/Items/`
  - Compendium: `[Base]/Compendium/`
  - Cultures: `[Base]/Cultures/`
  - Magic Systems: `[Base]/MagicSystems/`
  - Economies: `[Base]/Economies/`
  - Groups: `[Base]/Groups/`
  - References: `[Base]/References/`
  - Chapters: `[Base]/Chapters/`
  - Scenes: `[Base]/Scenes/`
  - Maps: `[Base]/Maps/`

Note: In One Story Mode, the dashboard’s “New story” button is hidden for consistency. In normal mode, multi-story management works as before.



## Translations

Storyteller Suite supports multiple languages! Currently available:

- **English** (en) - Base language
- **Chinese** (中文) - Complete translation

### Contributing Translations

We welcome translations for other languages! Priority languages include:

**Tier 1 (High Priority):**
- Spanish (es), French (fr), German (de), Portuguese (pt), Japanese (ja), Korean (ko)

**Tier 2 (Medium Priority):**
- Italian (it), Russian (ru), Dutch (nl), Polish (pl), Turkish (tr), Arabic (ar)

See `TRANSLATION_GUIDE.md` for detailed instructions on how to contribute translations. Template files are available in `src/i18n/locales/` for the top priority languages.

### Changing Language

1. Go to **Settings → Storyteller Suite → Language**
2. Select your preferred language from the dropdown
3. The interface will update automatically

## Funding / Support

If you find this plugin helpful, consider supporting its development!

"Buy Me a Coffee": "https://ko-fi.com/kingmaws",

