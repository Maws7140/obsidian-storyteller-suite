type RefreshableSuggestModal = {
    inputEl?: HTMLInputElement;
    setQuery?: (query: string) => void;
    onInputChanged?: () => void;
};

function refreshSuggestModal(modal: RefreshableSuggestModal): void {
    if (modal.inputEl) {
        try { modal.setQuery?.(''); } catch { /* Ignore best-effort refresh errors. */ }
        try { modal.inputEl.dispatchEvent(new window.Event('input')); } catch { /* Ignore best-effort refresh errors. */ }
    }
    try { modal.onInputChanged?.(); } catch { /* Ignore best-effort refresh errors. */ }
}

export function scheduleSuggestRefresh(modal: RefreshableSuggestModal): void {
    window.setTimeout(() => refreshSuggestModal(modal), 0);
    window.setTimeout(() => refreshSuggestModal(modal), 50);
}
