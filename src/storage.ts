export const storageDataKey = (uid?: string | null) => uid ? `salary_data_${uid}` : 'salary_data';
export const storageSyncKey = (uid?: string | null) => uid ? `salary_sync_code_${uid}` : 'salary_sync_code';

export const getLocalDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
