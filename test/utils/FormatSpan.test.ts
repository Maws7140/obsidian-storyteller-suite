import { describe, it, expect } from 'vitest';
import { formatSpan } from '../../src/utils/TimelineControlsBuilder';

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365.25 * DAY;

describe('formatSpan', () => {
    it('names a single day rather than counting it', () => {
        expect(formatSpan(DAY)).toBe('a day');
        expect(formatSpan(0)).toBe('a day');
    });

    it('counts days up to a month or so', () => {
        expect(formatSpan(9 * DAY)).toBe('9 days');
        expect(formatSpan(40 * DAY)).toBe('40 days');
    });

    it('switches to months, then years', () => {
        expect(formatSpan(90 * DAY)).toBe('3 months');
        expect(formatSpan(5 * YEAR)).toBe('5 years');
    });

    it('switches to decades, centuries and millennia', () => {
        expect(formatSpan(60 * YEAR)).toBe('6 decades');
        expect(formatSpan(300 * YEAR)).toBe('3 centuries');
        expect(formatSpan(4000 * YEAR)).toBe('4 millennia');
    });

    it('enters each unit at one of itself rather than skipping past it', () => {
        expect(formatSpan(20 * YEAR)).toBe('2 decades');
        expect(formatSpan(100 * YEAR)).toBe('1 century');
        expect(formatSpan(1000 * YEAR)).toBe('1 millennium');
    });

    it('keeps the singular where a unit lands on one', () => {
        expect(formatSpan(30 * YEAR)).toBe('3 decades');
        expect(formatSpan(2000 * YEAR)).toBe('2 millennia');
    });

    it('treats a negative span as empty rather than reporting a negative', () => {
        expect(formatSpan(-5 * DAY)).toBe('a day');
    });
});
