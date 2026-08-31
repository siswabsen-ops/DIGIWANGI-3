/**
 * Safe LocalStorage Utilities with Quota Exceeded and Sandbox Resilience
 * Preserves custom uploaded DIGIWANGI 3 logos permanently across sessions.
 */

export const APP_LOGO_STORAGE_KEY = 'karapres3_app_logo';

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[Storage] Failed to read key "${key}":`, err);
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[Storage] Failed to remove key "${key}":`, err);
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    
    // If saving settings with a valid custom logo, also mirror to dedicated persistent logo storage
    if (key === 'karapres3_settings') {
      try {
        const parsed = JSON.parse(value);
        if (parsed.appLogoUrl) {
          localStorage.setItem(APP_LOGO_STORAGE_KEY, parsed.appLogoUrl);
        }
      } catch {}
    }

    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    console.warn(`[Storage] Quota exceeded or error setting key "${key}". Freeing temporary space...`, error);
    
    // Purge temporary or legacy items to immediately free local storage space
    try {
      const purgeableKeys = [
        'karapres3_logs',
        'karapres3_siswa_v1',
        'karapres3_siswa_v2',
        'karapres3_presensi_v1',
        'karapres3_presensi_v2',
        'karapres3_presensi_v3',
        'karapres3_presensi_v4',
        'karapres3_accounts_v1',
        'karapres3_accounts_v2',
        'karapres3_accounts_v3'
      ];
      
      for (const k of purgeableKeys) {
        if (k !== key && k !== APP_LOGO_STORAGE_KEY) {
          localStorage.removeItem(k);
        }
      }

      // Retry saving
      localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      console.warn(`[Storage] Storage quota exhausted for "${key}". State remains intact in memory and Cloud Firestore.`, retryError);
      return false;
    }
  }
}
