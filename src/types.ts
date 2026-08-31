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


