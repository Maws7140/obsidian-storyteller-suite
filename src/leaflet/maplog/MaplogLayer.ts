/**
 * Draws Maplog marks, lines and areas on a Leaflet map and keeps a legend.
 *
 * Points and openings are divIcons built from the SVG marks. Lines are styled
 * from pixel geometry, so ticks, waves and double lines keep their size on screen
 * and are redrawn on zoom. Areas are polygons filled with a repeated pattern of
 * their terrain mark.
 *
 * Maplog by Roberto Bisceglie, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
 */
import * as L from 'leaflet';
import { MAPLOG_CREDIT, MAPLOG_FAMILIES, getMaplogMark } from './catalogue';
import { maplogSvg, maplogSvgInner } from './svg';
import {
    emptyMaplogData,
    type MaplogAreaRecord,
    type MaplogData,
    type MaplogItemRef,
    type MaplogLatLng,
    type MaplogLineRecord,
    type MaplogMarkRecord,
} from './model';
import {
    offsetPolyline,
    slantBreaks,
    spacedPoints,
    tickMarks,
    wavePolyline,
    type Pixel,
    type PixelSegment,
} from './geometry';
import { describeRoomState, roomStateForPlace, type MaplogRoomState } from './roomState';
import { svgElement } from './dom';

export interface MaplogLayerOptions {
    /** Hide editing: no right-click menus on placed items. */
    readOnly?: boolean;
    /** Show the legend toggle. Defaults to true. */
    legend?: boolean;
}

/** One stroke of a line style: a dashed or solid path, or a row of dots. */
interface LinePiece {
    kind: 'path' | 'dots';
    points: Pixel[];
    weight?: number;
    dashArray?: string;
    lineCap?: 'round' | 'butt';
    radius?: number;
}

const FALLBACK_INK = '#222222';
const UNCONFIRMED_DASH = '6 5';
let layerCount = 0;

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readInk(container: HTMLElement): string {
    try {
        const colour = getComputedStyle(container).color;
        return colour && colour.trim() !== '' ? colour : FALLBACK_INK;
    } catch {
        return FALLBACK_INK;
    }
}

/**
 * Line styles from catalogue marks, as pixel pieces. Positive offsets go down the
 * screen for a line running right, the same side the lower-side ticks use.
 */
export function linePiecesFor(markId: string, points: readonly Pixel[]): LinePiece[] {
    const path = (pts: Pixel[], weight: number, extra: Partial<LinePiece> = {}): LinePiece => ({ kind: 'path', points: pts, weight, ...extra });
    const ticks = (segments: PixelSegment[], weight: number): LinePiece[] =>
        segments.map(([a, b]) => path([a, b], weight));
    const dots = (pts: Pixel[], radius: number): LinePiece => ({ kind: 'dots', points: pts, radius });
    switch (markId) {
        case 'wall':
            return [path([...points], 4)];
        case 'offmap':
            return [path([...points], 4), ...ticks(slantBreaks(points, 10), 2)];
        case 'bars':
            return [path([...points], 4, { dashArray: '0.1 6', lineCap: 'round' })];
        case 'ledge':
            return [path([...points], 1.5), ...ticks(tickMarks(points, 7, 5, 'lower'), 1.5)];
        case 'cliff':
            return [path([...points], 2), ...ticks(tickMarks(points, 9, 8, 'lower'), 2)];
        case 'border':
            return [path([...points], 1), dots(spacedPoints(points, 9), 1.8)];
        case 'road':
            return [path(offsetPolyline(points, 2.5), 1.6), path(offsetPolyline(points, -2.5), 1.6)];
        case 'track':
            return [path([...points], 2.2)];
        case 'trail':
            return [path([...points], 1.2), ...ticks(tickMarks(points, 8, 7, 'both'), 1.2)];
        case 'river':
            return [
                path(wavePolyline(offsetPolyline(points, 3), 1.8, 10), 1.6),
                path(wavePolyline(offsetPolyline(points, -3), 1.8, 10, Math.PI), 1.6),
            ];
        case 'stream':
            return [path(wavePolyline(points, 2.2, 9), 1.6)];
        default:
            return [];
    }
}

/** Pattern tile for an area mark, scaled so the terrain reads at map scale. */
function patternBody(markId: string): string {
    return `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${maplogSvgInner(markId)}</g>`;
}

export class MaplogLayer {
    /** Set by the map view to open an editing menu on a placed item. Ignored when read-only. */
    onItemContextMenu: ((ref: MaplogItemRef, event: MouseEvent) => void) | null = null;

    private data: MaplogData = emptyMaplogData();
    private roomStates: ReadonlyMap<string, MaplogRoomState> = new Map();
    private readonly group: L.LayerGroup;
    private readonly uid: string;
    private ink: string;
    private patternHost: HTMLElement | null = null;
    private readonly patterns = new Set<string>();
    private legendEl: HTMLElement | null = null;
    private legendOpen = false;
    private destroyed = false;
    private readonly onZoom = (): void => this.redraw();

    constructor(private readonly map: L.Map, private readonly options: MaplogLayerOptions = {}) {
        layerCount += 1;
        this.uid = `maplog-${layerCount}`;
        this.ink = readInk(map.getContainer());
        this.group = L.layerGroup().addTo(map);
        this.map.on('zoomend', this.onZoom);
        this.buildPatternHost();
        if (options.legend !== false) this.buildLegend();
    }

    /** Replace the drawn data. Pass room states to show Lonelog state beside place IDs. */
    setData(data: MaplogData, roomStates?: ReadonlyMap<string, MaplogRoomState>): void {
        if (this.destroyed) return;
        this.data = data;
        if (roomStates) this.roomStates = roomStates;
        this.ink = readInk(this.map.getContainer());
        this.redraw();
        this.refreshLegend();
    }

    /** Room states from the active session log. Only affects the place-ID tooltips. */
    setRoomStates(roomStates: ReadonlyMap<string, MaplogRoomState>): void {
        if (this.destroyed) return;
        this.roomStates = roomStates;
        this.redraw();
    }

    getData(): MaplogData {
        return this.data;
    }

    /** Remove everything this layer added to the map. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.map.off('zoomend', this.onZoom);
        this.group.remove();
        this.legendEl?.remove();
        this.legendEl = null;
        this.patternHost?.remove();
        this.patternHost = null;
    }

    private buildPatternHost(): void {
        this.patternHost = this.map.getContainer().createDiv({ cls: 'maplog-pattern-host' });
    }

    /** Make the pattern used to fill an area mark, once per mark. */
    private patternFor(markId: string): string {
        const id = `${this.uid}-${markId}`;
        if (this.patterns.has(id) || !this.patternHost) return id;
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;color:${escapeHtml(this.ink)}"><defs>`
            + `<pattern id="${id}" width="32" height="32" patternUnits="userSpaceOnUse">${patternBody(markId)}</pattern>`
            + '</defs></svg>';
        this.patternHost.appendChild(svgElement(this.patternHost.ownerDocument, markup));
        this.patterns.add(id);
        return id;
    }

    private redraw(): void {
        if (this.destroyed) return;
        this.group.clearLayers();
        for (const area of this.data.areas) this.drawArea(area);
        for (const line of this.data.lines) this.drawLine(line);
        for (const mark of this.data.marks) this.drawMark(mark);
    }

    private toPixels(points: readonly MaplogLatLng[]): Pixel[] {
        return points.map(([lat, lng]) => {
            const p = this.map.latLngToContainerPoint(L.latLng(lat, lng));
            return { x: p.x, y: p.y };
        });
    }

    private toLatLngs(points: readonly Pixel[]): L.LatLng[] {
        return points.map(p => this.map.containerPointToLatLng(L.point(p.x, p.y)));
    }

    private attachMenu(layer: L.Layer, ref: MaplogItemRef): void {
        if (this.options.readOnly) return;
        layer.on('contextmenu', (event: L.LeafletMouseEvent) => {
            event.originalEvent?.preventDefault();
            this.onItemContextMenu?.(ref, event.originalEvent);
        });
    }

    private drawMark(item: MaplogMarkRecord): void {
        const latlng = L.latLng(item.latlng[0], item.latlng[1]);
        const svg = maplogSvg(item.mark, {
            attributes: item.attributes,
            dashed: item.dashed,
            rotation: item.rotation,
            grade: item.grade,
            size: 28,
        });
        const labelParts: string[] = [];
        if (item.placeId) labelParts.push(`<strong>${escapeHtml(item.placeId)}</strong>`);
        if (item.label) labelParts.push(escapeHtml(item.label));
        if (item.level) labelParts.push(`<span class="maplog-level">${escapeHtml(item.level)}</span>`);
        if (item.destination) labelParts.push(`<span class="maplog-destination">to ${escapeHtml(item.destination)}</span>`);
        const label = labelParts.length ? `<span class="maplog-mark-label">${labelParts.join(' ')}</span>` : '';
        const html = `<div class="maplog-mark" style="color:${escapeHtml(this.ink)}">${svg}${label}</div>`;
        const icon = L.divIcon({ className: 'maplog-mark-icon-wrap', html, iconSize: [28, 28], iconAnchor: [14, 14] });
        const marker = L.marker(latlng, { icon, keyboard: false, interactive: true });
        const tip = this.tooltipFor(item);
        if (tip) marker.bindTooltip(escapeHtml(tip));
        this.attachMenu(marker, { type: 'mark', id: item.id });
        this.group.addLayer(marker);
    }

    private tooltipFor(item: MaplogMarkRecord): string | undefined {
        if (!item.placeId) return undefined;
        const state = roomStateForPlace(this.roomStates, item.placeId);
        return state ? describeRoomState(state, item.placeId) : item.placeId;
    }

    private drawLine(item: MaplogLineRecord): void {
        const def = getMaplogMark(item.mark);
        if (!def || item.points.length < 2) return;
        const pixels = this.toPixels(item.points);
        const pieces = linePiecesFor(item.mark, pixels);
        const ref: MaplogItemRef = { type: 'line', id: item.id };
        const dash = item.dashed ? UNCONFIRMED_DASH : undefined;
        // A wide transparent stroke makes thin lines easy to hit for the menu.
        const hit = L.polyline(this.toLatLngs(pixels), { color: this.ink, weight: 12, opacity: 0, interactive: !this.options.readOnly });
        this.attachMenu(hit, ref);
        this.group.addLayer(hit);
        for (const piece of pieces) {
            const latlngs = this.toLatLngs(piece.points);
            if (piece.kind === 'dots') {
                for (const point of latlngs) {
                    this.group.addLayer(L.circleMarker(point, {
                        radius: piece.radius ?? 2,
                        color: this.ink,
                        weight: 0,
                        fillColor: this.ink,
                        fillOpacity: 1,
                        interactive: false,
                    }));
                }
                continue;
            }
            const style: L.PolylineOptions = {
                color: this.ink,
                weight: piece.weight ?? 2,
                opacity: 1,
                lineCap: piece.lineCap ?? 'round',
                lineJoin: 'round',
                interactive: false,
            };
            const dashArray = piece.dashArray ?? dash;
            if (dashArray) style.dashArray = dashArray;
            this.group.addLayer(L.polyline(latlngs, style));
        }
        if (item.attributes?.includes('illusory')) {
            const mid = this.midpoint(item.points);
            this.group.addLayer(L.marker(mid, {
                icon: L.divIcon({ className: 'maplog-mark-icon-wrap', html: `<div class="maplog-mark maplog-letter" style="color:${escapeHtml(this.ink)}">?</div>`, iconSize: [14, 14], iconAnchor: [-6, 14] }),
                interactive: false,
                keyboard: false,
            }));
        }
    }

    private midpoint(points: readonly MaplogLatLng[]): L.LatLng {
        const mid = points[Math.floor(points.length / 2)];
        return L.latLng(mid[0], mid[1]);
    }

    private drawArea(item: MaplogAreaRecord): void {
        if (item.points.length < 3) return;
        const patternId = this.patternFor(item.mark);
        const polygon = L.polygon(item.points.map(([lat, lng]) => L.latLng(lat, lng)), {
            color: this.ink,
            weight: 1,
            opacity: 0.85,
            fill: true,
            fillColor: `url(#${patternId})`,
            fillOpacity: 1,
            dashArray: item.dashed ? UNCONFIRMED_DASH : undefined,
            interactive: !this.options.readOnly,
        });
        this.attachMenu(polygon, { type: 'area', id: item.id });
        this.group.addLayer(polygon);
        if (item.label) {
            const centre = item.points.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
            const count = item.points.length;
            this.group.addLayer(L.marker([centre[0] / count, centre[1] / count], {
                icon: L.divIcon({ className: 'maplog-mark-icon-wrap', html: `<div class="maplog-mark maplog-area-label" style="color:${escapeHtml(this.ink)}"><span class="maplog-mark-label">${escapeHtml(item.label)}</span></div>`, iconSize: [1, 1], iconAnchor: [0, 0] }),
                interactive: false,
                keyboard: false,
            }));
        }
    }

    private buildLegend(): void {
        const container = this.map.getContainer();
        const wrap = container.createDiv({ cls: 'maplog-legend-wrap' });
        const toggle = wrap.createEl('button', { cls: 'maplog-legend-toggle', text: 'Legend', attr: { type: 'button', 'aria-expanded': 'false' } });
        const panel = wrap.createDiv({ cls: 'maplog-legend' });
        panel.hide();
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);
        toggle.addEventListener('click', () => {
            this.legendOpen = !this.legendOpen;
            toggle.setAttribute('aria-expanded', String(this.legendOpen));
            if (this.legendOpen) panel.show(); else panel.hide();
        });
        this.legendEl = wrap;
        this.refreshLegend();
    }

    /** Legend rows for the marks this map uses, grouped by family in palette order. */
    private refreshLegend(): void {
        const wrap = this.legendEl;
        if (!wrap) return;
        const panel = wrap.querySelector<HTMLElement>('.maplog-legend');
        if (!panel) return;
        panel.empty();
        panel.createDiv({ cls: 'maplog-legend-title', text: 'Marks on this map' });
        const counts = new Map<string, number>();
        for (const item of [...this.data.marks, ...this.data.lines, ...this.data.areas]) {
            counts.set(item.mark, (counts.get(item.mark) ?? 0) + 1);
        }
        if (counts.size === 0) panel.createDiv({ cls: 'maplog-legend-empty', text: 'No marks yet.' });
        for (const family of MAPLOG_FAMILIES) {
            const rows = [...counts.keys()].map(id => getMaplogMark(id)).filter(def => def?.family === family.id);
            if (rows.length === 0) continue;
            panel.createDiv({ cls: 'maplog-legend-family', text: family.label });
            for (const def of rows) {
                if (!def) continue;
                const row = panel.createDiv({ cls: 'maplog-legend-row' });
                const icon = row.createSpan({ cls: 'maplog-legend-icon' });
                icon.appendChild(svgElement(icon.ownerDocument, maplogSvg(def.id, { size: 20 })));
                row.createSpan({ cls: 'maplog-legend-name', text: `${def.label}${counts.get(def.id) && counts.get(def.id)! > 1 ? ` (${counts.get(def.id)})` : ''}` });
            }
        }
        panel.createDiv({ cls: 'maplog-legend-credit', text: MAPLOG_CREDIT });
    }
}
