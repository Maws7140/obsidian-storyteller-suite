import type { App, ButtonComponent, Menu, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../../../main';
import type { DashboardMutationRunner } from '../DashboardMutationRunner';

export type DashboardWritingViewMode = 'list' | 'board' | 'arc' | 'heatmap' | 'holes';

export interface DashboardControllerContext {
    app: App;
    plugin: StorytellerSuitePlugin;
    getCurrentFilter(): string;
    setCurrentFilter(filter: string): void;
    isSimplifiedMobileDashboard(): boolean;
    renderWritingGoalBanner(container: HTMLElement): void;
    getWritingViewMode(): DashboardWritingViewMode;
    setWritingViewMode(mode: DashboardWritingViewMode): void;
    renderWritingMode(mode: DashboardWritingViewMode, container: HTMLElement): Promise<void>;
    renderHeaderControls(
        container: HTMLElement,
        title: string,
        filterFn: (filter: string) => Promise<void>,
        addFn: () => void,
        addButtonText?: string,
        extendButtons?: (s: Setting) => void,
        extendMobileActions?: (menu: Menu) => void
    ): void;
    getImageSrc(imagePath: string): string;
    resolveLocationName(locationValue: string, locations: import('../../../types').Location[]): string;
    addEditButton(container: HTMLElement, onClick: () => void): void;
    addDeleteButton(container: HTMLElement, onClick: () => Promise<void>): void;
    addOpenFileButton(container: HTMLElement, filePath: string | undefined): ButtonComponent | null;
    mutationRunner: DashboardMutationRunner;
    queueDashboardRefresh(detail: string): void;
}

export interface DashboardTabController {
    id: string;
    render(container: HTMLElement, context: DashboardControllerContext): Promise<void>;
}
