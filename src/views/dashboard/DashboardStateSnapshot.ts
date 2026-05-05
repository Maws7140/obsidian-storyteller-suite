import { PlatformUtils } from '../../utils/PlatformUtils';

export interface DashboardStateSnapshot {
    searchValue: string;
    searchWasFocused: boolean;
}

export function captureDashboardStateSnapshot(searchInput: HTMLInputElement | null): DashboardStateSnapshot {
    return {
        searchValue: searchInput?.value ?? '',
        searchWasFocused: document.activeElement === searchInput,
    };
}

export function restoreDashboardStateSnapshot(
    snapshot: DashboardStateSnapshot,
    getSearchInput: () => HTMLInputElement | null,
    onRestoreValue: (value: string) => void,
    shouldRefocus: () => boolean
): void {
    if (!PlatformUtils.isMobile() || (!snapshot.searchValue && !snapshot.searchWasFocused)) {
        return;
    }

    window.setTimeout(() => {
        const searchInput = getSearchInput();
        if (!searchInput) {
            return;
        }

        if (snapshot.searchValue) {
            searchInput.value = snapshot.searchValue;
            onRestoreValue(snapshot.searchValue.toLowerCase());
        }

        if (snapshot.searchWasFocused && shouldRefocus()) {
            searchInput.focus();
        }
    }, 100);
}
