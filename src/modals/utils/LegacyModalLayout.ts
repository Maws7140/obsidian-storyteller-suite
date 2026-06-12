function hasStorytellerOwnedClass(el?: Element | null): boolean {
    if (!el) return false;
    return Array.from(el.classList).some((className) =>
        className.startsWith('storyteller-') || className.startsWith('sts-')
    );
}

function isStorytellerOwnedModalContent(contentEl: HTMLElement, modalEl?: HTMLElement): boolean {
    if (hasStorytellerOwnedClass(modalEl) || hasStorytellerOwnedClass(contentEl)) {
        return true;
    }

    return Array.from(contentEl.querySelectorAll('[class]')).some(hasStorytellerOwnedClass);
}

export function upgradeLegacyModalLayout(contentEl: HTMLElement, modalEl?: HTMLElement): void {
    const actionEl = Array.from(contentEl.children).find((child) =>
        child.instanceOf(HTMLElement) &&
        (child.classList.contains('storyteller-modal-buttons') || child.classList.contains('storyteller-modal-footer'))
    ) as HTMLElement | undefined;

    if (!actionEl) return;
    if (!isStorytellerOwnedModalContent(contentEl, modalEl)) return;

    modalEl?.classList.add('storyteller-legacy-modal');
    contentEl.classList.add('storyteller-mobile-modal-layout');

    let scrollEl = Array.from(contentEl.children).find((child) =>
        child.instanceOf(HTMLElement) && child.classList.contains('storyteller-mobile-modal-scroll')
    ) as HTMLElement | undefined;

    if (!scrollEl) {
        scrollEl = contentEl.createDiv('storyteller-mobile-modal-scroll');
        const children = Array.from(contentEl.children);
        for (const child of children) {
            if (!child.instanceOf(HTMLElement)) continue;
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
