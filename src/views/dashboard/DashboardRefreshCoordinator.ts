export interface DashboardRefreshRequest {
    source: 'vault' | 'mutation' | 'plugin' | 'manual';
    eventType?: string;
    path?: string;
    detail?: string;
}

type RefreshCallback = () => Promise<void>;

export class DashboardRefreshCoordinator {
    private flushTimer: number | null = null;
    private inFlight = false;
    private pending = false;
    private pendingDelayMs: number | null = null;

    constructor(
        private readonly refreshCallback: RefreshCallback,
        private readonly settledDelayMs: number = 200
    ) {}

    requestRefresh(_request: DashboardRefreshRequest): void {
        this.queue(this.settledDelayMs);
    }

    requestImmediateRefresh(_request: DashboardRefreshRequest): void {
        this.queue(0);
    }

    dispose(): void {
        if (this.flushTimer !== null) {
            window.clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.pending = false;
        this.pendingDelayMs = null;
    }

    private queue(delayMs: number): void {
        this.pending = true;

        if (this.pendingDelayMs === null || delayMs < this.pendingDelayMs) {
            this.pendingDelayMs = delayMs;
        }

        if (this.inFlight) {
            return;
        }

        this.schedulePendingFlush();
    }

    private schedulePendingFlush(): void {
        if (!this.pending || this.pendingDelayMs === null) {
            return;
        }

        if (this.flushTimer !== null) {
            window.clearTimeout(this.flushTimer);
        }

        const delayMs = this.pendingDelayMs;
        this.pendingDelayMs = null;
        this.flushTimer = window.setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, delayMs);
    }

    private async flush(): Promise<void> {
        if (this.inFlight || !this.pending) {
            return;
        }

        this.inFlight = true;
        this.pending = false;

        try {
            await this.refreshCallback();
        } finally {
            this.inFlight = false;
            if (this.pending) {
                this.schedulePendingFlush();
            }
        }
    }
}
