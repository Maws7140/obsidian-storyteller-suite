import { App, Notice } from 'obsidian';
import { confirmWithModal } from '../../modals/ui/ConfirmModal';
import { DashboardRefreshCoordinator } from './DashboardRefreshCoordinator';

type RefreshMode = 'immediate' | 'settled' | 'none';

interface MutationOptions<T> {
    action: () => Promise<T>;
    successNotice?: string;
    refreshMode?: RefreshMode;
    refreshDetail?: string;
}

interface DeleteMutationOptions<T> extends MutationOptions<T> {
    confirmMessage: string;
    confirmText?: string;
}

export class DashboardMutationRunner {
    constructor(
        private readonly app: App,
        private readonly refreshCoordinator: DashboardRefreshCoordinator
    ) {}

    async runCreate<T>(options: MutationOptions<T>): Promise<T> {
        return this.runMutation(options);
    }

    async runUpdate<T>(options: MutationOptions<T>): Promise<T> {
        return this.runMutation(options);
    }

    async runDelete<T>(options: DeleteMutationOptions<T>): Promise<T | null> {
        const confirmed = await confirmWithModal(this.app, {
            title: 'Confirm Delete',
            body: options.confirmMessage,
            confirmText: options.confirmText,
        });
        if (!confirmed) {
            return null;
        }

        return this.runMutation(options);
    }

    requestRefresh(refreshMode: RefreshMode = 'immediate', refreshDetail?: string): void {
        if (refreshMode === 'none') {
            return;
        }

        const request = { source: 'mutation' as const, detail: refreshDetail };
        if (refreshMode === 'settled') {
            this.refreshCoordinator.requestRefresh(request);
            return;
        }

        this.refreshCoordinator.requestImmediateRefresh(request);
    }

    private async runMutation<T>(options: MutationOptions<T>): Promise<T> {
        const result = await options.action();
        if (options.successNotice) {
            new Notice(options.successNotice);
        }
        this.requestRefresh(options.refreshMode, options.refreshDetail);
        return result;
    }
}
