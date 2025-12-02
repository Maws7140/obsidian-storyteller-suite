# Translation Files

This directory contains translation files for the Storyteller Suite plugin.

## Existing Translations

- `en.json` - English (base/reference)
- `zh.json` - Chinese (中文)

## Template Files

The following template files are provided as starting points for new translations:

- `es.json.template` - Spanish template
- `fr.json.template` - French template
- `de.json.template` - German template
- `pt.json.template` - Portuguese template
- `ja.json.template` - Japanese template
- `ko.json.template` - Korean template

## How to Use Templates

1. Copy a template file: `cp es.json.template es.json`
2. Translate all string values in the JSON file
3. Keep all keys identical to `en.json`
4. Follow the instructions in `TRANSLATION_GUIDE.md` in the project root

## File Format

All translation files must:
- Use UTF-8 encoding
- Be valid JSON
- Have identical keys to `en.json`
- Preserve template placeholders `{0}`, `{1}`, etc.

## Contributing

See `TRANSLATION_GUIDE.md` in the project root for detailed instructions on contributing translations.

