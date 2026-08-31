import React, { useState, useMemo } from 'react';
import {
  Users,
  Sliders,
  BellRing,
  Clock,
  Database,
  History,
  UserPlus,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  FileCheck,
  Printer,
  ChevronRight,
  UserCheck,
  ArrowRightLeft,
  Search,
  Filter,
  ShieldCheck,
  HelpCircle,
  Sparkles,
  QrCode,
  CalendarClock,
  Plus,
  Sun,
  Moon,
  Copy,
  CheckCircle2,
  X,
  Layers,
  Calendar,
  Download,
  FileArchive,
  Loader2
} from 'lucide-react';
import { Siswa, SystemSettings, ActivityLog, User, Role, DAFTAR_KELAS, StatusDapodik, QRIdentifierType, getStudentQRIdentifier, JadwalPresensi, normalizeKelasCode } from '../types';
import { DAFTAR_WALI_KELAS, getWaliKelasByKelas, DEFAULT_JADWAL_PRESENSI } from '../lib/demoData';
import QRCodeRenderer from './QRCodeRenderer';
import BatchQRPrintModal from './BatchQRPrintModal';
import { downloadClassQRZip, downloadSingleStudentQR } from '../lib/qrCodeExport';

interface AdminPanelProps {
  siswaList: Siswa[];
  onAddSiswa: (siswa: Siswa) => void;
  onUpdateSiswa: (siswa: Siswa) => void;
  onDeleteSiswa: (id: string) => void;
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
  activityLogs: ActivityLog[];
  onClearLogs?: () => void;
  googleToken?: string | null;
  googleUser?: any | null;
  onConnectGoogle?: () => Promise<void>;
  onDisconnectGoogle?: () => Promise<void>;
  onCreateNewSpreadsheet?: () => Promise<string>;
  onBackupToDrive?: () => Promise<void>;
  onSyncFromGoogle?: () => Promise<boolean>;
  onSyncToGoogle?: () => Promise<boolean>;
  isSyncing?: boolean;
  accountsList: { user: User; pin: string }[];
  onUpdateAccount: (userId: string, updatedUser: Partial<User>, newPin?: string) => void;
  onAddAccount: (user: User, pin: string) => void;
  onDeleteAccount: (userId: string) => void;
}

type AdminTab = 'siswa' | 'jadwal' | 'kelas' | 'whatsapp' | 'waktu' | 'google' | 'audit' | 'akun';

function AdminPanel({
  siswaList,
  onAddSiswa,
  onUpdateSiswa,
  onDeleteSiswa,
  settings,
  onSaveSettings,
  activityLogs,
  onClearLogs,
  googleToken = null,
  googleUser = null,
  onConnectGoogle,
  onDisconnectGoogle,
  onCreateNewSpreadsheet,
  onBackupToDrive,
  onSyncFromGoogle,
  onSyncToGoogle,
  isSyncing = false,
  accountsList,
  onUpdateAccount,
  onAddAccount,
  onDeleteAccount
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('siswa');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Local states for Siswa Form
  const [isEditingSiswa, setIsEditingSiswa] = useState<string | null>(null); // Siswa ID
  const [nis, setNis] = useState('');
  const [nik, setNik] = useState('');
  const [nisn, setNisn] = useState('');
  const [statusDapodik, setStatusDapodik] = useState<StatusDapodik>('Sudah Dapodik');
  const [qrIdentifierType, setQrIdentifierType] = useState<QRIdentifierType>('NIS');
  const [nama, setNama] = useState('');
  const [kelas, setKelas] = useState('Kelas 1-A');
  const [jk, setJk] = useState<'L' | 'P'>('L');
  const [waOrangTua, setWaOrangTua] = useState('');

  // Student directory filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKelas, setFilterKelas] = useState('Semua Kelas');
  const [filterDapodik, setFilterDapodik] = useState<'semua' | 'sudah' | 'belum'>('semua');

  // Quick Move Class Modal State
  const [quickMoveSiswa, setQuickMoveSiswa] = useState<Siswa | null>(null);
  const [targetMoveKelas, setTargetMoveKelas] = useState<string>('Kelas 1-A');

  // Custom modal state for deleting student
  const [siswaToDelete, setSiswaToDelete] = useState<Siswa | null>(null);

  // Local States for custom Settings fields
  const [jamMasuk, setJamMasuk] = useState(settings.jamMasuk);
  const [jamToleransi, setJamToleransi] = useState(settings.jamToleransi);
  const [templatePesan, setTemplatePesan] = useState(settings.templatePesan);
  const [spreadsheetId, setSpreadsheetId] = useState(settings.googleSpreadsheetId);
  const [driveFolderId, setDriveFolderId] = useState(settings.googleDriveFolderId);

  // Jadwal Presensi Multi-Shift States
  const [jadwalList, setJadwalList] = useState<JadwalPresensi[]>(() => {
    if (settings.jadwalList && settings.jadwalList.length > 0) {
      return settings.jadwalList;
    }
    return DEFAULT_JADWAL_PRESENSI;
  });
  const [isAddingJadwal, setIsAddingJadwal] = useState(false);
  const [editingJadwalId, setEditingJadwalId] = useState<string | null>(null);
  const [formJadwalNama, setFormJadwalNama] = useState('Jadwal Siang Kelas 1–6');
  const [formJadwalTipe, setFormJadwalTipe] = useState<'Pagi' | 'Siang' | 'Khusus' | 'Lainnya'>('Siang');
  const [formJadwalKelas, setFormJadwalKelas] = useState<string[]>([...DAFTAR_KELAS]);
  const [formJadwalHari, setFormJadwalHari] = useState<string[]>(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
  const [formJadwalJamMasuk, setFormJadwalJamMasuk] = useState('12:30');
  const [formJadwalJamToleransi, setFormJadwalJamToleransi] = useState('12:45');
  const [formJadwalJamPulang, setFormJadwalJamPulang] = useState('16:30');
  const [formJadwalIsAktif, setFormJadwalIsAktif] = useState(true);
  const [formJadwalKeterangan, setFormJadwalKeterangan] = useState('Jadwal presensi shift siang untuk kelas 1 sampai 6 (1A–6B)');
  const [jadwalToDelete, setJadwalToDelete] = useState<JadwalPresensi | null>(null);

  // Card view layout switcher for individual pupils printing helper
  const [selectedPrintSiswa, setSelectedPrintSiswa] = useState<Siswa | null>(null);

  // Batch QR Print Modal State
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [batchPrintDefaultKelas, setBatchPrintDefaultKelas] = useState('Semua Kelas');

  // Direct QR ZIP Download states in Admin Directory
  const [isDownloadingQRZip, setIsDownloadingQRZip] = useState(false);
  const [qrZipProgress, setQrZipProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [isClassDownloadDropdownOpen, setIsClassDownloadDropdownOpen] = useState(false);

  const handleOpenBatchPrint = (targetKelas = 'Semua Kelas') => {
    setBatchPrintDefaultKelas(targetKelas);
    setIsBatchPrintModalOpen(true);
  };

  const handleDirectDownloadClassQR = async (targetKelas: string) => {
    setIsClassDownloadDropdownOpen(false);
    const targetStudents = siswaList.filter(s => {
      if (targetKelas === 'Semua Kelas' || !targetKelas) return true;
      return s.kelas.trim().toLowerCase() === targetKelas.trim().toLowerCase();
    });

    if (targetStudents.length === 0) {
      displayNotice('err', `Tidak ada siswa terdaftar di ${targetKelas}.`);
      return;
    }

    try {
      setIsDownloadingQRZip(true);
      setQrZipProgress({ current: 0, total: targetStudents.length, name: 'Memulai pengemasan...' });
      await downloadClassQRZip(targetKelas, siswaList, (current, total, name) => {
        setQrZipProgress({ current, total, name });
      });
      displayNotice('success', `Berhasil mengunduh paket ZIP QR Code ${targetKelas} (${targetStudents.length} siswa)!`);
    } catch (err: any) {
      console.error('Gagal mengunduh ZIP QR kelas:', err);
      displayNotice('err', `Gagal mengunduh ZIP: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsDownloadingQRZip(false);
      setQrZipProgress(null);
    }
  };

  const handleDownloadSingleStudentQR = async (siswa: Siswa) => {
    try {
      await downloadSingleStudentQR(siswa);
      displayNotice('success', `QR Code ${siswa.nama} berhasil diunduh (PNG).`);
    } catch (err: any) {
      console.error('Gagal mengunduh QR siswa:', err);
      displayNotice('err', 'Gagal mengunduh QR Code.');
    }
  };

  // Local states for Admin / Operator Account Forms
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountUsername, setAccountUsername] = useState('');
  const [accountNamaLengkap, setAccountNamaLengkap] = useState('');
  const [accountRole, setAccountRole] = useState<Role>('piket');
  const [accountPin, setAccountPin] = useState('');
  const [accountKelasSpesifik, setAccountKelasSpesifik] = useState('');
  const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);

  // Fast memoized student filtering for zero-lag typing and tab switching
  const filteredSiswa = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return siswaList.filter((s) => {
      const matchesKelas = filterKelas === 'Semua Kelas' || s.kelas.toLowerCase() === filterKelas.toLowerCase();
      let matchesDapodik = true;
      if (filterDapodik === 'sudah') matchesDapodik = s.statusDapodik !== 'Belum Dapodik';
      if (filterDapodik === 'belum') matchesDapodik = s.statusDapodik === 'Belum Dapodik';
      
      if (!q) return matchesKelas && matchesDapodik;

      const matchesSearch = 
        s.nama.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.nik && s.nik.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q));

      return matchesKelas && matchesDapodik && matchesSearch;
    });
  }, [siswaList, filterKelas, filterDapodik, searchQuery]);

  // Memoized class student counts for dropdown
  const classStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of siswaList) {
      counts[s.kelas] = (counts[s.kelas] || 0) + 1;
    }
    return counts;
  }, [siswaList]);

  const displayNotice = (type: 'success' | 'err', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  // Submit and state handlers for modifying / adding operator accounts
  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountUsername.trim() || !accountNamaLengkap.trim() || !accountPin.trim()) {
      displayNotice('err', 'Nama Lengkap, Username, dan PIN wajib diisi.');
      return;
    }

    if (accountPin.trim().length < 4) {
      displayNotice('err', 'PIN Keamanan harus berjumlah minimal 4 karakter.');
      return;
    }

    // Check username uniqueness
    const isConflict = accountsList.some(acc => 
      acc.user.id !== editingAccountId && 
      acc.user.username.toLowerCase() === accountUsername.trim().toLowerCase()
    );

    if (isConflict) {
      displayNotice('err', `Username "${accountUsername}" sudah dipakai oleh operator lain.`);
      return;
    }

    if (editingAccountId) {
      const updatedUser: Partial<User> = {
        username: accountUsername.trim().toLowerCase(),
        namaLengkap: accountNamaLengkap.trim(),
        role: accountRole,
        kelasSpesifik: accountRole === 'guru' ? (accountKelasSpesifik || 'Semua Kelas') : undefined
      };
      onUpdateAccount(editingAccountId, updatedUser, accountPin.trim());
      displayNotice('success', `Akun ${accountNamaLengkap} berhasil diperbarui.`);
      resetAccountForm();
    } else {
      const newUserId = `usr-${Date.now()}`;
      const newAcc: User = {
        id: newUserId,
        username: accountUsername.trim().toLowerCase(),
        namaLengkap: accountNamaLengkap.trim(),
        role: accountRole,
        kelasSpesifik: accountRole === 'guru' ? (accountKelasSpesifik || 'Semua Kelas') : undefined
      };
      onAddAccount(newAcc, accountPin.trim());
      displayNotice('success', `Akun baru ${accountNamaLengkap} berhasil dibuat.`);
      resetAccountForm();
    }
  };

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setAccountUsername('');
    setAccountNamaLengkap('');
    setAccountRole('piket');
    setAccountPin('');
    setAccountKelasSpesifik('Kelas 1-A');
    setIsAddingNewAccount(false);
  };

  const startEditAccount = (acc: { user: User; pin: string }) => {
    setEditingAccountId(acc.user.id);
    setAccountUsername(acc.user.username);
    setAccountNamaLengkap(acc.user.namaLengkap);
    setAccountRole(acc.user.role);
    setAccountPin(acc.pin);
    setAccountKelasSpesifik(acc.user.role === 'guru' ? (acc.user.kelasSpesifik || 'Kelas 1-A') : 'Kelas 1-A');
    setIsAddingNewAccount(false);
  };

  // Submit handler for CRUD student with Dapodik and NIK support
  const handleSiswaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim() || !waOrangTua.trim()) {
      displayNotice('err', 'Nama lengkap dan nomor WhatsApp wali murid wajib diisi.');
      return;
    }

    const isBelumDapodik = statusDapodik === 'Belum Dapodik';

    // If student is not yet in Dapodik, NIK or NIS must be present
    if (isBelumDapodik && !nik.trim() && !nis.trim()) {
      displayNotice('err', 'Untuk siswa yang belum masuk Dapodik, mohon isi NIK (Nomor Induk Kependudukan) atau NIS.');
      return;
    }

    // Determine finalized NIS
    let finalNis = nis.trim();
    if (!finalNis) {
      if (isBelumDapodik && nik.trim()) {
        finalNis = `REG-${nik.trim().slice(-6)}`;
      } else {
        finalNis = `SIS-${Date.now().toString().slice(-5)}`;
      }
    }

    // NIS uniqueness validation when creating new student
    if (!isEditingSiswa && siswaList.some((s) => s.nis.toLowerCase() === finalNis.toLowerCase())) {
      displayNotice('err', `Data gagal disimpan. NIS ${finalNis} sudah terdaftar di sistem.`);
      return;
    }

    const payload: Siswa = {
      id: isEditingSiswa || `sis-${Date.now()}`,
      nis: finalNis,
      nik: nik.trim() || undefined,
      nisn: nisn.trim() || undefined,
      statusDapodik,
      qrIdentifierType: isBelumDapodik ? (qrIdentifierType || 'NIK') : qrIdentifierType,
      nama: nama.trim(),
      kelas,
      jenisKelamin: jk,
      waOrangTua: waOrangTua.trim(),
    };

    if (isEditingSiswa) {
      onUpdateSiswa(payload);
      displayNotice('success', `Berhasil memperbarui data siswa: ${nama} (${kelas})`);
      setIsEditingSiswa(null);
    } else {
      onAddSiswa(payload);
      displayNotice('success', `Berhasil mendaftarkan siswa baru: ${nama} (${kelas})`);
    }

    // Reset Form
    resetSiswaForm();
  };

  const resetSiswaForm = () => {
    setIsEditingSiswa(null);
    setNis('');
    setNik('');
    setNisn('');
    setStatusDapodik('Sudah Dapodik');
    setQrIdentifierType('NIS');
    setNama('');
    setKelas('Kelas 1-A');
    setJk('L');
    setWaOrangTua('');
  };

  const handleEditClick = (siswa: Siswa) => {
    setIsEditingSiswa(siswa.id);
    setNis(siswa.nis);
    setNik(siswa.nik || '');
    setNisn(siswa.nisn || '');
    setStatusDapodik(siswa.statusDapodik || 'Sudah Dapodik');
    setQrIdentifierType(siswa.qrIdentifierType || (siswa.statusDapodik === 'Belum Dapodik' ? 'NIK' : 'NIS'));
    setNama(siswa.nama);
    setKelas(siswa.kelas);
    setJk(siswa.jenisKelamin);
    setWaOrangTua(siswa.waOrangTua);
    document.getElementById('siswa-form-ref')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    resetSiswaForm();
  };

  // Quick Move Class handler
  const handleQuickMoveSubmit = () => {
    if (!quickMoveSiswa) return;
    const oldKelas = quickMoveSiswa.kelas;
    const updated: Siswa = {
      ...quickMoveSiswa,
      kelas: targetMoveKelas,
    };
    onUpdateSiswa(updated);
    displayNotice('success', `Siswa "${quickMoveSiswa.nama}" berhasil dipindahkan dari ${oldKelas} ke ${targetMoveKelas}.`);
    setQuickMoveSiswa(null);
  };

  // Save Settings actions
  const handleSaveAllSettings = (e?: React.FormEvent, customJadwal?: JadwalPresensi[]) => {
    if (e) e.preventDefault();
    const listToSave = customJadwal || jadwalList;
    const updated: SystemSettings = {
      ...settings,
      jamMasuk,
      jamToleransi,
      jamPulang: settings.jamPulang || '12:30',
      jadwalList: listToSave,
      templatePesan,
      googleSpreadsheetId: spreadsheetId,
      googleDriveFolderId: driveFolderId,
    };
    onSaveSettings(updated);
    displayNotice('success', 'Seluruh konfigurasi sistem & jadwal presensi berhasil disimpan.');
  };

  // Jadwal Presensi Actions
  const handleOpenNewJadwal = (preset?: 'siang' | 'pagi') => {
    setEditingJadwalId(null);
    if (preset === 'siang') {
      setFormJadwalNama('Jadwal Siang Kelas 1–6');
      setFormJadwalTipe('Siang');
      setFormJadwalKelas([...DAFTAR_KELAS]);
      setFormJadwalHari(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
      setFormJadwalJamMasuk('12:30');
      setFormJadwalJamToleransi('12:45');
      setFormJadwalJamPulang('16:30');
      setFormJadwalIsAktif(true);
      setFormJadwalKeterangan('Jadwal presensi shift siang untuk seluruh kelas 1 sampai 6 (1A–6B)');
    } else if (preset === 'pagi') {
      setFormJadwalNama('Jadwal Pagi Reguler (Kelas 1–6)');
      setFormJadwalTipe('Pagi');
      setFormJadwalKelas([...DAFTAR_KELAS]);
      setFormJadwalHari(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
      setFormJadwalJamMasuk('07:00');
      setFormJadwalJamToleransi('07:15');
      setFormJadwalJamPulang('12:30');
      setFormJadwalIsAktif(true);
      setFormJadwalKeterangan('Jadwal presensi shift pagi standar untuk seluruh kelas 1 sampai 6 (1A–6B)');
    } else {
      setFormJadwalNama('Jadwal Siang Kelas 1–6');
      setFormJadwalTipe('Siang');
      setFormJadwalKelas([...DAFTAR_KELAS]);
      setFormJadwalHari(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
      setFormJadwalJamMasuk('12:30');
      setFormJadwalJamToleransi('12:45');
      setFormJadwalJamPulang('16:30');
      setFormJadwalIsAktif(true);
      setFormJadwalKeterangan('');
    }
    setIsAddingJadwal(true);
  };

  const handleEditJadwal = (item: JadwalPresensi) => {
    setEditingJadwalId(item.id);
    setFormJadwalNama(item.nama);
    setFormJadwalTipe(item.tipe || 'Siang');
    setFormJadwalKelas(item.kelas && item.kelas.length > 0 ? [...item.kelas] : [...DAFTAR_KELAS]);
    setFormJadwalHari(item.hari && item.hari.length > 0 ? [...item.hari] : ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
    setFormJadwalJamMasuk(item.jamMasuk || '12:30');
    setFormJadwalJamToleransi(item.jamToleransi || '12:45');
    setFormJadwalJamPulang(item.jamPulang || '16:30');
    setFormJadwalIsAktif(item.isAktif !== false);
    setFormJadwalKeterangan(item.keterangan || '');
    setIsAddingJadwal(true);
  };

  const toggleClassSelection = (k: string) => {
    if (formJadwalKelas.includes(k)) {
      setFormJadwalKelas(formJadwalKelas.filter((c) => c !== k));
    } else {
      setFormJadwalKelas([...formJadwalKelas, k]);
    }
  };

  const toggleHariSelection = (h: string) => {
    if (formJadwalHari.includes(h)) {
      setFormJadwalHari(formJadwalHari.filter((day) => day !== h));
    } else {
      setFormJadwalHari([...formJadwalHari, h]);
    }
  };

  const handleSaveJadwalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formJadwalNama.trim()) {
      displayNotice('err', 'Nama jadwal presensi wajib diisi!');
      return;
    }
    if (formJadwalKelas.length === 0) {
      displayNotice('err', 'Pilih minimal 1 kelas yang berlaku untuk jadwal ini!');
      return;
    }

    let updatedList: JadwalPresensi[];
    if (editingJadwalId) {
      updatedList = jadwalList.map((item) => {
        if (item.id === editingJadwalId) {
          return {
            ...item,
            nama: formJadwalNama.trim(),
            tipe: formJadwalTipe,
            kelas: formJadwalKelas,
            hari: formJadwalHari,
            jamMasuk: formJadwalJamMasuk,
            jamToleransi: formJadwalJamToleransi,
            jamPulang: formJadwalJamPulang,
            isAktif: formJadwalIsAktif,
            keterangan: formJadwalKeterangan.trim(),
          };
        }
        return item;
      });
    } else {
      const newJadwal: JadwalPresensi = {
        id: `jdw-${Date.now()}`,
        nama: formJadwalNama.trim(),
        tipe: formJadwalTipe,
        kelas: formJadwalKelas,
        hari: formJadwalHari,
        jamMasuk: formJadwalJamMasuk,
        jamToleransi: formJadwalJamToleransi,
        jamPulang: formJadwalJamPulang,
        isAktif: formJadwalIsAktif,
        keterangan: formJadwalKeterangan.trim(),
      };
      updatedList = [...jadwalList, newJadwal];
    }

    setJadwalList(updatedList);
    setIsAddingJadwal(false);
    setEditingJadwalId(null);

    const updatedSettings: SystemSettings = {
      ...settings,
      jamMasuk,
      jamToleransi,
      jadwalList: updatedList,
    };
    onSaveSettings(updatedSettings);
    displayNotice('success', `Jadwal presensi "${formJadwalNama}" berhasil disimpan!`);
  };

  const handleToggleJadwalActive = (id: string) => {
    const updatedList = jadwalList.map((item) => {
      if (item.id === id) {
        return { ...item, isAktif: !item.isAktif };
      }
      return item;
    });
    setJadwalList(updatedList);
    onSaveSettings({ ...settings, jadwalList: updatedList });
    displayNotice('success', 'Status aktif jadwal berhasil diperbarui.');
  };

  const handleDeleteJadwalConfirm = () => {
    if (!jadwalToDelete) return;
    const updatedList = jadwalList.filter((j) => j.id !== jadwalToDelete.id);
    setJadwalList(updatedList);
    onSaveSettings({ ...settings, jadwalList: updatedList });
    displayNotice('success', `Jadwal "${jadwalToDelete.nama}" berhasil dihapus.`);
    setJadwalToDelete(null);
  };

  const handleDuplicateJadwal = (item: JadwalPresensi) => {
    const dup: JadwalPresensi = {
      ...item,
      id: `jdw-${Date.now()}`,
      nama: `${item.nama} (Salinan)`,
    };
    const updatedList = [...jadwalList, dup];
    setJadwalList(updatedList);
    onSaveSettings({ ...settings, jadwalList: updatedList });
    displayNotice('success', `Jadwal "${item.nama}" berhasil diduplikasi.`);
  };

  // Print trigger for printing student ID wrapper without page reload
  const triggerPrintWindow = (elementId: string) => {
    const printContent = document.getElementById(elementId);
    if (!printContent) return;

    // Extract canvas pixels as image data URL so it displays in printing
    const canvas = printContent.querySelector('canvas');
    let qrImageHtml = '';
    if (canvas) {
      try {
        const qrImageUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
        qrImageHtml = `<img src="${qrImageUrl}" style="width: 170px; height: 170px; object-fit: contain; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" />`;
      } catch (err) {
        console.error('Gagal mengekstrak QR Code Canvas:', err);
        qrImageHtml = printContent.innerHTML;
      }
    } else {
      qrImageHtml = printContent.innerHTML;
    }

    // Create a hidden print iframe to prevent parent page reload & preserve React state
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(`
      <html>
        <head>
          <title>Kartu Absensi - ${selectedPrintSiswa?.nama || 'Siswa'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=JetBrains+Mono:wght@700&display=swap');
            @page {
              size: auto;
              margin: 0mm;
            }
            body { 
              font-family: 'Inter', sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background-color: white; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-card-frame { 
              border: 3.5px solid #1d4ed8; 
              border-radius: 20px; 
              padding: 24px; 
              width: 320px; 
              text-align: center; 
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
              box-sizing: border-box;
              background-color: white;
            }
            .header-banner { 
              background-color: #1d4ed8; 
              color: white; 
              padding: 12px 8px; 
              font-weight: 900; 
              font-size: 13px; 
              border-radius: 12px; 
              margin-bottom: 20px; 
              text-transform: uppercase;
              letter-spacing: 0.5px;
              line-height: 1.4;
            }
            .qr-container {
              display: flex; 
              justify-content: center; 
              align-items: center;
              margin: 15px 0;
              background-color: white;
            }
            .student-info { 
              margin-top: 15px; 
              font-weight: 900; 
              font-size: 16px; 
              color: #1e293b; 
              text-transform: uppercase;
              letter-spacing: -0.3px;
              line-height: 1.2;
            }
            .meta-desc { 
              font-size: 11px; 
              color: #475569; 
              margin-top: 6px; 
              font-weight: 700;
            }
            .sub-desc {
              font-size: 9px;
              color: #64748b;
              margin-top: 5px;
              font-style: italic;
              font-weight: 500;
            }
            .footer-copyright { 
              font-size: 9px; 
              color: #94a3b8; 
              border-top: 1.5px dashed #e2e8f0; 
              margin-top: 20px; 
              padding-top: 10px; 
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="print-card-frame">
            <div class="header-banner">KARTU SISWA ELEKTRONIK<br/>SDN 3 KARAMATWANGI</div>
            <div class="qr-container">
              ${qrImageHtml}
            </div>
            <div class="student-info">${selectedPrintSiswa?.nama || ''}</div>
            <div class="meta-desc">NIS: ${selectedPrintSiswa?.nis || ''} • ${selectedPrintSiswa?.kelas || ''}</div>
            <div class="sub-desc">Suku Cadang Utama DIGIWANGI 3 App • Kab. Garut</div>
            <div class="footer-copyright">SDN 3 Karamatwangi, Cisurupan, Garut</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();

    // Safely cleanup the iframe after printing is handled
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 12000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* SUCCESS & ERROR MESSAGE FLOATER */}
      {successMsg && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2.5 text-xs font-semibold shadow-sm animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center gap-2.5 text-xs font-semibold shadow-sm animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ADMIN PANEL INNER GRID: Left Tab Selection, Right Console View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Navigation Sidebar column (3 cols) */}
        <div className="lg:col-span-3 space-y-3.5">
          <div className="bg-white rounded-3xl p-5 border border-slate-205 shadow-sm">
            <span className="text-[10px] font-black tracking-widest text-slate-400 block mb-3 uppercase font-display">MENU ADMIN</span>
            
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => { setActiveTab('siswa'); setSelectedPrintSiswa(null); }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'siswa'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Users className="w-4 h-4" />
                  Pengelolaan Siswa
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('kelas')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'kelas'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4" />
                  Pembagian Kelas (1-6)
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('whatsapp')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'whatsapp'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <BellRing className="w-4 h-4" />
                  Pengaturan Pesan WA
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('jadwal')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'jadwal' || activeTab === 'waktu'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  Jadwal Presensi
                </span>
                <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold px-1.5 py-0.5 rounded-md">Pagi / Siang</span>
              </button>

              <button
                onClick={() => setActiveTab('google')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'google'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Database className="w-4 h-4" />
                  Google Cloud Sync
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <History className="w-4 h-4" />
                  Riwayat Audit Sistem
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('akun')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'akun'
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4" />
                  Pengaturan Akun Admin
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            </nav>
          </div>
        </div>

        {/* Content Console (9 cols) */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* TAB 1: PENGELOLAAN DATA SISWA */}
          {activeTab === 'siswa' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Form Tambah/Ubah Siswa (5 cols) */}
              <div 
                id="siswa-form-ref" 
                className={`md:col-span-5 bg-white rounded-3xl p-5 border transition-all duration-300 self-start ${
                  isEditingSiswa 
                    ? 'border-indigo-500 ring-4 ring-indigo-50/70 shadow-xl scale-[1.01]' 
                    : 'border-slate-250 shadow-sm'
                }`}
              >
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2.5 flex items-center justify-between font-display">
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4.5 h-4.5 text-indigo-700 font-bold" />
                    {isEditingSiswa ? '✏️ EDIT DATA & PINDAH KELAS' : '📝 PENDAFTARAN SISWA BARU'}
                  </span>
                  {isEditingSiswa && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase">
                      Mode Edit
                    </span>
                  )}
                </h3>

                {isEditingSiswa && (
                  <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl text-[11px] font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-700 rounded-full animate-ping shrink-0" />
                    <span>Menyunting: <b>{nama}</b> ({kelas}). Anda dapat memindahkan kelas atau memperbarui NIK/NIS di form bawah.</span>
                  </div>
                )}

                <form onSubmit={handleSiswaSubmit} className="space-y-3.5 font-sans">
                  {/* Status Dapodik Selection Toggle */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Status Data Dapodik:</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusDapodik('Sudah Dapodik');
                          setQrIdentifierType('NIS');
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          statusDapodik === 'Sudah Dapodik'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-200 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <span>✅ Sudah Dapodik</span>
                        </div>
                        <p className="text-[9.5px] text-slate-500 mt-0.5">Memiliki NISN / NIS resmi</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStatusDapodik('Belum Dapodik');
                          setQrIdentifierType('NIK');
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          statusDapodik === 'Belum Dapodik'
                            ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-200 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <span>⚠️ Belum Dapodik</span>
                        </div>
                        <p className="text-[9.5px] text-slate-500 mt-0.5">Siswa baru / Gunakan NIK</p>
                      </button>
                    </div>
                  </div>

                  {statusDapodik === 'Belum Dapodik' && (
                    <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-2xl text-[11px] text-amber-900 leading-relaxed">
                      💡 <b>Siswa Belum Masuk Dapodik:</b> QR Code absensi dapat dibuat otomatis menggunakan <b>NIK (Nomor Induk Kependudukan)</b> orang tua/anak sehingga siswa langsung bisa memindai absensi tanpa menunggu sinkronisasi Dapodik pusat.
                    </div>
                  )}

                  {/* NIK Input Field */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1 flex items-center justify-between">
                      <span>Nomor Induk Kependudukan (NIK)</span>
                      {statusDapodik === 'Belum Dapodik' && (
                        <span className="text-amber-700 font-extrabold text-[10px]">Wajib Untuk QR Belum Dapodik</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={nik}
                      onChange={(e) => setNik(e.target.value.replace(/[^0-9]/g, ''))}
                      maxLength={16}
                      placeholder="16 Digit NIK Siswa (contoh: 3205123456780001)"
                      className={`w-full bg-white border rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 font-mono ${
                        statusDapodik === 'Belum Dapodik' && !nik
                          ? 'border-amber-300 focus:ring-amber-500 bg-amber-50/20'
                          : 'border-gray-300 focus:ring-indigo-600'
                      }`}
                    />
                  </div>

                  {/* NIS and NISN Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                        NIS (Nomor Induk)
                      </label>
                      <input
                        type="text"
                        value={nis}
                        onChange={(e) => setNis(e.target.value)}
                        placeholder={statusDapodik === 'Belum Dapodik' ? 'Otomatis dibuat' : 'Contoh: 30409'}
                        disabled={!!isEditingSiswa}
                        className="w-full bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                        NISN (Opsional)
                      </label>
                      <input
                        type="text"
                        value={nisn}
                        onChange={(e) => setNisn(e.target.value.replace(/[^0-9]/g, ''))}
                        maxLength={10}
                        placeholder="10 Digit NISN"
                        className="w-full bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
                      />
                    </div>
                  </div>

                  {/* Nama Lengkap */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">Nama Lengkap Murid</label>
                    <input
                      type="text"
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Nama lengkap murid tanpa gelar"
                      className="w-full bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>

                  {/* Kelas Selector (with Pindah Kelas highlight) & Gender */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-black text-indigo-900 uppercase mb-1 flex items-center justify-between">
                        <span>Pilih / Ganti Kelas</span>
                        <ArrowRightLeft className="w-3 h-3 text-indigo-600" />
                      </label>
                      <select
                        value={kelas}
                        onChange={(e) => setKelas(e.target.value)}
                        className="w-full bg-indigo-50/60 border-2 border-indigo-300 focus:border-indigo-600 rounded-xl py-1.5 px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 font-bold text-indigo-900"
                      >
                        {DAFTAR_KELAS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">Jenis Kelamin</label>
                      <div className="flex border border-gray-300 rounded-xl overflow-hidden text-xs bg-slate-50 p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => setJk('L')}
                          className={`flex-1 py-1 px-1 rounded-md text-center font-bold relative cursor-pointer ${
                            jk === 'L' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          Laki-Laki
                        </button>
                        <button
                          type="button"
                          onClick={() => setJk('P')}
                          className={`flex-1 py-1 px-1 rounded-md text-center font-bold relative cursor-pointer ${
                            jk === 'P' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          Perempuan
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Identifier QR Code Type */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1 flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-indigo-600" />
                      <span>Identitas Utama Cetak QR Code:</span>
                    </label>
                    <select
                      value={qrIdentifierType}
                      onChange={(e) => setQrIdentifierType(e.target.value as QRIdentifierType)}
                      className="w-full bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-slate-700"
                    >
                      <option value="NIS">📌 Gunakan NIS Resmi ({nis || 'Sesuai NIS'})</option>
                      <option value="NIK">🆔 Gunakan NIK Kependudukan ({nik || 'Sesuai NIK'} - Rekomendasi Belum Dapodik)</option>
                      <option value="NISN">🎓 Gunakan NISN Nasional ({nisn || 'Sesuai NISN'})</option>
                    </select>
                  </div>

                  {/* WhatsApp Orang Tua */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">Nomor WhatsApp Wali</label>
                    <input
                      type="text"
                      value={waOrangTua}
                      onChange={(e) => setWaOrangTua(e.target.value)}
                      placeholder="Isi No HP orang tua/wali (misal: 0812345678)"
                      className="w-full bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Otomatis diformat saat pengiriman notifikasi kehadiran gateway.</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="submit"
                      id="btn-action-save-siswa"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 font-bold text-xs transition-all shadow-md cursor-pointer block text-center"
                    >
                      {isEditingSiswa ? '💾 Simpan Perubahan & Kelas' : '➕ Daftarkan Siswa Sekarang'}
                    </button>
                    {isEditingSiswa && (
                      <button
                        type="button"
                        id="btn-action-cancel-siswa"
                        onClick={handleCancelEdit}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl py-2 px-3.5 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* List Data Siswa (7 cols) */}
              <div className="md:col-span-7 space-y-4">
                {/* Visual Card Generator Preview Station (If selected) */}
                {selectedPrintSiswa ? (
                  <div className="bg-white rounded-3xl p-5 border-2 border-indigo-600 shadow-md text-center space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-150 pb-2">
                      <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-indigo-600" />
                        KARTU ABSENSI ELEKTRONIK SISWA
                      </h4>
                      <button
                        type="button"
                        id="btn-print-close-card"
                        onClick={() => setSelectedPrintSiswa(null)}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600"
                      >
                        Tutup Kartu
                      </button>
                    </div>

                    <div className="max-w-[280px] mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      {/* Virtual QR Code canvas container target inside print frame */}
                      <div id="qrcode-print-canvas-area">
                        <QRCodeRenderer 
                          value={getStudentQRIdentifier(selectedPrintSiswa)} 
                          label={selectedPrintSiswa.statusDapodik === 'Belum Dapodik' ? `NIK: ${selectedPrintSiswa.nik || selectedPrintSiswa.nis}` : `NIS: ${selectedPrintSiswa.nis}`}
                        />
                      </div>
                      
                      <div className="mt-3">
                        <h5 className="font-extrabold text-sm text-slate-800 leading-none">{selectedPrintSiswa.nama}</h5>
                        <p className="text-[10px] text-indigo-700 font-bold font-mono tracking-wide mt-1.5">
                          {selectedPrintSiswa.kelas} • {selectedPrintSiswa.statusDapodik === 'Belum Dapodik' ? `NIK: ${selectedPrintSiswa.nik || '-'}` : `NIS: ${selectedPrintSiswa.nis}`}
                        </p>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 leading-normal">
                      Kartu sudah siap diprint dan ditempelkan pada wadah lanyard/gantungan siswa.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        id="btn-download-single-qrcode"
                        onClick={() => handleDownloadSingleStudentQR(selectedPrintSiswa)}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                        title="Unduh file kartu QR Code PNG berkualitas tinggi"
                      >
                        <Download className="w-4 h-4 text-emerald-200" />
                        Unduh Gambar QR (PNG)
                      </button>

                      <button
                        type="button"
                        id="btn-print-qrcode"
                        onClick={() => triggerPrintWindow('qrcode-print-canvas-area')}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                      >
                        <Printer className="w-4 h-4 text-amber-300" />
                        Cetak Kartu Siswa & QR Code
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Primary Student Directory */}
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <span>📋 DIREKTORI SISWA SDN 3</span>
                        <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
                          {siswaList.length} Anak
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Kelola data murid, unduh QR Code per kelas (ZIP PNG), dan cetak kartu absensi.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Dropdown / Button Download QR Per Kelas */}
                      <div className="relative">
                        <button
                          type="button"
                          id="btn-download-qr-per-kelas"
                          onClick={() => setIsClassDownloadDropdownOpen(!isClassDownloadDropdownOpen)}
                          disabled={isDownloadingQRZip}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 font-sans"
                          title="Unduh paket ZIP gambar QR Code per kelas"
                        >
                          {isDownloadingQRZip ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : (
                            <FileArchive className="w-3.5 h-3.5 text-emerald-200" />
                          )}
                          <span>
                            {isDownloadingQRZip
                              ? `Mengemas (${qrZipProgress?.current || 0}/${qrZipProgress?.total || 0})...`
                              : '📥 Unduh QR Per Kelas ▼'}
                          </span>
                        </button>

                        {/* Dropdown Menu for Class Selection */}
                        {isClassDownloadDropdownOpen && (
                          <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-30 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400">
                              Pilih Kelas untuk Unduh ZIP (PNG)
                            </div>

                            {filterKelas !== 'Semua Kelas' && (
                              <button
                                type="button"
                                onClick={() => handleDirectDownloadClassQR(filterKelas)}
                                className="w-full text-left px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 flex items-center justify-between transition-colors cursor-pointer border-b border-emerald-100"
                              >
                                <span className="flex items-center gap-1.5">
                                  <Download className="w-3.5 h-3.5" />
                                  Unduh {filterKelas} (Aktif)
                                </span>
                                <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-mono">
                                  {siswaList.filter(s => s.kelas === filterKelas).length} Siswa
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDirectDownloadClassQR('Semua Kelas')}
                              className="w-full text-left px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center justify-between transition-colors cursor-pointer border-b border-slate-100"
                            >
                              <span className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                📦 Semua Kelas (1-A s/d 6-B)
                              </span>
                              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-mono">
                                {siswaList.length}
                              </span>
                            </button>

                            <div className="max-h-52 overflow-y-auto divide-y divide-slate-50 py-1">
                              {DAFTAR_KELAS.map((k) => {
                                const count = classStudentCounts[k] || 0;
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => handleDirectDownloadClassQR(k)}
                                    className="w-full text-left px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-between transition-colors cursor-pointer font-medium"
                                  >
                                    <span>{k}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {count} Siswa
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        id="btn-open-batch-print-qr"
                        onClick={() => handleOpenBatchPrint(filterKelas !== 'Semua Kelas' ? filterKelas : 'Semua Kelas')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 font-sans"
                        title="Buka pratinjau kartu & cetak massal"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-300" />
                        <span>🖨️ Cetak / Preview QR</span>
                      </button>

                      {onSyncFromGoogle && (
                        <button
                          type="button"
                          onClick={onSyncFromGoogle}
                          disabled={isSyncing}
                          className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 font-sans"
                          title="Tarik dan perbarui data siswa dari Google Spreadsheet"
                        >
                          <Database className="w-3.5 h-3.5" />
                          <span>{isSyncing ? 'Sync...' : '📥 Sync'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar when Admin is downloading class ZIP */}
                  {isDownloadingQRZip && qrZipProgress && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-900">
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          Mengemas Kartu QR: {qrZipProgress.name}
                        </span>
                        <span>
                          {qrZipProgress.current} / {qrZipProgress.total} (
                          {qrZipProgress.total > 0 ? Math.round((qrZipProgress.current / qrZipProgress.total) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full transition-all duration-150 rounded-full"
                          style={{
                            width: `${qrZipProgress.total > 0 ? (qrZipProgress.current / qrZipProgress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Filter & Search Toolbar */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Cari nama, NIS, NIK, NISN..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-xl outline-none focus:border-indigo-500 font-medium text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={filterKelas}
                        onChange={(e) => setFilterKelas(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-700 font-bold rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 text-[11px]"
                      >
                        <option value="Semua Kelas">Semua Kelas</option>
                        {DAFTAR_KELAS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>

                      <select
                        value={filterDapodik}
                        onChange={(e) => setFilterDapodik(e.target.value as any)}
                        className="bg-white border border-slate-200 text-slate-700 font-bold rounded-xl px-2 py-1.5 outline-none focus:border-indigo-500 text-[11px]"
                      >
                        <option value="semua">Semua Dapodik</option>
                        <option value="sudah">✅ Dapodik</option>
                        <option value="belum">⚠️ Belum Dapodik (NIK)</option>
                      </select>
                    </div>
                  </div>

                  {/* Student Records List */}
                  {filteredSiswa.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
                      Tidak ada siswa yang sesuai dengan filter / pencarian.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                      {filteredSiswa.map((siswa) => {
                          const isBelumDapodik = siswa.statusDapodik === 'Belum Dapodik';
                          return (
                            <div
                              key={siswa.id}
                              className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                                isBelumDapodik 
                                  ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300' 
                                  : 'bg-slate-50 border-slate-200 hover:border-indigo-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                                  isBelumDapodik 
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                    : siswa.jenisKelamin === 'L' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {siswa.nama.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-gray-900 truncate leading-none">{siswa.nama}</h4>
                                    {isBelumDapodik ? (
                                      <span className="bg-amber-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-md font-mono shrink-0">
                                        BELUM DAPODIK
                                      </span>
                                    ) : (
                                      <span className="bg-emerald-100 text-emerald-800 font-bold text-[9px] px-1.5 py-0.5 rounded-md shrink-0">
                                        DAPODIK
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-600 mt-1 font-mono">
                                    <span className="font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-indigo-900">
                                      {siswa.kelas}
                                    </span>
                                    {isBelumDapodik ? (
                                      <span className="text-amber-800 font-bold">
                                        NIK: {siswa.nik || siswa.nis}
                                      </span>
                                    ) : (
                                      <span>
                                        NIS: {siswa.nis} {siswa.nik ? `• NIK: ${siswa.nik}` : ''}
                                      </span>
                                    )}
                                  </div>

                                  <span className="text-[10px] text-slate-500 block mt-0.5">
                                    📞 WA Wali: <span className="font-mono">{siswa.waOrangTua}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Direct action tools: Pindah Kelas, Print, Edit, Delete */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                {/* Direct Quick Move Class Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickMoveSiswa(siswa);
                                    setTargetMoveKelas(siswa.kelas);
                                  }}
                                  className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                  title="Pindahkan siswa ke kelas lain secara cepat"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Pindah Kelas</span>
                                </button>

                                {/* Download Single Student QR Button */}
                                <button
                                  type="button"
                                  id={`btn-target-download-siswa-${siswa.nis || siswa.nik || siswa.id}`}
                                  onClick={() => handleDownloadSingleStudentQR(siswa)}
                                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 p-1.5 rounded-xl transition-colors cursor-pointer"
                                  title="Unduh file gambar QR Code siswa (PNG)"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  id={`btn-target-print-siswa-${siswa.nis}`}
                                  onClick={() => setSelectedPrintSiswa(siswa)}
                                  className="bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 p-1.5 rounded-xl transition-colors cursor-pointer"
                                  title="Generate & Cetak QR Code Siswa"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                
                                <button
                                  type="button"
                                  id={`btn-target-edit-siswa-${siswa.nis}`}
                                  onClick={() => handleEditClick(siswa)}
                                  className="bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 p-1.5 rounded-xl transition-colors cursor-pointer"
                                  title="Edit data lengkap siswa"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  id={`btn-target-delete-siswa-${siswa.nis}`}
                                  onClick={() => setSiswaToDelete(siswa)}
                                  className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 p-1.5 rounded-xl transition-colors cursor-pointer"
                                  title="Hapus data siswa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PEMBAGIAN KELAS 1-6 */}
          {activeTab === 'kelas' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-mono">
                  🏫 PENGELOLAAN DISTRIBUSI KELAS (KELAS 1 SITTING KELAS 6)
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-normal">
                  Berikut pembagian rincian kuantitas murid di setiap rombongan belajar (rombel) SDN 3 Karamatwangi.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {DAFTAR_KELAS.map((targetKelas) => {
                  const countSiswa = siswaList.filter((s) => s.kelas === targetKelas).length;
                  const filterSiswa = siswaList.filter((s) => s.kelas === targetKelas);

                  return (
                    <div key={targetKelas} className="p-4 bg-slate-50 border border-gray-200 rounded-2xl flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-black text-rose-600 block">{targetKelas}</span>
                            <span className="text-[10px] text-slate-500 font-medium">👤 Wali Kelas: {getWaliKelasByKelas(targetKelas)}</span>
                          </div>
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold shrink-0">
                            {countSiswa} Murid
                          </span>
                        </div>
                        
                        {/* Compact list pupils */}
                        <div className="mt-3 space-y-1 max-h-[88px] overflow-y-auto">
                          {filterSiswa.length === 0 ? (
                            <span className="text-[10px] text-gray-400 italic">Belum ada siswa terdaftar</span>
                          ) : (
                            filterSiswa.map((fs) => (
                              <div key={fs.id} className="text-[10px] text-gray-600 truncate border-b border-gray-100 pb-0.5">
                                • {fs.nama} ({fs.nis})
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="border-t border-gray-200 mt-3 pt-2 flex items-center justify-between text-[10px] text-gray-500 font-sans">
                        <span className="font-mono">SDN 3 KARAMATWANGI</span>
                        <button
                          type="button"
                          onClick={() => handleOpenBatchPrint(targetKelas)}
                          disabled={countSiswa === 0}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                          title={`Cetak QR Code semua murid ${targetKelas}`}
                        >
                          <Printer className="w-3 h-3 text-indigo-600" />
                          <span>Cetak QR ({countSiswa})</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PENGATURAN TEMPLATE PESAN WHATSAPP */}
          {activeTab === 'whatsapp' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-rose-500 animate-pulse" />
                  PENGATURAN TEMPLATE NOTIFIKASI WHATSAPP WALI MURID
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-normal">
                  Tentukan kata-kata pesan WhatsApp yang otomatis dikirim ke nomor telepon orang tua murid.
                </p>
              </div>

              <form onSubmit={handleSaveAllSettings} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase">Isi Pesan Notifikasi:</label>
                  <textarea
                    rows={8}
                    value={templatePesan}
                    onChange={(e) => setTemplatePesan(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
                    placeholder="Masukkan template pesan notifikasi..."
                  />
                </div>

                {/* Legend token parser */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-2">
                  <span className="text-[10px] font-black tracking-wider text-rose-600 uppercase">🏷️ TOKEN PARSER YANG DIDUKUNG SEKETIKA (Dapat Dipakai):</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[10px] text-slate-650">
                    <div className="bg-white py-1 px-2 border rounded font-semibold"><code>[Nama Lengkap Siswa]</code></div>
                    <div className="bg-white py-1 px-2 border rounded font-semibold"><code>[Kelas]</code></div>
                    <div className="bg-white py-1 px-2 border rounded font-semibold"><code>[NIS]</code></div>
                    <div className="bg-white py-1 px-2 border rounded font-semibold"><code>[Status Kehadiran]</code></div>
                    <div className="bg-white py-1 px-2 border rounded font-semibold"><code>[Jam:Menit]</code></div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    id="btn-save-whatsapp-settings"
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-6 font-bold text-xs transition-all shadow cursor-pointer"
                  >
                    Simpan Template Pesan WA Gateway
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4 / JADWAL: PENGATURAN JADWAL PRESENSI (PAGI / SIANG / KELAS 1-6) */}
          {(activeTab === 'jadwal' || activeTab === 'waktu') && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              {/* Header & Quick Action Buttons */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 font-display">
                    <CalendarClock className="w-5 h-5 text-blue-600" />
                    PENGATURAN JADWAL PRESENSI SISWA (PAGI, SIANG, KELAS 1–6)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-normal font-sans">
                    Atur jam masuk, batas toleransi terlambat, dan jam pulang per rombongan belajar (1A s/d 6B) atau untuk seluruh sekolah.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenNewJadwal()}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 px-3.5 font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenNewJadwal('siang')}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl py-2 px-3 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Buat Cepat Jadwal Siang Kelas 1-6"
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-600" />
                    <span>+ Jadwal Siang (1–6)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenNewJadwal('pagi')}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl py-2 px-3 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Buat Cepat Jadwal Pagi Reguler"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+ Jadwal Pagi (1–6)</span>
                  </button>
                </div>
              </div>

              {/* FORM TAMBAH / EDIT JADWAL PRESENSI */}
              {isAddingJadwal && (
                <form onSubmit={handleSaveJadwalSubmit} className="bg-blue-50/50 border-2 border-blue-200 rounded-3xl p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-blue-900 font-display">
                          {editingJadwalId ? 'Edit Jadwal Presensi' : 'Tambah Jadwal Presensi Baru'}
                        </h4>
                        <p className="text-[11px] text-blue-700">
                          Konfigurasikan nama shift, daftar kelas yang berlaku, serta jam presensi.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setIsAddingJadwal(false); setEditingJadwalId(null); }}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white transition-all cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Row 1: Nama Jadwal & Tipe Shift */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-8">
                      <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">
                        Nama Jadwal Presensi <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formJadwalNama}
                        onChange={(e) => setFormJadwalNama(e.target.value)}
                        placeholder="Contoh: Jadwal Siang Kelas 1–6"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">
                        Tipe Shift / Sesi
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFormJadwalTipe('Pagi')}
                          className={`py-2 px-1 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                            formJadwalTipe === 'Pagi'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          ☀️ Pagi
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalTipe('Siang')}
                          className={`py-2 px-1 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                            formJadwalTipe === 'Siang'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          🌤️ Siang
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalTipe('Khusus')}
                          className={`py-2 px-1 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                            formJadwalTipe === 'Khusus'
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          🌟 Khusus
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Pemilihan Rombel Kelas (1A s/d 6B) */}
                  <div className="bg-white rounded-2xl p-4 border border-blue-150 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <label className="block text-[11px] font-black uppercase text-slate-800">
                          Pilih Kelas yang Mengikuti Jadwal Ini <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-500">
                          Centang kelas yang akan diberlakukan jam presensi ini ({formJadwalKelas.length} dari {DAFTAR_KELAS.length} kelas terpilih)
                        </span>
                      </div>

                      {/* Quick select toolbars */}
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas([...DAFTAR_KELAS])}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          ✓ Pilih Semua (1A–6B)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas(DAFTAR_KELAS.filter(c => /Kelas\s*[123]/i.test(c)))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          Kelas 1–3
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas(DAFTAR_KELAS.filter(c => /Kelas\s*[456]/i.test(c)))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          Kelas 4–6
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas(DAFTAR_KELAS.filter(c => c.endsWith('-A') || c.endsWith('A')))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          Rombel A
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas(DAFTAR_KELAS.filter(c => c.endsWith('-B') || c.endsWith('B')))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          Rombel B
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormJadwalKelas([])}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition cursor-pointer"
                        >
                          Kosongkan
                        </button>
                      </div>
                    </div>

                    {/* Checkbox Chips Grid for all 12 classes (1A to 6B) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {DAFTAR_KELAS.map((k) => {
                        const isSelected = formJadwalKelas.includes(k);
                        const shortName = k.replace('Kelas ', '');
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleClassSelection(k)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="font-mono">{shortName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                              isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isSelected ? '✓ Aktif' : 'Off'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 3: Pengaturan Jam Masuk, Toleransi, dan Pulang */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white rounded-2xl p-4 border border-blue-150">
                    <div>
                      <label className="block text-[11px] font-black uppercase text-emerald-800 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        Jam Masuk Presensi
                      </label>
                      <input
                        type="time"
                        required
                        value={formJadwalJamMasuk}
                        onChange={(e) => setFormJadwalJamMasuk(e.target.value)}
                        className="w-full bg-emerald-50/50 border border-emerald-300 rounded-xl py-2.5 px-3 text-sm font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Contoh: 07:00 (Pagi) atau 12:30 (Siang)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase text-amber-800 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Batas Toleransi Terlambat
                      </label>
                      <input
                        type="time"
                        required
                        value={formJadwalJamToleransi}
                        onChange={(e) => setFormJadwalJamToleransi(e.target.value)}
                        className="w-full bg-amber-50/50 border border-amber-300 rounded-xl py-2.5 px-3 text-sm font-black text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Lewat jam ini dicatat "Terlambat" (misal 12:45)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase text-blue-800 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        Jam Pulang Sekolah
                      </label>
                      <input
                        type="time"
                        required
                        value={formJadwalJamPulang}
                        onChange={(e) => setFormJadwalJamPulang(e.target.value)}
                        className="w-full bg-blue-50/50 border border-blue-300 rounded-xl py-2.5 px-3 text-sm font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Contoh: 12:30 (Pagi) atau 16:30 (Siang)
                      </span>
                    </div>
                  </div>

                  {/* Row 4: Hari Berlaku & Keterangan */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6 bg-white rounded-2xl p-4 border border-blue-150 space-y-2">
                      <label className="block text-[11px] font-black uppercase text-slate-700">
                        Hari Berlaku
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((h) => {
                          const isDayActive = formJadwalHari.includes(h);
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => toggleHariSelection(h)}
                              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                                isDayActive
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {h}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-6 bg-white rounded-2xl p-4 border border-blue-150 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-black uppercase text-slate-700">
                          Status Jadwal
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormJadwalIsAktif(!formJadwalIsAktif)}
                          className={`text-xs font-extrabold px-3 py-1 rounded-full transition cursor-pointer ${
                            formJadwalIsAktif
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {formJadwalIsAktif ? '🟢 Aktif Berjalan' : '⚪ Nonaktif'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={formJadwalKeterangan}
                        onChange={(e) => setFormJadwalKeterangan(e.target.value)}
                        placeholder="Catatan tambahan (opsional)..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Form Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => { setIsAddingJadwal(false); setEditingJadwalId(null); }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      id="btn-save-jadwal"
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Simpan Jadwal Presensi</span>
                    </button>
                  </div>
                </form>
              )}

              {/* LIST OF SAVED SCHEDULES */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider font-display flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    DAFTAR JADWAL PRESENSI TERPASANG ({jadwalList.length})
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Sistem pemindai QR akan otomatis mencocokkan kelas siswa dengan jadwal aktif di bawah ini.
                  </span>
                </div>

                {jadwalList.length === 0 ? (
                  <div className="text-center p-8 bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                    <CalendarClock className="w-10 h-10 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">Belum ada jadwal presensi khusus.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenNewJadwal('siang')}
                      className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow cursor-pointer"
                    >
                      + Tambah Jadwal Siang Kelas 1–6
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {jadwalList.map((item) => {
                      const isSiang = item.tipe === 'Siang' || /siang/i.test(item.nama);
                      const isPagi = item.tipe === 'Pagi' || /pagi/i.test(item.nama);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-3xl p-5 border transition-all space-y-4 ${
                            item.isAktif !== false
                              ? 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                              : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          {/* Schedule Title & Badges */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                  isSiang
                                    ? 'bg-amber-100 text-amber-800'
                                    : (isPagi ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800')
                                }`}>
                                  {isSiang ? '🌤️ Shift Siang' : (isPagi ? '☀️ Shift Pagi' : '🌟 Khusus')}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleToggleJadwalActive(item.id)}
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md cursor-pointer transition ${
                                    item.isAktif !== false
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {item.isAktif !== false ? '🟢 Aktif' : '⚪ Nonaktif'}
                                </button>
                              </div>

                              <h4 className="font-extrabold text-slate-800 text-sm font-display mt-1.5">
                                {item.nama}
                              </h4>
                              {item.keterangan && (
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                  {item.keterangan}
                                </p>
                              )}
                            </div>

                            {/* Top action icons */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditJadwal(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                title="Edit Jadwal"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateJadwal(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                title="Duplikat Jadwal"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setJadwalToDelete(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                title="Hapus Jadwal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Time Metrics Grid */}
                          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl text-center border border-slate-150">
                            <div>
                              <span className="text-[9px] font-black text-slate-400 uppercase block">Jam Masuk</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">
                                {item.jamMasuk || '07:00'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-slate-400 uppercase block">Toleransi</span>
                              <span className="text-xs font-black text-amber-700 font-mono">
                                {item.jamToleransi || '07:15'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-slate-400 uppercase block">Jam Pulang</span>
                              <span className="text-xs font-black text-blue-700 font-mono">
                                {item.jamPulang || '12:30'}
                              </span>
                            </div>
                          </div>

                          {/* Applied Classes List */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                              <span>Kelas Berlaku ({item.kelas?.length || 0} Rombel):</span>
                              {item.kelas?.length === DAFTAR_KELAS.length && (
                                <span className="text-blue-600 font-extrabold">Semua Kelas (1A–6B)</span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(item.kelas || []).map((k) => (
                                <span
                                  key={k}
                                  className="text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-150 px-2 py-0.5 rounded-md font-mono"
                                >
                                  {k.replace('Kelas ', '')}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Applied Days */}
                          {item.hari && item.hari.length > 0 && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-100">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Hari: {item.hari.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Global Default Fallback Settings Form */}
              <div className="pt-4 border-t border-slate-100">
                <details className="group cursor-pointer">
                  <summary className="text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center justify-between select-none">
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      Pengaturan Waktu Standar Global (Fallback Default)
                    </span>
                    <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>

                  <form onSubmit={handleSaveAllSettings} className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 max-w-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jam Masuk Default</label>
                        <input
                          type="time"
                          value={jamMasuk}
                          onChange={(e) => setJamMasuk(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jam Toleransi Default</label>
                        <input
                          type="time"
                          value={jamToleransi}
                          onChange={(e) => setJamToleransi(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="btn-save-fallback-waktu"
                      className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-2 px-4 font-bold text-xs transition cursor-pointer"
                    >
                      Simpan Default Waktu
                    </button>
                  </form>
                </details>
              </div>
            </div>
          )}

          {/* TAB 5: INTEGRASI GOOGLE SPREADSHEET & GOOGLE DRIVE */}
          {activeTab === 'google' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-150 pb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 font-display">
                    <Database className="w-5 h-5 text-emerald-500" />
                    KONEKTIVITAS INTEGRASI GOOGLE SPREADSHEET & DRIVE
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 leading-normal font-sans">
                    Hubungkan serta cadangkan daftar siswa dan riwayat presensi harian langsung ke Google Sheets & Google Drive.
                  </p>
                </div>

                {/* Google Connection Status Indicator and Button */}
                <div className="shrink-0">
                  {googleToken ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="text-left font-sans">
                        <span className="text-[9px] font-black bg-emerald-600 text-white py-0.5 px-2 rounded-full uppercase block w-fit">
                          TERKONEKSI
                        </span>
                        <p className="text-xs font-bold text-slate-800 max-w-xs truncate mt-1">
                          {googleUser?.email || 'Akun Google Aktif'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onDisconnectGoogle}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-350 text-slate-650 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                      >
                        Putuskan
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5 font-sans">
                      {/* Styled client side Google button */}
                      <button
                        type="button"
                        onClick={onConnectGoogle}
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 shadow-sm py-2 px-4 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
                      >
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                        <span>Sambungkan ke Google</span>
                      </button>
                      <span className="text-[10px] text-amber-600 font-medium">
                        ⚠️ Hubungkan akun untuk sinkronisasi live Google Sheets.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ID Google Fields Form */}
              <form onSubmit={handleSaveAllSettings} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800 uppercase flex items-center justify-between font-display">
                      <span>📊 Google Spreadsheet-ID</span>
                      <span className="text-[10px] bg-slate-100 py-0.5 px-2 rounded-md font-mono text-slate-500 font-normal">Wajib</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={spreadsheetId}
                        onChange={(e) => setSpreadsheetId(e.target.value)}
                        placeholder="ID lembar spreadsheets utama"
                        className="flex-1 bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                      />
                      {onCreateNewSpreadsheet && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!googleToken) {
                              displayNotice('err', 'Harap sambungkan ke Google terlebih dahulu sebelum membuat Spreadsheet baru.');
                              return;
                            }
                            try {
                              const newId = await onCreateNewSpreadsheet();
                              setSpreadsheetId(newId);
                              displayNotice('success', 'Spreadsheet baru berhasil dibuat dan ID terisi otomatis!');
                            } catch (err: any) {
                              displayNotice('err', err.message || 'Gagal membuat spreadsheet.');
                            }
                          }}
                          disabled={isSyncing}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-55 text-white rounded-xl px-3.5 text-[11px] font-black tracking-tight whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center gap-1 font-sans shadow-sm"
                          title="Buatkan Google Spreadsheet baru di Drive Anda"
                        >
                          ✨ Buatkan Baru
                        </button>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 block hover:underline cursor-pointer font-sans">
                      Format: docs.google.com/spreadsheets/d/<span className="font-extrabold font-mono text-slate-800 bg-slate-100 px-1 rounded">{spreadsheetId || '[SPREADSHEET_ID]'}</span>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800 uppercase flex items-center justify-between font-display">
                      <span>📁 Google Drive Folder-ID</span>
                      <span className="text-[10px] bg-slate-100 py-0.5 px-2 rounded-md font-mono text-slate-500 font-normal">Arsip Folder</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={driveFolderId}
                        onChange={(e) => setDriveFolderId(e.target.value)}
                        placeholder="ID folder Google Drive cadangan"
                        className="flex-1 bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                      />
                      {onBackupToDrive && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!googleToken) {
                              displayNotice('err', 'Harap hubungkan akun Google Anda terlebih dahulu.');
                              return;
                            }
                            onBackupToDrive();
                          }}
                          disabled={isSyncing}
                          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-55 text-white rounded-xl px-3.5 text-[11px] font-black tracking-tight whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center gap-1 font-sans shadow-sm"
                          title="Unggah berkas backup saat ini ke Google Drive"
                        >
                          📦 Backup CSV
                        </button>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 block hover:underline cursor-pointer font-sans">
                      Format: drive.google.com/drive/folders/<span className="font-extrabold font-mono text-slate-800 bg-slate-100 px-1 rounded">{driveFolderId || '[FOLDER_ID]'}</span>
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                  <div className="flex gap-2.5 text-xs text-emerald-800 font-sans mb-3">
                    <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-bold uppercase tracking-wider text-[11px]">SINKRONISASI DATABASES DUA ARAH (SINKRON SPREADSHEET)</h5>
                      <p className="text-[11px] leading-relaxed mt-0.5 font-medium text-slate-600">
                        Anda dapat menyinkronkan data siswa yang baru saja diperbarui di Google Spreadsheet ke dalam aplikasi & Cloud Database, atau mengirim data aplikasi saat ini ke Google Spreadsheet.
                      </p>
                    </div>
                  </div>

                  {/* Dual Sync Action Buttons */}
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {onSyncFromGoogle && (
                      <button
                        type="button"
                        onClick={onSyncFromGoogle}
                        disabled={isSyncing}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-2 px-4 text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                      >
                        <Database className="w-4 h-4" />
                        <span>📥 Tarik / Sync Data Siswa Terupdate dari Spreadsheet</span>
                      </button>
                    )}

                    {onSyncToGoogle && (
                      <button
                        type="button"
                        onClick={onSyncToGoogle}
                        disabled={isSyncing}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl py-2 px-4 text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                      >
                        <FileCheck className="w-4 h-4" />
                        <span>📤 Kirim / Backup Data App ke Google Spreadsheet</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 font-sans">
                  <button
                    type="submit"
                    id="btn-save-google-settings"
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-6 font-bold text-xs transition-all shadow cursor-pointer font-semibold"
                  >
                    Simpan Integrasi Google ID
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: AUDIT LOG RIWAYAT AKTIVITAS */}
          {activeTab === 'audit' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-gray-150 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-mono">
                    🕵️ RIWAYAT AUDIT & JEJAK AKTIVITAS OPERATOR
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 leading-normal">
                    Menyimpan data otentik siapa yang melakukan presensi dan memelihara sistem untuk pelaporan Kepala Sekolah.
                  </p>
                </div>
                {onClearLogs && (
                  <button
                    onClick={onClearLogs}
                    type="button"
                    id="btn-clear-audit-logs"
                    className="text-xs font-bold text-rose-650 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 py-1 px-3 border border-rose-200 rounded-lg cursor-pointer"
                  >
                    Reset Audit Log
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {[...activityLogs].reverse().map((log) => {
                  const formatTime = new Date(log.waktu).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });
                  const formatDate = new Date(log.waktu).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });

                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-2"
                    >
                      <div className="text-xs space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-800">{log.user}</span>
                          <span className="text-[9px] uppercase tracking-wider text-rose-600 bg-rose-100 px-1 rounded-sm font-bold">
                            {log.role}
                          </span>
                        </div>
                        <p className="text-slate-600 font-bold text-[11px]">{log.tindakan}</p>
                        <p className="text-gray-500 text-[10px] leading-tight-none">{log.detail}</p>
                      </div>

                      <div className="text-left sm:text-right text-[10px] text-gray-400 shrink-0 select-none">
                        <div>{formatDate}</div>
                        <div> pukul {formatTime} WIB</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: PENGATURAN AKUN ADMIN & OPERATOR */}
          {activeTab === 'akun' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-gray-150 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-display">
                    🛡️ PENGATURAN & KREDENSI AKUN OPERATOR
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 leading-normal">
                    Kelola nama lengkap, nama pengguna (username), kata sandi PIN, serta peranan hak akses operator DIGIWANGI 3.
                  </p>
                </div>
                {!isAddingNewAccount && !editingAccountId && (
                  <button
                    onClick={() => {
                      resetAccountForm();
                      setIsAddingNewAccount(true);
                    }}
                    type="button"
                    className="text-xs font-bold text-red-750 hover:text-white bg-red-50 hover:bg-red-700 py-1.5 px-3.5 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Tambah Akun Operator
                  </button>
                )}
              </div>

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-850 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200 font-sans">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 animate-bounce" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-850 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200 font-sans">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans">
                {/* Left Side: Accounts List */}
                <div className={`space-y-3 lg:col-span-${isAddingNewAccount || editingAccountId ? '7' : '12'}`}>
                  <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase block mb-1">
                    Daftar Akun Terdaftar ({accountsList.length})
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
                    {accountsList.map((acc) => {
                      const getRoleBadgeColor = (role: string) => {
                        switch (role) {
                          case 'admin': return 'bg-red-100 text-red-700 border-red-200';
                          case 'kepsek': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
                          case 'guru': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
                          default: return 'bg-amber-100 text-amber-700 border-amber-200';
                        }
                      };

                      return (
                        <div
                          key={acc.user.id}
                          className={`p-4 bg-slate-50 hover:bg-slate-100/60 transition-all border rounded-2xl flex items-start justify-between gap-4 ${
                            editingAccountId === acc.user.id ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-slate-200'
                          }`}
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-800 text-xs sm:text-sm truncate block leading-none">
                                {acc.user.namaLengkap}
                              </span>
                              <span className={`text-[9px] font-black border uppercase px-1.5 py-0.5 rounded-md ${getRoleBadgeColor(acc.user.role)}`}>
                                {acc.user.role === 'guru' && acc.user.kelasSpesifik ? `${acc.user.role} (${acc.user.kelasSpesifik})` : acc.user.role}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400">
                              <span>Username: <strong className="text-slate-600">{acc.user.username}</strong></span>
                              <span>•</span>
                              <span>PIN Keamanan: <strong className="text-rose-700">{acc.pin}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditAccount(acc)}
                              className="p-1.5 text-slate-500 hover:text-red-750 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all cursor-pointer"
                              title="Ubah detail akun"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {/* Make sure we don't let them delete critical initial or active accounts */}
                            <button
                              type="button"
                              onClick={() => {
                                if (acc.user.id === 'usr-admin' || acc.user.id === 'usr-kepsek') {
                                  displayNotice('err', 'Akun master administrator & Kepala Sekolah tidak boleh dihapus.');
                                  return;
                                }
                                onDeleteAccount(acc.user.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Hapus operator"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reference List: Daftar Resmi Wali Kelas SD Negeri 3 Karamatwangi */}
                  <div className="mt-6 bg-slate-50 border border-slate-200 p-4 rounded-2xl font-sans">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                      <span className="text-xs font-black tracking-wider text-slate-800 uppercase font-display flex items-center gap-1.5">
                        🏫 DAFTAR RESMI WALI KELAS SD NEGERI 3 KARAMATWANGI
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                        12 Rombel
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {DAFTAR_WALI_KELAS.map((wk, idx) => (
                        <div key={wk.kelas} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
                          <div>
                            <span className="font-extrabold text-blue-800 text-[11px] block">{idx + 1}. {wk.kelas}</span>
                            <span className="font-bold text-slate-800 text-xs">{wk.nama}</span>
                          </div>
                          <div className="text-right font-mono text-[10px] text-slate-500 shrink-0">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-700 block">User: {wk.username}</span>
                            <span className="text-emerald-700 font-bold block mt-0.5">PIN: {wk.pin}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Form Create & Edit */}
                {(isAddingNewAccount || editingAccountId) && (
                  <div className="lg:col-span-5 bg-slate-50/60 p-5 border border-slate-200 rounded-3xl space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="border-b border-slate-200 pb-2">
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-red-700" />
                        {editingAccountId ? 'Ubah Profil Operator' : 'Daftarkan Akun Baru'}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                        {editingAccountId ? 'Perbarui username, nama, atau PIN operator yang dipilih.' : 'Isi kolom di bawah untuk membagikan akses presensi.'}
                      </p>
                    </div>

                    <form onSubmit={handleAccountSubmit} className="space-y-4">
                      {/* Full Name */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-650 uppercase tracking-wider mb-1.5">
                          Nama Lengkap
                        </label>
                        <input
                          type="text"
                          value={accountNamaLengkap}
                          onChange={(e) => setAccountNamaLengkap(e.target.value)}
                          placeholder="Contoh: Budi Santoso, S.Pd."
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-700 shadow-2xs placeholder-slate-400 font-sans"
                        />
                      </div>

                      {/* Username */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-650 uppercase tracking-wider mb-1.5">
                          Username Login
                        </label>
                        <input
                          type="text"
                          value={accountUsername}
                          onChange={(e) => setAccountUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                          placeholder="Contoh: budis"
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-red-700 shadow-2xs placeholder-slate-400"
                        />
                        <span className="text-[9px] text-slate-400 mt-1 block leading-tight">
                          Gunakan huruf kecil rapat tanpa spasi.
                        </span>
                      </div>

                      {/* PIN Keamanan */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-650 uppercase tracking-wider mb-1.5">
                          PIN Masuk (Min 4 digit/angka)
                        </label>
                        <input
                          type="text"
                          value={accountPin}
                          onChange={(e) => setAccountPin(e.target.value.replace(/\D/g, ''))}
                          maxLength={6}
                          placeholder="Isi 4 d/d 6 digit angka"
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-xs font-mono font-black focus:outline-none focus:ring-2 focus:ring-red-700 shadow-2xs placeholder-slate-400 tracking-widest text-center"
                        />
                      </div>

                      {/* Role selection */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-650 uppercase tracking-wider mb-1.5">
                          Hak Akses / Peranan (Role)
                        </label>
                        <select
                          value={accountRole}
                          onChange={(e) => setAccountRole(e.target.value as Role)}
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold focus:ring-2 focus:ring-red-700 shadow-2xs text-slate-700 focus:outline-none"
                        >
                          <option value="admin">Administrator (Admin Master)</option>
                          <option value="kepsek">Kepala Sekolah (Kepsek)</option>
                          <option value="guru">Guru Kelas (Wali Kelas)</option>
                          <option value="piket">Petugas Piket Gerbang</option>
                        </select>
                      </div>

                      {/* Specific Class Selector if Guru is selected */}
                      {accountRole === 'guru' && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-650 uppercase tracking-wider mb-1.5">
                            Spesifik Mengampu Kelas
                          </label>
                          <select
                            value={accountKelasSpesifik}
                            onChange={(e) => setAccountKelasSpesifik(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold focus:ring-2 focus:ring-red-700 shadow-2xs text-slate-700 focus:outline-none"
                          >
                            {DAFTAR_KELAS.map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                            <option value="Semua Kelas">Semua Kelas</option>
                          </select>
                        </div>
                      )}

                      {/* Form action buttons */}
                      <div className="flex gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={resetAccountForm}
                          className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-xl py-2 font-bold text-xs transition-colors cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-red-750 hover:bg-red-800 text-white rounded-xl py-2 font-bold text-xs transition-all shadow-md cursor-pointer"
                        >
                          {editingAccountId ? 'Perbarui' : 'Daftarkan'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* CUSTOM QUICK MOVE CLASS MODAL */}
      {quickMoveSiswa && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl text-left space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm font-display">Pindah Kelas Siswa</h4>
                  <p className="text-[11px] text-slate-500">Koreksi atau pindahkan rombel siswa secara instan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickMoveSiswa(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Nama Siswa:</span>
                <span className="font-extrabold text-slate-900">{quickMoveSiswa.nama}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Identitas Siswa:</span>
                <span className="font-mono text-slate-700 font-bold">
                  {quickMoveSiswa.statusDapodik === 'Belum Dapodik' ? `NIK: ${quickMoveSiswa.nik || quickMoveSiswa.nis}` : `NIS: ${quickMoveSiswa.nis}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Kelas Saat Ini:</span>
                <span className="bg-white border border-indigo-200 text-indigo-900 font-black px-2 py-0.5 rounded-md font-mono text-[11px]">
                  {quickMoveSiswa.kelas}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-2">
                Pilih Kelas Baru:
              </label>
              <select
                value={targetMoveKelas}
                onChange={(e) => setTargetMoveKelas(e.target.value)}
                className="w-full bg-white border-2 border-indigo-400 focus:border-indigo-600 rounded-xl py-2.5 px-3 text-xs font-black text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs font-mono"
              >
                {DAFTAR_KELAS.map((k) => (
                  <option key={k} value={k}>
                    {k} {k === quickMoveSiswa.kelas ? '(Kelas Sekarang)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setQuickMoveSiswa(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-bold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleQuickMoveSubmit}
                disabled={targetMoveKelas === quickMoveSiswa.kelas}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 font-bold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Simpan Pindah Kelas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION DIALOG (IFRAME-SAFE) */}
      {siswaToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-700 mx-auto">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-base font-display">Hapus Data Siswa?</h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-1.5">
                Apakah Anda benar-benar yakin ingin menghapus pendaftaran siswa bernama <b className="text-slate-800 font-extrabold">{siswaToDelete.nama}</b> dengan NIS <code className="bg-slate-100 py-0.5 px-1.5 rounded text-red-755 font-bold font-mono">{siswaToDelete.nis}</code>?
              </p>
              <p className="text-[10px] text-red-700 bg-red-50 py-1.5 px-3 rounded-xl inline-block mt-2 font-bold uppercase tracking-wide border border-red-100">
                ⚠️ tindakan ini tidak dapat dibatalkan!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSiswaToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl py-2.5 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteSiswa(siswaToDelete.id);
                  displayNotice('success', `Berhasil menghapus data siswa: ${siswaToDelete.nama}`);
                  setSiswaToDelete(null);
                }}
                className="flex-1 bg-red-700 hover:bg-red-800 text-white rounded-xl py-2.5 font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                Ya, Hapus Siswa
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CUSTOM DELETE JADWAL PRESENSI DIALOG */}
      {jadwalToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-700 mx-auto">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-base font-display">Hapus Jadwal Presensi?</h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-1.5">
                Apakah Anda yakin ingin menghapus jadwal <b className="text-slate-800 font-extrabold">{jadwalToDelete.nama}</b> ({jadwalToDelete.jamMasuk} - {jadwalToDelete.jamPulang})?
              </p>
              <p className="text-[10px] text-amber-800 bg-amber-50 py-1.5 px-3 rounded-xl inline-block mt-2 font-bold uppercase tracking-wide border border-amber-200">
                ⚠️ Siswa pada kelas terkait akan kembali menggunakan jam default.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setJadwalToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteJadwalConfirm}
                className="flex-1 bg-red-700 hover:bg-red-800 text-white rounded-xl py-2.5 font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                Ya, Hapus Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Batch Print QR Code */}
      <BatchQRPrintModal
        isOpen={isBatchPrintModalOpen}
        onClose={() => setIsBatchPrintModalOpen(false)}
        siswaList={siswaList}
        defaultKelas={batchPrintDefaultKelas}
      />
    </div>
  );
}

export default React.memo(AdminPanel);
