import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC8GH_52CNpOBnYppvUN5d_PeKYo9Cw5uk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0324008326.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0324008326",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0324008326.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "840193563721",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:840193563721:web:b870618c57f1fb7cecb398"
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

export const syncToCloud = async (syncCode: string, data: unknown, ownerId?: string) => {
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

/** Public, read-only app configuration. Validation happens in holidayCalendar.ts. */
export const getPublicHolidayCalendar = async (): Promise<unknown | null> => {
  const dbInstance = await getDbInstance();
  const { doc, getDoc } = await import('firebase/firestore');
  const docSnap = await getDoc(doc(dbInstance, 'app_config', 'public_holidays'));
  return docSnap.exists() ? docSnap.data() : null;
};

export const syncAccountToCloud = async (uid: string, data: unknown): Promise<boolean> => {
  if (!uid) throw new Error('UID không hợp lệ.');
  const dbInstance = await getDbInstance();
  const { doc, runTransaction } = await import('firebase/firestore');
  const accountRef = doc(dbInstance, 'salary_accounts', uid);
  const incomingLastUpdated = Number((data as { lastUpdated?: number })?.lastUpdated) || 0;

  return runTransaction(dbInstance, async (transaction) => {
    const current = await transaction.get(accountRef);
    const currentData = current.data()?.data as { lastUpdated?: number } | undefined;
    const currentLastUpdated = Number(currentData?.lastUpdated) || 0;

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

