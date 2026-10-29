import { describe, it, expect } from 'vitest';
import { parseTypedRelationships, serializeTypedRelationships } from '../../src/yaml/EntitySections';

describe('relationship frontmatter strings (R-Map format)', () => {
  describe('legacy strings stay unchanged', () => {
    it('writes the colon form when no direction is stored', () => {
      expect(serializeTypedRelationships([
        { type: 'mentor', target: 'Archivist Noe', label: 'trained Mira' },
        { type: 'ally', target: 'Captain Sera Vale' }
      ])).toEqual([
        'mentor: [[Archivist Noe]] — trained Mira',
        'ally: [[Captain Sera Vale]]'
      ]);
    });

    it('parses colon-form strings with no direction and no ended flag', () => {
      expect(parseTypedRelationships(['family: [[Tom]] — father'])).toEqual([
        { type: 'family', target: 'Tom', label: 'father' }
      ]);
    });

    it('keeps unknown legacy kinds as written instead of dropping them', () => {
      expect(parseTypedRelationships(['trade partner: [[Nessa]]'])).toEqual([
        { type: 'trade partner', target: 'Nessa' }
      ]);
    });
  });

  describe('direction', () => {
    it('writes an arrow for one-way relationships', () => {
      expect(serializeTypedRelationships([
        { type: 'loves', target: 'Arwen', direction: 'to', label: 'since the council' }
      ])).toEqual(['loves -> [[Arwen]] — since the council']);
    });

    it('writes a double arrow for mutual relationships', () => {
      expect(serializeTypedRelationships([
        { type: 'rival', target: 'Boromir', direction: 'mutual' }
      ])).toEqual(['rival <-> [[Boromir]]']);
    });

    it('parses arrows back into direction', () => {
      expect(parseTypedRelationships([
        'loves -> [[Arwen]] — since the council',
        'rival <-> [[Boromir]]',
        'mentor: [[Gandalf]]'
      ])).toEqual([
        { type: 'loves', target: 'Arwen', label: 'since the council', direction: 'to' },
        { type: 'rival', target: 'Boromir', direction: 'mutual' },
        { type: 'mentor', target: 'Gandalf' }
      ]);
    });

    it('round-trips kinds that contain a hyphen', () => {
      const [written] = serializeTypedRelationships([{ type: 'loyal-to', target: 'The Crown', direction: 'to' }]);
      expect(written).toBe('loyal-to -> [[The Crown]]');
      expect(parseTypedRelationships([written as string])).toEqual([
        { type: 'loyal-to', target: 'The Crown', direction: 'to' }
      ]);
    });
  });

  describe('ended (severed)', () => {
    it('writes an ended prefix and parses it back', () => {
      const written = serializeTypedRelationships([
        { type: 'rival', target: 'Tollen Brask', direction: 'mutual', ended: true, label: 'the duel ended the feud' }
      ]);
      expect(written).toEqual(['ended rival <-> [[Tollen Brask]] — the duel ended the feud']);
      expect(parseTypedRelationships(written as string[])).toEqual([
        { type: 'rival', target: 'Tollen Brask', label: 'the duel ended the feud', direction: 'mutual', ended: true }
      ]);
    });

    it('does not mark a live relationship as ended', () => {
      expect(parseTypedRelationships(['enemy: [[Noe]]'])[0].ended).toBeUndefined();
    });
  });

  describe('object form and aliases', () => {
    it('accepts legacy object entries that carry direction and ended', () => {
      expect(parseTypedRelationships([
        { type: 'hates', target: 'Gollum', direction: 'to', ended: true }
      ])).toEqual([
        { type: 'hates', target: 'Gollum', direction: 'to', ended: true }
      ]);
    });

    it('ignores an invalid direction value on object entries', () => {
      expect(parseTypedRelationships([
        { type: 'ally', target: 'Sera', direction: 'sideways' }
      ])).toEqual([{ type: 'ally', target: 'Sera' }]);
    });

    it('keeps the name when a wiki link carries an alias, with an arrow', () => {
      expect(parseTypedRelationships(['loves -> [[Archivist Noe|Noe]] — Network'])).toEqual([
        { type: 'loves', target: 'Archivist Noe', label: 'Network', direction: 'to' }
      ]);
    });
  });
});
