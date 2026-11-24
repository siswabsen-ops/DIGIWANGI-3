import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SISWA_INITIAL,
  PRESENSI_INITIAL,
  SETTINGS_INITIAL,
  LOGS_INITIAL,
  USER_DEMO_ACCOUNTS,
  DAFTAR_WALI_KELAS,
  STUDENT_CATALOG_VERSION
} from './lib/demoData';
import { HISTORICAL_ARCHIVE_END_DATE } from './lib/semesterPresensiGenerator';
import { safeGetItem, safeSetItem, safeRemoveItem, APP_LOGO_STORAGE_KEY } from './lib/storage';
import { Siswa, Presensi, SystemSettings, ActivityLog, User, WaliKelas } from './types';
import { isPresensiDateMatch, isPresensiMatchSiswa, getLocalDateString, normalizeDateKey, isSyntheticDemoPresensi, isRecordNewer, mergePresensiLists, safeAddDays } from './lib/attendanceUtils';
import Header from './components/Header';
import {
  fetchCloudMasterData,
  fetchFirestoreMasterFallback,
  subscribeToMultiDeviceSync,
  syncStudentsToCloud,
  syncWaliKelasToCloud,
  syncPresensiToCloud,
  recordSinglePresensiToCloud,
  deleteSinglePresensiFromCloud,
  syncSettingsToCloud,
  syncAccountsToCloud,
  forceSyncNow,
  auditAndSyncSemesterPresensi
} from './lib/cloudSync';
import {
  sendDualWhatsAppNotification,
  sendAutomaticWhatsAppNotification,
  resolveStudentForRecord
} from './lib/whatsappGateway';
import { 
  ensureAuthenticated, 
  validateFirestoreConnection,
  saveSiswaToFirestore, 
  deleteSiswaFromFirestore, 
  savePresensiShardToFirestore,
  deletePresensiShardFromFirestore,
  clearPresensiInFirestore, 
  saveAccountToFirestore, 
  deleteAccountFromFirestore, 
  clearActivityLogsInFirestore,
  syncAllStudentsToFirestore,
  syncMasterStudentsToCloud,
  syncMasterWaliKelasToCloud,
  fetchTodayShardOnce,
  fetchSettingsFromFirestoreOnce,
  DeletedTombstone,
  getIsReadQuotaExhausted,
  getIsWriteQuotaExhausted
} from './lib/firebase';
import {
  googleSignIn,
  logoutGoogle,
  initAuth,
  checkAndPrepareSpreadsheet,
  fetchStudentsFromSheet,
  syncStudentsToSheet,
  syncAttendanceToSheet,
  createNewSpreadsheet,
  uploadBackupFileToDrive
} from './lib/googleApi';
import LoginScreen from './components/LoginScreen';
import ScanScreen from './components/ScanScreen';
import AdminPanel from './components/AdminPanel';
import KepsekPanel from './components/KepsekPanel';
import GuruPanel from './components/GuruPanel';
import PiketPanel from './components/PiketPanel';
import WhatsAppSimulator from './components/WhatsAppSimulator';
import MascotPromoAssistant from './components/MascotPromoAssistant';
import ReportPanel from './components/ReportPanel';
import {
  FileText,
  BookOpen,
  Camera,
  Layers,
  HelpCircle,
  Smartphone,
  Database,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';

export default function App() {
  // Real-time local state engine backed by LocalStorage (auto-invalidates stale browser caches when catalog version advances)
  const [siswaList, setSiswaList] = useState<Siswa[]>(() => {
    const savedCatalogVer = Number(safeGetItem('karapres3_siswa_catalog_ver') || '0');
    if (savedCatalogVer >= STUDENT_CATALOG_VERSION) {
      const cached = safeGetItem('karapres3_siswa_v5');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }
    }
    safeSetItem('karapres3_siswa_v5', JSON.stringify(SISWA_INITIAL));
    safeSetItem('karapres3_siswa_catalog_ver', String(STUDENT_CATALOG_VERSION));
    return SISWA_INITIAL;
  });

  const PRESENSI_STORAGE_KEY = 'karapres3_presensi_v5';
  const DELETED_TOMBSTONES_STORAGE_KEY = 'karapres3_deleted_presensi_v1';

  const loadDeletedTombstones = (): Record<string, number> => {
    const raw = safeGetItem(DELETED_TOMBSTONES_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number' && v >= cutoff) {
            clean[k] = v;
          }
        }
        return clean;
      }
    } catch {}
    return {};
  };

  const persistDeletedTombstones = (map: Record<string, number>) => {
    const entries = Object.entries(map).slice(-500);
    const trimmed: Record<string, number> = {};
    for (const [k, v] of entries) {
      trimmed[k] = v;
    }
    safeSetItem(DELETED_TOMBSTONES_STORAGE_KEY, JSON.stringify(trimmed));
  };

  const toTombstoneArray = (map: Record<string, number>): DeletedTombstone[] => {
    return Object.entries(map)
      .slice(-250)
      .map(([key, ts]) => ({ key, ts }));
  };

  const persistPresensiToStorage = (records: Presensi[]) => {
    // Arsip historis Jul-Okt 2026 selalu tersedia instan dari PRESENSI_INITIAL di bundle;
    // LocalStorage hanya perlu menyimpan rekaman live & perubahan non-sintetis agar selalu ringan & bebas kuota penuh.
    const liveOrCustom = records
      .filter((p) => p && p.tanggal && (!isSyntheticDemoPresensi(p) || normalizeDateKey(p.tanggal) > HISTORICAL_ARCHIVE_END_DATE))
      .slice()
      .sort((a, b) => normalizeDateKey(a.tanggal).localeCompare(normalizeDateKey(b.tanggal)));

    if (safeSetItem(PRESENSI_STORAGE_KEY, JSON.stringify(liveOrCustom))) return;

    const fallbackCounts = [2000, 1000, 500];
    for (const cap of fallbackCounts) {
      const smaller = liveOrCustom.slice(-cap);
      if (safeSetItem(PRESENSI_STORAGE_KEY, JSON.stringify(smaller))) return;
    }
  };

  const arePresensiListsEqual = (a: Presensi[], b: Presensi[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (
        x.id !== y.id ||
        x.siswaId !== y.siswaId ||
        x.tanggal !== y.tanggal ||
        x.waktu !== y.waktu ||
        x.status !== y.status ||
        x.metode !== y.metode ||
        x.keterangan !== y.keterangan ||
        x.updatedAt !== y.updatedAt
      ) {
        return false;
      }
    }
    return true;
  };

  const [presensiList, setPresensiList] = useState<Presensi[]>(() => {
    const tombstones = loadDeletedTombstones();
    let cachedLive: Presensi[] = [];
    const cached = safeGetItem(PRESENSI_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedLive = parsed.filter((p: Presensi) => p && p.tanggal && !isSyntheticDemoPresensi(p));
        }
      } catch {}
    }
    const initialMerged = mergePresensiLists(PRESENSI_INITIAL, cachedLive, SISWA_INITIAL, tombstones);
    persistPresensiToStorage(initialMerged);
    return initialMerged;
  });

  const latestPresensiRef = useRef<Presensi[]>(presensiList);
  latestPresensiRef.current = presensiList;

  const latestSiswaRef = useRef<Siswa[]>(siswaList);
  latestSiswaRef.current = siswaList;

  const deletedTombstonesRef = useRef<Record<string, number>>(loadDeletedTombstones());

  const [settings, setSettings] = useState<SystemSettings>(() => {
    const cached = safeGetItem('karapres3_settings');
    const persistentLogo = safeGetItem(APP_LOGO_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (persistentLogo && !parsed.appLogoUrl) {
          parsed.appLogoUrl = persistentLogo;
        }
        if (parsed.googleDriveFolderId === '1tH9Q8u-CPlbN2bksIPh331uE_A8xN8B6') {
          parsed.googleDriveFolderId = '1RoPgYTYP3GqzcDhLv_xKJshIYRjQisoe';
          parsed.googleSpreadsheetId = '1V6IomZ0hR_E2N_lF5aK804-Oat_bVzNlW3O0Vj2vExF';
          safeSetItem('karapres3_settings', JSON.stringify(parsed));
          return parsed;
        }
        return parsed;
      } catch {}
    }
    return persistentLogo ? { ...SETTINGS_INITIAL, appLogoUrl: persistentLogo } : SETTINGS_INITIAL;
  });

  const latestSettingsRef = useRef<SystemSettings>(settings);
  latestSettingsRef.current = settings;

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => {
    const cached = safeGetItem('karapres3_logs');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return LOGS_INITIAL;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const cached = safeGetItem('karapres3_current_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return null;
  });

  const [accountsList, setAccountsList] = useState<{ user: User; pin: string }[]>(() => {
    const cached = safeGetItem('karapres3_accounts_v4');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Ensure new PINs starting with 280 exist in cached data
        const hasNewPins = parsed.some((acc: any) => acc.pin && acc.pin.startsWith('280'));
        if (hasNewPins && parsed.length >= USER_DEMO_ACCOUNTS.length) {
          return parsed;
        }
      } catch {}
    }
    safeSetItem('karapres3_accounts_v4', JSON.stringify(USER_DEMO_ACCOUNTS));
    return USER_DEMO_ACCOUNTS;
  });

  const [waliKelasList, setWaliKelasList] = useState<WaliKelas[]>(() => {
    const cached = safeGetItem('karapres3_wali_kelas_v1');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasOldNumbers = parsed.some((w: any) => w.noWa && (w.noWa.startsWith('08122334455') || w.noWa === '081299887766'));
          if (!hasOldNumbers) {
            return parsed;
          }
        }
      } catch {}
    }
    safeSetItem('karapres3_wali_kelas_v1', JSON.stringify(DAFTAR_WALI_KELAS));
    return DAFTAR_WALI_KELAS;
  });

  // Navigation tab for overall app modules
  const [currentView, setCurrentView] = useState<'scan' | 'manajemen' | 'laporan' | 'panduan'>('scan');

  // Track reactive WIB date key so midnight rollover re-attaches daily shards & slices automatically
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateString());

  useEffect(() => {
    const syncTodayKey = () => {
      const nextToday = getLocalDateString();
      setTodayKey((prev) => (prev === nextToday ? prev : nextToday));
    };
    const interval = setInterval(syncTodayKey, 60000);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncTodayKey);
      window.addEventListener('visibilitychange', syncTodayKey);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncTodayKey);
        window.removeEventListener('visibilitychange', syncTodayKey);
      }
    };
  }, []);

  // Lightweight slice of recent records for instant ScanScreen and live WhatsApp Simulator (Today + Yesterday + latest history)
  const recentPresensiSlice = useMemo(() => {
    const yesterdayKey = safeAddDays(todayKey, -1);
    const activeDatesRecs = presensiList.filter((p) => {
      if (!p || !p.tanggal) return false;
      const norm = normalizeDateKey(p.tanggal);
      return norm === todayKey || norm === yesterdayKey;
    });
    const otherRecs = presensiList.filter((p) => {
      if (!p || !p.tanggal) return true;
      const norm = normalizeDateKey(p.tanggal);
      return norm !== todayKey && norm !== yesterdayKey;
    });
    return [...otherRecs.slice(-400), ...activeDatesRecs];
  }, [presensiList, todayKey]);

  // Trigger sync state variables
  const [isSyncing, setIsSyncing] = useState(false);

  // Google auth actual credentials state hooks
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<any | null>(null);

  // Floating notices and modal helpers (iframe-safe)
  const [appNotice, setAppNotice] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [showClearPresensiConfirm, setShowClearPresensiConfirm] = useState(false);

  const triggerNotice = (message: string, type: 'success' | 'info' = 'success') => {
    setAppNotice({ message, type });
    setTimeout(() => setAppNotice(null), 4000);
  };

  // Listen to Google/Firebase auth initialization
  useEffect(() => {
    ensureAuthenticated().catch(() => {});
    const unsub = initAuth(
      (user, token) => {
        setGoogleToken(token);
        setGoogleUser(user);
        setSettings(prev => ({ ...prev, isGoogleConnected: true }));
      },
      () => {
        setGoogleToken(null);
        setGoogleUser(null);
        setSettings(prev => ({ ...prev, isGoogleConnected: false }));
      }
    );
    return () => {
      unsub();
    };
  }, []);

  const mergeIncomingDeletedKeys = (
    incomingDeletedKeys?: Record<string, number> | DeletedTombstone[]
  ) => {
    if (!incomingDeletedKeys) return;
    let changed = false;
    if (Array.isArray(incomingDeletedKeys)) {
      for (const item of incomingDeletedKeys) {
        if (item && typeof item.key === 'string' && typeof item.ts === 'number') {
          if ((deletedTombstonesRef.current[item.key] || 0) < item.ts) {
            deletedTombstonesRef.current[item.key] = item.ts;
            changed = true;
          }
        }
      }
    } else if (typeof incomingDeletedKeys === 'object') {
      for (const [k, v] of Object.entries(incomingDeletedKeys)) {
        if (typeof v === 'number' && (deletedTombstonesRef.current[k] || 0) < v) {
          deletedTombstonesRef.current[k] = v;
          changed = true;
        }
      }
    }
    if (changed) {
      persistDeletedTombstones(deletedTombstonesRef.current);
    }
  };

  // Multi-Device Cloud Synchronizer (Instant sync across Android, PC, Laptop, Tablet)
  useEffect(() => {
    let isMounted = true;
    const bootToday = getLocalDateString();
    validateFirestoreConnection().catch(() => {});

    // 1. Initial Cloud Master Load on Mount (Express server-first; single-read today shard recovery; Firestore fallback on static host)
    (async () => {
      const serverData = await fetchCloudMasterData();
      if (!isMounted) return;

      let fallbackData: Awaited<ReturnType<typeof fetchFirestoreMasterFallback>> = null;
      let shardSnap: { records: Presensi[]; deletedKeys: Record<string, number> } | null = null;
      let firestoreSettingsFromMount: SystemSettings | null = null;

      if (!serverData) {
        fallbackData = await fetchFirestoreMasterFallback(bootToday).catch(() => null);
      } else if (!getIsReadQuotaExhausted()) {
        const [todayShard, remoteSettings] = await Promise.all([
          fetchTodayShardOnce(bootToday).catch(() => ({ records: [] as Presensi[], deletedKeys: {} as Record<string, number> })),
          fetchSettingsFromFirestoreOnce().catch(() => null)
        ]);
        shardSnap = todayShard;
        firestoreSettingsFromMount = remoteSettings;
      }
      if (!isMounted) return;

      const data = serverData || fallbackData;
      const firestoreSettings = firestoreSettingsFromMount || fallbackData?.settings || null;

      let activeStudents = latestSiswaRef.current;
      const cloudStudents = data?.students;
      const cloudCatalogVer = data?.studentsCatalogVersion || 0;
      const isCloudStudentsAuthoritative =
        Array.isArray(cloudStudents) &&
        cloudStudents.length > 0 &&
        (cloudCatalogVer >= STUDENT_CATALOG_VERSION || cloudStudents.length >= SISWA_INITIAL.length);

      if (isCloudStudentsAuthoritative) {
        activeStudents = cloudStudents!;
        latestSiswaRef.current = activeStudents;
        setSiswaList(activeStudents);
        safeSetItem('karapres3_siswa_v5', JSON.stringify(activeStudents));
        safeSetItem('karapres3_siswa_catalog_ver', String(Math.max(STUDENT_CATALOG_VERSION, cloudCatalogVer)));
      }

      if (
        !serverData &&
        Array.isArray(cloudStudents) &&
        (cloudCatalogVer < STUDENT_CATALOG_VERSION || cloudStudents.length < SISWA_INITIAL.length) &&
        !safeGetItem('karapres3_students_429_synced_v26')
      ) {
        syncMasterStudentsToCloud(activeStudents, 'Sync Katalog PDF 429 Siswa')
          .then(() => safeSetItem('karapres3_students_429_synced_v26', '1'))
          .catch(() => {});
      }

      const incomingWaliKelas = data?.waliKelas;
      const isWaliKelasValid =
        Array.isArray(incomingWaliKelas) &&
        incomingWaliKelas.length >= 12 &&
        !incomingWaliKelas.some((w) => w.noWa && (w.noWa.startsWith('08122334455') || w.noWa === '081299887766'));

      if (isWaliKelasValid) {
        setWaliKelasList(incomingWaliKelas!);
        safeSetItem('karapres3_wali_kelas_v1', JSON.stringify(incomingWaliKelas));
      } else if (!serverData && Array.isArray(incomingWaliKelas) && !safeGetItem('karapres3_wali_kelas_12_synced')) {
        syncMasterWaliKelasToCloud(DAFTAR_WALI_KELAS, 'Sync 12 Wali Kelas Resmi')
          .then(() => safeSetItem('karapres3_wali_kelas_12_synced', '1'))
          .catch(() => {});
      }

      mergeIncomingDeletedKeys(data?.deletedKeys);
      mergeIncomingDeletedKeys(shardSnap?.deletedKeys);

      const serverPresensi = Array.isArray(serverData?.presensi) ? serverData!.presensi : [];
      const firestorePresensi = Array.isArray(fallbackData?.presensi) ? fallbackData!.presensi : [];
      const shardRecords = Array.isArray(shardSnap?.records) ? shardSnap!.records : [];

      const merged = mergePresensiLists(
        mergePresensiLists(PRESENSI_INITIAL, latestPresensiRef.current, activeStudents, deletedTombstonesRef.current),
        [...serverPresensi, ...firestorePresensi, ...shardRecords],
        activeStudents,
        deletedTombstonesRef.current
      );

      if (!arePresensiListsEqual(merged, latestPresensiRef.current)) {
        latestPresensiRef.current = merged;
        setPresensiList(merged);
        persistPresensiToStorage(merged);
      }

      const serverHasMissingCloud =
        Boolean(serverData) &&
        (firestorePresensi.length > 0 || shardRecords.length > 0) &&
        !arePresensiListsEqual(merged, serverPresensi);
      if (serverHasMissingCloud) {
        fetch('/api/sync/presensi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: merged,
            updatedBy: 'Cloud Merge Sync',
            deletedKeys: toTombstoneArray(deletedTombstonesRef.current)
          })
        }).catch(() => {});
      }

      // Timestamp-based arbitration for System Settings & Shift Schedules (works cleanly with or without Express server)
      const serverSettings = serverData?.settings;
      const serverTs = typeof serverSettings?.updatedAt === 'number' ? serverSettings.updatedAt : 0;
      const firestoreTs = typeof firestoreSettings?.updatedAt === 'number' ? firestoreSettings.updatedAt : 0;
      const localCurrent = latestSettingsRef.current;
      const localTs = typeof localCurrent?.updatedAt === 'number' ? localCurrent.updatedAt : 0;
      const persistentLogo = safeGetItem(APP_LOGO_STORAGE_KEY) || localCurrent?.appLogoUrl || undefined;

      const shouldAdoptFirestore =
        Boolean(firestoreSettings) &&
        (!serverSettings
          ? (firestoreTs >= localTs || localTs === 0)
          : (firestoreTs > serverTs && firestoreTs >= localTs));

      if (shouldAdoptFirestore && firestoreSettings) {
        const mergedRemote: SystemSettings = {
          ...SETTINGS_INITIAL,
          ...firestoreSettings,
          appLogoUrl: firestoreSettings.appLogoUrl || persistentLogo
        };
        latestSettingsRef.current = mergedRemote;
        setSettings(mergedRemote);
        safeSetItem('karapres3_settings', JSON.stringify(mergedRemote));
        if (serverData) {
          fetch('/api/sync/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: mergedRemote, updatedBy: 'Cloud Settings Recovery' })
          }).catch(() => {});
        }
      } else if (serverSettings && serverTs >= firestoreTs && (serverTs >= localTs || localTs === 0)) {
        const mergedServer: SystemSettings = {
          ...SETTINGS_INITIAL,
          ...serverSettings,
          appLogoUrl: serverSettings.appLogoUrl || persistentLogo
        };
        latestSettingsRef.current = mergedServer;
        setSettings(mergedServer);
        safeSetItem('karapres3_settings', JSON.stringify(mergedServer));
      }

      if (data?.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
        setAccountsList(data.accounts);
        safeSetItem('karapres3_accounts_v4', JSON.stringify(data.accounts));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real-time multi-device subscription (auto re-attaches daily shard listener if date rolls over past midnight WIB)
  useEffect(() => {
    let isMounted = true;
    const unsubMultiDevice = subscribeToMultiDeviceSync({
      onStudentsChange: (incomingStudents, catalogVersion) => {
        if (!isMounted) return;
        const isAuthoritative =
          incomingStudents &&
          Array.isArray(incomingStudents) &&
          incomingStudents.length > 0 &&
          ((catalogVersion || 0) >= STUDENT_CATALOG_VERSION || incomingStudents.length >= SISWA_INITIAL.length);
        if (isAuthoritative) {
          latestSiswaRef.current = incomingStudents;
          setSiswaList(incomingStudents);
          safeSetItem('karapres3_siswa_v5', JSON.stringify(incomingStudents));
          safeSetItem('karapres3_siswa_catalog_ver', String(Math.max(STUDENT_CATALOG_VERSION, catalogVersion || 0)));
        }
      },
      onWaliKelasChange: (incomingWaliKelas) => {
        if (!isMounted) return;
        const isValidWk =
          incomingWaliKelas &&
          Array.isArray(incomingWaliKelas) &&
          incomingWaliKelas.length >= 12 &&
          !incomingWaliKelas.some((w) => w.noWa && (w.noWa.startsWith('08122334455') || w.noWa === '081299887766'));
        if (isValidWk) {
          setWaliKelasList(incomingWaliKelas);
          safeSetItem('karapres3_wali_kelas_v1', JSON.stringify(incomingWaliKelas));
        }
      },
      onPresensiChange: (incomingPresensi, _updatedAt, incomingDeletedKeys) => {
        if (!isMounted) return;
        mergeIncomingDeletedKeys(incomingDeletedKeys);
        const validIncoming = Array.isArray(incomingPresensi)
          ? incomingPresensi.filter((p) => !isSyntheticDemoPresensi(p))
          : [];
        if (validIncoming.length === 0 && !incomingDeletedKeys) return;

        const merged = mergePresensiLists(
          latestPresensiRef.current,
          validIncoming,
          latestSiswaRef.current,
          deletedTombstonesRef.current
        );

        if (!arePresensiListsEqual(merged, latestPresensiRef.current)) {
          latestPresensiRef.current = merged;
          setPresensiList(merged);
          persistPresensiToStorage(merged);
        }
      },
      onSettingsChange: (incomingSettings) => {
        if (!isMounted) return;
        if (incomingSettings) {
          const currentTs = typeof latestSettingsRef.current?.updatedAt === 'number' ? latestSettingsRef.current.updatedAt : 0;
          const incomingTs = typeof incomingSettings.updatedAt === 'number' ? incomingSettings.updatedAt : 0;
          if (currentTs > 0 && incomingTs < currentTs) {
            return;
          }
          if (incomingSettings.appLogoUrl) {
            safeSetItem(APP_LOGO_STORAGE_KEY, incomingSettings.appLogoUrl);
          }
          const persistentLogo = incomingSettings.appLogoUrl || latestSettingsRef.current?.appLogoUrl || safeGetItem(APP_LOGO_STORAGE_KEY) || undefined;
          const nextSettings: SystemSettings = { ...SETTINGS_INITIAL, ...incomingSettings, appLogoUrl: persistentLogo };
          latestSettingsRef.current = nextSettings;
          setSettings(nextSettings);
          safeSetItem('karapres3_settings', JSON.stringify(nextSettings));
        }
      },
      onAccountsChange: (incomingAccounts) => {
        if (!isMounted) return;
        if (incomingAccounts && Array.isArray(incomingAccounts) && incomingAccounts.length > 0) {
          setAccountsList(incomingAccounts);
          safeSetItem('karapres3_accounts_v4', JSON.stringify(incomingAccounts));
        }
      }
    }, { activeDate: todayKey });

    return () => {
      isMounted = false;
      unsubMultiDevice();
    };
  }, [todayKey]);

  // Sync state modifications to Web Storage
  useEffect(() => {
    safeSetItem('karapres3_siswa_v5', JSON.stringify(siswaList));
  }, [siswaList]);

  useEffect(() => {
    safeSetItem('karapres3_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    safeSetItem('karapres3_logs', JSON.stringify(activityLogs));
  }, [activityLogs]);

  useEffect(() => {
    safeSetItem('karapres3_accounts_v4', JSON.stringify(accountsList));
  }, [accountsList]);

  useEffect(() => {
    if (currentUser) {
      safeSetItem('karapres3_current_user', JSON.stringify(currentUser));
    } else {
      safeRemoveItem('karapres3_current_user');
    }
  }, [currentUser]);

  // Activity logger helper (kept local to conserve cloud write quota)
  const addActivityLog = useCallback((tindakan: string, detail: string) => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      waktu: new Date().toISOString(),
      user: currentUser ? currentUser.namaLengkap : 'Sistem Otomatis',
      role: currentUser ? currentUser.role : 'piket',
      tindakan,
      detail,
    };
    setActivityLogs(prev => [newLog, ...prev.slice(0, 499)]);
  }, [currentUser]);

  const handleUpdateAccount = useCallback((userId: string, updatedUser: Partial<User>, newPin?: string) => {
    const old = accountsList.find(acc => acc.user.id === userId);
    if (old) {
      const mergedUser = { ...old.user, ...updatedUser };
      const mergedPin = newPin !== undefined ? newPin : old.pin;
      const newList = accountsList.map(acc => acc.user.id === userId ? { user: mergedUser, pin: mergedPin } : acc);
      setAccountsList(newList);
      safeSetItem('karapres3_accounts_v4', JSON.stringify(newList));
      saveAccountToFirestore({ user: mergedUser, pin: mergedPin });
      syncAccountsToCloud(newList, 'Admin');
      addActivityLog('Update Akun', `Merubah detail profil akun: ${updatedUser.namaLengkap || userId}`);
      triggerNotice('Akun berhasil diperbarui & disinkronkan ke seluruh perangkat.', 'success');
    }
  }, [accountsList, addActivityLog]);

  const handleAddAccount = useCallback((user: User, pin: string) => {
    const newList = [...accountsList.filter(a => a.user.id !== user.id), { user, pin }];
    setAccountsList(newList);
    safeSetItem('karapres3_accounts_v4', JSON.stringify(newList));
    saveAccountToFirestore({ user, pin });
    syncAccountsToCloud(newList, 'Admin');
    addActivityLog('Tambah Akun Baru', `Membuat akun operator baru: ${user.namaLengkap} [${user.role.toUpperCase()}]`);
    triggerNotice('Akun baru berhasil ditambahkan & disinkronkan.', 'success');
  }, [accountsList, addActivityLog]);

  const handleDeleteAccount = useCallback((userId: string) => {
    if (currentUser && currentUser.id === userId) {
      triggerNotice('Tidak dapat menghapus akun Anda sendiri!', 'info');
      return;
    }
    const newList = accountsList.filter(a => a.user.id !== userId);
    setAccountsList(newList);
    safeSetItem('karapres3_accounts_v4', JSON.stringify(newList));
    deleteAccountFromFirestore(userId);
    syncAccountsToCloud(newList, 'Admin');
    addActivityLog('Hapus Akun', `Menghapus akun operator ID: ${userId}`);
    triggerNotice('Akun berhasil dihapus & disinkronkan.', 'success');
  }, [currentUser, accountsList, addActivityLog]);

  const handleLogin = useCallback((user: User) => {
    // Make sure we load the dynamic updated user from our accounts list so details are correct
    const latestAccount = accountsList.find(acc => acc.user.username.toLowerCase() === user.username.toLowerCase());
    const userToLogin = latestAccount ? latestAccount.user : user;

    setCurrentUser(userToLogin);
    // Auto redirect to appropriate panel depending on major role
    if (userToLogin.role === 'admin' || userToLogin.role === 'kepsek' || userToLogin.role === 'guru') {
      setCurrentView('manajemen');
    } else {
      setCurrentView('scan');
    }
    
    // Add audit trail log
    addActivityLog('Login Terverifikasi', `Operator: ${userToLogin.namaLengkap} masuk sebagai [${userToLogin.role.toUpperCase()}]`);
  }, [accountsList, addActivityLog]);

  const handleLogout = useCallback(() => {
    if (currentUser) {
      addActivityLog('Logout Berhasil', `Operator ${currentUser.namaLengkap} keluar dari sistem.`);
    }
    setCurrentUser(null);
    setCurrentView('scan');
  }, [currentUser, addActivityLog]);

  // Google connection handlers
  const handleConnectGoogle = useCallback(async () => {
    try {
      setIsSyncing(true);
      const { user, accessToken } = await googleSignIn();
      setGoogleToken(accessToken);
      setGoogleUser(user);
      setSettings(prev => ({ ...prev, isGoogleConnected: true }));
      addActivityLog('Koneksi Google Sukses', `Menghubungkan akun Google: ${user.email}`);
      triggerNotice('Berhasil menghubungkan akun Google!', 'success');
      
      // Auto-sync initial data after linking successfully!
      setTimeout(() => {
        syncAllDataToGoogle(accessToken, false);
      }, 500);
    } catch (err: any) {
      console.error('Google link error:', err);
      triggerNotice(`Gagal menghubungkan Google: ${err.message || 'Dibatalkan'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [addActivityLog]);

  const handleDisconnectGoogle = useCallback(async () => {
    try {
      await logoutGoogle();
      setGoogleToken(null);
      setGoogleUser(null);
      setSettings(prev => ({ ...prev, isGoogleConnected: false }));
      addActivityLog('Koneksi Google Terputus', 'Memutuskan akun Google Cloud dari aplikasi.');
      triggerNotice('Akun Google berhasil terputus.', 'info');
    } catch (err: any) {
      console.error('Logout error:', err);
      triggerNotice('Gagal logout Google.');
    }
  }, [addActivityLog]);

  const syncAllDataToGoogle = useCallback(async (token: string, silent = false): Promise<boolean> => {
    try {
      if (!silent) setIsSyncing(true);
      
      if (!settings.googleSpreadsheetId) {
        if (!silent) triggerNotice('Google Spreadsheet ID belum dikonfigurasi.', 'info');
        return false;
      }

      // Check and prepare the spreadsheet (setup sheets 'Siswa' & 'Presensi')
      const checkRes = await checkAndPrepareSpreadsheet(token, settings.googleSpreadsheetId);
      if (!checkRes.success) {
        if (!silent) {
          triggerNotice(`Gagal menyiapkan spreadsheet: ${checkRes.error}`, 'info');
        }
        return false;
      }

      // 1. Sync students sheet
      const siswaOk = await syncStudentsToSheet(token, settings.googleSpreadsheetId, siswaList);
      if (!siswaOk) {
        if (!silent) triggerNotice('Gagal sinkron data daftar siswa.', 'info');
        return false;
      }

      // 2. Sync attendance sheet
      const presensiOk = await syncAttendanceToSheet(token, settings.googleSpreadsheetId, presensiList);
      if (!presensiOk) {
        if (!silent) triggerNotice('Gagal sinkron data catat-kehadiran.', 'info');
        return false;
      }

      addActivityLog('Google Sync Berhasil', `Mencadangkan ${siswaList.length} siswa & ${presensiList.length} riwayat ke Google Jurnal.`);
      if (!silent) {
        triggerNotice('Sinkronisasi Google Sheets berhasil ter-update!', 'success');
      }
      return true;
    } catch (err: any) {
      console.error('Sync error:', err);
      if (!silent) {
        triggerNotice(`Kendala Sinkronisasi: ${err.message || 'Kesalahan'}`);
      }
      return false;
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, [settings.googleSpreadsheetId, siswaList, presensiList, addActivityLog]);

  const handleCreateNewSpreadsheet = useCallback(async (): Promise<string> => {
    if (!googleToken) {
      throw new Error('Harap hubungkan akun Google terlebih dahulu.');
    }
    setIsSyncing(true);
    try {
      const title = `DIGIWANGI 3 SDN 3 Karamatwangi - Database Kehadiran`;
      const newId = await createNewSpreadsheet(googleToken, title);
      addActivityLog('Spreadsheet Baru', `Membuat spreadsheet Google baru dengan ID: ${newId}`);
      
      // Update settings
      setSettings(prev => {
        const updated = { ...prev, googleSpreadsheetId: newId };
        safeSetItem('karapres3_settings', JSON.stringify(updated));
        return updated;
      });

      // Sync initial data right away!
      setTimeout(() => {
        syncAllDataToGoogle(googleToken, true);
      }, 500);

      return newId;
    } catch (err: any) {
      console.error('Failed to create sheet:', err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [googleToken, addActivityLog, syncAllDataToGoogle]);

  const handleBackupToDrive = useCallback(async () => {
    if (!googleToken) {
      triggerNotice('Harap hubungkan akun Google Anda terlebih dahulu.', 'info');
      return;
    }
    if (!settings.googleDriveFolderId) {
      triggerNotice('ID Folder Google Drive belum ditentukan di pengaturan.', 'info');
      return;
    }

    try {
      setIsSyncing(true);
      // Generate CSV content
      const headers = ['ID Presensi', 'ID Siswa', 'NIS', 'Nama Siswa', 'Kelas', 'Tanggal', 'Waktu', 'Status', 'WA Status', 'Operator'];
      const rows = presensiList.map(p => [
        p.id, p.siswaId, p.nis, p.nama, p.kelas, p.tanggal, p.waktu, p.status, p.waStatus, p.operator
      ]);
      const csvStr = [headers.join(','), ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
      
      const fileName = `DIGIWANGI3_BAK_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      
      const fileId = await uploadBackupFileToDrive(googleToken, settings.googleDriveFolderId, fileName, csvStr);
      addActivityLog('Arsip Drive Berhasil', `Membuat cadangan CSV di Google Drive, ID file: ${fileId}`);
      triggerNotice(`Berhasil membuat arsip cadangan di Google Drive: ${fileName}`, 'success');
    } catch (err: any) {
      console.error('Backup error:', err);
      triggerNotice(`Gagal upload arsip Drive: ${err.message || 'Kesalahan'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [googleToken, settings.googleDriveFolderId, presensiList, addActivityLog]);

  const handleCloudSyncRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      const refreshed = await forceSyncNow({
        onStudentsChange: (incomingStudents, catalogVersion) => {
          const isAuthoritative =
            incomingStudents &&
            incomingStudents.length > 0 &&
            ((catalogVersion || 0) >= STUDENT_CATALOG_VERSION || incomingStudents.length >= SISWA_INITIAL.length);
          if (isAuthoritative) {
            latestSiswaRef.current = incomingStudents;
            setSiswaList(incomingStudents);
            safeSetItem('karapres3_siswa_v5', JSON.stringify(incomingStudents));
            safeSetItem('karapres3_siswa_catalog_ver', String(Math.max(STUDENT_CATALOG_VERSION, catalogVersion || 0)));
          }
        },
        onWaliKelasChange: (incomingWaliKelas) => {
          const isValidWk =
            incomingWaliKelas &&
            incomingWaliKelas.length >= 12 &&
            !incomingWaliKelas.some((w) => w.noWa && (w.noWa.startsWith('08122334455') || w.noWa === '081299887766'));
          if (isValidWk) {
            setWaliKelasList(incomingWaliKelas);
            safeSetItem('karapres3_wali_kelas_v1', JSON.stringify(incomingWaliKelas));
          }
        },
        onPresensiChange: (incomingPresensi, _updatedAt, incomingDeletedKeys) => {
          mergeIncomingDeletedKeys(incomingDeletedKeys);
          if (incomingPresensi) {
            const merged = mergePresensiLists(
              latestPresensiRef.current,
              incomingPresensi,
              latestSiswaRef.current,
              deletedTombstonesRef.current
            );
            latestPresensiRef.current = merged;
            setPresensiList(merged);
            persistPresensiToStorage(merged);
          }
        },
        onSettingsChange: (incomingSettings) => {
          if (incomingSettings) {
            const currentTs = typeof latestSettingsRef.current?.updatedAt === 'number' ? latestSettingsRef.current.updatedAt : 0;
            const incomingTs = typeof incomingSettings.updatedAt === 'number' ? incomingSettings.updatedAt : 0;
            if (currentTs > 0 && incomingTs < currentTs) {
              return;
            }
            if (incomingSettings.appLogoUrl) {
              safeSetItem(APP_LOGO_STORAGE_KEY, incomingSettings.appLogoUrl);
            }
            const persistentLogo = incomingSettings.appLogoUrl || latestSettingsRef.current?.appLogoUrl || safeGetItem(APP_LOGO_STORAGE_KEY) || undefined;
            const nextSettings: SystemSettings = { ...SETTINGS_INITIAL, ...incomingSettings, appLogoUrl: persistentLogo };
            latestSettingsRef.current = nextSettings;
            setSettings(nextSettings);
            safeSetItem('karapres3_settings', JSON.stringify(nextSettings));
          }
        },
        onAccountsChange: (incomingAccounts) => {
          if (incomingAccounts && incomingAccounts.length > 0) {
            setAccountsList(incomingAccounts);
            safeSetItem('karapres3_accounts_v4', JSON.stringify(incomingAccounts));
          }
        }
      });
      if (refreshed) {
        triggerNotice('Sinkronisasi multi-perangkat berhasil! Data terkini telah dimuat.', 'success');
      } else {
        triggerNotice('Data sudah tersinkronisasi dengan server.', 'info');
      }
    } catch {
      triggerNotice('Gagal melakukan sinkronisasi data', 'info');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const [isSyncingPresensi, setIsSyncingPresensi] = useState(false);

  const handleSynchronizeSemesterPresensi = useCallback(async () => {
    setIsSyncingPresensi(true);
    try {
      const res = await auditAndSyncSemesterPresensi(presensiList, siswaList, currentUser?.namaLengkap || 'Operator Laporan');
      if (res && res.synchronizedRecords && res.synchronizedRecords.length > 0) {
        const merged = mergePresensiLists(
          res.synchronizedRecords,
          latestPresensiRef.current,
          siswaList,
          deletedTombstonesRef.current
        );
        latestPresensiRef.current = merged;
        setPresensiList(merged);
        persistPresensiToStorage(merged);
        triggerNotice(`Presensi berhasil disinkronkan! ${merged.length} rekaman di ${res.totalDays} hari sekolah Semester 1 telah sinkron 100%.`, 'success');
        addActivityLog('Sinkronisasi Presensi', `Menyinkronkan dan memperbaiki ${merged.length} rekaman presensi semester (${res.totalDays} hari efektif).`);
      }
    } catch (err: any) {
      console.error('Error during audit and sync:', err);
      triggerNotice(`Gagal sinkronisasi: ${err.message || 'Kesalahan jaringan'}`, 'info');
    } finally {
      setIsSyncingPresensi(false);
    }
  }, [presensiList, siswaList, currentUser, addActivityLog]);

  const handleGoogleManualSync = useCallback(async (): Promise<boolean> => {
    if (!googleToken) {
      triggerNotice('Hubungkan Akun Google terlebih dahulu di menu Admin > Google Cloud Sync.', 'info');
      setCurrentView('manajemen');
      return false;
    }
    return syncAllDataToGoogle(googleToken, false);
  }, [googleToken, syncAllDataToGoogle]);

  const handleSyncFromGoogle = useCallback(async (): Promise<boolean> => {
    if (!settings.googleSpreadsheetId) {
      triggerNotice('Google Spreadsheet ID belum dikonfigurasi di menu Admin.', 'info');
      setCurrentView('manajemen');
      return false;
    }

    try {
      setIsSyncing(true);
      const res = await fetchStudentsFromSheet(googleToken, settings.googleSpreadsheetId);

      if (!res.success || !res.students) {
        triggerNotice(`Gagal sinkron dari Google Spreadsheet: ${res.error || 'Data tidak ditemukan'}`, 'info');
        return false;
      }

      const updatedStudents = res.students;
      setSiswaList(updatedStudents);
      safeSetItem('karapres3_siswa_v5', JSON.stringify(updatedStudents));

      // Batch sync to Firestore cloud database
      await syncAllStudentsToFirestore(updatedStudents);

      addActivityLog(
        'Sinkron Google Spreadsheet',
        `Menyinkronkan ${updatedStudents.length} data siswa terupdate dari Google Spreadsheet ke database.`
      );
      triggerNotice(`Berhasil menyinkronkan ${updatedStudents.length} data siswa terupdate dari Google Spreadsheet!`, 'success');
      return true;
    } catch (err: any) {
      console.error('Fetch students error:', err);
      triggerNotice(`Gagal menyinkronkan data siswa: ${err.message || 'Kesalahan'}`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [settings.googleSpreadsheetId, googleToken, addActivityLog]);

  // Student CRUD actions
  const handleAddSiswa = useCallback((newSiswa: Siswa) => {
    setSiswaList(prev => {
      const updated = [newSiswa, ...prev.filter(s => s.id !== newSiswa.id)];
      safeSetItem('karapres3_siswa_v5', JSON.stringify(updated));
      syncStudentsToCloud(updated, 'Admin');
      return updated;
    });
    saveSiswaToFirestore(newSiswa);
    addActivityLog('Menambah Siswa', `Mendaftarkan siswa baru: ${newSiswa.nama} (NIS ${newSiswa.nis}) di ${newSiswa.kelas}`);
    triggerNotice(`Siswa ${newSiswa.nama} (${newSiswa.kelas}) berhasil ditambahkan & disinkronkan ke seluruh perangkat!`, 'success');
  }, [addActivityLog]);

  const handleUpdateSiswa = useCallback((updated: Siswa) => {
    setSiswaList(prev => {
      const newList = prev.map(s => s.id === updated.id ? updated : s);
      safeSetItem('karapres3_siswa_v5', JSON.stringify(newList));
      syncStudentsToCloud(newList, 'Admin');
      return newList;
    });
    saveSiswaToFirestore(updated);
    addActivityLog('Update Siswa', `Mengubah data/kelas: ${updated.nama} (NIS ${updated.nis}) ➔ ${updated.kelas}`);
    triggerNotice(`Data ${updated.nama} (${updated.kelas}) berhasil disimpan & disinkronkan ke seluruh perangkat!`, 'success');
  }, [addActivityLog]);

  const handleDeleteSiswa = useCallback((id: string) => {
    setSiswaList(prev => {
      const matched = prev.find((s) => s.id === id);
      if (matched) {
        addActivityLog('Hapus Siswa', `Menghapus pendaftaran: ${matched.nama} (NIS ${matched.nis})`);
      }
      const newList = prev.filter(s => s.id !== id);
      safeSetItem('karapres3_siswa_v5', JSON.stringify(newList));
      syncStudentsToCloud(newList, 'Admin');
      return newList;
    });
    deleteSiswaFromFirestore(id);
    triggerNotice('Data siswa berhasil dihapus dari sistem & disinkronkan.', 'info');
  }, [addActivityLog]);

  // Wali Kelas CRUD action
  const handleUpdateWaliKelas = useCallback((updatedList: WaliKelas[]) => {
    setWaliKelasList(updatedList);
    safeSetItem('karapres3_wali_kelas_v1', JSON.stringify(updatedList));
    syncWaliKelasToCloud(updatedList, 'Admin');
    addActivityLog('Update Wali Kelas', `Memperbarui data dan nomor WhatsApp wali kelas`);
    triggerNotice('Data & Nomor WhatsApp Wali Kelas berhasil disimpan & disinkronkan ke semua perangkat!', 'success');
  }, [addActivityLog]);

  // Batch update student WhatsApp numbers (e.g. from Class WhatsApp manager)
  const handleBatchUpdateStudentWa = useCallback((updates: { id: string; waOrangTua: string }[]) => {
    setSiswaList(prev => {
      const map = new Map(updates.map(u => [u.id, u.waOrangTua]));
      const newList = prev.map(s => map.has(s.id) ? { ...s, waOrangTua: map.get(s.id)! } : s);
      safeSetItem('karapres3_siswa_v5', JSON.stringify(newList));
      syncStudentsToCloud(newList, 'Admin');
      return newList;
    });
    addActivityLog('Update WA Siswa', `Memperbarui ${updates.length} nomor WhatsApp wali murid`);
    triggerNotice(`${updates.length} Nomor WhatsApp wali murid berhasil disimpan & disinkronkan ke seluruh perangkat!`, 'success');
  }, [addActivityLog]);

  // Settings Save action
  const handleSaveSettings = useCallback((newSettings: SystemSettings) => {
    const stampedSettings: SystemSettings = {
      ...newSettings,
      updatedAt: Date.now()
    };
    if (stampedSettings.appLogoUrl) {
      safeSetItem(APP_LOGO_STORAGE_KEY, stampedSettings.appLogoUrl);
    }
    latestSettingsRef.current = stampedSettings;
    setSettings(stampedSettings);
    safeSetItem('karapres3_settings', JSON.stringify(stampedSettings));
    syncSettingsToCloud(stampedSettings, 'Admin');
    addActivityLog('Konfigurasi Diperbarui', 'Mengubah konfigurasi jam masuk, jadwal shift, template WA, logo resmi, atau ID integrasi Google.');
    triggerNotice('Pengaturan sistem & jadwal presensi berhasil disimpan paten ke seluruh perangkat.', 'success');
  }, [addActivityLog]);

  const handleUpdatePresensiWaStatus = useCallback((
    updates: Array<{ id: string; siswaId: string; tanggal: string; waStatus: 'Pending' | 'Terkirim' | 'Gagal'; phone: string }>
  ) => {
    if (!updates || updates.length === 0) return;
    const byId = new Map<string, { waStatus: 'Pending' | 'Terkirim' | 'Gagal'; phone: string }>();
    const byKey = new Map<string, { waStatus: 'Pending' | 'Terkirim' | 'Gagal'; phone: string }>();
    updates.forEach((u) => {
      if (u.id) byId.set(u.id, { waStatus: u.waStatus, phone: u.phone });
      if (u.siswaId && u.tanggal) {
        byKey.set(`${u.siswaId}__${normalizeDateKey(u.tanggal)}`, { waStatus: u.waStatus, phone: u.phone });
      }
    });

    const nowTs = Date.now();
    const changedRecords: Presensi[] = [];
    const nextList = latestPresensiRef.current.map((p) => {
      const hit = byId.get(p.id) || byKey.get(`${p.siswaId}__${normalizeDateKey(p.tanggal)}`);
      if (!hit) return p;
      const nextPesan =
        hit.waStatus === 'Terkirim'
          ? `Terkirim ke WA Ortu (${hit.phone})`
          : hit.waStatus === 'Gagal'
          ? (hit.phone ? `Gagal kirim ke (${hit.phone})` : 'No WA Orang Tua belum diisi')
          : `Antrean WA Ortu (${hit.phone})`;
      if (p.waStatus === hit.waStatus && p.pesanTerkirim === nextPesan) return p;
      const updatedRec: Presensi = {
        ...p,
        waStatus: hit.waStatus,
        pesanTerkirim: nextPesan,
        updatedAt: nowTs
      };
      changedRecords.push(updatedRec);
      return updatedRec;
    });

    if (changedRecords.length === 0) return;
    latestPresensiRef.current = nextList;
    persistPresensiToStorage(nextList);
    setPresensiList(nextList);

    const operatorName = currentUser?.namaLengkap || 'Operator WA Gateway';
    changedRecords.slice(0, 60).forEach((rec) => {
      savePresensiShardToFirestore(rec).catch(() => {});
      recordSinglePresensiToCloud(rec, operatorName).catch(() => {});
    });
  }, [currentUser]);

  // Record a scanned or manually marked attendance (100% atomic, side-effect-free state update)
  const handleAddPresensi = useCallback((newPresensi: Presensi) => {
    const targetNormDate = normalizeDateKey(newPresensi.tanggal);
    const activeStudents = latestSiswaRef.current;

    // Sequential student resolution: prioritize explicit siswaId & nama+kelas FIRST (prevents duplicate-NIS collisions)
    const matchedSiswa = resolveStudentForRecord(newPresensi, activeStudents);

    const canonicalSiswaId = matchedSiswa?.id || newPresensi.siswaId;
    const canonicalId = newPresensi.id && !/^pr-\d{4}-\d{2}-\d{2}-sis-/.test(newPresensi.id)
      ? newPresensi.id
      : `pr-${canonicalSiswaId}-${targetNormDate}`;

    const enrichedPresensi: Presensi = {
      ...newPresensi,
      id: canonicalId,
      siswaId: canonicalSiswaId,
      nis: matchedSiswa?.nis || newPresensi.nis,
      nik: matchedSiswa?.nik || newPresensi.nik,
      nama: matchedSiswa?.nama || newPresensi.nama,
      kelas: matchedSiswa?.kelas || newPresensi.kelas,
      tanggal: targetNormDate,
      updatedAt: typeof newPresensi.updatedAt === 'number' ? newPresensi.updatedAt : Date.now(),
    };

    // Hapus tombstone lama jika siswa kembali discan/ditap pada tanggal ini
    delete deletedTombstonesRef.current[`${canonicalSiswaId}__${targetNormDate}`];
    if (newPresensi.siswaId) {
      delete deletedTombstonesRef.current[`${newPresensi.siswaId}__${targetNormDate}`];
    }
    if (!matchedSiswa && enrichedPresensi.nis && enrichedPresensi.nis.trim().length >= 4) {
      delete deletedTombstonesRef.current[`${enrichedPresensi.nis.trim()}__${targetNormDate}`];
    }
    persistDeletedTombstones(deletedTombstonesRef.current);

    const updatedList = mergePresensiLists(
      latestPresensiRef.current,
      [enrichedPresensi],
      activeStudents,
      deletedTombstonesRef.current
    );
    latestPresensiRef.current = updatedList;
    persistPresensiToStorage(updatedList);
    setPresensiList(updatedList);

    const operatorName = currentUser?.namaLengkap || 'Scanner Piket';
    // Atomic 1-doc daily shard write + instant Express server sync (cuts Firestore writes by ~85% per scan)
    savePresensiShardToFirestore(enrichedPresensi).catch(() => {});
    recordSinglePresensiToCloud(enrichedPresensi, operatorName).catch(() => {});

    // Automatically dispatch WhatsApp notification directly & exclusively to Parents and sync honest delivery status
    sendAutomaticWhatsAppNotification(enrichedPresensi, matchedSiswa, settings)
      .then((waRes) => {
        const mappedStatus: 'Pending' | 'Terkirim' | 'Gagal' =
          waRes.deliveryStatus === 'DELIVERED' || waRes.deliveryStatus === 'SENT'
            ? 'Terkirim'
            : waRes.deliveryStatus === 'FAILED'
            ? 'Gagal'
            : 'Pending';
        const statusMsg =
          mappedStatus === 'Terkirim'
            ? `Terkirim ke WA Ortu (${waRes.phone})`
            : mappedStatus === 'Gagal'
            ? (waRes.error || (waRes.phone ? `Gagal kirim ke (${waRes.phone})` : 'No WA Orang Tua belum diisi'))
            : `Siap kirim ke WA Ortu (${waRes.phone})`;

        if (mappedStatus !== enrichedPresensi.waStatus || statusMsg !== enrichedPresensi.pesanTerkirim) {
          const syncedRecord: Presensi = {
            ...enrichedPresensi,
            waStatus: mappedStatus,
            pesanTerkirim: statusMsg,
            updatedAt: Date.now()
          };
          const syncedList = mergePresensiLists(
            latestPresensiRef.current,
            [syncedRecord],
            latestSiswaRef.current,
            deletedTombstonesRef.current
          );
          latestPresensiRef.current = syncedList;
          persistPresensiToStorage(syncedList);
          setPresensiList(syncedList);
          recordSinglePresensiToCloud(syncedRecord, operatorName).catch(() => {});
          if (mappedStatus === 'Terkirim') {
            savePresensiShardToFirestore(syncedRecord).catch(() => {});
          }
        }
      })
      .catch((err) => {
        console.warn('[WA Gateway Warning]:', err);
      });

    const metodeInfo = enrichedPresensi.metode === 'QR_SCAN' ? 'Scan Barcode QR' : (enrichedPresensi.metode === 'MANUAL_TAP' ? 'Tap Wali Kelas' : 'Input Manual');
    addActivityLog('Presensi Berhasil', `Mencatat status [${enrichedPresensi.status}] (${metodeInfo}) untuk ${enrichedPresensi.nama} (${enrichedPresensi.kelas}) ➔ Diproses ke WA Orang Tua`);
  }, [currentUser, settings, addActivityLog]);

  // Reset / batalkan satu presensi siswa pada tanggal tertentu (oleh Wali Kelas)
  const handleDeletePresensi = useCallback((siswa: Siswa, targetDate: string, recordId?: string) => {
    const normDate = normalizeDateKey(targetDate);
    const nowTs = Date.now();
    const sid = siswa.id || siswa.nis || siswa.nama;
    deletedTombstonesRef.current[`${sid}__${normDate}`] = nowTs;
    if (!siswa.id && siswa.nis && siswa.nis.trim().length >= 4) {
      deletedTombstonesRef.current[`${siswa.nis.trim()}__${normDate}`] = nowTs;
    }
    persistDeletedTombstones(deletedTombstonesRef.current);

    const filtered = latestPresensiRef.current.filter((p) => {
      if (recordId && p.id === recordId) return false;
      const pDate = normalizeDateKey(p.tanggal);
      if (pDate !== normDate) return true;
      if (p.siswaId && siswa.id && p.siswaId === siswa.id) return false;
      const hasDistinctIds = Boolean(p.siswaId && siswa.id && p.siswaId !== siswa.id);
      if (!hasDistinctIds && p.nis && siswa.nis && p.nis.trim().length >= 4 && p.nis.trim() === siswa.nis.trim()) {
        return false;
      }
      if (!hasDistinctIds && p.nama === siswa.nama && p.kelas === siswa.kelas) return false;
      return true;
    });

    const updatedList = mergePresensiLists(
      [],
      filtered,
      latestSiswaRef.current,
      deletedTombstonesRef.current
    );
    latestPresensiRef.current = updatedList;
    persistPresensiToStorage(updatedList);
    setPresensiList(updatedList);

    const operatorName = currentUser?.namaLengkap || 'Wali Kelas';
    if (siswa.id) {
      deletePresensiShardFromFirestore(siswa.id, normDate).catch(() => {});
    }
    deleteSinglePresensiFromCloud(
      { recordId, siswaId: siswa.id, tanggal: normDate },
      operatorName
    ).catch(() => {});

    addActivityLog('Reset Presensi Siswa', `Mengembalikan status presensi ${siswa.nama} (${siswa.kelas}) tanggal ${normDate} menjadi Belum Absen.`);
    triggerNotice(`Status presensi ${siswa.nama} dikembalikan menjadi Belum Absen.`, 'info');
  }, [currentUser, addActivityLog]);

  // Quick reset logs
  const handleClearLogs = useCallback(() => {
    clearActivityLogsInFirestore(activityLogs);
    triggerNotice('Log jejak aktivitas audit sistem berhasil dibersihkan.');
  }, [activityLogs]);

  const handleClearPresensiToday = () => {
    setShowClearPresensiConfirm(true);
  };

  const isQuotaExhausted = getIsReadQuotaExhausted() || getIsWriteQuotaExhausted();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-200">
      
      {/* Header bar */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        isGoogleConnected={settings.isGoogleConnected}
        isWhatsAppConnected={settings.isWhatsAppConnected}
        onSyncNow={handleCloudSyncRefresh}
        isSyncing={isSyncing}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        isQuotaExhausted={isQuotaExhausted}
      />

      {/* Slogan Ticker Bar under Header for Premium Vibe */}
      <div className="bg-gradient-to-r from-amber-500/10 via-blue-500/10 to-indigo-500/10 border-b border-slate-200 py-2.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-500">
            <span>SDN 3 Karamatwangi, Cisurupan, Garut</span>
            <span className="text-slate-300">•</span>
            <span className="text-blue-700 uppercase font-extrabold tracking-wider">Aplikasi Resmi DIGIWANGI 3</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
            <span className="text-[10px] bg-slate-200/60 text-slate-700 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest font-mono">SLOGAN:</span>
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-blue-900 uppercase tracking-wide">⚡ Cepat</span>
              <span className="text-amber-500 font-bold">•</span>
              <span className="font-extrabold text-blue-900 uppercase tracking-wide">🎯 Akurat</span>
              <span className="text-amber-500 font-bold">•</span>
              <span className="font-extrabold text-blue-900 uppercase tracking-wide">👁️ Transparansi</span>
              <span className="text-amber-500 font-bold">•</span>
              <span className="font-extrabold text-blue-900 uppercase tracking-wide">🛡️ Terintegritas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Sidebar and Content Layout */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col lg:flex-row gap-6">
        
        {/* SIDEBAR NAVIGATION COLUMN */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-gradient-to-b from-[#0b1329] via-[#14234c] to-[#1b3d6d] text-white rounded-3xl p-5 border border-indigo-950/80 shadow-xl flex flex-col justify-between h-auto min-h-[380px] lg:sticky lg:top-24">
            <div className="space-y-6">
              <div>
                <span className="text-[9px] font-black text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2.5 py-0.5 rounded-full uppercase tracking-widest font-display">
                  SISTEM MENU
                </span>
                <h3 className="text-[11px] text-slate-300 font-extrabold mt-2 uppercase tracking-wider">LAYANAN FITUR</h3>
              </div>

              {/* Navigation Actions Stack */}
              <div className="space-y-2.5">
                {/* Tab 1: Absensi Scan */}
                <button
                  onClick={() => setCurrentView('scan')}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-xs font-black tracking-wide transition-all uppercase text-left cursor-pointer border ${
                    currentView === 'scan'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                      : 'text-slate-300 hover:bg-white/5 border-transparent hover:text-white'
                  }`}
                >
                  <Camera className={`w-5 h-5 shrink-0 ${currentView === 'scan' ? 'text-slate-950' : 'text-blue-400'}`} />
                  <span>PRESENSI SCAN QR CODE</span>
                </button>

                {/* Tab 2: Halaman Manajemen (Admin) */}
                <button
                  onClick={() => setCurrentView('manajemen')}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-xs font-black tracking-wide transition-all uppercase text-left cursor-pointer border ${
                    currentView === 'manajemen'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                      : 'text-slate-300 hover:bg-white/5 border-transparent hover:text-white'
                  }`}
                >
                  <Layers className={`w-5 h-5 shrink-0 ${currentView === 'manajemen' ? 'text-slate-950' : 'text-blue-400'}`} />
                  <div>
                    <span>HALAMAN MANAJEMEN</span>
                    <span className="block text-[9px] opacity-75 font-mono lowercase mt-0.5">
                      ({currentUser ? currentUser.role : 'operator login'})
                    </span>
                  </div>
                </button>

                {/* Tab 2.5: Rekap Laporan */}
                <button
                  onClick={() => setCurrentView('laporan')}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-xs font-black tracking-wide transition-all uppercase text-left cursor-pointer border ${
                    currentView === 'laporan'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                      : 'text-slate-300 hover:bg-white/5 border-transparent hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className={`w-5 h-5 shrink-0 ${currentView === 'laporan' ? 'text-slate-950' : 'text-blue-400'}`} />
                  <span>LAPORAN & REKAPITULASI</span>
                </button>

                {/* Tab 3: Panduan Sistem */}
                <button
                  onClick={() => setCurrentView('panduan')}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-xs font-black tracking-wide transition-all uppercase text-left cursor-pointer border ${
                    currentView === 'panduan'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                      : 'text-slate-300 hover:bg-white/5 border-transparent hover:text-white'
                  }`}
                >
                  <BookOpen className={`w-5 h-5 shrink-0 ${currentView === 'panduan' ? 'text-slate-950' : 'text-blue-400'}`} />
                  <span>Buku Panduan & Setup</span>
                </button>
              </div>
            </div>

            {/* Sidebar Bottom branding / info */}
            <div className="border-t border-white/5 pt-4 mt-6">
              <p className="text-[10px] text-slate-400 font-bold leading-normal">
                SDN 3 Karamatwangi
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[9px] text-slate-300 font-black tracking-widest uppercase">AKTIF DIGITAL</span>
              </div>
            </div>
          </div>
        </aside>

        {/* PRIMARY CONTROLLER PORTAL */}
        <main className="flex-1 min-w-0">
          {/* VIEW 1: PRENSENSI SCAN */}
          {currentView === 'scan' && (
            <div className="py-2 block">
              <ScanScreen
                siswaList={siswaList}
                settings={settings}
                currentUser={currentUser || { namaLengkap: 'Petugas Piket Gerbang', role: 'piket' }}
                onAddPresensi={handleAddPresensi}
                recentPresensi={recentPresensiSlice}
                isActive={true}
                waliKelasList={waliKelasList}
              />
            </div>
          )}

          {/* VIEW 2: MANAJEMEN CONSOLE (Depends on login state & Role) */}
          {currentView === 'manajemen' && (
            <div className="py-2 block">
              {!currentUser ? (
                <LoginScreen onLoginSuccess={handleLogin} accountsList={accountsList} appLogoUrl={settings?.appLogoUrl} />
              ) : (
                <>
                  {currentUser.role === 'admin' && (
                    <AdminPanel
                      siswaList={siswaList}
                      onAddSiswa={handleAddSiswa}
                      onUpdateSiswa={handleUpdateSiswa}
                      onDeleteSiswa={handleDeleteSiswa}
                      settings={settings}
                      onSaveSettings={handleSaveSettings}
                      activityLogs={activityLogs}
                      onClearLogs={handleClearLogs}
                      googleToken={googleToken}
                      googleUser={googleUser}
                      onConnectGoogle={handleConnectGoogle}
                      onDisconnectGoogle={handleDisconnectGoogle}
                      onCreateNewSpreadsheet={handleCreateNewSpreadsheet}
                      onBackupToDrive={handleBackupToDrive}
                      onSyncFromGoogle={handleSyncFromGoogle}
                      onSyncToGoogle={handleGoogleManualSync}
                      isSyncing={isSyncing}
                      accountsList={accountsList}
                      onUpdateAccount={handleUpdateAccount}
                      onAddAccount={handleAddAccount}
                      onDeleteAccount={handleDeleteAccount}
                      waliKelasList={waliKelasList}
                      onUpdateWaliKelas={handleUpdateWaliKelas}
                      onBatchUpdateStudentWa={handleBatchUpdateStudentWa}
                    />
                  )}

                  {currentUser.role === 'kepsek' && (
                    <KepsekPanel siswaList={siswaList} presensiList={presensiList} settings={settings} />
                  )}

                  {currentUser.role === 'guru' && (
                    <GuruPanel
                      siswaList={siswaList}
                      presensiList={presensiList}
                      settings={settings}
                      waliKelasList={waliKelasList}
                      currentUser={currentUser}
                      onAddPresensi={handleAddPresensi}
                      onDeletePresensi={handleDeletePresensi}
                    />
                  )}

                  {currentUser.role === 'piket' && (
                    <PiketPanel
                      siswaList={siswaList}
                      settings={settings}
                      currentUser={currentUser}
                      onAddPresensi={handleAddPresensi}
                      recentPresensi={recentPresensiSlice}
                      isActive={true}
                      waliKelasList={waliKelasList}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW 2.5: REKAP LAPORAN */}
          {currentView === 'laporan' && (
            <div className="py-2 block">
              <ReportPanel
                siswaList={siswaList}
                presensiList={presensiList}
                settings={settings}
                onSynchronizePresensi={handleSynchronizeSemesterPresensi}
                isSyncingPresensi={isSyncingPresensi}
              />
            </div>
          )}

          {/* VIEW 3: BUKU PANDUAN LANGKAH-DEMI-LANGKAH */}
          {currentView === 'panduan' && (
            <div className="max-w-4xl mx-auto px-4 py-8 block">
              <div className="bg-white rounded-3xl p-8 border border-gray-150 shadow-sm space-y-8 text-left">
              
              {/* Cover */}
              <div className="border-b border-gray-150 pb-6">
                <span className="text-[10px] bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest leading-none">
                  Manual Resmi V2.0
                </span>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-2">
                  Panduan Setup & Pengoperasian Aplikasi DIGIWANGI 3
                </h2>
                <p className="text-gray-500 text-xs mt-1.5">
                  Langkah-langkah lengkap untuk mengoperasikan presensi berbasis QR Code & notifikasi WhatsApp otomatis di SDN 3 Karamatwangi, Cisurupan, Garut.
                </p>
              </div>

              {/* Step 1 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs select-none">1</span>
                  Metode Pembuatan QR Code Siswa
                </h3>
                <div className="text-xs text-gray-600 space-y-2 pl-8 leading-relaxed">
                  <p>
                    Setiap siswa yang terdaftar di dalam database memiliki <b>Nomor Induk Siswa (NIS)</b> yang unik. NIS ini dikodekan menjadi representasi grafis berupa QR Code dua dimensi yang modern dan andal.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-500 pl-2">
                    <li>Masuk ke dalam aplikasi sebagai akun <b>ADMIN</b> (PIN: 1234).</li>
                    <li>Buka menu <b>Pengelolaan Siswa</b> yang terletak di sebelah kiri.</li>
                    <li>Pada baris data murid yang ingin dibuatkan kartunya, klik logo **Cetak Kartu** berbentuk <code>Printer</code>.</li>
                    <li>Aplikasi secara otomatis me-render canvas grafis <b>QR Code</b> yang presisi sesuai NIS murid tersebut secara instan tanpa butuh paket internet.</li>
                    <li>Klik tombol merah <b>Cetak Kartu Siswa & QR Code</b> untuk mencetak langsung ke kertas karton/ID Card lewat printer inkjet sekolah, atau klik <b>Unduh PNG</b> untuk menyimpan filenya.</li>
                  </ol>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs select-none">2</span>
                  Pengaturan Izin & Koneksi Akun Google (Sheets & Drive)
                </h3>
                <div className="text-xs text-gray-600 space-y-2 pl-8 leading-relaxed">
                  <p>
                    Untuk memastikan keawetan arsip, data DIGIWANGI 3 terhubung langsung ke Google Sheets (basis data kolom) dan Google Drive (unggah PDF-Excel ekspor).
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 text-gray-500 pl-2">
                    <li>Tentukan dokumen Google Spreadsheet kosong Anda di browser, salin kode ID beruntun di URL (Contoh ID: <code>1uNz6D82J0xOnS5Nsc_Xpxc...</code>).</li>
                    <li>Buka tab <b>Google Cloud Sync</b> di menu Admin DIGIWANGI 3.</li>
                    <li>Paste atau masukkan string ID ke kolom input <b>Google Spreadsheet-ID</b>. Lakukan hal yang sama untuk ID Google Drive Folder Anda.</li>
                    <li>Klik tombol <b>Simpan & Inisialisasi API Google</b>.</li>
                    <li>Aplikasi sekarang berjalan dwi-perangkat secara instan. Mengetik data siswa di laptop akan langsung tersinkron di HP karena database real-time online yang sama.</li>
                  </ul>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs select-none">3</span>
                  Integrasi Layanan Pesan WhatsApp
                </h3>
                <div className="text-xs text-gray-600 space-y-2 pl-8 leading-relaxed">
                  <p>
                    Notifikasi orang tua dikirimkan otomatis ketika QR Code terdeteksi.
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-500 pl-2">
                    <li>Gunakan panel samping hijau <b>WA Gateway</b> di pojok kanan bawah untuk memantau simulasi pengantaran pesan secara real-time.</li>
                    <li>Admin dapat menyunting format SMS/Chat WhatsApp di menu <b>Pengaturan Pesan WA</b> di tab admin untuk mengganti kalimat atau mencantumkan salam pembuka baru.</li>
                    <li>Pada setiap rekam pesan terkirim di simulator, terdapat link <b>"Uji Kirim Asli"</b>. Jika diklik, aplikasi membuka jendela resmi web WhatsApp dengan pesan terformat rapi yang bisa dikirimkan langsung ke nomor wali murid dambaan demi membuktikan realisme integrasi.</li>
                  </ol>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs select-none">4</span>
                  Panduan Deploy Online ke Vercel.com
                </h3>
                <div className="text-xs text-gray-600 space-y-2 pl-8 leading-relaxed">
                  <p>
                    Aplikasi ini dirakit menggunakan fondasi React-TS-Vite yang sangat kompatibel dengan awan online modern.
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-550 pl-2">
                    <li>Buat akun gratis di situs <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-rose-600 underline font-semibold">vercel.com</a> melalui GitHub atau Google.</li>
                    <li>Gunakan tombol <b>"Export ZIP"</b> di menu pengaturan editor Google AI Studio Anda untuk mengunduh kode program DIGIWANGI 3 ke komputer Anda.</li>
                    <li>Hubungkan repositori GitHub Anda dengan Vercel, lalu pilih tombol <b>Import Project</b> pada folder DIGIWANGI 3 ini.</li>
                    <li>Vercel akan otomatis mengenali konfigurasi bundler Vite kita. Cukup klik tombol <b>Deploy</b>.</li>
                    <li>Dalam 1 menit, link online Anda (misal: <code>digiwangi3-sdn3.vercel.app</code>) siap dibagikan ke HP guru dan laptop piket sekolah secara bersamaan!</li>
                  </ol>
                </div>
              </div>

              {/* Step 5 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs select-none">5</span>
                  Prosedur Operasi Harian Sesuai Peranan (Role)
                </h3>
                <div className="text-xs text-gray-600 space-y-4 pl-8 leading-relaxed">
                  
                  {/* Admin role */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-gray-150">
                    <span className="font-black text-[10px] text-rose-600 uppercase">🔑 ADMINISTRATOR (ADMIN)</span>
                    <p className="text-gray-500 text-[11px] mt-1">
                      Mengurus kelancaran data utama. Menambah atau mengedit nomor telepon orang tua murid baru, menyetel toleransi keterlambatan bel masuk pagi, mengkustom kalimat WA, serta menyinkronkan spreadsheet secara manual.
                    </p>
                  </div>

                  {/* Kepsek role */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-gray-150">
                    <span className="font-black text-[10px] text-indigo-600 uppercase">🔑 KEPALA SEKOLAH (KEPSEK)</span>
                    <p className="text-gray-500 text-[11px] mt-1">
                      Memantau persentase absensi di pagi hari seketika tanpa melalukan perubahan yang berisiko sengaja merusak data. Menklik tombol ekspor untuk mencetak laporan rekap bulanan ke format CSV/Excel untuk keperluan pelaporan dinas pendidikan Garut.
                    </p>
                  </div>

                  {/* Guru role */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-gray-150">
                    <span className="font-black text-[10px] text-emerald-600 uppercase">🔑 GURU KELAS (WALI KELAS)</span>
                    <p className="text-gray-500 text-[11px] mt-1">
                      Khusus memegang kontrol kelas yang diampunya (misalnya Widia Siti Nuraeni memegang Kelas 4-A, Rima Rohmatul Hasanah memegang Kelas 1-A). Dapat mengubah status murid yang tidak hadir dari gerbang akibat ada keterangan tertulis, seperti sakit atau ijin resmi, sehingga pencatatan harian presisi.
                    </p>
                  </div>

                  {/* Piket role */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-gray-150">
                    <span className="font-black text-[10px] text-amber-600 uppercase">🔑 PETUGAS PIKET</span>
                    <p className="text-gray-500 text-[11px] mt-1">
                      Mengoperasikan alat pindai di pagi hari di gerbang utama sekolah. Mengaktifkan kamera HP, mengarahkan scanner ke depan QR Code kartu siswa, dan melacak riwayat absensi cepat yang masuk.
                    </p>
                  </div>

                </div>
              </div>

            </div>
          </div>
          )}
        </main>
      </div>

      {/* Floating simulator component with real automatic parent WhatsApp dispatch */}
      <WhatsAppSimulator
        logs={recentPresensiSlice}
        siswaList={siswaList}
        settings={settings}
        waliKelasList={waliKelasList}
        onUpdatePresensiWaStatus={handleUpdatePresensiWaStatus}
      />

      {/* Floating Mascot Promo Companion Assistant */}
      <MascotPromoAssistant />

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="font-bold text-slate-200">SDN 3 Karamatwangi, Cisurupan, Garut</p>
            <p className="text-[10px] text-slate-500 mt-1">
              Sistem Absensi QR Code Terpadu "DIGIWANGI 3" v2.1.0-WEB • Digarap Kokoh Bebas Bug
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleClearPresensiToday}
              type="button"
              id="btn-footer-clear"
              className="text-slate-500 hover:text-rose-500 transition-colors font-bold text-[10px] uppercase tracking-wider cursor-pointer"
            >
              Kosongkan Presensi
            </button>
            <span className="text-slate-750">|</span>
            <span className="text-[10px] text-slate-500 font-mono">2026-06-01 UTC</span>
          </div>
        </div>
      </footer>

      {/* FLOATING SYSTEM NOTIFICATION (IFRAME-SAFE) */}
      {appNotice && (
        <div className="fixed top-4 right-4 bg-slate-900 text-white rounded-2xl py-3.5 px-5 shadow-2xl border border-slate-700 z-50 flex items-center gap-2 text-xs font-bold animate-in slide-in-from-top-4 duration-300">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
          <span>{appNotice.message}</span>
        </div>
      )}

      {/* CUSTOM CLEAR PRESENSI CONFIRMATION DIALOG (IFRAME-SAFE) */}
      {showClearPresensiConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-700 mx-auto">
              <Layers className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-base font-display">Kosongkan Presensi?</h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-sans">
                Apakah Anda yakin ingin mematikan dan membersihkan seluruh riwayat presensi simulasi saat ini?
              </p>
              <p className="text-[10px] text-blue-700 bg-blue-50 py-1.5 px-3 rounded-xl inline-block mt-2 font-bold uppercase tracking-wide border border-blue-100">
                ⚠️ ini akan menghapus semua log presensi hari ini!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearPresensiConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-655 rounded-xl py-2.5 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetToday = getLocalDateString();
                  const nowTs = Date.now();
                  const todayRemoved = latestPresensiRef.current.filter((p) => normalizeDateKey(p.tanggal) === targetToday);
                  todayRemoved.forEach((p) => {
                    if (p.siswaId) {
                      deletedTombstonesRef.current[`${p.siswaId}__${targetToday}`] = nowTs;
                    }
                  });
                  persistDeletedTombstones(deletedTombstonesRef.current);

                  const remaining = latestPresensiRef.current.filter((p) => normalizeDateKey(p.tanggal) !== targetToday);
                  latestPresensiRef.current = remaining;
                  persistPresensiToStorage(remaining);
                  setPresensiList(remaining);

                  clearPresensiInFirestore(todayRemoved, targetToday).catch(() => {});
                  const tombstones = toTombstoneArray(deletedTombstonesRef.current);
                  syncPresensiToCloud(remaining, currentUser?.namaLengkap || 'Admin', tombstones).catch(() => {});

                  addActivityLog('Reset Presensi', `Melakukan pembersihan riwayat presensi tanggal ${targetToday}.`);
                  setShowClearPresensiConfirm(false);
                  triggerNotice('Semua data presensi harian hari ini berhasil diset ulang.');
                }}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white rounded-xl py-2.5 font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                Ya, Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
