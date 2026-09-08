import JSZip from 'jszip';
import { Siswa, Presensi, DAFTAR_KELAS } from '../types';
import {
  getLocalDateString,
  isSameClass,
  calculateClassAttendanceStats,
  buildDailyAttendanceIndex,
  getAttendanceFromIndex,
  calculateAllRombelSummaryList,
  normalizeDateKey
} from './attendanceUtils';
import { getWaliKelasByKelas } from './demoData';
import { triggerFileDownload } from './qrCodeExport';

export interface ClassReportOption {
  kelas: string;
  waliKelas: string;
  totalSiswa: number;
}

/**
 * Format helper for CSV Cell escaping
 */
function escapeCsvCell(val: any): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * 1. GENERATE HARIAN CSV
 */
export function generateDailyReportCSV(
  kelas: string,
  dateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = isAll
    ? [...siswaList]
    : siswaList.filter(s => isSameClass(s.kelas, kelas));

  // Sort by class then by name
  filteredStudents.sort((a, b) => {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });

  const dailyIndex = buildDailyAttendanceIndex(presensiList, dateStr);

  const headers = [
    'No',
    'NIS',
    'NISN / NIK',
    'Nama Lengkap Siswa',
    'Jenis Kelamin',
    'Kelas',
    'Tanggal Presensi',
    'Waktu Masuk',
    'Status Kehadiran',
    'Status WA Notifikasi',
    'Petugas / Operator Input'
  ];

  const rows = filteredStudents.map((siswa, idx) => {
    const record = getAttendanceFromIndex(siswa, dailyIndex);
    const status = record ? record.status : 'Belum Absen';
    const waktu = record ? record.waktu : '-';
    const waStatus = record ? (record.waStatus || 'Terkirim') : '-';
    const operator = record ? record.operator : '-';

    return [
      idx + 1,
      `'${siswa.nis || ''}`,
      `'${siswa.nik || ''}`,
      siswa.nama,
      siswa.jenisKelamin || 'L/P',
      siswa.kelas,
      dateStr,
      waktu,
      status,
      waStatus,
      operator
    ];
  });

  const headerLines = [
    `REKAPITULASI PRESENSI HARIAN SISWA - SDN 3 KARAMATWANGI`,
    `Kelas: ${kelas} | Tanggal: ${dateStr} | Total Siswa: ${filteredStudents.length}`,
    ''
  ];

  const csvContent = "\uFEFF" + 
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');

  return csvContent;
}

/**
 * 2. GENERATE HARIAN SUMMARY ALL ROMBEL CSV
 */
export function generateDailyRombelSummaryCSV(
  dateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const allRombel = calculateAllRombelSummaryList(siswaList, presensiList, dateStr);
  
  let totalSiswa = 0;
  let hadir = 0;
  let terlambat = 0;
  let sakit = 0;
  let izin = 0;
  let alfa = 0;
  let belumAbsen = 0;
  let totalHadir = 0;
  let totalTidakHadir = 0;

  allRombel.forEach(r => {
    totalSiswa += r.totalSiswa;
    hadir += r.hadir;
    terlambat += r.terlambat;
    sakit += r.sakit;
    izin += r.izin;
    alfa += r.alfa;
    belumAbsen += r.belumAbsen;
    totalHadir += r.totalHadir;
    totalTidakHadir += r.totalTidakHadir;
  });

  const grandPersen = totalSiswa > 0 ? Math.min(100, Math.round((totalHadir / totalSiswa) * 100)) : 0;

  const headers = [
    'No',
    'Rombel Kelas',
    'Wali Kelas',
    'Jumlah Siswa',
    'Hadir Tepat',
    'Terlambat',
    'Sakit',
    'Izin',
    'Alfa',
    'Belum Absen',
    'Total Masuk (H+T)',
    'Pengurang (S+I+A+B)',
    'Persentase Keaktifan (%)'
  ];

  const rows = allRombel.map((r, idx) => [
    idx + 1,
    r.kelas,
    r.waliKelas,
    r.totalSiswa,
    r.hadir,
    r.terlambat,
    r.sakit,
    r.izin,
    r.alfa,
    r.belumAbsen,
    r.totalHadir,
    r.totalTidakHadir,
    `${r.persentase}%`
  ]);

  rows.push([
    '',
    'TOTAL KESELURUHAN SEKOLAH',
    '-',
    totalSiswa,
    hadir,
    terlambat,
    sakit,
    izin,
    alfa,
    belumAbsen,
    totalHadir,
    totalTidakHadir,
    `${grandPersen}%`
  ]);

  const headerLines = [
    `REKAPITULASI PRESENSI SELURUH ROMBEL KELAS (1-A s/d 6-B) - SDN 3 KARAMATWANGI`,
    `Tanggal: ${dateStr} | Total Seluruh Siswa: ${totalSiswa} Siswa | Keaktifan Sekolah: ${grandPersen}%`,
    ''
  ];

  const csvContent = "\uFEFF" + 
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');

  return csvContent;
}

/**
 * 3. GENERATE MINGGUAN CSV (Senin - Jumat)
 */
export function generateWeeklyReportCSV(
  kelas: string,
  mondayDateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = isAll
    ? [...siswaList]
    : siswaList.filter(s => isSameClass(s.kelas, kelas));

  filteredStudents.sort((a, b) => {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });

  // Calculate 5 days dates
  const baseDate = new Date(mondayDateStr);
  const indonesianDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const weekDates: { dateStr: string; label: string }[] = [];

  for (let i = 0; i < 5; i++) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + i);
    const tzOffset = nextDate.getTimezoneOffset() * 60000;
    const dateStr = (new Date(nextDate.getTime() - tzOffset)).toISOString().slice(0, 10);
    const dayNum = nextDate.getDate();
    const monthShort = nextDate.toLocaleDateString('id-ID', { month: 'short' });
    weekDates.push({
      dateStr,
      label: `${indonesianDays[i]} (${dayNum} ${monthShort})`
    });
  }

  // Pre-build indexes for the 5 days
  const dailyIndexes = weekDates.map(w => buildDailyAttendanceIndex(presensiList, w.dateStr));

  const headers = [
    'No',
    'NIS',
    'Nama Lengkap Siswa',
    'Kelas',
    ...weekDates.map(w => w.label),
    'Total Hadir',
    'Total Terlambat',
    'Total Sakit',
    'Total Izin',
    'Total Alfa',
    'Total Belum Absen',
    'Keaktifan (%)'
  ];

  const rows = filteredStudents.map((siswa, idx) => {
    let hadirCount = 0;
    let telatCount = 0;
    let sakitCount = 0;
    let izinCount = 0;
    let alfaCount = 0;
    let belumCount = 0;

    const dayStatusArray = weekDates.map((w, dayIdx) => {
      const record = getAttendanceFromIndex(siswa, dailyIndexes[dayIdx]);
      if (!record) {
        belumCount++;
        return 'Belum Absen';
      }
      if (record.status === 'Hadir') hadirCount++;
      else if (record.status === 'Terlambat') telatCount++;
      else if (record.status === 'Sakit') sakitCount++;
      else if (record.status === 'Izin') izinCount++;
      else if (record.status === 'Alfa') alfaCount++;
      return record.status;
    });

    const totalMasuk = hadirCount + telatCount;
    const persen = Math.round((totalMasuk / 5) * 100);

    return [
      idx + 1,
      `'${siswa.nis || ''}`,
      siswa.nama,
      siswa.kelas,
      ...dayStatusArray,
      hadirCount,
      telatCount,
      sakitCount,
      izinCount,
      alfaCount,
      belumCount,
      `${persen}%`
    ];
  });

  const headerLines = [
    `JURNAL REKAPITULASI PRESENSI MINGGUAN SISWA - SDN 3 KARAMATWANGI`,
    `Kelas: ${kelas} | Periode: ${weekDates[0].dateStr} s/d ${weekDates[4].dateStr} | Total Siswa: ${filteredStudents.length}`,
    ''
  ];

  const csvContent = "\uFEFF" + 
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');

  return csvContent;
}

/**
 * 4. GENERATE BULANAN CSV
 */
export function generateMonthlyReportCSV(
  kelas: string,
  monthStr: string, // YYYY-MM
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = isAll
    ? [...siswaList]
    : siswaList.filter(s => isSameClass(s.kelas, kelas));

  filteredStudents.sort((a, b) => {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });

  // Calculate distinct recorded school dates in that month
  const targetPrefix = monthStr;
  const rawDatesInMonth = new Set<string>();

  presensiList.forEach(p => {
    const norm = normalizeDateKey(p.tanggal);
    if (norm.startsWith(targetPrefix)) {
      rawDatesInMonth.add(norm);
    }
  });

  const effectiveDays = Math.max(1, rawDatesInMonth.size || 20);

  const headers = [
    'No',
    'NIS',
    'Nama Lengkap Siswa',
    'Kelas',
    'Hari Efektif Sekolah',
    'Hadir Tepat',
    'Terlambat',
    'Sakit',
    'Izin',
    'Alfa',
    'Total Masuk',
    'Persentase Kehadiran (%)',
    'Predikat Kualifikasi'
  ];

  const rows = filteredStudents.map((siswa, idx) => {
    // Collect all records for this student in this month
    const studentRecords = presensiList.filter(p => {
      const matchSiswa = (p.siswaId && p.siswaId === siswa.id) ||
                         (p.nis && siswa.nis && p.nis.trim() === siswa.nis.trim()) ||
                         (p.nama && p.nama.trim().toLowerCase() === siswa.nama.trim().toLowerCase() && isSameClass(p.kelas, siswa.kelas));
      if (!matchSiswa) return false;
      const norm = normalizeDateKey(p.tanggal);
      return norm.startsWith(targetPrefix);
    });

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;

    // Deduplicate by date
    const dateMap = new Map<string, string>();
    studentRecords.forEach(r => {
      const d = normalizeDateKey(r.tanggal);
      if (!dateMap.has(d)) {
        dateMap.set(d, r.status);
      }
    });

    dateMap.forEach(status => {
      if (status === 'Hadir') hadir++;
      else if (status === 'Terlambat') terlambat++;
      else if (status === 'Sakit') sakit++;
      else if (status === 'Izin') izin++;
      else if (status === 'Alfa') alfa++;
    });

    const totalMasuk = hadir + terlambat;
    const persen = Math.min(100, Math.round((totalMasuk / effectiveDays) * 100));

    let predikat = 'Rendah (Butuh Perhatian)';
    if (persen >= 90) predikat = 'Sangat Baik / Rajin';
    else if (persen >= 80) predikat = 'Baik';
    else if (persen >= 60) predikat = 'Cukup';

    return [
      idx + 1,
      `'${siswa.nis || ''}`,
      siswa.nama,
      siswa.kelas,
      effectiveDays,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      totalMasuk,
      `${persen}%`,
      predikat
    ];
  });

  const monthObj = new Date(`${monthStr}-02`);
  const monthName = monthObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const headerLines = [
    `BUKU REKAPITULASI PRESENSI BULANAN SISWA - SDN 3 KARAMATWANGI`,
    `Kelas: ${kelas} | Periode: Bulan ${monthName} (${monthStr}) | Total Siswa: ${filteredStudents.length}`,
    ''
  ];

  const csvContent = "\uFEFF" + 
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');

  return csvContent;
}

/**
 * Generate CSV for Semester Report per Class or All Classes
 */
export function generateSemesterReportCSV(
  kelas: string,
  semesterType: '1' | '2',
  tahunAjaran: string,
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const filteredStudents = isAll
    ? [...siswaList].sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama))
    : siswaList.filter(s => isSameClass(s.kelas, kelas)).sort((a, b) => a.nama.localeCompare(b.nama));

  const parts = tahunAjaran.split('/');
  const startYear = parseInt(parts[0]) || 2026;
  const endYear = parseInt(parts[1]) || (startYear + 1);

  const targetYearMonths = semesterType === '1'
    ? ['07', '08', '09', '10', '11', '12'].map(m => `${startYear}-${m}`)
    : ['01', '02', '03', '04', '05', '06'].map(m => `${endYear}-${m}`);

  const rawDatesInSemester = new Set<string>();
  presensiList.forEach(p => {
    if (!p.tanggal) return;
    const norm = normalizeDateKey(p.tanggal);
    if (targetYearMonths.some(ym => norm.startsWith(ym))) {
      rawDatesInSemester.add(norm);
    }
  });

  const effectiveDays = Math.max(1, rawDatesInSemester.size || 100);

  const headers = [
    'No',
    'NIS',
    'Nama Lengkap Siswa',
    'Kelas',
    'Hari Efektif Semester',
    'Hadir Tepat (H)',
    'Terlambat (T)',
    'Sakit (S)',
    'Izin (I)',
    'Alfa (A)',
    'Total Masuk',
    'Persentase Kehadiran (%)',
    'Predikat Raport'
  ];

  const rows = filteredStudents.map((siswa, idx) => {
    const studentRecords = presensiList.filter(p => {
      const matchSiswa = (p.siswaId && p.siswaId === siswa.id) ||
                         (p.nis && siswa.nis && p.nis.trim() === siswa.nis.trim()) ||
                         (p.nama && p.nama.trim().toLowerCase() === siswa.nama.trim().toLowerCase() && isSameClass(p.kelas, siswa.kelas));
      if (!matchSiswa) return false;
      const norm = normalizeDateKey(p.tanggal);
      return targetYearMonths.some(ym => norm.startsWith(ym));
    });

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;

    const dateMap = new Map<string, string>();
    studentRecords.forEach(r => {
      const d = normalizeDateKey(r.tanggal);
      if (!dateMap.has(d)) {
        dateMap.set(d, r.status);
      }
    });

    dateMap.forEach(status => {
      if (status === 'Hadir') hadir++;
      else if (status === 'Terlambat') terlambat++;
      else if (status === 'Sakit') sakit++;
      else if (status === 'Izin') izin++;
      else if (status === 'Alfa') alfa++;
    });

    const totalMasuk = hadir + terlambat;
    const persen = Math.min(100, Math.round((totalMasuk / effectiveDays) * 100));

    let predikat = 'Perlu Bimbingan';
    if (persen >= 90) predikat = 'Sangat Baik (A)';
    else if (persen >= 80) predikat = 'Baik (B)';
    else if (persen >= 60) predikat = 'Cukup (C)';

    return [
      idx + 1,
      `'${siswa.nis || ''}`,
      siswa.nama,
      siswa.kelas,
      effectiveDays,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      totalMasuk,
      `${persen}%`,
      predikat
    ];
  });

  const semLabel = semesterType === '1' ? 'Semester 1 (Ganjil - Juli s/d Desember)' : 'Semester 2 (Genap - Januari s/d Juni)';

  const headerLines = [
    `BUKU REKAPITULASI PRESENSI SEMESTER SISWA - SDN 3 KARAMATWANGI`,
    `Kelas: ${kelas} | Tahun Ajaran: ${tahunAjaran} | ${semLabel} | Total Siswa: ${filteredStudents.length}`,
    ''
  ];

  const csvContent = "\uFEFF" + 
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');

  return csvContent;
}

/**
 * Generate Master School Rombel Summary CSV for Semester
 */
export function generateSemesterRombelSummaryCSV(
  semesterType: '1' | '2',
  tahunAjaran: string,
  siswaList: Siswa[],
  presensiList: Presensi[]
): string {
  const headers = [
    'No',
    'Rombel Kelas',
    'Wali Kelas',
    'Jumlah Siswa',
    'Total Hadir',
    'Terlambat',
    'Sakit',
    'Izin',
    'Alfa',
    'Total Kehadiran Fisik',
    'Rata-rata Persentase Kehadiran (%)',
    'Predikat Kinerja Rombel'
  ];

  const parts = tahunAjaran.split('/');
  const startYear = parseInt(parts[0]) || 2026;
  const endYear = parseInt(parts[1]) || (startYear + 1);

  const targetYearMonths = semesterType === '1'
    ? ['07', '08', '09', '10', '11', '12'].map(m => `${startYear}-${m}`)
    : ['01', '02', '03', '04', '05', '06'].map(m => `${endYear}-${m}`);

  const rawDatesInSemester = new Set<string>();
  presensiList.forEach(p => {
    if (!p.tanggal) return;
    const norm = normalizeDateKey(p.tanggal);
    if (targetYearMonths.some(ym => norm.startsWith(ym))) {
      rawDatesInSemester.add(norm);
    }
  });

  const effectiveDays = Math.max(1, rawDatesInSemester.size || 100);

  const rows = DAFTAR_KELAS.map((namaKelas, idx) => {
    const classStudents = siswaList.filter(s => isSameClass(s.kelas, namaKelas));
    const totalSiswa = classStudents.length;

    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;

    classStudents.forEach(siswa => {
      const studentRecords = presensiList.filter(p => {
        const matchSiswa = (p.siswaId && p.siswaId === siswa.id) ||
                           (p.nis && siswa.nis && p.nis.trim() === siswa.nis.trim()) ||
                           (p.nama && p.nama.trim().toLowerCase() === siswa.nama.trim().toLowerCase() && isSameClass(p.kelas, siswa.kelas));
        if (!matchSiswa) return false;
        const norm = normalizeDateKey(p.tanggal);
        return targetYearMonths.some(ym => norm.startsWith(ym));
      });

      const dateMap = new Map<string, string>();
      studentRecords.forEach(r => {
        const d = normalizeDateKey(r.tanggal);
        if (!dateMap.has(d)) {
          dateMap.set(d, r.status);
        }
      });

      dateMap.forEach(status => {
        if (status === 'Hadir') hadir++;
        else if (status === 'Terlambat') terlambat++;
        else if (status === 'Sakit') sakit++;
        else if (status === 'Izin') izin++;
        else if (status === 'Alfa') alfa++;
      });
    });

    const totalMasuk = hadir + terlambat;
    const totalPossible = totalSiswa * effectiveDays;
    const persen = totalPossible > 0 ? Math.min(100, Math.round((totalMasuk / totalPossible) * 100)) : 0;

    let predikat = 'Perlu Pendampingan';
    if (persen >= 90) predikat = 'Sangat Tinggi (A)';
    else if (persen >= 80) predikat = 'Tinggi (B)';
    else if (persen >= 60) predikat = 'Cukup (C)';

    return [
      idx + 1,
      namaKelas,
      getWaliKelasByKelas(namaKelas),
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      totalMasuk,
      `${persen}%`,
      predikat
    ];
  });

  const semLabel = semesterType === '1' ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)';

  const headerLines = [
    `REKAPITULASI PRESENSI SELURUH ROMBEL KELAS PER SEMESTER`,
    `SDN 3 KARAMATWANGI - KEC. CISURUPAN KAB. GARUT`,
    `Tahun Ajaran: ${tahunAjaran} | ${semLabel} | Hari Efektif: ${effectiveDays} Hari`,
    ''
  ];

  return "\uFEFF" +
    headerLines.map(line => escapeCsvCell(line)).join('\n') +
    headers.map(escapeCsvCell).join(',') + '\n' +
    rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');
}

/**
 * Trigger download of Single Class CSV
 */
export function downloadSingleClassReport(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  kelas: string,
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string }
) {
  let content = '';
  let filename = '';
  const cleanKelas = kelas.replace(/[\s-]+/g, '_').toUpperCase();

  if (type === 'harian') {
    content = generateDailyReportCSV(kelas, dateOrPeriod, siswaList, presensiList);
    filename = `REKAP_PRESENSI_HARIAN_${cleanKelas}_${dateOrPeriod}.csv`;
  } else if (type === 'mingguan') {
    content = generateWeeklyReportCSV(kelas, dateOrPeriod, siswaList, presensiList);
    filename = `REKAP_PRESENSI_MINGGUAN_${cleanKelas}_MULAI_${dateOrPeriod}.csv`;
  } else if (type === 'bulanan') {
    content = generateMonthlyReportCSV(kelas, dateOrPeriod, siswaList, presensiList);
    filename = `REKAP_PRESENSI_BULANAN_${cleanKelas}_${dateOrPeriod}.csv`;
  } else {
    const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
    const thn = semesterOptions?.tahunAjaran || '2026/2027';
    content = generateSemesterReportCSV(kelas, semType, thn, siswaList, presensiList);
    filename = `REKAP_PRESENSI_SEMESTER_${semType}_${cleanKelas}_${thn.replace('/', '-')}.csv`;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, filename);
}

/**
 * Trigger download of All Classes ZIP
 */
export async function downloadAllClassesZip(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  onProgress?: (current: number, total: number, className: string) => void,
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string }
) {
  const zip = new JSZip();
  const classes = DAFTAR_KELAS;
  const total = classes.length + 1; // including master summary / all students

  if (type === 'harian') {
    // 1. Add Master School Rombel Summary
    onProgress?.(1, total, 'Rekapitulasi Seluruh Rombel');
    const rombelSummary = generateDailyRombelSummaryCSV(dateOrPeriod, siswaList, presensiList);
    zip.file(`00_REKAPITULASI_SELURUH_ROMBEL_${dateOrPeriod}.csv`, rombelSummary);

    // 2. Add each class file
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Rekap ${cls}`);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      const csv = generateDailyReportCSV(cls, dateOrPeriod, siswaList, presensiList);
      zip.file(`REKAP_HARIAN_${cleanName}_${dateOrPeriod}.csv`, csv);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_REKAP_PRESENSI_HARIAN_SEMUA_KELAS_${dateOrPeriod}.zip`);

  } else if (type === 'mingguan') {
    // 1. Add All Students Master
    onProgress?.(1, total, 'Rekapitulasi Semua Siswa');
    const masterWeekly = generateWeeklyReportCSV('Semua Kelas', dateOrPeriod, siswaList, presensiList);
    zip.file(`00_REKAP_MINGGUAN_SEMUA_SISWA_MULAI_${dateOrPeriod}.csv`, masterWeekly);

    // 2. Add each class file
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Rekap ${cls}`);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      const csv = generateWeeklyReportCSV(cls, dateOrPeriod, siswaList, presensiList);
      zip.file(`REKAP_MINGGUAN_${cleanName}_MULAI_${dateOrPeriod}.csv`, csv);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_REKAP_PRESENSI_MINGGUAN_SEMUA_KELAS_MULAI_${dateOrPeriod}.zip`);

  } else if (type === 'bulanan') {
    // 1. Add All Students Master Bulanan
    onProgress?.(1, total, 'Rekapitulasi Bulanan Semua Siswa');
    const masterMonthly = generateMonthlyReportCSV('Semua Kelas', dateOrPeriod, siswaList, presensiList);
    zip.file(`00_REKAP_BULANAN_SEMUA_SISWA_${dateOrPeriod}.csv`, masterMonthly);

    // 2. Add each class file
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Rekap ${cls}`);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      const csv = generateMonthlyReportCSV(cls, dateOrPeriod, siswaList, presensiList);
      zip.file(`REKAP_BULANAN_${cleanName}_${dateOrPeriod}.csv`, csv);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_REKAP_PRESENSI_BULANAN_SEMUA_KELAS_${dateOrPeriod}.zip`);

  } else {
    // SEMESTER ZIP
    const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
    const thn = semesterOptions?.tahunAjaran || '2026/2027';
    const thnClean = thn.replace('/', '-');

    // 1. Add Master School Rombel Summary for Semester
    onProgress?.(1, total, 'Rekapitulasi Rombel Semester');
    const semSummary = generateSemesterRombelSummaryCSV(semType, thn, siswaList, presensiList);
    zip.file(`00_REKAPITULASI_ROMBEL_SEMESTER_${semType}_${thnClean}.csv`, semSummary);

    // 2. Add each class file
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Rekap ${cls}`);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      const csv = generateSemesterReportCSV(cls, semType, thn, siswaList, presensiList);
      zip.file(`REKAP_SEMESTER_${semType}_${cleanName}_${thnClean}.csv`, csv);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_REKAP_PRESENSI_SEMESTER_${semType}_SEMUA_KELAS_${thnClean}.zip`);
  }
}

