export interface AxisLabelCandidate<T> {
  value: T;
  x: number;
  width: number;
}

export interface PositionedAxisLabel<T> extends AxisLabelCandidate<T> {
  left: number;
}

/**
 * Keep horizontal labels readable after centering/clamping them to the canvas.
 * Tick marks may remain dense; only text that would collide is suppressed.
 */
export function placeReadableAxisLabels<T>(
  candidates: AxisLabelCandidate<T>[],
  leftEdge: number,
  rightEdge: number,
  gap = 8,
): PositionedAxisLabel<T>[] {
  const placed: PositionedAxisLabel<T>[] = [];
  let previousRight = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const width = Math.min(Math.max(0, candidate.width), Math.max(0, rightEdge - leftEdge));
    const left = Math.max(leftEdge, Math.min(rightEdge - width, candidate.x - width / 2));
    if (left < previousRight + gap) continue;
    placed.push({ ...candidate, width, left });
    previousRight = left + width;
  }

  return placed;
}
