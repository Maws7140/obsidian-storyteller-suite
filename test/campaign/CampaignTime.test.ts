import { describe, expect, it } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import {
    addDurations,
    advanceCampaignDate,
    campaignDateRange,
    durationProblem,
    formatCampaignDuration,
    isZeroDuration,
    parseCampaignDuration,
} from '../../src/campaign/CampaignTime';

/** A day-only world: 3 months of 10, 12 and 8 days, a 5-day week. */
const DAYS_ONLY: CalendarSystem = {
    schemaVersion: 1,
    id: 'test-days-only',
    name: 'Days only',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 0,
    epochLabel: 'AF',
    months: [{ name: 'Frost', days: 10 }, { name: 'Thaw', days: 12 }, { name: 'Bloom', days: 8 }],
    week: { days: ['A', 'B', 'C', 'D', 'E'] },
};

describe('campaign durations', () => {
    it('reads the ways a DM writes time', () => {
        expect(parseCampaignDuration('2 hours')).toMatchObject({ minutes: 120 });
        expect(parseCampaignDuration('1d 4h')).toMatchObject({ days: 1, minutes: 240 });
        expect(parseCampaignDuration('a week')).toMatchObject({ weeks: 1 });
        expect(parseCampaignDuration('1 month, 2 days and 30 min')).toMatchObject({ months: 1, days: 2, minutes: 30 });
        expect(parseCampaignDuration('3 years')).toMatchObject({ years: 3 });
    });

    it('rejects anything it does not fully understand', () => {
        expect(parseCampaignDuration('')).toBeNull();
        expect(parseCampaignDuration('3 dayz')).toBeNull();
        expect(parseCampaignDuration('soon')).toBeNull();
        expect(parseCampaignDuration('2 days or so')).toBeNull();
    });

    it('adds, formats and spots an empty duration', () => {
        const total = addDurations(parseCampaignDuration('1 day 2 hours')!, parseCampaignDuration('90 minutes')!);
        expect(formatCampaignDuration(total)).toBe('1 day 3 hours 30 minutes');
        expect(isZeroDuration(parseCampaignDuration('0 days')!)).toBe(true);
    });

    it('explains durations a calendar cannot use', () => {
        expect(durationProblem('2 hours', DAYS_ONLY)).toMatch(/no time of day/);
        expect(durationProblem('48 hours', DAYS_ONLY)).toBeNull();
        expect(durationProblem('nonsense', DAYS_ONLY)).toMatch(/Use amounts like/);
        expect(durationProblem('', DAYS_ONLY)).toBeNull();
    });
});

describe('moving the campaign date', () => {
    it('steps days across a custom month boundary', () => {
        expect(advanceCampaignDate('Frost 8, 1 AF', parseCampaignDuration('3 days')!, DAYS_ONLY)).toBe('Thaw 1, 1 AF');
    });

    it('uses the calendar week for weeks', () => {
        expect(advanceCampaignDate('Frost 1, 1 AF', parseCampaignDuration('1 week')!, DAYS_ONLY)).toBe('Frost 6, 1 AF');
    });

    it('keeps the day when stepping months, clamped to a shorter month', () => {
        expect(advanceCampaignDate('Thaw 12, 1 AF', parseCampaignDuration('1 month')!, DAYS_ONLY)).toBe('Bloom 8, 1 AF');
        expect(advanceCampaignDate('Bloom 3, 1 AF', parseCampaignDuration('1 month')!, DAYS_ONLY)).toBe('Frost 3, 2 AF');
    });

    it('ignores part days on a calendar without time', () => {
        expect(advanceCampaignDate('Frost 1, 1 AF', parseCampaignDuration('5 hours')!, DAYS_ONLY)).toBe('Frost 1, 1 AF');
        expect(advanceCampaignDate('Frost 1, 1 AF', parseCampaignDuration('48 hours')!, DAYS_ONLY)).toBe('Frost 3, 1 AF');
    });

    it('works in Gregorian, including leap years', () => {
        expect(advanceCampaignDate('2024-02-28', parseCampaignDuration('1 day')!, GREGORIAN_CALENDAR)).toMatch(/^February 29, 2024/);
        expect(advanceCampaignDate('2023-01-31', parseCampaignDuration('1 month')!, GREGORIAN_CALENDAR)).toMatch(/^February 28, 2023/);
    });

    it('returns null for a date the calendar cannot read', () => {
        expect(advanceCampaignDate('not a date', parseCampaignDuration('1 day')!, DAYS_ONLY)).toBeNull();
    });

    it('writes a span the timeline reads as start to end', () => {
        expect(campaignDateRange('Frost 1, 1 AF', 'Frost 3, 1 AF')).toBe('Frost 1, 1 AF to Frost 3, 1 AF');
        expect(campaignDateRange('Frost 1, 1 AF', 'Frost 1, 1 AF')).toBe('Frost 1, 1 AF');
    });
});
