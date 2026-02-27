# Multi-Story Folder Structure

If your fictional world spans multiple stories — a series, a trilogy, a shared universe — you'll hit a wall pretty quickly if everything lives under Story 1. This guide covers the setup that makes adding Story 2 (and 3, and 4...) painless.

---

## The core problem

Say you have a world with recurring characters. If you put those characters under `Story 1/Characters/`, they're gone the moment you start Story 2. You'd either have to duplicate the files (now you're maintaining two copies of the same character) or move them (breaking all the links in Story 1). Neither is great.

The fix is to treat **world-level things** and **story-level things** differently from the start.

---

## World Assets vs Story Assets

**World Assets** are shared across all stories. They exist independent of any single narrative:

- Characters
- Locations
- Factions / Cultures
- Magic Systems
- Economies

**Story Assets** belong to a specific plot and timeline:

- Chapters
- Scenes
- Events
- Plot Items (story-specific ones)

---

## Recommended folder structure

```
Big World/
├── Characters/          ← shared by all stories
├── Locations/           ← shared by all stories
├── Factions/            ← shared by all stories
├── Cultures/            ← shared by all stories
├── Magic Systems/       ← shared by all stories
└── Stories/
    ├── Story 1/
    │   ├── Chapters/
    │   ├── Scenes/
    │   └── Events/
    ├── Story 2/
    │   ├── Chapters/
    │   ├── Scenes/
    │   └── Events/
    └── Story 3/
        ├── Chapters/
        ├── Scenes/
        └── Events/
```

---

## Setting this up in Storyteller Suite

Go to **Settings → Folders** and enable custom entity folders. Then set your paths like this:

**Static paths** (same folder regardless of active story):

| Entity | Folder path |
|---|---|
| Characters | `Big World/Characters` |
| Locations | `Big World/Locations` |
| Factions | `Big World/Factions` |
| Cultures | `Big World/Cultures` |
| Magic Systems | `Big World/Magic Systems` |

**Dynamic paths** (switch automatically when you change the active story):

| Entity | Folder path |
|---|---|
| Chapters | `Big World/Stories/{storyName}/Chapters` |
| Scenes | `Big World/Stories/{storyName}/Scenes` |
| Events | `Big World/Stories/{storyName}/Events` |

The `{storyName}` placeholder fills in with whatever story is currently active in the dashboard. Switch active story → the chapter and scene lists automatically pull from that story's folder.

---

## What this gets you

- Characters, locations, and factions are available to every story without any duplication
- Switching between stories in the dashboard swaps the chapter/scene view automatically
- No folder reorganization needed when you start a new story — just create it and the folders are created on first save
- Links between entities stay intact across stories since the underlying files never move

---

## Common mistake to avoid

Don't put characters under a story folder thinking you'll move them later. Moving files breaks wiki-links and entity relationships tracked by the plugin. Set up the shared folders before you start creating characters.

---

*Originally discussed in [#85](https://github.com/Maws7140/obsidian-storyteller-suite/issues/85).*
