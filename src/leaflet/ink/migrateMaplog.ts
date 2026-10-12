/**
 * Maplog to Map Ink migration. Turns the three Maplog frontmatter lists on a map
 * note (maplogMarks, maplogLines, maplogAreas) into an InkDoc with the default
 * layers.
 *
 * The raw frontmatter shapes are parsed here, defensively, so this file does not
 * import the Maplog code and the Ink core stays standalone. Input is untrusted:
 * anything malformed is skipped rather than thrown.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import {
  defaultInkDoc,
  type DashStyle,
  type InkArea,
  type InkDoc,
  type InkItem,
  type InkPath,
  type InkPoint,
  type InkStamp,
  type InkStyle,
  type InkText,
  type InkTextStyle,
} from './model';
import { DEFAULT_STYLE, DEFAULT_TEXT_STYLE, applyPreset, findPreset } from './styles';
import { getSymbol, type SymbolCategory } from './symbols';

/** The frontmatter keys that hold Maplog data on a map note. */
export const MAPLOG_KEYS = ['maplogMarks', 'maplogLines', 'maplogAreas'] as const;

type LayerId = 'terrain' | 'routes' | 'features' | 'labels';

interface LineRule {
  preset: string;
  /** The barrier brush (brushes.ts) that draws the line. Same id as the Maplog mark. */
  brush: string;
  layer: LayerId;
  labelPreset: string;
  dash?: DashStyle;
  strokeWidth?: number;
}

/**
 * Maplog line marks and how they are drawn. Each keeps its preset colour and gets the brush of the same name.
 * `dash` is the plain fallback for when the brush is unknown.
 */
const LINE_RULES: ReadonlyMap<string, LineRule> = new Map<string, LineRule>([
  ['wall', { preset: 'wall', brush: 'wall', layer: 'features', labelPreset: 'label-place' }],
  ['bars', { preset: 'wall', brush: 'bars', layer: 'features', labelPreset: 'label-place', dash: 'dotted' }],
  ['offmap', { preset: 'wall', brush: 'offmap', layer: 'features', labelPreset: 'label-place', dash: 'dashed' }],
  ['ledge', { preset: 'cliff', brush: 'ledge', layer: 'features', labelPreset: 'label-place', strokeWidth: 1.5 }],
  ['cliff', { preset: 'cliff', brush: 'cliff', layer: 'terrain', labelPreset: 'label-place' }],
  ['border', { preset: 'border', brush: 'border', layer: 'terrain', labelPreset: 'label-place' }],
  ['road', { preset: 'road', brush: 'road', layer: 'routes', labelPreset: 'label-place' }],
  ['track', { preset: 'track', brush: 'track', layer: 'routes', labelPreset: 'label-place' }],
  ['trail', { preset: 'trail', brush: 'trail', layer: 'routes', labelPreset: 'label-place', strokeWidth: 1.2 }],
  ['river', { preset: 'river', brush: 'river', layer: 'routes', labelPreset: 'label-water' }],
  ['stream', { preset: 'stream', brush: 'stream', layer: 'routes', labelPreset: 'label-water', strokeWidth: 1.6 }],
]);

/** Maplog area marks. Each one is also the id of a built-in preset. */
const AREA_MARKS: ReadonlySet<string> = new Set([
  'water', 'plains', 'forest', 'jungle', 'hills', 'mountains', 'desert', 'swamp', 'ice',
]);

/** Colour for a stamp, by the category of its symbol. Dark ink for dungeon marks. */
const STAMP_COLOURS: Readonly<Record<SymbolCategory, string>> = {
  dungeon: '#2b2118',
  overland: '#8b5a2b',
  settlements: '#8e2c2c',
  sites: '#7b4fa0',
  nature: '#3f7d3a',
  markers: '#2b2118',
};

const STAMP_SIZE = 24;
/**
 * Stamp labels sit below their stamp. The gap is measured from the stamp's centre
 * to the top of the text, so a 36 px location token (radius 18) is clear of it.
 */
const LABEL_TOP_GAP = 22;
/** Size of the label text, in map units, for a place label on a stamp. */
const PLACE_LABEL_SIZE = 12;
/** Size of line and area labels, in map units. Water labels take their size from the preset (13). */
const SHAPE_LABEL_SIZE = 13;
/** Text ascent used to find the top of a label from its baseline anchor. Matches svgBuild. */
const TEXT_ASCENT = 0.8;
const COORD_LIMIT = 1e7;
const ID_LIMIT = 64;
const TEXT_LIMIT = 200;
const DOOR_ATTRIBUTES = ['locked', 'secret', 'barred', 'trapped', 'oneway', 'illusory'] as const;
const SETTLEMENTS_WITH_PORT = new Set(['village', 'town', 'city']);

// ---- entry points --------------------------------------------------------

/** True when the frontmatter holds at least one Maplog mark, line or area. */
export function hasMaplogData(frontmatter: unknown): boolean {
  if (!isRecord(frontmatter)) return false;
  return MAPLOG_KEYS.some(key => {
    const value = frontmatter[key];
    return Array.isArray(value) && value.length > 0;
  });
}

/**
 * The Map Ink document for a note's Maplog frontmatter. Areas come first, then
 * lines, then marks, and every label is a text item at the end so it paints on top.
 * Garbage input gives an empty document with the default layers.
 */
export function migrateMaplog(frontmatter: unknown): InkDoc {
  const doc = defaultInkDoc();
  if (!isRecord(frontmatter)) return doc;

  const ids = new IdPool();
  const shapes: InkItem[] = [];
  const labels: PendingLabel[] = [];

  eachRecord(frontmatter.maplogAreas, (raw, index) => {
    const mark = markName(raw);
    if (!AREA_MARKS.has(mark)) return;
    const pts = points(raw.points);
    if (pts.length < 3) return;
    const id = ids.take(rawId(raw.id) ?? `${mark}-${index + 1}`);
    const style = presetStyle(mark);
    style.dash = dashFor(style.dash, raw.dashed);
    const area: InkArea = { id, kind: 'area', layer: 'terrain', scaleWithMap: true, points: pts, style };
    const name = cleanText(raw.label, TEXT_LIMIT);
    if (name) {
      area.name = name;
      labels.push({ owner: id, text: name, at: centroid(pts), style: textStyle(mark === 'water' ? 'label-water' : 'label-place', SHAPE_LABEL_SIZE) });
    }
    shapes.push(area);
  });

  eachRecord(frontmatter.maplogLines, (raw, index) => {
    const mark = markName(raw);
    const rule = LINE_RULES.get(mark);
    if (!rule) return;
    const pts = points(raw.points);
    if (pts.length < 2) return;
    const id = ids.take(rawId(raw.id) ?? `${mark}-${index + 1}`);
    const style = presetStyle(rule.preset);
    if (rule.dash) style.dash = rule.dash;
    if (rule.strokeWidth !== undefined) style.strokeWidth = rule.strokeWidth;
    style.brush = rule.brush;
    style.dash = dashFor(style.dash, raw.dashed);
    const path: InkPath = { id, kind: 'path', layer: rule.layer, scaleWithMap: true, points: pts, style };
    const name = cleanText(raw.label, TEXT_LIMIT);
    if (name) {
      path.name = name;
      labels.push({ owner: id, text: name, at: midpoint(pts), style: textStyle(rule.labelPreset, SHAPE_LABEL_SIZE) });
    }
    shapes.push(path);
  });

  eachRecord(frontmatter.maplogMarks, (raw, index) => {
    const mark = markName(raw);
    if (LINE_RULES.has(mark) || AREA_MARKS.has(mark)) return;
    const at = point(raw.latlng);
    if (!at) return;
    const symbolId = symbolFor(mark, attributeSet(raw.attributes), raw);
    const symbol = getSymbol(symbolId);
    if (!symbol) return;
    const id = ids.take(rawId(raw.id) ?? `${mark}-${index + 1}`);
    const stamp: InkStamp = {
      id,
      kind: 'stamp',
      layer: 'features',
      scaleWithMap: true,
      at,
      symbol: symbol.id,
      size: STAMP_SIZE,
      rotation: angle(raw.rotation),
      color: STAMP_COLOURS[symbol.category],
      opacity: 1,
    };
    const name = cleanText(raw.label, TEXT_LIMIT);
    if (name) stamp.name = name;
    const locationId = cleanText(raw.locationId, ID_LIMIT);
    if (locationId) stamp.locationId = locationId;
    shapes.push(stamp);
    const text = markLabelText(raw);
    if (text) {
      labels.push({ owner: id, text, at: belowStamp(at, PLACE_LABEL_SIZE), style: textStyle('label-place', PLACE_LABEL_SIZE) });
    }
  });

  const texts: InkText[] = labels.map((label): InkText => ({
    id: ids.take(`${label.owner}-label`),
    kind: 'text',
    layer: 'labels',
    scaleWithMap: true,
    at: label.at,
    text: label.text,
    rotation: 0,
    style: label.style,
  }));

  return { version: 1, layers: doc.layers, items: [...shapes, ...texts] };
}

// ---- mapping helpers -----------------------------------------------------

interface PendingLabel {
  owner: string;
  text: string;
  at: InkPoint;
  style: InkTextStyle;
}

/** Hands out unique ids. A taken candidate gets the first free -2, -3 ... suffix. */
class IdPool {
  private readonly used = new Set<string>();

  take(candidate: string): string {
    const base = candidate.slice(0, ID_LIMIT - 12);
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}-${n}`;
    this.used.add(id);
    return id;
  }
}

/** The symbol a mark draws with, including the door, pit, trapdoor and port variants. */
function symbolFor(mark: string, attrs: ReadonlySet<string>, raw: Record<string, unknown>): string {
  if (mark === 'slope') return `slope-${slopeGrade(raw.grade)}`;
  if (mark === 'passage' && attrs.has('secret')) return 'passage-secret';
  if (mark === 'door' || mark === 'double') {
    const hit = DOOR_ATTRIBUTES.find(attr => attrs.has(attr));
    return hit ? `door-${hit}` : mark;
  }
  if (mark === 'pit' && attrs.has('covered')) return 'pit-covered';
  if (mark === 'trapdoor') {
    if (attrs.has('secret')) return 'trapdoor-secret';
    if (attrs.has('ceiling')) return 'trapdoor-ceiling';
    return mark;
  }
  if (SETTLEMENTS_WITH_PORT.has(mark) && attrs.has('port')) return `${mark}-port`;
  return mark;
}

/** Slope grade 1 to 3 from the mark's grade field. Missing or invalid grades give 3, the old three-chevron slope. */
function slopeGrade(value: unknown): 1 | 2 | 3 {
  const n = finite(value);
  if (n === undefined) return 3;
  const grade = Math.round(n);
  return grade === 1 || grade === 2 ? grade : 3;
}

/** "R3 Prancing Pony (L1, to L3)": place ID and name, then level and destination in brackets. */
function markLabelText(raw: Record<string, unknown>): string | undefined {
  const head = [cleanText(raw.placeId, TEXT_LIMIT), cleanText(raw.label, TEXT_LIMIT)].filter(Boolean).join(' ');
  const destination = cleanText(raw.destination, TEXT_LIMIT);
  const detail = [cleanText(raw.level, TEXT_LIMIT), destination ? `to ${destination}` : undefined]
    .filter(Boolean)
    .join(', ');
  if (!head && !detail) return undefined;
  if (!detail) return head;
  if (!head) return `(${detail})`;
  return `${head} (${detail})`;
}

/** Starting style for a path or area from its preset. Unknown presets give the defaults. */
function presetStyle(presetId: string): InkStyle {
  const preset = findPreset(presetId);
  return preset ? applyPreset(DEFAULT_STYLE, preset) : { ...DEFAULT_STYLE };
}

function textStyle(presetId: string, size?: number): InkTextStyle {
  const preset = findPreset(presetId);
  const style = preset ? applyPreset(DEFAULT_TEXT_STYLE, preset) : { ...DEFAULT_TEXT_STYLE };
  if (size !== undefined) style.size = size;
  return style;
}

/**
 * Anchor for a label that sits under a stamp. Points are [lat, lng] and lat grows
 * upward on CRS.Simple, so "below" is a smaller lat. The text is centred on the
 * stamp and its baseline is placed so its top is LABEL_TOP_GAP map units under the stamp.
 */
function belowStamp(at: InkPoint, size: number): InkPoint {
  const drop = LABEL_TOP_GAP + TEXT_ASCENT * size;
  return [round2(at[0] - drop), round2(at[1])];
}

/** Maplog's unconfirmed flag: dashed, unless the preset already has a dash pattern. */
function dashFor(base: DashStyle, dashed: unknown): DashStyle {
  return dashed === true && base === 'solid' ? 'dashed' : base;
}

/** Centre of mass of a polygon. Falls back to the vertex average for a flat shape. */
function centroid(pts: readonly InkPoint[]): InkPoint {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const sum = pts.reduce<InkPoint>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [round2(sum[0] / pts.length), round2(sum[1] / pts.length)];
  }
  return [round2(cx / (3 * twiceArea)), round2(cy / (3 * twiceArea))];
}

/** The point halfway along a polyline, measured by length. */
function midpoint(pts: readonly InkPoint[]): InkPoint {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += segmentLength(pts[i - 1], pts[i]);
  if (total === 0) return pts[0];
  const half = total / 2;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = segmentLength(pts[i - 1], pts[i]);
    if (len === 0) continue;
    if (walked + len >= half) {
      const t = (half - walked) / len;
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return [round2(x0 + (x1 - x0) * t), round2(y0 + (y1 - y0) * t)];
    }
    walked += len;
  }
  return pts[pts.length - 1];
}

function segmentLength(a: InkPoint, b: InkPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// ---- raw value readers ---------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function eachRecord(list: unknown, visit: (raw: Record<string, unknown>, index: number) => void): void {
  if (!Array.isArray(list)) return;
  list.forEach((raw, index) => {
    if (isRecord(raw)) visit(raw, index);
  });
}

function markName(raw: Record<string, unknown>): string {
  return typeof raw.mark === 'string' ? raw.mark : '';
}

function rawId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 ? id : undefined;
}

function finite(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 + 0;
}

function clampCoord(n: number): number {
  return round2(Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, n)));
}

function point(value: unknown): InkPoint | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = finite(value[0]);
  const y = finite(value[1]);
  if (x === undefined || y === undefined) return undefined;
  return [clampCoord(x), clampCoord(y)];
}

function points(value: unknown): InkPoint[] {
  if (!Array.isArray(value)) return [];
  const out: InkPoint[] = [];
  for (const entry of value) {
    const p = point(entry);
    if (p) out.push(p);
  }
  return out;
}

/** Degrees clockwise in [0, 360). Missing or invalid values are 0. */
function angle(value: unknown): number {
  const n = finite(value);
  if (n === undefined) return 0;
  const turned = round2(((n % 360) + 360) % 360);
  return turned >= 360 ? 0 : turned;
}

/** Trimmed single-line text with whitespace collapsed, or undefined when empty. */
function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const collapsed = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = Array.from(collapsed).slice(0, max).join('').trim();
  return text === '' ? undefined : text;
}

function attributeSet(value: unknown): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(value)) {
    for (const entry of value) if (typeof entry === 'string') out.add(entry);
  }
  return out;
}
