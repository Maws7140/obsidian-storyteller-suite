/**
 * Story Template Detail Modal
 * Shows detailed preview of a template and allows applying it to current story
 */

import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../../main';
import { Template, TemplateApplicationOptions } from '../TemplateTypes';
import { TemplateStorageManager } from '../TemplateStorageManager';
import { TemplateApplicator } from '../TemplateApplicator';

export class StoryTemplateDetailModal extends Modal {
    plugin: StorytellerSuitePlugin;
    templateManager: TemplateStorageManager;
    template: Template;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        templateManager: TemplateStorageManager,
        template: Template
    ) {
        super(app);
        this.plugin = plugin;
        this.templateManager = templateManager;
        this.template = template;
        this.modalEl.addClass('storyteller-template-detail-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header with back button
        this.renderHeader(contentEl);

        // Template info
        this.renderTemplateInfo(contentEl);

        // Entity breakdown
        this.renderEntityBreakdown(contentEl);

        // Preview content
        this.renderPreview(contentEl);

        // Footer actions
        this.renderFooter(contentEl);
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('storyteller-template-detail-header');

        // Back button
        const backBtn = header.createEl('button', {
            cls: 'storyteller-back-btn'
        });
        backBtn.setText('← Back to Gallery');
        backBtn.onclick = () => {
            this.close();
            // Optionally reopen gallery
        };

        // Title
        header.createEl('h2', { text: this.template.name });
    }

    private renderTemplateInfo(container: HTMLElement): void {
        const infoSection = container.createDiv('storyteller-template-info');

        // Metadata row
        const metaRow = infoSection.createDiv('storyteller-template-meta');

        const genreBadge = metaRow.createEl('span', {
            text: this.template.genre.charAt(0).toUpperCase() + this.template.genre.slice(1),
            cls: 'storyteller-badge'
        });
        genreBadge.setAttribute('data-genre', this.template.genre);

        const categoryBadge = metaRow.createEl('span', {
            text: this.template.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            cls: 'storyteller-badge'
        });

        if (this.template.isBuiltIn) {
            metaRow.createEl('span', {
                text: '⭐ Built-in',
                cls: 'storyteller-badge storyteller-badge-builtin'
            });
        }

        metaRow.createEl('span', {
            text: `v${this.template.version}`,
            cls: 'storyteller-version'
        });

        metaRow.createEl('span', {
            text: `by ${this.template.author}`,
            cls: 'storyteller-author'
        });

        // Description
        infoSection.createEl('p', {
            text: this.template.description,
            cls: 'storyteller-template-description'
        });

        // Tags
        if (this.template.tags && this.template.tags.length > 0) {
            const tagsContainer = infoSection.createDiv('storyteller-template-tags');
            this.template.tags.forEach(tag => {
                tagsContainer.createEl('span', {
                    text: `#${tag}`,
                    cls: 'storyteller-tag'
                });
            });
        }

        // Setup instructions (if any)
        if (this.template.metadata?.setupInstructions) {
            const instructions = infoSection.createDiv('storyteller-template-instructions');
            instructions.createEl('h4', { text: 'Setup Instructions' });
            instructions.createEl('p', { text: this.template.metadata.setupInstructions });
        }
    }

    private renderEntityBreakdown(container: HTMLElement): void {
        const breakdownSection = container.createDiv('storyteller-entity-breakdown');
        breakdownSection.createEl('h3', { text: 'Included Entities' });

        const stats = this.templateManager.getTemplateStats(this.template);
        const grid = breakdownSection.createDiv('storyteller-entity-grid');

        // Define entity type display info
        const entityTypes: Array<{
            key: keyof typeof stats.entityCounts;
            label: string;
            icon: string;
        }> = [
            { key: 'character', label: 'Characters', icon: '👤' },
            { key: 'location', label: 'Locations', icon: '📍' },
            { key: 'event', label: 'Events', icon: '📅' },
            { key: 'item', label: 'Items', icon: '📦' },
            { key: 'group', label: 'Groups', icon: '👥' },
            { key: 'culture', label: 'Cultures', icon: '🏛️' },
            { key: 'economy', label: 'Economies', icon: '💰' },
            { key: 'magicSystem', label: 'Magic Systems', icon: '✨' },
            { key: 'chapter', label: 'Chapters', icon: '📖' },
            { key: 'scene', label: 'Scenes', icon: '🎬' },
            { key: 'reference', label: 'References', icon: '📝' }
        ];

        entityTypes.forEach(({ key, label, icon }) => {
            const count = stats.entityCounts[key];
            if (count > 0) {
                const card = grid.createDiv('storyteller-entity-count-card');
                card.createEl('div', { text: icon, cls: 'entity-icon' });
                card.createEl('div', { text: count.toString(), cls: 'entity-count' });
                card.createEl('div', { text: label, cls: 'entity-label' });
            }
        });

        // Total stats
        const totals = breakdownSection.createDiv('storyteller-entity-totals');
        totals.createEl('strong', { text: `Total: ${stats.totalEntities} entities` });
        totals.createEl('span', { text: ` • ${stats.totalRelationships} relationships` });
    }

    private renderPreview(container: HTMLElement): void {
        const previewSection = container.createDiv('storyteller-template-preview-section');
        previewSection.createEl('h3', { text: 'Preview' });

        // Entity lists (collapsed by default)
        this.renderEntityList(previewSection, 'Characters', this.template.entities.characters || [], '👤');
        this.renderEntityList(previewSection, 'Locations', this.template.entities.locations || [], '📍');
        this.renderEntityList(previewSection, 'Events', this.template.entities.events || [], '📅');
        this.renderEntityList(previewSection, 'Groups', this.template.entities.groups || [], '👥');
        this.renderEntityList(previewSection, 'Items', this.template.entities.items || [], '📦');
        this.renderEntityList(previewSection, 'Cultures', this.template.entities.cultures || [], '🏛️');
        this.renderEntityList(previewSection, 'Economies', this.template.entities.economies || [], '💰');
        this.renderEntityList(previewSection, 'Magic Systems', this.template.entities.magicSystems || [], '✨');
    }

    private renderEntityList(container: HTMLElement, title: string, entities: any[], icon: string): void {
        if (entities.length === 0) return;

        const section = container.createDiv('storyteller-entity-list-section');
        const header = section.createDiv('storyteller-entity-list-header');
        header.createEl('span', { text: `${icon} ${title} (${entities.length})` });

        const toggleBtn = header.createEl('button', {
            text: '▼',
            cls: 'storyteller-toggle-btn'
        });

        const list = section.createDiv('storyteller-entity-list');
        list.style.display = 'none'; // Start collapsed

        entities.slice(0, 10).forEach((entity: any) => {
            const item = list.createDiv('storyteller-entity-list-item');
            item.createEl('strong', { text: entity.name });
            if (entity.description) {
                item.createEl('p', { text: entity.description });
            }
        });

        if (entities.length > 10) {
            list.createEl('p', {
                text: `... and ${entities.length - 10} more`,
                cls: 'storyteller-more-items'
            });
        }

        // Toggle functionality
        let isExpanded = false;
        toggleBtn.onclick = () => {
            isExpanded = !isExpanded;
            list.style.display = isExpanded ? 'block' : 'none';
            toggleBtn.setText(isExpanded ? '▲' : '▼');
        };
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('storyteller-template-footer');

        // Application mode selector
        const modeSection = footer.createDiv('storyteller-mode-section');
        modeSection.createEl('label', { text: 'Application Mode:' });

        const modeRadios = modeSection.createDiv('storyteller-radio-group');

        const mergeRadio = modeRadios.createEl('label');
        const mergeInput = mergeRadio.createEl('input', { type: 'radio', value: 'merge' });
        mergeInput.setAttribute('name', 'applyMode');
        mergeInput.checked = true;
        mergeRadio.createSpan().setText(' Merge with existing story');

        const replaceRadio = modeRadios.createEl('label');
        const replaceInput = replaceRadio.createEl('input', { type: 'radio', value: 'replace' });
        replaceInput.setAttribute('name', 'applyMode');
        replaceRadio.createSpan().setText(' Replace current story');

        // Actions
        const actions = footer.createDiv('storyteller-template-actions');

        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });

        if (!this.template.isBuiltIn && this.template.isEditable) {
            new ButtonComponent(actions)
                .setButtonText('Edit Template')
                .onClick(() => {
                    new Notice('Template editor coming soon!');
                });
        }

        if (this.template.isBuiltIn) {
            new ButtonComponent(actions)
                .setButtonText('Copy & Customize')
                .onClick(async () => {
                    try {
                        const copy = await this.templateManager.copyTemplate(
                            this.template.id,
                            `${this.template.name} (Custom)`
                        );
                        new Notice(`Created custom copy: ${copy.name}`);
                    } catch (error) {
                        new Notice(`Failed to copy template: ${error.message}`);
                    }
                });
        }

        new ButtonComponent(actions)
            .setButtonText('Customize Before Applying')
            .onClick(() => {
                new Notice('Template customization coming soon!');
            });

        new ButtonComponent(actions)
            .setButtonText('Apply Template')
            .setCta()
            .onClick(async () => {
                await this.applyTemplate();
            });
    }

    private async applyTemplate(): Promise<void> {
        // Get active story
        const activeStoryId = this.plugin.settings.activeStoryId;
        if (!activeStoryId) {
            new Notice('Please select or create a story first');
            return;
        }

        // Get application mode
        const modeInput = this.contentEl.querySelector('input[name="applyMode"]:checked') as HTMLInputElement;
        const mode = (modeInput?.value || 'merge') as 'merge' | 'replace';

        // Confirm if replacing
        if (mode === 'replace') {
            const confirmed = await this.confirmReplace();
            if (!confirmed) return;
        }

        this.close();

        // Show progress notice
        const notice = new Notice('Applying template... This may take a moment.', 0);

        try {
            // Create applicator and apply template
            const applicator = new TemplateApplicator(this.plugin);
            const options: TemplateApplicationOptions = {
                storyId: activeStoryId,
                mode,
                mergeRelationships: mode === 'merge'
            };

            const result = await applicator.applyTemplate(this.template, options);

            notice.hide();

            if (result.success) {
                new Notice(
                    `Template "${this.template.name}" applied successfully! ` +
                    `Created ${result.created.characters.length} characters, ` +
                    `${result.created.locations.length} locations, and more.`,
                    8000
                );

                // Refresh dashboard if open
                // The plugin's vault event listeners will handle the refresh
            } else {
                new Notice(`Failed to apply template: ${result.error}`, 8000);
            }
        } catch (error) {
            notice.hide();
            new Notice(`Error applying template: ${error.message}`, 8000);
            console.error('Template application error:', error);
        }
    }

    private async confirmReplace(): Promise<boolean> {
        return new Promise((resolve) => {
            const confirmModal = new Modal(this.app);
            confirmModal.contentEl.createEl('h2', { text: '⚠️ Replace Story?' });
            confirmModal.contentEl.createEl('p', {
                text: 'This will delete all existing entities in the current story and replace them with the template. This action cannot be undone!'
            });
            confirmModal.contentEl.createEl('p', {
                text: 'Are you sure you want to proceed?',
                cls: 'mod-warning'
            });

            const buttonContainer = confirmModal.contentEl.createDiv('modal-button-container');

            new ButtonComponent(buttonContainer)
                .setButtonText('Cancel')
                .onClick(() => {
                    confirmModal.close();
                    resolve(false);
                });

            new ButtonComponent(buttonContainer)
                .setButtonText('Replace Story')
                .setWarning()
                .onClick(() => {
                    confirmModal.close();
                    resolve(true);
                });

            confirmModal.open();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
