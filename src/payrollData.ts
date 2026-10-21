import type { AppData, MonthData } from './types'
import { splitOvertime } from './logic'

export const payrollMonthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`

export function migratePayrollData(data: AppData): AppData {
  if (data.payrollCalendar === 'calendar-month') return data

  const months: Record<string, MonthData> = {}
  const entries = Object.entries(data.months)
  for (const [key, month] of entries) {
    const targetKey = /^\d{4}-\d{2}$/.test(key)
      ? key
      : payrollMonthKey(data.year, Number(key))
    months[targetKey] = { ...month, ot: {} }
  }

  // Prefer the entry already filed under its actual month if legacy periods contain duplicates.
  const orderedEntries = entries.sort(([a], [b]) => a.localeCompare(b))
  const assigned = new Set<string>()
  for (const [key, month] of orderedEntries) {
    for (const [dateIso, ot] of Object.entries(month.ot)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue
      const targetKey = dateIso.slice(0, 7)
      const originalKey = /^\d{4}-\d{2}$/.test(key)
        ? key
        : payrollMonthKey(data.year, Number(key))
      if (assigned.has(dateIso) && originalKey !== targetKey) continue

      const date = new Date(`${dateIso}T00:00:00`)
      const raw = [ot[0] || 0, ot[1] || 0, ot[2] || 0]
      const bonus = splitOvertime(raw[0], 0).bonus
        + splitOvertime(raw[1], 1).bonus
        + splitOvertime(raw[2], 2, date.getDay() === 0).bonus
      const target = months[targetKey] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] }
      target.ot[dateIso] = [...raw, Math.round(bonus * 100) / 100]
      months[targetKey] = target
      assigned.add(dateIso)
    }
  }

  return {
    ...data,
    payrollCalendar: 'calendar-month',
    legacyPayrollMonths: data.legacyPayrollMonths || data.months,
    months,
  }
}
