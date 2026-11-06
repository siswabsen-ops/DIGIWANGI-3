import { Siswa, Presensi, StatusKehadiran, DAFTAR_KELAS, normalizeKelasCode } from '../types';
import { getWaliKelasByKelas } from './waliKelasData';

/**
 * Mendapatkan string tanggal hari ini (YYYY-MM-DD) berdasarkan zona waktu resmi sekolah WIB (Asia/Jakarta)
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  } catch {
    try {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }
};

/**
 * Format jam menit detik resmi sekolah WIB (HH:mm:ss)
 */
export const getLocalTimeString = (d: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  } catch {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
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
 * (Bebas benturan substring ID seperti sis-1 vs sis-12 atau nama sama beda kelas)
 */
export const isPresensiMatchSiswa = (p: Presensi, s: Siswa): boolean => {
  if (!p || !s) return false;

  // 1. Direct matching siswaId
  if (p.siswaId && s.id && p.siswaId === s.id) return true;

  // 2. Exact structural record ID match (never use .includes() which collides sis-1 with sis-12!)
  if (p.id && s.id) {
    if (
      p.id === s.id ||
      p.id === `pr-${s.id}` ||
      p.id.startsWith(`pr-${s.id}-`) ||
      (p.tanggal && p.id === `pr-${normalizeDateKey(p.tanggal)}-${s.id}`)
    ) {
      return true;
    }
  }

  // If both record and student carry explicit distinct siswaId values, do not cross-match via weaker fields
  const hasDistinctSiswaIds = Boolean(p.siswaId && s.id && p.siswaId !== s.id);

  // 3. Matching NIS (string & numeric leading-zero normalized)
  if (!hasDistinctSiswaIds && p.nis && s.nis) {
    const pNisClean = p.nis.trim();
    const sNisClean = s.nis.trim();
    if (pNisClean.length >= 4 && sNisClean.length >= 4) {
      if (pNisClean === sNisClean) return true;
      const pNoZero = pNisClean.replace(/^0+/, '');
      const sNoZero = sNisClean.replace(/^0+/, '');
      if (pNoZero.length >= 4 && pNoZero === sNoZero) return true;
    }
  }

  // 4. Matching NIK
  if (!hasDistinctSiswaIds && p.nik && s.nik && p.nik.trim().length >= 8 && s.nik.trim().length >= 8) {
    if (p.nik.trim() === s.nik.trim()) return true;
  }

  // 5. Matching NISN
  if (!hasDistinctSiswaIds && s.nisn && p.nis && s.nisn.trim().length >= 8) {
    const pNisClean = p.nis.trim();
    const sNisnClean = s.nisn.trim();
    if (pNisClean === sNisnClean || pNisClean.replace(/^0+/, '') === sNisnClean.replace(/^0+/, '')) {
      return true;
    }
  }

  // 6. Name + Class exact normalized matching (strictly within the same class, never across different NIS/siswaId)
  const hasDistinctNis = Boolean(
    p.nis && s.nis && p.nis.trim().length >= 4 && s.nis.trim().length >= 4 && p.nis.trim() !== s.nis.trim()
  );
  if (!hasDistinctSiswaIds && !hasDistinctNis && p.nama && s.nama && isSameClass(p.kelas, s.kelas)) {
    const pNorm = normalizeStudentName(p.nama);
    const sNorm = normalizeStudentName(s.nama);

    if (pNorm && sNorm && pNorm === sNorm) {
      return true;
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
  byNameOnly: Map<string, Presensi>;
}

const isRecordNewer = (candidate: Presensi, existing?: Presensi): boolean => {
  if (!existing) return true;
  const isCandidateExplicit = Boolean(
    candidate.metode ||
    (candidate.pesanTerkirim && (candidate.pesanTerkirim.includes('via QR Code') || candidate.pesanTerkirim.includes('WA Gateway')))
  );
  const isExistingExplicit = Boolean(
    existing.metode ||
    (existing.pesanTerkirim && (existing.pesanTerkirim.includes('via QR Code') || existing.pesanTerkirim.includes('WA Gateway')))
  );
  if (isCandidateExplicit && !isExistingExplicit) return true;
  if (!isCandidateExplicit && isExistingExplicit) return false;
  const timeA = candidate.waktu || '00:00:00';
  const timeB = existing.waktu || '00:00:00';
  return timeA >= timeB;
};

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
  const byNameOnly = new Map<string, Presensi>();

  for (let i = 0; i < presensiList.length; i++) {
    const p = presensiList[i];
    if (!p.tanggal || normalizeDateKey(p.tanggal) !== targetKey) continue;

    if (p.siswaId && isRecordNewer(p, bySiswaId.get(p.siswaId))) {
      bySiswaId.set(p.siswaId, p);
    }
    if (p.nis && p.nis.trim().length >= 4) {
      const nisClean = p.nis.trim();
      if (isRecordNewer(p, byNis.get(nisClean))) {
        byNis.set(nisClean, p);
      }
      const noZero = nisClean.replace(/^0+/, '');
      if (noZero.length >= 4 && isRecordNewer(p, byNisClean.get(noZero))) {
        byNisClean.set(noZero, p);
      }
    }
    if (p.nik && p.nik.trim().length >= 8) {
      const nikClean = p.nik.trim();
      if (isRecordNewer(p, byNik.get(nikClean))) {
        byNik.set(nikClean, p);
      }
    }
    if (p.nama) {
      const normName = normalizeStudentName(p.nama);
      if (p.kelas) {
        const classKey = normalizeKelasCode(p.kelas);
        const comboKey = `${normName}__${classKey}`;
        if (isRecordNewer(p, byNameAndClass.get(comboKey))) {
          byNameAndClass.set(comboKey, p);
        }
      } else if (isRecordNewer(p, byNameOnly.get(normName))) {
        byNameOnly.set(normName, p);
      }
    }
  }

  return { bySiswaId, byNis, byNisClean, byNik, byNameAndClass, byNameOnly };
};

/**
 * Mengambil catatan presensi dari Index O(1) dengan validasi anti-benturan antar siswa
 */
export const getAttendanceFromIndex = (
  siswa: Siswa,
  index: AttendanceIndex
): Presensi | null => {
  if (siswa.id && index.bySiswaId.has(siswa.id)) {
    return index.bySiswaId.get(siswa.id)!;
  }
  const canUseFallback = (rec?: Presensi): rec is Presensi => {
    if (!rec) return false;
    if (rec.siswaId && siswa.id && rec.siswaId !== siswa.id) return false;
    return true;
  };
  if (siswa.nis && siswa.nis.trim().length >= 4) {
    const nisClean = siswa.nis.trim();
    const byExactNis = index.byNis.get(nisClean);
    if (canUseFallback(byExactNis)) return byExactNis;
    const noZero = nisClean.replace(/^0+/, '');
    if (noZero.length >= 4) {
      const byZeroNis = index.byNisClean.get(noZero);
      if (canUseFallback(byZeroNis)) return byZeroNis;
    }
  }
  if (siswa.nik && siswa.nik.trim().length >= 8) {
    const byNikRec = index.byNik.get(siswa.nik.trim());
    if (canUseFallback(byNikRec)) return byNikRec;
  }
  if (siswa.nama) {
    const normName = normalizeStudentName(siswa.nama);
    if (siswa.kelas) {
      const classKey = normalizeKelasCode(siswa.kelas);
      const comboKey = `${normName}__${classKey}`;
      const byNameCls = index.byNameAndClass.get(comboKey);
      if (canUseFallback(byNameCls)) return byNameCls;
    } else {
      const byNameRec = index.byNameOnly.get(normName);
      if (canUseFallback(byNameRec)) return byNameRec;
    }
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
  let bestRecord: Presensi | null = null;

  for (let i = 0; i < presensiList.length; i++) {
    const p = presensiList[i];
    if (p.tanggal && normalizeDateKey(p.tanggal) === targetKey && isPresensiMatchSiswa(p, siswa)) {
      if (!bestRecord || isRecordNewer(p, bestRecord)) {
        bestRecord = p;
      }
    }
  }

  return bestRecord;
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
  totalTidakHadir: number; // sakit + izin + alfa + belumAbsen
  totalHadirSemua: number; // hadir + terlambat (Total Masuk Fisik)
  persentaseKeaktifan: number;
}

/**
 * Menghitung statistik kehadiran per rombel dengan index instan
 * Menjamin:
 * 1. Jumlah per siswa dihitung tepat 1 kali (tidak pernah double count).
 * 2. totalSiswa = (hadir + terlambat) + (sakit + izin + alfa + belumAbsen).
 * 3. Siswa yang sakit/izin/alfa dikurangkan dari kehadiran (tidak masuk di 'hadir').
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
  const totalTidakHadir = sakit + izin + alfa + belumAbsen;
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
    totalTidakHadir,
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
  totalTidakHadir: number;
  totalHadir: number;
  persentase: number;
  statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai';
  statusKeterangan: string;
  totalScanQR: number;
  totalManualTap: number;
  shift?: 'Pagi' | 'Siang' | 'Campuran';
  shiftLabel?: string;
  totalPagi?: number;
  totalSiang?: number;
}

/**
 * Menentukan shift/sesi presensi (Pagi atau Siang)
 * Standard SDN 3 Karamatwangi:
 * - Pagi: Jam Masuk 07:00 WIB (Toleransi 07:15)
 * - Siang: Jam Masuk 12:30 WIB (Toleransi 12:45)
 */
export const getAttendanceShift = (
  record?: Presensi | null,
  kelasName?: string,
  targetTime?: string
): 'Pagi' | 'Siang' => {
  if (record?.shift) return record.shift;
  const timeStr = record?.waktu || targetTime;
  if (timeStr && timeStr !== '-') {
    const hour = parseInt(timeStr.slice(0, 2), 10);
    if (hour >= 11) return 'Siang';
    if (hour > 0) return 'Pagi';
  }
  return 'Pagi';
};

/**
 * Helper tanggal aman zona waktu: memecah string YYYY-MM-DD ke komponen numerik
 */
export const safeDateParts = (dateStr: string): { year: number; month: number; day: number } => {
  const norm = normalizeDateKey(dateStr) || getLocalDateString();
  const [y, m, d] = norm.split('-').map(Number);
  return {
    year: y || new Date().getFullYear(),
    month: m || (new Date().getMonth() + 1),
    day: d || new Date().getDate()
  };
};

/**
 * Format komponen numerik kembali ke YYYY-MM-DD
 */
export const safeFormatDate = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Tambah hari secara aman tanpa pergeseran zona waktu UTC
 */
export const safeAddDays = (dateStr: string, days: number): string => {
  const { year, month, day } = safeDateParts(dateStr);
  const d = new Date(year, month - 1, day + days);
  return safeFormatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/**
 * Menemukan tanggal hari Senin dari tanggal input
 */
export const getMondayOfWeek = (dateStr: string): string => {
  const { year, month, day } = safeDateParts(dateStr);
  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(year, month - 1, day + diff);
  return safeFormatDate(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
};

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

    let totalScanQR = 0;
    let totalManualTap = 0;
    let totalPagi = 0;
    let totalSiang = 0;

    classStudents.forEach((siswa) => {
      const rec = getAttendanceFromIndex(siswa, index);
      if (rec) {
        if (rec.metode === 'QR_SCAN' || (!rec.metode && (rec.status === 'Hadir' || rec.status === 'Terlambat'))) {
          totalScanQR++;
        } else {
          totalManualTap++;
        }
        const s = getAttendanceShift(rec, namaKelas);
        if (s === 'Siang') totalSiang++;
        else totalPagi++;
      }
    });

    const shift: 'Pagi' | 'Siang' | 'Campuran' = 
      totalSiang > 0 && totalPagi === 0 ? 'Siang' :
      totalPagi > 0 && totalSiang === 0 ? 'Pagi' :
      totalSiang > 0 && totalPagi > 0 ? 'Campuran' : 'Pagi';

    const shiftLabel = shift === 'Siang' ? 'Siang (12.30 WIB)' : (shift === 'Campuran' ? 'Pagi & Siang' : 'Pagi (07.00 WIB)');

    const totalTercatat = stats.totalSiswa - stats.belumAbsen;
    const isTuntas = stats.totalSiswa > 0 && stats.belumAbsen === 0;
    const isBerjalan = totalTercatat > 0 && stats.belumAbsen > 0;
    const statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai' = isTuntas 
      ? 'Tuntas' 
      : (isBerjalan ? 'Sedang Berjalan' : 'Belum Mulai');

    const statusKeterangan = isTuntas
      ? `${totalTercatat}/${stats.totalSiswa} Tuntas (${stats.totalHadirSemua} Masuk • ${totalScanQR} Scan, ${totalManualTap} Tap Guru)`
      : (isBerjalan 
          ? `${totalTercatat}/${stats.totalSiswa} Tercatat (${totalScanQR} Scan, ${totalManualTap} Tap Guru • ${stats.belumAbsen} Belum)`
          : `Belum Melakukan Absen (0/${stats.totalSiswa})`);

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
      totalTidakHadir: stats.totalTidakHadir,
      totalHadir: stats.totalHadirSemua,
      persentase: stats.persentaseKeaktifan,
      statusAbsen,
      statusKeterangan,
      totalScanQR,
      totalManualTap,
      shift,
      shiftLabel,
      totalPagi,
      totalSiang
    };
  });
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode MINGGUAN (Senin s/d Jumat)
 */
export const calculateWeeklyRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  mondayDateStr: string
): ClassRombelSummary[] => {
  const monday = getMondayOfWeek(mondayDateStr);
  const weekDays = [0, 1, 2, 3, 4].map(offset => safeAddDays(monday, offset));
  const weekIndexes = weekDays.map(dateStr => buildDailyAttendanceIndex(presensiList, dateStr));

  // Ambil hanya hari kerja sekolah yang sudah terisi rekaman presensi (hari aktif)
  const activeDayIndices = weekDays
    .map((dateStr, idx) => ({ dateStr, idx }))
    .filter(d => weekIndexes[d.idx].bySiswaId.size > 0);

  const evaluatedDayIndices = activeDayIndices.length > 0
    ? activeDayIndices.map(d => d.idx)
    : [0]; // fallback jika minggu belum mulai

  const effectiveDaysCount = evaluatedDayIndices.length;

  return DAFTAR_KELAS.map((namaKelas) => {
    const classStudents = siswaList.filter(s => isSameClass(s.kelas, namaKelas));
    const totalSiswa = classStudents.length;

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let belumAbsen = 0;

    classStudents.forEach(siswa => {
      evaluatedDayIndices.forEach(idx => {
        const rec = getAttendanceFromIndex(siswa, weekIndexes[idx]);
        if (!rec) {
          belumAbsen++;
        } else {
          switch (rec.status) {
            case 'Hadir': hadir++; break;
            case 'Terlambat': terlambat++; break;
            case 'Sakit': sakit++; break;
            case 'Izin': izin++; break;
            case 'Alfa': alfa++; break;
            default: hadir++; break;
          }
        }
      });
    });

    const totalHadir = hadir + terlambat;
    const sakitDanIzin = sakit + izin;
    const totalTidakHadir = sakit + izin + alfa + belumAbsen;

    // Evaluasi persentase kehadiran berdasarkan hari aktif/berjalan di minggu tersebut
    const evaluatedSlots = totalSiswa * effectiveDaysCount;
    const persentase = evaluatedSlots > 0 ? Math.min(100, Math.round((totalHadir / evaluatedSlots) * 100)) : 0;
    const totalTercatat = totalHadir + sakit + izin + alfa;
    const isTuntas = evaluatedSlots > 0 && belumAbsen === 0;
    const isBerjalan = totalTercatat > 0 && belumAbsen > 0;
    const statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai' = isTuntas 
      ? 'Tuntas' 
      : (isBerjalan ? 'Sedang Berjalan' : 'Belum Mulai');
    const statusKeterangan = `${persentase}% Rata-rata Kehadiran Mingguan (${totalHadir} Masuk)`;

    return {
      kelas: namaKelas,
      waliKelas: getWaliKelasByKelas(namaKelas),
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      sakitDanIzin,
      belumAbsen,
      totalTidakHadir,
      totalHadir,
      persentase,
      statusAbsen,
      statusKeterangan,
      totalScanQR: totalHadir,
      totalManualTap: sakit + izin + alfa
    };
  });
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode BULANAN (YYYY-MM)
 */
export const calculateMonthlyRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  yearMonthStr: string
): ClassRombelSummary[] => {
  const ym = yearMonthStr.slice(0, 7);
  const monthRecords = presensiList.filter(p => p.tanggal && normalizeDateKey(p.tanggal).startsWith(ym));
  const uniqueDays = Array.from(new Set(monthRecords.map(p => normalizeDateKey(p.tanggal)))).length;
  const schoolDays = Math.max(uniqueDays, 1);

  // Fast pre-indexing by student ID & NIS (O(M) single pass instead of O(N*M))
  const recordsByStudentKey = new Map<string, Presensi[]>();
  for (let i = 0; i < monthRecords.length; i++) {
    const r = monthRecords[i];
    if (r.siswaId) {
      const arr = recordsByStudentKey.get(r.siswaId);
      if (arr) arr.push(r);
      else recordsByStudentKey.set(r.siswaId, [r]);
    }
    if (r.nis) {
      const cleanNis = r.nis.trim();
      const arr = recordsByStudentKey.get(`nis:${cleanNis}`);
      if (arr) arr.push(r);
      else recordsByStudentKey.set(`nis:${cleanNis}`, [r]);
    }
  }

  return DAFTAR_KELAS.map((namaKelas) => {
    const classStudents = siswaList.filter(s => isSameClass(s.kelas, namaKelas));
    const totalSiswa = classStudents.length;

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;

    classStudents.forEach(siswa => {
      let studentRecs = recordsByStudentKey.get(siswa.id);
      if (!studentRecs && siswa.nis && siswa.nis.trim().length >= 4) {
        const byNisArr = recordsByStudentKey.get(`nis:${siswa.nis.trim()}`);
        if (byNisArr) {
          studentRecs = byNisArr.filter(r => !r.siswaId || r.siswaId === siswa.id || isSameClass(r.kelas, siswa.kelas));
        }
      }
      if (!studentRecs) studentRecs = [];

      const dateMap = new Map<string, Presensi>();
      for (let j = 0; j < studentRecs.length; j++) {
        const r = studentRecs[j];
        const dKey = normalizeDateKey(r.tanggal);
        const existing = dateMap.get(dKey);
        if (isRecordNewer(r, existing)) {
          dateMap.set(dKey, r);
        }
      }

      dateMap.forEach(rec => {
        switch (rec.status) {
          case 'Hadir': hadir++; break;
          case 'Terlambat': terlambat++; break;
          case 'Sakit': sakit++; break;
          case 'Izin': izin++; break;
          case 'Alfa': alfa++; break;
        }
      });
    });

    const totalHadir = hadir + terlambat;
    const sakitDanIzin = sakit + izin;
    const totalPossibleSlots = totalSiswa * schoolDays;
    const belumAbsen = Math.max(0, totalPossibleSlots - (totalHadir + sakit + izin + alfa));
    const totalTidakHadir = sakit + izin + alfa + belumAbsen;
    const persentase = totalPossibleSlots > 0 ? Math.min(100, Math.round((totalHadir / totalPossibleSlots) * 100)) : 0;
    const totalTercatat = totalHadir + sakit + izin + alfa;
    const isTuntas = totalPossibleSlots > 0 && belumAbsen === 0;
    const isBerjalan = totalTercatat > 0 && belumAbsen > 0;
    const statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai' = isTuntas 
      ? 'Tuntas' 
      : (isBerjalan ? 'Sedang Berjalan' : 'Belum Mulai');
    const statusKeterangan = `${persentase}% Rata-rata Bulanan (${totalHadir} Kehadiran)`;

    return {
      kelas: namaKelas,
      waliKelas: getWaliKelasByKelas(namaKelas),
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      sakitDanIzin,
      belumAbsen,
      totalTidakHadir,
      totalHadir,
      persentase,
      statusAbsen,
      statusKeterangan,
      totalScanQR: totalHadir,
      totalManualTap: sakit + izin + alfa
    };
  });
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode SEMESTER
 * Semester 1 (Ganjil): Juli - Desember
 * Semester 2 (Genap): Januari - Juni
 */
export const calculateSemesterRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterType: '1' | '2',
  tahunAjaran: string = '2026/2027'
): ClassRombelSummary[] => {
  const parts = tahunAjaran.split('/');
  const startYear = parseInt(parts[0]) || 2026;
  const endYear = parseInt(parts[1]) || (startYear + 1);

  // Prefix bulan target
  const targetYearMonths = semesterType === '1'
    ? ['07', '08', '09', '10', '11', '12'].map(m => `${startYear}-${m}`)
    : ['01', '02', '03', '04', '05', '06'].map(m => `${endYear}-${m}`);

  const semesterRecords = presensiList.filter(p => {
    if (!p.tanggal) return false;
    const dKey = normalizeDateKey(p.tanggal);
    return targetYearMonths.some(ym => dKey.startsWith(ym));
  });

  const uniqueDays = Array.from(new Set(semesterRecords.map(p => normalizeDateKey(p.tanggal)))).length;
  const schoolDays = Math.max(uniqueDays, 1);

  // Fast pre-indexing by student ID & NIS (O(M) single pass instead of O(N*M))
  const recordsByStudentKey = new Map<string, Presensi[]>();
  for (let i = 0; i < semesterRecords.length; i++) {
    const r = semesterRecords[i];
    if (r.siswaId) {
      const arr = recordsByStudentKey.get(r.siswaId);
      if (arr) arr.push(r);
      else recordsByStudentKey.set(r.siswaId, [r]);
    }
    if (r.nis) {
      const cleanNis = r.nis.trim();
      const arr = recordsByStudentKey.get(`nis:${cleanNis}`);
      if (arr) arr.push(r);
      else recordsByStudentKey.set(`nis:${cleanNis}`, [r]);
    }
  }

  return DAFTAR_KELAS.map((namaKelas) => {
    const classStudents = siswaList.filter(s => isSameClass(s.kelas, namaKelas));
    const totalSiswa = classStudents.length;

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;

    classStudents.forEach(siswa => {
      let studentRecs = recordsByStudentKey.get(siswa.id);
      if (!studentRecs && siswa.nis && siswa.nis.trim().length >= 4) {
        const byNisArr = recordsByStudentKey.get(`nis:${siswa.nis.trim()}`);
        if (byNisArr) {
          studentRecs = byNisArr.filter(r => !r.siswaId || r.siswaId === siswa.id || isSameClass(r.kelas, siswa.kelas));
        }
      }
      if (!studentRecs) studentRecs = [];

      const dateMap = new Map<string, Presensi>();
      for (let j = 0; j < studentRecs.length; j++) {
        const r = studentRecs[j];
        const dKey = normalizeDateKey(r.tanggal);
        const existing = dateMap.get(dKey);
        if (isRecordNewer(r, existing)) {
          dateMap.set(dKey, r);
        }
      }

      dateMap.forEach(rec => {
        switch (rec.status) {
          case 'Hadir': hadir++; break;
          case 'Terlambat': terlambat++; break;
          case 'Sakit': sakit++; break;
          case 'Izin': izin++; break;
          case 'Alfa': alfa++; break;
        }
      });
    });

    const totalHadir = hadir + terlambat;
    const sakitDanIzin = sakit + izin;
    const totalPossibleSlots = totalSiswa * schoolDays;
    const belumAbsen = Math.max(0, totalPossibleSlots - (totalHadir + sakit + izin + alfa));
    const totalTidakHadir = sakit + izin + alfa + belumAbsen;
    const persentase = totalPossibleSlots > 0 ? Math.min(100, Math.round((totalHadir / totalPossibleSlots) * 100)) : 0;
    const totalTercatat = totalHadir + sakit + izin + alfa;
    const isTuntas = totalPossibleSlots > 0 && belumAbsen === 0;
    const isBerjalan = totalTercatat > 0 && belumAbsen > 0;
    const statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai' = isTuntas 
      ? 'Tuntas' 
      : (isBerjalan ? 'Sedang Berjalan' : 'Belum Mulai');
    const statusKeterangan = `${persentase}% Rata-rata Semester (${totalHadir} Kehadiran)`;

    return {
      kelas: namaKelas,
      waliKelas: getWaliKelasByKelas(namaKelas),
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      sakitDanIzin,
      belumAbsen,
      totalTidakHadir,
      totalHadir,
      persentase,
      statusAbsen,
      statusKeterangan,
      totalScanQR: totalHadir,
      totalManualTap: sakit + izin + alfa
    };
  });
};


