import { useState, useEffect } from 'react'
import './App.css'
import { calc, fmt, pf, datesOfMonth, defaultConfig, isHoliday } from './logic'
import { syncToCloud, syncFromCloud } from './firebaseSync'

interface MonthOTData {
  [dateIso: string]: [number, number, number]; // [150, 200, 300]
}

interface MonthData {
  other: number;
  ot: MonthOTData;
}

interface AppData {
  profile_name: string;
  year: number;
  lcb: number;
  dependents: number;
  months: Record<string, MonthData>;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// EditableCell component to handle decimal inputs properly
const EditableCell = ({ value, onChange }: { value: number | string, onChange: (val: string) => void }) => {
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

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

// EditableCurrency component to handle formatted currency inputs (like LCB, Other)
const EditableCurrency = ({ value, onChange, className }: { value: number, onChange: (val: number) => void, className?: string }) => {
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
      lcb: 7393000,
      dependents: 0,
      months: {}
    };
    for (let m = 1; m <= 12; m++) {
      initData.months[m] = { other: 0, ot: {} };
    }
    return initData;
  });

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncCode, setSyncCode] = useState(() => localStorage.getItem('salary_sync_code') || '');
  const [syncStatus, setSyncStatus] = useState('');

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('salary_data', JSON.stringify(data));
  }, [data]);

  const updateData = (updates: Partial<AppData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const updateMonthOT = (month: number, dateIso: string, otIndex: number, value: string) => {
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {} };
      const currentOT = monthData.ot[dateIso] || [0, 0, 0];
      const newOT = [...currentOT] as [number, number, number];
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
      const monthData = prev.months[month] || { other: 0, ot: {} };
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, other: value }
        }
      };
    });
  };

  const handleUpload = async () => {
    try {
      setSyncStatus('Đang tải lên...');
      localStorage.setItem('salary_sync_code', syncCode);
      await syncToCloud(syncCode, data);
      setSyncStatus('✅ Đã lưu lên Cloud thành công!');
    } catch (e: any) {
      setSyncStatus('❌ Lỗi: ' + e.message);
    }
  };

  const handleDownload = async () => {
    try {
      setSyncStatus('Đang tải về...');
      localStorage.setItem('salary_sync_code', syncCode);
      const cloudData = await syncFromCloud(syncCode);
      if (cloudData) {
        setData(cloudData);
        setSyncStatus('✅ Tải về thành công!');
      }
    } catch (e: any) {
      setSyncStatus('❌ Lỗi: ' + e.message);
    }
  };

  // Render Month Tab
  const renderMonthTab = (month: number) => {
    const dates = datesOfMonth(data.year, month);
    const mData = data.months[month] || { other: 0, ot: {} };

    let h150 = 0, h200 = 0, h300 = 0;
    // Only sum OT for dates that are actually in this month's range
    dates.forEach(d => {
      const dateIso = d.toISOString().split('T')[0];
      const ot = mData.ot[dateIso] || [0, 0, 0];
      h150 += ot[0] || 0;
      h200 += ot[1] || 0;
      h300 += ot[2] || 0;
    });

    const s = calc(data.lcb, h150, h200, h300, mData.other, month, data.dependents);
    const todayIso = new Date().toISOString().split('T')[0];

    return (
      <div className="month-view">
        <div className="month-header">
          <h2>Chi tiết Tháng {month}</h2>
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
                </tr>
              </thead>
              <tbody>
                {dates.map(d => {
                  const dateIso = d.toISOString().split('T')[0];
                  const dStr = String(d.getDate()).padStart(2, '0');
                  const wd = WEEKDAYS[d.getDay()];
                  const ot = mData.ot[dateIso] || [0, 0, 0];

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
                          onChange={val => updateMonthOT(month, dateIso, 0, val)}
                        />
                      </td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[1]}
                          onChange={val => updateMonthOT(month, dateIso, 1, val)}
                        />
                      </td>
                      <td className="editable-cell">
                        <EditableCell
                          value={ot[2]}
                          onChange={val => updateMonthOT(month, dateIso, 2, val)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="breakdown-container">
            <div className="breakdown-cards">
              <div className="breakdown-card additions">
                <h3>➕ KHOẢN CỘNG</h3>
                <div className="bd-row"><span>Lương cơ bản:</span> <span>{fmt(data.lcb)} đ</span></div>
                <div className="bd-row"><span>Tiền OT ({h150}h|{h200}h|{h300}h):</span> <span>{fmt(s.ovt)} đ</span></div>
                <div className="bd-row"><span>Thưởng hè:</span> <span>{fmt(s.the)} đ</span></div>
                <div className="bd-row" style={{ marginTop: '10px' }}>
                  <span>Khác (đ):</span>
                  <EditableCurrency
                    value={mData.other}
                    onChange={val => updateMonthOther(month, val)}
                    className="other-input"
                  />
                </div>
              </div>

              <div className="breakdown-card deductions">
                <h3>➖ KHOẢN TRỪ</h3>
                <div className="bd-row"><span>BHXH (8%):</span> <span>−{fmt(s.bhxh)} đ</span></div>
                <div className="bd-row"><span>BHYT (1.5%):</span> <span>−{fmt(s.bhyt)} đ</span></div>
                <div className="bd-row"><span>BHTN (1%):</span> <span>−{fmt(s.bhtn)} đ</span></div>
                <div className="bd-row"><span>Công đoàn:</span> <span>−{fmt(s.cd)} đ</span></div>
                <div className="bd-row pit"><span>Thuế TNCN ({data.dependents} NPT):</span> <span>−{fmt(s.pit)} đ</span></div>
              </div>
            </div>

            <div className="net-salary">
              THỰC NHẬN: {fmt(s.net)} đ
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
              type="number"
              value={data.year}
              onChange={(e) => updateData({ year: Number(e.target.value) })}
              style={{ width: '75px' }}
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
              type="number"
              value={data.dependents}
              onChange={(e) => updateData({ dependents: Number(e.target.value) })}
              style={{ width: '50px' }}
            />
          </div>
        </div>
      </header>

      <div className="tabs">
        {[...Array(12)].map((_, i) => (
          <div
            key={i + 1}
            className={`tab ${activeTab === i + 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(i + 1)}
          >
            T{i + 1}
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

            {syncStatus && <div className="sync-status">{syncStatus}</div>}

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleUpload}>Tải lên 📤</button>
              <button className="btn btn-secondary" onClick={handleDownload}>Tải về 📥</button>
              <button className="btn btn-danger" onClick={() => setShowSyncModal(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
