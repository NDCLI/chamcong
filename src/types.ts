export interface MonthOTData {
  [dateIso: string]: number[]; // [150, 200, 300, late]
}

export interface MonthData {
  other: number;
  ot: MonthOTData;
  bonusAmounts?: number[];
  bonuses?: Allowance[];
}

export interface Allowance {
  name: string;
  amount: number;
}

export interface AppSettings {
  bhxh_pct: number;
  bhyt_pct: number;
  bhtn_pct: number;
  cong_doan: number;
  other_deduction: number;
  deductions?: Allowance[];
  allowances: Allowance[];
  bonuses: Allowance[];
  google_calendar_url?: string;
}

export interface AppData {
  profile_name: string;
  year: number;
  lcb: number;
  dependents: number;
  months: Record<string, MonthData>;
  settings?: AppSettings;
  lastUpdated?: number;
}

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncStatus {
  state: SyncState;
  message: string;
}
