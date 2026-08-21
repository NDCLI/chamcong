export interface PublicHolidayCalendar {
  schemaVersion: 1;
  updatedAt: string;
  /**
   * Ngày nghỉ bổ sung theo thông báo từng năm, định dạng MM-DD.
   * Các ngày nghỉ cố định theo luật đã được thêm tự động.
   */
  years: Record<string, string[]>;
}

export const HOLIDAY_CALENDAR_CACHE_KEY = 'salary_public_holidays_v1';

const FIXED_PUBLIC_HOLIDAYS = ['01-01', '04-30', '05-01', '09-02'];
const FALLBACK_YEARLY_HOLIDAYS: Record<string, string[]> = {
  // Lịch Quốc khánh 2026: nghỉ ngày 01/09 và 02/09.
  '2026': ['09-01'],
};

export const FALLBACK_HOLIDAY_CALENDAR: PublicHolidayCalendar = {
  schemaVersion: 1,
  updatedAt: '2026-08-21T00:00:00+07:00',
  years: FALLBACK_YEARLY_HOLIDAYS,
};

const isMonthDay = (value: unknown): value is string =>
  typeof value === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);

export function isPublicHolidayCalendar(value: unknown): value is PublicHolidayCalendar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const calendar = value as Record<string, unknown>;
  if (calendar.schemaVersion !== 1 || typeof calendar.updatedAt !== 'string') return false;
  if (!calendar.years || typeof calendar.years !== 'object' || Array.isArray(calendar.years)) return false;

  return Object.entries(calendar.years as Record<string, unknown>).every(([year, dates]) =>
    /^\d{4}$/.test(year) && Array.isArray(dates) && dates.every(isMonthDay)
  );
}

export function getCachedHolidayCalendar(): PublicHolidayCalendar {
  if (typeof window === 'undefined') return FALLBACK_HOLIDAY_CALENDAR;

  try {
    const cached = JSON.parse(localStorage.getItem(HOLIDAY_CALENDAR_CACHE_KEY) || 'null');
    return isPublicHolidayCalendar(cached) ? cached : FALLBACK_HOLIDAY_CALENDAR;
  } catch {
    return FALLBACK_HOLIDAY_CALENDAR;
  }
}

export function cacheHolidayCalendar(calendar: PublicHolidayCalendar): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(HOLIDAY_CALENDAR_CACHE_KEY, JSON.stringify(calendar));
  } catch {
    // The in-memory and fallback calendars remain available if storage is full or disabled.
  }
}

export function getPublicHolidayMonthDays(year: number, calendar: PublicHolidayCalendar): string[] {
  const yearlyDates = calendar.years[String(year)] ?? FALLBACK_YEARLY_HOLIDAYS[String(year)] ?? [];
  return [...new Set([...FIXED_PUBLIC_HOLIDAYS, ...yearlyDates])];
}

export function isPublicHoliday(date: Date, calendar: PublicHolidayCalendar): boolean {
  const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return getPublicHolidayMonthDays(date.getFullYear(), calendar).includes(monthDay);
}
