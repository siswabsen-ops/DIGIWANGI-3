export type Role = 'admin' | 'kepsek' | 'guru' | 'piket';

export interface User {
  id: string;
  username: string;
  namaLengkap: string;
  role: Role;
  kelasSpesifik?: string; // Khusus Guru, contoh: "Kelas 4" atau "Semua Kelas"
}

export type StatusDapodik = 'Sudah Dapodik' | 'Belum Dapodik';
export type QRIdentifierType = 'NIS' | 'NIK' | 'NISN';

export interface Siswa {
  id: string;
  nis: string;
  nisn?: string;
  nik?: string; // NIK 16-digit (KK/KTP) terutama untuk siswa baru/belum masuk dapodik
  statusDapodik?: StatusDapodik;
  qrIdentifierType?: QRIdentifierType;
  nama: string;
  kelas: string; // Kelas 1 s/d 6
  jenisKelamin: 'L' | 'P';
  waOrangTua: string; // Format Indonesia, misal: "081234567890" atau "628..."
  tempatLahir?: string;
  tanggalLahir?: string;
  catatan?: string;
}

export const DAFTAR_KELAS = [
  'Kelas 1-A', 'Kelas 1-B',
  'Kelas 2-A', 'Kelas 2-B',
  'Kelas 3-A', 'Kelas 3-B',
  'Kelas 4-A', 'Kelas 4-B',
  'Kelas 5-A', 'Kelas 5-B',
  'Kelas 6-A', 'Kelas 6-B'
];

export type StatusKehadiran = 'Hadir' | 'Sakit' | 'Izin' | 'Alfa' | 'Terlambat';

export interface JadwalPresensi {
  id: string;
  nama: string; // contoh: "Jadwal Siang Kelas 1–6", "Jadwal Pagi Reguler"
  tipe?: 'Pagi' | 'Siang' | 'Khusus' | 'Lainnya';
  kelas: string[]; // array nama kelas, misal: ['Kelas 1-A', 'Kelas 1-B', ... 'Kelas 6-B']
  hari?: string[]; // ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  jamMasuk: string; // Format "12:30" atau "07:00"
  jamToleransi: string; // Format "12:45" atau "07:15"
  jamPulang: string; // Format "16:30" atau "12:30"
  isAktif: boolean;
  keterangan?: string;
}

export interface Presensi {
  id: string;
  siswaId: string;
  nis: string;
  nik?: string;
  nama: string;
  kelas: string;
  tanggal: string; // Format YYYY-MM-DD
  waktu: string; // Format HH:MM:SS
  status: StatusKehadiran;
  waStatus: 'Pending' | 'Terkirim' | 'Gagal';
  pesanTerkirim?: string;
  operator: string; // Siapa yang menginput (Admin, Guru, Piket)
}

export interface SystemSettings {
  jamMasuk: string; // Format "07:00"
  jamToleransi: string; // Format "07:15"
  jamPulang?: string; // Format "12:30"
  jadwalList?: JadwalPresensi[]; // Daftar Multi Jadwal Presensi (Pagi/Siang/Khusus)
  activeJadwalId?: string; // ID Jadwal Aktif Utama
  templatePesan: string;
  templatePesanPulang?: string;
  googleSpreadsheetId: string;
  googleDriveFolderId: string;
  isGoogleConnected: boolean;
  isWhatsAppConnected: boolean;
  waApiKey: string;
  appLogoUrl?: string; // Logo utama DIGIWANGI 3 (Custom/Base64/URL)
  dinasLogoUrl?: string; // Logo Dinas Pendidikan (Custom/Base64/URL)
  garutLogoUrl?: string; // Logo Pemerintah Kabupaten Garut (Custom/Base64/URL)
  namaKepsek?: string; // Nama Kepala Sekolah untuk Tanda Tangan Laporan
  nipKepsek?: string; // NIP Kepala Sekolah
}

export interface ActivityLog {
  id: string;
  waktu: string; // DateTime ISO String
  user: string; // Nama Lengkap operator
  role: Role;
  tindakan: string; // misal: "Melakukan Presensi", "Menambah Siswa", "Pindah Kelas"
  detail: string;
}

/**
 * Mendapatkan identifier yang akan dimasukkan ke payload QR Code untuk siswa
 */
export function getStudentQRIdentifier(siswa: Siswa): string {
  if (siswa.qrIdentifierType === 'NIK' && siswa.nik && siswa.nik.trim()) {
    return siswa.nik.trim();
  }
  if (siswa.qrIdentifierType === 'NISN' && siswa.nisn && siswa.nisn.trim()) {
    return siswa.nisn.trim();
  }
  if (siswa.statusDapodik === 'Belum Dapodik' && siswa.nik && siswa.nik.trim()) {
    return siswa.nik.trim();
  }
  return siswa.nis ? siswa.nis.trim() : (siswa.nik ? siswa.nik.trim() : siswa.id);
}

/**
 * Mencari data siswa berdasarkan input scan (bisa berupa NIS, NIK, NISN, ID, atau payload JSON)
 */
export function findStudentByCode(siswaList: Siswa[], code: string): Siswa | undefined {
  if (!code) return undefined;
  const clean = code.trim();
  if (!clean) return undefined;

  // 1. Direct exact match (NIS, NIK, NISN, ID)
  const exact = siswaList.find((s) => 
    (s.nis && s.nis.trim() === clean) ||
    (s.nik && s.nik.trim() === clean) ||
    (s.nisn && s.nisn.trim() === clean) ||
    (s.id && s.id.trim() === clean)
  );
  if (exact) return exact;

  // 2. Strip standard prefixes: NIK:, NIS:, NISN:, ID:
  const stripped = clean.replace(/^(nik|nis|nisn|id)\s*[:=-]\s*/i, '').trim();
  if (stripped && stripped !== clean) {
    const strippedMatch = siswaList.find((s) => 
      (s.nis && s.nis.trim() === stripped) ||
      (s.nik && s.nik.trim() === stripped) ||
      (s.nisn && s.nisn.trim() === stripped) ||
      (s.id && s.id.trim() === stripped)
    );
    if (strippedMatch) return strippedMatch;
  }

  // 3. Check JSON payload format
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean);
      const target = parsed.nik || parsed.nis || parsed.nisn || parsed.id;
      if (target) {
        return findStudentByCode(siswaList, String(target));
      }
    } catch {
      // ignore
    }
  }

  // 4. Case-insensitive alphanumeric match
  const alphaClean = clean.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (alphaClean) {
    const alphaMatch = siswaList.find((s) => {
      const sNis = s.nis ? s.nis.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
      const sNik = s.nik ? s.nik.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
      const sNisn = s.nisn ? s.nisn.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
      return (sNis && sNis === alphaClean) || (sNik && sNik === alphaClean) || (sNisn && sNisn === alphaClean);
    });
    if (alphaMatch) return alphaMatch;
  }

  return undefined;
}

/**
 * Normalisasi nama atau kode kelas (contoh: "1A", "1-A", "Kelas 1-A" -> "1A")
 */
export function normalizeKelasCode(k: string): string {
  if (!k) return '';
  return k.replace(/kelas/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

/**
 * Mencari jadwal presensi yang paling sesuai untuk kelas dan waktu saat ini
 */
export function getApplicableJadwal(
  kelasName: string,
  settings: SystemSettings,
  currentHourMinute?: string
): JadwalPresensi {
  const normKelas = normalizeKelasCode(kelasName);
  const list = settings.jadwalList && settings.jadwalList.length > 0 ? settings.jadwalList : [];
  
  // 1. Filter active schedules
  const activeSchedules = list.filter((j) => j.isAktif !== false);

  // 2. Filter schedules that explicitly cover this class
  const classMatches = activeSchedules.filter((j) => {
    if (!j.kelas || j.kelas.length === 0) return true; // berlaku umum
    return j.kelas.some((ck) => normalizeKelasCode(ck) === normKelas);
  });

  if (classMatches.length === 1) {
    return classMatches[0];
  }

  if (classMatches.length > 1) {
    if (currentHourMinute) {
      // Pick the schedule closest to current time
      const [nowH, nowM] = currentHourMinute.split(':').map(Number);
      const nowTotalMin = (nowH || 0) * 60 + (nowM || 0);

      let closest = classMatches[0];
      let minDiff = Infinity;

      for (const sch of classMatches) {
        const [inH, inM] = (sch.jamMasuk || '07:00').split(':').map(Number);
        const inTotalMin = (inH || 0) * 60 + (inM || 0);
        const diff = Math.abs(nowTotalMin - inTotalMin);
        if (diff < minDiff) {
          minDiff = diff;
          closest = sch;
        }
      }
      return closest;
    }
    return classMatches[0];
  }

  // 3. If no specific class match in list, check global active schedule or build default
  if (activeSchedules.length > 0) {
    return activeSchedules[0];
  }

  // Fallback default
  return {
    id: 'default-fallback',
    nama: 'Jadwal Standar Sekolah',
    tipe: 'Pagi',
    kelas: DAFTAR_KELAS,
    jamMasuk: settings.jamMasuk || '07:00',
    jamToleransi: settings.jamToleransi || '07:15',
    jamPulang: settings.jamPulang || '12:30',
    isAktif: true
  };
}

// ==========================================
// KURIKULUM MERDEKA: PENILAIAN AKHLAK & PROFIL PELAJAR PANCASILA
// ==========================================

export type SkalaPenilaian = 'B' | 'M' | 'S' | 'K';

export interface SkalaPenilaianInfo {
  code: SkalaPenilaian;
  label: string;
  fullName: string;
  badgeColor: string;
  bgLight: string;
  textColor: string;
  borderColor: string;
  description: string;
  numericScore: number;
}

export const SKALA_PENILAIAN_MAP: Record<SkalaPenilaian, SkalaPenilaianInfo> = {
  B: {
    code: 'B',
    label: 'Belum',
    fullName: 'Belum Berkembang (BB)',
    badgeColor: 'bg-rose-500 text-white',
    bgLight: 'bg-rose-50 border-rose-200 text-rose-800',
    textColor: 'text-rose-600',
    borderColor: 'border-rose-300',
    description: 'Siswa belum menunjukkan perilaku yang diharapkan dan masih memerlukan bimbingan intensif pendidik.',
    numericScore: 1
  },
  M: {
    code: 'M',
    label: 'Mulai',
    fullName: 'Mulai Berkembang (MB)',
    badgeColor: 'bg-amber-500 text-slate-950 font-bold',
    bgLight: 'bg-amber-50 border-amber-200 text-amber-850',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-300',
    description: 'Siswa mulai menampilkan perilaku yang diharapkan namun belum konsisten dan masih perlu diingatkan pendidik.',
    numericScore: 2
  },
  S: {
    code: 'S',
    label: 'Sesuai',
    fullName: 'Berkembang Sesuai Harapan (BSH)',
    badgeColor: 'bg-blue-600 text-white',
    bgLight: 'bg-blue-50 border-blue-200 text-blue-850',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-300',
    description: 'Siswa telah menunjukkan perilaku yang diharapkan secara konsisten dan mandiri dalam aktivitas harian.',
    numericScore: 3
  },
  K: {
    code: 'K',
    label: 'Berkembang',
    fullName: 'Sangat Berkembang (SB)',
    badgeColor: 'bg-emerald-600 text-white',
    bgLight: 'bg-emerald-50 border-emerald-200 text-emerald-850',
    textColor: 'text-emerald-600',
    borderColor: 'border-emerald-300',
    description: 'Siswa telah mencapai tingkat pemahaman mendalam, konsisten, serta mampu menjadi teladan/mengajak teman sebaya.',
    numericScore: 4
  }
};

export interface DimensiProfilPancasila {
  id: number;
  nama: string;
  icon: string;
  ringkasan: string;
  deskripsi: string;
}

export const DAFTAR_DIMENSI_PROFIL: DimensiProfilPancasila[] = [
  {
    id: 1,
    nama: 'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia',
    icon: '✨',
    ringkasan: 'Akhlak Beragama & Budi Pekerti',
    deskripsi: 'Pelajar berakhlak dalam hubungannya dengan Tuhan YME, diri sendiri, sesama manusia, dan alam sekitar.'
  },
  {
    id: 2,
    nama: 'Berkebinekaan Global',
    icon: '🌍',
    ringkasan: 'Menghargai Budaya & Kebinekaan',
    deskripsi: 'Pelajar mempertahankan budaya luhur, lokalitas, dan identitasnya, serta tetap berpikiran terbuka terhadap budaya lain.'
  },
  {
    id: 3,
    nama: 'Bergotong Royong',
    icon: '🤝',
    ringkasan: 'Kolaborasi & Kepedulian',
    deskripsi: 'Kemampuan pelajar untuk melakukan kegiatan bersama-sama secara sukarela agar kegiatan berjalan lancar dan ringan.'
  },
  {
    id: 4,
    nama: 'Mandiri',
    icon: '🧑‍🎓',
    ringkasan: 'Inisiatif & Regulasi Diri',
    deskripsi: 'Pelajar bertanggung jawab atas proses dan hasil belajarnya dengan kesadaran diri dan situasi yang dihadapi.'
  },
  {
    id: 5,
    nama: 'Bernalar Kritis',
    icon: '🧠',
    ringkasan: 'Analisis & Pemecahan Masalah',
    deskripsi: 'Pelajar mampu secara objektif memproses informasi kualitatif maupun kuantitatif, membangun keterkaitan, dan mengambil keputusan.'
  },
  {
    id: 6,
    nama: 'Kreatif',
    icon: '🎨',
    ringkasan: 'Gagasan & Karya Orisinal',
    deskripsi: 'Pelajar mampu memodifikasi dan menghasilkan sesuatu yang orisinal, bermakna, bermanfaat, dan berdampak.'
  }
];

export const SUB_BIDANG_AKHLAK_DIMENSI_1 = [
  'Akhlak kepada Tuhan',
  'Akhlak kepada Sesama',
  'Akhlak kepada Diri',
  'Akhlak kepada Lingkungan'
] as const;

export type SubBidangAkhlak = typeof SUB_BIDANG_AKHLAK_DIMENSI_1[number];

export interface PenilaianAkhlak {
  id: string; // id_penilaian
  kunci_siswa: string; // NISN jika ada, kalau kosong gunakan NIK, atau fallback NIS
  tanggal: string; // Format YYYY-MM-DD
  dimensi_profil: number; // 1 - 6
  sub_bidang_akhlak?: string; // Khusus Dimensi 1: Tuhan / Sesama / Diri / Lingkungan
  nilai_skala: SkalaPenilaian; // B / M / S / K
  catatan_singkat: string;
  tahun_ajaran: string; // misal "2024/2025" atau "2025/2026"
  semester: '1' | '2' | 'Ganjil' | 'Genap';
  penilai?: string; // Nama guru atau operator
}

// ==========================================
// CATATAN ANEKDOT (PERILAKU & PERKEMBANGAN NYATA)
// ==========================================

export type KategoriAnekdot = 'Akhlak' | 'Sikap' | 'Prestasi' | 'Pelanggaran';

export interface CatatanAnekdot {
  id: string; // id_anekdot
  kunci_siswa: string; // NISN jika ada, kalau kosong gunakan NIK
  tanggal: string; // Format YYYY-MM-DD
  kategori: KategoriAnekdot;
  uraian_peristiwa: string; // Deskripsi perilaku nyata yang diamati
  tindak_lanjut: string; // Bimbingan, penguatan, apresiasi, atau diskusi orang tua
  tahun_ajaran: string;
  semester: '1' | '2' | 'Ganjil' | 'Genap';
  pencatat?: string; // Nama guru pengamat
}

// ==========================================
// PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5)
// ==========================================

export const TEMA_P5_SD = [
  'Gaya Hidup Berkelanjutan',
  'Kearifan Lokal',
  'Bhinneka Tunggal Ika',
  'Bangunlah Jiwa dan Raganya',
  'Rekayasa dan Teknologi',
  'Kewirausahaan'
] as const;

export interface ProyekP5 {
  id: string; // id_proyek
  nama_proyek: string; // Contoh: "Gaya Hidup Berkelanjutan: Pengolahan Sampah Organik SDN 3"
  tema_proyek: string; // Dari TEMA_P5_SD
  tanggal_mulai: string; // Format YYYY-MM-DD
  tanggal_selesai: string; // Format YYYY-MM-DD
  keterangan: string;
  tahun_ajaran?: string;
  semester?: '1' | '2' | 'Ganjil' | 'Genap';
  sasaran_kelas?: string[]; // Array kelas yang mengikuti
}

export interface AnggotaProyek {
  id: string; // id_anggota
  id_proyek: string; // FK ke ProyekP5
  kunci_siswa: string; // NISN jika ada, kalau kosong gunakan NIK
  peran_dalam_kelompok: string; // Contoh: "Ketua Kelompok", "Sekretaris", "Koordinator Bahan", "Anggota Aktif"
  nilai_proses: SkalaPenilaian; // B / M / S / K
  nilai_hasil: SkalaPenilaian; // B / M / S / K
  catatan: string; // Catatan observasi guru pembimbing
}

// ==========================================
// LAPORAN RAPOR TERPADU (GABUNGAN DATA)
// ==========================================

export interface CustomRaporNarrative {
  id: string; // format: `narrative-${kunci_siswa}-${semester}`
  kunci_siswa: string;
  semester: '1' | '2' | 'Ganjil' | 'Genap';
  tahun_ajaran: string;
  narasiKesimpulan: string;
  saranOrangTua: string;
  tanggalCetak?: string;
}

// ==========================================
// ATURAN PENGHUBUNGAN KUNCI SISWA (NISN -> NIK -> NIS -> ID)
// ==========================================

/**
 * Mendapatkan KUNCI SISWA standar sesuai aturan sistem:
 * 1. Gunakan NISN jika ada dan tidak kosong
 * 2. Jika NISN kosong, gunakan NIK
 * 3. Jika NIK kosong, gunakan NIS
 * 4. Fallback ke ID
 */
export function getStudentKey(siswa: Partial<Siswa> | null | undefined): string {
  if (!siswa) return '';
  if (siswa.nisn && siswa.nisn.trim().length > 0) {
    return siswa.nisn.trim();
  }
  if (siswa.nik && siswa.nik.trim().length > 0) {
    return siswa.nik.trim();
  }
  if (siswa.nis && siswa.nis.trim().length > 0) {
    return siswa.nis.trim();
  }
  return siswa.id ? siswa.id.trim() : '';
}

/**
 * Mencari data siswa dari daftar siswa berdasarkan KUNCI SISWA
 * Mendukung pencarian berurutan: NISN -> NIK -> NIS -> ID
 */
export function findStudentByKey(siswaList: Siswa[], key: string): Siswa | undefined {
  if (!key) return undefined;
  const cleanKey = key.trim();
  if (!cleanKey) return undefined;

  // 1. Cek kecocokan NISN
  let found = siswaList.find((s) => s.nisn && s.nisn.trim() === cleanKey);
  if (found) return found;

  // 2. Cek kecocokan NIK
  found = siswaList.find((s) => s.nik && s.nik.trim() === cleanKey);
  if (found) return found;

  // 3. Cek kecocokan NIS
  found = siswaList.find((s) => s.nis && s.nis.trim() === cleanKey);
  if (found) return found;

  // 4. Cek kecocokan ID
  found = siswaList.find((s) => s.id && s.id.trim() === cleanKey);
  if (found) return found;

  return undefined;
}

/**
 * Memastikan apakah catatan terkait (Penilaian Akhlak, Anekdot, Anggota Proyek)
 * cocok dengan siswa tertentu berdasarkan aturan pencocokan kunci.
 */
export function isRecordMatchStudent(kunciRecord: string, siswa: Siswa): boolean {
  if (!kunciRecord || !siswa) return false;
  const cleanRecord = kunciRecord.trim();
  
  if (siswa.nisn && siswa.nisn.trim() === cleanRecord) return true;
  if (siswa.nik && siswa.nik.trim() === cleanRecord) return true;
  if (siswa.nis && siswa.nis.trim() === cleanRecord) return true;
  if (siswa.id && siswa.id.trim() === cleanRecord) return true;

  return false;
}



