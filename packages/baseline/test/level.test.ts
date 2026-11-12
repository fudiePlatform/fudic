import { describe, expect, it } from 'vitest';
import { AS_OF, cutoff, describeTarget, FIRST_YEAR, lastYear, widelyOn } from '../src/index.js';

describe('a level is a date (SDD-83 §3.5)', () => {
  it('takes the data date from the table, not from the clock', () => {
    expect(AS_OF).toBe('2026-10-27');
    expect(lastYear()).toBe(2026);
    expect(FIRST_YEAR).toBe(2015);
  });

  it('cuts widely 30 months before the data date, newly at it, and a year on its last day', () => {
    expect(cutoff('widely')).toBe('2024-04-27');
    expect(cutoff('newly')).toBe('2026-10-27');
    expect(cutoff(2024)).toBe('2024-12-31');
  });

  it('takes the data date as a parameter (criterion 17)', () => {
    expect(cutoff('widely', '2030-01-15')).toBe('2027-07-15');
    expect(cutoff('newly', '2030-01-15')).toBe('2030-01-15');
    expect(lastYear('2030-01-15')).toBe(2030);
  });

  it('keeps the last day of a month that has no such day', () => {
    expect(cutoff('widely', '2026-08-31')).toBe('2024-02-29');
    expect(cutoff('widely', '2027-08-31')).toBe('2025-02-28');
    expect(widelyOn('2023-06-30')).toBe('2025-12-30');
  });

  it('says when a newly available key becomes widely available', () => {
    expect(widelyOn('2026-06-16')).toBe('2028-12-16');
  });

  it('names the level for a message', () => {
    expect(describeTarget('widely')).toBe('widely available');
    expect(describeTarget('newly')).toBe('newly available');
    expect(describeTarget(2024)).toBe('Baseline 2024');
  });
});
