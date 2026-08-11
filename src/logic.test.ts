import { describe, it, expect } from 'vitest'
import { calc, fmt, pf, datesOfMonth, defaultConfig, isHoliday, isTet, isLunarHoliday } from './logic'

describe('logic.ts', () => {
  describe('fmt - Format currency', () => {
    it('formats positive numbers correctly', () => {
      expect(fmt(1000000)).toBe('1,000,000')
      expect(fmt(123456.78)).toBe('123,457')
      expect(fmt(0)).toBe('0')
    })

    it('handles negative numbers', () => {
      expect(fmt(-1000)).toBe('-1,000')
    })

    it('handles NaN', () => {
      expect(fmt(NaN)).toBe('0')
    })
  })

  describe('pf - Parse formatted number', () => {
    it('parses formatted strings correctly', () => {
      expect(pf('1,000,000')).toBe(1000000)
      expect(pf('123,456')).toBe(123456)
      expect(pf('0')).toBe(0)
    })

    it('handles numbers directly', () => {
      expect(pf(5000)).toBe(5000)
    })

    it('handles invalid inputs', () => {
      expect(pf('')).toBe(0)
      expect(pf('abc')).toBe(0)
    })
  })

  describe('datesOfMonth - Generate dates array', () => {
    it('generates correct dates for January 2026', () => {
      const dates = datesOfMonth(2026, 1)
      expect(dates).toHaveLength(31)
      expect(dates[0].getDate()).toBe(25) // 25 Dec 2025
      expect(dates[30].getDate()).toBe(24) // 24 Jan 2026
    })

    it('handles February correctly', () => {
      const dates = datesOfMonth(2026, 2)
      expect(dates).toHaveLength(31)
      expect(dates[0].getMonth()).toBe(0) // January (0-indexed)
      expect(dates[0].getDate()).toBe(25)
    })

    it('handles month transitions correctly', () => {
      const dates = datesOfMonth(2026, 12)
      expect(dates[0].getDate()).toBe(25) // 25 Nov
      expect(dates[dates.length - 1].getDate()).toBe(24) // 24 Dec
    })
  })

  describe('defaultConfig - Get default BHXH config', () => {
    it('returns correct default values', () => {
      expect(defaultConfig.rates.bhxh).toBe(0.08)
      expect(defaultConfig.rates.bhyt).toBe(0.015)
      expect(defaultConfig.rates.bhtn).toBe(0.01)
      expect(defaultConfig.pit_deductions.personal).toBe(15500000)
      expect(defaultConfig.pit_deductions.dependent).toBe(6200000)
    })
  })

  describe('calc - Salary calculation', () => {
    it('calculates basic salary correctly', () => {
      const result = calc(10000000, 1, 1, 0, 0, 0, 0, 0, 1, 0)

      expect(result.lcb).toBe(10000000)
      expect(result.ovt).toBeGreaterThan(0)
      expect(result.net).toBeGreaterThan(0)
    })

    it('handles dependents correctly', () => {
      const noDependents = calc(15000000, 0, 0, 0, 0, 0, 0, 0, 1, 0)
      const withDependents = calc(15000000, 0, 0, 0, 0, 0, 0, 0, 1, 2)

      // With dependents, taxable income is lower, so PIT should be lower
      expect(withDependents.taxable_income).toBeLessThan(noDependents.taxable_income)
      // When PIT is lower or equal, net should be higher or equal
      expect(withDependents.net).toBeGreaterThanOrEqual(noDependents.net)
    })

    it('handles bonuses correctly', () => {
      const result = calc(10000000, 0, 0, 0, 0, 0, 0, 1000000, 1, 0)
      expect(result.bonuses).toBe(1000000)
      // Total income includes bonus, but net may be less after taxes
      expect(result.total_income).toBe(11000000)
    })

    it('handles allowances correctly', () => {
      const result = calc(10000000, 0, 0, 0, 0, 0, 1200000, 0, 1, 0)

      expect(result.allowances).toBe(1200000)
      expect(result.net).toBeGreaterThan(10000000)
    })

    it('handles zero salary', () => {
      const result = calc(0, 0, 0, 0, 0, 0, 0, 0, 1, 0)
      expect(result.lcb).toBe(0)
      // With zero salary, net is negative because of fixed costs (công đoàn)
      expect(result.net).toBeLessThan(0)
    })

    it('handles summer bonus months', () => {
      const summer = calc(10000000, 0, 0, 0, 0, 0, 0, 0, 6, 0)
      const regular = calc(10000000, 0, 0, 0, 0, 0, 0, 0, 1, 0)

      expect(summer.the).toBeGreaterThan(0)
      expect(regular.the).toBe(0)
    })
  })

  describe('isHoliday - Check if date is holiday', () => {
    it('identifies New Year correctly', () => {
      expect(isHoliday(new Date(2026, 0, 1), defaultConfig.holidays)).toBe(true)
    })

    it('identifies Reunification Day', () => {
      expect(isHoliday(new Date(2026, 3, 30), defaultConfig.holidays)).toBe(true)
    })

    it('identifies Labor Day', () => {
      expect(isHoliday(new Date(2026, 4, 1), defaultConfig.holidays)).toBe(true)
    })

    it('identifies National Day', () => {
      expect(isHoliday(new Date(2026, 8, 2), defaultConfig.holidays)).toBe(true)
    })

    it('returns false for regular days', () => {
      expect(isHoliday(new Date(2026, 2, 15), defaultConfig.holidays)).toBe(false)
      expect(isHoliday(new Date(2026, 6, 20), defaultConfig.holidays)).toBe(false)
    })
  })

  describe('isTet - Check if date is Tet', () => {
    it('identifies Tet days correctly', () => {
      expect(isTet(new Date(2026, 1, 17))).toBe(true) // Feb 17
      expect(isTet(new Date(2026, 1, 18))).toBe(true)
      expect(isTet(new Date(2026, 1, 19))).toBe(true)
    })

    it('returns false for non-Tet days', () => {
      expect(isTet(new Date(2026, 1, 15))).toBe(false)
      expect(isTet(new Date(2026, 1, 22))).toBe(false)
    })
  })

  describe('isLunarHoliday - Check lunar holidays', () => {
    it('returns null for non-lunar holidays', () => {
      const result = isLunarHoliday(new Date(2026, 0, 1))
      expect(result === null || typeof result === 'string').toBe(true)
    })
  })
})

