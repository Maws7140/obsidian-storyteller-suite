export interface DashboardTabController {
    id: string;
    render(container: HTMLElement): Promise<void>;
}

export interface DashboardEntityTabController<T> extends DashboardTabController {
    load(): Promise<T[]>;
}
