
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  type User,
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
  if (getApps().length === 0) {
    return initializeApp(FIREBASE_CONFIG);
  }
  return getApp();
};

const scopedSyncId = (syncCode: string, userId?: string) => {
  const raw = syncCode.trim();
  if (!raw) throw new Error("Vui lòng nhập Mã đồng bộ!");
  return userId ? `${userId}__${raw}` : raw;
};

export const auth = getAuth(initFirebase());

export const watchAuthState = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

export const registerWithEmail = async (email: string, password: string, displayName?: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, { displayName });
  }
  return userCredential;
};

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const logoutUser = () => signOut(auth);

export const sendVerifyEmail = () => {
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  return sendEmailVerification(auth.currentUser);
};

export const updateDisplayNameProfile = async (displayName: string) => {
  if (!auth.currentUser) throw new Error('Bạn chưa đăng nhập.');
  await updateProfile(auth.currentUser, { displayName });
  return auth.currentUser;
};

export const resetPasswordByEmail = (email: string) => sendPasswordResetEmail(auth, email);

export const syncToCloud = async (syncCode: string, data: unknown, userId?: string) => {
  const app = initFirebase();
  const db = getFirestore(app);
  const id = scopedSyncId(syncCode, userId);
  await setDoc(doc(db, 'salary_sync', id), { data, updatedAt: new Date().toISOString(), userId: userId ?? null });
};

export const syncFromCloud = async (syncCode: string, userId?: string) => {
  const app = initFirebase();
  const db = getFirestore(app);
  const raw = syncCode.trim();
  const id = scopedSyncId(syncCode, userId);

  const docSnap = await getDoc(doc(db, 'salary_sync', id));
  if (docSnap.exists()) {
    return docSnap.data().data;
  }

  // Backward compatibility: older cloud data was saved with only the sync code,
  // before data was scoped per Firebase account.
  if (userId && raw && raw !== id) {
    const legacySnap = await getDoc(doc(db, 'salary_sync', raw));
    if (legacySnap.exists()) {
      return legacySnap.data().data;
    }
  }

  throw new Error("Không tìm thấy dữ liệu với Mã đồng bộ này!");
};

export const syncAccountToCloud = async (userId: string, data: unknown) => {
  const app = initFirebase();
  const db = getFirestore(app);
  await setDoc(doc(db, 'salary_users', userId), { data, updatedAt: serverTimestamp() }, { merge: true });
};

export const syncAccountFromCloud = async (userId: string) => {
  const app = initFirebase();
  const db = getFirestore(app);
  const docSnap = await getDoc(doc(db, 'salary_users', userId));
  if (docSnap.exists()) {
    return docSnap.data().data;
  }
  return null;
};