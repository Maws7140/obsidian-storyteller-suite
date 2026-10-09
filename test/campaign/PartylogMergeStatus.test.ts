import { describe, expect, it } from 'vitest';
import { mergeStatus } from '../../src/campaign/PartylogImport';

describe('mergeStatus on re-import', () => {
  it('does not append a multi-value part again when the same log is imported twice', () => {
    const first = mergeStatus(undefined, ['Allies: Rohan, Gondor']);
    expect(first?.value).toBe('Allies: Rohan, Gondor');

    const second = mergeStatus(first!.value, ['Allies: Rohan, Gondor']);
    expect(second).toBeUndefined();
  });

  it('keeps existing parts and adds only the new ones', () => {
    const merged = mergeStatus('suspicious; Allies: Rohan, Gondor', ['Allies: Rohan, Gondor', 'Wounded']);
    expect(merged).toEqual({ value: 'suspicious; Allies: Rohan, Gondor; Wounded', added: ['Wounded'] });
  });

  it('matches parts case-insensitively and ignores surrounding spaces', () => {
    expect(mergeStatus('Suspicious ;  allies: rohan, gondor', ['suspicious', 'Allies: Rohan, Gondor'])).toBeUndefined();
  });

  it('does not treat a part that only shares a comma-separated word as present', () => {
    const merged = mergeStatus('Allies: Rohan, Gondor', ['Gondor']);
    expect(merged).toEqual({ value: 'Allies: Rohan, Gondor; Gondor', added: ['Gondor'] });
  });
});
