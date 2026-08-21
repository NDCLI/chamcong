import { describe, expect, it } from 'vitest';
import {
  FALLBACK_HOLIDAY_CALENDAR,
  getPublicHolidayMonthDays,
  isPublicHoliday,
  isPublicHolidayCalendar,
} from './holidayCalendar';
import type { PublicHolidayCalendar } from './holidayCalendar';

describe('public holiday calendar', () => {
  it('includes both National Day holidays for 2026 in the offline fallback', () => {
    expect(isPublicHoliday(new Date(2026, 8, 1), FALLBACK_HOLIDAY_CALENDAR)).toBe(true);
    expect(isPublicHoliday(new Date(2026, 8, 2), FALLBACK_HOLIDAY_CALENDAR)).toBe(true);
  });

  it('uses the cloud calendar for the yearly adjacent National Day holiday', () => {
    const cloudCalendar: PublicHolidayCalendar = {
      schemaVersion: 1,
      updatedAt: '2027-08-01T00:00:00+07:00',
      years: { '2027': ['09-03'] },
    };

    expect(isPublicHolidayCalendar(cloudCalendar)).toBe(true);
    expect(getPublicHolidayMonthDays(2027, cloudCalendar)).toEqual(
      expect.arrayContaining(['09-02', '09-03'])
    );
    expect(isPublicHoliday(new Date(2027, 8, 1), cloudCalendar)).toBe(false);
  });

  it('rejects malformed cloud data', () => {
    expect(isPublicHolidayCalendar({ schemaVersion: 1, updatedAt: 'now', years: { '2026': ['2026-09-01'] } })).toBe(false);
  });
});
