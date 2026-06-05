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
            new Notice('Only Markdown files can be saved as templates');
            return;
        }

        // Read file to detect entity type
        let detectedEntityType: TemplateEntityType | null = null;
        try {
            const content = await plugin.app.vault.read(file);
            const { parseFrontmatterFromContent } = await import('../yaml/EntitySections');
            const frontmatter = parseFrontmatterFromContent(content);
            detectedEntityType = NoteToTemplateConverter.detectEntityType(file, frontmatter);
        } catch {
        	// intentional
            
        }

        // Get default name from file
        const targetFile = file;
        const defaultName = targetFile.basename.replace(/[-_]/g, ' ');

        // Show modal to collect metadata
        new SaveNoteAsTemplateModal(
            plugin.app,
            plugin,
            detectedEntityType,
            defaultName,
            (result: SaveNoteAsTemplateResult) => { void (async () => {
                try {
                    // Check if template note manager exists
                    if (!plugin.templateNoteManager) {
                        new Notice('Template note manager not initialized');
                        return;
                    }

                    // Save note as template
                    const template = await plugin.templateNoteManager.saveNoteAsTemplate(
                        targetFile,
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
                    
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Failed to save template: ${message}`);
                }
            })(); }
        ).open();
    }
}

