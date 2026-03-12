# Create 1.7.0 Release via GitHub Actions

1. Go to:
   - `https://github.com/Maws7140/obsidian-storyteller-suite/actions/workflows/release.yml`

2. Click `Run workflow`

3. Enter:
   - Version: `1.7.0`
   - Release notes:
     ```
     - New campaign and DnD mode with sessions, party state, item effects, lore reveals, and faction standing
     - Timeline and Gantt redesign with dependencies, grouped lanes, progress rendering, and stability fixes
     - Campaign boards and map improvements, including SVG support through overlay and tiled raster modes
     - New character sheet presets, gallery improvements, and onboarding/update guides
     ```

4. Click `Run workflow`

Notes:
- The release workflow now keeps the current `minAppVersion` unless you change it intentionally in `manifest.json`.
- The workflow now publishes `main.js`, `manifest.json`, and `styles.css`, which is the release asset set Obsidian expects.
- The release tag format is the plain version number, matching the existing live releases.
