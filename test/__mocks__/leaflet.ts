// Mock for Leaflet library used in tests
// Provides minimal implementation of Leaflet classes and methods used by the maps system

export class LatLng {
  constructor(public lat: number, public lng: number) {}
  equals(other: LatLng): boolean {
    return this.lat === other.lat && this.lng === other.lng;
  }
  distanceTo(other: LatLng): number {
    const dx = other.lat - this.lat;
    const dy = other.lng - this.lng;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export class LatLngBounds {
  constructor(
    public southWest: LatLng,
    public northEast: LatLng
  ) {}
  
  extend(latlng: LatLng): this {
    // Mock implementation - doesn't actually modify bounds
    return this;
  }
  
  contains(latlng: LatLng): boolean {
    return (
      latlng.lat >= this.southWest.lat &&
      latlng.lat <= this.northEast.lat &&
      latlng.lng >= this.southWest.lng &&
      latlng.lng <= this.northEast.lng
    );
  }
  
  getCenter(): LatLng {
    return new LatLng(
      (this.southWest.lat + this.northEast.lat) / 2,
      (this.southWest.lng + this.northEast.lng) / 2
    );
  }
}

export class Point {
  constructor(public x: number, public y: number) {}
}

export class Marker extends (class Evented {}) {
  private _latlng: LatLng;
  private _options: any;
  private _icon: any;
  private _popup: any;
  
  constructor(latlng: LatLng | [number, number], options?: any) {
    super();
    if (Array.isArray(latlng)) {
      this._latlng = new LatLng(latlng[0], latlng[1]);
    } else {
      this._latlng = latlng;
    }
    this._options = options || {};
  }
  
  getLatLng(): LatLng {
    return this._latlng;
  }
  
  setLatLng(latlng: LatLng | [number, number]): this {
    if (Array.isArray(latlng)) {
      this._latlng = new LatLng(latlng[0], latlng[1]);
    } else {
      this._latlng = latlng;
    }
    return this;
  }
  
  setIcon(icon: any): this {
    this._icon = icon;
    return this;
  }
  
  bindPopup(content: string | HTMLElement, options?: any): this {
    this._popup = { content, options };
    return this;
  }
  
  openPopup(): this {
    return this;
  }
  
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
}

export class LayerGroup extends (class Evented {}) {
  private _layers: any[] = [];
  
  addLayer(layer: any): this {
    if (this._layers.indexOf(layer) === -1) {
      this._layers.push(layer);
    }
    return this;
  }
  
  removeLayer(layer: any): this {
    const index = this._layers.indexOf(layer);
    if (index !== -1) {
      this._layers.splice(index, 1);
    }
    return this;
  }
  
  clearLayers(): this {
    this._layers = [];
    return this;
  }
  
  eachLayer(fn: (layer: any) => void): this {
    this._layers.forEach(fn);
    return this;
  }
  
  getLayers(): any[] {
    return [...this._layers];
  }
  
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
}

export class ImageOverlay extends (class Evented {}) {
  constructor(
    public imageUrl: string,
    public bounds: LatLngBounds,
    options?: any
  ) {
    super();
  }
  
  setOpacity(opacity: number): this {
    return this;
  }
  
  setZIndex(zIndex: number): this {
    return this;
  }
  
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
}

export class TileLayer extends (class Evented {}) {
  constructor(public urlTemplate: string, options?: any) {
    super();
  }
  
  setOpacity(opacity: number): this {
    return this;
  }
  
  setZIndex(zIndex: number): this {
    return this;
  }
  
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
}

export class Map extends (class Evented {}) {
  private _container: HTMLElement;
  private _layers: any[] = [];
  private _zoom: number = 10;
  private _center: LatLng = new LatLng(0, 0);
  private _bounds: LatLngBounds;
  
  constructor(container: HTMLElement | string, options?: any) {
    super();
    if (typeof container === 'string') {
      const el = document.createElement('div');
      el.id = container;
      this._container = el;
    } else {
      this._container = container;
    }
  }
  
  setView(center: LatLng | [number, number], zoom: number, options?: any): this {
    if (Array.isArray(center)) {
      this._center = new LatLng(center[0], center[1]);
    } else {
      this._center = center;
    }
    this._zoom = zoom;
    return this;
  }
  
  setZoom(zoom: number, options?: any): this {
    this._zoom = zoom;
    return this;
  }
  
  getZoom(): number {
    return this._zoom;
  }
  
  getCenter(): LatLng {
    return this._center;
  }
  
  getBounds(): LatLngBounds {
    return this._bounds || new LatLngBounds(new LatLng(-90, -180), new LatLng(90, 180));
  }
  
  fitBounds(bounds: LatLngBounds, options?: any): this {
    this._bounds = bounds;
    return this;
  }
  
  addLayer(layer: any): this {
    if (this._layers.indexOf(layer) === -1) {
      this._layers.push(layer);
    }
    return this;
  }
  
  removeLayer(layer: any): this {
    const index = this._layers.indexOf(layer);
    if (index !== -1) {
      this._layers.splice(index, 1);
    }
    return this;
  }
  
  eachLayer(fn: (layer: any) => void): this {
    this._layers.forEach(fn);
    return this;
  }
  
  invalidateSize(animate?: boolean): this {
    return this;
  }
  
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
  
  getContainer(): HTMLElement {
    return this._container;
  }
}

class Evented {
  on(type: string, fn: Function, context?: any): this {
    return this;
  }
  
  off(type: string, fn?: Function, context?: any): this {
    return this;
  }
  
  fire(type: string, data?: any): this {
    return this;
  }
}

export const icon = (options: any): any => {
  return {
    iconUrl: options.iconUrl,
    iconSize: options.iconSize || [25, 41],
    iconAnchor: options.iconAnchor || [12, 41],
    popupAnchor: options.popupAnchor || [1, -34],
    ...options
  };
};

export const divIcon = (options: any): any => {
  return {
    className: options.className || '',
    html: options.html || '',
    iconSize: options.iconSize || [12, 12],
    iconAnchor: options.iconAnchor || [6, 6],
    ...options
  };
};

export const latLng = (lat: number, lng?: number): LatLng => {
  if (lng !== undefined) {
    return new LatLng(lat, lng);
  }
  if (Array.isArray(lat)) {
    return new LatLng(lat[0], lat[1]);
  }
  return lat;
};

export const latLngBounds = (southWest: LatLng | [number, number], northEast: LatLng | [number, number]): LatLngBounds => {
  const sw = Array.isArray(southWest) ? new LatLng(southWest[0], southWest[1]) : southWest;
  const ne = Array.isArray(northEast) ? new LatLng(northEast[0], northEast[1]) : northEast;
  return new LatLngBounds(sw, ne);
};

export const point = (x: number, y?: number): Point => {
  if (y !== undefined) {
    return new Point(x, y);
  }
  if (Array.isArray(x)) {
    return new Point(x[0], x[1]);
  }
  return x;
};
