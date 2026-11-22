import { Siswa, Presensi, SystemSettings, User, WaliKelas } from '../types';
import { 
  syncMasterStudentsToCloud as syncToFirestoreStudents,
  syncMasterPresensiToCloud as syncToFirestorePresensi,
  syncMasterAccountsToCloud as syncToFirestoreAccounts,
  syncMasterWaliKelasToCloud as syncToFirestoreWaliKelas,
  saveSettingsToFirestore,
  subscribeToCloudSync as subscribeToFirestoreSync,
  fetchCloudSyncStudentsOnce,
  fetchCloudSyncPresensiOnce,
  fetchSettingsFromFirestoreOnce,
  fetchCloudSyncWaliKelasOnce,
  fetchCloudSyncAccountsOnce,
  DeletedTombstone
} from './firebase';

export interface CloudMasterPayload {
  version: number;
  updatedAt: string;
  students?: Siswa[];
  studentsCatalogVersion?: number;
  waliKelas?: WaliKelas[];
  presensi?: Presensi[];
  deletedKeys?: Record<string, number> | DeletedTombstone[];
  settings?: SystemSettings;
  accounts?: { user: User; pin: string }[];
}

export interface SyncCallbacks {
  onStudentsChange?: (students: Siswa[], catalogVersion?: number) => void;
  onWaliKelasChange?: (waliKelas: WaliKelas[]) => void;
  onPresensiChange?: (presensi: Presensi[], updatedAt?: number, deletedKeys?: Record<string, number> | DeletedTombstone[]) => void;
  onSettingsChange?: (settings: SystemSettings) => void;
  onAccountsChange?: (accounts: { user: User; pin: string }[]) => void;
}

let localSyncVersion = 0;

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return res.ok && ct.toLowerCase().includes('application/json');
}

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
    if (!isJsonResponse(res)) return null;
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
 * Fallback pembacaan master data langsung dari Cloud Firestore
 * Digunakan otomatis saat berjalan di hosting statis seperti Vercel (https://digiwangi-3.vercel.app/)
 */
export async function fetchFirestoreMasterFallback(): Promise<CloudMasterPayload | null> {
  try {
    const [studentsDoc, presensiDoc, settingsDoc, waliKelasDoc, accountsDoc] = await Promise.all([
      fetchCloudSyncStudentsOnce().catch(() => null),
      fetchCloudSyncPresensiOnce().catch(() => null),
      fetchSettingsFromFirestoreOnce().catch(() => null),
      fetchCloudSyncWaliKelasOnce().catch(() => null),
      fetchCloudSyncAccountsOnce().catch(() => null)
    ]);

    if (!studentsDoc && !presensiDoc && !settingsDoc && !waliKelasDoc && !accountsDoc) {
      return null;
    }

    return {
      version: localSyncVersion,
      updatedAt: new Date().toISOString(),
      students: studentsDoc?.data,
      studentsCatalogVersion: studentsDoc?.catalogVersion,
      presensi: presensiDoc?.data,
      deletedKeys: presensiDoc?.deletedKeys,
      settings: settingsDoc || undefined,
      waliKelas: waliKelasDoc?.data,
      accounts: accountsDoc?.data
    };
  } catch (err) {
    console.warn('[CloudSync] Notice on fetchFirestoreMasterFallback:', err);
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
 * Menyinkronkan presensi ke server & Firestore
 */
export async function syncPresensiToCloud(
  presensi: Presensi[],
  updatedBy: string = 'Presensi',
  deletedKeys?: DeletedTombstone[]
): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/presensi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: presensi, updatedBy, deletedKeys })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
    }
  } catch (err) {
    console.warn('[CloudSync] Server presensi sync notice:', err);
  }

  try {
    syncToFirestorePresensi(presensi, updatedBy, deletedKeys).catch(() => {});
  } catch {}

  return true;
}

/**
 * Mencatat satu presensi harian secara atomic ke server (/api/presensi/record)
 * Sangat cepat dan menghemat bandwidth saat pemindaian QR massal di gerbang/kelas
 */
export async function recordSinglePresensiToCloud(record: Presensi, updatedBy: string = 'Presensi Live'): Promise<boolean> {
  try {
    const res = await fetch('/api/presensi/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
      return true;
    }
  } catch (err) {
    console.warn('[CloudSync] Fast presensi record notice:', err);
  }
  return false;
}

/**
 * Menghapus/mereset satu catatan presensi harian (misalnya pembatalan tap manual wali kelas)
 */
export async function deleteSinglePresensiFromCloud(
  params: { recordId?: string; siswaId?: string; tanggal: string },
  updatedBy: string = 'Wali Kelas'
): Promise<boolean> {
  try {
    const res = await fetch('/api/presensi/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, updatedBy })
    });
    if (res.ok) {
      const respJson = await res.json();
      if (respJson?.version) localSyncVersion = respJson.version;
      return true;
    }
  } catch (err) {
    console.warn('[CloudSync] Fast presensi delete notice:', err);
  }
  return false;
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
  let hasServerBackend: boolean | null = null;
  let unsubFirestore: (() => void) | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const attachFirestore = (enableMasterDocListeners: boolean) => {
    if (unsubFirestore) {
      try { unsubFirestore(); } catch {}
    }
    try {
      unsubFirestore = subscribeToFirestoreSync(
        {
          onPresensiChange: (pre, updatedAt, deletedKeys) => {
            if (isSubscribed && pre && callbacks.onPresensiChange) {
              callbacks.onPresensiChange(pre, updatedAt, deletedKeys);
            }
          },
          onStudentsChange: (students, catalogVersion) => {
            if (isSubscribed && students && callbacks.onStudentsChange) {
              callbacks.onStudentsChange(students, catalogVersion);
            }
          },
          onWaliKelasChange: (wk) => {
            if (isSubscribed && wk && callbacks.onWaliKelasChange) {
              callbacks.onWaliKelasChange(wk);
            }
          },
          onSettingsChange: (s) => {
            if (isSubscribed && s && callbacks.onSettingsChange) {
              callbacks.onSettingsChange(s);
            }
          },
          onAccountsChange: (acc) => {
            if (isSubscribed && acc && callbacks.onAccountsChange) {
              callbacks.onAccountsChange(acc);
            }
          }
        },
        { enableMasterDocListeners }
      );
    } catch (err) {
      console.warn('[CloudSync] Firestore listener skipped:', err);
    }
  };

  // Start with presensi listener; expand to all master docs immediately if server /api/sync/version is unavailable (Vercel)
  attachFirestore(false);

  const checkVersionAndSync = async () => {
    if (isChecking || !isSubscribed || hasServerBackend === false) return;
    isChecking = true;

    try {
      const res = await fetch(`/api/sync/version?t=${Date.now()}`, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (isJsonResponse(res)) {
        hasServerBackend = true;
        const { version } = await res.json();
        if (typeof version === 'number' && version > localSyncVersion) {
          const fullData = await fetchCloudMasterData();
          if (fullData && isSubscribed) {
            localSyncVersion = fullData.version;
            if (fullData.students && callbacks.onStudentsChange) {
              callbacks.onStudentsChange(fullData.students, fullData.studentsCatalogVersion);
            }
            if (fullData.waliKelas && callbacks.onWaliKelasChange) {
              callbacks.onWaliKelasChange(fullData.waliKelas);
            }
            if (fullData.presensi && callbacks.onPresensiChange) {
              callbacks.onPresensiChange(fullData.presensi, undefined, fullData.deletedKeys);
            }
            if (fullData.settings && callbacks.onSettingsChange) {
              callbacks.onSettingsChange(fullData.settings);
            }
            if (fullData.accounts && callbacks.onAccountsChange) {
              callbacks.onAccountsChange(fullData.accounts);
            }
          }
        }
      } else {
        // Hosting statis (Vercel / CDN) tidak memiliki /api/sync/version -> aktifkan real-time Firestore penuh
        hasServerBackend = false;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        if (isSubscribed) {
          attachFirestore(true);
        }
      }
    } catch {
      // Offline or temporary network blip
    } finally {
      isChecking = false;
    }
  };

  // Probe immediately & poll every 6s when server backend is present
  checkVersionAndSync();
  intervalId = setInterval(checkVersionAndSync, 6000);

  const handleWindowFocus = () => {
    if (hasServerBackend === false) {
      // Refresh settings/students once when returning to tab on Android/PC static build
      fetchFirestoreMasterFallback().then((fb) => {
        if (!fb || !isSubscribed) return;
        if (fb.students && callbacks.onStudentsChange) callbacks.onStudentsChange(fb.students, fb.studentsCatalogVersion);
        if (fb.waliKelas && callbacks.onWaliKelasChange) callbacks.onWaliKelasChange(fb.waliKelas);
        if (fb.presensi && callbacks.onPresensiChange) callbacks.onPresensiChange(fb.presensi, undefined, fb.deletedKeys);
        if (fb.settings && callbacks.onSettingsChange) callbacks.onSettingsChange(fb.settings);
        if (fb.accounts && callbacks.onAccountsChange) callbacks.onAccountsChange(fb.accounts);
      }).catch(() => {});
    } else {
      checkVersionAndSync();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', handleWindowFocus);
    window.addEventListener('focus', handleWindowFocus);
  }

  return () => {
    isSubscribed = false;
    if (intervalId) clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('focus', handleWindowFocus);
    }
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Paksa penyegaran data sekarang dari Cloud Master Data (Express Server atau Firestore Fallback)
 */
export async function forceSyncNow(callbacks: SyncCallbacks): Promise<boolean> {
  try {
    const fullData = await fetchCloudMasterData();
    if (fullData) {
      localSyncVersion = fullData.version;
      if (fullData.students && callbacks.onStudentsChange) {
        callbacks.onStudentsChange(fullData.students, fullData.studentsCatalogVersion);
      }
      if (fullData.waliKelas && callbacks.onWaliKelasChange) {
        callbacks.onWaliKelasChange(fullData.waliKelas);
      }
      if (fullData.presensi && callbacks.onPresensiChange) {
        callbacks.onPresensiChange(fullData.presensi, undefined, fullData.deletedKeys);
      }
      if (fullData.settings && callbacks.onSettingsChange) {
        callbacks.onSettingsChange(fullData.settings);
      }
      if (fullData.accounts && callbacks.onAccountsChange) {
        callbacks.onAccountsChange(fullData.accounts);
      }
      return true;
    }

    // Vercel / static host fallback via Firestore
    const firestoreData = await fetchFirestoreMasterFallback();
    if (firestoreData) {
      if (firestoreData.students && callbacks.onStudentsChange) {
        callbacks.onStudentsChange(firestoreData.students, firestoreData.studentsCatalogVersion);
      }
      if (firestoreData.waliKelas && callbacks.onWaliKelasChange) {
        callbacks.onWaliKelasChange(firestoreData.waliKelas);
      }
      if (firestoreData.presensi && callbacks.onPresensiChange) {
        callbacks.onPresensiChange(firestoreData.presensi, undefined, firestoreData.deletedKeys);
      }
      if (firestoreData.settings && callbacks.onSettingsChange) {
        callbacks.onSettingsChange(firestoreData.settings);
      }
      if (firestoreData.accounts && callbacks.onAccountsChange) {
        callbacks.onAccountsChange(firestoreData.accounts);
      }
      return true;
    }
  } catch (err) {
    console.warn('[CloudSync] Force sync notice:', err);
  }
  return false;
}

export interface QRErrorLog {
  id: string;
  timestamp: string;
  date: string;
  code: string;
  reason: string;
  operator: string;
  kelasHint?: string;
  createdAt?: string;
}

const LOCAL_QR_ERRORS_KEY = 'karapres3_qr_errors_v1';

function readLocalQrErrors(): QRErrorLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_QR_ERRORS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeLocalQrErrors(list: QRErrorLog[]) {
  try {
    localStorage.setItem(LOCAL_QR_ERRORS_KEY, JSON.stringify(list.slice(-200)));
  } catch {}
}

export async function recordQRErrorToCloud(errorData: Partial<QRErrorLog>): Promise<QRErrorLog | null> {
  const localEntry: QRErrorLog = {
    id: errorData.id || `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: errorData.timestamp || new Date().toLocaleTimeString('id-ID'),
    date: (errorData.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    code: errorData.code || 'UNKNOWN',
    reason: errorData.reason || 'QR Code tidak terdaftar',
    operator: errorData.operator || 'Scanner Piket',
    kelasHint: errorData.kelasHint,
    createdAt: new Date().toISOString()
  };

  try {
    const res = await fetch('/api/qr-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localEntry)
    });
    if (isJsonResponse(res)) {
      const data = await res.json();
      return data.error || localEntry;
    }
  } catch {}

  const existing = readLocalQrErrors();
  existing.push(localEntry);
  writeLocalQrErrors(existing);
  return localEntry;
}

export async function fetchQRErrorsFromCloud(dateStr?: string): Promise<QRErrorLog[]> {
  try {
    const url = dateStr ? `/api/qr-errors?date=${encodeURIComponent(dateStr)}` : '/api/qr-errors';
    const res = await fetch(url);
    if (isJsonResponse(res)) {
      const data = await res.json();
      if (Array.isArray(data.errors)) return data.errors;
    }
  } catch {}

  const localList = readLocalQrErrors();
  return dateStr
    ? localList.filter((e) => (e.date || '').slice(0, 10) === dateStr.slice(0, 10))
    : localList;
}
