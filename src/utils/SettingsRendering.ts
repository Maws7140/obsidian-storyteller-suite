/**
 * Whether the settings tab should hand Obsidian declarative sub-pages
 * (`getSettingDefinitions`, Obsidian 1.13+) or render itself in `display()`.
 *
 * On Android, Obsidian 1.13 to 1.15 opens the tab blank when it is built from
 * our sub-pages, while the imperative `display()` path that 1.11 used still
 * works (issue #146). Mobile therefore gets the imperative path; desktop keeps
 * the declarative pages and their search indexing.
 */
export function useDeclarativeSettings(platform: { isMobile: boolean }): boolean {
    return !platform.isMobile;
}
