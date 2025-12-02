# Storyteller Suite

A comprehensive suite for managing storytelling elements including characters, locations, events, and more.

## Features

- **Character Management**: Create and manage detailed character profiles with descriptions, backstories, relationships, custom fields, tags, and profile images

- **Location Tracking**: Organize locations with descriptions, history, custom metadata, tags, and profile images

- **Event Timeline**: Track events with dates, outcomes, involvement, tags, and profile images; open a timeline view from the command palette

- **Plot Items (New)**: Track items/artifacts with owners, locations, associated events, custom fields, profile images, and a plot-critical bookmark flag

- **References (New)**: Maintain miscellaneous notes with categories, tags, and optional profile images; quick create/view from the command palette

- **Chapters & Scenes (New)**: Structure your narrative with chapters (number, summary, tags, image) and scenes (status, priority, beats, tags, image). Link chapters/scenes to characters, locations, events, items, and groups

- **Gallery System**: Manage images with titles, captions, descriptions, tags; link images to entities; upload via drag-and-drop or file picker; use images as profile pictures for entities

- **Groups (Expanded)**: Create groups with color, description, tags, and a profile image. Groups can include characters, locations, events, and items

- **Dashboard Interface**: Unified view for all entities with filtering/search across names, tags, and key fields

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

## Data Structure

All data is stored as markdown files with YAML frontmatter. By default (multi-story):

- Characters: `StorytellerSuite/Stories/[StoryName]/Characters/`
- Locations: `StorytellerSuite/Stories/[StoryName]/Locations/`
- Events: `StorytellerSuite/Stories/[StoryName]/Events/`
- Items: `StorytellerSuite/Stories/[StoryName]/Items/`
- References: `StorytellerSuite/Stories/[StoryName]/References/`
- Chapters: `StorytellerSuite/Stories/[StoryName]/Chapters/`
- Scenes: `StorytellerSuite/Stories/[StoryName]/Scenes/`
- Images: User-defined upload folder (default `StorytellerSuite/GalleryUploads`)

You can customize this behavior in Settings → Storyteller Suite:

- Enable “Use custom entity folders” to specify your own folders for characters, locations, events, items, references, chapters, and scenes (no automatic story nesting).
- Enable “One Story Mode” to flatten the structure under a single base folder (default `StorytellerSuite`):
  - Characters: `[Base]/Characters/`
  - Locations: `[Base]/Locations/`
  - Events: `[Base]/Events/`
  - Items: `[Base]/Items/`
  - References: `[Base]/References/`
  - Chapters: `[Base]/Chapters/`
  - Scenes: `[Base]/Scenes/`

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

