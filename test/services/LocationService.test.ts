import { describe, it, expect, beforeEach } from 'vitest';
import { LocationService } from '../../src/services/LocationService';
import type { Location, MapBinding } from '../../src/types';
import { MockPlugin } from '../__mocks__/plugin';

describe('LocationService', () => {
  let plugin: MockPlugin;
  let locationService: LocationService;
  
  beforeEach(() => {
    plugin = new MockPlugin();
    locationService = new LocationService(plugin as any);
  });
  
  describe('findLocationAtCoordinates', () => {
    it('finds closest location within tolerance', async () => {
      const mapId = 'map1';
      const location1: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      const location2: Location = {
        id: 'loc2',
        name: 'Location 2',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [50, 60],
        }],
      };
      
      plugin.addLocation(location1);
      plugin.addLocation(location2);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [12, 22], 5);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('loc1');
    });
    
    it('returns null when no locations within tolerance', async () => {
      const mapId = 'map1';
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [100, 200], 5);
      
      expect(result).toBeNull();
    });
    
    it('returns null when no locations bound to map', async () => {
      const mapId = 'map1';
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId: 'map2',
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [10, 20], 5);
      
      expect(result).toBeNull();
    });
    
    it('finds closest location when multiple within tolerance', async () => {
      const mapId = 'map1';
      const location1: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      const location2: Location = {
        id: 'loc2',
        name: 'Location 2',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [11, 21],
        }],
      };
      
      plugin.addLocation(location1);
      plugin.addLocation(location2);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [11.5, 21.5], 5);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('loc2');
    });
    
    it('handles locations with multiple map bindings', async () => {
      const mapId = 'map1';
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [
          {
            mapId: 'map2',
            coordinates: [100, 200],
          },
          {
            mapId,
            coordinates: [10, 20],
          },
        ],
      };
      
      plugin.addLocation(location);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [12, 22], 5);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('loc1');
    });
    
    it('handles empty coordinates', async () => {
      const mapId = 'map1';
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [0, 0],
        }],
      };
      
      plugin.addLocation(location);
      
      const result = await locationService.findLocationAtCoordinates(mapId, [0, 0], 5);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('loc1');
    });
  });
  
  describe('findLocationsAtCoordinates', () => {
    it('finds all locations within tolerance', async () => {
      const mapId = 'map1';
      const location1: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      const location2: Location = {
        id: 'loc2',
        name: 'Location 2',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [11, 21],
        }],
      };
      const location3: Location = {
        id: 'loc3',
        name: 'Location 3',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [100, 200],
        }],
      };
      
      plugin.addLocation(location1);
      plugin.addLocation(location2);
      plugin.addLocation(location3);
      
      const result = await locationService.findLocationsAtCoordinates(mapId, [10.5, 20.5], 5);
      
      expect(result).toHaveLength(2);
      expect(result.map(l => l.id)).toContain('loc1');
      expect(result.map(l => l.id)).toContain('loc2');
      expect(result.map(l => l.id)).not.toContain('loc3');
    });
    
    it('returns locations sorted by distance', async () => {
      const mapId = 'map1';
      const location1: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      const location2: Location = {
        id: 'loc2',
        name: 'Location 2',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [15, 25],
        }],
      };
      
      plugin.addLocation(location1);
      plugin.addLocation(location2);
      
      const result = await locationService.findLocationsAtCoordinates(mapId, [11, 21], 10);
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('loc1');
      expect(result[1].id).toBe('loc2');
    });
    
    it('returns empty array when no locations within tolerance', async () => {
      const mapId = 'map1';
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId,
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      const result = await locationService.findLocationsAtCoordinates(mapId, [100, 200], 5);
      
      expect(result).toHaveLength(0);
    });
  });
  
  describe('addMapBinding', () => {
    it('adds map binding to location', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
      };
      
      plugin.addLocation(location);
      
      await locationService.addMapBinding('loc1', 'map1', [10, 20]);
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated).not.toBeNull();
      expect(updated!.mapBindings).toHaveLength(1);
      expect(updated!.mapBindings![0].mapId).toBe('map1');
      expect(updated!.mapBindings![0].coordinates).toEqual([10, 20]);
    });
    
    it('updates existing binding for same map', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId: 'map1',
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      await locationService.addMapBinding('loc1', 'map1', [30, 40]);
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated!.mapBindings).toHaveLength(1);
      expect(updated!.mapBindings![0].coordinates).toEqual([30, 40]);
    });
    
    it('adds new binding when location already has bindings to other maps', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId: 'map2',
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      await locationService.addMapBinding('loc1', 'map1', [30, 40]);
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated!.mapBindings).toHaveLength(2);
      expect(updated!.mapBindings!.some(b => b.mapId === 'map1')).toBe(true);
      expect(updated!.mapBindings!.some(b => b.mapId === 'map2')).toBe(true);
    });
    
    it('does nothing when location does not exist', async () => {
      await locationService.addMapBinding('nonexistent', 'map1', [10, 20]);
      
      const locations = await plugin.listLocations();
      expect(locations).toHaveLength(0);
    });
  });
  
  describe('removeMapBinding', () => {
    it('removes map binding from location', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [
          {
            mapId: 'map1',
            coordinates: [10, 20],
          },
          {
            mapId: 'map2',
            coordinates: [30, 40],
          },
        ],
      };
      
      plugin.addLocation(location);
      
      await locationService.removeMapBinding('loc1', 'map1');
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated!.mapBindings).toHaveLength(1);
      expect(updated!.mapBindings![0].mapId).toBe('map2');
    });
    
    it('does nothing when location does not exist', async () => {
      await locationService.removeMapBinding('nonexistent', 'map1');
      
      const locations = await plugin.listLocations();
      expect(locations).toHaveLength(0);
    });
    
    it('does nothing when binding does not exist', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
        mapBindings: [{
          mapId: 'map1',
          coordinates: [10, 20],
        }],
      };
      
      plugin.addLocation(location);
      
      await locationService.removeMapBinding('loc1', 'map2');
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated!.mapBindings).toHaveLength(1);
    });
    
    it('handles location with no bindings', async () => {
      const location: Location = {
        id: 'loc1',
        name: 'Location 1',
        type: 'custom',
      };
      
      plugin.addLocation(location);
      
      await locationService.removeMapBinding('loc1', 'map1');
      
      const updated = await plugin.getLocationById('loc1');
      expect(updated).not.toBeNull();
    });
  });
});
