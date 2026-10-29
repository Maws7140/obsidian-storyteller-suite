export type Cell = `${number},${number}`;
export interface GridArea {
    locationId: string;
    cells: Cell[];
    label?: string;
    labelCell?: Cell;
}
export interface GridAgreement {
    a: string;
    b: string;
    cells: Cell[];
    kind: 'shared' | 'disputed';
}
export interface PlacementGrid {
    version: 1;
    size: number;
    width: number;
    height: number;
    presets: Record<string, number>;
    areas: GridArea[];
    agreements: GridAgreement[];
}
export type Resolution = 'exclude' | 'shared' | 'disputed' | 'transfer';
export function cellAt(g: PlacementGrid, x: number, y: number): Cell | null {
    if (!Number.isFinite(x + y) || x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
    return `${Math.floor(x / g.size)},${Math.floor(y / g.size)}`;
}
export function cellCenter(g: PlacementGrid, c: Cell): [number, number] {
    const [x, y] = c.split(',').map(Number);
    return [
        Math.min(g.width, (x + 1) * g.size) / 2 + (x * g.size) / 2,
        Math.min(g.height, (y + 1) * g.size) / 2 + (y * g.size) / 2,
    ];
}
export function stamp(g: PlacementGrid, c: Cell, radius: number): Cell[] {
    const [x, y] = c.split(',').map(Number),
        out: Cell[] = [];
    radius = Math.max(0, Math.min(50, Math.floor(radius)));
    for (let j = y - radius; j <= y + radius; j++)
        for (let i = x - radius; i <= x + radius; i++) {
            const cell = cellAt(g, i * g.size, j * g.size);
            if (cell) out.push(cell);
        }
    return out;
}
export function outline(g: PlacementGrid, points: [number, number][]): Cell[] {
    if (points.length < 3) return [];
    const out: Cell[] = [];
    const xs = points.map(p => p[0]),
        ys = points.map(p => p[1]);
    for (
        let y = Math.max(0, Math.floor(Math.min(...ys) / g.size));
        y <= Math.min(Math.ceil(g.height / g.size) - 1, Math.floor(Math.max(...ys) / g.size));
        y++
    )
        for (
            let x = Math.max(0, Math.floor(Math.min(...xs) / g.size));
            x <= Math.min(Math.ceil(g.width / g.size) - 1, Math.floor(Math.max(...xs) / g.size));
            x++
        ) {
            const c = cellAt(g, x * g.size, y * g.size);
            if (!c) continue;
            const [px, py] = cellCenter(g, c);
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [ax, ay] = points[i],
                    [bx, by] = points[j];
                if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
            }
            if (inside) out.push(c);
        }
    return out;
}
/**
 * Map each saved location id to its parent's id. A parent can be stored by id or by name
 * (child-location defaults and the location modal store the name), so both resolve to the id.
 */
export function parentIdsOf(
    locations: { id?: string; name?: string; parentLocationId?: string }[],
): Record<string, string | undefined> {
    const ids = new Set(locations.map(l => l.id).filter((id): id is string => !!id));
    const idByName = new Map<string, string>();
    for (const l of locations) if (l.id && l.name && !idByName.has(l.name)) idByName.set(l.name, l.id);
    return Object.fromEntries(
        locations
            .filter(l => l.id)
            .map(l => {
                const ref = l.parentLocationId;
                return [l.id!, ref === undefined ? undefined : ids.has(ref) ? ref : (idByName.get(ref) ?? ref)];
            }),
    );
}
export function related(a: string, b: string, parents: Record<string, string | undefined>): boolean {
    const ancestor = (child: string, parent: string) => {
        const seen = new Set<string>();
        while (parents[child] && !seen.has(child)) {
            seen.add(child);
            child = parents[child]!;
            if (child === parent) return true;
        }
        return false;
    };
    return ancestor(a, b) || ancestor(b, a);
}
export function overlaps(g: PlacementGrid, id: string, cells: Cell[], parents: Record<string, string | undefined>) {
    const selected = new Set(cells);
    return g.areas
        .filter(a => a.locationId !== id && !related(id, a.locationId, parents))
        .map(a => ({ id: a.locationId, cells: a.cells.filter(c => selected.has(c)) }))
        .filter(a => a.cells.length);
}
export function commitArea(
    g: PlacementGrid,
    area: GridArea,
    parents: Record<string, string | undefined>,
    choices: Record<string, Resolution>
): PlacementGrid {
    const next: PlacementGrid = JSON.parse(JSON.stringify(g));
    const selected = new Set(area.cells);
    const conflicts = overlaps(g, area.locationId, area.cells, parents);
    for (const conflict of conflicts) {
        const choice = choices[conflict.id];
        if (!choice) throw Error('Resolve every overlap before saving.');
        if (choice === 'exclude') conflict.cells.forEach(c => selected.delete(c));
    }
    next.agreements = next.agreements.filter(a => a.a !== area.locationId && a.b !== area.locationId);
    for (const conflict of conflicts) {
        const cells = conflict.cells.filter(c => selected.has(c)),
            choice = choices[conflict.id];
        if (!cells.length) continue;
        if (choice === 'transfer') {
            const other = next.areas.find(a => a.locationId === conflict.id)!;
            other.cells = other.cells.filter(c => !selected.has(c));
        } else if (choice === 'shared' || choice === 'disputed')
            next.agreements.push({ a: area.locationId, b: conflict.id, cells, kind: choice });
    }
    next.areas = next.areas.filter(a => a.locationId !== area.locationId);
    next.areas.push({
        ...area,
        cells: [...selected],
        labelCell: area.labelCell && selected.has(area.labelCell) ? area.labelCell : [...selected][0],
    });
    // Transfer can invalidate agreements between third parties as well.
    next.agreements = next.agreements
        .map(a => ({
            ...a,
            cells: a.cells.filter(
                c =>
                    next.areas.find(v => v.locationId === a.a)?.cells.includes(c) &&
                    next.areas.find(v => v.locationId === a.b)?.cells.includes(c)
            ),
        }))
        .filter(a => a.cells.length);
    return next;
}
/** Explicit center-sampled migration; callers must preview losses before committing. */
export function resizeGrid(g: PlacementGrid, size: number): PlacementGrid {
    if (!Number.isFinite(size) || size < 4 || Math.ceil(g.width / size) * Math.ceil(g.height / size) > 100000)
        throw Error('Invalid grid resolution (maximum 100,000 cells).');
    const next: PlacementGrid = {
        ...g,
        size,
        areas: g.areas.map(a => ({ ...a, cells: [], labelCell: undefined })),
        agreements: g.agreements.map(a => ({ ...a, cells: [] })),
    };
    const oldToNew = new Map<Cell, Cell[]>();
    for (let y = 0; y < Math.ceil(g.height / size); y++)
        for (let x = 0; x < Math.ceil(g.width / size); x++) {
            const c: Cell = `${x},${y}`;
            const old = cellAt(g, ...cellCenter(next, c));
            if (old) {
                const list = oldToNew.get(old) ?? [];
                list.push(c);
                oldToNew.set(old, list);
            }
        }
    next.areas.forEach((a, i) => {
        a.cells = g.areas[i].cells.flatMap(c => oldToNew.get(c) ?? []);
        const old = g.areas[i].labelCell;
        a.labelCell = old ? oldToNew.get(old)?.[0] : a.cells[0];
        a.labelCell ??= a.cells[0];
    });
    next.agreements.forEach((a, i) => (a.cells = g.agreements[i].cells.flatMap(c => oldToNew.get(c) ?? [])));
    next.agreements = next.agreements.filter(a => a.cells.length);
    return next;
}
export function validateGrid(g: PlacementGrid): void {
    if (
        g.version !== 1 ||
        !Number.isFinite(g.size) ||
        g.size < 4 ||
        !Number.isFinite(g.width) ||
        !Number.isFinite(g.height) ||
        g.width <= 0 ||
        g.height <= 0 ||
        Math.ceil(g.width / g.size) * Math.ceil(g.height / g.size) > 100000
    )
        throw Error('Invalid or unsupported placement grid.');
    if (!Array.isArray(g.areas) || !Array.isArray(g.agreements) || !g.presets) throw Error('Invalid grid data.');
    const ids = new Set<string>();
    for (const a of g.areas) {
        if (!a.locationId || ids.has(a.locationId) || !Array.isArray(a.cells)) throw Error('Invalid area membership.');
        ids.add(a.locationId);
        for (const c of a.cells) {
            const [x, y] = c.split(',').map(Number);
            if (!Number.isInteger(x) || !Number.isInteger(y) || cellAt(g, x * g.size, y * g.size) !== c)
                throw Error('Out-of-bounds grid cell.');
        }
    }
}
