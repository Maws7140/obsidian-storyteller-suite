import * as L from 'leaflet';

export interface PlacementOverlayOptions {
    /** Main instruction, e.g. "Click map to place Character". */
    text: string;
    /** Secondary hint shown after the instruction. */
    hint?: string;
    /** Called when the Cancel button is tapped or clicked. */
    onCancel: () => void;
    /** Optional extra content (for example an icon) placed before the text. */
    decorate?: (instruction: HTMLElement) => void;
}

/**
 * Instruction bar for a pending map click (placing or moving an item).
 * It has a visible Cancel button because touch users have no Esc key.
 * The caller removes the returned element when the mode ends.
 */
export function createPlacementOverlay(parent: HTMLElement, options: PlacementOverlayOptions): HTMLElement {
    const doc = parent.ownerDocument;
    const overlay = doc.createElement('div');
    overlay.className = 'storyteller-placement-overlay';
    // Clicks on the bar must not reach the map (the overlay may sit inside the Leaflet container).
    L.DomEvent.disableClickPropagation(overlay);

    const instruction = doc.createElement('div');
    instruction.className = 'storyteller-placement-instruction';
    options.decorate?.(instruction);

    const text = doc.createElement('div');
    text.className = 'placement-text';
    text.textContent = options.text;
    instruction.appendChild(text);

    if (options.hint) {
        const hint = doc.createElement('div');
        hint.className = 'placement-hint';
        hint.textContent = options.hint;
        instruction.appendChild(hint);
    }

    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'placement-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', e => {
        e.preventDefault();
        options.onCancel();
    });
    instruction.appendChild(cancel);

    overlay.appendChild(instruction);
    parent.appendChild(overlay);
    return overlay;
}
