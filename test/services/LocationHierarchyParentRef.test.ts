import { describe, it, expect } from 'vitest';
import { LocationService } from '../../src/services/LocationService';
import type { Location } from '../../src/types';
import { MockPlugin } from '../__mocks__/plugin';

describe('LocationService.validateHierarchy parent references', () => {
  it('accepts a child whose parentLocationId is the parent name (child-location defaults store names)', async () => {
    const plugin = new MockPlugin();
    const parent: Location = { id: 'loc-region', name: 'Region', type: 'custom', childLocationIds: ['loc-city'] };
    const child: Location = { id: 'loc-city', name: 'City', type: 'custom', parentLocationId: 'Region' };
    plugin.addLocation(parent);
    plugin.addLocation(child);
    const result = await new LocationService(plugin as any).validateHierarchy();
    expect(result.errors.filter(e => e.includes('does not match'))).toEqual([]);
  });

  it('still reports a child whose parent reference names a different location', async () => {
    const plugin = new MockPlugin();
    plugin.addLocation({ id: 'loc-region', name: 'Region', type: 'custom', childLocationIds: ['loc-city'] });
    plugin.addLocation({ id: 'loc-other', name: 'Other', type: 'custom' });
    plugin.addLocation({ id: 'loc-city', name: 'City', type: 'custom', parentLocationId: 'Other' });
    const result = await new LocationService(plugin as any).validateHierarchy();
    expect(result.errors.some(e => e.includes('does not match'))).toBe(true);
  });
});
