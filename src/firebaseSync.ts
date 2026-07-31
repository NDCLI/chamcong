import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth, User, ConfirmationResult } from 'firebase/auth';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8GH_52CNpOBnYppvUN5d_PeKYo9Cw5uk",
  authDomain: "gen-lang-client-0324008326.firebaseapp.com",
  projectId: "gen-lang-client-0324008326",
  storageBucket: "gen-lang-client-0324008326.firebasestorage.app",
  messagingSenderId: "840193563721",
  appId: "1:840193563721:web:b870618c57f1fb7cecb398"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export const initFirebase = async () => {
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    if (getApps().length === 0) {
      app = initializeApp(FIREBASE_CONFIG);
    } else {
      app = getApp();
    }
    return app;
  } catch (error) {
    console.error("Firebase init error:", error);
    throw error;
  }
};

const getAuthInstance = async () => {
  if (!auth) {
    if (!app) await initFirebase();
    const { getAuth } = await import('firebase/auth');
    auth = getAuth(app!);
  }
  return auth;
};

const getDbInstance = async () => {
  if (!db) {
    if (!app) await initFirebase();
    const { getFirestore } = await import('firebase/firestore');
    db = getFirestore(app!);
  }
  return db;
};

const formatPhoneNumber = (phoneNumber: string) => {
  const cleaned = phoneNumber.trim();
  if (!cleaned) throw new Error('Số điện thoại không hợp lệ.');
  if (cleaned.startsWith('+')) return cleaned;
  return `+84${cleaned.replace(/^0+/, '')}`;
};

export const watchAuthState = (callback: (user: User | null) => void) => {
  return getAuthInstance().then(authInstance => {
    return import('firebase/auth').then(({ onAuthStateChanged }) => {
      return onAuthStateChanged(authInstance, callback);
    });
  });
};

export const registerWithEmail = async (email: string, password: string, displayName?: string) => {
  const authInstance = await getAuthInstance();
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
  const credential = await createUserWithEmailAndPassword(authInstance, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
};

export const loginWithEmail = async (email: string, password: string) => {
  const authInstance = await getAuthInstance();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  return signInWithEmailAndPassword(authInstance, email, password);
};

export const logoutUser = async () => {
  const authInstance = await getAuthInstance();
  const { signOut } = await import('firebase/auth');
  return signOut(authInstance);
};

export const sendVerifyEmail = async () => {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  const { sendEmailVerification } = await import('firebase/auth');
  return sendEmailVerification(authInstance.currentUser);
};

export const resetPasswordByEmail = async (email: string) => {
  const authInstance = await getAuthInstance();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  return sendPasswordResetEmail(authInstance, email);
};

export const updateDisplayNameProfile = async (displayName: string) => {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  const { updateProfile } = await import('firebase/auth');
  await updateProfile(authInstance.currentUser, { displayName });
  return authInstance.currentUser;
};

export const updateUserPassword = async (currentPassword: string, newPassword: string) => {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser) throw new Error('Không có người dùng đang đăng nhập.');
  const email = authInstance.currentUser.email;
  if (!email) throw new Error('Không thể xác thực bằng email.');
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(authInstance.currentUser, credential);
  await updatePassword(authInstance.currentUser, newPassword);
  return authInstance.currentUser;
};

export const setupRecaptcha = async (elementId: string, invisible = true) => {
  const authInstance = await getAuthInstance();
  const { RecaptchaVerifier } = await import('firebase/auth');
  return new RecaptchaVerifier(authInstance, elementId, {
    size: invisible ? 'invisible' : 'normal',
    callback: () => {},
    'expired-callback': () => {
      throw new Error('reCAPTCHA đã hết hạn, vui lòng thử lại.');
    }
  });
};

export const sendPhoneOTP = async (
  phoneNumber: string,
  recaptchaVerifier: any
): Promise<ConfirmationResult> => {
  const authInstance = await getAuthInstance();
  const { signInWithPhoneNumber } = await import('firebase/auth');
  const formattedPhone = formatPhoneNumber(phoneNumber);
  return signInWithPhoneNumber(authInstance, formattedPhone, recaptchaVerifier);
};

export const verifyPhoneOTP = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
) => {
  return confirmationResult.confirm(otpCode);
};

export const linkPhoneToAccount = async (
  phoneNumber: string,
  recaptchaVerifier: any
) => {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser) throw new Error('Bạn chưa đăng nhập.');
  const { signInWithPhoneNumber } = await import('firebase/auth');
  const formattedPhone = formatPhoneNumber(phoneNumber);
  return signInWithPhoneNumber(authInstance, formattedPhone, recaptchaVerifier);
};

export const confirmLinkPhone = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
) => {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser) throw new Error('Bạn chưa đăng nhập.');
  const { PhoneAuthProvider, linkWithCredential } = await import('firebase/auth');
  const credential = PhoneAuthProvider.credential(
    confirmationResult.verificationId,
    otpCode
  );
  return linkWithCredential(authInstance.currentUser, credential);
};

export const syncToCloud = async (syncCode: string, data: any, ownerId?: string) => {
  if (!syncCode) throw new Error('Vui lòng nhập Mã đồng bộ!');
  const dbInstance = await getDbInstance();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(dbInstance, 'salary_sync', syncCode), {
    data,
    ownerId: ownerId || null,
    updatedAt: new Date().toISOString()
  });
};

export const syncFromCloud = async (syncCode: string) => {
  if (!syncCode) throw new Error('Vui lòng nhập Mã đồng bộ!');
  const dbInstance = await getDbInstance();
  const { doc, getDoc } = await import('firebase/firestore');
  const docSnap = await getDoc(doc(dbInstance, 'salary_sync', syncCode));
  if (docSnap.exists()) {
    return docSnap.data().data;
  }
  throw new Error('Không tìm thấy dữ liệu với Mã đồng bộ này!');
};

export const syncAccountToCloud = async (uid: string, data: any): Promise<boolean> => {
  if (!uid) throw new Error('UID không hợp lệ.');
  const dbInstance = await getDbInstance();
  const { doc, runTransaction } = await import('firebase/firestore');
  const accountRef = doc(dbInstance, 'salary_accounts', uid);
  const incomingLastUpdated = Number(data?.lastUpdated) || 0;

  return runTransaction(dbInstance, async (transaction) => {
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
  const dbInstance = await getDbInstance();
  const { doc, getDoc } = await import('firebase/firestore');
  const docSnap = await getDoc(doc(dbInstance, 'salary_accounts', uid));
  if (!docSnap.exists()) return null;
  return docSnap.data().data;
};

