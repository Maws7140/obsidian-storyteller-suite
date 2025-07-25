# Storyteller Suite

A comprehensive suite for managing characters, locations, events, and galleries for your stories.

## Features

*   **Unified Dashboard:** Access and manage all your story elements from a dedicated view pane in the right sidebar.
*   **Tabbed Navigation:** Easily switch between Characters, Locations, Events, and Gallery within the dashboard.
*   **Character Management:**
    *   Create, view, edit, and delete characters.
    *   Track: Name, Description, Backstory, Profile Picture, Status (e.g., Alive, Deceased), Affiliation (e.g., Faction, Kingdom), Relationships, Associated Locations & Events, and Custom Fields.
    *   Filterable list view.
*   **Location Management:**
    *   Create, view, edit, and delete locations.
    *   Track: Name, Description, History, Representative Image, Type (e.g., City, Forest), Region, Status (e.g., Populated, Abandoned), Characters Present, Events Here, Sub-Locations, and Custom Fields.
    *   Filterable list view.
*   **Event Management / Timeline:**
    *   Create, view, edit, and delete events.
    *   Track: Name, Date/Time, Description, Outcome, Representative Image, Status (e.g., Completed, Ongoing), Characters Involved, Location, Associated Gallery Images, and Custom Fields.
    *   View events chronologically in a filterable timeline.
*   **Integrated Gallery:**
    *   Manage a central gallery of images for your story.
    *   Upload new images directly.
    *   Assign images as profile pictures (Characters), representative images (Locations, Events), or link multiple images to Events.
    *   Add captions and tags to gallery images.
*   **Custom Fields:** Add your own specific key-value data points to Characters, Locations, and Events for maximum flexibility.
*   **Markdown-Based:** All data is stored as standard Markdown files with YAML frontmatter within your vault, ensuring data longevity and interoperability.
*   **Visual Interface:** Modern, card-based display in the dashboard for quick visual reference, including images and key details.

## Groups Feature

The Storyteller Suite plugin now supports **Groups**—collections of characters, events, and locations that can be managed together. Groups are shared across all entity types and can be used to organize your story world by factions, teams, timelines, or any custom grouping.


![Screenshot 1](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot1.png)
![Screenshot 2](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot2.png)
![Screenshot 3](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot3.png)


## How to Use

*   Install the plugin via the Community Plugins browser.
*   Enable the plugin in your settings under "Community plugins".
*   Click the 'Book' icon in the ribbon or use the command "Open Storyteller Suite Dashboard" to open the main view.
*   Use the tabs at the top of the dashboard to navigate between Characters, Locations, Events, and Gallery.
*   Use the "Filter" input and "+ Add New" button within each tab to manage your entries.
*   Data is saved in folders specified in the (future) settings (defaults to `StorytellerSuite/Characters`, `StorytellerSuite/Locations`, etc.).

## Funding / Support

If you find this plugin helpful, consider supporting its development!

"Buy Me a Coffee": "https://ko-fi.com/kingmaws",



### What You Can Do
- **Create, edit, and delete groups** from the Dashboard's Groups tab.
- **Edit group details** (name, description, color) in a dedicated modal.
- **Assign or remove members** (characters, events, locations) to/from groups using dropdown selectors.
- **See group membership** in the group modal and in each entity's modal.
- **Assign groups to characters, events, and locations** from their respective modals.
- **Real-time sync**: If groups are changed elsewhere, open modals will update their group selectors automatically.
- **Error handling**: Duplicate group names are prevented, and user feedback is provided for all group operations.

### How to Use
1. Go to the **Dashboard** and select the **Groups** tab.
2. Click **Create new group** to open the GroupModal. Enter a name, description, and color, then add members.
3. To edit a group, click the **Edit** button next to the group in the list.
4. To assign a character, event, or location to a group, open its modal and use the Groups dropdown.
5. Changes to groups are reflected in all relevant modals in real time.

### Edge Cases & Feedback
- Group names must be unique (case-insensitive).
- Deleting a group removes it from all members.
- All group operations provide clear feedback via notices.


