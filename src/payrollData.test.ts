import { describe, expect, it } from 'vitest'
import type { AppData } from './types'
import { datesOfMonth, calc, splitOvertime } from './logic'
import { getLocalDateStr } from './storage'
import { migratePayrollData, payrollMonthKey } from './payrollData'

const legacyData = (): AppData => ({
  profile_name: 'Test', year: 2026, lcb: 10400000, dependents: 0, lastUpdated: 123,
  months: {
    1: { other: 100, ot: { '2025-12-25': [1, 0, 0, 0], '2026-01-24': [0, 4, 0, 0] } },
    2: { other: 200, bonusAmounts: [500], bonuses: [{ name: 'Thưởng', amount: 600 }],
      ot: { '2026-01-25': [0, 0, 11.17, 0], '2026-02-24': [3, 0, 0, 0] } },
    3: { other: 0, ot: { '2026-02-25': [2, 0, 0, 0] } },
  },
})

function monthlyPay(data: AppData, month: number) {
  const monthData = data.months[payrollMonthKey(data.year, month)]
  const totals = [0, 0, 0, 0, 0, 0]
  for (const date of datesOfMonth(data.year, month)) {
    const ot = monthData?.ot[getLocalDateStr(date)] || [0, 0, 0, 0]
    for (let column = 0; column < 3; column++) {
      const split = splitOvertime(ot[column], column, date.getDay() === 0)
      totals[column] += split.normal
      totals[column + 3] += split.bonus
    }
  }
  return calc(data.lcb, totals[0], totals[1], totals[2], 0,
    totals[3], totals[4], totals[5], 0, 0, month)
}

describe('calendar-month payroll data', () => {
  it('uses year and month in the storage key', () => {
    expect(payrollMonthKey(2026, 1)).toBe('2026-01')
    expect(payrollMonthKey(2027, 1)).toBe('2027-01')
  })

  it('moves attendance into the calendar month of each date', () => {
    const migrated = migratePayrollData(legacyData())
    expect(Object.keys(migrated.months['2026-01'].ot)).toEqual(['2026-01-24', '2026-01-25'])
    expect(Object.keys(migrated.months['2026-02'].ot)).toEqual(['2026-02-24', '2026-02-25'])
    expect(migrated.months['2026-03'].ot).toEqual({})
    expect(migrated.months['2025-12'].ot['2025-12-25']).toEqual([1, 0, 0, 0])
    expect(migrated.months['2026-01'].ot['2026-01-25']).toEqual([0, 0, 11.17, 0.5])
    expect(migrated.months['2026-02'].ot['2026-02-24']).toEqual([3, 0, 0, 1])
  })

  it('retains monthly income and bonuses in their labelled month, without duplication', () => {
    const migrated = migratePayrollData(legacyData())
    expect(migrated.months['2026-01'].other).toBe(100)
    expect(migrated.months['2026-02'].other).toBe(200)
    expect(migrated.months['2026-02'].bonusAmounts).toEqual([500])
    expect(migrated.months['2026-02'].bonuses).toEqual([{ name: 'Thưởng', amount: 600 }])
    expect(migrated.months['2025-12'].other).toBe(0)
  })

  it('preserves the source snapshot, timestamp, settings and original object', () => {
    const source = { ...legacyData(), settings: { bhxh_pct: 8, bhyt_pct: 1.5, bhtn_pct: 1,
      cong_doan: 47300, other_deduction: 0, allowances: [], bonuses: [] } }
    const original = structuredClone(source)
    const migrated = migratePayrollData(source)
    expect(source).toEqual(original)
    expect(migrated.legacyPayrollMonths).toEqual(original.months)
    expect(migrated.lastUpdated).toBe(123)
    expect(migrated.settings).toEqual(source.settings)
    migrated.months['2026-01'].ot['2026-01-24'][1] = 8
    expect(source).toEqual(original)
  })

  it('is idempotent after migration and after JSON/cloud round trips', () => {
    const migrated = migratePayrollData(legacyData())
    expect(migratePayrollData(migrated)).toBe(migrated)
    const downloaded = JSON.parse(JSON.stringify(migrated)) as AppData
    expect(migratePayrollData(downloaded)).toEqual(migrated)
  })

  it('keeps months from multiple years separate', () => {
    const migrated = migratePayrollData(legacyData())
    migrated.months['2027-01'] = { other: 999, ot: { '2027-01-01': [2, 0, 0, 0] } }
    const nextYear = { ...migrated, year: 2027 }
    expect(monthlyPay(nextYear, 1).ovt).toBe(150000)
    expect(nextYear.months['2026-01'].other).toBe(100)
    expect(nextYear.months['2027-01'].other).toBe(999)
    expect(nextYear.months['2025-12'].ot['2025-12-25']).toBeDefined()
  })

  it('prefers the actual-month entry for duplicate legacy dates, without adding hours twice', () => {
    const source = legacyData()
    source.months[1].ot['2026-01-25'] = [2, 0, 0, 0]
    const migrated = migratePayrollData(source)
    expect(migrated.months['2026-01'].ot['2026-01-25']).toEqual([2, 0, 0, 0])
    expect(migrated.legacyPayrollMonths?.[2].ot['2026-01-25']).toEqual([0, 0, 11.17, 0])
  })

  it('counts relocated OT and bonus pay only in the actual calendar month', () => {
    const migrated = migratePayrollData(legacyData())
    expect(monthlyPay(migrated, 1).ovt).toBe(2000500)
    expect(monthlyPay(migrated, 1).bonus_ot_pay).toBe(75000)
    expect(monthlyPay(migrated, 2).ovt).toBe(300000)
    expect(monthlyPay(migrated, 2).bonus_ot_pay).toBe(75000)
    expect(monthlyPay(migrated, 3).ovt).toBe(0)
  })

  it('keeps December 31 and leap day attendance when migrating older periods', () => {
    const source = { ...legacyData(), year: 2024, months: {
      1: { other: 0, ot: { '2023-12-31': [0, 0, 8.67, 0] } },
      3: { other: 0, ot: { '2024-02-29': [2, 0, 0, 0] } },
    } }
    const migrated = migratePayrollData(source)
    expect(migrated.months['2023-12'].ot['2023-12-31']).toEqual([0, 0, 8.67, 0])
    expect(migrated.months['2024-02'].ot['2024-02-29']).toEqual([2, 0, 0, 0])
    expect(monthlyPay(migrated, 2).ovt).toBe(150000)
  })
})
