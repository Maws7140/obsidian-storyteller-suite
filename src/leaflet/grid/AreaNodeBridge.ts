import type { Location, StoryMap, MapBinding } from '../../types';
import { cellCenter } from './GridModel';
/** Adapt territory to the original marker pipeline, without moving a saved pin. */
export function locationBindingOnMap(location: Location, map: StoryMap): MapBinding | undefined {
    const mapId = map.id || map.name;
    if (map.removedMapEntities?.includes(`location:${location.id || location.name}`)) return undefined;
    const existing = location.mapBindings?.find(b => b.mapId === mapId);
    if (existing) return existing;
    const grid = map.placementGrid,
        area = grid?.areas.find(a => a.locationId === location.id);
    if (!grid || !area?.cells.length) return undefined;
    const anchor = area.labelCell && area.cells.includes(area.labelCell) ? area.labelCell : area.cells[0];
    const [x, y] = cellCenter(grid, anchor);
    return { mapId, mapName: map.name, coordinates: [y, x] };
}

/** Keep native entity anchors inside occupied cells, never merely the area's bounding box.
 * Insets reduce icon spill where space allows; tiny tiles use their center.
 */
export function containEntityInArea(map: StoryMap, locationId: string, point: [number, number], inset = 0): [number, number] {
    const grid = map.placementGrid;
    const area = grid?.areas.find(a => a.locationId === locationId);
    if (!grid || !area?.cells.length) return point;
    let nearest = point;
    let distance = Infinity;
    for (const cell of area.cells) {
        const [col, row] = cell.split(',').map(Number);
        const left = col * grid.size,
            bottom = row * grid.size;
        const right = Math.min(grid.width, left + grid.size),
            top = Math.min(grid.height, bottom + grid.size);
        if (right <= left || top <= bottom) continue;
        const ix = Math.min(Math.max(0.001, inset), (right - left) / 2);
        const iy = Math.min(Math.max(0.001, inset), (top - bottom) / 2);
        const x = Math.max(left + ix, Math.min(right - ix, point[1]));
        const y = Math.max(bottom + iy, Math.min(top - iy, point[0]));
        const d = (x - point[1]) ** 2 + (y - point[0]) ** 2;
        if (d < distance) {
            distance = d;
            nearest = [y, x];
        }
    }
    return nearest;
}
