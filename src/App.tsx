import { useState, useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import './App.css'
import { calc, fmt, pf, datesOfMonth, defaultConfig, isHoliday, isTet, isLunarHoliday } from './logic'
import { syncToCloud, syncFromCloud, syncAccountToCloud, syncAccountFromCloud, watchAuthState, registerWithEmail, loginWithEmail, logoutUser, sendVerifyEmail, resetPasswordByEmail, updateDisplayNameProfile } from './firebaseSync'
import { Analytics } from "@vercel/analytics/react"


interface MonthOTData {
  [dateIso: string]: number[]; // [150, 200, 300, late]
}

interface MonthData {
  other: number;
  ot: MonthOTData;
  bonusAmounts?: number[];
  bonuses?: Allowance[];
}

interface Allowance {
  name: string;
  amount: number;
}

interface AppSettings {
  bhxh_pct: number;
  bhyt_pct: number;
  bhtn_pct: number;
  cong_doan: number;
  other_deduction: number;
  deductions?: Allowance[];
  allowances: Allowance[];
  bonuses: Allowance[];
}

interface AppData {
  profile_name: string;
  year: number;
  lcb: number;
  dependents: number;
  months: Record<string, MonthData>;
  settings?: AppSettings;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const getLocalDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};


const storageDataKey = (uid?: string | null) => uid ? `salary_data_${uid}` : 'salary_data';
const storageSyncKey = (uid?: string | null) => uid ? `salary_sync_code_${uid}` : 'salary_sync_code';
// EditableCell component to handle decimal inputs properly
const EditableCell = ({ value, onChange, rowIndex, colIndex }: { value: number | string, onChange: (val: string) => void, rowIndex: number, colIndex: number }) => {
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : '');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    onChange(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const nextRow = rowIndex + 1;
      const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${colIndex}"]`) as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      data-row={rowIndex}
      data-col={colIndex}
    />
  );
};

// EditableCurrency component to handle formatted currency inputs (like LCB, Other)
const EditableCurrency = ({ value, onChange, className, style }: { value: number, onChange: (val: number) => void, className?: string, style?: React.CSSProperties }) => {
  const [localValue, setLocalValue] = useState<string>(value ? fmt(value) : '');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value ? fmt(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    const parsed = pf(localValue);
    onChange(parsed);
    setLocalValue(parsed ? fmt(parsed) : '');
  };

  return (
    <input
      type="text"
      className={className}
      style={style}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

function App() {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [now, setNow] = useState(new Date());

  // App state
  const createDefaultData = (): AppData => {
    const initData: AppData = {
      profile_name: "Mặc định",
      year: new Date().getFullYear(),
      lcb: 0,
      dependents: 0,
      months: {},
      settings: {
        bhxh_pct: 8,
        bhyt_pct: 1.5,
        bhtn_pct: 1,
        cong_doan: 47300,
        other_deduction: 0,
        deductions: [],
        allowances: [],
        bonuses: []
      }
    };
    for (let m = 1; m <= 12; m++) {
      initData.months[m] = { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
    }
    return initData;
  };

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const [data, setData] = useState<AppData>(createDefaultData());

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [syncCode, setSyncCode] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [autoSyncCode, setAutoSyncCode] = useState('');
  const isUserInputRef = useRef(false);
  const accountHydratedRef = useRef(false);

  useEffect(() => {
    const unsub = watchAuthState((nextUser) => {
      setUser(nextUser);
      setProfileDisplayName(nextUser?.displayName || '');
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    accountHydratedRef.current = false;
    if (!user) return;

    const loadAccountData = async () => {
      const saved = localStorage.getItem(storageDataKey(user.uid));
      let localData = createDefaultData();
      if (saved) {
        try {
          localData = JSON.parse(saved);
        } catch {
          localData = createDefaultData();
        }
      }

      try {
        setSyncStatus('Đang tải dữ liệu tài khoản...');
        const cloudData = await syncAccountFromCloud(user.uid);
        if (cloudData) {
          setData(cloudData as AppData);
          localStorage.setItem(storageDataKey(user.uid), JSON.stringify(cloudData));
          setSyncStatus('✅ Đã đồng bộ dữ liệu theo tài khoản.');
        } else {
          setData(localData);
          await syncAccountToCloud(user.uid, localData);
          setSyncStatus('✅ Đã tạo dữ liệu Cloud cho tài khoản.');
        }
      } catch (e: unknown) {
        console.error('Account sync load error:', e);
        setData(localData);
        setSyncStatus('❌ Không tải được dữ liệu tài khoản, đang dùng dữ liệu máy này.');
      } finally {
        accountHydratedRef.current = true;
      }
    };

    void loadAccountData();

    const savedSyncCode = localStorage.getItem(storageSyncKey(user.uid)) || '';
    setSyncCode(savedSyncCode);
    setAutoSyncCode(savedSyncCode);
  }, [user]);

  useEffect(() => {
    if (!user || !accountHydratedRef.current) return;
    localStorage.setItem(storageDataKey(user.uid), JSON.stringify(data));

    const timer = setTimeout(async () => {
      try {
        await syncAccountToCloud(user.uid, data);
        if (!syncStatus.includes('Đang')) setSyncStatus('✅ Đã tự động đồng bộ theo tài khoản.');
      } catch (e) {
        console.error('Account auto sync error:', e);
        setSyncStatus('❌ Tự động đồng bộ tài khoản thất bại.');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [data, user]);

  useEffect(() => {
    if (!autoSyncCode.trim() || !isUserInputRef.current) return;

    setSyncStatus('Đang tự động đồng bộ lên Cloud...');

    const timer = setTimeout(async () => {
      try {
        await syncToCloud(autoSyncCode, data, user?.uid);
        setSyncStatus('✅ Đã tự động đồng bộ lên Cloud.');
        isUserInputRef.current = false;
      } catch (e: unknown) {
        console.error('Auto sync error:', e);
        setSyncStatus('❌ Tự động đồng bộ thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
        isUserInputRef.current = false;
      }

    }, 500);

    return () => clearTimeout(timer);
  }, [data, autoSyncCode, user?.uid]);

  const updateData = (updates: Partial<AppData>) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => ({ ...prev, ...updates }));
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || { bhxh_pct: 8, bhyt_pct: 1.5, bhtn_pct: 1, cong_doan: 47300, other_deduction: 0, deductions: [], allowances: [], bonuses: [] }),
        ...updates
      }
    }));
  };

  const updateMonthOT = (month: number, dateIso: string, otIndex: number, value: string) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {} };
      const currentOT = monthData.ot[dateIso] || [0, 0, 0, 0];
      const newOT = [...currentOT];
      newOT[otIndex] = pf(value);

      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: {
            ...monthData,
            ot: {
              ...monthData.ot,
              [dateIso]: newOT
            }
          }
        }
      };
    });
  };

  const updateMonthOther = (month: number, value: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [] };
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, other: value }
        }
      };
    });
  };

  const updateMonthBonusAmount = (month: number, bonusIndex: number, amount: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
      const currentAmounts = monthData.bonusAmounts || [];
      const newAmounts = [...currentAmounts];
      newAmounts[bonusIndex] = amount;
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, bonusAmounts: newAmounts }
        }
      };
    });
  };

  const addMonthBonus = (month: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
      const currentBonuses = monthData.bonuses || [];
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, bonuses: [...currentBonuses, { name: '', amount: 0 }] }
        }
      };
    });
  };

  const updateMonthBonuses = (month: number, bonuses: Allowance[]) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus('Đang tự động đồng bộ lên Cloud...');
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, bonuses }
        }
      };
    });
  };

  const handleUpload = async () => {
    if (!syncCode.trim()) {
      setSyncStatus('❌ Vui lòng nhập Mã đồng bộ trước khi tải lên.');
      return;
    }

    const confirmed = window.confirm(
      'Tải lên sẽ ghi đè dữ liệu hiện tại trên Cloud cho mã đồng bộ này. Bạn có chắc muốn tiếp tục?'
    );
    if (!confirmed) {
      return;
    }

    try {
      setSyncStatus('Đang tải lên...');
      if (user) localStorage.setItem(storageSyncKey(user.uid), syncCode);
      await syncToCloud(syncCode, data, user?.uid);
      setAutoSyncCode(syncCode.trim());
      setSyncStatus('✅ Đã lưu lên Cloud thành công! Tự động đồng bộ đã bật.');
    } catch (e: unknown) {
      setSyncStatus('❌ Lỗi: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
    }
  };

  const handleDownload = async () => {
    if (!syncCode.trim()) {
      setSyncStatus('❌ Vui lòng nhập Mã đồng bộ trước khi tải về.');
      return;
    }

    try {
      setSyncStatus('Đang tải về...');
      if (user) localStorage.setItem(storageSyncKey(user.uid), syncCode);
      const cloudData = await syncFromCloud(syncCode, user?.uid);
      if (cloudData) {
        setData(cloudData);
        setAutoSyncCode(syncCode.trim());
        setSyncStatus('✅ Tải về thành công! Tự động đồng bộ đã bật.');
      }
    } catch (e: unknown) {
      setSyncStatus('❌ Lỗi: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
    }
  };

  const handleAuthSubmit = async () => {
    setAuthError('');
    setAuthSuccess('');
    if (!authEmail.trim()) {
      setAuthError('Vui lòng nhập email hợp lệ.');
      return;
    }
    if (authMode !== 'forgot' && authPassword.length < 6) {
      setAuthError('Vui lòng nhập mật khẩu từ 6 ký tự.');
      return;
    }

    try {
      if (authMode === 'register') {
        await registerWithEmail(authEmail.trim(), authPassword, authDisplayName.trim() || undefined);
        await sendVerifyEmail();
        setAuthSuccess('Đã tạo tài khoản. Vui lòng kiểm tra email để xác thực.');
      } else if (authMode === 'forgot') {
        await resetPasswordByEmail(authEmail.trim());
        setAuthSuccess('Đã gửi email đặt lại mật khẩu.');
      } else {
        await loginWithEmail(authEmail.trim(), authPassword);
      }
      setAuthPassword('');
    } catch (e: unknown) {
      setAuthError((e instanceof Error ? e.message : '') || 'Thao tác xác thực thất bại.');
    }
  };

  const handleSaveDisplayName = async () => {
    try {
      const updatedUser = await updateDisplayNameProfile(profileDisplayName.trim());
      setUser({ ...updatedUser });
      setSyncStatus('✅ Đã cập nhật tên hiển thị.');
    } catch (e: unknown) {
      setSyncStatus('❌ Không cập nhật được tên hiển thị: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
    }
  };

  // Render Month Tab
  const renderMonthTab = (month: number) => {
    const dates = datesOfMonth(data.year, month);
    const mData = data.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };

    let h150 = 0, h200 = 0, h300 = 0, hLate = 0;
    // Only sum OT for dates that are actually in this month's range
    dates.forEach(d => {
      const dateIso = getLocalDateStr(d);
      const ot = mData.ot[dateIso] || [0, 0, 0, 0];
      h150 += ot[0] || 0;
      h200 += ot[1] || 0;
      h300 += ot[2] || 0;
      hLate += ot[3] || 0;
    });

    // Safe settings with defaults for old data
    const currentSettings = {
      bhxh_pct: 8,
      bhyt_pct: 1.5,
      bhtn_pct: 1,
      cong_doan: 47300,
      other_deduction: 0,
      deductions: [] as Allowance[],
      allowances: [] as Allowance[],
      bonuses: [] as Allowance[],
      ...(data.settings || {})
    };

    const allowances = currentSettings.allowances || [];
    const settingsBonuses = currentSettings.bonuses || [];
    const deductions = currentSettings.deductions || [];
    const bonusAmounts = mData.bonusAmounts || [];
    const monthBonuses = mData.bonuses || [];

    const allowanceSum = allowances.reduce((acc, curr) => acc + curr.amount, 0);
    const bonusSum = settingsBonuses.reduce((acc, curr, idx) => acc + (bonusAmounts[idx] ?? curr.amount), 0) + monthBonuses.reduce((acc, curr) => acc + curr.amount, 0);
    const deductionSum = (currentSettings.other_deduction || 0) + deductions.reduce((acc, curr) => acc + curr.amount, 0);

    const customConfig = { ...defaultConfig };
    customConfig.rates = {
      ...customConfig.rates,
      bhxh: currentSettings.bhxh_pct / 100,
      bhyt: currentSettings.bhyt_pct / 100,
      bhtn: currentSettings.bhtn_pct / 100,
      cong_doan: currentSettings.cong_doan,
      other_deduction: deductionSum
    };

    const s = calc(data.lcb, h150, h200, h300, mData.other, hLate, allowanceSum, bonusSum, month, data.dependents, customConfig);
    const totalDeductions = s.bhxh + s.bhyt + s.bhtn + s.cd + s.late_deduction + deductionSum + s.pit;
    const todayIso = getLocalDateStr(new Date());

    return (
      <div className="month-view">
        <div className="month-header">
          <h2>Tháng {month}</h2>
        </div>

        <div className="month-content">
          <div className="month-table-container">
            <table className="data-table">
              <colgroup>
                <col className="col-day" />
                <col className="col-weekday" />
                <col className="col-ot" />
                <col className="col-ot" />
                <col className="col-ot" />
                <col className="col-ot" />
              </colgroup>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Thứ</th>
                  <th>OT 150%</th>
                  <th>OT 200%</th>
                  <th>OT 300%</th>
                  <th>Late/Early Leave</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d, rIdx) => {
                  const dateIso = getLocalDateStr(d);
                  const dStr = String(d.getDate()).padStart(2, '0');
                  const wd = WEEKDAYS[d.getDay()];
                  const ot = mData.ot[dateIso] || [0, 0, 0, 0];

                  const isHol = isHoliday(d, defaultConfig.holidays);
                  const isTetDay = isTet(d);
                  const lunarHolName = isLunarHoliday(d);
                  const isWe = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = dateIso === todayIso;

                  let rowClass = "wk";
                  if (isTetDay) rowClass = "tet";
                  else if (isHol) rowClass = "hol";
                  else if (lunarHolName) rowClass = "lunar-hol";
                  else if (isWe) rowClass = "we";
                  else if (isToday) rowClass = "cur";

                  return (
                    <tr key={dateIso} className={rowClass} title={lunarHolName || undefined}>
                      <td>{dStr}</td>
                      <td>{wd}</td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[0]}
                          rowIndex={rIdx}
                          colIndex={0}
                          onChange={val => updateMonthOT(month, dateIso, 0, val)}
                        />
                      </td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[1]}
                          rowIndex={rIdx}
                          colIndex={1}
                          onChange={val => updateMonthOT(month, dateIso, 1, val)}
                        />
                      </td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[2]}
                          rowIndex={rIdx}
                          colIndex={2}
                          onChange={val => updateMonthOT(month, dateIso, 2, val)}
                        />
                      </td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[3]}
                          rowIndex={rIdx}
                          colIndex={3}
                          onChange={val => updateMonthOT(month, dateIso, 3, val)}
                        />
                      </td>
                    </tr>
                  )
                })}
                <tr className="table-footer-row">
                  <td colSpan={2}>Giờ</td>
                  <td>{h150}h</td>
                  <td>{h200}h</td>
                  <td>{h300}h</td>
                  <td>{hLate}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="breakdown-container">
            <div className="breakdown-cards">
              <div className="breakdown-card allowances">
                <h3>➕ TRỢ CẤP</h3>
                <div className="bd-row"><span>Thưởng hè:</span> <span>{fmt(s.the)} VNĐ</span></div>
                {currentSettings.allowances.map((al, idx) => (
                  <div className="bd-row" key={idx}><span>{al.name}:</span> <span>{fmt(al.amount)} VNĐ</span></div>
                ))}
              </div>

              <div className="breakdown-card additions">
                <h3>➕ TĂNG CA/THƯỞNG</h3>
                <div className="bd-row"><span>Tiền OT:</span> <span>{fmt(s.ovt)} VNĐ</span></div>
                {settingsBonuses.map((bn, idx) => {
                  const monthAmount = bonusAmounts[idx] ?? bn.amount;
                  return (
                    <div className="bd-row" key={`bonus-${idx}`}>
                      <span>{bn.name || 'Thưởng'}</span>
                      <EditableCurrency
                        value={monthAmount}
                        onChange={val => updateMonthBonusAmount(month, idx, val)}
                        className="other-input"
                        style={{ width: '120px' }}
                      />
                    </div>
                  );
                })}
                {monthBonuses.map((bn, idx) => (
                  <div className="bd-row bonus-row" key={`month-bonus-${idx}`}>
                    <span>{bn.name || 'Thưởng tháng'}</span>
                    <EditableCurrency
                      value={bn.amount}
                      onChange={val => {
                        const newBns = [...monthBonuses];
                        newBns[idx].amount = val;
                        updateMonthBonuses(month, newBns);
                      }}
                      className="other-input"
                      style={{ width: '120px' }}
                    />
                  </div>
                ))}
                <div className="bd-row" style={{ marginTop: '10px' }}>
                  <span>Khác (VNĐ):</span>
                  <EditableCurrency
                    value={mData.other}
                    onChange={val => updateMonthOther(month, val)}
                    className="other-input"
                  />
                </div>
              </div>

              <div className="breakdown-card deductions">
                <h3>➖ KHẤU TRỪ</h3>
                <div className="bd-row"><span>BHXH ({currentSettings.bhxh_pct}%):</span> <span>{fmt(s.bhxh)} VNĐ</span></div>
                <div className="bd-row"><span>BHYT ({currentSettings.bhyt_pct}%):</span> <span>{fmt(s.bhyt)} VNĐ</span></div>
                <div className="bd-row"><span>BHTN ({currentSettings.bhtn_pct}%):</span> <span>{fmt(s.bhtn)} VNĐ</span></div>
                <div className="bd-row"><span>Công đoàn:</span> <span>{fmt(s.cd)} VNĐ</span></div>
                {s.late_deduction > 0 && <div className="bd-row"><span>Đi muộn/về sớm ({hLate}h):</span> <span>{fmt(s.late_deduction)} VNĐ</span></div>}
                {currentSettings.other_deduction > 0 && <div className="bd-row"><span>Trừ khác:</span> <span>{fmt(currentSettings.other_deduction)} VNĐ</span></div>}
                {deductions.map((ded, idx) => (
                  <div className="bd-row" key={`ded-${idx}`}><span>{ded.name || 'Khoản trừ'}:</span> <span>{fmt(ded.amount)} VNĐ</span></div>
                ))}
                <div className="bd-row pit"><span>Thuế TNCN:</span> <span>{fmt(s.pit)} VNĐ</span></div>
                <div className="bd-row deduction-total"><span>Tổng khấu trừ:</span> <span>{fmt(totalDeductions)} VNĐ</span></div>
              </div>
            </div>

            <div className="net-salary">
              <span>THỰC NHẬN:</span>
              <span>{fmt(s.net)} VNĐ</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) {
    return <div className="app-container"><div className="modal-content"><h2>Đang tải tài khoản...</h2></div></div>;
  }

  if (!user) {
    return (
      <div className="app-container">
        <div className="modal-overlay" style={{ position: 'static', minHeight: '100vh' }}>
          <div className="modal-content" style={{ width: 'min(460px, 94vw)' }}>
            <h2>{authMode === 'login' ? '🔐 Đăng nhập' : authMode === 'register' ? '📝 Tạo tài khoản riêng' : '🔁 Quên mật khẩu'}</h2>
            <p className="modal-desc">Mỗi tài khoản sẽ có dữ liệu chấm công riêng, tách biệt với người dùng khác.</p>
            {authMode === 'register' && (
              <div className="form-group">
                <label>Tên hiển thị</label>
                <input
                  type="text"
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                  placeholder="Tên của bạn"
                />
              </div>
            )}
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                placeholder="you@example.com"
              />
            </div>
            <div className="form-group">
              <label>Mật khẩu</label>
              {authMode !== 'forgot' && (
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                  placeholder="Tối thiểu 6 ký tự"
                />
              )}
            </div>
            {authError && <div className="sync-warning">❌ {authError}</div>}
            {authSuccess && <div className="sync-status">✅ {authSuccess}</div>}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleAuthSubmit}>
                {authMode === 'login' ? 'Đăng nhập' : authMode === 'register' ? 'Tạo tài khoản' : 'Gửi email đặt lại'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); setAuthSuccess(''); }}>
                {authMode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
              </button>
              <button className="btn btn-danger" style={{ marginLeft: 0 }} onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccess(''); }}>Quên mật khẩu</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="header-title">📈 Bảng tính lương</h1>
        <div className="header-controls">
          <span className="user-badge" title={user.email || 'Tài khoản'}>👤 {user.displayName || user.email || 'Tài khoản'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="sync-btn" onClick={() => setShowSyncModal(true)}>
              <span className="sync-btn-icon" aria-hidden="true">☁️</span>
              Đồng bộ
            </button>
            {(syncStatus.includes('Đang') || syncStatus.includes('❌')) && (
              <span className={`sync-indicator ${syncStatus.includes('❌') ? 'error' : 'syncing'}`} title={syncStatus}>
                {syncStatus.includes('Đang') ? '☁️' : '✕'}
              </span>
            )}
          </div>
          <div className="input-group">
            <label>Năm:</label>
            <input
              type="text"
              inputMode="numeric"
              value={data.year}
              onChange={(e) => updateData({ year: Number(e.target.value) })}
              style={{ width: '75px', textAlign: 'center' }}
            />
          </div>
          <div className="input-group">
            <label>NPT:</label>
            <input
              type="text"
              inputMode="numeric"
              value={data.dependents}
              onChange={(e) => updateData({ dependents: Number(e.target.value) })}
              style={{ width: '50px', textAlign: 'center' }}
            />
          </div>
          <button className="icon-btn" title="Cài đặt" onClick={() => setShowSettingsModal(true)}>⚙️</button>
          <button className="icon-btn danger" title="Đăng xuất" onClick={() => logoutUser()}>⏻</button>
        </div>
      </header>

      <div className="tabs">
        {[...Array(12)].map((_, i) => (
          <div
            key={i + 1}
            className={`tab ${activeTab === i + 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(i + 1)}
          >
            Th{i + 1}
          </div>
        ))}
        <div className="led-ticker" aria-label="Ngày giờ hiện tại">
          <span>
            {now.toLocaleString('vi-VN', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
        </div>
      </div>

      <div className="tab-content">
        {renderMonthTab(activeTab)}
      </div>

      {showSyncModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>☁️ Đồng bộ Cloud</h2>
            <p className="modal-desc">Nhập Mã đồng bộ bí mật của riêng bạn (ví dụ: LUONG2026). Dùng chung mã này trên các thiết bị khác để tải dữ liệu về.</p>

            <div className="form-group">
              <label>Mã đồng bộ (Mật khẩu riêng):</label>
              <input
                type="text"
                value={syncCode}
                onChange={e => setSyncCode(e.target.value)}
                placeholder="VD: LUONG2026"
              />
            </div>
            <div className="sync-warning">
              ⚠️ Lưu ý: "Tải lên" sẽ ghi đè dữ liệu hiện tại trên Cloud của mã này.
              Nếu bạn chỉ muốn lấy dữ liệu từ thiết bị khác, hãy dùng "Tải về".
            </div>

            {syncStatus && (
              <div className="sync-status">
                {syncStatus.includes('Đang') ? (
                  <div className="sync-lottie-wrapper">
                    <div className="sync-spinner" aria-hidden="true" />
                  </div>
                ) : syncStatus.includes('✅') ? (
                  <div className="sync-success-icon">✅</div>
                ) : syncStatus.includes('❌') ? (
                  <div>{syncStatus}</div>
                ) : null}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!syncCode.trim()}
              >
                Tải lên (ghi đè) 📤
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
                disabled={!syncCode.trim()}
              >
                Tải về 📥
              </button>
              <button className="btn btn-danger" onClick={() => setShowSyncModal(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content settings-modal">
            <h2>⚙️ Cài đặt</h2>

            <div className="settings-grid">
              {/* CỘT TRÁI: Lương & Khấu trừ */}
              <div className="settings-col">
                <h3 className="settings-section-title">👤 Tài khoản</h3>
                <div className="settings-item-row profile-name-row">
                  <input
                    type="text"
                    placeholder="Tên hiển thị"
                    value={profileDisplayName}
                    onChange={e => setProfileDisplayName(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-secondary" onClick={handleSaveDisplayName}>Lưu tên</button>
                </div>

                <h3 className="settings-section-title">💵 Lương & Khấu trừ</h3>

                <div className="settings-row-2">
                  <div className="form-group compact">
                    <label>LCB (VNĐ)</label>
                    <EditableCurrency
                      value={data.lcb}
                      onChange={(val) => updateData({ lcb: val })}
                      className="other-input"
                      style={{ width: '100%', textAlign: 'left' }}
                    />
                  </div>

                  <div className="form-group compact">
                    <label>Công đoàn (VNĐ)</label>
                    <EditableCurrency
                      value={data.settings?.cong_doan ?? 47300}
                      onChange={val => updateSettings({ cong_doan: val })}
                      className="other-input"
                      style={{ width: '100%', textAlign: 'left' }}
                    />
                  </div>
                </div>

                <div className="settings-row-3">
                  <div className="form-group compact">
                    <label>BHXH (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={data.settings?.bhxh_pct ?? 8}
                      onChange={e => updateSettings({ bhxh_pct: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group compact">
                    <label>BHYT (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={data.settings?.bhyt_pct ?? 1.5}
                      onChange={e => updateSettings({ bhyt_pct: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group compact">
                    <label>BHTN (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={data.settings?.bhtn_pct ?? 1}
                      onChange={e => updateSettings({ bhtn_pct: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <h3 className="settings-section-title">➖ Khoản trừ khác</h3>
                <div className="settings-list">
                  {(data.settings?.deductions || []).map((ded, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên khoản trừ"
                        value={ded.name}
                        onChange={e => {
                          const newDeds = [...(data.settings?.deductions || [])];
                          newDeds[idx].name = e.target.value;
                          updateSettings({ deductions: newDeds });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={ded.amount}
                        onChange={val => {
                          const newDeds = [...(data.settings?.deductions || [])];
                          newDeds[idx].amount = val;
                          updateSettings({ deductions: newDeds });
                        }}
                        style={{ flex: 1 }}
                      />
                      <button className="btn-mini-danger" onClick={() => {
                        const newDeds = (data.settings?.deductions || []).filter((_, i) => i !== idx);
                        updateSettings({ deductions: newDeds });
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-add" onClick={() => {
                  const newDeds = [...(data.settings?.deductions || []), { name: '', amount: 0 }];
                  updateSettings({ deductions: newDeds });
                }}>+ Thêm khoản trừ</button>

                <h3 className="settings-section-title">➕ Trợ cấp</h3>
                <div className="settings-list">
                  {(data.settings?.allowances || []).map((al, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên trợ cấp"
                        value={al.name}
                        onChange={e => {
                          const newAls = [...(data.settings?.allowances || [])];
                          newAls[idx].name = e.target.value;
                          updateSettings({ allowances: newAls });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={al.amount}
                        onChange={val => {
                          const newAls = [...(data.settings?.allowances || [])];
                          newAls[idx].amount = val;
                          updateSettings({ allowances: newAls });
                        }}
                        style={{ flex: 1 }}
                      />
                      <button className="btn-mini-danger" onClick={() => {
                        const newAls = (data.settings?.allowances || []).filter((_, i) => i !== idx);
                        updateSettings({ allowances: newAls });
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-add" onClick={() => {
                  const newAls = [...(data.settings?.allowances || []), { name: '', amount: 0 }];
                  updateSettings({ allowances: newAls });
                }}>+ Thêm trợ cấp</button>
              </div>

              {/* CỘT PHẢI: Thưởng */}
              <div className="settings-col">
                <h3 className="settings-section-title">🎁 Thưởng cố định</h3>
                <div className="settings-list">
                  {(data.settings?.bonuses || []).map((bn, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên thưởng"
                        value={bn.name}
                        onChange={e => {
                          const newBns = [...(data.settings?.bonuses || [])];
                          newBns[idx].name = e.target.value;
                          updateSettings({ bonuses: newBns });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={bn.amount}
                        onChange={val => {
                          const newBns = [...(data.settings?.bonuses || [])];
                          newBns[idx].amount = val;
                          updateSettings({ bonuses: newBns });
                        }}
                        style={{ flex: 1 }}
                      />
                      <button className="btn-mini-danger" onClick={() => {
                        const newBns = (data.settings?.bonuses || []).filter((_, i) => i !== idx);
                        updateSettings({ bonuses: newBns });
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-add" onClick={() => {
                  const newBns = [...(data.settings?.bonuses || []), { name: '', amount: 0 }];
                  updateSettings({ bonuses: newBns });
                }}>+ Thêm thưởng cố định</button>

                <h3 className="settings-section-title">📅 Thưởng tháng {activeTab}</h3>
                <div className="settings-list">
                  {(data.months[activeTab]?.bonuses || []).map((bn, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên thưởng tháng"
                        value={bn.name}
                        onChange={e => {
                          const newBns = [...(data.months[activeTab]?.bonuses || [])];
                          newBns[idx].name = e.target.value;
                          updateMonthBonuses(activeTab, newBns);
                        }}
                        style={{ flex: 2 }}
                      />
                      <button className="btn-mini-danger" onClick={() => {
                        const newBns = (data.months[activeTab]?.bonuses || []).filter((_, i) => i !== idx);
                        updateMonthBonuses(activeTab, newBns);
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary btn-add" onClick={() => addMonthBonus(activeTab)}>
                  + Thêm thưởng tháng {activeTab}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowSettingsModal(false)} style={{ marginLeft: 'auto' }}>Xong</button>
            </div>
          </div>
        </div>
      )}
      <Analytics />
    </div>
  )
}

export default App
