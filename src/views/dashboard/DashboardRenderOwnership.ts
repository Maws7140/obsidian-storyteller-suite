/** Separates pending renders from the controls that are still mounted. */
export class DashboardRenderOwnership {
    generation = 0;
    private mounted: number | null = null;

    invalidate(): void {
        ++this.generation;
        this.mounted = null;
    }

    begin() {
        const generation = ++this.generation;
        return {
            // A failed pending refresh must not disable the retained controls.
            isCurrent: () => generation === this.generation || generation === this.mounted,
            commit: () => {
                if (generation !== this.generation) return false;
                this.mounted = generation;
                return true;
            },
        };
    }
}
