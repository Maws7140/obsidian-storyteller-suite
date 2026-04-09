export function upgradeLegacyModalLayout(contentEl: HTMLElement, modalEl?: HTMLElement): void {
    const actionEl = Array.from(contentEl.children).find((child) =>
        child instanceof HTMLElement &&
        (child.classList.contains('storyteller-modal-buttons') || child.classList.contains('storyteller-modal-footer'))
    ) as HTMLElement | undefined;

    if (!actionEl) return;

    modalEl?.classList.add('storyteller-legacy-modal');
    contentEl.classList.add('storyteller-mobile-modal-layout');

    let scrollEl = Array.from(contentEl.children).find((child) =>
        child instanceof HTMLElement && child.classList.contains('storyteller-mobile-modal-scroll')
    ) as HTMLElement | undefined;

    if (!scrollEl) {
        scrollEl = contentEl.createDiv('storyteller-mobile-modal-scroll');
        const children = Array.from(contentEl.children);
        for (const child of children) {
            if (!(child instanceof HTMLElement)) continue;
            if (child === scrollEl || child === actionEl) continue;
            scrollEl.appendChild(child);
        }
    }

    if (actionEl.parentElement !== contentEl) {
        contentEl.appendChild(actionEl);
    } else {
        contentEl.appendChild(actionEl);
    }
}
