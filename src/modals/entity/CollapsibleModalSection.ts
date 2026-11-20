import { setIcon } from 'obsidian';

export interface CollapsibleModalSectionOptions {
    title: string;
    description?: string;
    icon?: string;
    open?: boolean;
}

/**
 * Shared entity-modal section shell. Keeping this outside EventModal lets the
 * rest of the entity editors adopt the same structure without copying DOM and
 * accessibility behavior.
 */
export function createCollapsibleModalSection(
    parent: HTMLElement,
    options: CollapsibleModalSectionOptions
): HTMLElement {
    const details = parent.createEl('details', { cls: 'storyteller-modal-section' });
    details.open = options.open === true;
    const summary = details.createEl('summary', { cls: 'storyteller-modal-section-summary' });
    if (options.icon) {
        const icon = summary.createSpan({ cls: 'storyteller-modal-section-icon' });
        setIcon(icon, options.icon);
    }
    const copy = summary.createSpan({ cls: 'storyteller-modal-section-copy' });
    copy.createSpan({ cls: 'storyteller-modal-section-title', text: options.title });
    if (options.description) {
        copy.createSpan({ cls: 'storyteller-modal-section-description', text: options.description });
    }
    return details.createDiv({ cls: 'storyteller-modal-section-body' });
}
