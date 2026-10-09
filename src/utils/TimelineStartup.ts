/** Run only after workspace readiness and story discovery, never before UI registration. */
export async function initializeTimelineAfterLayout(steps: {
    hasStory(): boolean;
    migrate(): Promise<void>;
    refresh(): Promise<void>;
    createDefaults(): Promise<void>;
    refreshViews(): void;
    reportError(error: unknown): void;
}): Promise<void> {
    try {
        if (!steps.hasStory()) return;
        await steps.migrate();
        await steps.refresh();
        // Never interpret a failed read as an empty store and create defaults.
        await steps.createDefaults();
        steps.refreshViews();
    } catch (error) {
        steps.reportError(error);
    }
}
