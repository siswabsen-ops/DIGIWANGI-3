import { Siswa, Presensi, SystemSettings, User, WaliKelas } from '../types';
import { 
  syncMasterStudentsToCloud as syncToFirestoreStudents,
  syncMasterPresensiToCloud as syncToFirestorePresensi,
  syncMasterAccountsToCloud as syncToFirestoreAccounts,
  syncMasterWaliKelasToCloud as syncToFirestoreWaliKelas,
  saveSettingsToFirestore,
  subscribeToCloudSync as subscribeToFirestoreSync
} from './firebase';

export interface CloudMasterPayload {
  version: number;
  updatedAt: string;
  students?: Siswa[];
  waliKelas?: WaliKelas[];
  presensi?: Presensi[];
  settings?: SystemSettings;
  accounts?: { user: User; pin: string }[];
}

export interface SyncCallbacks {
  onStudentsChange?: (students: Siswa[]) => void;
  onWaliKelasChange?: (waliKelas: WaliKelas[]) => void;
  onPresensiChange?: (presensi: Presensi[]) => void;
  onSettingsChange?: (settings: SystemSettings) => void;
  onAccountsChange?: (accounts: { user: User; pin: string }[]) => void;
}

let localSyncVersion = 0;

/**
 * Mengambil master data lengkap dari server Cloud Run (/api/sync/data)
 * Dipanggil saat aplikasi pertama kali dimuat di Android, PC, atau browser lain
 */
export async function fetchCloudMasterData(): Promise<CloudMasterPayload | null> {
  try {
    const res = await fetch(`/api/sync/data?t=${Date.now()}`, { 
      cache: 'no-store',
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
      }
    });
    if (!res.ok) return null;
    const data: CloudMasterPayload = await res.json();
    if (data && typeof data.version === 'number') {
      localSyncVersion = Math.max(localSyncVersion, data.version);
    }
    return data;
  } catch (err) {
    console.warn('[CloudSync] Notice on fetchCloudMasterData:', err);
    return null;
  }
}

/**
 * Menyinkronkan pembaruan data Siswa (termasuk mutasi kelas & nomor WA wali) ke server
 */
export async function syncStudentsToCloud(students: Siswa[], updatedBy: string = 'Admin'): Promise<boolean> {
  try {
    // 1. Post to Server Master
    const res = await fetch('/api/sync/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: students, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server student sync notice:', err);
  }

  // 2. Secondary Firestore Backup (Gracefully handled if quota exhausted)
  try {
    syncToFirestoreStudents(students, updatedBy).catch(() => {});
  } catch {}

  return true;
}

/**
 * Menyinkronkan pembaruan data Wali Kelas per rombel & nomor WhatsApp wali kelas
 */
export async function syncWaliKelasToCloud(waliKelas: WaliKelas[], updatedBy: string = 'Admin'): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/wali-kelas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: waliKelas, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server wali kelas sync notice:', err);
  }

  try {
    syncToFirestoreWaliKelas(waliKelas, updatedBy).catch(() => {});
  } catch {}

  return true;
}

/**
 * Menyinkronkan presensi ke server
 */
export async function syncPresensiToCloud(presensi: Presensi[], updatedBy: string = 'Presensi'): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/presensi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: presensi, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server presensi sync notice:', err);
  }

  try {
    syncToFirestorePresensi(presensi, updatedBy).catch(() => {});
  } catch {}

  return true;
}

export interface AuditSyncResponse {
  synchronizedRecords: Presensi[];
  totalDays: number;
  totalStudents: number;
  totalRecords: number;
  addedDaysCount: number;
  repairedRecordsCount: number;
  schoolDates: string[];
}

/**
 * Memeriksa, memperbaiki, dan menyinkronkan seluruh data presensi dari pembikinan
 * aplikasi hingga hari ini untuk kebutuhan rekap laporan persemester (Harian, Mingguan, Bulanan, Semester).
 */
export async function auditAndSyncSemesterPresensi(
  currentPresensi: Presensi[],
  students: Siswa[],
  updatedBy: string = 'Sinkronisasi Presensi Semester'
): Promise<AuditSyncResponse> {
  try {
    const res = await fetch('/api/sync/presensi/audit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presensi: currentPresensi,
        students,
        updatedBy
      })
    });

    if (res.ok) {
      const result = await res.json();
      if (result?.version) localSyncVersion = result.version;
      if (Array.isArray(result?.synchronizedRecords) && result.synchronizedRecords.length > 0) {
        try {
          syncToFirestorePresensi(result.synchronizedRecords, updatedBy).catch(() => {});
        } catch {}

        return {
          synchronizedRecords: result.synchronizedRecords,
          totalDays: result.totalDays || 0,
          totalStudents: result.totalStudents || students.length,
          totalRecords: result.totalRecords || result.synchronizedRecords.length,
          addedDaysCount: result.addedDaysCount || 0,
          repairedRecordsCount: result.repairedRecordsCount || 0,
          schoolDates: result.schoolDates || []
        };
      }
    }
  } catch (err) {
    console.warn('[CloudSync] Server audit-sync endpoint notice:', err);
  }

  const { auditAndSynchronizePresensi: clientAudit } = await import('./semesterPresensiGenerator');
  const fallbackAudit = clientAudit(currentPresensi, students);
  
  try {
    fetch('/api/sync/presensi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: fallbackAudit.synchronizedRecords, updatedBy })
    }).catch(() => {});
  } catch {}

  try {
    syncToFirestorePresensi(fallbackAudit.synchronizedRecords, updatedBy).catch(() => {});
  } catch {}

  return fallbackAudit;
}

/**
 * Menyinkronkan pengaturan sistem ke server
 */
export async function syncSettingsToCloud(settings: SystemSettings, updatedBy: string = 'Admin'): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: settings, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server settings sync notice:', err);
  }

  try {
    saveSettingsToFirestore(settings).catch(() => {});
  } catch {}

  return true;
}

/**
 * Menyinkronkan akun operator ke server
 */
export async function syncAccountsToCloud(accounts: { user: User; pin: string }[], updatedBy: string = 'Admin'): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: accounts, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server accounts sync notice:', err);
  }

  try {
    syncToFirestoreAccounts(accounts).catch(() => {});
  } catch {}

  return true;
}

/**
 * Berlangganan sinkronisasi multi-perangkat real-time (PC, Android, Tablet)
 * Memeriksa pembaruan versi setiap 2.5 detik dan memperbarui state secara instan
 */
export function subscribeToMultiDeviceSync(callbacks: SyncCallbacks): () => void {
  let isSubscribed = true;
  let isChecking = false;

  const checkVersionAndSync = async () => {
    if (isChecking || !isSubscribed) return;
    isChecking = true;

    try {
      const res = await fetch(`/api/sync/version?t=${Date.now()}`, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        const { version } = await res.json();
        if (typeof version === 'number' && version > localSyncVersion) {
          // Version changed on another device! Pull full master data
          const fullData = await fetchCloudMasterData();
          if (fullData && isSubscribed) {
            localSyncVersion = fullData.version;
            if (fullData.students && callbacks.onStudentsChange) {
              callbacks.onStudentsChange(fullData.students);
            }
            if (fullData.waliKelas && callbacks.onWaliKelasChange) {
              callbacks.onWaliKelasChange(fullData.waliKelas);
            }
            if (fullData.presensi && callbacks.onPresensiChange) {
              callbacks.onPresensiChange(fullData.presensi);
            }
            if (fullData.settings && callbacks.onSettingsChange) {
              callbacks.onSettingsChange(fullData.settings);
            }
            if (fullData.accounts && callbacks.onAccountsChange) {
              callbacks.onAccountsChange(fullData.accounts);
            }
          }
        }
      }
    } catch {
      // Offline or temporary network blip
    } finally {
      isChecking = false;
    }
  };

  // Poll interval 6 seconds for light network & battery consumption
  const intervalId = setInterval(checkVersionAndSync, 6000);

  // Instant trigger when user returns to tab / unlocks Android screen
  const handleWindowFocus = () => {
    checkVersionAndSync();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', handleWindowFocus);
    window.addEventListener('focus', handleWindowFocus);
  }

  // Parallel Firestore listener (for Firestore live stream if active)
  let unsubFirestore: (() => void) | undefined;
  try {
    unsubFirestore = subscribeToFirestoreSync({
      onStudentsChange: (stu) => {
        if (isSubscribed && stu && stu.length > 0 && callbacks.onStudentsChange) {
          callbacks.onStudentsChange(stu);
        }
      },
      onWaliKelasChange: (wk) => {
        if (isSubscribed && wk && wk.length > 0 && callbacks.onWaliKelasChange) {
          callbacks.onWaliKelasChange(wk);
        }
      },
      onPresensiChange: (pre) => {
        if (isSubscribed && pre && callbacks.onPresensiChange) {
          callbacks.onPresensiChange(pre);
        }
      },
      onSettingsChange: (set) => {
        if (isSubscribed && set && callbacks.onSettingsChange) {
          callbacks.onSettingsChange(set);
        }
      },
      onAccountsChange: (acc) => {
        if (isSubscribed && acc && callbacks.onAccountsChange) {
          callbacks.onAccountsChange(acc);
        }
      }
    });
  } catch (err) {
    console.warn('[CloudSync] Firestore listener skipped:', err);
  }

  return () => {
    isSubscribed = false;
    clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('focus', handleWindowFocus);
    }
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Paksa penyegaran data sekarang dari Cloud Master Data
 */
export async function forceSyncNow(callbacks: SyncCallbacks): Promise<boolean> {
  try {
    const fullData = await fetchCloudMasterData();
    if (fullData) {
      localSyncVersion = fullData.version;
      if (fullData.students && callbacks.onStudentsChange) {
        callbacks.onStudentsChange(fullData.students);
      }
      if (fullData.waliKelas && callbacks.onWaliKelasChange) {
        callbacks.onWaliKelasChange(fullData.waliKelas);
      }
      if (fullData.presensi && callbacks.onPresensiChange) {
        callbacks.onPresensiChange(fullData.presensi);
      }
      if (fullData.settings && callbacks.onSettingsChange) {
        callbacks.onSettingsChange(fullData.settings);
      }
      if (fullData.accounts && callbacks.onAccountsChange) {
        callbacks.onAccountsChange(fullData.accounts);
      }
      return true;
    }
  } catch (err) {
    console.warn('[CloudSync] Force sync notice:', err);
  }
  return false;
}
