import { Siswa, Presensi, StatusKehadiran, DAFTAR_KELAS, normalizeKelasCode } from '../types';
import { getWaliKelasByKelas } from './demoData';

/**
 * Mendapatkan string tanggal hari ini (YYYY-MM-DD) berdasarkan zona waktu WIB (Asia/Jakarta)
 * dan fallback ke waktu lokal peramban.
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  try {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/**
 * Format jam menit detik lokal (HH:mm:ss)
 */
export const getLocalTimeString = (d: Date = new Date()): string => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Normalisasi string tanggal ke format standar YYYY-MM-DD secara instan tanpa alokasi berat
 */
export const normalizeDateKey = (dateStr?: string): string => {
  if (!dateStr) return '';
  const s = dateStr.trim();
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') {
    return s.slice(0, 10);
  }
  if (s.includes('T')) {
    return s.split('T')[0];
  }
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return s.slice(0, 10);
};

/**
 * Normalisasi string nama untuk perbandingan fleksibel (hapus spasi berlebih, tanda baca, huruf kecil)
 */
export const normalizeStudentName = (name?: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Memeriksa apakah dua kode kelas sama (contoh: "Kelas 6-A" === "Kelas 6A" === "6A")
 */
export const isSameClass = (classA?: string, classB?: string): boolean => {
  if (!classA || !classB) return false;
  return normalizeKelasCode(classA) === normalizeKelasCode(classB);
};

/**
 * Memeriksa apakah suatu catatan presensi sesuai dengan siswa yang dicari
 */
export const isPresensiMatchSiswa = (p: Presensi, s: Siswa): boolean => {
  if (!p || !s) return false;

  // 1. Direct matching ID
  if (p.siswaId && s.id && p.siswaId === s.id) return true;
  if (p.id && s.id && (p.id === s.id || p.id.includes(s.id))) return true;

  // 2. Matching NIS (string & numeric)
  if (p.nis && s.nis) {
    const pNisClean = p.nis.trim();
    const sNisClean = s.nis.trim();
    if (pNisClean === sNisClean) return true;
    if (pNisClean.replace(/^0+/, '') === sNisClean.replace(/^0+/, '')) return true;
  }

  // 3. Matching NIK
  if (p.nik && s.nik && p.nik.trim() === s.nik.trim()) return true;

  // 4. Matching NISN
  if (s.nisn && p.nis && (p.nis.trim() === s.nisn.trim() || p.nis.trim().replace(/^0+/, '') === s.nisn.trim().replace(/^0+/, ''))) {
    return true;
  }

  // 5. Check if presensi ID contains student's NIS or ID
  if (p.id && s.nis && p.id.includes(s.nis.trim())) return true;

  // 6. Name + Class normalized matching
  if (p.nama && s.nama) {
    const pNorm = normalizeStudentName(p.nama);
    const sNorm = normalizeStudentName(s.nama);

    if (pNorm && sNorm) {
      const isClassCompatible = !p.kelas || !s.kelas || isSameClass(p.kelas, s.kelas);
      if (pNorm === sNorm && isClassCompatible) {
        return true;
      }
      if (pNorm.length > 5 && sNorm.length > 5 && isClassCompatible) {
        if (pNorm.includes(sNorm) || sNorm.includes(pNorm)) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Memeriksa apakah tanggal pada catatan presensi sesuai dengan tanggal target (Instan)
 */
export const isPresensiDateMatch = (pTanggal: string, targetDateStr: string): boolean => {
  if (!pTanggal || !targetDateStr) return false;
  return normalizeDateKey(pTanggal) === normalizeDateKey(targetDateStr);
};

export interface AttendanceIndex {
  bySiswaId: Map<string, Presensi>;
  byNis: Map<string, Presensi>;
  byNisClean: Map<string, Presensi>;
  byNik: Map<string, Presensi>;
  byNameAndClass: Map<string, Presensi>;
}

/**
 * Membangun index harian berkecepatan tinggi O(N) untuk pemrosesan presensi instan
 */
export const buildDailyAttendanceIndex = (
  presensiList: Presensi[],
  targetDateStr: string
): AttendanceIndex => {
  const targetKey = normalizeDateKey(targetDateStr);
  const bySiswaId = new Map<string, Presensi>();
  const byNis = new Map<string, Presensi>();
  const byNisClean = new Map<string, Presensi>();
  const byNik = new Map<string, Presensi>();
  const byNameAndClass = new Map<string, Presensi>();

  for (let i = 0; i < presensiList.length; i++) {
    const p = presensiList[i];
    if (!p.tanggal || normalizeDateKey(p.tanggal) !== targetKey) continue;

    const isNewer = (existing?: Presensi): boolean => {
      if (!existing) return true;
      const timeA = p.waktu || '00:00:00';
      const timeB = existing.waktu || '00:00:00';
      return timeA >= timeB;
    };

    if (p.siswaId && isNewer(bySiswaId.get(p.siswaId))) {
      bySiswaId.set(p.siswaId, p);
    }
    if (p.nis) {
      const nisClean = p.nis.trim();
      if (isNewer(byNis.get(nisClean))) {
        byNis.set(nisClean, p);
      }
      const noZero = nisClean.replace(/^0+/, '');
      if (isNewer(byNisClean.get(noZero))) {
        byNisClean.set(noZero, p);
      }
    }
    if (p.nik) {
      const nikClean = p.nik.trim();
      if (isNewer(byNik.get(nikClean))) {
        byNik.set(nikClean, p);
      }
    }
    if (p.nama) {
      const normName = normalizeStudentName(p.nama);
      const classKey = p.kelas ? normalizeKelasCode(p.kelas) : '';
      const comboKey = `${normName}__${classKey}`;
      if (isNewer(byNameAndClass.get(comboKey))) {
        byNameAndClass.set(comboKey, p);
      }
      if (isNewer(byNameAndClass.get(normName))) {
        byNameAndClass.set(normName, p);
      }
    }
  }

  return { bySiswaId, byNis, byNisClean, byNik, byNameAndClass };
};

/**
 * Mengambil catatan presensi dari Index O(1)
 */
export const getAttendanceFromIndex = (
  siswa: Siswa,
  index: AttendanceIndex
): Presensi | null => {
  if (siswa.id && index.bySiswaId.has(siswa.id)) {
    return index.bySiswaId.get(siswa.id)!;
  }
  if (siswa.nis) {
    const nisClean = siswa.nis.trim();
    if (index.byNis.has(nisClean)) return index.byNis.get(nisClean)!;
    const noZero = nisClean.replace(/^0+/, '');
    if (index.byNisClean.has(noZero)) return index.byNisClean.get(noZero)!;
  }
  if (siswa.nik && index.byNik.has(siswa.nik.trim())) {
    return index.byNik.get(siswa.nik.trim())!;
  }
  if (siswa.nama) {
    const normName = normalizeStudentName(siswa.nama);
    const classKey = siswa.kelas ? normalizeKelasCode(siswa.kelas) : '';
    const comboKey = `${normName}__${classKey}`;
    if (index.byNameAndClass.has(comboKey)) return index.byNameAndClass.get(comboKey)!;
    if (index.byNameAndClass.has(normName)) return index.byNameAndClass.get(normName)!;
  }
  return null;
};

/**
 * Mengambil catatan presensi TERAKHIR / TERBARU untuk seorang siswa pada tanggal tertentu.
 */
export const getLatestAttendanceForStudent = (
  siswa: Siswa,
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString()
): Presensi | null => {
  const targetKey = normalizeDateKey(targetDateStr);
  const matchingRecords: Presensi[] = [];

  for (let i = 0; i < presensiList.length; i++) {
    const p = presensiList[i];
    if (p.tanggal && normalizeDateKey(p.tanggal) === targetKey && isPresensiMatchSiswa(p, siswa)) {
      matchingRecords.push(p);
    }
  }

  if (matchingRecords.length === 0) return null;
  if (matchingRecords.length === 1) return matchingRecords[0];

  return matchingRecords.sort((a, b) => {
    const timeA = a.waktu || '00:00:00';
    const timeB = b.waktu || '00:00:00';
    return timeB.localeCompare(timeA);
  })[0];
};

export interface AttendanceStatsSummary {
  totalSiswa: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  sakitDanIzin: number;
  belumAbsen: number;
  totalHadirSemua: number; // hadir + terlambat
  persentaseKeaktifan: number;
}

/**
 * Menghitung statistik kehadiran per rombel dengan index instan
 */
export const calculateClassAttendanceStats = (
  classStudents: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString(),
  prebuiltIndex?: AttendanceIndex
): AttendanceStatsSummary => {
  const totalSiswa = classStudents.length;
  const index = prebuiltIndex || buildDailyAttendanceIndex(presensiList, targetDateStr);

  let hadir = 0;
  let terlambat = 0;
  let sakit = 0;
  let izin = 0;
  let alfa = 0;
  let belumAbsen = 0;

  for (let i = 0; i < classStudents.length; i++) {
    const siswa = classStudents[i];
    const latestRecord = getAttendanceFromIndex(siswa, index);
    if (!latestRecord) {
      belumAbsen++;
    } else {
      switch (latestRecord.status) {
        case 'Hadir':
          hadir++;
          break;
        case 'Terlambat':
          terlambat++;
          break;
        case 'Sakit':
          sakit++;
          break;
        case 'Izin':
          izin++;
          break;
        case 'Alfa':
          alfa++;
          break;
        default:
          hadir++;
          break;
      }
    }
  }

  const totalHadirSemua = hadir + terlambat;
  const sakitDanIzin = sakit + izin;
  const persentaseKeaktifan = totalSiswa > 0 
    ? Math.min(100, Math.round((totalHadirSemua / totalSiswa) * 100)) 
    : 0;

  return {
    totalSiswa,
    hadir,
    terlambat,
    sakit,
    izin,
    alfa,
    sakitDanIzin,
    belumAbsen,
    totalHadirSemua,
    persentaseKeaktifan
  };
};

/**
 * Menghitung ringkasan statistik untuk seluruh sekolah
 */
export const calculateSchoolAttendanceStats = (
  allStudents: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString(),
  selectedKelas: string = 'Semua Kelas'
): AttendanceStatsSummary => {
  const index = buildDailyAttendanceIndex(presensiList, targetDateStr);
  const studentsToEvaluate = selectedKelas === 'Semua Kelas'
    ? allStudents
    : allStudents.filter((s) => isSameClass(s.kelas, selectedKelas));

  return calculateClassAttendanceStats(studentsToEvaluate, presensiList, targetDateStr, index);
};

export interface ClassRombelSummary {
  kelas: string;
  waliKelas: string;
  totalSiswa: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  sakitDanIzin: number;
  belumAbsen: number;
  totalHadir: number;
  persentase: number;
}

/**
 * Menghitung ringkasan rekapitulasi untuk SEMUA rombel kelas 1-A sampai 6-B (O(N) super cepat)
 */
export const calculateAllRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString()
): ClassRombelSummary[] => {
  const index = buildDailyAttendanceIndex(presensiList, targetDateStr);

  return DAFTAR_KELAS.map((namaKelas) => {
    const classStudents = siswaList.filter((s) => isSameClass(s.kelas, namaKelas));
    const stats = calculateClassAttendanceStats(classStudents, presensiList, targetDateStr, index);

    return {
      kelas: namaKelas,
      waliKelas: getWaliKelasByKelas(namaKelas),
      totalSiswa: stats.totalSiswa,
      hadir: stats.hadir,
      terlambat: stats.terlambat,
      sakit: stats.sakit,
      izin: stats.izin,
      alfa: stats.alfa,
      sakitDanIzin: stats.sakitDanIzin,
      belumAbsen: stats.belumAbsen,
      totalHadir: stats.totalHadirSemua,
      persentase: stats.persentaseKeaktifan
    };
  });
};


