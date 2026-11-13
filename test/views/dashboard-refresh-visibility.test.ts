import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/modals/CharacterModal', () => ({ CharacterModal: class {} }));
vi.mock('../../src/modals/LocationModal', () => ({ LocationModal: class {} }));
vi.mock('../../src/i18n/strings', () => ({ t: (key: string) => key }));
import { DashboardRenderOwnership } from '../../src/views/dashboard/DashboardRenderOwnership';
import { charactersController } from '../../src/views/dashboard/controllers/CharactersController';
import { locationsController } from '../../src/views/dashboard/controllers/LocationsController';

function deferred() {
    let resolve!: (value: any[]) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<any[]>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
function fixture(method: string) {
    const previous = { remove: vi.fn() };
    const child = { createEl: vi.fn(() => ({ setCssStyles: vi.fn() })) };
    const container = { empty: vi.fn(), querySelector: vi.fn(() => previous), createDiv: vi.fn(() => child) };
    const read = vi.fn();
    const context = { isCurrentRender: vi.fn(() => true), commitRender: vi.fn(() => true), plugin: { [method]: read }, getCurrentFilter: () => '', setCurrentFilter: vi.fn(), renderHeaderControls: vi.fn() };
    return { previous, container, context, read };
}
for (const [controller, method] of [[charactersController, 'listCharacters'], [locationsController, 'listLocations']] as const) {
    describe(controller.id, () => {
        it('keeps existing content until the entity read finishes, without a second read', async () => {
            const f = fixture(method); const gate = deferred(); f.read.mockReturnValue(gate.promise);
            const render = controller.render(f.container as any, f.context as any);
            expect(f.container.empty).not.toHaveBeenCalled();
            expect(f.previous.remove).not.toHaveBeenCalled();
            gate.resolve([]); await render;
            expect(f.container.empty).toHaveBeenCalledOnce();
            expect(f.read).toHaveBeenCalledOnce();
            expect(f.container.createDiv).toHaveBeenCalledOnce();
        });
        it('preserves the existing content if a vault read rejects', async () => {
            const f = fixture(method); f.read.mockRejectedValue(new Error('synthetic read failure'));
            await expect(controller.render(f.container as any, f.context as any)).rejects.toThrow('synthetic read failure');
            expect(f.container.empty).not.toHaveBeenCalled();
            expect(f.previous.remove).not.toHaveBeenCalled();
        });
        it('does not replace another tab after a delayed render resolves', async () => {
            const f = fixture(method); const gate = deferred(); f.read.mockReturnValue(gate.promise);
            const render = controller.render(f.container as any, f.context as any);
            f.context.isCurrentRender.mockReturnValue(false); f.context.commitRender.mockReturnValue(false);
            gate.resolve([]); await render;
            expect(f.container.empty).not.toHaveBeenCalled();
            expect(f.previous.remove).not.toHaveBeenCalled();
            expect(f.context.renderHeaderControls).not.toHaveBeenCalled();
        });
        it('does not replace a new tab when an old search resolves', async () => {
            const f = fixture(method); f.read.mockResolvedValue([]);
            await controller.render(f.container as any, f.context as any);
            f.previous.remove.mockClear(); f.container.createDiv.mockClear();
            const gate = deferred(); f.read.mockReturnValue(gate.promise);
            const search = f.context.renderHeaderControls.mock.calls[0][2];
            const refresh = search('synthetic');
            f.context.isCurrentRender.mockReturnValue(false); f.context.commitRender.mockReturnValue(false);
            gate.resolve([]); await refresh;
            expect(f.previous.remove).not.toHaveBeenCalled();
            expect(f.container.createDiv).not.toHaveBeenCalled();
        });
        it('allows retained search controls to recover after a failed replacement', async () => {
            const f = fixture(method); const state = new DashboardRenderOwnership();
            const ticket = state.begin();
            f.context.isCurrentRender.mockImplementation(ticket.isCurrent);
            f.context.commitRender.mockImplementation(ticket.commit);
            f.read.mockResolvedValue([]);
            await controller.render(f.container as any, f.context as any);
            const search = f.context.renderHeaderControls.mock.calls[0][2];
            const next = state.begin();
            const replacement = { ...f.context, isCurrentRender: next.isCurrent, commitRender: next.commit };
            f.read.mockRejectedValueOnce(new Error('synthetic failure'));
            await expect(controller.render(f.container as any, replacement as any)).rejects.toThrow('synthetic failure');
            f.previous.remove.mockClear();
            await search('recovered');
            expect(f.previous.remove).toHaveBeenCalledOnce();
        });
        it('keeps the prior list visible while a search reads entities', async () => {
            const f = fixture(method); f.read.mockResolvedValue([]);
            await controller.render(f.container as any, f.context as any);
            f.previous.remove.mockClear();
            const gate = deferred(); f.read.mockReturnValue(gate.promise);
            const search = f.context.renderHeaderControls.mock.calls[0][2];
            const refresh = search('synthetic');
            expect(f.previous.remove).not.toHaveBeenCalled();
            gate.resolve([]); await refresh;
            expect(f.previous.remove).toHaveBeenCalledOnce();
        });
    });
}
