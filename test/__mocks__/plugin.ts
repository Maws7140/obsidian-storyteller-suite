// Mock plugin instance for testing
// Provides a minimal implementation of StorytellerSuitePlugin methods used in tests

import type { StoryMap, Location, Character, Event, PlotItem, Scene } from '../../src/types';

export class MockPlugin {
  private maps: Map<string, StoryMap> = new Map();
  private locations: Map<string, Location> = new Map();
  private characters: Map<string, Character> = new Map();
  private events: Map<string, Event> = new Map();
  private items: Map<string, PlotItem> = new Map();
  private scenes: Map<string, Scene> = new Map();
  
  // Map methods
  async listMaps(): Promise<StoryMap[]> {
    return Array.from(this.maps.values());
  }
  
  async saveMap(map: StoryMap): Promise<void> {
    const id = map.id || map.name;
    this.maps.set(id, { ...map, id });
  }
  
  async getMapById(mapId: string): Promise<StoryMap | null> {
    // Also search by name
    for (const map of this.maps.values()) {
      if (map.id === mapId || map.name === mapId) {
        return map;
      }
    }
    return null;
  }
  
  // Location methods
  async listLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }
  
  async saveLocation(location: Location): Promise<void> {
    const id = location.id || location.name;
    this.locations.set(id, { ...location, id });
  }
  
  async getLocationById(locationId: string): Promise<Location | null> {
    return this.locations.get(locationId) || null;
  }
  
  // Character methods
  async listCharacters(): Promise<Character[]> {
    return Array.from(this.characters.values());
  }
  
  async saveCharacter(character: Character): Promise<void> {
    const id = character.id || character.name;
    this.characters.set(id, { ...character, id });
  }
  
  async getCharacterById(characterId: string): Promise<Character | null> {
    return this.characters.get(characterId) || null;
  }
  
  // Event methods
  async listEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }
  
  async saveEvent(event: Event): Promise<void> {
    const id = event.id || event.name;
    this.events.set(id, { ...event, id });
  }
  
  async getEventById(eventId: string): Promise<Event | null> {
    return this.events.get(eventId) || null;
  }
  
  // PlotItem methods
  async listPlotItems(): Promise<PlotItem[]> {
    return Array.from(this.items.values());
  }
  
  async savePlotItem(item: PlotItem): Promise<void> {
    const id = item.id || item.name;
    this.items.set(id, { ...item, id });
  }
  
  async getPlotItemById(itemId: string): Promise<PlotItem | null> {
    return this.items.get(itemId) || null;
  }
  
  // Scene methods
  async listScenes(): Promise<Scene[]> {
    return Array.from(this.scenes.values());
  }
  
  async saveScene(scene: Scene): Promise<void> {
    const id = scene.id || scene.name;
    this.scenes.set(id, { ...scene, id });
  }
  
  async getSceneById(sceneId: string): Promise<Scene | null> {
    return this.scenes.get(sceneId) || null;
  }
  
  // Helper methods for test setup
  clear(): void {
    this.maps.clear();
    this.locations.clear();
    this.characters.clear();
    this.events.clear();
    this.items.clear();
    this.scenes.clear();
  }
  
  // Add test data directly
  addMap(map: StoryMap): void {
    const id = map.id || map.name;
    this.maps.set(id, { ...map, id });
  }
  
  addLocation(location: Location): void {
    const id = location.id || location.name;
    this.locations.set(id, { ...location, id });
  }
  
  addCharacter(character: Character): void {
    const id = character.id || character.name;
    this.characters.set(id, { ...character, id });
  }
  
  addEvent(event: Event): void {
    const id = event.id || event.name;
    this.events.set(id, { ...event, id });
  }
  
  addPlotItem(item: PlotItem): void {
    const id = item.id || item.name;
    this.items.set(id, { ...item, id });
  }
  
  addScene(scene: Scene): void {
    const id = scene.id || scene.name;
    this.scenes.set(id, { ...scene, id });
  }
}
