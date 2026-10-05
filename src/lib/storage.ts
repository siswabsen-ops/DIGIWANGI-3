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

    // Optimization: prevent storing multi-megabyte datasets in localStorage.
    // The master store is the high-speed server & cloud; localStorage only needs a lightweight recent window.
    if (key === 'karapres3_presensi_v5' && value.length > 200000) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 300) {
          const compactSlice = parsed.slice(-300);
          localStorage.setItem(key, JSON.stringify(compactSlice));
          return true;
        }
      } catch {}
    }

    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
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
    } catch {}

    // Retry saving compact version
    try {
      if (key === 'karapres3_presensi_v5') {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const windowSlice = parsed.slice(-200);
          localStorage.setItem(key, JSON.stringify(windowSlice));
          return true;
        }
      }
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Memory state is intact, so failing localStorage write is non-fatal
      return false;
    }
  }
}
