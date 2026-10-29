/**
 * Comparison only: the Maplog line styles as they were drawn before Maplog was
 * removed (commit 12e523e~1, src/leaflet/maplog/MaplogLayer.ts linePiecesFor, and its
 * geometry.ts copied beside this file). The ink-render harness draws them next to
 * the Map Ink brushes so the two can be compared. Not used by the plugin.
 */
import { offsetPolyline, slantBreaks, spacedPoints, tickMarks, wavePolyline } from './geometry';

export interface OldPiece {
	kind: 'path' | 'dots';
	points: Array<{ x: number; y: number }>;
	weight?: number;
	dashArray?: string;
	lineCap?: 'round' | 'butt';
	radius?: number;
}

export function oldLinePieces(markId: string, points: Array<{ x: number; y: number }>): OldPiece[] {
	const path = (pts: Array<{ x: number; y: number }>, weight: number, extra: Partial<OldPiece> = {}): OldPiece => ({ kind: 'path', points: pts, weight, ...extra });
	const ticks = (segments: Array<[{ x: number; y: number }, { x: number; y: number }]>, weight: number): OldPiece[] =>
		segments.map(([a, b]) => path([a, b], weight));
	const dots = (pts: Array<{ x: number; y: number }>, radius: number): OldPiece => ({ kind: 'dots', points: pts, radius });
	switch (markId) {
		case 'wall': return [path([...points], 4)];
		case 'offmap': return [path([...points], 4), ...ticks(slantBreaks(points, 10), 2)];
		case 'bars': return [path([...points], 4, { dashArray: '0.1 6', lineCap: 'round' })];
		case 'ledge': return [path([...points], 1.5), ...ticks(tickMarks(points, 7, 5, 'lower'), 1.5)];
		case 'cliff': return [path([...points], 2), ...ticks(tickMarks(points, 9, 8, 'lower'), 2)];
		case 'border': return [path([...points], 1), dots(spacedPoints(points, 9), 1.8)];
		case 'road': return [path(offsetPolyline(points, 2.5), 1.6), path(offsetPolyline(points, -2.5), 1.6)];
		case 'track': return [path([...points], 2.2)];
		case 'trail': return [path([...points], 1.2), ...ticks(tickMarks(points, 8, 7, 'both'), 1.2)];
		case 'river': return [
			path(wavePolyline(offsetPolyline(points, 3), 1.8, 10), 1.6),
			path(wavePolyline(offsetPolyline(points, -3), 1.8, 10, Math.PI), 1.6),
		];
		case 'stream': return [path(wavePolyline(points, 2.2, 9), 1.6)];
		default: return [];
	}
}

/** SVG markup for old pieces. Maplog drew every line in the ink colour with round joins. */
export function oldPieceMarkup(pieces: OldPiece[], ink = '#222222'): string {
	const d = (pts: Array<{ x: number; y: number }>): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
	return pieces.map(piece => {
		if (piece.kind === 'dots') {
			return piece.points.map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${piece.radius ?? 2}" fill="${ink}"/>`).join('');
		}
		if (piece.points.length < 2) return '';
		const dash = piece.dashArray ? ` stroke-dasharray="${piece.dashArray}"` : '';
		return `<path d="${d(piece.points)}" fill="none" stroke="${ink}" stroke-width="${piece.weight ?? 2}"`
			+ ` stroke-linecap="${piece.lineCap ?? 'round'}" stroke-linejoin="round"${dash}/>`;
	}).join('');
}
