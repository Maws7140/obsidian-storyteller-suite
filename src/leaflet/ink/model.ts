/**
 * Map Ink document model: types, untrusted-input normalisation, point encoding
 * and frontmatter serialisation.
 *
 * Pure TypeScript: no Obsidian or DOM imports. Input from notes is untrusted, so
 * everything that reads a document goes through normalizeInk.
 */
import { DEFAULT_STYLE, DEFAULT_TEXT_STYLE } from './styles';

export type InkPoint = [number, number];              // [lat, lng], as Leaflet uses
export type InkKind = 'stamp' | 'text' | 'path' | 'area' | 'freehand' | 'rect' | 'ellipse';
export type DashStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'wavy' | 'ticked' | 'railway';
export type FillPattern = 'none' | 'solid' | 'hatch' | 'crosshatch' | 'dots' | `symbol:${string}`;

export interface InkStyle {
  stroke: string;          // CSS colour, '#rrggbb'
  strokeWidth: number;     // map units when scaleWithMap, else px
  strokeOpacity: number;   // 0..1
  dash: DashStyle;
  fill: string;
  fillOpacity: number;
  fillPattern: FillPattern;
  patternColor?: string;   // defaults to stroke
  smooth?: boolean;        // path/area/freehand: Catmull-Rom
  arrowStart?: boolean;
  arrowEnd?: boolean;
  brush?: string;          // brush id from brushes.ts; when set it replaces `dash`
  brushFlip?: boolean;     // one-sided brushes (cliff, ledge, castle wall) draw their marks on the other side
  brushScale?: number;     // 0.5..3, spacing and tick size multiplier, default 1
}

export interface InkTextStyle {
  font: 'serif' | 'sans' | 'hand' | 'mono';
  size: number;            // map units or px, like strokeWidth
  color: string;
  halo: string;            // outline colour; '' for none
  haloWidth: number;
  bold?: boolean;
  italic?: boolean;
  letterSpacing?: number;  // em
  align: 'start' | 'middle' | 'end';
}

export interface InkBase {
  id: string;
  kind: InkKind;
  layer: string;           // layer id
  scaleWithMap: boolean;   // default true
  locked?: boolean;
  hidden?: boolean;
  name?: string;           // shows in legend and tooltip
  locationId?: string;     // linked Storyteller location
}
export interface InkStamp extends InkBase { kind: 'stamp'; at: InkPoint; symbol: string; size: number; rotation: number; color: string; opacity: number; label?: string; }
export interface InkText  extends InkBase { kind: 'text';  at: InkPoint; text: string; rotation: number; style: InkTextStyle; }
export interface InkPath  extends InkBase { kind: 'path' | 'freehand'; points: InkPoint[]; style: InkStyle; }
export interface InkArea  extends InkBase { kind: 'area'; points: InkPoint[]; style: InkStyle; }
export interface InkBox   extends InkBase { kind: 'rect' | 'ellipse'; a: InkPoint; b: InkPoint; rotation: number; style: InkStyle; }
export type InkItem = InkStamp | InkText | InkPath | InkArea | InkBox;

export interface InkLayerDef { id: string; name: string; visible: boolean; locked: boolean; }
export interface InkDoc { version: 1; layers: InkLayerDef[]; items: InkItem[]; }   // items in paint order

/** The frontmatter key that holds the document. */
export const INK_FRONTMATTER_KEY = 'mapInk';

/** The serialisable form of a document: points are compact strings. */
export interface InkFrontmatter {
  version: 1;
  layers: InkLayerDef[];
  items: Array<Record<string, unknown>>;
}

const INK_KINDS: readonly InkKind[] = ['stamp', 'text', 'path', 'area', 'freehand', 'rect', 'ellipse'];
const DASH_STYLES: readonly DashStyle[] = ['solid', 'dashed', 'dotted', 'double', 'wavy', 'ticked', 'railway'];
const BASIC_PATTERNS: readonly string[] = ['none', 'solid', 'hatch', 'crosshatch', 'dots'];
const TEXT_FONTS: readonly InkTextStyle['font'][] = ['serif', 'sans', 'hand', 'mono'];
const TEXT_ALIGNS: readonly InkTextStyle['align'][] = ['start', 'middle', 'end'];

const COORD_LIMIT = 1e7;
const TEXT_LIMIT = 2000;
const NAME_LIMIT = 200;
const ID_LIMIT = 64;
const SYMBOL_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** CSS named colours (CSS Color Module Level 4). */
const CSS_COLOR_NAMES = new Set(
  ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
  'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
  'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
  'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
  'ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
  'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
  'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace ' +
  'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
  'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
  'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
  'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
  'yellowgreen').split(' '),
);

/** A fresh document with the four default layers and no items. */
export function defaultInkDoc(): InkDoc {
  return {
    version: 1,
    layers: [
      { id: 'terrain', name: 'Terrain', visible: true, locked: false },
      { id: 'routes', name: 'Routes', visible: true, locked: false },
      { id: 'features', name: 'Features', visible: true, locked: false },
      { id: 'labels', name: 'Labels', visible: true, locked: false },
    ],
    items: [],
  };
}

/** True for a CSS colour we accept: #rgb, #rrggbb, rgb()/rgba() with commas, or a CSS named colour. */
export function isValidColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return true;
  const fn = /^rgba?\(([^()]*)\)$/i.exec(s);
  if (fn) return isValidRgbBody(fn[1]);
  return CSS_COLOR_NAMES.has(s.toLowerCase());
}

function isValidRgbBody(body: string): boolean {
  const parts = body.split(',').map(p => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return false;
  for (let i = 0; i < 3; i++) {
    if (!/^\d{1,3}(\.\d+)?$/.test(parts[i]) || Number(parts[i]) > 255) return false;
  }
  if (parts.length === 4) {
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(parts[3]) || Number(parts[3]) > 1) return false;
  }
  return true;
}

/** Format a coordinate list as "x,y x,y", rounded to 2 decimals with no trailing zeros. */
export function encodePoints(points: readonly InkPoint[]): string {
  return points
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => `${formatNumber(p[0])},${formatNumber(p[1])}`)
    .join(' ');
}

/**
 * Read points from a compact "x,y x,y" string, or from an array of [x, y] pairs.
 * Invalid pairs are skipped.
 */
export function decodePoints(input: string | readonly unknown[]): InkPoint[] {
  const out: InkPoint[] = [];
  if (typeof input === 'string') {
    for (const token of input.split(/\s+/)) {
      if (!token) continue;
      const parts = token.split(',');
      if (parts.length !== 2) continue;
      const x = toNumber(parts[0]);
      const y = toNumber(parts[1]);
      if (x !== undefined && y !== undefined) out.push([x, y]);
    }
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        out.push(...decodePoints(item));
      } else if (Array.isArray(item) && item.length >= 2) {
        const x = toNumber(item[0]);
        const y = toNumber(item[1]);
        if (x !== undefined && y !== undefined) out.push([x, y]);
      }
    }
  }
  return out;
}

/**
 * Turn untrusted input (parsed frontmatter, or an InkDoc) into a valid document.
 * Unknown kinds and malformed items are dropped, values are clamped, ids are made
 * unique, and items on unknown layers move to the first layer. Idempotent.
 */
export function normalizeInk(raw: unknown): InkDoc {
  const src: Record<string, unknown> = isRecord(raw) ? raw : {};
  const layers = normalizeLayers(src.layers);
  const layerIds = new Set(layers.map(l => l.id));
  const firstLayer = layers[0].id;
  const used = new Set<string>();
  const items: InkItem[] = [];
  if (Array.isArray(src.items)) {
    for (const rawItem of src.items) {
      const item = normalizeItem(rawItem, layerIds, firstLayer);
      if (!item) continue;
      const id = item.id && !used.has(item.id) ? item.id : freshId(item.kind, used);
      used.add(id);
      items.push({ ...item, id } as InkItem);
    }
  }
  return { version: 1, layers, items };
}

/**
 * The object stored under the `mapInk` frontmatter key. Points become compact
 * strings. The document is normalised first, so the output always reads back.
 */
export function inkFrontmatter(doc: InkDoc): InkFrontmatter {
  const clean = normalizeInk(doc);
  return {
    version: 1,
    layers: clean.layers.map(l => ({ ...l })),
    items: clean.items.map(serialiseItem),
  };
}

/** A new id for `kind` that no item in `doc` uses, such as "stamp-3". */
export function nextInkId(kind: InkKind, doc: InkDoc): string {
  const used = new Set(doc.items.map(i => i.id));
  return freshId(kind, used);
}

// ---- helpers -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 + 0;   // + 0 turns -0 into 0
}

function formatNumber(n: number): string {
  const text = round2(n).toFixed(2);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A number clamped to [min, max], rounded to 2 decimals, or the fallback when missing. */
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = toNumber(v);
  return n === undefined ? fallback : round2(clamp(n, min, max));
}

/** An angle in degrees, normalised to [0, 360). */
function angle(v: unknown): number {
  const n = toNumber(v);
  if (n === undefined) return 0;
  const r = round2(((n % 360) + 360) % 360);
  return r >= 360 ? 0 : r;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T;
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: undefined): T | undefined;
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T | undefined): T | undefined {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A single trimmed line of text, collapsing whitespace and limited to `max` characters. */
function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const collapsed = v.replace(/\s+/g, ' ').trim();
  return Array.from(collapsed).slice(0, max).join('').trim();
}

/** Multi-line text: control characters removed, line endings unified, limited to `max` characters. */
function cleanMultiline(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const cleaned = v
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, max).join('').replace(/\s+$/, '');
}

function cleanId(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return s.length > 0 && s.length <= ID_LIMIT ? s : '';
}

function cleanColor(v: unknown, fallback: string): string {
  return isValidColor(v) ? v.trim() : fallback;
}

function cleanFill(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.trim() === 'none') return 'none';
  return cleanColor(v, fallback);
}

function cleanPattern(v: unknown, fallback: FillPattern): FillPattern {
  if (typeof v !== 'string') return fallback;
  if (BASIC_PATTERNS.includes(v)) return v as FillPattern;
  if (v.startsWith('symbol:') && SYMBOL_ID.test(v.slice(7))) return v as FillPattern;
  return fallback;
}

function clampCoord(n: number): number {
  return round2(clamp(n, -COORD_LIMIT, COORD_LIMIT));
}

function clampPoint(p: InkPoint): InkPoint {
  return [clampCoord(p[0]), clampCoord(p[1])];
}

/** One point from an [x, y] array or a single "x,y" string. */
function toPoint(v: unknown): InkPoint | undefined {
  if (Array.isArray(v) && v.length >= 2) {
    const x = toNumber(v[0]);
    const y = toNumber(v[1]);
    if (x !== undefined && y !== undefined) return clampPoint([x, y]);
    return undefined;
  }
  if (typeof v === 'string') {
    const first = decodePoints(v)[0];
    return first ? clampPoint(first) : undefined;
  }
  return undefined;
}

/** A point list from a compact string or an array of pairs. */
function toPoints(v: unknown): InkPoint[] {
  if (typeof v === 'string') return decodePoints(v).map(clampPoint);
  if (Array.isArray(v)) return decodePoints(v).map(clampPoint);
  return [];
}

function normalizeLayers(raw: unknown): InkLayerDef[] {
  const out: InkLayerDef[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const id = cleanLine(item.id, ID_LIMIT);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: cleanLine(item.name, NAME_LIMIT) || id,
        visible: item.visible !== false,
        locked: item.locked === true,
      });
    }
  }
  return out.length > 0 ? out : defaultInkDoc().layers;
}

function normalizeStyle(v: unknown): InkStyle {
  const s: Record<string, unknown> = isRecord(v) ? v : {};
  const d = DEFAULT_STYLE;
  const out: InkStyle = {
    stroke: cleanColor(s.stroke, d.stroke),
    strokeWidth: num(s.strokeWidth, 0.1, 200, d.strokeWidth),
    strokeOpacity: num(s.strokeOpacity, 0, 1, d.strokeOpacity),
    dash: oneOf(s.dash, DASH_STYLES, d.dash),
    fill: cleanFill(s.fill, d.fill),
    fillOpacity: num(s.fillOpacity, 0, 1, d.fillOpacity),
    fillPattern: cleanPattern(s.fillPattern, d.fillPattern),
  };
  const patternColor = s.patternColor;
  if (isValidColor(patternColor)) out.patternColor = patternColor.trim();
  if (s.smooth === true) out.smooth = true;
  if (s.arrowStart === true) out.arrowStart = true;
  if (s.arrowEnd === true) out.arrowEnd = true;
  return out;
}

function normalizeTextStyle(v: unknown): InkTextStyle {
  const s: Record<string, unknown> = isRecord(v) ? v : {};
  const d = DEFAULT_TEXT_STYLE;
  const halo = s.halo === '' || s.halo === 'none' ? '' : cleanColor(s.halo, d.halo);
  const out: InkTextStyle = {
    font: oneOf(s.font, TEXT_FONTS, d.font),
    size: num(s.size, 1, 2000, d.size),
    color: cleanColor(s.color, d.color),
    halo,
    haloWidth: num(s.haloWidth, 0, 50, d.haloWidth),
    letterSpacing: num(s.letterSpacing, -1, 5, d.letterSpacing ?? 0),
    align: oneOf(s.align, TEXT_ALIGNS, d.align),
  };
  if (s.bold === true) out.bold = true;
  if (s.italic === true) out.italic = true;
  return out;
}

function normalizeItem(raw: unknown, layerIds: Set<string>, firstLayer: string): InkItem | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = oneOf(raw.kind, INK_KINDS, undefined);
  if (!kind) return undefined;

  const base: InkBase = {
    id: cleanId(raw.id),
    kind,
    layer: typeof raw.layer === 'string' && layerIds.has(raw.layer) ? raw.layer : firstLayer,
    scaleWithMap: raw.scaleWithMap !== false,
  };
  if (raw.locked === true) base.locked = true;
  if (raw.hidden === true) base.hidden = true;
  const name = cleanLine(raw.name, NAME_LIMIT);
  if (name) base.name = name;
  const locationId = cleanLine(raw.locationId, ID_LIMIT);
  if (locationId) base.locationId = locationId;

  switch (kind) {
    case 'stamp': {
      const at = toPoint(raw.at);
      const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim() : '';
      if (!at || !SYMBOL_ID.test(symbol)) return undefined;
      const item: InkStamp = {
        ...base,
        kind: 'stamp',
        at,
        symbol,
        size: num(raw.size, 1, 2000, 32),
        rotation: angle(raw.rotation),
        color: cleanColor(raw.color, DEFAULT_STYLE.stroke),
        opacity: num(raw.opacity, 0, 1, 1),
      };
      const label = cleanLine(raw.label, NAME_LIMIT);
      if (label) item.label = label;
      return item;
    }
    case 'text': {
      const at = toPoint(raw.at);
      const text = cleanMultiline(raw.text, TEXT_LIMIT);
      if (!at || !text) return undefined;
      const item: InkText = {
        ...base,
        kind: 'text',
        at,
        text,
        rotation: angle(raw.rotation),
        style: normalizeTextStyle(raw.style),
      };
      return item;
    }
    case 'path':
    case 'freehand': {
      const points = toPoints(raw.points);
      if (points.length < 2) return undefined;
      const item: InkPath = { ...base, kind, points, style: normalizeStyle(raw.style) };
      return item;
    }
    case 'area': {
      const points = toPoints(raw.points);
      if (points.length < 3) return undefined;
      const item: InkArea = { ...base, kind: 'area', points, style: normalizeStyle(raw.style) };
      return item;
    }
    case 'rect':
    case 'ellipse': {
      const a = toPoint(raw.a);
      const b = toPoint(raw.b);
      if (!a || !b) return undefined;
      const item: InkBox = {
        ...base,
        kind,
        a,
        b,
        rotation: angle(raw.rotation),
        style: normalizeStyle(raw.style),
      };
      return item;
    }
  }
  return undefined;
}

function freshId(kind: string, used: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${kind}-${n}`;
    if (!used.has(id)) return id;
  }
}

function serialiseItem(item: InkItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue;
    if (key === 'points' && Array.isArray(value)) {
      out[key] = encodePoints(value as InkPoint[]);
    } else if ((key === 'at' || key === 'a' || key === 'b') && Array.isArray(value)) {
      out[key] = [round2(value[0] as number), round2(value[1] as number)];
    } else if ((key === 'style' || key === 'textStyle') && isRecord(value)) {
      out[key] = { ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}
