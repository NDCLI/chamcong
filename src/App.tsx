import { useState, useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import './App.css'
import { calc, fmt, pf, datesOfMonth, defaultConfig, isHoliday, isTet, isLunarHoliday } from './logic'
import type { AppData, AppSettings, Allowance, SyncStatus } from './types'
import { DEFAULT_SETTINGS, WEEKDAYS } from './constants'
import { storageDataKey, storageSyncKey, getLocalDateStr } from './storage'
import { isStoredAppData, hasMeaningfulData, hashGuestCode, isValidPassphrase } from './helpers'
import { EditableCell } from './components/EditableCell'
import { EditableCurrency } from './components/EditableCurrency'
import { Clock } from './components/Clock'
import { SyncLoaderIcon } from './components/SyncLoaderIcon'
import {
  syncToCloud,
  syncFromCloud,
  syncAccountToCloud,
  syncAccountFromCloud,
  watchAuthState,
  registerWithEmail,
  loginWithEmail,
  logoutUser,
  sendVerifyEmail,
  resetPasswordByEmail,
  updateDisplayNameProfile,
  updateUserPassword
} from './firebaseSync'
import { Analytics } from "@vercel/analytics/react"
import {
  TrendingUp, User as UserIcon, Cloud, Settings, LogOut,
  Plus, Minus, CheckCircle, XCircle, AlertTriangle,
  Lock, KeyRound, DollarSign, Gift, CalendarDays,
  Upload, Download, X, ChevronLeft, ChevronRight, ChevronDown
} from 'lucide-react'


function App() {
  const getInitialMonth = () => {
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth() + 1;
    
    // Bảng tính từ 25 tháng này đến 24 tháng sau
    // Nên nếu ngày >= 25 thì nó ở tháng sau
    if (todayDate >= 25) {
      return todayMonth === 12 ? 1 : todayMonth + 1;
    }
    return todayMonth;
  };
  
  const [activeTab, setActiveTab] = useState<number>(getInitialMonth());
  const [showMonthDropdown, setShowMonthDropdown] = useState<boolean>(false);
  const monthNavRef = useRef<HTMLDivElement>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthNavRef.current && !monthNavRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
    };
    if (showMonthDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMonthDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    if (showAccountMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAccountMenu]);

  // App state
  const createDefaultData = (): AppData => {
    const initData: AppData = {
      profile_name: "Mặc định",
      year: new Date().getFullYear(),
      lcb: 0,
      dependents: 0,
      months: {},
      settings: { ...DEFAULT_SETTINGS },
      lastUpdated: 0
    };
    for (let m = 1; m <= 12; m++) {
      initData.months[m] = { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
    }
    return initData;
  };

  // Migration: reset index 3 (old late/early data) to 0 for all existing OT entries
  const migrateOldLateData = (appData: AppData): AppData => {
    const migrated = { ...appData, months: { ...appData.months } };
    for (const monthKey of Object.keys(migrated.months)) {
      const monthData = migrated.months[monthKey];
      if (monthData?.ot) {
        const newOt = { ...monthData.ot };
        for (const dateKey of Object.keys(newOt)) {
          const arr = newOt[dateKey];
          if (arr && arr.length >= 4 && arr[3] !== 0) {
            newOt[dateKey] = [arr[0] || 0, arr[1] || 0, arr[2] || 0, 0];
          }
        }
        migrated.months[monthKey] = { ...monthData, ot: newOt };
      }
    }
    return migrated;
  };

  const [user, setUser] = useState<User | null>(null);
  const [guestName, setGuestName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('salary_guest_name') || '';
    }
    return '';
  });
  const [guestInputName, setGuestInputName] = useState('');
  const [guestPassphrase, setGuestPassphrase] = useState('');
  const [authLoading, setAuthLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('has_firebase_session') === '1';
    }
    return true;
  });
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const isLoginPage = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('login') === '1';
  const loginPageUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?login=1`
    : '/?login=1';
  const openLoginPage = () => {
    if (typeof window !== 'undefined') {
      window.location.href = loginPageUrl;
    }
  };
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const [data, setData] = useState<AppData>(createDefaultData());

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [syncCode, setSyncCode] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle', message: '' });
  const [autoSyncCode, setAutoSyncCode] = useState('');
  const isUserInputRef = useRef(false);
  const [accountHydrated, setAccountHydrated] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSyncModal) setShowSyncModal(false);
        if (showSettingsModal) setShowSettingsModal(false);
        if (showAccountMenu) setShowAccountMenu(false);
        if (showPasswordForm) setShowPasswordForm(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showSyncModal, showSettingsModal, showAccountMenu, showPasswordForm]);

  useEffect(() => {
    const forceBlur = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') forceBlur();
    };
    window.addEventListener('beforeunload', forceBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', forceBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = watchAuthState((nextUser) => {
      if (nextUser) {
        localStorage.setItem('has_firebase_session', '1');
      } else {
        localStorage.removeItem('has_firebase_session');
      }
      setUser(nextUser);
      setProfileDisplayName(nextUser?.displayName || '');
      setAuthLoading(false);
    });
    return () => {
      unsubscribe.then((unsub) => {
        if (unsub) unsub();
      });
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadAccountData = async () => {
      // Reset hydration flag at start of load
      setAccountHydrated(false);

      const saved = localStorage.getItem(storageDataKey(user.uid));
      let localData = createDefaultData();
      let hasSavedLocalData = false;
      if (saved) {
        try {
          const parsedData: unknown = JSON.parse(saved);
          if (isStoredAppData(parsedData)) {
            localData = parsedData;
            hasSavedLocalData = true;
          }
        } catch {
          localData = createDefaultData();
        }
      }

      try {
        setSyncStatus({ state: 'syncing', message: 'Đang tải dữ liệu tài khoản...' });
        const cloudData = await syncAccountFromCloud(user.uid);
        if (cloudData) {
          const cloudTime = Number(cloudData.lastUpdated) || 0;
          const localTime = Number(localData.lastUpdated) || 0;

          if (hasSavedLocalData && hasMeaningfulData(localData) && cloudTime > 0 && localTime > cloudTime) {
            setData(migrateOldLateData(localData));
            setSyncStatus({ state: 'syncing', message: '⏳ Dữ liệu trên máy mới hơn, đang đồng bộ lên Cloud...' });
            const wasUploaded = await syncAccountToCloud(user.uid, localData);
            setSyncStatus({
              state: 'success',
              message: wasUploaded
                ? '✅ Đã đồng bộ dữ liệu máy này lên Cloud.'
                : '✅ Cloud có dữ liệu mới hơn, giữ nguyên dữ liệu Cloud.'
            });
          } else {
            const cloudAccountData = cloudData as AppData;
            setData(migrateOldLateData(cloudAccountData));
            localStorage.setItem(storageDataKey(user.uid), JSON.stringify(cloudAccountData));
            setSyncStatus({ state: 'success', message: '✅ Đã đồng bộ dữ liệu theo tài khoản.' });
          }
        } else {
          setData(migrateOldLateData(localData));
          await syncAccountToCloud(user.uid, localData);
          setSyncStatus({ state: 'success', message: '✅ Đã tạo dữ liệu Cloud cho tài khoản.' });
        }
      } catch (e: unknown) {
        console.error('Account sync load error:', e);
        setData(migrateOldLateData(localData));
        setSyncStatus({ state: 'error', message: '❌ Không tải được dữ liệu tài khoản, đang dùng dữ liệu máy này.' });
      } finally {
        setAccountHydrated(true);
      }
    };

    void loadAccountData();

    // Load saved sync code
    const savedSyncCode = localStorage.getItem(storageSyncKey(user.uid)) || '';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncCode(savedSyncCode);
     
    setAutoSyncCode(savedSyncCode);
  }, [user]);

  useEffect(() => {
    if (user || !guestName) return;

    const loadGuestData = () => {
      const guestSyncCode = localStorage.getItem(storageSyncKey(null));
      if (guestSyncCode) {
        setAutoSyncCode(guestSyncCode);
      }

      const saved = localStorage.getItem(storageDataKey(null));
      if (saved) {
        try {
          const parsedData: unknown = JSON.parse(saved);
          if (isStoredAppData(parsedData)) {
            setData(migrateOldLateData(parsedData));
            return;
          }
        } catch {
          // fallthrough to default
        }
      }
      setData(createDefaultData());
    };

    loadGuestData();
  }, [guestName, user]);

  useEffect(() => {
    if (!user || !accountHydrated) return;
    localStorage.setItem(storageDataKey(user.uid), JSON.stringify(data));

    // Auto-sync to cloud after local changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ...' });

    const timer = setTimeout(async () => {
      try {
        const wasUploaded = await syncAccountToCloud(user.uid, data);
        setSyncStatus({
          state: 'success',
          message: wasUploaded
            ? '✅ Đã tự động đồng bộ theo tài khoản.'
            : '✅ Cloud có dữ liệu mới hơn, giữ nguyên dữ liệu Cloud.'
        });
      } catch (e) {
        console.error('Account auto sync error:', e);
        setSyncStatus({ state: 'error', message: '❌ Tự động đồng bộ tài khoản thất bại.' });
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [accountHydrated, data, user]);

  useEffect(() => {
    if (!autoSyncCode.trim() || !isUserInputRef.current) return;

    setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });

    const timer = setTimeout(async () => {
      try {
        await syncToCloud(autoSyncCode, data, user?.uid);
        setSyncStatus({ state: 'success', message: '✅ Đã tự động đồng bộ lên Cloud.' });
        isUserInputRef.current = false;
      } catch (e: unknown) {
        console.error('Auto sync error:', e);
        setSyncStatus({ state: 'error', message: '❌ Tự động đồng bộ thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định') });
        isUserInputRef.current = false;
      }

    }, 500);

    return () => clearTimeout(timer);
  }, [data, autoSyncCode, user?.uid]);

  const updateData = (updates: Partial<AppData>) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
    setData(prev => ({ ...prev, ...updates, lastUpdated: Date.now() }));
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
    setData(prev => ({
      ...prev,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(prev.settings || {}),
        ...updates
      },
      lastUpdated: Date.now()
    }));
  };

  const updateMonthOT = (month: number, dateIso: string, otIndex: number, value: string) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
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
        },
        lastUpdated: Date.now()
      };
    });
  };

  const updateMonthOther = (month: number, value: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [] };
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, other: value }
        },
        lastUpdated: Date.now()
      };
    });
  };

  const updateMonthBonusAmount = (month: number, bonusIndex: number, amount: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
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
        },
        lastUpdated: Date.now()
      };
    });
  };

  const addMonthBonus = (month: number) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
      const currentBonuses = monthData.bonuses || [];
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, bonuses: [...currentBonuses, { name: '', amount: 0 }] }
        },
        lastUpdated: Date.now()
      };
    });
  };

  const updateMonthBonuses = (month: number, bonuses: Allowance[]) => {
    isUserInputRef.current = true;
    if (autoSyncCode.trim()) setSyncStatus({ state: 'syncing', message: 'Đang tự động đồng bộ lên Cloud...' });
    setData(prev => {
      const monthData = prev.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };
      return {
        ...prev,
        months: {
          ...prev.months,
          [month]: { ...monthData, bonuses }
        },
        lastUpdated: Date.now()
      };
    });
  };

  const handleUpload = async () => {
    if (!syncCode.trim()) {
      setSyncStatus({ state: 'error', message: '❌ Vui lòng nhập Mã đồng bộ trước khi tải lên.' });
      return;
    }

    const confirmed = window.confirm(
      'Tải lên sẽ ghi đè dữ liệu hiện tại trên Cloud cho mã đồng bộ này. Bạn có chắc muốn tiếp tục?'
    );
    if (!confirmed) {
      return;
    }

    try {
      setSyncStatus({ state: 'syncing', message: 'Đang tải lên...' });
      if (user) localStorage.setItem(storageSyncKey(user.uid), syncCode);
      await syncToCloud(syncCode, data, user?.uid);
      setAutoSyncCode(syncCode.trim());
      setSyncStatus({ state: 'success', message: '✅ Đã lưu lên Cloud thành công! Tự động đồng bộ đã bật.' });
    } catch (e: unknown) {
      setSyncStatus({ state: 'error', message: '❌ Lỗi: ' + (e instanceof Error ? e.message : 'Lỗi không xác định') });
    }
  };

  const handleDownload = async () => {
    if (!syncCode.trim()) {
      setSyncStatus({ state: 'error', message: '❌ Vui lòng nhập Mã đồng bộ trước khi tải về.' });
      return;
    }

    try {
      setSyncStatus({ state: 'syncing', message: 'Đang tải về...' });
      if (user) localStorage.setItem(storageSyncKey(user.uid), syncCode);
      const cloudData = await syncFromCloud(syncCode);
      if (cloudData) {
        setData(migrateOldLateData(cloudData));
        setAutoSyncCode(syncCode.trim());
        setSyncStatus({ state: 'success', message: '✅ Tải về thành công! Tự động đồng bộ đã bật.' });
      }
    } catch (e: unknown) {
      setSyncStatus({ state: 'error', message: '❌ Lỗi: ' + (e instanceof Error ? e.message : 'Lỗi không xác định') });
    }
  };

  const handleGuestEnter = async () => {
    const name = guestInputName.trim();
    const passphrase = guestPassphrase.trim();

    if (!name) {
      setSyncStatus({ state: 'error', message: '❌ Vui lòng nhập tên của bạn.' });
      return;
    }

    if (!isValidPassphrase(passphrase)) {
      setSyncStatus({ state: 'error', message: '❌ Mã bảo mật phải có ít nhất 6 ký tự.' });
      return;
    }

    try {
      setSyncStatus({ state: 'syncing', message: 'Đang tải dữ liệu của bạn...' });
      const hashedCode = await hashGuestCode(name, passphrase);

      localStorage.setItem('salary_guest_name', name);
      localStorage.setItem(storageSyncKey(null), hashedCode);

      setGuestName(name);
      setAutoSyncCode(hashedCode);
      setSyncCode(hashedCode);

      const cloudData = await syncFromCloud(hashedCode);
      if (cloudData) {
        setData(migrateOldLateData(cloudData as AppData));
        setSyncStatus({ state: 'success', message: '✅ Đã tải dữ liệu từ Cloud.' });
      } else {
        setSyncStatus({ state: 'success', message: '✅ Bắt đầu với dữ liệu mới.' });
      }
    } catch (error) {
      console.error('Guest enter error:', error);
      setSyncStatus({ state: 'error', message: '❌ Không thể tải dữ liệu. Vui lòng thử lại.' });
    }
  };

  const handleAuthSubmit = async () => {
    setAuthError('');
    setAuthSuccess('');

    if (!authIdentifier.trim()) {
      setAuthError('Vui lòng nhập email hợp lệ.');
      return;
    }
    if (authMode !== 'forgot' && authPassword.length < 6) {
      setAuthError('Vui lòng nhập mật khẩu từ 6 ký tự.');
      return;
    }

    try {
      if (authMode === 'register') {
        await registerWithEmail(authIdentifier.trim(), authPassword, authDisplayName.trim() || undefined);
        await sendVerifyEmail();
        setAuthSuccess('Đã tạo tài khoản. Vui lòng kiểm tra email để xác thực.');
      } else if (authMode === 'forgot') {
        await resetPasswordByEmail(authIdentifier.trim());
        setAuthSuccess('Đã gửi email đặt lại mật khẩu.');
      } else {
        await loginWithEmail(authIdentifier.trim(), authPassword);
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
      setSyncStatus({ state: 'success', message: '✅ Đã cập nhật tên hiển thị.' });
    } catch (e: unknown) {
      setSyncStatus({ state: 'error', message: '❌ Không cập nhật được tên hiển thị: ' + (e instanceof Error ? e.message : 'Lỗi không xác định') });
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordCurrent) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (passwordNew.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError('Mật khẩu mới và xác nhận không khớp.');
      return;
    }

    try {
      await updateUserPassword(passwordCurrent, passwordNew);
      setPasswordSuccess('✅ Đã đổi mật khẩu thành công.');
      setPasswordCurrent('');
      setPasswordNew('');
      setPasswordConfirm('');
    } catch (e: unknown) {
      setPasswordError((e instanceof Error ? e.message : '') || 'Không đổi mật khẩu được.');
    }
  };

  // Render Month Tab
  const renderMonthTab = (month: number) => {
    const dates = datesOfMonth(data.year, month);
    const mData = data.months[month] || { other: 0, ot: {}, bonusAmounts: [], bonuses: [] };

    let h150 = 0, h200 = 0, h300 = 0;
    let hBonus150 = 0, hBonus200 = 0, hBonus300 = 0;
    const BONUS_THRESHOLD = 2; // Giờ OT vượt quá 2h sẽ tính bonus
    // Only sum OT for dates that are actually in this month's range
    dates.forEach(d => {
      const dateIso = getLocalDateStr(d);
      const ot = mData.ot[dateIso] || [0, 0, 0, 0];

      // Normal OT: capped at threshold per column
      h150 += Math.min(ot[0] || 0, BONUS_THRESHOLD);
      h200 += Math.min(ot[1] || 0, BONUS_THRESHOLD);
      h300 += Math.min(ot[2] || 0, BONUS_THRESHOLD);

      // Bonus OT: excess beyond threshold, auto-classified by day type rate
      hBonus150 += Math.max((ot[0] || 0) - BONUS_THRESHOLD, 0);
      hBonus200 += Math.max((ot[1] || 0) - BONUS_THRESHOLD, 0);
      hBonus300 += Math.max((ot[2] || 0) - BONUS_THRESHOLD, 0);
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

    const s = calc(data.lcb, h150, h200, h300, mData.other, hBonus150, hBonus200, hBonus300, allowanceSum, bonusSum, month, data.dependents, customConfig);
    const totalDeductions = s.bhxh + s.bhyt + s.bhtn + s.cd + deductionSum + s.pit;
    const todayIso = getLocalDateStr(new Date());
    // Removed per UI cleanup: no per-month summary needed here
    // Cleaned up month summary variables

    return (
      <div className="month-view">
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
                  <th>Bonus OT</th>
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
                  if (isToday) rowClass = "cur";
                  else if (isTetDay) rowClass = "tet";
                  else if (isHol) rowClass = "hol";
                  else if (lunarHolName) rowClass = "lunar-hol";
                  else if (isWe) rowClass = "we";

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
                      <td className="bonus-cell">
                        {(() => {
                          const rowBonus = Math.max((ot[0] || 0) - 2, 0) + Math.max((ot[1] || 0) - 2, 0) + Math.max((ot[2] || 0) - 2, 0);
                          return rowBonus > 0 ? Math.round(rowBonus * 100) / 100 : '';
                        })()}
                      </td>
                    </tr>
                  )
                })}
                <tr className="table-footer-row">
                  <td colSpan={2}>Giờ</td>
                  <td>{h150}h</td>
                  <td>{h200}h</td>
                  <td>{h300}h</td>
                  <td>{Math.round((hBonus150 + hBonus200 + hBonus300) * 100) / 100}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="breakdown-container">
            <div className="breakdown-cards">
              <div className="breakdown-card allowances">
                <h3><Plus size={14} strokeWidth={2.5} /> TRỢ CẤP</h3>
                <div className="bd-row"><span>Thưởng hè:</span> <span>{fmt(s.the)} VNĐ</span></div>
                {currentSettings.allowances.map((al, idx) => (
                  <div className="bd-row" key={idx}><span>{al.name}:</span> <span>{fmt(al.amount)} VNĐ</span></div>
                ))}
              </div>

              <div className="breakdown-card additions">
                <h3><Plus size={14} strokeWidth={2.5} /> TĂNG CA/THƯỞNG</h3>
                <div className="bd-row"><span>Tiền OT:</span> <span>{fmt(s.ovt)} VNĐ</span></div>
                {s.bonus_ot_pay > 0 && <div className="bd-row"><span>Bonus OT:</span> <span>{fmt(s.bonus_ot_pay)} VNĐ</span></div>}
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
                        newBns[idx] = { ...newBns[idx], amount: val };
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
                <h3><Minus size={14} strokeWidth={2.5} /> KHẤU TRỪ</h3>
                <div className="bd-row"><span>BHXH ({currentSettings.bhxh_pct}%):</span> <span>{fmt(s.bhxh)} VNĐ</span></div>
                <div className="bd-row"><span>BHYT ({currentSettings.bhyt_pct}%):</span> <span>{fmt(s.bhyt)} VNĐ</span></div>
                <div className="bd-row"><span>BHTN ({currentSettings.bhtn_pct}%):</span> <span>{fmt(s.bhtn)} VNĐ</span></div>
                <div className="bd-row"><span>Công đoàn:</span> <span>{fmt(s.cd)} VNĐ</span></div>
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

            {/* A small celebratory pause below the net salary */}
            <div className="ambient-card" aria-label="Lời nhắn chúc mừng ngày công">
              <div className="ambient-orb ambient-orb-1" />
              <div className="ambient-orb ambient-orb-2" />
              <div className="ambient-orb ambient-orb-3" />
              <div className="ambient-grid" />
              <div className="ambient-confetti" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <div className="ambient-coins" aria-hidden="true">
                <span>₫</span><span>₫</span><span>₫</span>
              </div>
              <div className="ambient-message">
                <span className="ambient-message-icon" aria-hidden="true">✦</span>
                <p className="ambient-kicker">HOÀN THÀNH THÁNG NÀY</p>
                <strong>Mỗi ngày chăm chỉ đều đáng tự hào!</strong>
                <p>Chúc bạn một tháng làm việc thật nhiều niềm vui.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) {
    return <div className="app-container"><div className="modal-content"><h2>Đang tải tài khoản...</h2></div></div>;
  }

  if (!user && !guestName) {
    if (isLoginPage) {
      return (
        <div className="app-container auth-only-page">
          <div className="auth-panel auth-panel-single">
            <div className="auth-card">
              <h2>{authMode === 'login' ? <><Lock size={18} /> Đăng nhập</> : authMode === 'register' ? <><UserIcon size={18} /> Tạo tài khoản</> : <><KeyRound size={18} /> Quên mật khẩu</>}</h2>
              <p className="modal-desc">Đăng nhập để đồng bộ dữ liệu và tiếp tục tính lương.</p>
              {authMode === 'register' && (
                <div className="form-group">
                  <label>Tên hiển thị</label>
                  <input
                    type="text"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                    placeholder="Tên của bạn"
                    aria-label="Tên hiển thị"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={authIdentifier}
                  onChange={(e) => setAuthIdentifier(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                  placeholder="you@example.com"
                  aria-label="Email"
                />
                <small>Nhập email để đăng nhập hoặc nhận lại mật khẩu.</small>
              </div>
              {authMode !== 'forgot' && (
                <div className="form-group">
                  <label>Mật khẩu</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAuthSubmit(); }}
                    placeholder="Mật khẩu"
                    aria-label="Mật khẩu"
                  />
                </div>
              )}
              {authError && <div className="sync-warning"><XCircle size={14} /> {authError}</div>}
              {authSuccess && <div className="sync-status"><CheckCircle size={14} /> {authSuccess}</div>}
              <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <button className="btn btn-primary" onClick={handleAuthSubmit}>
                  {authMode === 'login'
                    ? 'Đăng nhập'
                    : authMode === 'register'
                      ? 'Tạo tài khoản'
                      : 'Gửi email đặt lại'}
                </button>
                <button className="btn btn-secondary" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); setAuthSuccess(''); }}>
                  {authMode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
                </button>
                <button className="btn btn-danger" type="button" onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccess(''); }}>
                  Quên mật khẩu
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="app-container landing-page">
        <div className="landing-hero">
          <span className="eyebrow">Ứng dụng quản lý lương cá nhân</span>
          <h1>Bảng chấm công</h1>
          <p className="landing-description">
            Tính toán lương, OT, tiền thưởng và các khoản khấu trừ BHXH/BHYT/BHTN/Thuế TNCN một cách nhanh chóng.
            Dữ liệu được đồng bộ an toàn qua Firebase và sử dụng được trên nhiều thiết bị.
          </p>
          <div className="landing-features">
            <div>• Tính lương theo tháng và hiển thị kết quả rõ ràng.</div>
            <div>• Quản lý tăng ca, trợ cấp và khấu trừ tự động.</div>
            <div>• Đồng bộ dữ liệu qua tài khoản đăng nhập.</div>
          </div>

          <div className="hero-card-container" style={{ display: 'flex', gap: '24px', marginTop: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Primary Card - Trải nghiệm ngay */}
            <div className="hero-card premium-card" style={{ flex: '1 1 320px', maxWidth: '400px', position: 'relative', overflow: 'hidden', padding: '36px 32px' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #4ade80, #3b82f6)' }}></div>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '12px', background: 'linear-gradient(to right, #4ade80, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Trải nghiệm ngay
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.6 }}>
                Không cần tạo tài khoản. Nhập tên và mã bảo mật (tối thiểu 6 ký tự) để bắt đầu và đồng bộ an toàn.
              </p>
              <div className="hero-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Nhập tên của bạn..."
                  value={guestInputName}
                  onChange={e => setGuestInputName(e.target.value)}
                  aria-label="Tên người dùng"
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: '12px',
                    border: '1px solid rgba(74, 222, 128, 0.3)', background: 'rgba(15, 23, 42, 0.6)',
                    color: '#fff', fontSize: '1rem', outline: 'none', transition: 'all 0.3s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#4ade80'}
                  onBlur={e => e.target.style.borderColor = 'rgba(74, 222, 128, 0.3)'}
                />
                <input
                  type="password"
                  placeholder="Mã bảo mật (tối thiểu 6 ký tự)..."
                  value={guestPassphrase}
                  onChange={e => setGuestPassphrase(e.target.value)}
                  aria-label="Mã bảo mật"
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: '12px',
                    border: '1px solid rgba(74, 222, 128, 0.3)', background: 'rgba(15, 23, 42, 0.6)',
                    color: '#fff', fontSize: '1rem', outline: 'none', transition: 'all 0.3s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#4ade80'}
                  onBlur={e => e.target.style.borderColor = 'rgba(74, 222, 128, 0.3)'}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void handleGuestEnter();
                    }
                  }}
                />
                <button
                  className="btn"
                  style={{
                    width: '100%', padding: '14px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff',
                    fontSize: '1.05rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.25)', transition: 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'none'}
                  onClick={() => { void handleGuestEnter(); }}
                >
                  Vào App Ngay
                </button>
              </div>
            </div>

            {/* Secondary Card - Đăng nhập đầy đủ */}
            <div className="hero-card standard-card" style={{ flex: '1 1 320px', maxWidth: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '36px 32px' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', color: '#e2e8f0' }}>Đăng nhập tài khoản</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.6 }}>
                Lưu trữ dữ liệu an toàn lâu dài với tài khoản Email. Bảo mật tuyệt đối.
              </p>
              <div className="hero-buttons">
                <button 
                  className="btn" 
                  onClick={openLoginPage}
                  style={{ 
                    width: '100%', padding: '14px', borderRadius: '12px', 
                    background: 'rgba(255, 255, 255, 0.08)', color: '#fff', 
                    fontSize: '1rem', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.transform = 'none'; }}
                >
                  Đăng nhập / Đăng ký
                </button>
              </div>
            </div>
          </div>

          <div className="landing-links">
            <a href="/privacy.html">Chính sách quyền riêng tư</a>
            <a href="/terms.html">Điều khoản dịch vụ</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <div className="header-top">
            <h1 className="header-title"><TrendingUp size={20} /> Bảng chấm công</h1>
            <div className="header-month-nav" ref={monthNavRef}>
              <button className="month-nav prev" onClick={() => { setActiveTab(activeTab === 1 ? 12 : activeTab - 1); setShowMonthDropdown(false); }} aria-label="Previous month">
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <button 
                className={`month-pill ${showMonthDropdown ? 'active' : ''}`}
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                aria-label="Select month"
              >
                Tháng {activeTab}
                <ChevronDown size={12} strokeWidth={3} style={{ marginLeft: '4px', transition: 'transform 0.2s ease', transform: showMonthDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
              <button className="month-nav next" onClick={() => { setActiveTab(activeTab === 12 ? 1 : activeTab + 1); setShowMonthDropdown(false); }} aria-label="Next month">
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>

              {showMonthDropdown && (
                <div className="month-dropdown-menu">
                  <div className="month-dropdown-grid">
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      return (
                        <button
                          key={m}
                          className={`month-dropdown-item ${activeTab === m ? 'selected' : ''}`}
                          onClick={() => {
                            setActiveTab(m);
                            setShowMonthDropdown(false);
                          }}
                        >
                          Tháng {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="header-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className={`sync-btn ${syncStatus.state === 'syncing' ? 'syncing' : ''} ${syncStatus.state === 'error' ? 'error' : ''}`} onClick={() => setShowSyncModal(true)} title={syncStatus.message || 'Đồng bộ'}>
              {syncStatus.state === 'error' ? <X size={14} aria-hidden="true" /> : <Cloud size={14} aria-hidden="true" />}
              Đồng bộ
            </button>
          </div>
          <Clock />
          <div className="header-data-group">
            <div className="input-group">
              <label>Năm:</label>
              <input
                type="text"
                inputMode="numeric"
                value={data.year}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateData({ year: isNaN(val) ? new Date().getFullYear() : val });
                }}
                style={{ width: '75px', textAlign: 'center' }}
              />
            </div>
            <div className="input-group">
              <label>NPT:</label>
              <input
                type="text"
                inputMode="numeric"
                value={data.dependents}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateData({ dependents: isNaN(val) ? 0 : val });
                }}
                style={{ width: '50px', textAlign: 'center' }}
              />
            </div>
            <button className="icon-btn" title="Cài đặt" onClick={() => setShowSettingsModal(true)}><Settings size={16} /></button>
          </div>

          {/* Account button - replaces logout */}
          <div className="account-fab-wrapper account-in-header" ref={accountMenuRef}>
            <button
              className="account-fab"
              onClick={() => setShowAccountMenu(!showAccountMenu)}
              title={user?.email || guestName || 'Tài khoản'}
            >
              <UserIcon size={14} />
              <span>{user?.displayName || user?.email?.split('@')[0] || guestName || 'Tài khoản'}</span>
              <ChevronDown size={11} strokeWidth={3} style={{ transition: 'transform 0.2s ease', transform: showAccountMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {showAccountMenu && (
              <div className="account-menu">
                <div className="account-menu-header">
                  <div className="account-menu-avatar"><UserIcon size={18} /></div>
                  <div>
                    <div className="account-menu-name">{user?.displayName || guestName || 'Người dùng'}</div>
                    <div className="account-menu-email">{user?.email || 'Tài khoản tạm'}</div>
                  </div>
                </div>

                {user && (
                  <>
                    <div className="account-menu-section">
                      <label className="account-menu-label"><UserIcon size={11} /> Đổi tên hiển thị</label>
                      <div className="account-menu-row">
                        <input
                          type="text"
                          placeholder="Tên hiển thị mới"
                          value={profileDisplayName}
                          onChange={e => setProfileDisplayName(e.target.value)}
                          className="account-menu-input"
                          aria-label="Tên hiển thị mới"
                        />
                        <button className="account-menu-btn primary" onClick={() => { void handleSaveDisplayName(); }}>Lưu</button>
                      </div>
                    </div>

                    <div className="account-menu-section">
                      <label className="account-menu-label"><KeyRound size={11} /> Đổi mật khẩu</label>
                      {!showPasswordForm ? (
                        <button className="account-menu-btn secondary" onClick={() => setShowPasswordForm(true)}>Đổi mật khẩu</button>
                      ) : (
                        <>
                          <input
                            type="password"
                            placeholder="Mật khẩu hiện tại"
                            value={passwordCurrent}
                            onChange={e => setPasswordCurrent(e.target.value)}
                            className="account-menu-input"
                            style={{ marginBottom: '6px' }}
                            aria-label="Mật khẩu hiện tại"
                          />
                          <input
                            type="password"
                            placeholder="Mật khẩu mới"
                            value={passwordNew}
                            onChange={e => setPasswordNew(e.target.value)}
                            className="account-menu-input"
                            style={{ marginBottom: '6px' }}
                            aria-label="Mật khẩu mới"
                          />
                          <input
                            type="password"
                            placeholder="Xác nhận mật khẩu mới"
                            value={passwordConfirm}
                            onChange={e => setPasswordConfirm(e.target.value)}
                            className="account-menu-input"
                            style={{ marginBottom: '6px' }}
                            aria-label="Xác nhận mật khẩu mới"
                          />
                          {passwordError && <div className="account-menu-error" style={{ marginBottom: '6px' }}><XCircle size={11} /> {passwordError}</div>}
                          {passwordSuccess && <div className="account-menu-success" style={{ marginBottom: '6px' }}><CheckCircle size={11} /> {passwordSuccess}</div>}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                            <button className="account-menu-btn secondary" style={{ flex: 1, margin: 0 }} onClick={() => { void handleChangePassword(); }}>Lưu</button>
                            <button className="account-menu-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={() => { setShowPasswordForm(false); setPasswordError(''); setPasswordSuccess(''); }}>Hủy</button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

                <div className="account-menu-divider" />
                <button className="account-menu-logout" onClick={() => { 
                  if (user) {
                    void logoutUser(); 
                  } else {
                    localStorage.removeItem('salary_guest_name');
                    setGuestName('');
                  }
                  setShowAccountMenu(false); 
                }}>
                  <LogOut size={13} /> {user ? 'Đăng xuất' : 'Thoát'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      

      <div className="tab-content">
        {renderMonthTab(activeTab)}
      </div>

      {showSyncModal && (
        <div className="modal-overlay">
          <div className="modal-content" role="dialog" aria-labelledby="sync-modal-title" aria-modal="true">
            <h2 id="sync-modal-title"><Cloud size={18} /> Đồng bộ Cloud</h2>
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
              <AlertTriangle size={14} /> Lưu ý: "Tải lên" sẽ ghi đè dữ liệu hiện tại trên Cloud của mã này.
              Nếu bạn chỉ muốn lấy dữ liệu từ thiết bị khác, hãy dùng "Tải về".
            </div>

            {syncStatus.message && (
              <div className="sync-status">
                {syncStatus.state === 'syncing' ? (
                  <div className="sync-lottie-wrapper">
                    <SyncLoaderIcon size={44} className="sync-loader-icon" />
                  </div>
                ) : syncStatus.state === 'success' ? (
                  <div className="sync-success-icon"><CheckCircle size={22} color="#4ade80" /></div>
                ) : syncStatus.state === 'error' ? (
                  <div>{syncStatus.message}</div>
                ) : null}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!syncCode.trim()}
              >
                <Upload size={14} /> Tải lên (ghi đè)
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
                disabled={!syncCode.trim()}
              >
                <Download size={14} /> Tải về
              </button>
              <button className="btn btn-danger" onClick={() => setShowSyncModal(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}


      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content settings-modal" role="dialog" aria-labelledby="settings-modal-title" aria-modal="true">
            <h2 id="settings-modal-title"><Settings size={18} /> Cài đặt</h2>

            <div className="settings-grid">
              {/* CỘT TRÁI: Lương & Khấu trừ */}
              <div className="settings-col">
                <h3 className="settings-section-title"><DollarSign size={14} /> Lương & Khấu trừ</h3>

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
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSettings({ bhxh_pct: isNaN(val) ? 8 : val });
                      }}
                    />
                  </div>
                  <div className="form-group compact">
                    <label>BHYT (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={data.settings?.bhyt_pct ?? 1.5}
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSettings({ bhyt_pct: isNaN(val) ? 1.5 : val });
                      }}
                    />
                  </div>
                  <div className="form-group compact">
                    <label>BHTN (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={data.settings?.bhtn_pct ?? 1}
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSettings({ bhtn_pct: isNaN(val) ? 1 : val });
                      }}
                    />
                  </div>
                </div>

                <h3 className="settings-section-title"><Minus size={14} /> Khoản trừ khác</h3>
                <div className="settings-list">
                  {(data.settings?.deductions || []).map((ded, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên khoản trừ"
                        value={ded.name}
                        onChange={e => {
                          const newDeds = [...(data.settings?.deductions || [])];
                          newDeds[idx] = { ...newDeds[idx], name: e.target.value };
                          updateSettings({ deductions: newDeds });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={ded.amount}
                        onChange={val => {
                          const newDeds = [...(data.settings?.deductions || [])];
                          newDeds[idx] = { ...newDeds[idx], amount: val };
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

                <h3 className="settings-section-title"><Plus size={14} /> Trợ cấp</h3>
                <div className="settings-list">
                  {(data.settings?.allowances || []).map((al, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên trợ cấp"
                        value={al.name}
                        onChange={e => {
                          const newAls = [...(data.settings?.allowances || [])];
                          newAls[idx] = { ...newAls[idx], name: e.target.value };
                          updateSettings({ allowances: newAls });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={al.amount}
                        onChange={val => {
                          const newAls = [...(data.settings?.allowances || [])];
                          newAls[idx] = { ...newAls[idx], amount: val };
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
                <h3 className="settings-section-title"><Gift size={14} /> Thưởng cố định</h3>
                <div className="settings-list">
                  {(data.settings?.bonuses || []).map((bn, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên thưởng"
                        value={bn.name}
                        onChange={e => {
                          const newBns = [...(data.settings?.bonuses || [])];
                          newBns[idx] = { ...newBns[idx], name: e.target.value };
                          updateSettings({ bonuses: newBns });
                        }}
                        style={{ flex: 2 }}
                      />
                      <EditableCurrency
                        value={bn.amount}
                        onChange={val => {
                          const newBns = [...(data.settings?.bonuses || [])];
                          newBns[idx] = { ...newBns[idx], amount: val };
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

                <h3 className="settings-section-title"><CalendarDays size={14} /> Thưởng tháng {activeTab}</h3>
                <div className="settings-list">
                  {(data.months[activeTab]?.bonuses || []).map((bn, idx) => (
                    <div key={idx} className="settings-item-row">
                      <input
                        type="text"
                        placeholder="Tên thưởng tháng"
                        value={bn.name}
                        onChange={e => {
                          const newBns = [...(data.months[activeTab]?.bonuses || [])];
                          newBns[idx] = { ...newBns[idx], name: e.target.value };
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
