import type * as L from 'leaflet';

/** Image bounds constrain the camera, independently of the tile pyramid. */
export function constrainImageViewport(map: L.Map, bounds: L.LatLngBounds): number | null {
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0 || !bounds.isValid()) return null;
    // getBoundsZoom clamps to the OLD zoom limits, so calculate using projected
    // dimensions instead. This also works with the tiled renderer's custom CRS.
    const nw = map.project(bounds.getNorthWest(), 0);
    const se = map.project(bounds.getSouthEast(), 0);
    const width = Math.abs(se.x - nw.x);
    const height = Math.abs(se.y - nw.y);
    if (width <= 0 || height <= 0) return null;
    const minimum = map.getScaleZoom(Math.max(size.x / width, size.y / height), 0);
    if (!Number.isFinite(minimum)) return null;
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(bounds);
    // Very small images must still fill large panes (native tiles are overscaled).
    if (map.getMaxZoom() < minimum) map.setMaxZoom(minimum);
    const currentZoom = map.getZoom();
    const center = Number.isFinite(currentZoom) ? map.getCenter() : null;
    map.setMinZoom(minimum);
    // setMinZoom may start an animated zoom. Resize must clamp immediately,
    // including a center near an edge, rather than expose space during animation.
    if (center) {
        map.setView(center, Math.max(minimum, currentZoom), { animate: false });
        map.panInsideBounds(bounds, { animate: false });
    }
    return minimum;
}
