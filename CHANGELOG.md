# Changelog

## 2.0.0

Storyteller Suite 2.0 rebuilds the timeline from scratch, turns campaign play into a virtual tabletop, replaces map pins with a drawing layer, and lets every entity modal be shaped to your own fields. Everything since 1.8.19 is listed below, including the work from the two 2.0 betas.

### Upgrading from 1.8
- Your notes are not rewritten on upgrade. Event, character, location and map notes keep their current frontmatter.
- Eras, tracks and branches used to live in the plugin settings. The first time you open the timeline, a dialog offers to move them into notes in your story folders and asks which story should adopt any that predate story folders. *Undo timeline notes migration* reverses it.
- The timeline no longer uses vis-timeline. Plain mouse wheel now scrolls the timeline and Shift + wheel zooms (it was the other way round); trackpad pinch also zooms.
- Maps drawn with the Maplog marks from the betas open in Map Ink automatically. The old keys are read, not deleted.

### Timeline
- **New timeline engine.** The timeline is drawn on a canvas of its own, with Chronology (horizontal and vertical), Gantt and Calendar views, calendar-aware axes from centuries down to minutes, drag editing, empty date slots, snapping that follows your calendar, and a full-canvas image export.
- **Custom calendars.** Each story can have its own dating system with any month lengths, leap rules, epochs, cycles and holidays, built in a calendar designer. Gregorian, 13 Moons and Japanese kō calendars are bundled. Calendars travel as `.storycal.json` files or share codes.
- **Calendar view.** A full-pane month calendar next to Chronology and Gantt, with a weekday start setting and image export.
- **Icons and covers.** Pick an icon for any event or scene, show cover images on every view, and switch on *Minimal* to draw events as icon nodes.
- **Timeline themes.** Choose a theme from the toolbar or build your own in the theme editor with a live preview: colours with opacity, the lane palette, label font, chip and lane sizes, connector style, and a background image. High contrast, Parchment and Quiet are bundled alongside Obsidian native, and every colour is also a `--sts-timeline-*` CSS variable for snippets.
- **Import themes and calendars from a file.** *Import from file…* in Settings → Timeline, and *Import file…* in *Manage timeline themes*, install a `.storytl.json` or `.storycal.json` without pasting it.
- **Today per story.** Each story can set its own "today", in its own calendar, for the now marker, *Jump to today* and relative dates.
- **Timeline blocks.** A fenced `timeline` code block embeds a live timeline in any note, with optional `theme:` and `today:` lines.
- **Eras, tracks and branches as notes.** They are scoped to their story, can be linked and searched, and a branch carries the history it forked from. *Detect from event gaps* suggests eras from large gaps between events.
- **Grouped lanes.** Group the timeline by character, location, item, culture or magic system, or show where each character was over time. Conflicts, such as a character in two places at once, get a corner badge.
- **Cause and effect on events.** Events record their branch, causes and effects, and the session that created them.
- Two-row toolbar with a *New event* button on every timeline surface, and timeline filters now apply to scenes.

### Campaign play
- **The map is the board.** Campaign play is a virtual tabletop: the full map fills the stage and the party, scene, combat and log live in floating panels.
- **Player screen.** A second view to show your players the board, the party and votes, with three-state fog of war and drifting clouds over unseen country.
- **Partylog notation.** A quick entry bar writes the session log in Partylog, with scene numbering, session header, end-of-session and interlude dialogs, and export and import of sessions.
- **Campaign state.** Clocks, threads and quests, party resources, loot, factions and advancement are tracked and shown during play.
- **Encounters and choices.** Encounter rolls are part of play, and encounter rows can carry choice outcomes and set flags.
- **Campaigns on the timeline.** A campaign can record onto its own track or fork of the main timeline, in in-world time.
- **Read panel and World Log.** A Read panel in the DM sidebar, and Lorelog world logs (*New world log*, *Add build session*) for worldbuilding decisions, open questions and tensions.

### Maps
- **Map Ink.** Draw on any map with stamps from a symbol library, lines, freehand strokes, areas, shapes, text and hand-inked brushes (including barrier brushes and a water fill), each with its own colour. Select, move, rotate and edit with the keyboard; organise drawings in layers with a legend. Entity tokens replace the teardrop pins and thin out as you zoom. Drawings are included in image export and presets can be saved in settings.
- GeoJSON and GPX overlays on maps.
- Export image maps as PNG from the map menu.
- *Create child location* and *Zoom to child map* on location markers, and a placement grid for laying out child locations.
- Maps no longer flicker or go blank when a sidebar opens, and switching maps quickly always lands on the last one picked.

### Entities and modals
- Every entity modal is laid out in collapsible sections.
- **Defined fields.** Add your own typed fields (text, long text, number, list, and links to other entities) per entity type in Settings, Modals. They are written as top-level frontmatter.
- Any field or section of any entity modal can be switched off, and a description can be stored as a frontmatter property instead of a body section.
- Items can have several owners, a creator and a quantity.
- Folder layout can be set per story.
- **Scene synopses in the Writing view.** The List view shows a scene's synopsis (on two lines) instead of the first line of its text, falling back to the text when there is no synopsis. Board cards show the synopsis too, and the Writing search matches it.

### Templates and import
- **Import existing notes as entities.** A wizard turns notes you already have into characters, locations, events and six other types, moving them into the entity folders and keeping every frontmatter key.
- Templates can be edited, imported from `.json` files, and customised before they are applied, including which entities to create and their file names.

### Network graph
- The relationship graph follows the R-Map conventions: relationship direction, broken and severed links, groups, and suggested links.
- The graph uses the story's timeline theme, can colour nodes by type, group, location, culture, status or connections, and has a *Show* menu and a legend that updates with what is on screen.

### Interface
- Dashboard tabs switch at once and show an error in place if one fails.
- Settings tabs can be hidden, and the Help tab gathers the guide, contact and support links.

### Removed
- The vis-timeline and timeline-arrows libraries.
- The `storyteller-map` code block, which never rendered. Use the Map view or a map embed.
- The *Replace current story* template option, which did not do what it said.

### Fixed
- Hundreds of fixes from the beta test and two rounds of bug hunting. The ones you are most likely to have hit:
  - Map drawings were emptied on save, so marks seemed not to stick.
  - Timeline edits could be written from a stale copy of the story, and three code paths could write an empty timeline store.
  - Save and Create buttons, Partylog import and Lorelog actions could run twice on a double click or double tap.
  - Saving a group note could drop keys and sections the plugin did not know about. Saving now keeps them, along with legacy connection formats.
  - BCE dates written by dragging could not be read back.
  - The Gantt view slowed down with many dependencies. It now draws about three times faster on large stories.
  - Gregorian year labels on the axis repeated or skipped years.
  - Saving a character with a dated location history (`3018-01-01 – 3018-09-22`) split the start date at its first hyphen and wrote back `3018 – 01-01 – 3018-09-22`, so every event after it was flagged as a conflict. Ranges now keep whole dates, and histories already written the broken way are read correctly and fixed on the next save.
  - After an update, Storyteller could show dozens of "Event saved with N conflict(s)" notices in a row while it refreshed links between notes in the background. Background saves no longer run the per-event conflict check, and saves that land in a burst share one notice.
  - The Writing List showed "No chapters found" and nothing else for a story with scenes but no chapters. Those scenes now appear under Unassigned scenes.
  - Plugin settings opened blank on Android and iPad with Obsidian 1.13 and later. Obsidian added a `renderTab()` step to every settings tab, and a private method of ours with the same name replaced it, so the tab drew nothing; desktop only worked by accident. The method is renamed and settings render on phones, tablets and desktop.
  - In circle layout a large graph could not be zoomed out far enough to see every node, and Fit to view stopped short, because the zoom floor was fixed at 20%. The floor now drops to whatever shows the whole graph.
  - A bare year such as `dateTime: 342` stopped the whole timeline from drawing, because Obsidian reads it as a number.
  - A character recorded as living in a region (the Shire) was flagged as in two places when an event put them somewhere inside it (Bag End). Recorded stays now cover the places within them.

## 2.0.0-beta.2

### Added
- **Inline timeline blocks**: embed a live timeline inside any note using a fenced `timeline` code block. The block renders inside the note itself with no separate view needed.
- **Event provenance**: events now carry which story session created them, surfaced in the event detail panel.
- **Track, era, and branch manager**: dedicated UI for creating and editing eras, tracks, and branches, scoped per-story so they do not bleed across stories.
- **Branch causality fields**: events can declare which branch they belong to, and cause/effect relationships are recorded directly on the event rather than as separate link notes.
- **History inheritance for branches**: a branch carries the full history of the timeline it forked from up to its divergence point, and the branch renderer shows exactly where it splits.
- **Grouped track lanes**: the timeline can group by world-building entity — item, culture, or magic system — or show where each character was at each point in time.
- **Trackpad pinch-to-zoom**: two-finger pinch zooms the timeline axis on trackpads in addition to the scroll-wheel zoom already available.
- **Full-canvas export**: exporting the timeline captures the entire plot area, not just the current scroll window.
- **Fork commands**: the fork a timeline and create a divergence point commands now open the timeline at the new branch immediately so you can see the result straight away.
- **Gantt short-bar chip fallback**: a Gantt bar too narrow to show its own label renders as a readable chip anchored at the event's start, with the true span shaded inside it so the bar does not mislead about the event duration.

### Fixed
- Dependency arrows no longer drift horizontally as the user scrolls the timeline.
- Events are now placed at the exact calendar day they are dated; plot lines stay inside the drawable area and no longer run past the axis edges.
- Three separate code paths could silently write an empty timeline store to disk; all three are now guarded.
- Dependency arrows no longer draw backwards through the bar they belong to.
- The timeline toolbar no longer loses its right-hand controls after certain resize transitions.
- Switching the active story now reloads all open timeline views, clearing the previous story's track, branch, and filter state so the new story does not appear empty.
- Era epoch suffix (`CE`) no longer appears on every Gregorian event card and axis label. The suffix is shown only for user-defined calendars where the epoch is not universally understood; pre-epoch Gregorian years read as `BCE` instead of as a negative number.
- Gantt bars that had no explicit end date rendered as unlabelled nubs at any zoom level wider than a few weeks; the chip fallback above resolves this.

### Changed
- Timeline migration prompt moved from plugin settings into a first-use dialog so it appears in context the first time the timeline is opened, rather than buried in a settings screen that many users do not visit.

### Beta notes
- Install through BRAT from the repository's `2.0.0-beta.2` prerelease.
- This beta does not alter or migrate existing event notes.

---

## 2.0.0-beta.1

### Added
- Native high-performance Canvas timeline with viewport culling, calendar-native axes, track and entity lanes, eras, Gantt dependencies, narrative connectors, drag editing, and branch comparison for forked timelines.
- Per-story dating systems with arbitrary month counts, leap rules, day or minute precision, cycle overlays, holidays, and bundled Gregorian, 13 Moons, and Japanese kō examples.
- Portable `.storycal.json` calendar and `.storytl.json` appearance documents with validation and Unicode-safe share codes for Vault Hub distribution.
- Timeline themes inherit from the active Obsidian theme by default and can selectively override semantic colors and layout roles.

### Changed
- Alternate timelines can be compared as visual branches that inherit main-history events through their divergence points.
- Removed the vis-timeline and timeline-arrows runtime dependencies.

### Beta notes
- Install through BRAT from the repository's `2.0.0-beta.1` prerelease. This beta does not alter or migrate existing event notes.

## 1.8.19

### Added
- Books compile as drafts directly from the Books tab, so a whole book can be assembled without building a manuscript selection by hand first.
- Custom compile steps can run their own JavaScript. This is off by default and gated behind a settings toggle, since a compile step runs arbitrary code against your vault.
- Interface layout override setting, for cases where the automatic phone, tablet, and desktop detection picks the wrong layout.
- Help tab now gathers the tutorial, contact, and support links in one place, with the video tutorial linked from there.

### Fixed
- Long modals could not be scrolled. Modal content that ran past the bottom of the window was simply unreachable, which made the compile workflow modal unusable at smaller window sizes. All modals now cap at 85% of the window height and scroll their content.
- Surface devices flipped into tablet mode when the keyboard was still attached.
- Settings pane came up blank after Obsidian moved the window between displays.
- Timeline regressions that were lost when the beta branch was cut are back on the release build: the timeline fills its container again, drag edits persist, and narrative connectors resolve and redraw correctly.
- Plot hole detector resolved character references by id and reported holes against characters it should have matched.

### Changed
- Entity references, location history, connections, and custom fields are written to frontmatter as readable strings instead of nested structures, so the notes stay legible when read outside the plugin.
- Compile tab uses Lucide icons in place of emoji glyphs.

### Internal
- Export HTML is rendered through Obsidian's MarkdownRenderer with vault images inlined as data URIs, so an exported file stands alone.

## 1.8.18

### Added
- Timeline dates accept unpadded fantasy and historical years. A year can be written the natural way (`342`) or zero-padded (`0342`) and both place identically in Timeline and Gantt mode; one-, two-, and three-digit years are read as years. Unpadded year-month and year-month-day (`342-3-1`) work too.
- Date ranges render Gantt bars. An event with a span such as `342 to 367` draws a bar instead of a single dot, and `through`, `until`, `..`, and an en-dash also work as separators. Full-date spans (`0342-03-01 to 0342-09-15`) and BCE spans (`500 BCE to 400 BCE`) are handled on both ends.

### Fixed
- A bare year like `342` was misread as a clock time (3:42) and landed the event at the present day instead of on the intended ancient timeline. Short years are now parsed as years ahead of the casual-date pass, so historical and fantasy events sit where they belong. Already-padded dates are unaffected.

### Internal
- Cleared Obsidian plugin-review lint findings in the template modals and converter (block-body `forEach` callbacks, `activeDocument`, sentence-case placeholders, a base-to-string guard, and a redundant type assertion). No user-facing behavior change.

## 1.8.17

### Fixed
- Blank Storyteller settings pane in Obsidian 1.13+ (separate settings window), now fixed reliably across devices. Obsidian can swap in the real settings container after the first render, and the delay varies by device, so the pane now keeps re-rendering until it actually shows content instead of relying on a fixed timer.

## 1.8.16

### Fixed
- Settings pane blank on first open in Obsidian 1.13+ (separate settings window): Obsidian can call the settings renderer before the container is attached to the new window, so the first render was discarded and the pane stayed blank until settings were reopened. The pane now re-renders automatically if it ends up empty, so it shows on the first open.

## 1.8.15

### Fixed
- Settings pane reliability in Obsidian 1.13+: the entire settings render is now guarded, so if any part fails the pane shows the error in place (with details) instead of going completely blank. This resolves the blank Storyteller settings pane reported on Obsidian 1.13's separate settings window.

## 1.8.14

### Fixed
- Settings pane no longer renders blank in Obsidian 1.13+, which opens Settings in a separate window where the plugin stylesheet is not guaranteed to apply. The settings layout's non-collapsing height and flex structure are now set inline, so the pane renders regardless of which window hosts it.

## 1.8.13

### Added
- Templates can link the entities they create to **existing** vault entities (locations, magic systems, groups, cultures, etc.) chosen when the template is applied. Define links in a new **Links** tab in the template editor; the apply dialog then prompts for the existing entities to attach. No duplicate entities are created.
- The gallery upload folder is now selected from a dropdown of vault folders instead of a free-text field.

### Fixed
- Plugin settings no longer render blank under newer Obsidian settings windows: the settings layout uses a non-collapsing height, missing settings collections are guarded before rendering, and a failing settings section shows a message instead of blanking the whole pane.

### Internal
- Rolls up ongoing template, timeline, and map editor improvements.

## 1.8.12

### Internal
- Isolated the Storyteller UI styles so they no longer leak into the rest of the Obsidian workspace.

## 1.8.11

### Fixed
- Daily writing goal notifications now fire only when the day's word count first crosses the configured goal, instead of repeating after every later writing-session save.

## 1.8.10

### Internal
- Cleared the remaining Obsidian plugin-review lint findings: the timeline dependency-arrow layer now uses `activeDocument` for popout-window compatibility, its static SVG styling moved out of inline assignments into stylesheet classes (with `--dashed`/`--dotted` modifiers for line types), `hasOwnProperty` is called via `Object.prototype`, and a ternary-as-statement became an explicit `if`/`else`. Removed redundant type assertions in the save-as-template, prompt, and dashboard code by narrowing through `const` captures. No user-facing behavior change.

## 1.8.9

### Fixed
- Story Board: the create/overwrite confirmation no longer resolves on a 100ms timeout race. It now awaits the modal result, and creating a new story board opens the generated canvas automatically.
- Groups dashboard: long group descriptions render as a clamped markdown preview instead of overflowing the card.
- Maps dashboard: added an **Open maps panel** action and per-map open buttons so maps are reachable directly from the dashboard.

## 1.8.8

### Security
- The bundled JSZip dependency no longer ships the `immediate`/`setimmediate` IE-era scheduler fallbacks that injected `<script>` elements at runtime. A build-time transform collapses those four branches to their existing `setTimeout` path, so `main.js` contains no dynamic script-element creation. EPUB/ODT import is unaffected — the `MutationObserver` scheduler JSZip actually uses in Obsidian is left intact.

## 1.8.7

### Fixed
- Map panels now apply the dynamic viewport height (`dvh`) via an `@supports` fallback instead of a duplicate `max-height` declaration, clearing Obsidian's duplicate-property CSS lint warnings.

### Security
- Character-sheet previews now strip inline event handlers (`on*`) and `javascript:` URLs in addition to `<script>`/`<iframe>`/`<object>`/`<embed>`, so user-authored sheet templates cannot execute code.

### Internal
- Release workflow verifies that `manifest.json`/`package.json`/`versions.json` agree with the release tag before building, preventing mismatched release artifacts (the cause of the mis-tagged 1.8.6).

## 1.8.6

### Fixed
- Removed obsolete generated CSS output and consolidated duplicate stylesheet rules so Obsidian's CSS lint warnings no longer report stale `main.css` issues or duplicate selectors from Storyteller Suite styles.

## 1.8.5

### Fixed
- SceneModal Date field and Campaign board map dropdown no longer overflow past the left edge of their setting row. The plugin-scope `.setting-item-control` rule now constrains its input/select/dropdown children with `max-width: 100%; min-width: 0; box-sizing: border-box` instead of clipping the container with `overflow: hidden`, so wide inputs shrink to fit rather than spilling out and overlapping the label.

### Internal
- Release workflow no longer builds or uploads the `storyteller-suite-X.Y.Z.zip` artifact. Releases now ship only `main.js`, `manifest.json`, and `styles.css` — the three files Obsidian actually loads.

## 1.8.1

### Changed
- Reduced `!important` usage in styles by 107 declarations (288 → 181) — remaining instances are vendor overrides for Leaflet, vis-timeline, and Obsidian core that genuinely require it.
- Expanded all 3-digit hex colors in styles to the 6-digit format for consistency.
- Replaced `:has()` selectors in the gallery markdown rendering with a tagging post-processor that adds explicit classes, avoiding the selector-invalidation performance pitfall.
- Replaced the `:has()` selectors used for mobile modal button-container sizing with explicit classes.

### Internal
- Dropped `js-yaml`, `dotenv`, `@types/js-yaml`, and `builtin-modules` from devDependencies; the build's Node-builtins list is now hardcoded instead of imported.
- Release workflow now produces GitHub artifact attestations (`actions/attest-build-provenance@v2`) for `main.js`, `manifest.json`, `styles.css`, and the release zip.

## 1.8.0

### Fixed
- Network graph: stopped crashing with "toLowerCase is not a function" when an entity field held a typed-relationship object, wikilink-wrapped value, or non-string instead of a plain name. The resolver now coerces those shapes and falls back to skipping the bad value instead of killing the whole graph.
- Network graph: surfaced initialization errors in the console instead of swallowing them silently, so future failures can be diagnosed.
- Timeline: removed the invalid `verticalScrollSticky` vis-timeline option that produced an "Unknown option" warning on every render.

### Changed
- Storyteller guide modal now includes a Ko-fi support button alongside the dashboard / what's new / close actions.
- Updated "What's new" guide copy for the 1.8.0 dashboard mobile improvements.

### Internal
- Fixed all ESLint violations flagged by the Obsidian community plugin scorecard.

## 1.7.9-beta.1

- Migrate Culture and Economy modals onto the shared `createStructuredModalLayout` + `createFooterButton` footer used by every other entity modal, so their Save / Cancel / Delete buttons match the rest of the suite on mobile (sticky footer, correct touch targets) instead of rendering as a stacked legacy `Setting` row.

## 1.7.9-beta.0

- Auto-update gallery records and entity image references when an image file or its parent folder is renamed or moved, so `profileImagePath`, `coverImagePath`, `backgroundImagePath`, `image`, and `images[]` no longer go stale.
- Read scene Beats, culture/economy/compendium body sections, book Synopsis, and item Cultural Significance / Magic Properties back into their fields when loading notes, so data entered in the markdown body or saved through the modal is no longer dropped on reload.
- Fix scene save/load mismatch where the modal wrote `## Beats` but the loader only read `## Beat Sheet`, then keep `## Beat Sheet` working as a legacy fallback.
- Unify the Cancel / Save / Delete footer on MagicSystem, CompendiumEntry, and TemplateEditor modals so they match the structured-modal layout used across the rest of the suite.
- Restore characters dropped from the writing heatmap when scene `linkedCharacters` capitalisation drifted from the canonical name.
- Include undated events in the analytics events stat, and divide the event-distribution chart by the dated event count so the percentages add up correctly.
- Stop matching unrelated entities by partial-substring during EntitySyncService lookups; fall back only to case-insensitive name matches.
- Run wiki-link bracket canonicalisation through the bidirectional-link backfill so re-imports leave files in the same shape a normal save would.
- Consolidate three duplicate `stripWikiLinkValue` implementations into a shared utility that handles aliases (`[[Real|Display]]`) and anchors (`[[Name#Section]]`).
- Replace the silently lossy fallback frontmatter parser with a strict `parseYaml`-only reader that errors on malformed YAML instead of dropping nested fields.
- Re-run the bidirectional-link backfill on every plugin upgrade instead of only on first install.

## 1.7.8-beta.19

- Fix iPad dashboard layout detection by falling back to real touch-device viewport signals when Obsidian's mobile app flags are missing, so tablets stop falling through the desktop tab layout path.

## 1.7.8-beta.18

- Remove the leftover dashboard tab CSS that was still arguing with the new layout shell, so tablets stop falling back to the old wrapped tab behavior.
- Keep the dashboard tab rail horizontal across phone, tablet portrait, and tablet landscape, and add a runtime regression so that split mobile behavior does not sneak back in.

## 1.7.8-beta.17

- Keep dashboard tabs on one horizontal scroll rail across all mobile layouts, including tablets, and remove the old phone-only overflow tab path that was still splitting mobile behavior.

## 1.7.8-beta.16

- Replace native confirm dialogs on dashboard delete actions with an in-app confirmation modal so deleting an entry no longer leaves keyboard focus stuck and blocks typing in editors and inputs until the Obsidian window is reactivated.
- Render footer buttons in modals through Obsidian's ButtonComponent so the "Delete" label shows on Maps, Gallery, Groups, References, Writing, and Books edit modals the same way it does on Cultures and Economies.

## 1.7.8-beta.15

- Lift the modal scroll height cap on mobile fullscreen so create and edit modals use the full viewport in landscape instead of squeezing the form into a sliver.
- Stop auto-mirroring family, ally, rival, and romantic relationships in the network graph so picking "father" between two characters renders one labeled arrow instead of two stacked ones.

## 1.7.8-beta.14

- Auto-grow textareas inside modals so the native textarea scrollbar no longer stacks alongside the modal scrollbar when the field has a lot of content.

## 1.7.8-beta.13

- Fix character creation modal not scrolling on desktop so the Save and Cancel buttons no longer get cut off when the form is taller than the window.
- Apply the same scroll fix to every modal that uses the structured layout helper.
- Refresh the dashboard tabs automatically after chapter and scene edits or deletes so the list reflects changes without needing to switch tabs.
- Preserve empty content and summary sections when saving chapters and scenes instead of falling back to the template default.
- Parse magic system rule, source, cost, limitation, and training sections back into their fields when loading older notes.

## 1.7.8-beta.11

- Move the main remaining legacy create/edit modals onto ResponsiveModal so they use the same mobile modal flow as the fixed character modal instead of plain Obsidian modal behavior.

## 1.7.8-beta.10

- Upgrade legacy Storyteller modal action rows at runtime so older create/edit modals get split scroll + footer layout on mobile instead of staying inside the scroller.

## 1.7.8-beta.9

- Normalize the old modal action-row pattern so other create/edit modals inherit the same footer button styling and mobile behavior as the character modal fixes.

## 1.7.8-beta.8

- Replace character modal footer actions with explicit buttons so create/save uses one consistent style and click path on mobile.

## 1.7.8-beta.7

- Publish the rebuilt beta artifact so BRAT and branch installs get the actual latest character modal fixes instead of stale code.

## 1.7.8-beta.6

- Remove the character sheet action from the create character flow so the footer stays focused on the current product state.
- Make character modal footer buttons follow the active accent styling on beta builds.

## 1.7.8-beta.5

- Fix character create modal on mobile so the form body scrolls separately and the footer actions stay visible, including the save button.

# Changelog

## 1.7.8

### Fixed
- Fixed dashboard sidebar duplication caused by stacked refresh and listener behavior when the dashboard view was reopened or refreshed

## 1.7.8-beta.4

### Fixed
- Replaced the character modal's action row with a dedicated footer so create and save controls stay visible on mobile

## 1.7.8-beta.3

### Fixed
- Adjusted the mobile modal action row again so the save button is not clipped by the settings layout container

## 1.7.8-beta.2

### Fixed
- Adjusted mobile fullscreen modals so the close button stays reachable and the action row remains visible at the bottom while scrolling

## 1.7.8-beta.1

### Fixed
- Fixed mobile fullscreen entity modals not picking up the correct responsive layout class
- Fixed dashboard sidebar refresh/listener stacking that could cause duplicated entity views

### Changed
- Added a dashboard setting to disable accent borders and made the cleaner non-accented look the default

### Internal
- Hardened map, timeline, and network views against repeated resize observer registration

## 1.7.7

### Fixed
- Fixed notes being picked up as the wrong entity type in some folder setups
- Added an entity type guard so characters, books, and other notes do not get cross-listed incorrectly
- Added a startup backfill so older notes get stamped with their entity type after reload

### Internal
- Removed assistant-specific repo files that should not have been public
- Added ignore rules for local debug logs and scratch files

## 1.7.6

### Fixed
- Fixed the in-app update highlights so they describe the actual analytics and template fixes instead of stale startup notes

## 1.7.5

### Fixed
- Fixed writing analytics getting stuck on old numbers
- Fixed the sidebar word goal not updating properly while writing
- Fixed writing sessions not being recorded reliably when switching files or refreshing analytics
- Fixed custom templates made from the dashboard saving inconsistently
- Fixed stale template copies being left behind in old template folders
- Fixed map templates losing their entity type on save

### Internal
- Added regression tests for writing tracker session handling
- Added regression tests for template save/load cleanup

## 1.7.0

### Major updates
- New campaign and DnD mode with sessions, party state, item effects, faction standing, lore reveals, and branch-driven play
- Timeline and Gantt redesign with grouped lanes, dependency arrows, progress rendering, and broader stability fixes
- Campaign boards and map improvements including denser marker handling and SVG support through overlay or tiled raster modes
- Character sheets expanded with new DnD-themed and note-native presets

### Workflow and data improvements
- Compile workflows and custom compile steps expanded for draft-based manuscript output
- Group notes, entity syncing, gallery syncing, and wiki-link friendly properties improved across the plugin
- Onboarding and update guides added so new installs and upgrades surface the current feature set in-app

## 1.6.0

### Bug Fixes
- Fixed custom entity folders fallback logic when paths are unconfigured
- Resolved folder resolution issues causing "Create New Chapter" button to malfunction when custom folders enabled but not fully configured
- Improved control flow in FolderResolver to properly cascade through custom → one-story → default folder modes

## 1.5.9

### Bug Fixes
- Fixed template persistence issues
- Added folder creation toggle option

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







