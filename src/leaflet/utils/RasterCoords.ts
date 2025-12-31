import * as L from 'leaflet';

/**
 * Helper utility to configure Leaflet map for "Raster Coordinates" (Image Map).
 * 
 * This solves the "panning when zooming" issue by ensuring the coordinate system (CRS)
 * matches the image dimensions exactly, allowing Leaflet's native "zoom to cursor"
 * logic to calculate the correct anchor point.
 * 
 * Logic adapted from: https://github.com/commenthol/leaflet-rastercoords
 */
export class RasterCoords {
    private map: L.Map;
    private width: number;
    private height: number;
    private tileSize: number;

    constructor(map: L.Map, width: number, height: number, tileSize: number = 256) {
        this.map = map;
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
    }

    /**
     * Calculate the maximum zoom level where the image fits entirely within the world.
     * 
     * In standard web mercator, the world is 256x256 at zoom 0.
     * Here, we want our "world" (the image) to fit nicely.
     */
    public getMaxZoom(): number {
        // Calculate how many times we need to double 256 to cover the largest dimension
        const maxDim = Math.max(this.width, this.height);
        return Math.ceil(Math.log2(maxDim / this.tileSize));
    }

    /**
     * Sets up the map with the correct CRS and bounds.
     * Call this BEFORE adding layers.
     */
    public setup(): void {
        // Use CRS.Simple which maps (lat, lng) directly to (y, x)
        // Key fix: Ensure infinite is true so we don't hit wrapping boundaries
        // We must extend it to ensure we don't modify the global L.CRS.Simple if referenced elsewhere
        this.map.options.crs = L.extend({}, L.CRS.Simple, {
            infinite: true
        });
        
        // Calculate bounds: [[0,0], [height, width]]
        // This places (0,0) at top-left (if y is inverted) or bottom-left depending on transformation.
        // Standard CRS.Simple uses a transformation where y is inverted (lat increases upwards).
        // So [0,0] is the origin.
        
        // To make it behave like an image (0,0 at top-left, y increases downwards):
        // We typically map:
        // Image (0,0) -> Map LatLng (0, 0)
        // Image (0, h) -> Map LatLng (-h, 0) 
        // 
        // OR we just use standard Leaflet ImageOverlay which expects [[south, west], [north, east]]
        // If we want [0,0] top-left to be consistent, we usually do:
        // South-West: [0, 0]
        // North-East: [height, width]
        // And then we render the image into that box.
        
        // The "zoom to cursor" issue happens when the maxBounds or maxZoom constraint 
        // prevents the view from centering on the cursor.
    }

    /**
     * Convert image pixel coordinates [x, y] to Leaflet LatLng
     * Note: In CRS.Simple, LatLng is [y, x]
     */
    public unproject(coords: [number, number]): L.LatLng {
        return L.latLng(coords[1], coords[0]);
    }

    /**
     * Convert Leaflet LatLng to image pixel coordinates [x, y]
     */
    public project(latlng: L.LatLng): [number, number] {
        return [latlng.lng, latlng.lat];
    }
}