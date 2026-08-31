import { useState, useEffect } from 'react';
import {
  SISWA_INITIAL,
  PRESENSI_INITIAL,
  SETTINGS_INITIAL,
  LOGS_INITIAL,
  USER_DEMO_ACCOUNTS
} from './lib/demoData';
import { Siswa, Presensi, SystemSettings, ActivityLog, User } from './types';
import { isPresensiDateMatch, isPresensiMatchSiswa, getLocalDateString } from './lib/attendanceUtils';
import Header from './components/Header';
import { 
  db,
  ensureAuthenticated, 
  saveSiswaToFirestore, 
  deleteSiswaFromFirestore, 
  savePresensiToFirestore, 
  deletePresensiFromFirestore, 
  clearPresensiInFirestore, 
  saveAccountToFirestore, 
  deleteAccountFromFirestore, 
  saveSettingsToFirestore, 
  saveActivityLogToFirestore, 
  clearActivityLogsInFirestore,
  seedInitialDataIfDocsEmpty,
  syncAllStudentsToFirestore
} from './lib/firebase';
import { onSnapshot, collection, doc } from 'firebase/firestore';
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
  // Real-time local state engine backed by LocalStorage
  const [siswaList, setSiswaList] = useState<Siswa[]>(() => {
    const cached = localStorage.getItem('karapres3_siswa_v3');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.length === SISWA_INITIAL.length) {
          return parsed;
        }
      } catch {}
    }
    localStorage.setItem('karapres3_siswa_v3', JSON.stringify(SISWA_INITIAL));
    return SISWA_INITIAL;
  });

  const [presensiList, setPresensiList] = useState<Presensi[]>(() => {
    const cached = localStorage.getItem('karapres3_presensi_v5');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const todayStr = getLocalDateString();
        const todayCount = parsed.filter((p: Presensi) => isPresensiDateMatch(p.tanggal, todayStr)).length;
        if (todayCount >= 250) {
          return parsed;
        }
      } catch {}
    }
    localStorage.setItem('karapres3_presensi_v5', JSON.stringify(PRESENSI_INITIAL));
    return PRESENSI_INITIAL;
  });

  const [settings, setSettings] = useState<SystemSettings>(() => {
    const cached = localStorage.getItem('karapres3_settings');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.googleDriveFolderId === '1tH9Q8u-CPlbN2bksIPh331uE_A8xN8B6') {
        parsed.googleDriveFolderId = '1RoPgYTYP3GqzcDhLv_xKJshIYRjQisoe';
        parsed.googleSpreadsheetId = '1V6IomZ0hR_E2N_lF5aK804-Oat_bVzNlW3O0Vj2vExF';
        localStorage.setItem('karapres3_settings', JSON.stringify(parsed));
        return parsed;
      }
      return parsed;
    }
    return SETTINGS_INITIAL;
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => {
    const cached = localStorage.getItem('karapres3_logs');
    return cached ? JSON.parse(cached) : LOGS_INITIAL;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('karapres3_current_user');
    return cached ? JSON.parse(cached) : null;
  });

  const [accountsList, setAccountsList] = useState<{ user: User; pin: string }[]>(() => {
    const cached = localStorage.getItem('karapres3_accounts_v4');
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
    localStorage.setItem('karapres3_accounts_v4', JSON.stringify(USER_DEMO_ACCOUNTS));
    return USER_DEMO_ACCOUNTS;
  });

  // Navigation tab for overall app modules
  const [currentView, setCurrentView] = useState<'scan' | 'manajemen' | 'laporan' | 'panduan'>('scan');

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

  // Real-time Cloud Firestore live data synchronizer
  useEffect(() => {
    const startRealTimeSync = async () => {
      try {
        await ensureAuthenticated();
        
        // Non-blocking mass-data seeder if Firestore is freshly provisioned
        await seedInitialDataIfDocsEmpty(
          SISWA_INITIAL,
          USER_DEMO_ACCOUNTS,
          SETTINGS_INITIAL,
          LOGS_INITIAL,
          PRESENSI_INITIAL
        );

        // Helper for graceful snapshot error handling
        const handleSnapshotNotice = (label: string, err: any) => {
          const errStr = err instanceof Error ? err.message : String(err);
          if (errStr.includes('Quota') || errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`[Firestore Real-time ${label}] Free quota limit reached. Using fast local offline storage.`);
          } else {
            console.warn(`[Firestore Real-time ${label}] Sync status:`, errStr);
          }
        };

        // 1. Subscribe to Siswa directory
        const unsubSiswa = onSnapshot(collection(db, 'siswa'), (snap) => {
          const list: Siswa[] = [];
          snap.forEach((doc) => {
            list.push(doc.data() as Siswa);
          });
          if (list.length > 0) {
            setSiswaList(list);
          }
        }, (err) => {
          handleSnapshotNotice('Siswa', err);
        });

        // 2. Subscribe to Attendance records
        const unsubPresensi = onSnapshot(collection(db, 'presensi'), (snap) => {
          const list: Presensi[] = [];
          snap.forEach((doc) => {
            list.push(doc.data() as Presensi);
          });
          setPresensiList(list);
        }, (err) => {
          handleSnapshotNotice('Presensi', err);
        });

        // 3. Subscribe to Accounts directory
        const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snap) => {
          const list: { user: User; pin: string }[] = [];
          snap.forEach((doc) => {
            const d = doc.data();
            list.push({
              user: {
                id: d.id,
                username: d.username,
                namaLengkap: d.namaLengkap,
                role: d.role,
                kelasSpesifik: d.kelasSpesifik || undefined
              },
              pin: d.pin
            });
          });
          if (list.length > 0) {
            setAccountsList(list);
          }
        }, (err) => {
          handleSnapshotNotice('Accounts', err);
        });

        // 4. Subscribe to App settings
        const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (docSnap) => {
          if (docSnap.exists()) {
            setSettings(docSnap.data() as SystemSettings);
          }
        }, (err) => {
          handleSnapshotNotice('Settings', err);
        });

        // 5. Subscribe to Activity logs
        const unsubLogs = onSnapshot(collection(db, 'activityLogs'), (snap) => {
          const list: ActivityLog[] = [];
          snap.forEach((doc) => {
            list.push(doc.data() as ActivityLog);
          });
          list.sort((a, b) => new Date(b.waktu).getTime() - new Date(a.waktu).getTime());
          setActivityLogs(list);
        }, (err) => {
          handleSnapshotNotice('Logs', err);
        });

        return () => {
          unsubSiswa();
          unsubPresensi();
          unsubAccounts();
          unsubSettings();
          unsubLogs();
        };
      } catch (error) {
        console.warn('Firestore connection initialization notice:', error);
      }
    };

    let unsubFuncs: (() => void) | undefined;
    startRealTimeSync().then((cleaner) => {
      unsubFuncs = cleaner;
    });

    return () => {
      if (unsubFuncs) unsubFuncs();
    };
  }, []);

  // Sync state modifications to Web Storage
  useEffect(() => {
    localStorage.setItem('karapres3_siswa_v3', JSON.stringify(siswaList));
  }, [siswaList]);

  useEffect(() => {
    localStorage.setItem('karapres3_presensi_v5', JSON.stringify(presensiList));
  }, [presensiList]);

  useEffect(() => {
    localStorage.setItem('karapres3_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('karapres3_logs', JSON.stringify(activityLogs));
  }, [activityLogs]);

  useEffect(() => {
    localStorage.setItem('karapres3_accounts_v4', JSON.stringify(accountsList));
  }, [accountsList]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('karapres3_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('karapres3_current_user');
    }
  }, [currentUser]);

  // Activity logger helper
  const addActivityLog = (tindakan: string, detail: string) => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      waktu: new Date().toISOString(),
      user: currentUser ? currentUser.namaLengkap : 'Sistem Otomatis',
      role: currentUser ? currentUser.role : 'piket',
      tindakan,
      detail,
    };
    setActivityLogs(prev => [newLog, ...prev.slice(0, 499)]);
    saveActivityLogToFirestore(newLog);
  };

  const handleUpdateAccount = (userId: string, updatedUser: Partial<User>, newPin?: string) => {
    const old = accountsList.find(acc => acc.user.id === userId);
    if (old) {
      const mergedUser = { ...old.user, ...updatedUser };
      const mergedPin = newPin !== undefined ? newPin : old.pin;
      setAccountsList(prev => prev.map(acc => acc.user.id === userId ? { user: mergedUser, pin: mergedPin } : acc));
      saveAccountToFirestore({ user: mergedUser, pin: mergedPin });
      addActivityLog('Update Akun', `Merubah detail profil akun: ${updatedUser.namaLengkap || userId}`);
      triggerNotice('Akun berhasil diperbarui.', 'success');
    }
  };

  const handleAddAccount = (user: User, pin: string) => {
    setAccountsList(prev => [...prev.filter(a => a.user.id !== user.id), { user, pin }]);
    saveAccountToFirestore({ user, pin });
    addActivityLog('Tambah Akun Baru', `Membuat akun operator baru: ${user.namaLengkap} [${user.role.toUpperCase()}]`);
    triggerNotice('Akun baru berhasil ditambahkan.', 'success');
  };

  const handleDeleteAccount = (userId: string) => {
    if (currentUser && currentUser.id === userId) {
      triggerNotice('Tidak dapat menghapus akun Anda sendiri!', 'info');
      return;
    }
    setAccountsList(prev => prev.filter(a => a.user.id !== userId));
    deleteAccountFromFirestore(userId);
    addActivityLog('Hapus Akun', `Menghapus akun operator ID: ${userId}`);
    triggerNotice('Akun berhasil dihapus.', 'success');
  };

  const handleLogin = (user: User) => {
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
    const pinStringVal = latestAccount ? latestAccount.pin : 'custom';
    addActivityLog('Login Terverifikasi', `Operator: ${userToLogin.namaLengkap} masuk sebagai [${userToLogin.role.toUpperCase()}]`);
  };

  const handleLogout = () => {
    if (currentUser) {
      addActivityLog('Logout Berhasil', `Operator ${currentUser.namaLengkap} keluar dari sistem.`);
    }
    setCurrentUser(null);
    setCurrentView('scan');
  };

  // Google connection handlers
  const handleConnectGoogle = async () => {
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
  };

  const handleDisconnectGoogle = async () => {
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
  };

  const handleCreateNewSpreadsheet = async (): Promise<string> => {
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
        localStorage.setItem('karapres3_settings', JSON.stringify(updated));
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
  };

  const syncAllDataToGoogle = async (token: string, silent = false): Promise<boolean> => {
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
  };

  const handleBackupToDrive = async () => {
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
  };

  const handleGoogleManualSync = async (): Promise<boolean> => {
    if (!googleToken) {
      triggerNotice('Hubungkan Akun Google terlebih dahulu di menu Admin > Google Cloud Sync.', 'info');
      setCurrentView('manajemen');
      return false;
    }
    return syncAllDataToGoogle(googleToken, false);
  };

  const handleSyncFromGoogle = async (): Promise<boolean> => {
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
      localStorage.setItem('karapres3_siswa_v3', JSON.stringify(updatedStudents));

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
  };

  // Student CRUD actions
  const handleAddSiswa = (newSiswa: Siswa) => {
    setSiswaList(prev => [newSiswa, ...prev.filter(s => s.id !== newSiswa.id)]);
    saveSiswaToFirestore(newSiswa);
    addActivityLog('Menambah Siswa', `Mendaftarkan siswa baru: ${newSiswa.nama} (NIS ${newSiswa.nis}) di ${newSiswa.kelas}`);
  };

  const handleUpdateSiswa = (updated: Siswa) => {
    setSiswaList(prev => prev.map(s => s.id === updated.id ? updated : s));
    saveSiswaToFirestore(updated);
    addActivityLog('Update Siswa', `Mengubah data profil: ${updated.nama} (NIS ${updated.nis})`);
  };

  const handleDeleteSiswa = (id: string) => {
    const matched = siswaList.find((s) => s.id === id);
    setSiswaList(prev => prev.filter(s => s.id !== id));
    deleteSiswaFromFirestore(id);
    if (matched) {
      addActivityLog('Hapus Siswa', `Menghapus pendaftaran: ${matched.nama} (NIS ${matched.nis})`);
    }
  };

  // Settings Save action
  const handleSaveSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    saveSettingsToFirestore(newSettings);
    addActivityLog('Konfigurasi Diperbarui', 'Mengubah konfigurasi jam masuk, template WA, atau ID integrasi Google.');
  };

  // Record a scanned attendance
  const handleAddPresensi = (newPresensi: Presensi) => {
    savePresensiToFirestore(newPresensi);
    setPresensiList((prev) => {
      const idx = prev.findIndex(
        (p) =>
          p.id === newPresensi.id ||
          ((p.siswaId === newPresensi.siswaId || p.nis === newPresensi.nis || (p.nama === newPresensi.nama && p.kelas === newPresensi.kelas)) &&
           isPresensiDateMatch(p.tanggal, newPresensi.tanggal))
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newPresensi;
        return copy;
      }
      return [newPresensi, ...prev];
    });
    addActivityLog('Presensi Berhasil', `Mencatat status [${newPresensi.status}] untuk ${newPresensi.nama} (${newPresensi.kelas})`);
  };

  // Quick reset logs
  const handleClearLogs = () => {
    clearActivityLogsInFirestore(activityLogs);
    triggerNotice('Log jejak aktivitas audit sistem berhasil dibersihkan.');
  };

  const handleClearPresensiToday = () => {
    setShowClearPresensiConfirm(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-200">
      
      {/* Header bar */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        isGoogleConnected={settings.isGoogleConnected}
        isWhatsAppConnected={settings.isWhatsAppConnected}
        onSyncNow={currentUser ? handleGoogleManualSync : undefined}
        isSyncing={isSyncing}
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
        <div className={currentView === 'scan' ? 'py-2 block' : 'hidden'}>
          <ScanScreen
            siswaList={siswaList}
            settings={settings}
            currentUser={currentUser || { namaLengkap: 'Petugas Piket Gerbang', role: 'piket' }}
            onAddPresensi={handleAddPresensi}
            recentPresensi={presensiList}
            isActive={currentView === 'scan'}
          />
        </div>

        {/* VIEW 2: MANAJEMEN CONSOLE (Depends on login state & Role) */}
        <div className={currentView === 'manajemen' ? 'py-2 block' : 'hidden'}>
          {!currentUser ? (
            <LoginScreen onLoginSuccess={handleLogin} accountsList={accountsList} />
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
                />
              )}

              {currentUser.role === 'kepsek' && (
                <KepsekPanel siswaList={siswaList} presensiList={presensiList} />
              )}

              {currentUser.role === 'guru' && (
                <GuruPanel
                  siswaList={siswaList}
                  presensiList={presensiList}
                  currentUser={currentUser}
                  onAddPresensi={handleAddPresensi}
                />
              )}

              {currentUser.role === 'piket' && (
                <PiketPanel
                  siswaList={siswaList}
                  settings={settings}
                  currentUser={currentUser}
                  onAddPresensi={handleAddPresensi}
                  recentPresensi={presensiList}
                  isActive={currentView === 'manajemen'}
                />
              )}
            </>
          )}
        </div>

        {/* VIEW 2.5: REKAP LAPORAN */}
        <div className={currentView === 'laporan' ? 'py-2 block' : 'hidden'}>
          <ReportPanel siswaList={siswaList} presensiList={presensiList} />
        </div>

        {/* VIEW 3: BUKU PANDUAN LANGKAH-DEMI-LANGKAH */}
        <div className={currentView === 'panduan' ? 'max-w-4xl mx-auto px-4 py-8 block' : 'hidden'}>
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
        </main>
      </div>

      {/* Floating simulator component */}
      <WhatsAppSimulator logs={presensiList} onClearLogs={() => setPresensiList([])} />

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
                  clearPresensiInFirestore(presensiList);
                  addActivityLog('Reset Presensi', 'Melakukan pembersihan total riwayat presensi hari ini.');
                  setShowClearPresensiConfirm(false);
                  triggerNotice('Semua data presensi harian berhasil diset ulang.');
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
