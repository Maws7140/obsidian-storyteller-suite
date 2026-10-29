import { describe, expect, it } from 'vitest';
import {
    describeOverlayProperties,
    parseGeoJsonText,
    parseGpxRoot,
    toOverlayPathList,
    validateGeoJson,
    type XmlElementLike,
} from '../../src/leaflet/utils/OverlayParsing';

/**
 * Build a minimal XML element tree that mirrors the parts of a DOM Element
 * the GPX parser reads (localName, textContent, getAttribute, children).
 */
function el(
    localName: string,
    attrs: Record<string, string> = {},
    children: XmlElementLike[] = [],
    text: string | null = null,
): XmlElementLike {
    return {
        localName,
        textContent: text,
        getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
        children,
    };
}

const pt = (lat: string, lon: string, children: XmlElementLike[] = []) =>
    el('trkpt', { lat, lon }, children);

describe('parseGpxRoot', () => {
    it('extracts tracks, routes and waypoints from a GPX root', () => {
        const root = el('gpx', { version: '1.1' }, [
            el('wpt', { lat: '51.5', lon: '-0.12' }, [
                el('name', {}, [], ' Tower '),
                el('desc', {}, [], 'Old stone tower'),
            ]),
            el('trk', {}, [
                el('name', {}, [], 'Morning ride'),
                el('trkseg', {}, [
                    pt('10.0', '20.0', [el('ele', {}, [], '5')]),
                    pt('10.1', '20.1'),
                ]),
                el('trkseg', {}, [pt('10.2', '20.2')]),
            ]),
            el('rte', {}, [
                el('rtept', { lat: '1', lon: '2' }),
                el('rtept', { lat: '3', lon: '4' }),
            ]),
        ]);

        const data = parseGpxRoot(root);

        expect(data.tracks).toHaveLength(1);
        expect(data.tracks[0].name).toBe('Morning ride');
        expect(data.tracks[0].points).toEqual([
            { lat: 10.0, lng: 20.0 },
            { lat: 10.1, lng: 20.1 },
            { lat: 10.2, lng: 20.2 },
        ]);
        expect(data.routes).toEqual([{ points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] }]);
        expect(data.waypoints).toEqual([
            { lat: 51.5, lng: -0.12, name: 'Tower', description: 'Old stone tower' },
        ]);
    });

    it('returns empty collections for an empty gpx element', () => {
        expect(parseGpxRoot(el('gpx'))).toEqual({ tracks: [], routes: [], waypoints: [] });
    });

    it('skips points with missing or non-numeric coordinates', () => {
        const root = el('gpx', {}, [
            el('trk', {}, [el('trkseg', {}, [
                pt('abc', '20'),
                el('trkpt', { lat: '10' }),
                pt('11', '21'),
            ])]),
            el('wpt', { lat: '', lon: '3' }),
        ]);

        const data = parseGpxRoot(root);

        expect(data.tracks[0].points).toEqual([{ lat: 11, lng: 21 }]);
        expect(data.waypoints).toEqual([]);
    });

    it('omits blank names and descriptions', () => {
        const root = el('gpx', {}, [
            el('wpt', { lat: '1', lon: '2' }, [el('name', {}, [], '   '), el('desc', {}, [], '')]),
        ]);

        expect(parseGpxRoot(root).waypoints).toEqual([{ lat: 1, lng: 2 }]);
    });

    it('throws for a non-GPX root such as a DOMParser error document', () => {
        expect(() => parseGpxRoot(el('parsererror'))).toThrow(/Not a GPX document/);
    });
});

describe('validateGeoJson', () => {
    it('accepts a FeatureCollection with mixed geometries and null geometry', () => {
        const value = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
                { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: null },
                { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} },
                { type: 'Feature', geometry: null, properties: {} },
            ],
        };
        expect(validateGeoJson(value)).toBe(value);
    });

    it('accepts MultiPolygon, MultiLineString, MultiPoint and nested GeometryCollection', () => {
        expect(() => validateGeoJson({
            type: 'MultiPolygon',
            coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
        })).not.toThrow();
        expect(() => validateGeoJson({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] })).not.toThrow();
        expect(() => validateGeoJson({ type: 'MultiPoint', coordinates: [[0, 0]] })).not.toThrow();
        expect(() => validateGeoJson({
            type: 'GeometryCollection',
            geometries: [{ type: 'Point', coordinates: [0, 0] }],
        })).not.toThrow();
    });

    it('accepts positions with an altitude component', () => {
        expect(() => validateGeoJson({ type: 'Point', coordinates: [1, 2, 300] })).not.toThrow();
    });

    it('rejects objects without a type', () => {
        expect(() => validateGeoJson({ features: [] })).toThrow(/missing "type"/);
        expect(() => validateGeoJson([1, 2])).toThrow(/missing "type"/);
        expect(() => validateGeoJson(null)).toThrow(/missing "type"/);
    });

    it('rejects unknown types', () => {
        expect(() => validateGeoJson({ type: 'Circle' })).toThrow(/Unsupported GeoJSON type "Circle"/);
    });

    it('rejects malformed coordinates', () => {
        expect(() => validateGeoJson({ type: 'Point', coordinates: [1] })).toThrow(/Malformed GeoJSON Point/);
        expect(() => validateGeoJson({ type: 'Point', coordinates: ['1', '2'] })).toThrow(/Malformed/);
        expect(() => validateGeoJson({ type: 'LineString', coordinates: [1, 2] })).toThrow(/Malformed/);
        expect(() => validateGeoJson({ type: 'Polygon', coordinates: [[1, 2]] })).toThrow(/Malformed/);
        expect(() => validateGeoJson({ type: 'Point', coordinates: [NaN, 2] })).toThrow(/Malformed/);
    });

    it('rejects a FeatureCollection containing a bad feature', () => {
        expect(() => validateGeoJson({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } }, { type: 'Point' }],
        })).toThrow(/Malformed GeoJSON FeatureCollection/);
    });

    it('rejects a FeatureCollection without a features array', () => {
        expect(() => validateGeoJson({ type: 'FeatureCollection' })).toThrow(/Malformed/);
    });
});

describe('parseGeoJsonText', () => {
    it('parses valid JSON text', () => {
        const data = parseGeoJsonText('{"type":"Point","coordinates":[3,4]}');
        expect(data).toEqual({ type: 'Point', coordinates: [3, 4] });
    });

    it('reports invalid JSON distinctly from invalid GeoJSON', () => {
        expect(() => parseGeoJsonText('{not json')).toThrow(/Invalid JSON/);
    });
});

describe('describeOverlayProperties', () => {
    it('returns trimmed name and description when present', () => {
        expect(describeOverlayProperties({ name: '  Inn ', description: 'Warm beds' }))
            .toEqual({ name: 'Inn', description: 'Warm beds' });
    });

    it('returns only the fields that exist', () => {
        expect(describeOverlayProperties({ name: 'Inn' })).toEqual({ name: 'Inn' });
        expect(describeOverlayProperties({ description: 'Warm beds' })).toEqual({ description: 'Warm beds' });
    });

    it('ignores non-string values and returns null when nothing is shown', () => {
        expect(describeOverlayProperties({ name: 42, description: { a: 1 } })).toBeNull();
        expect(describeOverlayProperties({ name: '   ' })).toBeNull();
        expect(describeOverlayProperties(null)).toBeNull();
        expect(describeOverlayProperties(undefined)).toBeNull();
    });
});

describe('toOverlayPathList', () => {
    it('normalises single, list and empty values', () => {
        expect(toOverlayPathList('[[Route]]')).toEqual(['[[Route]]']);
        expect(toOverlayPathList(['a.gpx', ' ', 'b.geojson '])).toEqual(['a.gpx', 'b.geojson']);
        expect(toOverlayPathList(undefined)).toEqual([]);
        expect(toOverlayPathList('')).toEqual([]);
    });
});
