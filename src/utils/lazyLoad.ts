/**
 * Preload critical chunks after initial render
 */
export const preloadCriticalChunks = () => {
  // Preload Firebase auth after app loads
  setTimeout(() => {
    import('../firebaseSync').catch(() => {});
  }, 100);
};

/**
 * Prefetch Firebase Firestore only when needed
 */
export const prefetchFirestore = () => {
  import('firebase/firestore').catch(() => {});
};
