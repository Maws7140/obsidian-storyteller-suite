/**
 * Collects the "event saved with conflicts" reports that arrive in a burst and
 * shows one message for the lot. Saving one event shows the same message as
 * before; anything that saves many events at once (a migration, a template, a
 * location move) shows a single summary instead of one notice per event.
 */
export interface ConflictReport {
    errors: number;
    warnings: number;
}

export type ShowNotice = (message: string, durationMs: number) => void;

/** Timer functions, passed in so the plugin can use window timers and tests fake ones. */
export interface NoticeTimers {
    set(fn: () => void, ms: number): number;
    clear(handle: number): void;
}

export class ConflictNoticeBatcher {
    private events = 0;
    private errors = 0;
    private warnings = 0;
    private eventsWithErrors = 0;
    private timer: number | null = null;

    constructor(
        private readonly show: ShowNotice,
        private readonly timers: NoticeTimers,
        private readonly windowMs = 1500,
    ) {}

    /** Record one saved event's conflicts. Events with none are ignored. */
    report({ errors, warnings }: ConflictReport): void {
        if (errors <= 0 && warnings <= 0) return;
        this.events++;
        this.errors += Math.max(0, errors);
        this.warnings += Math.max(0, warnings);
        if (errors > 0) this.eventsWithErrors++;
        if (this.timer !== null) this.timers.clear(this.timer);
        this.timer = this.timers.set(() => this.flush(), this.windowMs);
    }

    /** Show what has been collected, if anything, and start over. */
    flush(): void {
        if (this.timer !== null) { this.timers.clear(this.timer); this.timer = null; }
        if (this.events === 0) return;
        const message = this.events === 1
            ? (this.errors > 0
                ? `⚠️ Event saved with ${this.errors} conflict(s). Use "Detect timeline conflicts" to review.`
                : `⚠ Event saved with ${this.warnings} warning(s)`)
            : (this.eventsWithErrors > 0
                ? `⚠️ ${this.events} events saved with conflicts or warnings. Use "Detect timeline conflicts" to review.`
                : `⚠ ${this.events} events saved with warnings. Use "Detect timeline conflicts" to review.`);
        const duration = this.errors > 0 ? 5000 : 3000;
        this.events = this.errors = this.warnings = this.eventsWithErrors = 0;
        this.show(message, duration);
    }
}
