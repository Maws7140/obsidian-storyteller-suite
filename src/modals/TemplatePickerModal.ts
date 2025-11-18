/**
 * Template Picker Modal
 * Quick template selection for entity creation
 */

import { App, SuggestModal } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { Template, TemplateEntityType } from '../templates/TemplateTypes';

export class TemplatePickerModal extends SuggestModal<Template> {
    private plugin: StorytellerSuitePlugin;
    private entityType?: TemplateEntityType;
    private onSelect: (template: Template) => void;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        onSelect: (template: Template) => void,
        entityType?: TemplateEntityType
    ) {
        super(app);
        this.plugin = plugin;
        this.entityType = entityType;
        this.onSelect = onSelect;

        this.setPlaceholder(
            entityType
                ? `Search ${entityType} templates...`
                : 'Search templates...'
        );
    }

    getSuggestions(query: string): Template[] {
        const allTemplates = this.entityType
            ? this.plugin.templateManager.getTemplatesByEntityType(this.entityType)
            : this.plugin.templateManager.getAllTemplates();

        if (!query) {
            // If no query, show recently used and popular templates first
            const recentTemplates = this.plugin.templateManager.getRecentlyUsedTemplates(5)
                .filter(t => !this.entityType || (t.entityTypes && t.entityTypes.includes(this.entityType)));
            const popularTemplates = this.plugin.templateManager.getMostPopularTemplates(5)
                .filter(t => !this.entityType || (t.entityTypes && t.entityTypes.includes(this.entityType)));

            // Combine and deduplicate
            const combined = [...recentTemplates];
            popularTemplates.forEach(t => {
                if (!combined.find(existing => existing.id === t.id)) {
                    combined.push(t);
                }
            });

            // If we have recent/popular templates, show them first, then fill with remaining
            if (combined.length > 0) {
                // Add remaining templates that aren't already in the list
                allTemplates.forEach(t => {
                    if (!combined.find(existing => existing.id === t.id)) {
                        combined.push(t);
                    }
                });
                return combined.slice(0, 20);
            }

            // No recent/popular templates, show all available templates
            return allTemplates.slice(0, 20);
        }

        // Filter by query
        const lowerQuery = query.toLowerCase();
        return allTemplates
            .filter(template =>
                template.name.toLowerCase().includes(lowerQuery) ||
                template.description.toLowerCase().includes(lowerQuery) ||
                template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
            )
            .slice(0, 20);
    }

    renderSuggestion(template: Template, el: HTMLElement): void {
        el.addClass('template-suggestion');

        const titleEl = el.createDiv({ cls: 'template-suggestion-title' });
        titleEl.createSpan({ text: template.name });

        if (template.isBuiltIn) {
            titleEl.createEl('span', {
                text: 'Built-in',
                cls: 'template-badge template-badge-builtin'
            });
        }

        el.createDiv({
            text: template.description,
            cls: 'template-suggestion-description'
        });

        // Show usage count if available
        if (template.usageCount && template.usageCount > 0) {
            el.createDiv({
                text: `Used ${template.usageCount} times`,
                cls: 'template-suggestion-meta'
            });
        }

        // Show entity types
        if (template.entityTypes && template.entityTypes.length > 0) {
            const metaEl = el.createDiv({ cls: 'template-suggestion-meta' });
            metaEl.createSpan({ text: 'Contains: ' });
            template.entityTypes.slice(0, 3).forEach(type => {
                metaEl.createEl('span', {
                    text: type,
                    cls: 'template-entity-type-badge-small'
                });
            });
            if (template.entityTypes.length > 3) {
                metaEl.createSpan({ text: ` +${template.entityTypes.length - 3} more` });
            }
        }

        // Show tags
        if (template.tags && template.tags.length > 0) {
            const tagsEl = el.createDiv({ cls: 'template-suggestion-tags' });
            template.tags.slice(0, 3).forEach(tag => {
                tagsEl.createEl('span', { text: tag, cls: 'template-tag-small' });
            });
        }
    }

    onChooseSuggestion(template: Template): void {
        this.onSelect(template);
    }
}
