import { Siswa, Presensi, StatusKehadiran, SystemSettings, DAFTAR_KELAS, normalizeKelasCode, getApplicableJadwal } from '../types';
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

const ARCHIVE_CUTOFF_DATE = '2026-10-30';

/**
 * Mengidentifikasi apakah sebuah catatan presensi berasal dari generator sintetis historis
 * (bukan hasil scan QR Code langsung atau tap manual guru/operator).
 */
export const isSyntheticDemoPresensi = (p?: Presensi | null): boolean => {
  if (!p || !p.id || !p.tanggal) return false;
  if (typeof p.updatedAt === 'number') return false;
  const dateKey = normalizeDateKey(p.tanggal);
  if (!p.id.startsWith(`pr-${dateKey}-`)) return false;

  const op = (p.operator || '').trim();
  const isGeneratorOperator =
    op === 'Panji Teguh Amarta S, S.Pd.I (Piket)' ||
    op === 'Cecep Maulana (Piket)' ||
    op === 'Usman Fauzan Alan, S.Pd.Gr.';
  if (!isGeneratorOperator) return false;

  const msg = p.pesanTerkirim || '';
  if (!msg) {
    return dateKey <= ARCHIVE_CUTOFF_DATE;
  }

  return (
    msg.includes('terkonfirmasi oleh Wali Murid') ||
    msg.includes('Tercatat pada Jurnal Kelas') ||
    msg.includes('Notifikasi live gateway otomatis terkirim ke No HP Orang Tua') ||
    msg.includes('via QR Code Scanner ➔ Terkirim otomatis via WA Gateway') ||
    msg.includes('via QR Code Scanner Gate Utama (WIB)') ||
    msg.includes('Tercatat Terlambat masuk sekolah pukul') ||
    msg.includes('Keterangan Sakit diterima dari Orang Tua via WA') ||
    msg.includes('Izin keperluan keluarga terkonfirmasi oleh Wali Kelas') ||
    msg === 'Tidak hadir tanpa keterangan (Alfa)'
  );
};

const normalizeTimeKey = (waktu?: string): string => {
  if (!waktu) return '00:00:00';
  const clean = waktu.trim();
  if (clean.length >= 8) return clean.slice(0, 8);
  if (clean.length === 5) return `${clean}:00`;
  return clean.padEnd(8, '0');
};

/**
 * Pembanding deterministik dan bebas urutan array (strict total order pada catatan berbeda)
 * untuk menentukan catatan presensi mana yang paling mutakhir & otoritatif.
 */
export const isRecordNewer = (candidate: Presensi, existing?: Presensi): boolean => {
  if (!existing) return true;
  if (candidate === existing) return false;

  // 1. Catatan riil pengguna selalu mengalahkan generator sintetis
  const candSynthetic = isSyntheticDemoPresensi(candidate);
  const existSynthetic = isSyntheticDemoPresensi(existing);
  if (!candSynthetic && existSynthetic) return true;
  if (candSynthetic && !existSynthetic) return false;

  // 2. Bandingkan epoch updatedAt jika tersedia
  const candTs = typeof candidate.updatedAt === 'number' && !isNaN(candidate.updatedAt) ? candidate.updatedAt : null;
  const existTs = typeof existing.updatedAt === 'number' && !isNaN(existing.updatedAt) ? existing.updatedAt : null;
  if (candTs !== null && existTs !== null && candTs !== existTs) {
    return candTs > existTs;
  }
  if (candTs !== null && existTs === null && normalizeDateKey(candidate.tanggal) > ARCHIVE_CUTOFF_DATE) {
    return true;
  }
  if (candTs === null && existTs !== null && normalizeDateKey(existing.tanggal) > ARCHIVE_CUTOFF_DATE) {
    return false;
  }

  // 3. Bandingkan waktu scan/tap HH:mm:ss
  const timeA = normalizeTimeKey(candidate.waktu);
  const timeB = normalizeTimeKey(existing.waktu);
  if (timeA !== timeB) {
    return timeA > timeB;
  }

  // 4. Prioritaskan catatan dengan metode eksplisit (QR_SCAN / MANUAL_TAP)
  const isCandidateExplicit = Boolean(
    candidate.metode ||
    candidate.metodeLabel ||
    (candidate.pesanTerkirim && (candidate.pesanTerkirim.includes('via QR Code') || candidate.pesanTerkirim.includes('WA Gateway')))
  );
  const isExistingExplicit = Boolean(
    existing.metode ||
    existing.metodeLabel ||
    (existing.pesanTerkirim && (existing.pesanTerkirim.includes('via QR Code') || existing.pesanTerkirim.includes('WA Gateway')))
  );
  if (isCandidateExplicit !== isExistingExplicit) {
    return isCandidateExplicit;
  }

  // 5. Tie-breaker deterministik berbasis ID (strict '>', bukan '>=', agar 100% simetris)
  const idA = candidate.id || '';
  const idB = existing.id || '';
  if (idA !== idB) return idA > idB;

  return (candidate.status || '') > (existing.status || '');
};

/**
 * Menggabungkan dua daftar presensi secara deterministik tanpa duplikasi atau pergeseran data.
 */
export const mergePresensiLists = (
  baseList: Presensi[],
  incomingList: Presensi[],
  siswaList?: Siswa[],
  deletedTombstones?: Map<string, number> | Record<string, number> | Set<string>
): Presensi[] => {
  const bySiswaId = new Map<string, Siswa>();
  const byNis = new Map<string, Siswa>();
  const dupNis = new Set<string>();
  const byNisNoZero = new Map<string, Siswa>();
  const byNik = new Map<string, Siswa>();
  const byNameClass = new Map<string, Siswa>();

  if (siswaList && siswaList.length > 0) {
    for (let i = 0; i < siswaList.length; i++) {
      const s = siswaList[i];
      if (s.id) bySiswaId.set(s.id, s);
      if (s.nis && s.nis.trim().length >= 4) {
        const clean = s.nis.trim();
        if (byNis.has(clean)) {
          dupNis.add(clean);
        } else {
          byNis.set(clean, s);
        }
        const nz = clean.replace(/^0+/, '');
        if (nz.length >= 4 && !byNisNoZero.has(nz)) byNisNoZero.set(nz, s);
      }
      if (s.nik && s.nik.trim().length >= 8) {
        byNik.set(s.nik.trim(), s);
      }
      if (s.nama && s.kelas) {
        byNameClass.set(`${normalizeStudentName(s.nama)}__${normalizeKelasCode(s.kelas)}`, s);
      }
    }
    for (const dNis of dupNis) {
      byNis.delete(dNis);
      byNisNoZero.delete(dNis.replace(/^0+/, ''));
    }
  }

  const getDeletedTimestamp = (key: string): number | null => {
    if (!deletedTombstones) return null;
    if (deletedTombstones instanceof Set) {
      return deletedTombstones.has(key) ? Infinity : null;
    }
    if (deletedTombstones instanceof Map) {
      const v = deletedTombstones.get(key);
      return typeof v === 'number' ? v : null;
    }
    const v = deletedTombstones[key];
    return typeof v === 'number' ? v : null;
  };

  const bestByKey = new Map<string, Presensi>();

  const processRecord = (raw?: Presensi) => {
    if (!raw || !raw.tanggal) return;
    const normDate = normalizeDateKey(raw.tanggal);
    if (!normDate) return;

    // Pastikan catatan sintetis tidak pernah mengisi hari berjalan (> 2026-10-30)
    if (normDate > ARCHIVE_CUTOFF_DATE && isSyntheticDemoPresensi(raw)) {
      return;
    }

    let matchedSiswa = raw.siswaId ? bySiswaId.get(raw.siswaId) : undefined;
    if (!matchedSiswa && raw.nama && raw.kelas) {
      matchedSiswa = byNameClass.get(`${normalizeStudentName(raw.nama)}__${normalizeKelasCode(raw.kelas)}`);
    }
    if (!matchedSiswa && raw.nis && raw.nis.trim().length >= 4) {
      const clean = raw.nis.trim();
      matchedSiswa = byNis.get(clean) || byNisNoZero.get(clean.replace(/^0+/, ''));
    }
    if (!matchedSiswa && raw.nik && raw.nik.trim().length >= 8) {
      matchedSiswa = byNik.get(raw.nik.trim());
    }

    const canonicalSid = matchedSiswa
      ? matchedSiswa.id
      : (raw.siswaId || raw.nis || `${normalizeStudentName(raw.nama)}_${normalizeKelasCode(raw.kelas)}`);
    if (!canonicalSid) return;

    const comboKey = `${canonicalSid}__${normDate}`;
    const rawSidKey = raw.siswaId && raw.siswaId !== canonicalSid ? `${raw.siswaId}__${normDate}` : '';
    const delTs = getDeletedTimestamp(comboKey) ?? (rawSidKey ? getDeletedTimestamp(rawSidKey) : null);
    if (delTs !== null) {
      const recTs = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
      if (recTs <= delTs) {
        return;
      }
    }

    const normalized: Presensi = {
      ...raw,
      siswaId: canonicalSid,
      nis: matchedSiswa?.nis || raw.nis || '',
      nik: matchedSiswa?.nik || raw.nik,
      nama: matchedSiswa?.nama || raw.nama,
      kelas: matchedSiswa?.kelas || raw.kelas,
      tanggal: normDate,
    };

    const existing = bestByKey.get(comboKey);
    if (!existing || isRecordNewer(normalized, existing)) {
      bestByKey.set(comboKey, normalized);
    }
  };

  for (let i = 0; i < baseList.length; i++) {
    processRecord(baseList[i]);
  }
  for (let i = 0; i < incomingList.length; i++) {
    processRecord(incomingList[i]);
  }

  const merged = Array.from(bestByKey.values());
  merged.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    const clsA = a.kelas || '';
    const clsB = b.kelas || '';
    if (clsA !== clsB) return clsA < clsB ? -1 : 1;
    const nameA = a.nama || '';
    const nameB = b.nama || '';
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    const idA = a.id || '';
    const idB = b.id || '';
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  return merged;
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
    if (rec.kelas && siswa.kelas && !isSameClass(rec.kelas, siswa.kelas)) return false;
    if (rec.nama && siswa.nama && normalizeStudentName(rec.nama) !== normalizeStudentName(siswa.nama)) return false;
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
  targetTime?: string,
  settings?: SystemSettings
): 'Pagi' | 'Siang' => {
  if (record?.shift) return record.shift;

  const evalTime = record?.waktu || targetTime;
  if (settings && kelasName) {
    const normKelas = normalizeKelasCode(kelasName);
    const activeForClass = (settings.jadwalList || []).filter((j) => {
      if (j.isAktif === false) return false;
      if (!j.kelas || j.kelas.length === 0) return true;
      return j.kelas.some((ck) => normalizeKelasCode(ck) === normKelas);
    });

    const hasExplicitPagi = activeForClass.some(
      (j) => j.tipe === 'Pagi' || (!j.tipe && parseInt((j.jamMasuk || '07:00').slice(0, 2), 10) < 11)
    );
    const hasExplicitSiang = activeForClass.some(
      (j) => j.tipe === 'Siang' || parseInt((j.jamMasuk || '07:00').slice(0, 2), 10) >= 11
    );

    const jadwal = getApplicableJadwal(kelasName, settings, evalTime);
    const jadwalIsSiang =
      jadwal.tipe === 'Siang' || parseInt((jadwal.jamMasuk || '07:00').slice(0, 2), 10) >= 11;

    // Jika kelas hanya aktif pada satu tipe shift (Pagi saja atau Siang saja), patuhi jadwal tersimpan
    if (hasExplicitSiang && !hasExplicitPagi) return 'Siang';
    if (hasExplicitPagi && !hasExplicitSiang) return 'Pagi';

    // Jika activeJadwalId menunjuk langsung ke jadwal yang dipilih user
    if (settings.activeJadwalId && jadwal.id === settings.activeJadwalId && jadwal.tipe !== 'Khusus' && jadwal.tipe !== 'Lainnya') {
      return jadwalIsSiang ? 'Siang' : 'Pagi';
    }

    if (evalTime && evalTime !== '-') {
      const hour = parseInt(evalTime.slice(0, 2), 10);
      if (!isNaN(hour)) {
        if (hour >= 11) return 'Siang';
        if (hour > 0) return 'Pagi';
      }
    }
    return jadwalIsSiang ? 'Siang' : 'Pagi';
  }

  if (evalTime && evalTime !== '-') {
    const hour = parseInt(evalTime.slice(0, 2), 10);
    if (!isNaN(hour)) {
      if (hour >= 11) return 'Siang';
      if (hour > 0) return 'Pagi';
    }
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
    year: y || 2026,
    month: m || 1,
    day: d || 1
  };
};

/**
 * Format komponen numerik kembali ke YYYY-MM-DD
 */
export const safeFormatDate = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS_LONG = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const INDO_MONTHS_SHORT = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

/**
 * Format tanggal panjang bahasa Indonesia (contoh: "Jumat, 6 November 2026") bebas pergeseran UTC
 */
export const formatDateIndoLong = (dateStr: string): string => {
  const norm = normalizeDateKey(dateStr);
  if (!norm) return dateStr;
  const { year, month, day } = safeDateParts(norm);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dayName = INDO_DAYS[utc.getUTCDay()] || '';
  const monthName = INDO_MONTHS_LONG[month] || '';
  return `${dayName}, ${day} ${monthName} ${year}`;
};

/**
 * Format tanggal pendek bahasa Indonesia (contoh: "6 Nov 2026") bebas pergeseran UTC
 */
export const formatDateIndoShort = (dateStr: string): string => {
  const norm = normalizeDateKey(dateStr);
  if (!norm) return dateStr;
  const { year, month, day } = safeDateParts(norm);
  const monthName = INDO_MONTHS_SHORT[month] || '';
  return `${day} ${monthName} ${year}`;
};

/**
 * Format bulan & tahun bahasa Indonesia (contoh: "November 2026") bebas pergeseran UTC
 */
export const formatMonthIndo = (yearMonthStr: string): string => {
  const ym = (yearMonthStr || '').trim().slice(0, 7);
  const [yStr, mStr] = ym.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (!year || !month || month < 1 || month > 12) return yearMonthStr;
  return `${INDO_MONTHS_LONG[month]} ${year}`;
};

/**
 * Tambah hari secara aman tanpa pergeseran zona waktu UTC maupun transisi DST
 */
export const safeAddDays = (dateStr: string, days: number): string => {
  const { year, month, day } = safeDateParts(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return safeFormatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/**
 * Menemukan tanggal hari Senin dari tanggal input secara aman tanpa pergeseran UTC/DST
 */
export const getMondayOfWeek = (dateStr: string): string => {
  const { year, month, day } = safeDateParts(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay(); // 0 = Minggu, 1 = Senin, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(Date.UTC(year, month - 1, day + diff));
  return safeFormatDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
};

/**
 * Menghitung ringkasan rekapitulasi untuk SEMUA rombel kelas 1-A sampai 6-B (O(N) super cepat)
 */
export const calculateAllRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString(),
  settings?: SystemSettings
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
        const s = getAttendanceShift(rec, namaKelas, rec.waktu, settings);
        if (s === 'Siang') totalSiang++;
        else totalPagi++;
      }
    });

    const defaultClassShift = getAttendanceShift(null, namaKelas, undefined, settings);
    const shift: 'Pagi' | 'Siang' | 'Campuran' = 
      totalSiang > 0 && totalPagi === 0 ? 'Siang' :
      totalPagi > 0 && totalSiang === 0 ? 'Pagi' :
      totalSiang > 0 && totalPagi > 0 ? 'Campuran' : defaultClassShift;

    const classJadwal = settings ? getApplicableJadwal(namaKelas, settings) : undefined;
    const jamDisplay = (classJadwal?.jamMasuk || (shift === 'Siang' ? '12:30' : '07:00')).replace(':', '.');
    const shiftLabel = shift === 'Siang'
      ? `Siang (${jamDisplay} WIB)`
      : (shift === 'Campuran' ? 'Pagi & Siang' : `Pagi (${jamDisplay} WIB)`);

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

export interface PeriodAttendanceLookup {
  activeDates: string[];
  effectiveDays: number;
  indexByDate: Map<string, AttendanceIndex>;
}

export interface StudentPeriodMetrics {
  siswa: Siswa;
  recordsByDate: Map<string, Presensi>;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  belumAbsen: number;
  totalMasuk: number;
  totalLog: number;
  totalScanQR: number;
  totalManualTap: number;
  effectiveDays: number;
  persen: number;
}

export interface PeriodSummaryResult {
  rombelList: ClassRombelSummary[];
  effectiveDays: number;
  activeDates: string[];
  totalSiswa: number;
  totalLog: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  belumAbsen: number;
  totalHadir: number;
  totalTidakHadir: number;
  persentase: number;
}

/**
 * Membangun lookup presensi terpadu berbasis AttendanceIndex per tanggal unik
 * Menjamin setiap siswa memiliki tepat 1 catatan otoritatif per tanggal (bebas duplikasi & mismatch ID/NIS/NIK/Nama).
 */
export const buildPeriodAttendanceLookup = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  datePredicate: (normDate: string) => boolean
): PeriodAttendanceLookup => {
  const recordsByDate = new Map<string, Presensi[]>();

  for (let i = 0; i < presensiList.length; i++) {
    const p = presensiList[i];
    if (!p || !p.tanggal) continue;
    const normDate = normalizeDateKey(p.tanggal);
    if (!normDate || !datePredicate(normDate)) continue;
    const arr = recordsByDate.get(normDate);
    if (arr) arr.push(p);
    else recordsByDate.set(normDate, [p]);
  }

  const candidateDates = Array.from(recordsByDate.keys()).sort();
  const indexByDate = new Map<string, AttendanceIndex>();
  const activeDates: string[] = [];

  for (let i = 0; i < candidateDates.length; i++) {
    const dKey = candidateDates[i];
    const dayIdx = buildDailyAttendanceIndex(recordsByDate.get(dKey) || [], dKey);
    // Tanggal dianggap aktif bila ada minimal 1 siswa terdaftar yang memiliki rekaman valid pada tanggal tsb
    let hasMatchedStudent = false;
    for (let sIdx = 0; sIdx < siswaList.length; sIdx++) {
      if (getAttendanceFromIndex(siswaList[sIdx], dayIdx)) {
        hasMatchedStudent = true;
        break;
      }
    }
    if (hasMatchedStudent) {
      indexByDate.set(dKey, dayIdx);
      activeDates.push(dKey);
    }
  }

  return {
    activeDates,
    effectiveDays: Math.max(1, activeDates.length),
    indexByDate
  };
};

/**
 * Menghitung metrik presensi akurat per siswa untuk daftar tanggal aktif tertentu
 */
export const calculateStudentsMetricsFromLookup = (
  students: Siswa[],
  lookup: PeriodAttendanceLookup
): StudentPeriodMetrics[] => {
  const { activeDates, effectiveDays, indexByDate } = lookup;

  return students.map((siswa) => {
    const recordsByDate = new Map<string, Presensi>();
    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let totalScanQR = 0;
    let totalManualTap = 0;

    for (let i = 0; i < activeDates.length; i++) {
      const dKey = activeDates[i];
      const idx = indexByDate.get(dKey);
      if (!idx) continue;
      const rec = getAttendanceFromIndex(siswa, idx);
      if (!rec) continue;

      recordsByDate.set(dKey, rec);
      switch (rec.status) {
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

      if (rec.metode === 'QR_SCAN' || (!rec.metode && (rec.status === 'Hadir' || rec.status === 'Terlambat'))) {
        totalScanQR++;
      } else {
        totalManualTap++;
      }
    }

    const totalMasuk = hadir + terlambat;
    const totalLog = hadir + terlambat + sakit + izin + alfa;
    const belumAbsen = Math.max(0, effectiveDays - totalLog);
    const persen = effectiveDays > 0 ? Math.min(100, Math.round((totalMasuk / effectiveDays) * 100)) : 0;

    return {
      siswa,
      recordsByDate,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      belumAbsen,
      totalMasuk,
      totalLog,
      totalScanQR,
      totalManualTap,
      effectiveDays,
      persen
    };
  });
};

/**
 * Mengambil seluruh rekaman otoritatif terdeduplikasi (1 siswa max 1 record per hari) dalam suatu periode.
 * Digunakan oleh Log Presensi Harian & Excel Export agar sinkron 100% dengan ringkasan per kelas.
 */
export const getPeriodAuthoritativeRecords = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  datePredicate: (normDate: string) => boolean,
  kelasFilter: string = 'Semua Kelas'
): { siswa: Siswa; record: Presensi }[] => {
  const isAll = !kelasFilter || kelasFilter === 'Semua Kelas' || kelasFilter === 'SEMUA KELAS';
  const targetStudents = isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelasFilter));
  const lookup = buildPeriodAttendanceLookup(targetStudents, presensiList, datePredicate);

  const items: { siswa: Siswa; record: Presensi }[] = [];
  for (let d = 0; d < lookup.activeDates.length; d++) {
    const dKey = lookup.activeDates[d];
    const idx = lookup.indexByDate.get(dKey);
    if (!idx) continue;
    for (let s = 0; s < targetStudents.length; s++) {
      const siswa = targetStudents[s];
      const rec = getAttendanceFromIndex(siswa, idx);
      if (rec) {
        items.push({
          siswa,
          record: {
            ...rec,
            siswaId: siswa.id,
            nis: siswa.nis || rec.nis || '',
            nik: siswa.nik || rec.nik,
            nama: siswa.nama,
            kelas: siswa.kelas,
            tanggal: dKey
          }
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.record.tanggal !== b.record.tanggal) return a.record.tanggal < b.record.tanggal ? -1 : 1;
    const tA = (a.record.waktu || '00:00:00').slice(0, 8);
    const tB = (b.record.waktu || '00:00:00').slice(0, 8);
    if (tA !== tB) return tA < tB ? -1 : 1;
    if (a.siswa.kelas !== b.siswa.kelas) return a.siswa.kelas.localeCompare(b.siswa.kelas);
    return a.siswa.nama.localeCompare(b.siswa.nama);
  });

  return items;
};

/**
 * Menghitung ringkasan lengkap per rombel (1-A s/d 6-B) + Total Sekolah untuk periode mana pun
 */
export const calculatePeriodRombelSummary = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  datePredicate: (normDate: string) => boolean,
  periodName: string,
  settings?: SystemSettings
): PeriodSummaryResult => {
  const lookup = buildPeriodAttendanceLookup(siswaList, presensiList, datePredicate);
  const { effectiveDays } = lookup;
  const studentMetrics = calculateStudentsMetricsFromLookup(siswaList, lookup);

  const metricsByClass = new Map<string, StudentPeriodMetrics[]>();
  DAFTAR_KELAS.forEach((k) => metricsByClass.set(normalizeKelasCode(k), []));
  studentMetrics.forEach((m) => {
    const code = normalizeKelasCode(m.siswa.kelas);
    const arr = metricsByClass.get(code);
    if (arr) arr.push(m);
  });

  let grandSiswa = 0;
  let grandLog = 0;
  let grandH = 0;
  let grandT = 0;
  let grandS = 0;
  let grandI = 0;
  let grandA = 0;
  let grandBelum = 0;
  let grandHadir = 0;

  const rombelList: ClassRombelSummary[] = DAFTAR_KELAS.map((namaKelas) => {
    const list = metricsByClass.get(normalizeKelasCode(namaKelas)) || [];
    const totalSiswa = list.length;

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let totalScanQR = 0;
    let totalManualTap = 0;

    list.forEach((m) => {
      hadir += m.hadir;
      terlambat += m.terlambat;
      sakit += m.sakit;
      izin += m.izin;
      alfa += m.alfa;
      totalScanQR += m.totalScanQR;
      totalManualTap += m.totalManualTap;
    });

    const totalHadir = hadir + terlambat;
    const totalLog = totalHadir + sakit + izin + alfa;
    const sakitDanIzin = sakit + izin;
    const totalPossibleSlots = totalSiswa * effectiveDays;
    const belumAbsen = Math.max(0, totalPossibleSlots - totalLog);
    const totalTidakHadir = sakit + izin + alfa + belumAbsen;
    const persentase = totalPossibleSlots > 0 ? Math.min(100, Math.round((totalHadir / totalPossibleSlots) * 100)) : 0;

    const isTuntas = totalPossibleSlots > 0 && belumAbsen === 0;
    const isBerjalan = totalLog > 0 && belumAbsen > 0;
    const statusAbsen: 'Tuntas' | 'Sedang Berjalan' | 'Belum Mulai' = isTuntas
      ? 'Tuntas'
      : isBerjalan
      ? 'Sedang Berjalan'
      : 'Belum Mulai';

    const shiftVal = getAttendanceShift(null, namaKelas, undefined, settings);
    const classJadwal = settings ? getApplicableJadwal(namaKelas, settings) : undefined;
    const jamDisplay = (classJadwal?.jamMasuk || (shiftVal === 'Siang' ? '12:30' : '07:00')).replace(':', '.');
    const shiftLabel = shiftVal === 'Siang' ? `Siang (${jamDisplay} WIB)` : `Pagi (${jamDisplay} WIB)`;

    grandSiswa += totalSiswa;
    grandLog += totalLog;
    grandH += hadir;
    grandT += terlambat;
    grandS += sakit;
    grandI += izin;
    grandA += alfa;
    grandBelum += belumAbsen;
    grandHadir += totalHadir;

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
      statusKeterangan: `${persentase}% Rata-rata ${periodName} (${totalHadir} Kehadiran)`,
      totalScanQR,
      totalManualTap,
      shift: shiftVal,
      shiftLabel
    };
  });

  const grandSlots = grandSiswa * effectiveDays;
  const grandPct = grandSlots > 0 ? Math.min(100, Math.round((grandHadir / grandSlots) * 100)) : 0;

  return {
    rombelList,
    effectiveDays,
    activeDates: lookup.activeDates,
    totalSiswa: grandSiswa,
    totalLog: grandLog,
    hadir: grandH,
    terlambat: grandT,
    sakit: grandS,
    izin: grandI,
    alfa: grandA,
    belumAbsen: grandBelum,
    totalHadir: grandHadir,
    totalTidakHadir: grandS + grandI + grandA + grandBelum,
    persentase: grandPct
  };
};

/**
 * Helper rentang bulan untuk Semester 1 (Jul-Des) atau Semester 2 (Jan-Jun)
 */
export const getSemesterYearMonths = (
  semesterType: '1' | '2',
  tahunAjaran: string = '2026/2027'
): string[] => {
  const parts = tahunAjaran.replace('–', '/').replace('-', '/').split('/');
  const startYear = parseInt(parts[0], 10) || 2026;
  const endYear = parseInt(parts[1], 10) || startYear + 1;

  return semesterType === '1'
    ? ['07', '08', '09', '10', '11', '12'].map((m) => `${startYear}-${m}`)
    : ['01', '02', '03', '04', '05', '06'].map((m) => `${endYear}-${m}`);
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode MINGGUAN (Senin s/d Jumat)
 */
export const calculateWeeklyRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  mondayDateStr: string,
  settings?: SystemSettings
): ClassRombelSummary[] => {
  const monday = getMondayOfWeek(mondayDateStr);
  const weekSet = new Set([0, 1, 2, 3, 4].map((offset) => safeAddDays(monday, offset)));
  return calculatePeriodRombelSummary(
    siswaList,
    presensiList,
    (d) => weekSet.has(d),
    'Mingguan',
    settings
  ).rombelList;
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode BULANAN (YYYY-MM)
 */
export const calculateMonthlyRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  yearMonthStr: string,
  settings?: SystemSettings
): ClassRombelSummary[] => {
  const ym = (yearMonthStr || '').slice(0, 7);
  return calculatePeriodRombelSummary(
    siswaList,
    presensiList,
    (d) => d.startsWith(ym),
    'Bulanan',
    settings
  ).rombelList;
};

/**
 * Menghitung rekapitulasi kehadiran per rombel untuk periode SEMESTER
 */
export const calculateSemesterRombelSummaryList = (
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterType: '1' | '2',
  tahunAjaran: string = '2026/2027',
  settings?: SystemSettings
): ClassRombelSummary[] => {
  const targetYearMonths = getSemesterYearMonths(semesterType, tahunAjaran);
  return calculatePeriodRombelSummary(
    siswaList,
    presensiList,
    (d) => targetYearMonths.some((ym) => d.startsWith(ym)),
    'Semester',
    settings
  ).rombelList;
};



