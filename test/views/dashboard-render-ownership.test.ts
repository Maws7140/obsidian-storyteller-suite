import { describe, it, expect } from 'vitest';
import { DashboardRenderOwnership } from '../../src/views/dashboard/DashboardRenderOwnership';

describe('mounted dashboard ownership', () => {
    it('retains mounted controls when a replacement fails before commit', () => {
        const state = new DashboardRenderOwnership();
        const mounted = state.begin(); expect(mounted.commit()).toBe(true);
        state.begin(); // its asynchronous read rejects, so no commit occurs
        expect(mounted.isCurrent()).toBe(true);
    });
    it('invalidates retained controls only when a replacement commits', () => {
        const state = new DashboardRenderOwnership();
        const mounted = state.begin(); mounted.commit();
        const pending = state.begin();
        expect(mounted.isCurrent()).toBe(true);
        expect(pending.commit()).toBe(true);
        expect(mounted.isCurrent()).toBe(false);
    });
    it('never allows an older pending render to commit after a newer request', () => {
        const state = new DashboardRenderOwnership();
        const first = state.begin(); const second = state.begin();
        expect(first.commit()).toBe(false);
        expect(second.commit()).toBe(true);
    });
    it('invalidates mounted and pending leases on tab switch, ABA and close', () => {
        const state = new DashboardRenderOwnership();
        const mounted = state.begin(); mounted.commit(); const pending = state.begin();
        state.invalidate(); state.invalidate();
        expect(mounted.isCurrent()).toBe(false);
        expect(pending.isCurrent()).toBe(false);
        expect(pending.commit()).toBe(false);
        const fresh = state.begin(); fresh.commit(); state.invalidate();
        expect(fresh.isCurrent()).toBe(false);
    });
});
