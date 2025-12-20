/**
 * Template Entity Detail Modal
 * Simplified editor for individual entities within templates
 * Allows direct editing of YAML frontmatter and markdown content with live preview
 */

import { App, Notice } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import { TemplateEntity, TemplateEntityType } from '../templates/TemplateTypes';
import { entityToYaml, entityToMarkdown, getEntityNotePreview } from '../utils/TemplatePreviewRenderer';
import { stringifyYamlWithEmptyFields } from '../utils/YamlSerializer';
import { parseYaml } from 'obsidian';

export class TemplateEntityDetailModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private entity: TemplateEntity<any>;
    private entityType: TemplateEntityType;
    private onSave: (entity: TemplateEntity<any>) => void;

    // Editor state
    private yamlEditor: HTMLTextAreaElement | null = null;
    private markdownEditor: HTMLTextAreaElement | null = null;
    private previewContainer: HTMLElement | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        entity: TemplateEntity<any>,
        entityType: TemplateEntityType,
        onSave: (entity: TemplateEntity<any>) => void
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
        splitContainer.style.display = 'flex';
        splitContainer.style.gap = '20px';
        splitContainer.style.height = 'calc(100vh - 200px)';

        // Left pane: Editors
        const editorPane = splitContainer.createDiv('entity-detail-editor-pane');
        editorPane.style.flex = '1';
        editorPane.style.display = 'flex';
        editorPane.style.flexDirection = 'column';
        editorPane.style.gap = '10px';
        this.renderEditorPane(editorPane);

        // Right pane: Preview
        const previewPane = splitContainer.createDiv('entity-detail-preview-pane');
        previewPane.style.flex = '1';
        previewPane.style.display = 'flex';
        previewPane.style.flexDirection = 'column';
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
        yamlSection.createEl('h3', { text: 'YAML Frontmatter' });
        yamlSection.createEl('p', {
            text: 'Edit the YAML frontmatter fields. Use {{variableName}} for template variables.',
            cls: 'setting-item-description'
        });

        const yamlTextarea = yamlSection.createEl('textarea', {
            cls: 'entity-detail-yaml-editor',
            placeholder: 'name: {{characterName}}\nstatus: Alive\ntraits: [Brave, Loyal]'
        });
        yamlTextarea.style.width = '100%';
        yamlTextarea.style.flex = '1';
        yamlTextarea.style.minHeight = '200px';
        yamlTextarea.style.fontFamily = 'monospace';
        yamlTextarea.style.fontSize = '12px';
        yamlTextarea.style.padding = '10px';
        yamlTextarea.style.border = '1px solid var(--background-modifier-border)';
        yamlTextarea.style.borderRadius = '4px';
        yamlTextarea.style.resize = 'vertical';

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
        markdownSection.style.flex = '1';
        markdownSection.style.display = 'flex';
        markdownSection.style.flexDirection = 'column';
        markdownSection.createEl('h3', { text: 'Markdown Content' });
        markdownSection.createEl('p', {
            text: 'Edit the markdown body content with sections (e.g., ## Description, ## Backstory).',
            cls: 'setting-item-description'
        });

        const markdownTextarea = markdownSection.createEl('textarea', {
            cls: 'entity-detail-markdown-editor',
            placeholder: '## Description\n\nEnter description here...\n\n## Backstory\n\nEnter backstory here...'
        });
        markdownTextarea.style.width = '100%';
        markdownTextarea.style.flex = '1';
        markdownTextarea.style.minHeight = '200px';
        markdownTextarea.style.fontFamily = 'monospace';
        markdownTextarea.style.fontSize = '12px';
        markdownTextarea.style.padding = '10px';
        markdownTextarea.style.border = '1px solid var(--background-modifier-border)';
        markdownTextarea.style.borderRadius = '4px';
        markdownTextarea.style.resize = 'vertical';

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
        previewBox.style.flex = '1';
        previewBox.style.border = '1px solid var(--background-modifier-border)';
        previewBox.style.borderRadius = '4px';
        previewBox.style.padding = '15px';
        previewBox.style.overflow = 'auto';
        previewBox.style.backgroundColor = 'var(--background-primary)';
        previewBox.style.fontFamily = 'var(--font-text)';
        previewBox.style.fontSize = '14px';
        previewBox.style.lineHeight = '1.6';

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
        codeBlock.style.margin = '0';
        codeBlock.style.whiteSpace = 'pre-wrap';
        codeBlock.style.wordBreak = 'break-word';
        codeBlock.textContent = preview;
    }

    // ==================== FOOTER ====================

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('entity-detail-footer');
        footer.style.marginTop = '20px';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '10px';

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', { text: 'Save Changes', cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => this.handleSave());
    }

    private handleSave(): void {
        // Validate YAML
        if (this.entity.yamlContent) {
            try {
                parseYaml(this.entity.yamlContent);
            } catch (error) {
                new Notice(`Invalid YAML: ${error.message}`);
                return;
            }
        }

        // Extract name from YAML if not set
        if (!this.entity.name && this.entity.yamlContent) {
            try {
                const parsed = parseYaml(this.entity.yamlContent);
                if (parsed && typeof parsed === 'object' && 'name' in parsed) {
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
