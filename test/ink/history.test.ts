import { describe, expect, it } from 'vitest';
import { InkHistory } from '../../src/leaflet/ink/history';

describe('InkHistory', () => {
  it('undoes and redoes in order', () => {
    const h = new InkHistory<string>();
    h.push('a');
    h.push('b');
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeUndefined();
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBeUndefined();
  });

  it('reports canUndo and canRedo', () => {
    const h = new InkHistory<number>();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    h.push(1);
    expect(h.canUndo).toBe(true);
    h.undo(2);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it('clears the redo stack on a new push', () => {
    const h = new InkHistory<number>();
    h.push(1);
    h.undo(2);
    h.push(3);
    expect(h.canRedo).toBe(false);
  });

  it('coalesces pushes that share the previous key into one step', () => {
    const h = new InkHistory<string>();
    h.push('s0', 'drag');
    h.push('s1', 'drag');
    h.push('s2', 'drag');
    expect(h.undo('s3')).toBe('s0');
    expect(h.canUndo).toBe(false);
  });

  it('starts a new step when the key changes', () => {
    const h = new InkHistory<number>();
    h.push(1, 'a');
    h.push(2, 'b');
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
  });

  it('does not coalesce pushes without a key, and a keyless push ends the run', () => {
    const h = new InkHistory<number>();
    h.push(1, 'a');
    h.push(2);
    h.push(3, 'a');
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.canUndo).toBe(false);
  });

  it('ends a run on undo and redo', () => {
    const h = new InkHistory<number>();
    h.push(1, 'k');
    h.push(2, 'k');
    expect(h.undo(3)).toBe(1);
    h.redo(1);
    h.push(9, 'k');
    expect(h.undo(10)).toBe(9);
  });

  it('caps the stack at 100 steps', () => {
    const h = new InkHistory<number>();
    for (let i = 0; i < 150; i++) h.push(i);
    let count = 0;
    let last: number | undefined;
    let current = 150;
    for (;;) {
      const prev = h.undo(current);
      if (prev === undefined) break;
      last = prev;
      current = prev;
      count++;
    }
    expect(count).toBe(100);
    expect(last).toBe(50);
  });

  it('clears everything', () => {
    const h = new InkHistory<number>();
    h.push(1, 'k');
    h.undo(2);
    h.push(3);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    h.push(4, 'k');
    expect(h.undo(5)).toBe(4);
  });
});
