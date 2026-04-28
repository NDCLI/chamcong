import { useState, useEffect } from 'react'
import './App.css'
import { calc, fmt, pf, datesOfMonth, defaultConfig, isHoliday } from './logic'
import { syncToCloud, syncFromCloud } from './firebaseSync'
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

// EditableCell component to handle decimal inputs properly
const EditableCell = ({ value, onChange, rowIndex, colIndex }: { value: number | string, onChange: (val: string) => void, rowIndex: number, colIndex: number }) => {
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : '');

  useEffect(() => {
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

  // App state
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem('salary_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing saved data", e);
      }
    }
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
        allowances: [],
        bonuses: []
      }
    };
    for (let m = 1; m <= 12; m++) {
      initData.months[m] = { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
    }
    return initData;
  });

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [syncCode, setSyncCode] = useState(() => localStorage.getItem('salary_sync_code') || '');
  const [syncStatus, setSyncStatus] = useState('');
  const [autoSyncCode, setAutoSyncCode] = useState(() => localStorage.getItem('salary_sync_code') || '');

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('salary_data', JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!autoSyncCode.trim()) return;

    const timer = setTimeout(async () => {
      try {
        await syncToCloud(autoSyncCode, data);
        setSyncStatus('✅ Đã tự động đồng bộ lên Cloud.');
      } catch (e: any) {
        console.error('Auto sync error:', e);
        setSyncStatus('❌ Tự động đồng bộ thất bại: ' + e.message);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [data, autoSyncCode]);

  useEffect(() => {
    if (!autoSyncCode.trim()) return;

    const fetchCloud = async () => {
      try {
        setSyncStatus('Đang tải dữ liệu từ Cloud...');
        const cloudData = await syncFromCloud(autoSyncCode);
        if (cloudData) {
          setData(cloudData);
          setSyncStatus('✅ Đã tự động tải dữ liệu từ Cloud.');
        }
      } catch (e: any) {
        console.error('Auto download error:', e);
        setSyncStatus('❌ Tự động tải dữ liệu thất bại: ' + e.message);
      }
    };

    fetchCloud();
  }, [autoSyncCode]);

  const updateData = (updates: Partial<AppData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    setData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || { bhxh_pct: 8, bhyt_pct: 1.5, bhtn_pct: 1, cong_doan: 47300, other_deduction: 0, allowances: [], bonuses: [] }),
        ...updates
      }
    }));
  };

  const updateMonthOT = (month: number, dateIso: string, otIndex: number, value: string) => {
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
      localStorage.setItem('salary_sync_code', syncCode);
      await syncToCloud(syncCode, data);
      setAutoSyncCode(syncCode.trim());
      setSyncStatus('✅ Đã lưu lên Cloud thành công! Tự động đồng bộ đã bật.');
    } catch (e: any) {
      setSyncStatus('❌ Lỗi: ' + e.message);
    }
  };

  const handleDownload = async () => {
    if (!syncCode.trim()) {
      setSyncStatus('❌ Vui lòng nhập Mã đồng bộ trước khi tải về.');
      return;
    }

    try {
      setSyncStatus('Đang tải về...');
      localStorage.setItem('salary_sync_code', syncCode);
      const cloudData = await syncFromCloud(syncCode);
      if (cloudData) {
        setData(cloudData);
        setAutoSyncCode(syncCode.trim());
        setSyncStatus('✅ Tải về thành công! Tự động đồng bộ đã bật.');
      }
    } catch (e: any) {
      setSyncStatus('❌ Lỗi: ' + e.message);
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
      allowances: [] as Allowance[],
      bonuses: [] as Allowance[],
      ...(data.settings || {})
    };

    const allowances = currentSettings.allowances || [];
    const settingsBonuses = currentSettings.bonuses || [];
    const bonusAmounts = mData.bonusAmounts || [];
    const monthBonuses = mData.bonuses || [];

    const allowanceSum = allowances.reduce((acc, curr) => acc + curr.amount, 0);
    const bonusSum = settingsBonuses.reduce((acc, curr, idx) => acc + (bonusAmounts[idx] ?? curr.amount), 0) + monthBonuses.reduce((acc, curr) => acc + curr.amount, 0);

    const customConfig = { ...defaultConfig };
    customConfig.rates = {
      ...customConfig.rates,
      bhxh: currentSettings.bhxh_pct / 100,
      bhyt: currentSettings.bhyt_pct / 100,
      bhtn: currentSettings.bhtn_pct / 100,
      cong_doan: currentSettings.cong_doan,
      other_deduction: currentSettings.other_deduction
    };

    const s = calc(data.lcb, h150, h200, h300, mData.other, hLate, allowanceSum, bonusSum, month, data.dependents, customConfig);
    const todayIso = getLocalDateStr(new Date());

    return (
      <div className="month-view">
        <div className="month-header">
          <h2>Tháng {month}</h2>
        </div>

        <div className="month-content">
          <div className="month-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Thứ</th>
                  <th>OT 150%</th>
                  <th>OT 200%</th>
                  <th>OT 300%</th>
                  <th>Muộn/Sớm</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d, rIdx) => {
                  const dateIso = getLocalDateStr(d);
                  const dStr = String(d.getDate()).padStart(2, '0');
                  const wd = WEEKDAYS[d.getDay()];
                  const ot = mData.ot[dateIso] || [0, 0, 0, 0];

                  const isHol = isHoliday(d, defaultConfig.holidays);
                  const isWe = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = dateIso === todayIso;

                  let rowClass = "wk";
                  if (isHol) rowClass = "hol";
                  else if (isWe) rowClass = "we";
                  else if (isToday) rowClass = "cur";

                  return (
                    <tr key={dateIso} className={rowClass}>
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
              </tbody>
              <tfoot className="table-footer">
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center', fontWeight: 'bold' }}>Giờ</td>
                  <td style={{ fontWeight: 'bold', color: '#1a73e8' }}>{h150}h</td>
                  <td style={{ fontWeight: 'bold', color: '#1a73e8' }}>{h200}h</td>
                  <td style={{ fontWeight: 'bold', color: '#1a73e8' }}>{h300}h</td>
                  <td style={{ fontWeight: 'bold', color: '#d93025' }}>{hLate}h</td>
                </tr>
              </tfoot>
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
                    <div className="bd-row" key={`bonus-${idx}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: '120px' }}>{bn.name || 'Thưởng'}</span>
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
                <div className="bd-row"><span>BHXH ({currentSettings.bhxh_pct}%):</span> <span>−{fmt(s.bhxh)} VNĐ</span></div>
                <div className="bd-row"><span>BHYT ({currentSettings.bhyt_pct}%):</span> <span>−{fmt(s.bhyt)} VNĐ</span></div>
                <div className="bd-row"><span>BHTN ({currentSettings.bhtn_pct}%):</span> <span>−{fmt(s.bhtn)} VNĐ</span></div>
                <div className="bd-row"><span>Công đoàn:</span> <span>−{fmt(s.cd)} VNĐ</span></div>
                {s.late_deduction > 0 && <div className="bd-row"><span>Đi muộn/về sớm ({hLate}h):</span> <span>−{fmt(s.late_deduction)} VNĐ</span></div>}
                {s.other_deduction > 0 && <div className="bd-row"><span>Trừ khác:</span> <span>−{fmt(s.other_deduction)} VNĐ</span></div>}
                <div className="bd-row pit"><span>Thuế TNCN ({data.dependents} NPT):</span> <span>−{fmt(s.pit)} VNĐ</span></div>
              </div>
            </div>

            <div className="net-salary">
              THỰC NHẬN: {fmt(s.net)} VNĐ
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="header-title">💰 Bảng chấm công</h1>
        <div className="header-controls">
          <button className="sync-btn" onClick={() => setShowSyncModal(true)}>☁️ Đồng bộ</button>
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
            <label>LCB (VNĐ):</label>
            <EditableCurrency
              value={data.lcb}
              onChange={(val) => updateData({ lcb: val })}
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
          <button className="sync-btn" title="Cài đặt" onClick={() => setShowSettingsModal(true)}>⚙️</button>
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

            {syncStatus && <div className="sync-status">{syncStatus}</div>}

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
          <div className="modal-content">
            <h2>⚙️ Cài đặt</h2>

            <div className="form-group">
              <label>BHXH (%):</label>
              <input
                type="number"
                step="0.1"
                value={data.settings?.bhxh_pct ?? 8}
                onChange={e => updateSettings({ bhxh_pct: Number(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>BHYT (%):</label>
              <input
                type="number"
                step="0.1"
                value={data.settings?.bhyt_pct ?? 1.5}
                onChange={e => updateSettings({ bhyt_pct: Number(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>BHTN (%):</label>
              <input
                type="number"
                step="0.1"
                value={data.settings?.bhtn_pct ?? 1}
                onChange={e => updateSettings({ bhtn_pct: Number(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Công đoàn (VNĐ):</label>
              <EditableCurrency
                value={data.settings?.cong_doan ?? 47300}
                onChange={val => updateSettings({ cong_doan: val })}
                className="other-input"
                style={{ width: '100%', textAlign: 'left' }}
              />
            </div>

            <div className="form-group">
              <label>Khoản trừ khác (VNĐ):</label>
              <EditableCurrency
                value={data.settings?.other_deduction ?? 0}
                onChange={val => updateSettings({ other_deduction: val })}
                className="other-input"
                style={{ width: '100%', textAlign: 'left' }}
              />
            </div>

            <div className="form-group" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <label>Trợ cấp:</label>
              {(data.settings?.allowances || []).map((al, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
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
                  <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => {
                    const newAls = (data.settings?.allowances || []).filter((_, i) => i !== idx);
                    updateSettings({ allowances: newAls });
                  }}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => {
                const newAls = [...(data.settings?.allowances || []), { name: '', amount: 0 }];
                updateSettings({ allowances: newAls });
              }}>+ Thêm trợ cấp mới</button>
            </div>

            <div className="form-group" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <label>Thưởng:</label>
              {(data.settings?.bonuses || []).map((bn, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
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
                  <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => {
                    const newBns = (data.settings?.bonuses || []).filter((_, i) => i !== idx);
                    updateSettings({ bonuses: newBns });
                  }}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary" style={{ width: '100%', marginBottom: '10px' }} onClick={() => {
                const newBns = [...(data.settings?.bonuses || []), { name: '', amount: 0 }];
                updateSettings({ bonuses: newBns });
              }}>+ Thêm thưởng cố định</button>
              <div style={{ marginTop: '20px' }}>
                <label>Thưởng tháng {activeTab}:</label>
                {(data.months[activeTab]?.bonuses || []).map((bn, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
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
                    <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => {
                      const newBns = (data.months[activeTab]?.bonuses || []).filter((_, i) => i !== idx);
                      updateMonthBonuses(activeTab, newBns);
                    }}>✕</button>
                  </div>
                ))}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} onClick={() => addMonthBonus(activeTab)}>
                  + Thêm thưởng tháng {activeTab}
                </button>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
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
