# Storyteller Suite

A comprehensive suite for managing storytelling elements including characters, locations, events, and more.

## Features

- **Character Management**: Create and manage detailed character profiles with descriptions, backstories, relationships, and custom fields

- **Location Tracking**: Organize story locations with descriptions, history, and custom metadata

- **Event Timeline**: Track story events with dates, outcomes, and character involvement

- **Gallery System**: Manage story-related images with metadata and linking

- **Group Organization**: Create custom groups to organize characters, locations, and events

- **Multi-Story Support**: Manage multiple stories with isolated data folders

- **Dashboard Interface**: Unified view for all storytelling elements

- **Custom Folders & One Story Mode**: Use your own folder structure for characters/locations/events/items, or enable a flat, single-story layout

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
- Images: User-defined upload folder (default `StorytellerSuite/GalleryUploads`)

You can customize this behavior in Settings → Storyteller Suite:

- Enable “Use custom entity folders” to specify your own folders for characters, locations, events, and items (no automatic story nesting).
- Enable “One Story Mode” to flatten the structure under a single base folder (default `StorytellerSuite`):
  - Characters: `[Base]/Characters/`
  - Locations: `[Base]/Locations/`
  - Events: `[Base]/Events/`
  - Items: `[Base]/Items/`

Note: In One Story Mode, the dashboard’s “New story” button is hidden for consistency. In normal mode, multi-story management works as before.


## Funding / Support

If you find this plugin helpful, consider supporting its development!

"Buy Me a Coffee": "https://ko-fi.com/kingmaws",

