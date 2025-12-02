# Contributing to Storyteller Suite

Thank you for your interest in contributing to Storyteller Suite! This document provides guidelines for contributing.

## Translation Contributions

We welcome translations for Storyteller Suite! This is one of the easiest ways to contribute and help make the plugin accessible to more users.

### Quick Start

1. Read the [Translation Guide](TRANSLATION_GUIDE.md) for detailed instructions
2. Check [Priority Languages](src/i18n/locales/PRIORITY_LANGUAGES.md) to see which languages are most needed
3. Copy a template file from `src/i18n/locales/` (if available) or start from `en.json`
4. Translate all string values
5. Update the code to register your language (see Translation Guide)
6. Test your translation
7. Submit a pull request

### Available Templates

Template files are available for these priority languages:
- Spanish (`es.json.template`)
- French (`fr.json.template`)
- German (`de.json.template`)
- Portuguese (`pt.json.template`)
- Japanese (`ja.json.template`)
- Korean (`ko.json.template`)

To use a template:
```bash
cp src/i18n/locales/es.json.template src/i18n/locales/es.json
```

Then translate all the values in `es.json`.

## Code Contributions

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Run development build: `npm run dev`
4. Make your changes
5. Test thoroughly
6. Submit a pull request

### Code Style

- Follow existing code patterns
- Use TypeScript for type safety
- Add comments for complex logic
- Keep functions focused and small

## Reporting Issues

When reporting bugs or requesting features:

1. Check if the issue already exists
2. Provide clear steps to reproduce
3. Include relevant error messages
4. Specify your environment (OS, Obsidian version, plugin version)

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Update documentation if needed
6. Submit a pull request with a clear description

## Questions?

- Open an issue on GitHub
- Check existing documentation
- Review the Translation Guide for translation-specific questions

Thank you for contributing!

