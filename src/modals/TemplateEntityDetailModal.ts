/**
 * Template Entity Detail Modal
 * Simplified editor for individual entities within templates
 * Allows direct editing of YAML frontmatter and markdown content with live preview
 */

import { App, Notice } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import type { TemplateEntity, TemplateEntityType } from '../templates/TemplateTypes';
import { entityToYaml, entityToMarkdown, getEntityNotePreview } from '../utils/TemplatePreviewRenderer';
import { parseYaml } from 'obsidian';

type EditableTemplateEntity = TemplateEntity<Record<string, unknown>> & {
    name?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class TemplateEntityDetailModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private entity: EditableTemplateEntity;
    private entityType: TemplateEntityType;
    private onSave: (entity: EditableTemplateEntity) => void;

    // Editor state
    private yamlEditor: HTMLTextAreaElement | null = null;
    private markdownEditor: HTMLTextAreaElement | null = null;
    private previewContainer: HTMLElement | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        entity: EditableTemplateEntity,
        entityType: TemplateEntityType,
        onSave: (entity: EditableTemplateEntity) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.entity = { ...entity }; // Clone to avoid mutations
        this.entityType = entityType;
        this.onSave = onSave;

        // Migrate old format to new format if needed
        this.migrateToNewFormat();

        this.modalEl.addClass('storyteller-entity-detail-modal');
    }

    /**
     * Migrate entity from old format (sectionContent + customYamlFields) to new format (yamlContent + markdownContent)
     */
    private migrateToNewFormat(): void {
        // If already in new format, skip migration
        if (this.entity.yamlContent !== undefined || this.entity.markdownContent !== undefined) {
            return;
        }

        // Convert to new format
        this.entity.yamlContent = entityToYaml(this.entity);
        this.entity.markdownContent = entityToMarkdown(this.entity);
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.addClass('entity-detail-editor');

        // Header
        this.renderHeader(contentEl);

        // Split-pane layout
        const splitContainer = contentEl.createDiv('entity-detail-split');
        splitContainer.setCssStyles({ display: 'flex' });
        splitContainer.setCssStyles({ gap: '20px' });
        splitContainer.setCssStyles({ height: 'calc(100vh - 200px)' });

        // Left pane: Editors
        const editorPane = splitContainer.createDiv('entity-detail-editor-pane');
        editorPane.setCssStyles({ flex: '1' });
        editorPane.setCssStyles({ display: 'flex' });
        editorPane.setCssStyles({ flexDirection: 'column' });
        editorPane.setCssStyles({ gap: '10px' });
        this.renderEditorPane(editorPane);

        // Right pane: Preview
        const previewPane = splitContainer.createDiv('entity-detail-preview-pane');
        previewPane.setCssStyles({ flex: '1' });
        previewPane.setCssStyles({ display: 'flex' });
        previewPane.setCssStyles({ flexDirection: 'column' });
        this.renderPreviewPane(previewPane);

        // Footer
        this.renderFooter(contentEl);
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('entity-detail-header');
        const entityLabel = this.getEntityTypeLabel(this.entityType);
        const entityName = this.entity.name || 'Unnamed';

        header.createEl('h2', { text: `Edit ${entityLabel}: ${entityName}` });
        header.createEl('p', {
            text: `Edit the YAML frontmatter and markdown content for this ${entityLabel.toLowerCase()}. Changes are previewed on the right.`,
            cls: 'entity-detail-subtitle'
        });
    }

    private renderEditorPane(container: HTMLElement): void {
        // YAML Editor Section
        const yamlSection = container.createDiv('entity-detail-yaml-section');
        yamlSection.createEl('h3', { text: 'YAML frontmatter' });
        yamlSection.createEl('p', {
            text: 'Edit the YAML frontmatter fields. Use {{variableName}} for template variables.',
            cls: 'setting-item-description'
        });

        const yamlTextarea = yamlSection.createEl('textarea', {
            cls: 'entity-detail-yaml-editor',
            placeholder: 'name: {{characterName}}\nstatus: Alive\ntraits: [Brave, Loyal]'
        });
        yamlTextarea.setCssStyles({ width: '100%' });
        yamlTextarea.setCssStyles({ flex: '1' });
        yamlTextarea.setCssStyles({ minHeight: '200px' });
        yamlTextarea.setCssStyles({ fontFamily: 'monospace' });
        yamlTextarea.setCssStyles({ fontSize: '12px' });
        yamlTextarea.setCssStyles({ padding: '10px' });
        yamlTextarea.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        yamlTextarea.setCssStyles({ borderRadius: '4px' });
        yamlTextarea.setCssStyles({ resize: 'vertical' });

        // Set initial value
        yamlTextarea.value = this.entity.yamlContent || entityToYaml(this.entity);
        this.yamlEditor = yamlTextarea;

        // Update on change
        yamlTextarea.addEventListener('input', () => {
            this.entity.yamlContent = yamlTextarea.value;
            this.updatePreview();
        });

        // Markdown Editor Section
        const markdownSection = container.createDiv('entity-detail-markdown-section');
        markdownSection.setCssStyles({ flex: '1' });
        markdownSection.setCssStyles({ display: 'flex' });
        markdownSection.setCssStyles({ flexDirection: 'column' });
        markdownSection.createEl('h3', { text: 'Markdown content' });
        markdownSection.createEl('p', {
            text: 'Edit the Markdown body content with sections (e.g., ## description, ## backstory).',
            cls: 'setting-item-description'
        });

        const markdownTextarea = markdownSection.createEl('textarea', {
            cls: 'entity-detail-markdown-editor',
            placeholder: '## Description\n\nEnter description here...\n\n## Backstory\n\nEnter backstory here...'
        });
        markdownTextarea.setCssStyles({ width: '100%' });
        markdownTextarea.setCssStyles({ flex: '1' });
        markdownTextarea.setCssStyles({ minHeight: '200px' });
        markdownTextarea.setCssStyles({ fontFamily: 'monospace' });
        markdownTextarea.setCssStyles({ fontSize: '12px' });
        markdownTextarea.setCssStyles({ padding: '10px' });
        markdownTextarea.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        markdownTextarea.setCssStyles({ borderRadius: '4px' });
        markdownTextarea.setCssStyles({ resize: 'vertical' });

        // Set initial value
        markdownTextarea.value = this.entity.markdownContent || entityToMarkdown(this.entity);
        this.markdownEditor = markdownTextarea;

        // Update on change
        markdownTextarea.addEventListener('input', () => {
            this.entity.markdownContent = markdownTextarea.value;
            this.updatePreview();
        });
    }

    private renderPreviewPane(container: HTMLElement): void {
        container.createEl('h3', { text: 'Preview' });
        container.createEl('p', {
            text: 'This is how the note will appear when the template is applied.',
            cls: 'setting-item-description'
        });

        const previewBox = container.createDiv('entity-detail-preview-box');
        previewBox.setCssStyles({ flex: '1' });
        previewBox.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        previewBox.setCssStyles({ borderRadius: '4px' });
        previewBox.setCssStyles({ padding: '15px' });
        previewBox.setCssStyles({ overflow: 'auto' });
        previewBox.setCssStyles({ backgroundColor: 'var(--background-primary)' });
        previewBox.setCssStyles({ fontFamily: 'var(--font-text)' });
        previewBox.setCssStyles({ fontSize: '14px' });
        previewBox.setCssStyles({ lineHeight: '1.6' });

        this.previewContainer = previewBox;
        this.updatePreview();
    }

    private updatePreview(): void {
        if (!this.previewContainer) return;

        const yaml = this.entity.yamlContent || entityToYaml(this.entity);
        const markdown = this.entity.markdownContent || entityToMarkdown(this.entity);

        // Render preview
        const preview = getEntityNotePreview({ yamlContent: yaml, markdownContent: markdown });

        // Clear and update preview
        this.previewContainer.empty();

        // Render as code block for now (could be enhanced with markdown rendering)
        const codeBlock = this.previewContainer.createEl('pre', {
            cls: 'entity-detail-preview-code'
        });
        codeBlock.setCssStyles({ margin: '0' });
        codeBlock.setCssStyles({ whiteSpace: 'pre-wrap' });
        codeBlock.setCssStyles({ wordBreak: 'break-word' });
        codeBlock.textContent = preview;
    }

    // ==================== FOOTER ====================

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('entity-detail-footer');
        footer.setCssStyles({ marginTop: '20px' });
        footer.setCssStyles({ display: 'flex' });
        footer.setCssStyles({ justifyContent: 'flex-end' });
        footer.setCssStyles({ gap: '10px' });

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', { text: 'Save changes', cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => this.handleSave());
    }

    private handleSave(): void {
        // Validate YAML
        if (this.entity.yamlContent) {
            try {
                parseYaml(this.entity.yamlContent);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Invalid YAML: ${message}`);
                return;
            }
        }

        // Extract name from YAML if not set
        if (!this.entity.name && this.entity.yamlContent) {
            try {
                const parsed = parseYaml(this.entity.yamlContent) as unknown;
                if (isRecord(parsed) && 'name' in parsed) {
                    this.entity.name = String(parsed.name || 'Unnamed');
                }
            } catch {
                // Ignore parsing errors for name extraction
            }
        }

        // Ensure name is set
        if (!this.entity.name || this.entity.name.trim() === '') {
            new Notice('Please ensure the YAML contains a "name" field or set a name for this entity');
            return;
        }

        // Call onSave callback
        this.onSave(this.entity);

        new Notice('Entity updated successfully!');
        this.close();
    }

    // ==================== HELPER METHODS ====================

    private getEntityTypeLabel(entityType: TemplateEntityType): string {
        const labelMap: Record<TemplateEntityType, string> = {
            character: 'Character',
            location: 'Location',
            event: 'Event',
            item: 'Item',
            group: 'Group',
            map: 'Map',
            culture: 'Culture',
            economy: 'Economy',
            magicSystem: 'Magic System',
            chapter: 'Chapter',
            scene: 'Scene',
            reference: 'Reference'
        };
        return labelMap[entityType];
    }

    onClose(): void {
        this.contentEl.empty();
        this.yamlEditor = null;
        this.markdownEditor = null;
        this.previewContainer = null;
    }
}
