import { describe, expect, it, vi } from 'vitest';
import { InkStore } from '../../src/leaflet/ink/InkStore';
import type { InkHost } from '../../src/leaflet/ink/host';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import { defaultScaleWithMap } from '../../src/leaflet/ink/tools/types';
import type { InkToolContext } from '../../src/leaflet/ink/tools/types';

function hostWith(extra: Partial<InkHost> = {}): InkHost {
	return {
		notify: vi.fn(),
		confirm: async () => true,
		showMenu: () => undefined,
		icon: () => undefined,
		pickLocation: async () => null,
		openLocation: () => undefined,
		load: () => defaultInkDoc(),
		save: async () => undefined,
		presets: () => [],
		savePreset: () => undefined,
		...extra,
	} as unknown as InkHost;
}

function ctxWith(host: InkHost): InkToolContext {
	return { host } as unknown as InkToolContext;
}

describe('drawing defaults from the host', () => {
	it('new items scale with the map unless the host says otherwise', () => {
		expect(defaultScaleWithMap(ctxWith(hostWith()))).toBe(true);
		expect(defaultScaleWithMap(ctxWith(hostWith({ drawDefaults: () => ({ scaleWithMap: false, textFont: 'serif' }) })))).toBe(false);
	});

	it('the store starts text in the host font', () => {
		const store = new InkStore(hostWith({ drawDefaults: () => ({ scaleWithMap: true, textFont: 'mono' }) }));
		expect(store.currentTextStyle().font).toBe('mono');
	});

	it('the store keeps the serif font when the host gives no default', () => {
		const store = new InkStore(hostWith());
		expect(store.currentTextStyle().font).toBe('serif');
	});

	it('new shapes, areas and paths start with the visible defaults', () => {
		const store = new InkStore(hostWith());
		expect(store.currentStyle('area')).toMatchObject({ stroke: '#5b4a3a', strokeWidth: 2, fill: '#c9a66b', fillOpacity: 0.25 });
		expect(store.currentStyle('rect')).toMatchObject({ stroke: '#5b4a3a', strokeWidth: 2, fillOpacity: 0.25 });
		expect(store.currentStyle('ellipse')).toMatchObject({ stroke: '#5b4a3a', strokeWidth: 2, fillOpacity: 0.25 });
		expect(store.currentStyle('path')).toMatchObject({ stroke: '#5b4a3a', strokeWidth: 3 });
		expect(store.currentStyle('freehand')).toMatchObject({ stroke: '#5b4a3a', strokeWidth: 3 });
	});

	it('new text starts with the label-place look', () => {
		const store = new InkStore(hostWith());
		expect(store.currentTextStyle()).toMatchObject({ font: 'serif', size: 14, haloWidth: 3 });
	});
});
