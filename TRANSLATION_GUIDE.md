# Translation Guide for Storyteller Suite

Thank you for your interest in translating Storyteller Suite! This guide will help you add support for your language.

## Quick Start

1. Copy `src/i18n/locales/en.json` to `src/i18n/locales/{your-language-code}.json`
2. Translate all the string values (keep the keys unchanged)
3. Update the code to register your language (see below)
4. Test your translations
5. Submit a pull request

## Language Code Format

Use ISO 639-1 two-letter language codes:
- `es` for Spanish
- `fr` for French
- `de` for German
- `pt` for Portuguese
- `ja` for Japanese
- `ko` for Korean
- etc.

## File Structure

All translation files are located in `src/i18n/locales/`:
```
src/i18n/locales/
├── en.json (English - base/reference)
├── zh.json (Chinese - existing)
├── es.json (Spanish - add your language here)
└── ...
```

## Translation Rules

### 1. Keep All Keys Identical
- **DO**: Copy the exact keys from `en.json`
- **DON'T**: Change, add, or remove any keys
- All language files must have the same structure

### 2. Translate String Values Only
- Translate the values (right side of the colon)
- Keep the keys (left side) exactly as in English

Example:
```json
{
  "dashboardTitle": "Storyteller suite",  // English
  "dashboardTitle": "Suite de narrador"   // Spanish - translate value only
}
```

### 3. Template Placeholders
- Keep placeholders `{0}`, `{1}`, `{2}`, etc. exactly as they appear
- These are replaced with dynamic values at runtime
- You may reorder them if needed for your language's grammar

Example:
```json
{
  "storyCreated": "Story \"{0}\" created and activated.",
  "storyCreated": "Historia \"{0}\" creada y activada."  // Spanish
}
```

### 4. Escape Special Characters
- Use `\"` for quotes inside strings
- Use `\\n` for newlines
- Use `\\` for backslashes

Example:
```json
{
  "beatSheetExample": "- Meet the mentor\\n- The refusal"
}
```

### 5. Pluralization
- Currently, pluralization is handled automatically for English
- For other languages, translators should provide the appropriate plural form
- The system will use the template as-is for non-English languages

## Adding Your Language to the Code

After creating your JSON file, you need to register it in the codebase. The system is now dynamic and will automatically detect your language once registered!

### Step 1: Update `src/i18n/strings.ts`

Add your language import and register it in the language registry:

```typescript
import enJson from './locales/en.json';
import zhJson from './locales/zh.json';
import esJson from './locales/es.json';  // Add your language import

// Language registry - add your language here
const languageRegistry: Record<string, Record<string, string>> = {
  en: enJson as Record<string, string>,
  zh: zhJson as Record<string, string>,
  es: esJson as Record<string, string>,  // Add your language to the registry
};
```

**That's it!** The language will automatically appear in the settings dropdown. The system is designed to:
- Automatically detect available languages
- Show them in the language selector
- Handle fallbacks if a translation is missing
- Support any language code you add to the `Lang` type

### Optional: Add Language Display Name

If your language code isn't already in the `languageNames` object, add it:

```typescript
const languageNames: Record<string, string> = {
  // ... existing languages
  es: 'Spanish (Español)',  // Add your language display name
};
```

The display name will appear in the language selector dropdown.

## Priority Languages

We're particularly interested in translations for:

### Tier 1 (High Priority)
- **Spanish (es)** - 500M+ speakers
- **French (fr)** - 280M+ speakers
- **German (de)** - 130M+ speakers
- **Portuguese (pt)** - 260M+ speakers
- **Japanese (ja)** - 125M+ speakers
- **Korean (ko)** - 80M+ speakers

### Tier 2 (Medium Priority)
- Italian (it), Russian (ru), Dutch (nl), Polish (pl), Turkish (tr), Arabic (ar)

### Tier 3 (Lower Priority)
- Swedish (sv), Norwegian (no), Danish (da), Finnish (fi), Czech (cs), Hungarian (hu), Greek (el), Hebrew (he)

## Special Considerations

### Right-to-Left (RTL) Languages
Languages like Arabic and Hebrew read right-to-left. The current implementation handles text content, but UI layout may need additional CSS adjustments. If you're translating an RTL language, please note this in your pull request.

### Character Sets
- Most languages use Latin script (straightforward)
- Japanese/Korean use their own scripts
- Chinese is already supported
- Ensure your JSON file is saved with UTF-8 encoding

### Pluralization
- English uses simple pluralization (add 's')
- Many languages have complex plural rules
- Current implementation handles English pluralization automatically
- For other languages, provide the appropriate form in your translation

## Testing Your Translation

1. Build the plugin: `npm run build`
2. Load the plugin in Obsidian
3. Go to Settings → Storyteller Suite → Language
4. Select your language
5. Navigate through the plugin and verify translations appear correctly
6. Check the browser console for any missing translation warnings

## Common Issues

### Missing Translations
If a translation key is missing, the system will:
1. Fall back to English
2. Log a warning to the console
3. Display the key name as a last resort

### Template Placeholder Errors
- Ensure all `{0}`, `{1}`, etc. placeholders are preserved
- Don't add extra placeholders
- Don't remove placeholders even if they seem unused

### JSON Syntax Errors
- Validate your JSON file before submitting
- Use a JSON validator or linter
- Ensure all strings are properly quoted
- Check for trailing commas

## Getting Help

- Check existing translations (`en.json`, `zh.json`) for reference
- Open an issue on GitHub if you need help
- Join the community discussions

## Contributing

1. Fork the repository
2. Create your translation file
3. Update the code to register your language
4. Test thoroughly
5. Submit a pull request with:
   - Your translation file
   - Code changes to register the language
   - A brief description of your translation

Thank you for helping make Storyteller Suite accessible to more users!

