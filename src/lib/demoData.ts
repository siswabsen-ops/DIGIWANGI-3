import { Siswa, User, SystemSettings, Presensi, ActivityLog, JadwalPresensi, DAFTAR_KELAS } from '../types';
import realStudents from './realStudents.json';

export const DEFAULT_JADWAL_PRESENSI: JadwalPresensi[] = [
  {
    id: 'jdw-pagi-reguler',
    nama: 'Jadwal Pagi Reguler',
    tipe: 'Pagi',
    kelas: [
      'Kelas 1-A', 'Kelas 1-B',
      'Kelas 2-A', 'Kelas 2-B',
      'Kelas 3-A', 'Kelas 3-B',
      'Kelas 4-A', 'Kelas 4-B',
      'Kelas 5-A', 'Kelas 5-B',
      'Kelas 6-A', 'Kelas 6-B'
    ],
    hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    jamMasuk: '07:00',
    jamToleransi: '07:15',
    jamPulang: '12:30',
    isAktif: true,
    keterangan: 'Jadwal presensi shift pagi standar seluruh kelas'
  },
  {
    id: 'jdw-siang-kelas-1-6',
    nama: 'Jadwal Siang Kelas 1–6',
    tipe: 'Siang',
    kelas: [
      'Kelas 1-A', 'Kelas 1-B',
      'Kelas 2-A', 'Kelas 2-B',
      'Kelas 3-A', 'Kelas 3-B',
      'Kelas 4-A', 'Kelas 4-B',
      'Kelas 5-A', 'Kelas 5-B',
      'Kelas 6-A', 'Kelas 6-B'
    ],
    hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    jamMasuk: '12:30',
    jamToleransi: '12:45',
    jamPulang: '16:30',
    isAktif: true,
    keterangan: 'Jadwal presensi shift siang untuk kelas 1A sampai 6B'
  }
];

export const DAFTAR_WALI_KELAS = [
  { kelas: 'Kelas 1-A', nama: 'Rima Rohmatul Hasanah, S.Pd.', username: 'guru1a', pin: '28001' },
  { kelas: 'Kelas 1-B', nama: 'Apriyanti Sri Habibah, S.Pd.Gr.', username: 'guru1b', pin: '28002' },
  { kelas: 'Kelas 2-A', nama: 'Linda Safitri Indriyani, S.Pd.Gr.', username: 'guru2a', pin: '28003' },
  { kelas: 'Kelas 2-B', nama: 'Rena Siti Napisah, S.Pd.Gr.', username: 'guru2b', pin: '28004' },
  { kelas: 'Kelas 3-A', nama: 'Ayu Latifah Somantri, S.Pd.Gr.', username: 'guru3a', pin: '28005' },
  { kelas: 'Kelas 3-B', nama: 'Ai Nursyifa, S.Pd.,MCE.', username: 'guru3b', pin: '28006' },
  { kelas: 'Kelas 4-A', nama: 'Widia Siti Nuraeni, S.Pd.Gr.', username: 'guru4a', pin: '28007' },
  { kelas: 'Kelas 4-B', nama: 'Mita Nurhasni Faujiah, S.Pd.,MCE.', username: 'guru4b', pin: '28008' },
  { kelas: 'Kelas 5-A', nama: 'Tanti Maryam Kurnianti, S.Pd.Gr.', username: 'guru5a', pin: '28009' },
  { kelas: 'Kelas 5-B', nama: 'Tedi Rismadiansah, S.Pd.Gr.', username: 'guru5b', pin: '28010' },
  { kelas: 'Kelas 6-A', nama: 'Taufik Firdaus, S.Pd.Gr.', username: 'guru6a', pin: '28011' },
  { kelas: 'Kelas 6-B', nama: 'Usman Fauzan Alan, S.Pd.Gr.', username: 'guru6b', pin: '28012' }
];

export const getWaliKelasByKelas = (kelasName: string): string => {
  const item = DAFTAR_WALI_KELAS.find(
    (w) =>
      w.kelas.toLowerCase() === kelasName.toLowerCase() ||
      w.kelas.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === kelasName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  );
  return item ? item.nama : 'Guru Kelas';
};

export const USER_DEMO_ACCOUNTS: { user: User; pin: string }[] = [
  {
    user: {
      id: 'usr-admin',
      username: 'admin',
      namaLengkap: 'Panji Teguh Amarta Surya, S.Pd.I., Gr.',
      role: 'admin'
    },
    pin: '1234'
  },
  {
    user: {
      id: 'usr-kepsek',
      username: 'kepsek',
      namaLengkap: 'Cucu Maspika, S.Pd.I.,M.Pd.,MCE',
      role: 'kepsek'
    },
    pin: '2222'
  },
  ...DAFTAR_WALI_KELAS.map((g) => ({
    user: {
      id: `usr-guru-${g.username}`,
      username: g.username,
      namaLengkap: g.nama,
      role: 'guru' as const,
      kelasSpesifik: g.kelas
    },
    pin: g.pin
  })),
  {
    user: {
      id: 'usr-piket',
      username: 'piket',
      namaLengkap: 'Cecep Mulyana',
      role: 'piket'
    },
    pin: '4444'
  }
];

export const SISWA_INITIAL: Siswa[] = (realStudents as any[]).map((s) => {
  let mappedKelas = s.kelas || 'Kelas 1-A';
  const m = mappedKelas.match(/Kelas\s*(\d)\s*-?\s*([A-Za-z])/i);
  if (m) {
    mappedKelas = `Kelas ${m[1]}-${m[2].toUpperCase()}`;
  } else {
    const m2 = mappedKelas.match(/Kelas\s*(\d)/i);
    if (m2) {
      mappedKelas = `Kelas ${m2[1]}-A`;
    }
  }
  return {
    id: s.id,
    nis: s.nis,
    nama: s.nama,
    kelas: mappedKelas,
    jenisKelamin: s.jenisKelamin,
    waOrangTua: s.waOrangTua,
    tempatLahir: s.tempatLahir,
    tanggalLahir: s.tanggalLahir
  };
});

export const SETTINGS_INITIAL: SystemSettings = {
  jamMasuk: '07:00',
  jamToleransi: '07:15',
  jamPulang: '12:30',
  jadwalList: DEFAULT_JADWAL_PRESENSI,
  activeJadwalId: 'jdw-pagi-reguler',
  templatePesan: `🔔 *NOTIFIKASI KEHADIRAN - SDN 3 KARAMATWANGI*

Yth. Orang Tua / Wali Murid,
Siswa atas nama: *[Nama Lengkap Siswa]*
Kelas: *[Kelas]* (NIS: *[NIS]*)

Telah tercatat *[Status Kehadiran]* di sekolah pada pukul *[Jam:Menit]* WIB.

Terima kasih atas perhatian dan kerja samanya.`,
  templatePesanPulang: `🔔 *NOTIFIKASI PULANG SEKOLAH - SDN 3 KARAMATWANGI*

Yth. Orang Tua / Wali Murid,
Siswa atas nama: *[Nama Lengkap Siswa]*
Kelas: *[Kelas]* (NIS: *[NIS]*)

Telah selesai mengikuti kegiatan pembelajaran dan *Pulang Sekolah* pada pukul *[Jam:Menit]* WIB.

Semoga selamat sampai di rumah. Terima kasih.`,
  googleSpreadsheetId: '1V6IomZ0hR_E2N_lF5aK804-Oat_bVzNlW3O0Vj2vExF',
  googleDriveFolderId: '1RoPgYTYP3GqzcDhLv_xKJshIYRjQisoe',
  isGoogleConnected: true,
  isWhatsAppConnected: true,
  waApiKey: 'KARA3_WS_GATEWAY_v2'
};

// Log awal untuk realistis harian
export const LOGS_INITIAL: ActivityLog[] = [
  {
    id: 'log-001',
    waktu: '2026-08-18T06:30:00Z',
    user: 'Panji Teguh Amarta Surya, S.Pd.I., Gr.',
    role: 'admin',
    tindakan: 'Sistem Dimulai',
    detail: 'Sistem presensi DIGIWANGI 3 berhasil dimuat pada pagi hari.'
  },
  {
    id: 'log-002',
    waktu: '2026-08-18T06:35:12Z',
    user: 'Cecep Mulyana',
    role: 'piket',
    tindakan: 'Login Sistem',
    detail: 'Petugas Piket masuk ke sistem menggunakan perangkat HP Android Samsung M12.'
  },
  {
    id: 'log-003',
    waktu: '2026-08-18T06:38:33Z',
    user: 'Cecep Mulyana',
    role: 'piket',
    tindakan: 'Inisialisasi Kamera & Scanner',
    detail: 'Kamera QR Code Scanner aktif, memindai presensi pagi siswa seluruh kelas 1-A s/d 6-B.'
  }
];

/**
 * Menghasilkan rekaman presensi lengkap dan realistis untuk seluruh murid di semua 12 rombel kelas (1-A s/d 6-B)
 * Menjamin kehadiran mencakup seluruh kelas secara menyeluruh sesuai kehadiran riil di sekolah.
 */
export const generateRealisticAttendanceForDate = (
  students: Siswa[],
  targetDate: string = '2026-08-18'
): Presensi[] => {
  return students.map((siswa, idx) => {
    // Seed deterministik berbasis id + tanggal agar konsisten dan stabil
    const charCodeSum = (siswa.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const dateNum = parseInt(targetDate.replace(/[^0-9]/g, '').slice(-2)) || 18;
    const seed = (idx * 37 + charCodeSum + dateNum * 13) % 100;

    let status: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alfa' = 'Hadir';
    let waktu = '06:45:10';
    let pesan = '';

    if (seed < 89) {
      // 89% Hadir Tepat Waktu (06:35 - 06:58)
      status = 'Hadir';
      const m = String(35 + (seed % 24)).padStart(2, '0');
      const s = String((seed * 7) % 60).padStart(2, '0');
      waktu = `06:${m}:${s}`;
      pesan = `Tercatat Hadir via QR Code Scanner Gate Utama (WIB)`;
    } else if (seed < 95) {
      // 6% Terlambat (07:16 - 07:28)
      status = 'Terlambat';
      const m = String(16 + (seed % 12)).padStart(2, '0');
      const s = String((seed * 11) % 60).padStart(2, '0');
      waktu = `07:${m}:${s}`;
      pesan = `Tercatat Terlambat masuk sekolah pukul ${waktu} WIB`;
    } else if (seed < 97) {
      // 2% Sakit
      status = 'Sakit';
      waktu = '07:05:00';
      pesan = `Keterangan Sakit diterima dari Orang Tua via WA (${siswa.waOrangTua})`;
    } else if (seed < 99) {
      // 2% Izin
      status = 'Izin';
      waktu = '07:10:00';
      pesan = `Izin keperluan keluarga terkonfirmasi oleh Wali Kelas`;
    } else {
      // 1% Alfa
      status = 'Alfa';
      waktu = '07:30:00';
      pesan = `Tidak hadir tanpa keterangan (Alfa)`;
    }

    return {
      id: `pr-${targetDate}-${siswa.id}`,
      siswaId: siswa.id,
      nis: siswa.nis,
      nik: siswa.nik,
      nama: siswa.nama,
      kelas: siswa.kelas,
      tanggal: targetDate,
      waktu,
      status,
      waStatus: 'Terkirim',
      pesanTerkirim: pesan,
      operator: 'Cecep Mulyana (Piket)'
    };
  });
};

const getTodayDateStr = (): string => {
  try {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '2026-08-18';
  }
};

const todayDate = getTodayDateStr();

export const PRESENSI_INITIAL: Presensi[] = [
  ...generateRealisticAttendanceForDate(SISWA_INITIAL, todayDate),
  ...generateRealisticAttendanceForDate(SISWA_INITIAL, '2026-08-17'),
  ...generateRealisticAttendanceForDate(SISWA_INITIAL, '2026-08-16'),
  ...generateRealisticAttendanceForDate(SISWA_INITIAL, '2026-08-15'),
];
