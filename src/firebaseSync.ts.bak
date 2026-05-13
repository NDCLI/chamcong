import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

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

export const syncToCloud = async (syncCode: string, data: any) => {
  if (!syncCode) throw new Error("Vui lòng nhập Mã đồng bộ!");
  const app = initFirebase();
  const db = getFirestore(app);
  await setDoc(doc(db, 'salary_sync', syncCode), { data, updatedAt: new Date().toISOString() });
};

export const syncFromCloud = async (syncCode: string) => {
  if (!syncCode) throw new Error("Vui lòng nhập Mã đồng bộ!");
  const app = initFirebase();
  const db = getFirestore(app);
  const docSnap = await getDoc(doc(db, 'salary_sync', syncCode));
  if (docSnap.exists()) {
    return docSnap.data().data;
  }
  throw new Error("Không tìm thấy dữ liệu với Mã đồng bộ này!");
};
