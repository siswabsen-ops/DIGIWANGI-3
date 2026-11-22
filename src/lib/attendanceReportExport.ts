import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {
  Siswa,
  Presensi,
  SystemSettings,
  DAFTAR_KELAS,
  PenilaianAkhlak,
  DAFTAR_DIMENSI_PROFIL,
  SKALA_PENILAIAN_MAP,
  isRecordMatchStudent
} from '../types';
import {
  isSameClass,
  isPresensiMatchSiswa,
  buildDailyAttendanceIndex,
  getAttendanceFromIndex,
  calculateAllRombelSummaryList,
  calculateWeeklyRombelSummaryList,
  calculateMonthlyRombelSummaryList,
  normalizeDateKey,
  getAttendanceShift,
  getMondayOfWeek,
  safeAddDays,
  safeDateParts,
  formatDateIndoLong,
  formatMonthIndo,
  isRecordNewer,
  getLocalDateString
} from './attendanceUtils';
import { getWaliKelasByKelas } from './demoData';
import { triggerFileDownload } from './qrCodeExport';
import {
  createConfiguredWorkbook,
  buildStyledWorksheet,
  downloadWorkbookXlsx,
  workbookToXlsxBuffer,
  styleAttendanceStatusCell,
  styleMetodeCell,
  styleShiftCell,
  styleQualificationOrRateCell,
  ExcelLegendItem
} from './excelExportEngine';

export interface ClassReportOption {
  kelas: string;
  waliKelas: string;
  totalSiswa: number;
}

const ATTENDANCE_LEGEND: ExcelLegendItem[] = [
  { code: 'H / ✔', label: 'Hadir Tepat Waktu', fillHex: 'FFDCFCE7', fontHex: 'FF166534' },
  { code: 'T', label: 'Terlambat', fillHex: 'FFFEF3C7', fontHex: 'FF92400E' },
  { code: 'S', label: 'Sakit', fillHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
  { code: 'I', label: 'Izin', fillHex: 'FFE0F2FE', fontHex: 'FF075985' },
  { code: 'A', label: 'Alfa', fillHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
  { code: '-', label: 'Belum Absen', fillHex: 'FFF1F5F9', fontHex: 'FF64748B' }
];

function sortStudentsByClassAndName(list: Siswa[]): Siswa[] {
  return [...list].sort((a, b) => {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });
}

function getEffectiveSemesterDays(tahunAjaran: string, semesterType: '1' | '2', presensiList: Presensi[]) {
  const parts = tahunAjaran.split('/');
  const startYear = parseInt(parts[0]) || 2026;
  const endYear = parseInt(parts[1]) || startYear + 1;

  const targetYearMonths =
    semesterType === '1'
      ? ['07', '08', '09', '10', '11', '12'].map((m) => `${startYear}-${m}`)
      : ['01', '02', '03', '04', '05', '06'].map((m) => `${endYear}-${m}`);

  const rawDatesInSemester = new Set<string>();
  presensiList.forEach((p) => {
    if (!p.tanggal) return;
    const norm = normalizeDateKey(p.tanggal);
    if (targetYearMonths.some((ym) => norm.startsWith(ym))) {
      rawDatesInSemester.add(norm);
    }
  });

  return {
    targetYearMonths,
    effectiveDays: Math.max(1, rawDatesInSemester.size)
  };
}

/**
 * 1. TAMBAH SHEET HARIAN PER KELAS / SEMUA SISWA
 */
export function addDailyClassSheetToWorkbook(
  wb: ExcelJS.Workbook,
  sheetName: string,
  kelas: string,
  dateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );
  const dailyIndex = buildDailyAttendanceIndex(presensiList, dateStr);

  let hadir = 0;
  let terlambat = 0;
  let sakit = 0;
  let izin = 0;
  let alfa = 0;
  let belum = 0;
  let qrCount = 0;
  let tapCount = 0;

  const rows: (string | number)[][] = filteredStudents.map((siswa, idx) => {
    const record = getAttendanceFromIndex(siswa, dailyIndex);
    const status = record ? record.status : 'Belum Absen';
    const waktu = record ? record.waktu : '-';
    const waStatus = record ? record.waStatus || 'TERKIRIM' : '-';
    const operator = record ? record.operator || '-' : '-';
    const shiftVal = record?.shift || getAttendanceShift(record, siswa.kelas, record?.waktu, settings);
    const shiftLabel = shiftVal === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';
    const metodeLabel = record
      ? record.metodeLabel || (record.metode === 'QR_SCAN' ? 'Scan QR Code' : 'Manual Tap Wali')
      : '-';
    const keterangan = record
      ? record.keterangan || (status === 'Hadir' ? 'Tercatat Hadir via Scan Kartu' : `Keterangan ${status}`)
      : 'Belum Melakukan Presensi';

    if (status === 'Hadir') hadir++;
    else if (status === 'Terlambat') terlambat++;
    else if (status === 'Sakit') sakit++;
    else if (status === 'Izin') izin++;
    else if (status === 'Alfa') alfa++;
    else belum++;

    if (record) {
      if (record.metode === 'MANUAL_TAP' || record.metode === 'MANUAL_OPERATOR') tapCount++;
      else qrCount++;
    }

    return [
      idx + 1,
      siswa.nis || '-',
      siswa.nisn || siswa.nik || '-',
      siswa.nama,
      siswa.jenisKelamin || 'L',
      siswa.kelas,
      shiftLabel,
      dateStr,
      waktu,
      status,
      metodeLabel,
      keterangan,
      operator,
      waStatus
    ];
  });

  const totalMasuk = hadir + terlambat;
  const pct = filteredStudents.length > 0 ? Math.round((totalMasuk / filteredStudents.length) * 100) : 0;
  const waliName = isAll ? 'Panji Teguh Amarta S, S.Pd.I' : getWaliKelasByKelas(kelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: 'FF0F766E',
    title: `REKAPITULASI PRESENSI HARIAN SISWA • ${kelas.toUpperCase()}`,
    metaInfo: `Tanggal: ${formatDateIndoLong(dateStr)}  |  ${isAll ? 'Petugas Piket' : 'Wali Kelas'}: ${waliName}  |  Total Murid: ${filteredStudents.length} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: filteredStudents.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hadir Tepat', value: hadir, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: terlambat, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sakit, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: izin, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: alfa, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Belum Absen', value: belum, bgHex: 'FFF8FAFC', fontHex: 'FF475569' },
      { label: 'Scan QR / Tap', value: `${qrCount} / ${tapCount}`, bgHex: 'FFECFDF5', fontHex: 'FF065F46' },
      { label: 'Keaktifan', value: `${pct}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: [
      'No',
      'NIS',
      'NISN / NIK',
      'Nama Lengkap Siswa',
      'L/P',
      'Kelas',
      'Sesi Shift',
      'Tanggal',
      'Waktu',
      'Status Kehadiran',
      'Metode Absensi',
      'Keterangan Kehadiran',
      'Operator / Wali',
      'Status WA'
    ],
    rows,
    totalRow: [
      '',
      '',
      '',
      `RINGKASAN HARIAN (${filteredStudents.length} SISWA)`,
      '',
      kelas,
      '',
      dateStr,
      '',
      `Masuk: ${totalMasuk}`,
      `QR:${qrCount} Tap:${tapCount}`,
      `S:${sakit}  I:${izin}  A:${alfa}  Belum:${belum}`,
      '',
      pct / 100
    ],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { minWidth: 11, maxWidth: 15, align: 'center', isTextId: true },
      { minWidth: 14, maxWidth: 19, align: 'center', isTextId: true },
      { minWidth: 26, maxWidth: 36, align: 'left' },
      { width: 6, align: 'center' },
      { width: 12, align: 'center' },
      { width: 14, align: 'center' },
      { width: 12, align: 'center' },
      { width: 10, align: 'center' },
      { width: 16, align: 'center' },
      { width: 18, align: 'center' },
      { minWidth: 24, maxWidth: 34, align: 'left', wrapText: true },
      { minWidth: 18, maxWidth: 26, align: 'left' },
      { width: 13, align: 'center', isPercent: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 6) return styleShiftCell(val);
      if (cIdx === 9) return styleAttendanceStatusCell(val);
      if (cIdx === 10) return styleMetodeCell(val);
      if (cIdx === 13) {
        const s = String(val || '').toUpperCase();
        if (s.includes('TERKIRIM')) return { fillHex: 'FFDCFCE7', fontHex: 'FF166534', bold: true, align: 'center' };
        if (s.includes('GAGAL')) return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
        return { align: 'center', fontHex: 'FF64748B' };
      }
      return undefined;
    },
    signatureRightLabel: isAll
      ? 'Cisurupan, Garut • Petugas Piket Harian'
      : `Cisurupan, Garut • Wali ${kelas}`,
    signatureRightName: waliName
  });
}

/**
 * 2. TAMBAH SHEET RINGKASAN HARIAN SELURUH ROMBEL (1-A s/d 6-B)
 */
export function addDailyRombelSummarySheetToWorkbook(
  wb: ExcelJS.Workbook,
  dateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const allRombel = calculateAllRombelSummaryList(siswaList, presensiList, dateStr, settings);

  let totalSiswa = 0,
    hadir = 0,
    terlambat = 0,
    sakit = 0,
    izin = 0,
    alfa = 0,
    belumAbsen = 0,
    totalHadir = 0,
    totalTidakHadir = 0,
    totalScanQR = 0,
    totalManualTap = 0;

  allRombel.forEach((r) => {
    totalSiswa += r.totalSiswa;
    hadir += r.hadir;
    terlambat += r.terlambat;
    sakit += r.sakit;
    izin += r.izin;
    alfa += r.alfa;
    belumAbsen += r.belumAbsen;
    totalHadir += r.totalHadir;
    totalTidakHadir += r.totalTidakHadir;
    totalScanQR += r.totalScanQR || 0;
    totalManualTap += r.totalManualTap || 0;
  });

  const grandPersen = totalSiswa > 0 ? Math.min(100, Math.round((totalHadir / totalSiswa) * 100)) : 0;
  const grandStatus =
    belumAbsen === 0 && totalSiswa > 0
      ? 'Tuntas'
      : totalSiswa - belumAbsen > 0
      ? 'Sedang Berjalan'
      : 'Belum Mulai';

  const rows: (string | number)[][] = allRombel.map((r, idx) => [
    idx + 1,
    r.kelas,
    r.waliKelas,
    r.shiftLabel || 'Pagi (07.00)',
    r.totalSiswa,
    r.hadir,
    r.terlambat,
    r.sakit,
    r.izin,
    r.alfa,
    r.belumAbsen,
    r.totalHadir,
    r.totalScanQR || 0,
    r.totalManualTap || 0,
    r.totalTidakHadir,
    r.persentase / 100,
    r.statusAbsen
  ]);

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Ringkasan Semua Rombel',
    tabColor: 'FF1E3A8A',
    title: 'REKAPITULASI PRESENSI HARIAN SELURUH ROMBEL (KELAS 1-A s/d 6-B)',
    metaInfo: `Tanggal: ${formatDateIndoLong(dateStr)}  |  Total Rombel: ${allRombel.length} Kelas  |  Total Murid: ${totalSiswa} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: totalSiswa, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hadir Tepat', value: hadir, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: terlambat, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit + Izin', value: sakit + izin, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: alfa, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Belum Absen', value: belumAbsen, bgHex: 'FFF8FAFC', fontHex: 'FF475569' },
      { label: 'Scan QR / Tap', value: `${totalScanQR} / ${totalManualTap}`, bgHex: 'FFECFDF5', fontHex: 'FF065F46' },
      { label: 'Keaktifan Sekolah', value: `${grandPersen}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: [
      'No',
      'Rombel Kelas',
      'Wali Kelas',
      'Sesi Shift',
      'Siswa',
      'Hadir',
      'Telat',
      'Sakit',
      'Izin',
      'Alfa',
      'Belum',
      'Masuk (H+T)',
      'Scan QR',
      'Tap Wali',
      'Tidak Masuk',
      'Keaktifan',
      'Status Rombel'
    ],
    rows,
    totalRow: [
      '',
      'TOTAL SEKOLAH',
      '12 Rombel Kelas',
      'Semua Sesi',
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      belumAbsen,
      totalHadir,
      totalScanQR,
      totalManualTap,
      totalTidakHadir,
      grandPersen / 100,
      grandStatus
    ],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { width: 13, align: 'center' },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 15, align: 'center' },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 10, align: 'center', isNumeric: true },
      { width: 10, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isPercent: true },
      { width: 16, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 1) return { bold: true, align: 'center', fontHex: 'FF0F172A' };
      if (cIdx === 3) return styleShiftCell(val);
      if (cIdx === 15 || cIdx === 16) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: 'Cisurupan, Garut • Petugas Piket Harian',
    signatureRightName: 'Panji Teguh Amarta S, S.Pd.I'
  });
}

/**
 * 3. TAMBAH SHEET MINGGUAN (MATRIKS SENIN - JUMAT)
 */
export function addWeeklyClassSheetToWorkbook(
  wb: ExcelJS.Workbook,
  sheetName: string,
  kelas: string,
  mondayDateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );

  const monday = getMondayOfWeek(mondayDateStr);
  const indonesianDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const shortMonths = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const weekDates: { dateStr: string; label: string }[] = [];

  for (let i = 0; i < 5; i++) {
    const dateStr = safeAddDays(monday, i);
    const { day, month } = safeDateParts(dateStr);
    weekDates.push({ dateStr, label: `${indonesianDays[i]}\n(${day} ${shortMonths[month] || ''})` });
  }

  const dailyIndexes = weekDates.map((w) => buildDailyAttendanceIndex(presensiList, w.dateStr));
  const activeDaysCount = Math.max(1, weekDates.filter((_, idx) => dailyIndexes[idx].bySiswaId.size > 0).length);

  let totalHadirAll = 0,
    totalTelatAll = 0,
    totalSakitAll = 0,
    totalIzinAll = 0,
    totalAlfaAll = 0,
    totalBelumAll = 0,
    totalMasukAll = 0;

  const statusCode = (status: string) => {
    if (status === 'Hadir') return '✔';
    if (status === 'Terlambat') return 'T';
    if (status === 'Sakit') return 'S';
    if (status === 'Izin') return 'I';
    if (status === 'Alfa') return 'A';
    return '-';
  };

  const rows: (string | number)[][] = filteredStudents.map((siswa, idx) => {
    let hadirCount = 0,
      telatCount = 0,
      sakitCount = 0,
      izinCount = 0,
      alfaCount = 0,
      belumCount = 0;

    const dayCells = weekDates.map((_w, dayIdx) => {
      const record = getAttendanceFromIndex(siswa, dailyIndexes[dayIdx]);
      if (!record) {
        belumCount++;
        return '-';
      }
      if (record.status === 'Hadir') hadirCount++;
      else if (record.status === 'Terlambat') telatCount++;
      else if (record.status === 'Sakit') sakitCount++;
      else if (record.status === 'Izin') izinCount++;
      else if (record.status === 'Alfa') alfaCount++;
      return statusCode(record.status);
    });

    const totalMasuk = hadirCount + telatCount;
    const persen = Math.min(100, Math.round((totalMasuk / activeDaysCount) * 100));
    const shiftLabel =
      getAttendanceShift(null, siswa.kelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';

    totalHadirAll += hadirCount;
    totalTelatAll += telatCount;
    totalSakitAll += sakitCount;
    totalIzinAll += izinCount;
    totalAlfaAll += alfaCount;
    totalBelumAll += belumCount;
    totalMasukAll += totalMasuk;

    return [
      idx + 1,
      siswa.nis || '-',
      siswa.nama,
      siswa.kelas,
      shiftLabel,
      ...dayCells,
      hadirCount,
      telatCount,
      sakitCount,
      izinCount,
      alfaCount,
      belumCount,
      totalMasuk,
      persen / 100
    ];
  });

  const totalSlots = filteredStudents.length * activeDaysCount;
  const avgPersen = totalSlots > 0 ? Math.min(100, Math.round((totalMasukAll / totalSlots) * 100)) : 0;
  const waliName = isAll ? 'Panji Teguh Amarta S, S.Pd.I' : getWaliKelasByKelas(kelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: 'FF4F46E5',
    title: `JURNAL MATRIKS PRESENSI MINGGUAN • ${kelas.toUpperCase()}`,
    metaInfo: `Periode: ${formatDateIndoLong(weekDates[0].dateStr)} s/d ${formatDateIndoLong(weekDates[4].dateStr)}  |  Wali: ${waliName}  |  Total: ${filteredStudents.length} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: filteredStudents.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hari Aktif', value: `${activeDaysCount} Hari`, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Total Hadir', value: totalHadirAll, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: totalTelatAll, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: totalSakitAll, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: totalIzinAll, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: totalAlfaAll, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Rata-Rata Hadir', value: `${avgPersen}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: [
      'No',
      'NIS',
      'Nama Lengkap Siswa',
      'Kelas',
      'Shift',
      ...weekDates.map((w) => w.label),
      'H',
      'T',
      'S',
      'I',
      'A',
      'B',
      'Masuk',
      'Keaktifan'
    ],
    rows,
    totalRow: [
      '',
      '',
      `TOTAL REKAP MINGGUAN (${filteredStudents.length} SISWA)`,
      kelas,
      '',
      ...weekDates.map(() => ''),
      totalHadirAll,
      totalTelatAll,
      totalSakitAll,
      totalIzinAll,
      totalAlfaAll,
      totalBelumAll,
      totalMasukAll,
      avgPersen / 100
    ],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { minWidth: 11, maxWidth: 15, align: 'center', isTextId: true },
      { minWidth: 26, maxWidth: 34, align: 'left' },
      { width: 11, align: 'center' },
      { width: 13, align: 'center' },
      ...weekDates.map(() => ({ width: 11, align: 'center' as const })),
      { width: 6, align: 'center', isNumeric: true },
      { width: 6, align: 'center', isNumeric: true },
      { width: 6, align: 'center', isNumeric: true },
      { width: 6, align: 'center', isNumeric: true },
      { width: 6, align: 'center', isNumeric: true },
      { width: 6, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isPercent: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 4) return styleShiftCell(val);
      if (cIdx >= 5 && cIdx <= 9) return styleAttendanceStatusCell(val);
      if (cIdx === 17) return styleQualificationOrRateCell(val);
      return undefined;
    },
    legendItems: ATTENDANCE_LEGEND,
    signatureRightLabel: isAll
      ? 'Cisurupan, Garut • Petugas Piket Harian'
      : `Cisurupan, Garut • Wali ${kelas}`,
    signatureRightName: waliName
  });
}

export function addWeeklyRombelSummarySheetToWorkbook(
  wb: ExcelJS.Workbook,
  mondayDateStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const summary = calculateWeeklyRombelSummaryList(siswaList, presensiList, mondayDateStr);
  let totalSiswa = 0,
    hadir = 0,
    terlambat = 0,
    sakit = 0,
    izin = 0,
    alfa = 0,
    totalHadir = 0;

  const rows: (string | number)[][] = summary.map((r, idx) => {
    totalSiswa += r.totalSiswa;
    hadir += r.hadir;
    terlambat += r.terlambat;
    sakit += r.sakit;
    izin += r.izin;
    alfa += r.alfa;
    totalHadir += r.totalHadir;
    const shift = getAttendanceShift(null, r.kelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';
    return [
      idx + 1,
      r.kelas,
      r.waliKelas,
      shift,
      r.totalSiswa,
      r.hadir,
      r.terlambat,
      r.sakit,
      r.izin,
      r.alfa,
      r.totalHadir,
      r.persentase / 100
    ];
  });

  const avgPct =
    summary.length > 0 ? Math.round(summary.reduce((a, b) => a + b.persentase, 0) / summary.length) : 0;

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Ringkasan Rombel Mingguan',
    tabColor: 'FF1E3A8A',
    title: 'REKAPITULASI MINGGUAN PER ROMBEL KELAS (1-A s/d 6-B)',
    metaInfo: `Senin Mulai: ${formatDateIndoLong(mondayDateStr)}  |  Total Rombel: ${summary.length} Kelas  |  Total Murid: ${totalSiswa} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: totalSiswa, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hadir Tepat', value: hadir, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: terlambat, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sakit, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: izin, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: alfa, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Keaktifan Sekolah', value: `${avgPct}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: ['No', 'Rombel', 'Wali Kelas', 'Shift', 'Murid', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alfa', 'Total Masuk', 'Keaktifan'],
    rows,
    totalRow: ['', 'TOTAL SEKOLAH', '12 Rombel', 'Semua Sesi', totalSiswa, hadir, terlambat, sakit, izin, alfa, totalHadir, avgPct / 100],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { width: 12, align: 'center' },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 14, align: 'center' },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isPercent: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 3) return styleShiftCell(val);
      if (cIdx === 11) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: 'Cisurupan, Garut • Petugas Piket Harian',
    signatureRightName: 'Panji Teguh Amarta S, S.Pd.I'
  });
}

/**
 * 4. TAMBAH SHEET BULANAN (REKAP + MATRIKS KALENDER TANGGAL 1..31)
 */
export function addMonthlyClassSheetToWorkbook(
  wb: ExcelJS.Workbook,
  sheetName: string,
  kelas: string,
  monthStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings,
  includeCalendarMatrix: boolean = true
) {
  const isAll = kelas === 'Semua Kelas' || !kelas;
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );

  const rawDatesInMonth = new Set<string>();
  presensiList.forEach((p) => {
    const norm = normalizeDateKey(p.tanggal);
    if (norm.startsWith(monthStr)) {
      rawDatesInMonth.add(norm);
    }
  });
  const effectiveDays = Math.max(1, rawDatesInMonth.size);

  let sumH = 0,
    sumT = 0,
    sumS = 0,
    sumI = 0,
    sumA = 0,
    sumMasuk = 0,
    sumPct = 0;

  const studentDateMaps = new Map<string, Map<string, Presensi>>();

  const rows: (string | number)[][] = filteredStudents.map((siswa, idx) => {
    const studentRecords = presensiList.filter(
      (p) => isPresensiMatchSiswa(p, siswa) && normalizeDateKey(p.tanggal).startsWith(monthStr)
    );

    const dateMap = new Map<string, Presensi>();
    studentRecords.forEach((r) => {
      const d = normalizeDateKey(r.tanggal);
      if (isRecordNewer(r, dateMap.get(d))) {
        dateMap.set(d, r);
      }
    });
    studentDateMaps.set(siswa.id, dateMap);

    let hadir = 0,
      terlambat = 0,
      sakit = 0,
      izin = 0,
      alfa = 0;

    dateMap.forEach((rec) => {
      if (rec.status === 'Hadir') hadir++;
      else if (rec.status === 'Terlambat') terlambat++;
      else if (rec.status === 'Sakit') sakit++;
      else if (rec.status === 'Izin') izin++;
      else if (rec.status === 'Alfa') alfa++;
    });

    const totalMasuk = hadir + terlambat;
    const persen = Math.min(100, Math.round((totalMasuk / effectiveDays) * 100));

    let predikat = 'Rendah (Perlu Perhatian)';
    if (persen >= 90) predikat = 'Sangat Baik / Rajin';
    else if (persen >= 80) predikat = 'Baik';
    else if (persen >= 60) predikat = 'Cukup';

    const shiftLabel =
      getAttendanceShift(null, siswa.kelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';

    sumH += hadir;
    sumT += terlambat;
    sumS += sakit;
    sumI += izin;
    sumA += alfa;
    sumMasuk += totalMasuk;
    sumPct += persen;

    return [
      idx + 1,
      siswa.nis || '-',
      siswa.nama,
      siswa.kelas,
      shiftLabel,
      effectiveDays,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      totalMasuk,
      persen / 100,
      predikat
    ];
  });

  const avgPersen = filteredStudents.length > 0 ? Math.round(sumPct / filteredStudents.length) : 0;
  const monthName = formatMonthIndo(monthStr);
  const waliName = isAll ? 'Panji Teguh Amarta S, S.Pd.I' : getWaliKelasByKelas(kelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: 'FF059669',
    title: `BUKU REKAPITULASI PRESENSI BULANAN • ${kelas.toUpperCase()}`,
    metaInfo: `Bulan: ${monthName} (${monthStr})  |  Hari Efektif: ${effectiveDays} Hari  |  Wali: ${waliName}  |  Total: ${filteredStudents.length} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: filteredStudents.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hari Efektif', value: `${effectiveDays} Hari`, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Total Hadir', value: sumH, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: sumT, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sumS, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: sumI, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: sumA, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Rata-Rata Kelas', value: `${avgPersen}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: [
      'No',
      'NIS',
      'Nama Lengkap Siswa',
      'Kelas',
      'Shift',
      'Hari Efektif',
      'Hadir',
      'Telat',
      'Sakit',
      'Izin',
      'Alfa',
      'Total Masuk',
      'Keaktifan',
      'Predikat Kualifikasi'
    ],
    rows,
    totalRow: [
      '',
      '',
      `TOTAL AKUMULASI BULAN ${monthName.toUpperCase()}`,
      kelas,
      '',
      effectiveDays,
      sumH,
      sumT,
      sumS,
      sumI,
      sumA,
      sumMasuk,
      avgPersen / 100,
      avgPersen >= 90 ? 'Sangat Baik' : avgPersen >= 80 ? 'Baik' : 'Cukup'
    ],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { minWidth: 11, maxWidth: 15, align: 'center', isTextId: true },
      { minWidth: 26, maxWidth: 34, align: 'left' },
      { width: 11, align: 'center' },
      { width: 13, align: 'center' },
      { width: 11, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isPercent: true },
      { width: 22, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 4) return styleShiftCell(val);
      if (cIdx === 12 || cIdx === 13) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: isAll
      ? 'Cisurupan, Garut • Petugas Piket Harian'
      : `Cisurupan, Garut • Wali ${kelas}`,
    signatureRightName: waliName
  });

  // Bonus Sheet: Matriks Kalender Tanggal Harian untuk bulan tsb (untuk single-class)
  if (includeCalendarMatrix && !isAll && filteredStudents.length > 0) {
    const [yrStr, moStr] = monthStr.split('-');
    const year = parseInt(yrStr) || 2026;
    const month = parseInt(moStr) || 10;
    const daysInMonth = new Date(year, month, 0).getDate();

    const activeDates: { day: number; dateStr: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${monthStr}-${String(d).padStart(2, '0')}`;
      const dow = new Date(`${ds}T00:00:00Z`).getUTCDay();
      if (dow !== 0 || rawDatesInMonth.has(ds)) {
        activeDates.push({ day: d, dateStr: ds });
      }
    }

    const matrixRows: (string | number)[][] = filteredStudents.map((siswa, idx) => {
      const dm = studentDateMaps.get(siswa.id) || new Map<string, Presensi>();
      let masuk = 0;
      const cells = activeDates.map(({ dateStr }) => {
        const rec = dm.get(dateStr);
        if (!rec) return '-';
        if (rec.status === 'Hadir') {
          masuk++;
          return 'H';
        }
        if (rec.status === 'Terlambat') {
          masuk++;
          return 'T';
        }
        if (rec.status === 'Sakit') return 'S';
        if (rec.status === 'Izin') return 'I';
        if (rec.status === 'Alfa') return 'A';
        return '-';
      });
      return [idx + 1, siswa.nis || '-', siswa.nama, ...cells, masuk];
    });

    buildStyledWorksheet({
      workbook: wb,
      sheetName: `Matriks ${monthName}`,
      tabColor: 'FF0D9488',
      title: `MATRIKS KALENDER PRESENSI HARIAN • ${kelas.toUpperCase()}`,
      metaInfo: `Bulan: ${monthName} (${monthStr})  |  H = Hadir, T = Terlambat, S = Sakit, I = Izin, A = Alfa, - = Belum/Kosong`,
      headers: ['No', 'NIS', 'Nama Lengkap Siswa', ...activeDates.map((d) => String(d.day).padStart(2, '0')), 'Masuk'],
      rows: matrixRows,
      columnMeta: [
        { width: 5, align: 'center', isNumeric: true },
        { width: 12, align: 'center', isTextId: true },
        { minWidth: 24, maxWidth: 32, align: 'left' },
        ...activeDates.map(() => ({ width: 4.5, align: 'center' as const })),
        { width: 8, align: 'center', isNumeric: true }
      ],
      cellStyler: (_rIdx, cIdx, val) => {
        if (cIdx >= 3 && cIdx < 3 + activeDates.length) {
          const s = String(val);
          return styleAttendanceStatusCell(s === 'H' ? 'Hadir' : s);
        }
        return undefined;
      },
      legendItems: ATTENDANCE_LEGEND,
      signatureRightLabel: `Cisurupan, Garut • Wali ${kelas}`,
      signatureRightName: waliName
    });
  }
}

export function addMonthlyRombelSummarySheetToWorkbook(
  wb: ExcelJS.Workbook,
  monthStr: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const summary = calculateMonthlyRombelSummaryList(siswaList, presensiList, monthStr);
  let totalSiswa = 0,
    hadir = 0,
    terlambat = 0,
    sakit = 0,
    izin = 0,
    alfa = 0,
    totalHadir = 0;

  const rows: (string | number)[][] = summary.map((r, idx) => {
    totalSiswa += r.totalSiswa;
    hadir += r.hadir;
    terlambat += r.terlambat;
    sakit += r.sakit;
    izin += r.izin;
    alfa += r.alfa;
    totalHadir += r.totalHadir;
    const shift = getAttendanceShift(null, r.kelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';
    return [idx + 1, r.kelas, r.waliKelas, shift, r.totalSiswa, r.hadir, r.terlambat, r.sakit, r.izin, r.alfa, r.totalHadir, r.persentase / 100];
  });

  const avgPct =
    summary.length > 0 ? Math.round(summary.reduce((a, b) => a + b.persentase, 0) / summary.length) : 0;
  const monthName = formatMonthIndo(monthStr);

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Ringkasan Rombel Bulanan',
    tabColor: 'FF1E3A8A',
    title: `REKAPITULASI BULANAN PER ROMBEL KELAS (1-A s/d 6-B)`,
    metaInfo: `Bulan: ${monthName} (${monthStr})  |  Total Rombel: ${summary.length} Kelas  |  Total Murid: ${totalSiswa} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: totalSiswa, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hadir Tepat', value: hadir, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: terlambat, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sakit, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: izin, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: alfa, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Keaktifan Sekolah', value: `${avgPct}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: ['No', 'Rombel', 'Wali Kelas', 'Shift', 'Murid', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alfa', 'Total Masuk', 'Keaktifan'],
    rows,
    totalRow: ['', 'TOTAL SEKOLAH', '12 Rombel', 'Semua Sesi', totalSiswa, hadir, terlambat, sakit, izin, alfa, totalHadir, avgPct / 100],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { width: 12, align: 'center' },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 14, align: 'center' },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isPercent: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 3) return styleShiftCell(val);
      if (cIdx === 11) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: 'Cisurupan, Garut • Petugas Piket Harian',
    signatureRightName: 'Panji Teguh Amarta S, S.Pd.I'
  });
}

/**
 * 5. TAMBAH SHEET SEMESTER PER KELAS & RINGKASAN ROMBEL SEMESTER
 */
export function addSemesterClassSheetToWorkbook(
  wb: ExcelJS.Workbook,
  sheetName: string,
  kelas: string,
  semesterType: '1' | '2',
  tahunAjaran: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );
  const { targetYearMonths, effectiveDays } = getEffectiveSemesterDays(tahunAjaran, semesterType, presensiList);

  let sumH = 0,
    sumT = 0,
    sumS = 0,
    sumI = 0,
    sumA = 0,
    sumMasuk = 0,
    sumPct = 0;

  const rows: (string | number)[][] = filteredStudents.map((siswa, idx) => {
    const studentRecords = presensiList.filter((p) => {
      if (!isPresensiMatchSiswa(p, siswa)) return false;
      const norm = normalizeDateKey(p.tanggal);
      return targetYearMonths.some((ym) => norm.startsWith(ym));
    });

    const dateMap = new Map<string, Presensi>();
    studentRecords.forEach((r) => {
      const d = normalizeDateKey(r.tanggal);
      if (isRecordNewer(r, dateMap.get(d))) dateMap.set(d, r);
    });

    let hadir = 0,
      terlambat = 0,
      sakit = 0,
      izin = 0,
      alfa = 0;
    dateMap.forEach((rec) => {
      if (rec.status === 'Hadir') hadir++;
      else if (rec.status === 'Terlambat') terlambat++;
      else if (rec.status === 'Sakit') sakit++;
      else if (rec.status === 'Izin') izin++;
      else if (rec.status === 'Alfa') alfa++;
    });

    const totalMasuk = hadir + terlambat;
    const persen = Math.min(100, Math.round((totalMasuk / effectiveDays) * 100));
    let predikat = 'Perlu Bimbingan';
    if (persen >= 90) predikat = 'Sangat Baik (A)';
    else if (persen >= 80) predikat = 'Baik (B)';
    else if (persen >= 60) predikat = 'Cukup (C)';

    const shiftLabel =
      getAttendanceShift(null, siswa.kelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';

    sumH += hadir;
    sumT += terlambat;
    sumS += sakit;
    sumI += izin;
    sumA += alfa;
    sumMasuk += totalMasuk;
    sumPct += persen;

    return [idx + 1, siswa.nis || '-', siswa.nama, siswa.kelas, shiftLabel, effectiveDays, hadir, terlambat, sakit, izin, alfa, totalMasuk, persen / 100, predikat];
  });

  const avgPersen = filteredStudents.length > 0 ? Math.round(sumPct / filteredStudents.length) : 0;
  const semLabel = semesterType === '1' ? 'Semester 1 (Ganjil • Juli-Des)' : 'Semester 2 (Genap • Jan-Jun)';
  const waliName = isAll ? 'Panji Teguh Amarta S, S.Pd.I' : getWaliKelasByKelas(kelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: 'FF1D4ED8',
    title: `BUKU INDUK PRESENSI SEMESTER • ${kelas.toUpperCase()}`,
    metaInfo: `Tahun Ajaran: ${tahunAjaran}  |  ${semLabel}  |  Hari Efektif: ${effectiveDays} Hari  |  Wali: ${waliName}`,
    kpiCards: [
      { label: 'Total Siswa', value: filteredStudents.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hari Efektif', value: `${effectiveDays} Hari`, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Total Hadir', value: sumH, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: sumT, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sumS, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: sumI, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: sumA, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Keaktifan Semester', value: `${avgPersen}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: ['No', 'NIS', 'Nama Lengkap Siswa', 'Kelas', 'Shift', 'Efektif', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alfa', 'Total Masuk', 'Keaktifan', 'Predikat Raport'],
    rows,
    totalRow: ['', '', `REKAPITULASI ${semLabel.toUpperCase()}`, kelas, '', effectiveDays, sumH, sumT, sumS, sumI, sumA, sumMasuk, avgPersen / 100, avgPersen >= 90 ? 'Sangat Baik (A)' : avgPersen >= 80 ? 'Baik (B)' : 'Cukup (C)'],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { minWidth: 11, maxWidth: 15, align: 'center', isTextId: true },
      { minWidth: 26, maxWidth: 34, align: 'left' },
      { width: 11, align: 'center' },
      { width: 13, align: 'center' },
      { width: 9, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 8, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isPercent: true },
      { width: 18, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 4) return styleShiftCell(val);
      if (cIdx === 12 || cIdx === 13) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: isAll
      ? 'Cisurupan, Garut • Petugas Piket Harian'
      : `Cisurupan, Garut • Wali ${kelas}`,
    signatureRightName: waliName
  });
}

export function addSemesterRombelSummarySheetToWorkbook(
  wb: ExcelJS.Workbook,
  semesterType: '1' | '2',
  tahunAjaran: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const { targetYearMonths, effectiveDays } = getEffectiveSemesterDays(tahunAjaran, semesterType, presensiList);

  let totalSiswaAll = 0,
    totalHAll = 0,
    totalTAll = 0,
    totalSAll = 0,
    totalIAll = 0,
    totalAAll = 0,
    totalMasukAll = 0,
    sumPct = 0;

  const rows: (string | number)[][] = DAFTAR_KELAS.map((namaKelas, idx) => {
    const classStudents = siswaList.filter((s) => isSameClass(s.kelas, namaKelas));
    const totalSiswa = classStudents.length;

    let hadir = 0,
      terlambat = 0,
      sakit = 0,
      izin = 0,
      alfa = 0;

    classStudents.forEach((siswa) => {
      const studentRecords = presensiList.filter((p) => {
        if (!isPresensiMatchSiswa(p, siswa)) return false;
        const norm = normalizeDateKey(p.tanggal);
        return targetYearMonths.some((ym) => norm.startsWith(ym));
      });
      const dateMap = new Map<string, Presensi>();
      studentRecords.forEach((r) => {
        const d = normalizeDateKey(r.tanggal);
        if (isRecordNewer(r, dateMap.get(d))) dateMap.set(d, r);
      });
      dateMap.forEach((rec) => {
        if (rec.status === 'Hadir') hadir++;
        else if (rec.status === 'Terlambat') terlambat++;
        else if (rec.status === 'Sakit') sakit++;
        else if (rec.status === 'Izin') izin++;
        else if (rec.status === 'Alfa') alfa++;
      });
    });

    const totalMasuk = hadir + terlambat;
    const totalPossible = totalSiswa * effectiveDays;
    const persen = totalPossible > 0 ? Math.min(100, Math.round((totalMasuk / totalPossible) * 100)) : 0;

    let predikat = 'Perlu Pendampingan';
    if (persen >= 90) predikat = 'Sangat Tinggi (A)';
    else if (persen >= 80) predikat = 'Tinggi (B)';
    else if (persen >= 60) predikat = 'Cukup (C)';

    const shiftLabel =
      getAttendanceShift(null, namaKelas, undefined, settings) === 'Siang' ? 'Siang (12.30)' : 'Pagi (07.00)';

    totalSiswaAll += totalSiswa;
    totalHAll += hadir;
    totalTAll += terlambat;
    totalSAll += sakit;
    totalIAll += izin;
    totalAAll += alfa;
    totalMasukAll += totalMasuk;
    sumPct += persen;

    return [idx + 1, namaKelas, getWaliKelasByKelas(namaKelas), shiftLabel, totalSiswa, hadir, terlambat, sakit, izin, alfa, totalMasuk, persen / 100, predikat];
  });

  const avgPct = Math.round(sumPct / DAFTAR_KELAS.length);
  const semLabel = semesterType === '1' ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)';

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Ringkasan Rombel Semester',
    tabColor: 'FF1E3A8A',
    title: 'REKAPITULASI PRESENSI SELURUH ROMBEL PER SEMESTER',
    metaInfo: `Tahun Ajaran: ${tahunAjaran}  |  ${semLabel}  |  Hari Efektif: ${effectiveDays} Hari  |  Total: ${totalSiswaAll} Siswa`,
    kpiCards: [
      { label: 'Total Siswa', value: totalSiswaAll, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hari Efektif', value: `${effectiveDays} Hari`, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Hadir Tepat', value: totalHAll, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: totalTAll, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: totalSAll, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: totalIAll, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: totalAAll, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' },
      { label: 'Keaktifan Sekolah', value: `${avgPct}%`, bgHex: 'FFDBEAFE', fontHex: 'FF1E3A8A' }
    ],
    headers: ['No', 'Rombel', 'Wali Kelas', 'Shift', 'Murid', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alfa', 'Masuk Fisik', 'Keaktifan', 'Predikat Rombel'],
    rows,
    totalRow: ['', 'TOTAL SEKOLAH', '12 Rombel', 'Semua Sesi', totalSiswaAll, totalHAll, totalTAll, totalSAll, totalIAll, totalAAll, totalMasukAll, avgPct / 100, avgPct >= 90 ? 'Sangat Tinggi (A)' : 'Baik (B)'],
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { width: 12, align: 'center' },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 14, align: 'center' },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isPercent: true },
      { width: 20, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 3) return styleShiftCell(val);
      if (cIdx === 11 || cIdx === 12) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: 'Cisurupan, Garut • Petugas Piket Harian',
    signatureRightName: 'Panji Teguh Amarta S, S.Pd.I'
  });
}

/**
 * TRIGGER DOWNLOAD SINGLE CLASS / ALL CLASSES MODERN STYLED EXCEL (.XLSX)
 */
export async function downloadSingleClassReport(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  kelas: string,
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  settings?: SystemSettings
): Promise<void> {
  const wb = createConfiguredWorkbook();
  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const cleanKelas = kelas.replace(/[\s-]+/g, '_').toUpperCase();
  let filename = '';

  if (type === 'harian') {
    if (isAll) {
      addDailyRombelSummarySheetToWorkbook(wb, dateOrPeriod, siswaList, presensiList, settings);
      addDailyClassSheetToWorkbook(wb, 'Detail Semua Siswa', 'Semua Kelas', dateOrPeriod, siswaList, presensiList, settings);
    } else {
      addDailyClassSheetToWorkbook(wb, `Rekap ${kelas}`, kelas, dateOrPeriod, siswaList, presensiList, settings);
    }
    filename = `REKAP_PRESENSI_HARIAN_${cleanKelas}_${dateOrPeriod}.xlsx`;
  } else if (type === 'mingguan') {
    if (isAll) {
      addWeeklyRombelSummarySheetToWorkbook(wb, dateOrPeriod, siswaList, presensiList, settings);
      addWeeklyClassSheetToWorkbook(wb, 'Matriks Semua Siswa', 'Semua Kelas', dateOrPeriod, siswaList, presensiList, settings);
    } else {
      addWeeklyClassSheetToWorkbook(wb, `Mingguan ${kelas}`, kelas, dateOrPeriod, siswaList, presensiList, settings);
    }
    filename = `REKAP_PRESENSI_MINGGUAN_${cleanKelas}_MULAI_${dateOrPeriod}.xlsx`;
  } else if (type === 'bulanan') {
    if (isAll) {
      addMonthlyRombelSummarySheetToWorkbook(wb, dateOrPeriod, siswaList, presensiList, settings);
      addMonthlyClassSheetToWorkbook(wb, 'Detail Semua Siswa', 'Semua Kelas', dateOrPeriod, siswaList, presensiList, settings, false);
    } else {
      addMonthlyClassSheetToWorkbook(wb, `Bulanan ${kelas}`, kelas, dateOrPeriod, siswaList, presensiList, settings, true);
    }
    filename = `REKAP_PRESENSI_BULANAN_${cleanKelas}_${dateOrPeriod}.xlsx`;
  } else {
    const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
    const thn = semesterOptions?.tahunAjaran || '2026/2027';
    if (isAll) {
      addSemesterRombelSummarySheetToWorkbook(wb, semType, thn, siswaList, presensiList, settings);
      addSemesterClassSheetToWorkbook(wb, 'Buku Induk Semua Siswa', 'Semua Kelas', semType, thn, siswaList, presensiList, settings);
    } else {
      addSemesterClassSheetToWorkbook(wb, `Semester ${kelas}`, kelas, semType, thn, siswaList, presensiList, settings);
    }
    filename = `REKAP_PRESENSI_SEMESTER_${semType}_${cleanKelas}_${thn.replace('/', '-')}.xlsx`;
  }

  await downloadWorkbookXlsx(wb, filename);
}

/**
 * TRIGGER DOWNLOAD SEMUA KELAS DALAM PAKET ZIP (.XLSX PER KELAS + 1 WORKBOOK MASTER 12 SHEET)
 */
export async function downloadAllClassesZip(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  onProgress?: (current: number, total: number, className: string) => void,
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  settings?: SystemSettings
) {
  const zip = new JSZip();
  const classes = DAFTAR_KELAS;
  const total = classes.length + 2;

  const masterWb = createConfiguredWorkbook();

  if (type === 'harian') {
    onProgress?.(1, total, 'Ringkasan Seluruh Rombel (.xlsx)');
    const summaryWb = createConfiguredWorkbook();
    addDailyRombelSummarySheetToWorkbook(summaryWb, dateOrPeriod, siswaList, presensiList, settings);
    addDailyRombelSummarySheetToWorkbook(masterWb, dateOrPeriod, siswaList, presensiList, settings);
    zip.file(`01_REKAPITULASI_SELURUH_ROMBEL_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(summaryWb));

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Excel ${cls}`);
      const clsWb = createConfiguredWorkbook();
      addDailyClassSheetToWorkbook(clsWb, `Rekap ${cls}`, cls, dateOrPeriod, siswaList, presensiList, settings);
      addDailyClassSheetToWorkbook(masterWb, cls, cls, dateOrPeriod, siswaList, presensiList, settings);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      zip.file(`REKAP_HARIAN_${cleanName}_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(clsWb));
    }

    onProgress?.(total, total, 'Master Workbook 12 Kelas (.xlsx)');
    zip.file(`00_MASTER_LENGKAP_12_KELAS_HARIAN_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(masterWb));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_EXCEL_PRESENSI_HARIAN_SEMUA_KELAS_${dateOrPeriod}.zip`);
  } else if (type === 'mingguan') {
    onProgress?.(1, total, 'Ringkasan Mingguan Semua Rombel (.xlsx)');
    const summaryWb = createConfiguredWorkbook();
    addWeeklyRombelSummarySheetToWorkbook(summaryWb, dateOrPeriod, siswaList, presensiList, settings);
    addWeeklyRombelSummarySheetToWorkbook(masterWb, dateOrPeriod, siswaList, presensiList, settings);
    zip.file(`01_REKAP_MINGGUAN_SEMUA_ROMBEL_MULAI_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(summaryWb));

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Excel ${cls}`);
      const clsWb = createConfiguredWorkbook();
      addWeeklyClassSheetToWorkbook(clsWb, `Mingguan ${cls}`, cls, dateOrPeriod, siswaList, presensiList, settings);
      addWeeklyClassSheetToWorkbook(masterWb, cls, cls, dateOrPeriod, siswaList, presensiList, settings);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      zip.file(`REKAP_MINGGUAN_${cleanName}_MULAI_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(clsWb));
    }

    onProgress?.(total, total, 'Master Workbook 12 Kelas (.xlsx)');
    zip.file(`00_MASTER_LENGKAP_12_KELAS_MINGGUAN_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(masterWb));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_EXCEL_PRESENSI_MINGGUAN_SEMUA_KELAS_MULAI_${dateOrPeriod}.zip`);
  } else if (type === 'bulanan') {
    onProgress?.(1, total, 'Ringkasan Bulanan Semua Rombel (.xlsx)');
    const summaryWb = createConfiguredWorkbook();
    addMonthlyRombelSummarySheetToWorkbook(summaryWb, dateOrPeriod, siswaList, presensiList, settings);
    addMonthlyRombelSummarySheetToWorkbook(masterWb, dateOrPeriod, siswaList, presensiList, settings);
    zip.file(`01_REKAP_BULANAN_SEMUA_ROMBEL_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(summaryWb));

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Excel ${cls}`);
      const clsWb = createConfiguredWorkbook();
      addMonthlyClassSheetToWorkbook(clsWb, `Bulanan ${cls}`, cls, dateOrPeriod, siswaList, presensiList, settings, true);
      addMonthlyClassSheetToWorkbook(masterWb, cls, cls, dateOrPeriod, siswaList, presensiList, settings, false);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      zip.file(`REKAP_BULANAN_${cleanName}_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(clsWb));
    }

    onProgress?.(total, total, 'Master Workbook 12 Kelas (.xlsx)');
    zip.file(`00_MASTER_LENGKAP_12_KELAS_BULANAN_${dateOrPeriod}.xlsx`, await workbookToXlsxBuffer(masterWb));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_EXCEL_PRESENSI_BULANAN_SEMUA_KELAS_${dateOrPeriod}.zip`);
  } else {
    const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
    const thn = semesterOptions?.tahunAjaran || '2026/2027';
    const thnClean = thn.replace('/', '-');

    onProgress?.(1, total, 'Ringkasan Rombel Semester (.xlsx)');
    const summaryWb = createConfiguredWorkbook();
    addSemesterRombelSummarySheetToWorkbook(summaryWb, semType, thn, siswaList, presensiList, settings);
    addSemesterRombelSummarySheetToWorkbook(masterWb, semType, thn, siswaList, presensiList, settings);
    zip.file(`01_REKAPITULASI_ROMBEL_SEMESTER_${semType}_${thnClean}.xlsx`, await workbookToXlsxBuffer(summaryWb));

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 2, total, `Excel ${cls}`);
      const clsWb = createConfiguredWorkbook();
      addSemesterClassSheetToWorkbook(clsWb, `Semester ${cls}`, cls, semType, thn, siswaList, presensiList, settings);
      addSemesterClassSheetToWorkbook(masterWb, cls, cls, semType, thn, siswaList, presensiList, settings);
      const cleanName = cls.replace(/[\s-]+/g, '_');
      zip.file(`REKAP_SEMESTER_${semType}_${cleanName}_${thnClean}.xlsx`, await workbookToXlsxBuffer(clsWb));
    }

    onProgress?.(total, total, 'Master Workbook 12 Kelas (.xlsx)');
    zip.file(`00_MASTER_LENGKAP_12_KELAS_SEMESTER_${semType}_${thnClean}.xlsx`, await workbookToXlsxBuffer(masterWb));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerFileDownload(zipBlob, `PAKET_EXCEL_PRESENSI_SEMESTER_${semType}_SEMUA_KELAS_${thnClean}.zip`);
  }
}

/**
 * EKSPOR EXCEL MODERN DASHBOARD KEPALA SEKOLAH (Multi-sheet: Ringkasan Rombel + Log Presensi)
 */
export async function downloadKepsekRekapExcel(
  selectedKelas: string,
  filterType: string,
  filteredLogs: Presensi[],
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
): Promise<void> {
  const wb = createConfiguredWorkbook();
  const today = getLocalDateString();

  // Sheet 1: Ringkasan Rombel Hari Ini
  addDailyRombelSummarySheetToWorkbook(wb, today, siswaList, presensiList, settings);

  // Sheet 2: Log Presensi Terfilter
  let hadir = 0,
    telat = 0,
    sakit = 0,
    izin = 0,
    alfa = 0;
  const rows: (string | number)[][] = filteredLogs.map((p, idx) => {
    const siswa = siswaList.find((s) => s.id === p.siswaId);
    if (p.status === 'Hadir') hadir++;
    else if (p.status === 'Terlambat') telat++;
    else if (p.status === 'Sakit') sakit++;
    else if (p.status === 'Izin') izin++;
    else if (p.status === 'Alfa') alfa++;

    const metodeLabel = p.metodeLabel || (p.metode === 'QR_SCAN' ? 'Scan QR Code' : 'Manual Tap Wali');
    return [
      idx + 1,
      p.tanggal,
      p.waktu,
      p.nis || '-',
      p.nama,
      p.kelas,
      p.status,
      metodeLabel,
      p.operator || '-',
      siswa?.waOrangTua || '-'
    ];
  });

  const periodLabel = filterType === 'hari' ? 'Hari Ini' : filterType === 'minggu' ? '7 Hari Terakhir' : '30 Hari Terakhir';

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Log Presensi Terfilter',
    tabColor: 'FF0F766E',
    title: `LAPORAN LOG PRESENSI KEPALA SEKOLAH • ${selectedKelas.toUpperCase()}`,
    metaInfo: `Horizon Laporan: ${periodLabel}  |  Filter Kelas: ${selectedKelas}  |  Total Rekaman: ${filteredLogs.length}`,
    kpiCards: [
      { label: 'Total Rekaman', value: filteredLogs.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'Hadir', value: hadir, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'Terlambat', value: telat, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'Sakit', value: sakit, bgHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
      { label: 'Izin', value: izin, bgHex: 'FFE0F2FE', fontHex: 'FF075985' },
      { label: 'Alfa', value: alfa, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' }
    ],
    headers: ['No', 'Tanggal', 'Waktu', 'NIS', 'Nama Lengkap Siswa', 'Kelas', 'Status', 'Metode', 'Operator Input', 'No. WA Orang Tua'],
    rows,
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { width: 12, align: 'center' },
      { width: 10, align: 'center' },
      { minWidth: 11, maxWidth: 15, align: 'center', isTextId: true },
      { minWidth: 25, maxWidth: 34, align: 'left' },
      { width: 12, align: 'center' },
      { width: 14, align: 'center' },
      { width: 18, align: 'center' },
      { minWidth: 18, maxWidth: 26, align: 'left' },
      { width: 16, align: 'center', isTextId: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 6) return styleAttendanceStatusCell(val);
      if (cIdx === 7) return styleMetodeCell(val);
      return undefined;
    },
    signatureRightLabel: 'Cisurupan, Garut • Petugas Piket Sekolah',
    signatureRightName: 'Panji Teguh Amarta S, S.Pd.I'
  });

  const cleanCls = selectedKelas.replace(/[\s-]+/g, '_').toUpperCase();
  await downloadWorkbookXlsx(wb, `REKAP_KEPSEK_SDN3_${cleanCls}_${filterType.toUpperCase()}_${today}.xlsx`);
}

/**
 * EKSPOR EXCEL MODERN PENILAIAN AKHLAK & PROFIL PELAJAR PANCASILA
 */
export async function downloadAkhlakRekapExcel(
  selectedKelas: string,
  filteredList: PenilaianAkhlak[],
  siswaList: Siswa[]
): Promise<void> {
  const wb = createConfiguredWorkbook();

  let countB = 0,
    countM = 0,
    countS = 0,
    countK = 0;

  const rows: (string | number)[][] = filteredList.map((item, idx) => {
    const student = siswaList.find((s) => isRecordMatchStudent(item.kunci_siswa, s));
    const dim = DAFTAR_DIMENSI_PROFIL.find((d) => d.id === item.dimensi_profil);
    const skalaInfo = SKALA_PENILAIAN_MAP[item.nilai_skala];

    if (item.nilai_skala === 'B') countB++;
    else if (item.nilai_skala === 'M') countM++;
    else if (item.nilai_skala === 'S') countS++;
    else if (item.nilai_skala === 'K') countK++;

    return [
      idx + 1,
      item.kunci_siswa || '-',
      student ? student.nama : 'Tidak Ditemukan',
      student ? student.kelas : '-',
      item.tanggal,
      dim ? dim.nama : `Dimensi ${item.dimensi_profil}`,
      item.sub_bidang_akhlak || '-',
      item.nilai_skala,
      skalaInfo ? skalaInfo.label : '-',
      item.catatan_singkat || '-',
      item.tahun_ajaran,
      `Sem ${item.semester}`,
      item.penilai || '-'
    ];
  });

  const waliName = selectedKelas === 'Semua Kelas' ? 'Guru PAI & Wali Kelas' : getWaliKelasByKelas(selectedKelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Penilaian Akhlak P5',
    tabColor: 'FFD97706',
    title: `REKAPITULASI PENILAIAN AKHLAK & PROFIL PELAJAR PANCASILA • ${selectedKelas.toUpperCase()}`,
    metaInfo: `Kurikulum Merdeka • SDN 3 Karamatwangi  |  Kelas: ${selectedKelas}  |  Total Catatan: ${filteredList.length}`,
    kpiCards: [
      { label: 'Total Penilaian', value: filteredList.length, bgHex: 'FFF1F5F9', fontHex: 'FF0F172A' },
      { label: 'B (Membudaya)', value: countB, bgHex: 'FFDCFCE7', fontHex: 'FF166534' },
      { label: 'M (Berkembang)', value: countM, bgHex: 'FFECFDF5', fontHex: 'FF047857' },
      { label: 'S (Mulai Berkembang)', value: countS, bgHex: 'FFFEF3C7', fontHex: 'FF92400E' },
      { label: 'K (Perlu Bimbingan)', value: countK, bgHex: 'FFFEE2E2', fontHex: 'FF991B1B' }
    ],
    headers: [
      'No',
      'Kunci Siswa (NISN/NIK)',
      'Nama Lengkap Siswa',
      'Kelas',
      'Tanggal',
      'Dimensi Profil Pancasila',
      'Sub-Bidang Akhlak',
      'Skala',
      'Keterangan Skala',
      'Catatan Pengamatan Guru',
      'Tahun Ajaran',
      'Semester',
      'Penilai'
    ],
    rows,
    columnMeta: [
      { width: 5, align: 'center', isNumeric: true },
      { minWidth: 14, maxWidth: 19, align: 'center', isTextId: true },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 11, align: 'center' },
      { width: 12, align: 'center' },
      { minWidth: 22, maxWidth: 30, align: 'left', wrapText: true },
      { minWidth: 18, maxWidth: 26, align: 'left', wrapText: true },
      { width: 8, align: 'center' },
      { width: 20, align: 'center' },
      { minWidth: 26, maxWidth: 38, align: 'left', wrapText: true },
      { width: 12, align: 'center' },
      { width: 10, align: 'center' },
      { minWidth: 18, maxWidth: 26, align: 'left' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 7 || cIdx === 8) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureRightLabel: `Cisurupan, Garut • Penilai / ${selectedKelas}`,
    signatureRightName: waliName
  });

  await downloadWorkbookXlsx(
    wb,
    `REKAP_PENILAIAN_AKHLAK_${selectedKelas.replace(/[\s-]+/g, '_').toUpperCase()}_${getLocalDateString()}.xlsx`
  );
}
