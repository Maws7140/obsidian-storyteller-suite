import { expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { initializeTimelineAfterLayout } from '../../src/utils/TimelineStartup';

function setup() {
    return { hasStory: () => true, migrate: vi.fn(async () => {}),
        refresh: vi.fn(async () => {}), createDefaults: vi.fn(async () => {}),
        refreshViews: vi.fn(), reportError: vi.fn() };
}

it('refreshes the existing store before considering default creation', async () => {
    const steps = setup();
    await initializeTimelineAfterLayout(steps);
    expect(steps.migrate.mock.invocationCallOrder[0]).toBeLessThan(steps.refresh.mock.invocationCallOrder[0]);
    expect(steps.refresh.mock.invocationCallOrder[0]).toBeLessThan(steps.createDefaults.mock.invocationCallOrder[0]);
    expect(steps.refreshViews).toHaveBeenCalledOnce();
});

it('does not create notes without an active story', async () => {
    const steps = setup(); steps.hasStory = () => false;
    await initializeTimelineAfterLayout(steps);
    expect(steps.createDefaults).not.toHaveBeenCalled();
    expect(steps.migrate).not.toHaveBeenCalled();
});

it('reports read failure and never treats it as an empty store', async () => {
    const steps = setup(); const error = new Error('vault unavailable');
    steps.refresh.mockRejectedValue(error);
    await expect(initializeTimelineAfterLayout(steps)).resolves.toBeUndefined();
    expect(steps.createDefaults).not.toHaveBeenCalled();
    expect(steps.reportError).toHaveBeenCalledWith(error);
});

it('isolates default-write failure from plugin registration', async () => {
    const steps = setup(); const error = new Error('File already exists');
    steps.createDefaults.mockRejectedValue(error);
    await expect(initializeTimelineAfterLayout(steps)).resolves.toBeUndefined();
    expect(steps.reportError).toHaveBeenCalledWith(error);
});

it('wires timeline initialization after registration and layout readiness', () => {
    const source = readFileSync('src/main.ts', 'utf8');
    const start = source.indexOf('async onload()');
    const ready = source.indexOf('this.app.workspace.onLayoutReady(async () =>', start);
    const early = source.slice(start, ready);
    expect(early).toContain('this.registerCommands()');
    expect(early).not.toContain('await this.trackManager.initializeDefaultTracks()');
    expect(early).not.toContain('await this.timelineEntities.refresh()');
    expect(early).not.toContain('await this.migrateTimelineEntitiesIfUnambiguous()');
    const deferred = source.slice(ready, source.indexOf('this.scheduleDeferredStartupMaintenance()', ready));
    expect(deferred.indexOf('await this.discoverExistingStories()')).toBeLessThan(deferred.indexOf('await initializeTimelineAfterLayout('));
});
