# Changelog

## Unreleased
- Centralize YAML whitelist and section parsing in `src/yaml/EntitySections.ts` and refactor parsing/builders to use it
- Add `FolderResolver` for all entity folder paths (custom, one-story, default multi-story)
- Replace `prompt/confirm` with `PromptModal`/`ConfirmModal` in group commands
- Add `allowRemoteImages` setting (default false) and block remote images in dashboard/gallery
- Pin dependencies and Node engine; add Vitest with unit tests for FolderResolver, YAML/sections, and DateParsing
- Add Dependabot/Renovate configs
