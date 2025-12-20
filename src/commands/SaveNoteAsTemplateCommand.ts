/**
 * Save Note as Template Command
 * Command to save the current note as a template
 */

import { TFile, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { SaveNoteAsTemplateModal, SaveNoteAsTemplateResult } from '../modals/SaveNoteAsTemplateModal';
import { NoteToTemplateConverter } from '../templates/NoteToTemplateConverter';
import { TemplateEntityType } from '../templates/TemplateTypes';

export class SaveNoteAsTemplateCommand {
    /**
     * Execute the save note as template command
     */
    static async execute(plugin: StorytellerSuitePlugin, file?: TFile): Promise<void> {
        // Get active file if not provided
        if (!file) {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('Please open a note to save as template');
                return;
            }
            file = activeFile;
        }

        // Check if file is a markdown file
        if (file.extension !== 'md') {
            new Notice('Only markdown files can be saved as templates');
            return;
        }

        // Read file to detect entity type
        let detectedEntityType: TemplateEntityType | null = null;
        try {
            const content = await plugin.app.vault.read(file);
            const { parseFrontmatterFromContent } = await import('../yaml/EntitySections');
            const frontmatter = parseFrontmatterFromContent(content);
            detectedEntityType = NoteToTemplateConverter.detectEntityType(file, frontmatter);
        } catch (error) {
            console.error('Error reading file:', error);
        }

        // Get default name from file
        const defaultName = file.basename.replace(/[-_]/g, ' ');

        // Show modal to collect metadata
        new SaveNoteAsTemplateModal(
            plugin.app,
            plugin,
            detectedEntityType,
            defaultName,
            async (result: SaveNoteAsTemplateResult) => {
                try {
                    // Check if template note manager exists
                    if (!plugin.templateNoteManager) {
                        new Notice('Template note manager not initialized');
                        return;
                    }

                    // Save note as template
                    const template = await plugin.templateNoteManager.saveNoteAsTemplate(
                        file!,
                        result.entityType,
                        {
                            name: result.name,
                            description: result.description,
                            genre: result.genre,
                            category: result.category,
                            tags: result.tags
                        }
                    );

                    new Notice(`Template "${template.name}" saved successfully!`);
                } catch (error) {
                    console.error('Error saving template:', error);
                    new Notice(`Failed to save template: ${error.message}`);
                }
            }
        ).open();
    }
}

