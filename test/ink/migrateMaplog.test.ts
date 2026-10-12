import { describe, expect, it } from 'vitest';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkArea, InkDoc, InkItem, InkPath, InkStamp, InkText } from '../../src/leaflet/ink/model';
import { MAPLOG_KEYS, hasMaplogData, migrateMaplog } from '../../src/leaflet/ink/migrateMaplog';
import { PRESETS } from '../../src/leaflet/ink/styles';
import fixture from './fixtures/middle-earth-maplog.json';

type Frontmatter = Record<string, unknown>;

const fm = fixture as Frontmatter;

function byId<T extends InkItem>(doc: InkDoc, id: string): T {
  const item = doc.items.find(i => i.id === id);
  if (!item) throw new Error(`no item ${id}`);
  return item as T;
}

function textFor(doc: InkDoc, owner: string): InkText | undefined {
  return doc.items.find((i): i is InkText => i.kind === 'text' && i.id === `${owner}-label`);
}

/** Red, green and blue channels of a #rrggbb colour. */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function presetFill(id: string): string {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset?.style?.fill) throw new Error(`no fill for ${id}`);
  return preset.style.fill;
}

/** Two decimals, as the migration rounds coordinates. */
function round(n: number): number {
  return Math.round(n * 100) / 100 + 0;
}

function minimal(overrides: Frontmatter): Frontmatter {
  return { maplogMarks: [], maplogLines: [], maplogAreas: [], ...overrides };
}

describe('MAPLOG_KEYS', () => {
  it('lists the three Maplog frontmatter keys', () => {
    expect([...MAPLOG_KEYS]).toEqual(['maplogMarks', 'maplogLines', 'maplogAreas']);
  });
});

describe('hasMaplogData', () => {
  it('is true for the fixture', () => {
    expect(hasMaplogData(fm)).toBe(true);
  });

  it('is true when only one list has entries', () => {
    expect(hasMaplogData({ maplogLines: [{ id: 'x', mark: 'wall', points: [[0, 0], [1, 1]] }] })).toBe(true);
    expect(hasMaplogData({ maplogAreas: [{ id: 'x', mark: 'water', points: [[0, 0], [1, 1], [2, 0]] }] })).toBe(true);
  });

  it('is false for empty lists, missing keys and non-objects', () => {
    expect(hasMaplogData(minimal({}))).toBe(false);
    expect(hasMaplogData({})).toBe(false);
    expect(hasMaplogData({ name: 'Map', image: 'a.png' })).toBe(false);
    expect(hasMaplogData({ maplogMarks: 'nope' })).toBe(false);
    expect(hasMaplogData(null)).toBe(false);
    expect(hasMaplogData('maplogMarks')).toBe(false);
    expect(hasMaplogData([])).toBe(false);
  });
});

describe('migrateMaplog: garbage input', () => {
  it.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'maplogMarks'],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['lists of the wrong type', { maplogMarks: 'nope', maplogLines: 7, maplogAreas: {} }],
    ['records with no usable fields', { maplogMarks: [null, 3, { mark: 'nope' }], maplogLines: [{ mark: 'wall', points: [[1, 2]] }] }],
    ['unknown marks only', { maplogMarks: [{ id: 'a', mark: 'dragon', latlng: [1, 2] }] }],
  ])('returns the default document for %s', (_label, input) => {
    expect(migrateMaplog(input)).toEqual(defaultInkDoc());
  });
});

describe('migrateMaplog: Middle Earth fixture', () => {
  const doc = migrateMaplog(fm);

  it('turns every Maplog record into an ink item', () => {
    const marks = fixture.maplogMarks.length;
    const lines = fixture.maplogLines.length;
    const areas = fixture.maplogAreas.length;
    // Each shape plus one label text item per record that has a label.
    const labelled = [...fixture.maplogMarks, ...fixture.maplogLines, ...fixture.maplogAreas]
      .filter(r => typeof (r as { label?: unknown }).label === 'string').length;
    expect(doc.items).toHaveLength(marks + lines + areas + labelled);
    for (const record of [...fixture.maplogMarks, ...fixture.maplogLines, ...fixture.maplogAreas]) {
      expect(doc.items.some(i => i.id === record.id)).toBe(true);
    }
  });

  it('keeps the default layers', () => {
    expect(doc.layers.map(l => l.id)).toEqual(['terrain', 'routes', 'features', 'labels']);
  });

  it('draws marks as stamps on the features layer, with their location link', () => {
    const city = byId<InkStamp>(doc, 'mark-minas-tirith');
    expect(city.kind).toBe('stamp');
    expect(city.layer).toBe('features');
    expect(city.symbol).toBe('city');
    expect(city.size).toBe(24);
    expect(city.scaleWithMap).toBe(true);
    expect(city.name).toBe('Minas Tirith');
    expect(city.locationId).toBe('loc-minas-tirith');
    expect(city.at).toEqual([330, 600]);

    const moria = byId<InkStamp>(doc, 'mark-moria-entrance');
    expect(moria.symbol).toBe('entrance');
    expect(moria.locationId).toBe('loc-moria');
  });

  it('keeps the mark id as the stamp symbol for every fixture mark', () => {
    for (const record of fixture.maplogMarks) {
      expect(byId<InkStamp>(doc, record.id).symbol).toBe(record.mark);
    }
  });

  it('draws a label as a text item below its stamp, in the labels layer', () => {
    const label = textFor(doc, 'mark-bree-inn');
    const stamp = byId<InkStamp>(doc, 'mark-bree-inn');
    expect(label).toBeDefined();
    expect(label?.layer).toBe('labels');
    expect(label?.text).toBe('Prancing Pony');
    // Points are [lat, lng] and lat grows upward, so "below" is a smaller lat.
    expect(label?.at).toEqual([round(stamp.at[0] - 31.6), stamp.at[1]]);
    expect(label?.style.font).toBe('serif');
    expect(label?.style.size).toBe(12);
  });

  it('puts every mark label clear of a 36 px token: its top is 22 map units under the stamp centre', () => {
    for (const record of fixture.maplogMarks) {
      const label = textFor(doc, record.id);
      if (!label) continue;
      const stamp = byId<InkStamp>(doc, record.id);
      expect(label.at[1], record.id).toBe(stamp.at[1]);
      // The baseline is (stamp lat - label lat) below the stamp; the text box rises 0.8 em above it.
      const top = (stamp.at[0] - label.at[0]) - 0.8 * label.style.size;
      expect(top, record.id).toBeCloseTo(22, 5);
    }
  });

  it('draws trails and rivers as paths on the routes layer, and walls and cliffs elsewhere', () => {
    const road = byId<InkPath>(doc, 'line-company-road');
    expect(road.kind).toBe('path');
    expect(road.layer).toBe('routes');
    expect(road.style.dash).toBe('dotted');
    expect(road.points).toEqual([[742, 404], [730, 470], [705, 520], [752, 668]]);
    expect(road.name).toBe('Hobbiton to Rivendell');

    const river = byId<InkPath>(doc, 'line-anduin');
    expect(river.layer).toBe('routes');
    expect(river.style.dash).toBe('wavy');
    expect(river.style.stroke).toBe(PRESETS.find(p => p.id === 'river')?.style?.stroke);

    const cliff = byId<InkPath>(doc, 'line-misty-spine');
    expect(cliff.style.dash).toBe('ticked');
    expect(cliff.layer).toBe('terrain');
  });

  it('puts a river label on the river midpoint in the water label style', () => {
    const river = byId<InkPath>(doc, 'line-anduin');
    const label = textFor(doc, 'line-anduin');
    expect(label?.text).toBe('Anduin');
    // Points run [560,860] to [380,800]; the length midpoint is [470,830] on the middle segment.
    expect(label?.at).toEqual([470, 830]);
    expect(label?.style.italic).toBe(true);
    expect(label?.style.color).toBe('#1f5fa8');
    expect(label?.style.size).toBe(13);
    expect(river.name).toBe('Anduin');
  });

  it('draws forests as green areas on the terrain layer, with a label at the centroid', () => {
    const forest = byId<InkArea>(doc, 'area-lothlorien');
    expect(forest.kind).toBe('area');
    expect(forest.layer).toBe('terrain');
    expect(forest.style.fillPattern).toBe('symbol:tree');
    const [r, g, b] = rgb(forest.style.fill);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(forest.name).toBe('Lothlórien');

    const label = textFor(doc, 'area-lothlorien');
    expect(label?.text).toBe('Lothlórien');
    expect(label?.layer).toBe('labels');
    expect(label?.style.size).toBe(13);
    // Centroid of the quad [575,850] [590,880] [560,900] [545,875] is about [567.5, 876.25].
    expect(label?.at[0]).toBeCloseTo(567.5, 0);
    expect(label?.at[1]).toBeCloseTo(876.25, 0);
  });

  it('paints every label as a text item with its own text', () => {
    const labelled = [...fixture.maplogMarks, ...fixture.maplogLines, ...fixture.maplogAreas]
      .filter(r => typeof (r as { label?: unknown }).label === 'string') as Array<{ id: string; label: string }>;
    for (const record of labelled) {
      const label = textFor(doc, record.id);
      expect(label, record.id).toBeDefined();
      expect(label?.text).toContain(record.label);
    }
  });

  it('passes normalizeInk unchanged', () => {
    expect(normalizeInk(doc)).toEqual(doc);
  });
});

describe('migrateMaplog: water and terrain', () => {
  const water = minimal({
    maplogAreas: [
      { id: 'area-sea', mark: 'water', points: [[0, 0], [0, 100], [100, 100], [100, 0]], label: 'Sea of Rhun' },
      { id: 'area-plain', mark: 'plains', points: [[200, 0], [200, 50], [250, 50]] },
    ],
  });

  it('draws water in the blue water preset', () => {
    const doc = migrateMaplog(water);
    const sea = byId<InkArea>(doc, 'area-sea');
    expect(sea.style.fill).toBe(presetFill('water'));
    expect(sea.style.fill).toMatch(/^#/);
    const [r, g, b] = rgb(sea.style.fill);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(sea.style.fillPattern).toBe('symbol:wave');
  });

  it('labels water in the italic blue water label style, at the centroid', () => {
    const doc = migrateMaplog(water);
    const label = textFor(doc, 'area-sea');
    expect(label?.text).toBe('Sea of Rhun');
    expect(label?.at).toEqual([50, 50]);
    expect(label?.style.italic).toBe(true);
    expect(label?.style.color).toBe('#1f5fa8');
    expect(label?.style.size).toBe(13);
  });

  it('gives an unlabelled area no text item', () => {
    const doc = migrateMaplog(water);
    expect(textFor(doc, 'area-plain')).toBeUndefined();
    expect(byId<InkArea>(doc, 'area-plain').style.fill).toBe(presetFill('plains'));
  });

  it('drops areas with fewer than three usable points', () => {
    const doc = migrateMaplog(minimal({
      maplogAreas: [{ id: 'bad', mark: 'water', points: [[0, 0], [1, 1]] }],
    }));
    expect(doc.items).toHaveLength(0);
  });
});

describe('migrateMaplog: marks', () => {
  function stampFor(mark: string, attributes?: string[], extra: Frontmatter = {}): InkStamp {
    const doc = migrateMaplog(minimal({
      maplogMarks: [{ id: 'm', mark, latlng: [10, 20], ...(attributes ? { attributes } : {}), ...extra }],
    }));
    return doc.items[0] as InkStamp;
  }

  it('picks the door variant from the first matching attribute, in order', () => {
    expect(stampFor('door', ['oneway', 'locked']).symbol).toBe('door-locked');
    expect(stampFor('door', ['trapped', 'barred']).symbol).toBe('door-barred');
    expect(stampFor('double', ['secret']).symbol).toBe('door-secret');
    expect(stampFor('door', ['oneway']).symbol).toBe('door-oneway');
    expect(stampFor('door', ['illusory']).symbol).toBe('door-illusory');
    expect(stampFor('double', ['illusory']).symbol).toBe('door-illusory');
  });

  it('maps slope grade to slope-1, slope-2 or slope-3', () => {
    expect(stampFor('slope', undefined, { grade: 1 }).symbol).toBe('slope-1');
    expect(stampFor('slope', undefined, { grade: '2' }).symbol).toBe('slope-2');
    expect(stampFor('slope', undefined, { grade: 3 }).symbol).toBe('slope-3');
    expect(stampFor('slope', undefined, { grade: 9 }).symbol).toBe('slope-3');
    expect(stampFor('slope').symbol).toBe('slope-3');
  });

  it('maps a secret passage to passage-secret and an open passage to passage', () => {
    expect(stampFor('passage', ['secret']).symbol).toBe('passage-secret');
    expect(stampFor('passage').symbol).toBe('passage');
  });

  it('maps pit, trapdoor, and settlement port variants', () => {
    expect(stampFor('pit', ['covered']).symbol).toBe('pit-covered');
    expect(stampFor('pit').symbol).toBe('pit');
    expect(stampFor('trapdoor', ['secret']).symbol).toBe('trapdoor-secret');
    expect(stampFor('trapdoor', ['ceiling']).symbol).toBe('trapdoor-ceiling');
    expect(stampFor('town', ['port']).symbol).toBe('town-port');
    expect(stampFor('village', ['port']).symbol).toBe('village-port');
    expect(stampFor('city', ['port']).symbol).toBe('city-port');
    expect(stampFor('hamlet', ['port']).symbol).toBe('hamlet');
  });

  it('keeps rotation, normalised to [0, 360)', () => {
    expect(stampFor('door', undefined, { rotation: -90 }).rotation).toBe(270);
    expect(stampFor('door', undefined, { rotation: 450 }).rotation).toBe(90);
    expect(stampFor('door').rotation).toBe(0);
  });

  it('colours dungeon marks dark ink and settlements red', () => {
    expect(stampFor('door').color).toBe('#2b2118');
    expect(stampFor('city').color).toBe('#8e2c2c');
    expect(stampFor('shrine').color).toBe('#7b4fa0');
  });

  it('skips marks whose symbol does not exist, and line or area marks in the mark list', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [
        { id: 'a', mark: 'dragon', latlng: [1, 2] },
        { id: 'b', mark: 'wall', latlng: [1, 2] },
        { id: 'c', mark: 'water', latlng: [1, 2] },
        { id: 'd', mark: 'door', latlng: ['x', 2] },
        { id: 'e', mark: 'door', latlng: [3, 4] },
      ],
    }));
    expect(doc.items.map(i => i.id)).toEqual(['e']);
  });

  it('builds the label as place id, name, then level and destination in brackets', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [{
        id: 'stairs', mark: 'stairs-down', latlng: [5, 6], label: 'Prancing Pony',
        placeId: 'R3', level: 'L1', destination: 'L3',
      }],
    }));
    expect(textFor(doc, 'stairs')?.text).toBe('R3 Prancing Pony (L1, to L3)');
    // Stamp at [5, 6]: the label sits 31.6 map units below it (lat drops) and keeps its longitude.
    expect(textFor(doc, 'stairs')?.at).toEqual([round(5 - 31.6), 6]);
  });

  it('gives a level-only or destination-only label a sensible text', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [
        { id: 'a', mark: 'stairs-up', latlng: [1, 1], level: 'L2' },
        { id: 'b', mark: 'stairs-down', latlng: [2, 2], destination: 'L4' },
        { id: 'c', mark: 'door', latlng: [3, 3], placeId: '0203' },
      ],
    }));
    expect(textFor(doc, 'a')?.text).toBe('(L2)');
    expect(textFor(doc, 'b')?.text).toBe('(to L4)');
    expect(textFor(doc, 'c')?.text).toBe('0203');
  });

  it('keeps the location link on the stamp, not on its label', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [{ id: 'x', mark: 'inn', latlng: [1, 1], label: 'Bree', locationId: 'loc-bree' }],
    }));
    expect((doc.items[0] as InkStamp).locationId).toBe('loc-bree');
    expect(textFor(doc, 'x')?.name).toBeUndefined();
  });
});

describe('migrateMaplog: lines', () => {
  function pathFor(mark: string, extra: Frontmatter = {}): InkPath {
    const doc = migrateMaplog(minimal({
      maplogLines: [{ id: 'l', mark, points: [[0, 0], [0, 10], [10, 10]], ...extra }],
    }));
    return doc.items[0] as InkPath;
  }

  it('uses the matching preset for each line mark', () => {
    expect(pathFor('wall').style.strokeWidth).toBe(4);
    expect(pathFor('road').style.stroke).toBe(PRESETS.find(p => p.id === 'road')?.style?.stroke);
    expect(pathFor('track').style.dash).toBe('dashed');
    expect(pathFor('trail').style.dash).toBe('dotted');
    expect(pathFor('stream').style.dash).toBe('wavy');
    expect(pathFor('border').style.dash).toBe('double');
    expect(pathFor('ledge').style.strokeWidth).toBe(1);
    expect(pathFor('ledge').style.dash).toBe('ticked');
  });

  it('draws bars as a dotted wall and off-map edges as a dashed wall', () => {
    expect(pathFor('bars').style.dash).toBe('dotted');
    expect(pathFor('bars').style.stroke).toBe(PRESETS.find(p => p.id === 'wall')?.style?.stroke);
    expect(pathFor('offmap').style.dash).toBe('dashed');
    expect(pathFor('offmap').layer).toBe('features');
  });

  it('draws unconfirmed solid lines dashed, and leaves patterned presets alone', () => {
    expect(pathFor('road', { dashed: true }).style.dash).toBe('dashed');
    expect(pathFor('river', { dashed: true }).style.dash).toBe('wavy');
  });

  it('puts walls on features and routes on routes', () => {
    expect(pathFor('wall').layer).toBe('features');
    expect(pathFor('road').layer).toBe('routes');
    expect(pathFor('stream').layer).toBe('routes');
  });

  it('drops lines with fewer than two points and point marks in the line list', () => {
    const doc = migrateMaplog(minimal({
      maplogLines: [
        { id: 'short', mark: 'road', points: [[1, 1]] },
        { id: 'point', mark: 'door', points: [[0, 0], [1, 1]] },
        { id: 'ok', mark: 'road', points: [[0, 0], [1, 1]] },
      ],
    }));
    expect(doc.items.map(i => i.id)).toEqual(['ok']);
  });

  it('places a label at the midpoint of the length', () => {
    const doc = migrateMaplog(minimal({
      maplogLines: [{ id: 'r', mark: 'road', points: [[0, 0], [0, 10], [10, 10]], label: 'King\'s Road' }],
    }));
    const label = textFor(doc, 'r');
    expect(label?.at).toEqual([0, 10]);
    expect(label?.text).toBe("King's Road");
    expect(label?.style.italic).toBeUndefined();
    expect(label?.style.size).toBe(13);
    expect((doc.items[0] as InkPath).name).toBe("King's Road");
  });
});

describe('migrateMaplog: ids and ordering', () => {
  it('keeps unique original ids and suffixes duplicates', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [
        { id: 'same', mark: 'door', latlng: [1, 1] },
        { id: 'same', mark: 'door', latlng: [2, 2] },
      ],
    }));
    expect(doc.items.map(i => i.id)).toEqual(['same', 'same-2']);
  });

  it('reserves original ids before naming label items, so a label never takes a real id', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [
        { id: 'tower', mark: 'tower', latlng: [1, 1], label: 'Old Tower' },
        { id: 'tower-label', mark: 'door', latlng: [3, 3] },
      ],
    }));
    const ids = doc.items.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('tower-label');
    expect(ids).toContain('tower-label-2');
  });

  it('generates ids for records that have none', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [{ mark: 'tower', latlng: [1, 1] }],
    }));
    expect(doc.items[0].id).toBe('tower-1');
  });

  it('paints areas, then lines, then marks, then labels', () => {
    const doc = migrateMaplog(minimal({
      maplogMarks: [{ id: 'm', mark: 'door', latlng: [1, 1], label: 'Door' }],
      maplogLines: [{ id: 'l', mark: 'road', points: [[0, 0], [1, 1]], label: 'Road' }],
      maplogAreas: [{ id: 'a', mark: 'water', points: [[0, 0], [0, 2], [2, 2]], label: 'Lake' }],
    }));
    expect(doc.items.map(i => i.id)).toEqual(['a', 'l', 'm', 'a-label', 'l-label', 'm-label']);
  });

  it('gives every item a valid layer', () => {
    const doc = migrateMaplog(fm);
    const layers = new Set(doc.layers.map(l => l.id));
    for (const item of doc.items) expect(layers.has(item.layer)).toBe(true);
  });
});
