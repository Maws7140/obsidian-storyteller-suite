# Template System Integration Guide

This guide shows how to integrate the template system into entity modals and list modals.

## Integration into Entity Creation Modals (e.g., CharacterModal.ts)

### Step 1: Import the Template Picker

```typescript
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { TemplateApplicator } from '../templates/TemplateApplicator';
```

### Step 2: Add Template Selector to Modal

Add this code right after the modal title (around line 55 in CharacterModal.ts):

```typescript
// --- Template Selector (NEW for template support) ---
if (this.isNew) {
    new Setting(contentEl)
        .setName('Start from Template')
        .setDesc('Optionally start with a pre-configured character template')
        .addButton(button => button
            .setButtonText('Choose Template')
            .setTooltip('Select a character template')
            .onClick(() => {
                new TemplatePickerModal(
                    this.app,
                    this.plugin,
                    async (template: Template) => {
                        await this.applyTemplateToCharacter(template);
                        this.refresh(); // Refresh the modal to show template values
                        new Notice(`Template "${template.name}" applied`);
                    },
                    'character' // Filter to character templates only
                ).open();
            })
        );
}
```

### Step 3: Add Template Application Method

Add this method to the CharacterModal class:

```typescript
private async applyTemplateToCharacter(template: Template): Promise<void> {
    if (!template.entities.characters || template.entities.characters.length === 0) {
        new Notice('This template does not contain any characters');
        return;
    }

    // Get the first character from the template
    const templateChar = template.entities.characters[0];

    // Apply template fields to current character (excluding templateId)
    Object.keys(templateChar).forEach(key => {
        if (key !== 'templateId' && key !== 'id' && key !== 'filePath') {
            (this.character as any)[key] = (templateChar as any)[key];
        }
    });

    // Clear relationships if we don't want to preserve them
    this.character.relationships = [];
    this.character.locations = [];
    this.character.events = [];
    this.character.groups = [];
}

private refresh(): void {
    // Refresh the modal by reopening it
    this.onOpen();
}
```

## Integration into Entity List Modals (e.g., CharacterListModal.ts)

### Step 1: Add "New from Template" Button

Add this code alongside the existing "New Character" button:

```typescript
import { TemplatePickerModal } from './TemplatePickerModal';
import { TemplateApplicator } from '../templates/TemplateApplicator';

// In the displayContent() method, add next to "New Character" button:

const newFromTemplateButton = buttonContainer.createEl('button', {
    text: 'New from Template',
    cls: 'clickable-icon'
});

newFromTemplateButton.addEventListener('click', () => {
    new TemplatePickerModal(
        this.app,
        this.plugin,
        async (template: Template) => {
            await this.createCharacterFromTemplate(template);
        },
        'character'
    ).open();
});
```

### Step 2: Add Create From Template Method

```typescript
private async createCharacterFromTemplate(template: Template): Promise<void> {
    try {
        const applicator = new TemplateApplicator(this.plugin);

        const result = await applicator.applyTemplate(template, {
            storyId: this.plugin.settings.selectedStory || 'default',
            mode: 'merge',
            skipRelationships: true // Don't create relationships for single entity
        });

        if (result.success && result.created.characters.length > 0) {
            new Notice(`Created ${result.created.characters.length} character(s) from template`);
            this.refresh();
        }
    } catch (error) {
        console.error('Error creating from template:', error);
        new Notice('Failed to create character from template');
    }
}
```

### Step 3: Add Context Menu Option (Optional)

Add "Save as Template" to existing entity context menus:

```typescript
import { CreateTemplateFromEntityModal } from './CreateTemplateFromEntityModal';

// In the context menu creation:
contextMenu.addItem(item => {
    item
        .setTitle('Save as Template')
        .setIcon('star')
        .onClick(() => {
            new CreateTemplateFromEntityModal(
                this.app,
                this.plugin,
                character,
                'character',
                (template) => {
                    new Notice(`Template "${template.name}" created!`);
                }
            ).open();
        });
});
```

## Opening the Template Library

Add a command or ribbon icon to open the template library:

```typescript
import { TemplateLibraryModal } from './modals/TemplateLibraryModal';

// In main.ts, add command:
this.addCommand({
    id: 'open-template-library',
    name: 'Open Template Library',
    callback: () => {
        new TemplateLibraryModal(this.app, this).open();
    }
});

// Or add ribbon icon:
this.addRibbonIcon('star', 'Template Library', () => {
    new TemplateLibraryModal(this.app, this).open();
});
```

## Summary

The template system is now ready to use! Users can:

1. **Browse templates** via the Template Library
2. **Create templates** from existing entities using "Save as Template"
3. **Use templates** when creating new entities via "New from Template"
4. **Start with templates** in entity modals using the template selector

All template operations track usage automatically and support filtering by entity type, genre, and other criteria.
