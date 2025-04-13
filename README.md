<<<<<<< HEAD
# Storyteller Suite

A comprehensive suite for managing characters, locations, events, and galleries for your stories within Obsidian.

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
*   **Markdown-Based:** All data is stored as standard Markdown files with YAML frontmatter within your Obsidian vault, ensuring data longevity and interoperability.
*   **Visual Interface:** Modern, card-based display in the dashboard for quick visual reference, including images and key details.

## How to Use

*   Install the plugin via the Obsidian Community Plugins browser.
*   Enable the plugin in your Obsidian settings under "Community plugins".
*   Click the 'Book' icon in the ribbon or use the command "Open Storyteller Suite Dashboard" to open the main view.
*   Use the tabs at the top of the dashboard to navigate between Characters, Locations, Events, and Gallery.
*   Use the "Filter" input and "+ Add New" button within each tab to manage your entries.
*   Data is saved in folders specified in the (future) settings (defaults to `StorytellerSuite/Characters`, `StorytellerSuite/Locations`, etc.).

## Funding / Support

If you find this plugin helpful, consider supporting its development!

*(You can replace the example below with your actual funding links, using the format from manifest.json)*
=======
# Obsidian Sample Plugin

This is a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This sample plugin demonstrates some of the basic functionality the plugin API can do.
- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open Sample Modal" which opens a Modal.
- Adds a plugin setting tab to the settings page.
- Registers a global click event and output 'click' to the console.
- Registers a global interval which logs 'setInterval' to the console.

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint .\src\`

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:
>>>>>>> e53eea3b6a77dd5be464eafbf9136e460df3ac21

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

<<<<<<< HEAD
=======
## API Documentation

See https://github.com/obsidianmd/obsidian-api
>>>>>>> e53eea3b6a77dd5be464eafbf9136e460df3ac21
