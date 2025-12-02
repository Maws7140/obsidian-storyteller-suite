# Priority Languages for Translation

This document lists languages prioritized for translation based on user base size, writing community activity, and contribution feasibility.

## Tier 1: High Priority

These languages have large user bases and active writing communities:

1. **Spanish (es)** - 500M+ speakers
   - Large writing community
   - Template: `es.json.template`
   - Status: Template available

2. **French (fr)** - 280M+ speakers
   - Significant literary tradition
   - Template: `fr.json.template`
   - Status: Template available

3. **German (de)** - 130M+ speakers
   - Active writing community
   - Template: `de.json.template`
   - Status: Template available

4. **Portuguese (pt)** - 260M+ speakers
   - Growing writing community
   - Template: `pt.json.template`
   - Status: Template available

5. **Japanese (ja)** - 125M+ speakers
   - Active creative writing community
   - Template: `ja.json.template`
   - Status: Template available

6. **Korean (ko)** - 80M+ speakers
   - Growing international presence
   - Template: `ko.json.template`
   - Status: Template available

## Tier 2: Medium Priority

Good potential with moderate communities:

7. **Italian (it)** - 85M+ speakers
   - Literary tradition
   - Status: No template yet

8. **Russian (ru)** - 260M+ speakers
   - Large writing community
   - Status: No template yet

9. **Dutch (nl)** - 24M+ speakers
   - Active tech/writing community
   - Status: No template yet

10. **Polish (pl)** - 45M+ speakers
    - Growing writing community
    - Status: No template yet

11. **Turkish (tr)** - 80M+ speakers
    - Expanding community
    - Status: No template yet

12. **Arabic (ar)** - 310M+ speakers
    - Requires RTL (right-to-left) support consideration
    - Status: No template yet

## Tier 3: Lower Priority

Smaller but valuable communities:

13. **Swedish (sv)** - 10M+ speakers
14. **Norwegian (no)** - 5M+ speakers
15. **Danish (da)** - 6M+ speakers
16. **Finnish (fi)** - 5M+ speakers
17. **Czech (cs)** - 10M+ speakers
18. **Hungarian (hu)** - 13M+ speakers
19. **Greek (el)** - 13M+ speakers
20. **Hebrew (he)** - 9M+ speakers (requires RTL support)

## Special Considerations

### Right-to-Left (RTL) Languages
- Arabic (`ar`)
- Hebrew (`he`)
- May require CSS adjustments for UI layout
- Text content translation works, but UI layout may need additional work

### Character Sets
- **Latin script**: Most Tier 1 languages (Spanish, French, German, Portuguese) - straightforward
- **CJK characters**: Japanese, Korean, Chinese - already supported
- **Cyrillic**: Russian - may need font considerations
- **Other scripts**: Arabic, Hebrew, Greek - may need font considerations

### Pluralization
- Current implementation handles English pluralization automatically
- Many languages have complex plural rules (Polish, Russian, etc.)
- Translators should provide appropriate plural forms
- Future enhancement: consider i18n library for proper pluralization

## How to Contribute

1. Check if a template exists for your language
2. If yes, copy the template: `cp {code}.json.template {code}.json`
3. If no, copy `en.json` as your starting point
4. Translate all string values
5. Follow the instructions in `TRANSLATION_GUIDE.md`
6. Submit a pull request

## Status Legend

- ✅ **Complete** - Translation file exists and is complete
- 🚧 **In Progress** - Translation is being worked on
- 📝 **Template Available** - Template file exists, ready for translation
- ⏳ **Not Started** - No work begun yet

## Current Status

- ✅ English (`en.json`) - Complete (base)
- ✅ Chinese (`zh.json`) - Complete
- 📝 Spanish (`es.json.template`) - Template available
- 📝 French (`fr.json.template`) - Template available
- 📝 German (`de.json.template`) - Template available
- 📝 Portuguese (`pt.json.template`) - Template available
- 📝 Japanese (`ja.json.template`) - Template available
- 📝 Korean (`ko.json.template`) - Template available

