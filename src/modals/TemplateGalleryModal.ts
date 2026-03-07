/**
 * TemplateGalleryModal - Display and select from available map templates
 * Provides visual browsing of templates with filtering and preview
 */

import { App, Modal, ButtonComponent, setIcon } from 'obsidian';
import { MapTemplate, StoryMap } from '../types';
// TODO: Maps feature - MapTemplates to be reimplemented
// import { getAllTemplates, getTemplateCategories, applyTemplate } from '../utils/MapTemplates';
import StorytellerSuitePlugin from '../main';
import { PromptModal } from './ui/PromptModal';

// Temporary stubs until MapTemplates is reimplemented
const getAllTemplates = (): any[] => [];
const getTemplateCategories = (): any[] => [];
const applyTemplate = (template: any, map: any): any => map;

export type TemplateSelectCallback = (template: MapTemplate, mapName: string) => void;

export class TemplateGalleryModal extends Modal {
    plugin: StorytellerSuitePlugin;
    onSelect: TemplateSelectCallback;
    selectedCategory: MapTemplate['category'] | 'all' = 'all';
    templates: MapTemplate[];
    private filterContainerEl: HTMLElement | null = null;
    private gridContainerEl: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, onSelect: TemplateSelectCallback) {
        super(app);
        this.plugin = plugin;
        this.onSelect = onSelect;
        this.templates = getAllTemplates();
        this.modalEl.addClass('storyteller-template-gallery-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const headerEl = contentEl.createDiv('storyteller-template-header');
        headerEl.createEl('h2', { text: 'Choose a Map Template' });
        headerEl.createEl('p', {
            text: 'Select a template to start with, or create a blank map',
            cls: 'storyteller-template-subtitle'
        });

        // Category filter
        this.filterContainerEl = contentEl.createDiv('storyteller-template-filter-host');
        this.renderCategoryFilter(this.filterContainerEl);

        // Template grid
        this.gridContainerEl = contentEl.createDiv('storyteller-template-grid-host');
        this.renderTemplateGrid(this.gridContainerEl);

        // Footer actions
        this.renderFooter(contentEl);
    }

    private renderCategoryFilter(container: HTMLElement): void {
        container.empty();
        const filterContainer = container.createDiv('storyteller-template-filter');

        const categories = [
            { id: 'all' as const, label: 'All Templates', icon: 'layout-grid' },
            ...getTemplateCategories()
        ];

        categories.forEach(category => {
            const filterBtn = filterContainer.createEl('button', {
                cls: 'storyteller-filter-btn'
            });

            if (this.selectedCategory === category.id) {
                filterBtn.addClass('active');
            }

            const iconEl = filterBtn.createSpan('storyteller-filter-icon');
            setIcon(iconEl, category.icon);

            filterBtn.createSpan('storyteller-filter-label').setText(category.label);

            filterBtn.onclick = () => {
                this.selectedCategory = category.id;
                this.renderCategoryFilter(this.filterContainerEl!);
                this.renderTemplateGrid(this.gridContainerEl!);
            };
        });
    }

    private renderTemplateGrid(container: HTMLElement): void {
        container.empty();
        const gridContainer = container.createDiv('storyteller-template-grid');

        // Filter templates by category
        const filteredTemplates = this.selectedCategory === 'all'
            ? this.templates
            : this.templates.filter(t => t.category === this.selectedCategory);

        if (filteredTemplates.length === 0) {
            const emptyState = gridContainer.createDiv('storyteller-empty-state');
            const emptyIcon = emptyState.createEl('div', { cls: 'storyteller-empty-icon' });
            setIcon(emptyIcon, 'inbox');
            emptyState.createEl('p', { text: 'No templates in this category' });
            return;
        }

        filteredTemplates.forEach(template => {
            this.renderTemplateCard(gridContainer, template);
        });
    }

    private renderTemplateCard(container: HTMLElement, template: MapTemplate): void {
        const card = container.createDiv('storyteller-template-card');

        // Thumbnail/Preview
        const preview = card.createDiv('storyteller-template-preview');

        // If template has thumbnail, use it; otherwise show icon
        const iconEl = preview.createEl('div', { cls: 'storyteller-template-icon-large' });
        setIcon(iconEl, this.getCategoryIconName(template.category));

        // Category badge
        const badge = preview.createEl('span', {
            text: template.category.charAt(0).toUpperCase() + template.category.slice(1),
            cls: 'storyteller-template-badge'
        });
        badge.setAttribute('data-category', template.category);

        // Content
        const content = card.createDiv('storyteller-template-content');
        content.createEl('h3', { text: template.name });
        content.createEl('p', {
            text: template.description,
            cls: 'storyteller-template-description'
        });

        // Details
        const details = content.createDiv('storyteller-template-details');

        if (template.markers && template.markers.length > 0) {
            const markerInfo = details.createEl('span', { cls: 'storyteller-template-detail' });
            const markerIcon = markerInfo.createSpan();
            setIcon(markerIcon, 'map-pin');
            markerInfo.createEl('span', { text: ` ${template.markers.length} markers` });
        }

        if (template.gridEnabled) {
            const gridInfo = details.createEl('span', { cls: 'storyteller-template-detail' });
            const gridIcon = gridInfo.createSpan();
            setIcon(gridIcon, 'grid');
            gridInfo.createEl('span', { text: ' Grid enabled' });
        }

        const sizeInfo = details.createEl('span', { cls: 'storyteller-template-detail' });
        const sizeIcon = sizeInfo.createSpan();
        setIcon(sizeIcon, 'ruler');
        sizeInfo.createEl('span', { text: ` ${template.width}×${template.height}` });

        // Actions
        const actions = card.createDiv('storyteller-template-actions');

        new ButtonComponent(actions)
            .setButtonText('Use Template')
            .setCta()
            .onClick(() => {
                this.selectTemplate(template);
            });

        // Hover effect for entire card
        card.onclick = () => {
            this.selectTemplate(template);
        };
    }

    private selectTemplate(template: MapTemplate): void {
        this.close();

        // Prompt for map name using PromptModal
        new PromptModal(this.app, {
            title: 'Name Your Map',
            label: 'Map Name',
            defaultValue: `My ${template.name}`,
            validator: (value) => {
                if (!value || !value.trim()) {
                    return 'Map name cannot be empty';
                }
                return null;
            },
            onSubmit: (mapName) => {
                this.onSelect(template, mapName.trim());
            }
        }).open();
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('storyteller-template-footer');

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });

        new ButtonComponent(footer)
            .setButtonText('Create Blank Map')
            .onClick(() => {
                const blankTemplate = this.templates.find(t => t.id === 'blank-canvas');
                if (blankTemplate) {
                    this.selectTemplate(blankTemplate);
                }
            });
    }

    private getCategoryIconName(category: MapTemplate['category']): string {
        const icons: Record<MapTemplate['category'], string> = {
            'world': 'globe',
            'region': 'map',
            'city': 'building',
            'building': 'home',
            'dungeon': 'sword',
            'battle': 'zap',
            'custom': 'sparkles'
        };
        return icons[category] || 'map-pin';
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
