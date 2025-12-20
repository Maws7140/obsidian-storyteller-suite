/**
 * Story Template Gallery Modal
 * Browse and select story templates (Fantasy Kingdom, Cyberpunk Metropolis, etc.)
 */

import { App, Modal, ButtonComponent, setIcon, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../../main';
import { Template, TemplateFilter, TemplateGenre, TemplateCategory } from '../TemplateTypes';
import { TemplateStorageManager } from '../TemplateStorageManager';
import { StoryTemplateDetailModal } from './StoryTemplateDetailModal';
import { TemplateEditorModal } from '../../modals/TemplateEditorModal';

export class StoryTemplateGalleryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    templateManager: TemplateStorageManager;
    private selectedGenre: TemplateGenre | 'all' = 'all';
    private selectedCategory: TemplateCategory | 'all' = 'all';
    private searchText: string = '';

    constructor(app: App, plugin: StorytellerSuitePlugin, templateManager: TemplateStorageManager) {
        super(app);
        this.plugin = plugin;
        this.templateManager = templateManager;
        this.modalEl.addClass('storyteller-story-template-gallery-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        this.renderHeader(contentEl);

        // Filters
        this.renderFilters(contentEl);

        // Template grid
        this.renderTemplateGrid(contentEl);

        // Footer
        this.renderFooter(contentEl);
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('storyteller-template-header');
        header.createEl('h2', { text: '📚 Story Template Gallery' });
        header.createEl('p', {
            text: 'Choose a pre-built template to jumpstart your story with characters, locations, and relationships',
            cls: 'storyteller-template-subtitle'
        });
    }

    private renderFilters(container: HTMLElement): void {
        const filterSection = container.createDiv('storyteller-template-filters');

        // Genre filter
        const genreFilter = filterSection.createDiv('storyteller-filter-row');
        genreFilter.createEl('label', { text: 'Genre:' });
        const genreButtons = genreFilter.createDiv('storyteller-filter-buttons');

        const genres: Array<{ id: TemplateGenre | 'all', label: string, icon: string }> = [
            { id: 'all', label: 'All', icon: 'layout-grid' },
            { id: 'fantasy', label: 'Fantasy', icon: 'wand' },
            { id: 'scifi', label: 'Sci-Fi', icon: 'rocket' },
            { id: 'mystery', label: 'Mystery', icon: 'search' },
            { id: 'horror', label: 'Horror', icon: 'skull' },
            { id: 'romance', label: 'Romance', icon: 'heart' },
            { id: 'historical', label: 'Historical', icon: 'landmark' },
            { id: 'custom', label: 'Custom', icon: 'star' }
        ];

        genres.forEach(genre => {
            const btn = genreButtons.createEl('button', {
                cls: 'storyteller-filter-btn'
            });

            if (this.selectedGenre === genre.id) {
                btn.addClass('active');
            }

            const iconEl = btn.createSpan('storyteller-filter-icon');
            setIcon(iconEl, genre.icon);
            btn.createSpan().setText(genre.label);

            btn.onclick = () => {
                this.selectedGenre = genre.id;
                this.onOpen();
            };
        });

        // Category filter
        const categoryFilter = filterSection.createDiv('storyteller-filter-row');
        categoryFilter.createEl('label', { text: 'Category:' });
        const categoryButtons = categoryFilter.createDiv('storyteller-filter-buttons');

        const categories: Array<{ id: TemplateCategory | 'all', label: string }> = [
            { id: 'all', label: 'All' },
            { id: 'full-world', label: 'Full World' },
            { id: 'entity-set', label: 'Entity Set' },
            { id: 'single-entity', label: 'Single Entity' }
        ];

        categories.forEach(category => {
            const btn = categoryButtons.createEl('button', {
                cls: 'storyteller-filter-btn'
            });

            if (this.selectedCategory === category.id) {
                btn.addClass('active');
            }

            btn.setText(category.label);
            btn.onclick = () => {
                this.selectedCategory = category.id;
                this.onOpen();
            };
        });

        // Search box
        const searchRow = filterSection.createDiv('storyteller-filter-row');
        searchRow.createEl('label', { text: 'Search:' });
        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: 'Search templates...',
            value: this.searchText
        });
        searchInput.addClass('storyteller-search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchText = (e.target as HTMLInputElement).value;
            this.onOpen();
        });
    }

    private renderTemplateGrid(container: HTMLElement): void {
        const gridContainer = container.createDiv('storyteller-template-grid');

        // Build filter
        const filter: TemplateFilter = {
            searchText: this.searchText || undefined,
            showBuiltIn: true,
            showCustom: true
        };

        if (this.selectedGenre !== 'all') {
            filter.genre = [this.selectedGenre];
        }

        if (this.selectedCategory !== 'all') {
            filter.category = [this.selectedCategory];
        }

        // Get filtered templates
        const templates = this.templateManager.getFilteredTemplates(filter);

        if (templates.length === 0) {
            const emptyState = gridContainer.createDiv('storyteller-empty-state');
            emptyState.createEl('div', { text: '📭', cls: 'storyteller-empty-icon' });
            emptyState.createEl('p', { text: 'No templates match your filters' });
            return;
        }

        templates.forEach(template => {
            this.renderTemplateCard(gridContainer, template);
        });
    }

    private renderTemplateCard(container: HTMLElement, template: Template): void {
        const card = container.createDiv('storyteller-template-card');

        // Thumbnail/Preview
        const preview = card.createDiv('storyteller-template-preview');
        const iconEl = preview.createDiv('storyteller-template-icon-large');
        iconEl.setText(this.getGenreIcon(template.genre));

        // Badges
        const badges = preview.createDiv('storyteller-template-badges');

        // Genre badge
        const genreBadge = badges.createEl('span', {
            text: template.genre.charAt(0).toUpperCase() + template.genre.slice(1),
            cls: 'storyteller-template-badge'
        });
        genreBadge.setAttribute('data-genre', template.genre);

        // Built-in badge
        if (template.isBuiltIn) {
            const builtInBadge = badges.createEl('span', {
                text: '⭐ Built-in',
                cls: 'storyteller-template-badge storyteller-badge-builtin'
            });
        }

        // Content
        const content = card.createDiv('storyteller-template-content');
        content.createEl('h3', { text: template.name });
        content.createEl('p', {
            text: template.description,
            cls: 'storyteller-template-description'
        });

        // Stats
        const stats = this.templateManager.getTemplateStats(template);
        const details = content.createDiv('storyteller-template-details');

        const entityInfo = details.createEl('span', { cls: 'storyteller-template-stat' });
        entityInfo.createEl('span', { text: '📦 ' });
        entityInfo.createEl('span', { text: `${stats.totalEntities} entities` });

        const relationshipInfo = details.createEl('span', { cls: 'storyteller-template-stat' });
        relationshipInfo.createEl('span', { text: '🔗 ' });
        relationshipInfo.createEl('span', { text: `${stats.totalRelationships} connections` });

        // Entity breakdown (top types)
        const topEntities = Object.entries(stats.entityCounts)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topEntities.length > 0) {
            const breakdownText = topEntities
                .map(([type, count]) => `${count} ${this.pluralizeEntityType(type)}`)
                .join(', ');
            const breakdown = details.createEl('div', {
                text: breakdownText,
                cls: 'storyteller-template-breakdown'
            });
        }

        // Actions
        const actions = card.createDiv('storyteller-template-actions');

        new ButtonComponent(actions)
            .setButtonText('Preview')
            .onClick(() => {
                this.previewTemplate(template);
            });

        new ButtonComponent(actions)
            .setButtonText('Use Template')
            .setCta()
            .onClick(() => {
                this.previewTemplate(template);
            });

        // Make card clickable
        card.onclick = (e) => {
            // Don't trigger if clicking a button
            if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                this.previewTemplate(template);
            }
        };
    }

    private previewTemplate(template: Template): void {
        this.close();
        new StoryTemplateDetailModal(
            this.app,
            this.plugin,
            this.templateManager,
            template
        ).open();
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('storyteller-template-footer');

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });

        new ButtonComponent(footer)
            .setButtonText('Import Template')
            .onClick(() => {
                // TODO: Implement template import
                new Notice('Template import coming soon!');
            });

        new ButtonComponent(footer)
            .setButtonText('Create Custom Template')
            .setCta()
            .onClick(() => {
                this.close();
                new TemplateEditorModal(
                    this.app,
                    this.plugin,
                    null, // null = create new template
                    async (template) => {
                        new Notice(`Template "${template.name}" created! You can now use it.`);
                        // Reopen gallery to show new template
                        new StoryTemplateGalleryModal(this.app, this.plugin, this.templateManager).open();
                    }
                ).open();
            });
    }

    private getGenreIcon(genre: TemplateGenre): string {
        const icons: Record<TemplateGenre, string> = {
            fantasy: '🏰',
            scifi: '🚀',
            mystery: '🔍',
            horror: '👻',
            romance: '💕',
            historical: '🏛️',
            western: '🤠',
            thriller: '🔪',
            custom: '✨'
        };
        return icons[genre] || '📚';
    }

    private pluralizeEntityType(type: string): string {
        const plurals: Record<string, string> = {
            character: 'characters',
            location: 'locations',
            event: 'events',
            item: 'items',
            group: 'groups',
            culture: 'cultures',
            economy: 'economies',
            magicSystem: 'magic systems',
            chapter: 'chapters',
            scene: 'scenes',
            reference: 'references'
        };
        return plurals[type] || type + 's';
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
