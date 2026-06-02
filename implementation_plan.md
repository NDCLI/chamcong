# Kế hoạch: Thêm tính năng Đăng ký bằng Số điện thoại

## Tổng quan

Bổ sung phương thức đăng ký/đăng nhập bằng số điện thoại vào hệ thống authentication hiện tại, song song với phương thức Email/Password đang có. Sử dụng Firebase Phone Authentication với OTP verification.

## User Review Required

> [!IMPORTANT]
> **Quyết định thiết kế cần xác nhận:**
> 
> 1. **Phương thức hiển thị UI**: Bạn muốn giao diện đăng ký/đăng nhập như thế nào?
>    - **Option A**: Tab chuyển đổi giữa "Email" và "Số điện thoại" 
>    - **Option B**: Một form thống nhất cho cả email và phone (auto-detect)
>    - **Option C**: Nút riêng biệt "Đăng nhập bằng SĐT"
> 
> 2. **Liên kết tài khoản**: Nếu người dùng đã có tài khoản email, có cho phép liên kết thêm số điện thoại không?
>    - Cho phép → Cần thêm tính năng "Thêm SĐT" trong Account Settings
>    - Không → Mỗi phương thức là tài khoản độc lập
> 
> 3. **Định dạng số điện thoại**: 
>    - Mặc định sử dụng mã quốc gia +84 (Việt Nam)?
>    - Có cho phép chọn quốc gia khác không?

> [!WARNING]
> **Yêu cầu Firebase Console:**
> - Cần bật "Phone Authentication" trong Firebase Console
> - Cần add domain hiện tại vào Authorized domains
> - Có thể cần cấu hình billing (Firebase có giới hạn free tier cho Phone Auth)

## Open Questions

1. **reCAPTCHA v2 hay invisible reCAPTCHA?** 
   - v2: Người dùng phải click "I'm not a robot"
   - invisible: Tự động verify, UX tốt hơn nhưng có thể cần verify thêm trong một số trường hợp

2. **Xử lý lỗi khi gửi OTP thất bại?**
   - Hiển thị lỗi ra sao? (toast, inline error)
   - Cho phép gửi lại sau bao lâu? (60 giây?)

3. **Profile name khi đăng ký bằng SĐT?**
   - Bắt buộc nhập tên hiển thị ngay khi đăng ký?
   - Hay cho phép bỏ qua và cập nhật sau?

4. **Testing trong development?**
   - Firebase cho phép thêm test phone numbers (không cần OTP thật)
   - Có muốn cấu hình test numbers không? (vd: +84123456789 với OTP: 123456)

## Proposed Changes

### 1. Firebase Configuration & Setup

#### [MODIFY] [firebaseSync.ts](file:///g:/Project/salary/src/firebaseSync.ts)

**Thêm Phone Authentication imports và functions:**

```typescript
import {
  // ... existing imports
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  type ConfirmationResult
} from 'firebase/auth';

// Tạo reCAPTCHA verifier (invisible hoặc visible)
export const setupRecaptcha = (elementId: string, invisible = true) => {
  return new RecaptchaVerifier(auth, elementId, {
    size: invisible ? 'invisible' : 'normal',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      throw new Error('reCAPTCHA đã hết hạn, vui lòng thử lại.');
    }
  });
};

// Gửi OTP đến số điện thoại
export const sendPhoneOTP = async (
  phoneNumber: string, 
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  // Validate phone format (must include country code)
  const formattedPhone = phoneNumber.startsWith('+') 
    ? phoneNumber 
    : `+84${phoneNumber.replace(/^0/, '')}`;
  
  return signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
};

// Xác thực OTP và đăng nhập
export const verifyPhoneOTP = async (
  confirmationResult: ConfirmationResult, 
  otpCode: string
) => {
  return confirmationResult.confirm(otpCode);
};

// Link số điện thoại vào tài khoản hiện tại (nếu đã đăng nhập bằng email)
export const linkPhoneToAccount = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
) => {
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  
  const formattedPhone = phoneNumber.startsWith('+') 
    ? phoneNumber 
    : `+84${phoneNumber.replace(/^0/, '')}`;
  
  const confirmationResult = await signInWithPhoneNumber(
    auth, 
    formattedPhone, 
    recaptchaVerifier
  );
  
  return confirmationResult;
};

export const confirmLinkPhone = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
) => {
  const credential = PhoneAuthProvider.credential(
    confirmationResult.verificationId, 
    otpCode
  );
  
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  return linkWithCredential(auth.currentUser, credential);
};
```

---

### 2. Frontend - App State Management

#### [MODIFY] [App.tsx](file:///g:/Project/salary/src/App.tsx#L236-L248)

**Thêm state cho Phone Authentication:**

```typescript
// Existing auth states...
const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email'); // NEW

// Phone-specific states
const [authPhone, setAuthPhone] = useState(''); // NEW
const [authOTP, setAuthOTP] = useState(''); // NEW
const [otpSent, setOtpSent] = useState(false); // NEW
const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null); // NEW
const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null); // NEW
const [otpResendTimer, setOtpResendTimer] = useState(0); // NEW - countdown timer
```

---

### 3. Frontend - Phone Authentication Logic

#### [MODIFY] [App.tsx](file:///g:/Project/salary/src/App.tsx#L522-L549)

**Sửa đổi `handleAuthSubmit` để xử lý cả Email và Phone:**

```typescript
const handleAuthSubmit = async () => {
  setAuthError('');
  setAuthSuccess('');
  
  // Email authentication (existing logic)
  if (authMethod === 'email') {
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
  }
  
  // Phone authentication (NEW)
  else if (authMethod === 'phone') {
    // Validate phone number
    if (!authPhone.trim() || authPhone.length < 9) {
      setAuthError('Vui lòng nhập số điện thoại hợp lệ (9-10 chữ số).');
      return;
    }
    
    try {
      // Step 1: Send OTP
      if (!otpSent) {
        // Setup reCAPTCHA if not already
        if (!recaptchaVerifier) {
          const verifier = setupRecaptcha('recaptcha-container', true);
          setRecaptchaVerifier(verifier);
        }
        
        const confirmation = await sendPhoneOTP(authPhone.trim(), recaptchaVerifier!);
        setConfirmationResult(confirmation);
        setOtpSent(true);
        setOtpResendTimer(60); // Start 60s countdown
        setAuthSuccess('Đã gửi mã OTP đến số điện thoại của bạn.');
      }
      // Step 2: Verify OTP
      else {
        if (!authOTP.trim() || authOTP.length !== 6) {
          setAuthError('Vui lòng nhập mã OTP 6 chữ số.');
          return;
        }
        
        if (!confirmationResult) {
          setAuthError('Lỗi xác thực, vui lòng thử lại.');
          return;
        }
        
        await verifyPhoneOTP(confirmationResult, authOTP.trim());
        setAuthSuccess('Đăng nhập thành công!');
        
        // Reset states
        setOtpSent(false);
        setAuthOTP('');
        setConfirmationResult(null);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Lỗi xác thực';
      setAuthError(errorMessage);
      
      // Reset on error
      if (otpSent) {
        setOtpSent(false);
        setConfirmationResult(null);
      }
    }
  }
};

// NEW: Resend OTP handler
const handleResendOTP = async () => {
  if (otpResendTimer > 0) return;
  
  try {
    setAuthError('');
    if (!recaptchaVerifier) {
      const verifier = setupRecaptcha('recaptcha-container', true);
      setRecaptchaVerifier(verifier);
    }
    
    const confirmation = await sendPhoneOTP(authPhone.trim(), recaptchaVerifier!);
    setConfirmationResult(confirmation);
    setOtpResendTimer(60);
    setAuthSuccess('Đã gửi lại mã OTP.');
  } catch (e: unknown) {
    setAuthError('Không thể gửi lại OTP: ' + (e instanceof Error ? e.message : ''));
  }
};

// NEW: Countdown timer effect
useEffect(() => {
  if (otpResendTimer > 0) {
    const timer = setTimeout(() => setOtpResendTimer(otpResendTimer - 1), 1000);
    return () => clearTimeout(timer);
  }
}, [otpResendTimer]);
```

---

### 4. Frontend - UI Components

#### [MODIFY] [App.tsx](file:///g:/Project/salary/src/App.tsx) - Auth Modal UI

**Cập nhật phần render modal authentication để hiển thị Phone option:**

Thêm UI mới vào modal đăng nhập/đăng ký hiện tại:

```tsx
{/* Auth Method Toggle (Email / Phone) - NEW */}
<div className="auth-method-toggle">
  <button
    className={authMethod === 'email' ? 'active' : ''}
    onClick={() => {
      setAuthMethod('email');
      setOtpSent(false);
      setAuthError('');
    }}
  >
    📧 Email
  </button>
  <button
    className={authMethod === 'phone' ? 'active' : ''}
    onClick={() => {
      setAuthMethod('phone');
      setOtpSent(false);
      setAuthError('');
    }}
  >
    📱 Số điện thoại
  </button>
</div>

{/* Email Form - Existing */}
{authMethod === 'email' && (
  <div className="auth-form-email">
    {/* ... existing email/password inputs ... */}
  </div>
)}

{/* Phone Form - NEW */}
{authMethod === 'phone' && (
  <div className="auth-form-phone">
    {!otpSent ? (
      <>
        {authMode === 'register' && (
          <input
            type="text"
            placeholder="Tên hiển thị (tuỳ chọn)"
            value={authDisplayName}
            onChange={(e) => setAuthDisplayName(e.target.value)}
          />
        )}
        <div className="phone-input-group">
          <span className="country-code">+84</span>
          <input
            type="tel"
            placeholder="Số điện thoại (vd: 901234567)"
            value={authPhone}
            onChange={(e) => setAuthPhone(e.target.value.replace(/\D/g, ''))}
            maxLength={10}
          />
        </div>
        <button onClick={handleAuthSubmit}>
          Gửi mã OTP
        </button>
      </>
    ) : (
      <>
        <p className="otp-info">
          Mã OTP đã được gửi đến <strong>+84{authPhone}</strong>
        </p>
        <input
          type="text"
          placeholder="Nhập mã OTP 6 chữ số"
          value={authOTP}
          onChange={(e) => setAuthOTP(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          autoFocus
        />
        <button onClick={handleAuthSubmit}>
          Xác nhận OTP
        </button>
        <button 
          onClick={handleResendOTP}
          disabled={otpResendTimer > 0}
          className="resend-btn"
        >
          {otpResendTimer > 0 
            ? `Gửi lại sau ${otpResendTimer}s` 
            : 'Gửi lại mã OTP'}
        </button>
        <button 
          onClick={() => {
            setOtpSent(false);
            setAuthOTP('');
          }}
          className="back-btn"
        >
          ← Thay đổi số điện thoại
        </button>
      </>
    )}
  </div>
)}

{/* reCAPTCHA container - NEW */}
<div id="recaptcha-container"></div>
```

---

### 5. Styling

#### [MODIFY] [App.css](file:///g:/Project/salary/src/App.css)

**Thêm styles cho Phone Authentication UI:**

```css
/* Auth Method Toggle */
.auth-method-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-radius: 8px;
  background: #f5f5f5;
  padding: 4px;
}

.auth-method-toggle button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.auth-method-toggle button.active {
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Phone Input Group */
.phone-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px 12px;
  background: white;
}

.phone-input-group .country-code {
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.phone-input-group input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  padding: 0;
}

/* OTP Info */
.otp-info {
  text-align: center;
  padding: 12px;
  background: #e3f2fd;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #1976d2;
}

/* Resend & Back Buttons */
.resend-btn, .back-btn {
  background: transparent;
  border: 1px solid #ddd;
  margin-top: 8px;
  color: #666;
}

.resend-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* reCAPTCHA container */
#recaptcha-container {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
```

---

### 6. Optional: Account Linking Feature

#### [MODIFY] Account Settings Section in [App.tsx](file:///g:/Project/salary/src/App.tsx)

**Nếu cho phép liên kết SĐT vào tài khoản Email (tuỳ chọn):**

```tsx
{/* Add Phone Number Section - NEW */}
{user && !user.phoneNumber && (
  <div className="account-section">
    <h3>Thêm số điện thoại</h3>
    <p className="section-description">
      Liên kết số điện thoại để có thêm phương thức đăng nhập
    </p>
    
    {!linkPhoneOtpSent ? (
      <div className="phone-link-form">
        <div className="phone-input-group">
          <span className="country-code">+84</span>
          <input
            type="tel"
            placeholder="Số điện thoại"
            value={linkPhoneNumber}
            onChange={(e) => setLinkPhoneNumber(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <button onClick={handleLinkPhoneStart}>
          Gửi mã OTP
        </button>
      </div>
    ) : (
      <div className="phone-link-verify">
        <input
          type="text"
          placeholder="Mã OTP 6 chữ số"
          value={linkPhoneOtp}
          onChange={(e) => setLinkPhoneOtp(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
        />
        <button onClick={handleLinkPhoneConfirm}>
          Xác nhận
        </button>
      </div>
    )}
  </div>
)}

{/* Display linked phone - NEW */}
{user?.phoneNumber && (
  <div className="account-info">
    <span>📱 Số điện thoại:</span>
    <span>{user.phoneNumber}</span>
  </div>
)}
```

---

## Verification Plan

### Automated Tests

```bash
# 1. Build check
npm run build

# 2. Linting
npm run lint

# 3. TypeScript type check
npx tsc --noEmit
```

### Manual Verification

1. **Firebase Console Setup**:
   - [ ] Bật Phone Authentication trong Firebase Console
   - [ ] Thêm domain vào Authorized domains
   - [ ] (Optional) Thêm test phone numbers cho development

2. **UI Testing - Email Method** (đảm bảo không bị ảnh hưởng):
   - [ ] Đăng ký bằng email vẫn hoạt động bình thường
   - [ ] Đăng nhập bằng email vẫn hoạt động
   - [ ] Quên mật khẩu vẫn hoạt động

3. **UI Testing - Phone Method** (tính năng mới):
   - [ ] Chuyển tab Email ↔ Phone hoạt động mượt
   - [ ] Input phone number chỉ nhận số, tự động format
   - [ ] Click "Gửi mã OTP" → hiển thị form nhập OTP
   - [ ] Nhận OTP qua SMS (hoặc test phone nếu dùng test mode)
   - [ ] Nhập đúng OTP → đăng nhập thành công
   - [ ] Nhập sai OTP → hiển thị lỗi rõ ràng
   - [ ] Countdown timer "Gửi lại sau Xs" hoạt động đúng
   - [ ] Click "Gửi lại OTP" sau khi hết countdown → nhận OTP mới
   - [ ] Click "← Thay đổi số điện thoại" → quay lại form nhập số

4. **Error Handling**:
   - [ ] Nhập số điện thoại không hợp lệ → lỗi validation
   - [ ] reCAPTCHA fail → thông báo lỗi
   - [ ] Network error khi gửi OTP → thông báo lỗi
   - [ ] Đã quá số lần gửi OTP trong 1 ngày → thông báo lỗi từ Firebase

5. **Account Linking** (nếu implement):
   - [ ] User đăng nhập bằng email → có option "Thêm SĐT"
   - [ ] Liên kết SĐT thành công → hiển thị SĐT trong profile
   - [ ] Đăng xuất rồi đăng nhập lại bằng SĐT → vào đúng tài khoản

6. **Data Sync**:
   - [ ] Đăng ký bằng SĐT → data được tự động sync với Firebase
   - [ ] Đăng nhập bằng SĐT trên thiết bị khác → load đúng data

7. **Responsive Design**:
   - [ ] UI phone auth hiển thị tốt trên mobile
   - [ ] reCAPTCHA hiển thị đúng trên mobile

---

## Implementation Order

1. ✅ **Research & Planning** (Completed)
2. ⏳ **Waiting for User Approval**
3. 🔄 Firebase Functions Implementation ([firebaseSync.ts](file:///g:/Project/salary/src/firebaseSync.ts))
4. 🔄 App State Management ([App.tsx](file:///g:/Project/salary/src/App.tsx))
5. 🔄 Auth Logic Implementation ([App.tsx](file:///g:/Project/salary/src/App.tsx))
6. 🔄 UI Components ([App.tsx](file:///g:/Project/salary/src/App.tsx))
7. 🔄 Styling ([App.css](file:///g:/Project/salary/src/App.css))
8. 🔄 Testing & Verification
9. 🔄 Documentation Update

---

## Timeline Estimate

- **Firebase Setup**: 30 phút
- **Backend Functions**: 1 giờ
- **Frontend Implementation**: 2-3 giờ
- **Styling & Polish**: 1 giờ
- **Testing**: 1-2 giờ

**Total**: ~5-7 giờ

---

## Dependencies

- ✅ Firebase SDK 12.12.1 (already installed)
- ✅ React 19 (already installed)
- ❓ Firebase Console configuration (cần người dùng thực hiện)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Firebase Phone Auth chưa được bật | Hướng dẫn user bật trong Console hoặc làm hộ nếu có quyền |
| SMS không gửi được ở VN | Test với test phone numbers trước khi production |
| Quota limit của Firebase free tier | Thông báo cho user về giới hạn, suggest upgrade nếu cần |
| reCAPTCHA bị block ở một số mạng | Dùng invisible reCAPTCHA, fallback sang visible nếu fail |
| User nhập sai format số điện thoại | Auto-format và validation chặt chẽ |

---

## Post-Implementation Tasks

- [ ] Cập nhật README với hướng dẫn sử dụng Phone Auth
- [ ] Thêm error tracking cho Phone Auth flow (Sentry/Analytics)
- [ ] Monitor Firebase usage quota
- [ ] Thu thập feedback từ user về UX của Phone Auth
