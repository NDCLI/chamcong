export interface RatesConfig {
  bhxh: number;
  bhyt: number;
  bhtn: number;
  thuong_he: number;
  cong_doan: number;
  gio_chuan: number;
}

export interface PitRate {
  limit: number;
  rate: number;
  deduction: number;
}

export interface PitDeductions {
  personal: number;
  dependent: number;
}

export interface Config {
  rates: RatesConfig;
  pit_rates: PitRate[];
  pit_deductions: PitDeductions;
  holidays: string[];
}

export const defaultConfig: Config = {
  rates: {
    bhxh: 0.08,
    bhyt: 0.015,
    bhtn: 0.01,
    thuong_he: 0.10,
    cong_doan: 47300,
    gio_chuan: 208
  },
  pit_rates: [
    { limit: 5000000, rate: 0.05, deduction: 0 },
    { limit: 10000000, rate: 0.10, deduction: 250000 },
    { limit: 18000000, rate: 0.15, deduction: 750000 },
    { limit: 32000000, rate: 0.20, deduction: 1650000 },
    { limit: 52000000, rate: 0.25, deduction: 3250000 },
    { limit: 80000000, rate: 0.30, deduction: 5850000 },
    { limit: 999999999999, rate: 0.35, deduction: 9850000 }
  ],
  pit_deductions: {
    personal: 11000000,
    dependent: 4400000
  },
  holidays: [
    "01-01", "04-30", "05-01", "09-02"
  ]
};

export function fmt(v: number): string {
  if (isNaN(v)) return "0";
  return Math.round(v).toLocaleString('vi-VN').replace(/\./g, ',');
}

export function pf(s: string | number): number {
  if (typeof s === 'number') return s;
  s = s.trim();
  if (!s) return 0.0;
  if (s.includes(',') && s.includes('.')) {
    return parseFloat(s.replace(/\./g, '').replace(/,/g, '.'));
  }
  if (s.includes(',')) {
    return parseFloat(s.replace(/,/g, '.'));
  }
  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount > 1) {
    return parseFloat(s.replace(/\./g, ''));
  }
  if (dotCount === 1) {
    const parts = s.split('.');
    if (parts[1].length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
      return parseFloat(parts[0] + parts[1]);
    }
  }
  return parseFloat(s) || 0;
}

export function isHoliday(date: Date, holidays: string[]): boolean {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const str = `${m}-${d}`;
  return holidays.includes(str);
}

export function calculatePit(taxableIncome: number, pitRates: PitRate[]): number {
  if (taxableIncome <= 0) return 0;
  for (const tier of pitRates) {
    if (taxableIncome <= tier.limit) {
      return Math.floor(taxableIncome * tier.rate - tier.deduction);
    }
  }
  return 0;
}

export interface CalculationResult {
  lcb: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  cd: number;
  tong: number;
  ovt: number;
  the: number;
  other: number;
  total_income: number;
  taxable_income: number;
  pit: number;
  net: number;
}

export function calc(
  lcb: number,
  h150: number,
  h200: number,
  h300: number,
  other: number,
  mon: number,
  dependents: number = 0,
  config: Config = defaultConfig
): CalculationResult {
  const r = config.rates;
  const bhxh = Math.floor(lcb * r.bhxh);
  const bhyt = Math.floor(lcb * r.bhyt);
  const bhtn = Math.floor(lcb * r.bhtn);
  const cd = r.cong_doan;
  const tong_bh = bhxh + bhyt + bhtn + cd;

  const ovt = Math.round((lcb / r.gio_chuan) * (h150 * 1.5 + h200 * 2 + h300 * 3));
  const the = [5, 6, 7, 8].includes(mon) ? lcb * r.thuong_he : 0;
  
  const total = lcb + ovt + other + the;
  const ded = config.pit_deductions;
  
  const taxable = total - tong_bh - ded.personal - (dependents * ded.dependent);
  const pit = calculatePit(taxable, config.pit_rates);
  
  return {
    lcb,
    bhxh,
    bhyt,
    bhtn,
    cd,
    tong: tong_bh,
    ovt,
    the,
    other,
    total_income: total,
    taxable_income: taxable,
    pit,
    net: total - tong_bh - pit
  };
}

export function datesOfMonth(year: number, month: number): Date[] {
  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;
  // let's re-check logic.py:
  // Let's re-check logic.py:
  // pm, py = (12, year-1) if month == 1 else (month-1, year)
  // d, end = date(py, pm, 25), date(year, month, 24)
  const d = new Date(py, pm - 1, 25);
  const end = new Date(year, month - 1, 24);
  const out: Date[] = [];
  while (d <= end) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
