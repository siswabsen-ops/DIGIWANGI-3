import { Siswa, Presensi, SystemSettings, User, WaliKelas } from '../types';
import { 
  syncMasterStudentsToCloud as syncToFirestoreStudents,
  syncMasterPresensiToCloud as syncToFirestorePresensi,
  syncMasterAccountsToCloud as syncToFirestoreAccounts,
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
    const res = await fetch('/api/sync/data', { cache: 'no-store' });
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
    return true;
  } catch (err) {
    console.warn('[CloudSync] Server wali kelas sync notice:', err);
    return false;
  }
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
      const res = await fetch('/api/sync/version', { cache: 'no-store' });
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

  // Poll interval 2.5 seconds for instant multi-device responsiveness
  const intervalId = setInterval(checkVersionAndSync, 2500);

  // Parallel Firestore listener (for Firestore live stream if active)
  let unsubFirestore: (() => void) | undefined;
  try {
    unsubFirestore = subscribeToFirestoreSync({
      onStudentsChange: (stu) => {
        if (isSubscribed && stu && stu.length > 0 && callbacks.onStudentsChange) {
          callbacks.onStudentsChange(stu);
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
    if (unsubFirestore) unsubFirestore();
  };
}
