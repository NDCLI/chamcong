import { initializeApp, getApps, getApp } from 'firebase/app';
import type { AppData } from './logic';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  type ConfirmationResult,
  type User
} from 'firebase/auth';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8GH_52CNpOBnYppvUN5d_PeKYo9Cw5uk",
  authDomain: "gen-lang-client-0324008326.firebaseapp.com",
  projectId: "gen-lang-client-0324008326",
  storageBucket: "gen-lang-client-0324008326.firebasestorage.app",
  messagingSenderId: "840193563721",
  appId: "1:840193563721:web:b870618c57f1fb7cecb398"
};

export const initFirebase = () => {
  try {
    if (getApps().length === 0) {
      return initializeApp(FIREBASE_CONFIG);
    }
    return getApp();
  } catch (error) {
    console.error("Firebase init error:", error);
    throw error;
  }
};

const app = initFirebase();
const auth = getAuth(app);

// Firestore chỉ cần khi người dùng đồng bộ, nên tải động để giảm bundle tải trang đầu.
type FirestoreModule = typeof import('firebase/firestore');
let firestorePromise: Promise<{ db: import('firebase/firestore').Firestore; fs: FirestoreModule }> | null = null;

const getFirestoreLazy = () => {
  if (!firestorePromise) {
    firestorePromise = import('firebase/firestore').then((fs) => ({
      db: fs.getFirestore(app),
      fs,
    }));
  }
  return firestorePromise;
};

const formatPhoneNumber = (phoneNumber: string) => {
  const cleaned = phoneNumber.trim();
  if (!cleaned) throw new Error('Số điện thoại không hợp lệ.');
  if (cleaned.startsWith('+')) return cleaned;
  return `+84${cleaned.replace(/^0+/, '')}`;
};

export const watchAuthState = (callback: (user: User | null) => void) => onAuthStateChanged(auth, callback);

export const registerWithEmail = async (email: string, password: string, displayName?: string) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
};

export const loginWithEmail = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const logoutUser = async () => signOut(auth);

export const sendVerifyEmail = async () => {
  if (!auth.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  return sendEmailVerification(auth.currentUser);
};

export const resetPasswordByEmail = async (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

export const updateDisplayNameProfile = async (displayName: string) => {
  if (!auth.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  await updateProfile(auth.currentUser, { displayName });
  return auth.currentUser;
};

export const updateUserPassword = async (currentPassword: string, newPassword: string) => {
  if (!auth.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  const email = auth.currentUser.email;
  if (!email) throw new Error('Không thể xác thực bằng email.');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
  return auth.currentUser;
};

export const setupRecaptcha = (elementId: string, invisible = true) => {
  return new RecaptchaVerifier(auth, elementId, {
    size: invisible ? 'invisible' : 'normal',
    callback: () => {},
    'expired-callback': () => {
      throw new Error('reCAPTCHA đã hết hạn, vui lòng thử lại.');
    }
  });
};

export const sendPhoneOTP = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  return signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
};

export const verifyPhoneOTP = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
) => {
  return confirmationResult.confirm(otpCode);
};

export const linkPhoneToAccount = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
) => {
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  const formattedPhone = formatPhoneNumber(phoneNumber);
  return signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
};

export const confirmLinkPhone = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
) => {
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  const credential = PhoneAuthProvider.credential(
    confirmationResult.verificationId,
    otpCode
  );
  return linkWithCredential(auth.currentUser, credential);
};

export const syncToCloud = async (syncCode: string, data: AppData, ownerId?: string) => {
  if (!syncCode) throw new Error('Vui lòng nhập Mã đồng bộ!');
  const { db, fs } = await getFirestoreLazy();
  await fs.setDoc(fs.doc(db, 'salary_sync', syncCode), {
    data,
    ownerId: ownerId || null,
    updatedAt: new Date().toISOString()
  });
};

export const syncFromCloud = async (syncCode: string) => {
  if (!syncCode) throw new Error('Vui lòng nhập Mã đồng bộ!');
  const { db, fs } = await getFirestoreLazy();
  const docSnap = await fs.getDoc(fs.doc(db, 'salary_sync', syncCode));
  if (docSnap.exists()) {
    return docSnap.data().data;
  }
  throw new Error('Không tìm thấy dữ liệu với Mã đồng bộ này!');
};

export const syncAccountToCloud = async (uid: string, data: AppData): Promise<boolean> => {
  if (!uid) throw new Error('UID không hợp lệ.');
  const { db, fs } = await getFirestoreLazy();
  const accountRef = fs.doc(db, 'salary_accounts', uid);
  const incomingLastUpdated = Number(data?.lastUpdated) || 0;

  return fs.runTransaction(db, async (transaction) => {
    const current = await transaction.get(accountRef);
    const currentLastUpdated = Number(current.data()?.data?.lastUpdated) || 0;

    if (current.exists() && currentLastUpdated > incomingLastUpdated) {
      return false;
    }

    transaction.set(accountRef, {
      data,
      updatedAt: new Date().toISOString()
    });
    return true;
  });
};

export const syncAccountFromCloud = async (uid: string) => {
  if (!uid) throw new Error('UID không hợp lệ.');
  const { db, fs } = await getFirestoreLazy();
  const docSnap = await fs.getDoc(fs.doc(db, 'salary_accounts', uid));
  if (!docSnap.exists()) return null;
  return docSnap.data().data;
};

