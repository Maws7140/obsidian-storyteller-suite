import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/types';
import { EraManager } from '../../src/utils/EraManager';

const events = (...dates: string[]): Event[] => dates.map((dateTime, index) => ({
  id: `event-${index + 1}`,
  name: `Event ${index + 1}`,
  dateTime,
}));

describe('EraManager.inferErasFromEventGaps', () => {
  it('creates editable eras when one gap is much larger than normal event spacing', () => {
    const eras = EraManager.inferErasFromEventGaps(events(
      '1861-04-12',
      '1861-04-13',
      '1861-04-14',
      '1863-07-01',
      '1863-07-02',
      '1863-07-03',
    ));

    expect(eras).toHaveLength(2);
    expect(eras.map(era => [era.name, era.abbreviation])).toEqual([
      ['Era 1', 'E1'],
      ['Era 2', 'E2'],
    ]);
    expect(eras[0].events).toBeUndefined();
    expect(EraManager.getEventsInEra(eras[0], events(
      '1861-04-12',
      '1861-04-13',
      '1861-04-14',
      '1863-07-01',
      '1863-07-02',
      '1863-07-03',
    )).map(event => event.id)).toEqual(['event-1', 'event-2', 'event-3']);
  });

  it('does not invent eras for evenly spaced events', () => {
    expect(EraManager.inferErasFromEventGaps(events(
      '1861-01-01',
      '1862-01-01',
      '1863-01-01',
      '1864-01-01',
      '1865-01-01',
    ))).toEqual([]);
  });

  it('does not strand a single event in an inferred era', () => {
    expect(EraManager.inferErasFromEventGaps(events(
      '1800-01-01',
      '1900-01-01',
      '1900-01-02',
      '1900-01-03',
    ))).toEqual([]);
  });

  it('keeps the larger of two gaps that sit one event apart', () => {
    const eras = EraManager.inferErasFromEventGaps(events(
      '1861-04-12',
      '1861-04-13',
      '1861-04-14',
      '1862-06-01',
      '1863-07-01',
      '1863-07-02',
      '1863-07-03',
    ));

    expect(eras.map(era => [era.startDate, era.endDate])).toEqual([
      ['1861-04-12', '1861-04-14'],
      ['1862-06-01', '1863-07-03'],
    ]);
  });

  it('ignores undated and invalid events', () => {
    const input = events('2000-01-01', '2000-01-02', '2010-01-01', '2010-01-02');
    input.push({ name: 'Undated' }, { name: 'Invalid', dateTime: 'not a date at all' });
    expect(EraManager.inferErasFromEventGaps(input)).toHaveLength(2);
  });

  it('uses the outer endpoints of ranged events', () => {
    const eras = EraManager.inferErasFromEventGaps(events(
      '2000-01-01 to 2000-01-03',
      '2000-01-04',
      '2010-01-01',
      '2010-01-02 through 2010-01-05',
    ));
    expect(eras[0]).toMatchObject({ startDate: '2000-01-01', endDate: '2000-01-04' });
    expect(eras[1]).toMatchObject({ startDate: '2010-01-01', endDate: '2010-01-05' });
  });
});
