import { describe, expect, it, vi } from 'vitest';

// The host imports Obsidian classes through the modals it opens. Stub the ones it touches.
vi.mock('obsidian', async () => {
    const base: Record<string, any> = await import('../__mocks__/obsidian');
    function Stub() {}
    const names = ['App', 'FuzzySuggestModal', 'Menu', 'Modal', 'Notice', 'Setting', 'prepareFuzzySearch', 'setIcon', 'TFile'];
    const stubs = Object.fromEntries(names.filter(n => !(n in base)).map(n => [n, Stub]));
    return { ...base, ...stubs };
});

import { ObsidianInkHost } from '../../src/leaflet/ink/obsidian/ObsidianInkHost';
import type { InkPreset } from '../../src/leaflet/ink/styles';
import { defaultInkDoc } from '../../src/leaflet/ink/model';

function hostWith(presets: InkPreset[]) {
    const settings = { inkPresets: presets };
    const plugin: any = { app: {}, settings, saveSettings: vi.fn(async () => undefined) };
    const host = new ObsidianInkHost({ plugin, load: () => defaultInkDoc(), save: async () => undefined });
    return { host, plugin, settings };
}

const water: InkPreset = { id: 'my-water', name: 'My water', fits: 'area', style: { fill: '#2a6fb0' } };

describe('ObsidianInkHost presets', () => {
    it('lists the presets saved in settings', () => {
        const { host } = hostWith([water]);
        expect(host.presets()).toEqual([water]);
    });

    it('adds a new preset and saves the settings', () => {
        const { host, plugin } = hostWith([]);
        host.savePreset(water);
        expect(host.presets()).toEqual([water]);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('replaces a preset with the same id instead of adding a second one', () => {
        const { host, plugin } = hostWith([water]);
        const renamed = { ...water, name: 'Lake water' };
        host.savePreset(renamed);
        expect(host.presets()).toEqual([renamed]);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('keeps the same settings array, so other holders of it see the change', () => {
        const { host, settings } = hostWith([]);
        const before = settings.inkPresets;
        host.savePreset(water);
        expect(settings.inkPresets).toBe(before);
    });

    it('creates the array when the settings have none', () => {
        const plugin: any = { app: {}, settings: {}, saveSettings: vi.fn(async () => undefined) };
        const host = new ObsidianInkHost({ plugin, load: () => defaultInkDoc(), save: async () => undefined });
        expect(host.presets()).toEqual([]);
        host.savePreset(water);
        expect(plugin.settings.inkPresets).toEqual([water]);
    });

    it('returns the point unchanged when there is no snap', () => {
        const { host } = hostWith([]);
        expect(host.snapPoint([1, 2])).toEqual([1, 2]);
    });

    it('gives the drawing defaults from settings, with scale on and serif when unset', () => {
        const { host } = hostWith([]);
        expect(host.drawDefaults()).toEqual({ scaleWithMap: true, textFont: 'serif' });
        const plugin: any = { app: {}, settings: { inkPresets: [], inkScaleWithMap: false, inkTextFont: 'hand' }, saveSettings: vi.fn(async () => undefined) };
        const configured = new ObsidianInkHost({ plugin, load: () => defaultInkDoc(), save: async () => undefined });
        expect(configured.drawDefaults()).toEqual({ scaleWithMap: false, textFont: 'hand' });
    });
});
